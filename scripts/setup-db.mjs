// Usage: DATABASE_URL=... npm run db:setup   (creates tables; seeds only if empty)
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set'); process.exit(1); }
const sql = neon(url);
const run = async (file) => {
  const stmts = readFileSync(new URL(`../db/${file}`, import.meta.url), 'utf8').split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
  for (const s of stmts) await sql.query(s);
  console.log(`${file}: ${stmts.length} statements`);
};
await run('schema.sql');
const [{ n }] = await sql`SELECT count(*)::int AS n FROM ds_personnel`;
if (n === 0) await run('seed.sql'); else console.log('seed skipped (data exists)');
