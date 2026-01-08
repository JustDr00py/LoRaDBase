use super::lorawan::{GatewayEui, Rssi, Snr};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayRxInfo {
    pub gateway_id: GatewayEui,
    pub rssi: Rssi,
    pub snr: Snr,
    pub channel: u8,
    pub rf_chain: u8,

    pub location: Option<GatewayLocation>,  // Removed default and skip_serializing_if for bincode
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GatewayLocation {
    pub latitude: f64,
    pub longitude: f64,
    pub altitude: Option<f64>,  // Removed skip_serializing_if for bincode compatibility
}
