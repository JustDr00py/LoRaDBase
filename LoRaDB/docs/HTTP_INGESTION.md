# HTTP Ingestion API

## Overview

LoRaDB supports HTTP webhook ingestion from ChirpStack, enabling data ingestion in environments where direct MQTT broker access is unavailable (e.g., Helium networks, managed ChirpStack instances).

The HTTP ingestion endpoint accepts ChirpStack webhook events and stores them using the same data model as MQTT ingestion.

## Supported Event Types

- **Uplink (`up`)** - Device uplink frames containing sensor data
- **Join (`join`)** - Device join events (OTAA activation)
- **Status (`status`)** - Device status events (battery level, link margin)

## Authentication

All HTTP ingestion requests require authentication using either:

1. **JWT Token** (short-lived, 1 hour default)
2. **API Token** (long-lived, recommended for webhooks)

### Generating an API Token

API tokens are recommended for webhook integrations as they are long-lived and can be revoked if compromised.

**Using Docker:**
```bash
docker compose exec loradb generate-token admin
```

**Direct binary:**
```bash
./target/release/generate-token admin
```

Save the generated token securely - you'll need it to configure ChirpStack.

## API Endpoint

### Request Format

```
POST /ingest?event={event_type}
```

**Query Parameters:**
- `event` (required) - Event type: `up`, `join`, or `status`

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer <token>`

**Body:**
- ChirpStack webhook JSON payload (same format as MQTT)

### Response Format

**Success (200 OK):**
```json
{
  "success": true,
  "dev_eui": "0123456789abcdef",
  "event_type": "up"
}
```

**Error (400 Bad Request):**
```json
{
  "error": "QueryParseError",
  "message": "Unsupported event type: ack. Supported: up, join, status"
}
```

**Error (401 Unauthorized):**
```json
{
  "error": "AuthError",
  "message": "Authentication failed"
}
```

## ChirpStack Configuration

### Step 1: Navigate to HTTP Integration

1. Log into ChirpStack web interface
2. Select your Application
3. Go to **Integrations** tab
4. Click **Add** and select **HTTP**

### Step 2: Configure Event Endpoints

ChirpStack requires separate URLs for each event type you want to capture.

**Uplink Events:**
```
https://your-loradb.com/ingest?event=up
```

**Join Events:**
```
https://your-loradb.com/ingest?event=join
```

**Status Events:**
```
https://your-loradb.com/ingest?event=status
```

> **Note:** Replace `your-loradb.com` with your actual LoRaDB server address and port (e.g., `http://192.168.1.100:3000`)

### Step 3: Configure Headers

Add the Authorization header with your API token:

**Header name:**
```
Authorization
```

**Header value:**
```
Bearer your_api_token_here
```

### Step 4: Save and Test

1. Click **Save** to create the integration
2. ChirpStack will test the endpoint
3. Check LoRaDB logs for incoming requests

## Testing with curl

### Test Uplink Ingestion

```bash
curl -X POST "http://localhost:3000/ingest?event=up" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "time": "2025-12-18T12:00:00Z",
    "deviceInfo": {
      "devEui": "0123456789abcdef",
      "applicationId": "test-app",
      "deviceName": "sensor-1"
    },
    "fPort": 1,
    "fCnt": 42,
    "confirmed": false,
    "adr": true,
    "dr": 5,
    "rxInfo": [{
      "gatewayId": "gateway-001",
      "rssi": -50,
      "snr": 10.5
    }],
    "txInfo": {
      "frequency": 868100000
    },
    "object": {
      "temperature": 22.5,
      "humidity": 60.0
    },
    "data": "AQIDBAUGBwg="
  }'
```

### Test Join Ingestion

```bash
curl -X POST "http://localhost:3000/ingest?event=join" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "time": "2025-12-18T12:00:00Z",
    "deviceInfo": {
      "devEui": "0123456789abcdef",
      "applicationId": "test-app",
      "deviceName": "sensor-1"
    },
    "devAddr": "01234567"
  }'
```

### Test Status Ingestion

```bash
curl -X POST "http://localhost:3000/ingest?event=status" \
  -H "Authorization: Bearer <your_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "time": "2025-12-18T12:00:00Z",
    "deviceInfo": {
      "devEui": "0123456789abcdef",
      "applicationId": "test-app",
      "deviceName": "sensor-1"
    },
    "margin": 10,
    "batteryLevel": 85
  }'
```

## Querying Ingested Data

Once data is ingested via HTTP, query it using the same DSL as MQTT-ingested data:

