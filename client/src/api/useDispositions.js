/**
 * useDispositions
 *
 * Fetches master disposition list and interest levels from the API.
 * Both are cached globally — they are static reference data and should
 * not be re-fetched on every component mount.
 *
 * Returns:
 *   dispositions   — [{ id, name, label, requiresCallback, priority, type }]
 *   interestLevels — [{ code, label, description }]
 *   loading        — true while either request is in flight
 *   error          — string | null
 */
import { useCallback } from 'react';
import client from './client.js';
import { useCachedFetch } from '../context/CacheContext.jsx';

export function useDispositions() {
  const fetcher = useCallback(async () => {
    const [dispRes, intRes] = await Promise.all([
      client.get('/dispositions'),
      client.get('/dispositions/interest-levels'),
    ]);
    return {
      dispositions: dispRes.data.data ?? [],
      interestLevels: intRes.data.data ?? [],
    };
  }, []);

  const { data, error, loading } = useCachedFetch('lookups-dispositions', fetcher, {
    staleTime: 300_000, // 5 minutes — dispositions rarely change
  });

  return {
    dispositions: data?.dispositions ?? [],
    interestLevels: data?.interestLevels ?? [],
    loading,
    error,
  };
}
