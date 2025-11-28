# LoRaDB

**A secure, high-performance time-series database for LoRaWAN device data**

LoRaDB is a specialized database built from scratch in Rust for storing and querying LoRaWAN network traffic. It features an LSM-tree storage engine, MQTT ingestion from ChirpStack and The Things Network, end-to-end encryption, and a simple query DSL.

## Features

### Core Storage Engine
- **LSM-Tree Architecture**: Write-Ahead Log (WAL) → Memtable → SSTables → Compaction
- **Crash Recovery**: CRC32-checksummed WAL entries with automatic replay
- **Lock-Free Concurrency**: `crossbeam-skiplist` memtable, `DashMap` device registry
- **Device-First Indexing**: Composite key (DevEUI, timestamp, sequence) for efficient queries
- **Bloom Filters**: Probabilistic membership testing (1% false positive rate)
- **LZ4 Compression**: Efficient SSTable storage
- **AES-256-GCM Encryption**: Optional data-at-rest encryption with key zeroization
- **Flexible Retention Policies**: Global default + per-application retention with automatic enforcement

### MQTT Ingestion
- **Dual Network Support**: ChirpStack v4 and The Things Network v3
- **TLS 1.2+**: Secure connections with system certificates
- **Automatic Reconnection**: Resilient connection handling
- **Message Parsing**: JSON deserialization with validation

### Query DSL
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

### HTTP/HTTPS API
- **Dual Authentication**: JWT tokens (short-lived) + API tokens (long-lived, revocable)
- **CORS Support**: Configurable cross-origin resource sharing for web dashboards
- **Security Headers**: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **TLS Support**: Optional built-in TLS (use reverse proxy recommended for production)
- **RESTful Endpoints**:
  - `GET /health` - Health check (no auth)
  - `POST /query` - Execute queries (auth required)
  - `GET /devices` - List devices (auth required)
  - `GET /devices/:dev_eui` - Device info (auth required)
  - `POST /tokens` - Create API token (auth required)
  - `GET /tokens` - List API tokens (auth required)
  - `DELETE /tokens/:token_id` - Revoke API token (auth required)

## Installation

### Deployment Scripts (Quickest Method)

LoRaDB includes automated deployment scripts for easy setup and updates:

#### Initial Deployment

```bash
# Clone repository
git clone https://github.com/yourusername/loradb
cd loradb

# Deploy (handles everything)
./deploy.sh
```

The `deploy.sh` script will:
- Validate configuration
- Build Docker image
- Create volumes
- Start LoRaDB
- Show next steps

#### Updating LoRaDB

When code updates are available:

```bash
# Pull changes and rebuild
./update.sh
```

The `update.sh` script will:
- Pull latest changes from git
- Show what's new
- Rebuild Docker image
- Restart with data persistence
- Verify health

#### Daily Management

Use the helper script for common operations:

```bash
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

**See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment guide.**

---

### Option 1: Docker Deployment (Manual Setup)

#### Prerequisites
- Docker 20.10+
- Docker Compose 2.0+
- (Optional) Reverse proxy like Caddy or nginx for production HTTPS

#### Quick Start with Docker Compose

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/loradb
cd loradb
```

2. **Create environment configuration**
```bash
cp .env.example .env
```

3. **Edit `.env` with your configuration**
```bash
# Required: Generate a secure JWT secret
LORADB_API_JWT_SECRET=$(openssl rand -base64 32)

# Required: Configure MQTT broker (ChirpStack or TTN)
LORADB_MQTT_CHIRPSTACK_BROKER=mqtts://chirpstack.example.com:8883
LORADB_MQTT_USERNAME=loradb
LORADB_MQTT_PASSWORD=your-password

# Optional: Use reverse proxy for HTTPS (recommended)
LORADB_API_BIND_ADDR=0.0.0.0:8080
LORADB_API_ENABLE_TLS=false
```

4. **Start the container**
```bash
docker-compose up -d
```

5. **View logs**
```bash
docker-compose logs -f loradb
```

6. **Stop the container**
```bash
docker-compose down
```

