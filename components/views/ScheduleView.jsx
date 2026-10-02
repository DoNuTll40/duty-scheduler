'use client';
import { useMemo, useState } from 'react';
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Plus, Trash2, Wand2, CheckCircle2, XCircle, CalendarX2 } from 'lucide-react';
import { useApp } from '../ctx.js';
import { BottomSheet, Field, Segmented, Empty, cx } from '../ui.jsx';
import { KIND } from '../kinds.jsx';
import { kindOf, thDate, thShort } from '../../lib/clientUtils.js';
import { dateOf } from '../../lib/engine/index.js';

function Chip({ rec, label, kind, draggable }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `rec:${rec.uid}`, disabled: !draggable });
  const { cls, Icon } = KIND[kind];
  return (
    <span ref={setNodeRef} {...listeners} {...attributes} style={{ touchAction: draggable ? 'none' : undefined }}
      className={cx('chip select-none', cls, isDragging && 'opacity-40', draggable && 'cursor-grab', rec.manualOverride && 'ring-2 ring-amber-500')}>
      <Icon size={13} />{label}{rec.manualOverride && <span title={rec.overrideReason ?? ''}>*</span>}
    </span>
  );
}
function TrayChip({ person }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `per:${person.id}` });
  return <span ref={setNodeRef} {...listeners} {...attributes} style={{ touchAction: 'none' }} className={cx('chip st-duty shrink-0 cursor-grab select-none', isDragging && 'opacity-40')}>{person.code}</span>;
}

