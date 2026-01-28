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
import { applyFormula } from '../../../utils/widgetDataProcessor';

interface CompositeDeviceWidgetProps {
  widget: WidgetInstance;
  deviceType: DeviceTypeDefinition;
  template: WidgetTemplate;
  measurementData: Array<{ measurementId: string; data: WidgetData }>;
  onUpdateInnerLayout?: (widgetId: string, newLayout: { lg: Layout[]; md?: Layout[]; sm?: Layout[] }) => void;
  onUpdateWidget?: (widgetId: string, updates: Partial<WidgetInstance>) => void;
  editMode: boolean;
}

// Generate default grid layout from template structure (responsive)
function generateDefaultResponsiveLayouts(
  template: WidgetTemplate,
  widget: WidgetInstance
): { lg: Layout[]; md: Layout[]; sm: Layout[] } {
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

  const lgLayout: Layout[] = [];
  const mdLayout: Layout[] = [];
  const smLayout: Layout[] = [];
  let lgY = 0;
  let mdY = 0;
  let smY = 0;

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

        // Desktop (lg) - Side by side layout (existing behavior)
        let lgW = 6, lgH = 3;
        if (type === 'time-series') {
          lgW = 12; lgH = 6;
        } else if (type === 'gauge') {
          lgW = 4; lgH = 5;
        } else if (type === 'current-value' || type === 'status') {
          lgW = 3; lgH = 2;
        }
        lgLayout.push({
          i: key,
          x: (typeIdx * lgW) % 12,
          y: lgY,
          w: lgW,
          h: lgH,
          minW: 2,
          minH: 2,
        });

        // Tablet (md) - 2 per row for smaller widgets, full width for charts
        let mdW = 6, mdH = 3;
        if (type === 'time-series') {
          mdW = 6; mdH = 5;
        } else if (type === 'gauge') {
          mdW = 3; mdH = 4;
        } else if (type === 'current-value' || type === 'status') {
          mdW = 3; mdH = 2;
        }
        mdLayout.push({
          i: key,
          x: (typeIdx * mdW) % 6,
          y: mdY,
          w: mdW,
          h: mdH,
          minW: 2,
          minH: 2,
        });

        // Mobile (sm) - Stacked vertically (single column)
        let smW = 2, smH = 3;
        if (type === 'time-series') {
          smW = 2; smH = 4;
        } else if (type === 'gauge') {
          smW = 2; smH = 4;
        } else if (type === 'current-value' || type === 'status') {
          smW = 2; smH = 3;
        }
        smLayout.push({
          i: key,
          x: 0, // Always start at x=0 for stacking
          y: smY,
          w: smW,
          h: smH,
          minW: 2,
          minH: 2,
        });
        smY += smH; // Stack vertically
      });
    });

    // Move down for next section
    lgY += 6;
    mdY += 6;
  });

  return { lg: lgLayout, md: mdLayout, sm: smLayout };
}

// Migration helper - converts old single layout to responsive layouts
function migrateToResponsiveLayout(
  widget: WidgetInstance,
  template: WidgetTemplate
): { lg: Layout[]; md: Layout[]; sm: Layout[] } {
  // Check if widget has innerLayout and if it's in old format (array) or new format (object)
  if (widget.innerLayout) {
    // Type guard: check if it's an array (old format) or object (new format)
    if (Array.isArray(widget.innerLayout)) {
      // Old format - migrate it
      const lgLayout = widget.innerLayout;

      // Generate md and sm layouts based on the lg layout
      const mdLayout: Layout[] = lgLayout.map((item) => {
        // Scale down for tablet (6 columns instead of 12)
        const scaledX = Math.floor((item.x / 12) * 6);
        const scaledW = Math.ceil((item.w / 12) * 6);

        return {
          ...item,
          x: scaledX,
          w: Math.min(scaledW, 6),
          h: item.h,
        };
      });

      // Stack vertically for mobile (2 columns, single column layout)
      const smLayout: Layout[] = lgLayout.map((item, index) => {
        return {
          ...item,
          x: 0,
          w: 2,
          y: index * item.h, // Stack vertically
        };
      });

      return { lg: lgLayout, md: mdLayout, sm: smLayout };
    } else {
      // Already in new format, ensure all breakpoints are present
      return {
        lg: widget.innerLayout.lg,
        md: widget.innerLayout.md || widget.innerLayout.lg,
        sm: widget.innerLayout.sm || widget.innerLayout.lg,
      };
    }
  }

  // No existing layout, generate defaults
  return generateDefaultResponsiveLayouts(template, widget);
}

