import AppShell from '../components/AppShell.jsx';
import { loadInitial } from '../lib/services/data.js';
import { generateScenario } from '../lib/services/scenarioService.js';
import { sql } from '../lib/db.js';

export const dynamic = 'force-dynamic';

export default async function Page() {
  try {
    // First run: let the real scheduler produce (and persist) a schedule/diagnosis for scenarios that never ran.
    const pending = await sql()`SELECT id FROM ds_scenarios WHERE last_result IS NULL ORDER BY id`;
    for (const r of pending) { try { await generateScenario(r.id); } catch (e) { console.error('[seed-generate]', r.id, e); } }
    const initial = await loadInitial();
    return <AppShell initial={initial} />;
  } catch (e) {
    console.error('[page] load failed', e);
    return (
      <main className="mx-auto max-w-md p-6">
        <div className="card st-bad">
          <h1 className="text-lg font-semibold">เชื่อมต่อฐานข้อมูลไม่ได้</h1>
          <p className="mt-2 text-sm">ตรวจสอบ DATABASE_URL (Vercel → Settings → Environment Variables) และว่าได้รัน <code>npm run db:setup</code> แล้ว</p>
          <p className="mt-2 break-words text-xs opacity-80">{String(e?.message ?? e)}</p>
        </div>
      </main>
    );
  }
}
