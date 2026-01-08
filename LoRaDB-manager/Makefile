.PHONY: install run clean dev help

VENV_DIR = venv
PYTHON = $(VENV_DIR)/bin/python
PIP = $(VENV_DIR)/bin/pip

help:
	@echo "LoRaDB Manager - Available commands:"
	@echo ""
	@echo "  make install    - Install the package in development mode"
	@echo "  make run        - Run the application (auto-installs if needed)"
	@echo "  make dev        - Install with development dependencies"
	@echo "  make clean      - Remove virtual environment and cache files"
	@echo "  make help       - Show this help message"
	@echo ""
	@echo "Quick start:"
	@echo "  1. First time:  make install"
	@echo "  2. Then run:    make run"
	@echo "  OR just:        make run  (does everything automatically)"
	@echo ""
	@echo "After installation, you can also run directly:"
	@echo "  ./run.sh        (simple script)"
	@echo "  loradb-manager  (if installed in venv and activated)"

$(VENV_DIR)/bin/activate:
	@echo "Creating virtual environment..."
	python3 -m venv $(VENV_DIR)
	$(PIP) install --upgrade pip

install: $(VENV_DIR)/bin/activate
	@echo "Installing loradb-manager..."
	$(PIP) install -e .
	@echo ""
	@echo "Installation complete! You can now run:"
	@echo "  make run"
	@echo "  ./run.sh"
	@echo "  source venv/bin/activate && loradb-manager"

dev: $(VENV_DIR)/bin/activate
	@echo "Installing with development dependencies..."
	$(PIP) install -e ".[dev]"
	@echo "Development installation complete!"

run: $(VENV_DIR)/bin/activate
	@if [ ! -f $(VENV_DIR)/.installed ]; then \
		echo "First run detected, installing package..."; \
		$(PIP) install -e . && touch $(VENV_DIR)/.installed; \
	fi
	@$(PYTHON) -m loradb_manager.main

clean:
	@echo "Cleaning up..."
	rm -rf $(VENV_DIR)
	rm -rf *.egg-info
	rm -rf build dist
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	@echo "Clean complete!"
