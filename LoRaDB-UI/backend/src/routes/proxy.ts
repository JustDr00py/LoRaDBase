import { Router, Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import { serverContextMiddleware } from '../middleware/serverContext';

const router = Router();

/**
 * Helper function to validate DevEUI format (16 hex characters)
 */
const isValidDevEUI = (devEui: string): boolean => {
  return /^[0-9A-Fa-f]{16}$/.test(devEui);
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
        message: 'Cannot resolve LoRaDB API hostname',
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

// Apply server context middleware to all routes
router.use(serverContextMiddleware);

/**
 * GET /api/health
 * Health check endpoint for selected server
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    const response = await req.loradbClient!.get('/health');
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * POST /api/query
 * Execute a query
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const response = await req.loradbClient!.post('/query', req.body);
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/devices
 * List all devices
 */
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const response = await req.loradbClient!.get('/devices');
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/devices/:dev_eui
 * Get device information
 */
router.get('/devices/:dev_eui', async (req: Request, res: Response) => {
  try {
    const { dev_eui } = req.params;

    // Validate DevEUI format (security: prevent URL injection)
    if (!isValidDevEUI(dev_eui)) {
      res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid DevEUI format. Must be 16 hexadecimal characters',
      });
      return;
    }

    const response = await req.loradbClient!.get(`/devices/${dev_eui}`);
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * POST /api/tokens
 * Create a new API token
 */
router.post('/tokens', async (req: Request, res: Response) => {
  try {
    const response = await req.loradbClient!.post('/tokens', req.body);
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/tokens
 * List all API tokens
 */
router.get('/tokens', async (req: Request, res: Response) => {
  try {
    const response = await req.loradbClient!.get('/tokens');
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * DELETE /api/tokens/:id
 * Revoke an API token
 */
router.delete('/tokens/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const response = await req.loradbClient!.delete(`/tokens/${id}`);
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/retention/policies
 * List all retention policies
 */
router.get('/retention/policies', async (req: Request, res: Response) => {
  try {
    const response = await req.loradbClient!.get('/retention/policies');
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/retention/policies/global
 * Get global retention policy
 */
router.get('/retention/policies/global', async (req: Request, res: Response) => {
  try {
    const response = await req.loradbClient!.get('/retention/policies/global');
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * PUT /api/retention/policies/global
 * Set global retention policy
 */
router.put('/retention/policies/global', async (req: Request, res: Response) => {
  try {
    const response = await req.loradbClient!.put('/retention/policies/global', req.body);
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * GET /api/retention/policies/:application_id
 * Get application-specific retention policy
 */
router.get('/retention/policies/:application_id', async (req: Request, res: Response) => {
  try {
    const { application_id } = req.params;
    const response = await req.loradbClient!.get(`/retention/policies/${application_id}`);
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * PUT /api/retention/policies/:application_id
 * Set application-specific retention policy
 */
router.put('/retention/policies/:application_id', async (req: Request, res: Response) => {
  try {
    const { application_id } = req.params;
    const response = await req.loradbClient!.put(`/retention/policies/${application_id}`, req.body);
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * DELETE /api/retention/policies/:application_id
 * Remove application-specific retention policy
 */
router.delete('/retention/policies/:application_id', async (req: Request, res: Response) => {
  try {
    const { application_id } = req.params;
    const response = await req.loradbClient!.delete(`/retention/policies/${application_id}`);
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

/**
 * POST /api/retention/enforce
 * Trigger immediate retention enforcement
 */
router.post('/retention/enforce', async (req: Request, res: Response) => {
  try {
    const response = await req.loradbClient!.post('/retention/enforce', req.body);
    res.json(response.data);
  } catch (error) {
    handleLoraDbError(error, res);
  }
});

export default router;
