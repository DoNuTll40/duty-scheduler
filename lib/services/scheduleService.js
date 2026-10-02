import { sql } from '../db.js';
import { loadRecords } from './data.js';
import { int, str, id, fail } from '../validate.js';

const rowOf = (r, scenarioId) => ({
  scenario_id: scenarioId, date: r.date, day_index: r.dayIndex, slot_index: r.slotIndex, post_id: r.postId ?? null, personnel_id: r.personnelId ?? null,
  group_id: r.groupId ?? null, shift_type_id: r.shiftTypeId, start_min: r.startMin, end_min: r.endMin,
  manual_override: !!r.manualOverride, override_reason: r.manualOverride ? (r.overrideReason ?? 'manual') : null,
});

const INSERT_FROM_JSON = (s, rows) => s`
  INSERT INTO ds_schedules (scenario_id,date,day_index,slot_index,post_id,personnel_id,group_id,shift_type_id,start_min,end_min,manual_override,override_reason)
  SELECT scenario_id,date,day_index,slot_index,post_id,personnel_id,group_id,shift_type_id,start_min,end_min,manual_override,override_reason
  FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(scenario_id int,date date,day_index int,slot_index int,post_id text,personnel_id text,group_id text,shift_type_id text,start_min bigint,end_min bigint,manual_override boolean,override_reason text)`;

const REVISION = (s, scenarioId, snapshot, note) => s`
  INSERT INTO ds_schedule_revisions (scenario_id, revision, snapshot, note)
  SELECT ${scenarioId}::int, COALESCE(MAX(revision),0)+1, ${JSON.stringify(snapshot)}::jsonb, ${note}::text FROM ds_schedule_revisions WHERE scenario_id=${scenarioId}`;

/** Replace the whole schedule of a scenario (used by generate). Keeps the previous version as a revision. */
export async function replaceSchedule(scenarioId, records, note) {
  const s = sql(), prev = await loadRecords(scenarioId), stmts = [];
  if (prev.length) stmts.push(REVISION(s, scenarioId, prev, `before: ${note}`));
  stmts.push(s`DELETE FROM ds_schedules WHERE scenario_id=${scenarioId}`);
  if (records.length) stmts.push(INSERT_FROM_JSON(s, records.map((r) => rowOf(r, scenarioId))));
  await s.transaction(stmts);
}

export async function replaceTimeSlots(scenarioId, slots) {
  const s = sql();
  const stmts = [s`DELETE FROM ds_time_slots WHERE scenario_id=${scenarioId}`];
  for (const t of slots) stmts.push(s`INSERT INTO ds_time_slots (scenario_id,slot_index,start_clock,end_clock,duration_minutes) VALUES (${scenarioId},${t.index},${t.startClock},${t.endClock},${t.durationMinutes})`);
  await s.transaction(stmts);
}

/** Persist edits made in the UI: {updates, inserts, deletes} + a revision snapshot of the resulting state. */
export async function saveChanges(scenarioId, { updates = [], inserts = [], deletes = [], snapshot = [], note = 'manual edit' }) {
  if (updates.length + inserts.length + deletes.length > 5000) fail('Too many changes');
  const s = sql(), stmts = [];
  for (const u of updates) {
    const r = rowOf(u, scenarioId);
    stmts.push(s`UPDATE ds_schedules SET post_id=${r.post_id}, personnel_id=${r.personnel_id}, group_id=${r.group_id}, shift_type_id=${r.shift_type_id}, manual_override=${r.manual_override}, override_reason=${r.override_reason}, updated_at=now() WHERE id=${int(u.uid, 'uid', { min: 1, max: 9e15 })} AND scenario_id=${scenarioId}`);
  }
  if (inserts.length) stmts.push(INSERT_FROM_JSON(s, inserts.map((r) => rowOf(r, scenarioId))));
  for (const d of deletes) stmts.push(s`DELETE FROM ds_schedules WHERE id=${int(d, 'uid', { min: 1, max: 9e15 })} AND scenario_id=${scenarioId}`);
  stmts.push(REVISION(s, scenarioId, snapshot, str(note, 'note', { max: 200 })));
  await s.transaction(stmts);
  return loadRecords(scenarioId);
}

export const listRevisions = (scenarioId) => sql()`SELECT id, revision, note, created_at AS "createdAt" FROM ds_schedule_revisions WHERE scenario_id=${id(String(scenarioId), 'id')}::int ORDER BY revision DESC LIMIT 30`;
