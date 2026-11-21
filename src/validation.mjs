export function safeLink(value) {
  if (!value.trim()) return '';
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function attendanceTotal(profiles) {
  return profiles.filter(p => p.attendance === 'yes').reduce((n, p) => n + 1 + p.guests, 0);
}
