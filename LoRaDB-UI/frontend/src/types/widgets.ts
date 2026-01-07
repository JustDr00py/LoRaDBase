// Widget Types and Interfaces for Dashboard Widget System

import type { Layout } from 'react-grid-layout';

// Widget Types
export type WidgetType = 'current-value' | 'time-series' | 'gauge' | 'status';

// Status levels
export type StatusLevel = 'success' | 'warning' | 'error' | 'info';

// Condition operators
export type ConditionOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'between';

// Threshold comparison operators for current value widgets
export type ThresholdOperator = '<' | '<=' | '>' | '>=' | '=' | 'between';

// Threshold definition for current value widgets
export interface Threshold {
  operator: ThresholdOperator;
  value?: number;        // For <, <=, >, >=, = operators
  min?: number;          // For 'between' operator
  max?: number;          // For 'between' operator
  color: string;
  label: string;         // Default label (e.g., "Low", "Normal", "High")
  customLabel?: string;  // Optional custom label to override default
}

// Status condition for status widgets - discriminated union for string/numeric support
interface BaseStatusCondition {
  status: StatusLevel;
  label: string;
}

// Numeric condition (existing behavior, backward compatible)
export interface NumericStatusCondition extends BaseStatusCondition {
  valueType?: 'number';  // Optional for backward compatibility
  operator: ConditionOperator;
  value?: number;
  min?: number;
  max?: number;
}

// String condition (new)
export interface StringStatusCondition extends BaseStatusCondition {
  valueType: 'string';  // Required discriminator
  operator: 'eq';       // Only 'eq' operator allowed for strings
  value: string;        // String value to match
}

// Union type
export type StatusCondition = NumericStatusCondition | StringStatusCondition;

// Gauge zone for gauge widgets
export interface GaugeZone {
  from: number;
  to: number;
  color: string;
}

// Widget-specific configurations

export interface CurrentValueWidgetConfig {
  enabled: boolean;
  thresholds?: Threshold[];
}

export interface TimeSeriesWidgetConfig {
  enabled: boolean;
  yAxisMin?: number;
  yAxisMax?: number;
  showArea?: boolean;
  color?: string;
}

export interface GaugeWidgetConfig {
  enabled: boolean;
  min: number;
  max: number;
  zones?: GaugeZone[];
}

export interface StatusWidgetConfig {
  enabled: boolean;
  conditions?: StatusCondition[];
}

// Measurement definition from device type JSON
export interface MeasurementDefinition {
  id: string;
  path: string;
  name: string;
  unit: string;
  decimals: number;
  valueType?: 'number' | 'string';  // NEW: defaults to 'number' for backward compatibility
  defaultWidget: WidgetType;
  widgets: {
    'current-value': CurrentValueWidgetConfig;
    'time-series': TimeSeriesWidgetConfig;
    'gauge': GaugeWidgetConfig;
    'status': StatusWidgetConfig;
  };
}

// Widget Template Section - defines how a measurement is displayed in a composite widget
export interface TemplateSection {
  measurementId: string | string[];  // Single ID or array for combined charts
  displayTypes: WidgetType[];        // Which visualizations to show (can be multiple!)
  combinedChart?: boolean;           // If true, combine multiple measurements in one chart
  chartConfig?: {
    title?: string;
    measurementIds?: string[];       // For combined charts
  };
  layout?: {
    [key in WidgetType]?: {
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom';
      size?: 'small' | 'medium' | 'large';
    };
  };
  hidden?: boolean;
}

// Widget Template - defines how to display multiple measurements for a device type
export interface WidgetTemplate {
  id: string;
  name: string;
  description?: string;
  layout: 'grid' | 'vertical' | 'horizontal';
  defaultSize: { w: number; h: number };
  sections: TemplateSection[];
}

// Device type definition (loaded from JSON files)
export interface DeviceTypeDefinition {
  deviceType: string;
  name: string;
  manufacturer: string;
  description: string;
  version: string;
  measurements: MeasurementDefinition[];
  widgetTemplates?: WidgetTemplate[];  // NEW: Templates for composite widgets
}

// Conversion settings for measurements
export interface ConversionSettings {
  enabled: boolean;
  convertTo?: 'fahrenheit' | 'kelvin'; // Temperature conversions
}

// Widget instance - what gets saved in dashboard layout
// Supports both legacy (single measurement) and composite (template-based) widgets
export interface WidgetInstance {
  id: string;                     // Unique widget ID (UUID)
  devEui: string;                 // Device to query
  deviceType?: string;            // Optional device type for auto-config

  // Legacy single-measurement widget fields
  measurementId?: string;         // Which measurement to display (legacy)
  widgetType?: WidgetType;        // Widget visualization type (legacy)

  // New composite widget fields
  templateId?: string;            // Which template to use (new)
  sectionOverrides?: {            // Customize template per instance (new)
    [measurementId: string]: {
      hidden?: boolean;           // Hide this measurement
      displayTypes?: WidgetType[]; // Override which visualizations to show
      customYAxisMin?: number;    // Per-measurement Y-axis minimum
      customYAxisMax?: number;    // Per-measurement Y-axis maximum
      // Widget-specific customizations
      customColor?: string;       // Override color for time-series and gauge
      customThresholds?: Threshold[]; // Override thresholds for current-value
      customStatusConditions?: StatusCondition[]; // Override status conditions
      customGaugeZones?: GaugeZone[]; // Override gauge zones
    };
  };
  sectionOrder?: string[];        // Custom order of measurement IDs (optional)

  // NEW: Inner grid layout for draggable measurements
  innerLayout?: Layout[];         // React-grid-layout positions for inner widgets
  innerLayoutLocked?: boolean;    // Lock/unlock edit mode default state

  // Shared fields
  title?: string;                 // Optional custom title
  config?: Partial<MeasurementDefinition>; // Override measurement config
  conversion?: ConversionSettings; // Unit conversion settings
  customYAxisMin?: number;        // Custom Y-axis minimum for charts
  customYAxisMax?: number;        // Custom Y-axis maximum for charts
}

// Dashboard layout (persisted to localStorage)
export interface DashboardLayout {
  version: string;
  timeRange: string;              // Global time range (e.g., "24h")
  autoRefresh: boolean;
  refreshInterval: number;        // Seconds
  widgets: WidgetInstance[];
  layouts: {
    lg: Layout[];
    md?: Layout[];
    sm?: Layout[];
  };
}

// Widget data - processed for rendering - discriminated union for string/numeric support
interface BaseWidgetData {
  widgetId: string;
  timestamp?: string;
  timeSeries?: Array<{ timestamp: string; value: number }>;  // Always numeric for charts
  status?: {
    level: StatusLevel;
    label: string;
  };
  error?: string;
}

// Numeric widget data (existing behavior)
export interface NumericWidgetData extends BaseWidgetData {
  currentValue: number;
  unit?: string;       // Converted unit (e.g., °F instead of °C)
  decimals?: number;   // Decimal places for display
}

// String widget data (new)
export interface StringWidgetData extends BaseWidgetData {
  currentValue: string;
  // No unit or decimals for string values
}

// Union type
export type WidgetData = NumericWidgetData | StringWidgetData;

// Time series data point
export interface TimeSeriesDataPoint {
  timestamp: string;
  value: number;
}

// Status evaluation result
export interface StatusEvaluation {
  level: StatusLevel;
  label: string;
  color: string;
}
