import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Layout, Layouts } from 'react-grid-layout';
import type { DashboardLayout, WidgetInstance } from '../types/widgets';
import {
  getDefaultDashboard,
  updateDashboard,
  migrateDashboard,
} from '../api/endpoints';
import {
  loadDashboardLayout,
  clearDashboardLayout,
  getDefaultLayout,
} from '../utils/dashboardStorage';

/**
 * Hook to manage dashboard layout state and persistence
 * Now uses API instead of localStorage
 */
export function useDashboardLayout() {
  const queryClient = useQueryClient();
  const [localLayout, setLocalLayout] = useState<DashboardLayout>(() => getDefaultLayout());
  const [migrationAttempted, setMigrationAttempted] = useState(false);

  // Fetch default dashboard from API
  const { data: dashboardData, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'default'],
    queryFn: getDefaultDashboard,
    staleTime: 30000, // Consider data fresh for 30 seconds
    retry: 1,
  });

  // Mutation for updating dashboard
  const updateMutation = useMutation({
    mutationFn: async (layout: DashboardLayout) => {
      if (!dashboardData?.id) {
        throw new Error('No dashboard ID available');
      }
      return updateDashboard(dashboardData.id, {
        timeRange: layout.timeRange,
        autoRefresh: layout.autoRefresh,
        refreshInterval: layout.refreshInterval,
        widgets: layout.widgets,
        layouts: layout.layouts,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  // Convert API dashboard to DashboardLayout format
  useEffect(() => {
    if (dashboardData) {
      setLocalLayout({
        version: dashboardData.version,
        timeRange: dashboardData.timeRange,
        autoRefresh: dashboardData.autoRefresh,
        refreshInterval: dashboardData.refreshInterval,
        widgets: dashboardData.widgets,
        layouts: dashboardData.layouts,
      });
    }
  }, [dashboardData]);

  // One-time migration from localStorage to database
  useEffect(() => {
    const attemptMigration = async () => {
      if (migrationAttempted || isLoading || !dashboardData) {
        return;
      }

      // Check if localStorage has dashboard data
      const localStorageData = loadDashboardLayout();
      if (!localStorageData || localStorageData.widgets.length === 0) {
        setMigrationAttempted(true);
        return;
      }

      // Check if database dashboard is empty
      if (dashboardData.widgets.length === 0) {
        console.log('📦 Migrating dashboard from localStorage to database...');
        try {
          await migrateDashboard({ dashboard: localStorageData });
          console.log('✅ Dashboard migrated successfully');
          // Clear localStorage after successful migration
          clearDashboardLayout();
          // Refetch to get migrated data
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        } catch (error) {
          console.error('❌ Dashboard migration failed:', error);
        }
      }

      setMigrationAttempted(true);
    };

    attemptMigration();
  }, [dashboardData, isLoading, migrationAttempted, queryClient]);

  // Debounced save to API
  const saveToAPI = useCallback(
    (layout: DashboardLayout) => {
      if (!dashboardData?.id) {
        return;
      }
      updateMutation.mutate(layout);
    },
    [dashboardData?.id, updateMutation]
  );

  // Debounce save - only save after user stops making changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveToAPI(localLayout);
    }, 10000); // Save 10 seconds after last change (prevents rate limiting)

    return () => clearTimeout(timeoutId);
  }, [localLayout, saveToAPI]);

  /**
   * Add a new widget to the dashboard
   * Now creates layouts for all responsive breakpoints (lg, md, sm)
   */
  const addWidget = useCallback((widget: WidgetInstance) => {
    setLocalLayout((prev) => {
      // Calculate position for new widget (simple stacking)
      const existingWidgetsLg = prev.layouts.lg || [];
      const existingWidgetsMd = prev.layouts.md || [];
      const existingWidgetsSm = prev.layouts.sm || [];

      const maxYLg = existingWidgetsLg.length > 0
        ? Math.max(...existingWidgetsLg.map((w) => w.y + w.h))
        : 0;
      const maxYMd = existingWidgetsMd.length > 0
        ? Math.max(...existingWidgetsMd.map((w) => w.y + w.h))
        : 0;
      const maxYSm = existingWidgetsSm.length > 0
        ? Math.max(...existingWidgetsSm.map((w) => w.y + w.h))
        : 0;

      // Default widget size based on type for each breakpoint
      // lg: 12 columns, md: 6 columns, sm: 2 columns
      const defaultSizeByType: Record<string, { lg: { w: number; h: number }, md: { w: number; h: number }, sm: { w: number; h: number } }> = {
        'current-value': {
          lg: { w: 3, h: 2 },
          md: { w: 3, h: 2 },
          sm: { w: 2, h: 3 }, // Full width on mobile, slightly taller
        },
        'status': {
          lg: { w: 3, h: 2 },
          md: { w: 3, h: 2 },
          sm: { w: 2, h: 3 },
        },
        'gauge': {
          lg: { w: 4, h: 4 },
          md: { w: 3, h: 4 },
          sm: { w: 2, h: 4 }, // Full width on mobile
        },
        'time-series': {
          lg: { w: 6, h: 4 },
          md: { w: 6, h: 4 }, // Full width on tablet
          sm: { w: 2, h: 4 }, // Full width on mobile
        },
      };

      // Determine size: use template default size for composite widgets, or widget type size for legacy widgets
      const sizes = widget.widgetType
        ? (defaultSizeByType[widget.widgetType] || {
            lg: { w: 4, h: 4 },
            md: { w: 3, h: 4 },
            sm: { w: 2, h: 4 },
          })
        : {
            lg: { w: 8, h: 6 },
            md: { w: 6, h: 6 }, // Full width on tablet
            sm: { w: 2, h: 6 }, // Full width on mobile
          }; // Default size for composite widgets

      return {
        ...prev,
        widgets: [...prev.widgets, widget],
        layouts: {
          lg: [
            ...existingWidgetsLg,
            {
              i: widget.id,
              x: 0,
              y: maxYLg,
              ...sizes.lg,
            },
          ],
          md: [
            ...existingWidgetsMd,
            {
              i: widget.id,
              x: 0,
              y: maxYMd,
              ...sizes.md,
            },
          ],
          sm: [
            ...existingWidgetsSm,
            {
              i: widget.id,
              x: 0,
              y: maxYSm,
              ...sizes.sm,
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
    setLocalLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    }));
  }, []);

  /**
   * Delete a widget from all breakpoints
   */
  const deleteWidget = useCallback((id: string) => {
    setLocalLayout((prev) => ({
      ...prev,
      widgets: prev.widgets.filter((w) => w.id !== id),
      layouts: {
        lg: (prev.layouts.lg || []).filter((l) => l.i !== id),
        md: (prev.layouts.md || []).filter((l) => l.i !== id),
        sm: (prev.layouts.sm || []).filter((l) => l.i !== id),
      },
    }));
  }, []);

  /**
   * Update grid layout (from react-grid-layout)
   * Now supports all responsive breakpoints
   */
  const updateLayout = useCallback((layout: Layout[], allLayouts: Layouts) => {
    setLocalLayout((prev) => ({
      ...prev,
      layouts: {
        lg: allLayouts.lg || layout,
        md: allLayouts.md,
        sm: allLayouts.sm,
      },
    }));
  }, []);

  /**
   * Set global time range
   */
  const setTimeRange = useCallback((timeRange: string) => {
    setLocalLayout((prev) => ({ ...prev, timeRange }));
  }, []);

  /**
   * Set auto-refresh enabled
   */
  const setAutoRefresh = useCallback((autoRefresh: boolean) => {
    setLocalLayout((prev) => ({ ...prev, autoRefresh }));
  }, []);

  /**
   * Set refresh interval (seconds)
   */
  const setRefreshInterval = useCallback((refreshInterval: number) => {
    setLocalLayout((prev) => ({ ...prev, refreshInterval }));
  }, []);

  /**
   * Clear all widgets and reset to default
   */
  const resetDashboard = useCallback(() => {
    const defaultLayout = getDefaultLayout();
    setLocalLayout(defaultLayout);
  }, []);

  /**
   * Load a dashboard layout (for import)
   */
  const loadLayout = useCallback((newLayout: DashboardLayout) => {
    setLocalLayout(newLayout);
  }, []);

  return {
    // State
    widgets: localLayout.widgets,
    layouts: localLayout.layouts,
    timeRange: localLayout.timeRange,
    autoRefresh: localLayout.autoRefresh,
    refreshInterval: localLayout.refreshInterval,
    isLoading,
    error,
    isSaving: updateMutation.isPending,

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
    layout: localLayout,
    dashboardId: dashboardData?.id,
  };
}
