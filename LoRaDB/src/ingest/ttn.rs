use super::common::{validate_payload_size, MessageParser, MAX_MQTT_PAYLOAD_SIZE};
use crate::error::LoraDbError;
use crate::model::decoded::DecodedPayload;
use crate::model::frames::{Frame, UplinkFrame};
use crate::model::gateway::{GatewayLocation, GatewayRxInfo};
use crate::model::lorawan::*;
use anyhow::{Context, Result};
use chrono::Utc;
use serde::Deserialize;

pub struct TtnParser;

impl TtnParser {
    pub fn new() -> Self {
        Self
    }
}

impl Default for TtnParser {
    fn default() -> Self {
        Self::new()
    }
}

/// TTN v3 uplink message format
#[derive(Debug, Deserialize)]
struct TtnUplink {
    end_device_ids: TtnDeviceIds,
    uplink_message: TtnUplinkMessage,
}

#[derive(Debug, Deserialize)]
struct TtnDeviceIds {
    device_id: String,
    dev_eui: String,
    application_ids: TtnApplicationIds,
}

#[derive(Debug, Deserialize)]
struct TtnApplicationIds {
    application_id: String,
}

#[derive(Debug, Deserialize)]
struct TtnUplinkMessage {
    f_port: u8,
    f_cnt: u32,
    #[serde(default)]
    frm_payload: Option<String>,
    #[serde(default)]
    decoded_payload: Option<serde_json::Value>,
    #[serde(default)]
    rx_metadata: Vec<TtnRxMetadata>,
    settings: TtnTxSettings,
    #[serde(default)]
    confirmed: bool,
    #[serde(default)]
    received_at: Option<String>, // ISO 8601
}

#[derive(Debug, Deserialize)]
struct TtnRxMetadata {
    gateway_ids: TtnGatewayIds,
    rssi: i16,
    #[serde(default)]
    channel_rssi: Option<i16>,
    snr: f32,
    #[serde(default)]
    location: Option<TtnLocation>,
}

#[derive(Debug, Deserialize)]
struct TtnGatewayIds {
    gateway_id: String,
    #[serde(default)]
    eui: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TtnLocation {
    latitude: f64,
    longitude: f64,
    #[serde(default)]
    altitude: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct TtnTxSettings {
    data_rate: TtnDataRate,
    frequency: String, // e.g., "868100000"
}

#[derive(Debug, Deserialize)]
struct TtnDataRate {
    #[serde(default)]
    lora: Option<TtnLoRaDataRate>,
}

#[derive(Debug, Deserialize)]
struct TtnLoRaDataRate {
    bandwidth: u32,
    spreading_factor: u8,
}

impl MessageParser for TtnParser {
    fn parse_message(&self, topic: &str, payload: &[u8]) -> Result<Option<Frame>> {
        // TTN topic format: v3/{app_id}/devices/{device_id}/up
        if !topic.ends_with("/up") {
            return Ok(None);
        }

        validate_payload_size(payload, MAX_MQTT_PAYLOAD_SIZE)?;

        let msg: TtnUplink = serde_json::from_slice(payload)
            .context("Failed to parse TTN uplink JSON")?;

        let dev_eui = DevEui::new(msg.end_device_ids.dev_eui)
            .map_err(|e| LoraDbError::MqttParseError(e.to_string()))?;

        let frequency = msg
            .uplink_message
            .settings
            .frequency
            .parse::<u64>()
            .context("Invalid frequency in TTN message")?;

        let lora_dr = msg
            .uplink_message
            .settings
            .data_rate
            .lora
            .context("Non-LoRa data rate not supported")?;

        let received_at = msg
            .uplink_message
            .received_at
            .as_deref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);

        // SECURITY: Validate f_port according to LoRaWAN spec (1-223 for application data)
        let f_port = msg.uplink_message.f_port;
        if f_port == 0 || f_port > 223 {
            tracing::warn!(
                dev_eui = dev_eui.as_str(),
                f_port = f_port,
                "Invalid f_port value (must be 1-223 for application data)"
            );
        }

        let uplink = UplinkFrame {
            dev_eui,
            application_id: ApplicationId::new(
                msg.end_device_ids.application_ids.application_id,
            ),
            device_name: Some(msg.end_device_ids.device_id),
            received_at,
            f_port,
            f_cnt: msg.uplink_message.f_cnt,
            confirmed: msg.uplink_message.confirmed,
            adr: false, // TTN doesn't always expose ADR status
            dr: DataRate {
                modulation: "LORA".to_string(),
                bandwidth: lora_dr.bandwidth,
                spreading_factor: lora_dr.spreading_factor,
                bitrate: None,
            },
            frequency,
            rx_info: msg
                .uplink_message
                .rx_metadata
                .into_iter()
                .map(|rx| GatewayRxInfo {
                    gateway_id: GatewayEui::new(
                        rx.gateway_ids.eui.unwrap_or(rx.gateway_ids.gateway_id),
                    ),
                    rssi: rx.channel_rssi.unwrap_or(rx.rssi),
                    snr: rx.snr,
                    channel: 0, // TTN doesn't expose this
                    rf_chain: 0,
                    location: rx.location.map(|loc| GatewayLocation {
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                        altitude: loc.altitude,
                    }),
                })
                .collect(),
            decoded_payload: msg.uplink_message.decoded_payload.map(DecodedPayload::from_json),
            raw_payload: msg.uplink_message.frm_payload,
        };

        Ok(Some(Frame::Uplink(uplink)))
    }

    fn extract_dev_eui(&self, topic: &str) -> Option<String> {
        // v3/{app_id}/devices/{device_id}/up
        topic.split('/').nth(3).map(String::from)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ttn_parser() {
        let parser = TtnParser;

        let payload = r#"{
            "end_device_ids": {
                "device_id": "test-sensor",
                "dev_eui": "0123456789ABCDEF",
                "application_ids": {
                    "application_id": "test-app"
                }
            },
            "uplink_message": {
                "f_port": 2,
                "f_cnt": 100,
                "frm_payload": "AQIDBAUGBwg=",
                "decoded_payload": {
                    "temperature": 23.5,
                    "humidity": 65.0
                },
                "rx_metadata": [{
                    "gateway_ids": {
                        "gateway_id": "eui-1234567890abcdef",
                        "eui": "1234567890ABCDEF"
                    },
                    "rssi": -60,
                    "channel_rssi": -58,
                    "snr": 9.5
                }],
                "settings": {
                    "data_rate": {
                        "lora": {
                            "bandwidth": 125000,
                            "spreading_factor": 7
                        }
                    },
                    "frequency": "868100000"
                },
                "confirmed": false,
                "received_at": "2025-01-15T12:00:00.000Z"
            }
        }"#;

        let topic = "v3/test-app/devices/test-sensor/up";
        let frame = parser
            .parse_message(topic, payload.as_bytes())
            .unwrap()
            .unwrap();

        match frame {
            Frame::Uplink(uplink) => {
                assert_eq!(uplink.dev_eui.as_str(), "0123456789ABCDEF");
                assert_eq!(uplink.f_port, 2);
                assert_eq!(uplink.f_cnt, 100);
                assert_eq!(uplink.rx_info.len(), 1);
                assert!(uplink.decoded_payload.is_some());
                assert_eq!(uplink.dr.bandwidth, 125000);
                assert_eq!(uplink.dr.spreading_factor, 7);
            }
            _ => panic!("Expected Uplink frame"),
        }
    }
}
