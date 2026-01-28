import { Router, Request, Response } from 'express';
import { dashboardRepository, CreateDashboardData, UpdateDashboardData } from '../db/repositories/dashboardRepository';
import { serverContextMiddleware } from '../middleware/serverContext';
import rateLimit from 'express-rate-limit';

const router = Router();

// Apply server authentication to all dashboard routes
router.use(serverContextMiddleware);

// Rate limiter for dashboard operations (30 per minute per IP)
const dashboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many dashboard operations, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * GET /api/dashboards
 * List all dashboards for the authenticated server
 * Requires server authentication
 */
router.get('/', dashboardLimiter, async (req: Request, res: Response) => {
  try {
    const serverId = req.server!.id;
    const dashboards = dashboardRepository.listAll(serverId);
    return res.json(dashboards);
  } catch (error: any) {
    console.error('❌ Failed to list dashboards:', error);
    return res.status(500).json({
      error: 'DatabaseError',
      message: error.message || 'Failed to list dashboards',
    });
  }
});

/**
 * GET /api/dashboards/default
 * Get the default dashboard for the authenticated server (creates one if none exists)
 * Requires server authentication
 */
router.get('/default', dashboardLimiter, async (req: Request, res: Response) => {
  try {
    const serverId = req.server!.id;
    const dashboard = dashboardRepository.ensureDefaultExists(serverId);
    return res.json(dashboard);
  } catch (error: any) {
    console.error('❌ Failed to get default dashboard:', error);
    return res.status(500).json({
      error: 'DatabaseError',
      message: error.message || 'Failed to get default dashboard',
    });
  }
});

/**
 * GET /api/dashboards/:id
 * Get a specific dashboard by ID
 * Requires server authentication and dashboard ownership
 */
router.get('/:id', dashboardLimiter, async (req: Request, res: Response) => {
  try {
    const serverId = req.server!.id;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid dashboard ID',
      });
    }

    const dashboard = dashboardRepository.findById(id);

    if (!dashboard) {
      return res.status(404).json({
        error: 'NotFoundError',
        message: 'Dashboard not found',
      });
    }

    // Verify dashboard belongs to authenticated server
    if (dashboard.serverId !== serverId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Dashboard does not belong to this server',
      });
    }

    return res.json(dashboard);
  } catch (error: any) {
    console.error('❌ Failed to get dashboard:', error);
    return res.status(500).json({
      error: 'DatabaseError',
      message: error.message || 'Failed to get dashboard',
    });
  }
});

/**
 * POST /api/dashboards
 * Create a new dashboard for the authenticated server
 * Requires server authentication
 */
router.post('/', dashboardLimiter, async (req: Request, res: Response) => {
  try {
    const serverId = req.server!.id;
    const data: CreateDashboardData = { ...req.body, serverId };

    // Validate required fields
    if (!data.version || !data.timeRange || data.autoRefresh === undefined || !data.refreshInterval) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Missing required fields: version, timeRange, autoRefresh, refreshInterval',
      });
    }

    if (!data.widgets || !Array.isArray(data.widgets)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'widgets must be an array',
      });
    }

    if (!data.layouts || !data.layouts.lg) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'layouts must include lg layout',
      });
    }

    const dashboard = dashboardRepository.create(data);
    console.log(`✅ Dashboard created: ${dashboard.id} - ${dashboard.name} (server: ${serverId})`);

    return res.status(201).json(dashboard);
  } catch (error: any) {
    console.error('❌ Failed to create dashboard:', error);
    return res.status(500).json({
      error: 'DatabaseError',
      message: error.message || 'Failed to create dashboard',
    });
  }
});

/**
 * PUT /api/dashboards/:id
 * Update an existing dashboard
 * Requires server authentication and dashboard ownership
 */
router.put('/:id', dashboardLimiter, async (req: Request, res: Response) => {
  try {
    const serverId = req.server!.id;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid dashboard ID',
      });
    }

    // Check ownership before update
    const existing = dashboardRepository.findById(id);
    if (!existing) {
      return res.status(404).json({
        error: 'NotFoundError',
        message: 'Dashboard not found',
      });
    }

    if (existing.serverId !== serverId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Dashboard does not belong to this server',
      });
    }

    const data: UpdateDashboardData = req.body;

    // Validate widgets if provided
    if (data.widgets !== undefined && !Array.isArray(data.widgets)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'widgets must be an array',
      });
    }

    // Validate layouts if provided
    if (data.layouts !== undefined && !data.layouts.lg) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'layouts must include lg layout',
      });
    }

    const dashboard = dashboardRepository.update(id, data);

    console.log(`✅ Dashboard updated: ${dashboard!.id} - ${dashboard!.name} (server: ${serverId})`);
    return res.json(dashboard);
  } catch (error: any) {
    console.error('❌ Failed to update dashboard:', error);
    return res.status(500).json({
      error: 'DatabaseError',
      message: error.message || 'Failed to update dashboard',
    });
  }
});

