# LoRaDB Web UI

A web-based user interface for managing LoRaDB tokens and executing queries. Built with React (frontend) and Node.js/Express (backend).

## Features

- **Server Management**: Multi-server configuration with encrypted credentials storage
- **Master Password Protection**: Optional security layer for server management operations
- **Backup & Restore**: Comprehensive backup system with automatic daily backups and migration support
- **Token Management**: Generate JWT tokens with custom expiration times
- **Device Management**: View all registered LoRaWAN devices with last activity
- **Query Builder**: Visual query builder for LoRaDB's query DSL
- **Query Editor**: Raw query editor with syntax examples
- **Real-time Results**: Execute queries and view results in tables
- **Remote Access**: Deploy on a separate machine and connect remotely
- **Retention Policies**: Configure automatic data deletion policies

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  React Frontend │────▶│  Node.js Backend │────▶│   LoRaDB     │
│  (nginx:3000)   │     │  (Express:3001)  │     │  API Server  │
└─────────────────┘     └──────────────────┘     └──────────────┘
```

- **Frontend**: React 18 with TypeScript, served by nginx
- **Backend**: Node.js Express API that proxies requests to LoRaDB and generates tokens
- **Deployment**: Docker Compose for easy multi-container deployment

## Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Running LoRaDB instance (on any accessible network)
- Network connectivity to LoRaDB API (HTTP/HTTPS)
- Matching JWT secret between UI and LoRaDB

## Installation & Setup

### 1. Clone or Copy the Repository

```bash
# If part of LoRaDB repo, navigate to loradb-ui directory
cd /path/to/loradb-ui
```

### 2. Configure Environment Variables

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your configuration
nano .env
```

**Required Configuration:**

```bash
# Must match your LoRaDB JWT secret (CRITICAL - must be identical!)
JWT_SECRET=your-32-character-secret-key-here!!!

# URL to your LoRaDB API
# Use the public IP or domain where LoRaDB is accessible
# Examples:
#   - Same network: http://192.168.1.100:8080
#   - Internet: https://loradb.yourdomain.com
#   - VPN: http://10.0.0.50:8080
LORADB_API_URL=http://YOUR_LORADB_SERVER_IP:8080

# Ports (change if needed)
FRONTEND_PORT=3000
BACKEND_PORT=3001
```

**For Remote Access (accessing UI from different computer):**

```bash
# If you'll access the UI from a different computer, set:
VITE_API_URL=http://YOUR_UI_SERVER_IP:3001
CORS_ORIGIN=http://YOUR_UI_SERVER_IP:3000

# Example:
VITE_API_URL=http://192.168.1.200:3001
CORS_ORIGIN=http://192.168.1.200:3000
```

### 3. Start the Services

```bash
# Build and start both frontend and backend
docker-compose up -d

# View logs
docker-compose logs -f

# Check service status
docker-compose ps
```

### 4. Access the UI

Open your browser and navigate to:
- **Local**: `http://localhost:3000`
- **Remote**: `http://<your-ui-server-ip>:3000`

## Remote Deployment Setup

Since the UI runs on a **separate computer** from LoRaDB, follow these additional steps:

### Network Requirements

1. **LoRaDB Server must be accessible** from the UI server:
   - Port 8080 (HTTP) or 8443 (HTTPS) must be open on LoRaDB server
   - Test connectivity: `curl http://LORADB_SERVER_IP:8080/health`

2. **UI must be accessible** from your browser:
   - Port 3000 (frontend) and 3001 (backend) must be open on UI server
   - Configure firewall if needed:
     ```bash
     sudo ufw allow 3000/tcp
     sudo ufw allow 3001/tcp
     ```

### Configuration for Remote Deployment

**On the UI Server**, edit `/path/to/loradb-ui/.env`:

