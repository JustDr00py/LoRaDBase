import React, { useState, useCallback, useMemo } from 'react';
import type {
  WidgetInstance,
  DeviceTypeDefinition,
  WidgetTemplate,
  TemplateSection,
  WidgetData,
  WidgetType,
  MeasurementDefinition,
  Threshold,
  StatusCondition,
  GaugeZone,
} from '../../../types/widgets';
import type { Layout } from 'react-grid-layout';
import { CurrentValueWidget } from './CurrentValueWidget';
import { TimeSeriesWidget } from './TimeSeriesWidget';
import { GaugeWidget } from './GaugeWidget';
import { StatusWidget } from './StatusWidget';
import { CompositeGridLayout } from './CompositeGridLayout';
import { MeasurementCustomizationModal } from '../MeasurementCustomizationModal';

interface CompositeDeviceWidgetProps {
  widget: WidgetInstance;
  deviceType: DeviceTypeDefinition;
  template: WidgetTemplate;
  measurementData: Array<{ measurementId: string; data: WidgetData }>;
  onUpdateInnerLayout?: (widgetId: string, newLayout: Layout[]) => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<WidgetInstance>) => void;
}

// Generate default grid layout from template structure
function generateDefaultLayout(
  template: WidgetTemplate,
  widget: WidgetInstance
): Layout[] {
  const layout: Layout[] = [];
  let y = 0;

  // Helper to get measurement IDs from section (handles both single and array)
  const getMeasurementIds = (section: TemplateSection): string[] => {
    return Array.isArray(section.measurementId)
      ? section.measurementId
      : [section.measurementId];
  };

  // Apply section ordering if specified
  let sections = template.sections;
  if (widget.sectionOrder && widget.sectionOrder.length > 0) {
    const sectionMap = new Map<string, TemplateSection>();
    template.sections.forEach((section) => {
      const measurementId = Array.isArray(section.measurementId)
        ? section.measurementId[0]
        : section.measurementId;
      sectionMap.set(measurementId, section);
    });

    const ordered: TemplateSection[] = [];
    widget.sectionOrder.forEach((measurementId) => {
      const section = sectionMap.get(measurementId);
      if (section) {
        ordered.push(section);
        sectionMap.delete(measurementId);
      }
    });

    sectionMap.forEach((section) => {
      ordered.push(section);
    });

    sections = ordered;
  }

  sections.forEach((section, sectionIdx) => {
    const measurementIds = getMeasurementIds(section);

    measurementIds.forEach((measurementId) => {
      // Check if hidden
      if (widget.sectionOverrides?.[measurementId]?.hidden) {
        return;
      }

      // Get display types (from override or template)
      const displayTypes =
        widget.sectionOverrides?.[measurementId]?.displayTypes || section.displayTypes;

      displayTypes.forEach((type, typeIdx) => {
        // Create unique key for each widget
        const key = `${measurementId}-${type}-${sectionIdx}`;

        // Determine size based on widget type
        let w = 6,
          h = 3; // Default: half width, 3 rows
        if (type === 'time-series') {
          w = 12; // Full width
          h = 6; // Taller for charts
        } else if (type === 'gauge') {
          w = 4; // Third width
          h = 5;
        } else if (type === 'current-value' || type === 'status') {
          w = 3; // Quarter width
          h = 2; // Compact
        }

        layout.push({
          i: key,
          x: (typeIdx * w) % 12, // Position side by side
          y: y,
          w: w,
          h: h,
          minW: 2,
          minH: 2,
        });
      });
    });

    y += 6; // Move down for next section
  });

  return layout;
}

