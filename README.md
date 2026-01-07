# LoRaDBase

A complete LoRaWAN data management solution combining a high-performance time-series database with an intuitive web interface. [Why not use a Generic TSDB?](https://github.com/JustDr00py/LoRaDBase/blob/main/LoRaDB/PITCH.md)

## Overview

This repository contains three integrated components:

1. **LoRaDB**: A specialized database built in Rust for storing and querying LoRaWAN network traffic
2. **LoRaDB-UI**: A web-based interface for managing devices, executing queries, and generating tokens
3. **LoRaDB-manager**: A Textual TUI application for managing multiple LoRaDB instances on a single machine

## Repository Structure

```
LoRaDBase/
├── LoRaDB/                  # Backend database (Rust)
│   ├── src/                 # Source code
│   ├── Cargo.toml           # Rust dependencies
│   ├── docker-compose.yml   # Database deployment
│   └── deploy.sh            # Deployment script
├── LoRaDB-UI/               # Frontend web interface
│   ├── frontend/            # React application
│   ├── backend/             # Node.js API server
│   └── docker-compose.yml   # UI deployment
├── LoRaDB-manager/          # TUI instance manager (Python)
│   ├── run.sh               # Quick start script
│   └── README.md            # Manager documentation
└── README.md                # This file
```

---

## LoRaDB - Time-Series Database

**A secure, high-performance time-series database for LoRaWAN device data**

LoRaDB is a specialized database built from scratch in Rust for storing and querying LoRaWAN network traffic. It features an LSM-tree storage engine, MQTT ingestion from ChirpStack and The Things Network, end-to-end encryption, and a simple query DSL.

### Features

#### Core Storage Engine
- **LSM-Tree Architecture**: Write-Ahead Log (WAL) → Memtable → SSTables → Compaction
- **Crash Recovery**: CRC32-checksummed WAL entries with automatic replay
- **Lock-Free Concurrency**: `crossbeam-skiplist` memtable, `DashMap` device registry
- **Device-First Indexing**: Composite key (DevEUI, timestamp, sequence) for efficient queries
- **Bloom Filters**: Probabilistic membership testing (1% false positive rate)
- **LZ4 Compression**: Efficient SSTable storage
- **AES-256-GCM Encryption**: Optional data-at-rest encryption with key zeroization
- **Flexible Retention Policies**: Global default + per-application retention with automatic enforcement

#### MQTT Ingestion
- **Dual Network Support**: ChirpStack v4 and The Things Network v3
- **TLS 1.2+**: Secure connections with system certificates
- **Automatic Reconnection**: Resilient connection handling
- **Message Parsing**: JSON deserialization with validation

#### HTTP Ingestion
- **ChirpStack Webhook Support**: Ingest data via HTTP webhooks when MQTT access is unavailable
- **Supported Events**: Uplink, Join, and Status events
- **Authenticated**: JWT or API token required for all requests
- **Same Data Model**: HTTP-ingested data is queryable using the same DSL as MQTT data
- **Use Cases**: Helium networks, managed ChirpStack instances, webhook-based integrations
- **See**: [HTTP Ingestion Guide](LoRaDB/docs/HTTP_INGESTION.md) for detailed setup instructions

#### Query DSL
Simple SQL-like query language with nested field projection:
```sql
-- Query all uplink data
SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'

-- Query specific frame types
SELECT uplink FROM device '0123456789ABCDEF' WHERE SINCE '2025-01-01T00:00:00Z'

-- Query specific measurements using dot notation
SELECT decoded_payload.object.co2, decoded_payload.object.TempC_SHT FROM device '0123456789ABCDEF' WHERE LAST '24h'

-- Mix frame metadata and sensor measurements
SELECT received_at, f_port, decoded_payload.object.temperature FROM device '0123456789ABCDEF' WHERE LAST '7d'
```

#### HTTP/HTTPS API
- **Dual Authentication**: JWT tokens (short-lived) + API tokens (long-lived, revocable)
- **CORS Support**: Configurable cross-origin resource sharing for web dashboards
- **Security Headers**: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **TLS Support**: Optional built-in TLS (use reverse proxy recommended for production)
- **RESTful Endpoints**:
  - `GET /health` - Health check (no auth)
  - `POST /ingest?event={type}` - ChirpStack webhook ingestion (auth required)
  - `POST /query` - Execute queries (auth required)
  - `GET /devices` - List devices (auth required)
  - `GET /devices/:dev_eui` - Device info (auth required)
  - `POST /tokens` - Create API token (auth required)
  - `GET /tokens` - List API tokens (auth required)
  - `DELETE /tokens/:token_id` - Revoke API token (auth required)
  - `GET /retention/policies` - List retention policies (auth required)
  - `POST /retention/enforce` - Trigger retention enforcement (auth required)

---

## LoRaDB-manager - Multi-Instance Manager

**A Textual TUI application for managing multiple LoRaDB instances on a single machine**

LoRaDB-manager provides a terminal-based user interface for deploying, monitoring, and managing multiple LoRaDB instances. It's ideal for development environments, testing setups, or edge deployments that need to run multiple isolated LoRaDB instances.

### Features

- **Multi-Instance Management**: Deploy and manage multiple LoRaDB instances from a single interface
- **Interactive TUI**: Built with Textual for a modern terminal user experience
- **Docker-Based Deployment**: Automated Docker container orchestration for each instance
- **Configuration Management**: Easy configuration and environment variable management per instance
- **Real-Time Monitoring**: Monitor status and logs of all running instances
- **Quick Start**: Get up and running with `./run.sh`

### Quick Start

```bash
cd LoRaDB-manager
./run.sh
```

See [LoRaDB-manager/README.md](./LoRaDB-manager/README.md) for detailed documentation and [LoRaDB-manager/QUICKSTART.md](./LoRaDB-manager/QUICKSTART.md) for a step-by-step guide.

---

## Quick Start

**For managing multiple LoRaDB instances**: Use [LoRaDB-manager](#loradb-manager---multi-instance-manager) instead. For single-instance production deployment, follow the steps below.

### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- Python 3.10+ (for LoRaDB-manager)
- (Optional) Reverse proxy like Caddy or nginx for production HTTPS

### 1. Deploy LoRaDB (Database)

```bash
cd LoRaDB

# Copy and configure environment
cp .env.example .env
nano .env  # Edit configuration (MQTT broker, JWT secret, etc.)

# Deploy using automated script (recommended)
./deploy.sh

# Or manually with docker-compose
docker-compose up -d
```

**Key configuration variables:**
```bash
# Required: Generate a secure JWT secret
LORADB_API_JWT_SECRET=$(openssl rand -base64 32)

# Required: Configure MQTT broker (ChirpStack or TTN)
LORADB_MQTT_CHIRPSTACK_BROKER=mqtts://chirpstack.example.com:8883
LORADB_MQTT_USERNAME=loradb
LORADB_MQTT_PASSWORD=your-password

# API Configuration
LORADB_API_BIND_ADDR=0.0.0.0:8080
LORADB_API_ENABLE_TLS=false  # Use reverse proxy instead
```

### 2. Deploy LoRaDB-UI (Web Interface)

```bash
cd ../LoRaDB-UI

# Copy and configure environment
cp .env.example .env
nano .env  # Edit configuration

# Deploy
docker-compose up -d
```

**Key configuration variables:**
```bash
# Must match your LoRaDB JWT secret (CRITICAL!)
JWT_SECRET=your-32-character-secret-key-here!!!

# URL to your LoRaDB API
LORADB_API_URL=http://localhost:8080

# Ports
FRONTEND_PORT=3000
BACKEND_PORT=3001

# For remote access from other computers
VITE_API_URL=http://YOUR_SERVER_IP:3001
CORS_ORIGIN=http://YOUR_SERVER_IP:3000
```

### 3. Configure Data Ingestion

**Option A: MQTT (Recommended for self-hosted ChirpStack)**

MQTT is already configured in step 1 via `LoRaDB/.env`:
```bash
LORADB_MQTT_CHIRPSTACK_BROKER=mqtts://chirpstack.example.com:8883
LORADB_MQTT_USERNAME=loradb
LORADB_MQTT_PASSWORD=your-password
```

**Option B: HTTP Webhooks (For Helium, managed instances, or when MQTT unavailable)**

1. Generate an API token:
```bash
cd LoRaDB
docker compose exec loradb generate-token admin
```

2. Configure ChirpStack HTTP integration with these endpoints:
   - **Uplink URL**: `http://your-loradb-server:8080/ingest?event=up`
   - **Join URL**: `http://your-loradb-server:8080/ingest?event=join`
   - **Status URL**: `http://your-loradb-server:8080/ingest?event=status`
   - **Authorization Header**: `Authorization: Bearer <your_api_token>`

**See [LoRaDB/docs/HTTP_INGESTION.md](LoRaDB/docs/HTTP_INGESTION.md) for detailed webhook configuration.**

### 4. Access the UI

Open your browser and navigate to:
- **Local**: `http://localhost:3000`
- **Remote**: `http://<your-server-ip>:3000`

---

## LoRaDB Installation Details

### Deployment Scripts (Quickest Method)

LoRaDB includes automated deployment scripts for easy setup and updates:

#### Initial Deployment

```bash
cd LoRaDB
./deploy.sh
```

The `deploy.sh` script will:
- Validate configuration
- Build Docker image
- Create volumes
- Start LoRaDB
- Show next steps

#### Updating LoRaDB

```bash
cd LoRaDB
./update.sh
```

The `update.sh` script will:
- Pull latest changes from git
- Show what's new
- Rebuild Docker image
- Restart with data persistence
- Verify health

#### Daily Management

```bash
cd LoRaDB

# View all available commands
./loradb.sh

# Common commands
./loradb.sh logs              # Follow logs
./loradb.sh status            # Check status
./loradb.sh token admin       # Generate JWT token
./loradb.sh apitoken admin "My Dashboard" 365  # Generate API token
./loradb.sh backup            # Create backup
./loradb.sh health            # Check API health
```

### Docker Resource Requirements
- **Minimum**: 512MB RAM, 1 CPU core, 10GB disk
- **Recommended**: 2GB RAM, 2 CPU cores, 50GB+ SSD

### Data Persistence

LoRaDB uses an LSM-tree storage engine with multiple persistence layers:

1. **Write-Ahead Log (WAL)**: All writes are immediately logged to `wal/` directory for crash recovery
2. **Memtable**: In-memory sorted data structure (flushed periodically or when size threshold is reached)
3. **SSTables**: Immutable sorted files (`sstable-*.sst`) created when memtable is flushed

**Data directory structure:**
```
/var/lib/loradb/data/
├── wal/              # Write-ahead logs
│   └── segment-*.wal
├── sstable-*.sst     # Sorted string tables (persistent data)
└── api_tokens.json   # API token store
```

Data is persisted in the `loradb-data` Docker volume. To back up your data:
```bash
# Backup
docker run --rm -v loradb_loradb-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/loradb-backup.tar.gz -C /data .

# Restore
docker run --rm -v loradb_loradb-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/loradb-backup.tar.gz -C /data
```

---

## LoRaDB-UI Installation Details

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  React Frontend │────▶│  Node.js Backend │────▶│   LoRaDB     │
│  (nginx:3000)   │     │  (Express:3001)  │     │  API Server  │
└─────────────────┘     └──────────────────┘     └──────────────┘
```

- **Frontend**: React 18 with TypeScript, served by nginx
- **Backend**: Node.js Express API that proxies requests to LoRaDB and generates tokens
- **Deployment**: Docker Compose for easy multi-container deployment

### Remote Deployment Setup

The UI can run on a **separate computer** from LoRaDB. Follow these steps:

#### Network Requirements

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

#### Configuration for Remote Deployment

**On the UI Server**, edit `LoRaDB-UI/.env`:

```bash
# Backend connects to LoRaDB on different server/network
LORADB_API_URL=http://192.168.1.100:8080  # Replace with your LoRaDB server IP

# JWT Secret - MUST match LoRaDB server exactly!
JWT_SECRET=the-exact-same-secret-as-loradb-server

# Ports on UI server
BACKEND_PORT=3001
FRONTEND_PORT=3000

# For browsers accessing from remote computers
VITE_API_URL=http://192.168.1.200:3001    # Replace with UI server IP
CORS_ORIGIN=http://192.168.1.200:3000     # Replace with UI server IP
```

### Usage

#### Login

1. Open the UI in your browser
2. Enter a username
3. Set token expiration (default: 1 hour)
4. Click "Generate Token & Login"

#### View Devices

1. Navigate to "Devices" in the sidebar
2. View all registered LoRaWAN devices
3. See device EUI, name, application ID, and last activity
4. Click "Query" button to quickly query a specific device

#### Execute Queries

**Using Query Builder:**
1. Navigate to "Query" in the sidebar
2. Select a device from the dropdown
3. Choose frame type (all, uplink, downlink, join, decoded_payload)
4. Select time range (Last, Since, Between, or None)
5. Click "Execute Query"

**Using Query Editor:**
1. Click "Switch to Editor"
2. Enter a raw query:
   ```sql
   SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'
   ```
3. Click "Execute Query"

---

## Configuration

### LoRaDB Configuration

See [LoRaDB/.env.example](LoRaDB/.env.example) for full configuration options.

**Required Variables:**
```bash
# Storage
LORADB_STORAGE_DATA_DIR=/var/lib/loradb/data

# API
LORADB_API_BIND_ADDR=0.0.0.0:8080
LORADB_API_JWT_SECRET=your-32-character-secret-here!!!

# TLS (use reverse proxy recommended)
LORADB_API_ENABLE_TLS=false
```

**Optional Variables:**
```bash
# MQTT - ChirpStack
LORADB_MQTT_CHIRPSTACK_BROKER=mqtts://chirpstack.example.com:8883
LORADB_MQTT_USERNAME=loradb
LORADB_MQTT_PASSWORD=secret

# MQTT - The Things Network
LORADB_MQTT_TTN_BROKER=mqtts://nam1.cloud.thethings.network:8883

# Data Retention Policies
LORADB_STORAGE_RETENTION_DAYS=90
LORADB_STORAGE_RETENTION_APPS="test-app:7,production:365,critical:never"
LORADB_STORAGE_RETENTION_CHECK_INTERVAL_HOURS=24

# Encryption
LORADB_STORAGE_ENABLE_ENCRYPTION=true
LORADB_STORAGE_ENCRYPTION_KEY=base64-encoded-32-byte-key
```

### LoRaDB-UI Configuration

See [LoRaDB-UI/.env.example](LoRaDB-UI/.env.example) for full configuration options.

**Required Variables:**
```bash
JWT_SECRET=your-32-character-secret-key-here!!!  # MUST match LoRaDB
LORADB_API_URL=http://localhost:8080
```

**Optional Variables:**
```bash
JWT_EXPIRATION_HOURS=1
BACKEND_PORT=3001
FRONTEND_PORT=3000
CORS_ORIGIN=http://localhost:3000
VITE_API_URL=http://localhost:3001
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  MQTT Brokers                       │
│         (ChirpStack v4, TTN v3)                     │
└──────────────────┬──────────────────────────────────┘
                   │ TLS 1.2+
                   ▼
         ┌─────────────────┐
         │ MQTT Ingestor   │
         │  - TLS Connect  │
         │  - Parse JSON   │
         └────────┬────────┘
                  │ mpsc channel
                  ▼
         ┌─────────────────────────┐
         │   Storage Engine        │
         │  ┌──────────────────┐   │
         │  │  WAL (CRC32)     │   │
         │  └──────────────────┘   │
         │  ┌──────────────────┐   │
         │  │  Memtable        │   │
         │  │  (skiplist)      │   │
         │  └──────────────────┘   │
         │  ┌──────────────────┐   │
         │  │  SSTables        │   │
         │  │  (LZ4 + Bloom)   │   │
         │  └──────────────────┘   │
         │  ┌──────────────────┐   │
         │  │  Compaction      │   │
         │  └──────────────────┘   │
         └─────────┬───────────────┘
                   │
                   ▼
         ┌─────────────────┐
         │ Query Executor  │
         │  - Parse DSL    │
         │  - Filter       │
         │  - Project      │
         └────────┬────────┘
                  │
                  ▼
         ┌─────────────────────────┐
         │   HTTPS API Server      │
         │  - JWT Auth Middleware  │
         │  - Security Headers     │
         │  - TLS (rustls)         │
         └─────────┬───────────────┘
                   │
                   ▼
         ┌─────────────────────────┐
         │    Web UI (React)       │
         │  - Token Management     │
         │  - Query Builder        │
         │  - Device Management    │
         └─────────────────────────┘
                   │
                   ▼
            ┌──────────┐
            │  Client  │
            └──────────┘
```

---

## Security

### Mandatory Security Features
- ✅ **TLS 1.2+** for MQTT and HTTPS
- ✅ **Dual Authentication** (JWT + API tokens with revocation)
- ✅ **Configurable CORS** with origin restrictions
- ✅ **Security Headers**: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- ✅ **AES-256-GCM** encryption-at-rest (optional)
- ✅ **Key Zeroization** on drop
- ✅ **No `unsafe` code** (except dependencies)
- ✅ **Strict file permissions** (0600/0700)

### Production Recommendations
1. **Generate strong JWT secrets**: `openssl rand -base64 32`
2. **Use proper TLS certificates**: Let's Encrypt or internal CA
3. **Enable encryption**: Set `LORADB_STORAGE_ENABLE_ENCRYPTION=true`
4. **Restrict CORS origins**:
   ```bash
   # Development (allow all)
   LORADB_API_CORS_ALLOWED_ORIGINS=*

   # Production (specific origins only)
   LORADB_API_CORS_ALLOWED_ORIGINS=https://dashboard.example.com,https://admin.example.com
   ```
5. **Use API tokens for dashboards**: Long-lived, revocable tokens for automation
6. **Monitor logs**: Use structured JSON logging
7. **Rate limiting**: Configure per deployment needs
8. **Use HTTPS in production**: Deploy behind reverse proxy (Caddy/nginx)

---

## Data Retention Policies

LoRaDB supports flexible retention policies to automatically delete old data based on configured retention periods.

### Global Default Retention

```bash
# Delete all data older than 90 days
LORADB_STORAGE_RETENTION_DAYS=90

# Check and enforce retention policy daily
LORADB_STORAGE_RETENTION_CHECK_INTERVAL_HOURS=24
```

### Per-Application Retention

```bash
# Global default: 90 days
LORADB_STORAGE_RETENTION_DAYS=90

# Per-application overrides
LORADB_STORAGE_RETENTION_APPS="test-sensors:7,production:365,fire-alarms:never"
```

### API-Based Retention Management

Retention policies can be managed dynamically via REST API without server restart:

```bash
# List all policies
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/retention/policies

# Set global policy to 90 days
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 90}' \
  http://localhost:8080/retention/policies/global

# Set retention for specific application
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 30}' \
  http://localhost:8080/retention/policies/test-sensors

