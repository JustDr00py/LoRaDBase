# Dashboard Widgets - Setup Complete ✅

## 🎉 What's Been Implemented

A complete dashboard widget system with **auto-discovery** of device types!

### Features
- ✅ 4 widget types: Current Value, Time Series, Gauge, Status
- ✅ Drag & drop layout with react-grid-layout
- ✅ ECharts for beautiful visualizations
- ✅ Auto-refresh with configurable intervals
- ✅ localStorage persistence
- ✅ Export/Import dashboard configurations
- ✅ **Auto-discovery of device types** - no code changes needed!

---

## 🚀 Quick Start Guide

### 1. Rebuild the Frontend (First Time Only)

```bash
cd /home/sysadmin/Documents/LoRaDB-UI
docker compose down
docker compose build --no-cache frontend
docker compose up -d
```

### 2. Access the Dashboard

Open your browser and navigate to:
- **Dashboard Widgets**: http://localhost:3000/dashboard-widgets

### 3. Add Your First Widget

1. Click **"+ Add Widget"**
2. Select a **Device** from the dropdown
3. Choose a **Device Type** (Dragino LHT65, Elsys ERS, or Generic)
4. Pick a **Measurement** (temperature, humidity, etc.)
5. Select a **Widget Type** (current value, time series, gauge, or status)
6. Click **"Add Widget"**

### 4. Customize Your Dashboard

- **Drag** widgets to rearrange
- **Resize** using the bottom-right corner
- **Delete** by clicking the × button
- **Export** your layout to share with others
- **Import** saved configurations

---

## 📁 Adding Custom Device Types

### The Easy Way (Auto-Discovery)

```bash
# 1. Navigate to device-types folder
cd /home/sysadmin/Documents/LoRaDB-UI/device-types

# 2. Create your device type (copy from example)
cp dragino-lht65.json my-sensor.json

# 3. Edit to match your device
nano my-sensor.json

# 4. Update the index (from project root)
cd ..
./update-device-types.sh

# 5. Restart frontend
docker compose restart frontend
```

**That's it!** Your new device type is now available in the dashboard.

### How It Works

1. **Device types** are JSON files in `/device-types/` folder
2. **index.json** lists all available device types
3. **update-device-types.sh** scans the folder and regenerates index.json
4. **Frontend** auto-loads all device types from the index
5. **No code changes** or rebuilds required!

---

## 📖 Documentation

All documentation is included:

- **`/device-types/README.md`** - Complete device type documentation with examples
- **`/device-types/HOW-TO-ADD-DEVICES.md`** - Step-by-step guide for adding devices
- **`/CLAUDE.md`** - Technical documentation (updated with Dashboard Widgets section)
- **`/update-device-types.sh`** - Auto-discovery script

---

## 📊 Included Device Types

Three device types are pre-configured:

1. **Dragino LHT65** (`dragino-lht65.json`)
   - Temperature (SHT)
   - Humidity (SHT)
   - Battery Voltage

2. **Elsys ERS** (`elsys-ers.json`)
   - Temperature
   - Humidity
   - Light Level
   - Motion Detection

3. **Generic** (`generic.json`)
   - Temperature
   - Humidity
   - Battery
   - (Fallback for unknown devices)

---

## 🔧 File Structure

```
LoRaDB-UI/
├── device-types/                           # Device type definitions (Docker volume)
│   ├── index.json                         # Auto-generated index
│   ├── dragino-lht65.json                 # Example device type
│   ├── elsys-ers.json                     # Example device type
│   ├── generic.json                       # Fallback device type
│   ├── README.md                          # Full documentation
│   └── HOW-TO-ADD-DEVICES.md              # Quick guide
├── update-device-types.sh                 # Auto-discovery script
├── docker-compose.yml                     # Updated with volume mount
├── frontend/
│   ├── package.json                       # Updated with dependencies
│   ├── src/
│   │   ├── components/Dashboard/          # Dashboard components
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── DashboardGrid.tsx
│   │   │   ├── WidgetContainer.tsx
│   │   │   ├── WidgetConfigModal.tsx
│   │   │   ├── TimeRangeControl.tsx
│   │   │   └── widgets/
│   │   │       ├── CurrentValueWidget.tsx
│   │   │       ├── TimeSeriesWidget.tsx
│   │   │       ├── GaugeWidget.tsx
│   │   │       └── StatusWidget.tsx
│   │   ├── hooks/
│   │   │   ├── useDeviceTypes.ts          # Auto-loads from index.json
│   │   │   ├── useDashboardLayout.ts
│   │   │   └── useWidgetData.ts
│   │   ├── utils/
│   │   │   ├── widgetDataProcessor.ts
│   │   │   └── dashboardStorage.ts
│   │   └── types/
│   │       └── widgets.ts
│   └── styles.css                         # Updated with widget styles
└── CLAUDE.md                               # Updated with dashboard docs
```

