import { Box, Card, CardContent, Typography } from '@mui/material';

export default function AppCard({
  title,
  subtitle,
  icon,
  actions,
  footer,
  children,
  sx,
  contentSx,
  ...rest
}) {
  return (
    <Card
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        ...sx,
      }}
      {...rest}
    >
      {(title || subtitle || actions) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 3,
            px: 2.5,
            pt: 2,
            pb: 0.5,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            {title && (
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                {icon}
                <Typography variant="h6" component="h3" sx={{ fontSize: 15, fontWeight: 600, m: 0 }}>
                  {title}
                </Typography>
              </Box>
            )}
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {actions && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>{actions}</Box>
          )}
        </Box>
      )}
      <CardContent sx={{ px: 2.5, py: 2, flex: 1, ...contentSx }}>{children}</CardContent>
      {footer && (
        <Box sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: 'divider' }}>{footer}</Box>
      )}
    </Card>
  );
}
