export const buildDialUri = ({ scheme, number, server }) => {
  const raw = String(number ?? '').trim();
  if (!raw) return null;
  const s = String(scheme || 'sip').trim().toLowerCase();
  if (s === 'tel') return `tel:${raw.replace(/[^\d+]/g, '')}`;
  if (s === 'sip') {
    const user = encodeURIComponent(raw);
    return server ? `sip:${user}@${server}` : `sip:${user}`;
  }
  return `${s}:${encodeURIComponent(raw)}`;
};

export const openInBrowserDial = (uri) => {
  if (!uri) return false;
  const anchor = document.createElement('a');
  anchor.href = uri;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return true;
};