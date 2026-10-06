import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Checkbox,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import AppIconButton from './AppIconButton.jsx';

/* ==========================================================================
   DataTable — simple reusable MUI table with client-side sorting, pagination,
   loading skeleton, empty state and per-row actions. All colors, radii,
   spacing and typography come from muiTheme.js.

   columns: [{ key, label, render?(value, row), accessor?(row), sortable?,
               align?, width?, strong? }]

   Optional extras:
     toolbar   — ReactNode rendered above the table (flex-shrink: 0).
     tfoot     — ReactNode (usually a <TableRow>) rendered as a <tfoot>.
     selection / onSelectionChange — opt-in checkbox column; `selection` is an
               array of selected keyField values, `onSelectionChange` receives
               the next selection (select-all applies to the visible page).
     initialSortKey / initialSortDir — default sort applied on mount.
     rootSx    — sx for the outer flex-column wrapper.
     containerSx — sx for the scrollable table container.
   ========================================================================== */

const rowValue = (row, col) => (col.accessor ? col.accessor(row) : row?.[col.key]);

const SCROLLBAR_SX = {
  '&::-webkit-scrollbar': { width: 6, height: 6 },
  '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
  '&::-webkit-scrollbar-thumb': { bgcolor: 'action.disabled', borderRadius: 3 },
  '&::-webkit-scrollbar-thumb:hover': { bgcolor: 'action.active' },
};

