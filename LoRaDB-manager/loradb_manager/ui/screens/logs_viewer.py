"""Logs viewer screen for real-time container log streaming."""

from textual.app import ComposeResult
from textual.screen import Screen
from textual.widgets import Static, RichLog, Button
from textual.containers import Container, Vertical, Horizontal
from textual.binding import Binding
import asyncio

from ...core.instance_manager import InstanceManager
from ...core.instance import InstanceMetadata
from ...config import Config


class LogsViewerScreen(Screen):
    """Screen for viewing real-time container logs."""

    CSS = """
    LogsViewerScreen {
        layout: vertical;
    }

    LogsViewerScreen .screen-title {
        height: 1;
        dock: top;
    }

    LogsViewerScreen .button-row {
        height: 3;
        dock: top;
        align: left middle;
    }

    LogsViewerScreen .button-row Button {
        margin: 0 1;
    }

    LogsViewerScreen #log-display {
        height: 1fr;
    }

    LogsViewerScreen #follow-status {
        height: 1;
        dock: bottom;
    }
    """

    BINDINGS = [
        Binding("escape", "close", "Close", priority=True),
        Binding("c", "clear_logs", "Clear"),
    ]

    def __init__(self, instance: InstanceMetadata, instance_manager: InstanceManager):
        """
        Initialize logs viewer.

        Args:
            instance: Instance to view logs for
            instance_manager: InstanceManager instance
        """
        super().__init__()
        self.instance = instance
        self.instance_manager = instance_manager
        self.following = True
        self.current_container = f"loradb-{instance.instance_id}"
        self._log_worker = None

    def compose(self) -> ComposeResult:
        """Compose logs viewer UI."""
        yield Static(f"Logs: {self.instance.name}", classes="screen-title")

        # Control buttons
        yield Horizontal(
            Button("Refresh", id="btn-refresh"),
            Button("Clear", id="btn-clear"),
            Button("Close", id="btn-close", variant="error"),
            classes="button-row"
        )

        # Log display
        yield RichLog(id="log-display", highlight=True, markup=True)

        # Status bar
        yield Static(f"Following: {self.following} | Container: {self.current_container}", id="follow-status")

    def on_mount(self):
        """Start log streaming when mounted."""
        import logging

        # Set up file logging
        logging.basicConfig(
            filename='/tmp/loradb-logs-debug.log',
            level=logging.DEBUG,
            format='%(asctime)s - %(message)s'
        )

        logging.info("=== Log viewer on_mount called ===")
        logging.info(f"Instance: {self.instance.name}")
        logging.info(f"Instance ID: {self.instance.instance_id}")
        logging.info(f"Current container: {self.current_container}")

        # Test if log display is working
        try:
            log_display = self.query_one("#log-display", RichLog)
            logging.info("Successfully queried log display widget")

            log_display.write("[bold green]Log viewer initialized![/bold green]")
            log_display.write(f"Instance: {self.instance.name}")
            log_display.write(f"Container: {self.current_container}")
            log_display.write("")
            logging.info("Wrote test messages to log display")
            logging.info(f"Screen mounted status after test write: {self.is_mounted}")
        except Exception as e:
            logging.error(f"Error accessing log display: {e}", exc_info=True)

        logging.info(f"About to schedule log stream start. is_mounted={self.is_mounted}")
        # Defer log stream start until after screen is fully mounted
        self.call_after_refresh(self._start_log_stream)
        logging.info(f"Scheduled _start_log_stream() via call_after_refresh")

    def on_unmount(self):
        """Clean up when screen is unmounted."""
        import logging
        import traceback
        logging.info("=== on_unmount called ===")
        logging.info(f"Stack trace:\n{''.join(traceback.format_stack())}")

        if self._log_worker and self._log_worker.is_running:
            logging.info("Cancelling log worker")
            self._log_worker.cancel()
        logging.info("=== on_unmount finished ===")

    def on_button_pressed(self, event):
        """Handle button presses."""
        import logging
        logging.info(f"Button pressed: {event.button.id}")

        # Control buttons
        if event.button.id == "btn-refresh":
            logging.info("Refresh button pressed")
            self._start_log_stream()
        elif event.button.id == "btn-clear":
            logging.info("Clear button pressed")
            self.action_clear_logs()
        elif event.button.id == "btn-close":
            logging.info("Close button pressed")
            self.action_close()

    def action_close(self):
        """Close logs viewer."""
        self.app.pop_screen()

    def action_clear_logs(self):
        """Clear log display."""
        log_display = self.query_one("#log-display", RichLog)
        log_display.clear()

    def _start_log_stream(self):
        """Start streaming logs from selected container."""
        import logging
        logging.info(f"=== _start_log_stream called. is_mounted={self.is_mounted} ===")

        # Cancel previous worker if running
        if self._log_worker and self._log_worker.is_running:
            logging.info("Cancelling previous worker")
            self._log_worker.cancel()

        self.action_clear_logs()

        # Notify user which container we're streaming from
        self.app.notify(f"Streaming logs from: {self.current_container}", timeout=2)
        logging.info(f"Starting worker for container: {self.current_container}")

        # Start worker to stream logs
        self._log_worker = self.run_worker(
            self._stream_logs_worker(self.current_container),
            exclusive=False
        )
        logging.info(f"Worker started. is_mounted={self.is_mounted}")

    async def _stream_logs_worker(self, container_name: str):
        """
        Background worker to stream logs without blocking UI.

        Args:
            container_name: Name of container to stream from
        """
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        import queue
        import threading
        import logging

        try:
            log_display = self.query_one("#log-display", RichLog)
            logging.info(f"Successfully queried log_display widget in worker: {log_display}")
        except Exception as e:
            logging.error(f"CRITICAL: Failed to query log_display widget in worker: {e}", exc_info=True)
            return

        # Use a queue to communicate between thread and async worker
        log_queue = queue.Queue()
        stop_event = threading.Event()

        def blocking_log_reader():
            """Run blocking log streaming in a separate thread."""
            import logging
            try:
                logging.info(f"blocking_log_reader started for {container_name}")
                log_queue.put(f"[dim]Starting log stream for {container_name}...[/dim]")

                logging.info("Calling docker_manager.stream_logs()")
                line_count = 0
                for line in self.instance_manager.docker_manager.stream_logs(
                    container_name, tail=Config.LOG_TAIL_LINES
                ):
                    if stop_event.is_set():
                        logging.info("Stop event set, breaking")
                        break
                    log_queue.put(line)
                    line_count += 1
                    if line_count <= 5:
                        logging.info(f"Read line {line_count}: {line[:50]}...")

                logging.info(f"Stream ended after {line_count} lines")
                log_queue.put(f"[dim]Log stream ended[/dim]")
            except Exception as e:
                logging.error(f"Exception in blocking_log_reader: {e}", exc_info=True)
                log_queue.put(f"[red]Error streaming logs from {container_name}: {e}[/red]")
                log_queue.put(f"[yellow]Container may not exist or may not be running[/yellow]")
            finally:
                logging.info("blocking_log_reader finished")
                log_queue.put(None)  # Sentinel to signal end

        # Start the blocking reader in a thread
        reader_thread = threading.Thread(target=blocking_log_reader, daemon=True)
        reader_thread.start()

        import logging
        logging.info("Started reader thread, entering processing loop")
        logging.info(f"Initial state - is_mounted: {self.is_mounted}, following: {self.following}")
        logging.info(f"Screen object: {self}, Screen ID: {id(self)}")
        logging.info(f"App: {self.app}, App screen stack size: {len(self.app.screen_stack) if hasattr(self.app, 'screen_stack') else 'N/A'}")

        try:
            # Process log lines from the queue
            lines_processed = 0
            while self.is_mounted and self.following:
                # Check queue without blocking (non-blocking get with try/except)
                try:
                    # Use get_nowait to avoid blocking, then sleep to yield control
                    line = log_queue.get_nowait()

                    if line is None:  # Sentinel value
                        logging.info(f"Received sentinel, ending after {lines_processed} lines")
                        break

                    log_display.write(line.rstrip())
                    lines_processed += 1

                    if lines_processed <= 5:
                        logging.info(f"Wrote line {lines_processed} to display")

                except queue.Empty:
                    # No data yet, yield control and continue
                    await asyncio.sleep(0.05)
                    continue

            logging.info(f"Exited processing loop. is_mounted={self.is_mounted}, following={self.following}")

        except Exception as e:
            logging.error(f"Exception in processing loop: {e}", exc_info=True)
            log_display.write(f"[red]Worker error: {e}[/red]")
        finally:
            # Signal the reader thread to stop
            logging.info("Setting stop event")
            stop_event.set()

    def _update_status(self):
        """Update status bar."""
        status = self.query_one("#follow-status", Static)
        status.update(f"Following: {self.following} | Container: {self.current_container}")
