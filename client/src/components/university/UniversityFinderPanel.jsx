import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import FaceIcon from '@mui/icons-material/Face';
import PublicIcon from '@mui/icons-material/Public';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SchoolIcon from '@mui/icons-material/School';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AppDialog from '../../ui/mui/AppDialog.jsx';
import FilterSelect from '../../ui/mui/FilterSelect.jsx';
import SearchField from '../../ui/mui/SearchField.jsx';
import { fetchUniversities } from '../../api/universities.js';
import { useLookups } from '../../api/useLookups.js';
import { useShortlist } from '../../hooks/useShortlist.js';
import { CountryLabel } from '../../utils/flag.jsx';

/* ==========================================================================
   UNIVERSITY FINDER — "Find Universities" inside Student 360.
   Searches the canonical University Management collection (server-side
   filtering + pagination; never loads the full collection). Matching is
   limited to data that actually exists (country / region / city /
   ownership / name) — no fabricated match scores. The country filter is
   pre-seeded from the student's saved study preferences.
   ========================================================================== */

const OWNERSHIP_OPTIONS = [
  { value: 'all', label: 'All Ownership' },
  { value: 'PVT', label: 'Private' },
  { value: 'PLC', label: 'PLC' },
];

const PAGE_SIZE = 15;

const ownershipLabel = (v) => (v === 'PVT' ? 'Private' : v === 'PLC' ? 'PLC' : v || '—');

// Resolve a country reference (populated object or raw id) to its string id,
// or '' when it's absent.
const countryIdOf = (ref) => {
  if (!ref) return '';
  return typeof ref === 'object' ? ref._id : String(ref);
};

// Resolve a country reference to a display name if available.
const countryNameOf = (ref) => {
  if (!ref) return '';
  return typeof ref === 'object' && ref.name ? ref.name : '';
};

// ──────────────────────────────────────────────────────────────────────
// STUDENT CONTEXT — what the Finder knows about the currently loaded
// student, derived ONLY from fields that actually exist on the lead.
//
// Only country preference has a matching field in the university record
// (country), so it is the ONLY student context that filters results.
// Every academic field below has NO university counterpart — it cannot
// influence filtering or eligibility, so it is shown purely as reference.
// ──────────────────────────────────────────────────────────────────────
const deriveStudentContext = (lead = {}) => {
  // 1. Preferred countries: all populated slots + the single-country shortcut,
  //    deduplicated in order. Only these can influence the country filter.
  const rawPrefs = [];
  for (const p of lead.preferredCountries ?? []) {
    const id = countryIdOf(p?.country);
    if (id && !rawPrefs.includes(id)) rawPrefs.push(id);
  }
  const singlePref = countryIdOf(lead.countryPreferred);
  if (singlePref && !rawPrefs.includes(singlePref)) rawPrefs.push(singlePref);

  // Preferred country display names (deduplicated, in preference order).
  const prefCountryNames = [];
  const nameSeen = new Set();
  for (const p of lead.preferredCountries ?? []) {
    const n = countryNameOf(p?.country);
    if (n && !nameSeen.has(n)) { nameSeen.add(n); prefCountryNames.push(n); }
  }
  const singleName = countryNameOf(lead.countryPreferred);

  // 2. Informational academic context — displayed only, never used to filter.
  const scores = lead.testScores || {};
  const hasScores = Object.keys(scores).some((k) => String(scores[k] || '').trim() !== '');

  return {
    preferredCountryIds: rawPrefs,
    preferredCountryNames: prefCountryNames,
    singlePreferredCountryName: singleName,
    // The single, unambiguous preferred-country id (only when 1 distinct country).
    solePreferredCountryId: rawPrefs.length === 1 ? rawPrefs[0] : null,
    intake: String(lead.intake || '').trim(),
    highestEducation: String(lead.highestEducation || '').trim(),
    gpa: String(lead.gpa || '').trim(),
    testScores: scores,
    hasScores,
  };
};

