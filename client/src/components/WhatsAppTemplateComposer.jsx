import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Divider,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SendIcon from '@mui/icons-material/Send';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PrimaryButton from '../ui/mui/PrimaryButton.jsx';
import SecondaryButton from '../ui/mui/SecondaryButton.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  fetchWhatsappTemplates,
  previewWhatsappTemplate,
  sendWhatsappTemplate,
} from '../api/whatsapp.js';

/* ==========================================================================
   WHATSAPP TEMPLATE COMPOSER
   --------------------------------------------------------------------------
   All the template-sending logic and UI (template selector → variables →
   live preview → send), extracted from what used to be the WhatsApp modal
   so it can be embedded in more than one shell without duplicating any of
   this logic:
     - WhatsAppTemplateDialog.jsx  — the original full-screen modal
       (still used as-is by CounselorWorkspace and anywhere else unchanged)
     - WhatsAppSidebar.jsx         — the new unified Agent Workspace sidebar

   Flow: Lead → pick template → variables auto-resolve from lead/user/company
   (editable to fill gaps, either in the field list or inline in the live
   preview) → live preview → send through company WhatsApp number. The
   actual Meta API call happens ONLY on the backend — the Meta access token
   never leaves the server, and this component only ever sees the resolved
   variable values + a plain-text preview.

   Fills its parent's height as a flex column: [optional recipient strip] →
   [fixed template selector] → [ONE scrollable region: variables + preview]
   → [fixed footer]. Both host shells (modal, sidebar) just need to give it
   a bounded height and it lays itself out correctly at any width — the
   variables/preview grid already collapses to one stacked column below a
   640px content width, so it adapts to a narrow sidebar with no extra work.
   ========================================================================== */

const WA_GREEN = '#25D366';

/* ── Meta status → MUI chip color ─────────────────────────────── */
const metaStatusColor = (status) => {
  const s = String(status || '').toUpperCase();
  if (s === 'APPROVED') return 'success';
  if (s === 'REJECTED' || s === 'DISABLED' || s === 'DELETED') return 'error';
  if (s === 'PENDING' || s === 'IN_APPEAL' || s === 'PAUSED' || s === 'LIMIT_EXCEEDED' || s === 'PENDING_DELETION') return 'warning';
  return 'default';
};

