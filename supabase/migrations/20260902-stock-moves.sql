-- ============================================================
-- 20260902-stock-moves.sql — สมุดรายการเคลื่อนไหวสต็อก (PLAN-STOCK-V2 ระยะ 2)
-- ============================================================
-- วางทั้งไฟล์ใน Supabase → SQL Editor → Run · idempotent (รันซ้ำได้ ไม่ทำข้อมูลซ้ำ)
--
-- ⚠️ เงื่อนไขของคำว่า "รันซ้ำได้" — สำคัญ อ่านก่อน
--    §2 import แถวจาก tmk_stock_counts เข้ามาเป็นหมุด (kind='open'/'count')
--    จะปลอดภัยก็ต่อเมื่อ **ทุกแถวใน tmk_stock_counts เก็บ "ยอดที่นับได้"** เท่านั้น
--    ถ้ามีโค้ดไหนเขียน counts เป็น "คงเหลือ + ที่รับเข้า" (ค่าที่รวมของแล้ว)
--    รันซ้ำจะได้หมุดที่รวมของแล้ว **บวกกับ** แถว kind='in' ของครั้งเดียวกัน = นับซ้ำสองเท่า
--    (on conflict do nothing กันไม่ได้ เพราะแถว counts ที่เกิดหลัง migration มี id ใหม่)
--
--    ณ 2 ก.ย. 69 ตัดต้นตอไปแล้ว: การรับเข้าจากใบสั่งผลิต **เขียน move อย่างเดียว**
--    ไม่แตะ tmk_stock_counts (ลบ buildReceiveAnchors ทิ้ง) → §2 ปลอดภัยจริง
--    ถ้าจะแก้โค้ดรับเข้าให้กลับไปเขียน counts อีก ต้องกลับมาแก้เงื่อนไขตรงนี้ด้วย
--
-- ทำอะไร:
--   §1 สร้างตาราง tmk_stock_moves (append-only) + index + RLS
--   §2 ย้ายข้อมูลจาก tmk_stock_counts เดิมเข้ามาเป็น move (idempotent ด้วย id ที่คำนวณจากของเดิม)
--
-- ทำไมต้องมี:
--   โมเดลเดิม = "หมุดล่าสุด − ที่ขายหลังหมุด" · การรับเข้าจากใบสั่งผลิตเขียน "หมุดใหม่"
--   ที่คำนวณฝั่งเบราว์เซอร์ (คงเหลือ + ที่รับ) = read-modify-write บนข้อมูลเงิน
--   ถ้าหน้าจอค้างหรือมีคนขายแทรก เลขผิดจะถูกอบไว้ถาวร และไม่มีประวัติให้ย้อนดู
--
-- โมเดลใหม่: คงเหลือ = หมุดนับล่าสุด + (รับเข้า/ปรับ หลังหมุด) − (ขาย หลังหมุด)
--   = "ตั้งต้น + PO รับเข้า − Sale ขาย" โดยการนับจริงยังเป็นความจริงที่รีเซ็ตทุกอย่างก่อนหน้า
--   ⚠️ ยอดขายยังคำนวณจาก tmk_mp_skus เหมือนเดิม (ไม่ materialize เป็นแถว kind='out')
--      เพราะออเดอร์ถูกแก้/ยกเลิก/re-import ตลอด — เก็บซ้ำแล้วต้องคอยซิงก์ = เปราะ
--
-- สถานะการอ่าน (อัปเดต 2 ก.ย. 69 · ระยะ 4):
--   มี move ในตาราง → หน้าคงเหลือ/ประวัติ อ่านจาก moves
--   ยังไม่มี move    → ถอยไปใช้สูตรเดิม (counts) อัตโนมัติ → รันไฟล์นี้แล้วตัวเลขต้องไม่ขยับ
--   รอบนับ/นำเข้าตั้งต้น ยังเขียนทั้ง 2 ที่ (ค่าเดียวกันทั้งคู่ = import ซ้ำก็ไม่เพี้ยน)
--   การรับเข้าจาก PO เขียน moves อย่างเดียว
-- ============================================================

begin;

-- ── §1 ตาราง ────────────────────────────────────────────────
create table if not exists public.tmk_stock_moves (
  id            text primary key,                -- คำนวณได้ (deterministic) → รันซ้ำไม่เกิดแถวซ้ำ
  sku_key       text not null,                   -- "design||color||size" (normalize แล้ว · ตรงกับ skuKey ฝั่งเว็บ)
  product_code  text not null default '',        -- รหัสลายในแคตตาล็อก — identity ที่อยู่รอดการเปลี่ยนชื่อลาย
  design        text not null default '',        -- ชื่อลาย "ณ ตอนที่เคลื่อนไหว" (freeze ไว้ดูย้อนหลัง)
  color         text not null default '',
  size          text not null default '',
  kind          text not null,                   -- open | count | in | adjust | return   (out = คิดจาก tmk_mp_skus ไม่เก็บที่นี่)
  qty           integer not null default 0,      -- มีเครื่องหมาย: + เข้า / − ออก · kind=open/count คือ "ยอดที่นับได้" (บวกเสมอ)
  moved_on      text not null,                   -- 'YYYY-MM-DD' วันที่เกิดจริง (ใช้เทียบกับ order_date ที่เป็น date)
  eod           boolean not null default true,   -- true = นับ/เกิดตอนปิดร้าน (ยอดขายวันนั้นรวมอยู่แล้ว) · false = ตอนเช้าก่อนขาย
  ref_type      text not null default 'manual',  -- po | order | count | import | manual
  ref_id        text not null default '',        -- po.id / session_id / order key
  note          text not null default '',
  created_by    text not null default '',
  created_at    timestamptz not null default now()
);

