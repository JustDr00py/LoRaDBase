#!/bin/bash

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper script for common LoRaDB operations

show_help() {
    echo "LoRaDB Management Script"
    echo ""
    echo "Usage: ./loradb.sh <command>"
    echo ""
    echo "Commands:"
    echo "  status              - Show service status"
    echo "  logs                - Follow logs"
    echo "  logs-tail <n>       - Show last n lines of logs"
    echo "  restart             - Restart LoRaDB"
    echo "  stop                - Stop LoRaDB"
    echo "  start               - Start LoRaDB"
    echo "  token <user>        - Generate JWT token (1 hour)"
    echo "  apitoken <user> <name> [days]  - Generate API token"
    echo "  list-tokens         - List API tokens"
    echo "  shell               - Open shell in container"
    echo "  health              - Check health endpoint"
    echo "  data-dir            - Show data directory path"
    echo "  backup              - Create backup of data"
    echo "  clean-wal           - Clean WAL (WARNING: loses uncommitted data)"
    echo ""
}

case "$1" in
    status)
        docker compose ps
        ;;
    logs)
        docker compose logs -f loradb
        ;;
    logs-tail)
        lines=${2:-50}
        docker compose logs --tail=$lines loradb
        ;;
    restart)
        echo "Restarting LoRaDB..."
        docker compose restart loradb
        docker compose logs --tail=20 loradb
        ;;
    stop)
        echo "Stopping LoRaDB..."
        docker compose down
        ;;
    start)
        echo "Starting LoRaDB..."
        docker compose up -d
        docker compose logs --tail=20 loradb
        ;;
    token)
        if [ -z "$2" ]; then
            echo "Usage: ./loradb.sh token <username>"
            exit 1
        fi
        echo "Generating JWT token (expires in 1 hour)..."
        docker compose exec loradb generate-token "$2"
        ;;
    apitoken)
        if [ -z "$2" ] || [ -z "$3" ]; then
            echo "Usage: ./loradb.sh apitoken <username> <token_name> [expiration_days]"
            echo "Example: ./loradb.sh apitoken admin 'Production Dashboard' 365"
            exit 1
        fi
        days=${4:-365}
        echo "Generating API token (expires in $days days)..."
        docker compose exec loradb generate-api-token /var/lib/loradb/data "$2" "$3" "$days"
        ;;
    list-tokens)
        echo "API tokens stored in:"
        docker compose exec loradb cat /var/lib/loradb/data/api_tokens.json
        ;;
    shell)
        docker compose exec loradb /bin/sh
        ;;
    health)
        echo "Checking health endpoint..."
        source .env 2>/dev/null || true
        port=${LORADB_API_PORT:-8443}
        curl -k -s "https://localhost:$port/health" | jq '.' || echo "Failed to connect"
        ;;
    data-dir)
        echo "Data directory contents:"
        docker compose exec loradb ls -lah /var/lib/loradb/data/
        ;;
    backup)
        backup_name="loradb_backup_$(date +%Y%m%d_%H%M%S).tar.gz"
        echo "Creating backup: $backup_name"
        docker compose exec loradb tar -czf /tmp/backup.tar.gz -C /var/lib/loradb/data .
        docker compose cp loradb:/tmp/backup.tar.gz "./$backup_name"
        docker compose exec loradb rm /tmp/backup.tar.gz
        echo -e "${GREEN}✓${NC} Backup created: $backup_name"
        ;;
    clean-wal)
        echo -e "${YELLOW}WARNING: This will delete the WAL and lose uncommitted data!${NC}"
        read -p "Are you sure? (type 'yes' to confirm): " confirm
        if [ "$confirm" == "yes" ]; then
            docker compose exec loradb rm -rf /var/lib/loradb/data/wal/*
            docker compose restart loradb
            echo -e "${GREEN}✓${NC} WAL cleaned and service restarted"
        else
            echo "Cancelled"
        fi
        ;;
    *)
        show_help
        exit 1
        ;;
esac
