#!/bin/bash
# LoRaDB Manager launcher script
# This script automatically sets up the environment and runs the application

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VENV_DIR="$SCRIPT_DIR/venv"
REQUIREMENTS_FILE="$SCRIPT_DIR/requirements.txt"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if venv exists
if [ ! -d "$VENV_DIR" ]; then
    echo -e "${YELLOW}Virtual environment not found. Creating...${NC}"
    python3 -m venv "$VENV_DIR"
    echo -e "${GREEN}Virtual environment created.${NC}"
fi

# Activate venv
source "$VENV_DIR/bin/activate"

# Check if requirements need to be installed
if [ -f "$REQUIREMENTS_FILE" ]; then
    # Check if requirements are already installed by looking for a marker file
    MARKER_FILE="$VENV_DIR/.requirements_installed"

    if [ ! -f "$MARKER_FILE" ] || [ "$REQUIREMENTS_FILE" -nt "$MARKER_FILE" ]; then
        echo -e "${YELLOW}Installing/updating dependencies...${NC}"
        pip install -q --upgrade pip
        pip install -q -r "$REQUIREMENTS_FILE"
        touch "$MARKER_FILE"
        echo -e "${GREEN}Dependencies installed.${NC}"
    fi
fi

# Run the application
echo -e "${GREEN}Starting LoRaDB Manager...${NC}"
python -m loradb_manager.main "$@"
