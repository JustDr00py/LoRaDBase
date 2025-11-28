use crate::error::LoraDbError;
use anyhow::Result;
use chrono::{DateTime, Duration, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

/// API token prefix for easy identification
const TOKEN_PREFIX: &str = "ldb_";
const TOKEN_LENGTH: usize = 32; // Characters after prefix

/// API token metadata stored in the system
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiToken {
    /// Unique token ID
    pub id: String,
    /// SHA256 hash of the token (for secure storage)
    pub token_hash: String,
    /// Human-readable token name
    pub name: String,
    /// User who created the token
    pub created_by: String,
    /// Creation timestamp
    pub created_at: DateTime<Utc>,
    /// Last time token was used
    pub last_used_at: Option<DateTime<Utc>>,
    /// Optional expiration timestamp
    pub expires_at: Option<DateTime<Utc>>,
    /// Whether the token is active
    pub is_active: bool,
}

impl ApiToken {
    /// Create a new API token with metadata
    pub fn new(name: String, created_by: String, token_hash: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            token_hash,
            name,
            created_by,
            created_at: Utc::now(),
            last_used_at: None,
            expires_at: None,
            is_active: true,
        }
    }

    /// Create token with expiration
    pub fn with_expiration(
        name: String,
        created_by: String,
        token_hash: String,
        expires_in_days: i64,
    ) -> Self {
        let mut token = Self::new(name, created_by, token_hash);
        token.expires_at = Some(Utc::now() + Duration::days(expires_in_days));
        token
    }

    /// Check if token is expired
    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            Utc::now() >= expires_at
        } else {
            false
        }
    }

    /// Check if token is valid (active and not expired)
    pub fn is_valid(&self) -> bool {
        self.is_active && !self.is_expired()
    }

    /// Update last used timestamp
    pub fn update_last_used(&mut self) {
        self.last_used_at = Some(Utc::now());
    }

    /// Revoke the token
    pub fn revoke(&mut self) {
        self.is_active = false;
    }
}

/// Generate a secure random API token
pub fn generate_token() -> String {
    let mut rng = rand::thread_rng();
    let token_bytes: Vec<u8> = (0..TOKEN_LENGTH).map(|_| rng.gen::<u8>()).collect();

    // Use base62 encoding for URL-safe tokens (alphanumeric only)
    let base62_chars = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let token_suffix: String = token_bytes
        .iter()
        .map(|&b| base62_chars[(b % 62) as usize] as char)
        .collect();

    format!("{}{}", TOKEN_PREFIX, token_suffix)
}

/// Hash a token using SHA256
pub fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// API token storage and management
pub struct ApiTokenStore {
    tokens: Arc<RwLock<HashMap<String, ApiToken>>>,
    storage_path: PathBuf,
}

impl ApiTokenStore {
    /// Create a new token store with file-based persistence
    pub fn new<P: AsRef<Path>>(storage_path: P) -> Result<Self> {
        let storage_path = storage_path.as_ref().to_path_buf();

        // Ensure parent directory exists
        if let Some(parent) = storage_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut store = Self {
            tokens: Arc::new(RwLock::new(HashMap::new())),
            storage_path,
        };

        // Load existing tokens if file exists
        if store.storage_path.exists() {
            store.load()?;
        }

        Ok(store)
    }

    /// Load tokens from disk
    fn load(&mut self) -> Result<()> {
        let data = fs::read_to_string(&self.storage_path)?;
        let tokens: HashMap<String, ApiToken> = serde_json::from_str(&data)?;

        let mut token_map = self.tokens.write().map_err(|e| {
            LoraDbError::StorageError(format!("Failed to acquire write lock: {}", e))
        })?;
        *token_map = tokens;

        Ok(())
    }

    /// Save tokens to disk
    fn save(&self) -> Result<()> {
        let token_map = self.tokens.read().map_err(|e| {
            LoraDbError::StorageError(format!("Failed to acquire read lock: {}", e))
        })?;

        let data = serde_json::to_string_pretty(&*token_map)?;
        fs::write(&self.storage_path, data)?;

        Ok(())
    }