#### Docker Resource Requirements
- **Minimum**: 512MB RAM, 1 CPU core, 10GB disk
- **Recommended**: 2GB RAM, 2 CPU cores, 50GB+ SSD

#### Using Reverse Proxy (Recommended for Production)

For production deployments, use a reverse proxy like Caddy or nginx to handle HTTPS:

**With Caddy (automatic HTTPS):**
```bash
# Update .env
LORADB_API_BIND_ADDR=0.0.0.0:8080
LORADB_API_ENABLE_TLS=false

# Caddy will automatically obtain Let's Encrypt certificates
# and proxy to LoRaDB on port 8080
```

**Benefits:**
- ✅ Automatic HTTPS with Let's Encrypt
- ✅ Certificate renewal handled by Caddy
- ✅ Easier configuration
- ✅ Better performance for static assets
- ✅ Additional security features (rate limiting, etc.)

#### Data Persistence

LoRaDB uses an LSM-tree storage engine with multiple persistence layers:

1. **Write-Ahead Log (WAL)**: All writes are immediately logged to `wal/` directory for crash recovery
2. **Memtable**: In-memory sorted data structure (flushed periodically or when size threshold is reached)
3. **SSTables**: Immutable sorted files (`sstable-*.sst`) created when memtable is flushed

**When SSTables are created:**
- Every 5 minutes (configurable via `LORADB_STORAGE_MEMTABLE_FLUSH_INTERVAL_SECS`)
- When memtable reaches 64MB (configurable via `LORADB_STORAGE_MEMTABLE_SIZE_MB`)
- On graceful shutdown (SIGTERM/SIGINT)

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

### Option 2: Build from Source

#### Prerequisites
- Rust 1.70+ (2021 edition)
- OpenSSL development libraries
- Optional: TLS certificates for HTTPS

#### Build Steps
```bash
git clone https://github.com/yourusername/loradb
cd loradb
cargo build --release
```

#### Binary Location
```
target/release/loradb
```

## Configuration

LoRaDB is configured via environment variables or a `.env` file:

### Required Variables
```bash
# Storage
LORADB_STORAGE_DATA_DIR=/var/lib/loradb/data

# API
LORADB_API_BIND_ADDR=0.0.0.0:8080
LORADB_API_JWT_SECRET=your-32-character-secret-here!!!

# TLS Configuration (optional - use reverse proxy like Caddy/nginx for production)
LORADB_API_ENABLE_TLS=false  # Set to true for direct HTTPS
# LORADB_API_TLS_CERT=/path/to/cert.pem  # Only needed if ENABLE_TLS=true
# LORADB_API_TLS_KEY=/path/to/key.pem    # Only needed if ENABLE_TLS=true
```

### Optional Variables
```bash
# MQTT - ChirpStack
LORADB_MQTT_CHIRPSTACK_BROKER=mqtts://chirpstack.example.com:8883
LORADB_MQTT_USERNAME=loradb
LORADB_MQTT_PASSWORD=secret

# MQTT - The Things Network
LORADB_MQTT_TTN_BROKER=mqtts://nam1.cloud.thethings.network:8883

# Storage Tuning
LORADB_STORAGE_WAL_SYNC_INTERVAL_MS=1000
LORADB_STORAGE_MEMTABLE_SIZE_MB=64
LORADB_STORAGE_MEMTABLE_FLUSH_INTERVAL_SECS=300  # Periodic flush every 5 minutes
LORADB_STORAGE_COMPACTION_THRESHOLD=10

# Data Retention Policies (optional - defaults to keep forever)
LORADB_STORAGE_RETENTION_DAYS=90  # Global default: delete data older than 90 days
LORADB_STORAGE_RETENTION_APPS="test-app:7,production:365,critical:never"  # Per-application policies
LORADB_STORAGE_RETENTION_CHECK_INTERVAL_HOURS=24  # How often to enforce retention

# Encryption (optional)
LORADB_STORAGE_ENABLE_ENCRYPTION=true
LORADB_STORAGE_ENCRYPTION_KEY=base64-encoded-32-byte-key

# API Tuning
LORADB_API_JWT_EXPIRATION_HOURS=1  # JWT token expiration in hours (default: 1)
LORADB_API_RATE_LIMIT_PER_MINUTE=100
LORADB_API_CORS_ALLOWED_ORIGINS=*  # CORS allowed origins (* for dev, specific domains for prod)
```

