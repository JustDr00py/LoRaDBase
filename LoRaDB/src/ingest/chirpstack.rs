use super::common::{validate_payload_size, MessageParser, MAX_MQTT_PAYLOAD_SIZE};
use crate::error::LoraDbError;
use crate::model::decoded::DecodedPayload;
use crate::model::frames::{Frame, UplinkFrame};
use crate::model::gateway::{GatewayLocation, GatewayRxInfo};
use crate::model::lorawan::*;
use anyhow::{Context, Result};
use chrono::Utc;
use serde::Deserialize;

pub struct ChirpStackParser;

impl ChirpStackParser {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ChirpStackParser {
    fn default() -> Self {
        Self::new()
    }
}

/// ChirpStack v4 uplink message format
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChirpStackUplink {
    #[serde(default)]
    deduplication_id: Option<String>,
    #[serde(default)]
    time: Option<String>,
    device_info: ChirpStackDeviceInfo,
    #[serde(default)]
    dev_addr: Option<String>,
    #[serde(default)]
    f_port: Option<u8>,
    #[serde(default)]
    f_cnt: Option<u32>,
    #[serde(default)]
    confirmed: bool,
    #[serde(default)]
    adr: bool,
    #[serde(default)]
    dr: Option<u8>,
    #[serde(default)]
    rx_info: Vec<ChirpStackRxInfo>,
    #[serde(default)]
    tx_info: Option<ChirpStackTxInfo>,
    #[serde(default)]
    object: Option<serde_json::Value>,
    #[serde(default)]
    data: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChirpStackDeviceInfo {
    #[serde(default)]
    tenant_id: Option<String>,
    #[serde(default)]
    tenant_name: Option<String>,
    dev_eui: String,
    #[serde(default)]
    device_name: Option<String>,
    application_id: String,
    #[serde(default)]
    application_name: Option<String>,
    #[serde(default)]
    device_profile_id: Option<String>,
    #[serde(default)]
    device_profile_name: Option<String>,
    #[serde(default)]
    device_class_enabled: Option<String>,
    #[serde(default)]
    tags: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChirpStackRxInfo {
    #[serde(default)]
    gateway_id: Option<String>,
    #[serde(default)]
    rssi: Option<i16>,
    #[serde(default)]
    snr: Option<f32>,
    #[serde(default)]
    channel: u8,
    #[serde(default)]
    rf_chain: u8,
    #[serde(default)]
    location: Option<ChirpStackLocation>,
}

#[derive(Debug, Deserialize)]
struct ChirpStackLocation {
    #[serde(default)]
    latitude: Option<f64>,
    #[serde(default)]
    longitude: Option<f64>,
    #[serde(default)]
    altitude: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct ChirpStackTxInfo {
    #[serde(default)]
    frequency: Option<u64>,
    #[serde(default)]
    modulation: Option<serde_json::Value>, // Can be string or object
}

impl MessageParser for ChirpStackParser {
    fn parse_message(&self, topic: &str, payload: &[u8]) -> Result<Option<Frame>> {
        // ChirpStack topic format: application/{app_id}/device/{dev_eui}/event/up
        if !topic.contains("/event/up") {
            return Ok(None); // Not an uplink message
        }

        validate_payload_size(payload, MAX_MQTT_PAYLOAD_SIZE)?;

        let msg: ChirpStackUplink = serde_json::from_slice(payload)
            .map_err(|e| {
                // Log the detailed serde error for debugging
                tracing::error!("ChirpStack JSON parse error: {}", e);
                anyhow::anyhow!("Failed to parse ChirpStack uplink JSON: {}", e)
            })?;

        // Validate and create DevEui from deviceInfo
        let dev_eui = DevEui::new(msg.device_info.dev_eui)
            .map_err(|e| LoraDbError::MqttParseError(e.to_string()))?;

        // Use application ID from deviceInfo
        let application_id = msg.device_info.application_name
            .or(Some(msg.device_info.application_id))
            .unwrap_or_else(|| "unknown".to_string());

        // Parse timestamp if available
        let received_at = msg.time
            .and_then(|t| chrono::DateTime::parse_from_rfc3339(&t).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let uplink = UplinkFrame {
            dev_eui,
            application_id: ApplicationId::new(application_id),
            device_name: msg.device_info.device_name,
            received_at,
            f_port: msg.f_port.unwrap_or(0),
            f_cnt: msg.f_cnt.unwrap_or(0),
            confirmed: msg.confirmed,
            adr: msg.adr,
            dr: DataRate::new_lora(125000, msg.dr.unwrap_or(0)), // Default to 125kHz bandwidth
            frequency: msg.tx_info.as_ref().and_then(|tx| tx.frequency).unwrap_or(0),
            rx_info: msg
                .rx_info
                .into_iter()
                .map(|rx| GatewayRxInfo {
                    gateway_id: GatewayEui::new(rx.gateway_id.unwrap_or_else(|| "unknown".to_string())),
                    rssi: rx.rssi.unwrap_or(0),
                    snr: rx.snr.unwrap_or(0.0),
                    channel: rx.channel,
                    rf_chain: rx.rf_chain,
                    location: rx.location.and_then(|loc| {
                        // Only create location if we have lat/lng
                        match (loc.latitude, loc.longitude) {
                            (Some(lat), Some(lng)) => Some(GatewayLocation {
                                latitude: lat,
                                longitude: lng,
                                altitude: loc.altitude,
                            }),
                            _ => None,
                        }
                    }),
                })
                .collect(),
            decoded_payload: msg.object.map(DecodedPayload::from_json),
            raw_payload: msg.data,
        };

        Ok(Some(Frame::Uplink(uplink)))
    }

    fn extract_dev_eui(&self, topic: &str) -> Option<String> {
        // application/{app_id}/device/{dev_eui}/event/up
        topic.split('/').nth(3).map(String::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chirpstack_parser() {
        let parser = ChirpStackParser;

        let payload = r#"{
            "time": "2025-11-26T06:14:58.501022+00:00",
            "deviceInfo": {
                "devEui": "0123456789abcdef",
                "deviceName": "test-sensor",
                "applicationId": "test-app-id",
                "applicationName": "test-app"
            },
            "fPort": 1,
            "fCnt": 42,
            "confirmed": false,
            "adr": true,
            "dr": 5,
            "rxInfo": [{
                "gatewayId": "gateway-001",
                "rssi": -50,
                "snr": 10.5,
                "channel": 0,
                "rfChain": 0
            }],
            "txInfo": {
                "frequency": 868100000
            },
            "object": {
                "temperature": 22.5,
                "humidity": 60.0
            },
            "data": "AQIDBAUGBwg="
        }"#;

        let topic = "application/test-app/device/0123456789abcdef/event/up";
        let frame = parser
            .parse_message(topic, payload.as_bytes())
            .unwrap()
            .unwrap();

        match frame {
            Frame::Uplink(uplink) => {
                assert_eq!(uplink.dev_eui.as_str(), "0123456789abcdef");
                assert_eq!(uplink.f_port, 1);
                assert_eq!(uplink.f_cnt, 42);
                assert_eq!(uplink.rx_info.len(), 1);
                assert!(uplink.decoded_payload.is_some());
            }
            _ => panic!("Expected Uplink frame"),
        }
    }

    #[test]
    fn test_chirpstack_parser_missing_rx_metadata() {
        let parser = ChirpStackParser;

        // Test with missing snr, rssi, and gatewayId fields
        let payload = r#"{
            "time": "2025-11-28T05:38:55.546236991+00:00",
            "deviceInfo": {
                "devEui": "ff00000000009523",
                "deviceName": "test-device",
                "applicationId": "test-app-id",
                "applicationName": "test-app"
            },
            "fPort": 2,
            "fCnt": 100,
            "confirmed": false,
            "adr": false,
            "dr": 3,
            "rxInfo": [{
                "channel": 1,
                "rfChain": 0
            }],
            "txInfo": {
                "frequency": 915000000
            },
            "object": {
                "sensor": "value"
            }
        }"#;

        let topic = "application/test-app/device/ff00000000009523/event/up";
        let result = parser.parse_message(topic, payload.as_bytes());

        // Should parse successfully even with missing fields
        assert!(result.is_ok(), "Parser should handle missing rx metadata fields");

        let frame = result.unwrap().unwrap();
        match frame {
            Frame::Uplink(uplink) => {
                assert_eq!(uplink.dev_eui.as_str(), "ff00000000009523");
                assert_eq!(uplink.f_port, 2);
                assert_eq!(uplink.f_cnt, 100);
                assert_eq!(uplink.rx_info.len(), 1);

                // Verify default values are used
                assert_eq!(uplink.rx_info[0].gateway_id.as_str(), "unknown");
                assert_eq!(uplink.rx_info[0].rssi, 0);
                assert_eq!(uplink.rx_info[0].snr, 0.0);
                assert_eq!(uplink.rx_info[0].channel, 1);
            }
            _ => panic!("Expected Uplink frame"),
        }
    }
}
