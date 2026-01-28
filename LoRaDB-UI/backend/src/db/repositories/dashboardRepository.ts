import { db } from '../database';

// Grid layout item (subset of react-grid-layout's Layout type)
export interface Layout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;
}

// Widget types
export type WidgetType = 'current-value' | 'time-series' | 'gauge' | 'status';

// Widget instance stored in dashboard
export interface WidgetInstance {
  id: string;
  devEui: string;
  deviceType?: string;
  measurementId?: string;
  widgetType?: WidgetType;
  templateId?: string;
  sectionOverrides?: any;
  sectionOrder?: string[];
  innerLayout?: Layout[];
  innerLayoutLocked?: boolean;
  title?: string;
  config?: any;
  conversion?: any;
  customYAxisMin?: number;
  customYAxisMax?: number;
}

// Dashboard stored in database
export interface Dashboard {
  id: number;
  server_id: number;
  name: string;
  is_default: number;
  version: string;
  time_range: string;
  auto_refresh: number;
  refresh_interval: number;
  widgets: string; // JSON string
  layouts: string; // JSON string
  created_at: string;
  updated_at: string;
}

// Dashboard as returned to client (with parsed JSON)
export interface DashboardPublic {
  id: number;
  serverId: number;
  name: string;
  isDefault: boolean;
  version: string;
  timeRange: string;
  autoRefresh: boolean;
  refreshInterval: number;
  widgets: WidgetInstance[];
  layouts: {
    lg: Layout[];
    md?: Layout[];
    sm?: Layout[];
  };
  createdAt: string;
  updatedAt: string;
}

// Data for creating a dashboard
export interface CreateDashboardData {
  serverId: number;
  name?: string;
  version: string;
  timeRange: string;
  autoRefresh: boolean;
  refreshInterval: number;
  widgets: WidgetInstance[];
  layouts: {
    lg: Layout[];
    md?: Layout[];
    sm?: Layout[];
  };
}

// Data for updating a dashboard
export interface UpdateDashboardData {
  name?: string;
  timeRange?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  widgets?: WidgetInstance[];
  layouts?: {
    lg: Layout[];
    md?: Layout[];
    sm?: Layout[];
  };
}

class DashboardRepository {
  /**
   * Convert database row to public format
   */
  private toPublic(row: Dashboard): DashboardPublic {
    return {
      id: row.id,
      serverId: row.server_id,
      name: row.name,
      isDefault: row.is_default === 1,
      version: row.version,
      timeRange: row.time_range,
      autoRefresh: row.auto_refresh === 1,
      refreshInterval: row.refresh_interval,
      widgets: JSON.parse(row.widgets),
      layouts: JSON.parse(row.layouts),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Create a new dashboard
   */
  create(data: CreateDashboardData): DashboardPublic {
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO dashboards (
        server_id, name, is_default, version, time_range, auto_refresh,
        refresh_interval, widgets, layouts, created_at, updated_at
      )
      VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.serverId,
      data.name || 'Default Dashboard',
      data.version,
      data.timeRange,
      data.autoRefresh ? 1 : 0,
      data.refreshInterval,
      JSON.stringify(data.widgets),
      JSON.stringify(data.layouts),
      now,
      now
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  /**
   * Find a dashboard by ID
   */
  findById(id: number): DashboardPublic | null {
    const stmt = db.prepare('SELECT * FROM dashboards WHERE id = ?');
    const row = stmt.get(id) as Dashboard | null;
    return row ? this.toPublic(row) : null;
  }

  /**
   * Get the default dashboard for a server
   */
  getDefault(serverId: number): DashboardPublic | null {
    const stmt = db.prepare('SELECT * FROM dashboards WHERE server_id = ? AND is_default = 1 LIMIT 1');
    const row = stmt.get(serverId) as Dashboard | null;
    return row ? this.toPublic(row) : null;
  }

  /**
   * List all dashboards for a server
   */
  listAll(serverId: number): DashboardPublic[] {
    const stmt = db.prepare('SELECT * FROM dashboards WHERE server_id = ? ORDER BY is_default DESC, created_at DESC');
    const rows = stmt.all(serverId) as Dashboard[];
    return rows.map((row) => this.toPublic(row));
  }

  /**
   * Update a dashboard
   */
  update(id: number, data: UpdateDashboardData): DashboardPublic | null {
    const dashboard = this.findById(id);
    if (!dashboard) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }

    if (data.timeRange !== undefined) {
      updates.push('time_range = ?');
      values.push(data.timeRange);
    }

    if (data.autoRefresh !== undefined) {
      updates.push('auto_refresh = ?');
      values.push(data.autoRefresh ? 1 : 0);
    }

    if (data.refreshInterval !== undefined) {
      updates.push('refresh_interval = ?');
      values.push(data.refreshInterval);
    }

    if (data.widgets !== undefined) {
      updates.push('widgets = ?');
      values.push(JSON.stringify(data.widgets));
    }

    if (data.layouts !== undefined) {
      updates.push('layouts = ?');
      values.push(JSON.stringify(data.layouts));
    }

    updates.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);

    const stmt = db.prepare(`UPDATE dashboards SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    return this.findById(id);
  }

  /**
   * Delete a dashboard
   */
  delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM dashboards WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Set a dashboard as default for its server (unsets other defaults for that server)
   */
  setDefault(id: number): boolean {
    const dashboard = this.findById(id);
    if (!dashboard) {
      return false;
    }

    // Use transaction to ensure atomicity
    const transaction = db.transaction(() => {
      // Unset all defaults for this server
      db.prepare('UPDATE dashboards SET is_default = 0 WHERE server_id = ?').run(dashboard.serverId);

      // Set this one as default
      db.prepare('UPDATE dashboards SET is_default = 1, updated_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        id
      );
    });

    transaction();
    return true;
  }

  /**
   * Check if dashboard exists
   */
  exists(id: number): boolean {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM dashboards WHERE id = ?');
    const result = stmt.get(id) as any;
    return result.count > 0;
  }

  /**
   * Get dashboard count for a server
   */
  count(serverId: number): number {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM dashboards WHERE server_id = ?');
    const result = stmt.get(serverId) as any;
    return result.count;
  }

  /**
   * Create default dashboard for a server if none exists
   */
  ensureDefaultExists(serverId: number): DashboardPublic {
    let defaultDashboard = this.getDefault(serverId);

    if (!defaultDashboard) {
      // Create a default dashboard
      defaultDashboard = this.create({
        serverId,
        name: 'Default Dashboard',
        version: '2.0',
        timeRange: '24h',
        autoRefresh: true,
        refreshInterval: 60,
        widgets: [],
        layouts: { lg: [] },
      });

      // Set as default
      this.setDefault(defaultDashboard.id);
    }

    return defaultDashboard;
  }
}

export const dashboardRepository = new DashboardRepository();
