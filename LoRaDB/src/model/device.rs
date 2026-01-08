use super::lorawan::DevEui;
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use std::sync::Arc;

/// Thread-safe device registry
#[derive(Clone)]
pub struct DeviceRegistry {
    devices: Arc<DashMap<String, DeviceInfo>>, // Key: normalized DevEUI
}

#[derive(Debug, Clone)]
pub struct DeviceInfo {
    pub dev_eui: DevEui,
    pub device_name: Option<String>,
    pub application_id: String,
    pub first_seen: DateTime<Utc>,
    pub last_seen: Option<DateTime<Utc>>,
    pub frame_count: u64,
}

impl DeviceRegistry {
    pub fn new() -> Self {
        Self {
            devices: Arc::new(DashMap::new()),
        }
    }

    /// Register a device or update last seen time
    pub fn register_or_update(
        &self,
        dev_eui: DevEui,
        name: Option<String>,
        app_id: String,
    ) {
        let key = dev_eui.normalized();

        self.devices
            .entry(key.clone())
            .and_modify(|info| {
                info.last_seen = Some(Utc::now());
                info.frame_count += 1;
                if let Some(n) = name.as_ref() {
                    info.device_name = Some(n.clone());
                }
            })
            .or_insert_with(|| DeviceInfo {
                dev_eui,
                device_name: name,
                application_id: app_id,
                first_seen: Utc::now(),
                last_seen: Some(Utc::now()),
                frame_count: 1,
            });
    }

    pub fn get(&self, dev_eui: &DevEui) -> Option<DeviceInfo> {
        let key = dev_eui.normalized();
        self.devices.get(&key).map(|r| r.value().clone())
    }

    pub fn list_all(&self) -> Vec<DeviceInfo> {
        self.devices.iter().map(|r| r.value().clone()).collect()
    }

    /// Alias for list_all for API compatibility
    pub fn list_devices(&self) -> Vec<DeviceInfo> {
        self.list_all()
    }

    /// Get device by DevEUI string
    pub fn get_device(&self, dev_eui_str: &str) -> Option<DeviceInfo> {
        self.devices.get(dev_eui_str).map(|r| r.value().clone())
    }

    pub fn device_count(&self) -> usize {
        self.devices.len()
    }

    /// Remove a device from the registry
    pub fn remove_device(&self, dev_eui_str: &str) -> bool {
        self.devices.remove(dev_eui_str).is_some()
    }
}

impl Default for DeviceRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_registry() {
        let registry = DeviceRegistry::new();

        let dev_eui = DevEui::new("0123456789ABCDEF".to_string()).unwrap();

        // Register device
        registry.register_or_update(
            dev_eui.clone(),
            Some("test-device".to_string()),
            "test-app".to_string(),
        );

        assert_eq!(registry.device_count(), 1);

        // Get device
        let device = registry.get(&dev_eui).unwrap();
        assert_eq!(device.dev_eui, dev_eui);
        assert_eq!(device.device_name, Some("test-device".to_string()));
        assert_eq!(device.frame_count, 1);

        // Update device
        registry.register_or_update(
            dev_eui.clone(),
            Some("updated-device".to_string()),
            "test-app".to_string(),
        );

        let device = registry.get(&dev_eui).unwrap();
        assert_eq!(device.device_name, Some("updated-device".to_string()));
        assert_eq!(device.frame_count, 2);
    }
}
