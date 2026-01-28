import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';
import type { DeviceTypeDefinition, WidgetInstance, WidgetType, Threshold, ThresholdOperator } from '../../types/widgets';
import { getDevices } from '../../api/endpoints';

interface WidgetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (widget: WidgetInstance) => void;
  deviceTypes: DeviceTypeDefinition[];
  editWidget?: WidgetInstance;
}

export const WidgetConfigModal: React.FC<WidgetConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  deviceTypes,
  editWidget,
}) => {
  const [devEui, setDevEui] = useState('');
  const [deviceType, setDeviceType] = useState('');
  const [widgetMode, setWidgetMode] = useState<'template' | 'individual'>('template');
  const [templateId, setTemplateId] = useState('');
  const [measurementId, setMeasurementId] = useState('');
  const [widgetType, setWidgetType] = useState<WidgetType>('time-series');
  const [title, setTitle] = useState('');
  const [sectionOverrides, setSectionOverrides] = useState<{
    [measurementId: string]: {
      hidden?: boolean;
      displayTypes?: WidgetType[];
      customYAxisMin?: number;
      customYAxisMax?: number;
      customFormula?: string;
    };
  }>({});
  const [sectionOrder, setSectionOrder] = useState<string[]>([]);
  const [conversionEnabled, setConversionEnabled] = useState(false);
  const [convertTo, setConvertTo] = useState<'fahrenheit' | 'kelvin'>('fahrenheit');
  const [customYAxisMin, setCustomYAxisMin] = useState<string>('');
  const [customYAxisMax, setCustomYAxisMax] = useState<string>('');
  const [sectionYAxis, setSectionYAxis] = useState<{
    [measurementId: string]: { min?: string; max?: string };
  }>({});
  const [sectionFormula, setSectionFormula] = useState<{
    [measurementId: string]: string;
  }>({});
  const [advancedSettingsExpanded, setAdvancedSettingsExpanded] = useState(false);
  const [thresholds, setThresholds] = useState<Threshold[]>([]);

  // Fetch devices for dropdown
  const { data: devicesData } = useQuery({
    queryKey: ['devices'],
    queryFn: getDevices,
  });

  // Reset or populate form based on mode
  useEffect(() => {
    if (!isOpen) {
      // Reset when modal closes
      setDevEui('');
      setDeviceType('');
      setWidgetMode('template');
      setTemplateId('');
      setMeasurementId('');
      setWidgetType('time-series');
      setTitle('');
      setSectionOverrides({});
      setSectionOrder([]);
      setConversionEnabled(false);
      setConvertTo('fahrenheit');
      setCustomYAxisMin('');
      setCustomYAxisMax('');
      setSectionYAxis({});
      setSectionFormula({});
      setThresholds([]);
    } else if (editWidget) {
      // Populate fields when editing
      setDevEui(editWidget.devEui);
      setDeviceType(editWidget.deviceType || '');

      // Determine mode based on widget data
      if (editWidget.templateId) {
        setWidgetMode('template');
        setTemplateId(editWidget.templateId);
        setSectionOverrides(editWidget.sectionOverrides || {});
        setSectionOrder(editWidget.sectionOrder || []);

        // Initialize sectionYAxis from sectionOverrides
        if (editWidget.sectionOverrides) {
          const yAxisValues: { [measurementId: string]: { min?: string; max?: string } } = {};
          const formulaValues: { [measurementId: string]: string } = {};
          Object.entries(editWidget.sectionOverrides).forEach(([mId, override]) => {
            if (override.customYAxisMin !== undefined || override.customYAxisMax !== undefined) {
              yAxisValues[mId] = {
                min: override.customYAxisMin?.toString() || '',
                max: override.customYAxisMax?.toString() || '',
              };
            }
            if (override.customFormula) {
              formulaValues[mId] = override.customFormula;
            }
          });
          setSectionYAxis(yAxisValues);
          setSectionFormula(formulaValues);
        }
      } else {
        setWidgetMode('individual');
        setMeasurementId(editWidget.measurementId || '');
        setWidgetType(editWidget.widgetType || 'time-series');
      }

      setTitle(editWidget.title || '');
      setConversionEnabled(editWidget.conversion?.enabled || false);
      setConvertTo(editWidget.conversion?.convertTo || 'fahrenheit');
      setCustomYAxisMin(editWidget.customYAxisMin !== undefined ? String(editWidget.customYAxisMin) : '');
      setCustomYAxisMax(editWidget.customYAxisMax !== undefined ? String(editWidget.customYAxisMax) : '');

      // Load thresholds from config if available
      if (editWidget.config?.widgets?.['current-value']?.thresholds) {
        setThresholds(editWidget.config.widgets['current-value'].thresholds);
      } else {
        setThresholds([]);
      }
    }
  }, [isOpen, editWidget]);

  // Auto-select first device type when available
  useEffect(() => {
    if (deviceTypes.length > 0 && !deviceType) {
      setDeviceType(deviceTypes[0].deviceType);
    }
  }, [deviceTypes, deviceType]);

  // Auto-select first template when device type changes
  useEffect(() => {
    if (deviceType && !editWidget) {
      const dt = deviceTypes.find((d) => d.deviceType === deviceType);
      if (dt?.widgetTemplates && dt.widgetTemplates.length > 0) {
        setWidgetMode('template');
        setTemplateId(dt.widgetTemplates[0].id);
      } else {
        setWidgetMode('individual');
        setTemplateId('');
      }
    }
  }, [deviceType, deviceTypes, editWidget]);

  // Initialize section order when template is selected
  useEffect(() => {
    if (templateId && !editWidget) {
      const dt = deviceTypes.find((d) => d.deviceType === deviceType);
      const template = dt?.widgetTemplates?.find((t) => t.id === templateId);
      if (template) {
        // Extract measurement IDs from template sections in order
        const measurementIds = template.sections.map((section) =>
          Array.isArray(section.measurementId) ? section.measurementId[0] : section.measurementId
        );
        setSectionOrder(measurementIds);
      }
    }
  }, [templateId, deviceType, deviceTypes, editWidget]);

  if (!isOpen) {
    return null;
  }

  const selectedDeviceType = deviceTypes.find((dt) => dt.deviceType === deviceType);
  const measurements = selectedDeviceType?.measurements || [];
  const templates = selectedDeviceType?.widgetTemplates || [];
  const selectedTemplate = templates.find((t) => t.id === templateId);
  const hasTemplates = templates.length > 0;

  const selectedMeasurement = measurements.find((m) => m.id === measurementId);

  // Get available widget types for selected measurement
  const availableWidgetTypes: WidgetType[] = selectedMeasurement
    ? (Object.entries(selectedMeasurement.widgets)
        .filter(([_, config]) => config.enabled)
        .map(([type, _]) => type) as WidgetType[])
    : ['current-value', 'time-series', 'gauge', 'status'];

  // Reorder section handlers
  const moveSection = (measurementId: string, direction: 'up' | 'down') => {
    const currentIndex = sectionOrder.indexOf(measurementId);
    if (currentIndex === -1) return;

    const newOrder = [...sectionOrder];
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= newOrder.length) return;

    // Swap positions
    [newOrder[currentIndex], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[currentIndex]];
    setSectionOrder(newOrder);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!devEui || !deviceType) {
      alert('Please select a device and device type');
      return;
    }

    let widget: WidgetInstance;

    if (widgetMode === 'template') {
      // Template-based widget
      if (!templateId) {
        alert('Please select a template');
        return;
      }

      // Build final sectionOverrides with Y-axis values and formulas
      const finalSectionOverrides = { ...sectionOverrides };

      Object.entries(sectionYAxis).forEach(([mId, yAxis]) => {
        if (yAxis.min !== '' || yAxis.max !== '') {
          if (!finalSectionOverrides[mId]) {
            finalSectionOverrides[mId] = {};
          }
          if (yAxis.min !== '') {
            finalSectionOverrides[mId].customYAxisMin = Number(yAxis.min);
          }
          if (yAxis.max !== '') {
            finalSectionOverrides[mId].customYAxisMax = Number(yAxis.max);
          }
        }
      });

      // Add formulas to sectionOverrides
      Object.entries(sectionFormula).forEach(([mId, formula]) => {
        if (formula && formula.trim() !== '') {
          if (!finalSectionOverrides[mId]) {
            finalSectionOverrides[mId] = {};
          }
          finalSectionOverrides[mId].customFormula = formula.trim();
        }
      });

      widget = {
        id: editWidget ? editWidget.id : uuidv4(),
        devEui,
        deviceType,
        templateId,
        sectionOverrides: Object.keys(finalSectionOverrides).length > 0 ? finalSectionOverrides : undefined,
        sectionOrder: sectionOrder.length > 0 ? sectionOrder : undefined,
        title: title || undefined,
        conversion: conversionEnabled ? { enabled: true, convertTo } : undefined,
        // customYAxisMin/Max removed for template widgets (per-measurement values in sectionOverrides)
      };
    } else {
      // Individual measurement widget (legacy)
      if (!measurementId || !widgetType) {
        alert('Please select a measurement and widget type');
        return;
      }

      // Build config with thresholds for current-value widgets
      const config = widgetType === 'current-value' && thresholds.length > 0
        ? {
            widgets: {
              'current-value': {
                enabled: true,
                thresholds,
              },
            },
          }
        : undefined;

      widget = {
        id: editWidget ? editWidget.id : uuidv4(),
        devEui,
        deviceType,
        measurementId,
        widgetType,
        title: title || undefined,
        conversion: conversionEnabled ? { enabled: true, convertTo } : undefined,
        customYAxisMin: customYAxisMin !== '' ? Number(customYAxisMin) : undefined,
        customYAxisMax: customYAxisMax !== '' ? Number(customYAxisMax) : undefined,
        config: config as any,
      };
    }

    onSave(widget);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editWidget ? 'Edit Widget' : 'Add Widget'}</h2>
          <button onClick={onClose} className="modal-close-btn">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          {/* Device Selection */}
          <div className="form-group">
            <label htmlFor="device">
              Device <span className="required">*</span>
            </label>
            <select
              id="device"
              className="form-control"
              value={devEui}
              onChange={(e) => setDevEui(e.target.value)}
              required
            >
              <option value="">-- Select a device --</option>
              {devicesData?.devices.map((device) => (
                <option key={device.dev_eui} value={device.dev_eui}>
                  {device.device_name || device.dev_eui} ({device.dev_eui})
                </option>
              ))}
            </select>
          </div>

          {/* Device Type Selection */}
          <div className="form-group">
            <label htmlFor="device-type">
              Device Type <span className="required">*</span>
            </label>
            <select
              id="device-type"
              className="form-control"
              value={deviceType}
              onChange={(e) => {
                setDeviceType(e.target.value);
                setMeasurementId(''); // Reset measurement when device type changes
              }}
              required
            >
              <option value="">-- Select device type --</option>
              {deviceTypes.map((dt) => (
                <option key={dt.deviceType} value={dt.deviceType}>
                  {dt.name}
                </option>
              ))}
            </select>
          </div>

          {/* Widget Mode Selection */}
          {deviceType && hasTemplates && (
            <div className="form-group">
              <label>Widget Mode</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="widgetMode"
                    value="template"
                    checked={widgetMode === 'template'}
                    onChange={(e) => setWidgetMode(e.target.value as 'template' | 'individual')}
                  />
                  <span>Template-based (Multiple Measurements)</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="widgetMode"
                    value="individual"
                    checked={widgetMode === 'individual'}
                    onChange={(e) => setWidgetMode(e.target.value as 'template' | 'individual')}
                  />
                  <span>Individual Measurement</span>
                </label>
              </div>
            </div>
          )}

          {/* Template Selection */}
          {deviceType && widgetMode === 'template' && hasTemplates && (
            <div className="form-group">
              <label htmlFor="template">
                Template <span className="required">*</span>
              </label>
              <select
                id="template"
                className="form-control"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
              >
                <option value="">-- Select template --</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {selectedTemplate?.description && (
                <div className="help-text">{selectedTemplate.description}</div>
              )}
            </div>
          )}

          {/* Template Customization */}
          {deviceType && widgetMode === 'template' && selectedTemplate && sectionOrder.length > 0 && (
            <div className="template-customization">
              <h4>Customize Template</h4>
              {sectionOrder.map((mId, index) => {
                const measurement = measurements.find((m) => m.id === mId);
                if (!measurement) return null;

                // Find the original section to get displayTypes
                const originalSection = selectedTemplate.sections.find((s) => {
                  const sectionMeasurementId = Array.isArray(s.measurementId)
                    ? s.measurementId[0]
                    : s.measurementId;
                  return sectionMeasurementId === mId;
                });
                if (!originalSection) return null;

                const override = sectionOverrides[mId] || {};
                const displayTypes = override.displayTypes || originalSection.displayTypes;
                const isHidden = override.hidden || false;

                return (
                  <div key={mId} className="template-section-config">
                    <div className="section-header">
                      <div className="section-reorder-buttons">
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => moveSection(mId, 'up')}
                          disabled={index === 0}
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => moveSection(mId, 'down')}
                          disabled={index === sectionOrder.length - 1}
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={!isHidden}
                          onChange={(e) => {
                            setSectionOverrides({
                              ...sectionOverrides,
                              [mId]: {
                                ...override,
                                hidden: !e.target.checked,
                              },
                            });
                          }}
                        />
                        <span>{measurement.name}</span>
                      </label>
                    </div>
                    {!isHidden && (
                      <>
                        <div className="display-types">
                          {(['current-value', 'time-series', 'gauge', 'status'] as WidgetType[]).map(
                            (type) => {
                              const config = measurement.widgets[type];
                              if (!config?.enabled) return null;

                              return (
                                <label key={type} className="checkbox-label small">
                                  <input
                                    type="checkbox"
                                    checked={displayTypes.includes(type)}
                                    onChange={(e) => {
                                      let newDisplayTypes: WidgetType[];
                                      if (e.target.checked) {
                                        newDisplayTypes = [...displayTypes, type];
                                      } else {
                                        newDisplayTypes = displayTypes.filter((t) => t !== type);
                                      }
                                      setSectionOverrides({
                                        ...sectionOverrides,
                                        [mId]: {
                                          ...override,
                                          displayTypes: newDisplayTypes,
                                        },
                                      });
                                    }}
                                  />
                                  <span>
                                    {type
                                      .split('-')
                                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                                      .join(' ')}
                                  </span>
                                </label>
                              );
                            }
                          )}
                        </div>

                        {/* Formula Field */}
                        {measurement.valueType !== 'string' && (
                          <div className="section-formula-control">
                            <label>Formula (optional):</label>
                            <input
                              type="text"
                              placeholder="e.g., value * 1.8 + 32"
                              value={sectionFormula[mId] || ''}
                              onChange={(e) => {
                                setSectionFormula({
                                  ...sectionFormula,
                                  [mId]: e.target.value,
                                });
                              }}
                              className="form-control"
                            />
                            <p className="form-help">
                              Transform values using a formula. Use "value" as the variable.
                            </p>
                          </div>
                        )}

                        {/* Y-Axis Range Controls */}
                        {displayTypes.includes('time-series') && (
                          <div className="section-y-axis-controls">
                            <h5>Y-Axis Range</h5>
                            <div className="y-axis-inputs">
                              <div className="form-group-inline">
                                <label>Min:</label>
                                <input
                                  type="number"
                                  placeholder="Auto"
                                  value={sectionYAxis[mId]?.min || ''}
                                  onChange={(e) => {
                                    setSectionYAxis({
                                      ...sectionYAxis,
                                      [mId]: {
                                        ...sectionYAxis[mId],
                                        min: e.target.value,
                                      },
                                    });
                                  }}
                                  step="any"
                                />
                              </div>
                              <div className="form-group-inline">
                                <label>Max:</label>
                                <input
                                  type="number"
                                  placeholder="Auto"
                                  value={sectionYAxis[mId]?.max || ''}
                                  onChange={(e) => {
                                    setSectionYAxis({
                                      ...sectionYAxis,
                                      [mId]: {
                                        ...sectionYAxis[mId],
                                        max: e.target.value,
                                      },
                                    });
                                  }}
                                  step="any"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Measurement Selection (Individual Mode) */}
          {deviceType && widgetMode === 'individual' && (
            <div className="form-group">
              <label htmlFor="measurement">
                Measurement <span className="required">*</span>
              </label>
              <select
                id="measurement"
                className="form-control"
                value={measurementId}
                onChange={(e) => {
                  setMeasurementId(e.target.value);
                  // Auto-select default widget type for this measurement
                  const m = measurements.find((m) => m.id === e.target.value);
                  if (m) {
                    setWidgetType(m.defaultWidget);
                  }
                }}
                required
              >
                <option value="">-- Select measurement --</option>
                {measurements.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Widget Type Selection (Individual Mode) */}
          {widgetMode === 'individual' && measurementId && (
            <div className="form-group">
              <label htmlFor="widget-type">
                Widget Type <span className="required">*</span>
              </label>
              <select
                id="widget-type"
                className="form-control"
                value={widgetType}
                onChange={(e) => setWidgetType(e.target.value as WidgetType)}
                required
              >
                {availableWidgetTypes.map((type) => (
                  <option key={type} value={type}>
                    {type
                      .split('-')
                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Threshold Configuration (Current Value Widgets Only) */}
          {widgetMode === 'individual' && widgetType === 'current-value' && (
            <div className="form-group">
              <label>Color Thresholds (optional)</label>
              <div className="help-text" style={{ marginBottom: '10px' }}>
                Configure color-coded thresholds based on measurement values
              </div>

              {thresholds.map((threshold, index) => (
                <div key={index} style={{
                  display: 'grid',
                  gridTemplateColumns: '100px 120px 80px 1fr 40px',
                  gap: '8px',
                  marginBottom: '8px',
                  alignItems: 'center',
                  padding: '8px',
                  background: '#f9fafb',
                  borderRadius: '4px'
                }}>
                  <select
                    className="form-control"
                    value={threshold.operator}
                    onChange={(e) => {
                      const newThresholds = [...thresholds];
                      newThresholds[index] = { ...threshold, operator: e.target.value as ThresholdOperator };
                      setThresholds(newThresholds);
                    }}
                  >
                    <option value="<">{'<'} Less than</option>
                    <option value="<=">{'<='} Less or equal</option>
                    <option value=">">{'>'} Greater than</option>
                    <option value=">=">{'>='} Greater or equal</option>
                    <option value="=">= Equal to</option>
                    <option value="between">Between</option>
                  </select>

                  {threshold.operator === 'between' ? (
                    <>
                      <input
                        type="number"
                        className="form-control"
                        placeholder="Min"
                        value={threshold.min ?? ''}
                        onChange={(e) => {
                          const newThresholds = [...thresholds];
                          newThresholds[index] = { ...threshold, min: e.target.value ? Number(e.target.value) : undefined };
                          setThresholds(newThresholds);
                        }}
                        step="any"
                      />
                      <input
                        type="number"
                        className="form-control"
                        placeholder="Max"
                        value={threshold.max ?? ''}
                        onChange={(e) => {
                          const newThresholds = [...thresholds];
                          newThresholds[index] = { ...threshold, max: e.target.value ? Number(e.target.value) : undefined };
                          setThresholds(newThresholds);
                        }}
                        step="any"
                        style={{ gridColumn: '3' }}
                      />
                    </>
                  ) : (
                    <input
                      type="number"
                      className="form-control"
                      placeholder="Value"
                      value={threshold.value ?? ''}
                      onChange={(e) => {
                        const newThresholds = [...thresholds];
                        newThresholds[index] = { ...threshold, value: e.target.value ? Number(e.target.value) : undefined };
                        setThresholds(newThresholds);
                      }}
                      step="any"
                      style={{ gridColumn: '2 / 4' }}
                    />
                  )}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={threshold.color}
                      onChange={(e) => {
                        const newThresholds = [...thresholds];
                        newThresholds[index] = { ...threshold, color: e.target.value };
                        setThresholds(newThresholds);
                      }}
                      style={{ width: '40px', height: '32px', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Label (e.g., Low)"
                      value={threshold.label}
                      onChange={(e) => {
                        const newThresholds = [...thresholds];
                        newThresholds[index] = { ...threshold, label: e.target.value };
                        setThresholds(newThresholds);
                      }}
                      style={{ minWidth: '120px' }}
                    />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Custom label (optional)"
                      value={threshold.customLabel ?? ''}
                      onChange={(e) => {
                        const newThresholds = [...thresholds];
                        newThresholds[index] = { ...threshold, customLabel: e.target.value || undefined };
                        setThresholds(newThresholds);
                      }}
                      style={{ minWidth: '150px' }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const newThresholds = thresholds.filter((_, i) => i !== index);
                      setThresholds(newThresholds);
                    }}
                    style={{
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  setThresholds([
                    ...thresholds,
                    { operator: '<', value: 0, color: '#6b7280', label: 'Threshold' }
                  ]);
                }}
                style={{
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  marginTop: '8px'
                }}
              >
                + Add Threshold
              </button>
            </div>
          )}

          {/* Custom Title */}
          <div className="form-group">
            <label htmlFor="title">Custom Title (optional)</label>
            <input
              type="text"
              id="title"
              className="form-control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave empty to use measurement name"
            />
          </div>

          {/* Advanced Settings for Template Mode */}
          {widgetMode === 'template' && selectedTemplate && (() => {
            const hasTemperature = measurements.some((m) => m.unit === '°C');
            const hasTimeSeries = selectedTemplate.sections.some((s) =>
              s.displayTypes.includes('time-series')
            );
            return hasTemperature || hasTimeSeries;
          })() && (
            <div className="advanced-settings">
              <div
                className="advanced-settings-header"
                onClick={() => setAdvancedSettingsExpanded(!advancedSettingsExpanded)}
              >
                <h3>Advanced Settings</h3>
                <span className="toggle-icon">{advancedSettingsExpanded ? '▼' : '▶'}</span>
              </div>

              {advancedSettingsExpanded && (
                <div className="advanced-settings-content">
                  {/* Temperature Conversion */}
                  {measurements.some((m) => m.unit === '°C') && (
                    <>
                      <div className="form-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={conversionEnabled}
                            onChange={(e) => setConversionEnabled(e.target.checked)}
                          />
                          <span>Enable Temperature Conversion</span>
                        </label>
                        <div className="help-text">
                          Applies to all temperature measurements in this widget
                        </div>
                      </div>

                      {conversionEnabled && (
                        <div className="form-group">
                          <label htmlFor="convert-to">Convert To</label>
                          <select
                            id="convert-to"
                            className="form-control"
                            value={convertTo}
                            onChange={(e) => setConvertTo(e.target.value as 'fahrenheit' | 'kelvin')}
                          >
                            <option value="fahrenheit">Fahrenheit (°F)</option>
                            <option value="kelvin">Kelvin (K)</option>
                          </select>
                        </div>
                      )}
                    </>
                  )}

                  {/* Chart Y-Axis Range */}
                  {selectedTemplate.sections.some((s) => s.displayTypes.includes('time-series')) && (
                    <>
                      <div className="form-group">
                        <label htmlFor="custom-y-min">Custom Y-Axis Minimum (optional)</label>
                        <input
                          type="number"
                          id="custom-y-min"
                          className="form-control"
                          value={customYAxisMin}
                          onChange={(e) => setCustomYAxisMin(e.target.value)}
                          placeholder="Leave empty for auto"
                          step="any"
                        />
                        <div className="help-text">
                          Applies to all time series charts in this widget
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="custom-y-max">Custom Y-Axis Maximum (optional)</label>
                        <input
                          type="number"
                          id="custom-y-max"
                          className="form-control"
                          value={customYAxisMax}
                          onChange={(e) => setCustomYAxisMax(e.target.value)}
                          placeholder="Leave empty for auto"
                          step="any"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Advanced Settings for Individual Mode */}
          {widgetMode === 'individual' && selectedMeasurement && (selectedMeasurement.unit === '°C' || widgetType === 'time-series') && (
            <div className="advanced-settings">
              <div
                className="advanced-settings-header"
                onClick={() => setAdvancedSettingsExpanded(!advancedSettingsExpanded)}
              >
                <h3>Advanced Settings</h3>
                <span className="toggle-icon">{advancedSettingsExpanded ? '▼' : '▶'}</span>
              </div>

              {advancedSettingsExpanded && (
                <div className="advanced-settings-content">
                  {/* Temperature Conversion */}
                  {selectedMeasurement.unit === '°C' && (
                <>
                  <div className="form-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={conversionEnabled}
                        onChange={(e) => setConversionEnabled(e.target.checked)}
                      />
                      <span>Enable Temperature Conversion</span>
                    </label>
                  </div>

                  {conversionEnabled && (
                    <div className="form-group">
                      <label htmlFor="convert-to">Convert To</label>
                      <select
                        id="convert-to"
                        className="form-control"
                        value={convertTo}
                        onChange={(e) => setConvertTo(e.target.value as 'fahrenheit' | 'kelvin')}
                      >
                        <option value="fahrenheit">Fahrenheit (°F)</option>
                        <option value="kelvin">Kelvin (K)</option>
                      </select>
                    </div>
                  )}
                </>
              )}

              {/* Chart Y-Axis Range */}
              {widgetType === 'time-series' && (
                <>
                  <div className="form-group">
                    <label htmlFor="custom-y-min">Custom Y-Axis Minimum (optional)</label>
                    <input
                      type="number"
                      id="custom-y-min"
                      className="form-control"
                      value={customYAxisMin}
                      onChange={(e) => setCustomYAxisMin(e.target.value)}
                      placeholder="Leave empty for auto"
                      step="any"
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="custom-y-max">Custom Y-Axis Maximum (optional)</label>
                    <input
                      type="number"
                      id="custom-y-max"
                      className="form-control"
                      value={customYAxisMax}
                      onChange={(e) => setCustomYAxisMax(e.target.value)}
                      placeholder="Leave empty for auto"
                      step="any"
                    />
                  </div>
                </>
              )}
                </div>
              )}
            </div>
          )}

          {/* Measurement Info */}
          {selectedMeasurement && (
            <div className="measurement-info">
              <strong>Measurement Details:</strong>
              <div>Path: {selectedMeasurement.path}</div>
              <div>
                Unit: {selectedMeasurement.unit} | Decimals: {selectedMeasurement.decimals}
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editWidget ? 'Update Widget' : 'Add Widget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
