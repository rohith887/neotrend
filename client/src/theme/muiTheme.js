import { alpha, createTheme } from '@mui/material/styles';

const FONT_FAMILY =
  "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/* ── Design tokens (single source of truth) ─────────────────────── */
const TOKENS = {
  light: {
    primary: '#0f766e',
    primaryHover: '#115e59',
    primarySoft: '#e6f5f3',
    primaryBorder: '#a7d9d3',
    violet: '#6f42c1',
    violetSoft: '#f0ebfa',
    success: '#2eca6a',
    successSoft: '#e8f9ef',
    successBorder: '#b8eed0',
    warning: '#ff9f43',
    warningSoft: '#fff4e6',
    warningBorder: '#ffd9a8',
    danger: '#ff4d4d',
    dangerSoft: '#fff0f0',
    dangerBorder: '#ffb3b3',
    info: '#0dcaf0',
    infoSoft: '#e3f8fc',
    infoBorder: '#a8e9f5',
    bg: '#f6f8fb',
    surface: '#ffffff',
    surface2: '#f6f8fb',
    surface3: '#eef0fd',
    border: '#e5e7eb',
    borderStrong: '#d1d5db',
    text1: '#212529',
    text2: '#444444',
    text3: '#6c757d',
  },
  dark: {
    primary: '#2dd4bf',
    primaryHover: '#5eead4',
    primarySoft: 'rgba(45, 212, 191, 0.15)',
    primaryBorder: 'rgba(45, 212, 191, 0.35)',
    violet: '#a78bfa',
    violetSoft: 'rgba(167, 139, 250, 0.14)',
    success: '#34d399',
    successSoft: 'rgba(52, 211, 153, 0.14)',
    successBorder: 'rgba(52, 211, 153, 0.35)',
    warning: '#fbbf24',
    warningSoft: 'rgba(251, 191, 36, 0.14)',
    warningBorder: 'rgba(251, 191, 36, 0.35)',
    danger: '#f87171',
    dangerSoft: 'rgba(248, 113, 113, 0.14)',
    dangerBorder: 'rgba(248, 113, 113, 0.35)',
    info: '#38bdf8',
    infoSoft: 'rgba(56, 189, 248, 0.14)',
    infoBorder: 'rgba(56, 189, 248, 0.35)',
    bg: '#0f1422',
    surface: '#1a2138',
    surface2: '#222d45',
    surface3: '#1d2840',
    border: '#2a3556',
    borderStrong: '#3a4a6e',
    text1: '#e8eaf2',
    text2: '#9aa3bc',
    text3: '#5e6f94',
  },
};

const SHADOWS = {
  xs: '0 1px 3px rgba(0, 0, 0, 0.06)',
  sm: '0 1px 4px rgba(0, 0, 0, 0.07)',
  md: '0 4px 12px rgba(0, 0, 0, 0.09)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.11)',
};

/**
 * Build the app-wide MUI theme for the given mode.
 * @param {'light'|'dark'} mode
 */
