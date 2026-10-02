import { sql } from '../db.js';
import { loadBase, loadRecords } from './data.js';
import { replaceSchedule, replaceTimeSlots } from './scheduleService.js';
import { generateSchedule } from '../engine/index.js';
import { sanitizeConfig, str, int, fail } from '../validate.js';

export function engineInput(base, config) {
  return { ...config, posts: base.posts, personnel: base.personnel, groups: base.groups.map((g) => g.id), shiftTypes: base.shiftTypes };
}
export const resultSummary = (res) => ({
  feasible: res.feasible, reasons: res.reasons, shortageSummary: res.shortageSummary ?? [], requirement: res.requirement,
  generatedAt: new Date().toISOString(),
});

export async function createScenario({ name, description, config, cloneFrom }) {
  const s = sql();
  let cfg = config;
  if (!cfg && cloneFrom != null) cfg = (await s`SELECT config FROM ds_scenarios WHERE id=${int(cloneFrom, 'cloneFrom', { min: 1, max: 1e9 })}`)[0]?.config;
  if (!cfg) fail('config is required');
  const row = (await s`INSERT INTO ds_scenarios (name, description, config) VALUES (${str(name, 'name', { max: 80 })}, ${str(description, 'description', { max: 300, optional: true })}, ${JSON.stringify(sanitizeConfig(cfg))}::jsonb) RETURNING id, name, description, config, last_result AS "lastResult"`)[0];
  return row;
}
export async function updateScenario(scenarioId, { name, description, config }) {
  const s = sql(), sid = int(scenarioId, 'id', { min: 1, max: 1e9 });
  const cfg = sanitizeConfig(config);
  await s`UPDATE ds_scenarios SET name=${str(name, 'name', { max: 80 })}, description=${str(description, 'description', { max: 300, optional: true })}, config=${JSON.stringify(cfg)}::jsonb, updated_at=now() WHERE id=${sid}`;
  return cfg;
}
export async function deleteScenario(scenarioId) {
  const s = sql(), sid = int(scenarioId, 'id', { min: 1, max: 1e9 });
  const [{ n }] = await s`SELECT count(*)::int AS n FROM ds_scenarios`;
  if (n <= 1) fail('ต้องมีอย่างน้อย 1 scenario');
  await s`DELETE FROM ds_scenarios WHERE id=${sid}`;
}
export async function setActiveScenario(scenarioId) {
  const sid = int(scenarioId, 'id', { min: 1, max: 1e9 }), s = sql();
  if (!(await s`SELECT 1 FROM ds_scenarios WHERE id=${sid}`).length) fail('Scenario not found');
  await s`INSERT INTO ds_settings (key,value) VALUES ('activeScenario', ${JSON.stringify(sid)}::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`;
  return loadRecords(sid);
}

/** Run the engine with DB data. Feasible -> persist schedule. Infeasible -> clear stale schedule (old version kept as revision). */
export async function generateScenario(scenarioId) {
  const s = sql(), sid = int(scenarioId, 'id', { min: 1, max: 1e9 });
  const sc = (await s`SELECT id, config FROM ds_scenarios WHERE id=${sid}`)[0];
  if (!sc) fail('Scenario not found');
  const base = await loadBase();
  const res = generateSchedule(engineInput(base, sc.config));
  const summary = resultSummary(res);
  if (res.timeSlots.length) await replaceTimeSlots(sid, res.timeSlots);
  await replaceSchedule(sid, res.feasible ? res.schedules : [], res.feasible ? 'regenerate' : 'regenerate (infeasible)');
  await s`UPDATE ds_scenarios SET last_result=${JSON.stringify(summary)}::jsonb, updated_at=now() WHERE id=${sid}`;
  return { lastResult: summary, records: await loadRecords(sid) };
}
