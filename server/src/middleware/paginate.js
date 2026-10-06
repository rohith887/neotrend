/**
 * Builds a mongoose query from standard list params:
 * ?page=1&limit=10&search=&sort=&filters...
 *
 * Accepts either:
 *   parseListQuery(req, allowedFields)        — Express request object
 *   parseListQuery(queryObj, allowedFields)   — raw req.query plain object
 */
const parseListQuery = (reqOrQuery, allowedFields = []) => {
  // Support both the Express req object and a bare req.query plain object.
  const q = reqOrQuery && typeof reqOrQuery.query === 'object' ? reqOrQuery.query : reqOrQuery || {};

  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 10, 1), 100);
  const skip = (page - 1) * limit;

  const query = {};
  const sort = {};

  // Generic field filters
  Object.keys(q).forEach((key) => {
    if (['page', 'limit', 'search', 'sort', 'from', 'to'].includes(key)) return;
    const val = q[key];
    if (val === '' || val === undefined) return;
    if (allowedFields.includes(key)) {
      if (Array.isArray(val)) {
        query[key] = { $in: val };
      } else if (String(val).startsWith('>=') || String(val).startsWith('<=')) {
        const op = String(val).startsWith('>=') ? '$gte' : '$lte';
        query[key] = { [op]: String(val).slice(2) };
      } else {
        query[key] = val;
      }
    }
  });

  // Date range on createdAt
  if (q.from || q.to) {
    query.createdAt = {};
    if (q.from) query.createdAt.$gte = new Date(q.from);
    if (q.to) query.createdAt.$lte = new Date(q.to);
  }

  // sort=field|-field,field2
  if (q.sort) {
    q.sort.split(',').forEach((part) => {
      if (part.startsWith('-')) sort[part.slice(1)] = -1;
      else sort[part] = 1;
    });
  } else {
    sort.createdAt = -1;
  }

  const meta = { page, limit, skip };
  return { query, sort, meta };
};

module.exports = { parseListQuery };
