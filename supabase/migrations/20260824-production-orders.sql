-- ============================================================
-- 20260824-production-orders.sql — ใบสั่งผลิต (PO) · PART 113
-- ============================================================
-- 1 แถว = 1 ใบสั่งผลิต · รายการที่สั่งเก็บเป็น jsonb items[{design,color,size,qty,received}]
-- สถานะ: draft(ร่าง) → ordered(สั่งแล้ว) → producing(กำลังผลิต) → received(รับครบ) | cancelled(ยกเลิก)
--
-- ตอน "รับเข้า" ระบบไม่เขียน movement แยก — แต่สร้าง "จุดอ้างอิงสต็อกใหม่" ใน tmk_stock_counts
--   (ยอดคงเหลือปัจจุบัน + ที่รับเข้า) ณ วันที่รับ → ใช้สูตรเดียวกับ PART 112 ทั้งหมด ไม่มีสูตรที่สอง
--
-- ปลอดภัย: ตารางใหม่ล้วน · idempotent · RLS ตาม convention เดิม (authenticated)
-- ============================================================

create table if not exists public.tmk_production_orders (
  id text primary key,                    -- เลขใบสั่ง เช่น 'PO-690824-001'
  order_date text not null,               -- วันที่สั่ง 'YYYY-MM-DD'
  due_date text default '',               -- กำหนดรับ
  supplier text default '',               -- โรงงาน/ผู้ผลิต
  responsible text default '',            -- ผู้รับผิดชอบ (แยกรายคนได้)
  status text not null default 'ordered', -- draft | ordered | producing | received | cancelled
  items jsonb not null default '[]'::jsonb, -- [{design,color,size,qty,received}]
  note text default '',
  received_date text default '',
  created_by text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_po_status on public.tmk_production_orders(status);
create index if not exists idx_po_date on public.tmk_production_orders(order_date);
create index if not exists idx_po_responsible on public.tmk_production_orders(responsible);

grant select, insert, update, delete on public.tmk_production_orders to anon, authenticated;

alter table public.tmk_production_orders enable row level security;
-- ⚠️ สร้าง policy เปิดกว้าง **เฉพาะตอนที่ตารางยังไม่มี policy ของ Tier 3**
--    เดิม drop แล้ว create ทื่อ ๆ → รันไฟล์นี้ซ้ำหลังรัน Tier 3 = คืนสิทธิ์เขียนให้ viewer
--    (permissive policy ถูก OR กัน → <table>_rls_write ที่ผูก tmk_can_write() ถูกข้าม)
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmk_production_orders'
             and policyname like '%\_rls\_%' escape '\') then
    raise notice 'ข้าม tmk_production_orders — มี policy Tier 3 อยู่แล้ว (ไม่ทับ)';
  else
    drop policy if exists tmk_authenticated_all on public.tmk_production_orders;
    create policy tmk_authenticated_all on public.tmk_production_orders
      as permissive for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ============================================================
-- VERIFY
-- ============================================================
-- select
--   (to_regclass('public.tmk_production_orders') is not null) as table_ok,
--   (select relrowsecurity from pg_class where oid = 'public.tmk_production_orders'::regclass) as rls_on,
--   (select count(*) from pg_policies where tablename = 'tmk_production_orders') as n_policies;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- drop table if exists public.tmk_production_orders;

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('20260824-production-orders.sql');
