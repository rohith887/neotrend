import { useId } from 'react';
import { Box, FormControl, InputLabel, MenuItem, Select } from '@mui/material';

/**
 * FilterSelect — labelled dropdown for toolbar/list filters.
 * options: [{ label, value }]
 *
 * The label is always floated (shrunk) so it never sits on top of the
 * placeholder/value, and the rendered value is truncated with an ellipsis
 * (with a native title) so long text like "All Statuses" never clips or
 * overlaps the dropdown arrow.
 */
export default function FilterSelect({
  label,
  value = '',
  onChange,
  options = [],
  disabled,
  size = 'small',
  fullWidth,
  placeholder,
  sx,
  ...props
}) {
  const id = useId();
  const labelId = useId();

  const selectedText = (v) => {
    const option = options.find((o) => o.value === v);
    return option ? option.label : (placeholder ?? '');
  };

  return (
    <FormControl size={size} fullWidth={fullWidth} disabled={disabled}>
      <InputLabel id={labelId} shrink>
        {label}
      </InputLabel>
      <Select
        id={id}
        labelId={labelId}
        value={value}
        label={label}
        onChange={onChange}
        displayEmpty={!!placeholder}
        renderValue={(v) => (
          <Box
            component="span"
            title={selectedText(v)}
            sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {selectedText(v)}
          </Box>
        )}
        sx={{ minWidth: 0, '& .MuiSelect-select': { textOverflow: 'ellipsis' }, ...sx }}
        {...props}
      >
        {placeholder && (
          <MenuItem value="" disabled>
            {placeholder}
          </MenuItem>
        )}
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