```bash
# ============================================================================
# Example Configuration for Remote Deployment
# ============================================================================

# Backend connects to LoRaDB on different server/network
LORADB_API_URL=http://192.168.1.100:8080  # Replace with your LoRaDB server IP
# Or if using domain: https://loradb.example.com

# JWT Secret - MUST match LoRaDB server exactly!
# Get this from your LoRaDB server's .env file
JWT_SECRET=the-exact-same-secret-as-loradb-server

# Ports on UI server
BACKEND_PORT=3001
FRONTEND_PORT=3000

# For browsers accessing from remote computers
# Replace with the UI server's IP address
VITE_API_URL=http://192.168.1.200:3001
CORS_ORIGIN=http://192.168.1.200:3000
```

### Step-by-Step Remote Setup

**1. Get LoRaDB Server Information:**

On your LoRaDB server, find its IP and JWT secret:
```bash
# Find server IP
hostname -I

# Get JWT secret
docker exec loradb env | grep JWT_SECRET
# or if running natively:
grep JWT_SECRET /path/to/loradb/.env
```

**2. On UI Server, Configure:**

```bash
cd /path/to/loradb-ui
cp .env.example .env
nano .env

# Set these values:
# - LORADB_API_URL: http://<loradb-server-ip>:8080
# - JWT_SECRET: <copy from LoRaDB server>
# - VITE_API_URL: http://<ui-server-ip>:3001
# - CORS_ORIGIN: http://<ui-server-ip>:3000
```

**3. Test Connectivity:**

From the UI server, test connection to LoRaDB:
```bash
# Test if LoRaDB is reachable
curl http://LORADB_SERVER_IP:8080/health

# Should return: {"status":"ok","version":"0.1.0"}
```

**4. Start UI Services:**

```bash
docker compose up -d
```

**5. Access from Your Computer:**

Open browser and go to:
```
http://UI_SERVER_IP:3000
```

### Example Network Topology

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   LoRaDB Server         │         │   UI Server             │
│   192.168.1.100         │◄───────►│   192.168.1.200         │
│                         │  HTTP   │                         │
│   Port 8080 (API)       │   or    │   Port 3000 (Frontend)  │
│   MQTT: 8883            │  HTTPS  │   Port 3001 (Backend)   │
└─────────────────────────┘         └─────────────────────────┘
            ▲                                   ▲
            │                                   │
            │ LoRaWAN                          │ Web Browser
            │ Traffic                          │ (Your Computer)
            │                                   │
     ┌──────┴──────┐                   ┌───────┴────────┐
     │   Gateway   │                   │ Any Computer   │
     │  Network    │                   │ on Network     │
     └─────────────┘                   └────────────────┘
```

### Troubleshooting Remote Connection

**Backend can't reach LoRaDB:**
```bash
# Check from UI server
curl http://LORADB_SERVER_IP:8080/health

# If it fails:
# 1. Check LoRaDB is running: docker ps | grep loradb
# 2. Check firewall on LoRaDB server
# 3. Verify IP address is correct
# 4. Try telnet: telnet LORADB_SERVER_IP 8080
```

**Frontend can't reach backend:**
```bash
# Check from your browser's computer
curl http://UI_SERVER_IP:3001/

# Should return: {"name":"LoRaDB UI Backend","version":"1.0.0","status":"running"}

# If it fails:
# 1. Check backend is running: docker ps | grep loradb-ui-backend
# 2. Check firewall on UI server
# 3. Verify VITE_API_URL in .env matches UI server IP
```

**JWT Authentication Fails:**
```bash
# Compare secrets on both servers
# On LoRaDB server:
docker exec loradb env | grep JWT_SECRET

# On UI server:
docker exec loradb-ui-backend env | grep JWT_SECRET

