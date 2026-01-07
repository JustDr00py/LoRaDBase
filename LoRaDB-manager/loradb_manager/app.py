"""Main Textual application for LoRaDB Instance Manager."""

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.widgets import Header, Footer
from pathlib import Path

from .core.instance_manager import InstanceManager
from .config import Config


class LoRaDBManagerApp(App):
    """Main TUI application for LoRaDB instance management."""

    CSS_PATH = "app.css"

    # Enable footer
    ENABLE_COMMAND_PALETTE = False

    BINDINGS = [
        Binding("q", "quit", "Quit", priority=True, show=True),
        Binding("c", "create_instance", "Create", show=True),
        Binding("r", "refresh", "Refresh", show=True),
    ]

    def __init__(self):
        """Initialize the application."""
        super().__init__()

        # Initialize instance manager
        self.instance_manager = InstanceManager(Config.INSTANCES_ROOT)

    def compose(self) -> ComposeResult:
        """Create child widgets for the app."""
        # Footer is in each Screen instead
        return []

    def on_mount(self) -> None:
        """Set up the app when mounted."""
        # Import MainScreen here to avoid circular import
        from .ui.screens.main_screen import MainScreen
        self.push_screen(MainScreen(instance_manager=self.instance_manager))

    def action_create_instance(self):
        """Push create instance wizard screen."""
        from .ui.screens.create_wizard import CreateInstanceWizard
        self.push_screen(CreateInstanceWizard(self.instance_manager))

    def action_refresh(self):
        """Refresh instance list."""
        from .ui.screens.main_screen import MainScreen
        # Access the current screen if it's MainScreen
        if isinstance(self.screen, MainScreen):
            self.screen.refresh_instances()
