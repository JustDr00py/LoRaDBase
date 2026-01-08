use crate::error::LoraDbError;
use serde::{Deserialize, Serialize};

/// LoRaWAN DevEUI (8 bytes, hex-encoded in JSON)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DevEui(pub String);

impl DevEui {
    pub fn new(dev_eui: String) -> Result<Self, LoraDbError> {
        let eui = Self(dev_eui);
        eui.validate()?;
        Ok(eui)
    }

    pub fn validate(&self) -> Result<(), LoraDbError> {
        if self.0.len() != 16 {
            return Err(LoraDbError::InvalidDevEui(
                "DevEUI must be 16 hex characters".to_string(),
            ));
        }
        if !self.0.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(LoraDbError::InvalidDevEui(
                "DevEUI must contain only hex characters".to_string(),
            ));
        }
        Ok(())
    }

    /// Returns the DevEUI as a normalized lowercase string
    pub fn normalized(&self) -> String {
        self.0.to_lowercase()
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for DevEui {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Gateway EUI
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct GatewayEui(pub String);

impl GatewayEui {
    pub fn new(eui: String) -> Self {
        Self(eui)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Application ID
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ApplicationId(pub String);

impl ApplicationId {
    pub fn new(id: String) -> Self {
        Self(id)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Frame counter
pub type FCnt = u32;

/// Data rate
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataRate {
    pub modulation: String,   // "LORA"
    pub bandwidth: u32,        // e.g., 125000
    pub spreading_factor: u8,  // e.g., 7
    pub bitrate: Option<u32>,  // Removed skip_serializing_if for bincode compatibility
}

impl DataRate {
    pub fn new_lora(bandwidth: u32, spreading_factor: u8) -> Self {
        Self {
            modulation: "LORA".to_string(),
            bandwidth,
            spreading_factor,
            bitrate: None,
        }
    }
}

/// Frequency in Hz
pub type Frequency = u64;

/// RSSI in dBm
pub type Rssi = i16;

/// SNR in dB
pub type Snr = f32;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deveui_validation() {
        // Valid DevEUI
        assert!(DevEui::new("0123456789ABCDEF".to_string()).is_ok());
        assert!(DevEui::new("0123456789abcdef".to_string()).is_ok());

        // Invalid length
        assert!(DevEui::new("0123".to_string()).is_err());
        assert!(DevEui::new("0123456789ABCDEF00".to_string()).is_err());

        // Invalid characters
        assert!(DevEui::new("0123456789ABCDEG".to_string()).is_err());
        assert!(DevEui::new("0123456789ABCD-F".to_string()).is_err());
    }

    #[test]
    fn test_deveui_normalized() {
        let deveui = DevEui::new("0123456789ABCDEF".to_string()).unwrap();
        assert_eq!(deveui.normalized(), "0123456789abcdef");
    }
}
