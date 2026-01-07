"""Configuration editor screen for editing .env files."""

from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Static, TextArea, Button, Select, Label
from textual.containers import Container, Vertical, Horizontal
from textual.binding import Binding
from pathlib import Path

from ...core.instance import InstanceMetadata


class ConfigEditorScreen(Screen):
    """Screen for editing .env configuration files."""

    BINDINGS = [
        Binding("escape", "close", "Close", priority=True),
        Binding("ctrl+s", "save", "Save"),
    ]

    def __init__(self, instance: InstanceMetadata):
        """
        Initialize config editor.

        Args:
            instance: Instance to edit configuration for
        """
        super().__init__()
        self.instance = instance
        self.current_file = None
        self.modified = False
        self.original_content = ""

    def compose(self) -> ComposeResult:
        """Compose config editor UI."""
        yield Container(
            Vertical(
                Static(f"Configuration Editor: {self.instance.name}", classes="screen-title"),

                # File selector
                Horizontal(
                    Label("Select file: "),
                    Select(
                        options=[
                            ("LoRaDB .env", str(Path(self.instance.loradb_dir) / ".env")),
                        ],
                        value=str(Path(self.instance.loradb_dir) / ".env"),
                        id="file-select"
                    ),
                    classes="file-selector"
                ),

                # Editor
                TextArea(id="config-editor", language="toml"),

                # Action buttons
                Horizontal(
                    Button("Save", id="btn-save", variant="success"),
                    Button("Revert", id="btn-revert"),
                    Button("Close", id="btn-close"),
                    Static("", id="save-status"),
                    classes="editor-actions"
                ),

                # Validation warnings
                Static("", id="validation-warnings"),

                id="editor-container"
            )
        )

    def on_mount(self):
        """Load first file when mounted."""
        file_select = self.query_one("#file-select", Select)
        self.current_file = file_select.value
        self._load_file()

    def on_select_changed(self, event):
        """Handle file selection change."""
        if event.select.id == "file-select":
            if self.modified:
                # For simplicity, just warn and allow switch
                self.app.notify("Unsaved changes will be lost", severity="warning")

            self._switch_file(event.value)

    def on_button_pressed(self, event):
        """Handle button presses."""
        if event.button.id == "btn-save":
            self.action_save()
        elif event.button.id == "btn-revert":
            self._load_file()
        elif event.button.id == "btn-close":
            self.action_close()

    def on_text_area_changed(self, event):
        """Track modifications."""
        editor = self.query_one("#config-editor", TextArea)
        self.modified = (editor.text != self.original_content)

    def action_save(self):
        """Save current file."""
        editor = self.query_one("#config-editor", TextArea)
        content = editor.text

        # Validate configuration
        warnings = self._validate_config(content)

        if warnings:
            # Show warnings
            warnings_container = self.query_one("#validation-warnings")
            warnings_container.update("\n".join(f"[yellow]Warning: {w}[/yellow]" for w in warnings))

        # Write file
        try:
            with open(self.current_file, 'w') as f:
                f.write(content)

            self.modified = False
            self.original_content = content
            self.query_one("#save-status", Static).update("[green]Saved successfully![/green]")

            # Clear status after 3 seconds
            self.set_timer(3.0, lambda: self.query_one("#save-status", Static).update(""))

            self.app.notify("Configuration saved", severity="information")

        except Exception as e:
            self.query_one("#save-status", Static).update(f"[red]Error: {e}[/red]")
            self.app.notify(f"Failed to save: {e}", severity="error")

    def action_close(self):
        """Close editor with unsaved changes prompt."""
        if self.modified:
            self.app.notify("Closing with unsaved changes", severity="warning")

        self.app.pop_screen()

    def _switch_file(self, file_path: str):
        """Switch to different file."""
        self.current_file = file_path
        self.modified = False
        self._load_file()

    def _load_file(self):
        """Load file into editor."""
        try:
            with open(self.current_file, 'r') as f:
                content = f.read()

            editor = self.query_one("#config-editor", TextArea)
            editor.text = content
            self.original_content = content
            self.modified = False

            # Clear warnings
            self.query_one("#validation-warnings").update("")

        except Exception as e:
            self.query_one("#save-status", Static).update(f"[red]Error loading file: {e}[/red]")
            self.app.notify(f"Failed to load file: {e}", severity="error")

    def _validate_config(self, content: str) -> list:
        """
        Validate configuration and return warnings.

        Args:
            content: Configuration file content

        Returns:
            List of warning messages
        """
        warnings = []

        lines = content.split('\n')
        config = {}

        # Parse key-value pairs
        for line in lines:
            line = line.strip()
            if line and not line.startswith('#'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    config[key.strip()] = value.strip()

        # Validation rules
        if 'JWT_SECRET' in config:
            if len(config['JWT_SECRET']) < 32:
                warnings.append("JWT_SECRET should be at least 32 characters")

        if 'LORADB_API_PORT' in config:
            try:
                port = int(config['LORADB_API_PORT'])
                if port < 1024 or port > 65535:
                    warnings.append("Port should be between 1024 and 65535")
            except ValueError:
                warnings.append("Invalid port number")

        if 'BACKEND_PORT' in config:
            try:
                port = int(config['BACKEND_PORT'])
                if port < 1024 or port > 65535:
                    warnings.append("Backend port should be between 1024 and 65535")
            except ValueError:
                warnings.append("Invalid backend port number")

        return warnings
