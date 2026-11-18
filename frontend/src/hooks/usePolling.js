import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reusable polling hook for live telemetry updates (default every 2.5s).
 * Safely avoids overlapping requests and surfaces errors clearly without hiding them.
 */
export function usePolling(fetcher, intervalMs = 2500, enabled = true, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const execute = useCallback(async (isInitial = false) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (isInitial) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (mountedRef.current) {
        setData(result);
        setError(null);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || 'Failed to fetch data.');
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    execute(true);
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!enabled || !intervalMs || intervalMs < 500) return undefined;
    const id = setInterval(() => {
      execute(false);
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, execute]);

  return {
    data,
    loading,
    error,
    lastUpdated,
    refresh: () => execute(false),
  };
}

