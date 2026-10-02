'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, CalendarDays, Users, MapPin, Settings, Undo2, Redo2, Save, AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { AppCtx } from './ctx.js';
import { BottomSheet, Confirm, Field, cx } from './ui.jsx';
import Dashboard from './views/Dashboard.jsx';
import ScheduleView from './views/ScheduleView.jsx';
import PersonnelView from './views/PersonnelView.jsx';
import PostsView from './views/PostsView.jsx';
import SettingsView from './views/SettingsView.jsx';
import ValidationPanel from './views/ValidationPanel.jsx';
import * as A from '../app/actions.js';
import { generateSchedule, validateSchedule, summarize, HARD, autoBalance, dateOf, dayBaseMinutes, parseTime } from '../lib/engine/index.js';
import { stripRec, sevRank } from '../lib/clientUtils.js';

const NAV = [['home', 'หน้าแรก', Home], ['schedule', 'ตารางเวร', CalendarDays], ['people', 'กำลังพล', Users], ['posts', 'จุด', MapPin], ['settings', 'ตั้งค่า', Settings]];
const issueKey = (i) => `${i.code}|${i.message}`;

export default function AppShell({ initial }) {
  const [base, setBase] = useState({ personnel: initial.personnel, posts: initial.posts, groups: initial.groups, shiftTypes: initial.shiftTypes, scenarios: initial.scenarios });
  const [activeId, setActiveId] = useState(initial.activeScenarioId);
  const [hist, setHist] = useState({ present: initial.records, saved: initial.records, past: [], future: [] });
  const [tab, setTab] = useState('home');
  const [sub, setSub] = useState('day');
  const [selectedDay, setSelectedDay] = useState(0);
  const [selPerson, setSelPerson] = useState(null);
  const [selPost, setSelPost] = useState(null);
  const [focus, setFocus] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [gate, setGate] = useState(null);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [scnOpen, setScnOpen] = useState(false);
  const uidN = useRef(0);

  const scenario = base.scenarios.find((s) => s.id === activeId) ?? null;
  const config = scenario?.config ?? null;
  const engineIn = useMemo(() => (config ? { ...config, posts: base.posts, personnel: base.personnel, groups: base.groups.map((g) => g.id), shiftTypes: base.shiftTypes } : null), [config, base]);
  const diag = useMemo(() => { try { return engineIn ? generateSchedule(engineIn) : null; } catch (e) { console.error(e); return null; } }, [engineIn]);
  const slots = diag?.timeSlots ?? [];
  const hasSaved = hist.present.length > 0;
  const records = useMemo(() => (hasSaved ? hist.present : diag?.diagnosticDraft?.records ?? []), [hasSaved, hist.present, diag]);
  const readOnly = !hasSaved;
  const dirty = hist.present !== hist.saved;
  const activePosts = useMemo(() => base.posts.filter((p) => p.active), [base.posts]);
  const vctx = useMemo(() => (config && slots.length ? { posts: base.posts, personnel: base.personnel, shiftTypes: base.shiftTypes, slots, settings: config, startDate: config.startDate, days: config.days } : null), [config, slots, base]);
  const validation = useMemo(() => (vctx ? validateSchedule({ records, ...vctx }) : { issues: [], shortages: [], counts: { critical: 0, conflict: 0, warning: 0, info: 0 } }), [records, vctx]);
  const stats = useMemo(() => { try { return config && base.shiftTypes.length ? summarize(records, { shiftTypes: base.shiftTypes, settings: config }) : null; } catch { return null; } }, [records, config, base.shiftTypes]);
  const issues = useMemo(() => [...validation.issues].sort((a, b) => sevRank[a.severity] - sevRank[b.severity]), [validation]);
  const overrides = useMemo(() => records.filter((r) => r.manualOverride).length, [records]);

  const toast = useCallback((msg, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const call = useCallback(async (fn, ...args) => {
    setBusy(true);
    try { const r = await fn(...args); if (!r.ok) { toast(r.error, 'error'); return null; } return r; }
    catch (e) { toast('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่', 'error'); return null; }
    finally { setBusy(false); }
  }, [toast]);

  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  useEffect(() => {
    if (!focus || tab !== 'schedule') return;
    const el = document.getElementById(`cell-${focus.postId}-${focus.slotIndex}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const t = setTimeout(() => setFocus(null), 2500);
    return () => clearTimeout(t);
  }, [focus, tab, selectedDay, sub]);
  useEffect(() => { if (config && selectedDay >= config.days) setSelectedDay(0); }, [config, selectedDay]);

  // ---------- schedule editing (history stack, validation gate) ----------
  const commit = useCallback((next) => setHist((h) => ({ ...h, past: [...h.past, h.present].slice(-100), present: next, future: [] })), []);
  const undo = () => setHist((h) => (h.past.length ? { ...h, present: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.present, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length ? { ...h, present: h.future[0], past: [...h.past, h.present], future: h.future.slice(1) } : h));

  const makeRecord = useCallback((day, slotIndex, postId, personnelId, shiftTypeId) => {
    const slot = slots[slotIndex], p = base.personnel.find((x) => x.id === personnelId);
    const sMin = dayBaseMinutes(config.startDate, day) + parseTime(config.startTime) + slot.offsetMinutes;
    return { uid: `n-${++uidN.current}`, date: dateOf(config.startDate, day), dayIndex: day, slotIndex, postId, personnelId, groupId: p?.groupId ?? null, shiftTypeId, startMin: sMin, endMin: sMin + slot.durationMinutes, manualOverride: false, overrideReason: null };
  }, [slots, base.personnel, config]);

  const requestEdit = useCallback((next, { label = 'แก้ไขตาราง' } = {}) => {
    if (readOnly) { toast('ตารางนี้ยังไม่ถูกสร้าง/ไม่ผ่านเงื่อนไข จึงแก้ไขไม่ได้ — ปรับค่าที่ตั้งค่าก่อน', 'error'); return false; }
    const before = new Set(validation.issues.filter((i) => HARD.has(i.severity)).map(issueKey));
    const after = validateSchedule({ records: next, ...vctx });
    const added = after.issues.filter((i) => HARD.has(i.severity) && !before.has(issueKey(i)));
    if (!added.length) { commit(next); return true; }
    setGate({ next, added, label });
    return false;
  }, [readOnly, validation, vctx, commit, toast]);

  const confirmGate = (reason) => {
    const cur = new Map(records.map((r) => [r.uid, JSON.stringify(stripRec(r))]));
    const next = gate.next.map((r) => (cur.get(r.uid) === JSON.stringify(stripRec(r)) ? r : { ...r, manualOverride: true, overrideReason: reason }));
    commit(next); setGate(null); toast('บันทึกการแก้ไขแบบ Override แล้ว (ยังไม่ได้บันทึกลงฐานข้อมูล)', 'warn');
  };

  const saveSchedule = async () => {
    const savedMap = new Map(hist.saved.map((r) => [r.uid, JSON.stringify(stripRec(r))]));
    const presentIds = new Set(hist.present.map((r) => r.uid));
    const inserts = hist.present.filter((r) => String(r.uid).startsWith('n-'));
    const updates = hist.present.filter((r) => !String(r.uid).startsWith('n-') && savedMap.get(r.uid) !== JSON.stringify(stripRec(r)));
    const deletes = hist.saved.filter((r) => !presentIds.has(r.uid)).map((r) => r.uid);
    const res = await call(A.saveSchedule, activeId, { inserts, updates, deletes, snapshot: hist.present.map(stripRec), note: overrides ? `manual edit (${overrides} override)` : 'manual edit' });
    if (res) { setHist({ present: res.data, saved: res.data, past: [], future: [] }); toast('บันทึกลงฐานข้อมูลแล้ว', 'ok'); }
  };

  const runAutoBalance = () => {
    if (readOnly) return toast('ยังไม่มีตารางที่บันทึกไว้', 'error');
    const out = autoBalance(records, vctx);
    if (!out.moves) return toast('ตารางสมดุลที่สุดเท่าที่ heuristic หาได้แล้ว (ไม่มีการสลับที่ช่วยได้)', 'info');
    if (requestEdit(out.records, { label: 'ปรับสมดุลอัตโนมัติ' })) toast(`ปรับสมดุล ${out.moves} ครั้ง — night diff ${out.before.f.nightHourDifference}→${out.after.f.nightHourDifference} ชม., duty diff ${out.before.f.dutyHourDifference}→${out.after.f.dutyHourDifference} ชม. (ตรวจ validate ใหม่แล้ว)`, 'ok');
  };

  // ---------- CRUD with optimistic UI + rollback ----------
  const optimistic = async (key, mutate, fn, ...args) => {
    const prev = base[key];
    setBase((b) => ({ ...b, [key]: mutate(b[key]) }));
    const r = await call(fn, ...args);
    if (!r) setBase((b) => ({ ...b, [key]: prev }));
    return r;
  };
  const people = {
    add: async (p) => { const r = await call(A.createPersonnel, p); if (r) setBase((b) => ({ ...b, personnel: [...b.personnel, r.data] })); return !!r; },
    edit: async (id, p) => !!(await optimistic('personnel', (l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)), A.updatePersonnel, id, p)),
    remove: async (id) => !!(await optimistic('personnel', (l) => l.filter((x) => x.id !== id), A.deletePersonnel, id)),
    reorder: async (ids) => !!(await optimistic('personnel', (l) => ids.map((id) => l.find((x) => x.id === id)).filter(Boolean), A.reorderPersonnel, ids)),
  };
  const postsApi = {
    add: async (p) => { const r = await call(A.createPost, p); if (r) setBase((b) => ({ ...b, posts: [...b.posts, r.data] })); return !!r; },
    edit: async (id, p) => !!(await optimistic('posts', (l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)), A.updatePost, id, p)),
    remove: async (id) => !!(await optimistic('posts', (l) => l.filter((x) => x.id !== id), A.deletePost, id)),
    reorder: async (ids) => !!(await optimistic('posts', (l) => ids.map((id) => l.find((x) => x.id === id)).filter(Boolean), A.reorderPosts, ids)),
  };
  const groupsApi = {
    add: async (g) => { const r = await call(A.createGroup, g); if (r) setBase((b) => ({ ...b, groups: [...b.groups, r.data] })); return !!r; },
    remove: async (id) => !!(await optimistic('groups', (l) => l.filter((x) => x.id !== id), A.deleteGroup, id)),
  };
  const guardDirty = (then, why = 'มีการแก้ไขที่ยังไม่ได้บันทึก จะถูกทิ้ง') => (dirty ? setConfirm({ title: 'ยังไม่ได้บันทึก', body: why, danger: true, confirmLabel: 'ทิ้งการแก้ไข', onConfirm: then }) : then());
  const resetHist = (recs) => setHist({ present: recs, saved: recs, past: [], future: [] });
  const scenarioApi = {
    select: (id) => guardDirty(async () => { const r = await call(A.setActiveScenario, id); if (r) { setActiveId(id); resetHist(r.data); setSelectedDay(0); } }),
    create: async (payload) => { const r = await call(A.createScenario, payload); if (r) { setBase((b) => ({ ...b, scenarios: [...b.scenarios, r.data] })); toast(`สร้าง ${r.data.name} แล้ว`, 'ok'); } return r?.data ?? null; },
    update: async (id, payload) => { const r = await call(A.updateScenario, id, payload); if (r) setBase((b) => ({ ...b, scenarios: b.scenarios.map((s) => (s.id === id ? { ...s, ...payload, config: r.data } : s)) })); return !!r; },
    remove: async (id) => { const r = await call(A.deleteScenario, id); if (!r) return; const left = base.scenarios.filter((s) => s.id !== id); setBase((b) => ({ ...b, scenarios: left })); if (id === activeId) { const n = left[0]; const rr = await call(A.setActiveScenario, n.id); setActiveId(n.id); resetHist(rr?.data ?? []); } },
    generate: async (id) => {
      const r = await call(A.generateScenario, id); if (!r) return null;
      setBase((b) => ({ ...b, scenarios: b.scenarios.map((s) => (s.id === id ? { ...s, lastResult: r.data.lastResult } : s)) }));
      if (id === activeId) resetHist(r.data.records);
      toast(r.data.lastResult.feasible ? 'สร้างตารางสำเร็จ' : 'ไม่ผ่านเงื่อนไข (infeasible) — ดูเหตุผลในหน้าแรก', r.data.lastResult.feasible ? 'ok' : 'warn');
      return r.data;
    },
  };

  const goIssue = (issue) => {
    const ref = issue.ref ?? {};
    setIssuesOpen(false); setTab('schedule');
    if (ref.dayIndex != null && ref.postId != null) { setSelectedDay(ref.dayIndex); setSub('day'); setFocus({ postId: ref.postId, slotIndex: ref.slotIndex }); }
    else if (ref.personnelId) { setSub('person'); setSelPerson(ref.personnelId); if (ref.dayIndex != null) setSelectedDay(ref.dayIndex); }
  };

  const [theme, setThemeState] = useState('system');
  useEffect(() => { setThemeState(localStorage.getItem('ds-theme') || 'system'); }, []);
  const setTheme = (t) => { setThemeState(t); try { localStorage.setItem('ds-theme', t); } catch {} document.documentElement.classList.toggle('dark', t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)); };

  const ctx = {
    ...base, scenario, activeId, config, diag, slots, records, readOnly, dirty, activePosts, vctx, validation, issues, stats, overrides,
    tab, setTab, sub, setSub, selectedDay, setSelectedDay, selPerson, setSelPerson, selPost, setSelPost, focus, goIssue,
    toast, call, busy, setConfirm, guardDirty, requestEdit, makeRecord, commit, undo, redo, canUndo: hist.past.length > 0, canRedo: hist.future.length > 0,
    saveSchedule, runAutoBalance, people, postsApi, groupsApi, scenarioApi, theme, setTheme, setIssuesOpen, setBase,
  };

  const hard = validation.counts.critical + validation.counts.conflict;
  return (
    <AppCtx.Provider value={ctx}>
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-zinc-50/90 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
          <div className="flex items-center gap-2">
            <button onClick={() => setScnOpen(true)} className="btn btn-ghost !min-h-[40px] max-w-[55%] flex-1 justify-start !px-3">
              <span className="truncate text-sm font-semibold">{scenario?.name ?? 'ไม่มี Scenario'}</span><ChevronDown size={16} className="shrink-0" />
            </button>
            {busy && <Loader2 size={18} className="animate-spin text-zinc-400" />}
            <div className="flex-1" />
            <button onClick={() => setIssuesOpen(true)} aria-label="ปัญหาที่พบ" className={cx('chip !min-h-[40px]', hard ? 'st-bad' : validation.counts.warning ? 'st-warn' : 'st-ok')}>
              <AlertTriangle size={14} />{issues.length ? `${issues.length} Issues` : 'ไม่มีปัญหา'}
            </button>
          </div>
          {tab === 'schedule' && !readOnly && (
            <div className="no-print mt-2 flex items-center gap-2">
              <button className="btn btn-ghost !min-h-[38px] !px-3" disabled={!hist.past.length} onClick={undo} aria-label="Undo"><Undo2 size={16} /></button>
              <button className="btn btn-ghost !min-h-[38px] !px-3" disabled={!hist.future.length} onClick={redo} aria-label="Redo"><Redo2 size={16} /></button>
              <div className="flex-1 text-xs text-zinc-500">{dirty ? 'มีการแก้ไขที่ยังไม่บันทึก' : 'บันทึกแล้ว'}</div>
              <button className="btn btn-primary !min-h-[38px]" disabled={!dirty || busy} onClick={saveSchedule}><Save size={16} />บันทึก</button>
            </div>
          )}
        </header>

        <main className="flex-1 px-4 pb-28 pt-4">
          {!scenario ? <p className="text-center text-sm text-zinc-500">ไม่มี Scenario — สร้างที่หน้าตั้งค่า</p>
            : tab === 'home' ? <Dashboard /> : tab === 'schedule' ? <ScheduleView /> : tab === 'people' ? <PersonnelView /> : tab === 'posts' ? <PostsView /> : <SettingsView />}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95" aria-label="เมนูหลัก">
          <div className="safe-b mx-auto flex max-w-3xl">
            {NAV.map(([k, label, Icon]) => (
              <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? 'page' : undefined}
                className={cx('flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', tab === k ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-500')}>
                <Icon size={21} />{label}
              </button>
            ))}
          </div>
        </nav>

        <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
          {toasts.map((t) => <div key={t.id} className={cx('pointer-events-auto max-w-sm rounded-xl px-4 py-2 text-sm shadow-lg', t.type === 'error' ? 'bg-red-600 text-white' : t.type === 'ok' ? 'bg-emerald-600 text-white' : t.type === 'warn' ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-white')}>{t.msg}</div>)}
        </div>

        <BottomSheet open={issuesOpen} onClose={() => setIssuesOpen(false)} title="Validation"><ValidationPanel /></BottomSheet>
        <BottomSheet open={scnOpen} onClose={() => setScnOpen(false)} title="เลือก Scenario">
          <div className="space-y-2">
            {base.scenarios.map((s) => (
              <button key={s.id} onClick={() => { setScnOpen(false); if (s.id !== activeId) scenarioApi.select(s.id); }} className={cx('card w-full text-left', s.id === activeId && 'ring-2 ring-indigo-500')}>
                <div className="font-medium">{s.name}</div><div className="text-xs text-zinc-500">{s.description}</div>
              </button>
            ))}
          </div>
        </BottomSheet>
        <GateSheet gate={gate} onCancel={() => setGate(null)} onOverride={confirmGate} />
        <Confirm state={confirm} onClose={() => setConfirm(null)} />
      </div>
    </AppCtx.Provider>
  );
}

function GateSheet({ gate, onCancel, onOverride }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (gate) setReason(''); }, [gate]);
  if (!gate) return null;
  return (
    <BottomSheet open title={`${gate.label}: ผิดเงื่อนไข`} onClose={onCancel}
      footer={<><button className="btn btn-ghost flex-1" onClick={onCancel}>ยกเลิกการแก้ไข</button>
        <button className="btn btn-danger flex-1" disabled={reason.trim().length < 3} onClick={() => onOverride(reason.trim())}>Override</button></>}>
      <p className="mb-2 text-sm text-zinc-500">การแก้ไขนี้ทำให้เกิดปัญหาใหม่ ระบบไม่รับโดยอัตโนมัติ:</p>
      <ul className="mb-3 space-y-1.5">{gate.added.map((i, k) => <li key={k} className="st-bad rounded-xl px-3 py-2 text-sm"><b>{i.code}</b> — {i.message}</li>)}</ul>
      <Field label="เหตุผลการ Override (บันทึกลงตาราง และนับใน Dashboard)">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น คำสั่งผู้บังคับบัญชา" />
      </Field>
    </BottomSheet>
  );
}
