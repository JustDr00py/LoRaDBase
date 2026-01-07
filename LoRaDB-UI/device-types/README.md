# Device Type Definitions

This directory contains device type definition files for the LoRaDB Dashboard Widget System. Each file defines the measurements available for a specific device type and how they should be visualized.

## File Format

Each device type is defined as a JSON file with the following structure:

```json
{
  "deviceType": "unique-device-id",
  "name": "Human-readable device name",
  "manufacturer": "Manufacturer name",
  "description": "Brief description",
  "version": "1.0.0",
  "measurements": [...]
}
```

## Measurement Definition

Each measurement in the `measurements` array includes:

- **id**: Unique identifier for the measurement within this device type
- **path**: Dot-notation path to extract the value from the LoRaDB frame (e.g., `"decoded_payload.object.TempC_SHT"`)
- **name**: Display name for the measurement
- **unit**: Unit of measurement (e.g., "°C", "%", "V")
- **decimals**: Number of decimal places to display
- **defaultWidget**: Default widget type (`"current-value"`, `"time-series"`, `"gauge"`, or `"status"`)
- **widgets**: Configuration for each widget type

## Widget Configurations

### Current Value Widget
```json
"current-value": {
  "enabled": true,
  "thresholds": [
    { "min": 0, "max": 25, "color": "#10b981", "label": "Normal" },
    { "min": 25, "max": 50, "color": "#f59e0b", "label": "Warm" }
  ]
}
```

### Time Series Widget
```json
"time-series": {
  "enabled": true,
  "yAxisMin": -10,
  "yAxisMax": 40,
  "showArea": true,
  "color": "#2563eb"
}
```

### Gauge Widget
```json
"gauge": {
  "enabled": true,
  "min": -10,
  "max": 40,
  "zones": [
    { "from": -10, "to": 0, "color": "#3b82f6" },
    { "from": 0, "to": 25, "color": "#10b981" },
    { "from": 25, "to": 40, "color": "#f59e0b" }
  ]
}
```

### Status Widget
```json
"status": {
  "enabled": true,
  "conditions": [
    { "operator": "lt", "value": 0, "status": "info", "label": "Cold" },
    { "operator": "between", "min": 0, "max": 25, "status": "success", "label": "Normal" },
    { "operator": "gt", "value": 25, "status": "warning", "label": "Warm" }
  ]
}
```

## Status Levels

- **success**: Green (good/normal state)
- **warning**: Yellow/Orange (attention needed)
- **error**: Red (critical/failure)
- **info**: Blue (informational)

## Condition Operators

- **lt**: Less than
- **lte**: Less than or equal
- **gt**: Greater than
- **gte**: Greater than or equal
- **eq**: Equal to
- **between**: Between min and max (inclusive)

## Included Device Types

1. **dragino-lht65.json** - Dragino LHT65 Temperature & Humidity Sensor
   - Temperature (SHT)
   - Humidity (SHT)
   - Battery Voltage

2. **elsys-ers.json** - Elsys ERS Environmental Sensor
   - Temperature
   - Humidity
   - Light Level
   - Motion Detection

3. **generic.json** - Generic LoRaWAN Sensor (fallback)
   - Temperature
   - Humidity
   - Battery

## Creating Custom Device Types

To add a new device type:

1. Create a new JSON file in this directory
2. Follow the structure shown above
3. Set the correct `path` values to match your device's payload structure
4. Configure thresholds and zones based on your sensor's specifications
5. Add the filename to the list in `hooks/useDeviceTypes.ts` to load it automatically

## Measurement Path Examples

The `path` field uses dot notation to navigate the LoRaDB frame structure:

- `"decoded_payload.temperature"` - Simple decoded payload
- `"decoded_payload.object.TempC_SHT"` - Nested object structure
- `"raw_payload"` - Direct access to raw payload
- `"f_port"` - Access to frame metadata

The path corresponds to JavaScript object navigation:
```javascript
frame.decoded_payload.object.TempC_SHT
```

## Sharing Device Types

Device type files can be easily shared:
- Copy/paste JSON files to other installations
- Share via GitHub, forums, or documentation
- Create a community repository for common devices

## Color Palette

Recommended colors for consistent UI:

- **Blue**: `#3b82f6` (info, cold)
- **Green**: `#10b981` (success, normal)
- **Yellow**: `#fbbf24` (light)
- **Orange**: `#f59e0b` (warning)
- **Red**: `#ef4444` (error, critical)
- **Purple**: `#8b5cf6` (humidity, other)
- **Dark Blue**: `#2563eb` (primary charts)

## Version History

- **1.0.0** - Initial release with dragino-lht65, elsys-ers, and generic templates
