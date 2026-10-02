import { sql } from '../db.js';
import { loadBase, loadRecords } from './data.js';
import { sanitizeConfig, str, int, bool, id, fail } from '../validate.js';

export async function exportAll() {
  const s = sql(), base = await loadBase();
  const [settings, slots] = await Promise.all([
    s`SELECT key, value FROM ds_settings`,
    s`SELECT scenario_id AS "scenarioId", slot_index AS "slotIndex", to_char(start_clock,'HH24:MI') AS "startClock", to_char(end_clock,'HH24:MI') AS "endClock", duration_minutes AS "durationMinutes" FROM ds_time_slots ORDER BY scenario_id, slot_index`,
  ]);
  const scenarios = [];
  for (const sc of base.scenarios) scenarios.push({ ...sc, schedules: await loadRecords(sc.id) });
  return { app: 'duty-scheduler', version: 1, exportedAt: new Date().toISOString(), settings, groups: base.groups, personnel: base.personnel, posts: base.posts, shiftTypes: base.shiftTypes, timeSlots: slots, scenarios };
}

/** Validate the whole document first; only then write (single transaction, replaces everything). */
export function validateBackup(d) {
  if (!d || d.app !== 'duty-scheduler' || d.version !== 1) fail('ไม่ใช่ไฟล์ backup ของระบบนี้ (app/version ไม่ตรง)');
  for (const k of ['groups', 'personnel', 'posts', 'shiftTypes', 'scenarios']) if (!Array.isArray(d[k])) fail(`backup: ${k} must be an array`);
  if (d.shiftTypes.length < 3) fail('backup: ต้องมี shift type อย่างน้อย 3 ชนิด');
  const out = {
    groups: d.groups.map((g, i) => ({ id: id(g.id, 'group.id'), name: str(g.name, 'group.name', { max: 60 }), sort_order: i })),
    shiftTypes: d.shiftTypes.map((t, i) => ({ id: id(t.id, 'shiftType.id'), name: str(t.name, 'name', { max: 40 }), short_name: str(t.shortName ?? t.name, 'shortName', { max: 20 }), counts_as_duty: bool(t.countsAsDuty), counts_as_rest: bool(t.countsAsRest), counts_as_withdrawal: bool(t.countsAsWithdrawal), sort_order: i })),
    posts: d.posts.map((p, i) => ({ id: id(p.id, 'post.id'), name: str(p.name, 'post.name', { max: 80 }), min_personnel: int(p.minPersonnel ?? 1, 'minPersonnel', { max: 100 }), max_personnel: int(p.maxPersonnel, 'maxPersonnel', { max: 100, optional: true }), required_personnel: int(p.requiredPersonnel, 'requiredPersonnel', { max: 100, optional: true }), required_per_slot: int(p.requiredPerSlot ?? 1, 'requiredPerSlot', { min: 1, max: 20 }), is_24_hours: bool(p.is24Hours, true), active: bool(p.active, true), sort_order: i })),
    personnel: d.personnel.map((p, i) => ({ id: id(p.id, 'personnel.id'), code: str(p.code, 'code', { max: 32 }), name: str(p.name, 'name', { max: 80 }), group_id: p.groupId ? id(p.groupId, 'groupId') : null, default_post_id: p.defaultPostId ? id(p.defaultPostId, 'defaultPostId') : null, active: bool(p.active, true), note: str(p.note, 'note', { max: 300, optional: true }), sort_order: i })),
  };
  const typeIds = new Set(out.shiftTypes.map((t) => t.id)), gIds = new Set(out.groups.map((g) => g.id)), pIds = new Set(out.posts.map((p) => p.id));
  if (new Set(out.personnel.map((p) => p.code)).size !== out.personnel.length) fail('backup: personnel code ซ้ำ');
  for (const p of out.personnel) { if (p.group_id && !gIds.has(p.group_id)) fail(`backup: personnel ${p.code} อ้างถึงกลุ่มที่ไม่มี`); if (p.default_post_id && !pIds.has(p.default_post_id)) p.default_post_id = null; }
  out.scenarios = d.scenarios.map((sc, i) => ({
    id: int(sc.id ?? i + 1, 'scenario.id', { min: 1, max: 1e9 }), name: str(sc.name, 'scenario.name', { max: 80 }), description: str(sc.description, 'description', { max: 300, optional: true }),
    config: sanitizeConfig(sc.config), last_result: sc.lastResult ?? null,
    schedules: (sc.schedules ?? []).map((r) => {
      if (!typeIds.has(r.shiftTypeId)) fail('backup: schedule อ้างถึง shift type ที่ไม่มี');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) fail('backup: schedule date ไม่ถูกต้อง');
      return { date: r.date, day_index: int(r.dayIndex, 'dayIndex', { max: 400 }), slot_index: int(r.slotIndex, 'slotIndex', { max: 96 }), post_id: r.postId ?? null, personnel_id: r.personnelId ?? null, group_id: r.groupId ?? null, shift_type_id: r.shiftTypeId, start_min: Number(r.startMin), end_min: Number(r.endMin), manual_override: bool(r.manualOverride), override_reason: r.manualOverride ? str(r.overrideReason ?? 'restored', 'reason', { max: 300 }) : null };
    }),
  }));
  if (!out.scenarios.length) fail('backup: ต้องมีอย่างน้อย 1 scenario');
  if (new Set(out.scenarios.map((x) => x.id)).size !== out.scenarios.length) fail('backup: scenario id ซ้ำ');
  return out;
}

