'use client';
import { useEffect } from 'react';
import { X } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function BottomSheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="sheet-anim safe-b relative flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl dark:bg-zinc-900 md:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700 md:hidden" />
        <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button aria-label="ปิด" className="btn btn-ghost !min-h-[36px] !px-2" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return <label className="block"><span className="label">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}</label>;
}

export function Segmented({ value, onChange, options, className }) {
  return (
    <div className={cx('flex rounded-xl bg-zinc-200 p-1 dark:bg-zinc-800', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cx('min-h-[36px] flex-1 rounded-lg px-2 text-xs font-medium transition', value === o.value ? 'bg-white shadow dark:bg-zinc-950' : 'text-zinc-600 dark:text-zinc-400')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      {Icon && <Icon size={28} className="text-zinc-400" />}
      <p className="font-medium">{title}</p>
      {hint && <p className="max-w-xs text-sm text-zinc-500">{hint}</p>}
      {action}
    </div>
  );
}

export const Skeleton = ({ className }) => <div className={cx('animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800', className)} />;

export function Confirm({ state, onClose }) {
  if (!state) return null;
  return (
    <BottomSheet open title={state.title} onClose={onClose}
      footer={<><button className="btn btn-ghost flex-1" onClick={onClose}>ยกเลิก</button>
        <button className={cx('btn flex-1', state.danger ? 'btn-danger' : 'btn-primary')} onClick={() => { onClose(); state.onConfirm(); }}>{state.confirmLabel ?? 'ยืนยัน'}</button></>}>
      <p className="whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">{state.body}</p>
    </BottomSheet>
  );
}
