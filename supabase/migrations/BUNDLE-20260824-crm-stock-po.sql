-- ============================================================================
-- BUNDLE-20260824-crm-stock-po.sql — รวม 5 migration ที่ค้างอยู่เป็นไฟล์เดียว
-- ============================================================================
-- วิธีรัน: Supabase → SQL Editor → วางทั้งไฟล์ → Run (ครั้งเดียวจบ)
-- ปลอดภัย: idempotent ทุกบล็อก (รันซ้ำได้ ไม่พัง ไม่ทับข้อมูล) · ไม่แตะตารางที่มีข้อมูลเงิน
--          ไม่มี "disable row level security" · ไม่ลบ/แก้คอลัมน์เดิม
--
-- รวมจาก:
--   1) 20260821-realtime-targets.sql      — เป้า/ตั้งค่า เข้า realtime (แก้เป้าแล้วหน้าอื่นเด้งตาม)
--   2) 20260824-crm-contacts.sql          — ตารางบันทึกการติดต่อรายลูกค้า (PART 110)
--   3) 20260824-crm-activity-targets.sql  — เป้าจำนวนสาย/อัตรารับสาย (2 คอลัมน์ในตารางเป้า CRM เดิม)
--   4) 20260824-stock-counts.sql          — นับสต็อก/สต็อกตั้งต้น (PART 112)
--   5) 20260824-production-orders.sql     — ใบสั่งผลิต PO (PART 113)
--
-- ท้ายไฟล์มี: บันทึกลง tmk_migrations อัตโนมัติ + VERIFY (คืน 1 แถว ต้องเขียวทั้งแถว)
-- ROLLBACK อยู่ท้ายสุด (คอมเมนต์ไว้ — ใช้เมื่อจะถอยเท่านั้น ข้อมูลหายถาวร)
-- ============================================================================


