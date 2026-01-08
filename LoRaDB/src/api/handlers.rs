use crate::api::middleware::AuthContext;
use crate::error::LoraDbError;
use crate::ingest::chirpstack::ChirpStackParser;
use crate::query::dsl::QueryResult;
use crate::query::executor::QueryExecutor;
use crate::query::parser::QueryParser;
use crate::security::api_token::ApiTokenStore;
use crate::storage::StorageEngine;
use axum::{
    body::Bytes,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    Extension,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

// SECURITY: String length limits to prevent memory exhaustion attacks
const MAX_QUERY_LENGTH: usize = 10_000;
const MAX_TOKEN_NAME_LENGTH: usize = 100;
const MAX_DEV_EUI_LENGTH: usize = 32;
const MAX_TOKEN_ID_LENGTH: usize = 64;
const MAX_APP_ID_LENGTH: usize = 256;
const MAX_PAYLOAD_SIZE: usize = 1_048_576; // 1MB max for webhook payloads

/// Validate string length
fn validate_string_length(s: &str, max_len: usize, field_name: &str) -> Result<(), LoraDbError> {
    if s.len() > max_len {
        return Err(LoraDbError::QueryParseError(format!(
            "{} exceeds maximum length of {} characters (got {})",
            field_name,
            max_len,
            s.len()
        )));
    }
    Ok(())
}

/// Application state shared across handlers
#[derive(Clone)]
pub struct AppState {
    pub storage: Arc<StorageEngine>,
    pub query_executor: Arc<QueryExecutor>,
    pub query_parser: Arc<QueryParser>,
    pub api_token_store: Arc<ApiTokenStore>,
}

/// Query request body
#[derive(Debug, Deserialize)]
pub struct QueryRequest {
    pub query: String,
}

/// Health check response
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
}

/// Device list response
#[derive(Debug, Serialize)]
pub struct DeviceListResponse {
    pub total_devices: usize,
    pub devices: Vec<DeviceInfo>,
}

/// Device information
#[derive(Debug, Serialize)]
pub struct DeviceInfo {
    pub dev_eui: String,
    pub device_name: Option<String>,
    pub application_id: String,
    pub last_seen: Option<String>,
}

/// API token creation request
#[derive(Debug, Deserialize)]
pub struct CreateTokenRequest {
    pub name: String,
    pub expires_in_days: Option<i64>,
}

/// API token response
#[derive(Debug, Serialize)]
pub struct TokenResponse {
    pub token: String,
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub expires_at: Option<String>,
}

/// API token list item (without the actual token)
#[derive(Debug, Serialize)]
pub struct TokenInfo {
    pub id: String,
    pub name: String,
    pub created_by: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub expires_at: Option<String>,
    pub is_active: bool,
}

/// Token list response
#[derive(Debug, Serialize)]
pub struct TokenListResponse {
    pub total: usize,
    pub tokens: Vec<TokenInfo>,
}

/// ChirpStack ingestion query parameter
#[derive(Debug, Deserialize)]
pub struct IngestQuery {
    pub event: String,  // "up", "join", or "status"
}

/// ChirpStack ingestion response
#[derive(Debug, Serialize)]
pub struct IngestResponse {
    pub success: bool,
    pub dev_eui: String,
    pub event_type: String,
}

/// Error response
#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
}