function UniversityFinderPanel({ lead }) {
  const shortlist = useShortlist(lead?._id);
  const { countries } = useLookups('');

  const student = useMemo(() => deriveStudentContext(lead), [lead]);
  // The only student context that maps to a filterable university field.
  const solePreferredCountryId = student.solePreferredCountryId;

  // Filters — country is pre-seeded from the student's preference when it is
  // unambiguous (exactly one preferred country). The advisor can always
  // override it; once changed manually it is no longer treated as
  // "from student".
  const [seeded, setSeeded] = useState(false);
  const [countryOverridden, setCountryOverridden] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('all');
  const [stateRegion, setStateRegion] = useState('');
  const [city, setCity] = useState('');
  const [ownership, setOwnership] = useState('all');
  const [page, setPage] = useState(1);

  // Seed once: default the country filter to the student's sole preferred
  // country. When there are none or several, stay on "All Countries" so we
  // never silently exclude a preferred destination.
  useEffect(() => {
    if (!seeded) {
      if (lead) setCountry(solePreferredCountryId || 'all');
      setSeeded(true);
    }
  }, [seeded, lead, solePreferredCountryId]);

  // Debounce search input → query.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change resets pagination.
  useEffect(() => { setPage(1); }, [search, country, stateRegion, city, ownership]);

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  // Serial request counter — lets us ignore stale responses when a newer
  // search/filter has already started (prevents out-of-order overwrites).
  const reqSeqRef = useRef(0);
  // Signature of the last issued request — skips redundant identical fetches.
  const lastReqKeyRef = useRef('');

  const load = useCallback(async () => {
    // Cancel any in-flight request from a previous filter/search/page change.
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const params = {
      page,
      limit: PAGE_SIZE,
      isActive: true,
      orderBy: 'countryName',
      sort: 'institutionName',
      ...(search ? { search } : {}),
      ...(country !== 'all' ? { country } : {}),
      ...(stateRegion.trim() ? { stateRegion: stateRegion.trim() } : {}),
      ...(city.trim() ? { city: city.trim() } : {}),
      ...(ownership !== 'all' ? { ownership } : {}),
    };
    // No-op if the exact same params are already in flight / just returned.
    const key = JSON.stringify(params);
    if (key === lastReqKeyRef.current) return;
    lastReqKeyRef.current = key;

    const seq = ++reqSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchUniversities(params, { signal: controller.signal });
      if (seq !== reqSeqRef.current) return; // stale — a newer request owns the UI
      setResult(data ?? { universities: [], total: 0, page: 1, pages: 0 });
    } catch (err) {
      if (err?.canceled || err?.code === 'ERR_CANCELED' || controller.signal.aborted) return;
      if (seq !== reqSeqRef.current) return;
      setError(err?.response?.data?.message || err?.message || 'Could not load universities');
    } finally {
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }, [page, search, country, stateRegion, city, ownership]);

  // Load on mount and whenever filters / search / page change.
  useEffect(() => { load(); }, [load]);
  // Clean up any in-flight request when the finder unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const [busyId, setBusyId] = useState(null);
  const [viewing, setViewing] = useState(null);

  const toggleShortlist = async (uni) => {
    setBusyId(String(uni._id));
    try {
      const existing = shortlist.byUniversity.get(String(uni._id));
      if (existing) await shortlist.remove(uni._id);
      else await shortlist.add(uni._id);
    } catch (err) {
      setError(err?.response?.data?.message || 'Shortlist update failed');
    } finally {
      setBusyId(null);
    }
  };

  const rows = result?.universities ?? [];
  const total = result?.total ?? 0;
  const pages = result?.pages ?? 0;

  const hasActiveFilters =
    searchInput.trim() !== '' ||
    country !== 'all' ||
    stateRegion.trim() !== '' ||
    city.trim() !== '' ||
    ownership !== 'all';

  const clearFilters = () => {
    setSearchInput('');
    setCountry('all');
    setStateRegion('');
    setCity('');
    setOwnership('all');
    setCountryOverridden(true); // post-clear, country is a manual 'all'
  };

  // Re-apply the student's sole preferred country to the filter.
  const usePreferredCountry = () => {
    if (!solePreferredCountryId) return;
    setCountry(solePreferredCountryId);
    setCountryOverridden(false);
  };

  // Whether the active country filter is currently derived from the student.
  const countryFromStudent =
    !countryOverridden && !!solePreferredCountryId && country === solePreferredCountryId;

  // Informational academic context to surface (only populated values).
  // Never used to filter — the university data cannot support eligibility.
  const contextEntries = useMemo(() => {
    const out = [];
    if (student.singlePreferredCountryName) {
      out.push({ icon: <PublicIcon sx={{ fontSize: 13 }} />, label: 'Preferred country', value: <CountryLabel value={student.singlePreferredCountryName} flagSx={{ fontSize: 12.5 }} />, key: 'country' });
    }
    const prefNames = [...student.preferredCountryNames];
    if (prefNames.length) {
      out.push({ icon: <PublicIcon sx={{ fontSize: 13 }} />, label: 'Preferred countries', value: <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '7px', rowGap: 1 }}>{prefNames.map((cn, i) => <CountryLabel key={i} value={cn} flagSx={{ fontSize: 12.5 }} />)}</Box>, key: 'prefs' });
    }
    if (student.intake) out.push({ icon: <ScheduleIcon sx={{ fontSize: 13 }} />, label: 'Intake', value: student.intake, key: 'intake' });
    if (student.highestEducation) out.push({ icon: <SchoolIcon sx={{ fontSize: 13 }} />, label: 'Education', value: student.highestEducation, key: 'education' });
    if (student.gpa) out.push({ icon: <AccountBalanceIcon sx={{ fontSize: 13 }} />, label: 'GPA', value: student.gpa, key: 'gpa' });
    if (student.hasScores) {
      const parts = [];
      for (const [test, v] of Object.entries(student.testScores)) {
        const s = String(v || '').trim();
        if (s) parts.push(`${test}: ${s}`);
      }
      if (parts.length) out.push({ icon: <FaceIcon sx={{ fontSize: 13 }} />, label: 'Tests', value: parts.join(' · '), key: 'tests' });
    }
    return out;
  }, [student]);
  const hasContext = contextEntries.length > 0;

  return (
    <Box>
      {/* ── Section header + live result count ──────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5, mb: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Find Universities
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.disabled', flexShrink: 0 }}>
          {loading ? 'Searching…' : `${total} ${total === 1 ? 'result' : 'results'}`}
        </Typography>
      </Box>

      {/* ── Student context strip ───────────────────────────────────
           Shows which context comes from the loaded student. Country
           preference is the ONLY student context that filters results.
           Every other field (intake, education, GPA, tests) is displayed
           for reference and NEVER used to filter or claim eligibility. */}
      {hasContext && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1.25, px: 1, py: 0.75, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'action.hover' }}>
          <Box sx={{ flexShrink: 0, pt: 0.15 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Student context
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 0 }}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {contextEntries.map((c) => (
                <Tooltip key={c.key} title={c.label} arrow placement="top">
                  <Chip
                    size="small"
                    icon={c.icon}
                    label={c.value}
                    variant="outlined"
                    sx={{ height: 22, fontSize: 11, maxWidth: 260, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
                  />
                </Tooltip>
              ))}
            </Box>
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled', lineHeight: 1.4 }}>
              {solePreferredCountryId
                ? 'Country is pre-set from the student above. Academic fields are reference only — they do not filter results.'
                : 'Country stays on “All Countries” until you choose one. Academic fields shown above are reference only — they do not filter results.'}
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── Filters — one wrapping toolbar row ──────────────────── */}
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center', mb: 1.25 }}>
        <SearchField
          placeholder="Search institution…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          sx={{ flex: '1 1 170px', minWidth: 150 }}
        />
        <FilterSelect
          label="Country"
          value={country}
          onChange={(e) => {
            setCountry(e.target.value);
            setCountryOverridden(true); // advisor took manual control
          }}
          options={[
            { value: 'all', label: 'All Countries' },
            ...countries.map((c) => ({ value: c.id, label: c.name })),
          ]}
          sx={{ minWidth: 130 }}
        />
        {countryFromStudent && (
          <Chip
            size="small"
            icon={<FaceIcon sx={{ fontSize: 13 }} />}
            label="From student"
            title="Country is pre-set from this student's preferred country. Change it to override."
            sx={{ height: 22, fontSize: 11, bgcolor: 'primary.soft', color: 'primary.main' }}
          />
        )}
        <FilterSelect
          label="Ownership"
          value={ownership}
          onChange={(e) => setOwnership(e.target.value)}
          options={OWNERSHIP_OPTIONS}
          sx={{ minWidth: 108 }}
        />
        <SearchField
          placeholder="State / Region"
          value={stateRegion}
          onChange={(e) => setStateRegion(e.target.value)}
          sx={{ width: 140 }}
        />
        <SearchField
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          sx={{ width: 120 }}
        />
        {hasActiveFilters && (
          <Button size="small" onClick={clearFilters} disabled={loading} sx={{ textTransform: 'none', fontSize: 11.5, color: 'text.secondary', minWidth: 0, px: 0.75, flexShrink: 0 }}>
            Clear filters
          </Button>
        )}
      </Box>

      {error && (
        <Alert
          severity="warning"
          sx={{ mb: 1.25, fontSize: 12.5 }}
          action={
            <Button
              size="small"
              onClick={() => {
                // Bypass the duplicate-request guard so a failed query can retry.
                lastReqKeyRef.current = '';
                load();
              }}
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* ── Results ─────────────────────────────────────────────── */}
      {loading ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 3 }}>
          <CircularProgress size={18} />
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Searching…</Typography>
        </Box>
      ) : rows.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 2.5, textAlign: 'center' }}>
          {hasActiveFilters
            ? 'No universities match this search / filter combination. Try clearing or adjusting the filters.'
            : 'No universities are available yet in the directory.'}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {rows.map((u) => {
            const onList = shortlist.byUniversity.has(String(u._id));
            const busy = busyId === String(u._id);
            const location = [u.country?.name, [u.city, u.stateRegion].filter(Boolean).join(', ')]
              .filter(Boolean).join(' · ');
            return (
              <Box
                key={u._id}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5,
                  px: 1.25, py: 0.75, borderTop: 1, borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover', '& .uni-name': { color: 'primary.dark' } },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography className="uni-name" noWrap title={u.institutionName} sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: 'text.primary', transition: 'color 120ms ease' }}>
                    {u.institutionName}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.5 }}>
                    {location || '—'}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 9.5, fontWeight: 600, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.8 }}>
                    {ownershipLabel(u.ownership)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  <Button
                    size="small"
                    onClick={() => setViewing(u)}
                    sx={{ textTransform: 'none', fontSize: 12, fontWeight: 500, color: 'text.secondary', minWidth: 0, px: 0.75, '&:hover': { color: 'primary.main', bgcolor: 'transparent' } }}
                  >
                    View
                  </Button>
                  {onList ? (
                    <Tooltip title="On shortlist — click to remove" arrow placement="left">
                      <Button
                        size="small"
                        disabled={busy}
                        onClick={() => toggleShortlist(u)}
                        startIcon={<CheckIcon sx={{ fontSize: 13 }} />}
                        sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, color: 'success.dark', minWidth: 0, px: 0.75, '&:hover': { bgcolor: 'transparent', color: 'error.main' } }}
                      >
                        Added
                      </Button>
                    </Tooltip>
                  ) : (
                    <Button
                      size="small"
                      variant="contained"
                      disabled={busy}
                      onClick={() => toggleShortlist(u)}
                      startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                      sx={{ textTransform: 'none', fontSize: 12, fontWeight: 600, minWidth: 0, px: 1.25 }}
                    >
                      {busy ? '…' : 'Add'}
                    </Button>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── Pagination ──────────────────────────────────────────── */}
      {pages > 1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1.25 }}>
          <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
            Page {result?.page ?? page} of {pages} · {total} universities
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.75 }}>
            <Button size="small" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button size="small" disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </Box>
        </Box>
      )}

      {/* ── View dialog ─────────────────────────────────────────── */}
      <AppDialog open={!!viewing} onClose={() => setViewing(null)} size="sm" title={viewing?.institutionName ?? ''}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 0.75, columnGap: 2, py: 0.5 }}>
          {[
            ['Country', viewing?.country?.name],
            ['City', viewing?.city],
            ['State / Region', viewing?.stateRegion],
            ['Ownership', ownershipLabel(viewing?.ownership)],
            ['Status', viewing == null ? '' : viewing.isActive ? 'Active' : 'Inactive'],
          ].map(([k, v]) => (
            <Box key={k} sx={{ display: 'contents' }}>
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{k}</Typography>
              <Typography sx={{ fontSize: 12.5, fontWeight: 500 }}>{v || '—'}</Typography>
            </Box>
          ))}
        </Box>
        {viewing && !viewing.isActive && (
          <Chip size="small" label="Inactive university" sx={{ mt: 1 }} />
        )}
      </AppDialog>
    </Box>
  );
}

// Memoized so typing/filtering inside the finder (its own local state) never
// forces the parent Agent Workspace / Student 360 subtree to re-render.
export default memo(UniversityFinderPanel);
