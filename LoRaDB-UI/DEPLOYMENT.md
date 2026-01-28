# Deployment Guide

This guide explains how to deploy LoRaDB-UI using pre-built Docker images from GitHub Container Registry (GHCR).

## Table of Contents

- [Quick Start](#quick-start)
- [GitHub Actions Setup](#github-actions-setup)
- [Production Deployment](#production-deployment)
- [Versioning and Tagging](#versioning-and-tagging)
- [Rolling Back](#rolling-back)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Using Pre-Built Images

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/loradb-ui.git
   cd loradb-ui
   ```

2. **Create environment file:**
   ```bash
   cp .env.ghcr.example .env
   ```

3. **Edit `.env` file:**
   ```bash
   nano .env
   ```

   Update these required values:
   - `GITHUB_REPOSITORY` - Your GitHub repository (e.g., `yourusername/loradb-ui`)
   - `JWT_SECRET` - Minimum 32 characters (generate with: `openssl rand -base64 32`)
   - `CORS_ORIGIN` - Your frontend URL (e.g., `http://your-server-ip:3000`)

4. **Start the services:**
   ```bash
   docker compose -f docker-compose.ghcr.yml up -d
   ```

5. **Check logs:**
   ```bash
   docker compose -f docker-compose.ghcr.yml logs -f
   ```

6. **Access the UI:**
   - Frontend: `http://your-server-ip:3000`
   - Backend API: `http://your-server-ip:3001`

---

## GitHub Actions Setup

### 1. Enable GitHub Container Registry

GHCR is automatically available for all GitHub repositories. No additional setup required!

### 2. Configure Repository Settings

The GitHub Actions workflow uses `GITHUB_TOKEN` which is automatically provided. No secrets configuration needed!

### 3. Trigger Builds

Images are automatically built and pushed on:

- **Push to `main` branch** → Tags: `latest`, `main-<sha>`
- **Create a tag `v*.*.*`** → Tags: `v1.0.0`, `v1.0`, `v1`, `latest`
- **Pull requests** → Build only (no push)
- **Manual trigger** → Via GitHub Actions UI

#### Creating a Release

```bash
# Tag a release
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# GitHub Actions will automatically:
# 1. Build both images
# 2. Push to ghcr.io with tags:
#    - v1.0.0
#    - v1.0
#    - v1
#    - latest
```

### 4. Make Images Public (Optional)

By default, GHCR images are private. To make them public:

1. Go to your repository on GitHub
2. Click "Packages" on the right sidebar
3. Click on the package (backend or frontend)
4. Click "Package settings"
5. Scroll to "Danger Zone"
6. Click "Change visibility" → Select "Public"
7. Repeat for both backend and frontend packages

---

## Production Deployment

### Prerequisites

- Docker and Docker Compose installed
- Network access to pull from ghcr.io
- Firewall ports 3000 and 3001 open

### Step-by-Step Deployment

#### 1. Prepare the Server

```bash
# Create deployment directory
sudo mkdir -p /opt/loradb-ui
cd /opt/loradb-ui

# Download docker-compose file
curl -O https://raw.githubusercontent.com/yourusername/loradb-ui/main/docker-compose.ghcr.yml

# Download device-types directory (optional but recommended)
git clone --depth 1 --no-checkout https://github.com/yourusername/loradb-ui.git temp
cd temp
git sparse-checkout set device-types
git checkout
mv device-types /opt/loradb-ui/
cd /opt/loradb-ui
rm -rf temp
```

#### 2. Create Environment File

```bash
cat > .env << 'EOF'
GITHUB_REPOSITORY=yourusername/loradb-ui
IMAGE_TAG=latest
JWT_SECRET=$(openssl rand -base64 32)
BACKEND_PORT=3001
FRONTEND_PORT=3000
CORS_ORIGIN=http://your-server-ip:3000
MASTER_PASSWORD=your-secure-password
BACKUP_ENABLED=true
EOF
```

#### 3. Pull and Start

```bash
# Pull latest images
docker compose -f docker-compose.ghcr.yml pull

# Start services
docker compose -f docker-compose.ghcr.yml up -d

# View logs
docker compose -f docker-compose.ghcr.yml logs -f
```

#### 4. Verify Deployment

```bash
# Check container status
docker compose -f docker-compose.ghcr.yml ps

# Check backend health
curl http://localhost:3001/

# Check frontend
curl http://localhost:3000/
```

### Setting Up Systemd Service (Optional)

Create `/etc/systemd/system/loradb-ui.service`:

```ini
[Unit]
Description=LoRaDB UI
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/loradb-ui
ExecStart=/usr/bin/docker compose -f docker-compose.ghcr.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.ghcr.yml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable loradb-ui
sudo systemctl start loradb-ui
sudo systemctl status loradb-ui
```

---

## Versioning and Tagging

### Semantic Versioning

We use [Semantic Versioning](https://semver.org/): `vMAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes

### Available Tags

For each release (e.g., `v1.2.3`), the following tags are created:

- `v1.2.3` - Exact version
- `v1.2` - Latest patch in 1.2.x series
- `v1` - Latest minor in 1.x series
- `latest` - Latest stable release
- `main` - Latest commit on main branch (unstable)

### Using Specific Versions

In your `.env` file:

```bash
# Use latest stable
IMAGE_TAG=latest

# Use specific version
IMAGE_TAG=v1.2.3

# Use latest 1.x
IMAGE_TAG=v1

# Use main branch (development)
IMAGE_TAG=main
```

---

## Updating

### Update to Latest Version

```bash
cd /opt/loradb-ui

# Update .env if needed (change IMAGE_TAG)
nano .env

# Pull new images
docker compose -f docker-compose.ghcr.yml pull

# Recreate containers
docker compose -f docker-compose.ghcr.yml up -d

# Check logs
docker compose -f docker-compose.ghcr.yml logs -f
```

### Zero-Downtime Updates

```bash
# Pull new images first
docker compose -f docker-compose.ghcr.yml pull

# Recreate with minimal downtime
docker compose -f docker-compose.ghcr.yml up -d --no-deps --build
```

---

## Rolling Back

### Rollback to Previous Version

```bash
# Stop current version
docker compose -f docker-compose.ghcr.yml down

# Edit .env to use previous version
nano .env
# Change: IMAGE_TAG=v1.0.0

# Start previous version
docker compose -f docker-compose.ghcr.yml up -d
```

### Rollback Database

```bash
# Stop services
docker compose -f docker-compose.ghcr.yml down

# Restore database from backup
docker run --rm -v loradb-ui_loradb-ui-data:/data -v $(pwd):/backup \
  alpine sh -c "cd /data && cp servers.db.backup.* servers.db"

# Start services
docker compose -f docker-compose.ghcr.yml up -d
```

---

## Troubleshooting

### Images Won't Pull

**Error**: `Error response from daemon: unauthorized`

**Solution**: Images are private. Either:

1. Make packages public on GitHub (see above)
2. Authenticate with GHCR:
   ```bash
   echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
   ```

### Wrong Repository Name

**Error**: `Error response from daemon: manifest unknown`

**Solution**: Check `GITHUB_REPOSITORY` in `.env`:
```bash
# Should match your GitHub repo exactly
GITHUB_REPOSITORY=yourusername/loradb-ui
```

### Database Migration Issues

If you see database errors after an update:

```bash
# View backend logs
docker compose -f docker-compose.ghcr.yml logs backend

# Database is automatically backed up before migrations
# Check for migration messages in logs
```

### Port Conflicts

If ports 3000 or 3001 are already in use:

```bash
# Change ports in .env
BACKEND_PORT=8001
FRONTEND_PORT=8000

# Recreate containers
docker compose -f docker-compose.ghcr.yml up -d --force-recreate
```

---

## Monitoring

### View Logs

```bash
# All services
docker compose -f docker-compose.ghcr.yml logs -f

# Backend only
docker compose -f docker-compose.ghcr.yml logs -f backend

# Frontend only
docker compose -f docker-compose.ghcr.yml logs -f frontend

# Last 100 lines
docker compose -f docker-compose.ghcr.yml logs --tail=100
```

### Check Resource Usage

```bash
docker stats loradb-ui-backend loradb-ui-frontend
```

### Health Checks

```bash
# Backend health
curl http://localhost:3001/

# Container health status
docker compose -f docker-compose.ghcr.yml ps
```

---

## Backup Strategy

### Automatic Backups

Automatic backups are enabled by default (configured in `.env`):
- Schedule: Daily at 2 AM
- Retention: 7 days
- Location: `/app/data/backups` in backend container

### Manual Backup

```bash
# Export backup via API (requires master password)
curl -X POST http://localhost:3001/api/backup/export \
  -H "Authorization: Bearer YOUR_MASTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"includeDeviceTypes": true, "saveAutomatic": false}' \
  -o backup-$(date +%Y%m%d).json

# Or use the UI: Server Management → Backup & Restore → Export Backup
```

### Docker Volume Backup

```bash
# Backup entire Docker volume
docker run --rm -v loradb-ui_loradb-ui-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/loradb-data-backup-$(date +%Y%m%d).tar.gz /data

# Restore volume
docker run --rm -v loradb-ui_loradb-ui-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/loradb-data-backup-YYYYMMDD.tar.gz -C /
```

---

## Development vs Production

### Development (Local Build)

Use `docker-compose.yml` for local development:

```bash
# Builds images locally from source
docker compose up -d
```

### Production (Pre-Built Images)

Use `docker-compose.ghcr.yml` for production:

```bash
# Pulls pre-built images from GHCR
docker compose -f docker-compose.ghcr.yml up -d
```

---

## Additional Resources

- [GitHub Container Registry Documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [LoRaDB-UI GitHub Repository](https://github.com/yourusername/loradb-ui)

---

## Support

For issues and questions:
- GitHub Issues: https://github.com/yourusername/loradb-ui/issues
- Documentation: https://github.com/yourusername/loradb-ui/blob/main/README.md
