import apiClient from './client';
import type {
  HealthResponse,
  DeviceListResponse,
  DeviceInfo,
  QueryRequest,
  QueryResult,
  GenerateTokenRequest,
  TokenResponse,
  VerifyTokenRequest,
  VerifyTokenResponse,
  CreateApiTokenRequest,
  CreateApiTokenResponse,
  ListApiTokensResponse,
  RetentionPoliciesResponse,
  GlobalRetentionPolicyResponse,
  SetRetentionPolicyRequest,
  RetentionEnforceResponse,
} from '../types/api';

// Authentication
export const generateToken = async (
  data: GenerateTokenRequest
): Promise<TokenResponse> => {
  const response = await apiClient.post<TokenResponse>('/api/auth/generate-token', data);
  return response.data;
};

export const verifyToken = async (
  data: VerifyTokenRequest
): Promise<VerifyTokenResponse> => {
  const response = await apiClient.post<VerifyTokenResponse>('/api/auth/verify-token', data);
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
