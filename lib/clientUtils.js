export const thDate = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export const thShort = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
// Behaviour comes from DB flags, never from the shift-type name.
export const kindOf = (t) => (t?.countsAsDuty ? 'duty' : t?.countsAsWithdrawal ? 'withdraw' : t?.countsAsRest ? 'rest' : 'other');
export const sevRank = { critical: 0, conflict: 1, warning: 2, info: 3 };
export const sevLabel = { critical: 'Critical', conflict: 'Conflict', warning: 'Warning', info: 'Info' };
export const stripRec = ({ uid, ...r }) => r;
export const download = (name, text, type = 'text/plain;charset=utf-8') => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
export const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
