import { useCallback, useEffect, useMemo, useState } from 'react';
import { Avatar, Box, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { fetchSupervisorUsers } from '../../api/supervisor.js';
import { fetchLeads } from '../../api/leads.js';
import { FilterSelect } from '../../ui/mui/index.js';

const ROLE_OPTIONS = [
  { label: 'All', value: 'All' },
  { label: 'Agent', value: 'Agent' },
  { label: 'Counselor', value: 'Counselor' },
];

const initials = (name) =>
  String(name || '')
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const STATUS_TONE = {
  'New': 'primary', Contacted: 'info', Qualified: 'success',
  'Application Started': 'warning', 'Documents Pending': 'warning',
  'Offer Received': 'success', 'Visa Process': 'info', Enrolled: 'success', Lost: 'error',
};

/* ==========================================================================
   RoleLeadExplorer — dependent Role → Individual → Leads filtering.
   - Role dropdown: All / Agent / Counselor.
   - Individual dropdown depends on the selected Role (agents only when
     "Agent", counselors only when "Counselor"), cleared whenever Role changes
     so agents/counselors can never leak across lists.
   - When an individual is selected, fetches and renders that person's
     assigned/connected leads inline (`assignedTo` for agents,
     `counselorAssigned` for counselors) using the existing /leads API.
   All data comes from existing user/lead assignment data — nothing is
   hardcoded or duplicated.
   ========================================================================== */
export default function RoleLeadExplorer({ role, onRoleChange, individual, onIndividualChange, title, hideTitle = false, showLeads = true, users: usersProp = null }) {
  const [usersLocal, setUsersLocal] = useState(null);

  useEffect(() => {
    if (usersProp) return undefined;
    let cancelled = false;
    fetchSupervisorUsers()
      .then((u) => { if (!cancelled) setUsersLocal(u); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [usersProp]);

  const users = usersProp ?? usersLocal ?? [];

  const agents = useMemo(
    () => users.filter((u) => String(u.role) === 'Agent' && String(u.status) === 'Active'),
    [users]
  );
  const counselors = useMemo(
    () => users.filter((u) => String(u.role) === 'Counselor' && String(u.status) === 'Active'),
    [users]
  );

  const individualOptions = useMemo(
    () =>
      (role === 'Agent'
        ? agents
        : role === 'Counselor'
          ? counselors
          : []
      ).map((u) => ({ value: String(u.id), label: u.name })),
    [role, agents, counselors]
  );

  // When the role changes, clear the previously selected individual so the
  // new role's dropdown never holds a stale/foreign selection.
  const handleRoleChange = (e) => {
    onRoleChange?.(e.target.value);
    onIndividualChange?.('');
  };

  // Leads for the selected individual (agent → assignedTo, counselor → counselorAssigned).
  const leadsFetcher = useCallback(() => {
    if (!individual) return Promise.resolve([]);
    const param = role === 'Counselor' ? { counselorAssigned: individual } : { assignedTo: individual };
    return fetchLeads(param)
      .then((rows) => rows ?? [])
      .catch(() => []);
  }, [individual, role]);

  const [leads, setLeads] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!individual) { setLeads([]); return undefined; }
    setLeads(null);
    leadsFetcher().then((rows) => { if (!cancelled) setLeads(rows); });
    return () => { cancelled = true; };
  }, [leadsFetcher, individual]);

  const selectedName = useMemo(
    () => individualOptions.find((o) => o.value === individual)?.label ?? '',
    [individualOptions, individual]
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterSelect
          label="Role"
          value={role}
          onChange={handleRoleChange}
          options={ROLE_OPTIONS}
          sx={{ minWidth: 124 }}
        />
        {role !== 'All' && (
          <FilterSelect
            key={role}
            label={role === 'Agent' ? 'Agent' : 'Counselor'}
            value={individual}
            onChange={(e) => onIndividualChange?.(e.target.value)}
            options={individualOptions}
            disabled={individualOptions.length === 0}
            placeholder={role === 'Agent' ? 'Select Agent' : 'Select Counselor'}
            sx={{ minWidth: 172, maxWidth: 220 }}
          />
        )}
      </Box>

      {!hideTitle && (role === 'All' || !individual) && (
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
          {title || (showLeads
            ? 'Select an individual to see their assigned leads.'
            : 'Select an individual to see their performance.')}
        </Typography>
      )}

      {showLeads && role !== 'All' && individual && (
        <Box>
          {leads === null ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2, justifyContent: 'center' }}>
              <CircularProgress size={15} />
              <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Loading leads…</Typography>
            </Box>
          ) : leads.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>No leads assigned to {selectedName}.</Typography>
            </Box>
          ) : (
            <TableContainer sx={{ maxHeight: 260, overflowX: 'auto' }}>
              <Table size="small" stickyHeader sx={{ minWidth: 480, tableLayout: 'fixed' }} aria-label="Assigned leads">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 200, px: 0.875 }}>Student</TableCell>
                    <TableCell sx={{ width: 110, px: 0.875 }}>Reference</TableCell>
                    <TableCell sx={{ width: 150, px: 0.875 }}>Status</TableCell>
                    <TableCell align="right" sx={{ width: 120, px: 0.875 }}>Priority</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {leads.map((l) => (
                    <TableRow key={l.id} hover>
                      <TableCell component="th" scope="row" sx={{ px: 0.875 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                          <Avatar sx={{ width: 22, height: 22, fontSize: 9, fontWeight: 700, bgcolor: 'primary.soft', color: 'primary.main', flexShrink: 0 }}>
                            {initials(l.studentName)}
                          </Avatar>
                          <Box sx={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {l.studentName}
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ px: 0.875, fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>{l.referenceId ?? '—'}</TableCell>
                      <TableCell sx={{ px: 0.875 }}>
                        <Typography sx={{
                          fontSize: 11.5,
                          fontWeight: 600,
                          color: STATUS_TONE[l.status] ? `${STATUS_TONE[l.status]}.main` : 'text.primary',
                        }}>
                          {l.status ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ px: 0.875, fontSize: 12, fontWeight: 500 }}>{l.priority ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}
    </Box>
  );
}