-- ============================================================================
-- [1/5] realtime: เพิ่มตาราง "เป้า/ตั้งค่า" เข้า publication supabase_realtime
-- ----------------------------------------------------------------------------
-- อาการเดิม: แก้เป้า CRM/เป้าเซลล์/เป้าเดือน/วันตัดรอบ → หน้าที่เปิดค้างไม่เด้งตาม ต้องรีเฟรชเอง
-- เหตุ: ตารางกลุ่มนี้ไม่อยู่ใน publication (ของเดิมครอบเฉพาะตารางยอดขาย)
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['tmk_targets', 'tmk_crm_targets', 'tmk_monthly_history', 'tmk_settings'] loop
    if exists (select 1 from information_schema.tables where table_schema='public' and table_name=t)
       and not exists (select 1 from pg_publication_tables
               where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ============================================================================
-- [2/5] tmk_crm_contacts — บันทึก "การติดต่อรายลูกค้า" ของทีม CRM (PART 110)
-- ----------------------------------------------------------------------------
-- ทำไม: เดิมรู้แค่ "วันนี้โทรกี่สาย" (ตัวเลขรวม) → ตรวจไม่ได้ว่าโทรใครแล้วบ้าง คนเดิมโดนซ้ำ/ตกหล่น
-- 1 แถว = 1 ครั้งที่ติดต่อลูกค้า 1 คน → ลิสต์ "ควรติดต่อ" ตัดคนที่ทำแล้วออกได้ + สรุปรายวันคิดเองได้
-- ไม่มีข้อมูลเงินในตารางนี้
-- ============================================================================
create table if not exists public.tmk_crm_contacts (
  id text primary key,                     -- "<date>::<customer_key>::<epoch>" (สร้างฝั่งเว็บ)
  customer_key text not null,              -- คีย์เดียวกับ crmCustomerKey() (รหัส หรือ 'N'+ชื่อ)
  customer_name text default '',            -- ชื่อ ณ ตอนติดต่อ (ดูย้อนหลังได้แม้โปรไฟล์เปลี่ยน)
  salesperson text not null default '',     -- คนที่ติดต่อ
  date text not null,                       -- 'YYYY-MM-DD' วันที่ติดต่อ
  kind text not null default 'other',       -- '0day' | '5day' | 'repurchase' | 'other'
  result text not null default 'answered',  -- 'answered' | 'no_answer' | 'closed' | 'snooze'
  snooze_until text default null,           -- 'YYYY-MM-DD' — ไม่ต้องขึ้นลิสต์จนถึงวันนี้
  note text default '',
  created_by text default '',
  created_at timestamptz default now()
);

create index if not exists idx_crm_contacts_date on public.tmk_crm_contacts(date);
create index if not exists idx_crm_contacts_key on public.tmk_crm_contacts(customer_key);
create index if not exists idx_crm_contacts_snooze on public.tmk_crm_contacts(snooze_until);

grant select, insert, update, delete on public.tmk_crm_contacts to anon, authenticated;

alter table public.tmk_crm_contacts enable row level security;
-- ⚠️ สร้าง policy เปิดกว้าง **เฉพาะตอนที่ตารางยังไม่มี policy ของ Tier 3**
--    เดิม drop แล้ว create ทื่อ ๆ → รันไฟล์นี้ซ้ำหลังรัน Tier 3 = คืนสิทธิ์เขียนให้ viewer
--    (permissive policy ถูก OR กัน → <table>_rls_write ที่ผูก tmk_can_write() ถูกข้าม)
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmk_crm_contacts'
             and policyname like '%\_rls\_%' escape '\') then
    raise notice 'ข้าม tmk_crm_contacts — มี policy Tier 3 อยู่แล้ว (ไม่ทับ)';
  else
    drop policy if exists tmk_authenticated_all on public.tmk_crm_contacts;
    create policy tmk_authenticated_all on public.tmk_crm_contacts
      as permissive for all to authenticated using (true) with check (true);
  end if;
end $$;


-- ============================================================================
-- [3/5] tmk_crm_targets — เพิ่มเป้าเชิงกิจกรรม (จำนวนสาย / อัตรารับสาย)
-- ----------------------------------------------------------------------------
-- ไม่สร้างตารางใหม่ · ตั้งค่าที่หน้า ตั้งค่า › เป้า & คอม ที่เดิม · default 0 = ไม่ได้ตั้งเป้า (UI ไม่โชว์)
-- ห่อ do-block ไว้: ถ้ายังไม่มีตาราง tmk_crm_targets จะ "ข้าม" แทนที่จะทำทั้งไฟล์ล้ม
-- ============================================================================
do $$
begin
  if to_regclass('public.tmk_crm_targets') is not null then
    alter table public.tmk_crm_targets add column if not exists calls_target integer default 0;
    alter table public.tmk_crm_targets add column if not exists answer_rate_target numeric default 0;
  else
    raise notice 'ข้าม: ยังไม่มีตาราง public.tmk_crm_targets (ต้องรัน 20260731-crm-targets-notes.sql ก่อน)';
  end if;
end $$;


-- ============================================================================
-- [4/5] tmk_stock_counts — นับสต็อก + สต็อกตั้งต้น (PART 112 เฟส 1)
-- ----------------------------------------------------------------------------
-- 1 แถว = จำนวนที่นับได้ของ 1 SKU (ลาย×สี×ไซซ์) ณ วันหนึ่ง = "จุดอ้างอิง" (anchor)
--   คงเหลือ = ที่นับครั้งล่าสุด − ที่ขายไปหลังวันนับ (คิดสดจาก tmk_mp_skus · ตัดใบยกเลิก)
--   → ยกเลิกใบเสร็จของกลับเข้าสต็อกเอง · นับใหม่ = ทับ anchor เดิม ไม่ต้องล้างข้อมูล
-- สต็อกตั้งต้นจาก Excel = kind='open' (การนับครั้งที่ 0) ใช้กลไกเดียวกัน
-- ============================================================================
create table if not exists public.tmk_stock_counts (
  id text primary key,                     -- "<session_id>::<design>::<color>::<size>"
  session_id text not null,                -- รอบนับ (นำเข้า 1 ครั้ง / นับ 1 ลาย = 1 รอบ)
  count_date text not null,                -- 'YYYY-MM-DD' วันที่ยึดเป็นจุดอ้างอิง
  design text not null default '',          -- ชื่อลาย (normalize แล้ว)
  color text not null default '',           -- สี (normalize แล้ว)
  size text not null default '',            -- ไซซ์ (XS..7XL)
  product_code text default '',             -- รหัสลายในแคตตาล็อก (ถ้าจับคู่ได้)
  qty integer not null default 0,           -- จำนวนที่นับได้
  kind text not null default 'count',       -- 'open' = ตั้งต้นจากไฟล์ · 'count' = นับรอบปกติ
  note text default '',
  created_by text default '',
  created_at timestamptz default now()
);

create index if not exists idx_stock_counts_design on public.tmk_stock_counts(design);
create index if not exists idx_stock_counts_date on public.tmk_stock_counts(count_date);
create index if not exists idx_stock_counts_session on public.tmk_stock_counts(session_id);

grant select, insert, update, delete on public.tmk_stock_counts to anon, authenticated;

alter table public.tmk_stock_counts enable row level security;
-- ⚠️ สร้าง policy เปิดกว้าง **เฉพาะตอนที่ตารางยังไม่มี policy ของ Tier 3**
--    เดิม drop แล้ว create ทื่อ ๆ → รันไฟล์นี้ซ้ำหลังรัน Tier 3 = คืนสิทธิ์เขียนให้ viewer
--    (permissive policy ถูก OR กัน → <table>_rls_write ที่ผูก tmk_can_write() ถูกข้าม)
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tmk_stock_counts'
             and policyname like '%\_rls\_%' escape '\') then
    raise notice 'ข้าม tmk_stock_counts — มี policy Tier 3 อยู่แล้ว (ไม่ทับ)';
  else
    drop policy if exists tmk_authenticated_all on public.tmk_stock_counts;
    create policy tmk_authenticated_all on public.tmk_stock_counts
      as permissive for all to authenticated using (true) with check (true);
  end if;
end $$;


-- ============================================================================
-- [5/5] tmk_production_orders — ใบสั่งผลิต PO (PART 113)
-- ----------------------------------------------------------------------------
-- 1 แถว = 1 ใบสั่งผลิต · รายการที่สั่งเก็บเป็น jsonb items[{design,color,size,qty,received}]
-- สถานะ: draft(ร่าง) → ordered(สั่งแล้ว) → producing(กำลังผลิต) → received(รับครบ) | cancelled
-- ตอน "รับเข้า" ไม่เขียน movement แยก แต่สร้าง anchor ใหม่ใน tmk_stock_counts (คงเหลือ + ที่รับ)
--   → ใช้สูตรเดียวกับ [4/5] ทั้งหมด ไม่มีสูตรที่สอง
-- ============================================================================
create table if not exists public.tmk_production_orders (
  id text primary key,                     -- เลขใบสั่ง เช่น 'PO-690824-001'
  order_date text not null,                -- วันที่สั่ง 'YYYY-MM-DD'
  due_date text default '',                -- กำหนดรับ
  supplier text default '',                -- โรงงาน/ผู้ผลิต
  responsible text default '',             -- ผู้รับผิดชอบ (แยกรายคนได้)
  status text not null default 'ordered',  -- draft | ordered | producing | received | cancelled
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


-- ============================================================================
-- บันทึกว่ารันแล้ว (ตาราง tmk_migrations) — ทำอัตโนมัติ ถ้ามีฟังก์ชันอยู่แล้ว
-- ดูภายหลัง: select * from public.tmk_migrations order by applied_at desc;
-- ============================================================================
do $$
declare f text;
begin
  -- หมายเหตุ: ฟังก์ชันจริงคือ (p_filename text, p_note text default null) → to_regprocedure('...(text)') จะไม่แมตช์
  --           เลยเช็คจาก pg_proc ตามชื่อแทน (ไม่งั้นบล็อกนี้จะเงียบและไม่จดลง tmk_migrations)
  if exists (select 1 from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
              where ns.nspname = 'public' and pr.proname = 'tmk_migration_applied') then
    foreach f in array array[
      '20260821-realtime-targets.sql',
      '20260824-crm-contacts.sql',
      '20260824-crm-activity-targets.sql',
      '20260824-stock-counts.sql',
      '20260824-production-orders.sql'
    ] loop
      execute format('select public.tmk_migration_applied(%L)', f);
    end loop;
  end if;
end $$;


-- ============================================================================
-- VERIFY — ต้องได้ 1 แถว และทุกช่องตรงตามคอมเมนต์ท้ายบรรทัด
-- ============================================================================
select
  (to_regclass('public.tmk_crm_contacts')     is not null) as t_crm_contacts,      -- true
  (to_regclass('public.tmk_stock_counts')     is not null) as t_stock_counts,      -- true
  (to_regclass('public.tmk_production_orders') is not null) as t_production_orders, -- true
  (select count(*) from information_schema.columns
     where table_schema='public' and table_name='tmk_crm_targets'
       and column_name in ('calls_target','answer_rate_target'))                as crm_target_cols, -- 2
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relrowsecurity
       and c.relname in ('tmk_crm_contacts','tmk_stock_counts','tmk_production_orders')) as rls_on,  -- 3
  (select count(*) from pg_policies where schemaname='public'
     and tablename in ('tmk_crm_contacts','tmk_stock_counts','tmk_production_orders')) as n_policies, -- 3
  (select count(*) from pg_indexes where schemaname='public'
     and tablename in ('tmk_crm_contacts','tmk_stock_counts','tmk_production_orders')) as n_indexes,  -- 12 (pkey 3 + 9)
  (select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
     and tablename in ('tmk_targets','tmk_crm_targets','tmk_monthly_history','tmk_settings')) as rt_targets; -- 4


-- ============================================================================
-- ROLLBACK — ใช้เมื่อจะถอยเท่านั้น (ข้อมูลในตารางเหล่านี้จะหายถาวร)
-- ============================================================================
-- drop table if exists public.tmk_crm_contacts;
-- drop table if exists public.tmk_stock_counts;
-- drop table if exists public.tmk_production_orders;
-- alter table public.tmk_crm_targets drop column if exists calls_target;
-- alter table public.tmk_crm_targets drop column if exists answer_rate_target;
-- alter publication supabase_realtime drop table public.tmk_targets;
-- alter publication supabase_realtime drop table public.tmk_crm_targets;
-- alter publication supabase_realtime drop table public.tmk_monthly_history;
-- alter publication supabase_realtime drop table public.tmk_settings;