## Usage

### Start the Server
```bash
# Using environment variables
export LORADB_STORAGE_DATA_DIR=/var/lib/loradb/data
export LORADB_API_BIND_ADDR=0.0.0.0:8443
export LORADB_API_JWT_SECRET=your-secret-key-at-least-32-chars
# ... other variables ...

./target/release/loradb
```

### Generate JWT Token

LoRaDB includes a built-in token generator tool for easy authentication.

#### Using Docker
```bash
# Generate a token for a user
docker compose exec loradb generate-token admin

# Output example:
# Generated JWT token for user 'admin':
#
# eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...
#
# Use this token in API requests:
# curl -H 'Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...' https://your-domain.com/devices
```

#### Using Native Binary
```bash
# Build the token generator
cargo build --release --bin generate-token

# Generate token using JWT secret from environment
export LORADB_API_JWT_SECRET="your-32-character-secret-key-here"
./target/release/generate-token admin

# Or pass JWT secret directly
./target/release/generate-token admin "your-32-character-secret-key-here"

# Generate token with custom expiration (in hours)
export LORADB_API_JWT_EXPIRATION_HOURS=24  # 24 hours
./target/release/generate-token admin

# Or pass expiration as third argument
./target/release/generate-token admin "your-jwt-secret" 24
```

#### Token Details
- **Algorithm**: HS256 (HMAC with SHA-256)
- **Expiration**: Configurable via `LORADB_API_JWT_EXPIRATION_HOURS` (default: 1 hour)
- **Claims**: Contains `sub` (username), `exp` (expiration), and `iat` (issued at)
- **Usage**: Include in API requests via `Authorization: Bearer <token>` header

### Query via API
```bash
# Health check
curl https://localhost:8443/health

# Execute query
curl -X POST https://localhost:8443/query \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM device '\''0123456789ABCDEF'\'' WHERE LAST '\''1h'\''"}'

# List devices
curl https://localhost:8443/devices \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get device info
curl https://localhost:8443/devices/0123456789ABCDEF \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

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
         └─────────────────────────┘
                  │
                  ▼
            ┌──────────┐
            │  Client  │
            └──────────┘
```

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

## Testing

```bash
# Run all tests
cargo test

# Run specific test suite
cargo test --lib storage
cargo test --lib api
cargo test --lib query

# With output
cargo test -- --nocapture

# Test coverage summary
cargo test 2>&1 | grep "test result"
```

**Test Results**: 75 tests passing ✅
- Storage Engine: 19 tests (WAL, Memtable, SSTable, Compaction)
- Security: 18 tests (Encryption 7, JWT 11)
- Query System: 16 tests (DSL 4, Parser 8, Executor 4)
- API Layer: 11 tests (Handlers 3, Middleware 4, HTTP 4)
- MQTT: 2 tests
- Device Registry: 1 test
- Model: 8 tests

## Performance Tuning

### Memory Configuration
```bash
# Larger memtable for high ingestion rates
LORADB_STORAGE_MEMTABLE_SIZE_MB=128

# Less frequent WAL syncs (higher throughput, lower durability)
LORADB_STORAGE_WAL_SYNC_INTERVAL_MS=5000
```

### Compaction Tuning
```bash
# Trigger compaction with more SSTables (less frequent compaction)
LORADB_STORAGE_COMPACTION_THRESHOLD=20
```

### Expected Performance
- **Write Throughput**: ~10,000 frames/sec (unencrypted), ~5,000 frames/sec (encrypted)
- **Query Latency**: <100ms for 1M frames, device-scoped
- **Storage Efficiency**: ~60% compression ratio with LZ4

## Data Retention Policies

LoRaDB supports flexible retention policies to automatically delete old data based on configured retention periods. This enables compliance with data retention requirements, cost optimization, and privacy regulations.

### Global Default Retention

Set a default retention period for all applications:

