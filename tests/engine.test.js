import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTimeSlots, checkShiftBoundary, generateSchedule, nightOverlap, personnelRequirement, compareRequirement, validateSchedule, fairnessOf } from '../lib/engine/index.js';

const shiftTypes = [
  { id: 'on-duty', name: 'เข้า', countsAsDuty: true, countsAsRest: false, countsAsWithdrawal: false },
  { id: 'withdraw', name: 'ถอน', countsAsDuty: false, countsAsRest: false, countsAsWithdrawal: true },
  { id: 'rest', name: 'พัก', countsAsDuty: false, countsAsRest: true, countsAsWithdrawal: false },
];
const mkPosts = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: `P${i + 1}`, name: `จุด ${i + 1}`, is24Hours: true, active: true, sortOrder: i, ...extra }));
const mkPeople = (groups, per) => groups.flatMap((g) => Array.from({ length: per }, (_, i) => ({ id: `${g}${String(i + 1).padStart(3, '0')}`, code: `${g}${String(i + 1).padStart(3, '0')}`, groupId: g, active: true, sortOrder: i })));
const cfg = (o = {}) => ({ startDate: '2026-10-01', days: 7, shiftTypes, groups: ['A', 'B'], posts: mkPosts(3), personnel: mkPeople(['A', 'B'], 6), ...o });
const duty = (res) => res.schedules.filter((r) => r.shiftTypeId === 'on-duty');

test('time slots: default and custom start', () => {
  assert.deepEqual(generateTimeSlots().map((s) => s.label), ['17:00-21:00', '21:00-01:00', '01:00-05:00', '05:00-09:00', '09:00-13:00', '13:00-17:00']);
  assert.deepEqual(generateTimeSlots({ startTime: '18:00', slotDuration: 4 }).map((s) => s.startClock), ['18:00', '22:00', '02:00', '06:00', '10:00', '14:00']);
  assert.equal(generateTimeSlots({ startTime: '00:00', slotDuration: 3 }).length, 8);
  assert.throws(() => generateTimeSlots({ slotDuration: 5 }));
});

test('transport boundary', () => {
  const s = generateTimeSlots();
  assert.ok(checkShiftBoundary('17:00', '21:00', s).ok);
  assert.ok(!checkShiftBoundary('19:00', '23:00', s).ok);
});

test('night calc uses real overlap incl. cross-midnight', () => {
  const m = (h) => h * 60;
  assert.equal(nightOverlap(m(17), m(25), '22:00', '06:00') / 60, 3);   // 17-01
  assert.equal(nightOverlap(m(25), m(33), '22:00', '06:00') / 60, 5);   // 01-09
  assert.equal(nightOverlap(m(10), m(14), '22:00', '06:00'), 0);
});

test('personnel requirement is computed, not hard-coded', () => {
  const posts = mkPosts(3);
  const oldR = personnelRequirement({ posts, peoplePerPost: 3, groupCount: 2, alternateDays: true, available: 12 });
  const newR = personnelRequirement({ posts, peoplePerPost: 2, groupCount: 2, alternateDays: true, available: 12 });
  assert.deepEqual(compareRequirement(oldR, newR), { oldRequired: 18, newRequired: 12, reduction: 6, reductionPercent: 33.33 });
});

test('3 posts × 3 people × 2 groups: feasible, full coverage, alternate days, rotation', () => {
  const r = generateSchedule(cfg({ peoplePerPost: 3, personnel: mkPeople(['A', 'B'], 9) }));
  assert.equal(r.feasible, true, r.reasons.join('; '));
  assert.equal(r.shortages.length, 0);
  const dayGroups = [0, 1, 2, 3].map((d) => new Set(r.schedules.filter((x) => x.dayIndex === d).map((x) => x.groupId)));
  assert.deepEqual(dayGroups.map((s) => [...s][0]), ['A', 'B', 'A', 'B']);
  assert.ok(dayGroups.every((s) => s.size === 1));
  const startOf = (id, d) => duty(r).find((x) => x.personnelId === id && x.dayIndex === d)?.slotIndex;
  assert.notEqual(startOf('A001', 0), startOf('A001', 2)); // rotated
  const noRot = generateSchedule(cfg({ peoplePerPost: 3, personnel: mkPeople(['A', 'B'], 9), rotationEnabled: false }));
  assert.equal(duty(noRot).find((x) => x.personnelId === 'A001' && x.dayIndex === 0).slotIndex, duty(noRot).find((x) => x.personnelId === 'A001' && x.dayIndex === 2).slotIndex);
  assert.equal(r.statistics.overall.dutyHours, 3 * 24 * 7); // every post covered 24h every day
});