### Query All Frames

```sql
SELECT * FROM device '0123456789abcdef' WHERE LAST '24h'
```

### Query Only Status Frames

```sql
SELECT status FROM device '0123456789abcdef' WHERE LAST '7d'
```

### Query Specific Status Fields

```sql
SELECT margin, battery_level FROM device '0123456789abcdef' WHERE LAST '24h'
```

### Query Uplink Frames

```sql
SELECT uplink FROM device '0123456789abcdef' WHERE LAST '1h'
```

### Query Nested Fields

```sql
SELECT decoded_payload.object.temperature, decoded_payload.object.humidity
FROM device '0123456789abcdef'
WHERE LAST '24h'
```

### Query with LIMIT

```sql
SELECT * FROM device '0123456789abcdef' WHERE LAST '7d' LIMIT 100
```

## Troubleshooting

### ChirpStack Connection Failed

**Symptom:** ChirpStack shows "Connection failed" when testing the integration

**Solutions:**
1. Verify LoRaDB is running and accessible from ChirpStack server
2. Check firewall rules allow traffic on the API port (default: 3000)
3. Ensure URL includes `http://` or `https://` prefix
4. Test connectivity with curl from ChirpStack server

### 401 Unauthorized

**Symptom:** Requests return 401 Unauthorized

**Solutions:**
1. Verify token is valid (generate a new one if expired)
2. Check Authorization header format: `Bearer <token>` (note the space)
3. Ensure JWT secret matches between token generation and server
4. For API tokens, check `api_tokens.json` file exists and is readable

### 400 Bad Request - Unsupported Event Type

**Symptom:** Error message: "Unsupported event type: xxx"

**Solutions:**
1. Verify query parameter is exactly `?event=up`, `?event=join`, or `?event=status`
2. Check for typos in the URL
3. Ensure ChirpStack is sending to the correct URL

### Payload Too Large

**Symptom:** Error about payload size

**Solutions:**
1. Check payload size (max 1MB)
2. Reduce number of gateways in rxInfo array if very large
3. Check for unnecessary data in decoded_payload.object

### Device Not Appearing in Queries

**Symptom:** Data ingested successfully but queries return no results

**Solutions:**
1. Verify DevEUI format (must be 16 hex characters)
2. Check time filter (data might be outside the queried range)
3. List all devices: `GET /devices`
4. Query without time filter first to verify data exists

### ChirpStack Sends Wrong Format

**Symptom:** Parse errors in LoRaDB logs

**Solutions:**
1. Verify ChirpStack version compatibility (v4 format required)
2. Check ChirpStack application decoder is working correctly
3. Review LoRaDB logs for detailed parse error messages
4. Test with curl using exact payload from ChirpStack logs

## Monitoring

### View LoRaDB Logs

**Docker:**
```bash
docker compose logs -f loradb
```

**Direct:**
```bash
# Logs are written to stdout
./target/release/loradb
```

### Successful Ingestion Log

```
INFO loradb::api::handlers: Received ChirpStack webhook event
  user="admin"
  event_type="up"
  payload_size=1234

INFO loradb::api::handlers: Successfully ingested event
  user="admin"
  event_type="up"
  dev_eui="0123456789abcdef"
```

### Failed Ingestion Log

```
WARN loradb::api::handlers: Unsupported event type
  event_type="ack"

ERROR loradb::ingest::chirpstack: ChirpStack uplink JSON parse error: missing field `deviceInfo`
```

## Security Considerations

### API Token Best Practices

1. **Generate separate tokens** for each ChirpStack application
2. **Use descriptive names** when creating tokens (e.g., "chirpstack-app-sensors")
3. **Revoke tokens** immediately if compromised
4. **Monitor token usage** via `GET /tokens` endpoint
5. **Set expiration** for tokens if rotating regularly

### Network Security

1. **Use HTTPS** in production (configure reverse proxy with TLS)
2. **Restrict access** to LoRaDB API port using firewall rules
3. **Use VPN** or private network for ChirpStack ↔ LoRaDB communication
4. **Enable CORS** only for trusted origins

### Configuration Example (Production)

```bash
# .env file
LORADB_API_BIND_ADDR=0.0.0.0:3000
LORADB_API_ENABLE_TLS=false  # Use reverse proxy for TLS
LORADB_API_JWT_SECRET=<long-random-secret-min-32-chars>
LORADB_API_CORS_ALLOWED_ORIGINS=https://your-dashboard.com
```

