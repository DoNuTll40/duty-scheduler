import { generateTimeSlots, validateSlotConfig, parseTime, isValidDate, dateOf, dayBaseMinutes } from './timeSlots.js';
import { validateSchedule, HARD } from './validator.js';
import { summarize, fairnessOf } from './calculator.js';

export const DEFAULTS = {
  startTime: '17:00', slotDuration: 4, peoplePerPost: 2, dutyHours: 8, withdrawalHours: 4,
  alternateDays: true, rotationEnabled: true, nightStart: '22:00', nightEnd: '06:00', minimumRestHours: 8,
  maximumDutyHoursPerDay: null, maximumDutyHoursPerPeriod: null, days: 7,
};
const r2 = (n) => Math.round(n * 100) / 100;
const peopleOf = (c, p) => p.requiredPersonnel ?? c.peoplePerPost;

export function personnelRequirement({ posts, peoplePerPost, groupCount, alternateDays, available }) {
  const perDay = posts.reduce((s, p) => s + (p.requiredPersonnel ?? peoplePerPost), 0);
  const required = perDay * (alternateDays ? Math.max(1, groupCount) : 1);
  return { perDay, required, available, shortage: Math.max(0, required - available) };
}
export function compareRequirement(before, after) {
  const reduction = before.required - after.required;
  return { oldRequired: before.required, newRequired: after.required, reduction, reductionPercent: before.required ? r2((reduction / before.required) * 100) : 0 };
}

function normalize(cfg) {
  const c = { ...DEFAULTS, ...cfg };
  const by = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  c.posts = (cfg.posts ?? []).filter((p) => p.active !== false).sort(by);
  c.personnel = (cfg.personnel ?? []).filter((p) => p.active !== false).sort(by);
  const gids = (cfg.groups ?? []).map((g) => (typeof g === 'object' ? g.id : g));
  c.groups = gids.length ? gids : [...new Set(c.personnel.map((p) => p.groupId))];
  c.shiftTypes = cfg.shiftTypes ?? [];
  return c;
}

function validateConfig(c) {
  const e = [...validateSlotConfig(c)];
  const bad = (code, message) => e.push({ code, severity: 'critical', message });
  if (!isValidDate(c.startDate)) bad('INVALID_START_DATE', `Invalid startDate "${c.startDate}" (YYYY-MM-DD)`);
  if (!Number.isInteger(c.days) || c.days < 1) bad('INVALID_DAYS', `days must be an integer ≥ 1`);
  if (!c.posts.length) bad('NO_POSTS', 'No active posts');
  if (!c.groups.length) bad('NO_GROUPS', 'No groups / personnel');
  if (!(c.peoplePerPost >= 1) || !Number.isInteger(c.peoplePerPost)) bad('INVALID_PEOPLE_PER_POST', 'peoplePerPost must be an integer ≥ 1');
  if (parseTime(c.nightStart) === null || parseTime(c.nightEnd) === null) bad('INVALID_NIGHT_WINDOW', 'Invalid nightStart/nightEnd');
  for (const k of ['countsAsDuty', 'countsAsRest', 'countsAsWithdrawal'])
    if (!c.shiftTypes.some((t) => t[k])) bad('MISSING_SHIFT_TYPE', `No shift type with ${k}`);
  if (!e.some((x) => x.code.startsWith('INVALID_SLOT') || x.code.startsWith('SLOT_'))) {
    const dur = Math.round(c.slotDuration * 60);
    const mult = (h) => Number.isFinite(h) && (h * 60) % dur === 0;
    if (!(c.dutyHours > 0) || !mult(c.dutyHours)) bad('DUTY_NOT_SLOT_MULTIPLE', `dutyHours ${c.dutyHours} must be a positive multiple of slotDuration ${c.slotDuration}h (shift changes only at slot boundaries)`);
    if (c.dutyHours > 24) bad('DUTY_TOO_LONG', 'dutyHours cannot exceed 24');
    if (!(c.withdrawalHours >= 0) || !mult(c.withdrawalHours)) bad('WITHDRAWAL_NOT_SLOT_MULTIPLE', `withdrawalHours ${c.withdrawalHours} must be a multiple of slotDuration ${c.slotDuration}h`);
    if (c.customPattern) {
      const S = 1440 / dur, ids = new Set(c.shiftTypes.map((t) => t.id));
      c.customPattern.forEach((row, i) => {
        if (row.length !== S) bad('PATTERN_LENGTH', `customPattern[${i}] has ${row.length} slots, expected ${S}`);
        if (row.some((id) => !ids.has(id))) bad('PATTERN_UNKNOWN_TYPE', `customPattern[${i}] references an unknown shift type`);
      });
    }
  }
  return e;
}

// Default tiling pattern for role r (0..people-1): one duty block, withdrawal right after, rest otherwise.
function rolePattern(r, { S, bSlots, wSlots, layers, ids, custom }) {
  if (custom) return Array.from({ length: S }, (_, i) => custom[r]?.[i] ?? ids.rest);
  const row = Array(S).fill(ids.rest), abs = r * bSlots;
  if (Math.floor(abs / S) >= layers) return row; // surplus person: not needed for coverage
  const st = abs % S, en = Math.min(st + bSlots, S);
  for (let i = st; i < en; i++) row[i] = ids.duty;
  for (let i = en; i < Math.min(en + wSlots, S); i++) row[i] = ids.withdraw;
  return row;
}