# They MUST be identical!
```

## Usage

### Login

1. Open the UI in your browser
2. Enter a username
3. Set token expiration (default: 1 hour)
4. Click "Generate Token & Login"

### View Devices

1. Navigate to "Devices" in the sidebar
2. View all registered LoRaWAN devices
3. See device EUI, name, application ID, and last activity
4. Click "Query" button to quickly query a specific device

### Execute Queries

#### Using Query Builder:
1. Navigate to "Query" in the sidebar
2. Select a device from the dropdown
3. Choose frame type (all, uplink, downlink, join, decoded_payload)
4. Select time range:
   - **Last**: Last X hours/days/minutes
   - **Since**: Since a specific date
   - **Between**: Date range
   - **None**: No time filter
5. Click "Execute Query"

#### Using Query Editor:
1. Click "Switch to Editor"
2. Enter a raw query:
   ```sql
   SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'
   ```
3. Click "Execute Query"

### Query DSL Syntax

**SELECT Clause:**
- `SELECT *` - All frames
- `SELECT uplink` - Uplink frames only
- `SELECT downlink` - Downlink frames only
- `SELECT join` - Join frames only
- `SELECT decoded_payload` - Decoded payload only
- `SELECT f_port, f_cnt, rssi` - Specific fields

**FROM Clause:**
- `FROM device 'DevEUI'` - Specify device EUI in quotes

**WHERE Clause (Time Filters):**
- `WHERE LAST '1h'` - Last 1 hour (units: ms, s, m, h, d, w)
- `WHERE SINCE '2025-01-01T00:00:00Z'` - Since specific date
- `WHERE BETWEEN '2025-01-01T00:00:00Z' AND '2025-01-02T00:00:00Z'` - Date range

**Examples:**
```sql
-- All frames from last hour
SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'

-- Uplink frames from last 24 hours
SELECT uplink FROM device '0123456789ABCDEF' WHERE LAST '24h'

-- Decoded payload from last hour
SELECT decoded_payload FROM device '0123456789ABCDEF' WHERE LAST '1h'

-- Custom fields in date range
SELECT f_port, f_cnt, rssi FROM device 'ABCD'
  WHERE BETWEEN '2025-01-01T00:00:00Z' AND '2025-01-02T00:00:00Z'
```

## Development

### Running Locally (Without Docker)

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

### Building for Production

```bash
# Backend
cd backend
npm run build

# Frontend
cd frontend
npm run build
```

## Configuration Reference

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET` | JWT secret key (must match LoRaDB) | - | Yes |
| `LORADB_API_URL` | LoRaDB API endpoint | `http://loradb:8080` | Yes |
| `JWT_EXPIRATION_HOURS` | Default token expiration | `1` | No |
| `MASTER_PASSWORD` | Plaintext password for server management protection | - | No |
| `MASTER_SESSION_HOURS` | Master session duration in hours | `24` | No |
| `BACKUP_ENABLED` | Enable/disable automatic daily backups | `true` | No |
| `BACKUP_SCHEDULE` | Cron schedule for automatic backups | `0 2 * * *` | No |
| `BACKUP_RETENTION_DAYS` | Days to keep automatic backups | `7` | No |
| `BACKEND_PORT` | Backend API port | `3001` | No |
| `FRONTEND_PORT` | Frontend web server port | `3000` | No |
| `CORS_ORIGIN` | Allowed frontend origin | `http://localhost:3000` | No |
| `VITE_API_URL` | Backend API URL (frontend) | `http://localhost:3001` | No |

### Network Configuration

The UI connects to LoRaDB via Docker network. Ensure both are on the same network:

```bash
# Create network if it doesn't exist
docker network create loradb-network

# Verify LoRaDB is on the network
docker network inspect loradb-network
```

## Troubleshooting

### Cannot Connect to LoRaDB API

**Symptom**: Backend logs show "ECONNREFUSED" or "Service Unavailable"

**Solutions:**
1. Verify LoRaDB is running: `docker ps | grep loradb`
2. Check both containers are on same network:
   ```bash
   docker network inspect loradb-network
   ```
3. Verify `LORADB_API_URL` in `.env` matches container name
4. Test connectivity from backend container:
   ```bash
   docker exec loradb-ui-backend curl http://loradb:8080/health
   ```

### JWT Token Invalid/Unauthorized

**Symptom**: Login succeeds but API calls return 401 Unauthorized

**Solutions:**
1. Verify `JWT_SECRET` matches between UI and LoRaDB:
   ```bash
   # Check LoRaDB secret
   docker exec loradb env | grep JWT_SECRET

   # Check UI backend secret
   docker exec loradb-ui-backend env | grep JWT_SECRET
   ```