```bash
# Delete all data older than 90 days
LORADB_STORAGE_RETENTION_DAYS=90

# Check and enforce retention policy daily
LORADB_STORAGE_RETENTION_CHECK_INTERVAL_HOURS=24
```

### Per-Application Retention

Override the global default with application-specific policies:

```bash
# Global default: 90 days
LORADB_STORAGE_RETENTION_DAYS=90

# Per-application overrides
LORADB_STORAGE_RETENTION_APPS="test-sensors:7,production:365,fire-alarms:never"
```

### Use Cases

**Development vs Production:**
```bash
LORADB_STORAGE_RETENTION_APPS="dev:7,staging:14,test:7,production:365"
```

**Privacy Compliance (GDPR/HIPAA):**
```bash
# Occupancy data (30 days for privacy)
# HVAC data (1 year for energy analysis)
# Fire alarms (forever for compliance)
LORADB_STORAGE_RETENTION_APPS="occupancy:30,hvac:365,fire-alarms:never,smoke-alarms:never"
```

**Multi-Tenant SaaS:**
```bash
# Different retention tiers for different customers
LORADB_STORAGE_RETENTION_APPS="customer-basic:30,customer-premium:365,customer-enterprise:730"
```

**Cost Optimization:**
```bash
# Quick cleanup for test data, longer retention for production analytics
LORADB_STORAGE_RETENTION_APPS="test:3,staging:7,prod-monitoring:90,prod-analytics:365"
```

### How It Works

1. **Application Policy Lookup**: For each SSTable, retrieves all application IDs it contains
2. **Policy Resolution**: Checks per-application policy → falls back to global default
3. **Conservative Deletion**: Uses the longest retention period among all apps in the SSTable
4. **Never Override**: If any application is set to `never`, the entire SSTable is preserved
5. **Automatic Enforcement**: Background task runs at configured interval (default: 24 hours)

### Retention Policy Format

```
application-id:days        Delete after specified days
application-id:never       Keep forever (never delete)
```

Multiple policies are comma-separated:
```bash
LORADB_STORAGE_RETENTION_APPS="app1:30,app2:90,app3:never,app4:7"
```

### API-Based Retention Management

**NEW:** Retention policies can now be managed dynamically via REST API without server restart!

#### List All Policies
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/retention/policies
```

Response:
```json
{
  "global_days": 90,
  "check_interval_hours": 24,
  "applications": [
    {
      "application_id": "production",
      "days": 365,
      "created_at": "2025-01-26T12:00:00Z",
      "updated_at": "2025-01-26T12:00:00Z"
    }
  ]
}
```

#### Get/Set Global Retention Policy
```bash
# Get global policy
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/retention/policies/global

# Set global policy to 90 days
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 90}' \
  http://localhost:8080/retention/policies/global

# Set to "never" (keep forever)
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": null}' \
  http://localhost:8080/retention/policies/global
```

#### Manage Application-Specific Policies
```bash
# Set retention for specific application
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"days": 30}' \
  http://localhost:8080/retention/policies/test-sensors

# Get application-specific policy
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/retention/policies/test-sensors

# Remove application policy (falls back to global)
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/retention/policies/test-sensors
```

#### Trigger Immediate Enforcement
```bash
# Run retention enforcement immediately (instead of waiting for scheduled run)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/retention/enforce
```

**Benefits:**
- **No Restart Required**: Update policies on the fly
- **Auditable**: Track when policies were created/updated
- **Integration-Friendly**: Automate retention management via API
- **Backward Compatible**: Environment variables still work; API takes precedence

**Storage Location**: Policies are persisted in `<data_dir>/retention_policies.json`

## Edge Deployment

LoRaDB is designed for edge compatibility:

### Docker on Edge Devices (Recommended)

Docker deployment works seamlessly on edge devices:

```bash
# On Raspberry Pi 4 or similar ARM64 devices
docker-compose up -d

# Monitor resource usage
docker stats loradb

