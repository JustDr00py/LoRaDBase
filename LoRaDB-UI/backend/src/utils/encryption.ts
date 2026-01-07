import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha256';
const SALT_LENGTH = 16;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
}

/**
 * Encrypt API key using AES-256-GCM with key derived from password hash
 * @param apiKey - The plain text API key to encrypt
 * @param passwordHash - The bcrypt hash of the password (used for key derivation)
 * @returns EncryptedData object with ciphertext, IV, auth tag, and salt
 */
export function encryptApiKey(apiKey: string, passwordHash: string): EncryptedData {
  // Generate random salt for key derivation
  const salt = crypto.randomBytes(SALT_LENGTH);

  // Derive encryption key from password hash using PBKDF2
  const key = crypto.pbkdf2Sync(
    passwordHash,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    PBKDF2_DIGEST
  );

  // Generate random initialization vector
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher and encrypt
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(apiKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get authentication tag (for authenticated encryption)
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    salt: salt.toString('hex'),
  };
}

/**
 * Decrypt API key using AES-256-GCM
 * @param encryptedData - The encrypted data object
 * @param passwordHash - The bcrypt hash of the password (used for key derivation)
 * @returns The decrypted API key
 * @throws Error if decryption fails or authentication tag doesn't match
 */
export function decryptApiKey(encryptedData: EncryptedData, passwordHash: string): string {
  try {
    // Convert hex strings back to buffers
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');

    // Derive the same encryption key
    const key = crypto.pbkdf2Sync(
      passwordHash,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST
    );

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encryptedData.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error('Decryption failed: Invalid password or corrupted data');
  }
}

/**
 * Simple in-memory cache for decrypted API keys (to avoid repeated decryption)
 * Cache entries expire after 5 minutes
 */
interface CacheEntry {
  apiKey: string;
  timestamp: number;
}

const apiKeyCache = new Map<number, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

/**
 * Get decrypted API key from cache or decrypt and cache it
 * @param serverId - The server ID
 * @param encryptedData - The encrypted data
 * @param passwordHash - The password hash
 * @returns The decrypted API key
 */
export function getDecryptedApiKey(
  serverId: number,
  encryptedData: EncryptedData,
  passwordHash: string
): string {
  // Check cache
  const cached = apiKeyCache.get(serverId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.apiKey;
  }

  // Decrypt
  const apiKey = decryptApiKey(encryptedData, passwordHash);

  // Cache the result
  if (apiKeyCache.size >= MAX_CACHE_SIZE) {
    // Evict oldest entry (simple LRU)
    const firstKey = apiKeyCache.keys().next().value as number;
    apiKeyCache.delete(firstKey);
  }

  apiKeyCache.set(serverId, {
    apiKey,
    timestamp: Date.now(),
  });

  return apiKey;
}

/**
 * Clear cached API key for a server (e.g., when server is deleted)
 * @param serverId - The server ID
 */
export function clearCachedApiKey(serverId: number): void {
  apiKeyCache.delete(serverId);
}

/**
 * Clear all cached API keys
 */
export function clearAllCachedApiKeys(): void {
  apiKeyCache.clear();
}
