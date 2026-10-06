/**
 * CrmListShell — shared visual shell for all CRM list/management pages.
 *
 * Provides one consistent page structure:
 *   Title + subtitle (+ optional header action, e.g. "Add X")
 *   Saved-view tabs (optional, underline style — the one treatment every
 *   list page uses; unrelated to AppTabs, which stays the form/dialog tab
 *   component)
 *   Search + filter toolbar (passed to the child <DataTable>'s own `toolbar`)
 *   Bulk-action banner (shown when rows are selected)
 *   Table container (border, rounded bottom, no-top-border when tabs present)
 *   Error alert
 *
 * NEVER contains business logic — purely presentational scaffolding.
 *
 * Props
 * ─────
 * title          string       Page heading
 * subtitle       string       Muted sub-heading
 * headerActions  ReactNode    Rendered at the end of the title row (e.g. an
 *                              "Add Lead" PrimaryButton) — optional.
 * tabs           [{key,label,count?}] Saved-view tabs (optional). `count`,
 *                              when given, renders dimmed after the label.
 * activeTab      string       Active tab key
 * onTabChange    fn(key)      Tab change handler
 * error          ReactNode|null Renders an error alert when truthy — a plain
 *                              string or richer JSX (e.g. a bolded prefix)
 * onRetry        fn           Retry callback for error alert (omit for no
 *                              Retry action, matching a page that never had one)
 * bulkActions    ReactNode    Content shown in the selection banner
 * selection      string[]     Selected row IDs (triggers banner when non-empty)
 * sx             object       Merged onto the outer container's sx — for a
 *                              page that isn't a fixed-height/internal-scroll
 *                              table (e.g. one that scrolls with the rest of
 *                              the page), override `height`/`overflow` here.
 * children       ReactNode    The <DataTable> itself (full width/height)
 */
import { Alert, Box, Button, Typography } from '@mui/material';

/* ── Tab button — the one saved-view tab treatment for list pages ── */
function TabButton({ label, count, active, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      sx={{
        px: 1.5,
        py: 0.875,
        border: 'none',
        borderRadius: 0,
        bgcolor: 'transparent',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        lineHeight: 1,
        color: active ? 'primary.main' : 'text.secondary',
        borderBottom: '2px solid',
        borderBottomColor: active ? 'primary.main' : 'transparent',
        mb: '-1px',
        whiteSpace: 'nowrap',
        transition: 'color 120ms ease, border-color 120ms ease',
        '&:hover': { color: active ? 'primary.main' : 'text.primary' },
      }}
    >
      {label}
      {count != null && (
        <Box component="span" sx={{ ml: 0.5, fontWeight: 500, color: 'text.disabled' }}>
          ({count})
        </Box>
      )}
    </Box>
  );
}

export default function CrmListShell({
  title,
  subtitle,
  headerActions,
  tabs,
  activeTab,
  onTabChange,
  error,
  onRetry,
  bulkActions,
  selection = [],
  sx,
  children,
}) {
  const hasTabs    = Array.isArray(tabs) && tabs.length > 0;
  const hasBulk    = selection.length > 0 && bulkActions;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...sx }}>

      {/* ── Page title (+ optional header action) ───────────────── */}
      <Box sx={{ flexShrink: 0, pb: hasTabs ? 0 : 1, display: 'flex', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: 'text.primary', lineHeight: 1.3 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.25 }}>
              {subtitle}
            </Typography>
          )}
        </Box>
        {headerActions && (
          <Box sx={{ flexShrink: 0 }}>{headerActions}</Box>
        )}
      </Box>

      {/* ── Saved-view tabs ─────────────────────────────────────── */}
      {hasTabs && (
        <Box sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 0,
          borderBottom: 1,
          borderColor: 'divider',
          mt: 1,
        }}>
          {tabs.map((t) => (
            <TabButton
              key={t.key}
              label={t.label}
              count={t.count}
              active={activeTab === t.key}
              onClick={() => onTabChange?.(t.key)}
            />
          ))}
        </Box>
      )}

      {/* ── Error alert ─────────────────────────────────────────── */}
      {error && (
        <Alert
          severity="error"
          sx={{ mt: 1, flexShrink: 0 }}
          action={onRetry && <Button size="small" color="error" onClick={onRetry}>Retry</Button>}
        >
          <Typography sx={{ fontSize: 13 }}>{error}</Typography>
        </Alert>
      )}

      {/* ── Bulk-selection banner ────────────────────────────────── */}
      {hasBulk && (
        <Box sx={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          bgcolor: 'primary.soft',
          borderBottom: 1,
          borderColor: 'primary.border',
          borderTop: hasTabs ? 'none' : (1),
          borderTopColor: 'divider',
        }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'primary.main', mr: 0.5 }}>
            {selection.length} selected
          </Typography>
          {bulkActions}
        </Box>
      )}

      {/* ── Table container — exact LeadManagement styling ──────── */}
      <Box sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        border: 1,
        borderColor: 'divider',
        /* No top border when tabs are present (tab row already has a bottom border) */
        borderTop: hasTabs ? 'none' : undefined,
        borderRadius: hasTabs ? '0 0 6px 6px' : 1.5,
        bgcolor: 'background.paper',
        overflow: 'hidden',
        mt: hasTabs ? 0 : 0,
      }}>
        {children}
      </Box>
    </Box>
  );
}
