import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type {
  WidgetInstance,
  WidgetTemplate,
  DeviceTypeDefinition,
  WidgetData,
} from '../types/widgets';
import { executeQuery } from '../api/endpoints';
import { processWidgetData } from '../utils/widgetDataProcessor';

interface CompositeWidgetDataResult {
  measurementData: Array<{ measurementId: string; data: WidgetData }> | null;
  isLoading: boolean;
  error: Error | null;
}

export const useCompositeWidgetData = (
  widget: WidgetInstance,
  template: WidgetTemplate | undefined,
  deviceType: DeviceTypeDefinition | undefined,
  timeRange: string,
  refreshInterval?: number
): CompositeWidgetDataResult => {
  // Fetch all uplink data once for the device (only if we have template and deviceType)
  const enabled = !!template && !!deviceType;

  const {
    data: queryResult,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['composite-widget-data', widget.devEui, timeRange, widget.id],
    queryFn: () =>
      executeQuery({
        query: `SELECT uplink FROM device '${widget.devEui}' WHERE LAST '${timeRange}'`,
      }),
    enabled,
    refetchInterval: refreshInterval ? refreshInterval * 1000 : false,
    staleTime: refreshInterval ? refreshInterval * 1000 : 30000,
  });

  // Process data for each measurement in the template
  const measurementData = useMemo(() => {
    if (!template || !deviceType) return null;
    if (!queryResult?.frames) return null;

    // Collect all unique measurement IDs from template sections
    const measurementIds = new Set<string>();
    template.sections.forEach((section) => {
      if (Array.isArray(section.measurementId)) {
        section.measurementId.forEach((id) => measurementIds.add(id));
      } else {
        measurementIds.add(section.measurementId);
      }
    });

    // Process data for each measurement
    return Array.from(measurementIds).map((measurementId) => {
      const measurement = deviceType.measurements.find((m) => m.id === measurementId);

      if (!measurement) {
        return {
          measurementId,
          data: {
            widgetId: widget.id,
            error: `Measurement not found: ${measurementId}`,
          } as WidgetData,
        };
      }

      // Process the widget data using existing utility
      const data = processWidgetData(
        queryResult.frames,
        {
          ...widget,
          measurementId,
          widgetType: 'time-series', // Use time-series to get both current value and series
        },
        measurement
      );

      return {
        measurementId,
        data: data || {
          widgetId: widget.id,
          error: 'No data available',
        } as WidgetData,
      };
    });
  }, [queryResult, template, deviceType, widget]);

  return {
    measurementData,
    isLoading,
    error: error as Error | null,
  };
};