const initialsOf = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .map((w) => w[0] || '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

// Split the approved template body ("Hi {{1}}, ...") into alternating plain
// text / variable-token segments, using the same {{n}} positions the backend
// substitutes. Lets the preview render each variable as an inline editable
// span instead of frozen text — only the variable slots are ever editable,
// never the approved static wording, matching the API's own constraint.
const buildPreviewSegments = (body, variables) => {
  if (!body) return null;
  const segments = [];
  let lastIndex = 0;
  let matched = false;
  const re = /\{\{(\d+)\}\}/g;
  let m;
  while ((m = re.exec(body))) {
    matched = true;
    if (m.index > lastIndex) segments.push({ type: 'text', value: body.slice(lastIndex, m.index) });
    const varDef = variables[Number(m[1]) - 1] || null;
    segments.push({ type: 'var', varDef });
    lastIndex = re.lastIndex;
  }
  if (!matched) return null;
  if (lastIndex < body.length) segments.push({ type: 'text', value: body.slice(lastIndex) });
  return segments;
};

// Inline editable variable token inside the live preview bubble. Uncontrolled
// (contentEditable) so typing never fights a re-render — the DOM is only
// resynced when the value changes for a reason OTHER than this token's own
// edit (template switch, another field's edit), never on every keystroke.
const VariableToken = ({ varDef, value, missing, onCommit }) => {
  const ref = useRef(null);
  const display = value || (missing ? `[${varDef?.label || ''}]` : '');

  useLayoutEffect(() => {
    if (ref.current && ref.current.innerText !== display) {
      ref.current.innerText = display;
    }
  }, [display]);

  if (!varDef) return null;

  return (
    <Box
      component="span"
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={`Edit ${varDef.label}`}
      title={`Click to edit ${varDef.label}`}
      onBlur={(e) => onCommit(varDef.key, e.currentTarget.innerText.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
      }}
      sx={{
        display: 'inline',
        borderBottom: '1.5px dashed',
        borderColor: missing ? 'error.main' : 'primary.main',
        color: missing ? 'error.main' : 'inherit',
        fontWeight: 600,
        cursor: 'text',
        outline: 'none',
        borderRadius: 0.5,
        px: 0.125,
        '&:hover': { bgcolor: 'action.hover' },
        '&:focus': { bgcolor: 'primary.soft' },
      }}
    />
  );
};

/* Compact labelled variable field. Every row reserves the exact same height
   (label + input + helper slots) whether or not a hint/error is shown — the
   layout cannot jump while a value is being typed. */
const VariableField = ({ label, value, onChange, error, hint }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography
      sx={{
        fontSize: 10.5,
        fontWeight: 600,
        lineHeight: '14px',
        height: 14,
        mb: 0.5,
        color: error ? 'error.main' : 'text.secondary',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Typography>
    <TextField size="small" fullWidth value={value} onChange={onChange} error={error} />
    <Typography
      sx={{
        height: 16,
        lineHeight: '16px',
        fontSize: 11,
        mt: 0.375,
        color: error ? 'error.main' : 'text.disabled',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {error ? `Required — ${hint || 'fill this in'}` : hint || ' '}
    </Typography>
  </Box>
);

export default function WhatsAppTemplateComposer({ open, onClose, lead, onSent, showRecipientStrip = true }) {
  const { push } = useToast();
  const previewSeq = useRef(0);
  const clock = useMemo(
    () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    []
  );

  const [templates, setTemplates] = useState(null);
  const [templatesError, setTemplatesError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [overrides, setOverrides] = useState({});
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [sending, setSending] = useState(false);

  const leadId = lead?._id ?? '';
  const recipientPhone = lead?.mobile ?? '';

  // ── Load catalog when opened ─────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    previewSeq.current += 1; // drop any stale preview responses from a past session
    setTemplates(null);
    setTemplatesError('');
    setSelectedKey('');
    setOverrides({});
    setPreview(null);
    setPreviewError('');
    setPreviewLoading(false);
    fetchWhatsappTemplates()
      .then((list) => {
        if (cancelled) return;
        setTemplates(list || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setTemplatesError(err?.response?.data?.message || err?.message || 'Could not load WhatsApp templates.');
      });
    return () => { cancelled = true; };
  }, [open]);

  // ── Refresh preview whenever template/variables change ───────────
  // A request sequence guard keeps fast typing from letting an older,
  // slower response overwrite a newer one — no preview flicker.
  const refreshPreview = useCallback(
    async (key, over) => {
      if (!leadId || !key) {
        previewSeq.current += 1;
        setPreview(null);
        setPreviewLoading(false);
        return;
      }
      const seq = ++previewSeq.current;
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const p = await previewWhatsappTemplate({ leadId, templateKey: key, overrides: over });
        if (seq !== previewSeq.current) return;
        setPreview(p);
      } catch (err) {
        if (seq !== previewSeq.current) return;
        setPreviewError(err?.response?.data?.message || err?.message || 'Could not build preview.');
        setPreview(null);
      } finally {
        if (seq === previewSeq.current) setPreviewLoading(false);
      }
    },
    [leadId]
  );

  // On template selection, resolve defaults for the variable fields.
  const handleSelect = async (key) => {
    setSelectedKey(key);
    await refreshPreview(key, {});
  };

  // On a variable field edit, remember the override and re-preview.
  const handleOverride = async (varKey, value) => {
    const next = { ...overrides, [varKey]: value };
    setOverrides(next);
    await refreshPreview(selectedKey, next);
  };

  const selectedTemplate = useMemo(
    () => (templates || []).find((t) => t.key === selectedKey) || null,
    [templates, selectedKey]
  );
  const metadata = selectedTemplate?.meta || null;

  const previewSegments = useMemo(
    () => buildPreviewSegments(preview?.body, preview?.variables || []),
    [preview?.body, preview?.variables]
  );

  const handleSend = async () => {
    setSending(true);
    setPreviewError('');
    try {
      await sendWhatsappTemplate({ leadId, templateKey: selectedKey, overrides });
      push('WhatsApp message sent successfully', 'success');
      onClose();
      onSent?.(selectedKey);
    } catch (err) {
      push(err?.response?.data?.message || err?.message || 'Could not send the WhatsApp message', 'danger');
    } finally {
      setSending(false);
    }
  };

  const sendDisabled = !preview || !preview.ready || sending || previewLoading || !preview.recipient;

  // Compact footer status line — always occupies the same slot.
  let footerNote = null;
  if (!recipientPhone) {
    footerNote = { color: 'error.main', text: 'No mobile number — sending disabled', warn: true };
  } else if (!templates && !templatesError) {
    footerNote = { color: 'text.disabled', text: 'Loading templates…' };
  } else if (!selectedKey || !preview) {
    footerNote = { color: 'text.disabled', text: 'Select a template to continue' };
  } else if (preview.ready) {
    footerNote = { color: 'success.main', text: `Ready — ${preview.recipient}`, ok: true };
  } else {
    footerNote = {
      color: 'warning.main',
      text: `Missing: ${(preview.missing || []).map((m) => m.label).join(', ')}`,
      warn: true,
    };
  }

  const showErrors = !preview && previewError;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* ── Fixed recipient / context strip (modal only — the sidebar's own header already shows student identity) ── */}
      {showRecipientStrip && (
        <Box
          sx={{
            px: 2.5,
            py: 1,
            flexShrink: 0,
            borderTop: 1,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
          }}
        >
          <Avatar
            sx={{
              width: 30,
              height: 30,
              fontSize: 11.5,
              fontWeight: 700,
              bgcolor: 'primary.soft',
              color: 'primary.main',
              flexShrink: 0,
            }}
          >
            {initialsOf(lead?.studentName)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.2 }}>
              Student
            </Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {lead?.studentName || '—'}
            </Typography>
          </Box>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.2 }}>
              Phone
            </Typography>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, fontFamily: 'Menlo, Consolas, monospace', lineHeight: 1.3 }}>
              {recipientPhone || '—'}
            </Typography>
          </Box>
          <Box sx={{ ml: 'auto', textAlign: 'right', minWidth: 0 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', lineHeight: 1.2 }}>
              From
            </Typography>
            <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12.5, fontWeight: 600, fontFamily: 'Menlo, Consolas, monospace', lineHeight: 1.3 }}>
              {preview?.fromNumber || '—'}
              <WhatsAppIcon sx={{ fontSize: 12, color: WA_GREEN }} />
            </Typography>
          </Box>
        </Box>
      )}

      {/* ── Fixed template selector ───────────────────────────────── */}
      <Box sx={{ px: 2.5, py: 1.25, flexShrink: 0, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.625 }}>
          Template
        </Typography>

        {!templatesError && !templates && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 40, color: 'text.disabled', fontSize: 12.5 }}>
            <CircularProgress size={14} />
            Loading templates…
          </Box>
        )}

        {templates && templates.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', height: 40, color: 'text.disabled', fontSize: 12.5 }}>
            No WhatsApp templates are configured yet.
          </Box>
        )}

        {templates && templates.length > 0 && (
          <Select
            value={selectedKey}
            onChange={(e) => handleSelect(e.target.value)}
            displayEmpty
            fullWidth
            IconComponent={ExpandMoreIcon}
            renderValue={(key) => {
              const t = (templates || []).find((x) => x.key === key);
              return t ? t.title : (
                <Typography sx={{ color: 'text.disabled', fontWeight: 500 }}>Select an approved template…</Typography>
              );
            }}
            sx={{
              height: 40,
              fontSize: 13.5,
              fontWeight: 600,
              bgcolor: 'background.paper',
              borderRadius: 1.5,
              '& .MuiSelect-outlined': { py: 0 },
            }}
          >
            {templates.map((t) => (
              <MenuItem key={t.key} value={t.key} sx={{ whiteSpace: 'normal' }}>
                <Box sx={{ py: 0.25, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>{t.title}</Typography>
                  {t.description && (
                    <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.35 }}>{t.description}</Typography>
                  )}
                </Box>
              </MenuItem>
            ))}
          </Select>
        )}

        {selectedTemplate && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75, minHeight: 20 }}>
            <Typography sx={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 11, color: 'text.secondary' }}>
              {selectedTemplate.metaName}
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>·</Typography>
            <Typography sx={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 11, color: 'text.secondary' }}>
              {metadata?.language || selectedTemplate.languageCode}
            </Typography>
            {metadata ? (
              <>
                <Chip
                  size="small"
                  label={metadata.status || '—'}
                  color={metaStatusColor(metadata.status)}
                  variant="outlined"
                  sx={{ fontSize: 10.5, height: 20, '& .MuiChip-label': { px: 1 } }}
                />
                {metadata.category && (
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{metadata.category}</Typography>
                )}
                {metadata.id != null && (
                  <Typography
                    sx={{ fontFamily: 'Menlo, Consolas, monospace', fontSize: 10.5, color: 'text.disabled' }}
                    title={`Meta template ID: ${metadata.id}`}
                  >
                    ID {metadata.id}
                  </Typography>
                )}
              </>
            ) : (
              <Typography
                sx={{ fontSize: 11, color: 'text.disabled' }}
                title="Real-time Meta template metadata is unavailable — showing the configured catalogue."
              >
                Live Meta metadata unavailable
              </Typography>
            )}
          </Box>
        )}
      </Box>

      {/* ── Single scrollable region: variables + live preview ───── */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2.5, py: 2, bgcolor: 'background.paper' }}>
        {!recipientPhone && (
          <Alert severity="warning" sx={{ mb: 1.5 }} iconMapping={{ warning: <WarningAmberIcon fontSize="small" /> }}>
            This lead has no mobile number — WhatsApp messages cannot be sent.
          </Alert>
        )}
        {templatesError && (
          <Alert severity="error" sx={{ mb: 1.5 }}>{templatesError}</Alert>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: 2.5,
            '@media (min-width: 640px)': {
              gridTemplateColumns: 'minmax(0, 42fr) minmax(0, 58fr)',
            },
          }}
        >
          {/* ── Template variables ────────────────────────────────── */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.125, minWidth: 0 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Message Variables
            </Typography>

            {preview && preview.variables.length > 0 ? (
              preview.variables.map((v) => (
                <VariableField
                  key={v.key}
                  label={v.label}
                  value={overrides[v.key] ?? v.value}
                  error={v.missing}
                  hint={v.hint}
                  onChange={(e) => handleOverride(v.key, e.target.value)}
                />
              ))
            ) : (
              <Typography sx={{ fontSize: 12.5, color: 'text.disabled', py: 2 }}>
                {previewLoading ? 'Resolving variables…' : 'Template variables will appear here after you select a template.'}
              </Typography>
            )}

            {preview && preview.variables.length > 0 && (
              <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.25 }}>
                Values are auto-filled from the lead — edit them if anything is missing or incorrect.
              </Typography>
            )}
          </Box>

          {/* ── Live WhatsApp-style preview ──────────────────────── */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              minHeight: 0,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: 'background.paper',
            }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 0.75,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <WhatsAppIcon sx={{ fontSize: 15, color: WA_GREEN }} />
              <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Message Preview
              </Typography>
              <Box sx={{ ml: 'auto', minWidth: 118, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                {previewLoading ? (
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, color: 'text.disabled', fontSize: 11.5 }}>
                    <CircularProgress size={12} />
                    Updating…
                  </Box>
                ) : preview ? (
                  preview.ready ? (
                    <Chip size="small" color="success" label="✓ Ready" sx={{ height: 22, fontSize: 11, '& .MuiChip-label': { px: 1.1 } }} />
                  ) : (
                    <Chip size="small" color="warning" label={`⚠ ${preview.missing.length} missing`} sx={{ height: 22, fontSize: 11, '& .MuiChip-label': { px: 1.1 } }} />
                  )
                ) : null}
              </Box>
            </Box>

            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                bgcolor: 'action.hover',
                px: 1.75,
                py: 1.5,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {showErrors ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main', fontSize: 12.5, my: 2 }}>
                  <WarningAmberIcon sx={{ fontSize: 15 }} />
                  {previewError}
                </Box>
              ) : preview ? (
                <Box
                  sx={{
                    maxWidth: '94%',
                    alignSelf: 'flex-end',
                    bgcolor: 'success.soft',
                    border: '1px solid',
                    borderColor: 'success.border',
                    borderRadius: 3,
                    borderTopRightRadius: 3,
                    px: 1.75,
                    py: 1.25,
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
                  }}
                >
                  <Typography
                    component="div"
                    sx={{
                      fontSize: 13.5,
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color: 'text.primary',
                    }}
                  >
                    {previewSegments ? (
                      previewSegments.map((seg, i) =>
                        seg.type === 'text' ? (
                          <span key={i}>{seg.value}</span>
                        ) : (
                          <VariableToken
                            key={i}
                            varDef={seg.varDef}
                            value={overrides[seg.varDef?.key] ?? seg.varDef?.value}
                            missing={seg.varDef?.missing}
                            onCommit={handleOverride}
                          />
                        )
                      )
                    ) : (
                      preview.textPreview
                    )}
                  </Typography>
                  {previewSegments && (
                    <Typography sx={{ fontSize: 10.5, color: 'text.disabled', mt: 0.5 }}>
                      Click any underlined value above to edit it in place.
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
                    <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>{clock}</Typography>
                    <DoneAllIcon sx={{ fontSize: 13, color: 'success.main' }} />
                  </Box>
                </Box>
              ) : (
                <Typography sx={{ fontSize: 12.5, color: 'text.disabled', my: 2 }}>
                  {previewLoading ? 'Building preview…' : 'Select a template to see the live message preview.'}
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ── Fixed footer ─────────────────────────────────────────── */}
      <Box
        sx={{
          px: 2.5,
          py: 1.25,
          flexShrink: 0,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 12, color: footerNote.color }}>
            {(footerNote.warn && <WarningAmberIcon sx={{ fontSize: 13, flexShrink: 0 }} />) ||
              (footerNote.ok && <DoneAllIcon sx={{ fontSize: 13, flexShrink: 0 }} />)}
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {footerNote.text}
            </Box>
          </Typography>
        </Box>

        <SecondaryButton size="small" onClick={onClose} disabled={sending || previewLoading}>
          Cancel
        </SecondaryButton>
        <PrimaryButton
          size="small"
          startIcon={<SendIcon sx={{ fontSize: 14 }} />}
          onClick={handleSend}
          disabled={sendDisabled}
          loading={sending}
          title={!preview?.ready ? 'Resolve all required variables first' : 'Send via company WhatsApp number'}
        >
          {sending ? 'Sending…' : 'Send Message'}
        </PrimaryButton>
      </Box>
    </Box>
  );
}
