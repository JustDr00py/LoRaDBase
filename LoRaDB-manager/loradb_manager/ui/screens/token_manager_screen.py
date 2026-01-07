"""Token management screen for viewing and managing API tokens."""

from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Static, DataTable, Button, Label
from textual.containers import Horizontal, Vertical
from textual.binding import Binding
from datetime import datetime
import httpx

from ...core.instance import InstanceMetadata
from ...api.loradb_client import LoRaDBClient
from ...api.models import TokenInfo
from ...config import Config


class TokenManagerScreen(Screen):
    """Screen for managing API tokens for an instance."""

    BINDINGS = [
        Binding("c", "create_token", "Create Token", show=True),
        Binding("r", "revoke_token", "Revoke", show=True),
        Binding("f", "refresh", "Refresh", show=True),
        Binding("escape", "close_screen", "Close", show=True),
    ]

    def __init__(self, instance: InstanceMetadata):
        """
        Initialize token manager screen.

        Args:
            instance: Instance metadata
        """
        super().__init__()
        self.instance = instance
        self.client = LoRaDBClient(instance)
        self.selected_token_id = None
        self.tokens = []

    def compose(self) -> ComposeResult:
        """Compose token manager layout."""
        yield Static(
            f"API Tokens: {self.instance.name} ({self.instance.instance_id})",
            id="token-header",
        )

        # Token table
        yield DataTable(
            id="token-table", zebra_stripes=True, show_header=True, show_cursor=True
        )

        # Action buttons
        yield Horizontal(
            Button("Create Token", id="btn-create", variant="success"),
            Button("Revoke", id="btn-revoke", variant="error"),
            Button("Refresh", id="btn-refresh", variant="primary"),
            Button("Close", id="btn-close"),
            classes="action-buttons",
        )

        # Status bar
        yield Static("Loading tokens...", id="status-bar")

    def on_mount(self):
        """Initialize table when screen is mounted."""
        table = self.query_one("#token-table", DataTable)

        # Add columns
        table.add_columns("Name", "Created By", "Created", "Last Used", "Expires", "Status")

        # Load tokens
        self.refresh_tokens()

        # Set up auto-refresh
        self.set_interval(Config.TOKEN_REFRESH_INTERVAL, self.refresh_tokens)

    def refresh_tokens(self):
        """Refresh token list from API."""
        self.run_worker(self._load_tokens_worker(), exclusive=False)

    async def _load_tokens_worker(self):
        """Background worker to load tokens from API."""
        try:
            # Update status
            status_bar = self.query_one("#status-bar", Static)
            status_bar.update("Loading tokens...")

            # Fetch tokens
            self.tokens = await self.client.list_tokens()

            # Update table
            table = self.query_one("#token-table", DataTable)
            table.clear()

            for token in self.tokens:
                # Format columns
                name = token.name
                created_by = token.created_by
                created = self._format_datetime(token.created_at)
                last_used = (
                    self._format_relative_time(token.last_used_at)
                    if token.last_used_at
                    else "Never"
                )
                expires = (
                    self._format_datetime(token.expires_at)
                    if token.expires_at
                    else "Never"
                )
                status = self._format_status(token)

                table.add_row(
                    name,
                    created_by,
                    created,
                    last_used,
                    expires,
                    status,
                    key=token.id,
                )

            # Update status bar
            now = datetime.now().strftime("%H:%M:%S")
            status_bar.update(
                f"{len(self.tokens)} token(s) loaded | Last refresh: {now}"
            )

        except httpx.ConnectError:
            self.app.notify(
                "Failed to connect to LoRaDB API. Is the instance running?",
                severity="error",
            )
            status_bar = self.query_one("#status-bar", Static)
            status_bar.update("Error: Connection failed")

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                self.app.notify(
                    "Authentication failed. Instance JWT secret may be misconfigured.",
                    severity="error",
                )
            else:
                self.app.notify(f"API error: {e.response.status_code}", severity="error")
            status_bar = self.query_one("#status-bar", Static)
            status_bar.update(f"Error: HTTP {e.response.status_code}")

        except httpx.TimeoutException:
            self.app.notify(
                "Request timed out. Instance may be overloaded.", severity="error"
            )
            status_bar = self.query_one("#status-bar", Static)
            status_bar.update("Error: Timeout")

        except Exception as e:
            self.app.notify(f"Unexpected error: {str(e)}", severity="error")
            status_bar = self.query_one("#status-bar", Static)
            status_bar.update(f"Error: {str(e)}")

    def _format_status(self, token: TokenInfo) -> str:
        """Format token status with color indicators."""
        if not token.is_active:
            return "[red]REVOKED[/red]"

        # Check if expired
        if token.expires_at:
            try:
                expires = datetime.fromisoformat(token.expires_at.replace("Z", "+00:00"))
                if expires < datetime.now(expires.tzinfo):
                    return "[red]EXPIRED[/red]"
            except Exception:
                pass

        return "[green]ACTIVE[/green]"

    def _format_datetime(self, dt_str: str) -> str:
        """Format ISO datetime to readable format."""
        try:
            dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d %H:%M")
        except Exception:
            return dt_str

    def _format_relative_time(self, dt_str: str) -> str:
        """Format ISO datetime as relative time."""
        try:
            dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
            now = datetime.now(dt.tzinfo)
            delta = now - dt

            if delta.days > 0:
                return f"{delta.days} day(s) ago"
            elif delta.seconds >= 3600:
                hours = delta.seconds // 3600
                return f"{hours} hour(s) ago"
            elif delta.seconds >= 60:
                minutes = delta.seconds // 60
                return f"{minutes} minute(s) ago"
            else:
                return "Just now"
        except Exception:
            return dt_str

    def on_data_table_row_highlighted(self, event):
        """Handle row highlight (cursor movement or click)."""
        self.selected_token_id = event.row_key.value

    def on_data_table_cell_highlighted(self, event):
        """Handle cell highlight (clicking or moving cursor)."""
        self.selected_token_id = event.cell_key.row_key.value

    def on_button_pressed(self, event):
        """Handle button presses."""
        if event.button.id == "btn-create":
            self.action_create_token()
        elif event.button.id == "btn-revoke":
            self.action_revoke_token()
        elif event.button.id == "btn-refresh":
            self.action_refresh()
        elif event.button.id == "btn-close":
            self.action_close_screen()

    def action_create_token(self):
        """Open token creation form."""
        from .token_create_form import TokenCreateForm

        self.app.push_screen(TokenCreateForm(self.instance), self._on_token_created)

    def _on_token_created(self, created: bool):
        """Callback when token is created."""
        if created:
            self.refresh_tokens()

    def action_revoke_token(self):
        """Revoke selected token."""
        if not self.selected_token_id:
            self.app.notify("Please select a token to revoke", severity="warning")
            return

        # Find token info
        token = next(
            (t for t in self.tokens if t.id == self.selected_token_id), None
        )
        if not token:
            return

        # Confirm revocation
        self.app.notify(f"Revoking token: {token.name}...", severity="information")
        self.run_worker(self._revoke_token_worker(self.selected_token_id), exclusive=False)

    async def _revoke_token_worker(self, token_id: str):
        """Background worker to revoke token."""
        try:
            success = await self.client.revoke_token(token_id)
            if success:
                self.app.notify("Token revoked successfully", severity="information")
                # Refresh token list
                await self._load_tokens_worker()
            else:
                self.app.notify("Failed to revoke token", severity="error")

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                self.app.notify("Token already revoked or not found", severity="warning")
                # Refresh to update list
                await self._load_tokens_worker()
            else:
                self.app.notify(f"Failed to revoke token: HTTP {e.response.status_code}", severity="error")

        except httpx.ConnectError:
            self.app.notify(
                "Failed to connect to LoRaDB API. Is the instance running?",
                severity="error",
            )

        except Exception as e:
            self.app.notify(f"Error revoking token: {str(e)}", severity="error")

    def action_refresh(self):
        """Manually refresh token list."""
        self.refresh_tokens()

    def action_close_screen(self):
        """Close the token manager screen."""
        self.app.pop_screen()
