import { useCallback } from 'react';
import { fetchWorkQueue, WORKQUEUE_EMPTY } from '../api/workqueue.js';
import { useCachedFetch } from '../context/CacheContext.jsx';

export function useWorkQueue(intervalMs = 30000, enabled = true) {
  const fetcher = useCallback(() => fetchWorkQueue(), []);

  const { data, error, loading, refetch } = useCachedFetch('agent-workqueue', fetcher, {
    enabled,
    refetchInterval: intervalMs,
  });

  return { queue: data ?? WORKQUEUE_EMPTY, loading, error, refresh: refetch };
}
