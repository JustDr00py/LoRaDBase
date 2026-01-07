"""Create instance wizard screen."""

from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Static, Input, Button, Label
from textual.containers import Container, Vertical, Horizontal
from textual.validation import Function
import re

from ...core.instance_manager import InstanceManager


class CreateInstanceWizard(Screen):
    """Multi-step wizard for creating a new instance."""

    def __init__(self, instance_manager: InstanceManager):
        """
        Initialize wizard.

        Args:
            instance_manager: InstanceManager instance
        """
        super().__init__()
        self.instance_manager = instance_manager
        self.step = 1
        self.form_data = {}

    def compose(self) -> ComposeResult:
        """Compose wizard UI."""
        yield Container(
            Vertical(
                Static("Create New Instance - Step 1/3", id="wizard-title", classes="wizard-title"),

                # Step 1: Basic Info
                Container(
                    Label("Instance ID (lowercase alphanumeric + hyphens):"),
                    Input(
                        placeholder="my-instance",
                        id="input-instance-id"
                    ),

                    Label("Instance Name:"),
                    Input(placeholder="My Instance", id="input-name"),

                    Label("Description (optional):"),
                    Input(placeholder="Description", id="input-description"),

                    id="step-1",
                    classes="wizard-step"
                ),

                # Step 2: Port Configuration
                Container(
                    Label("Port Configuration"),
                    Static("Leave blank for auto-allocation", classes="hint"),

                    Label("LoRaDB API Port (default: 8443):"),
                    Input(placeholder="8443", id="input-port-loradb"),

                    id="step-2",
                    classes="wizard-step hidden"
                ),

                # Step 3: Security Configuration
                Container(
                    Label("Security Configuration"),

                    Label("JWT Secret (leave blank for auto-generation):"),
                    Input(placeholder="Auto-generated", id="input-jwt-secret", password=True),

                    Label("TLS Certificate Path (optional):"),
                    Input(placeholder="/path/to/cert.pem", id="input-tls-cert"),

                    Label("TLS Key Path (optional):"),
                    Input(placeholder="/path/to/key.pem", id="input-tls-key"),

                    id="step-3",
                    classes="wizard-step hidden"
                ),

                # Navigation buttons
                Horizontal(
                    Button("Cancel", id="btn-cancel", variant="error"),
                    Button("Back", id="btn-back", disabled=True),
                    Button("Next", id="btn-next", variant="primary"),
                    Button("Create", id="btn-create", variant="success", classes="hidden"),
                    classes="wizard-buttons"
                ),

                Static("", id="wizard-error", classes="error-message hidden"),

                id="wizard-container"
            )
        )

    def _validate_instance_id(self, value: str) -> bool:
        """Validate instance ID format."""
        if not value:
            return False
        if not re.match(r'^[a-z0-9-]+$', value):
            return False
        if value in self.instance_manager.instances:
            return False
        return True

    def on_button_pressed(self, event):
        """Handle button clicks."""
        if event.button.id == "btn-cancel":
            self.app.pop_screen()

        elif event.button.id == "btn-back":
            self._go_to_step(self.step - 1)

        elif event.button.id == "btn-next":
            if self._validate_current_step():
                self._save_step_data()
                self._go_to_step(self.step + 1)

        elif event.button.id == "btn-create":
            if self._validate_current_step():
                self._save_step_data()
                self._create_instance()

    def _go_to_step(self, step: int):
        """Navigate to specific step."""
        # Hide all steps
        for i in range(1, 4):
            step_widget = self.query_one(f"#step-{i}")
            step_widget.add_class("hidden")

        # Show current step
        self.step = step
        current_step = self.query_one(f"#step-{step}")
        current_step.remove_class("hidden")

        # Update title
        title = self.query_one("#wizard-title")
        title.update(f"Create New Instance - Step {step}/3")

        # Update button states
        back_btn = self.query_one("#btn-back", Button)
        next_btn = self.query_one("#btn-next", Button)
        create_btn = self.query_one("#btn-create", Button)

        back_btn.disabled = (step == 1)

        if step == 3:
            next_btn.add_class("hidden")
            create_btn.remove_class("hidden")
        else:
            next_btn.remove_class("hidden")
            create_btn.add_class("hidden")

    def _validate_current_step(self) -> bool:
        """Validate inputs for current step."""
        error_msg = self.query_one("#wizard-error")

        if self.step == 1:
            instance_id = self.query_one("#input-instance-id", Input).value
            name = self.query_one("#input-name", Input).value

            if not self._validate_instance_id(instance_id):
                error_msg.update("Invalid or duplicate instance ID")
                error_msg.remove_class("hidden")
                return False

            if not name:
                error_msg.update("Name is required")
                error_msg.remove_class("hidden")
                return False

        error_msg.add_class("hidden")
        return True

    def _save_step_data(self):
        """Save current step data to form_data."""
        if self.step == 1:
            self.form_data['instance_id'] = self.query_one("#input-instance-id", Input).value
            self.form_data['name'] = self.query_one("#input-name", Input).value
            self.form_data['description'] = self.query_one("#input-description", Input).value or None

        elif self.step == 2:
            self.form_data['port_loradb'] = self._parse_port("#input-port-loradb")

        elif self.step == 3:
            self.form_data['jwt_secret'] = self.query_one("#input-jwt-secret", Input).value or None
            self.form_data['tls_cert'] = self.query_one("#input-tls-cert", Input).value or None
            self.form_data['tls_key'] = self.query_one("#input-tls-key", Input).value or None

    def _parse_port(self, input_id: str):
        """Parse port input, return None for auto-allocation."""
        value = self.query_one(input_id, Input).value
        if not value:
            return None
        try:
            port = int(value)
            if 1024 <= port <= 65535:
                return port
            return None
        except ValueError:
            return None

    def _create_instance(self):
        """Create instance using collected data."""
        self.app.notify(f"Creating instance {self.form_data['instance_id']} in background...", severity="information")
        self.run_worker(self._create_instance_worker(), exclusive=False)

    async def _create_instance_worker(self):
        """Background worker to create instance."""
        import asyncio
        try:
            preferred_ports = None
            if self.form_data.get('port_loradb'):
                preferred_ports = {
                    'loradb_api': self.form_data.get('port_loradb'),
                }

            # Run blocking operation in thread pool
            from functools import partial
            create_func = partial(
                self.instance_manager.create_instance,
                instance_id=self.form_data['instance_id'],
                name=self.form_data['name'],
                description=self.form_data.get('description'),
                jwt_secret=self.form_data.get('jwt_secret'),
                preferred_ports=preferred_ports,
                tls_cert_path=self.form_data.get('tls_cert'),
                tls_key_path=self.form_data.get('tls_key')
            )
            instance = await asyncio.to_thread(create_func)

            # Return to main screen and refresh
            self.app.pop_screen()

            # Refresh the main screen's instance list
            try:
                from .main_screen import MainScreen
                # Access the current screen after popping
                if isinstance(self.app.screen, MainScreen):
                    self.app.screen.refresh_instances()
            except Exception:
                pass  # Main screen not found, ignore

            self.app.notify(
                f"Instance '{instance.name}' created successfully!",
                severity="information"
            )

        except Exception as e:
            error_msg = self.query_one("#wizard-error")
            error_msg.update(f"Failed to create instance: {e}")
            error_msg.remove_class("hidden")