impl IntoResponse for LoraDbError {
    fn into_response(self) -> Response {
        let (status, error_type, message) = match self {
            LoraDbError::QueryParseError(msg) => {
                // User input error - safe to expose details
                (StatusCode::BAD_REQUEST, "QueryParseError", msg)
            }
            LoraDbError::QueryExecutionError(msg) => {
                // SECURITY: Log detailed error but return sanitized message to user
                tracing::error!(error = %msg, "Query execution error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "QueryExecutionError",
                    "Query execution failed. Please check your query syntax and try again.".to_string(),
                )
            }
            LoraDbError::AuthError(_) => {
                // Don't expose auth error details for security
                (StatusCode::UNAUTHORIZED, "AuthError", "Authentication failed".to_string())
            }
            LoraDbError::InvalidDevEui(msg) => {
                // User input error - safe to expose details
                (StatusCode::BAD_REQUEST, "InvalidDevEui", msg)
            }
            LoraDbError::StorageError(msg) => {
                // SECURITY: Log detailed error but return generic message
                tracing::error!(error = %msg, "Storage error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "InternalError",
                    "An internal error occurred. Please try again later.".to_string(),
                )
            }
            _ => {
                // SECURITY: Log detailed error but return generic message
                let error_msg = self.to_string();
                tracing::error!(error = %error_msg, "Internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "InternalError",
                    "An internal error occurred. Please try again later.".to_string(),
                )
            }
        };

        let body = Json(ErrorResponse {
            error: error_type.to_string(),
            message,
        });

        (status, body).into_response()
    }
}

/// Health check endpoint
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

/// Execute a query
pub async fn execute_query(
    State(state): State<AppState>,
    Extension(auth_context): Extension<AuthContext>,
    Json(request): Json<QueryRequest>,
) -> Result<Json<QueryResult>, LoraDbError> {
    // SECURITY: Validate query string length
    validate_string_length(&request.query, MAX_QUERY_LENGTH, "Query")?;

    tracing::info!(
        user = auth_context.user_id(),
        query = request.query,
        "Executing query"
    );

    // Parse query
    let query = state
        .query_parser
        .parse(&request.query)
        .map_err(|e| LoraDbError::QueryParseError(e.to_string()))?;

    // Execute query
    let result = state
        .query_executor
        .execute(&query)
        .await
        .map_err(|e| LoraDbError::QueryExecutionError(e.to_string()))?;

    Ok(Json(result))
}

/// List all devices
pub async fn list_devices(
    State(state): State<AppState>,
    Extension(_auth_context): Extension<AuthContext>,
) -> Json<DeviceListResponse> {
    let registry = state.storage.device_registry();
    let devices: Vec<DeviceInfo> = registry
        .list_devices()
        .into_iter()
        .map(|device| DeviceInfo {
            dev_eui: device.dev_eui.as_str().to_string(),
            device_name: device.device_name,
            application_id: device.application_id,
            last_seen: device.last_seen.map(|dt| dt.to_rfc3339()),
        })
        .collect();

    Json(DeviceListResponse {
        total_devices: devices.len(),
        devices,
    })
}

/// Get device information
pub async fn get_device(
    State(state): State<AppState>,
    Extension(_auth_context): Extension<AuthContext>,
    Path(dev_eui): Path<String>,
) -> Result<Json<DeviceInfo>, LoraDbError> {
    // SECURITY: Validate dev_eui string length
    validate_string_length(&dev_eui, MAX_DEV_EUI_LENGTH, "DevEUI")?;

    let registry = state.storage.device_registry();

    if let Some(device) = registry.get_device(&dev_eui) {
        Ok(Json(DeviceInfo {
            dev_eui: device.dev_eui.as_str().to_string(),
            device_name: device.device_name,
            application_id: device.application_id,
            last_seen: device.last_seen.map(|dt| dt.to_rfc3339()),
        }))
    } else {
        Err(LoraDbError::InvalidDevEui(format!(
            "Device {} not found",
            dev_eui
        )))
    }
}

