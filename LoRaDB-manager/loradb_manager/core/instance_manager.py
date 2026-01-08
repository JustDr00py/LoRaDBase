"""Instance management - CRUD operations for LoRaDB instances."""

import json
import shutil
from pathlib import Path
from typing import List, Optional, Dict
from datetime import datetime

from .instance import InstanceMetadata, InstanceStatus, PortAllocation, NetworkConfig
from .port_allocator import PortAllocator
from .template import TemplateManager
from .docker_manager import DockerManager
from ..utils.crypto import generate_jwt_secret
from ..config import Config


class InstanceManager:
    """Manages CRUD operations for LoRaDB instances."""

    def __init__(self, instances_root: Optional[Path] = None):
        """
        Initialize instance manager.

        Args:
            instances_root: Root directory for instances (defaults to Config.INSTANCES_ROOT)
        """
        self.instances_root = instances_root or Config.INSTANCES_ROOT
        self.instances_root.mkdir(parents=True, exist_ok=True)

        self.port_allocator = PortAllocator(self.instances_root / "ports.json")
        self.template_manager = TemplateManager()
        self.docker_manager = DockerManager()

        self.instances: Dict[str, InstanceMetadata] = {}
        self._load_instances()

    def _load_instances(self):
        """Load all instances from disk."""
        import traceback

        # Debug logging to file
        with open('/tmp/loradb-manager-debug.log', 'a') as f:
            f.write(f"\n=== Loading instances from {self.instances_root} ===\n")

        for instance_dir in self.instances_root.iterdir():
            with open('/tmp/loradb-manager-debug.log', 'a') as f:
                f.write(f"Checking directory: {instance_dir}\n")

            if instance_dir.is_dir() and (instance_dir / "metadata.json").exists():
                try:
                    metadata = self._read_metadata(instance_dir / "metadata.json")
                    self.instances[metadata.instance_id] = metadata

                    with open('/tmp/loradb-manager-debug.log', 'a') as f:
                        f.write(f"  ✓ Loaded instance: {metadata.instance_id} ({metadata.name})\n")

                except Exception as e:
                    # Skip instances with invalid metadata
                    with open('/tmp/loradb-manager-debug.log', 'a') as f:
                        f.write(f"  ✗ Failed to load instance from {instance_dir}: {e}\n")
                        traceback.print_exc(file=f)
                    continue

        with open('/tmp/loradb-manager-debug.log', 'a') as f:
            f.write(f"Total instances loaded: {len(self.instances)}\n")
            f.write(f"Instance IDs: {list(self.instances.keys())}\n\n")

    def create_instance(
        self,
        instance_id: str,
        name: str,
        description: Optional[str] = None,
        jwt_secret: Optional[str] = None,
        preferred_ports: Optional[Dict[str, int]] = None,
        tls_cert_path: Optional[str] = None,
        tls_key_path: Optional[str] = None
    ) -> InstanceMetadata:
        """
        Create a new instance.

        Steps:
        1. Allocate ports
        2. Create directory structure
        3. Copy templates
        4. Generate .env files
        5. Modify docker-compose.yml with unique names
        6. Save metadata

        Args:
            instance_id: Unique instance identifier (lowercase alphanumeric + hyphens)
            name: Human-readable instance name
            description: Optional description
            jwt_secret: JWT secret (auto-generated if not provided)
            preferred_ports: Optional dict of preferred ports
            tls_cert_path: Optional TLS certificate path
            tls_key_path: Optional TLS key path

        Returns:
            InstanceMetadata for created instance

        Raises:
            ValueError: If instance already exists or instance_id is invalid
            RuntimeError: If instance creation fails
        """
        # Validate instance_id
        import re
        if not re.match(r'^[a-z0-9-]+$', instance_id):
            raise ValueError(
                f"Invalid instance_id '{instance_id}'. "
                "Must contain only lowercase letters, numbers, and hyphens."
            )

        if instance_id in self.instances:
            raise ValueError(f"Instance '{instance_id}' already exists")

        # Allocate ports
        ports = self.port_allocator.allocate_ports(instance_id, preferred_ports)

        # Generate JWT secret if not provided
        if not jwt_secret:
            jwt_secret = generate_jwt_secret()

        # Create directory structure
        instance_dir = self.instances_root / instance_id
        try:
            instance_dir.mkdir(parents=True, exist_ok=False)
        except FileExistsError:
            raise ValueError(f"Directory for instance '{instance_id}' already exists")

        loradb_dir = instance_dir / "loradb"

        try:
            # Copy templates
            self.template_manager.copy_template_files(loradb_dir)

            # Generate network and volume names
            network = NetworkConfig(
                network_name=f"loradb-net-{instance_id}",
                loradb_volume=f"loradb-data-{instance_id}"
            )

            # Generate .env files
            self.template_manager.generate_loradb_env(
                loradb_dir / ".env",
                port=ports.loradb_api,
                jwt_secret=jwt_secret,
                tls_cert_path=tls_cert_path,
                tls_key_path=tls_key_path
            )

            # Modify docker-compose.yml with unique names and port mapping
            self.template_manager.modify_docker_compose(
                loradb_dir / "docker-compose.yml",
                instance_id,
                network.network_name,
                network.loradb_volume,
                ports.loradb_api
            )

            # Create metadata
            metadata = InstanceMetadata(
                instance_id=instance_id,
                name=name,
                description=description,
                instance_dir=str(instance_dir),
                loradb_dir=str(loradb_dir),
                ports=ports,
                network=network,
                jwt_secret=jwt_secret,
                tls_cert_path=tls_cert_path,
                tls_key_path=tls_key_path,
                status=InstanceStatus.STOPPED
            )

            # Save metadata
            self._save_metadata(metadata)
            self.instances[instance_id] = metadata

            return metadata

        except Exception as e:
            # Cleanup on failure
            if instance_dir.exists():
                shutil.rmtree(instance_dir)
            self.port_allocator.release_ports(ports)
            raise RuntimeError(f"Failed to create instance: {e}")

    def delete_instance(self, instance_id: str, force: bool = False):
        """
        Delete an instance.

        Steps:
        1. Stop containers if running
        2. Remove Docker resources
        3. Release ports
        4. Remove directory

        Args:
            instance_id: Instance to delete
            force: Force deletion even if instance is running

        Raises:
            ValueError: If instance not found
            RuntimeError: If instance is running and force=False
        """
        metadata = self.instances.get(instance_id)
        if not metadata:
            raise ValueError(f"Instance '{instance_id}' not found")

        # Update status
        self.update_instance_status(instance_id)

        # Stop containers if running
        if metadata.status == InstanceStatus.RUNNING:
            if not force:
                raise RuntimeError(
                    f"Cannot delete running instance '{instance_id}'. "
                    "Stop it first or use force=True"
                )
            try:
                self.docker_manager.stop_instance(metadata)
            except Exception as e:
                print(f"Warning: Failed to stop instance: {e}")

        # Remove Docker resources
        try:
            self.docker_manager.remove_containers(metadata)
            self.docker_manager.remove_network(metadata.network.network_name)
            self.docker_manager.remove_volume(metadata.network.loradb_volume)
        except Exception as e:
            print(f"Warning: Failed to remove Docker resources: {e}")

        # Release ports
        self.port_allocator.release_ports(metadata.ports)

        # Remove directory
        instance_path = Path(metadata.instance_dir)
        if instance_path.exists():
            shutil.rmtree(instance_path)

        # Remove from registry
        del self.instances[instance_id]

    def get_instance(self, instance_id: str) -> Optional[InstanceMetadata]:
        """
        Get instance metadata.

        Args:
            instance_id: Instance identifier

        Returns:
            InstanceMetadata or None if not found
        """
        return self.instances.get(instance_id)

    def list_instances(self) -> List[InstanceMetadata]:
        """
        List all instances.

        Returns:
            List of InstanceMetadata
        """
        return list(self.instances.values())

    def update_instance_status(self, instance_id: str):
        """
        Query Docker and update instance status.

        Args:
            instance_id: Instance to update
        """
        metadata = self.instances.get(instance_id)
        if not metadata:
            return

        status = self.docker_manager.get_instance_status(metadata)
        metadata.status = status
        metadata.updated_at = datetime.now()
        self._save_metadata(metadata)

    def start_instance(self, instance_id: str):
        """
        Start an instance.

        Args:
            instance_id: Instance to start

        Raises:
            ValueError: If instance not found
        """
        metadata = self.instances.get(instance_id)
        if not metadata:
            raise ValueError(f"Instance '{instance_id}' not found")

        metadata.status = InstanceStatus.STARTING
        self._save_metadata(metadata)

        try:
            self.docker_manager.start_instance(metadata)
            metadata.status = InstanceStatus.RUNNING
        except Exception as e:
            metadata.status = InstanceStatus.ERROR
            raise
        finally:
            metadata.updated_at = datetime.now()
            self._save_metadata(metadata)

    def stop_instance(self, instance_id: str):
        """
        Stop an instance.

        Args:
            instance_id: Instance to stop

        Raises:
            ValueError: If instance not found
        """
        metadata = self.instances.get(instance_id)
        if not metadata:
            raise ValueError(f"Instance '{instance_id}' not found")

        metadata.status = InstanceStatus.STOPPING
        self._save_metadata(metadata)

        try:
            self.docker_manager.stop_instance(metadata)
            metadata.status = InstanceStatus.STOPPED
        except Exception as e:
            metadata.status = InstanceStatus.ERROR
            raise
        finally:
            metadata.updated_at = datetime.now()
            self._save_metadata(metadata)

    def restart_instance(self, instance_id: str):
        """
        Restart an instance.

        Args:
            instance_id: Instance to restart

        Raises:
            ValueError: If instance not found
        """
        metadata = self.instances.get(instance_id)
        if not metadata:
            raise ValueError(f"Instance '{instance_id}' not found")

        self.docker_manager.restart_instance(metadata)
        metadata.status = InstanceStatus.RUNNING
        metadata.updated_at = datetime.now()
        self._save_metadata(metadata)

    def rebuild_instance(self, instance_id: str):
        """
        Rebuild an instance (stops, rebuilds Docker images, starts).

        This is useful when the LoRaDB code has been updated and you
        need to rebuild the Docker images to pick up the changes.

        Args:
            instance_id: Instance to rebuild

        Raises:
            ValueError: If instance not found
        """
        metadata = self.instances.get(instance_id)
        if not metadata:
            raise ValueError(f"Instance '{instance_id}' not found")

        self.docker_manager.rebuild_instance(metadata)
        metadata.status = InstanceStatus.RUNNING
        metadata.updated_at = datetime.now()
        self._save_metadata(metadata)

    def update_instance(self, instance_id: str):
        """
        Update instance to use latest Docker image.

        Pulls latest image from ghcr.io and restarts the instance.

        Args:
            instance_id: Instance to update

        Raises:
            ValueError: If instance not found
        """
        metadata = self.instances.get(instance_id)
        if not metadata:
            raise ValueError(f"Instance '{instance_id}' not found")

        self.docker_manager.update_instance(metadata)
        metadata.status = InstanceStatus.RUNNING
        metadata.updated_at = datetime.now()
        self._save_metadata(metadata)

    def _save_metadata(self, metadata: InstanceMetadata):
        """
        Save instance metadata to JSON.

        Args:
            metadata: Metadata to save
        """
        metadata_path = Path(metadata.instance_dir) / "metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata.model_dump(mode='json'), f, indent=2, default=str)

    def _read_metadata(self, metadata_path: Path) -> InstanceMetadata:
        """
        Load instance metadata from JSON.

        Args:
            metadata_path: Path to metadata.json

        Returns:
            InstanceMetadata
        """
        with open(metadata_path, 'r') as f:
            data = json.load(f)
            # Convert datetime strings back to datetime objects
            if 'created_at' in data and isinstance(data['created_at'], str):
                data['created_at'] = datetime.fromisoformat(data['created_at'])
            if 'updated_at' in data and isinstance(data['updated_at'], str):
                data['updated_at'] = datetime.fromisoformat(data['updated_at'])
            return InstanceMetadata(**data)
