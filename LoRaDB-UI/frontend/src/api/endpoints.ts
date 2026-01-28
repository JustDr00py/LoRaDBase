import apiClient from './client';
import type {
  HealthResponse,
  DeviceListResponse,
  DeviceInfo,
  QueryRequest,
  QueryResult,
  VerifyTokenRequest,
  VerifyTokenResponse,
  CreateApiTokenRequest,
  CreateApiTokenResponse,
  ListApiTokensResponse,
  RetentionPoliciesResponse,
  GlobalRetentionPolicyResponse,
  SetRetentionPolicyRequest,
  RetentionEnforceResponse,
  Server,
  ServerListResponse,
  CreateServerRequest,
  UpdateServerRequest,
  AuthenticateServerRequest,
  SessionResponse,
  ConnectionTestResponse,
  MasterSessionResponse,
  MasterPasswordStatusResponse,
  BackupData,
  BackupFile,
  ImportResult,
  ImportStrategy,
  DashboardResponse,
  CreateDashboardRequest,
  UpdateDashboardRequest,
  MigrateDashboardRequest,
} from '../types/api';

// Server Management
export const listServers = async (): Promise<ServerListResponse> => {
  const response = await apiClient.get<ServerListResponse>('/api/servers');
  return response.data;
};

export const createServer = async (data: CreateServerRequest): Promise<Server> => {
  const response = await apiClient.post<Server>('/api/servers', data);
  return response.data;
};

export const getServer = async (serverId: number): Promise<Server> => {
  const response = await apiClient.get<Server>(`/api/servers/${serverId}`);
  return response.data;
};

export const authenticateServer = async (
  serverId: number,
  data: AuthenticateServerRequest
): Promise<SessionResponse> => {
  const response = await apiClient.post<SessionResponse>(
    `/api/servers/${serverId}/authenticate`,
    data
  );
  return response.data;
};

export const deleteServer = async (serverId: number): Promise<void> => {
  await apiClient.delete(`/api/servers/${serverId}`);
};

export const updateServer = async (
  serverId: number,
  data: UpdateServerRequest
): Promise<Server> => {
  const response = await apiClient.put<Server>(`/api/servers/${serverId}`, data);
  return response.data;
};

export const testServerConnection = async (
  serverId: number
): Promise<ConnectionTestResponse> => {
  const response = await apiClient.post<ConnectionTestResponse>(
    `/api/servers/${serverId}/test-connection`
  );
  return response.data;
};

// Authentication
export const verifyToken = async (
  data: VerifyTokenRequest
): Promise<VerifyTokenResponse> => {
  const response = await apiClient.post<VerifyTokenResponse>('/api/auth/verify-token', data);
  return response.data;
};

export const logout = async (): Promise<void> => {
  await apiClient.post('/api/auth/logout');
};

export const verifyMasterPassword = async (
  password: string
): Promise<MasterSessionResponse> => {
  const response = await apiClient.post<MasterSessionResponse>(
    '/api/auth/verify-master-password',
    { password }
  );
  return response.data;
};

export const getMasterPasswordStatus = async (): Promise<MasterPasswordStatusResponse> => {
  const response = await apiClient.get<MasterPasswordStatusResponse>(
    '/api/auth/master-password-status'
  );
  return response.data;
};

// Health Check
export const getHealth = async (): Promise<HealthResponse> => {
  const response = await apiClient.get<HealthResponse>('/api/health');
  return response.data;
};

// Devices
export const getDevices = async (): Promise<DeviceListResponse> => {
  const response = await apiClient.get<DeviceListResponse>('/api/devices');
  return response.data;
};

export const getDevice = async (devEui: string): Promise<DeviceInfo> => {
  const response = await apiClient.get<DeviceInfo>(`/api/devices/${devEui}`);
  return response.data;
};

// Query
export const executeQuery = async (data: QueryRequest): Promise<QueryResult> => {
  const response = await apiClient.post<QueryResult>('/api/query', data);
  return response.data;
};

// API Token Management
export const createApiToken = async (
  data: CreateApiTokenRequest
): Promise<CreateApiTokenResponse> => {
  const response = await apiClient.post<CreateApiTokenResponse>('/api/tokens', data);
  return response.data;
};

export const listApiTokens = async (): Promise<ListApiTokensResponse> => {
  const response = await apiClient.get<ListApiTokensResponse>('/api/tokens');
  return response.data;
};

