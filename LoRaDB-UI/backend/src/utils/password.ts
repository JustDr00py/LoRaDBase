import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10; // 10 rounds = ~100ms hashing time (good balance of security and UX)

/**
 * Hash a password using bcrypt
 * @param password - The plain text password to hash
 * @returns A promise that resolves to the bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a bcrypt hash
 * @param password - The plain text password to verify
 * @param hash - The bcrypt hash to compare against
 * @returns A promise that resolves to true if the password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password strength
 * @param password - The password to validate
 * @returns An object with isValid boolean and an optional error message
 */
export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (!password || password.length < 8) {
    return {
      isValid: false,
      error: 'Password must be at least 8 characters long',
    };
  }

  if (password.length > 72) {
    return {
      isValid: false,
      error: 'Password must be 72 characters or less',
    };
  }

  return { isValid: true };
}

/**
 * Check if passwords match (for confirmation fields)
 * @param password - The password
 * @param passwordConfirm - The confirmation password
 * @returns True if passwords match, false otherwise
 */
export function passwordsMatch(password: string, passwordConfirm: string): boolean {
  return password === passwordConfirm;
}
