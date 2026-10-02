import { randomUUID } from 'node:crypto';
import { sql } from '../db.js';
import { str, bool, id } from '../validate.js';

const clean = (p) => ({ code: str(p.code, 'code', { max: 32 }), name: str(p.name, 'name', { max: 80 }), groupId: p.groupId ? id(p.groupId, 'groupId') : null, defaultPostId: p.defaultPostId ? id(p.defaultPostId, 'defaultPostId') : null, active: bool(p.active, true), note: str(p.note, 'note', { max: 300, optional: true }) });

export async function createPersonnel(p) {
  const v = clean(p), s = sql(), pid = `p_${randomUUID().slice(0, 8)}`;
  const [{ n }] = await s`SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM ds_personnel`;
  await s`INSERT INTO ds_personnel (id, code, name, group_id, default_post_id, active, note, sort_order) VALUES (${pid}, ${v.code}, ${v.name}, ${v.groupId}, ${v.defaultPostId}, ${v.active}, ${v.note}, ${n})`;
  return { id: pid, ...v, sortOrder: n };
}
export async function updatePersonnel(pid, p) {
  const v = clean(p);
  await sql()`UPDATE ds_personnel SET code=${v.code}, name=${v.name}, group_id=${v.groupId}, default_post_id=${v.defaultPostId}, active=${v.active}, note=${v.note}, updated_at=now() WHERE id=${id(pid, 'id')}`;
}
export async function deletePersonnel(pid) { await sql()`DELETE FROM ds_personnel WHERE id=${id(pid, 'id')}`; }
export async function reorderPersonnel(ids) {
  const s = sql();
  await s.transaction(ids.map((x, i) => s`UPDATE ds_personnel SET sort_order=${i}, updated_at=now() WHERE id=${id(x, 'id')}`));
}
