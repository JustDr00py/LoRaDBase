"""Port allocation manager to prevent conflicts across instances."""

import json
import socket
from pathlib import Path
from typing import Set, Dict, Optional
from .instance import PortAllocation


class PortAllocator:
    """Manages port allocation across all instances to prevent conflicts."""

    DEFAULT_PORTS = {
        "loradb_api": 8443,
    }

    MIN_PORT = 8000
    MAX_PORT = 9999

    def __init__(self, registry_path: Path):
        """Initialize port allocator with registry file path."""
        self.registry_path = registry_path
        self.allocated_ports: Set[int] = self._load_registry()

    def _load_registry(self) -> Set[int]:
        """Load allocated ports from JSON file."""
        if self.registry_path.exists():
            try:
                with open(self.registry_path, 'r') as f:
                    data = json.load(f)
                    return set(data.get("allocated_ports", []))
            except (json.JSONDecodeError, IOError):
                return set()
        return set()

    def _save_registry(self):
        """Persist allocated ports to JSON file."""
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.registry_path, 'w') as f:
            json.dump({"allocated_ports": sorted(list(self.allocated_ports))}, f, indent=2)

    def is_port_available(self, port: int) -> bool:
        """
        Check if port is available (not allocated and not in use by system).

        Args:
            port: Port number to check

        Returns:
            True if port is available, False otherwise
        """
        if port in self.allocated_ports:
            return False

        # Additional check: attempt to bind to port
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(1)
            sock.bind(('0.0.0.0', port))
            sock.close()
            return True
        except OSError:
            # Port is in use by system or cannot be bound
            return False

    def allocate_ports(
        self,
        instance_id: str,
        preferred_ports: Optional[Dict[str, int]] = None
    ) -> PortAllocation:
        """
        Allocate ports for a new instance.

        Tries preferred ports first, falls back to auto-allocation.

        Args:
            instance_id: Unique instance identifier
            preferred_ports: Optional dict of preferred ports by service name

        Returns:
            PortAllocation with assigned ports

        Raises:
            RuntimeError: If no available ports in range
        """
        allocated = {}

        for service, default_port in self.DEFAULT_PORTS.items():
            preferred = preferred_ports.get(service) if preferred_ports else None

            if preferred and self.is_port_available(preferred):
                port = preferred
            elif self.is_port_available(default_port):
                port = default_port
            else:
                # Auto-allocate next available port
                port = self._find_next_available_port()

            self.allocated_ports.add(port)
            allocated[service] = port

        self._save_registry()
        return PortAllocation(**allocated)

    def _find_next_available_port(self) -> int:
        """Find next available port in range."""
        for port in range(self.MIN_PORT, self.MAX_PORT + 1):
            if self.is_port_available(port):
                return port
        raise RuntimeError(f"No available ports in range {self.MIN_PORT}-{self.MAX_PORT}")

    def release_ports(self, ports: PortAllocation):
        """
        Release ports when instance is deleted.

        Args:
            ports: PortAllocation to release
        """
        self.allocated_ports.discard(ports.loradb_api)
        self._save_registry()

    def get_allocated_ports(self) -> Set[int]:
        """Get set of all currently allocated ports."""
        return self.allocated_ports.copy()