/**
 * DELETE /api/dashboards/:id
 * Delete a dashboard
 * Requires server authentication and dashboard ownership
 */
router.delete('/:id', dashboardLimiter, async (req: Request, res: Response) => {
  try {
    const serverId = req.server!.id;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid dashboard ID',
      });
    }

    // Check ownership before delete
    const existing = dashboardRepository.findById(id);
    if (!existing) {
      return res.status(404).json({
        error: 'NotFoundError',
        message: 'Dashboard not found',
      });
    }

    if (existing.serverId !== serverId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Dashboard does not belong to this server',
      });
    }

    dashboardRepository.delete(id);

    console.log(`🗑️  Dashboard deleted: ${id} (server: ${serverId})`);
    return res.json({ success: true, message: 'Dashboard deleted successfully' });
  } catch (error: any) {
    console.error('❌ Failed to delete dashboard:', error);
    return res.status(500).json({
      error: 'DatabaseError',
      message: error.message || 'Failed to delete dashboard',
    });
  }
});

/**
 * POST /api/dashboards/:id/set-default
 * Set a dashboard as the default for the authenticated server
 * Requires server authentication and dashboard ownership
 */
router.post('/:id/set-default', dashboardLimiter, async (req: Request, res: Response) => {
  try {
    const serverId = req.server!.id;
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Invalid dashboard ID',
      });
    }

    // Check ownership before setting default
    const existing = dashboardRepository.findById(id);
    if (!existing) {
      return res.status(404).json({
        error: 'NotFoundError',
        message: 'Dashboard not found',
      });
    }

    if (existing.serverId !== serverId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Dashboard does not belong to this server',
      });
    }

    dashboardRepository.setDefault(id);

    console.log(`✅ Dashboard ${id} set as default (server: ${serverId})`);
    return res.json({ success: true, message: 'Dashboard set as default' });
  } catch (error: any) {
    console.error('❌ Failed to set default dashboard:', error);
    return res.status(500).json({
      error: 'DatabaseError',
      message: error.message || 'Failed to set default dashboard',
    });
  }
});

/**
 * POST /api/dashboards/migrate
 * Migrate dashboard from localStorage JSON
 * Used for one-time migration from localStorage to database
 * Requires server authentication
 */
router.post('/migrate', dashboardLimiter, async (req: Request, res: Response) => {
  try {
    const serverId = req.server!.id;
    const { dashboard } = req.body;

    if (!dashboard) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'Dashboard data required',
      });
    }

    // Check if a default dashboard already exists for this server
    const existingDefault = dashboardRepository.getDefault(serverId);

    if (existingDefault && existingDefault.widgets.length > 0) {
      // Don't overwrite existing dashboard with widgets
      return res.status(409).json({
        error: 'ConflictError',
        message: 'Default dashboard already exists with widgets',
        existingDashboard: existingDefault,
      });
    }

    // Create or update dashboard
    const createData: CreateDashboardData = {
      serverId,
      name: 'Migrated Dashboard',
      version: dashboard.version || '2.0',
      timeRange: dashboard.timeRange || '24h',
      autoRefresh: dashboard.autoRefresh !== false,
      refreshInterval: dashboard.refreshInterval || 60,
      widgets: dashboard.widgets || [],
      layouts: dashboard.layouts || { lg: [] },
    };

    let result;
    if (existingDefault) {
      // Update existing empty dashboard
      result = dashboardRepository.update(existingDefault.id, createData);
    } else {
      // Create new dashboard and set as default
      result = dashboardRepository.create(createData);
      dashboardRepository.setDefault(result.id);
    }

    console.log(`✅ Dashboard migrated from localStorage: ${result?.id} (server: ${serverId})`);
    return res.json(result);
  } catch (error: any) {
    console.error('❌ Failed to migrate dashboard:', error);
    return res.status(500).json({
      error: 'DatabaseError',
      message: error.message || 'Failed to migrate dashboard',
    });
  }
});

export default router;
