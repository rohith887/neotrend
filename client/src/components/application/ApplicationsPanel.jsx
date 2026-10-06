import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import FilterSelect from '../../ui/mui/FilterSelect.jsx';
import SecondaryButton from '../../ui/mui/SecondaryButton.jsx';
import SearchField from '../../ui/mui/SearchField.jsx';
import { CountryLabel } from '../../utils/flag.jsx';
import ApplicationDetailDialog from './ApplicationDetailDialog.jsx';

/* ==========================================================================
   APPLICATIONS PANEL — compact, server-paginated application list inside
   Student 360. Plain-text status column (no badge walls), status-appropriate
   quick actions per row. All data comes from the shared useApplications
   instance owned by the profile section.
   ========================================================================== */

const APPLICATION_STATUSES = [
  'Draft',
  'Preparing',
  'Documents Pending',
  'Ready to Submit',
  'Submitted',
  'Under Review',
  'Offer Received',
  'Rejected',
  'Withdrawn',
];

// Quick inline follow-up per row (mirrors the detail dialog rules).
const QUICK_NEXT = {
  Draft: ['Preparing', 'Documents Pending', 'Ready to Submit'],
  Preparing: ['Draft', 'Documents Pending', 'Ready to Submit'],
  'Documents Pending': ['Draft', 'Preparing', 'Ready to Submit'],
  'Ready to Submit': ['Draft', 'Preparing', 'Documents Pending'],
  Submitted: ['Under Review'],
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const ownerName = (o) => (o ? [o.firstName, o.lastName].filter(Boolean).join(' ') || '—' : '—');

const HEAD = ['University', 'Status', 'Owner', 'Created', 'Updated', 'Next Action', ''];

export default function ApplicationsPanel({ lead, apps, onLeadUpdated }) {
  const [viewingId, setViewingId] = useState(null);
  const [rowBusy, setRowBusy] = useState(null);
  const [rowError, setRowError] = useState(null);

  const viewing = useMemo(
    () => apps.applications.find((a) => String(a._id) === viewingId) ?? null,
    [apps.applications, viewingId]
  );

  const runUpdate = async (applicationId, payload) => {
    setRowBusy(applicationId);
    setRowError(null);
    try {
      const updated = await apps.update(applicationId, payload);
      if (updated?.lead) onLeadUpdated?.(updated.lead); // refresh header + activity rail
    } catch (err) {
      setRowError(err?.response?.data?.message || 'Update failed');
    } finally {
      setRowBusy(null);
    }
  };

  const rows = apps.applications;
  const { filters } = apps;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Typography sx={{ fontSize: 11, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Applications · {apps.total}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <SearchField
            placeholder="University…"
            value={filters.searchInput}
            onChange={(e) => filters.setSearchInput(e.target.value)}
            sx={{ width: 170 }}
          />
          <FilterSelect
            label="Status"
            value={filters.statusFilter}
            onChange={(e) => filters.setStatusFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Statuses' },
              ...APPLICATION_STATUSES.map((s) => ({ value: s, label: s })),
            ]}
            sx={{ minWidth: 140 }}
          />
        </Box>
      </Box>

      {(apps.error || rowError) && (
        <Alert severity="warning" sx={{ mb: 1.25, fontSize: 12.5 }} action={<Button size="small" onClick={apps.refetch}>Retry</Button>}>
          {String(apps.error?.message || apps.error) || rowError}
        </Alert>
      )}

      {apps.loading && rows.length === 0 ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, py: 3 }}>
          <CircularProgress size={18} />
          <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>Loading applications…</Typography>
        </Box>
      ) : rows.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 2.5, textAlign: 'center' }}>
          No applications yet. Start one from a confirmed shortlist entry in the Shortlist tab.
        </Typography>
      ) : (
        <>
          <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, maxHeight: 'none', '&::-webkit-scrollbar': { height: 6, width: 6 } }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {HEAD.map((h, i) => (
                    <TableCell key={i} sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap', py: 0.75 }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((a) => {
                  const uni = a.university ?? {};
                  const busy = rowBusy === String(a._id);
                  const quick = QUICK_NEXT[a.status] ?? [];
                  return (
                    <TableRow key={a._id} hover sx={{ opacity: busy ? 0.6 : 1, '& td': { py: 0.75, borderBottom: 1, borderColor: 'divider' } }}>
                      {/* University */}
                      <TableCell sx={{ maxWidth: 200 }}>
                        <Typography noWrap title={uni.institutionName} sx={{ fontSize: 12.5, fontWeight: 600 }}>
                          {uni.institutionName || 'University'}
                          {uni.isActive === false && (
                            <Typography component="span" sx={{ fontSize: 10.5, color: 'text.disabled', fontWeight: 400 }}> · inactive</Typography>
                          )}
                        </Typography>
                        <Typography noWrap sx={{ fontSize: 10.5, color: 'text.disabled', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          {uni.country?.name ? <CountryLabel value={uni.country} flagSx={{ fontSize: 12 }} /> : ''}
                          {uni.country?.name && uni.city ? <span>· {uni.city}</span> : uni.city ? <span>{uni.city}</span> : ''}
                        </Typography>
                      </TableCell>
                      {/* Status — plain text, readable at a glance */}
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12, fontWeight: 600 }}>{a.status}</TableCell>
                      {/* Owner */}
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>{ownerName(a.owner)}</TableCell>
                      {/* Created / Updated */}
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 11.5, color: 'text.secondary' }}>{fmtDate(a.createdAt)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 11.5, color: 'text.secondary' }}>{fmtDate(a.updatedAt)}</TableCell>
                      {/* Next Action */}
                      <TableCell sx={{ fontSize: 11.5, maxWidth: 160 }}>
                        <Typography noWrap title={a.nextAction || ''} sx={{ fontSize: 11.5 }}>
                          {a.nextAction || '—'}
                        </Typography>
                      </TableCell>
                      {/* Actions */}
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {quick.length > 0 && (
                            <TextField
                              select
                              size="small"
                              value=""
                              onChange={(e) => runUpdate(a._id, { status: e.target.value })}
                              disabled={busy}
                              SelectProps={{ displayEmpty: true, sx: { fontSize: 11.5 } }}
                              sx={{ width: 108, '& .MuiInputBase-input': { pt: 0.9, pb: 0.4, fontSize: 11.5 } }}
                            >
                              <MenuItem value="" disabled>Update…</MenuItem>
                              {quick.map((s) => (
                                <MenuItem key={s} value={s}>{s}</MenuItem>
                              ))}
                            </TextField>
                          )}
                          <SecondaryButton
                            size="small"
                            startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 13 }} />}
                            onClick={() => setViewingId(String(a._id))}
                            sx={{ minWidth: 0, px: 1, fontSize: 11.5 }}
                          >
                            View
                          </SecondaryButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {apps.pages > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1 }}>
              <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
                Page {apps.page} of {apps.pages} · {apps.total} applications
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75 }}>
                <Button size="small" disabled={filters.page <= 1 || apps.loading} onClick={() => filters.setPage((p) => p - 1)}>Prev</Button>
                <Button size="small" disabled={filters.page >= apps.pages || apps.loading} onClick={() => filters.setPage((p) => p + 1)}>Next</Button>
              </Box>
            </Box>
          )}
        </>
      )}

      <ApplicationDetailDialog
        lead={lead}
        application={viewing}
        open={!!viewing}
        onClose={() => setViewingId(null)}
        actions={{ update: apps.update, submit: apps.submit, withdraw: apps.withdraw }}
        onChange={({ lead: freshLead }) => {
          // Lifecycle / next-action changes from submit, offers etc.
          if (freshLead) onLeadUpdated?.(freshLead);
        }}
      />
    </Box>
  );
}