# Adjust resource limits in docker-compose.yml if needed
```

**Edge-specific Docker configuration:**
- Reduce `LORADB_STORAGE_MEMTABLE_SIZE_MB` to 32 for devices with limited RAM
- Set appropriate CPU and memory limits in `docker-compose.yml`
- Use external USB/SSD storage for the data volume on Raspberry Pi

### ARM64 Native Build Support
```bash
# Cross-compile for ARM64
rustup target add aarch64-unknown-linux-gnu
cargo build --release --target aarch64-unknown-linux-gnu
```

**Building ARM64 Docker image:**
```bash
# On x86_64 host with buildx
docker buildx build --platform linux/arm64 -t loradb:arm64 .

# Or build natively on ARM64 device
docker build -t loradb .
```

### Resource Requirements
- **Minimum**: 512MB RAM, 1 CPU core, 10GB disk
- **Recommended**: 2GB RAM, 2 CPU cores, 50GB+ SSD

### Tested Platforms
- ✅ x86_64 Linux (Docker & native)
- ✅ ARM64 Linux (Raspberry Pi 4, AWS Graviton) (Docker & native)
- ✅ Docker on edge gateways
- ⚠️ macOS (development only, not production)

## Troubleshooting

### Docker-specific Issues

**Container won't start:**
```bash
# Check logs
docker-compose logs loradb

# Verify environment variables
docker-compose config

# Check certificate mounts
docker exec loradb ls -l /etc/loradb/
```

**Permission errors:**
```bash
# Ensure certificate files are readable
chmod 644 /path/to/cert.pem
chmod 600 /path/to/key.pem

# Check data volume permissions
docker exec loradb ls -ld /var/lib/loradb/data
```

**Health check failing:**
```bash
# Test health endpoint manually
docker exec loradb curl -k https://localhost:8443/health

# Check if TLS certificates are valid
openssl x509 -in /path/to/cert.pem -text -noout
```

### MQTT Connection Issues
```bash
# From host
openssl s_client -connect chirpstack.example.com:8883

# From container
docker exec loradb sh -c "apk add openssl && openssl s_client -connect chirpstack.example.com:8883"

# Check MQTT credentials in .env
grep MQTT .env
```

### Storage Issues
```bash
# Check data directory permissions (inside container)
docker exec loradb ls -ld /var/lib/loradb/data  # Should be owned by loradb user

# Check WAL recovery
docker-compose logs loradb | grep "Recovered"

# Inspect data volume
docker volume inspect loradb_loradb-data

# Native deployment
ls -ld /var/lib/loradb/data  # Should be 0700
```

### API Authentication
```bash
# Verify JWT secret length (must be ≥32 chars)
echo -n "$LORADB_API_JWT_SECRET" | wc -c

# Test token generation with correct algorithm (HS256)

# Docker: Test API access
curl -k https://localhost:8443/health
```

## Limitations

### V1 Scope
- ❌ No WASM/JavaScript payload decoders (use pre-decoded from network server)
- ❌ No clustering/replication (single-node only)
- ❌ No time-series aggregation functions (use external tools)

### Future Enhancements
- [ ] Multi-node clustering
- [ ] Aggregate functions (AVG, MIN, MAX, COUNT)
- [ ] Grafana datasource plugin
- [ ] Prometheus metrics exporter

## License

MIT License - See LICENSE file for details

## Contributing

Contributions welcome! Please:
1. Run `cargo test` before submitting
2. Follow Rust idioms and style guidelines
3. Add tests for new features
4. Update documentation

## Support

- **Issues**: https://github.com/yourusername/loradb/issues
- **Discussions**: https://github.com/yourusername/loradb/discussions
- **Security**: security@yourdomain.com

## Acknowledgments

Built with:
- Rust async runtime: [tokio](https://tokio.rs)
- HTTP framework: [axum](https://github.com/tokio-rs/axum) 0.6
- MQTT client: [rumqttc](https://github.com/bytebeamio/rumqtt)
- Cryptography: [aes-gcm](https://github.com/RustCrypto/AEADs), [jsonwebtoken](https://github.com/Keats/jsonwebtoken)
- Concurrency: [crossbeam](https://github.com/crossbeam-rs/crossbeam), [dashmap](https://github.com/xacrimon/dashmap)
- Compression: [lz4](https://github.com/10xGenomics/lz4-rs)