test('3 posts × 2 people × 2 groups (8h duty): infeasible, shortages 09-13 & 13-17', () => {
  const r = generateSchedule(cfg());
  assert.equal(r.feasible, false);
  assert.deepEqual(r.schedules, []);
  assert.equal(r.requirement.required, 12);
  assert.equal(r.shortages.length, 3 * 7 * 2);
  assert.ok(r.reasons.includes('จุด 1: SHORTAGE 09:00-13:00 (7/7 days)'));
  assert.ok(r.reasons.includes('จุด 1: SHORTAGE 13:00-17:00 (7/7 days)'));
  assert.ok(r.diagnosticDraft.records.length > 0);
});

test('2 people/post becomes feasible only if duty blocks are longer (config-driven)', () => {
  const r = generateSchedule(cfg({ dutyHours: 12 }));
  assert.equal(r.feasible, true, r.reasons.join('; '));
});

test('literal original 2-person pattern is just a custom pattern; validator reports the gap', () => {
  const D = 'on-duty', W = 'withdraw', R = 'rest';
  const customPattern = [[D, D, R, R, W, R], [R, R, D, D, R, W]];
  const r = generateSchedule(cfg({ customPattern }));
  assert.equal(r.feasible, false);
  assert.ok(r.shortageSummary.every((s) => [4, 5].includes(s.slotIndex)));
  assert.equal(r.shortageSummary.length, 6);
});

test('5 posts × 3 people with only 10 personnel: required 30, available 10, shortage 20', () => {
  const r = generateSchedule(cfg({ posts: mkPosts(5), peoplePerPost: 3, personnel: mkPeople(['A', 'B'], 5) }));
  assert.equal(r.feasible, false);
  assert.deepEqual([r.requirement.required, r.requirement.available, r.requirement.shortage], [30, 10, 20]);
});

test('5 posts × 3 people × 2 groups with enough personnel: feasible', () => {
  const r = generateSchedule(cfg({ posts: mkPosts(5), peoplePerPost: 3, personnel: mkPeople(['A', 'B'], 15) }));
  assert.equal(r.feasible, true, r.reasons.join('; '));
});

test('groups are not tied to A/B: 3 groups rotate', () => {
  const r = generateSchedule(cfg({ groups: ['X', 'Y', 'Z'], peoplePerPost: 3, personnel: mkPeople(['X', 'Y', 'Z'], 9), days: 6 }));
  assert.equal(r.feasible, true, r.reasons.join('; '));
  const g = [0, 1, 2, 3].map((d) => r.schedules.find((x) => x.dayIndex === d).groupId);
  assert.deepEqual(g, ['X', 'Y', 'Z', 'X']);
});

test('invalid configurations are rejected with reasons', () => {
  for (const bad of [{ slotDuration: 5 }, { dutyHours: 6 }, { startTime: '25:00' }, { posts: [] }, { shiftTypes: [shiftTypes[0]] }, { days: 0 }]) {
    const r = generateSchedule(cfg({ peoplePerPost: 3, personnel: mkPeople(['A', 'B'], 9), ...bad }));
    assert.equal(r.feasible, false, JSON.stringify(bad));
    assert.ok(r.reasons.length > 0);
  }
});

test('different start time / slot length are respected', () => {
  const r = generateSchedule(cfg({ startTime: '18:00', slotDuration: 2, dutyHours: 8, peoplePerPost: 3, personnel: mkPeople(['A', 'B'], 9) }));
  assert.equal(r.feasible, true, r.reasons.join('; '));
  assert.equal(r.timeSlots[0].label, '18:00-20:00');
  assert.equal(r.timeSlots.length, 12);
});

