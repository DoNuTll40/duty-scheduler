'use client';
import { useMemo, useState } from 'react';
import { Plus, ArrowUp, ArrowDown, Trash2, Pencil, Search, Users, Settings2, X } from 'lucide-react';
import { useApp } from '../ctx.js';
import { BottomSheet, Field, Empty, Segmented, cx } from '../ui.jsx';

const blank = { code: '', name: '', groupId: '', defaultPostId: '', active: true, note: '' };

export default function PersonnelView() {
  const { personnel, posts, groups, stats, people, groupsApi, setConfirm } = useApp();
  const [q, setQ] = useState(''), [g, setG] = useState('all'), [act, setAct] = useState('all');
  const [edit, setEdit] = useState(null), [grpOpen, setGrpOpen] = useState(false), [newG, setNewG] = useState('');
  const filtered = useMemo(() => personnel.filter((p) => (g === 'all' || p.groupId === g) && (act === 'all' || (act === 'on') === p.active) && (!q || `${p.code} ${p.name}`.toLowerCase().includes(q.toLowerCase()))), [personnel, q, g, act]);
  const canSort = !q && g === 'all' && act === 'all';
  const move = (i, d) => { const ids = personnel.map((p) => p.id); [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; people.reorder(ids); };
  const save = async () => {
    const payload = { ...edit, groupId: edit.groupId || null, defaultPostId: edit.defaultPostId || null };
    if (await (edit.id ? people.edit(edit.id, payload) : people.add(payload))) setEdit(null);
  };
  const postName = (id) => posts.find((p) => p.id === id)?.name;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h1 className="text-lg font-semibold">กำลังพล ({filtered.length}/{personnel.length})</h1>
        <button className="btn btn-ghost !min-h-[38px]" onClick={() => setGrpOpen(true)}><Settings2 size={16} />กลุ่ม</button></div>
      <div className="relative"><Search size={16} className="absolute left-3 top-3.5 text-zinc-400" /><input className="input !pl-9" placeholder="ค้นหารหัส / ชื่อ" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Segmented className="shrink-0" value={g} onChange={setG} options={[{ value: 'all', label: 'ทุกกลุ่ม' }, ...groups.map((x) => ({ value: x.id, label: x.name }))]} />
        <Segmented className="shrink-0" value={act} onChange={setAct} options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'on', label: 'Active' }, { value: 'off', label: 'Inactive' }]} />
      </div>
      {!filtered.length && <Empty icon={Users} title={personnel.length ? 'ไม่พบตามเงื่อนไข' : 'ยังไม่มีกำลังพล'} hint="เพิ่มด้วยปุ่ม + ด้านล่าง" />}
      {filtered.map((p) => {
        const s = stats?.byPersonnel?.[p.id], i = personnel.findIndex((x) => x.id === p.id);
        return (
          <div key={p.id} className={cx('card', !p.active && 'opacity-60')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><div className="font-semibold">{p.code} <span className="font-normal text-zinc-500">{p.name !== p.code ? p.name : ''}</span></div>
                <div className="mt-1 flex flex-wrap gap-1.5 text-xs"><span className="chip st-rest !min-h-[24px]">กลุ่ม {groups.find((x) => x.id === p.groupId)?.name ?? '—'}</span>{postName(p.defaultPostId) && <span className="chip st-rest !min-h-[24px]">{postName(p.defaultPostId)}</span>}{!p.active && <span className="chip st-warn !min-h-[24px]">Inactive</span>}</div></div>
              <div className="flex shrink-0 gap-1">
                {canSort && <><button className="btn btn-ghost !min-h-[36px] !px-2" disabled={i === 0} onClick={() => move(i, -1)} aria-label="ขึ้น"><ArrowUp size={15} /></button><button className="btn btn-ghost !min-h-[36px] !px-2" disabled={i === personnel.length - 1} onClick={() => move(i, 1)} aria-label="ลง"><ArrowDown size={15} /></button></>}
                <button className="btn btn-ghost !min-h-[36px] !px-2" onClick={() => setEdit({ ...p, groupId: p.groupId ?? '', defaultPostId: p.defaultPostId ?? '', note: p.note ?? '' })} aria-label="แก้ไข"><Pencil size={15} /></button>
                <button className="btn btn-ghost !min-h-[36px] !px-2 text-red-600" aria-label="ลบ" onClick={() => setConfirm({ title: `ลบ ${p.code}?`, body: 'ตารางเวรเดิมที่อ้างถึงคนนี้จะแสดงเป็นปัญหา “Unknown personnel” จนกว่าจะสร้างตารางใหม่', danger: true, confirmLabel: 'ลบ', onConfirm: () => people.remove(p.id) })}><Trash2 size={15} /></button>
              </div>
            </div>
            {s && <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><div className="st-duty rounded-lg py-1.5">เข้า <b>{s.dutyHours}</b>h</div><div className="st-withdraw rounded-lg py-1.5">ถอน <b>{s.withdrawalHours}</b>h</div><div className="st-warn rounded-lg py-1.5">ดึก <b>{s.nightHours}</b>h</div></div>}
          </div>
        );
      })}
      <button className="btn btn-primary fab fixed bottom-24 right-4 z-30 !h-14 !w-14 !rounded-full shadow-lg" onClick={() => setEdit({ ...blank, groupId: groups[0]?.id ?? '' })} aria-label="เพิ่มกำลังพล"><Plus /></button>

      <BottomSheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'แก้ไขกำลังพล' : 'เพิ่มกำลังพล'} footer={<><button className="btn btn-ghost flex-1" onClick={() => setEdit(null)}>ยกเลิก</button><button className="btn btn-primary flex-1" disabled={!edit?.code?.trim() || !edit?.name?.trim()} onClick={save}>บันทึก</button></>}>
        {edit && <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="รหัส"><input className="input" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></Field>
            <Field label="ชื่อ"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="กลุ่ม"><select className="input" value={edit.groupId} onChange={(e) => setEdit({ ...edit, groupId: e.target.value })}><option value="">—</option>{groups.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
            <Field label="จุดประจำ (default)"><select className="input" value={edit.defaultPostId} onChange={(e) => setEdit({ ...edit, defaultPostId: e.target.value })}><option value="">—</option>{posts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          </div>
          <Field label="หมายเหตุ"><input className="input" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></Field>
          <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />Active</label>
        </div>}
      </BottomSheet>

      <BottomSheet open={grpOpen} onClose={() => setGrpOpen(false)} title="กลุ่ม (ไม่จำกัดแค่ A/B)">
        <ul className="mb-3 space-y-2">{groups.map((x) => <li key={x.id} className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50"><span>{x.name} <span className="text-xs text-zinc-500">({personnel.filter((p) => p.groupId === x.id).length} คน)</span></span>
          <button className="btn btn-ghost !min-h-[34px] !px-2 text-red-600" aria-label="ลบกลุ่ม" onClick={() => setConfirm({ title: `ลบกลุ่ม ${x.name}?`, body: 'สมาชิกจะไม่มีกลุ่ม (ไม่ถูกลบ)', danger: true, confirmLabel: 'ลบ', onConfirm: () => groupsApi.remove(x.id) })}><X size={15} /></button></li>)}</ul>
        <div className="flex gap-2"><input className="input" placeholder="รหัสกลุ่มใหม่ เช่น C" value={newG} onChange={(e) => setNewG(e.target.value)} /><button className="btn btn-primary" disabled={!newG.trim()} onClick={async () => { if (await groupsApi.add({ id: newG.trim(), name: `กลุ่ม ${newG.trim()}` })) setNewG(''); }}>เพิ่ม</button></div>
      </BottomSheet>
    </div>
  );
}
