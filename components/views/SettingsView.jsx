'use client';
import { useMemo, useRef, useState } from 'react';
import { Copy, Trash2, Play, Download, Upload, Printer, Pencil, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../ctx.js';
import { BottomSheet, Field, Segmented, cx } from '../ui.jsx';
import { generateSchedule, compareRequirement } from '../../lib/engine/index.js';
import { download, csvCell } from '../../lib/clientUtils.js';
import * as A from '../../app/actions.js';

const toForm = (c) => ({ startDate: c.startDate, days: String(c.days), startTime: c.startTime, slotDuration: String(c.slotDuration), peoplePerPost: String(c.peoplePerPost), dutyHours: String(c.dutyHours), withdrawalHours: String(c.withdrawalHours), minimumRestHours: String(c.minimumRestHours), nightStart: c.nightStart, nightEnd: c.nightEnd, maximumDutyHoursPerDay: c.maximumDutyHoursPerDay == null ? '' : String(c.maximumDutyHoursPerDay), maximumDutyHoursPerPeriod: c.maximumDutyHoursPerPeriod == null ? '' : String(c.maximumDutyHoursPerPeriod), alternateDays: c.alternateDays, rotationEnabled: c.rotationEnabled, pattern: c.customPattern ? JSON.stringify(c.customPattern) : '' });
const optNum = (s) => (s === '' ? null : Number(s));
function toConfig(f) {
  let customPattern;
  if (f.pattern.trim()) { try { customPattern = JSON.parse(f.pattern); } catch { throw new Error('Pattern ไม่ใช่ JSON ที่ถูกต้อง'); } }
  const c = { startDate: f.startDate, days: Number(f.days), startTime: f.startTime, slotDuration: Number(f.slotDuration), peoplePerPost: Number(f.peoplePerPost), dutyHours: Number(f.dutyHours), withdrawalHours: Number(f.withdrawalHours), minimumRestHours: Number(f.minimumRestHours), nightStart: f.nightStart, nightEnd: f.nightEnd, maximumDutyHoursPerDay: optNum(f.maximumDutyHoursPerDay), maximumDutyHoursPerPeriod: optNum(f.maximumDutyHoursPerPeriod), alternateDays: f.alternateDays, rotationEnabled: f.rotationEnabled };
  if (customPattern) c.customPattern = customPattern;
  return c;
}
const runEngine = (cfg, ctx) => { try { return generateSchedule({ ...cfg, posts: ctx.posts, personnel: ctx.personnel, groups: ctx.groups.map((g) => g.id), shiftTypes: ctx.shiftTypes }); } catch { return null; } };
const mean = (o, k) => { const v = Object.values(o ?? {}); return v.length ? Math.round((v.reduce((a, x) => a + x[k], 0) / v.length) * 100) / 100 : '—'; };

function ConfigSection() {
  const ctx = useApp();
  const { config, scenario, diag, stats, scenarios, scenarioApi, activeId, setConfirm, overrides, dirty, busy, toast } = ctx;
  const [f, setF] = useState(() => toForm(config));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const { draftCfg, err } = useMemo(() => { try { return { draftCfg: toConfig(f) }; } catch (e) { return { err: e.message }; } }, [f]);
  const draft = useMemo(() => (draftCfg ? runEngine(draftCfg, ctx) : null), [draftCfg, ctx.posts, ctx.personnel, ctx.groups, ctx.shiftTypes]); // eslint-disable-line
  const changed = !!draftCfg && JSON.stringify(draftCfg) !== JSON.stringify(config);
  const cmp = draft && diag ? compareRequirement(diag.requirement, draft.requirement) : null;
  const apply = () => {
    const run = async () => { if (await scenarioApi.update(activeId, { name: scenario.name, description: scenario.description, config: draftCfg })) await scenarioApi.generate(activeId); };
    if (dirty || overrides) setConfirm({ title: 'สร้างตารางใหม่?', body: 'การสร้างใหม่จะแทนที่ตารางปัจจุบัน (รวมการแก้ไขด้วยมือ/Override) ฉบับเดิมเก็บไว้ใน revision', danger: true, confirmLabel: 'Regenerate', onConfirm: run });
    else run();
  };
  const create = async () => {
    const n = await scenarioApi.create({ name: `Scenario ${scenarios.length + 1}`, description: '', config: draftCfg });
    if (n) toast('สร้างแล้ว — เลือกจากเมนูด้านบน แล้วกด Regenerate เพื่อสร้างตาราง', 'ok');
  };
  const F = ({ k, label, type = 'text', mode }) => <Field label={label}><input className="input" type={type} inputMode={mode} value={f[k]} onChange={set(k)} /></Field>;
  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-2 gap-3">
        <F k="startDate" label="วันเริ่ม" type="date" /><F k="days" label="จำนวนวัน" mode="numeric" />
        <F k="startTime" label="เวลาเริ่ม (HH:MM)" /><F k="slotDuration" label="ความยาว slot (ชม.)" mode="decimal" />
        <F k="peoplePerPost" label="คน/จุด" mode="numeric" /><F k="dutyHours" label="เวร (ชม.)" mode="decimal" />
        <F k="withdrawalHours" label="ถอน (ชม.)" mode="decimal" /><F k="minimumRestHours" label="พักขั้นต่ำ (ชม.)" mode="decimal" />
        <F k="nightStart" label="กลางคืนเริ่ม" /><F k="nightEnd" label="กลางคืนสิ้นสุด" />
        <F k="maximumDutyHoursPerDay" label="เวรสูงสุด/วัน (ว่าง=ไม่จำกัด)" mode="decimal" /><F k="maximumDutyHoursPerPeriod" label="เวรสูงสุด/ช่วง (ว่าง=ไม่จำกัด)" mode="decimal" />
        <label className="col-span-2 flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.alternateDays} onChange={set('alternateDays')} />สลับวัน/กลุ่ม (Alternate Days)</label>
        <label className="col-span-2 flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={f.rotationEnabled} onChange={set('rotationEnabled')} />สลับช่วงเวร (Rotation)</label>
        <details className="col-span-2"><summary className="cursor-pointer text-sm font-medium">Pattern เวรเอง (ขั้นสูง)</summary>
          <p className="my-2 text-xs text-zinc-500">JSON: แต่ละลำดับคนในจุด → รายการ shift-type id ต่อ slot เช่น <code>[[&quot;on-duty&quot;,&quot;on-duty&quot;,&quot;rest&quot;,&quot;rest&quot;,&quot;withdraw&quot;,&quot;rest&quot;]]</code> ว่าง = ให้ระบบจัดเอง ระบบจะไม่เปลี่ยนความหมายของ shift type เพื่อให้ผ่าน</p>
          <textarea className="input !min-h-[90px] py-2 font-mono text-xs" value={f.pattern} onChange={set('pattern')} /></details>
      </div>
      <section className="card space-y-2">
        <h3 className="text-sm font-semibold">Preview ก่อน Regenerate</h3>
        {err && <p className="st-bad rounded-lg px-3 py-2 text-sm">{err}</p>}
        {!changed && !err && <p className="text-sm text-zinc-500">ยังไม่มีการเปลี่ยนแปลงจากค่าปัจจุบัน</p>}
        {cmp && changed && (
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
            <dt>คน/จุด</dt><dd className="tabular-nums">{config.peoplePerPost} → {draftCfg.peoplePerPost}</dd>
            <dt>กำลังพลที่ต้องใช้</dt><dd className="tabular-nums">{cmp.oldRequired} → {cmp.newRequired}</dd>
            <dt>{cmp.reduction >= 0 ? 'ลดลง' : 'เพิ่มขึ้น'}</dt><dd className="tabular-nums">{Math.abs(cmp.reduction)} คน ({Math.abs(cmp.reductionPercent)}%)</dd>
            <dt>กำลังพลที่มี / ขาด</dt><dd className="tabular-nums">{draft.requirement.available} / {draft.requirement.shortage}</dd>
            <dt>เวรเฉลี่ย/คน (ชม.)</dt><dd className="tabular-nums">{stats?.aggregates?.averageDutyHours ?? '—'} → {draft.statistics?.aggregates?.averageDutyHours ?? '—'}</dd>
          </dl>
        )}
        {draft && (
          <div className={cx('rounded-xl px-3 py-2 text-sm', draft.feasible ? 'st-ok' : 'st-bad')}>
            <div className="flex items-center gap-2 font-medium">{draft.feasible ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{draft.feasible ? 'ทำได้จริง (feasible)' : 'ทำไม่ได้ (infeasible)'}</div>
            {!draft.feasible && <ul className="mt-1 list-disc pl-5">{draft.reasons.slice(0, 8).map((r, i) => <li key={i}>{r}</li>)}</ul>}
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
          <button className="btn btn-primary" disabled={!changed || busy} onClick={apply}>Regenerate</button>
          <button className="btn btn-ghost" disabled={!changed || busy} onClick={create}>Create Scenario</button>
          <button className="btn btn-ghost" disabled={!changed} onClick={() => setF(toForm(config))}>Keep Current</button>
        </div>
      </section>
    </div>
  );
}

function ScenarioTab() {
  const { scenarios, scenarioApi, activeId, setConfirm, busy } = useApp();
  const [edit, setEdit] = useState(null);
  return (
    <div className="space-y-3">
      {scenarios.map((s) => {
        const r = s.lastResult;
        return (
          <div key={s.id} className={cx('card', s.id === activeId && 'ring-2 ring-indigo-500')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="font-semibold">{s.name}{s.id === activeId && <span className="chip st-duty ml-2 !min-h-[22px]">ใช้งานอยู่</span>}</div>
                <div className="text-xs text-zinc-500">{s.description || '—'}</div>
                <div className="mt-1 text-xs text-zinc-500">{s.config.peoplePerPost} คน/จุด · เวร {s.config.dutyHours} ชม. · ถอน {s.config.withdrawalHours} ชม.{s.config.customPattern ? ' · custom pattern' : ''}</div></div>
              {r && <span className={cx('chip shrink-0', r.feasible ? 'st-ok' : 'st-bad')}>{r.feasible ? <CheckCircle2 size={13} /> : <XCircle size={13} />}{r.feasible ? 'feasible' : 'infeasible'}</span>}
            </div>
            {r && !r.feasible && <ul className="mt-2 list-disc pl-5 text-xs text-zinc-600 dark:text-zinc-300">{r.reasons.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul>}
            <div className="mt-3 flex flex-wrap gap-2">
              {s.id !== activeId && <button className="btn btn-ghost !min-h-[38px]" onClick={() => scenarioApi.select(s.id)}>เลือก</button>}
              <button className="btn btn-ghost !min-h-[38px]" disabled={busy} onClick={() => scenarioApi.generate(s.id)}><Play size={15} />Generate</button>
              <button className="btn btn-ghost !min-h-[38px]" onClick={() => setEdit({ id: s.id, name: s.name, description: s.description ?? '', config: s.config })} aria-label="เปลี่ยนชื่อ"><Pencil size={15} /></button>
              <button className="btn btn-ghost !min-h-[38px]" onClick={() => scenarioApi.create({ name: `${s.name} (copy)`, description: s.description, cloneFrom: s.id })} aria-label="Clone"><Copy size={15} /></button>
              <button className="btn btn-ghost !min-h-[38px] text-red-600" disabled={scenarios.length <= 1} aria-label="ลบ" onClick={() => setConfirm({ title: `ลบ ${s.name}?`, body: 'ตารางและประวัติ revision ของ Scenario นี้จะถูกลบถาวร', danger: true, confirmLabel: 'ลบ', onConfirm: () => scenarioApi.remove(s.id) })}><Trash2 size={15} /></button>
            </div>
          </div>
        );
      })}
      <BottomSheet open={!!edit} onClose={() => setEdit(null)} title="แก้ไข Scenario" footer={<><button className="btn btn-ghost flex-1" onClick={() => setEdit(null)}>ยกเลิก</button><button className="btn btn-primary flex-1" disabled={!edit?.name?.trim()} onClick={async () => { if (await scenarioApi.update(edit.id, { name: edit.name, description: edit.description, config: edit.config })) setEdit(null); }}>บันทึก</button></>}>
        {edit && <div className="space-y-3"><Field label="ชื่อ"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field><Field label="คำอธิบาย"><input className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field></div>}
      </BottomSheet>
    </div>
  );
}

function CompareTab() {
  const ctx = useApp();
  const rows = useMemo(() => ctx.scenarios.map((s) => ({ s, r: runEngine(s.config, ctx) })), [ctx.scenarios, ctx.posts, ctx.personnel, ctx.groups, ctx.shiftTypes]); // eslint-disable-line
  const M = [
    ['ทำได้จริง?', (r) => (r.feasible ? '✓ feasible' : '✗ infeasible')],
    ['กำลังพลที่ต้องใช้', (r) => `${r.requirement.required} (มี ${r.requirement.available})`],
    ['เวร ชม./คน (เฉลี่ย)', (r) => r.statistics?.aggregates.averageDutyHours ?? '—'],
    ['ถอน ชม./คน (เฉลี่ย)', (r) => mean(r.statistics?.byPersonnel, 'withdrawalHours')],
    ['ดึก ชม./คน (เฉลี่ย)', (r) => mean(r.statistics?.byPersonnel, 'nightHours')],
    ['Coverage errors (ช่อง)', (r) => r.shortages.length],
    ['Duty difference (ชม.)', (r) => r.fairness?.overall.dutyHourDifference ?? '—'],
    ['Night difference (ชม.)', (r) => r.fairness?.overall.nightHourDifference ?? '—'],
    ['ปัญหาอื่น (conflict)', (r) => r.violations.length],
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">แสดงตัวเลขจริงเท่านั้น ไม่มีการจัดอันดับหรือแนะนำ — เลือกเองตามบริบทของคุณ</p>
      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[420px] text-sm">
          <thead><tr className="border-b border-zinc-200 text-left dark:border-zinc-800"><th className="p-3 font-medium">Metric</th>{rows.map(({ s }) => <th key={s.id} className="p-3 font-medium">{s.name}</th>)}</tr></thead>
          <tbody>{M.map(([label, fn]) => <tr key={label} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/60"><td className="p-3 text-zinc-500">{label}</td>{rows.map(({ s, r }) => <td key={s.id} className="p-3 tabular-nums">{r ? fn(r) : 'config ผิด'}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {rows.map(({ s, r }) => r && !r.feasible && (
        <details key={s.id} className="card"><summary className="cursor-pointer text-sm font-medium">{s.name}: เหตุผลที่ไม่ผ่าน ({r.reasons.length})</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul></details>
      ))}
    </div>
  );
}

function DataTab() {
  const { records, personnel, posts, shiftTypes, slots, config, scenario, theme, setTheme, toast, call, setConfirm, dirty } = useApp();
  const file = useRef(null);
  const exportCsv = () => {
    const head = ['date', 'slot', 'post', 'personnel', 'group', 'shift', 'manual_override', 'override_reason'];
    const lines = records.filter((r) => r.postId).map((r) => [r.date, slots[r.slotIndex]?.label, posts.find((p) => p.id === r.postId)?.name ?? r.postId, personnel.find((p) => p.id === r.personnelId)?.code ?? r.personnelId, r.groupId, shiftTypes.find((t) => t.id === r.shiftTypeId)?.name, r.manualOverride, r.overrideReason].map(csvCell).join(','));
    download(`schedule-${scenario.name.replace(/\s+/g, '_')}.csv`, '\uFEFF' + [head.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
  };
  const exportJson = async () => { const r = await call(A.exportBackup); if (r) download(`duty-scheduler-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(r.data, null, 2), 'application/json'); };
  const onFile = async (e) => {
    const fl = e.target.files?.[0]; e.target.value = ''; if (!fl) return;
    let doc; try { doc = JSON.parse(await fl.text()); } catch { return toast('ไฟล์ไม่ใช่ JSON', 'error'); }
    setConfirm({ title: 'กู้คืนจาก backup?', body: `ข้อมูลทั้งหมดในฐานข้อมูลจะถูกแทนที่ด้วยไฟล์นี้ (${doc?.personnel?.length ?? 0} คน, ${doc?.posts?.length ?? 0} จุด, ${doc?.scenarios?.length ?? 0} scenario)\nระบบจะตรวจความถูกต้องก่อนเขียน`, danger: true, confirmLabel: 'กู้คืน', onConfirm: async () => { const r = await call(A.importBackup, doc); if (r) { toast('กู้คืนสำเร็จ กำลังโหลดใหม่…', 'ok'); setTimeout(() => location.reload(), 800); } } });
  };
  return (
    <div className="space-y-3">
      <section className="card space-y-2"><h3 className="text-sm font-semibold">ธีม</h3>
        <Segmented value={theme} onChange={setTheme} options={[{ value: 'light', label: 'สว่าง' }, { value: 'dark', label: 'มืด' }, { value: 'system', label: 'ตามระบบ' }]} /></section>
      <section className="card space-y-2"><h3 className="text-sm font-semibold">Export</h3>
        <button className="btn btn-ghost w-full" disabled={!records.length} onClick={exportCsv}><Download size={16} />CSV (ตารางดิบ)</button>
        <button className="btn btn-ghost w-full" onClick={() => window.print()}><Printer size={16} />พิมพ์ / บันทึกเป็น PDF (A4)</button>
        <p className="text-xs text-zinc-500">PDF: เลือก “Save as PDF” ในหน้าต่างพิมพ์ — ใช้ CSS สำหรับ A4 ที่เตรียมไว้</p></section>
      <section className="card space-y-2"><h3 className="text-sm font-semibold">Backup (JSON)</h3>
        <button className="btn btn-ghost w-full" onClick={exportJson}><Download size={16} />Export ทั้งหมด</button>
        <button className="btn btn-ghost w-full" disabled={dirty} onClick={() => file.current?.click()}><Upload size={16} />Import / กู้คืน</button>
        {dirty && <p className="text-xs text-amber-600">บันทึกหรือทิ้งการแก้ไขตารางก่อน Import</p>}
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={onFile} /></section>
    </div>
  );
}

export default function SettingsView() {
  const ctx = useApp();
  const [tab, setTab] = useState('config');
  return (
    <div className="space-y-3">
      <Segmented value={tab} onChange={setTab} options={[{ value: 'config', label: 'ค่าเวร' }, { value: 'scn', label: 'Scenario' }, { value: 'cmp', label: 'เปรียบเทียบ' }, { value: 'data', label: 'ข้อมูล' }]} />
      {tab === 'config' && <ConfigSection key={ctx.activeId + JSON.stringify(ctx.config)} />}
      {tab === 'scn' && <ScenarioTab />}
      {tab === 'cmp' && <CompareTab />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}
