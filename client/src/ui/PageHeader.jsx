import { Box, Breadcrumbs, Link, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

/**
 * PageHeader — breadcrumb, large title, subtitle, and action buttons.
 * crumb: array of { label, href? } — last item is the current page.
 * MUI migration — same API and layout as before, styled from muiTheme.js.
 */
export default function PageHeader({ title, subtitle, crumb = [], actions, children }) {
  return (
    <Box
      component="header"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 1.75,
        flexWrap: 'wrap',
        mb: 2.25,
        flexShrink: 0,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {crumb.length > 0 && (
          <Breadcrumbs
            aria-label="breadcrumb"
            separator={<ChevronRightIcon aria-hidden="true" sx={{ fontSize: 12, color: 'divider' }} />}
            sx={{
              mb: 1,
              '& .MuiBreadcrumbs-ol': { gap: 0.5 },
              '& .MuiBreadcrumbs-separator': { mx: 0.25 },
            }}
          >
            {crumb.map((c, i) => {
              const last = i === crumb.length - 1;
              if (last || !c.href) {
                return (
                  <Typography
                    key={i}
                    component="span"
                    sx={{
                      fontSize: 12,
                      color: last ? 'text.primary' : 'text.secondary',
                      fontWeight: last ? 600 : 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.label}
                  </Typography>
                );
              }
              return (
                <Link
                  key={i}
                  href={c.href}
                  onClick={(e) => e.preventDefault()}
                  underline="hover"
                  sx={{ fontSize: 12, color: 'text.secondary', '&:hover': { color: 'primary.main' } }}
                >
                  {c.label}
                </Link>
              );
            })}
          </Breadcrumbs>
        )}
        <Typography
          component="h1"
          sx={{ fontSize: 20, fontWeight: 700, color: 'text.primary', letterSpacing: '-0.01em', lineHeight: 1.3 }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
          {actions}
        </Box>
      )}
      {children}
    </Box>
  );
}