function Row({ postId, slot, recs, required, focused, onOpen, canDrag, label }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cell:${postId}:${slot.index}` });
  const { personnel, shiftTypes } = useApp();
  const duty = recs.filter((r) => kindOf(shiftTypes.find((t) => t.id === r.shiftTypeId)) === 'duty');
  const shown = recs.filter((r) => kindOf(shiftTypes.find((t) => t.id === r.shiftTypeId)) !== 'rest');
  const miss = required - duty.length;
  return (
    <div id={`cell-${postId}-${slot.index}`} ref={setNodeRef} onClick={onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className={cx('flex min-h-[52px] items-center gap-3 rounded-xl px-3 py-2 transition', isOver ? 'bg-indigo-100 dark:bg-indigo-950' : 'bg-zinc-50 dark:bg-zinc-800/50', focused && 'ring-2 ring-red-500')}>
      <div className="w-[88px] shrink-0 text-xs font-medium tabular-nums text-zinc-500">{label}</div>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {shown.map((r) => <Chip key={r.uid} rec={r} draggable={canDrag} kind={kindOf(shiftTypes.find((t) => t.id === r.shiftTypeId))} label={`${personnel.find((p) => p.id === r.personnelId)?.code ?? '?'}${shiftTypes.find((t) => t.id === r.shiftTypeId)?.shortName ? ' ' + shiftTypes.find((t) => t.id === r.shiftTypeId).shortName : ''}`} />)}
        {miss > 0 && <span className="chip st-bad"><XCircle size={13} />ขาด {miss}</span>}
      </div>
    </div>
  );
}

function DayView({ openCell }) {
  const { config, slots, records, activePosts, personnel, shiftTypes, selectedDay, setSelectedDay, focus, readOnly, validation, requestEdit, makeRecord } = useApp();
  const [dragLabel, setDragLabel] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }));
  const dayRecs = useMemo(() => records.filter((r) => r.dayIndex === selectedDay), [records, selectedDay]);
  const working = useMemo(() => { const ids = [...new Set(dayRecs.map((r) => r.personnelId))]; return ids.map((id) => personnel.find((p) => p.id === id)).filter(Boolean); }, [dayRecs, personnel]);
  const dutyId = shiftTypes.find((t) => t.countsAsDuty)?.id, restId = shiftTypes.find((t) => t.countsAsRest)?.id;

  const onEnd = ({ active, over }) => {
    setDragLabel(null);
    if (!over || readOnly) return;
    const [, postId, slotStr] = over.id.split(':'), slotIndex = +slotStr;
    const [kind, ref] = active.id.split(/:(.*)/s);
    let personId, fromUid = null;
    if (kind === 'rec') { fromUid = ref; personId = records.find((r) => r.uid === ref)?.personnelId; } else personId = ref;
    if (!personId) return;
    const next = records.map((r) => ({ ...r }));
    const existing = next.find((r) => r.dayIndex === selectedDay && r.slotIndex === slotIndex && r.personnelId === personId);
    if (existing && existing.postId === postId && existing.shiftTypeId === dutyId) return;
    let target = existing;
    if (existing) { existing.postId = postId; existing.shiftTypeId = dutyId; } else { target = makeRecord(selectedDay, slotIndex, postId, personId, dutyId); next.push(target); }
    if (fromUid) { const src = next.find((r) => r.uid === fromUid); if (src && src !== target) src.shiftTypeId = restId; }
    requestEdit(next, { label: 'ย้ายกำลังพล' });
  };

  return (
    <DndContext sensors={sensors} onDragStart={({ active }) => setDragLabel(active.id.startsWith('per:') ? personnel.find((p) => p.id === active.id.slice(4))?.code : personnel.find((p) => p.id === records.find((r) => r.uid === active.id.slice(4))?.personnelId)?.code)} onDragEnd={onEnd} onDragCancel={() => setDragLabel(null)}>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button className="btn btn-ghost !px-3" disabled={selectedDay === 0} onClick={() => setSelectedDay(selectedDay - 1)} aria-label="วันก่อนหน้า"><ChevronLeft size={18} /></button>
          <div className="text-center"><div className="font-semibold">{thDate(dateOf(config.startDate, selectedDay))}</div><div className="text-xs text-zinc-500">วันที่ {selectedDay + 1}/{config.days} · {working[0] ? `กลุ่ม ${working[0].groupId ?? '—'}` : 'ไม่มีกำลังพล'}</div></div>
          <button className="btn btn-ghost !px-3" disabled={selectedDay >= config.days - 1} onClick={() => setSelectedDay(selectedDay + 1)} aria-label="วันถัดไป"><ChevronRight size={18} /></button>
        </div>
        {!readOnly && working.length > 0 && (
          <div className="no-print"><div className="mb-1 text-xs text-zinc-500">ลากชื่อไปวางที่ช่วงเวลา (มือถือ: กดค้างแล้วลาก)</div>
            <div className="flex gap-2 overflow-x-auto pb-1">{working.map((p) => <TrayChip key={p.id} person={p} />)}</div></div>
        )}
        {activePosts.map((p) => {
          const need = p.requiredPerSlot ?? 1, miss = validation.shortages.filter((s) => s.dayIndex === selectedDay && s.postId === p.id).length;
          return (
            <section key={p.id} className="card">
              <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">{p.name}</h3>
                {p.is24Hours === false ? <span className="chip st-rest">ไม่ต้อง 24 ชม.</span> : miss ? <span className="chip st-bad"><XCircle size={14} />ขาด {miss} ช่วง</span> : <span className="chip st-ok"><CheckCircle2 size={14} />ครบ</span>}</div>
              <div className="space-y-1.5">
                {slots.map((s) => (
                  <Row key={s.index} postId={p.id} slot={s} label={s.label} required={p.is24Hours === false ? 0 : need} canDrag={!readOnly}
                    recs={dayRecs.filter((r) => r.postId === p.id && r.slotIndex === s.index)} focused={focus?.postId === p.id && focus?.slotIndex === s.index}
                    onOpen={() => openCell({ dayIndex: selectedDay, postId: p.id, slotIndex: s.index })} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <DragOverlay>{dragLabel ? <span className="chip st-duty shadow-lg">{dragLabel}</span> : null}</DragOverlay>
    </DndContext>
  );
}

function WeekView() {
  const { config, activePosts, validation, records, personnel, setSelectedDay, setSub } = useApp();
  return (
    <div className="space-y-2">
      {Array.from({ length: config.days }, (_, d) => {
        const date = dateOf(config.startDate, d), grp = records.find((r) => r.dayIndex === d)?.groupId;
        const missByPost = (pid) => validation.shortages.filter((s) => s.dayIndex === d && s.postId === pid).length;
        return (
          <button key={d} className="card w-full text-left" onClick={() => { setSelectedDay(d); setSub('day'); }}>
            <div className="mb-2 flex items-center justify-between"><b>{thShort(date)}</b><span className="chip st-rest !min-h-[24px]">กลุ่ม {grp ?? '—'}</span></div>
            <div className="flex flex-wrap gap-1.5">
              {activePosts.map((p) => missByPost(p.id) ? <span key={p.id} className="chip st-bad"><XCircle size={13} />{p.name} ขาด {missByPost(p.id)}</span> : <span key={p.id} className="chip st-ok"><CheckCircle2 size={13} />{p.name}</span>)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PersonView({ openCell }) {
  const { personnel, records, slots, shiftTypes, activePosts, posts, config, stats, selPerson, setSelPerson, setSelectedDay, setSub } = useApp();
  const id = selPerson ?? records.find((r) => r.personnelId)?.personnelId ?? personnel[0]?.id;
  const mine = records.filter((r) => r.personnelId === id);
  const days = [...new Set(mine.map((r) => r.dayIndex))].sort((a, b) => a - b);
  const s = stats?.byPersonnel?.[id];
  return (
    <div className="space-y-3">
      <select className="input" value={id ?? ''} onChange={(e) => setSelPerson(e.target.value)} aria-label="เลือกกำลังพล">{personnel.map((p) => <option key={p.id} value={p.id}>{p.code} {p.name !== p.code ? p.name : ''}</option>)}</select>
      {s && <div className="grid grid-cols-4 gap-2 text-center text-xs"><div className="st-duty rounded-lg py-2">เข้า<b className="block text-base">{s.dutyHours}h</b></div><div className="st-withdraw rounded-lg py-2">ถอน<b className="block text-base">{s.withdrawalHours}h</b></div><div className="st-warn rounded-lg py-2">ดึก<b className="block text-base">{s.nightHours}h</b></div><div className="st-rest rounded-lg py-2">รอบ<b className="block text-base">{s.shiftCount}</b></div></div>}
      {!days.length && <Empty icon={CalendarX2} title="ไม่มีเวรในช่วงนี้" />}
      {days.map((d) => (
        <div key={d} className="card">
          <button className="mb-2 font-semibold" onClick={() => { setSelectedDay(d); setSub('day'); }}>{thShort(dateOf(config.startDate, d))}</button>
          <div className="grid grid-cols-2 gap-1.5">
            {slots.map((sl) => {
              const r = mine.find((x) => x.dayIndex === d && x.slotIndex === sl.index), t = shiftTypes.find((x) => x.id === r?.shiftTypeId), k = kindOf(t), { cls, Icon } = KIND[k];
              return <button key={sl.index} disabled={!r?.postId} onClick={() => r?.postId && openCell({ dayIndex: d, postId: r.postId, slotIndex: sl.index })} className={cx('chip !justify-start !rounded-lg', cls)}><Icon size={13} />{sl.label} {t?.shortName ?? '—'}{k !== 'rest' && r?.postId ? ` · ${posts.find((p) => p.id === r.postId)?.name ?? '?'}` : ''}</button>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PostView({ openCell }) {
  const { activePosts, records, slots, personnel, shiftTypes, config, selPost, setSelPost, validation } = useApp();
  const pid = selPost ?? activePosts[0]?.id;
  return (
    <div className="space-y-3">
      <select className="input" value={pid ?? ''} onChange={(e) => setSelPost(e.target.value)} aria-label="เลือกจุด">{activePosts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      {Array.from({ length: config.days }, (_, d) => (
        <div key={d} className="card">
          <div className="mb-2 font-semibold">{thShort(dateOf(config.startDate, d))}</div>
          <div className="space-y-1.5">
            {slots.map((sl) => {
              const duty = records.filter((r) => r.dayIndex === d && r.postId === pid && r.slotIndex === sl.index && shiftTypes.find((t) => t.id === r.shiftTypeId)?.countsAsDuty);
              const short = validation.shortages.some((s) => s.dayIndex === d && s.postId === pid && s.slotIndex === sl.index);
              return <button key={sl.index} onClick={() => openCell({ dayIndex: d, postId: pid, slotIndex: sl.index })} className="flex w-full items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-left text-sm dark:bg-zinc-800/50"><span className="w-[88px] shrink-0 text-xs tabular-nums text-zinc-500">{sl.label}</span>{short ? <span className="chip st-bad"><XCircle size={13} />ขาด</span> : duty.map((r) => <span key={r.uid} className="chip st-duty">{personnel.find((p) => p.id === r.personnelId)?.code ?? '?'}</span>)}</button>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CellEditor({ cell, onClose }) {
  const { records, personnel, posts, shiftTypes, slots, config, requestEdit, makeRecord, readOnly, toast } = useApp();
  const orig = useMemo(() => records.filter((r) => r.dayIndex === cell.dayIndex && r.postId === cell.postId && r.slotIndex === cell.slotIndex), [records, cell]);
  const [rows, setRows] = useState(() => orig.map((r) => ({ ...r })));
  const dutyId = shiftTypes.find((t) => t.countsAsDuty)?.id, post = posts.find((p) => p.id === cell.postId), slot = slots[cell.slotIndex];
  const upd = (i, patch) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const save = () => {
    if (readOnly) return toast('ตารางยังไม่ถูกสร้าง/ไม่ผ่านเงื่อนไข — แก้ไขไม่ได้', 'error');
    const keep = records.filter((r) => !orig.some((o) => o.uid === r.uid));
    const edited = rows.filter((r) => r.personnelId).map((r) => {
      const p = personnel.find((x) => x.id === r.personnelId);
      return String(r.uid).startsWith('n-new') ? { ...makeRecord(cell.dayIndex, cell.slotIndex, r.postId, r.personnelId, r.shiftTypeId) } : { ...r, groupId: p?.groupId ?? r.groupId };
    });
    if (requestEdit([...keep, ...edited], { label: 'แก้ไขช่องเวร' })) onClose();
    else onClose(); // gate sheet (if any) is shown by the shell
  };
  return (
    <BottomSheet open onClose={onClose} title={post?.name ?? 'ช่องเวร'} footer={<><button className="btn btn-ghost flex-1" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary flex-1" disabled={readOnly} onClick={save}>บันทึก</button></>}>
      <p className="text-sm text-zinc-500">{thDate(dateOf(config.startDate, cell.dayIndex))}</p>
      <p className="mb-3 text-lg font-semibold tabular-nums">{slot?.startClock} - {slot?.endClock}</p>
      {readOnly && <p className="st-warn mb-3 rounded-xl px-3 py-2 text-xs">โหมดดูอย่างเดียว: ตารางนี้ยังไม่ถูกบันทึก/ไม่ผ่านเงื่อนไข</p>}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.uid} className="card !p-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="กำลังพล"><select className="input" value={r.personnelId ?? ''} onChange={(e) => upd(i, { personnelId: e.target.value })}>{!personnel.some((p) => p.id === r.personnelId) && <option value={r.personnelId ?? ''}>{r.personnelId ?? '—'} (ไม่พบ)</option>}<option value="">—</option>{personnel.filter((p) => p.active || p.id === r.personnelId).map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select></Field>
              <Field label="สถานะ"><select className="input" value={r.shiftTypeId} onChange={(e) => upd(i, { shiftTypeId: e.target.value })}>{shiftTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
              <Field label="จุด"><select className="input" value={r.postId ?? ''} onChange={(e) => upd(i, { postId: e.target.value })}>{posts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <button className="btn btn-ghost mt-5 text-red-600" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))}><Trash2 size={16} />เอาออก</button>
            </div>
            {r.manualOverride && <p className="mt-2 text-xs text-amber-600">Override: {r.overrideReason}</p>}
          </div>
        ))}
        <button className="btn btn-ghost w-full" onClick={() => setRows((rs) => [...rs, { uid: `n-new${rs.length}-${Date.now()}`, personnelId: '', shiftTypeId: dutyId, postId: cell.postId }])}><Plus size={16} />เพิ่มกำลังพล</button>
      </div>
    </BottomSheet>
  );
}

export default function ScheduleView() {
  const { sub, setSub, slots, config, diag, readOnly, runAutoBalance, scenarioApi, activeId, busy } = useApp();
  const [cell, setCell] = useState(null);
  if (!slots.length) return <Empty icon={CalendarX2} title="Configuration ไม่ถูกต้อง" hint={(diag?.reasons ?? []).join(' · ')} />;
  return (
    <div className="space-y-3">
      <Segmented value={sub} onChange={setSub} options={[{ value: 'day', label: 'วัน' }, { value: 'week', label: 'สัปดาห์' }, { value: 'person', label: 'รายบุคคล' }, { value: 'post', label: 'รายจุด' }]} />
      {readOnly && (
        <div className="st-warn rounded-xl px-3 py-2 text-sm">
          {diag?.feasible ? 'ยังไม่ได้สร้างตารางลงฐานข้อมูล' : 'ตารางทดลองนี้ไม่ผ่านเงื่อนไข (แสดงเพื่อดูว่าขาดตรงไหน) — แก้ไขไม่ได้'}
          <button className="btn btn-primary mt-2 w-full" disabled={busy || !diag?.feasible} onClick={() => scenarioApi.generate(activeId)}>สร้างตารางและบันทึก</button>
        </div>
      )}
      {!readOnly && <button className="btn btn-ghost w-full no-print" onClick={runAutoBalance}><Wand2 size={16} />ปรับสมดุลอัตโนมัติ</button>}
      {sub === 'day' && <DayView openCell={setCell} />}
      {sub === 'week' && <WeekView />}
      {sub === 'person' && <PersonView openCell={(c) => { setCell(c); }} />}
      {sub === 'post' && <PostView openCell={setCell} />}
      {cell && <CellEditor key={`${cell.dayIndex}-${cell.postId}-${cell.slotIndex}`} cell={cell} onClose={() => setCell(null)} />}
    </div>
  );
}