**Recommended Production Setup:**
```
Internet → Caddy/nginx (HTTPS) → LoRaDB (HTTP on localhost:3000)
```

## Performance

### Rate Limiting

The `/ingest` endpoint currently relies on authentication and Axum's built-in limits:
- **Body size limit:** 2MB (Axum default)
- **Payload size limit:** 1MB (enforced in handler)

Future versions will include configurable rate limiting per user/token.

### Throughput

The HTTP ingestion endpoint writes directly to storage (no channel buffering), making it suitable for:
- **Low to medium volume:** < 100 events/second
- **Burst traffic:** Handles temporary spikes well

For high-volume scenarios (> 1000 events/second), consider:
1. Using MQTT ingestion instead (more efficient)
2. Deploying multiple LoRaDB instances with load balancer
3. Increasing memtable size and flush interval

## Comparison: HTTP vs MQTT Ingestion

| Feature | HTTP Ingestion | MQTT Ingestion |
|---------|----------------|----------------|
| **Setup** | Simple (just configure webhook) | Requires MQTT broker access |
| **Authentication** | JWT/API token per request | MQTT credentials + TLS |
| **Latency** | Slightly higher (HTTP overhead) | Lower (persistent connection) |
| **Reliability** | ChirpStack retries on failure | Automatic reconnection |
| **Use Case** | Managed/restricted environments | Full ChirpStack control |
| **Throughput** | Good (< 100/sec) | Excellent (> 1000/sec) |

## Example Integration Scenarios

### Scenario 1: Helium Network

Helium uses ChirpStack but doesn't expose MQTT broker access.

**Solution:** Use HTTP ingestion
1. Deploy LoRaDB with public IP or domain
2. Configure Helium console with LoRaDB webhook URL
3. Use API tokens for authentication

### Scenario 2: Managed ChirpStack (SaaS)

Using a managed ChirpStack service without MQTT access.

**Solution:** Use HTTP ingestion
1. Ensure LoRaDB is publicly accessible (with TLS)
2. Create API token per application
3. Configure HTTP integration in ChirpStack web UI

### Scenario 3: Self-Hosted ChirpStack

Full control over ChirpStack installation.

**Solution:** Use MQTT ingestion (preferred)
- Lower latency and higher throughput
- More efficient for high-volume scenarios

**Fallback:** HTTP ingestion works as backup/redundancy

## API Reference

### POST /ingest

**Description:** Ingest ChirpStack webhook events

**Query Parameters:**
| Parameter | Type | Required | Values | Description |
|-----------|------|----------|--------|-------------|
| `event` | string | Yes | `up`, `join`, `status` | Event type to ingest |

**Headers:**
| Header | Required | Example | Description |
|--------|----------|---------|-------------|
| `Authorization` | Yes | `Bearer ldb_abc123...` | JWT or API token |
| `Content-Type` | Yes | `application/json` | Must be JSON |

**Request Body:**
ChirpStack webhook JSON payload (format varies by event type)

**Response Codes:**
| Code | Meaning | Description |
|------|---------|-------------|
| 200 | Success | Event ingested successfully |
| 400 | Bad Request | Invalid event type or malformed JSON |
| 401 | Unauthorized | Missing or invalid authentication |
| 413 | Payload Too Large | Payload exceeds 1MB limit |
| 500 | Internal Error | Storage or processing error |

**Example Request:**
```http
POST /ingest?event=up HTTP/1.1
Host: your-loradb.com
Authorization: Bearer ldb_abc123xyz
Content-Type: application/json

{
  "time": "2025-12-18T12:00:00Z",
  "deviceInfo": {
    "devEui": "0123456789abcdef",
    "applicationId": "test-app"
  },
  "fPort": 1,
  "fCnt": 42,
  "object": {
    "temperature": 22.5
  }
}
```

**Example Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "dev_eui": "0123456789abcdef",
  "event_type": "up"
}
```

## Support

For issues or questions:
1. Check LoRaDB logs for detailed error messages
2. Verify ChirpStack webhook configuration
3. Test with curl to isolate the issue
4. File an issue at https://github.com/anthropics/loradb/issues (if applicable)

## Additional Resources

- [ChirpStack HTTP Integration Documentation](https://www.chirpstack.io/docs/chirpstack/integrations/http.html)
- [ChirpStack Event Types](https://www.chirpstack.io/docs/chirpstack/integrations/events.html)
- [LoRaDB Query DSL Guide](../README.md#query-language)
- [API Token Management Guide](../API_TOKEN_GUIDE.md)
