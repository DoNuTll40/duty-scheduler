import { summarize, fairnessOf } from './calculator.js';
import { validateSchedule, HARD } from './validator.js';

// Deterministic greedy: swap whole-day assignments between two people of the same group.
// Never accepts a swap that adds hard violations; objective = sum of raw spreads (duty, night, withdrawal, shift count).
export function autoBalance(records, ctx, { maxIter = 300 } = {}) {
  const score = (rs) => {
    const st = summarize(rs, ctx), f = fairnessOf(st.byPersonnel);
    const hard = validateSchedule({ records: rs, ...ctx }).issues.filter((i) => HARD.has(i.severity)).length;
    const sp = Object.values(f.byGroup).reduce((a, g) => a + g.nightHourDifference * 4 + g.dutyHourDifference * 2 + g.withdrawalHourDifference + g.shiftCountDifference, 0);
    return { hard, sp, f: f.overall };
  };
  const before = score(records);
  let cur = records, best = before, moves = 0;
  const days = [...new Set(records.map((r) => r.dayIndex))].sort((a, b) => a - b);
  for (let it = 0; it < maxIter; it++) {
    let improved = false;
    outer: for (const d of days) {
      const workers = new Map();
      for (const r of cur) if (r.dayIndex === d && r.personnelId != null) workers.set(r.personnelId, r.groupId);
      const ids = [...workers.keys()].sort();
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) {
          if (workers.get(ids[i]) !== workers.get(ids[j])) continue;
          const a = ids[i], b = ids[j];
          const next = cur.map((r) => (r.dayIndex !== d ? r : r.personnelId === a ? { ...r, personnelId: b } : r.personnelId === b ? { ...r, personnelId: a } : r));
          const s = score(next);
          if (s.hard <= best.hard && s.sp < best.sp - 1e-9) { cur = next; best = s; moves++; improved = true; break outer; }
        }
    }
    if (!improved) break;
  }
  return { records: cur, moves, before, after: best };
}
