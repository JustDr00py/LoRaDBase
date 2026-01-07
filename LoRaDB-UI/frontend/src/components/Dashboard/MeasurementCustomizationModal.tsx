import React, { useState, useEffect } from 'react';
import type {
  MeasurementDefinition,
  WidgetType,
  Threshold,
  ThresholdOperator,
  StatusCondition,
  StatusLevel,
  ConditionOperator,
  GaugeZone,
} from '../../types/widgets';

interface MeasurementCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (overrides: {
    customColor?: string;
    customThresholds?: Threshold[];
    customStatusConditions?: StatusCondition[];
    customGaugeZones?: GaugeZone[];
  }) => void;
  measurement: MeasurementDefinition;
  widgetType: WidgetType;
  currentOverrides?: {
    customColor?: string;
    customThresholds?: Threshold[];
    customStatusConditions?: StatusCondition[];
    customGaugeZones?: GaugeZone[];
  };
}

export const MeasurementCustomizationModal: React.FC<MeasurementCustomizationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  measurement,
  widgetType,
  currentOverrides,
}) => {
  const [customColor, setCustomColor] = useState<string>('');
  const [thresholds, setThresholds] = useState<Threshold[]>([]);
  const [statusConditions, setStatusConditions] = useState<StatusCondition[]>([]);
  const [gaugeZones, setGaugeZones] = useState<GaugeZone[]>([]);

  // Initialize state from current overrides or measurement defaults
  useEffect(() => {
    if (!isOpen) return;

    // Color (for time-series and gauge)
    if (widgetType === 'time-series') {
      setCustomColor(
        currentOverrides?.customColor || measurement.widgets['time-series']?.color || '#2563eb'
      );
    }

    // Thresholds (for current-value)
    if (widgetType === 'current-value') {
      setThresholds(
        currentOverrides?.customThresholds ||
          measurement.widgets['current-value']?.thresholds ||
          []
      );
    }

    // Status conditions (for status)
    if (widgetType === 'status') {
      setStatusConditions(
        currentOverrides?.customStatusConditions ||
          measurement.widgets.status?.conditions ||
          []
      );
    }

    // Gauge zones (for gauge)
    if (widgetType === 'gauge') {
      setGaugeZones(
        currentOverrides?.customGaugeZones || measurement.widgets.gauge?.zones || []
      );
    }
  }, [isOpen, measurement, widgetType, currentOverrides]);

  const handleSave = () => {
    const overrides: {
      customColor?: string;
      customThresholds?: Threshold[];
      customStatusConditions?: StatusCondition[];
      customGaugeZones?: GaugeZone[];
    } = {};

    if (widgetType === 'time-series' && customColor) {
      overrides.customColor = customColor;
    }

    if (widgetType === 'current-value' && thresholds.length > 0) {
      overrides.customThresholds = thresholds;
    }

    if (widgetType === 'status' && statusConditions.length > 0) {
      overrides.customStatusConditions = statusConditions;
    }

    if (widgetType === 'gauge' && gaugeZones.length > 0) {
      overrides.customGaugeZones = gaugeZones;
    }

    onSave(overrides);
    onClose();
  };

  // Threshold handlers
  const addThreshold = () => {
    setThresholds([
      ...thresholds,
      {
        operator: '>',
        value: 0,
        color: '#22c55e',
        label: 'Normal',
      },
    ]);
  };

  const updateThreshold = (index: number, updates: Partial<Threshold>) => {
    const newThresholds = [...thresholds];
    newThresholds[index] = { ...newThresholds[index], ...updates };
    setThresholds(newThresholds);
  };

  const removeThreshold = (index: number) => {
    setThresholds(thresholds.filter((_, i) => i !== index));
  };

  // Status condition handlers
  const addStatusCondition = () => {
    const valueType = measurement.valueType || 'number';

    if (valueType === 'string') {
      setStatusConditions([
        ...statusConditions,
        {
          valueType: 'string',
          operator: 'eq',
          value: '',
          status: 'info',
          label: 'Status',
        },
      ]);
    } else {
      setStatusConditions([
        ...statusConditions,
        {
          valueType: 'number',
          operator: 'gt',
          value: 0,
          status: 'success',
          label: 'Normal',
        },
      ]);
    }
  };

  const updateStatusCondition = (index: number, updates: Partial<StatusCondition>) => {
    const newConditions = [...statusConditions];
    newConditions[index] = { ...newConditions[index], ...updates } as StatusCondition;
    setStatusConditions(newConditions);
  };

  const removeStatusCondition = (index: number) => {
    setStatusConditions(statusConditions.filter((_, i) => i !== index));
  };

  // Gauge zone handlers
  const addGaugeZone = () => {
    setGaugeZones([
      ...gaugeZones,
      {
        from: 0,
        to: 100,
        color: '#22c55e',
      },
    ]);
  };

  const updateGaugeZone = (index: number, updates: Partial<GaugeZone>) => {
    const newZones = [...gaugeZones];
    newZones[index] = { ...newZones[index], ...updates };
    setGaugeZones(newZones);
  };

  const removeGaugeZone = (index: number) => {
    setGaugeZones(gaugeZones.filter((_, i) => i !== index));
  };

  if (!isOpen) return null;

  const valueType = measurement.valueType || 'number';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content measurement-customization-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Customize {measurement.name}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="customization-info">
            <p>
              <strong>Widget Type:</strong> {widgetType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
            </p>
          </div>

          {/* Time Series Color */}
          {widgetType === 'time-series' && (
            <div className="form-section">
              <h3>Line Color</h3>
              <div className="form-group">
                <label>Color:</label>
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="color-input"
                />
                <span className="color-preview" style={{ backgroundColor: customColor }}>
                  {customColor}
                </span>
              </div>
            </div>
          )}

          {/* Current Value Thresholds */}
          {widgetType === 'current-value' && valueType === 'number' && (
            <div className="form-section">
              <h3>Thresholds</h3>
              <p className="form-help">
                Define color-coded thresholds based on the value. First matching condition wins.
              </p>

              {thresholds.map((threshold, index) => (
                <div key={index} className="threshold-config">
                  <div className="threshold-row">
                    <select
                      value={threshold.operator}
                      onChange={(e) =>
                        updateThreshold(index, { operator: e.target.value as ThresholdOperator })
                      }
                    >
                      <option value="<">Less than (&lt;)</option>
                      <option value="<=">Less than or equal (&lt;=)</option>
                      <option value=">">Greater than (&gt;)</option>
                      <option value=">=">Greater than or equal (&gt;=)</option>
                      <option value="=">Equal (=)</option>
                      <option value="between">Between</option>
                    </select>

                    {threshold.operator !== 'between' ? (
                      <input
                        type="number"
                        placeholder="Value"
                        value={threshold.value ?? ''}
                        onChange={(e) =>
                          updateThreshold(index, {
                            value: e.target.value ? parseFloat(e.target.value) : undefined,
                          })
                        }
                      />
                    ) : (
                      <>
                        <input
                          type="number"
                          placeholder="Min"
                          value={threshold.min ?? ''}
                          onChange={(e) =>
                            updateThreshold(index, {
                              min: e.target.value ? parseFloat(e.target.value) : undefined,
                            })
                          }
                        />
                        <input
                          type="number"
                          placeholder="Max"
                          value={threshold.max ?? ''}
                          onChange={(e) =>
                            updateThreshold(index, {
                              max: e.target.value ? parseFloat(e.target.value) : undefined,
                            })
                          }
                        />
                      </>
                    )}

                    <input
                      type="color"
                      value={threshold.color}
                      onChange={(e) => updateThreshold(index, { color: e.target.value })}
                      className="color-input"
                    />

                    <input
                      type="text"
                      placeholder="Label"
                      value={threshold.customLabel || threshold.label}
                      onChange={(e) => updateThreshold(index, { customLabel: e.target.value })}
                    />

                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeThreshold(index)}
                      title="Remove threshold"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              <button type="button" className="btn btn-secondary" onClick={addThreshold}>
                + Add Threshold
              </button>
            </div>
          )}

          {/* Status Conditions */}
          {widgetType === 'status' && (
            <div className="form-section">
              <h3>Status Conditions</h3>
              <p className="form-help">
                Define status badges based on the value. First matching condition wins.
              </p>

              {statusConditions.map((condition, index) => (
                <div key={index} className="status-condition-config">
                  <div className="status-row">
                    {valueType === 'number' && 'operator' in condition && (
                      <>
                        <select
                          value={condition.operator}
                          onChange={(e) =>
                            updateStatusCondition(index, {
                              operator: e.target.value as ConditionOperator,
                            })
                          }
                        >
                          <option value="<">Less than (&lt;)</option>
                          <option value="<=">Less than or equal (&lt;=)</option>
                          <option value=">">Greater than (&gt;)</option>
                          <option value=">=">Greater than or equal (&gt;=)</option>
                          <option value="=">Equal (=)</option>
                          <option value="eq">Equal (eq)</option>
                          <option value="between">Between</option>
                        </select>

                        {condition.operator !== 'between' ? (
                          <input
                            type="number"
                            placeholder="Value"
                            value={condition.value ?? ''}
                            onChange={(e) =>
                              updateStatusCondition(index, {
                                value: e.target.value ? parseFloat(e.target.value) : undefined,
                              })
                            }
                          />
                        ) : (
                          <>
                            <input
                              type="number"
                              placeholder="Min"
                              value={condition.min ?? ''}
                              onChange={(e) =>
                                updateStatusCondition(index, {
                                  min: e.target.value ? parseFloat(e.target.value) : undefined,
                                })
                              }
                            />
                            <input
                              type="number"
                              placeholder="Max"
                              value={condition.max ?? ''}
                              onChange={(e) =>
                                updateStatusCondition(index, {
                                  max: e.target.value ? parseFloat(e.target.value) : undefined,
                                })
                              }
                            />
                          </>
                        )}
                      </>
                    )}

                    {valueType === 'string' && condition.valueType === 'string' && (
                      <input
                        type="text"
                        placeholder="String value"
                        value={condition.value}
                        onChange={(e) =>
                          updateStatusCondition(index, { value: e.target.value })
                        }
                      />
                    )}

                    <select
                      value={condition.status}
                      onChange={(e) =>
                        updateStatusCondition(index, { status: e.target.value as StatusLevel })
                      }
                    >
                      <option value="success">Success</option>
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                      <option value="info">Info</option>
                    </select>

                    <input
                      type="text"
                      placeholder="Label"
                      value={condition.label}
                      onChange={(e) => updateStatusCondition(index, { label: e.target.value })}
                    />

                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeStatusCondition(index)}
                      title="Remove condition"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              <button type="button" className="btn btn-secondary" onClick={addStatusCondition}>
                + Add Condition
              </button>
            </div>
          )}

          {/* Gauge Zones */}
          {widgetType === 'gauge' && (
            <div className="form-section">
              <h3>Gauge Zones</h3>
              <p className="form-help">Define color zones for the gauge.</p>

              {gaugeZones.map((zone, index) => (
                <div key={index} className="gauge-zone-config">
                  <div className="zone-row">
                    <input
                      type="number"
                      placeholder="From"
                      value={zone.from}
                      onChange={(e) =>
                        updateGaugeZone(index, {
                          from: e.target.value ? parseFloat(e.target.value) : 0,
                        })
                      }
                    />
                    <input
                      type="number"
                      placeholder="To"
                      value={zone.to}
                      onChange={(e) =>
                        updateGaugeZone(index, {
                          to: e.target.value ? parseFloat(e.target.value) : 0,
                        })
                      }
                    />
                    <input
                      type="color"
                      value={zone.color}
                      onChange={(e) => updateGaugeZone(index, { color: e.target.value })}
                      className="color-input"
                    />
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeGaugeZone(index)}
                      title="Remove zone"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              <button type="button" className="btn btn-secondary" onClick={addGaugeZone}>
                + Add Zone
              </button>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Customization
          </button>
        </div>
      </div>
    </div>
  );
};