# Trigger immediate enforcement
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/retention/enforce
```

---

## Testing

```bash
cd LoRaDB

# Run all tests
cargo test

# Run specific test suite
cargo test --lib storage
cargo test --lib api
cargo test --lib query

# With output
cargo test -- --nocapture
```

**Test Results**: 75 tests passing ✅
- Storage Engine: 19 tests (WAL, Memtable, SSTable, Compaction)
- Security: 18 tests (Encryption 7, JWT 11)
- Query System: 16 tests (DSL 4, Parser 8, Executor 4)
- API Layer: 11 tests (Handlers 3, Middleware 4, HTTP 4)
- MQTT: 2 tests
- Device Registry: 1 test
- Model: 8 tests

---

## Performance

### Expected Performance
- **Write Throughput**: ~10,000 frames/sec (unencrypted), ~5,000 frames/sec (encrypted)
- **Query Latency**: <100ms for 1M frames, device-scoped
- **Storage Efficiency**: ~60% compression ratio with LZ4

### Performance Tuning

**Memory Configuration:**
```bash
# Larger memtable for high ingestion rates
LORADB_STORAGE_MEMTABLE_SIZE_MB=128

# Less frequent WAL syncs (higher throughput, lower durability)
LORADB_STORAGE_WAL_SYNC_INTERVAL_MS=5000
```

**Compaction Tuning:**
```bash
# Trigger compaction with more SSTables (less frequent compaction)
LORADB_STORAGE_COMPACTION_THRESHOLD=20
```

---

## Edge Deployment

LoRaDB is designed for edge compatibility:

### Docker on Edge Devices (Recommended)

```bash
# On Raspberry Pi 4 or similar ARM64 devices
cd LoRaDB
docker-compose up -d