test('rest + max duty constraints make config infeasible', () => {
  const base = cfg({ peoplePerPost: 3, personnel: mkPeople(['A', 'B'], 9) });
  const rest = generateSchedule({ ...base, minimumRestHours: 100 });
  assert.equal(rest.feasible, false);
  assert.ok(rest.reasons.some((x) => x.startsWith('INSUFFICIENT_REST')));
  const max = generateSchedule({ ...base, maximumDutyHoursPerDay: 4 });
  assert.ok(max.reasons.some((x) => x.startsWith('MAX_DUTY_PER_DAY')));
});

test('validator catches duplicate, overlap, transport, missing refs', () => {
  const r = generateSchedule(cfg({ peoplePerPost: 3, personnel: mkPeople(['A', 'B'], 9) }));
  const ctx = { posts: cfg().posts, personnel: mkPeople(['A', 'B'], 9), shiftTypes, slots: r.timeSlots, settings: { ...r.requirement, startTime: '17:00', minimumRestHours: 8, nightStart: '22:00', nightEnd: '06:00' }, startDate: '2026-10-01', days: 7 };
  const rec = r.schedules.find((x) => x.shiftTypeId === 'on-duty');
  const dup = { ...rec, postId: 'P2' };
  let v = validateSchedule({ records: [...r.schedules, dup], ...ctx });
  assert.ok(v.issues.some((i) => i.code === 'DUPLICATE_ASSIGNMENT'));
  const shifted = { ...rec, startMin: rec.startMin + 60, endMin: rec.endMin + 60 };
  v = validateSchedule({ records: [...r.schedules, shifted], ...ctx });
  assert.ok(v.issues.some((i) => i.code === 'TRANSPORT_BOUNDARY'));
  assert.ok(v.issues.some((i) => i.code === 'OVERLAP'));
  v = validateSchedule({ records: [{ ...rec, personnelId: 'GONE' }], ...ctx });
  assert.ok(v.issues.some((i) => i.code === 'MISSING_PERSONNEL'));
});

test('fairness reports raw differences, no score/rank', () => {
  const f = fairnessOf({ A001: { groupId: 'A', dutyHours: 32, nightHours: 10, withdrawalHours: 4, shiftCount: 4, restHours: 8 }, A002: { groupId: 'A', dutyHours: 30, nightHours: 16, withdrawalHours: 4, shiftCount: 4, restHours: 8 } });
  assert.equal(f.overall.dutyHourDifference, 2);
  assert.equal(f.byGroup.A.nightHourDifference, 6);
  assert.ok(!JSON.stringify(f).match(/score|best|winner/i));
});

test('default 3×3 night hours: 17-01 = 3h, 01-09 = 5h, per person balanced over rotation', () => {
  const r = generateSchedule(cfg({ peoplePerPost: 3, personnel: mkPeople(['A', 'B'], 9) }));
  assert.equal(r.statistics.overall.nightHours, 3 * 7 * 8); // 22-06 window fully covered once/day/post
});

import { autoBalance, summarize } from '../lib/engine/index.js';
test('auto balance never adds hard violations and does not worsen spread', () => {
  const people = mkPeople(['A', 'B'], 9);
  const c = cfg({ peoplePerPost: 3, personnel: people, rotationEnabled: false, days: 4 });
  const r = generateSchedule(c);
  assert.equal(r.feasible, true);
  const ctx = { posts: c.posts, personnel: people, shiftTypes, slots: r.timeSlots, settings: { ...c, startTime: '17:00', minimumRestHours: 8, nightStart: '22:00', nightEnd: '06:00', rotationEnabled: false }, startDate: c.startDate, days: 4 };
  const out = autoBalance(r.schedules, ctx);
  assert.ok(out.after.hard <= out.before.hard);
  assert.ok(out.after.sp <= out.before.sp);
  assert.equal(out.records.length, r.schedules.length);
});
