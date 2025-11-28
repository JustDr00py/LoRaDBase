use crate::error::LoraDbError;
use crate::security::jwt::{Claims, JwtService};
use crate::security::api_token::ApiTokenStore;
use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderMap, HeaderValue, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
};
use std::sync::Arc;
use tracing::warn;

/// Authentication context that can be extracted by handlers
#[derive(Clone, Debug)]
pub enum AuthContext {
    /// JWT-based authentication
    Jwt(Claims),
    /// API token-based authentication
    ApiToken { user_id: String, token_id: String },
}

impl AuthContext {
    /// Get the user ID from the auth context
    pub fn user_id(&self) -> &str {
        match self {
            AuthContext::Jwt(claims) => &claims.sub,
            AuthContext::ApiToken { user_id, .. } => user_id,
        }
    }
}

/// Authentication middleware state
#[derive(Clone)]
pub struct AuthMiddleware {
    pub jwt_service: Arc<JwtService>,
    pub api_token_store: Arc<ApiTokenStore>,
}

impl AuthMiddleware {
    pub fn new(jwt_service: Arc<JwtService>, api_token_store: Arc<ApiTokenStore>) -> Self {
        Self {
            jwt_service,
            api_token_store,
        }
    }
}

/// Unified authentication middleware supporting both JWT and API tokens
pub async fn jwt_auth(
    State(auth): State<AuthMiddleware>,
    mut request: Request<Body>,
    next: Next<Body>,
) -> Result<Response, StatusCode> {
    // Extract Authorization header
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    // Check for Bearer token
    if !auth_header.starts_with("Bearer ") {
        warn!("Invalid Authorization header format");
        return Err(StatusCode::UNAUTHORIZED);
    }

    let token = &auth_header[7..]; // Remove "Bearer " prefix

    // Try to determine token type and authenticate
    let auth_context = if token.starts_with("ldb_") {
        // API Token authentication
        match auth.api_token_store.validate_token(token) {
            Ok(api_token) => AuthContext::ApiToken {
                user_id: api_token.created_by.clone(),
                token_id: api_token.id.clone(),
            },
            Err(e) => {
                warn!("API token validation failed: {}", e);
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
    } else {
        // JWT authentication
        match auth.jwt_service.validate_token(token) {
            Ok(claims) => {
                // For backward compatibility, also insert Claims
                request.extensions_mut().insert(claims.clone());
                AuthContext::Jwt(claims)
            }
            Err(e) => {
                warn!("JWT validation failed: {}", e);
                return Err(StatusCode::UNAUTHORIZED);
            }
        }
    };

    // Insert auth context into request extensions for handlers to use
    request.extensions_mut().insert(auth_context);

    Ok(next.run(request).await)
}

/// Security headers middleware
pub async fn security_headers(request: Request<Body>, next: Next<Body>) -> Response {
    let mut response = next.run(request).await;

    let headers = response.headers_mut();

    // HSTS - Force HTTPS for 1 year
    headers.insert(
        header::STRICT_TRANSPORT_SECURITY,
        HeaderValue::from_static("max-age=31536000; includeSubDomains"),
    );

    // Content Security Policy
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'self'; frame-ancestors 'none'"),
    );

    // X-Frame-Options - Prevent clickjacking
    headers.insert(
        header::X_FRAME_OPTIONS,
        HeaderValue::from_static("DENY"),
    );

    // X-Content-Type-Options - Prevent MIME sniffing
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );

    // X-XSS-Protection
    headers.insert(
        "X-XSS-Protection",
        HeaderValue::from_static("1; mode=block"),
    );

    // Referrer Policy
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );

    response
}