# Monitor resource usage
docker stats loradb
```

**Edge-specific Docker configuration:**
- Reduce `LORADB_STORAGE_MEMTABLE_SIZE_MB` to 32 for devices with limited RAM
- Set appropriate CPU and memory limits in `docker-compose.yml`
- Use external USB/SSD storage for the data volume on Raspberry Pi

### Tested Platforms
- ✅ x86_64 Linux (Docker & native)
- ✅ ARM64 Linux (Raspberry Pi 4, AWS Graviton) (Docker & native)
- ✅ Docker on edge gateways
- ⚠️ macOS (development only, not production)

---

## Troubleshooting

### LoRaDB Issues

**MQTT Connection Issues:**
```bash
# Test MQTT connectivity
openssl s_client -connect chirpstack.example.com:8883

# Check MQTT credentials
docker exec loradb env | grep MQTT
```

**Storage Issues:**
```bash
# Check data directory permissions
docker exec loradb ls -ld /var/lib/loradb/data

# Check WAL recovery
docker-compose logs loradb | grep "Recovered"
```

**API Authentication:**
```bash
# Verify JWT secret length (must be ≥32 chars)
echo -n "$LORADB_API_JWT_SECRET" | wc -c

# Test API access
curl -k https://localhost:8443/health
```

### LoRaDB-UI Issues

**Cannot Connect to LoRaDB API:**
1. Verify LoRaDB is running: `docker ps | grep loradb`
2. Test connectivity: `curl http://LORADB_SERVER_IP:8080/health`
3. Check `LORADB_API_URL` in `.env` is correct

