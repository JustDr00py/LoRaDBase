use crate::config::MqttConfig;
use crate::error::LoraDbError;
use crate::ingest::chirpstack::ChirpStackParser;
use crate::ingest::common::MessageParser;
use crate::ingest::ttn::TtnParser;
use crate::model::frames::Frame;
use anyhow::{Context, Result};
use rumqttc::{AsyncClient, Event, Incoming, MqttOptions, QoS, Transport};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

const MAX_MQTT_PACKET_SIZE: usize = 256 * 1024; // 256KB
pub const MQTT_KEEP_ALIVE: u64 = 30; // 30 seconds
const RECONNECT_DELAY: Duration = Duration::from_secs(5);

/// MQTT broker configuration
#[derive(Clone)]
pub struct BrokerConfig {
    pub broker_url: String,
    pub topic_prefix: String,
}

/// MQTT ingestion client that connects to ChirpStack and/or TTN
pub struct MqttIngestor {
    mqtt_config: MqttConfig,
    chirpstack_broker: Option<BrokerConfig>,
    ttn_broker: Option<BrokerConfig>,
    frame_tx: mpsc::Sender<Frame>,
}

impl MqttIngestor {
    pub fn new(
        mqtt_config: MqttConfig,
        chirpstack_broker: Option<BrokerConfig>,
        ttn_broker: Option<BrokerConfig>,
        frame_tx: mpsc::Sender<Frame>,
    ) -> Self {
        Self {
            mqtt_config,
            chirpstack_broker,
            ttn_broker,
            frame_tx,
        }
    }

    /// Start MQTT ingestion (spawns background tasks)
    pub async fn start(self) -> Result<()> {
        let mut tasks = Vec::new();

        // Start ChirpStack client if configured
        if let Some(broker_cfg) = self.chirpstack_broker {
            let mqtt_cfg = self.mqtt_config.clone();
            let tx = self.frame_tx.clone();
            let handle = tokio::spawn(async move {
                Self::run_client(
                    mqtt_cfg,
                    broker_cfg,
                    "chirpstack",
                    Arc::new(ChirpStackParser::new()),
                    tx,
                )
                .await
            });
            tasks.push(handle);
        }

        // Start TTN client if configured
        if let Some(broker_cfg) = self.ttn_broker {
            let mqtt_cfg = self.mqtt_config.clone();
            let tx = self.frame_tx.clone();
            let handle = tokio::spawn(async move {
                Self::run_client(
                    mqtt_cfg,
                    broker_cfg,
                    "ttn",
                    Arc::new(TtnParser::new()),
                    tx,
                )
                .await
            });
            tasks.push(handle);
        }

        if tasks.is_empty() {
            return Err(LoraDbError::MqttError(
                "No MQTT brokers configured".to_string(),
            )
            .into());
        }

        info!("Started {} MQTT client(s)", tasks.len());

        // Wait for all tasks (they run forever unless error)
        for task in tasks {
            if let Err(e) = task.await {
                error!("MQTT task failed: {}", e);
            }
        }

        Ok(())
    }

    /// Run a single MQTT client connection
    async fn run_client(
        mqtt_config: MqttConfig,
        broker_config: BrokerConfig,
        name: &str,
        parser: Arc<dyn MessageParser + Send + Sync>,
        frame_tx: mpsc::Sender<Frame>,
    ) -> Result<()> {
        loop {
            match Self::connect_and_run(
                &mqtt_config,
                &broker_config,
                name,
                parser.clone(),
                frame_tx.clone(),
            )
            .await
            {
                Ok(_) => {
                    info!("{} MQTT client disconnected gracefully", name);
                }
                Err(e) => {
                    error!("{} MQTT client error: {}", name, e);
                }
            }

            warn!(
                "{} MQTT client disconnected, reconnecting in {:?}",
                name, RECONNECT_DELAY
            );
            tokio::time::sleep(RECONNECT_DELAY).await;
        }
    }