2. Regenerate token with matching secret
3. Check token hasn't expired

### Frontend Can't Connect to Backend

**Symptom**: Frontend shows connection errors

**Solutions:**
1. Verify backend is running: `docker ps | grep loradb-ui-backend`
2. Check backend logs: `docker-compose logs backend`
3. Verify `VITE_API_URL` points to correct backend URL
4. Check CORS settings in backend `.env`

### Token Expired

**Symptom**: "Token has expired" error

**Solution**: Logout and login again to generate a new token

## Security Considerations

1. **JWT Secret**: Use a strong, unique secret (minimum 32 characters)
2. **HTTPS**: In production, use a reverse proxy (Caddy/nginx) for HTTPS
3. **CORS**: Restrict `CORS_ORIGIN` to your frontend domain in production
4. **Firewall**: Only expose necessary ports (3000 for frontend)
5. **Token Expiration**: Use reasonable expiration times (1-24 hours)
6. **Master Password**: Enable master password protection for server management (see below)

## Master Password Protection

Protect your server management page (`/servers/manage`) with a master password. This optional security layer prevents unauthorized users from adding, editing, or deleting server configurations.

### Setup Master Password

Simply add a password to your `.env` file:

```bash
# Edit your .env file
nano .env

# Add these lines:
MASTER_PASSWORD=your-secure-password-here
MASTER_SESSION_HOURS=24

# Restart backend to apply changes
docker compose restart backend
```

### Requirements

- **Minimum:** 8 characters
- **Maximum:** 72 characters
- Any characters allowed (letters, numbers, symbols)

### Configuration

Add these variables to your `.env` file:

```bash
# Master Password Protection (optional)
MASTER_PASSWORD=your-secure-password-here
MASTER_SESSION_HOURS=24
```

### How It Works

- **Protected Operations**: Create, update, and delete servers
- **Unprotected Operations**: View servers, test connections
- **Session Duration**: 24 hours by default (configurable)
- **Rate Limiting**: 5 failed attempts per 15 minutes
- **Backward Compatible**: If not configured, server management remains unprotected

### Security Notes

- Password stored in plaintext in `.env` file - ensure proper file permissions (600)
- Sessions are stored in browser localStorage
- JWT tokens with type='master' for authentication
- Only protects `/servers/manage` route
- Other admin features (Tokens, Retention) use server-based authentication
- Rate limited to 5 failed attempts per 15 minutes

### Disabling Protection

Simply remove or comment out `MASTER_PASSWORD` from `.env` and restart:

```bash
docker compose restart backend
```

## Backup & Restore System

The LoRaDB-UI includes a comprehensive backup and restore system for migrating data between instances or creating backups for disaster recovery.

### What Gets Backed Up

- **Server Configurations**: All server connections with encrypted API keys and password hashes
- **Dashboard Layouts**: Custom dashboard widgets, layouts, and configurations
- **User Settings**: Application preferences
- **Device Types**: Custom device type definitions

### Features

- **Manual Backups**: Export system data anytime via the UI
- **Automatic Backups**: Scheduled daily backups with automatic cleanup
- **Import Strategies**: Merge (add new) or Replace (full restore)
- **Security**: API keys remain encrypted in backups - you must remember server passwords

### Setup

Automatic backups are enabled by default. To customize, add to your `.env` file:

```bash
# Enable/disable automatic backups
BACKUP_ENABLED=true

# Cron schedule for automatic backups (default: 2 AM daily)
# Format: minute hour day month weekday
BACKUP_SCHEDULE=0 2 * * *

# Number of days to keep automatic backups
BACKUP_RETENTION_DAYS=7
```

Restart the backend to apply changes:
```bash
docker compose restart backend
```

### Creating Manual Backups

1. Navigate to **Server Management** (`/servers/manage`)
2. Scroll to **Backup & Restore** section
3. Click **Export Backup**
4. Save the downloaded JSON file in a secure location