**JWT Token Invalid/Unauthorized:**
1. Verify `JWT_SECRET` matches between UI and LoRaDB:
   ```bash
   # Check LoRaDB secret
   docker exec loradb env | grep JWT_SECRET

   # Check UI backend secret
   docker exec loradb-ui-backend env | grep JWT_SECRET
   ```
2. They MUST be identical!

**Frontend Can't Connect to Backend:**
1. Verify backend is running: `docker ps | grep loradb-ui-backend`
2. Check backend logs: `docker-compose logs backend`
3. Verify `VITE_API_URL` points to correct backend URL

---

## Documentation

Additional documentation is available in each component directory:

### LoRaDB Documentation
- [LoRaDB/README.md](LoRaDB/README.md) - Complete database documentation
- [LoRaDB/DEPLOYMENT.md](LoRaDB/DEPLOYMENT.md) - Deployment guide with automated scripts
- [LoRaDB/docs/HTTP_INGESTION.md](LoRaDB/docs/HTTP_INGESTION.md) - HTTP webhook ingestion guide
- [LoRaDB/API_TOKEN_GUIDE.md](LoRaDB/API_TOKEN_GUIDE.md) - API token management and usage
- [LoRaDB/QUERY_API_GUIDE.md](LoRaDB/QUERY_API_GUIDE.md) - Query API reference and examples
- [LoRaDB/DELETE_DEVICE_API.md](LoRaDB/DELETE_DEVICE_API.md) - Device deletion API guide
- [LoRaDB/PITCH.md](LoRaDB/PITCH.md) - Why use LoRaDB instead of generic TSDB

