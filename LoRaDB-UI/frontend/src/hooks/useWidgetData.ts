import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WidgetInstance, MeasurementDefinition, WidgetData } from '../types/widgets';
import { executeQuery } from '../api/endpoints';
import { processWidgetData } from '../utils/widgetDataProcessor';

/**
 * Hook to fetch and process data for a widget
 */
export function useWidgetData(
  widget: WidgetInstance,
  measurement: MeasurementDefinition | undefined,
  timeRange: string,
  refreshInterval?: number
) {
  // Fetch data from LoRaDB
  const { data: queryResult, isLoading, error, refetch } = useQuery({
    queryKey: ['widget-data', widget.devEui, timeRange],
    queryFn: () =>
      executeQuery({
        query: `SELECT uplink FROM device '${widget.devEui}' WHERE LAST '${timeRange}'`,
      }),
    enabled: !!widget.devEui && !!measurement,
    staleTime: 30000, // 30 seconds
    refetchInterval: refreshInterval ? refreshInterval * 1000 : false,
  });

  // Process data with useMemo
  const widgetData: WidgetData | null = useMemo(() => {
    if (!queryResult?.frames || !measurement) {
      return null;
    }

    return processWidgetData(queryResult.frames, widget, measurement);
  }, [queryResult, widget, measurement]);

  return {
    data: widgetData,
    isLoading,
    error,
    refetch,
  };
}