/// CORS headers (for development/testing - should be restricted in production)
pub fn cors_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_ORIGIN,
        HeaderValue::from_static("*"), // Should be restricted in production
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_METHODS,
        HeaderValue::from_static("GET, POST, OPTIONS"),
    );
    headers.insert(
        header::ACCESS_CONTROL_ALLOW_HEADERS,
        HeaderValue::from_static("Content-Type, Authorization"),
    );
    headers
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::security::jwt::JwtService;
    use crate::security::api_token::ApiTokenStore;
    use axum::{
        body::Body,
        http::StatusCode,
        middleware,
        routing::get,
        Extension, Router,
    };
    use hyper::http::Request;
    use tower::ServiceExt;

    async fn protected_handler(Extension(claims): Extension<Claims>) -> String {
        format!("Hello, {}", claims.sub)
    }

    async fn protected_handler_auth_context(Extension(auth): Extension<AuthContext>) -> String {
        format!("Hello, {}", auth.user_id())
    }

    #[tokio::test]
    async fn test_jwt_auth_valid_token() {
        let jwt_service = Arc::new(
            JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap(),
        );
        let temp_dir = tempfile::TempDir::new().unwrap();
        let api_token_store = Arc::new(
            ApiTokenStore::new(temp_dir.path().join("tokens.json")).unwrap(),
        );

        // Generate test token
        let claims = Claims::new("test-user".to_string());
        let token = jwt_service.generate_token(claims).unwrap();

        // Create test app
        let auth_middleware = AuthMiddleware::new(jwt_service, api_token_store);
        let app = Router::new()
            .route("/protected", get(protected_handler))
            .layer(middleware::from_fn_with_state(
                auth_middleware,
                jwt_auth,
            ));

        // Make request with valid token
        let request = Request::builder()
            .uri("/protected")
            .header(header::AUTHORIZATION, format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_jwt_auth_missing_token() {
        let jwt_service = Arc::new(
            JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap(),
        );
        let temp_dir = tempfile::TempDir::new().unwrap();
        let api_token_store = Arc::new(
            ApiTokenStore::new(temp_dir.path().join("tokens.json")).unwrap(),
        );

        let auth_middleware = AuthMiddleware::new(jwt_service, api_token_store);
        let app = Router::new()
            .route("/protected", get(protected_handler))
            .layer(middleware::from_fn_with_state(
                auth_middleware,
                jwt_auth,
            ));

        // Make request without token
        let request = Request::builder()
            .uri("/protected")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_jwt_auth_invalid_token() {
        let jwt_service = Arc::new(
            JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap(),
        );
        let temp_dir = tempfile::TempDir::new().unwrap();
        let api_token_store = Arc::new(
            ApiTokenStore::new(temp_dir.path().join("tokens.json")).unwrap(),
        );

        let auth_middleware = AuthMiddleware::new(jwt_service, api_token_store);
        let app = Router::new()
            .route("/protected", get(protected_handler))
            .layer(middleware::from_fn_with_state(
                auth_middleware,
                jwt_auth,
            ));

        // Make request with invalid token
        let request = Request::builder()
            .uri("/protected")
            .header(header::AUTHORIZATION, "Bearer invalid-token")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn test_api_token_auth_valid() {
        let jwt_service = Arc::new(
            JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap(),
        );
        let temp_dir = tempfile::TempDir::new().unwrap();
        let api_token_store = Arc::new(
            ApiTokenStore::new(temp_dir.path().join("tokens.json")).unwrap(),
        );

        // Create an API token
        let (token, _) = api_token_store
            .create_token("Test Token".to_string(), "test-user".to_string(), None)
            .unwrap();

        // Create test app
        let auth_middleware = AuthMiddleware::new(jwt_service, api_token_store);
        let app = Router::new()
            .route("/protected", get(protected_handler_auth_context))
            .layer(middleware::from_fn_with_state(
                auth_middleware,
                jwt_auth,
            ));

        // Make request with API token
        let request = Request::builder()
            .uri("/protected")
            .header(header::AUTHORIZATION, format!("Bearer {}", token))
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_security_headers() {
        async fn test_handler() -> &'static str {
            "OK"
        }

        let app = Router::new()
            .route("/test", get(test_handler))
            .layer(middleware::from_fn(security_headers));

        let request = Request::builder()
            .uri("/test")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(request).await.unwrap();

        // Check security headers are present
        let headers = response.headers();
        assert!(headers.contains_key(header::STRICT_TRANSPORT_SECURITY));
        assert!(headers.contains_key(header::CONTENT_SECURITY_POLICY));
        assert!(headers.contains_key(header::X_FRAME_OPTIONS));
        assert!(headers.contains_key(header::X_CONTENT_TYPE_OPTIONS));
    }
}