### LoRaDB-UI Documentation
- [LoRaDB-UI/README.md](LoRaDB-UI/README.md) - Complete UI documentation
- [LoRaDB-UI/REMOTE_SETUP.md](LoRaDB-UI/REMOTE_SETUP.md) - Remote deployment guide
- [LoRaDB-UI/API_TOKENS.md](LoRaDB-UI/API_TOKENS.md) - API token usage in UI

### LoRaDB-manager Documentation
- [LoRaDB-manager/README.md](LoRaDB-manager/README.md) - Complete manager documentation
- [LoRaDB-manager/QUICKSTART.md](LoRaDB-manager/QUICKSTART.md) - Quick start guide

---

## Limitations

### V1 Scope
- ❌ No WASM/JavaScript payload decoders (use pre-decoded from network server)
- ❌ No clustering/replication (single-node only)
- ❌ No time-series aggregation functions (use external tools)

---

## Contributing

Contributions welcome! Please:
1. Run `cargo test` (for LoRaDB changes) before submitting
2. Follow Rust/TypeScript idioms and style guidelines
3. Add tests for new features
4. Update documentation

---

## License

MIT License - See LICENSE file for details

---

## Support

- **Issues**: https://github.com/yourusername/loradbase/issues
- **Discussions**: https://github.com/yourusername/loradbase/discussions
- **Security**: security@yourdomain.com

---

## Acknowledgments

Built with:
- **Backend**: [Rust](https://rust-lang.org), [tokio](https://tokio.rs), [axum](https://github.com/tokio-rs/axum), [rumqttc](https://github.com/bytebeamio/rumqtt)
- **Frontend**: [React](https://react.dev), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev)
- **Cryptography**: [aes-gcm](https://github.com/RustCrypto/AEADs), [jsonwebtoken](https://github.com/Keats/jsonwebtoken)
- **Concurrency**: [crossbeam](https://github.com/crossbeam-rs/crossbeam), [dashmap](https://github.com/xacrimon/dashmap)
- **Compression**: [lz4](https://github.com/10xGenomics/lz4-rs)
