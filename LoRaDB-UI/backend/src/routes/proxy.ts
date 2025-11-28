import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { config } from '../config/env';

const router = Router();

// Create axios instance for LoRaDB API
const loradbClient = axios.create({
  baseURL: config.loradbApiUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Helper function to forward Authorization header
 */
const getAuthHeader = (req: Request): Record<string, string> => {
  const auth = req.headers.authorization;
  return auth ? { Authorization: auth } : {};
};

/**
 * Helper function to handle errors from LoRaDB API
 */
const handleLoraDbError = (error: unknown, res: Response): void => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;

    if (axiosError.response) {
      // Forward the error response from LoRaDB
      res.status(axiosError.response.status).json(axiosError.response.data);
      return;
    }

    if (axiosError.code === 'ECONNREFUSED') {
      res.status(503).json({
        error: 'ServiceUnavailable',
        message: 'LoRaDB API is not available',
      });
      return;
    }

    if (axiosError.code === 'ETIMEDOUT') {
      res.status(504).json({
        error: 'Timeout',
        message: 'Request to LoRaDB API timed out',
      });
      return;
    }

    // Handle DNS resolution errors
    if (axiosError.code === 'EAI_AGAIN' || axiosError.code === 'ENOTFOUND' || axiosError.code === 'EAIAGAIN') {
      res.status(503).json({
        error: 'DNSResolutionFailed',
        message: `Cannot resolve LoRaDB API hostname: ${config.loradbApiUrl}`,
      });
      return;
    }

    // Handle other network errors
    if (axiosError.code === 'ECONNRESET' || axiosError.code === 'ECONNABORTED') {
      res.status(503).json({
        error: 'ConnectionError',
        message: 'Connection to LoRaDB API was interrupted',
      });
      return;
    }
  }

  console.error('Unexpected error:', error);
  res.status(500).json({
    error: 'InternalError',
    message: 'An unexpected error occurred',
  });
};

/**
 * GET /api/health
 * Health check endpoint (no auth required)
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const response = await loradbClient.get('/health');
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * POST /api/query
 * Execute a query (auth required)
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const response = await loradbClient.post('/query', req.body, {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/devices
 * List all devices (auth required)
 */
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const response = await loradbClient.get('/devices', {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/devices/:dev_eui
 * Get device information (auth required)
 */
router.get('/devices/:dev_eui', async (req: Request, res: Response) => {
  try {
    const { dev_eui } = req.params;
    const response = await loradbClient.get(`/devices/${dev_eui}`, {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * POST /api/tokens
 * Create a new API token (auth required)
 */
router.post('/tokens', async (req: Request, res: Response) => {
  try {
    const response = await loradbClient.post('/tokens', req.body, {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/tokens
 * List all API tokens (auth required)
 */
router.get('/tokens', async (req: Request, res: Response) => {
  try {
    const response = await loradbClient.get('/tokens', {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * DELETE /api/tokens/:id
 * Revoke an API token (auth required)
 */
router.delete('/tokens/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const response = await loradbClient.delete(`/tokens/${id}`, {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/retention/policies
 * List all retention policies (auth required)
 */
router.get('/retention/policies', async (req: Request, res: Response) => {
  try {
    const response = await loradbClient.get('/retention/policies', {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/retention/policies/global
 * Get global retention policy (auth required)
 */
router.get('/retention/policies/global', async (req: Request, res: Response) => {
  try {
    const response = await loradbClient.get('/retention/policies/global', {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * PUT /api/retention/policies/global
 * Set global retention policy (auth required)
 */
router.put('/retention/policies/global', async (req: Request, res: Response) => {
  try {
    const response = await loradbClient.put('/retention/policies/global', req.body, {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/retention/policies/:application_id
 * Get application-specific retention policy (auth required)
 */
router.get('/retention/policies/:application_id', async (req: Request, res: Response) => {
  try {
    const { application_id } = req.params;
    const response = await loradbClient.get(`/retention/policies/${application_id}`, {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * PUT /api/retention/policies/:application_id
 * Set application-specific retention policy (auth required)
 */
router.put('/retention/policies/:application_id', async (req: Request, res: Response) => {
  try {
    const { application_id } = req.params;
    const response = await loradbClient.put(`/retention/policies/${application_id}`, req.body, {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * DELETE /api/retention/policies/:application_id
 * Remove application-specific retention policy (auth required)
 */
router.delete('/retention/policies/:application_id', async (req: Request, res: Response) => {
  try {
    const { application_id } = req.params;
    const response = await loradbClient.delete(`/retention/policies/${application_id}`, {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * POST /api/retention/enforce
 * Trigger immediate retention enforcement (auth required)
 */
router.post('/retention/enforce', async (req: Request, res: Response) => {
  try {
    const response = await loradbClient.post('/retention/enforce', req.body, {
      headers: getAuthHeader(req),
    });
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

export default router;
