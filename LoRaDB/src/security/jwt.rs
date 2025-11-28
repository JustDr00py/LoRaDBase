use crate::error::LoraDbError;
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

/// JWT claims structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (user ID)
    pub sub: String,
    /// Expiration time (Unix timestamp)
    pub exp: i64,
    /// Issued at (Unix timestamp)
    pub iat: i64,
    /// Optional custom claims
    #[serde(default)]
    pub role: Option<String>,
}

impl Claims {
    /// Create new claims with default expiration (1 hour)
    pub fn new(user_id: String) -> Self {
        Self::with_expiration_hours(user_id, 1)
    }

    /// Create new claims with custom expiration in hours
    pub fn with_expiration_hours(user_id: String, hours: i64) -> Self {
        let now = Utc::now();
        let exp = now + Duration::hours(hours);

        Self {
            sub: user_id,
            exp: exp.timestamp(),
            iat: now.timestamp(),
            role: None,
        }
    }

    /// Create claims with custom expiration
    pub fn with_expiration(user_id: String, expiration: DateTime<Utc>) -> Self {
        Self {
            sub: user_id,
            exp: expiration.timestamp(),
            iat: Utc::now().timestamp(),
            role: None,
        }
    }

    /// Create claims with role
    pub fn with_role(user_id: String, role: String) -> Self {
        let mut claims = Self::new(user_id);
        claims.role = Some(role);
        claims
    }

    /// Check if the token is expired
    pub fn is_expired(&self) -> bool {
        Utc::now().timestamp() >= self.exp
    }

    /// Get time until expiration
    pub fn time_until_expiration(&self) -> Option<Duration> {
        let exp_time = DateTime::from_timestamp(self.exp, 0)?;
        let now = Utc::now();
        if exp_time > now {
            Some(exp_time.signed_duration_since(now))
        } else {
            None
        }
    }
}

/// JWT service for token generation and validation
pub struct JwtService {
    encoding_key: EncodingKey,
    decoding_key: DecodingKey,
    validation: Validation,
}

impl JwtService {
    /// Create new JWT service with secret key
    pub fn new(secret: &str) -> Result<Self> {
        if secret.len() < 32 {
            return Err(LoraDbError::AuthError(
                "JWT secret must be at least 32 characters".to_string(),
            )
            .into());
        }

        let encoding_key = EncodingKey::from_secret(secret.as_bytes());
        let decoding_key = DecodingKey::from_secret(secret.as_bytes());

        // Configure validation for HS256
        let mut validation = Validation::default();
        validation.validate_exp = true;
        validation.validate_nbf = false;
        validation.leeway = 60; // 60 seconds leeway for clock skew

        Ok(Self {
            encoding_key,
            decoding_key,
            validation,
        })
    }

    /// Create JWT service from base64-encoded secret
    pub fn from_base64_secret(encoded_secret: &str) -> Result<Self> {
        let secret_bytes = base64::decode(encoded_secret)
            .map_err(|e| LoraDbError::AuthError(format!("Invalid base64 secret: {}", e)))?;

        if secret_bytes.len() < 32 {
            return Err(LoraDbError::AuthError(
                "JWT secret must be at least 32 bytes".to_string(),
            )
            .into());
        }

        let encoding_key = EncodingKey::from_secret(&secret_bytes);
        let decoding_key = DecodingKey::from_secret(&secret_bytes);

        let mut validation = Validation::default();
        validation.validate_exp = true;
        validation.validate_nbf = false;
        validation.leeway = 60;

        Ok(Self {
            encoding_key,
            decoding_key,
            validation,
        })
    }

    /// Generate a new JWT token
    pub fn generate_token(&self, claims: Claims) -> Result<String> {
        encode(&Header::default(), &claims, &self.encoding_key)
            .map_err(|e| LoraDbError::AuthError(format!("Token generation failed: {}", e)).into())
    }

    /// Validate and decode a JWT token
    pub fn validate_token(&self, token: &str) -> Result<Claims> {
        let token_data = decode::<Claims>(token, &self.decoding_key, &self.validation)
            .map_err(|e| LoraDbError::AuthError(format!("Token validation failed: {}", e)))?;

        Ok(token_data.claims)
    }

    /// Extract claims from token without full validation (use with caution)
    pub fn decode_token_unsafe(&self, token: &str) -> Result<Claims> {
        let mut validation = self.validation.clone();
        validation.insecure_disable_signature_validation();

        let token_data = decode::<Claims>(token, &self.decoding_key, &validation)
            .map_err(|e| LoraDbError::AuthError(format!("Token decoding failed: {}", e)))?;

        Ok(token_data.claims)
    }

