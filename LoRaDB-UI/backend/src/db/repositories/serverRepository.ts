import { db } from '../database';
import { EncryptedData } from '../../utils/encryption';

export interface Server {
  id: number;
  name: string;
  host: string;
  api_key: string;
  api_key_iv: string;
  api_key_auth_tag: string;
  api_key_salt: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface ServerPublic {
  id: number;
  name: string;
  host: string;
  created_at: string;
}

export interface CreateServerData {
  name: string;
  host: string;
  encryptedApiKey: EncryptedData;
  passwordHash: string;
}

export interface UpdateServerData {
  name?: string;
  host?: string;
  encryptedApiKey?: EncryptedData;
  passwordHash?: string;
}

class ServerRepository {
  /**
   * Create a new server
   * @param data - The server data to create
   * @returns The created server
   */
  create(data: CreateServerData): Server {
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO servers (
        name, host,
        api_key, api_key_iv, api_key_auth_tag, api_key_salt,
        password_hash,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.name,
      data.host,
      data.encryptedApiKey.ciphertext,
      data.encryptedApiKey.iv,
      data.encryptedApiKey.authTag,
      data.encryptedApiKey.salt,
      data.passwordHash,
      now,
      now
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Find a server by ID
   * @param id - The server ID
   * @returns The server or null if not found
   */
  findById(id: number): Server | null {
    const stmt = db.prepare('SELECT * FROM servers WHERE id = ?');
    return stmt.get(id) as Server | null;
  }

  /**
   * Find a server by name
   * @param name - The server name
   * @returns The server or null if not found
   */
  findByName(name: string): Server | null {
    const stmt = db.prepare('SELECT * FROM servers WHERE name = ?');
    return stmt.get(name) as Server | null;
  }

  /**
   * Find a server by host
   * @param host - The server host
   * @returns The server or null if not found
   */
  findByHost(host: string): Server | null {
    const stmt = db.prepare('SELECT * FROM servers WHERE host = ?');
    return stmt.get(host) as Server | null;
  }

  /**
   * List all servers (public data only - no passwords or API keys)
   * @returns Array of servers with public data only
   */
  listAll(): ServerPublic[] {
    const stmt = db.prepare('SELECT id, name, host, created_at FROM servers ORDER BY created_at DESC');
    return stmt.all() as ServerPublic[];
  }

  /**
   * Update a server
   * @param id - The server ID
   * @param data - The data to update
   * @returns The updated server or null if not found
   */
  update(id: number, data: UpdateServerData): Server | null {
    const server = this.findById(id);
    if (!server) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }

    if (data.host !== undefined) {
      updates.push('host = ?');
      values.push(data.host);
    }

    if (data.encryptedApiKey !== undefined) {
      updates.push('api_key = ?', 'api_key_iv = ?', 'api_key_auth_tag = ?', 'api_key_salt = ?');
      values.push(
        data.encryptedApiKey.ciphertext,
        data.encryptedApiKey.iv,
        data.encryptedApiKey.authTag,
        data.encryptedApiKey.salt
      );
    }

    if (data.passwordHash !== undefined) {
      updates.push('password_hash = ?');
      values.push(data.passwordHash);
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);

    const stmt = db.prepare(`UPDATE servers SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * Delete a server
   * @param id - The server ID
   * @returns True if deleted, false if not found
   */
  delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM servers WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Get the encrypted API key data for a server
   * @param id - The server ID
   * @returns The encrypted API key data or null if not found
   */
  getEncryptedApiKey(id: number): EncryptedData | null {
    const stmt = db.prepare(
      'SELECT api_key, api_key_iv, api_key_auth_tag, api_key_salt FROM servers WHERE id = ?'
    );
    const result = stmt.get(id) as any;

    if (!result) {
      return null;
    }

    return {
      ciphertext: result.api_key,
      iv: result.api_key_iv,
      authTag: result.api_key_auth_tag,
      salt: result.api_key_salt,
    };
  }

  /**
   * Check if a server name already exists
   * @param name - The server name
   * @param excludeId - Optional ID to exclude from check (for updates)
   * @returns True if name exists, false otherwise
   */
  nameExists(name: string, excludeId?: number): boolean {
    let stmt;
    let result;

    if (excludeId) {
      stmt = db.prepare('SELECT COUNT(*) as count FROM servers WHERE name = ? AND id != ?');
      result = stmt.get(name, excludeId) as any;
    } else {
      stmt = db.prepare('SELECT COUNT(*) as count FROM servers WHERE name = ?');
      result = stmt.get(name) as any;
    }

    return result.count > 0;
  }

  /**
   * Check if a server host already exists
   * @param host - The server host
   * @param excludeId - Optional ID to exclude from check (for updates)
   * @returns True if host exists, false otherwise
   */
  hostExists(host: string, excludeId?: number): boolean {
    let stmt;
    let result;

    if (excludeId) {
      stmt = db.prepare('SELECT COUNT(*) as count FROM servers WHERE host = ? AND id != ?');
      result = stmt.get(host, excludeId) as any;
    } else {
      stmt = db.prepare('SELECT COUNT(*) as count FROM servers WHERE host = ?');
      result = stmt.get(host) as any;
    }

    return result.count > 0;
  }
}

export const serverRepository = new ServerRepository();
