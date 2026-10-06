/**
 * useLookups
 *
 * Fetches countries (once, cached globally) and universities (per country).
 * Both are reference data that should not be re-fetched on every mount.
 */
import { useCallback } from 'react';
import client from './client.js';
import { useCachedFetch } from '../context/CacheContext.jsx';

export function useLookups(selectedCountry = '') {
  const fetchCountries = useCallback(async () => {
    const { data } = await client.get('/lookups/countries');
    return data.data ?? [];
  }, []);

  const countryKey = 'lookups-countries';
  const { data: countries, loading: loadingCountries } = useCachedFetch(countryKey, fetchCountries, {
    staleTime: 300_000, // 5 minutes
  });

  const fetchUniversities = useCallback(async () => {
    const url = selectedCountry
      ? `/lookups/universities?country=${encodeURIComponent(selectedCountry)}`
      : '/lookups/universities';
    const { data } = await client.get(url);
    return data.data ?? [];
  }, [selectedCountry]);

  const uniKey = selectedCountry ? `lookups-universities-${selectedCountry}` : 'lookups-universities-all';
  const { data: universities, loading: loadingUniversities } = useCachedFetch(uniKey, fetchUniversities, {
    staleTime: 300_000, // 5 minutes
  });

  return {
    countries: countries ?? [],
    universities: universities ?? [],
    loadingCountries,
    loadingUniversities,
  };
}