    /// Refresh a token (generate new token with same user but new expiration)
    pub fn refresh_token(&self, old_token: &str) -> Result<String> {
        let claims = self.validate_token(old_token)?;
        let new_claims = Claims::new(claims.sub);
        self.generate_token(new_claims)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claims_creation() {
        let claims = Claims::new("user123".to_string());
        assert_eq!(claims.sub, "user123");
        assert!(claims.exp > claims.iat);
        assert!(!claims.is_expired());
    }

    #[test]
    fn test_claims_with_role() {
        let claims = Claims::with_role("user123".to_string(), "admin".to_string());
        assert_eq!(claims.sub, "user123");
        assert_eq!(claims.role, Some("admin".to_string()));
    }

    #[test]
    fn test_claims_expiration() {
        let past = Utc::now() - Duration::hours(1);
        let claims = Claims::with_expiration("user123".to_string(), past);
        assert!(claims.is_expired());
    }

    #[test]
    fn test_jwt_service_creation() {
        // Valid secret
        let service = JwtService::new("this-is-a-very-secure-secret-key-for-testing");
        assert!(service.is_ok());

        // Too short secret
        let service = JwtService::new("short");
        assert!(service.is_err());
    }

    #[test]
    fn test_jwt_generate_and_validate() {
        let service = JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap();
        let claims = Claims::new("user123".to_string());

        let token = service.generate_token(claims.clone()).unwrap();
        assert!(!token.is_empty());

        let validated_claims = service.validate_token(&token).unwrap();
        assert_eq!(validated_claims.sub, "user123");
        assert_eq!(validated_claims.exp, claims.exp);
    }

    #[test]
    fn test_jwt_wrong_secret() {
        let service1 = JwtService::new("secret-key-one-for-testing-purposes").unwrap();
        let service2 = JwtService::new("secret-key-two-for-testing-purposes").unwrap();

        let claims = Claims::new("user123".to_string());
        let token = service1.generate_token(claims).unwrap();

        // Validation with wrong secret should fail
        let result = service2.validate_token(&token);
        assert!(result.is_err());
    }

    #[test]
    fn test_jwt_expired_token() {
        let service = JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap();

        // Create claims that expired 1 hour ago
        let past = Utc::now() - Duration::hours(1);
        let claims = Claims::with_expiration("user123".to_string(), past);

        let token = service.generate_token(claims).unwrap();

        // Validation should fail due to expiration
        let result = service.validate_token(&token);
        assert!(result.is_err());
    }

    #[test]
    fn test_jwt_refresh_token() {
        let service = JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap();
        let claims = Claims::new("user123".to_string());
        let old_token = service.generate_token(claims.clone()).unwrap();

        // Wait 1 second to ensure timestamps differ (JWT uses second precision)
        std::thread::sleep(std::time::Duration::from_secs(1));

        let new_token = service.refresh_token(&old_token).unwrap();
        assert_ne!(old_token, new_token);

        let new_claims = service.validate_token(&new_token).unwrap();
        assert_eq!(new_claims.sub, "user123");
        assert!(new_claims.iat > claims.iat);
    }

    #[test]
    fn test_jwt_decode_unsafe() {
        let service = JwtService::new("this-is-a-very-secure-secret-key-for-testing").unwrap();
        let claims = Claims::new("user123".to_string());
        let token = service.generate_token(claims).unwrap();

        // Should be able to decode without signature validation
        let decoded = service.decode_token_unsafe(&token).unwrap();
        assert_eq!(decoded.sub, "user123");
    }

    #[test]
    fn test_jwt_from_base64_secret() {
        // Generate a 32-byte secret and encode it
        let secret_bytes = vec![0x42u8; 32]; // 32 bytes
        let encoded = base64::encode(&secret_bytes);

        let service = JwtService::from_base64_secret(&encoded).unwrap();
        let claims = Claims::new("user123".to_string());
        let token = service.generate_token(claims).unwrap();

        let validated = service.validate_token(&token).unwrap();
        assert_eq!(validated.sub, "user123");
    }

    #[test]
    fn test_time_until_expiration() {
        let future = Utc::now() + Duration::hours(2);
        let claims = Claims::with_expiration("user123".to_string(), future);

        let time_left = claims.time_until_expiration();
        assert!(time_left.is_some());
        assert!(time_left.unwrap().num_hours() >= 1);
    }
}
