use super::common::{validate_payload_size, MessageParser, MAX_MQTT_PAYLOAD_SIZE};
use crate::error::LoraDbError;
use crate::model::decoded::DecodedPayload;
use crate::model::frames::{Frame, JoinRequest, StatusFrame, UplinkFrame};
use crate::model::gateway::{GatewayLocation, GatewayRxInfo};
use crate::model::lorawan::*;
use anyhow::Result;
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

/// ChirpStack v4 join event format
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChirpStackJoin {
    #[serde(default)]
    #[allow(dead_code)]
    deduplication_id: Option<String>,
    #[serde(default)]
    time: Option<String>,
    device_info: ChirpStackDeviceInfo,
    dev_addr: String,
    #[serde(default)]
    rx_info: Vec<ChirpStackRxInfo>,
}

/// ChirpStack v4 status event format
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChirpStackStatus {
    #[serde(default)]
    #[allow(dead_code)]
    deduplication_id: Option<String>,
    #[serde(default)]
    time: Option<String>,
    device_info: ChirpStackDeviceInfo,
    margin: i16,
    #[serde(default)]
    battery_level: Option<u8>,  // 0-254 valid, 255 = unavailable
    #[serde(default)]
    battery_level_unavailable: bool,
}

/// ChirpStack v4 uplink message format
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChirpStackUplink {
    #[serde(default)]
    #[allow(dead_code)]
    deduplication_id: Option<String>,
    #[serde(default)]
    time: Option<String>,
    device_info: ChirpStackDeviceInfo,
    #[serde(default)]
    #[allow(dead_code)]
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
    #[allow(dead_code)]
    tenant_id: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    tenant_name: Option<String>,
    dev_eui: String,
    #[serde(default)]
    device_name: Option<String>,
    application_id: String,
    #[serde(default)]
    application_name: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    device_profile_id: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    device_profile_name: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    device_class_enabled: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
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
    #[allow(dead_code)]
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

        // SECURITY: Validate f_port according to LoRaWAN spec (1-223 for application data)
        let f_port = msg.f_port.unwrap_or(0);
        if f_port == 0 || f_port > 223 {
            tracing::warn!(
                dev_eui = dev_eui.as_str(),
                f_port = f_port,
                "Invalid f_port value (must be 1-223 for application data)"
            );
        }

        let uplink = UplinkFrame {
            dev_eui,
            application_id: ApplicationId::new(application_id),
            device_name: msg.device_info.device_name,
            received_at,
            f_port,
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

impl ChirpStackParser {
    /// Parse uplink event (for HTTP webhook ingestion)
    pub fn parse_uplink(&self, payload: &[u8]) -> Result<Frame> {
        validate_payload_size(payload, MAX_MQTT_PAYLOAD_SIZE)?;

        let msg: ChirpStackUplink = serde_json::from_slice(payload)
            .map_err(|e| {
                tracing::error!("ChirpStack uplink JSON parse error: {}", e);
                anyhow::anyhow!("Failed to parse ChirpStack uplink JSON: {}", e)
            })?;

        let dev_eui = DevEui::new(msg.device_info.dev_eui)
            .map_err(|e| LoraDbError::MqttParseError(e.to_string()))?;

        let application_id = msg.device_info.application_name
            .or(Some(msg.device_info.application_id))
            .unwrap_or_else(|| "unknown".to_string());

        let received_at = msg.time
            .and_then(|t| chrono::DateTime::parse_from_rfc3339(&t).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let f_port = msg.f_port.unwrap_or(0);
        if f_port == 0 || f_port > 223 {
            tracing::warn!(
                dev_eui = dev_eui.as_str(),
                f_port = f_port,
                "Invalid f_port value (must be 1-223 for application data)"
            );
        }

        let uplink = UplinkFrame {
            dev_eui,
            application_id: ApplicationId::new(application_id),
            device_name: msg.device_info.device_name,
            received_at,
            f_port,
            f_cnt: msg.f_cnt.unwrap_or(0),
            confirmed: msg.confirmed,
            adr: msg.adr,
            dr: DataRate::new_lora(125000, msg.dr.unwrap_or(0)),
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

        Ok(Frame::Uplink(uplink))
    }

    /// Parse join event (for HTTP webhook ingestion)
    pub fn parse_join(&self, payload: &[u8]) -> Result<Frame> {
        validate_payload_size(payload, MAX_MQTT_PAYLOAD_SIZE)?;

        let msg: ChirpStackJoin = serde_json::from_slice(payload)
            .map_err(|e| {
                tracing::error!("ChirpStack join JSON parse error: {}", e);
                anyhow::anyhow!("Failed to parse ChirpStack join JSON: {}", e)
            })?;

        let dev_eui = DevEui::new(msg.device_info.dev_eui)
            .map_err(|e| LoraDbError::MqttParseError(e.to_string()))?;

        let application_id = msg.device_info.application_name
            .or(Some(msg.device_info.application_id.clone()))
            .unwrap_or_else(|| "unknown".to_string());

        let received_at = msg.time
            .and_then(|t| chrono::DateTime::parse_from_rfc3339(&t).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let rx_info = msg
            .rx_info
            .into_iter()
            .map(|rx| GatewayRxInfo {
                gateway_id: GatewayEui::new(rx.gateway_id.unwrap_or_else(|| "unknown".to_string())),
                rssi: rx.rssi.unwrap_or(0),
                snr: rx.snr.unwrap_or(0.0),
                channel: rx.channel,
                rf_chain: rx.rf_chain,
                location: rx.location.and_then(|loc| {
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
            .collect();

        Ok(Frame::JoinRequest(JoinRequest {
            dev_eui,
            join_eui: application_id, // Use application ID as join_eui
            received_at,
            rx_info,
        }))
    }

    /// Parse status event (for HTTP webhook ingestion)
    pub fn parse_status(&self, payload: &[u8]) -> Result<Frame> {
        validate_payload_size(payload, MAX_MQTT_PAYLOAD_SIZE)?;

        let msg: ChirpStackStatus = serde_json::from_slice(payload)
            .map_err(|e| {
                tracing::error!("ChirpStack status JSON parse error: {}", e);
                anyhow::anyhow!("Failed to parse ChirpStack status JSON: {}", e)
            })?;

        let dev_eui = DevEui::new(msg.device_info.dev_eui)
            .map_err(|e| LoraDbError::MqttParseError(e.to_string()))?;

        let application_id = msg.device_info.application_name
            .or(Some(msg.device_info.application_id))
            .unwrap_or_else(|| "unknown".to_string());

        let received_at = msg.time
            .and_then(|t| chrono::DateTime::parse_from_rfc3339(&t).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        let battery_level = if msg.battery_level_unavailable {
            255  // LoRaWAN spec: 255 = unavailable
        } else {
            msg.battery_level.unwrap_or(255)
        };

        Ok(Frame::Status(StatusFrame {
            dev_eui,
            application_id: ApplicationId::new(application_id),
            device_name: msg.device_info.device_name,
            received_at,
            margin: msg.margin,
            battery_level,
        }))
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

    #[test]
    fn test_parse_join_event() {
        let parser = ChirpStackParser::new();
        let payload = r#"{
            "time": "2025-12-18T12:00:00Z",
            "deviceInfo": {
                "devEui": "0123456789abcdef",
                "applicationId": "test-app",
                "applicationName": "Test App"
            },
            "devAddr": "01234567",
            "rxInfo": [{
                "gatewayId": "gateway-001",
                "rssi": -50,
                "snr": 10.5
            }]
        }"#;

        let frame = parser.parse_join(payload.as_bytes()).unwrap();
        match frame {
            Frame::JoinRequest(join) => {
                assert_eq!(join.dev_eui.as_str(), "0123456789abcdef");
                assert_eq!(join.join_eui, "Test App");
                assert_eq!(join.rx_info.len(), 1);
            }
            _ => panic!("Expected JoinRequest frame"),
        }
    }

    #[test]
    fn test_parse_status_event() {
        let parser = ChirpStackParser::new();
        let payload = r#"{
            "time": "2025-12-18T12:00:00Z",
            "deviceInfo": {
                "devEui": "0123456789abcdef",
                "applicationId": "test-app",
                "deviceName": "test-device"
            },
            "margin": 10,
            "batteryLevel": 85
        }"#;

        let frame = parser.parse_status(payload.as_bytes()).unwrap();
        match frame {
            Frame::Status(status) => {
                assert_eq!(status.dev_eui.as_str(), "0123456789abcdef");
                assert_eq!(status.margin, 10);
                assert_eq!(status.battery_level, 85);
                assert_eq!(status.device_name, Some("test-device".to_string()));
            }
            _ => panic!("Expected Status frame"),
        }
    }

    #[test]
    fn test_parse_status_event_battery_unavailable() {
        let parser = ChirpStackParser::new();
        let payload = r#"{
            "time": "2025-12-18T12:00:00Z",
            "deviceInfo": {
                "devEui": "ff00000000009523",
                "applicationId": "test-app"
            },
            "margin": 5,
            "batteryLevelUnavailable": true
        }"#;

        let frame = parser.parse_status(payload.as_bytes()).unwrap();
        match frame {
            Frame::Status(status) => {
                assert_eq!(status.dev_eui.as_str(), "ff00000000009523");
                assert_eq!(status.margin, 5);
                assert_eq!(status.battery_level, 255); // 255 = unavailable per LoRaWAN spec
            }
            _ => panic!("Expected Status frame"),
        }
    }

    #[test]
    fn test_parse_uplink_method() {
        let parser = ChirpStackParser::new();
        let payload = r#"{
            "time": "2025-12-18T12:00:00Z",
            "deviceInfo": {
                "devEui": "0123456789abcdef",
                "applicationId": "test-app"
            },
            "fPort": 1,
            "fCnt": 42,
            "object": {
                "temperature": 22.5
            }
        }"#;

        let frame = parser.parse_uplink(payload.as_bytes()).unwrap();
        match frame {
            Frame::Uplink(uplink) => {
                assert_eq!(uplink.dev_eui.as_str(), "0123456789abcdef");
                assert_eq!(uplink.f_port, 1);
                assert_eq!(uplink.f_cnt, 42);
                assert!(uplink.decoded_payload.is_some());
            }
            _ => panic!("Expected Uplink frame"),
        }
    }
}
