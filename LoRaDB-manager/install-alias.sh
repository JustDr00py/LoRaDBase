#!/bin/bash
# This script adds a convenient alias to your shell configuration
# After running this, you can just type "loradb" from anywhere to start the manager

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ALIAS_CMD="alias loradb='$SCRIPT_DIR/run.sh'"

# Detect shell config file
if [ -n "$ZSH_VERSION" ]; then
    CONFIG_FILE="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    CONFIG_FILE="$HOME/.bashrc"
else
    echo "Unknown shell. Please add this line manually to your shell config:"
    echo "$ALIAS_CMD"
    exit 1
fi

# Check if alias already exists
if grep -q "alias loradb=" "$CONFIG_FILE" 2>/dev/null; then
    echo "Alias 'loradb' already exists in $CONFIG_FILE"
    echo "Current alias:"
    grep "alias loradb=" "$CONFIG_FILE"
    echo ""
    read -p "Do you want to replace it? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
    # Remove old alias
    sed -i '/alias loradb=/d' "$CONFIG_FILE"
fi

# Add new alias
echo "" >> "$CONFIG_FILE"
echo "# LoRaDB Manager alias" >> "$CONFIG_FILE"
echo "$ALIAS_CMD" >> "$CONFIG_FILE"

echo "✓ Alias added to $CONFIG_FILE"
echo ""
echo "To use it now, run:"
echo "  source $CONFIG_FILE"
echo ""
echo "After that, you can start LoRaDB Manager from anywhere by typing:"
echo "  loradb"
