#!/usr/bin/env python3
"""Test if footer shows with minimal app."""

from textual.app import App, ComposeResult
from textual.widgets import Footer, Static
from textual.binding import Binding


class TestFooterApp(App):
    """Minimal test app."""

    BINDINGS = [
        Binding("q", "quit", "Quit", show=True),
        Binding("h", "help", "Help", show=True),
        Binding("t", "test", "Test", show=True),
    ]

    def compose(self) -> ComposeResult:
        yield Static("Test App - Footer should appear at bottom")
        yield Footer()

    def action_help(self):
        """Test help action."""
        self.notify("Help pressed!")

    def action_test(self):
        """Test action."""
        self.notify("Test pressed!")


if __name__ == "__main__":
    app = TestFooterApp()
    app.run()
