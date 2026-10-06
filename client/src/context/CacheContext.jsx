import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';

const CacheContext = createContext(null);
const STALE_MS = 30_000;

// Global event bus for cache invalidation — allows any component to notify
// live useCachedFetch hooks to refetch when data changes.
const invalidationBus = new EventTarget();

export function CacheProvider({ children }) {
  // Cache keys are role-level ("agent-dashboard-summary"), never user-level, so
  // the ONLY thing separating two agents' data is this provider. It sits ABOVE
  // <App/>, which means it does not unmount on logout — an Agent A → Agent B
  // login without a refresh would otherwise hydrate B's very first paint from
  // A's still-fresh entries (CacheContext.jsx `useState(() => get(key))`).
  // Tying the Map's lifetime to the authenticated id closes that hole.
  const { user } = useAuth();
  const userId = user?._id ?? null;

  const cacheRef = useRef(new Map());
  const [scope, setScope] = useState(userId);

  // Drop every entry the moment the identity changes. This runs during render —
  // BEFORE any descendant useCachedFetch runs its cache-hydrating initializer —
  // so a stale frame is never painted. setState-during-render is React's
  // documented "adjust state when a prop changes" pattern, not a side effect.
  if (scope !== userId) {
    setScope(userId);
    cacheRef.current = new Map();
  }

  const get = useCallback((key) => cacheRef.current.get(key) ?? null, []);

  const set = useCallback((key, data, error = null) => {
    cacheRef.current.set(key, { data, error, updatedAt: Date.now() });
  }, []);

  const invalidate = useCallback((key) => {
    if (key) {
      cacheRef.current.delete(key);
      // Notify all live useCachedFetch hooks that this key is stale.
      invalidationBus.dispatchEvent(new CustomEvent('invalidate', { detail: { key } }));
    } else {
      cacheRef.current = new Map();
      invalidationBus.dispatchEvent(new CustomEvent('invalidate', { detail: { key: '*' } }));
    }
  }, []);

  // Tell any hook that stayed mounted across the identity change to refetch.
  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    if (prevUserIdRef.current === userId) return;
    prevUserIdRef.current = userId;
    invalidationBus.dispatchEvent(new CustomEvent('invalidate', { detail: { key: '*' } }));
  }, [userId]);

  const value = useMemo(() => ({ get, set, invalidate }), [get, set, invalidate]);

  return <CacheContext.Provider value={value}>{children}</CacheContext.Provider>;
}

export function useCache() {
  const ctx = useContext(CacheContext);
  if (!ctx) throw new Error('useCache must be used within CacheProvider');
  return ctx;
}

/**
 * Fetch data with automatic caching.
 *
 * Data is stored in the shared cache AND in local state. This means:
 * - Local state drives re-renders (no global rerender counter needed)
 * - The cache allows sharing data between components (e.g., navigate away and back)
 * - On mount, if cached data is fresh, it's used immediately (no network request)
 *
 * Also subscribes to the global invalidation bus so that when ANY component
 * calls invalidate(key), this hook automatically refetches.
 *
 * @param {string|null} key          Cache key. Pass null to skip fetching.
 * @param {Function}    fetcher      Async function that returns the data.
 * @param {object}       opts
 * @param {boolean}      opts.enabled     Default true. Set false to pause fetching.
 * @param {number|null}  opts.refetchInterval  If set, refetch this often (ms).
 * @param {number}       opts.staleTime    How long cached data is considered fresh (ms). Default 30s.
 * @returns {{ data, error, loading, refetch }}
 */
export function useCachedFetch(key, fetcher, opts = {}) {
  const { enabled = true, refetchInterval = null, staleTime = STALE_MS } = opts;
  const { get, set } = useCache();
  const [data, setData] = useState(() => key ? get(key)?.data ?? null : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);
  const fetcherRef = useRef(fetcher);
  const keyRef = useRef(key);
  const inflightRef = useRef(new Map());

  fetcherRef.current = fetcher;
  keyRef.current = key;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const setInflight = useCallback((cacheKey, promise) => {
    inflightRef.current.set(cacheKey, promise);
  }, []);

  const clearInflight = useCallback((cacheKey) => {
    inflightRef.current.delete(cacheKey);
  }, []);

  const doFetch = useCallback(async (fetchKey) => {
    if (!fetchKey) return;
    if (!mountedRef.current) return;

    const existing = inflightRef.current.get(fetchKey);
    if (existing) return existing;

    setLoading(true);
    const promise = (async () => {
      try {
        const result = await fetcherRef.current();
        if (!mountedRef.current) return result;
        set(fetchKey, result, null);
        setData(result);
        setError(null);
        return result;
      } catch (err) {
        if (!mountedRef.current) throw err;
        const msg = err?.response?.data?.message || err?.message || 'Failed to load data';
        const cached = get(fetchKey);
        setData(cached?.data ?? null);
        set(fetchKey, cached?.data ?? null, msg);
        setError(msg);
        throw err;
      } finally {
        clearInflight(fetchKey);
        if (mountedRef.current) setLoading(false);
      }
    })();

    setInflight(fetchKey, promise);
    return promise;
  }, [set, get, setInflight, clearInflight]);

  // On mount / key change: hydrate from cache or fetch if stale
  useEffect(() => {
    if (!enabled || !key) return;
    const cached = get(key);
    const isStale = !cached || (Date.now() - cached.updatedAt > staleTime);
    if (cached && !isStale) {
      setData(cached.data);
    } else {
      doFetch(key);
    }
  }, [key, enabled, staleTime, get, doFetch]);

  /* ── Polling ──────────────────────────────────────────────────────────
     Runs while the tab is VISIBLE only. A hidden tab stops hitting the API
     entirely, and the moment it becomes visible again it refetches
     immediately so the agent never stares at data that went stale while they
     were in another tab. Neither branch touches component filters, the active
     call, or anything else — it only re-runs the existing fetcher. */
  useEffect(() => {
    if (!enabled || !key || !refetchInterval || refetchInterval <= 0) return undefined;

    const isVisible = () => typeof document === 'undefined' || !document.hidden;

    const id = setInterval(() => {
      if (!isVisible()) return;
      doFetch(keyRef.current);
    }, refetchInterval);

    const onVisibilityChange = () => {
      if (isVisible()) doFetch(keyRef.current);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [key, enabled, refetchInterval, doFetch]);

  // Listen for cache invalidation events from other components.
  // When invalidate(key) is called anywhere, refetch immediately.
  useEffect(() => {
    if (!enabled || !key) return;

    const handler = (e) => {
      const invalidatedKey = e.detail?.key;
      if (invalidatedKey === '*') {
        // Whole-cache drop (identity change): the previous owner's data must
        // leave the screen immediately, not linger until the refetch lands.
        setData(null);
        setError(null);
        doFetch(keyRef.current);
        return;
      }
      if (invalidatedKey === key) {
        doFetch(keyRef.current);
      }
    };

    invalidationBus.addEventListener('invalidate', handler);
    return () => invalidationBus.removeEventListener('invalidate', handler);
  }, [key, enabled, doFetch]);

  const refetch = useCallback(() => doFetch(keyRef.current), [doFetch]);

  return {
    data,
    error,
    loading,
    refetch,
  };
}
