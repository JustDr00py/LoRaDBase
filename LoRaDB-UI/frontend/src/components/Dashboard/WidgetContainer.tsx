import React, { useState } from 'react';
import type { WidgetInstance, MeasurementDefinition, DeviceTypeDefinition } from '../../types/widgets';
import type { Layout } from 'react-grid-layout';
import { useWidgetData } from '../../hooks/useWidgetData';
import { useCompositeWidgetData } from '../../hooks/useCompositeWidgetData';
import { CurrentValueWidget } from './widgets/CurrentValueWidget';
import { TimeSeriesWidget } from './widgets/TimeSeriesWidget';
import { GaugeWidget } from './widgets/GaugeWidget';
import { StatusWidget } from './widgets/StatusWidget';
import { CompositeDeviceWidget } from './widgets/CompositeDeviceWidget';

interface WidgetContainerProps {
  widget: WidgetInstance;
  measurement: MeasurementDefinition | undefined;
  deviceType?: DeviceTypeDefinition;
  timeRange: string;
  refreshInterval?: number;
  onDelete: () => void;
  onEdit: () => void;
  onUpdateInnerLayout?: (widgetId: string, newLayout: { lg: Layout[]; md?: Layout[]; sm?: Layout[] }) => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<WidgetInstance>) => void;
}

export const WidgetContainer: React.FC<WidgetContainerProps> = ({
  widget,
  measurement,
  deviceType,
  timeRange,
  refreshInterval,
  onDelete,
  onEdit,
  onUpdateInnerLayout,
  onUpdateWidget,
}) => {
  // Determine if this is a composite widget or legacy widget
  const isComposite = !!widget.templateId && !!deviceType;
  const template = deviceType?.widgetTemplates?.find((t) => t.id === widget.templateId);

  // Edit mode state for composite widgets
  const [editMode, setEditMode] = useState(false);

  // Fetch data based on widget type
  const legacyResult = useWidgetData(
    widget,
    measurement,
    timeRange,
    isComposite ? undefined : refreshInterval
  );

  const compositeResult = useCompositeWidgetData(
    widget,
    template,
    deviceType,
    timeRange,
    isComposite ? refreshInterval : undefined
  );

  // Extract data, loading, error based on widget type
  const data = isComposite ? compositeResult.measurementData : legacyResult.data;
  const isLoading = isComposite ? compositeResult.isLoading : legacyResult.isLoading;
  const error = isComposite ? compositeResult.error : legacyResult.error;

  // Determine title
  const title = widget.title || (isComposite ? template?.name : measurement?.name) || 'Widget';

  return (
    <div className="widget-container">
      <div className="widget-header">
        <h3>{title}</h3>
        <div className="widget-actions">
          {isComposite && (
            <button
              className="edit-layout-btn-compact"
              onClick={() => setEditMode(!editMode)}
              title={editMode ? 'Lock Layout' : 'Edit Layout'}
            >
              {editMode ? '🔓' : '🔒'}
            </button>
          )}
          <button onClick={onEdit} className="widget-edit-btn" title="Edit widget">
            ✎
          </button>
          <button onClick={onDelete} className="widget-delete-btn" title="Delete widget">
            ×
          </button>
        </div>
      </div>

      <div className="widget-body">
        {isLoading && (
          <div className="widget-loading">
            <div className="spinner"></div>
            <div>Loading...</div>
          </div>
        )}

        {error && !isLoading && (
          <div className="widget-error">
            Failed to load data: {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && data && (
          <>
            {isComposite && template && deviceType && Array.isArray(data) ? (
              <CompositeDeviceWidget
                widget={widget}
                deviceType={deviceType}
                template={template}
                measurementData={data}
                onUpdateInnerLayout={onUpdateInnerLayout}
                onUpdateWidget={onUpdateWidget}
                editMode={editMode}
              />
            ) : (
              measurement && !Array.isArray(data) && (
                <WidgetRenderer widget={widget} data={data} measurement={measurement} />
              )
            )}
          </>
        )}

        {!isLoading && !error && !data && (
          <div className="widget-no-data">No data available</div>
        )}
      </div>
    </div>
  );
};

interface WidgetRendererProps {
  widget: WidgetInstance;
  data: any;
  measurement: MeasurementDefinition;
}

const WidgetRenderer: React.FC<WidgetRendererProps> = ({ widget, data, measurement }) => {
  const widgetType = widget.widgetType;

  switch (widgetType) {
    case 'current-value':
      return (
        <CurrentValueWidget
          data={data}
          measurement={measurement}
          config={measurement.widgets['current-value']}
        />
      );

    case 'time-series':
      return (
        <TimeSeriesWidget
          data={data}
          measurement={measurement}
          config={measurement.widgets['time-series']}
          widget={widget}
        />
      );

    case 'gauge':
      return (
        <GaugeWidget
          data={data}
          measurement={measurement}
          config={measurement.widgets.gauge}
          widget={widget}
        />
      );

    case 'status':
      return (
        <StatusWidget
          data={data}
          measurement={measurement}
        />
      );

    default:
      return <div className="widget-error">Unknown widget type: {widgetType}</div>;
  }
};
