import { useId } from 'react';
import { IconButton, InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

/**
 * SearchField — search input with a leading search icon and an optional
 * clear button. Fully controlled via `value`/`onChange`.
 */
export default function SearchField({
  value = '',
  onChange,
  placeholder = 'Search…',
  label,
  disabled,
  size = 'small',
  fullWidth = true,
  clearable = true,
  autoFocus,
  onClear,
  onSearch: _onSearch,
  ...props
}) {
  const inputId = useId();
  const clear = () => {
    if (onClear) onClear();
    else onChange?.({ target: { value: '' } });
  };

  return (
    <TextField
      id={inputId}
      variant="outlined"
      size={size}
      fullWidth={fullWidth}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      label={label}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={label || placeholder}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" sx={{ color: 'text.disabled' }} />
            </InputAdornment>
          ),
          endAdornment:
            clearable && value ? (
              <InputAdornment position="end">
                <IconButton size="small" edge="end" onClick={clear} aria-label="Clear search">
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
        },
      }}
      {...props}
    />
  );
}
