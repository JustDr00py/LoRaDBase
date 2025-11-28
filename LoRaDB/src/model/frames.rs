use super::decoded::DecodedPayload;
use super::gateway::GatewayRxInfo;
use super::lorawan::{ApplicationId, DataRate, DevEui, FCnt, Frequency};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Uplink frame (data from device to network)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UplinkFrame {
    pub dev_eui: DevEui,
    pub application_id: ApplicationId,
    pub device_name: Option<String>,  // Removed skip_serializing_if for bincode compatibility

    // Timing
    pub received_at: DateTime<Utc>,

    // Frame info
    pub f_port: u8,
    pub f_cnt: FCnt,
    pub confirmed: bool,
    pub adr: bool,

    // RF metadata
    pub dr: DataRate,
    pub frequency: Frequency,

    // Gateway reception info
    pub rx_info: Vec<GatewayRxInfo>,

    // Payload (pre-decoded by network server)
    pub decoded_payload: Option<DecodedPayload>,  // Removed skip_serializing_if for bincode
    pub raw_payload: Option<String>, // Base64-encoded; removed skip_serializing_if for bincode
}

/// Downlink frame (data from network to device)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownlinkFrame {
    pub dev_eui: DevEui,
    pub application_id: ApplicationId,

    pub queued_at: DateTime<Utc>,
    pub f_port: u8,
    pub f_cnt: FCnt,
    pub confirmed: bool,

    pub data: String, // Base64-encoded
}

/// Join request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinRequest {
    pub dev_eui: DevEui,
    pub join_eui: String,
    pub received_at: DateTime<Utc>,
    pub rx_info: Vec<GatewayRxInfo>,
}

/// Join accept
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JoinAccept {
    pub dev_eui: DevEui,
    pub accepted_at: DateTime<Utc>,
    pub dev_addr: String,
}

/// Frame type enum for storage
/// Note: Uses default (externally tagged) serde representation for bincode compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Frame {
    Uplink(UplinkFrame),
    Downlink(DownlinkFrame),
    JoinRequest(JoinRequest),
    JoinAccept(JoinAccept),
}

impl Frame {
    pub fn dev_eui(&self) -> &DevEui {
        match self {
            Frame::Uplink(f) => &f.dev_eui,
            Frame::Downlink(f) => &f.dev_eui,
            Frame::JoinRequest(f) => &f.dev_eui,
            Frame::JoinAccept(f) => &f.dev_eui,
        }
    }

    pub fn timestamp(&self) -> DateTime<Utc> {
        match self {
            Frame::Uplink(f) => f.received_at,
            Frame::Downlink(f) => f.queued_at,
            Frame::JoinRequest(f) => f.received_at,
            Frame::JoinAccept(f) => f.accepted_at,
        }
    }

    pub fn application_id(&self) -> Option<&ApplicationId> {
        match self {
            Frame::Uplink(f) => Some(&f.application_id),
            Frame::Downlink(f) => Some(&f.application_id),
            _ => None,
        }
    }
}
