import { parseTime } from './timeSlots.js';

const r2 = (n) => Math.round(n * 100) / 100;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => { if (!a.length) return 0; const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

/** Overlap (minutes) of [a,b) with the night window, using real datetimes; handles cross-midnight. */
export function nightOverlap(a, b, nightStart, nightEnd) {
  const ns = parseTime(nightStart), ne = parseTime(nightEnd);
  if (ns === null || ne === null || ns === ne) return 0;
  let total = 0;
  for (let d = Math.floor(a / 1440) - 1; d <= Math.floor(b / 1440); d++) {
    const ws = d * 1440 + ns, we = ne > ns ? d * 1440 + ne : (d + 1) * 1440 + ne;
    total += Math.max(0, Math.min(b, we) - Math.max(a, ws));
  }
  return total;
}

const zero = () => ({ dutyMin: 0, withdrawalMin: 0, restMin: 0, nightMin: 0, shiftCount: 0 });
const hours = (z) => ({
  dutyHours: r2(z.dutyMin / 60), withdrawalHours: r2(z.withdrawalMin / 60), restHours: r2(z.restMin / 60),
  nightHours: r2(z.nightMin / 60), dayHours: r2((z.dutyMin - z.nightMin) / 60), shiftCount: z.shiftCount,
});

export function summarize(records, { shiftTypes, settings }) {
  const types = new Map(shiftTypes.map((t) => [t.id, t]));
  const sorted = [...records].sort((a, b) =>
    String(a.personnelId) < String(b.personnelId) ? -1 : String(a.personnelId) > String(b.personnelId) ? 1 : a.startMin - b.startMin);
  const acc = { overall: zero(), person: {}, group: {}, post: {}, day: {} };
  const get = (m, k) => (m[k] ??= zero());
  const meta = {};
  const prevDutyEnd = {};
  for (const r of sorted) {
    const t = types.get(r.shiftTypeId); if (!t) continue;
    const len = r.endMin - r.startMin;
    const row = zero();
    if (t.countsAsDuty) {
      row.dutyMin = len;
      row.nightMin = nightOverlap(r.startMin, r.endMin, settings.nightStart, settings.nightEnd);
      if (prevDutyEnd[r.personnelId] !== r.startMin) row.shiftCount = 1;
      prevDutyEnd[r.personnelId] = r.endMin;
    }
    if (t.countsAsWithdrawal) row.withdrawalMin = len;
    if (t.countsAsRest) row.restMin = len;
    meta[r.personnelId] ??= r.groupId;
    for (const z of [acc.overall, get(acc.person, r.personnelId), get(acc.group, r.groupId), get(acc.post, r.postId), get(acc.day, r.date)])
      for (const k of Object.keys(row)) z[k] += row[k];
  }
  const conv = (m) => Object.fromEntries(Object.entries(m).map(([k, z]) => [k, hours(z)]));
  const byPersonnel = Object.fromEntries(Object.entries(acc.person).map(([k, z]) => [k, { groupId: meta[k], ...hours(z) }]));
  const duties = Object.values(byPersonnel).map((p) => p.dutyHours);
  return {
    overall: hours(acc.overall), byPersonnel, byGroup: conv(acc.group), byPost: conv(acc.post), byDay: conv(acc.day),
    aggregates: {
      personnelCount: duties.length,
      averageDutyHours: r2(mean(duties)), maximumDutyHours: duties.length ? Math.max(...duties) : 0,
      minimumDutyHours: duties.length ? Math.min(...duties) : 0, dutyHoursStdDev: r2(std(duties)),
    },
  };
}

/** Raw differences only — deliberately no score, no ranking. */
export function fairnessOf(byPersonnel) {
  const rows = Object.entries(byPersonnel).map(([id, s]) => ({ id, ...s }));
  const diff = (rs, k) => (rs.length ? r2(Math.max(...rs.map((r) => r[k])) - Math.min(...rs.map((r) => r[k]))) : 0);
  const mk = (rs) => ({
    dutyHourDifference: diff(rs, 'dutyHours'), nightHourDifference: diff(rs, 'nightHours'),
    withdrawalHourDifference: diff(rs, 'withdrawalHours'), shiftCountDifference: diff(rs, 'shiftCount'),
    restHourDifference: diff(rs, 'restHours'), personnelCompared: rs.length,
  });
  const groups = {};
  for (const r of rows) (groups[r.groupId] ??= []).push(r);
  return { overall: mk(rows), byGroup: Object.fromEntries(Object.entries(groups).map(([g, rs]) => [g, mk(rs)])) };
}
