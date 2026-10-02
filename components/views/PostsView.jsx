'use client';
import { useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, Pencil, MapPin, CheckCircle2, XCircle } from 'lucide-react';
import { useApp } from '../ctx.js';
import { BottomSheet, Field, Empty, cx } from '../ui.jsx';

const blank = { name: '', requiredPersonnel: '', minPersonnel: 1, maxPersonnel: '', requiredPerSlot: 1, is24Hours: true, active: true };

export default function PostsView() {
  const { posts, postsApi, validation, slots, config, setConfirm } = useApp();
  const [edit, setEdit] = useState(null); // {id?, ...fields}
  const total = (config?.days ?? 0) * slots.length;
  const move = (i, d) => { const ids = posts.map((p) => p.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; postsApi.reorder(ids); };
  const save = async () => {
    const e = edit, payload = { ...e, requiredPersonnel: e.requiredPersonnel === '' ? null : +e.requiredPersonnel, maxPersonnel: e.maxPersonnel === '' ? null : +e.maxPersonnel, minPersonnel: +e.minPersonnel, requiredPerSlot: +e.requiredPerSlot };
    if (await (e.id ? postsApi.edit(e.id, payload) : postsApi.add(payload))) setEdit(null);
  };
  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">จุด ({posts.length})</h1>
      {!posts.length && <Empty icon={MapPin} title="ยังไม่มีจุด" hint="เพิ่มจุดแรกด้วยปุ่ม + ด้านล่าง" />}
      {posts.map((p, i) => {
        const miss = validation.shortages.filter((s) => s.postId === p.id).length;
        const ok = total ? Math.round(((total - miss) / total) * 100) : 0;
        return (
          <div key={p.id} className={cx('card', !p.active && 'opacity-60')}>
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-semibold">{p.name}{!p.active && <span className="chip st-rest ml-2">ปิดใช้งาน</span>}</div>
                <div className="mt-1 text-xs text-zinc-500">ต้องใช้ {p.requiredPersonnel ?? `${config?.peoplePerPost} (ค่าเริ่มต้น)`} คน/วัน · min {p.minPersonnel} · max {p.maxPersonnel ?? '—'} · {p.is24Hours ? '24 ชม.' : 'ไม่ครบ 24 ชม.'} · ประจำจุดพร้อมกัน {p.requiredPerSlot}</div></div>
              <span className={cx('chip shrink-0', miss ? 'st-bad' : 'st-ok')}>{miss ? <XCircle size={14} /> : <CheckCircle2 size={14} />}{p.is24Hours && slots.length ? `${ok}%` : '—'}</span>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-ghost !min-h-[40px] !px-3" disabled={i === 0} onClick={() => move(i, -1)} aria-label="ขึ้น"><ArrowUp size={16} /></button>
              <button className="btn btn-ghost !min-h-[40px] !px-3" disabled={i === posts.length - 1} onClick={() => move(i, 1)} aria-label="ลง"><ArrowDown size={16} /></button>
              <button className="btn btn-ghost !min-h-[40px] flex-1" onClick={() => postsApi.edit(p.id, { ...p, active: !p.active })}>{p.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button>
              <button className="btn btn-ghost !min-h-[40px] !px-3" onClick={() => setEdit({ ...p, requiredPersonnel: p.requiredPersonnel ?? '', maxPersonnel: p.maxPersonnel ?? '' })} aria-label="แก้ไข"><Pencil size={16} /></button>
              <button className="btn btn-ghost !min-h-[40px] !px-3 text-red-600" aria-label="ลบ" onClick={() => setConfirm({ title: `ลบ ${p.name}?`, body: 'ตารางเวรที่อ้างถึงจุดนี้จะแสดงเป็นปัญหา “Unknown post” จนกว่าจะสร้างตารางใหม่', danger: true, confirmLabel: 'ลบ', onConfirm: () => postsApi.remove(p.id) })}><Trash2 size={16} /></button>
            </div>
          </div>
        );
      })}
      <button className="btn btn-primary fab fixed bottom-24 right-4 z-30 !h-14 !w-14 !rounded-full shadow-lg" onClick={() => setEdit({ ...blank })} aria-label="เพิ่มจุด"><Plus /></button>
      <BottomSheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'แก้ไขจุด' : 'เพิ่มจุด'} footer={<><button className="btn btn-ghost flex-1" onClick={() => setEdit(null)}>ยกเลิก</button><button className="btn btn-primary flex-1" disabled={!edit?.name?.trim()} onClick={save}>บันทึก</button></>}>
        {edit && <div className="space-y-3">
          <Field label="ชื่อจุด"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Required (คน/วัน)" hint="ว่าง = ใช้ค่าตั้งค่า"><input className="input" inputMode="numeric" value={edit.requiredPersonnel} onChange={(e) => setEdit({ ...edit, requiredPersonnel: e.target.value })} /></Field>
            <Field label="ประจำจุดพร้อมกัน/ช่วง"><input className="input" inputMode="numeric" value={edit.requiredPerSlot} onChange={(e) => setEdit({ ...edit, requiredPerSlot: e.target.value })} /></Field>
            <Field label="Minimum"><input className="input" inputMode="numeric" value={edit.minPersonnel} onChange={(e) => setEdit({ ...edit, minPersonnel: e.target.value })} /></Field>
            <Field label="Maximum"><input className="input" inputMode="numeric" value={edit.maxPersonnel} onChange={(e) => setEdit({ ...edit, maxPersonnel: e.target.value })} /></Field>
          </div>
          <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={edit.is24Hours} onChange={(e) => setEdit({ ...edit, is24Hours: e.target.checked })} />ต้องครอบคลุม 24 ชั่วโมง</label>
          <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />ใช้งาน</label>
        </div>}
      </BottomSheet>
    </div>
  );
}
