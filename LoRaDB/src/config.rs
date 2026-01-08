use crate::error::LoraDbError;
use anyhow::{Context, Result};
use std::collections::HashMap;
use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub mqtt: MqttConfig,
    pub storage: StorageConfig,
    pub api: ApiConfig,
}

#[derive(Debug, Clone)]
pub struct MqttConfig {
    pub chirpstack_broker: Option<String>,
    pub ttn_broker: Option<String>,
    pub client_id: String,
    pub username: Option<String>,
    pub password: Option<String>,
    pub tls_ca_cert: Option<PathBuf>,
    pub tls_client_cert: Option<PathBuf>,
    pub tls_client_key: Option<PathBuf>,
    pub reconnect_interval_secs: u64,
    pub max_reconnect_interval_secs: u64,
}

#[derive(Debug, Clone)]
pub struct StorageConfig {
    pub data_dir: PathBuf,
    pub wal_sync_interval_ms: u64,
    pub memtable_size_mb: usize,
    pub memtable_flush_interval_secs: u64,
    pub compaction_threshold: usize,
    pub enable_encryption: bool,
    pub encryption_key: Option<String>,
    pub retention_days: Option<u32>,
    pub retention_apps: HashMap<String, Option<u32>>,
    pub retention_check_interval_hours: u64,
}

#[derive(Debug, Clone)]
pub struct ApiConfig {
    pub bind_addr: SocketAddr,
    pub enable_tls: bool,
    pub tls_cert: Option<PathBuf>,
    pub tls_key: Option<PathBuf>,
    pub jwt_secret: String,
    pub jwt_expiration_hours: i64,
    pub rate_limit_per_minute: u32,
    pub cors_allowed_origins: Vec<String>,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        // Load .env file if present (for development)
        dotenvy::dotenv().ok();

        let mqtt = MqttConfig {
            chirpstack_broker: env::var("LORADB_MQTT_CHIRPSTACK_BROKER").ok(),
            ttn_broker: env::var("LORADB_MQTT_TTN_BROKER").ok(),
            client_id: env::var("LORADB_MQTT_CLIENT_ID").unwrap_or_else(|_| {
                format!("loradb-{}", uuid::Uuid::new_v4())
            }),
            username: env::var("LORADB_MQTT_USERNAME").ok(),
            password: env::var("LORADB_MQTT_PASSWORD").ok(),
            tls_ca_cert: env::var("LORADB_MQTT_CA_CERT").ok().map(PathBuf::from),
            tls_client_cert: env::var("LORADB_MQTT_CLIENT_CERT")
                .ok()
                .map(PathBuf::from),
            tls_client_key: env::var("LORADB_MQTT_CLIENT_KEY")
                .ok()
                .map(PathBuf::from),
            reconnect_interval_secs: parse_env(
                "LORADB_MQTT_RECONNECT_INTERVAL_SECS",
                5,
            )?,
            max_reconnect_interval_secs: parse_env(
                "LORADB_MQTT_MAX_RECONNECT_INTERVAL_SECS",
                300,
            )?,
        };

        // Parse retention policy (optional - None means keep data forever)
        let retention_days = env::var("LORADB_STORAGE_RETENTION_DAYS")
            .ok()
            .and_then(|s| s.parse::<u32>().ok());

        // Parse per-application retention policies
        // Format: "app1:30,app2:90,app3:never"
        let retention_apps = env::var("LORADB_STORAGE_RETENTION_APPS")
            .ok()
            .map(|s| {
                s.split(',')
                    .filter_map(|entry| {
                        let parts: Vec<&str> = entry.trim().split(':').collect();
                        if parts.len() == 2 {
                            let app_id = parts[0].trim().to_string();
                            let days = if parts[1].trim().eq_ignore_ascii_case("never") {
                                None  // "never" means keep forever
                            } else {
                                parts[1].trim().parse::<u32>().ok()
                            };
                            Some((app_id, days))
                        } else {
                            None
                        }
                    })
                    .collect::<HashMap<String, Option<u32>>>()
            })
            .unwrap_or_default();

        let storage = StorageConfig {
            data_dir: parse_env_path(
                "LORADB_STORAGE_DATA_DIR",
                "/var/lib/loradb",
            )?,
            wal_sync_interval_ms: parse_env(
                "LORADB_STORAGE_WAL_SYNC_INTERVAL_MS",
                1000,
            )?,
            memtable_size_mb: parse_env("LORADB_STORAGE_MEMTABLE_SIZE_MB", 64)?,
            memtable_flush_interval_secs: parse_env(
                "LORADB_STORAGE_MEMTABLE_FLUSH_INTERVAL_SECS",
                300,  // 5 minutes default
            )?,
            compaction_threshold: parse_env(
                "LORADB_STORAGE_COMPACTION_THRESHOLD",
                10,
            )?,
            enable_encryption: parse_env(
                "LORADB_STORAGE_ENABLE_ENCRYPTION",
                false,
            )?,
            encryption_key: env::var("LORADB_STORAGE_ENCRYPTION_KEY").ok(),
            retention_days,
            retention_apps,
            retention_check_interval_hours: parse_env(
                "LORADB_STORAGE_RETENTION_CHECK_INTERVAL_HOURS",
                24,  // Check once per day by default
            )?,
        };