comment on table public.tmk_stock_moves is
  'สมุดเคลื่อนไหวสต็อก (append-only) — แก้ = ลงแถวกลับ ห้าม update/delete · PLAN-STOCK-V2';
comment on column public.tmk_stock_moves.eod is
  'true = นับตอนปิดร้าน (ยอดขายของวันนั้นรวมอยู่ในที่นับแล้ว) · false = นับตอนเช้าก่อนขาย (ต้องหักยอดวันนั้นด้วย)';

create index if not exists idx_stock_moves_sku   on public.tmk_stock_moves(sku_key);
create index if not exists idx_stock_moves_date  on public.tmk_stock_moves(moved_on);
create index if not exists idx_stock_moves_ref   on public.tmk_stock_moves(ref_type, ref_id);
create index if not exists idx_stock_moves_code  on public.tmk_stock_moves(product_code);
-- ดึง "หมุดล่าสุดต่อ SKU" เป็น query หลักของหน้าคงเหลือ
create index if not exists idx_stock_moves_anchor on public.tmk_stock_moves(sku_key, moved_on desc, created_at desc);

grant select, insert on public.tmk_stock_moves to authenticated;
-- ไม่ให้ update/delete แม้แต่ authenticated — append-only (แก้ = ลงแถวกลับ)
revoke update, delete on public.tmk_stock_moves from anon, authenticated;

alter table public.tmk_stock_moves enable row level security;

drop policy if exists tmk_stock_moves_read on public.tmk_stock_moves;
create policy tmk_stock_moves_read on public.tmk_stock_moves
  as permissive for select to authenticated using (true);

-- เขียนได้เฉพาะคนที่แก้ไขได้ (admin/editor) — ใช้ helper เดิมจาก Tier 3
drop policy if exists tmk_stock_moves_insert on public.tmk_stock_moves;
create policy tmk_stock_moves_insert on public.tmk_stock_moves
  as permissive for insert to authenticated with check (public.tmk_can_write());

-- ── §2 ย้ายของเก่าจาก tmk_stock_counts ──────────────────────
--    id = 'legacy::' || id เดิม → รันซ้ำกี่รอบก็ได้แถวเดียว
--    kind เดิม: 'open' (นำเข้าตั้งต้น) · 'count' (นับรอบปกติ) → คงความหมายเดิมไว้ทั้งคู่
--    eod = true ตามพฤติกรรมเดิมของระบบ (ยอดขายวันที่นับ ถือว่ารวมอยู่ในที่นับแล้ว)
do $$
begin
  if to_regclass('public.tmk_stock_counts') is null then
    raise notice 'ข้าม §2 — ยังไม่มีตาราง tmk_stock_counts';
    return;
  end if;

  insert into public.tmk_stock_moves
    (id, sku_key, product_code, design, color, size, kind, qty, moved_on, eod, ref_type, ref_id, note, created_by, created_at)
  select
    'legacy::' || c.id,
    c.design || '||' || c.color || '||' || c.size,
    coalesce(c.product_code, ''),
    c.design, c.color, c.size,
    case when c.kind = 'open' then 'open' else 'count' end,
    coalesce(c.qty, 0),
    c.count_date,
    true,
    'count',
    coalesce(c.session_id, ''),
    coalesce(c.note, ''),
    coalesce(c.created_by, ''),
    coalesce(c.created_at, now())
  from public.tmk_stock_counts c
  on conflict (id) do nothing;

  raise notice 'ย้ายของเก่าเข้า tmk_stock_moves แล้ว (แถวที่มีอยู่ถูกข้าม)';
end $$;

commit;

-- ============================================================
-- VERIFY — ต้องได้ ✅ ทุกบรรทัด
-- ============================================================
-- select
--   case when to_regclass('public.tmk_stock_moves') is not null then '✅ ตารางถูกสร้าง' else '❌ ไม่มีตาราง' end,
--   case when (select relrowsecurity from pg_class where oid='public.tmk_stock_moves'::regclass) then '✅ RLS เปิด' else '❌ RLS ปิด' end,
--   case when (select count(*) from pg_policies where tablename='tmk_stock_moves') = 2 then '✅ policy 2 อัน' else '❌ policy ไม่ครบ' end,
--   case when (select count(*) from pg_indexes where tablename='tmk_stock_moves') >= 6 then '✅ index ครบ' else '❌ index ไม่ครบ' end,
--   case when not has_table_privilege('authenticated','public.tmk_stock_moves','DELETE') then '✅ ลบไม่ได้ (append-only)' else '❌ ยังลบได้' end,
--   case when not has_table_privilege('authenticated','public.tmk_stock_moves','UPDATE') then '✅ แก้ไม่ได้ (append-only)' else '❌ ยังแก้ได้' end;
--
-- -- จำนวนที่ย้ายมา ต้องเท่ากับจำนวนแถวใน tmk_stock_counts
-- select
--   (select count(*) from public.tmk_stock_counts) as counts_เดิม,
--   (select count(*) from public.tmk_stock_moves where id like 'legacy::%') as ย้ายมาแล้ว,
--   case when (select count(*) from public.tmk_stock_counts)
--           = (select count(*) from public.tmk_stock_moves where id like 'legacy::%')
--        then '✅ ครบ' else '❌ ไม่ครบ' end as ผล;

-- ============================================================
-- ROLLBACK — ถอยเฉพาะไฟล์นี้ (tmk_stock_counts เดิมไม่ถูกแตะเลย ข้อมูลไม่หาย)
-- ============================================================
-- drop table if exists public.tmk_stock_moves;

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('20260902-stock-moves.sql');