The backup file is plain JSON and can be inspected with any text editor.

### Restoring from Backup

1. Navigate to **Server Management** (`/servers/manage`)
2. Click **Import Backup**
3. Select your backup JSON file
4. Choose an import strategy:
   - **Merge**: Add servers from backup, skip duplicates (recommended)
   - **Replace**: Delete all existing servers and restore from backup (⚠️ destructive)
5. Review the preview and confirm

### Import Strategies

**Merge Strategy** (Recommended):
- Adds new servers from the backup
- Skips servers with duplicate names or hosts
- Preserves existing servers
- Conflict resolution: Duplicate names get timestamp suffix
- Safe for regular imports

**Replace Strategy**:
- Deletes ALL existing servers
- Imports servers from backup
- ⚠️ Destructive operation - cannot be undone
- Use only for full system restores

### Automatic Backups

Automatic backups:
- Run daily at 2 AM by default (configurable via `BACKUP_SCHEDULE`)
- Stored in Docker volume at `/app/data/backups/`
- Automatically cleaned up after 7 days (configurable via `BACKUP_RETENTION_DAYS`)
- Can be downloaded from the **Server Management** page

To check automatic backup logs:
```bash
docker compose logs backend | grep backup
```

### Docker Volume Backup

For complete disaster recovery, back up the entire Docker volume:

```bash
# Backup Docker volume to tar.gz file
docker run --rm -v loradb-ui-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/loradb-data-backup.tar.gz /data

# Restore Docker volume from tar.gz file
docker run --rm -v loradb-ui-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/loradb-data-backup.tar.gz -C /
```

### Security Considerations

**Important**:
- API keys remain **AES-256-GCM encrypted** in backups
- Password hashes remain **bcrypt hashes**
- **You MUST remember server passwords** to use restored servers
- Backups do not contain plaintext passwords or API keys

**Access Control**:
- All backup operations require master password authentication
- Rate limited to 10 operations per 15 minutes per IP
- Backup files stored with 600 permissions (owner read/write only)

**Best Practices**:
1. Store backup files in a secure location
2. Test the restore process periodically
3. Keep backups encrypted at rest
4. Never commit backup files to version control
5. Document server passwords separately (they're not in backups)

### Troubleshooting Backups

**Automatic backups not running:**
- Check `BACKUP_ENABLED=true` in `.env`
- Verify `BACKUP_SCHEDULE` is valid cron syntax
- Check logs: `docker compose logs backend | grep backup`

**Import fails with "Version Error":**
- Backup version incompatible with current version
- Upgrade LoRaDB-UI to match backup version

**"Host already exists" errors during merge:**
- Security feature: duplicate hosts are skipped
- Use replace strategy if intentional override needed
- Or delete conflicting server before import

**Restored servers don't work:**
- API keys are encrypted with original server passwords
- You must remember the original passwords to use restored servers
- Re-add server with correct credentials if password forgotten

## Backup & Maintenance

### Logs

```bash
# View all logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f

# View specific service logs
docker-compose logs frontend
docker-compose logs backend
```

### Updates

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Cleanup

```bash
# Stop and remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Remove images
docker rmi loradb-ui-frontend loradb-ui-backend
```

## Project Structure

```
loradb-ui/
├── backend/                  # Node.js Express backend
│   ├── src/
│   │   ├── routes/          # API routes
│   │   ├── middleware/      # CORS, error handling
│   │   ├── config/          # Configuration
│   │   └── index.ts         # Entry point
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── frontend/                 # React frontend
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── api/             # API client
│   │   ├── types/           # TypeScript types
│   │   ├── context/         # React context
│   │   ├── utils/           # Utilities
│   │   └── App.tsx          # Main app
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml
├── .env.example
└── README.md
```

## Contributing

Contributions welcome! Please:
1. Test changes locally
2. Update documentation
3. Follow existing code style

## License

MIT License - Same as LoRaDB

## Support

For issues or questions:
- Check the troubleshooting section above
- Review LoRaDB main documentation
- Check Docker logs for errors
