export interface BackupData {
  version: string;
  timestamp: string;
  metadata: {
    type: 'full' | 'partial';
    source: 'manual' | 'automatic';
  };
  data: {
    servers: BackupServerData[];
    deviceTypes: DeviceTypeBackup[];
    dashboards?: any; // Optional: Dashboard layouts from frontend localStorage
    settings?: any; // Optional: User settings from frontend localStorage
  };
}

export interface BackupServerData {
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

export interface DeviceTypeBackup {
  filename: string;
  content: any;
}

export interface ImportResult {
  servers: {
    imported: number;
    skipped: number;
    errors: string[];
  };
  deviceTypes: {
    imported: number;
    skipped: number;
    errors: string[];
  };
}

export interface BackupFile {
  filename: string;
  timestamp: string;
  size: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export type ImportStrategy = 'merge' | 'replace';
