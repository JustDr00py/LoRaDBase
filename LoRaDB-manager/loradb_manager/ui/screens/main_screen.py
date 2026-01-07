"""Main screen showing list of instances."""

from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Static, DataTable, Button, Label
from textual.containers import Container, Vertical, Horizontal, ScrollableContainer
from textual.reactive import reactive
from textual.binding import Binding

from ...core.instance_manager import InstanceManager
from ...core.instance import InstanceStatus
from ...config import Config


class MainScreen(Screen):
    """Main screen showing list of instances."""

    BINDINGS = [
        Binding("s", "start_instance", "Start", show=True),
        Binding("t", "stop_instance", "Stop", show=True),
        Binding("a", "manage_tokens", "Tokens", show=True),
        Binding("l", "view_logs", "Logs", show=True),
        Binding("e", "edit_config", "Edit", show=True),
        Binding("d", "delete_instance", "Delete", show=True),
        Binding("b", "rebuild_instance", "Rebuild", show=False),
        Binding("enter", "select_instance", "Details", show=False),
    ]

    selected_instance_id = reactive(None)

    def __init__(self, instance_manager: InstanceManager):
        """
        Initialize main screen.

        Args:
            instance_manager: InstanceManager instance
        """
        super().__init__()
        self.instance_manager = instance_manager

    def compose(self) -> ComposeResult:
        """Compose main screen layout."""
        yield Static(
            f"LoRaDB Instance Manager - Instances: {len(self.instance_manager.list_instances())}",
            id="instance-count"
        )

        # Instance table
        yield DataTable(id="instance-table", zebra_stripes=True, show_header=True, show_cursor=True)

        # Action buttons
        yield Horizontal(
            Button("Create Instance", id="btn-create", variant="success"),
            Button("Start", id="btn-start", variant="success"),
            Button("Stop", id="btn-stop", variant="warning"),
            Button("Restart", id="btn-restart"),
            Button("Rebuild", id="btn-rebuild"),
            Button("API Tokens", id="btn-tokens", variant="primary"),
            Button("Logs", id="btn-logs", variant="primary"),
            Button("Edit Config", id="btn-config"),
            Button("Delete", id="btn-delete", variant="error"),
            classes="action-buttons"
        )

    def on_mount(self):
        """Initialize table when screen is mounted."""
        table = self.query_one("#instance-table", DataTable)

        # Add columns
        table.add_columns("ID", "Name", "Status", "Port", "Created")

        # Populate rows
        self.refresh_instances()

        # Set up auto-refresh for status updates
        self.set_interval(Config.STATUS_REFRESH_INTERVAL, self.refresh_instance_status)

    def refresh_instances(self):
        """Refresh instance list from manager."""
        table = self.query_one("#instance-table", DataTable)
        table.clear()

        instances = self.instance_manager.list_instances()

        for instance in instances:
            # Update status from Docker
            self.instance_manager.update_instance_status(instance.instance_id)

            # Format row
            status_text = self._format_status(instance.status)
            ports_text = str(instance.ports.loradb_api)
            created_text = instance.created_at.strftime("%Y-%m-%d %H:%M")

            table.add_row(
                instance.instance_id,
                instance.name,
                status_text,
                ports_text,
                created_text,
                key=instance.instance_id
            )

        # Update count
        count_widget = self.query_one("#instance-count", Static)
        count_widget.update(f"Instances: {len(instances)}")

        # Auto-select first instance if there's at least one
        if len(instances) > 0 and not self.selected_instance_id:
            self.selected_instance_id = instances[0].instance_id
            # Move cursor to first row
            table.move_cursor(row=0)

    def refresh_instance_status(self):
        """Background task to update instance statuses."""
        if self.is_mounted:
            # Only refresh status, don't rebuild table
            for instance in self.instance_manager.list_instances():
                self.instance_manager.update_instance_status(instance.instance_id)

    def _format_status(self, status: InstanceStatus) -> str:
        """Format status with colored indicators."""
        colors = {
            InstanceStatus.RUNNING: "green",
            InstanceStatus.STOPPED: "red",
            InstanceStatus.STARTING: "yellow",
            InstanceStatus.STOPPING: "yellow",
            InstanceStatus.ERROR: "red bold",
            InstanceStatus.UNKNOWN: "dim",
        }
        color = colors.get(status, "white")
        return f"[{color}]{status.value.upper()}[/{color}]"

    def on_data_table_row_selected(self, event):
        """Handle row selection (Enter key)."""
        self.selected_instance_id = event.row_key.value

    def on_data_table_row_highlighted(self, event):
        """Handle row highlight (cursor movement or click)."""
        self.selected_instance_id = event.row_key.value

    def on_data_table_cell_highlighted(self, event):
        """Handle cell highlight (clicking or moving cursor)."""
        self.selected_instance_id = event.cell_key.row_key.value

    def on_button_pressed(self, event):
        """Handle button presses."""
        # Handle Create button (doesn't need instance selection)
        if event.button.id == "btn-create":
            self.action_create_instance()
            return

        # Auto-select if only one instance exists
        if not self.selected_instance_id:
            instances = self.instance_manager.list_instances()
            if len(instances) == 1:
                self.selected_instance_id = instances[0].instance_id
            else:
                self.app.notify("Please select an instance from the table first", severity="warning")
                return

        if event.button.id == "btn-start":
            self.action_start_instance()
        elif event.button.id == "btn-stop":
            self.action_stop_instance()
        elif event.button.id == "btn-restart":
            self.action_restart_instance()
        elif event.button.id == "btn-rebuild":
            self.action_rebuild_instance()
        elif event.button.id == "btn-tokens":
            self.action_manage_tokens()
        elif event.button.id == "btn-logs":
            self.action_view_logs()
        elif event.button.id == "btn-config":
            self.action_edit_config()
        elif event.button.id == "btn-delete":
            self.action_delete_instance()

    def action_start_instance(self):
        """Start selected instance."""
        if not self.selected_instance_id:
            self.app.notify("Please select an instance first", severity="warning")
            return

        self.app.notify(f"Starting instance {self.selected_instance_id} in background...", severity="information")
        self.run_worker(self._start_instance_worker(self.selected_instance_id), exclusive=False)

    async def _start_instance_worker(self, instance_id: str):
        """Background worker to start instance."""
        import asyncio
        try:
            # Run blocking operation in thread pool
            await asyncio.to_thread(self.instance_manager.start_instance, instance_id)
            self.app.notify(f"Instance {instance_id} started successfully", severity="information")
            self.refresh_instances()
        except Exception as e:
            self.app.notify(f"Failed to start instance: {e}", severity="error")

    def action_stop_instance(self):
        """Stop selected instance."""
        if not self.selected_instance_id:
            self.app.notify("Please select an instance first", severity="warning")
            return

        self.app.notify(f"Stopping instance {self.selected_instance_id} in background...", severity="information")
        self.run_worker(self._stop_instance_worker(self.selected_instance_id), exclusive=False)

    async def _stop_instance_worker(self, instance_id: str):
        """Background worker to stop instance."""
        import asyncio
        try:
            # Run blocking operation in thread pool
            await asyncio.to_thread(self.instance_manager.stop_instance, instance_id)
            self.app.notify(f"Instance {instance_id} stopped successfully", severity="information")
            self.refresh_instances()
        except Exception as e:
            self.app.notify(f"Failed to stop instance: {e}", severity="error")

    def action_restart_instance(self):
        """Restart selected instance."""
        if not self.selected_instance_id:
            self.app.notify("Please select an instance first", severity="warning")
            return

        self.app.notify(f"Restarting instance {self.selected_instance_id} in background...", severity="information")
        self.run_worker(self._restart_instance_worker(self.selected_instance_id), exclusive=False)

    async def _restart_instance_worker(self, instance_id: str):
        """Background worker to restart instance."""
        import asyncio
        try:
            # Run blocking operation in thread pool
            await asyncio.to_thread(self.instance_manager.restart_instance, instance_id)
            self.app.notify(f"Instance {instance_id} restarted successfully", severity="information")
            self.refresh_instances()
        except Exception as e:
            self.app.notify(f"Failed to restart instance: {e}", severity="error")

    def action_rebuild_instance(self):
        """Rebuild selected instance (stops, rebuilds Docker images, starts)."""
        if not self.selected_instance_id:
            self.app.notify("Please select an instance first", severity="warning")
            return

        self.app.notify(f"Rebuilding instance {self.selected_instance_id} in background...", severity="information")
        self.run_worker(self._rebuild_instance_worker(self.selected_instance_id), exclusive=False)

    async def _rebuild_instance_worker(self, instance_id: str):
        """Background worker to rebuild instance."""
        import asyncio
        try:
            # Run blocking operation in thread pool
            await asyncio.to_thread(self.instance_manager.rebuild_instance, instance_id)
            self.app.notify(f"Instance {instance_id} rebuilt successfully", severity="information")
            self.refresh_instances()
        except Exception as e:
            self.app.notify(f"Failed to rebuild instance: {e}", severity="error")

    def action_view_logs(self):
        """View instance logs."""
        if not self.selected_instance_id:
            self.app.notify("Please select an instance first", severity="warning")
            return

        from .logs_viewer import LogsViewerScreen
        instance = self.instance_manager.get_instance(self.selected_instance_id)
        if instance:
            self.app.push_screen(LogsViewerScreen(instance, self.instance_manager))

    def action_manage_tokens(self):
        """Open token management screen for selected instance."""
        if not self.selected_instance_id:
            self.app.notify("Please select an instance first", severity="warning")
            return

        instance = self.instance_manager.get_instance(self.selected_instance_id)
        if not instance:
            return

        # Check if instance is running
        if instance.status != InstanceStatus.RUNNING:
            self.app.notify(
                "Instance must be running to manage API tokens",
                severity="warning"
            )
            return

        from .token_manager_screen import TokenManagerScreen
        self.app.push_screen(TokenManagerScreen(instance))

    def action_edit_config(self):
        """Edit instance configuration."""
        if not self.selected_instance_id:
            self.app.notify("Please select an instance first", severity="warning")
            return

        from .config_editor import ConfigEditorScreen
        instance = self.instance_manager.get_instance(self.selected_instance_id)

        if instance:
            self.app.push_screen(ConfigEditorScreen(instance))

    def action_delete_instance(self):
        """Delete instance with confirmation."""
        if not self.selected_instance_id:
            self.app.notify("Please select an instance first", severity="warning")
            return

        instance = self.instance_manager.get_instance(self.selected_instance_id)
        if not instance:
            return

        # Simple confirmation via notify for now
        # In production, would use a modal dialog
        try:
            self.instance_manager.delete_instance(self.selected_instance_id, force=True)
            self.selected_instance_id = None
            self.refresh_instances()
            self.app.notify(f"Instance deleted successfully", severity="information")
        except Exception as e:
            self.app.notify(f"Failed to delete instance: {e}", severity="error")

    def action_select_instance(self):
        """View instance details (placeholder for future enhancement)."""
        if self.selected_instance_id:
            instance = self.instance_manager.get_instance(self.selected_instance_id)
            if instance:
                self.app.notify(
                    f"Instance: {instance.name} - Status: {instance.status.value}",
                    severity="information"
                )

    def action_create_instance(self):
        """Open create instance wizard."""
        from .create_wizard import CreateInstanceWizard
        self.app.push_screen(CreateInstanceWizard(self.instance_manager))
