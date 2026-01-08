# LoRaDB Instance Manager

A powerful Textual-based TUI application for managing multiple LoRaDB deployments on a single machine.

[![Python](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![Docker](https://img.shields.io/badge/docker-required-blue.svg)](https://www.docker.com/)
[![Textual](https://img.shields.io/badge/textual-TUI-purple.svg)](https://textual.textualize.io/)

---

## 🚀 Quick Start

**First time? Just run:**

```bash
./run.sh
```

That's it! The script handles everything automatically (venv creation, dependency installation, app launch).

**Want more options?** See [QUICKSTART.md](QUICKSTART.md) for:
- Using Make commands
- Installing a global `loradb` alias
- Manual installation methods

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Deployment](#deployment)
- [Usage](#usage)
- [Instance Management](#instance-management)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Overview

LoRaDB Instance Manager enables you to run multiple isolated LoRaDB instances on a single machine, each with:

- **Complete LoRaDB backend** - Rust-based time-series database
- **Isolated Docker resources** - Unique networks, volumes, containers
- **Independent configurations** - Separate .env files and settings
- **Automatic port allocation** - No manual port management needed
- **Real-time monitoring** - Live log streaming and status updates

Perfect for:
- Development environments with multiple projects
- Testing different configurations
- Multi-tenant deployments
- Demo and staging environments

---

## Features

### 🎯 Core Features

- **Instance Creation Wizard** - 3-step guided setup with auto-configuration
- **Lifecycle Management** - Start, stop, restart, rebuild instances
- **Real-time Log Streaming** - Non-blocking async log viewer with container selection
- **Configuration Editor** - Built-in .env editor with validation
- **Status Dashboard** - Live status updates for all instances
- **Port Management** - Automatic allocation and conflict resolution
- **Keyboard Shortcuts** - Fast navigation and control
- **Docker Integration** - Full Docker Compose support

### 🔥 Recent Improvements

- ✅ Fixed screen navigation (proper screen stack management)
- ✅ Non-blocking log streaming (async worker with threading)
- ✅ Escape key works from any screen
- ✅ Easy deployment with `run.sh` and Makefile
- ✅ Global alias support for running from anywhere

---

## Prerequisites

### Required Software

1. **Python 3.10 or higher**
   ```bash
   python3 --version
   ```

2. **Docker** with Docker Compose V2
   ```bash
   docker --version
   docker compose version
   ```

3. **LoRaDB Templates** at:
   - `/home/sysadmin/Documents/LoRaDepo/LoRaDB`

### System Requirements

- **OS**: Linux (tested on OpenSUSE), macOS, or WSL2 on Windows
- **RAM**: Minimum 4GB (more for multiple instances)
- **Disk**: ~2GB per instance
- **Permissions**: Docker group membership (for non-root access)

### Docker Setup

Add your user to the docker group (Linux):
```bash
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

Start Docker daemon:
```bash
sudo systemctl start docker
sudo systemctl enable docker  # Auto-start on boot
```

---

## Deployment

### Method 1: Simple Script (Recommended) ⭐

The easiest way to deploy and run:

```bash
# Clone or navigate to the directory
cd /home/sysadmin/Documents/LoRaDepo/LoRaDB-manager

# Run the application
./run.sh
```

The script automatically:
- ✅ Creates virtual environment if missing
- ✅ Installs/updates dependencies
- ✅ Runs the application

**No manual setup required!**

### Method 2: Using Make

```bash
# Install dependencies (first time only)
make install

# Run the application
make run

# See all available commands
make help
```

Available make targets:
- `make run` - Run the application (auto-installs if needed)
- `make install` - Install in development mode
- `make dev` - Install with development dependencies
- `make clean` - Remove venv and cache files
- `make help` - Show help message

### Method 3: Global Alias (Run from Anywhere)

One-time setup:
```bash
./install-alias.sh
source ~/.bashrc  # or ~/.zshrc
```

Then from any directory:
```bash
loradb
```

### Method 4: Manual Installation

For full control:

```bash
# Create virtual environment
python3 -m venv venv

# Activate venv
source venv/bin/activate  # Linux/Mac
# OR
venv\Scripts\activate  # Windows

# Install package
pip install -e .

# Run
loradb-manager
```

### Docker Deployment (Optional)

You can also containerize the manager itself:

```dockerfile
# Dockerfile example (not included by default)
FROM python:3.11-slim

RUN apt-get update && apt-get install -y docker.io

WORKDIR /app
COPY . .

RUN pip install -e .

CMD ["loradb-manager"]
```

---

## Usage

### Starting the Application

Choose your preferred method:

```bash
./run.sh           # Simple script
make run           # Using make
loradb             # If alias installed
loradb-manager     # If installed and venv activated
```

### Keyboard Shortcuts

#### Main Screen
| Key | Action |
|-----|--------|
| `c` | Create new instance |
| `s` | Start selected instance |
| `t` | Stop selected instance |
| `r` | Refresh instance list |
| `b` | Rebuild instance |
| `l` | View logs |
| `e` | Edit configuration |
| `d` | Delete instance |
| `Enter` | View instance details |
| `q` | Quit application |

#### Logs Viewer
| Key | Action |
|-----|--------|
| `Escape` | Close logs viewer (return to main) |
| `c` | Clear logs |
| Dropdown | Select container (LoRaDB/Backend/Frontend) |

#### Config Editor
| Key | Action |
|-----|--------|
| `Ctrl+S` | Save configuration |
| `Escape` | Close editor |

---

## Instance Management

### Creating an Instance

1. Press `c` to open the create wizard
2. **Step 1 - Basic Info**:
   - **Instance ID**: Unique identifier (lowercase, alphanumeric, hyphens)
   - **Name**: Human-readable name
   - **Description**: Optional
3. **Step 2 - Port Configuration**:
   - LoRaDB API Port (default: 8443)
   - UI Backend Port (default: 3001)
   - UI Frontend Port (default: 3000)
   - Leave blank for auto-allocation
4. **Step 3 - Security**:
   - JWT Secret (auto-generated if blank, min 32 chars)
   - TLS Certificate/Key paths (optional)
5. Click **Create**

The application will:
- Copy templates from LoRaDB directory
- Generate .env files with JWT secrets
- Create unique Docker resources (networks, volumes)
- Allocate available ports automatically

### Managing Instance Lifecycle

#### Start Instance
```
Select instance → Press 's' or click Start
```
- LoRaDB starts first
- Health check performed
- UI services start after LoRaDB is ready

#### Stop Instance
```
Select instance → Press 't' or click Stop
```
- UI services stop first
- LoRaDB stops last
- Graceful shutdown

#### Restart Instance
```
Select instance → Click Restart
```
- Equivalent to Stop + Start

#### Rebuild Instance
```
Select instance → Press 'b' or click Rebuild
```
- Stops instance
- Rebuilds Docker images from templates
- Useful when source code changes
- Starts instance with new images

### Viewing Logs

1. Select instance
2. Press `l` or click **Logs**
3. Select container from dropdown:
   - **LoRaDB** - Database logs
   - **UI Backend** - API server logs
   - **UI Frontend** - Frontend dev server logs
4. Logs stream in real-time (non-blocking)
5. Press `Escape` to return to main screen

**Note**: Log streaming uses async workers with threading to prevent UI freezing.

### Editing Configuration

1. Select instance
2. Press `e` or click **Edit Config**
3. Choose file:
   - LoRaDB .env
   - UI .env
4. Edit configuration
5. Press `Ctrl+S` to save
6. Validation warnings appear for:
   - JWT secret length (<32 chars)
   - Invalid port numbers
   - Missing required fields

**Important**: After editing .env files, restart the instance for changes to take effect.

### Deleting Instance

1. Select instance
2. Press `d` or click **Delete**
3. Instance will:
   - Stop if running
   - Remove Docker containers, networks, volumes
   - Delete instance directory and files
   - Free allocated ports

**Warning**: This action cannot be undone!

---

## Architecture

### Directory Structure

Instances are stored at `~/.loradb-instances/`:

```
~/.loradb-instances/
├── ports.json                  # Port allocation registry
├── instance-1/
│   ├── metadata.json          # Instance metadata
│   ├── loradb/
│   │   ├── docker-compose.yml # Modified with unique names
│   │   ├── .env               # Generated configuration
│   │   ├── Cargo.toml
│   │   ├── src/
│   │   └── ...
│       ├── backend/
│       ├── frontend/
│       └── ...
└── instance-2/
    └── ...
```

### Docker Resources

Each instance creates isolated Docker resources:

**Containers**:
- `loradb-{instance-id}` - LoRaDB database

**Network**:
- `loradb-net-{instance-id}` - Bridge network for inter-container communication

**Volume**:
- `loradb-data-{instance-id}` - Persistent database storage

### Application Architecture

```
┌─────────────────────────────────────┐
│      Textual TUI Framework          │
│  (Async Event Loop, Reactive UI)    │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│          Screen Layer                │
│  - MainScreen (instance list)        │
│  - LogsViewerScreen (real-time logs) │
│  - ConfigEditorScreen (.env editor)  │
│  - CreateInstanceWizard (3-step)     │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│        Business Logic Layer          │
│  - InstanceManager (CRUD ops)        │
│  - DockerManager (Docker SDK)        │
│  - PortAllocator (port management)   │
│  - TemplateManager (file copying)    │
└──────────────┬──────────────────────┘
               │
┌──────────────┴──────────────────────┐
│         Storage Layer                │
│  - Filesystem (instances, metadata)  │
│  - Docker Daemon (containers, etc)   │
└──────────────────────────────────────┘
```

### Component Responsibilities

**InstanceManager** (`core/instance_manager.py`):
- Instance CRUD operations
- Metadata persistence
- Lifecycle coordination

**DockerManager** (`core/docker_manager.py`):
- Docker SDK integration
- Container lifecycle
- Log streaming (generator-based)
- Health checks

**PortAllocator** (`core/port_allocator.py`):
- Automatic port allocation
- Conflict detection
- Persistence to `ports.json`

**TemplateManager** (`core/template.py`):
- Copy templates
- Generate .env files
- Modify docker-compose.yml

---

## Configuration

### Port Allocation

**Default Ports**:
- LoRaDB API: `8443`
- UI Backend: `3001`
- UI Frontend: `3000`

**Auto-Allocation**:
- Range: `8000-9999`
- Algorithm: Sequential search for available port
- Persistence: Tracked in `~/.loradb-instances/ports.json`

**Conflict Resolution**:
If preferred port is taken, the next available port in range is assigned automatically.

### Environment Variables

#### LoRaDB .env

```bash
LORADB_API_PORT=8443
LORADB_API_JWT_SECRET=<auto-generated-32-char-secret>
LORADB_API_CORS_ALLOWED_ORIGINS=http://localhost:3000
LORADB_TLS_CERT_PATH=/path/to/cert.pem  # Optional
LORADB_TLS_KEY_PATH=/path/to/key.pem    # Optional
```

#### UI .env

```bash
BACKEND_PORT=3001
FRONTEND_PORT=3000
LORADB_API_URL=http://loradb-{instance-id}:8443
JWT_SECRET=<same-as-loradb-secret>
VITE_API_URL=http://localhost:3001
CORS_ORIGIN=http://localhost:3000
```

**Critical**: JWT secrets must match between LoRaDB and UI!

### Application Configuration

Edit `loradb_manager/config.py` to customize:

```python
class Config:
    INSTANCES_ROOT = Path.home() / ".loradb-instances"
    LORADB_TEMPLATE = Path("/path/to/LoRaDB")

    # Timeouts
    DOCKER_COMPOSE_TIMEOUT = 300
    CONTAINER_HEALTH_CHECK_TIMEOUT = 60

    # UI
    STATUS_REFRESH_INTERVAL = 5.0  # seconds
    LOG_TAIL_LINES = 100

    # Ports
    PORT_RANGE_START = 8000
    PORT_RANGE_END = 9999
```

---

## Troubleshooting

### Common Issues

#### Docker Not Running

**Error**: `Docker daemon not available`

**Solution**:
```bash
sudo systemctl start docker
sudo systemctl status docker
```

#### Permission Denied

**Error**: `Permission denied: /var/run/docker.sock`

**Solution**:
```bash
sudo usermod -aG docker $USER
# Log out and back in
```

#### Port Already in Use

**Error**: Port conflicts during creation

**Solution**: Leave ports blank in wizard for auto-allocation, or choose different ports.

#### Template Not Found

**Error**: `LoRaDB template not found at /path/to/LoRaDB`

**Solution**:
- Ensure LoRaDB directory exists
- Update paths in `loradb_manager/config.py`

#### Container Won't Start

**Error**: Container exits immediately

**Solution**:
1. Check logs: Press `l` and view container logs
2. Verify .env configuration
3. Check Docker resources: `docker ps -a`
4. Rebuild instance: Press `b`

#### UI Freezing During Log Streaming

**Status**: Fixed in latest version ✅

The log streaming now uses async workers with threading to prevent blocking the UI event loop.

#### Can't Navigate Back from Logs Screen

**Status**: Fixed in latest version ✅

Screen navigation has been fixed:
- MainScreen is now a proper Screen (not Container)
- Escape key has high priority
- Screen stack properly managed

### Debug Mode

Run with verbose output:
```bash
./run.sh --debug  # If implemented
# Or check Textual dev tools:
textual console
# Then run app in another terminal
```

### Logs and Diagnostics

**Instance Logs**:
- View in-app: Press `l`
- Docker logs: `docker logs loradb-{instance-id}`

**Application Errors**:
- Check terminal output where you launched the app
- Textual errors appear in the console

**Docker Status**:
```bash
docker ps  # Running containers
docker network ls | grep loradb  # Networks
docker volume ls | grep loradb   # Volumes
```

---

## Development

### Project Structure

```
LoRaDB-manager/
├── loradb_manager/
│   ├── core/                    # Business logic
│   │   ├── __init__.py
│   │   ├── instance.py          # Instance models
│   │   ├── instance_manager.py  # Instance CRUD
│   │   ├── docker_manager.py    # Docker operations
│   │   ├── port_allocator.py    # Port management
│   │   └── template.py          # Template handling
│   ├── ui/                      # TUI components
│   │   ├── __init__.py
│   │   └── screens/
│   │       ├── __init__.py
│   │       ├── main_screen.py        # Main dashboard
│   │       ├── create_wizard.py      # Instance creation
│   │       ├── logs_viewer.py        # Log streaming
│   │       └── config_editor.py      # .env editor
│   ├── utils/                   # Utilities
│   │   └── __init__.py
│   ├── app.py                   # Main Textual app
│   ├── app.css                  # Textual styling
│   ├── config.py                # Configuration
│   └── main.py                  # Entry point
├── tests/                       # Test suite
├── pyproject.toml              # Package metadata
├── requirements.txt            # Dependencies
├── run.sh                      # Quick launcher
├── Makefile                    # Make targets
├── install-alias.sh            # Alias installer
├── QUICKSTART.md              # Quick start guide
└── README.md                  # This file
```

### Setting Up Development Environment

```bash
# Clone repository
git clone <repo-url>
cd LoRaDB-manager

# Install with dev dependencies
make dev
# OR
pip install -e ".[dev]"

# Run tests
pytest

# Code formatting
black loradb_manager/
ruff check loradb_manager/

# Run application
make run
```

### Adding New Features

1. **New Screen**: Create in `loradb_manager/ui/screens/`
2. **Business Logic**: Add to `loradb_manager/core/`
3. **Update Navigation**: Modify `app.py` or screen bindings
4. **Styling**: Edit `app.css`

### Testing

```bash
# Run all tests
pytest

# Run specific test
pytest tests/test_instance_manager.py

# With coverage
pytest --cov=loradb_manager
```

### Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## Accessing Instances

After starting an instance, access it via:

1. **LoRaDB API**: `https://localhost:{loradb_api_port}`
   - Default: `https://localhost:8443`
   - Check instance details for actual port

2. **UI Frontend**: `http://localhost:{frontend_port}`
   - Default: `http://localhost:3000`
   - React development server

3. **UI Backend**: `http://localhost:{backend_port}/api`
   - Default: `http://localhost:3001/api`
   - Node.js Express server

**Example**:
```bash
# View instance ports
# In TUI: Select instance and press Enter

# Test API (if running)
curl -k https://localhost:8443/api/health

# Open frontend in browser
xdg-open http://localhost:3000
```

---

## FAQ

**Q: Can I run multiple instances simultaneously?**
A: Yes! That's the main purpose of this tool. Each instance gets unique ports and isolated Docker resources.

**Q: How do I update LoRaDB or UI code?**
A: Update the template directories, then rebuild instances with `b` key.

**Q: Can I change ports after instance creation?**
A: Yes, edit the .env files (press `e`), then restart the instance.

**Q: How do I backup an instance?**
A: Copy the instance directory from `~/.loradb-instances/{instance-id}` and backup the Docker volume.

**Q: Can I deploy this in production?**
A: This tool is designed for development/testing. For production, use proper orchestration (K8s, Docker Swarm) and monitoring.

**Q: Why is my log viewer freezing?**
A: Update to the latest version. Log streaming is now non-blocking using async workers.

---

## License

This project is part of the LoRaDepo ecosystem.

---

## Support & Resources

- **LoRaDB Documentation**: [Link to LoRaDB docs]
- **Docker Documentation**: https://docs.docker.com/
- **Textual Framework**: https://textual.textualize.io/
- **Python Docker SDK**: https://docker-py.readthedocs.io/

---

## Changelog

### Recent Updates

**v0.1.0** (Current)
- ✅ Fixed screen navigation (MainScreen as proper Screen)
- ✅ Non-blocking log streaming (async workers + threading)
- ✅ High-priority Escape key binding
- ✅ Easy deployment with run.sh and Makefile
- ✅ Global alias support
- ✅ Improved error handling
- ✅ Real-time status updates
- ✅ Configuration validation

---

## Acknowledgments

- Built with [Textual](https://github.com/Textualize/textual) - amazing TUI framework
- Docker Python SDK for container management
- LoRaDB project

---

**Made with ❤️ for the LoRaDepo ecosystem**
