# CLAUDE.md — TMK Operation

คู่มือสำหรับ AI/นักพัฒนาที่เข้ามาทำงานกับ repo นี้ อ่านก่อนเริ่มเสมอ

## ภาพรวม
เว็บภายในของทีมขายเสื้อ (TMK) — React + Vite (rolldown-vite) + Supabase (Postgres + Realtime + Storage + Edge Functions) · UI = shadcn/ui (Radix + Tailwind + lucide) · ธีมสีผ่าน CSS tokens ใน `src/index.css` (`--accent/--good/--warn/--bad/--info/--ink-2..4`) · ภาษา = ไทยทั้งหมด

## โครงสร้างเมนู (NAV_DEF ใน src/App.jsx)
- **หน้าหลัก** (home)
- **ยอดขาย** (sales) — ภาพรวม/ช่องทาง/แอด/ลูกค้า/ยอดเดือน (มาร์เก็ตเพลส + สรุปเดือน)
- **โครงการ** (flows) — งาน/บอร์ด (Kanban/ปฏิทิน/ไทม์ไลน์/ลิสต์) · งานของฉัน · ประวัติ
- **Sale** (catalog) — รายงานขาย(saleDashboard) · ประสิทธิภาพเซล(salePerf) · ออเดอร์ · ภาพรวม CRM(saleCrm) · ส่งยอด&ข้อมูล · สินค้า(แคตตาล็อกลาย)
- **บันทึกกิจกรรม** (logs, admin-only)

## แนวคิดสถาปัตยกรรมที่ต้องรู้
- **TMK singleton state** — ข้อมูลหลักโหลดผ่าน `src/dataContext.jsx` (`loadAllTables` ยิงขนาน) แล้วกระจายผ่าน context + appBus
- **`src/lib/appBus.js` = ศูนย์กลาง app services/state** (แทน `window.__*` เดิม)
  - provider ลงทะเบียนด้วย `registerServices({...})` / `setAppState({...})` — App.jsx, ui-confirm, ui-conflict-merge, views-flows
  - consumer `import { toast, confirm, openModal, goSection, refresh, canEdit, isAdmin, userEmail, lockedSections } from './lib/appBus.js'` (**getters เป็นฟังก์ชัน ต้องใส่ `()`**)
  - `window.__*` ยังทำงานอยู่ในฐานะ **facade** (มิเรอร์อัตโนมัติ) — โค้ดเก่า/สคริปต์ debug ไม่พัง แต่**โค้ดใหม่ให้ import จาก appBus**
  - ⚠️ ระวัง **ชื่อชนกับตัวแปร local** (เคยพลาด: `setFlow` ใน modals-task) → ใช้ alias เช่น `import { setFlow as appSetFlow }`
- **`supabase/functions/_shared/saleFormulas.js` = สูตรกลาง FE ↔ edge function** — `resolveJobType` / `mergeOrderOverrides` / `isLeadChannel` / `crmCustomerKey` / `normNoteData` นิยามที่นี่ที่เดียว · FE (`saleData/saleOverrides/saleFields/crmAgg/crmDailyNote`) re-export ต่อ · **แก้สูตรต้องแก้ที่ `_shared` เท่านั้น** (กันเลขเว็บ ≠ รายงาน LINE)
- **Sale ใช้ตารางร่วม** `tmk_mp_orders/tmk_mp_skus/tmk_mp_customers` แยกด้วย `source` (`shipnity` vs marketplace) → **ห้าม TRUNCATE ตารางร่วม** ใช้ `DELETE WHERE source=...`
- **Override layer** — แก้ออเดอร์/ลายไม่แก้ import ต้นทาง เก็บที่ `tmk_order_overrides`/`tmk_sku_overrides` แล้ว merge ตอนอ่าน (`src/lib/saleOverrides.js`) เพราะ re-import ทับบ่อย
- **Schema-tolerant queries** — `selectAll()` ใน `src/lib/saleData.js` เจอ error 42703 แล้วตัดคอลัมน์ที่ยังไม่ migrate ออกอัตโนมัติ → deploy FE ก่อน DB ได้
- **Realtime มี fallback** — WS หลุด → backoff → poll 120s → กลับมาลอง realtime ตอนสลับแท็บ (`dataContext.jsx`) + echo-suppression (per-table refresh หลังเซฟ)
- **%ปิดการขาย** = ออเดอร์ช่องแชท (ตัดมาร์เก็ตเพลส · `isLeadChannel`) ÷ คนทัก(funnel)
- **คนทัก (leads/funnel)** เก็บ jsonb `leads` 3 รูปแบบ: `{Facebook:{new,old}}` (ใหม่) · `{Facebook:12}` (เลขแบน→`unknown`) · 4 คอลัมน์ legacy — helper กลางที่ `saleData.js` (`funnelBreakdown/funnelTotal/funnelNewOld`)

## คำศัพท์
- **คนทัก** = ลูกค้าที่ทักเข้ามา (lead) · **%ปิด** = อัตราปิดการขาย · **DFT** = ประเภทงานจากหมายเหตุ (ปลีก/DFT/OEM) · **ส่งยอด** = อัปโหลดใบเสร็จ Shipnity (PDF, pdf.js parser) · **มาร์เก็ตเพลส** = Shopee/TikTok