    /// Connect to MQTT broker and process messages
    async fn connect_and_run(
        mqtt_config: &MqttConfig,
        broker_config: &BrokerConfig,
        name: &str,
        parser: Arc<dyn MessageParser + Send + Sync>,
        frame_tx: mpsc::Sender<Frame>,
    ) -> Result<()> {
        // Parse broker URL
        let broker_url = &broker_config.broker_url;
        let use_tls = broker_url.starts_with("mqtts://") || broker_url.starts_with("ssl://");

        // Extract host and port
        let broker_str = broker_url
            .trim_start_matches("mqtts://")
            .trim_start_matches("mqtt://")
            .trim_start_matches("ssl://");

        let (host, port) = if let Some((h, p)) = broker_str.split_once(':') {
            (h.to_string(), p.parse::<u16>()?)
        } else {
            (broker_str.to_string(), if use_tls { 8883 } else { 1883 })
        };

        info!(
            "Connecting to {} MQTT broker at {}:{} (TLS: {})",
            name, host, port, use_tls
        );

        // Create MQTT options
        let client_id = format!("loradb-{}-{}", name, uuid::Uuid::new_v4());
        let mut mqttoptions = MqttOptions::new(&client_id, host.clone(), port);

        mqttoptions.set_keep_alive(Duration::from_secs(MQTT_KEEP_ALIVE));
        mqttoptions.set_max_packet_size(MAX_MQTT_PACKET_SIZE, MAX_MQTT_PACKET_SIZE);

        // Set credentials if provided
        if let (Some(username), Some(password)) = (&mqtt_config.username, &mqtt_config.password) {
            mqttoptions.set_credentials(username, password);
        }

        // Configure TLS if needed
        if use_tls {
            // Use rustls transport (will load system certificates automatically)
            mqttoptions.set_transport(Transport::tls_with_default_config());

            info!("{} MQTT: TLS configured with system certificates", name);
        }

        // Create client and event loop
        let (client, mut eventloop) = AsyncClient::new(mqttoptions, 100);

        // Subscribe to topics
        let topic = format!("{}/#", broker_config.topic_prefix);
        client
            .subscribe(&topic, QoS::AtLeastOnce)
            .await
            .context("Failed to subscribe to topic")?;

        info!("{} MQTT: Subscribed to topic: {}", name, topic);

        // Process events
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Incoming::Publish(publish))) => {
                    debug!(
                        "{} MQTT: Received message on topic: {}",
                        name, publish.topic
                    );

                    // Parse message
                    match parser.parse_message(&publish.topic, &publish.payload) {
                        Ok(Some(frame)) => {
                            // Log successful parse
                            info!(
                                "{} MQTT: Successfully parsed message for device {} on topic '{}'",
                                name, frame.dev_eui().as_str(), publish.topic
                            );

                            // Send frame to processing pipeline
                            if let Err(e) = frame_tx.send(frame).await {
                                error!("{} MQTT: Failed to send frame to pipeline: {}", name, e);
                            }
                        }
                        Ok(None) => {
                            // Message was filtered (e.g., not an uplink)
                            debug!("{} MQTT: Message filtered on topic '{}'", name, publish.topic);
                        }
                        Err(e) => {
                            // Log the error with payload preview for debugging
                            let payload_preview = String::from_utf8_lossy(&publish.payload);
                            let preview = if payload_preview.len() > 500 {
                                format!("{}...", &payload_preview[..500])
                            } else {
                                payload_preview.to_string()
                            };
                            warn!(
                                "{} MQTT: Failed to parse message on topic '{}': {} | Payload: {}",
                                name, publish.topic, e, preview
                            );
                        }
                    }
                }
                Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                    info!("{} MQTT: Connected successfully", name);
                }
                Ok(Event::Incoming(Incoming::SubAck(_))) => {
                    info!("{} MQTT: Subscription acknowledged", name);
                }
                Ok(Event::Incoming(Incoming::Disconnect)) => {
                    warn!("{} MQTT: Disconnected by broker", name);
                    return Err(LoraDbError::MqttError("Disconnected by broker".into()).into());
                }
                Ok(_) => {
                    // Other events (PingResp, PubAck, etc.)
                }
                Err(e) => {
                    error!("{} MQTT: Connection error: {}", name, e);
                    return Err(e.into());
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_broker_url_parsing() {
        // Test MQTTS URL
        let url = "mqtts://broker.example.com:8883";
        let use_tls = url.starts_with("mqtts://");
        assert!(use_tls);

        // Test MQTT URL
        let url = "mqtt://broker.example.com:1883";
        let use_tls = url.starts_with("mqtts://");
        assert!(!use_tls);
    }

    #[tokio::test]
    async fn test_frame_channel() {
        let (tx, mut rx) = mpsc::channel(10);

        // Send a test frame
        let dev_eui = crate::model::lorawan::DevEui::new("0123456789ABCDEF".to_string()).unwrap();
        let frame = crate::model::frames::Frame::Uplink(
            crate::model::frames::UplinkFrame {
                dev_eui: dev_eui.clone(),
                application_id: crate::model::lorawan::ApplicationId::new("test-app".to_string()),
                device_name: Some("test-device".to_string()),
                received_at: chrono::Utc::now(),
                f_port: 1,
                f_cnt: 42,
                confirmed: false,
                adr: true,
                dr: crate::model::lorawan::DataRate::new_lora(125000, 7),
                frequency: 868100000,
                rx_info: vec![],
                decoded_payload: None,
                raw_payload: Some("aGVsbG8=".to_string()),
            },
        );

        tx.send(frame).await.unwrap();

        // Receive frame
        let received = rx.recv().await.unwrap();
        assert_eq!(received.dev_eui(), &dev_eui);
    }
}
