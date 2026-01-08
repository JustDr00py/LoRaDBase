# LoRaDB Deployment Guide

This guide covers deploying and managing LoRaDB using the provided scripts.

## Prerequisites

- Docker and Docker Compose installed
- Git installed
- Port 8443 available (or configure different port in .env)

## Initial Deployment

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/LoRaDB.git
cd LoRaDB
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

**Required settings:**
- `LORADB_API_JWT_SECRET` - Set to a secure 32+ character string
  ```bash
  openssl rand -base64 32
  ```
- `LORADB_TLS_CERT_PATH` - Path to TLS certificate
- `LORADB_TLS_KEY_PATH` - Path to TLS private key

### 3. Run Deployment Script

```bash
./deploy.sh
```

This will:
- Validate configuration
- Build Docker image
- Create volumes
- Start LoRaDB
- Wait for health check
- Display next steps

### 4. Generate Authentication Tokens

**Option A: JWT Token (short-lived, 1 hour)**
```bash
./loradb.sh token admin
```

**Option B: API Token (long-lived, for dashboards)**
```bash
./loradb.sh apitoken admin "Production Dashboard" 365
```

## Updating LoRaDB

When new code is pushed to the repository:

```bash
./update.sh
```

This will:
- Pull latest changes from git
- Show what's new
- Rebuild Docker image
- Restart with zero downtime for data
- Verify health

## Daily Management

Use the helper script for common operations:

```bash
./loradb.sh <command>
```

### Common Commands

**View logs:**
```bash
./loradb.sh logs              # Follow logs
./loradb.sh logs-tail 100     # Last 100 lines
```

**Service management:**
```bash
./loradb.sh status            # Check status
./loradb.sh restart           # Restart service
./loradb.sh stop              # Stop service
./loradb.sh start             # Start service
```

**Token management:**
```bash
./loradb.sh token admin                              # Generate JWT
./loradb.sh apitoken admin "My App" 365              # Generate API token
./loradb.sh list-tokens                              # List all tokens
```

**Troubleshooting:**
```bash
./loradb.sh health            # Check health endpoint
./loradb.sh data-dir          # View data directory
./loradb.sh shell             # Open shell in container
```

**Backup:**
```bash
./loradb.sh backup            # Create backup of data
```

## Troubleshooting

### WAL Deserialization Errors

If you see errors like "Failed to deserialize frame from WAL" after a rebuild:

**Symptoms:**
- Logs show "Recovered 0 frames from WAL"
- Old data not visible after restart

**Solution 1: Wait for new WAL format** (Recommended)
The new code includes WAL versioning. New writes will use the new format and be recoverable.

**Solution 2: Clean WAL** (loses uncommitted data in WAL)
```bash
./loradb.sh clean-wal
```

This will:
- Delete old WAL files
- Restart service
- Start with fresh WAL (versioned format)

**Note:** Data in SSTables (flushed data) is preserved. Only WAL data is lost.

### SSTable Deserialization Errors

If you see warnings like "Skipping SSTable with incompatible version 1" in logs:

**Symptoms:**
- Warnings in logs about incompatible SSTable versions
- Queries may return incomplete data
- Old historical data temporarily inaccessible

**What's Happening:**
- LoRaDB v2 introduced bincode compatibility fixes for the Frame serialization format
- Old SSTable files (version 1) cannot be deserialized with the new format
- The system automatically skips incompatible SSTables and continues operation

**Solution: Wait for Natural Data Rotation** (Recommended)
- New data is written in version 2 format and queries work normally
- Old version 1 SSTables are preserved on disk but skipped during queries
- As new data arrives, old SSTables naturally age out based on retention policies
- No manual intervention required

**Alternative: Manual Cleanup** (permanent data loss)
If you want to immediately clear old incompatible SSTables:
```bash
# WARNING: This permanently deletes all historical SSTable data
docker compose exec loradb sh -c "rm -f /app/data/*.sst"
docker compose restart loradb
```

**Note:** WAL and memtable data is preserved. Only SSTable data is affected.

### Check Logs for Issues

```bash
./loradb.sh logs-tail 100 | grep -iE "error|warn|failed"
```

### Verify Data Persistence

```bash
./loradb.sh data-dir
```

Should show:
- `wal/` directory with WAL files
- `*.sst` files (SSTables, if memtable has been flushed)
- `api_tokens.json` file

### Health Check Failing

```bash
./loradb.sh health
```

If this fails:
1. Check if service is running: `docker compose ps`
2. Check logs: `./loradb.sh logs`
3. Verify port is not blocked by firewall
4. Check TLS certificate paths in .env

## Production Deployment Recommendations

### 1. Use Reverse Proxy

LoRaDB's built-in TLS is basic. Use a reverse proxy in production:

**Caddy (automatic HTTPS):**
```caddy
loradb.yourdomain.com {
    reverse_proxy localhost:8443 {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

**nginx:**
```nginx
server {
    listen 443 ssl http2;
    server_name loradb.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass https://localhost:8443;
        proxy_ssl_verify off;
    }
}
```

### 2. Set Up Monitoring

Monitor these metrics:
- Container health: `docker compose ps`
- API health endpoint: `/health`
- WAL size: Should flush periodically
- SSTable count: Should compact periodically
- Memory usage: `docker stats loradb`

### 3. Regular Backups

Add to cron:
```bash
0 2 * * * cd /path/to/LoRaDB && ./loradb.sh backup
```

### 4. Log Rotation

Logs are automatically rotated (max 3 files, 10MB each) as configured in docker-compose.yml.

### 5. Resource Limits

Current limits (adjust in docker-compose.yml):
- CPU: 2 cores max, 0.5 reserved
- Memory: 2GB max, 512MB reserved

## Upgrading Workflow

1. **Test in staging:**
   ```bash
   git checkout -b test-update
   git pull origin main
   ./update.sh
   # Test thoroughly
   ```

2. **Apply to production:**
   ```bash
   git checkout main
   ./update.sh
   ```

3. **Rollback if needed:**
   ```bash
   git log  # Find previous commit
   git checkout <previous-commit>
   ./update.sh
   ```

## Data Location

All persistent data is stored in Docker volume: `loradb_loradb-data`

**To find physical location:**
```bash
docker volume inspect loradb_loradb-data | grep Mountpoint
```

**Typical path:** `/var/lib/docker/volumes/loradb_loradb-data/_data/`

## Security Checklist

- [ ] JWT secret is 32+ random characters
- [ ] TLS certificates are valid
- [ ] Reverse proxy is configured (production)
- [ ] Firewall rules limit API access
- [ ] API tokens are rotated periodically
- [ ] Backups are tested and stored securely
- [ ] .env file is not committed to git
- [ ] Docker daemon is up to date

## Support

- Check logs first: `./loradb.sh logs`
- Review API_TOKEN_GUIDE.md for token management
- Review CLAUDE.md for architecture details
- Check GitHub issues: https://github.com/yourusername/LoRaDB/issues