---

## 🎨 Widget Configuration Examples

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
  "min": 0,
  "max": 100,
  "zones": [
    { "from": 0, "to": 30, "color": "#ef4444" },
    { "from": 30, "to": 70, "color": "#10b981" },
    { "from": 70, "to": 100, "color": "#f59e0b" }
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

---

## 💡 Tips & Tricks

### Finding Measurement Paths

Use the **Query** page to inspect your device's payload structure:

```
SELECT uplink FROM device 'YOUR_DEV_EUI' WHERE LAST '1h'
```

Look at the JSON response to find the correct path. For example:

```json
{
  "decoded_payload": {
    "object": {
      "TempC_SHT": 22.5
    }
  }
}
```

Path would be: `"decoded_payload.object.TempC_SHT"`

### Color Palette

Use these consistent colors:
- **Blue** `#3b82f6` - Info, cold
- **Green** `#10b981` - Success, normal
- **Yellow** `#fbbf24` - Light
- **Orange** `#f59e0b` - Warning
- **Red** `#ef4444` - Error, critical
- **Purple** `#8b5cf6` - Humidity

### Sharing Dashboards

Export your dashboard configuration:
1. Click **"Export"** button
2. Share the JSON file with others
3. They can click **"Import"** to load it

### Time Ranges

Available options:
- 1 hour
- 6 hours
- 24 hours (default)
- 7 days
- 30 days

### Auto-Refresh

Configure automatic data updates:
- 30 seconds
- 1 minute (default)
- 5 minutes
- 10 minutes

---

## 🐛 Troubleshooting

### Device Type Not Showing Up

1. Check that the JSON file is valid: `cat device-types/my-sensor.json | jq`
2. Verify it's listed in index.json: `cat device-types/index.json`
3. Re-run the update script: `./update-device-types.sh`
4. Restart frontend: `docker compose restart frontend`
5. Check browser console for errors (F12)

### Widget Shows "No data available"

1. Verify the device has data in the Query page
2. Check that the `path` in your device type JSON matches the payload structure
3. Look at browser console for error messages
4. Try a simpler path first (e.g., `decoded_payload.temperature`)

### Layout Not Saving

Dashboards are saved to localStorage. To export/backup:
1. Click the **"Export"** button
2. Save the JSON file
3. Click **"Import"** to restore

---

## 🚢 Deployment Notes

The `device-types/` folder is mounted as a Docker volume, so:
- ✅ Add device types without rebuilding
- ✅ Easy to backup (just copy the folder)
- ✅ Can be version controlled with git
- ✅ Share device types by copying JSON files

---

## 📝 Next Steps

1. **Build and deploy**: `docker compose build frontend && docker compose up -d`
2. **Test the dashboard**: Navigate to http://localhost:3000/dashboard-widgets
3. **Add your devices**: Create custom device type JSON files
4. **Share with community**: Contribute device types to help others!

---

## 🎯 Future Enhancements (Ideas)

- Backend storage for dashboard layouts (sync across devices)
- Per-widget time range overrides
- Dashboard templates/presets
- Alert configuration on thresholds
- Historical data comparison
- Device group widgets (aggregate multiple devices)
- Custom widget types via plugins
- Mobile-responsive layouts
- PDF export of dashboards

---

**Enjoy your new dashboard widgets! 🎉**