export const CompositeDeviceWidget: React.FC<CompositeDeviceWidgetProps> = ({
  widget,
  deviceType,
  template,
  measurementData,
  onUpdateInnerLayout,
  onUpdateWidget,
  editMode,
}) => {
  const [innerLayout, setInnerLayout] = useState<{ lg: Layout[]; md: Layout[]; sm: Layout[] }>(
    migrateToResponsiveLayout(widget, template)
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

  // Helper function to apply formula to widget data
  const applyFormulaToData = useCallback((data: WidgetData, formula?: string): WidgetData => {
    if (!formula || typeof data.currentValue !== 'number') {
      return data;
    }

    const transformedCurrentValue = applyFormula(data.currentValue, formula);
    const transformedTimeSeries = data.timeSeries?.map((point) => ({
      ...point,
      value: applyFormula(point.value, formula),
    }));

    return {
      ...data,
      currentValue: transformedCurrentValue,
      timeSeries: transformedTimeSeries,
    };
  }, []);

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

      // Apply formula transformation if present
      const transformedData = applyFormulaToData(data, overrides?.customFormula);

      switch (type) {
        case 'time-series':
          return (
            <TimeSeriesWidget
              data={transformedData}
              measurement={{
                ...measurement,
                name: overrides?.customTitle || measurement.name,
                unit: overrides?.customUnit || measurement.unit,
              }}
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
              data={transformedData}
              measurement={{
                ...measurement,
                name: overrides?.customTitle || measurement.name,
                unit: overrides?.customUnit || measurement.unit,
              }}
              config={{
                ...measurement.widgets.gauge,
                zones: overrides?.customGaugeZones || measurement.widgets.gauge?.zones,
              }}
              widget={widget}
              yAxisOverride={yAxisOverride}
              showThresholdLabels={overrides?.showThresholdLabels ?? true}
            />
          );
        case 'current-value':
          return (
            <CurrentValueWidget
              data={transformedData}
              measurement={{
                ...measurement,
                name: overrides?.customTitle || measurement.name,
                unit: overrides?.customUnit || measurement.unit,
              }}
              config={{
                ...measurement.widgets['current-value'],
                thresholds: overrides?.customThresholds || measurement.widgets['current-value']?.thresholds,
              }}
              showThresholdLabels={overrides?.showThresholdLabels ?? true}
            />
          );
        case 'status':
          return (
            <StatusWidget
              data={transformedData}
              measurement={{
                ...measurement,
                name: overrides?.customTitle || measurement.name,
                unit: overrides?.customUnit || measurement.unit,
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
    [widget, applyFormulaToData]
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
          const hideBorder = widget.sectionOverrides?.[measurementId]?.hideBorder;

          // Render widget with wrapper for grid
          items.push(
            <div key={key} className={`inner-grid-item ${hideBorder ? 'no-border' : ''}`}>
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

  // Handle layout change (for responsive layouts)
  const handleLayoutChange = useCallback(
    (layouts: { lg: Layout[]; md?: Layout[]; sm?: Layout[] }) => {
      setInnerLayout(layouts as { lg: Layout[]; md: Layout[]; sm: Layout[] });
      if (onUpdateInnerLayout) {
        onUpdateInnerLayout(widget.id, layouts);
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
    customTitle?: string;
    customUnit?: string;
    hideBorder?: boolean;
    showThresholdLabels?: boolean;
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
