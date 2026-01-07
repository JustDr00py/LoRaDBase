import { useState, useEffect, useCallback } from 'react';
import type { Layout } from 'react-grid-layout';
import type { DashboardLayout, WidgetInstance } from '../types/widgets';
import {
  getOrCreateDashboardLayout,
  saveDashboardLayout,
  clearDashboardLayout,
} from '../utils/dashboardStorage';

/**
 * Hook to manage dashboard layout state and persistence
 */
export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(() => getOrCreateDashboardLayout());

  // Auto-save to localStorage whenever layout changes
  useEffect(() => {
    saveDashboardLayout(layout);
  }, [layout]);

  /**
   * Add a new widget to the dashboard
   */
  const addWidget = useCallback((widget: WidgetInstance) => {
    setLayout((prev) => {
      // Calculate position for new widget (simple stacking)
      const existingWidgets = prev.layouts.lg;
      const maxY = existingWidgets.length > 0
        ? Math.max(...existingWidgets.map((w) => w.y + w.h))
        : 0;

      // Default widget size based on type
      const defaultSizeByType: Record<string, { w: number; h: number }> = {
        'current-value': { w: 3, h: 2 },
        'status': { w: 3, h: 2 },
        'gauge': { w: 4, h: 4 },
        'time-series': { w: 6, h: 4 },
      };

      // Determine size: use template default size for composite widgets, or widget type size for legacy widgets
      const size = widget.widgetType
        ? (defaultSizeByType[widget.widgetType] || { w: 4, h: 4 })
        : { w: 8, h: 6 }; // Default size for composite widgets (templates may vary)

      return {
        ...prev,
        widgets: [...prev.widgets, widget],
        layouts: {
          ...prev.layouts,
          lg: [
            ...prev.layouts.lg,
            {
              i: widget.id,
              x: 0,
              y: maxY,
              ...size,
            },
          ],
        },
      };
    });
  }, []);

  /**
   * Update an existing widget
   */
  const updateWidget = useCallback((id: string, updates: Partial<WidgetInstance>) => {
    setLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    }));
  }, []);

  /**
   * Delete a widget
   */
  const deleteWidget = useCallback((id: string) => {
    setLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((w) => w.id !== id),
      layouts: {
        ...prev.layouts,
        lg: prev.layouts.lg.filter((l) => l.i !== id),
      },
    }));
  }, []);

  /**
   * Update grid layout (from react-grid-layout)
   */
  const updateLayout = useCallback((newLayout: Layout[]) => {
    setLayout((prev) => ({
      ...prev,
      layouts: {
        ...prev.layouts,
        lg: newLayout,
      },
    }));
  }, []);

  /**
   * Set global time range
   */
  const setTimeRange = useCallback((timeRange: string) => {
    setLayout((prev) => ({ ...prev, timeRange }));
  }, []);

  /**
   * Set auto-refresh enabled
   */
  const setAutoRefresh = useCallback((autoRefresh: boolean) => {
    setLayout((prev) => ({ ...prev, autoRefresh }));
  }, []);

  /**
   * Set refresh interval (seconds)
   */
  const setRefreshInterval = useCallback((refreshInterval: number) => {
    setLayout((prev) => ({ ...prev, refreshInterval }));
  }, []);

  /**
   * Clear all widgets and reset to default
   */
  const resetDashboard = useCallback(() => {
    clearDashboardLayout();
    setLayout(getOrCreateDashboardLayout());
  }, []);

  /**
   * Load a dashboard layout (for import)
   */
  const loadLayout = useCallback((newLayout: DashboardLayout) => {
    setLayout(newLayout);
  }, []);

  return {
    // State
    widgets: layout.widgets,
    layouts: layout.layouts,
    timeRange: layout.timeRange,
    autoRefresh: layout.autoRefresh,
    refreshInterval: layout.refreshInterval,

    // Actions
    addWidget,
    updateWidget,
    deleteWidget,
    updateLayout,
    setTimeRange,
    setAutoRefresh,
    setRefreshInterval,
    resetDashboard,
    loadLayout,

    // Full layout for export
    layout,
  };
}
