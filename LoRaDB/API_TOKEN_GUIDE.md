# API Token Management Guide

LoRaDB supports two authentication methods:
1. **JWT Tokens** - Short-lived tokens (default: 1 hour) for interactive sessions
2. **API Tokens** - Long-lived tokens for dashboards, applications, and automation

## Why Use API Tokens?

API tokens are ideal for:
- **Dashboard Applications** - No need to re-authenticate frequently
- **Automated Scripts** - Reliable authentication without expiration concerns
- **Service Integrations** - Long-running services that query LoRaDB
- **Multiple Applications** - Create separate tokens for each application
- **Security Management** - Revoke specific tokens without affecting others

## Authentication Methods Comparison

| Feature | JWT Tokens | API Tokens |
|---------|-----------|------------|
| Expiration | 1 hour (configurable) | Custom or never |
| Revocation | Cannot revoke | Can revoke anytime |
| Multiple tokens | No | Yes, per user |
| Token naming | No | Yes |
| Usage tracking | No | Yes (last used) |
| Best for | Interactive sessions | Applications/Dashboards |

## Creating API Tokens

### Method 1: Using the CLI (Recommended for initial setup)

```bash
# Generate an API token that never expires
./target/release/generate-api-token /var/lib/loradb/data admin "Production Dashboard"

# Generate an API token that expires in 365 days
./target/release/generate-api-token /var/lib/loradb/data admin "Dev Environment" 365
```

**Docker:**
```bash
docker compose exec loradb generate-api-token /var/lib/loradb/data admin "Production Dashboard"
```

### Method 2: Using the API (Recommended for self-service)

First, authenticate with a JWT token:

```bash
# Generate a JWT token for authentication
JWT_TOKEN=$(./target/release/generate-token admin)

# Create an API token via the API
curl -X POST https://your-domain.com/tokens \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Dashboard",
    "expires_in_days": 365
  }'
```

Response:
```json
{
  "token": "ldb_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Production Dashboard",
  "created_at": "2025-11-27T10:00:00Z",
  "expires_at": "2026-11-27T10:00:00Z"
}
```

**⚠️ Important:** Save the `token` value immediately. It won't be shown again!

## Using API Tokens

API tokens use the same `Authorization` header format as JWT tokens:

```bash
# Query devices
curl -H "Authorization: Bearer ldb_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456" \
  https://your-domain.com/devices

# Execute a query
curl -X POST https://your-domain.com/query \
  -H "Authorization: Bearer ldb_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT * FROM device '\''0123456789ABCDEF'\'' WHERE LAST '\''1h'\''"}'
```

### JavaScript Example (Dashboard)

```javascript
const API_TOKEN = 'ldb_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456';

async function fetchDevices() {
  const response = await fetch('https://your-domain.com/devices', {
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`
    }
  });
  return response.json();
}
```

### Python Example (Script)

```python
import requests

API_TOKEN = 'ldb_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456'

headers = {
    'Authorization': f'Bearer {API_TOKEN}'
}

response = requests.get('https://your-domain.com/devices', headers=headers)
devices = response.json()
```

## Managing API Tokens

### List Your Tokens

```bash
curl -H "Authorization: Bearer $JWT_TOKEN" \
  https://your-domain.com/tokens
```

Response:
```json
{
  "total": 3,
  "tokens": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Production Dashboard",
      "created_by": "admin",
      "created_at": "2025-11-27T10:00:00Z",
      "last_used_at": "2025-11-27T14:30:00Z",
      "expires_at": "2026-11-27T10:00:00Z",
      "is_active": true
    },
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "name": "Dev Environment",
      "created_by": "admin",
      "created_at": "2025-11-20T08:00:00Z",
      "last_used_at": "2025-11-26T12:00:00Z",
      "expires_at": null,
      "is_active": true
    }
  ]
}
```

### Revoke a Token

When you no longer need a token or suspect it's been compromised:

```bash
# Revoke by token ID
curl -X DELETE https://your-domain.com/tokens/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

The token will immediately stop working.

## Token Format

API tokens follow this format:
- **Prefix:** `ldb_` (for easy identification)
- **Length:** 36 characters total
- **Character set:** Alphanumeric (base62: 0-9, A-Z, a-z)
- **Example:** `ldb_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456`

## Security Best Practices