export const revokeApiToken = async (tokenId: string): Promise<void> => {
  await apiClient.delete(`/api/tokens/${tokenId}`);
};

// Retention Policies
export const getRetentionPolicies = async (): Promise<RetentionPoliciesResponse> => {
  const response = await apiClient.get<RetentionPoliciesResponse>('/api/retention/policies');
  return response.data;
};

export const getGlobalRetentionPolicy = async (): Promise<GlobalRetentionPolicyResponse> => {
  const response = await apiClient.get<GlobalRetentionPolicyResponse>('/api/retention/policies/global');
  return response.data;
};

export const setGlobalRetentionPolicy = async (
  data: SetRetentionPolicyRequest
): Promise<GlobalRetentionPolicyResponse> => {
  const response = await apiClient.put<GlobalRetentionPolicyResponse>('/api/retention/policies/global', data);
  return response.data;
};

export const getApplicationRetentionPolicy = async (
  applicationId: string
): Promise<GlobalRetentionPolicyResponse> => {
  const response = await apiClient.get<GlobalRetentionPolicyResponse>(
    `/api/retention/policies/${applicationId}`
  );
  return response.data;
};

export const setApplicationRetentionPolicy = async (
  applicationId: string,
  data: SetRetentionPolicyRequest
): Promise<GlobalRetentionPolicyResponse> => {
  const response = await apiClient.put<GlobalRetentionPolicyResponse>(
    `/api/retention/policies/${applicationId}`,
    data
  );
  return response.data;
};

export const deleteApplicationRetentionPolicy = async (applicationId: string): Promise<void> => {
  await apiClient.delete(`/api/retention/policies/${applicationId}`);
};

export const enforceRetention = async (): Promise<RetentionEnforceResponse> => {
  const response = await apiClient.post<RetentionEnforceResponse>('/api/retention/enforce', {});
  return response.data;
};

// Backup & Restore
export const exportBackup = async (
  includeDeviceTypes: boolean = true,
  saveAutomatic: boolean = false
): Promise<BackupData> => {
  const response = await apiClient.post<BackupData>('/api/backup/export', {
    includeDeviceTypes,
    saveAutomatic,
  });
  return response.data;
};

export const importBackup = async (
  backup: BackupData,
  strategy: ImportStrategy
): Promise<ImportResult> => {
  const response = await apiClient.post<ImportResult>('/api/backup/import', {
    backup,
    strategy,
  });
  return response.data;
};

export const listAutomaticBackups = async (): Promise<BackupFile[]> => {
  const response = await apiClient.get<BackupFile[]>('/api/backup/list');
  return response.data;
};

export const downloadAutomaticBackup = async (filename: string): Promise<BackupData> => {
  const response = await apiClient.get<BackupData>(`/api/backup/download/${filename}`);
  return response.data;
};

export const deleteAutomaticBackup = async (filename: string): Promise<void> => {
  await apiClient.delete(`/api/backup/${filename}`);
};

// Dashboard Management
export const listDashboards = async (): Promise<DashboardResponse[]> => {
  const response = await apiClient.get<DashboardResponse[]>('/api/dashboards');
  return response.data;
};

export const getDefaultDashboard = async (): Promise<DashboardResponse> => {
  const response = await apiClient.get<DashboardResponse>('/api/dashboards/default');
  return response.data;
};

export const getDashboard = async (id: number): Promise<DashboardResponse> => {
  const response = await apiClient.get<DashboardResponse>(`/api/dashboards/${id}`);
  return response.data;
};

export const createDashboard = async (data: CreateDashboardRequest): Promise<DashboardResponse> => {
  const response = await apiClient.post<DashboardResponse>('/api/dashboards', data);
  return response.data;
};

export const updateDashboard = async (id: number, data: UpdateDashboardRequest): Promise<DashboardResponse> => {
  const response = await apiClient.put<DashboardResponse>(`/api/dashboards/${id}`, data);
  return response.data;
};

export const deleteDashboard = async (id: number): Promise<void> => {
  await apiClient.delete(`/api/dashboards/${id}`);
};

export const setDefaultDashboard = async (id: number): Promise<void> => {
  await apiClient.post(`/api/dashboards/${id}/set-default`);
};

export const migrateDashboard = async (data: MigrateDashboardRequest): Promise<DashboardResponse> => {
  const response = await apiClient.post<DashboardResponse>('/api/dashboards/migrate', data);
  return response.data;
};
