# How to Add Device Types

This folder is mounted into the Docker container, so you can add or modify device type definitions **without rebuilding the Docker image**.

## 🚀 Auto-Discovery Feature

Device types are now automatically discovered! Just follow these 3 simple steps:

1. **Add a new device type**: Create a new `.json` file in this folder
2. **Update the index**: Run `./update-device-types.sh` from the project root
3. **Restart the frontend**: `docker compose restart frontend`

That's it! No code changes required!

## Example: Adding a New Device

Create a file called `my-sensor.json`:

```json
{
  "deviceType": "my-sensor",
  "name": "My Custom Sensor",
  "manufacturer": "My Company",
  "description": "Description of what this sensor does",
  "version": "1.0.0",
  "measurements": [
    {
      "id": "temperature",
      "path": "decoded_payload.temperature",
      "name": "Temperature",
      "unit": "°C",
      "decimals": 1,
      "defaultWidget": "time-series",
      "widgets": {
        "current-value": {
          "enabled": true,
          "thresholds": [
            { "min": -40, "max": 0, "color": "#3b82f6", "label": "Cold" },
            { "min": 0, "max": 25, "color": "#10b981", "label": "Normal" },
            { "min": 25, "max": 50, "color": "#f59e0b", "label": "Warm" }
          ]
        },
        "time-series": {
          "enabled": true,
          "yAxisMin": -10,
          "yAxisMax": 40,
          "showArea": true,
          "color": "#2563eb"
        },
        "gauge": {
          "enabled": true,
          "min": -10,
          "max": 40,
          "zones": [
            { "from": -10, "to": 0, "color": "#3b82f6" },
            { "from": 0, "to": 25, "color": "#10b981" },
            { "from": 25, "to": 40, "color": "#f59e0b" }
          ]
        },
        "status": {
          "enabled": true,
          "conditions": [
            { "operator": "lt", "value": 0, "status": "info", "label": "Cold" },
            { "operator": "between", "min": 0, "max": 25, "status": "success", "label": "Normal" },
            { "operator": "gt", "value": 25, "status": "warning", "label": "Warm" }
          ]
        }
      }
    }
  ]
}
```

## Step-by-Step Workflow

### Adding Your First Custom Device

```bash
# 1. Navigate to the device-types folder
cd /home/sysadmin/Documents/LoRaDB-UI/device-types

# 2. Create your device type file (copy from an existing example)
cp dragino-lht65.json my-sensor.json

# 3. Edit the file to match your device
nano my-sensor.json

# 4. Update the index (from project root)
cd ..
./update-device-types.sh

# 5. Restart the frontend container
docker compose restart frontend
```

### Output Example

When you run `./update-device-types.sh`, you'll see:

```
Scanning for device type files in ./device-types...
Found 4 device type file(s):
  - dragino-lht65.json
  - elsys-ers.json
  - generic.json
  - my-sensor.json

✅ Generated ./device-types/index.json

Next steps:
  1. docker compose restart frontend
  2. Refresh your browser
```

## How Auto-Discovery Works

The system uses an `index.json` file that lists all available device types:

```json
{
  "deviceTypes": [
    "dragino-lht65.json",
    "elsys-ers.json",
    "generic.json",
    "my-sensor.json"
  ],
  "version": "1.0.0",
  "lastUpdated": "2026-01-01T00:00:00Z"
}
```

The frontend fetches this index on startup and loads all listed device types automatically. No code changes needed!

## File Structure

```
device-types/
├── dragino-lht65.json       # Example: Temperature/Humidity sensor
├── elsys-ers.json           # Example: Environmental sensor
├── generic.json             # Fallback for unknown devices
├── my-sensor.json           # Your custom device
├── README.md                # Full documentation
└── HOW-TO-ADD-DEVICES.md    # This file
```

## Finding the Right Path

To find the correct `path` for your measurements:

1. Go to the **Query** page in LoRaDB UI
2. Query your device: `SELECT uplink FROM device 'YOUR_DEV_EUI' WHERE LAST '1h'`
3. Look at the JSON structure in the results
4. Use dot notation to navigate to your value

Example payload:
```json
{
  "decoded_payload": {
    "object": {
      "temperature": 22.5,
      "humidity": 45
    }
  }
}
```

Paths would be:
- `"decoded_payload.object.temperature"`
- `"decoded_payload.object.humidity"`

## Sharing Device Types

You can easily share device type files with others:
- Copy the `.json` file to another installation
- Share via GitHub, email, or documentation
- Create a community repository for common devices

## Need Help?

See `README.md` in this folder for complete documentation on:
- Widget configurations
- Status levels and operators
- Color palette
- Examples
