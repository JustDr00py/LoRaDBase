# LoRaDB Manager - Quick Start Guide

## Easiest Way to Run

Choose one of these methods (from easiest to most control):

### Option 0: Global Alias (Run from Anywhere!) 🚀
Install a global `loradb` command once:

```bash
./install-alias.sh
source ~/.bashrc  # or ~/.zshrc
```

Then from **any directory**, just type:
```bash
loradb
```

### Option 1: Simple Run Script (Recommended)
The absolute easiest way - handles everything automatically:

```bash
./run.sh
```

That's it! The script will:
- Create a virtual environment if it doesn't exist
- Install dependencies automatically
- Run the application

### Option 2: Using Make
If you have `make` installed:

```bash
make run
```

Or to see all available commands:
```bash
make help
```

### Option 3: One-Time Install, Then Simple Command
Install once:
```bash
make install
# OR manually:
python3 -m venv venv
source venv/bin/activate
pip install -e .
```

Then run anytime with just:
```bash
source venv/bin/activate
loradb-manager  # Package/command name (different from folder name)
```

### Option 4: Manual (Full Control)
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m loradb_manager.main
```

## Prerequisites

- Python 3.10 or higher
- Docker installed and running
- Docker Compose V2 (included with modern Docker)

## First Time Setup

The first time you run the application, it will:
1. Check for Docker connectivity
2. Validate that required template directories exist
3. Create the instances directory if needed

Make sure Docker is running before starting the application!

## Troubleshooting

### "Docker daemon not available"
- Start Docker: `sudo systemctl start docker`
- Or use Docker Desktop if on Mac/Windows

### "Permission denied: /var/run/docker.sock"
- Add user to docker group: `sudo usermod -aG docker $USER`
- Log out and back in

### "Templates not found"
- Make sure you're in the correct directory
- Check that LoRaDB directory exists

## Daily Usage

After first-time setup, just run:
```bash
./run.sh
```

Or if you installed it:
```bash
make run
```