    /// Create a new API token
    pub fn create_token(
        &self,
        name: String,
        created_by: String,
        expires_in_days: Option<i64>,
    ) -> Result<(String, ApiToken)> {
        // Generate the actual token
        let token = generate_token();
        let token_hash = hash_token(&token);

        // Create token metadata
        let api_token = if let Some(days) = expires_in_days {
            ApiToken::with_expiration(name, created_by, token_hash, days)
        } else {
            ApiToken::new(name, created_by, token_hash)
        };

        // Store token
        let mut token_map = self.tokens.write().map_err(|e| {
            LoraDbError::StorageError(format!("Failed to acquire write lock: {}", e))
        })?;

        token_map.insert(api_token.token_hash.clone(), api_token.clone());
        drop(token_map);

        // Persist to disk
        self.save()?;

        Ok((token, api_token))
    }

    /// Validate a token and update last used time
    pub fn validate_token(&self, token: &str) -> Result<ApiToken> {
        let token_hash = hash_token(token);

        let mut token_map = self.tokens.write().map_err(|e| {
            LoraDbError::StorageError(format!("Failed to acquire write lock: {}", e))
        })?;

        let api_token = token_map
            .get_mut(&token_hash)
            .ok_or_else(|| LoraDbError::AuthError("Invalid token".to_string()))?;

        // Check if token is valid
        if !api_token.is_valid() {
            if api_token.is_expired() {
                return Err(LoraDbError::AuthError("Token has expired".to_string()).into());
            } else {
                return Err(LoraDbError::AuthError("Token has been revoked".to_string()).into());
            }
        }

        // Update last used time
        api_token.update_last_used();
        let result = api_token.clone();

        drop(token_map);

        // Persist changes
        self.save()?;

        Ok(result)
    }

    /// List all tokens for a user
    pub fn list_tokens(&self, user_id: &str) -> Result<Vec<ApiToken>> {
        let token_map = self.tokens.read().map_err(|e| {
            LoraDbError::StorageError(format!("Failed to acquire read lock: {}", e))
        })?;

        let user_tokens: Vec<ApiToken> = token_map
            .values()
            .filter(|t| t.created_by == user_id)
            .cloned()
            .collect();

        Ok(user_tokens)
    }

    /// List all tokens (admin only)
    pub fn list_all_tokens(&self) -> Result<Vec<ApiToken>> {
        let token_map = self.tokens.read().map_err(|e| {
            LoraDbError::StorageError(format!("Failed to acquire read lock: {}", e))
        })?;

        Ok(token_map.values().cloned().collect())
    }

    /// Revoke a token by ID
    pub fn revoke_token(&self, token_id: &str, user_id: &str) -> Result<()> {
        let mut token_map = self.tokens.write().map_err(|e| {
            LoraDbError::StorageError(format!("Failed to acquire write lock: {}", e))
        })?;

        let token = token_map
            .values_mut()
            .find(|t| t.id == token_id)
            .ok_or_else(|| LoraDbError::AuthError("Token not found".to_string()))?;

        // Check ownership
        if token.created_by != user_id {
            return Err(LoraDbError::AuthError("Unauthorized to revoke this token".to_string()).into());
        }

        token.revoke();
        drop(token_map);

        // Persist changes
        self.save()?;

        Ok(())
    }

    /// Delete a token by ID (admin only)
    pub fn delete_token(&self, token_id: &str) -> Result<()> {
        let mut token_map = self.tokens.write().map_err(|e| {
            LoraDbError::StorageError(format!("Failed to acquire write lock: {}", e))
        })?;

        // Find and remove the token
        token_map.retain(|_, t| t.id != token_id);
        drop(token_map);

        // Persist changes
        self.save()?;

        Ok(())
    }