export async function importAll(doc) {
  const v = validateBackup(doc), s = sql(), J = (x) => JSON.stringify(x);
  const st = [
    s`DELETE FROM ds_schedule_revisions`, s`DELETE FROM ds_schedules`, s`DELETE FROM ds_time_slots`, s`DELETE FROM ds_scenarios`,
    s`DELETE FROM ds_personnel`, s`DELETE FROM ds_posts`, s`DELETE FROM ds_groups`, s`DELETE FROM ds_shift_types`,
    s`INSERT INTO ds_shift_types SELECT * FROM jsonb_to_recordset(${J(v.shiftTypes)}::jsonb) AS x(id text,name text,short_name text,counts_as_duty boolean,counts_as_rest boolean,counts_as_withdrawal boolean,sort_order int)`,
    s`INSERT INTO ds_groups (id,name,sort_order) SELECT * FROM jsonb_to_recordset(${J(v.groups)}::jsonb) AS x(id text,name text,sort_order int)`,
    s`INSERT INTO ds_posts (id,name,min_personnel,max_personnel,required_personnel,required_per_slot,is_24_hours,active,sort_order) SELECT * FROM jsonb_to_recordset(${J(v.posts)}::jsonb) AS x(id text,name text,min_personnel int,max_personnel int,required_personnel int,required_per_slot int,is_24_hours boolean,active boolean,sort_order int)`,
    s`INSERT INTO ds_personnel (id,code,name,group_id,default_post_id,active,note,sort_order) SELECT * FROM jsonb_to_recordset(${J(v.personnel)}::jsonb) AS x(id text,code text,name text,group_id text,default_post_id text,active boolean,note text,sort_order int)`,
    s`INSERT INTO ds_scenarios (id,name,description,config,last_result) SELECT id,name,description,config,last_result FROM jsonb_to_recordset(${J(v.scenarios.map(({ schedules, ...r }) => r))}::jsonb) AS x(id int,name text,description text,config jsonb,last_result jsonb)`,
    s`SELECT setval(pg_get_serial_sequence('ds_scenarios','id'), (SELECT MAX(id) FROM ds_scenarios))`,
  ];
  for (const sc of v.scenarios) if (sc.schedules.length)
    st.push(s`INSERT INTO ds_schedules (scenario_id,date,day_index,slot_index,post_id,personnel_id,group_id,shift_type_id,start_min,end_min,manual_override,override_reason) SELECT ${sc.id}::int,date,day_index,slot_index,post_id,personnel_id,group_id,shift_type_id,start_min,end_min,manual_override,override_reason FROM jsonb_to_recordset(${J(sc.schedules)}::jsonb) AS x(date date,day_index int,slot_index int,post_id text,personnel_id text,group_id text,shift_type_id text,start_min bigint,end_min bigint,manual_override boolean,override_reason text)`);
  st.push(s`INSERT INTO ds_settings (key,value) VALUES ('activeScenario', ${J(v.scenarios[0].id)}::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`);
  await s.transaction(st);
}
