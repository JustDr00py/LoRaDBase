use crate::error::LoraDbError;
use crate::model::frames::Frame;
use anyhow::Result;

/// Trait for parsing MQTT messages from different network servers
pub trait MessageParser: Send + Sync {
    /// Parse an MQTT message into a Frame
    fn parse_message(&self, topic: &str, payload: &[u8]) -> Result<Option<Frame>>;

    /// Extract DevEUI from topic if possible
    fn extract_dev_eui(&self, topic: &str) -> Option<String>;
}

/// Validate payload size to prevent DoS attacks
pub fn validate_payload_size(payload: &[u8], max_size: usize) -> Result<()> {
    if payload.len() > max_size {
        return Err(LoraDbError::MqttParseError(format!(
            "Payload too large: {} bytes (max: {})",
            payload.len(),
            max_size
        ))
        .into());
    }
    Ok(())
}

pub const MAX_MQTT_PAYLOAD_SIZE: usize = 1024 * 1024; // 1MB
