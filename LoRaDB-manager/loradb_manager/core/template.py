"""Template management for creating new LoRaDB instances."""

import shutil
import yaml
from pathlib import Path
from typing import Optional
from ..config import Config


class TemplateManager:
    """Manages template copying and .env generation for new instances."""

    def __init__(self):
        """Initialize template manager."""
        # Template paths are now accessed via Config.TEMPLATE_* constants
        pass

    def copy_template_files(self, dest: Path):
        """
        Copy minimal template files to destination.

        Uses pre-built Docker images, so we only need configuration files.

        Args:
            dest: Destination directory path

        Raises:
            IOError: If template files don't exist or copy fails
        """
        dest.mkdir(parents=True, exist_ok=True)

        # Copy docker-compose.yml
        docker_compose_src = Config.TEMPLATE_DOCKER_COMPOSE
        if not docker_compose_src.exists():
            raise IOError(f"Template docker-compose.yml not found at {docker_compose_src}")
        shutil.copy2(docker_compose_src, dest / "docker-compose.yml")

        # Copy .env.example (used as template for .env generation)
        env_example_src = Config.TEMPLATE_ENV_EXAMPLE
        if not env_example_src.exists():
            raise IOError(f"Template .env.example not found at {env_example_src}")
        shutil.copy2(env_example_src, dest / ".env.example")

    def generate_loradb_env(
        self,
        env_path: Path,
        port: int,
        jwt_secret: str,
        tls_cert_path: Optional[str] = None,
        tls_key_path: Optional[str] = None
    ):
        """
        Generate LoRaDB .env file with instance-specific values.

        Args:
            env_path: Path where .env file should be created
            port: API port for LoRaDB
            jwt_secret: JWT secret (minimum 32 characters)
            tls_cert_path: Optional TLS certificate path
            tls_key_path: Optional TLS key path
        """
        # Read template from .env.example
        template_path = Config.TEMPLATE_ENV_EXAMPLE
        if not template_path.exists():
            # Create a basic template if .env.example doesn't exist
            config = self._generate_default_loradb_env(port, jwt_secret, tls_cert_path, tls_key_path)
        else:
            with open(template_path, 'r') as f:
                config = f.read()

            # Replace placeholders
            config = self._replace_loradb_placeholders(
                config, port, jwt_secret, tls_cert_path, tls_key_path
            )

        # Write to destination
        with open(env_path, 'w') as f:
            f.write(config)

    def _generate_default_loradb_env(
        self, port: int, jwt_secret: str, tls_cert_path: Optional[str], tls_key_path: Optional[str]
    ) -> str:
        """Generate a default LoRaDB .env configuration."""
        config = f"""# LoRaDB Configuration (Auto-generated)

# Storage Configuration
LORADB_STORAGE_DATA_DIR=/var/lib/loradb/data

# API Configuration
LORADB_API_BIND_ADDR=0.0.0.0:{port}
LORADB_API_PORT={port}
LORADB_API_JWT_SECRET={jwt_secret}
LORADB_API_JWT_EXPIRATION_HOURS=1
LORADB_API_RATE_LIMIT_PER_MINUTE=100
LORADB_API_CORS_ALLOWED_ORIGINS=*

# TLS Configuration (Optional)
"""
        if tls_cert_path:
            config += f"LORADB_TLS_CERT_PATH={tls_cert_path}\n"
            config += f"LORADB_API_TLS_CERT=/etc/loradb/cert.pem\n"
        if tls_key_path:
            config += f"LORADB_TLS_KEY_PATH={tls_key_path}\n"
            config += f"LORADB_API_TLS_KEY=/etc/loradb/key.pem\n"

        config += """
# MQTT Configuration (Required - at least one broker must be configured)
# Configure this with your ChirpStack or TTN broker details
# For HTTP-only ingestion, set a placeholder broker URL
# LORADB_MQTT_CHIRPSTACK_BROKER=mqtts://your-chirpstack-broker.com:8883
# LORADB_MQTT_USERNAME=loradb
# LORADB_MQTT_PASSWORD=your-password

# Placeholder MQTT config (replace with actual broker if using MQTT ingestion)
LORADB_MQTT_CHIRPSTACK_BROKER=mqtt://localhost:1883

# Storage Tuning
LORADB_STORAGE_WAL_SYNC_INTERVAL_MS=1000
LORADB_STORAGE_MEMTABLE_SIZE_MB=64
LORADB_STORAGE_MEMTABLE_FLUSH_INTERVAL_SECS=300
LORADB_STORAGE_COMPACTION_THRESHOLD=10

# Logging
RUST_LOG=info,loradb=info
TZ=UTC
"""
        return config

    def _replace_loradb_placeholders(
        self, config: str, port: int, jwt_secret: str,
        tls_cert_path: Optional[str], tls_key_path: Optional[str]
    ) -> str:
        """Replace placeholders in LoRaDB .env template."""
        # Replace port
        config = config.replace("LORADB_API_PORT=8443", f"LORADB_API_PORT={port}")
        config = config.replace("LORADB_API_BIND_ADDR=0.0.0.0:8443", f"LORADB_API_BIND_ADDR=0.0.0.0:{port}")

        # Replace JWT secret
        import re
        config = re.sub(
            r'LORADB_API_JWT_SECRET=.*',
            f'LORADB_API_JWT_SECRET={jwt_secret}',
            config
        )

        # Replace TLS paths if provided
        if tls_cert_path:
            config = re.sub(
                r'#?\s*LORADB_(API_)?TLS_CERT(_PATH)?=.*',
                f'LORADB_TLS_CERT_PATH={tls_cert_path}',
                config
            )
        if tls_key_path:
            config = re.sub(
                r'#?\s*LORADB_(API_)?TLS_KEY(_PATH)?=.*',
                f'LORADB_TLS_KEY_PATH={tls_key_path}',
                config
            )

        # Add placeholder MQTT config if not present
        if 'LORADB_MQTT_CHIRPSTACK_BROKER' not in config and 'LORADB_MQTT_TTN_BROKER' not in config:
            # Find where to insert MQTT config (after API config section)
            mqtt_config = """
# MQTT Configuration (Required - at least one broker must be configured)
# Placeholder MQTT config (replace with actual broker if using MQTT ingestion)
LORADB_MQTT_CHIRPSTACK_BROKER=mqtt://localhost:1883
"""
            # Insert before storage tuning or at the end
            if 'OPTIONAL: Storage Tuning' in config:
                config = config.replace('# OPTIONAL: Storage Tuning', mqtt_config + '\n# OPTIONAL: Storage Tuning')
            else:
                config += mqtt_config

        return config

    def modify_docker_compose(
        self,
        compose_path: Path,
        instance_id: str,
        network_name: str,
        volume_name: Optional[str] = None,
        port: Optional[int] = None
    ):
        """
        Modify docker-compose.yml with unique container, network, and volume names.

        Args:
            compose_path: Path to docker-compose.yml file
            instance_id: Unique instance identifier
            network_name: Unique Docker network name
            volume_name: Unique volume name (optional, only for LoRaDB)
            port: API port for the instance (optional, updates port mapping)
        """
        with open(compose_path, 'r') as f:
            compose = yaml.safe_load(f)

        # Remove obsolete 'version' field (Docker Compose V2 doesn't need it)
        if 'version' in compose:
            del compose['version']

        self._modify_loradb_compose(compose, instance_id, network_name, volume_name, port)

        # Write back
        with open(compose_path, 'w') as f:
            yaml.dump(compose, f, default_flow_style=False, sort_keys=False)

    def _modify_loradb_compose(
        self, compose: dict, instance_id: str, network_name: str, volume_name: Optional[str], port: Optional[int]
    ):
        """Modify LoRaDB docker-compose structure."""
        # Modify container name
        if 'services' in compose and 'loradb' in compose['services']:
            compose['services']['loradb']['container_name'] = f"loradb-{instance_id}"

            # Modify port mapping if port is provided
            if port and 'ports' in compose['services']['loradb']:
                # Update port mapping to use the instance port
                # Map host:port -> container:port (both same port inside and outside)
                compose['services']['loradb']['ports'] = [f"{port}:{port}"]

        # Modify volume name
        if volume_name and 'volumes' in compose:
            old_volume = list(compose['volumes'].keys())[0] if compose['volumes'] else None
            if old_volume:
                compose['volumes'][volume_name] = compose['volumes'].pop(old_volume)

                # Update volume reference in service
                if 'services' in compose and 'loradb' in compose['services']:
                    if 'volumes' in compose['services']['loradb']:
                        for i, vol in enumerate(compose['services']['loradb']['volumes']):
                            if isinstance(vol, str) and old_volume in vol:
                                compose['services']['loradb']['volumes'][i] = vol.replace(
                                    old_volume, volume_name
                                )

        # Modify network name
        self._modify_networks(compose, network_name)

    def _modify_networks(self, compose: dict, network_name: str):
        """Modify network configuration in docker-compose."""
        if 'networks' in compose and compose['networks']:
            old_network = list(compose['networks'].keys())[0]
            compose['networks'][network_name] = compose['networks'].pop(old_network)

            # Update network references in all services
            if 'services' in compose:
                for service in compose['services'].values():
                    if 'networks' in service:
                        if isinstance(service['networks'], list):
                            service['networks'] = [network_name]
                        elif isinstance(service['networks'], dict):
                            # Handle case where networks is a dict
                            service['networks'] = {network_name: service['networks'].get(old_network, {})}
