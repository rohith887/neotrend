import { useCallback, useMemo } from 'react';
import { useCachedFetch } from '../context/CacheContext.jsx';
import {
  fetchShortlist,
  addToShortlist,
  updateShortlistEntry,
  removeFromShortlist,
  confirmShortlist,
} from '../api/shortlist.js';

/**
 * useShortlist — shared data access for the student's university shortlist.
 *
 * One cached request per student (key `shortlist-${leadId}`); inflight
 * requests are de-duplicated by CacheContext so React StrictMode double
 * mounts don't hit the API twice. Mutations return the fresh entry (and,
 * where relevant, an updated lead) and refresh the shared cache.
 */
export function useShortlist(leadId) {
  const fetcher = useCallback(async () => {
    if (!leadId) return [];
    return fetchShortlist(leadId);
  }, [leadId]);

  const { data: entries = [], loading, error, refetch } = useCachedFetch(
    `shortlist-${leadId}`,
    fetcher,
    { staleTime: 30_000 }
  );

  // membership map: universityId -> entry (for Add/Remove button state)
  const byUniversity = useMemo(() => {
    const map = new Map();
    for (const e of entries ?? []) {
      if (!e || e.status === 'Removed') continue;
      const uid = typeof e.university === 'object' ? e.university?._id : e.university;
      if (uid) map.set(String(uid), e);
    }
    return map;
  }, [entries]);

  const activeEntries = useMemo(
    () => (entries ?? []).filter((e) => e.status !== 'Removed'),
    [entries]
  );

  const pendingCount = useMemo(
    () => activeEntries.filter((e) => ['Considering', 'Shortlisted'].includes(e.status)).length,
    [activeEntries]
  );

  const add = useCallback(
    async (universityId) => {
      const result = await addToShortlist(leadId, universityId);
      await refetch();
      return result;
    },
    [leadId, refetch]
  );

  const update = useCallback(
    async (universityId, payload) => {
      const result = await updateShortlistEntry(leadId, universityId, payload);
      await refetch();
      return result;
    },
    [leadId, refetch]
  );

  const remove = useCallback(
    async (universityId) => {
      const result = await removeFromShortlist(leadId, universityId);
      await refetch();
      return result;
    },
    [leadId, refetch]
  );

  const confirmAll = useCallback(async () => {
    const result = await confirmShortlist(leadId);
    await refetch();
    return result;
  }, [leadId, refetch]);

  return {
    entries: entries ?? [],
    activeEntries,
    pendingCount,
    byUniversity,
    loading,
    error,
    refetch,
    add,
    update,
    remove,
    confirmAll,
  };
}
