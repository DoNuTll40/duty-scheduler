'use client';
import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useApp } from '../ctx.js';
import { Segmented, Empty } from '../ui.jsx';
import { SEV } from '../kinds.jsx';
import { sevLabel } from '../../lib/clientUtils.js';

export default function ValidationPanel() {
  const { issues, goIssue, readOnly, diag } = useApp();
  const [f, setF] = useState('all');
  const shown = issues.filter((i) => f === 'all' || (f === 'errors' && (i.severity === 'critical' || i.severity === 'conflict')) || (f === 'warnings' && i.severity === 'warning') || (f === 'info' && i.severity === 'info'));
  return (
    <div className="space-y-3">
      {readOnly && <p className="st-warn rounded-xl px-3 py-2 text-xs">กำลังแสดงปัญหาของ “ตารางทดลอง” ที่ไม่ผ่านเงื่อนไข (ยังไม่ถูกบันทึก)</p>}
      <Segmented value={f} onChange={setF} options={[{ value: 'all', label: `All ${issues.length}` }, { value: 'errors', label: 'Errors' }, { value: 'warnings', label: 'Warnings' }, { value: 'info', label: 'Info' }]} />
      {!shown.length ? <Empty icon={CheckCircle2} title="ไม่พบปัญหา" /> : (
        <ul className="space-y-2">
          {shown.slice(0, 200).map((i, k) => {
            const { cls, Icon } = SEV[i.severity];
            return (
              <li key={k}>
                <button onClick={() => goIssue(i)} className={`${cls} flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm`}>
                  <Icon size={16} className="mt-0.5 shrink-0" />
                  <span><b>{sevLabel[i.severity]}</b> · {i.code}<br />{i.message}</span>
                </button>
              </li>
            );
          })}
          {shown.length > 200 && <li className="text-center text-xs text-zinc-500">แสดง 200 จาก {shown.length} รายการ</li>}
        </ul>
      )}
    </div>
  );
}
