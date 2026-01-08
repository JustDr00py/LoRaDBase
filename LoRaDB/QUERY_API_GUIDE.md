# LoRaDB Query API Guide

Complete guide to using the LoRaDB Query API for retrieving and analyzing LoRaWAN network traffic data.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [API Endpoints](#api-endpoints)
- [Query DSL Syntax](#query-dsl-syntax)
- [Query Examples](#query-examples)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Best Practices](#best-practices)
- [Common Use Cases](#common-use-cases)

---

## Overview

LoRaDB provides a REST API for querying stored LoRaWAN frames using a custom Domain-Specific Language (DSL). The API supports:

- Time-range filtering (LAST, SINCE, BETWEEN)
- Frame type filtering (uplink, downlink, join)
- Field projection with nested path support
- Device-specific queries
- JSON response format

**Base URL**: `https://your-domain.com` (or `http://localhost:8443` for local development)

---

## Authentication

All query endpoints (except `/health`) require JWT authentication using Bearer tokens.

### Generating JWT Tokens

Use the `generate-token` utility to create authentication tokens:

```bash
# Using the binary directly
./target/release/generate-token <username> [jwt_secret] [expiration_hours]

# Using Docker
docker compose exec loradb generate-token <username>

# Using cargo
cargo run --bin generate-token -- <username>
```

**Examples**:

```bash
# Generate token for user "admin" with default 1-hour expiration
generate-token admin

# Generate token with 24-hour expiration
generate-token admin my-secret-key 24

# Using environment variables
export LORADB_API_JWT_SECRET="your-secret-key"
export LORADB_API_JWT_EXPIRATION_HOURS=8
generate-token admin
```

The utility will output:

```
Generated JWT token for user 'admin':
Expiration: 1 hour

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Use this token in API requests:
curl -H 'Authorization: Bearer eyJhbGc...' https://your-domain.com/devices
```

### Using JWT Tokens

Include the token in the `Authorization` header of your HTTP requests:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -X POST https://your-domain.com/query \
     -H "Content-Type: application/json" \
     -d '{"query": "SELECT * FROM device '\''0123456789ABCDEF'\'' WHERE LAST '\''1h'\''"}'
```

### JWT Token Details

- **Algorithm**: HS256 (HMAC with SHA-256)
- **Secret**: Minimum 32 characters (configured via `LORADB_API_JWT_SECRET`)
- **Default Expiration**: 1 hour (configurable via `LORADB_API_JWT_EXPIRATION_HOURS`)
- **Clock Skew Tolerance**: 60 seconds

### Token Expiration

Tokens expire after the configured period. When a token expires, you'll receive:

```json
{
  "error": "AuthError",
  "message": "Token validation failed: ExpiredSignature"
}
```

Generate a new token using the `generate-token` utility.

---

## API Endpoints

### 1. Health Check

Check if the API server is running.

**Endpoint**: `GET /health`

**Authentication**: Not required

**Request**:

```bash
curl https://your-domain.com/health
```

**Response** (200 OK):

```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

### 2. Execute Query

Execute a query using the LoRaDB Query DSL.

**Endpoint**: `POST /query`

**Authentication**: Required (JWT Bearer token)

**Request Body**:

```json
{
  "query": "SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'"
}
```

**Request Example**:

```bash
curl -X POST https://your-domain.com/query \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT * FROM device '\''0123456789ABCDEF'\'' WHERE LAST '\''24h'\''"
  }'
```

**Response** (200 OK):

```json
{
  "dev_eui": "0123456789ABCDEF",
  "total_frames": 42,
  "frames": [
    {
      "frame_type": "Uplink",
      "dev_eui": "0123456789ABCDEF",
      "application_id": "app-001",
      "device_name": "sensor-01",
      "received_at": "2025-01-26T12:34:56Z",
      "f_port": 1,
      "f_cnt": 123,
      "confirmed": false,
      "adr": true,
      "dr": { "modulation": "LoRa", "bandwidth": 125000, "spreading_factor": 7 },
      "frequency": 868100000,
      "rx_info": [...],
      "decoded_payload": {
        "object": {
          "temperature": 22.5,
          "humidity": 65.0
        }
      },
      "raw_payload": "base64-encoded-data"
    }
  ]
}
```

---

### 3. List Devices

Get a list of all registered devices.

**Endpoint**: `GET /devices`

**Authentication**: Required (JWT Bearer token)

**Request**:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://your-domain.com/devices
```

**Response** (200 OK):

```json
{
  "total_devices": 3,
  "devices": [
    {
      "dev_eui": "0123456789ABCDEF",
      "device_name": "sensor-01",
      "application_id": "app-001",
      "last_seen": "2025-01-26T12:34:56Z"
    },
    {
      "dev_eui": "FEDCBA9876543210",
      "device_name": "sensor-02",
      "application_id": "app-001",
      "last_seen": "2025-01-26T11:20:30Z"
    }
  ]
}
```

---

### 4. Get Device Info

Retrieve information about a specific device.

**Endpoint**: `GET /devices/:dev_eui`

**Authentication**: Required (JWT Bearer token)

**Path Parameters**:
- `dev_eui`: Device EUI (16 hexadecimal characters)

**Request**:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     https://your-domain.com/devices/0123456789ABCDEF
```

**Response** (200 OK):

```json
{
  "dev_eui": "0123456789ABCDEF",
  "device_name": "sensor-01",
  "application_id": "app-001",
  "last_seen": "2025-01-26T12:34:56Z"
}
```

**Error Response** (400 Bad Request):

```json
{
  "error": "InvalidDevEui",
  "message": "Device 0000000000000000 not found"
}
```

---

## Query DSL Syntax

The LoRaDB Query DSL follows a SQL-like syntax for querying time-series data.

### Grammar

```
Query := SELECT SelectClause FROM FromClause [ WHERE FilterClause ]

SelectClause := *                          -- All frames
              | uplink                      -- Only uplink frames
              | downlink                    -- Only downlink frames
              | join                        -- Only join request/accept frames
              | field1, field2, ...         -- Specific fields (supports nested paths)

FromClause := device 'DevEUI'               -- 16-character hex DevEUI (single quotes)

FilterClause := BETWEEN 'timestamp' AND 'timestamp'  -- Time range
              | SINCE 'timestamp'                     -- From timestamp to present
              | LAST 'duration'                       -- Last N time units
```

### Duration Format

Supported duration units:

| Unit | Example | Description |
|------|---------|-------------|
| `ms` | `500ms` | Milliseconds |
| `s`  | `30s`   | Seconds |
| `m`  | `15m`   | Minutes |
| `h`  | `2h`    | Hours |
| `d`  | `7d`    | Days |
| `w`  | `2w`    | Weeks |

### Timestamp Format

Timestamps must be in RFC 3339 format (ISO 8601):

```
2025-01-26T12:34:56Z
2025-01-26T12:34:56.123Z
2025-01-26T12:34:56+00:00
```

### Field Paths

Field paths use dot notation to access nested JSON fields:

```
f_port                                    -- Top-level field
decoded_payload.object.temperature        -- Nested field
decoded_payload.object.sensor.voltage     -- Deeply nested field
```

---

## Query Examples

### Basic Queries

**Get all frames from a device:**

```sql
SELECT * FROM device '0123456789ABCDEF'
```

**Get only uplink frames:**

```sql
SELECT uplink FROM device '0123456789ABCDEF'
```

**Get only downlink frames:**

```sql
SELECT downlink FROM device '0123456789ABCDEF'
```

**Get only join frames (request + accept):**

```sql
SELECT join FROM device '0123456789ABCDEF'
```

---

### Time-Range Filtering

**Last 1 hour:**

```sql
SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'
```

**Last 24 hours:**

```sql
SELECT uplink FROM device '0123456789ABCDEF' WHERE LAST '24h'
```

**Last 7 days:**

```sql
SELECT * FROM device '0123456789ABCDEF' WHERE LAST '7d'
```

**Since a specific timestamp:**

```sql
SELECT * FROM device '0123456789ABCDEF' WHERE SINCE '2025-01-01T00:00:00Z'
```

**Between two timestamps:**

```sql
SELECT uplink FROM device '0123456789ABCDEF'
WHERE BETWEEN '2025-01-01T00:00:00Z' AND '2025-01-02T00:00:00Z'
```

---

### Field Projection

**Select specific top-level fields:**

```sql
SELECT f_port, f_cnt, received_at FROM device '0123456789ABCDEF' WHERE LAST '1h'
```

**Select nested measurement fields:**

```sql
SELECT decoded_payload.object.temperature, decoded_payload.object.humidity
FROM device '0123456789ABCDEF' WHERE LAST '24h'
```

**Mix top-level and nested fields:**

```sql
SELECT received_at, f_port, decoded_payload.object.co2, decoded_payload.object.TempC_SHT
FROM device '0123456789ABCDEF' WHERE LAST '7d'
```

**Deeply nested sensor data:**

```sql
SELECT decoded_payload.object.sensor.voltage, decoded_payload.object.sensor.status
FROM device '0123456789ABCDEF'
```

---

### Real-World Examples

**Get temperature readings from last 24 hours:**

```sql
SELECT received_at, decoded_payload.object.temperature
FROM device 'a84041c7a1881438' WHERE LAST '24h'
```

**Get CO2 and temperature measurements:**

```sql
SELECT decoded_payload.object.co2, decoded_payload.object.TempC_SHT
FROM device 'a84041c7a1881438' WHERE LAST '1h'
```

**Get all sensor data with metadata:**

```sql
SELECT f_cnt, received_at, decoded_payload.object.temperature,
       decoded_payload.object.humidity, decoded_payload.object.pressure
FROM device 'a84041c7a1881438' WHERE LAST '7d'
```

**Monitor battery voltage:**

```sql
SELECT received_at, decoded_payload.object.battery_voltage
FROM device 'a84041c7a1881438' WHERE LAST '30d'
```

---

## Response Format

### Query Response Structure

```json
{
  "dev_eui": "string",          // Device EUI queried
  "total_frames": 0,            // Number of frames returned
  "frames": [                   // Array of frame objects
    {
      "frame_type": "string",   // "Uplink", "Downlink", "JoinRequest", or "JoinAccept"
      ...                       // Frame-specific fields
    }
  ]
}
```

### Uplink Frame Fields

```json
{
  "frame_type": "Uplink",
  "dev_eui": "0123456789ABCDEF",
  "application_id": "app-001",
  "device_name": "sensor-01",
  "received_at": "2025-01-26T12:34:56Z",
  "f_port": 1,
  "f_cnt": 123,
  "confirmed": false,
  "adr": true,
  "dr": {
    "modulation": "LoRa",
    "bandwidth": 125000,
    "spreading_factor": 7
  },
  "frequency": 868100000,
  "rx_info": [
    {
      "gateway_id": "gateway-01",
      "rssi": -85,
      "snr": 9.5,
      "channel": 0,
      "rf_chain": 0
    }
  ],
  "decoded_payload": {
    "object": {
      "temperature": 22.5,
      "humidity": 65.0
    }
  },
  "raw_payload": "aGVsbG8="
}
```

### Downlink Frame Fields

```json
{
  "frame_type": "Downlink",
  "dev_eui": "0123456789ABCDEF",
  "application_id": "app-001",
  "queued_at": "2025-01-26T12:34:56Z",
  "f_port": 1,
  "f_cnt": 42,
  "confirmed": true,
  "data": "aGVsbG8="
}
```

### Join Request Frame Fields

```json
{
  "frame_type": "JoinRequest",
  "dev_eui": "0123456789ABCDEF",
  "join_eui": "0000000000000000",
  "received_at": "2025-01-26T12:34:56Z",
  "rx_info": [...]
}
```

### Join Accept Frame Fields

```json
{
  "frame_type": "JoinAccept",
  "dev_eui": "0123456789ABCDEF",
  "accepted_at": "2025-01-26T12:34:56Z",
  "dev_addr": "12345678"
}
```

### Field Projection Response

When using field projection, the response contains only the requested fields:

**Query**:
```sql
SELECT received_at, decoded_payload.object.co2, decoded_payload.object.temperature
FROM device '0123456789ABCDEF' WHERE LAST '1h'
```

**Response**:
```json
{
  "dev_eui": "0123456789ABCDEF",
  "total_frames": 10,
  "frames": [
    {
      "received_at": "2025-01-26T12:34:56Z",
      "decoded_payload.object.co2": 450,
      "decoded_payload.object.temperature": 22.5
    },
    {
      "received_at": "2025-01-26T12:35:56Z",
      "decoded_payload.object.co2": 455,
      "decoded_payload.object.temperature": 22.6
    }
  ]
}
```

Note: Fields that don't exist in a frame are silently omitted from the result.

---

## Error Handling

### HTTP Status Codes

| Status | Error Type | Description |
|--------|-----------|-------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid query syntax or device EUI |
| 401 | Unauthorized | Missing or invalid JWT token |
| 500 | Internal Server Error | Query execution error or server issue |

### Error Response Format

```json
{
  "error": "ErrorType",
  "message": "Human-readable error description"
}
```

### Common Errors

**1. Query Parse Error (400)**

Invalid query syntax.

```json
{
  "error": "QueryParseError",
  "message": "Expected keyword 'FROM'"
}
```

**Example causes**:
- Missing required clause (SELECT, FROM)
- Invalid timestamp format
- Invalid duration format
- Unmatched quotes

**2. Authentication Error (401)**

Missing or invalid JWT token.

```json
{
  "error": "AuthError",
  "message": "Token validation failed: ExpiredSignature"
}
```

**Example causes**:
- Missing `Authorization` header
- Expired token
- Invalid token signature
- Malformed token

**3. Invalid DevEUI (400)**

Device not found or invalid DevEUI format.

```json
{
  "error": "InvalidDevEui",
  "message": "Device 0000000000000000 not found"
}
```

**Example causes**:
- Device EUI not 16 hexadecimal characters
- Device not registered in database
- Typo in DevEUI

**4. Query Execution Error (500)**

Error during query execution.

```json
{
  "error": "QueryExecutionError",
  "message": "Storage engine error: IO error reading SSTable"
}
```

**Example causes**:
- Storage engine failure
- Database corruption
- Insufficient disk space

---

## Best Practices

### 1. Use Time-Range Filters

Always use time-range filters (LAST, SINCE, BETWEEN) to limit the amount of data returned:

**Good**:
```sql
SELECT * FROM device '0123456789ABCDEF' WHERE LAST '24h'
```

**Avoid**:
```sql
SELECT * FROM device '0123456789ABCDEF'
```

### 2. Use Field Projection

Request only the fields you need to reduce response size and network overhead:

**Good**:
```sql
SELECT received_at, decoded_payload.object.temperature
FROM device '0123456789ABCDEF' WHERE LAST '1h'
```

**Avoid**:
```sql
SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'
```

### 3. Filter by Frame Type

If you only need uplinks, downlinks, or joins, filter accordingly:

```sql
SELECT uplink FROM device '0123456789ABCDEF' WHERE LAST '24h'
```

### 4. Store and Reuse JWT Tokens

Don't generate a new token for every request. Tokens are valid for the configured expiration period (default 1 hour).

```bash
# Generate token once
TOKEN=$(generate-token admin | grep -A1 "Generated JWT" | tail -n1)

# Reuse for multiple requests
curl -H "Authorization: Bearer $TOKEN" ...
curl -H "Authorization: Bearer $TOKEN" ...
```

### 5. Handle Token Expiration

Implement token refresh logic in your application:

```python
import time
import requests

class LoRaDBClient:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.token = token
        self.token_expires_at = time.time() + 3600  # 1 hour

    def query(self, query_string):
        if time.time() >= self.token_expires_at:
            self._refresh_token()

        response = requests.post(
            f"{self.base_url}/query",
            headers={"Authorization": f"Bearer {self.token}"},
            json={"query": query_string}
        )
        return response.json()
```

### 6. Validate DevEUI Format

Ensure DevEUI is exactly 16 hexadecimal characters:

```python
import re

def is_valid_dev_eui(dev_eui):
    return bool(re.match(r'^[0-9A-Fa-f]{16}$', dev_eui))
```

### 7. Use Specific Time Ranges

For historical analysis, use BETWEEN or SINCE with specific timestamps instead of LAST:

```sql
-- Good for daily reports
SELECT * FROM device '0123456789ABCDEF'
WHERE BETWEEN '2025-01-26T00:00:00Z' AND '2025-01-26T23:59:59Z'

-- Good for recent data
SELECT * FROM device '0123456789ABCDEF' WHERE LAST '1h'
```

### 8. Monitor Query Performance

Log query execution times and adjust time ranges or field projections if queries are slow:

```python
import time

start = time.time()
result = client.query("SELECT * FROM device '...' WHERE LAST '7d'")
duration = time.time() - start

if duration > 5.0:
    print(f"Warning: Query took {duration:.2f}s")
```

### 9. Implement Error Handling

Always handle potential errors when making API requests:

```python
try:
    result = client.query(query_string)
except requests.exceptions.HTTPError as e:
    if e.response.status_code == 401:
        # Token expired, refresh and retry
        client.refresh_token()
        result = client.query(query_string)
    elif e.response.status_code == 400:
        # Invalid query syntax
        error = e.response.json()
        print(f"Query error: {error['message']}")
    else:
        raise
```

### 10. Use HTTPS in Production

Always use HTTPS in production to protect JWT tokens and data in transit. Configure TLS via:

```bash
LORADB_API_TLS_CERT=/path/to/cert.pem
LORADB_API_TLS_KEY=/path/to/key.pem
```

Or use a reverse proxy (Caddy, nginx) for TLS termination.

---

## Common Use Cases

### 1. Temperature Monitoring Dashboard

Query temperature readings for display on a real-time dashboard:

```sql
SELECT received_at, f_cnt, decoded_payload.object.temperature
FROM device 'a84041c7a1881438' WHERE LAST '1h'
```

**Python Example**:

```python
import requests
import matplotlib.pyplot as plt
from datetime import datetime

def fetch_temperature_data(dev_eui, hours=1):
    response = requests.post(
        "https://your-domain.com/query",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"query": f"SELECT received_at, decoded_payload.object.temperature FROM device '{dev_eui}' WHERE LAST '{hours}h'"}
    )
    return response.json()

def plot_temperature(dev_eui):
    data = fetch_temperature_data(dev_eui, hours=24)

    timestamps = [datetime.fromisoformat(f['received_at'].replace('Z', '+00:00'))
                  for f in data['frames']]
    temperatures = [f['decoded_payload.object.temperature']
                   for f in data['frames']]

    plt.plot(timestamps, temperatures)
    plt.xlabel('Time')
    plt.ylabel('Temperature (°C)')
    plt.title(f'Temperature - Device {dev_eui}')
    plt.show()

plot_temperature('a84041c7a1881438')
```

### 2. Air Quality Analysis

Track CO2 levels and other air quality metrics:

```sql
SELECT received_at, decoded_payload.object.co2, decoded_payload.object.TempC_SHT,
       decoded_payload.object.humidity
FROM device 'a84041c7a1881438' WHERE LAST '7d'
```

**JavaScript Example**:

```javascript
const axios = require('axios');

async function getAirQuality(devEui, days = 7) {
  const response = await axios.post('https://your-domain.com/query', {
    query: `SELECT received_at, decoded_payload.object.co2,
            decoded_payload.object.TempC_SHT, decoded_payload.object.humidity
            FROM device '${devEui}' WHERE LAST '${days}d'`
  }, {
    headers: { 'Authorization': `Bearer ${process.env.JWT_TOKEN}` }
  });

  return response.data.frames.map(f => ({
    timestamp: new Date(f.received_at),
    co2: f['decoded_payload.object.co2'],
    temperature: f['decoded_payload.object.TempC_SHT'],
    humidity: f['decoded_payload.object.humidity']
  }));
}

async function checkAirQualityAlerts(devEui) {
  const data = await getAirQuality(devEui, 1);
  const latest = data[data.length - 1];

  if (latest.co2 > 1000) {
    console.log(`ALERT: High CO2 level: ${latest.co2} ppm`);
  }
  if (latest.temperature > 30) {
    console.log(`ALERT: High temperature: ${latest.temperature}°C`);
  }
}
```

### 3. Battery Monitoring

Track device battery levels to predict maintenance needs:

```sql
SELECT received_at, f_cnt, decoded_payload.object.battery_voltage
FROM device 'a84041c7a1881438' WHERE LAST '30d'
```

**Python Example**:

```python
def check_battery_health(dev_eui):
    response = requests.post(
        "https://your-domain.com/query",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"query": f"SELECT received_at, decoded_payload.object.battery_voltage FROM device '{dev_eui}' WHERE LAST '30d'"}
    )

    data = response.json()
    voltages = [f['decoded_payload.object.battery_voltage'] for f in data['frames']]

    if not voltages:
        print(f"No battery data for {dev_eui}")
        return

    avg_voltage = sum(voltages) / len(voltages)
    min_voltage = min(voltages)

    if min_voltage < 3.0:
        print(f"WARNING: Low battery on {dev_eui}: {min_voltage}V")
    elif avg_voltage < 3.3:
        print(f"NOTICE: Battery declining on {dev_eui}: {avg_voltage:.2f}V avg")
    else:
        print(f"Battery healthy on {dev_eui}: {avg_voltage:.2f}V avg")
```

### 4. Network Coverage Analysis

Analyze RSSI and SNR from gateway reception data:

```sql
SELECT received_at, f_cnt, rx_info
FROM device '0123456789ABCDEF' WHERE LAST '7d'
```

**Python Example**:

```python
def analyze_coverage(dev_eui):
    response = requests.post(
        "https://your-domain.com/query",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"query": f"SELECT received_at, rx_info FROM device '{dev_eui}' WHERE LAST '7d'"}
    )

    data = response.json()

    rssi_values = []
    snr_values = []
    gateways = {}

    for frame in data['frames']:
        for rx in frame.get('rx_info', []):
            rssi_values.append(rx['rssi'])
            snr_values.append(rx['snr'])
            gw_id = rx['gateway_id']
            gateways[gw_id] = gateways.get(gw_id, 0) + 1

    print(f"Coverage analysis for {dev_eui}:")
    print(f"  Average RSSI: {sum(rssi_values)/len(rssi_values):.2f} dBm")
    print(f"  Average SNR: {sum(snr_values)/len(snr_values):.2f} dB")
    print(f"  Gateways receiving: {len(gateways)}")
    print(f"  Most common gateway: {max(gateways, key=gateways.get)}")
```

### 5. Frame Counter Monitoring

Detect missing frames by analyzing frame counters:

```sql
SELECT received_at, f_cnt FROM device '0123456789ABCDEF' WHERE LAST '24h'
```

**Python Example**:

```python
def detect_missing_frames(dev_eui):
    response = requests.post(
        "https://your-domain.com/query",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"query": f"SELECT received_at, f_cnt FROM device '{dev_eui}' WHERE LAST '24h'"}
    )

    data = response.json()
    f_cnts = sorted([f['f_cnt'] for f in data['frames']])

    missing = []
    for i in range(len(f_cnts) - 1):
        diff = f_cnts[i+1] - f_cnts[i]
        if diff > 1:
            missing.extend(range(f_cnts[i] + 1, f_cnts[i+1]))

    if missing:
        print(f"Missing frame counters for {dev_eui}: {missing}")
    else:
        print(f"No missing frames for {dev_eui}")
```

### 6. Daily Report Generation

Generate daily summaries of sensor data:

```sql
SELECT * FROM device '0123456789ABCDEF'
WHERE BETWEEN '2025-01-26T00:00:00Z' AND '2025-01-26T23:59:59Z'
```

**Python Example**:

```python
from datetime import datetime, timedelta

def generate_daily_report(dev_eui, date):
    start = f"{date}T00:00:00Z"
    end = f"{date}T23:59:59Z"

    response = requests.post(
        "https://your-domain.com/query",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"query": f"SELECT * FROM device '{dev_eui}' WHERE BETWEEN '{start}' AND '{end}'"}
    )

    data = response.json()

    print(f"Daily Report for {dev_eui} - {date}")
    print(f"Total frames: {data['total_frames']}")

    if data['frames']:
        uplinks = [f for f in data['frames'] if f['frame_type'] == 'Uplink']
        print(f"Uplink frames: {len(uplinks)}")

        temperatures = [f['decoded_payload']['object'].get('temperature')
                       for f in uplinks if f.get('decoded_payload')]
        temperatures = [t for t in temperatures if t is not None]

        if temperatures:
            print(f"Temperature - Min: {min(temperatures):.1f}°C, "
                  f"Max: {max(temperatures):.1f}°C, "
                  f"Avg: {sum(temperatures)/len(temperatures):.1f}°C")

# Generate report for yesterday
yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
generate_daily_report('a84041c7a1881438', yesterday)
```

### 7. Multi-Device Monitoring

Query multiple devices in parallel:

```python
import concurrent.futures

def query_device(dev_eui):
    response = requests.post(
        "https://your-domain.com/query",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"query": f"SELECT uplink FROM device '{dev_eui}' WHERE LAST '1h'"}
    )
    return dev_eui, response.json()

def monitor_all_devices(device_list):
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = executor.map(query_device, device_list)

    for dev_eui, data in results:
        print(f"{dev_eui}: {data['total_frames']} frames in last hour")

devices = ['0123456789ABCDEF', 'FEDCBA9876543210', 'a84041c7a1881438']
monitor_all_devices(devices)
```

### 8. Alerting System

Build an alerting system based on sensor thresholds:

```python
import time

def check_alerts(dev_eui, thresholds):
    response = requests.post(
        "https://your-domain.com/query",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"query": f"SELECT received_at, decoded_payload.object FROM device '{dev_eui}' WHERE LAST '5m'"}
    )

    data = response.json()

    if data['frames']:
        latest = data['frames'][-1]
        obj = latest.get('decoded_payload.object', {})

        alerts = []
        for metric, threshold in thresholds.items():
            value = obj.get(metric)
            if value is not None and value > threshold:
                alerts.append(f"{metric}: {value} (threshold: {threshold})")

        if alerts:
            print(f"ALERTS for {dev_eui}:")
            for alert in alerts:
                print(f"  - {alert}")

# Run alerting loop
thresholds = {
    'temperature': 30,
    'co2': 1000,
    'humidity': 80
}

while True:
    check_alerts('a84041c7a1881438', thresholds)
    time.sleep(300)  # Check every 5 minutes
```

---

## Additional Resources

- [CLAUDE.md](./CLAUDE.md) - Project architecture and development guide
- [README.md](./README.md) - Project overview and setup instructions
- [API Source Code](./src/api/) - HTTP server and handler implementation
- [Query Source Code](./src/query/) - Query parser and executor

---

## Support and Feedback

For issues, questions, or feature requests, please refer to the project repository or contact your system administrator.
