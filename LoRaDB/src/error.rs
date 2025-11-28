use thiserror::Error;

#[derive(Error, Debug)]
pub enum LoraDbError {
    #[error("MQTT connection error: {0}")]
    MqttError(String),

    #[error("MQTT parsing error: {0}")]
    MqttParseError(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("WAL error: {0}")]
    WalError(String),

    #[error("Encryption error: {0}")]
    EncryptionError(String),

    #[error("Decryption error: {0}")]
    DecryptionError(String),

    #[error("Invalid frame: {0}")]
    InvalidFrame(String),

    #[error("Invalid DevEUI: {0}")]
    InvalidDevEui(String),

    #[error("Query parse error: {0}")]
    QueryParseError(String),

    #[error("Query execution error: {0}")]
    QueryExecutionError(String),

    #[error("Authentication error: {0}")]
    AuthError(String),

    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("TLS error: {0}")]
    TlsError(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),

    #[error("Deserialization error: {0}")]
    DeserializationError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Bincode error: {0}")]
    BincodeError(String),
}

impl From<bincode::Error> for LoraDbError {
    fn from(err: bincode::Error) -> Self {
        LoraDbError::BincodeError(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, LoraDbError>;
