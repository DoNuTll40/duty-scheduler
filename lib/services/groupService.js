import { sql } from '../db.js';
import { str, id } from '../validate.js';
export async function createGroup(g) {
  const gid = id(g.id, 'id'), name = str(g.name ?? gid, 'name', { max: 60 }), s = sql();
  const [{ n }] = await s`SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM ds_groups`;
  await s`INSERT INTO ds_groups (id,name,sort_order) VALUES (${gid},${name},${n})`;
  return { id: gid, name, sortOrder: n };
}
export async function deleteGroup(gid) { await sql()`DELETE FROM ds_groups WHERE id=${id(gid, 'id')}`; }
