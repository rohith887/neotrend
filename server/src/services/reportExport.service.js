const ExcelJS = require('exceljs');

const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const fmtTime = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
};

const cellVal = (v) => (v === null || v === undefined ? '' : v);

const THIN = { style: 'thin', color: { argb: 'FF9E9E9E' } };
const BODY_BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const applySheetStyle = (ws, headerRowIndex, bodyStart, numCols, freeze) => {
  ws.views = [{ state: 'frozen', ySplit: freeze }];
  const header = ws.getRow(headerRowIndex);
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = BODY_BORDER;
  });
  header.height = 24;
};

const colWidth = (ws, cols) => {
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });
};

const buildWorkbook = ({ rows, remarkRows }) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TASA CRM';
  wb.created = new Date();

  /* ── Sheet 1 — Lead Management ─────────────────────────────────── */
  const leadCols = [
    { key: 'referenceId',              header: 'Lead ID',                  width: 16 },
    { key: 'studentName',              header: 'Student Name',             width: 24 },
    { key: 'phone',                    header: 'Phone',                    width: 16 },
    { key: 'email',                    header: 'Email',                    width: 26 },
    { key: 'countryInterested',        header: 'Country',                  width: 16 },
    { key: 'preferredUniversity',      header: 'Preferred University',     width: 28 },
    { key: 'intake',                   header: 'Intake',                   width: 12 },
    { key: 'leadSource',               header: 'Lead Source',              width: 18 },
    { key: 'assignedAgent',            header: 'Assigned Agent',           width: 20 },
    { key: 'status',                   header: 'Status',                   width: 18 },
    { key: 'priority',                 header: 'Priority',                 width: 12 },
    { key: 'createdDate',              header: 'Created Date',             width: 18 },
    { key: 'lastFollowUp',             header: 'Last Follow-up',           width: 18 },
    { key: 'nextFollowUp',             header: 'Next Follow-up',           width: 18 },
  ];

  const ws1 = wb.addWorksheet('Lead Management', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws1.addRow(['Lead Management Report']);
  ws1.mergeCells(1, 1, 1, leadCols.length);
  const title1 = ws1.getRow(1);
  title1.height = 28;
  title1.getCell(1).font = { bold: true, size: 15, name: 'Calibri' };
  title1.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  title1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

  const headerRow1 = ws1.getRow(2);
  leadCols.forEach((c, i) => { headerRow1.getCell(i + 1).value = c.header; });
  applySheetStyle(ws1, 2, 3, leadCols.length, 2);
  colWidth(ws1, leadCols);

  rows.forEach((r, ri) => {
    const row = ws1.getRow(ri + 3);
    leadCols.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      if (c.key === 'createdDate' || c.key === 'lastFollowUp' || c.key === 'nextFollowUp') {
        cell.value = cellVal(r[c.key]) ? fmtDate(r[c.key]) : '';
      } else {
        cell.value = cellVal(r[c.key]);
      }
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = BODY_BORDER;
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FC' } };
    });
    row.height = 20;
  });

  /* ── Sheet 2 — Remarks ─────────────────────────────────────────── */
  const remBase = ['Remark 1', 'Remark 1 Author', 'Remark 1 Date', 'Remark 1 Time',
                   'Remark 2', 'Remark 2 Author', 'Remark 2 Date', 'Remark 2 Time'];
  const remCols = [
    { key: 'referenceId',  header: 'Lead ID',          width: 16 },
    { key: 'studentName',  header: 'Student/Lead Name', width: 24 },
    { key: 'disposition',  header: 'Disposition',       width: 20 },
    ...remBase.map((h, i) => ({ key: `r${(i < 4 ? 1 : 2)}_${['text', 'author', 'date', 'time'][i % 4]}`, header: h, width: [40, 20, 18, 14][i % 4] })),
  ];

  const ws2 = wb.addWorksheet('Remarks', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws2.addRow(['Remarks Report']);
  ws2.mergeCells(1, 1, 1, remCols.length);
  const title2 = ws2.getRow(1);
  title2.height = 28;
  title2.getCell(1).font = { bold: true, size: 15, name: 'Calibri' };
  title2.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  title2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

  const headerRow2 = ws2.getRow(2);
  remCols.forEach((c, i) => { headerRow2.getCell(i + 1).value = c.header; });
  applySheetStyle(ws2, 2, 3, remCols.length, 2);
  colWidth(ws2, remCols);

  remarkRows.forEach((r, ri) => {
    const row = ws2.getRow(ri + 3);
    remCols.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = cellVal(r[c.key]);
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = BODY_BORDER;
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9FC' } };
    });
    row.height = 46;
  });

  return wb;
};

const writeBuffer = async (wb) => wb.xlsx.writeBuffer();

module.exports = { buildWorkbook, writeBuffer };