export const CompositeDeviceWidget: React.FC<CompositeDeviceWidgetProps> = ({
  widget,
  deviceType,
  template,
  measurementData,
  onUpdateInnerLayout,
  onUpdateWidget,
}) => {
  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [innerLayout, setInnerLayout] = useState<Layout[]>(
    widget.innerLayout || generateDefaultLayout(template, widget)
  );

  // Customization modal state
  const [customizationModal, setCustomizationModal] = useState<{
    isOpen: boolean;
    measurementId: string | null;
    widgetType: WidgetType | null;
  }>({
    isOpen: false,
    measurementId: null,
    widgetType: null,
  });

  // Helper function to render a widget by type
  const renderWidgetByType = useCallback(
    (
      type: WidgetType,
      measurement: MeasurementDefinition,
      data: WidgetData,
      measurementId: string,
      yAxisOverride?: { customYAxisMin?: number; customYAxisMax?: number }
    ): React.ReactNode => {
      // Get measurement-specific overrides
      const overrides = widget.sectionOverrides?.[measurementId];

      switch (type) {
        case 'time-series':
          return (
            <TimeSeriesWidget
              data={data}
              measurement={measurement}
              config={{
                ...measurement.widgets['time-series'],
                color: overrides?.customColor || measurement.widgets['time-series']?.color,
              }}
              widget={widget}
              yAxisOverride={yAxisOverride}
            />
          );
        case 'gauge':
          return (
            <GaugeWidget
              data={data}
              measurement={measurement}
              config={{
                ...measurement.widgets.gauge,
                zones: overrides?.customGaugeZones || measurement.widgets.gauge?.zones,
              }}
              widget={widget}
              yAxisOverride={yAxisOverride}
            />
          );
        case 'current-value':
          return (
            <CurrentValueWidget
              data={data}
              measurement={measurement}
              config={{
                ...measurement.widgets['current-value'],
                thresholds: overrides?.customThresholds || measurement.widgets['current-value']?.thresholds,
              }}
            />
          );
        case 'status':
          return (
            <StatusWidget
              data={data}
              measurement={{
                ...measurement,
                widgets: {
                  ...measurement.widgets,
                  status: {
                    ...measurement.widgets.status,
                    conditions: overrides?.customStatusConditions || measurement.widgets.status?.conditions,
                  },
                },
              }}
            />
          );
        default:
          return <div className="widget-error">Unknown widget type: {type}</div>;
      }
    },
    [widget]
  );

  // Apply custom section ordering if specified
  const orderedSections = useMemo(() => {
    if (!widget.sectionOrder || widget.sectionOrder.length === 0) {
      return template.sections;
    }

    // Create a map of measurementId to section for quick lookup
    const sectionMap = new Map<string, TemplateSection>();
    template.sections.forEach((section) => {
      const measurementId = Array.isArray(section.measurementId)
        ? section.measurementId[0]
        : section.measurementId;
      sectionMap.set(measurementId, section);
    });

    // Build ordered array based on sectionOrder
    const ordered: TemplateSection[] = [];
    widget.sectionOrder.forEach((measurementId) => {
      const section = sectionMap.get(measurementId);
      if (section) {
        ordered.push(section);
        sectionMap.delete(measurementId);
      }
    });

    // Append any sections not in the custom order (newly added measurements)
    sectionMap.forEach((section) => {
      ordered.push(section);
    });

    return ordered;
  }, [template.sections, widget.sectionOrder]);

  // Build grid items from ordered sections
  const gridItems = useMemo(() => {
    const items: React.ReactElement[] = [];

    orderedSections.forEach((section, sectionIdx) => {
      const measurementIds = Array.isArray(section.measurementId)
        ? section.measurementId
        : [section.measurementId];

      measurementIds.forEach((measurementId) => {
        // Check if hidden
        if (widget.sectionOverrides?.[measurementId]?.hidden) {
          return;
        }

        const measurement = deviceType.measurements.find((m) => m.id === measurementId);
        if (!measurement) return;

        const data = measurementData.find((md) => md.measurementId === measurementId);
        if (!data) return;

        // Get display types from override or template
        const displayTypes =
          widget.sectionOverrides?.[measurementId]?.displayTypes || section.displayTypes;

        displayTypes.forEach((type) => {
          const key = `${measurementId}-${type}-${sectionIdx}`;
          const yAxisOverride = widget.sectionOverrides?.[measurementId];

          // Render widget with wrapper for grid
          items.push(
            <div key={key} className="inner-grid-item">
              {editMode && (
                <div className="inner-widget-header">
                  <span className="inner-widget-label">
                    {measurement.name} - {type}
                  </span>
                  <button
                    className="inner-widget-customize-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleOpenCustomization(measurementId, type);
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    title="Customize appearance"
                  >
                    ✎
                  </button>
                </div>
              )}
              <div className="inner-widget-content">
                {renderWidgetByType(type, measurement, data.data, measurementId, yAxisOverride)}
              </div>
            </div>
          );
        });
      });
    });

    return items;
  }, [
    orderedSections,
    measurementData,
    widget,
    deviceType,
    editMode,
    renderWidgetByType,
  ]);

  // Handle layout change
  const handleLayoutChange = useCallback(
    (newLayout: Layout[]) => {
      setInnerLayout(newLayout);
      if (onUpdateInnerLayout) {
        onUpdateInnerLayout(widget.id, newLayout);
      }
    },
    [widget.id, onUpdateInnerLayout]
  );

  // Handle opening customization modal
  const handleOpenCustomization = (measurementId: string, widgetType: WidgetType) => {
    setCustomizationModal({
      isOpen: true,
      measurementId,
      widgetType,
    });
  };

  // Handle saving customization
  const handleSaveCustomization = (overrides: {
    customColor?: string;
    customThresholds?: Threshold[];
    customStatusConditions?: StatusCondition[];
    customGaugeZones?: GaugeZone[];
  }) => {
    if (!customizationModal.measurementId || !onUpdateWidget) return;

    const updatedOverrides = {
      ...widget.sectionOverrides,
      [customizationModal.measurementId]: {
        ...widget.sectionOverrides?.[customizationModal.measurementId],
        ...overrides,
      },
    };

    onUpdateWidget(widget.id, { sectionOverrides: updatedOverrides });
    setCustomizationModal({ isOpen: false, measurementId: null, widgetType: null });
  };

  // Get current measurement for modal
  const currentMeasurement = customizationModal.measurementId
    ? deviceType.measurements.find((m) => m.id === customizationModal.measurementId)
    : undefined;

  return (
    <div className="composite-widget">
      {/* Edit Mode Toggle */}
      <div className="composite-header">
        <button
          className="edit-layout-btn"
          onClick={() => setEditMode(!editMode)}
          title={editMode ? 'Lock Layout' : 'Edit Layout'}
        >
          {editMode ? '🔓 Lock' : '🔒 Edit Layout'}
        </button>
      </div>

      {/* Grid Layout */}
      <CompositeGridLayout
        layout={innerLayout}
        onLayoutChange={handleLayoutChange}
        editMode={editMode}
      >
        {gridItems}
      </CompositeGridLayout>

      {/* Customization Modal */}
      {currentMeasurement && customizationModal.widgetType && (
        <MeasurementCustomizationModal
          isOpen={customizationModal.isOpen}
          onClose={() =>
            setCustomizationModal({ isOpen: false, measurementId: null, widgetType: null })
          }
          onSave={handleSaveCustomization}
          measurement={currentMeasurement}
          widgetType={customizationModal.widgetType}
          currentOverrides={
            customizationModal.measurementId
              ? widget.sectionOverrides?.[customizationModal.measurementId]
              : undefined
          }
        />
      )}
    </div>
  );
};
