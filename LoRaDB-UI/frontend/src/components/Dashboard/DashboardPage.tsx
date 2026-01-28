import React, { useState } from 'react';
import type { Layout } from 'react-grid-layout';
import { useDashboardLayout } from '../../hooks/useDashboardLayout';
import { useDeviceTypes } from '../../hooks/useDeviceTypes';
import { DashboardGrid } from './DashboardGrid';
import { TimeRangeControl } from './TimeRangeControl';
import { WidgetConfigModal } from './WidgetConfigModal';
import { exportDashboardConfig, importDashboardConfig } from '../../utils/dashboardStorage';
import type { WidgetInstance } from '../../types/widgets';

export const DashboardPage: React.FC = () => {
  const {
    widgets,
    layouts,
    timeRange,
    autoRefresh,
    refreshInterval,
    addWidget,
    updateWidget,
    deleteWidget,
    updateLayout,
    setTimeRange,
    setAutoRefresh,
    setRefreshInterval,
    resetDashboard,
    loadLayout,
    layout,
  } = useDashboardLayout();

  const { deviceTypes, loading: deviceTypesLoading, getMeasurement, getDeviceType } = useDeviceTypes();

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<WidgetInstance | undefined>(undefined);

  const handleExport = () => {
    const config = exportDashboardConfig(layout);
    const blob = new Blob([config], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const imported = importDashboardConfig(json);
          loadLayout(imported);
          alert('Dashboard configuration imported successfully!');
        } catch (error) {
          alert(`Failed to import configuration: ${(error as Error).message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset the dashboard? This will remove all widgets.')) {
      resetDashboard();
    }
  };

  const handleEditWidget = (widget: WidgetInstance) => {
    setEditingWidget(widget);
    setConfigModalOpen(true);
  };

  const handleSaveWidget = (widget: WidgetInstance) => {
    if (editingWidget) {
      // Update existing widget
      updateWidget(editingWidget.id, widget);
    } else {
      // Add new widget
      addWidget(widget);
    }
    setEditingWidget(undefined);
  };

  const handleCloseModal = () => {
    setConfigModalOpen(false);
    setEditingWidget(undefined);
  };

  const handleUpdateInnerLayout = (widgetId: string, newLayout: { lg: Layout[]; md?: Layout[]; sm?: Layout[] }) => {
    updateWidget(widgetId, { innerLayout: newLayout });
  };

  if (deviceTypesLoading) {
    return (
      <div className="dashboard-page">
        <div className="loading">
          <div className="spinner"></div>
          <div>Loading device types...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      {/* Header */}
      <div className="dashboard-header">
        <h1>Dashboard Widgets</h1>
        <div className="dashboard-actions">
          <button onClick={() => setConfigModalOpen(true)} className="btn btn-primary">
            + Add Widget
          </button>
          <button onClick={handleExport} className="btn btn-secondary" disabled={widgets.length === 0}>
            Export
          </button>
          <button onClick={handleImport} className="btn btn-secondary">
            Import
          </button>
          <button onClick={handleReset} className="btn btn-secondary" disabled={widgets.length === 0}>
            Reset
          </button>
        </div>
      </div>

      {/* Time Range Controls */}
      <TimeRangeControl
        timeRange={timeRange}
        autoRefresh={autoRefresh}
        refreshInterval={refreshInterval}
        onTimeRangeChange={setTimeRange}
        onAutoRefreshChange={setAutoRefresh}
        onRefreshIntervalChange={setRefreshInterval}
      />

      {/* Empty State or Grid */}
      {widgets.length === 0 ? (
        <EmptyState onAddWidget={() => setConfigModalOpen(true)} />
      ) : (
        <DashboardGrid
          widgets={widgets}
          layouts={layouts}
          timeRange={timeRange}
          refreshInterval={autoRefresh ? refreshInterval : undefined}
          onLayoutChange={updateLayout}
          onDeleteWidget={deleteWidget}
          onEditWidget={handleEditWidget}
          onUpdateInnerLayout={handleUpdateInnerLayout}
          onUpdateWidget={updateWidget}
          getMeasurement={getMeasurement}
          getDeviceType={getDeviceType}
        />
      )}

      {/* Widget Config Modal */}
      <WidgetConfigModal
        isOpen={configModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveWidget}
        deviceTypes={deviceTypes}
        editWidget={editingWidget}
      />
    </div>
  );
};

// Empty State Component
const EmptyState: React.FC<{ onAddWidget: () => void }> = ({ onAddWidget }) => (
  <div className="empty-state card">
    <div className="empty-icon">📊</div>
    <h2>No widgets yet</h2>
    <p>
      Add your first widget to start visualizing device data.
      <br />
      Choose from current value displays, time series charts, gauges, and status indicators.
    </p>
    <button onClick={onAddWidget} className="btn btn-primary">
      + Add Your First Widget
    </button>
  </div>
);
