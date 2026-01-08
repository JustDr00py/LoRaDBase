"""Data models for LoRaDB instance management."""

from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum
from typing import Optional


class InstanceStatus(str, Enum):
    """Status of a LoRaDB instance."""
    STOPPED = "stopped"
    RUNNING = "running"
    STARTING = "starting"
    STOPPING = "stopping"
    ERROR = "error"
    UNKNOWN = "unknown"


class PortAllocation(BaseModel):
    """Port allocation for an instance."""
    loradb_api: int = Field(..., ge=1024, le=65535, description="LoRaDB API port")


class NetworkConfig(BaseModel):
    """Docker network configuration for an instance."""
    network_name: str = Field(..., description="Docker network name")
    loradb_volume: str = Field(..., description="LoRaDB data volume name")


class InstanceMetadata(BaseModel):
    """Metadata for a LoRaDB instance."""
    instance_id: str = Field(..., pattern=r"^[a-z0-9-]+$", description="Unique instance ID")
    name: str = Field(..., min_length=1, description="Human-readable instance name")
    description: Optional[str] = Field(None, description="Instance description")
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # Path information
    instance_dir: str = Field(..., description="Root directory for instance")
    loradb_dir: str = Field(..., description="LoRaDB directory")

    # Port allocations
    ports: PortAllocation

    # Network configuration
    network: NetworkConfig

    # JWT configuration (shared between LoRaDB and UI)
    jwt_secret: str = Field(..., min_length=32, description="JWT secret (min 32 chars)")

    # TLS configuration (optional)
    tls_cert_path: Optional[str] = Field(None, description="TLS certificate path")
    tls_key_path: Optional[str] = Field(None, description="TLS key path")

    # Status
    status: InstanceStatus = Field(default=InstanceStatus.STOPPED)

    # Container IDs (populated at runtime)
    loradb_container_id: Optional[str] = None

    model_config = {
        "json_encoders": {
            datetime: lambda v: v.isoformat(),
        }
    }
