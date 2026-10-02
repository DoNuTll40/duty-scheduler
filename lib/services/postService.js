import { randomUUID } from 'node:crypto';
import { sql } from '../db.js';
import { str, int, bool, id } from '../validate.js';

const clean = (p) => ({
  name: str(p.name, 'name', { max: 80 }), minPersonnel: int(p.minPersonnel ?? 1, 'minPersonnel', { min: 0, max: 100 }),
  maxPersonnel: int(p.maxPersonnel, 'maxPersonnel', { min: 1, max: 100, optional: true }),
  requiredPersonnel: int(p.requiredPersonnel, 'requiredPersonnel', { min: 1, max: 100, optional: true }),
  requiredPerSlot: int(p.requiredPerSlot ?? 1, 'requiredPerSlot', { min: 1, max: 20 }), is24Hours: bool(p.is24Hours, true), active: bool(p.active, true),
});
export async function createPost(p) {
  const v = clean(p), s = sql(), pid = `post_${randomUUID().slice(0, 8)}`;
  const [{ n }] = await s`SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM ds_posts`;
  await s`INSERT INTO ds_posts (id,name,min_personnel,max_personnel,required_personnel,required_per_slot,is_24_hours,active,sort_order) VALUES (${pid},${v.name},${v.minPersonnel},${v.maxPersonnel},${v.requiredPersonnel},${v.requiredPerSlot},${v.is24Hours},${v.active},${n})`;
  return { id: pid, ...v, sortOrder: n };
}
export async function updatePost(pid, p) {
  const v = clean(p);
  await sql()`UPDATE ds_posts SET name=${v.name}, min_personnel=${v.minPersonnel}, max_personnel=${v.maxPersonnel}, required_personnel=${v.requiredPersonnel}, required_per_slot=${v.requiredPerSlot}, is_24_hours=${v.is24Hours}, active=${v.active}, updated_at=now() WHERE id=${id(pid, 'id')}`;
}
export async function deletePost(pid) { await sql()`DELETE FROM ds_posts WHERE id=${id(pid, 'id')}`; }
export async function reorderPosts(ids) {
  const s = sql();
  await s.transaction(ids.map((x, i) => s`UPDATE ds_posts SET sort_order=${i}, updated_at=now() WHERE id=${id(x, 'id')}`));
}
