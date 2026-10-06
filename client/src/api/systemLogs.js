import client from './client.js';

// GET /supervisor/system-logs — { data: [logs], meta: { total, page, limit, counts, ... } }
export const fetchSystemLogs = (params = {}) =>
  client.get('/supervisor/system-logs', { params }).then(({ data }) => data || {});

// GET /supervisor/system-log/meta — { data: { levels, modules, roles, users, leads, actions, counts } }
// Pass { role } to narrow the user list and { userId } to narrow the lead list
// (drives the Role → User → Lead filter cascade).
export const fetchSystemLogMeta = (params = {}) =>
  client.get('/supervisor/system-log/meta', { params }).then(({ data }) => data?.data || {});

// GET /supervisor/system-log/export — CSV or plain-text dump of current filters.
export const downloadSystemLogs = async (params = {}) => {
  const response = await client.get('/supervisor/system-log/export', {
    params,
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match ? match[1] : 'system-logs.csv';

  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};