## สิทธิ์ (RBAC)
- role: `admin` / `editor` / `viewer` (จาก `tmk_user_roles`) · viewer = ดูอย่างเดียว
- **ล็อกหน้ารายคน** = `locked_sections` (composite key `section:sub`) · admin = ปลดล็อกเสมอ
- **ขอบเขตการมองเห็นข้อมูลลูกค้า — ตัดสินแล้ว 8 ก.ย. 69 (อย่าไป "แก้" อีก)**
  | หน้า | เห็นอะไร |
  |---|---|
  | ออเดอร์ · ประสิทธิภาพเซลล์ · ⌘K | **เฉพาะของตัวเอง** (`orderVisibleTo`) · admin เห็นทั้งทีม |
  | **ภาพรวม CRM** | **เห็นทั้งทีม ทุก role** — ตั้งใจ เพราะเป็นแดชบอร์ดระดับทีม แนวเดียวกับ "ภาพรวมทีม" ในประสิทธิภาพเซลล์ |
  | **popup "วันที่ …" ที่กดจากกราฟภาพรวมทีม** (ประสิทธิภาพเซลล์) | **เห็นทั้งทีม ทุก role** — ยอด · ออเดอร์ทุกใบ (รวมชื่อ/เบอร์ลูกค้าของเซลล์คนอื่น) · คนทักรายคน · %ปิด — **user สั่งเอง 9 ก.ย. 69 ("แค่ในนี้นะ")** เป็นข้อยกเว้นตั้งใจ ไม่ใช่บั๊ก · เดิมปิดปุ่มกดทิ้ง = เซลล์กดแล้วเงียบ · ล็อกด้วย `src/__tests__/dayDetailScope-dom.test.jsx` |
  | ตารางรายคน (เป้า/คอม) · **ชิป %เป้า ในอันดับเซลล์หน้าแรก** · บันทึกกิจกรรม | **admin เท่านั้น** (ค่าตอบแทนรายบุคคล) — ยอดขายรายคนยังเห็นได้ทุก role |
  รอบตรวจอัตโนมัติจะรายงาน CRM ว่า "ไม่กรองสิทธิ์" ทุกครั้ง — **เป็นการตัดสินใจ ไม่ใช่บั๊ก**
- ⚠️ ณ ตอนนี้สิทธิ์บังคับฝั่ง browser เป็นหลัก + RLS Tier 1/2 (ทุกตาราง authenticated · เขียน role/staff = admin) · **Tier 3** (write=non-viewer · delete=admin · audit immutable) อยู่ใน `supabase/migrations/*rls-tier3*` — ต้องรีวิว+รันเอง

## กติกาการทำงาน (สำคัญ)
- **commit/push เฉพาะเมื่อ user สั่งเท่านั้น** — verify เสร็จแล้วค้าง uncommitted ไว้ รอสั่ง
- **ห้ามแตะ/stage `.claude/launch.json`** (ไฟล์ dev ของ user)
- **ห้าม commit `supabase/functions/daily-sale-report/index.ts`** (งาน edge fn ของ user — `git restore --staged` ก่อน commit เสมอ)
- **Edge functions ไม่มี CLI** — deploy ผ่าน Supabase Dashboard เอง (`daily-sale-report`/`line-broadcast`/`ai-extract`)
  - **แก้ `_shared/saleFormulas.js` แล้วต้อง `npm run build:edge` + paste ลง Dashboard ทุกครั้ง** ไม่งั้นเลขเว็บ ≠ รายงาน LINE
  - ⚠️ **CI จับให้ไม่ได้** — `dist-edge/` อยู่ใน `.gitignore` และ `index.ts` มักมีของแก้ค้างในเครื่อง
    CI ตรวจได้แค่ "บันเดิล build ผ่าน + มีสูตรครบ" ส่วน "ลืม paste" ต้องอาศัยวินัยคน
- **Migrations user รันเอง** ใน Supabase (ไม่มี migration runner อัตโนมัติ) · ทุกไฟล์ RLS ต้องมี block VERIFY + ROLLBACK + idempotent
- **หลังรัน migration ทุกครั้ง จดด้วย** `select public.tmk_migration_applied('<ชื่อไฟล์>.sql');` (ตาราง `tmk_migrations`) · ดูที่รันแล้ว: `select * from public.tmk_migrations order by applied_at desc;`
- **ห้ามใส่ `alter table ... disable row level security` ในไฟล์ migration** (ของเก่าถูกคอมเมนต์ปลดชนวนไปแล้ว — รันซ้ำจะปิด RLS เงียบๆ)
- **What's New** เพิ่ม entry ที่ `src/changelog.js` แบบ `{icon, text}` (ไม่มี emoji · icon ต้องมีใน lucide set — เช็คก่อน 'chart' ไม่มี)

## Verify ก่อนรายงาน
```bash
npx vitest run      # ปัจจุบัน 331 tests
npx vite build      # ต้องผ่าน
npx eslint .        # 0 errors (warnings = กฎ React-Compiler ที่ downgrade ไว้ ค่อยเก็บ)
```
Preview: `.claude/launch.json` มี dev server ("tmk-dev") — ใช้ browser pane เท่านั้น อย่ารัน dev server ผ่าน Bash

## ไฟล์ใหญ่ที่ควรระวังตอนแก้ (เส้นเงินวิ่งผ่าน)
`src/lib/receiptParse.js` (parser ใบเสร็จ) · `receiptSubmit.js` · `mpReport.js` · `goldenGrid.js` (แคตตาล็อกลาย) · มี test ครอบ business logic เงินแล้ว (`computeMonthPure/saleAgg/receiptValidate`)
