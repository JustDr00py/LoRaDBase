#!/usr/bin/env python3
"""Quick test to verify screen navigation."""

from textual.app import App, ComposeResult
from textual.screen import Screen
from textual.widgets import Header, Footer, Button, Static
from textual.binding import Binding


class TestScreen1(Screen):
    """First test screen."""

    BINDINGS = [
        Binding("escape", "close", "Close", priority=True),
    ]

    def compose(self) -> ComposeResult:
        yield Static("This is Screen 1 (Main)")
        yield Button("Go to Screen 2", id="btn-screen2")

    def on_button_pressed(self, event):
        if event.button.id == "btn-screen2":
            self.app.push_screen(TestScreen2())


class TestScreen2(Screen):
    """Second test screen."""

    BINDINGS = [
        Binding("escape", "close", "Close", priority=True),
    ]

    def compose(self) -> ComposeResult:
        yield Static("This is Screen 2 (Logs)")
        yield Button("Close (Back to Screen 1)", id="btn-close", variant="primary")

    def on_button_pressed(self, event):
        if event.button.id == "btn-close":
            self.action_close()

    def action_close(self):
        """Close this screen."""
        self.app.pop_screen()


class TestApp(App):
    """Test application."""

    BINDINGS = [
        Binding("q", "quit", "Quit"),
    ]

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield Footer()

    def on_mount(self):
        """Push initial screen."""
        self.push_screen(TestScreen1())


if __name__ == "__main__":
    app = TestApp()
    app.run()
