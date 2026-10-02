# ระบบจัดตารางเวร (Duty Scheduler)

Next.js 15 (App Router) + Neon PostgreSQL + Tailwind, mobile-first. Deploy บน Vercel ได้ทันที

## Deploy
1. ตั้ง env `DATABASE_URL` (Neon, server-side เท่านั้น — ห้ามใส่ `NEXT_PUBLIC_`)
2. `npm install && npm run db:setup` (สร้างตาราง + seed เมื่อว่าง) — หรือรัน `db/schema.sql` + `db/seed.sql` ใน Neon SQL editor
3. `npm run build` / push ขึ้น Vercel
4. เปิดครั้งแรก ระบบจะรัน scheduler จริงให้ทุก scenario ที่ยังไม่เคยรัน แล้วบันทึกผล

## โครงสร้าง
- `lib/engine/` — pure engine: timeSlots, scheduler (feasibility), validator, calculator (+fairness), autoBalance
- `lib/services/` — การเข้าถึงฐานข้อมูล (UI ไม่เขียน SQL)
- `app/actions.js` — Server Actions (คืน `{ok,data}`/`{ok:false,error}` ไม่ throw)
- `components/` — UI ฝั่ง client (dnd-kit, history/undo, bottom sheet)
- `npm test` — unit tests ของ engine
