const escapeCsv = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

const toCsv = (rows, columns) => {
  if (!columns || columns.length === 0) return '';
  const header = columns.map((c) => escapeCsv(c.label)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsv(c.value(row))).join(',')
  );
  return [header, ...lines].join('\r\n');
};

module.exports = { toCsv };
