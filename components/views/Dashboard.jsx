'use client';
import { CheckCircle2, XCircle, AlertTriangle, ShieldAlert, Database } from 'lucide-react';
import { useApp } from '../ctx.js';
import { thDate } from '../../lib/clientUtils.js';
import { dateOf } from '../../lib/engine/index.js';

const Stat = ({ label, value, tone }) => (
  <div className={`card !p-3 ${tone ?? ''}`}><div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div><div className="text-2xl font-semibold tabular-nums">{value}</div></div>
);

export default function Dashboard() {
  const { diag, personnel, posts, config, stats, validation, overrides, readOnly, scenarioApi, activeId, selectedDay, setSelectedDay, setTab, setSub, busy, activePosts, slots } = useApp();
  const req = diag?.requirement;
  const activePeople = personnel.filter((p) => p.active).length;
  const o = stats?.overall;
  const dayShort = validation.shortages.filter((s) => s.dayIndex === selectedDay);
  return (
    <div className="space-y-4">
      <section className={`card ${diag?.feasible ? '' : 'st-bad'}`}>
        <div className="flex items-start gap-3">
          {diag?.feasible ? <CheckCircle2 className="mt-0.5 text-emerald-600" /> : <XCircle className="mt-0.5" />}
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{diag?.feasible ? 'Configuration นี้ทำได้จริง (feasible)' : 'Configuration นี้ทำไม่ได้ (infeasible)'}</h2>
            {!diag?.feasible && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{(diag?.reasons ?? ['ไม่มีข้อมูล']).slice(0, 12).map((r, i) => <li key={i}>{r}</li>)}</ul>
            )}
            {readOnly && diag?.feasible && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">ยังไม่มีตารางที่บันทึกในฐานข้อมูลสำหรับ Scenario นี้</p>}
            {(readOnly || !diag?.feasible) && (
              <button className="btn btn-primary mt-3" disabled={busy} onClick={() => scenarioApi.generate(activeId)}><Database size={16} />{diag?.feasible ? 'สร้างตารางและบันทึก' : 'ตรวจ/ลองสร้างใหม่'}</button>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="กำลังพลทั้งหมด (active)" value={activePeople} />
        <Stat label="จุดทั้งหมด" value={activePosts.length} />
        <Stat label="คนต่อจุด" value={config?.peoplePerPost ?? '—'} />
        <Stat label="กำลังพลที่ต้องใช้" value={req?.required ?? '—'} />
        <Stat label="กำลังพลขาด" value={req?.shortage ?? '—'} tone={req?.shortage ? 'st-bad' : ''} />
      </section>

      <section className="card">
        <h3 className="mb-3 text-sm font-semibold">ชั่วโมงรวม ({config?.days} วัน){readOnly ? ' — จากตารางทดลอง' : ''}</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="st-duty rounded-xl p-3">เข้า<b className="block text-xl tabular-nums">{o?.dutyHours ?? 0} ชม.</b></div>
          <div className="st-withdraw rounded-xl p-3">ถอน<b className="block text-xl tabular-nums">{o?.withdrawalHours ?? 0} ชม.</b></div>
          <div className="st-rest rounded-xl p-3">พัก<b className="block text-xl tabular-nums">{o?.restHours ?? 0} ชม.</b></div>
          <div className="st-warn rounded-xl p-3">กลางคืน ({config?.nightStart}-{config?.nightEnd})<b className="block text-xl tabular-nums">{o?.nightHours ?? 0} ชม.</b></div>
        </div>
      </section>

      <section className="card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">สถานะจุด</h3>
          <select aria-label="เลือกวัน" className="input !min-h-[36px] !w-auto" value={selectedDay} onChange={(e) => setSelectedDay(+e.target.value)}>
            {Array.from({ length: config?.days ?? 0 }, (_, d) => <option key={d} value={d}>{thDate(dateOf(config.startDate, d))}</option>)}
          </select>
        </div>
        <ul className="space-y-2">
          {activePosts.map((p) => {
            const miss = dayShort.filter((s) => s.postId === p.id);
            const n = miss.reduce((a, s) => a + s.shortage, 0);
            return (
              <li key={p.id}>
                <button onClick={() => { setTab('schedule'); setSub('day'); }} className="flex w-full items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 text-left dark:bg-zinc-800/50">
                  <span className="font-medium">{p.name}</span>
                  {n ? <span className="chip st-bad"><XCircle size={14} />ขาด {n} ({miss.map((s) => s.slot).slice(0, 2).join(', ')}{miss.length > 2 ? '…' : ''})</span> : <span className="chip st-ok"><CheckCircle2 size={14} />ครบ</span>}
                </button>
              </li>
            );
          })}
          {!activePosts.length && <li className="text-sm text-zinc-500">ยังไม่มีจุด</li>}
        </ul>
      </section>

      <section className="grid grid-cols-3 gap-3 text-center">
        <div className="card st-bad !p-3"><ShieldAlert className="mx-auto" size={18} /><div className="text-2xl font-semibold">{validation.counts.critical + validation.counts.conflict}</div><div className="text-xs">Errors</div></div>
        <div className="card st-warn !p-3"><AlertTriangle className="mx-auto" size={18} /><div className="text-2xl font-semibold">{validation.counts.warning}</div><div className="text-xs">Warnings</div></div>
        <div className="card !p-3"><AlertTriangle className="mx-auto text-zinc-500" size={18} /><div className="text-2xl font-semibold">{overrides}</div><div className="text-xs">Manual Overrides</div></div>
      </section>
    </div>
  );
}