    /// Clean up expired tokens
    pub fn cleanup_expired(&self) -> Result<usize> {
        let mut token_map = self.tokens.write().map_err(|e| {
            LoraDbError::StorageError(format!("Failed to acquire write lock: {}", e))
        })?;

        let initial_count = token_map.len();
        token_map.retain(|_, t| !t.is_expired());
        let removed_count = initial_count - token_map.len();

        drop(token_map);

        if removed_count > 0 {
            self.save()?;
        }

        Ok(removed_count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_generate_token() {
        let token1 = generate_token();
        let token2 = generate_token();

        assert!(token1.starts_with(TOKEN_PREFIX));
        assert!(token2.starts_with(TOKEN_PREFIX));
        assert_ne!(token1, token2);
        assert_eq!(token1.len(), TOKEN_PREFIX.len() + TOKEN_LENGTH);
    }

    #[test]
    fn test_hash_token() {
        let token = "ldb_test123";
        let hash1 = hash_token(token);
        let hash2 = hash_token(token);

        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 64); // SHA256 produces 64 hex chars
    }

    #[test]
    fn test_api_token_creation() {
        let token = generate_token();
        let hash = hash_token(&token);
        let api_token = ApiToken::new("Test Token".to_string(), "user123".to_string(), hash);

        assert_eq!(api_token.name, "Test Token");
        assert_eq!(api_token.created_by, "user123");
        assert!(api_token.is_active);
        assert!(!api_token.is_expired());
        assert!(api_token.is_valid());
    }

    #[test]
    fn test_api_token_expiration() {
        let token = generate_token();
        let hash = hash_token(&token);
        let mut api_token = ApiToken::with_expiration(
            "Test Token".to_string(),
            "user123".to_string(),
            hash,
            -1, // Expired yesterday
        );

        assert!(api_token.is_expired());
        assert!(!api_token.is_valid());
    }

    #[test]
    fn test_api_token_revocation() {
        let token = generate_token();
        let hash = hash_token(&token);
        let mut api_token = ApiToken::new("Test Token".to_string(), "user123".to_string(), hash);

        assert!(api_token.is_valid());
        api_token.revoke();
        assert!(!api_token.is_valid());
    }

    #[test]
    fn test_token_store_create_and_validate() {
        let temp_dir = TempDir::new().unwrap();
        let storage_path = temp_dir.path().join("tokens.json");
        let store = ApiTokenStore::new(&storage_path).unwrap();

        // Create token
        let (token, api_token) = store
            .create_token("Test Token".to_string(), "user123".to_string(), None)
            .unwrap();

        assert!(token.starts_with(TOKEN_PREFIX));
        assert_eq!(api_token.name, "Test Token");

        // Validate token
        let validated = store.validate_token(&token).unwrap();
        assert_eq!(validated.id, api_token.id);
        assert!(validated.last_used_at.is_some());
    }

    #[test]
    fn test_token_store_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let storage_path = temp_dir.path().join("tokens.json");

        let token_string;
        let token_id;

        // Create token in first store instance
        {
            let store = ApiTokenStore::new(&storage_path).unwrap();
            let (token, api_token) = store
                .create_token("Test Token".to_string(), "user123".to_string(), None)
                .unwrap();
            token_string = token;
            token_id = api_token.id;
        }

        // Load tokens in second store instance
        {
            let store = ApiTokenStore::new(&storage_path).unwrap();
            let validated = store.validate_token(&token_string).unwrap();
            assert_eq!(validated.id, token_id);
        }
    }

    #[test]
    fn test_token_store_list_tokens() {
        let temp_dir = TempDir::new().unwrap();
        let storage_path = temp_dir.path().join("tokens.json");
        let store = ApiTokenStore::new(&storage_path).unwrap();

        // Create multiple tokens
        store
            .create_token("Token 1".to_string(), "user1".to_string(), None)
            .unwrap();
        store
            .create_token("Token 2".to_string(), "user1".to_string(), None)
            .unwrap();
        store
            .create_token("Token 3".to_string(), "user2".to_string(), None)
            .unwrap();

        // List tokens for user1
        let user1_tokens = store.list_tokens("user1").unwrap();
        assert_eq!(user1_tokens.len(), 2);

        // List all tokens
        let all_tokens = store.list_all_tokens().unwrap();
        assert_eq!(all_tokens.len(), 3);
    }

    #[test]
    fn test_token_store_revoke() {
        let temp_dir = TempDir::new().unwrap();
        let storage_path = temp_dir.path().join("tokens.json");
        let store = ApiTokenStore::new(&storage_path).unwrap();

        let (token, api_token) = store
            .create_token("Test Token".to_string(), "user123".to_string(), None)
            .unwrap();

        // Token should be valid
        assert!(store.validate_token(&token).is_ok());

        // Revoke token
        store.revoke_token(&api_token.id, "user123").unwrap();

        // Token should now be invalid
        assert!(store.validate_token(&token).is_err());
    }

    #[test]
    fn test_token_store_cleanup_expired() {
        let temp_dir = TempDir::new().unwrap();
        let storage_path = temp_dir.path().join("tokens.json");
        let store = ApiTokenStore::new(&storage_path).unwrap();

        // Create expired token
        store
            .create_token("Expired Token".to_string(), "user1".to_string(), Some(-1))
            .unwrap();

        // Create valid token
        store
            .create_token("Valid Token".to_string(), "user1".to_string(), Some(30))
            .unwrap();

        // Cleanup should remove 1 expired token
        let removed = store.cleanup_expired().unwrap();
        assert_eq!(removed, 1);

        let remaining = store.list_all_tokens().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].name, "Valid Token");
    }
}
