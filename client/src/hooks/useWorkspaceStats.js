import { useCallback } from 'react';
import client from '../api/client.js';
import { useCachedFetch } from '../context/CacheContext.jsx';

const EMPTY = {
  todayCalls: 0,
  connected: 0,
  notConnected: 0,
  busy: 0,
  avgTalkTimeSec: 0,
  p1CreatedToday: 0,
};

export function useWorkspaceStats(intervalMs = 30000, enabled = true) {
  const fetcher = useCallback(async () => {
    const { data } = await client.get('/activity/workspace-stats');
    return { ...EMPTY, ...(data.data ?? {}) };
  }, []);

  const { data, error, loading, refetch } = useCachedFetch('agent-workspace-stats', fetcher, {
    enabled,
    refetchInterval: intervalMs,
  });

  return { stats: data ?? EMPTY, loading, error, refresh: refetch };
}
