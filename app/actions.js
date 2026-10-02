'use server';
import { loadInitial, loadRecords } from '../lib/services/data.js';
import * as P from '../lib/services/personnelService.js';
import * as Po from '../lib/services/postService.js';
import * as G from '../lib/services/groupService.js';
import * as S from '../lib/services/scenarioService.js';
import * as Sch from '../lib/services/scheduleService.js';
import * as B from '../lib/services/backupService.js';

// Every action returns {ok, data} | {ok:false, error}; nothing throws across the boundary (DB down, bad input, ...).
async function run(fn, args) {
  try { return { ok: true, data: await fn(...args) }; }
  catch (e) {
    console.error('[action]', e);
    return { ok: false, error: String(e?.message ?? '').includes('duplicate key') ? 'ข้อมูลซ้ำ (เช่น รหัสซ้ำ)' : (e?.message ?? 'Unknown error') };
  }
}

export async function reloadAll() { return run(loadInitial, []); }
export async function loadScenarioRecords(id) { return run(loadRecords, [id]); }
export async function createPersonnel(p) { return run(P.createPersonnel, [p]); }
export async function updatePersonnel(id, p) { return run(P.updatePersonnel, [id, p]); }
export async function deletePersonnel(id) { return run(P.deletePersonnel, [id]); }
export async function reorderPersonnel(ids) { return run(P.reorderPersonnel, [ids]); }
export async function createPost(p) { return run(Po.createPost, [p]); }
export async function updatePost(id, p) { return run(Po.updatePost, [id, p]); }
export async function deletePost(id) { return run(Po.deletePost, [id]); }
export async function reorderPosts(ids) { return run(Po.reorderPosts, [ids]); }
export async function createGroup(g) { return run(G.createGroup, [g]); }
export async function deleteGroup(id) { return run(G.deleteGroup, [id]); }
export async function createScenario(p) { return run(S.createScenario, [p]); }
export async function updateScenario(id, p) { return run(S.updateScenario, [id, p]); }
export async function deleteScenario(id) { return run(S.deleteScenario, [id]); }
export async function setActiveScenario(id) { return run(S.setActiveScenario, [id]); }
export async function generateScenario(id) { return run(S.generateScenario, [id]); }
export async function saveSchedule(id, changes) { return run(Sch.saveChanges, [id, changes]); }
export async function listRevisions(id) { return run(Sch.listRevisions, [id]); }
export async function exportBackup() { return run(B.exportAll, []); }
export async function importBackup(doc) { return run(B.importAll, [doc]); }
