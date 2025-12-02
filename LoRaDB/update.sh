#!/bin/bash
set -e

echo "==================================="
echo "LoRaDB Update Script"
echo "==================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if running in git repo
if [ ! -d .git ]; then
    echo -e "${RED}Error: Not a git repository${NC}"
    exit 1
fi

# Show current version
echo "Current commit:"
git log -1 --oneline
echo ""

# Pull latest changes
echo "Pulling latest changes from git..."
git fetch origin

# Check if there are updates
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [ "$LOCAL" = "$REMOTE" ]; then
    echo -e "${YELLOW}Already up to date.${NC}"
    echo ""
    read -p "Rebuild anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi
else
    echo -e "${BLUE}Updates available:${NC}"
    git log --oneline HEAD..origin/main
    echo ""

    read -p "Apply updates and rebuild? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Cancelled."
        exit 0
    fi

    # Pull changes
    git pull origin main
    echo -e "${GREEN}✓${NC} Code updated"
    echo ""
fi

# Check for .env updates
if git diff HEAD@{1} HEAD --name-only | grep -q ".env.example"; then
    echo -e "${YELLOW}Warning: .env.example was updated${NC}"
    echo "Please review and update your .env file if needed"
    echo ""
    read -p "Press Enter to continue..."
fi

# Stop current containers
echo "Stopping LoRaDB containers..."
docker compose down

echo -e "${GREEN}✓${NC} Containers stopped"
echo ""

# Rebuild Docker image
echo "Rebuilding Docker image..."
docker compose build

echo -e "${GREEN}✓${NC} Build complete"
echo ""

# Start updated services
echo "Starting updated LoRaDB..."
docker compose up -d

echo -e "${GREEN}✓${NC} LoRaDB started"
echo ""

# Wait for service to be healthy
echo "Waiting for LoRaDB to become healthy..."
timeout=60
elapsed=0
while [ $elapsed -lt $timeout ]; do
    if docker compose ps | grep -q "healthy"; then
        echo -e "${GREEN}✓${NC} LoRaDB is healthy!"
        break
    fi
    sleep 2
    elapsed=$((elapsed + 2))
    echo -n "."
done

if [ $elapsed -ge $timeout ]; then
    echo -e "${RED}Warning: Health check timed out${NC}"
    echo "Check logs with: docker compose logs loradb"
fi

echo ""
echo "Recent logs:"
docker compose logs --tail=30 loradb

echo ""
echo "==================================="
echo -e "${GREEN}Update Complete!${NC}"
echo "==================================="
echo ""
echo "New version:"
git log -1 --oneline
echo ""
echo "Useful commands:"
echo "  docker compose logs -f loradb  # Follow logs"
echo "  docker compose ps              # Check status"
echo "  docker compose restart loradb  # Restart service"
echo ""
