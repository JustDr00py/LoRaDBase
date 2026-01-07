import { db } from '../database';

export interface FailedAttempt {
  id: number;
  server_id: number;
  ip_address: string;
  attempted_at: string;
}

class AuthRepository {
  /**
   * Record a failed authentication attempt
   * @param serverId - The server ID
   * @param ipAddress - The IP address of the client
   */
  recordFailedAttempt(serverId: number, ipAddress: string): void {
    const stmt = db.prepare(`
      INSERT INTO failed_auth_attempts (server_id, ip_address, attempted_at)
      VALUES (?, ?, ?)
    `);

    stmt.run(serverId, ipAddress, new Date().toISOString());
  }

  /**
   * Get the number of recent failed attempts for a server and IP
   * @param serverId - The server ID
   * @param ipAddress - The IP address
   * @param minutes - Time window in minutes
   * @returns The count of failed attempts
   */
  getRecentFailedAttempts(serverId: number, ipAddress: string, minutes: number): number {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();

    const stmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM failed_auth_attempts
      WHERE server_id = ? AND ip_address = ? AND attempted_at > ?
    `);

    const result = stmt.get(serverId, ipAddress, cutoffTime) as any;
    return result.count;
  }

  /**
   * Clear all failed attempts for a server and IP (called on successful auth)
   * @param serverId - The server ID
   * @param ipAddress - The IP address
   */
  clearFailedAttempts(serverId: number, ipAddress: string): void {
    const stmt = db.prepare(`
      DELETE FROM failed_auth_attempts
      WHERE server_id = ? AND ip_address = ?
    `);

    stmt.run(serverId, ipAddress);
  }

  /**
   * Get time until lockout expires for a server and IP
   * @param serverId - The server ID
   * @param ipAddress - The IP address
   * @param minutes - Time window in minutes
   * @returns Minutes remaining until oldest attempt expires, or 0 if no lockout
   */
  getTimeUntilUnlock(serverId: number, ipAddress: string, minutes: number): number {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();

    const stmt = db.prepare(`
      SELECT attempted_at
      FROM failed_auth_attempts
      WHERE server_id = ? AND ip_address = ? AND attempted_at > ?
      ORDER BY attempted_at ASC
      LIMIT 1
    `);

    const result = stmt.get(serverId, ipAddress, cutoffTime) as FailedAttempt | undefined;

    if (!result) {
      return 0;
    }

    const oldestAttempt = new Date(result.attempted_at).getTime();
    const unlockTime = oldestAttempt + minutes * 60 * 1000;
    const remaining = Math.ceil((unlockTime - Date.now()) / (60 * 1000));

    return Math.max(0, remaining);
  }

  /**
   * Check if an IP is currently locked out for a server
   * @param serverId - The server ID
   * @param ipAddress - The IP address
   * @param maxAttempts - Maximum allowed attempts
   * @param windowMinutes - Time window in minutes
   * @returns Object with isLocked status and minutesRemaining
   */
  isLockedOut(
    serverId: number,
    ipAddress: string,
    maxAttempts: number,
    windowMinutes: number
  ): { isLocked: boolean; minutesRemaining: number } {
    const attemptCount = this.getRecentFailedAttempts(serverId, ipAddress, windowMinutes);

    if (attemptCount >= maxAttempts) {
      const minutesRemaining = this.getTimeUntilUnlock(serverId, ipAddress, windowMinutes);
      return { isLocked: true, minutesRemaining };
    }

    return { isLocked: false, minutesRemaining: 0 };
  }

  /**
   * Delete all failed attempts for a server (e.g., when server is deleted)
   * @param serverId - The server ID
   */
  deleteServerAttempts(serverId: number): void {
    const stmt = db.prepare('DELETE FROM failed_auth_attempts WHERE server_id = ?');
    stmt.run(serverId);
  }
}

export const authRepository = new AuthRepository();
