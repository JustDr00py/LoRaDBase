// Health Check
export interface HealthResponse {
  status: string;
  version: string;
}

// Device Management
export interface DeviceInfo {
  dev_eui: string;
  device_name: string | null;
  application_id: string;
  last_seen: string | null;
}

export interface DeviceListResponse {
  total_devices: number;
  devices: DeviceInfo[];
}

// Query
export interface QueryRequest {
  query: string;
}

export interface QueryResult {
  dev_eui: string;
  total_frames: number;
  frames: Frame[];
}

export interface FrameData {
  dev_eui: string;
  received_at: string;
  f_port?: number;
  f_cnt?: number;
  confirmed?: boolean;
  adr?: boolean;
  dr?: DataRate;
  frequency?: number;
  rx_info?: RxInfo[];
  decoded_payload?: any;
  raw_payload?: string;
  device_name?: string;
  application_id?: string;
  [key: string]: any; // Allow additional fields
}

export interface Frame {
  Uplink?: FrameData;
  Downlink?: FrameData;
  Join?: FrameData;
  [key: string]: any; // Allow additional fields for backward compatibility
}

export interface DataRate {
  lora?: {
    bandwidth: number;
    spreading_factor: number;
  };
}

export interface RxInfo {
  gateway_id?: string;
  rssi?: number;
  snr?: number;
  [key: string]: any;
}

// Authentication
export interface GenerateTokenRequest {
  username: string;
  expirationHours?: number;
}

export interface TokenResponse {
  token: string;
  expiresIn: number;
  expiresAt: string;
  username: string;
}

export interface VerifyTokenRequest {
  token: string;
}

export interface VerifyTokenResponse {
  valid: boolean;
  username?: string;
  expiresAt?: string;
  issuedAt?: string;
}

// API Token Management
export interface CreateApiTokenRequest {
  name: string;
  expires_in_days?: number;
}

export interface CreateApiTokenResponse {
  token: string;
  id: string;
  name: string;
  created_at: string;
  expires_at: string | null;
}

export interface ApiTokenInfo {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export interface ListApiTokensResponse {
  total: number;
  tokens: ApiTokenInfo[];
}

// Error Response
export interface ErrorResponse {
  error: string;
  message: string;
  stack?: string;
}

// Query DSL Types
export type FrameType = 'all' | 'uplink' | 'downlink' | 'join' | 'decoded_payload' | 'custom';
export type TimeRangeType = 'last' | 'since' | 'between' | 'none';

export interface QueryConfig {
  devEui: string;
  frameType: FrameType;
  timeRangeType: TimeRangeType;
  // For 'last' type
  lastDuration?: string;
  lastUnit?: 'ms' | 's' | 'm' | 'h' | 'd' | 'w';
  // For 'since' type
  sinceDate?: string;
  // For 'between' type
  startDate?: string;
  endDate?: string;
  // Custom fields
  customFields?: string[];
}

// Retention Policies
export interface ApplicationRetentionPolicy {
  application_id: string;
  days: number | null; // null means "never" (keep forever)
  created_at: string;
  updated_at: string;
}

export interface RetentionPoliciesResponse {
  global_days: number | null; // null means no global policy
  check_interval_hours: number;
  applications: ApplicationRetentionPolicy[];
}

export interface GlobalRetentionPolicyResponse {
  days: number | null;
}

export interface SetRetentionPolicyRequest {
  days: number | null; // null means "never" (keep forever)
}

export interface RetentionEnforceResponse {
  message: string;
  deleted_sstables?: number;
}
