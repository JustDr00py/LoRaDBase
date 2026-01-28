#!/bin/bash
# Auto-generate device-types index.json
# Run this script whenever you add or remove device type JSON files

DEVICE_TYPES_DIR="./device-types"
INDEX_FILE="$DEVICE_TYPES_DIR/index.json"

echo "Scanning for device type files in $DEVICE_TYPES_DIR..."

# Find all .json files except index.json
device_files=$(find "$DEVICE_TYPES_DIR" -maxdepth 1 -name "*.json" ! -name "index.json" -exec basename {} \; | sort)

# Count files
count=$(echo "$device_files" | wc -l)

if [ -z "$device_files" ]; then
    echo "⚠️  No device type files found!"
    exit 1
fi

echo "Found $count device type file(s):"
echo "$device_files" | sed 's/^/  - /'

# Fix permissions on all device type files (should be 644)
echo ""
echo "Checking and fixing permissions..."
find "$DEVICE_TYPES_DIR" -maxdepth 1 -name "*.json" -exec chmod 644 {} \;
echo "✅ All device type files set to 644 (rw-r--r--)"

# Generate index.json
cat > "$INDEX_FILE" << EOF
{
  "deviceTypes": [
$(echo "$device_files" | sed 's/.*/"&"/' | sed '$!s/$/,/' | sed 's/^/    /')
  ],
  "version": "1.0.0",
  "lastUpdated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo ""
echo "✅ Generated $INDEX_FILE"
echo ""
echo "Next steps:"
echo "  1. docker compose restart frontend"
echo "  2. Refresh your browser"