function failure(c, requirement, violations) {
  return {
    feasible: false, reasons: violations.map((v) => v.message), shortages: [], violations, requirement,
    timeSlots: [], schedules: [], validation: { issues: violations, counts: { critical: violations.length, conflict: 0, warning: 0, info: 0 } },
    statistics: null, fairness: null, diagnosticDraft: null,
  };
}

export function generateSchedule(input) {
  const c = normalize(input);
  const requirement = personnelRequirement({ posts: c.posts, peoplePerPost: c.peoplePerPost, groupCount: c.groups.length, alternateDays: c.alternateDays, available: c.personnel.length });
  const cfgErrors = validateConfig(c);
  if (cfgErrors.length) return failure(c, requirement, cfgErrors);

  const slots = generateTimeSlots(c), S = slots.length, dur = slots[0].durationMinutes;
  const bSlots = Math.round((c.dutyHours * 60) / dur), wSlots = Math.round((c.withdrawalHours * 60) / dur);
  const ids = { duty: c.shiftTypes.find((t) => t.countsAsDuty).id, rest: c.shiftTypes.find((t) => t.countsAsRest).id, withdraw: c.shiftTypes.find((t) => t.countsAsWithdrawal).id };
  const G = c.groups.length, startMin = parseTime(c.startTime);
  const reasons = [];

  // Pre-checks (reported, but we still build a draft so the UI can show *where* it fails)
  const perDay = requirement.perDay;
  if (requirement.shortage > 0) reasons.push(`Personnel shortage: required ${requirement.required}, available ${requirement.available}, shortage ${requirement.shortage}`);
  const poolOf = (g) => c.personnel.filter((p) => p.groupId === g);
  if (c.alternateDays) {
    for (const g of c.groups.slice(0, Math.min(G, c.days)))
      if (poolOf(g).length < perDay) reasons.push(`Group ${g}: ${poolOf(g).length} personnel, needs ${perDay} per duty day`);
  } else if (c.personnel.length < perDay) reasons.push(`Only ${c.personnel.length} personnel, needs ${perDay} per day`);
  if (!c.customPattern)
    for (const p of c.posts) {
      const n = peopleOf(c, p), need = (p.requiredPerSlot ?? 1) * 24, got = n * c.dutyHours;
      if (p.is24Hours !== false && got < need)
        reasons.push(`${p.name}: ${n} people × ${c.dutyHours}h duty = ${got}h/day < ${need}h to cover 24h (needs ≥ ${Math.ceil(need / c.dutyHours)} people/post)`);
    }

  const records = [];
  for (let d = 0; d < c.days; d++) {
    let pool, rot;
    if (c.alternateDays) { pool = poolOf(c.groups[d % G]); rot = Math.floor(d / G); }
    else { pool = c.groups.flatMap(poolOf); rot = d; }
    if (!c.rotationEnabled) rot = 0;
    const date = dateOf(c.startDate, d), base = dayBaseMinutes(c.startDate, d) + startMin;
    let offset = 0;
    for (const post of c.posts) {
      const n = peopleOf(c, post);
      for (let r = 0; r < n; r++) {
        const person = pool[offset + ((r + rot) % n)];
        if (!person) continue; // unfilled role -> coverage validator reports it
        const row = rolePattern(r, { S, bSlots, wSlots, layers: post.requiredPerSlot ?? 1, ids, custom: c.customPattern });
        for (let i = 0; i < S; i++) {
          const s = base + i * dur;
          records.push({ date, dayIndex: d, slotIndex: i, postId: post.id, personnelId: person.id, groupId: person.groupId, shiftTypeId: row[i], startMin: s, endMin: s + dur, manualOverride: false });
        }
      }
      offset += n;
    }
  }

  const ctx = { posts: c.posts, personnel: c.personnel, shiftTypes: c.shiftTypes, slots, settings: c, startDate: c.startDate, days: c.days };
  const validation = validateSchedule({ records, ...ctx });
  const statistics = summarize(records, ctx), fairness = fairnessOf(statistics.byPersonnel);

  // Group coverage shortages into "Post X: SHORTAGE hh:mm-hh:mm"
  const grp = new Map();
  for (const s of validation.shortages) {
    const k = `${s.postId}|${s.slotIndex}`;
    const g = grp.get(k) ?? { postId: s.postId, postName: s.postName, slotIndex: s.slotIndex, slot: s.slot, daysAffected: 0, missingPerDay: s.shortage };
    g.daysAffected++; grp.set(k, g);
  }
  const shortageSummary = [...grp.values()];
  for (const g of shortageSummary) reasons.push(`${g.postName}: SHORTAGE ${g.slot} (${g.daysAffected}/${c.days} days)`);
  const hard = validation.issues.filter((i) => HARD.has(i.severity) && i.code !== 'COVERAGE_SHORTAGE');
  const byCode = {};
  for (const i of hard) (byCode[i.code] ??= []).push(i);
  for (const [code, xs] of Object.entries(byCode)) reasons.push(`${code}: ${xs.length} issue(s), e.g. ${xs[0].message}`);

  const feasible = reasons.length === 0;
  return {
    feasible, reasons, shortages: validation.shortages, shortageSummary, violations: hard, requirement, timeSlots: slots,
    schedules: feasible ? records : [], validation, statistics, fairness,
    diagnosticDraft: feasible ? null : { records, statistics, fairness },
  };
}
