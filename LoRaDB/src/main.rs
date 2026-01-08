use loradb::api::http::HttpServer;
use loradb::config::Config;
use loradb::ingest::mqtt::{BrokerConfig, MqttIngestor};
use loradb::security::api_token::ApiTokenStore;
use loradb::security::jwt::JwtService;
use loradb::storage::StorageEngine;
use anyhow::Result;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{error, info};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("loradb=info".parse()?)
        )
        .json()
        .init();

    info!("Starting LoRaDB v{}", loradb::VERSION);

    // Load configuration
    let config = Config::from_env()?;
    config.validate()?;

    info!("Configuration loaded successfully");

    // Initialize storage engine
    info!("Initializing storage engine at {}", config.storage.data_dir.display());
    let storage = Arc::new(StorageEngine::new(config.storage.clone()).await?);
    info!("Storage engine initialized");

    // Initialize JWT service
    info!("Initializing JWT authentication");
    let jwt_service = Arc::new(JwtService::new(&config.api.jwt_secret)?);

    // Initialize API token store
    info!("Initializing API token store");
    let token_store_path = config.storage.data_dir.join("api_tokens.json");
    let api_token_store = Arc::new(ApiTokenStore::new(&token_store_path)?);
    info!("API token store initialized at {}", token_store_path.display());

    // Initialize HTTP server
    info!("Initializing API server on {}", config.api.bind_addr);
    let http_server = HttpServer::new(
        storage.clone(),
        jwt_service,
        api_token_store,
        config.api.clone(),
    );

    // Start periodic memtable flush (every 5 minutes)
    info!("Starting periodic memtable flush task");
    let flush_handle = storage.clone().start_periodic_flush();

    // Start periodic retention enforcement
    info!("Starting retention policy enforcement task");
    let retention_handle = storage.clone().start_retention_enforcement();

    // Initialize MQTT ingestion (optional)
    let (mqtt_handle, processor_handle) = if config.mqtt.chirpstack_broker.is_some() || config.mqtt.ttn_broker.is_some() {
        info!("Initializing MQTT ingestion");

        // Create channel for MQTT -> Storage communication
        let (frame_tx, frame_rx) = mpsc::channel(1000);

        // Start frame processor in background
        let storage_clone = storage.clone();
        let processor_handle = tokio::spawn(async move {
            storage_clone.start_frame_processor(frame_rx).await;
        });

        let chirpstack_broker = config.mqtt.chirpstack_broker.clone().map(|url| BrokerConfig {
            broker_url: url,
            topic_prefix: "application/+/device/+/event".to_string(),
        });

        let ttn_broker = config.mqtt.ttn_broker.clone().map(|url| BrokerConfig {
            broker_url: url,
            topic_prefix: "v3/+/devices/+".to_string(),
        });

        let mqtt_ingestor = MqttIngestor::new(
            config.mqtt.clone(),
            chirpstack_broker,
            ttn_broker,
            frame_tx,
        );

        let mqtt_handle = tokio::spawn(async move {
            if let Err(e) = mqtt_ingestor.start().await {
                error!("MQTT ingestion error: {}", e);
            }
        });

        (Some(mqtt_handle), Some(processor_handle))
    } else {
        info!("MQTT ingestion disabled - using HTTP ingestion only");
        (None, None)
    };

    info!("LoRaDB started successfully");

    // Start HTTP server in background
    let server_handle = tokio::spawn(async move {
        if let Err(e) = http_server.serve().await {
            error!("HTTP server error: {}", e);
        }
    });

    // Wait for shutdown signal (SIGTERM or SIGINT)
    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("SIGINT received, shutting down gracefully...");
        }
        _ = async {
            #[cfg(unix)]
            {
                let mut sigterm = tokio::signal::unix::signal(
                    tokio::signal::unix::SignalKind::terminate()
                ).expect("Failed to register SIGTERM handler");
                sigterm.recv().await;
            }
            #[cfg(not(unix))]
            {
                std::future::pending::<()>().await;
            }
        } => {
            info!("SIGTERM received, shutting down gracefully...");
        }
    }

    // Stop MQTT ingestion first
    if let Some(handle) = mqtt_handle {
        handle.abort();
    }

    // Stop HTTP server
    server_handle.abort();

    // Stop periodic flush task
    flush_handle.abort();

    // Stop retention enforcement task
    retention_handle.abort();

    // Give a moment for in-flight requests to complete
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Flush storage engine (ensures memtable is written to SSTable)
    if let Err(e) = storage.shutdown().await {
        error!("Error during storage shutdown: {}", e);
    }

    // Stop frame processor last (if MQTT was enabled)
    if let Some(handle) = processor_handle {
        handle.abort();
    }

    info!("LoRaDB shutdown complete");

    Ok(())
}
