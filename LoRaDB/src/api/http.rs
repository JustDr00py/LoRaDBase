use crate::api::handlers::{
    create_token, delete_device, enforce_retention, execute_query,
    get_application_retention, get_device, get_global_retention, health_check, list_devices,
    list_retention_policies, list_tokens, revoke_token, AppState,
};
use crate::api::middleware::{jwt_auth, security_headers, AuthMiddleware};
use crate::config::ApiConfig;
use crate::query::executor::QueryExecutor;
use crate::query::parser::QueryParser;
use crate::security::api_token::ApiTokenStore;
use crate::security::jwt::JwtService;
use crate::storage::StorageEngine;
use anyhow::Result;
use axum::{
    middleware,
    routing::{delete, get, post},
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tracing::info;

/// HTTP/HTTPS API server
pub struct HttpServer {
    app_state: AppState,
    auth_middleware: AuthMiddleware,
    bind_addr: SocketAddr,
    enable_tls: bool,
    tls_cert_path: Option<String>,
    tls_key_path: Option<String>,
    cors_allowed_origins: Vec<String>,
    #[allow(dead_code)]
    rate_limit_per_minute: u32,
}

impl HttpServer {
    pub fn new(
        storage: Arc<StorageEngine>,
        jwt_service: Arc<JwtService>,
        api_token_store: Arc<ApiTokenStore>,
        config: ApiConfig,
    ) -> Self {
        let query_executor = Arc::new(QueryExecutor::new(storage.clone()));
        let query_parser = Arc::new(QueryParser::new());

        let app_state = AppState {
            storage,
            query_executor,
            query_parser,
            api_token_store: api_token_store.clone(),
        };

        let auth_middleware = AuthMiddleware::new(jwt_service, api_token_store);

        Self {
            app_state,
            auth_middleware,
            bind_addr: config.bind_addr,
            enable_tls: config.enable_tls,
            tls_cert_path: config.tls_cert.map(|p| p.to_string_lossy().to_string()),
            tls_key_path: config.tls_key.map(|p| p.to_string_lossy().to_string()),
            cors_allowed_origins: config.cors_allowed_origins,
            rate_limit_per_minute: config.rate_limit_per_minute,
        }
    }

    /// Build the Axum router with all routes and middleware
    fn build_router(&self) -> Router {
        // NOTE: Rate limiting and body size limiting have been temporarily disabled
        // due to compatibility issues with Axum 0.6. Axum 0.6 has a default 2MB body limit.
        // For rate limiting, consider upgrading to Axum 0.7+ or using a custom middleware.

        // Public routes (no authentication required)
        let public_routes = Router::new().route("/health", get(health_check));

        // Protected routes (authentication required)
        let protected_routes = Router::new()
            .route("/query", post(execute_query))
            .route("/devices", get(list_devices))
            .route("/devices/:dev_eui", get(get_device))
            .route("/devices/:dev_eui", delete(delete_device))
            // API token management routes
            .route("/tokens", post(create_token))
            .route("/tokens", get(list_tokens))
            .route("/tokens/:token_id", delete(revoke_token))
            // Retention policy management routes
            .route("/retention/policies", get(list_retention_policies))
            .route("/retention/policies/global", get(get_global_retention))
            // TODO: Fix Handler trait issues with State+Extension+Json combination
            // .route("/retention/policies/global", axum::routing::put(set_global_retention))
            .route("/retention/policies/:app_id", get(get_application_retention))
            // TODO: Fix Handler trait issues with State+Path+Extension+Json combination
            // .route("/retention/policies/:app_id", axum::routing::put(set_application_retention))
            // .route("/retention/policies/:app_id", delete(delete_application_retention))
            .route("/retention/enforce", post(enforce_retention))
            .layer(middleware::from_fn_with_state(
                self.auth_middleware.clone(),
                jwt_auth,
            ));

        // Build CORS layer based on configuration
        let cors = if self.cors_allowed_origins.len() == 1 && self.cors_allowed_origins[0] == "*" {
            // SECURITY WARNING: Allow all origins (development mode only)
            tracing::warn!(
                "CORS configured to allow all origins (*). This should ONLY be used in development. \
                 Set LORADB_API_CORS_ALLOWED_ORIGINS to specific origins in production."
            );
            CorsLayer::permissive()
        } else {
            // Restrict to specific origins (production mode)
            let origins: Vec<_> = self
                .cors_allowed_origins
                .iter()
                .filter_map(|origin| origin.parse().ok())
                .collect();

            CorsLayer::new()
                .allow_origin(AllowOrigin::list(origins))
                .allow_methods([
                    axum::http::Method::GET,
                    axum::http::Method::POST,
                    axum::http::Method::PUT,
                    axum::http::Method::DELETE,
                    axum::http::Method::OPTIONS,
                ])
                .allow_headers([
                    axum::http::header::CONTENT_TYPE,
                    axum::http::header::AUTHORIZATION,
                ])
        };

        // Combine routes and apply global middleware
        // NOTE: Axum 0.6 has a default 2MB body limit which is reasonable for our API
        Router::new()
            .merge(public_routes)
            .merge(protected_routes)
            .layer(cors)
            .layer(middleware::from_fn(security_headers))
            .with_state(self.app_state.clone())
    }

    /// Start the HTTP/HTTPS server
    pub async fn serve(self) -> Result<()> {
        let app = self.build_router();

        if self.enable_tls {
            info!(
                "Starting HTTPS server on {} with TLS",
                self.bind_addr
            );

            let cert_path = self.tls_cert_path.as_ref().ok_or_else(|| {
                anyhow::anyhow!("TLS enabled but cert path not configured")
            })?;
            let key_path = self.tls_key_path.as_ref().ok_or_else(|| {
                anyhow::anyhow!("TLS enabled but key path not configured")
            })?;

            let config = axum_server::tls_rustls::RustlsConfig::from_pem_file(
                cert_path,
                key_path,
            )
            .await?;

            axum_server::bind_rustls(self.bind_addr, config)
                .serve(app.into_make_service())
                .await?;
        } else {
            info!(
                "Starting HTTP server on {} (TLS disabled - use reverse proxy for HTTPS)",
                self.bind_addr
            );

            axum_server::bind(self.bind_addr)
                .serve(app.into_make_service())
                .await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use super::*;
    use crate::config::StorageConfig;
    use crate::security::jwt::Claims;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use hyper::http;
    use tempfile::TempDir;
    use tower::ServiceExt;

    async fn create_test_server() -> HttpServer {
        let temp_dir = TempDir::new().unwrap();
        let storage_config = StorageConfig {
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

        let storage = Arc::new(StorageEngine::new(storage_config).await.unwrap());
        let jwt_service = Arc::new(
            JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap(),
        );
        let api_token_store = Arc::new(
            ApiTokenStore::new(temp_dir.path().join("tokens.json")).unwrap(),
        );

        let api_config = ApiConfig {
            bind_addr: "127.0.0.1:8080".parse().unwrap(),
            enable_tls: false,
            tls_cert: None,
            tls_key: None,
            jwt_secret: "this-is-a-very-secure-secret-key-for-testing".to_string(),
            jwt_expiration_hours: 1,
            rate_limit_per_minute: 100,
            cors_allowed_origins: vec!["*".to_string()],
        };

        HttpServer::new(storage, jwt_service, api_token_store, api_config)
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let server = create_test_server().await;
        let app = server.build_router();

        let request = Request::builder()
            .uri("/health")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_protected_endpoint_without_auth() {
        let server = create_test_server().await;
        let app = server.build_router();

        let request = Request::builder()
            .uri("/devices")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_protected_endpoint_with_auth() {
        let server = create_test_server().await;
        let app = server.build_router();

        // Generate valid JWT token
        let jwt_service = JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap();
        let claims = Claims::new("test-user".to_string());
        let token = jwt_service.generate_token(claims).unwrap();

        let request = Request::builder()
            .uri("/devices")
            .header(http::header::AUTHORIZATION, format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_security_headers_present() {
        let server = create_test_server().await;
        let app = server.build_router();

        let request = Request::builder()
            .uri("/health")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Verify security headers are present
        let headers = response.headers();
        assert!(headers.contains_key(http::header::STRICT_TRANSPORT_SECURITY));
        assert!(headers.contains_key(http::header::CONTENT_SECURITY_POLICY));
        assert!(headers.contains_key(http::header::X_FRAME_OPTIONS));
    }

    #[tokio::test]
    async fn test_cors_headers_present() {
        let server = create_test_server().await;
        let app = server.build_router();

        // Make an OPTIONS request (preflight)
        let request = Request::builder()
            .method(http::Method::OPTIONS)
            .uri("/health")
            .header(http::header::ORIGIN, "http://localhost:3000")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Verify CORS headers are present
        let headers = response.headers();
        assert!(headers.contains_key(http::header::ACCESS_CONTROL_ALLOW_ORIGIN));
    }

    #[tokio::test]
    async fn test_cors_with_specific_origins() {
        let temp_dir = TempDir::new().unwrap();
        let storage_config = StorageConfig {
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

        let storage = Arc::new(StorageEngine::new(storage_config).await.unwrap());
        let jwt_service = Arc::new(
            JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap(),
        );
        let api_token_store = Arc::new(
            ApiTokenStore::new(temp_dir.path().join("tokens.json")).unwrap(),
        );

        // Configure with specific allowed origins
        let api_config = ApiConfig {
            bind_addr: "127.0.0.1:8080".parse().unwrap(),
            enable_tls: false,
            tls_cert: None,
            tls_key: None,
            jwt_secret: "this-is-a-very-secure-secret-key-for-testing".to_string(),
            jwt_expiration_hours: 1,
            rate_limit_per_minute: 100,
            cors_allowed_origins: vec![
                "https://dashboard.example.com".to_string(),
                "https://admin.example.com".to_string(),
            ],
        };

        let server = HttpServer::new(storage, jwt_service, api_token_store, api_config);
        let app = server.build_router();

        // Make request from allowed origin
        let request = Request::builder()
            .method(http::Method::OPTIONS)
            .uri("/health")
            .header(http::header::ORIGIN, "https://dashboard.example.com")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Verify CORS allows the specific origin
        let headers = response.headers();
        assert!(headers.contains_key(http::header::ACCESS_CONTROL_ALLOW_ORIGIN));
    }
}