        // Validate encryption configuration
        if storage.enable_encryption && storage.encryption_key.is_none() {
            return Err(LoraDbError::ConfigError(
                "Encryption enabled but LORADB_STORAGE_ENCRYPTION_KEY not set"
                    .to_string(),
            )
            .into());
        }

        let enable_tls = parse_env("LORADB_API_ENABLE_TLS", false)?;

        // Parse CORS allowed origins (comma-separated list)
        let cors_allowed_origins = env::var("LORADB_API_CORS_ALLOWED_ORIGINS")
            .unwrap_or_else(|_| "*".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect::<Vec<String>>();

        let api = ApiConfig {
            bind_addr: parse_env(
                "LORADB_API_BIND_ADDR",
                "0.0.0.0:8080".parse().context("Invalid default bind address")?,
            )?,
            enable_tls,
            tls_cert: if enable_tls {
                Some(parse_env_path_required("LORADB_API_TLS_CERT")?)
            } else {
                env::var("LORADB_API_TLS_CERT").ok().map(PathBuf::from)
            },
            tls_key: if enable_tls {
                Some(parse_env_path_required("LORADB_API_TLS_KEY")?)
            } else {
                env::var("LORADB_API_TLS_KEY").ok().map(PathBuf::from)
            },
            jwt_secret: env::var("LORADB_API_JWT_SECRET").context(
                "LORADB_API_JWT_SECRET must be set",
            )?,
            jwt_expiration_hours: parse_env(
                "LORADB_API_JWT_EXPIRATION_HOURS",
                1,
            )?,
            rate_limit_per_minute: parse_env(
                "LORADB_API_RATE_LIMIT_PER_MINUTE",
                60,
            )?,
            cors_allowed_origins,
        };

        // Validate JWT secret length
        if api.jwt_secret.len() < 32 {
            return Err(LoraDbError::ConfigError(
                "JWT secret must be at least 32 characters".to_string(),
            )
            .into());
        }

        Ok(Config {
            mqtt,
            storage,
            api,
        })
    }

    pub fn validate(&self) -> Result<()> {
        // MQTT ingestion is now optional - HTTP ingestion can be used instead
        // No validation required for MQTT brokers (both can be None)

        // Validate TLS certificate paths exist if TLS is enabled
        if self.api.enable_tls {
            if let Some(ref cert) = self.api.tls_cert {
                if !cert.exists() {
                    return Err(LoraDbError::ConfigError(format!(
                        "API TLS certificate not found: {:?}",
                        cert
                    ))
                    .into());
                }
            } else {
                return Err(LoraDbError::ConfigError(
                    "TLS enabled but LORADB_API_TLS_CERT not set".to_string(),
                )
                .into());
            }

            if let Some(ref key) = self.api.tls_key {
                if !key.exists() {
                    return Err(LoraDbError::ConfigError(format!(
                        "API TLS key not found: {:?}",
                        key
                    ))
                    .into());
                }
            } else {
                return Err(LoraDbError::ConfigError(
                    "TLS enabled but LORADB_API_TLS_KEY not set".to_string(),
                )
                .into());
            }
        }

        // Validate MQTT CA cert if provided
        if let Some(ref ca_cert) = self.mqtt.tls_ca_cert {
            if !ca_cert.exists() {
                return Err(LoraDbError::ConfigError(format!(
                    "MQTT CA certificate not found: {:?}",
                    ca_cert
                ))
                .into());
            }
        }

        // Validate encryption key if encryption is enabled
        if self.storage.enable_encryption {
            if let Some(ref key) = self.storage.encryption_key {
                // Try to decode base64 key
                use base64::Engine;
                base64::engine::general_purpose::STANDARD.decode(key).map_err(|e| {
                    LoraDbError::ConfigError(format!(
                        "Invalid base64 encryption key: {}",
                        e
                    ))
                })?;
            }
        }

        Ok(())
    }
}

fn parse_env<T: std::str::FromStr>(key: &str, default: T) -> Result<T>
where
    T::Err: std::fmt::Display,
{
    env::var(key)
        .ok()
        .map(|s| {
            s.parse().map_err(|e| {
                anyhow::anyhow!("Failed to parse {}: {}", key, e)
            })
        })
        .transpose()
        .map(|opt| opt.unwrap_or(default))
}

fn parse_env_path(key: &str, default: &str) -> Result<PathBuf> {
    Ok(env::var(key).unwrap_or_else(|_| default.to_string()).into())
}

fn parse_env_path_required(key: &str) -> Result<PathBuf> {
    env::var(key)
        .context(format!("{} must be set", key))
        .map(PathBuf::from)
}
