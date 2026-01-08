"""Global configuration for LoRaDB Instance Manager."""

from pathlib import Path
import os


class Config:
    """Global application configuration."""

    # Paths - dynamically determine based on this file's location
    # This file is at: LoRaDepo/LoRaDB-manager/loradb_manager/config.py
    # So parent.parent.parent gets us to LoRaDepo/
    _BASE_DIR = Path(__file__).parent.parent.parent

    INSTANCES_ROOT = Path.home() / ".loradb-instances"
    LORADB_TEMPLATE = _BASE_DIR  # Points to repository root
    TEMPLATE_DOCKER_COMPOSE = _BASE_DIR / "docker-compose.yml"
    TEMPLATE_ENV_EXAMPLE = _BASE_DIR / ".env.example"

    # Port allocation
    PORT_RANGE_MIN = 8000
    PORT_RANGE_MAX = 9999

    # Default ports
    DEFAULT_LORADB_PORT = 8443

    # Docker
    DOCKER_COMPOSE_TIMEOUT = 120  # seconds
    CONTAINER_HEALTH_CHECK_TIMEOUT = 60  # seconds

    # UI
    LOG_TAIL_LINES = 100
    STATUS_REFRESH_INTERVAL = 5  # seconds

    # API Client
    API_REQUEST_TIMEOUT = 30  # seconds
    TOKEN_REFRESH_INTERVAL = 30  # seconds
    JWT_TOKEN_LIFETIME = 300  # 5 minutes for TUI-generated admin tokens

    @classmethod
    def validate(cls):
        """
        Validate configuration on startup.

        Raises:
            RuntimeError: If configuration is invalid
        """
        # Check template files exist
        if not cls.TEMPLATE_DOCKER_COMPOSE.exists():
            raise RuntimeError(
                f"Template docker-compose.yml not found at {cls.TEMPLATE_DOCKER_COMPOSE}. "
                "Please ensure docker-compose.yml exists in the root directory."
            )

        if not cls.TEMPLATE_ENV_EXAMPLE.exists():
            raise RuntimeError(
                f"Template .env.example not found at {cls.TEMPLATE_ENV_EXAMPLE}. "
                "Please ensure .env.example exists in the root directory."
            )

        # Test Docker connection
        try:
            import docker
            client = docker.from_env()
            client.ping()
        except Exception as e:
            raise RuntimeError(
                f"Docker is not available: {e}\n"
                "Please ensure Docker is installed and running."
            )

        # Create instances root if it doesn't exist
        cls.INSTANCES_ROOT.mkdir(parents=True, exist_ok=True)
