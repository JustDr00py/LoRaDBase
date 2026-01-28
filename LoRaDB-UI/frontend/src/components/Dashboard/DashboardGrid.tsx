import React from 'react';
import { Responsive as ResponsiveGridLayoutBase, Layout, WidthProvider, Layouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { WidgetInstance, MeasurementDefinition, DeviceTypeDefinition } from '../../types/widgets';
import { WidgetContainer } from './WidgetContainer';

const ResponsiveGridLayout = WidthProvider(ResponsiveGridLayoutBase);

interface DashboardGridProps {
  widgets: WidgetInstance[];
  layouts: Layouts;
  timeRange: string;
  refreshInterval?: number;
  onLayoutChange: (layout: Layout[], layouts: Layouts) => void;
  onDeleteWidget: (id: string) => void;
  onEditWidget: (widget: WidgetInstance) => void;
  onUpdateInnerLayout?: (widgetId: string, newLayout: { lg: Layout[]; md?: Layout[]; sm?: Layout[] }) => void;
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
      layouts={layouts}
      breakpoints={{ lg: 1024, md: 640, sm: 0 }}
      cols={{ lg: 12, md: 6, sm: 2 }}
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
