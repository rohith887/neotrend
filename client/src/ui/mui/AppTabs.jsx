import { Box, Tab, Tabs } from '@mui/material';

/**
 * AppTabs — MUI tab bar. `tabs`: [{ id, label, icon, disabled, iconPosition }].
 * Controlled via `value`/`onChange`. Any `children` render below the tabs as a
 * panel container.
 */
export default function AppTabs({ tabs = [], value, onChange, children, ariaLabel, ...rest }) {
  return (
    <Box>
      <Tabs
        value={value}
        onChange={(_, next) => onChange?.(next)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label={ariaLabel}
        {...rest}
      >
        {tabs.map((t) => (
          <Tab
            key={t.id}
            value={t.id}
            label={t.label}
            icon={t.icon}
            iconPosition={t.iconPosition ?? (t.icon ? 'start' : undefined)}
            disabled={t.disabled}
          />
        ))}
      </Tabs>
      {children && <Box sx={{ pt: 2 }}>{children}</Box>}
    </Box>
  );
}