export function createAppTheme(mode = 'light') {
  const c = TOKENS[mode] || TOKENS.light;
  const isDark = mode === 'dark';

  const shadows = isDark
    ? {
        xs: '0 1px 3px rgba(0, 0, 0, 0.30)',
        sm: '0 1px 4px rgba(0, 0, 0, 0.35)',
        md: '0 4px 12px rgba(0, 0, 0, 0.40)',
        lg: '0 8px 24px rgba(0, 0, 0, 0.50)',
      }
    : SHADOWS;

  const focusRing = `0 0 0 3px ${alpha(c.primary, 0.12)}`;

  const theme = createTheme({
    palette: {
      mode,
      primary: { main: c.primary, hover: c.primaryHover, soft: c.primarySoft, border: c.primaryBorder, contrastText: '#ffffff' },
      secondary: { main: c.violet, soft: c.violetSoft, contrastText: '#ffffff' },
      success: { main: c.success, soft: c.successSoft, border: c.successBorder, contrastText: '#ffffff' },
      warning: { main: c.warning, soft: c.warningSoft, border: c.warningBorder, contrastText: '#ffffff' },
      error: { main: c.danger, soft: c.dangerSoft, border: c.dangerBorder, contrastText: '#ffffff' },
      info: { main: c.info, soft: c.infoSoft, border: c.infoBorder, contrastText: '#ffffff' },
      background: { default: c.bg, paper: c.surface },
      text: { primary: c.text1, secondary: c.text2, disabled: c.text3 },
      divider: c.border,
      action: { hover: c.surface2, selected: c.primarySoft, disabled: c.text3 },
    },

    shape: { borderRadius: 8 },

    spacing: 8,

    typography: {
      fontFamily: FONT_FAMILY,
      fontSize: 14,
      htmlFontSize: 14,
      h1: { fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em' },
      h2: { fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' },
      h3: { fontSize: 18, fontWeight: 700 },
      h4: { fontSize: 16, fontWeight: 700 },
      h5: { fontSize: 14, fontWeight: 700 },
      h6: { fontSize: 13, fontWeight: 700 },
      subtitle1: { fontSize: 14, fontWeight: 500 },
      subtitle2: { fontSize: 12.5, fontWeight: 600 },
      body1: { fontSize: 14, lineHeight: 1.6 },
      body2: { fontSize: 13, lineHeight: 1.55 },
      button: { fontSize: 13, fontWeight: 600, textTransform: 'none' },
      caption: { fontSize: 12, fontWeight: 500 },
      overline: { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' },
    },

    components: {
      /* ── Global baseline (former crm.css rules) ─────────────────── */
      MuiCssBaseline: {
        styleOverrides: {
          'html, body, #root': {
            height: '100%',
          },
          body: {
            color: c.text2,
          },
          '*': {
            scrollbarWidth: 'thin',
            scrollbarColor: `${c.borderStrong} transparent`,
          },
          a: {
            color: c.primary,
            textDecoration: 'none',
            transition: 'color 150ms ease',
            '&:hover': { color: c.primaryHover },
          },
          button: {
            fontFamily: 'inherit',
          },
          '::selection': {
            backgroundColor: c.primarySoft,
            color: c.primary,
          },
          ':focus-visible': {
            outline: `2px solid ${c.primary}`,
            outlineOffset: 2,
            borderRadius: 6,
          },
          '*::-webkit-scrollbar': {
            width: 6,
            height: 6,
          },
          '*::-webkit-scrollbar-track': {
            backgroundColor: 'transparent',
          },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: c.borderStrong,
            borderRadius: 999,
            '&:hover': { backgroundColor: c.text3 },
          },
        },
      },

      /* ── Button ─────────────────────────────────────────────────── */
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 8,
            fontFamily: FONT_FAMILY,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          },
          sizeSmall: { height: 30, paddingInline: 10, fontSize: 12.5 },
          sizeMedium: { height: 36, paddingInline: 14, fontSize: 13 },
          sizeLarge: { height: 44, paddingInline: 20, fontSize: 14 },
          containedPrimary: {
            boxShadow: shadows.sm,
            '&:hover': { boxShadow: shadows.md },
          },
          outlined: { borderColor: c.border },
          outlinedPrimary: {
            borderColor: c.primaryBorder,
            color: c.primary,
            '&:hover': { borderColor: c.primary, backgroundColor: c.primarySoft, color: c.primary },
          },
          text: {
            color: c.text2,
            '&:hover': { backgroundColor: c.surface2, color: c.text1 },
          },
        },
      },

      /* ── TextField / Select / Inputs ───────────────────────────── */
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            fontFamily: FONT_FAMILY,
            fontSize: 13.5,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: c.borderStrong },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: c.primary,
              boxShadow: focusRing,
            },
            '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: c.danger },
          },
          notchedOutline: { borderColor: c.border },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontFamily: FONT_FAMILY,
            '&.Mui-focused': { color: c.primary },
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: { fontFamily: FONT_FAMILY, fontSize: 13.5 },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small', variant: 'outlined' },
      },
      MuiSelect: {
        defaultProps: { size: 'small' },
      },

      /* ── Card / Paper ──────────────────────────────────────────── */
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${c.border}`,
            backgroundColor: c.surface,
            boxShadow: shadows.xs,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          backgroundImage: 'none',
          rounded: { borderRadius: 12 },
          elevation1: { boxShadow: shadows.sm },
          elevation2: { boxShadow: shadows.md },
          elevation3: { boxShadow: shadows.lg },
        },
      },

      /* ── Dialog ────────────────────────────────────────────────── */
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 12,
            boxShadow: shadows.lg,
            backgroundColor: c.surface,
          },
        },
      },

      /* ── Tabs ──────────────────────────────────────────────────── */
      MuiTabs: {
        styleOverrides: {
          indicator: { backgroundColor: c.primary, height: 3, borderRadius: '3px 3px 0 0' },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontFamily: FONT_FAMILY,
            fontSize: 13,
            fontWeight: 500,
            minHeight: 44,
            color: c.text3,
            transition: 'color 150ms ease, background-color 150ms ease',
            '&.Mui-selected': { color: c.primary, fontWeight: 600 },
          },
        },
      },

      /* ── Chip ──────────────────────────────────────────────────── */
      MuiChip: {
        styleOverrides: {
          root: {
            fontFamily: FONT_FAMILY,
            fontSize: 12.5,
            fontWeight: 500,
            height: 28,
            borderRadius: 999,
          },
          colorDefault: {
            backgroundColor: c.surface2,
            color: c.text3,
            '&:hover': { backgroundColor: c.surface3, color: c.text1 },
          },
          colorPrimary: { backgroundColor: c.primarySoft, color: c.primary },
          colorSecondary: { backgroundColor: c.violetSoft, color: c.violet },
          colorSuccess: { backgroundColor: c.successSoft, color: c.success },
          colorError: { backgroundColor: c.dangerSoft, color: c.danger },
          colorWarning: { backgroundColor: c.warningSoft, color: c.warning },
          colorInfo: { backgroundColor: c.infoSoft, color: c.info },
        },
      },

      /* ── IconButton ────────────────────────────────────────────── */
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            color: c.text3,
            transition: 'background-color 150ms ease, color 150ms ease',
            '&:hover': { backgroundColor: c.surface2, color: c.text1 },
          },
          sizeSmall: { width: 30, height: 30 },
          sizeMedium: { width: 34, height: 34 },
        },
      },

      /* ── Table ─────────────────────────────────────────────────── */
      MuiTable: {
        styleOverrides: {
          root: { backgroundColor: 'transparent' },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            fontFamily: FONT_FAMILY,
            borderColor: c.border,
            fontSize: 13.5,
          },
          head: {
            backgroundColor: c.surface2,
            fontSize: 12.5,
            fontWeight: 600,
            color: c.text3,
            padding: '10px 18px',
            whiteSpace: 'nowrap',
            letterSpacing: '0.01em',
          },
          body: {
            fontSize: 14,
            fontWeight: 500,
            color: c.text1,
            padding: '12px 18px',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background-color 150ms ease',
            '&.MuiTableRow-hover:hover': { backgroundColor: c.surface2 },
            '&:last-of-type .MuiTableCell-root': { borderBottom: 'none' },
          },
        },
      },
    },
  });

  return {
    ...theme,
    shadows: theme.shadows.map((shadow, index) => (index === 1 ? shadows.sm : shadow)),
  };
}

/** Prebuilt light theme (matches `data-theme="light"`). */
export const muiLightTheme = createAppTheme('light');

/** Prebuilt dark theme (matches `data-theme="dark"`). */
export const muiDarkTheme = createAppTheme('dark');

export default createAppTheme;
