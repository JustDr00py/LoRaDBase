# Remote Deployment Quick Start Guide

This guide helps you deploy LoRaDB UI on a **separate computer/network** from your LoRaDB server.

## Overview

```
Computer A (LoRaDB Server)  ←→  Computer B (UI Server)  ←→  Your Browser
   192.168.1.100:8080          192.168.1.200:3000/3001      Any device
```

## Prerequisites Checklist

- [ ] LoRaDB is running and accessible
- [ ] You know LoRaDB server's IP address
- [ ] You have the JWT secret from LoRaDB server
- [ ] UI server can reach LoRaDB server (test with ping/curl)
- [ ] Docker and Docker Compose installed on UI server

## Quick Setup (5 Steps)

### Step 1: Get LoRaDB Information

**On LoRaDB Server**, run:
```bash
# Get IP address
hostname -I
# Example output: 192.168.1.100

# Get JWT secret
docker exec loradb env | grep JWT_SECRET
# Example output: JWT_SECRET=your-32-character-secret-key
```

**Write these down!**
- LoRaDB IP: `__________________`
- JWT Secret: `__________________`

### Step 2: Copy UI Files to UI Server

Transfer the `loradb-ui` directory to your UI server:
```bash
# Option 1: SCP
scp -r loradb-ui/ user@ui-server-ip:/home/user/

# Option 2: Git clone (if in repo)
ssh user@ui-server-ip
git clone <repo-url>
cd loradb-ui
```

### Step 3: Configure on UI Server

**On UI Server**, create `.env`:
```bash
cd loradb-ui
cp .env.example .env
nano .env
```

Edit these values:
```bash
# LoRaDB Server IP (from Step 1)
LORADB_API_URL=http://192.168.1.100:8080

# JWT Secret (MUST match LoRaDB exactly!)
JWT_SECRET=your-32-character-secret-key

# UI Server IP (your current machine's IP)
# Get it with: hostname -I
VITE_API_URL=http://192.168.1.200:3001
CORS_ORIGIN=http://192.168.1.200:3000

# Ports (can keep defaults)
BACKEND_PORT=3001
FRONTEND_PORT=3000
JWT_EXPIRATION_HOURS=1
```

### Step 4: Test Connectivity

**Before starting services, test connection:**
```bash
# Test 1: Can UI server reach LoRaDB?
curl http://192.168.1.100:8080/health

# Expected: {"status":"ok","version":"0.1.0"}
# If it fails, check firewall on LoRaDB server
```

### Step 5: Start UI Services

```bash
# Build and start
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### Step 6: Access from Your Browser

**From ANY computer on the network:**

Open browser and go to:
```
http://192.168.1.200:3000
```
(Replace with your UI server's IP)

## Configuration Examples

### Example 1: Both on Same Local Network

```bash
# .env on UI Server
LORADB_API_URL=http://192.168.1.100:8080
JWT_SECRET=my-secret-key-that-matches-exactly
VITE_API_URL=http://192.168.1.200:3001
CORS_ORIGIN=http://192.168.1.200:3000
```

### Example 2: LoRaDB with Domain Name

```bash
# .env on UI Server
LORADB_API_URL=https://loradb.mycompany.com
JWT_SECRET=my-secret-key-that-matches-exactly
VITE_API_URL=http://192.168.1.200:3001
CORS_ORIGIN=http://192.168.1.200:3000
```

### Example 3: UI Also with Domain Name

```bash
# .env on UI Server (both with domains)
LORADB_API_URL=https://loradb.mycompany.com
JWT_SECRET=my-secret-key-that-matches-exactly
VITE_API_URL=https://loradb-ui.mycompany.com/api
CORS_ORIGIN=https://loradb-ui.mycompany.com
```

## Firewall Configuration

### On LoRaDB Server

Allow incoming connections on API port:
```bash
sudo ufw allow 8080/tcp
# or if using HTTPS:
sudo ufw allow 8443/tcp
```

### On UI Server

Allow incoming connections on UI ports:
```bash
sudo ufw allow 3000/tcp  # Frontend
sudo ufw allow 3001/tcp  # Backend API
```

## Common Issues & Solutions

### Issue 1: "Service Unavailable" or Connection Refused

**Cause:** UI backend can't reach LoRaDB server

**Solution:**
```bash
# Test from UI server
curl http://LORADB_IP:8080/health

# If it fails:
# 1. Check LoRaDB is running
# 2. Check firewall on LoRaDB server
# 3. Verify IP is correct
# 4. Try: telnet LORADB_IP 8080
```

### Issue 2: "Unauthorized" / Token Invalid

**Cause:** JWT secrets don't match

**Solution:**
```bash
# Compare secrets
# On LoRaDB:
docker exec loradb env | grep JWT_SECRET

# On UI:
docker exec loradb-ui-backend env | grep JWT_SECRET

# They must be EXACTLY the same!
# If different, update .env and rebuild:
docker compose down
nano .env  # Fix JWT_SECRET
docker compose up -d
```

### Issue 3: Can't Access UI from Browser

**Cause:** Firewall or wrong VITE_API_URL

**Solution:**
```bash
# Check UI is running
docker compose ps

# Test backend from another computer
curl http://UI_SERVER_IP:3001/

# Check firewall
sudo ufw status

# If needed, allow ports
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
```

### Issue 4: Frontend Loads but API Calls Fail

**Cause:** VITE_API_URL or CORS_ORIGIN misconfigured

**Solution:**
```bash
# Verify in .env:
# VITE_API_URL should match how you access the UI
# If accessing via http://192.168.1.200:3000
# Then VITE_API_URL should be http://192.168.1.200:3001

# Rebuild frontend after changing:
docker compose down
docker compose build frontend
docker compose up -d
```

## Verification Checklist

After setup, verify:

- [ ] Backend can reach LoRaDB: `curl http://LORADB_IP:8080/health`
- [ ] Backend is running: `docker ps | grep loradb-ui-backend`
- [ ] Frontend is running: `docker ps | grep loradb-ui-frontend`
- [ ] Can access backend: `curl http://UI_SERVER_IP:3001/`
- [ ] Can access frontend: Open `http://UI_SERVER_IP:3000` in browser
- [ ] Can login and generate token
- [ ] Can view devices (if any exist)
- [ ] Can execute queries

## Need Help?

1. Check logs: `docker compose logs`
2. Check specific service: `docker compose logs backend` or `docker compose logs frontend`
3. Verify network connectivity: `ping` and `curl` between servers
4. Compare JWT secrets on both servers
5. Check firewall rules on both servers
6. Consult main README.md for detailed troubleshooting

## Security Notes

- Use HTTPS in production (reverse proxy with Caddy/nginx)
- Use strong JWT secrets (32+ characters)
- Restrict firewall to specific IPs if possible
- Keep Docker images updated
- Monitor logs for suspicious activity