### 1. Token Storage
- **Never commit tokens to git** - Add them to `.gitignore`
- **Use environment variables** for token storage
- **Use secrets managers** in production (AWS Secrets Manager, HashiCorp Vault, etc.)

```bash
# Store in environment variable
export LORADB_API_TOKEN="ldb_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456"

# Use in scripts
curl -H "Authorization: Bearer $LORADB_API_TOKEN" https://your-domain.com/devices
```

### 2. Token Naming
Use descriptive names that indicate:
- **Purpose:** "Production Dashboard", "Monitoring Script"
- **Environment:** "Production API", "Staging Tests"
- **Owner:** "Jenkins CI", "Grafana Dashboard"

### 3. Token Expiration
- **Short-lived tokens (30-90 days):** For development and testing
- **Long-lived tokens (1 year):** For stable production dashboards
- **No expiration:** Only for critical internal services with monitoring

### 4. Token Rotation
Rotate tokens periodically:
1. Create a new token
2. Update your application to use the new token
3. Revoke the old token
4. Verify everything works

### 5. Monitoring
- Regularly review `last_used_at` timestamps
- Revoke tokens that haven't been used in months
- Check for unexpected usage patterns

## Token Lifecycle

```mermaid
graph LR
    A[Create Token] --> B[Active]
    B --> C{Used?}
    C -->|Yes| D[Update last_used_at]
    C -->|No| E{Expired?}
    D --> B
    E -->|Yes| F[Cleanup/Remove]
    E -->|No| B
    B --> G[Revoke]
    G --> H[Inactive]
```

## API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/tokens` | Create new API token | Yes (JWT or API Token) |
| GET | `/tokens` | List your API tokens | Yes (JWT or API Token) |
| DELETE | `/tokens/:id` | Revoke an API token | Yes (JWT or API Token) |

## Troubleshooting

### Token Not Working

1. **Check token format:** Must start with `ldb_`
2. **Verify token is active:**
   ```bash
   curl -H "Authorization: Bearer $JWT_TOKEN" https://your-domain.com/tokens
   ```
3. **Check expiration:** Look at `expires_at` field
4. **Verify API endpoint:** Ensure you're using the correct URL

### Common Errors

| Error | Status | Cause | Solution |
|-------|--------|-------|----------|
| Token validation failed | 401 | Invalid token | Check token is correct and not revoked |
| Token has expired | 401 | Token past expiration date | Create a new token |
| Token has been revoked | 401 | Token manually revoked | Create a new token |
| Unauthorized | 401 | Missing Authorization header | Add header: `Authorization: Bearer <token>` |

## Migration from JWT to API Tokens

If you're currently using JWT tokens in your dashboard:

1. **Create an API token:**
   ```bash
   ./target/release/generate-api-token /var/lib/loradb/data admin "Dashboard" 365
   ```

2. **Update your application:**
   ```javascript
   // OLD: JWT Token (expires in 1 hour)
   const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

   // NEW: API Token (expires in 365 days or never)
   const token = 'ldb_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456';

   // Same usage - just update the token value
   fetch('https://your-domain.com/devices', {
     headers: { 'Authorization': `Bearer ${token}` }
   });
   ```

3. **Test thoroughly** before removing JWT generation

4. **Remove JWT token generation** from your deployment

## Advanced: Automated Token Rotation

For high-security environments, implement automatic token rotation:

```bash
#!/bin/bash
# rotate-api-token.sh

OLD_TOKEN_ID="$1"
JWT_TOKEN="$2"
API_URL="https://your-domain.com"

# Create new token
NEW_TOKEN=$(curl -s -X POST "$API_URL/tokens" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Production Dashboard (Rotated)", "expires_in_days": 365}' \
  | jq -r '.token')

echo "New token: $NEW_TOKEN"

# Update your application with new token here
# ... (update config, restart service, etc.)

# Revoke old token
curl -X DELETE "$API_URL/tokens/$OLD_TOKEN_ID" \
  -H "Authorization: Bearer $JWT_TOKEN"

echo "Old token revoked"
```

Run this script monthly or quarterly as needed.

## Support

For issues or questions:
- Check logs: `docker compose logs loradb`
- Verify token storage: Check `/var/lib/loradb/data/api_tokens.json`
- Review documentation: See project README and issue tracker