const displayValue = (row, col) => {
  const v = rowValue(row, col);
  return col.render ? col.render(v, row) : v ?? '—';
};

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  keyField = 'id',
  dense = false,
  stickyHeader = true,
  initialPageSize = 10,
  pageSizeOptions = [10, 25, 50],
  emptyTitle = 'No records found',
  emptyText = 'Try adjusting your search or filters.',
  emptyAction,
  emptyCellSx,
  onRowClick,
  isRowClickable = () => true,
  renderActions,
  rowActions = [],
  selection,
  onSelectionChange,
  sortable = true,
  toolbar,
  tfoot,
  initialSortKey,
  initialSortDir = 'asc',
  rootSx,
  containerSx,
  /* Server-side (controlled) mode — when provided, overrides internal state */
  controlledPage,
  onPageChange,
  controlledPageSize,
  onPageSizeChange,
  controlledSortKey,
  controlledSortDir,
  onSortChange,
  totalCount,
  hidePagination = false,
}) {
  const isControlled = controlledPage !== undefined;
  const [internalPage, setInternalPage] = useState(0);
  const [internalPageSize, setInternalPageSize] = useState(initialPageSize);
  const [internalSortKey, setInternalSortKey] = useState(initialSortKey ?? null);
  const [internalSortDir, setInternalSortDir] = useState(initialSortDir);

  const page = isControlled ? controlledPage : internalPage;
  const setPage = isControlled
    ? (next) => (onPageChange || (() => {}))(null, next)
    : setInternalPage;
  const pageSize = controlledPageSize ?? internalPageSize;
  const setPageSize = isControlled ? (onPageSizeChange || (() => {})) : setInternalPageSize;
  const sortKey = controlledSortKey !== undefined ? controlledSortKey : internalSortKey;
  const setSortKey = isControlled ? (onSortChange || (() => {})) : setInternalSortKey;
  const sortDir = controlledSortDir !== undefined ? controlledSortDir : internalSortDir;
  const setSortDir = isControlled ? (() => {}) : setInternalSortDir;

  useEffect(() => {
    if (!isControlled) setInternalPage(0);
  }, [data]);

  const sorted = useMemo(() => {
    if (isControlled) return data;
    const col = columns.find((c) => c.key === sortKey);
    if (!sortKey || !col || !sortable) return data;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = rowValue(a, col);
      const vb = rowValue(b, col);
      if (va === vb) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [data, sortKey, sortDir, columns, sortable, isControlled]);

  const rows = isControlled ? sorted : sorted.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSort = (col) => {
    if (!sortable || !col.sortable) return;
    let nextDir;
    let nextKey;
    if (sortKey === col.key) {
      nextDir = sortDir === 'asc' ? 'desc' : 'asc';
      nextKey = col.key;
    } else {
      nextDir = 'asc';
      nextKey = col.key;
    }
    if (isControlled) {
      onSortChange?.(nextKey, nextDir);
    } else {
      setSortKey(nextKey);
      setSortDir(nextDir);
    }
  };

  /* Optional row-selection column — opt-in via `selection` + `onSelectionChange`.
     "Select all" only selects the rows on the current page. */
  const selectionMode = selection !== undefined;

  const isAllSelected =
    selectionMode && rows.length > 0 && rows.every((r) => selection.includes(r?.[keyField]));
  const isSomeSelected =
    selectionMode && !isAllSelected && rows.some((r) => selection.includes(r?.[keyField]));

  const toggleAll = () => {
    if (!selectionMode) return;
    const ids = rows.map((r) => r[keyField]);
    const next = new Set(selection);
    ids.forEach((id) => (isAllSelected ? next.delete(id) : next.add(id)));
    onSelectionChange?.([...next]);
  };

  const toggleOne = (id) => {
    if (!selectionMode) return;
    const next = new Set(selection);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange?.([...next]);
  };

  const showActions = !!renderActions || rowActions.length > 0;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%', flex: 1, minHeight: 0, ...rootSx }}>
      {toolbar}
      <TableContainer
        sx={{
          flex: 1, minHeight: 0,
          overflowX: 'auto', overflowY: 'auto',
          ...SCROLLBAR_SX,
          ...containerSx,
        }}
      >
        <Table size={dense ? 'small' : 'medium'} stickyHeader={stickyHeader} aria-label="Data table">
          <TableHead>
            <TableRow>
              {selectionMode && (
                <TableCell sx={{ width: 56, p: '10px 8px' }}>
                  <Checkbox
                    size="small"
                    checked={isAllSelected}
                    indeterminate={isSomeSelected}
                    onChange={toggleAll}
                    slotProps={{ input: { 'aria-label': 'Select all rows on this page' } }}
                    sx={{ p: 0.5 }}
                  />
                </TableCell>
              )}
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  align={col.align}
                  sortDirection={sortKey === col.key ? sortDir : false}
                  aria-sort={
                    sortKey === col.key
                      ? sortDir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                  sx={{
                    width: col.width,
                    minWidth: col.width,
                    maxWidth: col.width ? col.width + 40 : undefined,
                    cursor: sortable && col.sortable ? 'pointer' : undefined,
                    userSelect: 'none',
                    fontWeight: 600,
                    fontSize: 11,
                    letterSpacing: '0.03em',
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    whiteSpace: 'nowrap',
                    py: 0.75,
                    px: 1.5,
                    bgcolor: 'grey.50',
                    '&:hover': sortable && col.sortable ? { color: 'text.primary', bgcolor: 'grey.100' } : undefined,
                  }}
                  onClick={() => toggleSort(col)}
                >
                  {col.label}
                  {sortable && col.sortable && (
                    <Box
                      component="span"
                      aria-hidden="true"
                      sx={{ ml: 0.5, fontSize: 10, color: sortKey === col.key ? 'primary.main' : 'text.disabled' }}
                    >
                      {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </Box>
                  )}
                </TableCell>
              ))}
              {showActions && <TableCell align="right" sx={{ width: 64 }}>Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              Array.from({ length: Math.min(5, pageSize) }).map((_, r) => (
                <TableRow key={`skeleton-${r}`}>
                  {selectionMode && <TableCell sx={{ p: '12px 8px' }} />}
                  {columns.map((c) => (
                    <TableCell key={c.key} align={c.align}>
                      <Skeleton variant="text" width={`${50 + ((r * 13 + 30) % 45)}%`} />
                    </TableCell>
                  ))}
                  {showActions && <TableCell align="right" />}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (showActions ? 1 : 0) + (selectionMode ? 1 : 0)} align="center" sx={{ py: 6, ...emptyCellSx }}>
                  {emptyTitle && (
                    <Typography variant="h6" sx={{ mb: emptyText ? 0.5 : 0 }}>{emptyTitle}</Typography>
                  )}
                  {emptyText && (
                    <Typography variant="body2" color="text.secondary">{emptyText}</Typography>
                  )}
                  {emptyAction && <Box sx={{ mt: 2 }}>{emptyAction}</Box>}
                </TableCell>
              </TableRow>
            ) : (
            rows.map((row, rowIndex) => {
              const key = row?.[keyField] ?? rowIndex;
              // A row is only clickable when both a handler exists AND (when
              // given) `isRowClickable` says this specific row supports it —
              // e.g. a notifications table where only some rows link to a
              // lead. Defaults to always-clickable, so every existing
              // consumer of DataTable is unaffected.
              const clickable = !!onRowClick && isRowClickable(row);
                return (
                    <TableRow
                      key={key}
                      hover={clickable}
                      onClick={clickable ? () => onRowClick(row) : undefined}
                      sx={{
                        cursor: clickable ? 'pointer' : undefined,
                        transition: 'background-color 120ms ease',
                        ...(clickable && { '&:hover': { bgcolor: 'grey.50' } }),
                      }}
                    >
                      {selectionMode && (
                        <TableCell sx={{ p: '12px 8px' }} onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            size="small"
                            checked={selection.includes(row?.[keyField])}
                            onChange={() => toggleOne(row?.[keyField])}
                            slotProps={{ input: { 'aria-label': `Select row ${key}` } }}
                            sx={{ p: 0.5 }}
                          />
                        </TableCell>
                      )}
                      {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        align={col.align}
                        component="th"
                        scope="row"
                        sx={{
                          fontSize: 12.5,
                          py: 0.875,
                          px: 1.5,
                          borderBottom: '1px solid',
                          borderColor: 'divider',
                          whiteSpace: 'nowrap',
                          ...(col.strong ? { fontWeight: 600 } : undefined),
                        }}
                      >
                        {displayValue(row, col)}
                      </TableCell>
                    ))}
                    {showActions && (
                      <TableCell align="right">
                        {renderActions
                          ? renderActions(row)
                          : rowActions.map((a, i) => (
                              <AppIconButton
                                key={i}
                                title={a.label}
                                color={a.tone === 'danger' ? 'error' : 'default'}
                                onClick={() => a.onClick(row)}
                                size="small"
                              >
                                {a.icon}
                              </AppIconButton>
                            ))}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {(tfoot || !hidePagination) && (
        <Box
          sx={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'grey.50',
            minHeight: 44,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5 }}>{tfoot}</Box>
          {!hidePagination && (
            <TablePagination
              component="div"
              sx={{
                flexShrink: 0,
                '& .MuiTablePagination-toolbar': { minHeight: 44, py: 0 },
                '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 12.5, color: 'text.secondary' },
              }}
              count={totalCount ?? sorted.length}
              page={Math.min(page, Math.max(0, Math.ceil((totalCount ?? sorted.length) / pageSize) - 1))}
              onPageChange={(_, next) => setPage(next)}
              rowsPerPage={pageSize}
              onRowsPerPageChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
              rowsPerPageOptions={pageSizeOptions}
              labelRowsPerPage="Rows"
            />
          )}
        </Box>
      )}
    </Box>
  );
}
