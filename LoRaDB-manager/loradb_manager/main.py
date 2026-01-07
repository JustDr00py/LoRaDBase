"""Main entry point for LoRaDB Instance Manager."""

import sys
from .app import LoRaDBManagerApp
from .config import Config


def main():
    """Main entry point."""
    try:
        # Validate configuration (Docker, templates, etc.)
        Config.validate()

        # Create and run app
        app = LoRaDBManagerApp()
        app.run()

    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nExiting...")
        sys.exit(0)
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