/// Delete device and all its data
pub async fn delete_device(
    State(state): State<AppState>,
    Extension(auth_context): Extension<AuthContext>,
    Path(dev_eui): Path<String>,
) -> Result<Json<DeleteDeviceResponse>, LoraDbError> {
    // SECURITY: Validate dev_eui string length
    validate_string_length(&dev_eui, MAX_DEV_EUI_LENGTH, "DevEUI")?;

    let user_id = auth_context.user_id();

    tracing::info!(
        user = user_id,
        dev_eui = dev_eui,
        "Deleting device and all its data"
    );

    // Check if device exists
    let registry = state.storage.device_registry();
    if registry.get_device(&dev_eui).is_none() {
        return Err(LoraDbError::InvalidDevEui(format!(
            "Device {} not found",
            dev_eui
        )));
    }

    // Parse DevEUI
    let dev_eui_parsed = crate::model::lorawan::DevEui::new(dev_eui.clone())
        .map_err(|e| LoraDbError::InvalidDevEui(e.to_string()))?;

    // Delete all data for the device
    let deleted_count = state
        .storage
        .delete_device(&dev_eui_parsed)
        .await
        .map_err(|e| LoraDbError::StorageError(format!("Failed to delete device: {}", e)))?;

    tracing::info!(
        user = user_id,
        dev_eui = dev_eui,
        deleted_frames = deleted_count,
        "Device deleted successfully"
    );

    Ok(Json(DeleteDeviceResponse {
        dev_eui,
        deleted_frames: deleted_count,
    }))
}

/// Delete device response
#[derive(Debug, Serialize)]
pub struct DeleteDeviceResponse {
    pub dev_eui: String,
    pub deleted_frames: usize,
}

/// Create a new API token
pub async fn create_token(
    State(state): State<AppState>,
    Extension(auth_context): Extension<AuthContext>,
    Json(request): Json<CreateTokenRequest>,
) -> Result<Json<TokenResponse>, LoraDbError> {
    // SECURITY: Validate token name length
    validate_string_length(&request.name, MAX_TOKEN_NAME_LENGTH, "Token name")?;

    let user_id = auth_context.user_id();

    tracing::info!(
        user = user_id,
        token_name = request.name,
        "Creating API token"
    );

    // Create the token
    let (token_string, api_token) = state
        .api_token_store
        .create_token(
            request.name,
            user_id.to_string(),
            request.expires_in_days,
        )
        .map_err(|e| LoraDbError::StorageError(format!("Failed to create token: {}", e)))?;

    Ok(Json(TokenResponse {
        token: token_string,
        id: api_token.id,
        name: api_token.name,
        created_at: api_token.created_at.to_rfc3339(),
        expires_at: api_token.expires_at.map(|dt| dt.to_rfc3339()),
    }))
}

/// List all API tokens for the authenticated user
pub async fn list_tokens(
    State(state): State<AppState>,
    Extension(auth_context): Extension<AuthContext>,
) -> Result<Json<TokenListResponse>, LoraDbError> {
    let user_id = auth_context.user_id();

    tracing::info!(user = user_id, "Listing API tokens");

    let tokens = state
        .api_token_store
        .list_tokens(user_id)
        .map_err(|e| LoraDbError::StorageError(format!("Failed to list tokens: {}", e)))?;

    let token_infos: Vec<TokenInfo> = tokens
        .into_iter()
        .map(|t| TokenInfo {
            id: t.id,
            name: t.name,
            created_by: t.created_by,
            created_at: t.created_at.to_rfc3339(),
            last_used_at: t.last_used_at.map(|dt| dt.to_rfc3339()),
            expires_at: t.expires_at.map(|dt| dt.to_rfc3339()),
            is_active: t.is_active,
        })
        .collect();

    Ok(Json(TokenListResponse {
        total: token_infos.len(),
        tokens: token_infos,
    }))
}

/// Revoke an API token
pub async fn revoke_token(
    State(state): State<AppState>,
    Extension(auth_context): Extension<AuthContext>,
    Path(token_id): Path<String>,
) -> Result<StatusCode, LoraDbError> {
    // SECURITY: Validate token ID length
    validate_string_length(&token_id, MAX_TOKEN_ID_LENGTH, "Token ID")?;

    let user_id = auth_context.user_id();

    tracing::info!(
        user = user_id,
        token_id = token_id,
        "Revoking API token"
    );

    state
        .api_token_store
        .revoke_token(&token_id, user_id)
        .map_err(|e| LoraDbError::AuthError(format!("Failed to revoke token: {}", e)))?;

    Ok(StatusCode::NO_CONTENT)
}

