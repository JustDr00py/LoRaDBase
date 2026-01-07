import type { DashboardLayout } from '../types/widgets';

const STORAGE_KEY = 'loradb-dashboard-layout';

/**
 * Get default dashboard layout
 */
export function getDefaultLayout(): DashboardLayout {
  return {
    version: '2.0',
    timeRange: '24h',
    autoRefresh: true,
    refreshInterval: 60,
    widgets: [],
    layouts: {
      lg: [],
    },
  };
}

/**
 * Load dashboard layout from localStorage
 */
export function loadDashboardLayout(): DashboardLayout | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const layout = JSON.parse(stored) as DashboardLayout;

    // Migrate from v1.0 to v2.0 if needed
    if (layout.version === '1.0') {
      console.info('Migrating dashboard layout from v1.0 to v2.0');
      layout.version = '2.0';
      // innerLayout will be undefined for existing widgets, which is fine
      // The CompositeDeviceWidget will generate default layouts automatically
      saveDashboardLayout(layout); // Save migrated version
      return layout;
    }

    // Validate version compatibility
    if (layout.version !== '2.0') {
      console.warn(`Dashboard layout version ${layout.version} not supported, using default`);
      return null;
    }

    return layout;
  } catch (error) {
    console.error('Failed to load dashboard layout:', error);
    return null;
  }
}

/**
 * Save dashboard layout to localStorage
 */
export function saveDashboardLayout(layout: DashboardLayout): void {
  try {
    const json = JSON.stringify(layout);
    localStorage.setItem(STORAGE_KEY, json);
  } catch (error) {
    console.error('Failed to save dashboard layout:', error);
  }
}

/**
 * Clear dashboard layout from localStorage
 */
export function clearDashboardLayout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear dashboard layout:', error);
  }
}

/**
 * Export dashboard configuration as JSON string
 */
export function exportDashboardConfig(layout: DashboardLayout): string {
  return JSON.stringify(layout, null, 2);
}

/**
 * Import dashboard configuration from JSON string
 */
export function importDashboardConfig(json: string): DashboardLayout {
  try {
    const layout = JSON.parse(json) as DashboardLayout;

    // Validate required fields
    if (!layout.version || !layout.widgets || !layout.layouts) {
      throw new Error('Invalid dashboard configuration');
    }

    return layout;
  } catch (error) {
    throw new Error(`Failed to import dashboard config: ${(error as Error).message}`);
  }
}

/**
 * Get dashboard layout or create default
 */
export function getOrCreateDashboardLayout(): DashboardLayout {
  const loaded = loadDashboardLayout();
  if (loaded) {
    return loaded;
  }

  const defaultLayout = getDefaultLayout();
  saveDashboardLayout(defaultLayout);
  return defaultLayout;
}
