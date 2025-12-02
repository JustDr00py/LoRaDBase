#!/bin/bash
set -e

echo "==================================="
echo "LoRaDB Initial Deployment Script"
echo "==================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo -e "${YELLOW}Please edit .env with your configuration before proceeding!${NC}"
    echo "Press Enter when ready to continue, or Ctrl+C to exit..."
    read
fi

# Validate critical env vars
echo "Validating configuration..."
source .env

if [ -z "$LORADB_STORAGE_DATA_DIR" ]; then
    echo -e "${RED}Error: LORADB_STORAGE_DATA_DIR not set in .env${NC}"
    exit 1
fi

if [ -z "$LORADB_API_JWT_SECRET" ] || [ "$LORADB_API_JWT_SECRET" == "change-this-to-a-secure-32-character-secret-key!!!" ]; then
    echo -e "${RED}Error: Please set a secure LORADB_API_JWT_SECRET in .env${NC}"
    echo "Generate one with: openssl rand -base64 32"
    exit 1
fi

echo -e "${GREEN}✓${NC} Configuration validated"
echo ""

# Build the Docker image
echo "Building LoRaDB Docker image..."
docker compose build --no-cache

echo -e "${GREEN}✓${NC} Build complete"
echo ""

# Create volumes
echo "Creating Docker volumes..."
docker volume create loradb_loradb-data || true

echo -e "${GREEN}✓${NC} Volumes created"
echo ""

# Start services
echo "Starting LoRaDB..."
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
fi

echo ""
echo "Checking logs..."
docker compose logs --tail=20 loradb

echo ""
echo "==================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "==================================="
echo ""
echo "Next steps:"
echo "1. Generate an admin JWT token:"
echo "   docker compose exec loradb generate-token admin"
echo ""
echo "2. Or generate a long-lived API token:"
echo "   docker compose exec loradb generate-api-token /var/lib/loradb/data admin 'Production' 365"
echo ""
echo "3. Check status:"
echo "   docker compose ps"
echo "   docker compose logs -f loradb"
echo ""
echo "4. Test the API:"
echo "   curl -k https://localhost:${LORADB_API_PORT:-8443}/health"
echo ""
