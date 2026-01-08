use crate::error::LoraDbError;
use anyhow::Result;
use rand::RngCore;
use zeroize::Zeroize;

#[cfg(feature = "encryption-aes")]
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};

const NONCE_SIZE: usize = 12; // 96 bits for GCM

/// Encryption key wrapper with zeroization on drop
pub struct EncryptionKey {
    key: Vec<u8>,
}

impl EncryptionKey {
    /// Create encryption key from base64-encoded string
    pub fn from_base64(encoded: &str) -> Result<Self> {
        use base64::Engine;
        let key = base64::engine::general_purpose::STANDARD.decode(encoded)
            .map_err(|e| LoraDbError::EncryptionError(format!("Invalid base64 key: {}", e)))?;

        if key.len() != 32 {
            return Err(LoraDbError::EncryptionError(
                "Encryption key must be 32 bytes (256 bits)".to_string(),
            )
            .into());
        }

        Ok(Self { key })
    }

    /// Generate a new random encryption key
    pub fn generate() -> Result<Self> {
        let mut key = vec![0u8; 32];
        OsRng.fill_bytes(&mut key);
        Ok(Self { key })
    }

    /// Export key as base64 string
    pub fn to_base64(&self) -> String {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD.encode(&self.key)
    }

    /// Get key bytes
    fn as_bytes(&self) -> &[u8] {
        &self.key
    }
}

impl Drop for EncryptionKey {
    fn drop(&mut self) {
        self.key.zeroize();
    }
}

impl Clone for EncryptionKey {
    fn clone(&self) -> Self {
        Self {
            key: self.key.clone(),
        }
    }
}

/// Encryption service for data-at-rest
pub struct EncryptionService {
    #[cfg(feature = "encryption-aes")]
    cipher: Option<Aes256Gcm>,
}

impl EncryptionService {
    /// Create new encryption service with optional key
    pub fn new(key: Option<EncryptionKey>) -> Result<Self> {
        #[cfg(feature = "encryption-aes")]
        {
            let cipher = if let Some(key) = key {
                let key_array = Key::<Aes256Gcm>::from_slice(key.as_bytes());
                Some(Aes256Gcm::new(key_array))
            } else {
                None
            };

            Ok(Self { cipher })
        }

        #[cfg(not(feature = "encryption-aes"))]
        {
            if key.is_some() {
                return Err(LoraDbError::EncryptionError(
                    "Encryption feature not enabled".to_string(),
                )
                .into());
            }
            Ok(Self {})
        }
    }

    /// Encrypt data using AES-256-GCM
    /// Returns: nonce (12 bytes) + ciphertext + auth tag (16 bytes)
    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>> {
        #[cfg(feature = "encryption-aes")]
        {
            let cipher = self.cipher.as_ref().ok_or_else(|| {
                LoraDbError::EncryptionError("Encryption not configured".to_string())
            })?;

            // Generate random nonce
            let mut nonce_bytes = [0u8; NONCE_SIZE];
            OsRng.fill_bytes(&mut nonce_bytes);
            let nonce = Nonce::from_slice(&nonce_bytes);

            // Encrypt
            let ciphertext = cipher
                .encrypt(nonce, plaintext)
                .map_err(|e| LoraDbError::EncryptionError(format!("Encryption failed: {}", e)))?;

            // Prepend nonce to ciphertext
            let mut result = Vec::with_capacity(NONCE_SIZE + ciphertext.len());
            result.extend_from_slice(&nonce_bytes);
            result.extend_from_slice(&ciphertext);

            Ok(result)
        }

        #[cfg(not(feature = "encryption-aes"))]
        {
            Err(LoraDbError::EncryptionError("Encryption feature not enabled".to_string()).into())
        }
    }

