import React from 'react';
import GridLayout, { Layout, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { WidgetInstance, MeasurementDefinition, DeviceTypeDefinition } from '../../types/widgets';
import { WidgetContainer } from './WidgetContainer';

const ResponsiveGridLayout = WidthProvider(GridLayout);

interface DashboardGridProps {
  widgets: WidgetInstance[];
  layouts: { lg: Layout[] };
  timeRange: string;
  refreshInterval?: number;
  onLayoutChange: (layout: Layout[]) => void;
  onDeleteWidget: (id: string) => void;
  onEditWidget: (widget: WidgetInstance) => void;
  onUpdateInnerLayout?: (widgetId: string, newLayout: Layout[]) => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<WidgetInstance>) => void;
  getMeasurement: (deviceType: string, measurementId: string) => MeasurementDefinition | undefined;
  getDeviceType: (deviceType: string) => DeviceTypeDefinition | undefined;
}

export const DashboardGrid: React.FC<DashboardGridProps> = ({
  widgets,
  layouts,
  timeRange,
  refreshInterval,
  onLayoutChange,
  onDeleteWidget,
  onEditWidget,
  onUpdateInnerLayout,
  onUpdateWidget,
  getMeasurement,
  getDeviceType,
}) => {
  return (
    <ResponsiveGridLayout
      className="dashboard-grid"
      layout={layouts.lg}
      cols={12}
      rowHeight={60}
      onLayoutChange={onLayoutChange}
      draggableHandle=".widget-header"
      draggableCancel=".widget-actions"
      resizeHandles={['se']}
      compactType="vertical"
      preventCollision={false}
      margin={[10, 10]}
      containerPadding={[0, 0]}
      useCSSTransforms={true}
    >
      {widgets.map((widget) => {
        const measurement = widget.deviceType && widget.measurementId
          ? getMeasurement(widget.deviceType, widget.measurementId)
          : undefined;

        const deviceType = widget.deviceType
          ? getDeviceType(widget.deviceType)
          : undefined;

        return (
          <div key={widget.id} className="grid-item">
            <WidgetContainer
              widget={widget}
              measurement={measurement}
              deviceType={deviceType}
              timeRange={timeRange}
              refreshInterval={refreshInterval}
              onDelete={() => onDeleteWidget(widget.id)}
              onEdit={() => onEditWidget(widget)}
              onUpdateInnerLayout={onUpdateInnerLayout}
              onUpdateWidget={onUpdateWidget}
            />
          </div>
        );
      })}
    </ResponsiveGridLayout>
  );
};
