import { useCallback, useEffect, useState } from 'react';
import { useCachedFetch } from '../context/CacheContext.jsx';
import {
  fetchApplications,
  createApplication,
  updateApplicationStatus,
  submitApplication,
  withdrawApplication,
} from '../api/applications.js';

const PAGE_SIZE = 10;

/**
 * useApplications — paginated application list for one student.
 *
 * Server-side pagination/filtering (never loads everything). Each page /
 * filter combination is cached under its own key so revisits are instant;
 * inflight requests are deduplicated by CacheContext (StrictMode safe).
 * Mutations return the fresh application (and, where relevant, an updated
 * lead) and refresh the cache.
 */
export function useApplications(leadId, { enabled = true } = {}) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce search input → query.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change resets pagination.
  useEffect(() => { setPage(1); }, [statusFilter, search]);

  const key = `applications-${leadId || 'none'}-${enabled ? 'on' : 'off'}-${page}-${statusFilter}-${search}`;

  const fetcher = useCallback(async () => {
    if (!leadId || !enabled) {
      return { applications: [], total: 0, page: 1, pages: 0, limit: PAGE_SIZE };
    }
    return fetchApplications(leadId, {
      page,
      limit: PAGE_SIZE,
      sort: '-createdAt',
      ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
      ...(search ? { search } : {}),
    });
  }, [leadId, enabled, page, statusFilter, search]);

  const { data, loading, error, refetch } = useCachedFetch(key, fetcher, { staleTime: 15_000 });

  const result = data ?? { applications: [], total: 0, page: 1, pages: 0, limit: PAGE_SIZE };

  /** Start an application from a confirmed shortlist entry. */
  const start = useCallback(
    async (shortlistId) => {
      const out = await createApplication(leadId, shortlistId);
      await refetch();
      return out;
    },
    [leadId, refetch]
  );

  /** PATCH status / nextAction. */
  const update = useCallback(
    async (applicationId, payload) => {
      const out = await updateApplicationStatus(applicationId, payload);
      await refetch();
      return out;
    },
    [refetch]
  );

  const submit = useCallback(
    async (applicationId) => {
      const out = await submitApplication(applicationId);
      await refetch();
      return out;
    },
    [refetch]
  );

  const withdraw = useCallback(
    async (applicationId, reason) => {
      const out = await withdrawApplication(applicationId, reason);
      await refetch();
      return out;
    },
    [refetch]
  );

  return {
    applications: result.applications ?? [],
    total: result.total ?? 0,
    page: result.page ?? page,
    pages: result.pages ?? 0,
    filters: {
      statusFilter,
      setStatusFilter,
      searchInput,
      setSearchInput,
      setPage,
      page,
    },
    loading,
    error,
    refetch,
    start,
    update,
    submit,
    withdraw,
  };
}
