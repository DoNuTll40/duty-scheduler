import { sql } from '../db.js';

export async function loadBase() {
  const s = sql();
  const [personnel, posts, groups, shiftTypes, scenarios, active] = await Promise.all([
    s`SELECT id, code, name, group_id AS "groupId", default_post_id AS "defaultPostId", active, note, sort_order AS "sortOrder" FROM ds_personnel ORDER BY sort_order, code`,
    s`SELECT id, name, min_personnel AS "minPersonnel", max_personnel AS "maxPersonnel", required_personnel AS "requiredPersonnel", required_per_slot AS "requiredPerSlot", is_24_hours AS "is24Hours", active, sort_order AS "sortOrder" FROM ds_posts ORDER BY sort_order, name`,
    s`SELECT id, name, sort_order AS "sortOrder" FROM ds_groups ORDER BY sort_order, id`,
    s`SELECT id, name, short_name AS "shortName", counts_as_duty AS "countsAsDuty", counts_as_rest AS "countsAsRest", counts_as_withdrawal AS "countsAsWithdrawal" FROM ds_shift_types ORDER BY sort_order`,
    s`SELECT id, name, description, config, last_result AS "lastResult" FROM ds_scenarios ORDER BY id`,
    s`SELECT value FROM ds_settings WHERE key = 'activeScenario'`,
  ]);
  const activeScenarioId = scenarios.find((x) => x.id === active[0]?.value)?.id ?? scenarios[0]?.id ?? null;
  return { personnel, posts, groups, shiftTypes, scenarios, activeScenarioId };
}

export async function loadRecords(scenarioId) {
  if (scenarioId == null) return [];
  const rows = await sql()`
    SELECT id::text AS uid, to_char(date,'YYYY-MM-DD') AS date, day_index AS "dayIndex", slot_index AS "slotIndex",
           post_id AS "postId", personnel_id AS "personnelId", group_id AS "groupId", shift_type_id AS "shiftTypeId",
           start_min AS "startMin", end_min AS "endMin", manual_override AS "manualOverride", override_reason AS "overrideReason"
    FROM ds_schedules WHERE scenario_id = ${scenarioId} ORDER BY day_index, slot_index, post_id, personnel_id`;
  return rows.map((r) => ({ ...r, startMin: Number(r.startMin), endMin: Number(r.endMin) }));
}

export async function loadInitial() {
  const base = await loadBase();
  return { ...base, records: await loadRecords(base.activeScenarioId) };
}