// ===== Retention Policy Handlers =====

/// Retention policy response structures
#[derive(Debug, Serialize)]
pub struct RetentionPolicyListResponse {
    pub global_days: Option<u32>,
    pub check_interval_hours: u64,
    pub applications: Vec<ApplicationRetentionPolicy>,
}

#[derive(Debug, Serialize)]
pub struct ApplicationRetentionPolicy {
    pub application_id: String,
    pub days: Option<u32>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct GlobalRetentionResponse {
    pub global_days: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct SetGlobalRetentionRequest {
    pub days: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct SetApplicationRetentionRequest {
    pub days: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct ApplicationRetentionResponse {
    pub application_id: String,
    pub days: Option<u32>,
    pub created_at: String,
    pub updated_at: String,
}

/// List all retention policies
pub async fn list_retention_policies(
    State(state): State<AppState>,
    Extension(_auth_context): Extension<AuthContext>,
) -> Result<Json<RetentionPolicyListResponse>, LoraDbError> {
    let retention_manager = state.storage.retention_manager();
    let policies = retention_manager.get_policies().await;

    let applications: Vec<ApplicationRetentionPolicy> = policies
        .applications
        .into_iter()
        .map(|(app_id, policy)| ApplicationRetentionPolicy {
            application_id: app_id,
            days: policy.days,
            created_at: policy.created_at.to_rfc3339(),
            updated_at: policy.updated_at.to_rfc3339(),
        })
        .collect();

    Ok(Json(RetentionPolicyListResponse {
        global_days: policies.global_days,
        check_interval_hours: policies.check_interval_hours,
        applications,
    }))
}

/// Get global retention policy
pub async fn get_global_retention(
    State(state): State<AppState>,
    Extension(_auth_context): Extension<AuthContext>,
) -> Result<Json<GlobalRetentionResponse>, LoraDbError> {
    let retention_manager = state.storage.retention_manager();
    let global_days = retention_manager.get_global().await;

    Ok(Json(GlobalRetentionResponse { global_days }))
}

/// Set global retention policy
pub async fn set_global_retention(
    State(state): State<AppState>,
    Extension(auth_context): Extension<AuthContext>,
    Json(request): Json<SetGlobalRetentionRequest>,
) -> Result<StatusCode, LoraDbError> {
    let user_id = auth_context.user_id();

    tracing::info!(
        user = user_id,
        days = ?request.days,
        "Setting global retention policy"
    );

    let retention_manager = state.storage.retention_manager();
    retention_manager
        .set_global(request.days)
        .await
        .map_err(|e| LoraDbError::StorageError(format!("Failed to set retention policy: {}", e)))?;

    Ok(StatusCode::OK)
}

/// Get application-specific retention policy
pub async fn get_application_retention(
    State(state): State<AppState>,
    Extension(_auth_context): Extension<AuthContext>,
    Path(app_id): Path<String>,
) -> Result<Json<ApplicationRetentionResponse>, LoraDbError> {
    // SECURITY: Validate app_id string length
    validate_string_length(&app_id, MAX_APP_ID_LENGTH, "Application ID")?;

    let retention_manager = state.storage.retention_manager();

    if let Some(policy) = retention_manager.get_application(&app_id).await {
        Ok(Json(ApplicationRetentionResponse {
            application_id: app_id,
            days: policy.days,
            created_at: policy.created_at.to_rfc3339(),
            updated_at: policy.updated_at.to_rfc3339(),
        }))
    } else {
        Err(LoraDbError::StorageError(format!(
            "No retention policy found for application '{}'",
            app_id
        )))
    }
}

/// Set application-specific retention policy
pub async fn set_application_retention(
    State(state): State<AppState>,
    Path(app_id): Path<String>,
    Extension(auth_context): Extension<AuthContext>,
    Json(request): Json<SetApplicationRetentionRequest>,
) -> Result<StatusCode, LoraDbError> {
    // SECURITY: Validate app_id string length
    validate_string_length(&app_id, MAX_APP_ID_LENGTH, "Application ID")?;

    let user_id = auth_context.user_id();

    tracing::info!(
        user = user_id,
        application_id = app_id,
        days = ?request.days,
        "Setting application retention policy"
    );

    let retention_manager = state.storage.retention_manager();
    retention_manager
        .set_application(app_id, request.days)
        .await
        .map_err(|e| LoraDbError::StorageError(format!("Failed to set retention policy: {}", e)))?;

    Ok(StatusCode::OK)
}

/// Delete application-specific retention policy
pub async fn delete_application_retention(
    State(state): State<AppState>,
    Path(app_id): Path<String>,
    Extension(auth_context): Extension<AuthContext>,
) -> Result<StatusCode, LoraDbError> {
    // SECURITY: Validate app_id string length
    validate_string_length(&app_id, MAX_APP_ID_LENGTH, "Application ID")?;

    let user_id = auth_context.user_id();

    tracing::info!(
        user = user_id,
        application_id = app_id,
        "Deleting application retention policy"
    );

    let retention_manager = state.storage.retention_manager();
    let removed = retention_manager
        .remove_application(&app_id)
        .await
        .map_err(|e| LoraDbError::StorageError(format!("Failed to delete retention policy: {}", e)))?;

    if removed {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(LoraDbError::StorageError(format!(
            "No retention policy found for application '{}'",
            app_id
        )))
    }
}

/// Trigger immediate retention enforcement
pub async fn enforce_retention(
    State(state): State<AppState>,
    Extension(auth_context): Extension<AuthContext>,
) -> Result<StatusCode, LoraDbError> {
    let user_id = auth_context.user_id();

    tracing::info!(
        user = user_id,
        "Triggering immediate retention enforcement"
    );

    state
        .storage
        .enforce_retention()
        .await
        .map_err(|e| LoraDbError::StorageError(format!("Failed to enforce retention: {}", e)))?;

    Ok(StatusCode::OK)
}

/// Ingest ChirpStack webhook event
pub async fn ingest_chirpstack(
    State(state): State<AppState>,
    Extension(auth_context): Extension<AuthContext>,
    Query(query): Query<IngestQuery>,
    payload: Bytes,
) -> Result<Json<IngestResponse>, LoraDbError> {
    // SECURITY: Validate payload size (1MB max)
    if payload.len() > MAX_PAYLOAD_SIZE {
        return Err(LoraDbError::MqttParseError(
            format!("Payload exceeds maximum size of {} bytes", MAX_PAYLOAD_SIZE)
        ));
    }

    // Log ingestion attempt with user_id for audit trail
    let user_id = auth_context.user_id();
    tracing::info!(
        user = user_id,
        event_type = query.event,
        payload_size = payload.len(),
        "Received ChirpStack webhook event"
    );

    // Create parser
    let parser = ChirpStackParser::new();

    // Parse based on event type
    let frame = match query.event.as_str() {
        "up" => parser.parse_uplink(&payload)
            .map_err(|e| LoraDbError::MqttParseError(format!("Failed to parse uplink: {}", e)))?,
        "join" => parser.parse_join(&payload)
            .map_err(|e| LoraDbError::MqttParseError(format!("Failed to parse join: {}", e)))?,
        "status" => parser.parse_status(&payload)
            .map_err(|e| LoraDbError::MqttParseError(format!("Failed to parse status: {}", e)))?,
        other => {
            tracing::warn!(event_type = other, "Unsupported event type");
            return Err(LoraDbError::QueryParseError(
                format!("Unsupported event type: {}. Supported: up, join, status", other)
            ));
        }
    };

    let dev_eui = frame.dev_eui().to_string();

    // Write directly to storage (async, no channel needed)
    state.storage.write(frame).await
        .map_err(|e| LoraDbError::StorageError(format!("Failed to write frame: {}", e)))?;

    tracing::info!(
        user = user_id,
        event_type = query.event,
        dev_eui = dev_eui,
        "Successfully ingested event"
    );

    Ok(Json(IngestResponse {
        success: true,
        dev_eui,
        event_type: query.event,
    }))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use super::*;
    use crate::config::StorageConfig;
    use crate::model::frames::UplinkFrame;
    use crate::model::lorawan::*;
    use crate::security::jwt::Claims;
    use chrono::Utc;
    use tempfile::TempDir;

    async fn create_test_state() -> AppState {
        let temp_dir = TempDir::new().unwrap();
        let config = StorageConfig {
            data_dir: temp_dir.path().to_path_buf(),
            wal_sync_interval_ms: 1000,
            memtable_size_mb: 1,
            memtable_flush_interval_secs: 300,
            compaction_threshold: 3,
            enable_encryption: false,
            encryption_key: None,
            retention_days: None,
            retention_apps: HashMap::new(),
            retention_check_interval_hours: 24,
        };

        let storage = Arc::new(StorageEngine::new(config).await.unwrap());
        let query_executor = Arc::new(QueryExecutor::new(storage.clone()));
        let query_parser = Arc::new(QueryParser::new());
        let api_token_store = Arc::new(
            ApiTokenStore::new(temp_dir.path().join("tokens.json")).unwrap(),
        );

        AppState {
            storage,
            query_executor,
            query_parser,
            api_token_store,
        }
    }

    fn create_test_uplink(dev_eui: &str) -> crate::model::frames::Frame {
        crate::model::frames::Frame::Uplink(UplinkFrame {
            dev_eui: DevEui::new(dev_eui.to_string()).unwrap(),
            application_id: ApplicationId::new("test-app".to_string()),
            device_name: Some("test-device".to_string()),
            received_at: Utc::now(),
            f_port: 1,
            f_cnt: 42,
            confirmed: false,
            adr: true,
            dr: DataRate::new_lora(125000, 7),
            frequency: 868100000,
            rx_info: vec![],
            decoded_payload: None,
            raw_payload: Some("aGVsbG8=".to_string()),
        })
    }

    #[tokio::test]
    async fn test_health_check() {
        let response = health_check().await;
        assert_eq!(response.0.status, "ok");
    }

    #[tokio::test]
    async fn test_execute_query() {
        let state = create_test_state().await;
        let claims = Claims::new("test-user".to_string());
        let auth_context = AuthContext::Jwt(claims);

        // Write a test frame
        let dev_eui = "0123456789ABCDEF";
        let frame = create_test_uplink(dev_eui);
        state.storage.write(frame).await.unwrap();

        // Execute query
        let request = QueryRequest {
            query: format!("SELECT * FROM device '{}' WHERE LAST '1h'", dev_eui),
        };

        let result = execute_query(
            State(state),
            Extension(auth_context),
            Json(request),
        )
        .await
        .unwrap();

        assert_eq!(result.0.total_frames, 1);
    }

    #[tokio::test]
    async fn test_list_devices() {
        let state = create_test_state().await;
        let claims = Claims::new("test-user".to_string());
        let auth_context = AuthContext::Jwt(claims);

        // Write test frames for different devices
        for i in 0..3 {
            let dev_eui = format!("012345678{:07X}", i);
            let frame = create_test_uplink(&dev_eui);
            state.storage.write(frame).await.unwrap();
        }

        let response = list_devices(State(state), Extension(auth_context)).await;
        assert_eq!(response.0.total_devices, 3);
    }
}