    /// Decrypt data encrypted with encrypt()
    /// Expects: nonce (12 bytes) + ciphertext + auth tag (16 bytes)
    pub fn decrypt(&self, encrypted: &[u8]) -> Result<Vec<u8>> {
        #[cfg(feature = "encryption-aes")]
        {
            let cipher = self.cipher.as_ref().ok_or_else(|| {
                LoraDbError::EncryptionError("Encryption not configured".to_string())
            })?;

            if encrypted.len() < NONCE_SIZE {
                return Err(LoraDbError::EncryptionError(
                    "Invalid encrypted data: too short".to_string(),
                )
                .into());
            }

            // Extract nonce and ciphertext
            let (nonce_bytes, ciphertext) = encrypted.split_at(NONCE_SIZE);
            let nonce = Nonce::from_slice(nonce_bytes);

            // Decrypt
            let plaintext = cipher
                .decrypt(nonce, ciphertext)
                .map_err(|e| LoraDbError::EncryptionError(format!("Decryption failed: {}", e)))?;

            Ok(plaintext)
        }

        #[cfg(not(feature = "encryption-aes"))]
        {
            Err(LoraDbError::EncryptionError("Encryption feature not enabled".to_string()).into())
        }
    }

    /// Check if encryption is enabled
    pub fn is_enabled(&self) -> bool {
        #[cfg(feature = "encryption-aes")]
        {
            self.cipher.is_some()
        }

        #[cfg(not(feature = "encryption-aes"))]
        {
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encryption_key_generation() {
        let key = EncryptionKey::generate().unwrap();
        let encoded = key.to_base64();

        // Should be valid base64
        assert!(encoded.len() > 0);

        // Should be able to decode back
        let decoded = EncryptionKey::from_base64(&encoded).unwrap();
        assert_eq!(decoded.as_bytes(), key.as_bytes());
    }

    #[test]
    fn test_encryption_key_validation() {
        // Too short
        let result = EncryptionKey::from_base64("dGVzdA=="); // "test" in base64
        assert!(result.is_err());

        // Invalid base64
        let result = EncryptionKey::from_base64("not-valid-base64!!!");
        assert!(result.is_err());
    }

    #[cfg(feature = "encryption-aes")]
    #[test]
    fn test_encrypt_decrypt() {
        let key = EncryptionKey::generate().unwrap();
        let service = EncryptionService::new(Some(key)).unwrap();

        let plaintext = b"Hello, LoRaDB!";
        let encrypted = service.encrypt(plaintext).unwrap();

        // Encrypted should be longer (nonce + ciphertext + tag)
        assert!(encrypted.len() > plaintext.len());

        // Decrypt should return original
        let decrypted = service.decrypt(&encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[cfg(feature = "encryption-aes")]
    #[test]
    fn test_encryption_different_nonces() {
        let key = EncryptionKey::generate().unwrap();
        let service = EncryptionService::new(Some(key)).unwrap();

        let plaintext = b"Test data";
        let encrypted1 = service.encrypt(plaintext).unwrap();
        let encrypted2 = service.encrypt(plaintext).unwrap();

        // Same plaintext should produce different ciphertext (different nonces)
        assert_ne!(encrypted1, encrypted2);

        // But both should decrypt to same plaintext
        assert_eq!(service.decrypt(&encrypted1).unwrap(), plaintext);
        assert_eq!(service.decrypt(&encrypted2).unwrap(), plaintext);
    }

    #[cfg(feature = "encryption-aes")]
    #[test]
    fn test_decryption_with_wrong_key() {
        let key1 = EncryptionKey::generate().unwrap();
        let key2 = EncryptionKey::generate().unwrap();

        let service1 = EncryptionService::new(Some(key1)).unwrap();
        let service2 = EncryptionService::new(Some(key2)).unwrap();

        let plaintext = b"Secret data";
        let encrypted = service1.encrypt(plaintext).unwrap();

        // Decryption with wrong key should fail
        let result = service2.decrypt(&encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn test_encryption_service_without_key() {
        let service = EncryptionService::new(None).unwrap();
        assert!(!service.is_enabled());

        let result = service.encrypt(b"test");
        assert!(result.is_err());
    }

    #[cfg(feature = "encryption-aes")]
    #[test]
    fn test_large_data_encryption() {
        let key = EncryptionKey::generate().unwrap();
        let service = EncryptionService::new(Some(key)).unwrap();

        // Test with 1MB of data
        let large_data = vec![0x42u8; 1024 * 1024];
        let encrypted = service.encrypt(&large_data).unwrap();
        let decrypted = service.decrypt(&encrypted).unwrap();

        assert_eq!(decrypted, large_data);
    }
}
