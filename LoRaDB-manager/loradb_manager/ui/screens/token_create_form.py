"""Token creation form screen."""

import os
from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Static, Input, Button, Label
from textual.containers import Horizontal, Vertical, Container
from textual.binding import Binding
import httpx

from ...core.instance import InstanceMetadata
from ...api.loradb_client import LoRaDBClient


class TokenCreateForm(Screen):
    """Screen for creating a new API token."""

    BINDINGS = [
        Binding("escape", "cancel", "Cancel", show=True),
    ]

    def __init__(self, instance: InstanceMetadata):
        """
        Initialize token creation form.

        Args:
            instance: Instance metadata
        """
        super().__init__()
        self.instance = instance
        self.client = LoRaDBClient(instance)
        self.created_token = None

    def compose(self) -> ComposeResult:
        """Compose token creation form."""
        yield Container(
            Static("Create API Token", id="form-title"),
            Vertical(
                Label("Token Name:"),
                Input(placeholder="e.g., Production Dashboard", id="input-name"),
                Label("Expires In Days (optional, leave blank for no expiration):"),
                Input(placeholder="e.g., 365 or leave blank", id="input-expiration"),
                Horizontal(
                    Button("Cancel", id="btn-cancel", variant="default"),
                    Button("Create", id="btn-create", variant="success"),
                    classes="button-row",
                ),
                id="form-container",
            ),
            id="form-wrapper",
        )

    def on_mount(self):
        """Focus on name input when mounted."""
        self.query_one("#input-name", Input).focus()

    def on_button_pressed(self, event):
        """Handle button presses."""
        if event.button.id == "btn-cancel":
            self.action_cancel()
        elif event.button.id == "btn-create":
            self.action_submit()

    def action_cancel(self):
        """Cancel token creation and close form."""
        self.dismiss(False)

    def action_submit(self):
        """Submit token creation form."""
        # Get form values
        name = self.query_one("#input-name", Input).value.strip()
        expiration_str = self.query_one("#input-expiration", Input).value.strip()

        # Validate name
        if not name:
            self.app.notify("Token name is required", severity="warning")
            return

        if len(name) > 100:
            self.app.notify("Token name must be 100 characters or less", severity="warning")
            return

        # Validate expiration
        expires_in_days = None
        if expiration_str:
            try:
                expires_in_days = int(expiration_str)
                if expires_in_days <= 0:
                    self.app.notify(
                        "Expiration must be a positive number of days", severity="warning"
                    )
                    return
            except ValueError:
                self.app.notify("Expiration must be a valid number", severity="warning")
                return

        # Create token
        self.app.notify(f"Creating token: {name}...", severity="information")
        self.run_worker(
            self._create_token_worker(name, expires_in_days), exclusive=False
        )

    async def _create_token_worker(self, name: str, expires_in_days: int | None):
        """Background worker to create token via API."""
        try:
            # Call API
            token_response = await self.client.create_token(name, expires_in_days)

            # Store token response
            self.created_token = token_response

            # Show success screen
            self._show_token_display()

        except httpx.ConnectError:
            self.app.notify(
                "Failed to connect to LoRaDB API. Is the instance running?",
                severity="error",
            )

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 401:
                self.app.notify(
                    "Authentication failed. Instance JWT secret may be misconfigured.",
                    severity="error",
                )
            else:
                error_msg = f"API error: {e.response.status_code}"
                try:
                    error_detail = e.response.json()
                    if "error" in error_detail:
                        error_msg = f"API error: {error_detail['error']}"
                except Exception:
                    pass
                self.app.notify(error_msg, severity="error")

        except httpx.TimeoutException:
            self.app.notify(
                "Request timed out. Instance may be overloaded.", severity="error"
            )

        except Exception as e:
            self.app.notify(f"Unexpected error: {str(e)}", severity="error")

    def _show_token_display(self):
        """Replace form with token display screen."""
        if not self.created_token:
            return

        # Clear current content
        self.query_one("#form-wrapper").remove()

        # Add token display
        expires_text = (
            self.created_token.expires_at
            if self.created_token.expires_at
            else "Never"
        )

        self.mount(
            Container(
                Static("Token Created Successfully", id="success-title"),
                Vertical(
                    Static("[green]✓[/green] API Token created!"),
                    Static(""),
                    Static(f"Token ID: {self.created_token.id}"),
                    Static(f"Name: {self.created_token.name}"),
                    Static(f"Created: {self.created_token.created_at}"),
                    Static(f"Expires: {expires_text}"),
                    Static(""),
                    Static("[bold]TOKEN (SHOWN ONCE)[/bold]", id="token-label"),
                    Static(self.created_token.token, id="token-value"),
                    Static(""),
                    Static(
                        "[yellow]WARNING: Save this token now! It cannot be retrieved later.[/yellow]"
                    ),
                    Static(""),
                    Horizontal(
                        Button("Copy to Clipboard", id="btn-copy", variant="primary"),
                        Button("Close", id="btn-close-success", variant="default"),
                        classes="button-row",
                    ),
                    id="token-display-container",
                ),
                id="token-display-wrapper",
            )
        )

        # Update button handler
        self._showing_token = True

    def on_button_pressed(self, event):
        """Handle button presses."""
        if event.button.id == "btn-cancel":
            self.action_cancel()
        elif event.button.id == "btn-create":
            self.action_submit()
        elif event.button.id == "btn-copy":
            self.action_copy_token()
        elif event.button.id == "btn-close-success":
            self.action_close_success()

    def action_copy_token(self):
        """Copy token to clipboard."""
        if not self.created_token:
            return

        try:
            import pyperclip

            pyperclip.copy(self.created_token.token)
            self.app.notify("Token copied to clipboard!", severity="information")
        except Exception as e:
            # Clipboard not available (e.g., headless environment)
            self.app.notify(
                "Clipboard not available. Please copy the token manually.",
                severity="warning",
            )

    def action_close_success(self):
        """Close form after successful token creation."""
        self.dismiss(True)
