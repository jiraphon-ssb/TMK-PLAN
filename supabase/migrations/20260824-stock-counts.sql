-- ============================================================
-- 20260824-stock-counts.sql — นับสต็อก + สต็อกตั้งต้น (PART 112 · เฟส 1)
-- ============================================================
-- แนวคิด: 1 แถว = "จำนวนที่นับได้" ของ 1 SKU (ลาย×สี×ไซซ์) ณ วันหนึ่ง = จุดอ้างอิง (anchor)
--   คงเหลือ = จำนวนที่นับครั้งล่าสุด − ที่ขายไปหลังวันนับ (คิดสดจาก tmk_mp_skus · ตัดใบยกเลิก)
--   → ยกเลิกใบเสร็จ ของกลับเข้าสต็อกเอง · นับใหม่ = ทับ anchor เดิม ไม่ต้องล้างข้อมูล
-- สต็อกตั้งต้นจาก Excel = kind='open' (การนับครั้งที่ 0) — ใช้กลไกเดียวกัน
--
-- ปลอดภัย: ตารางใหม่ล้วน ไม่แตะของเดิม · ไม่มีข้อมูลเงิน · idempotent (รันซ้ำได้)
-- RLS: ตาม convention เดิมของโปรเจกต์ (authenticated ทำได้ทุกอย่าง)
-- ============================================================

create table if not exists public.tmk_stock_counts (
  id text primary key,                    -- "<session_id>::<design>::<color>::<size>"
  session_id text not null,               -- รอบนับ (นำเข้า 1 ครั้ง / นับ 1 ลาย = 1 รอบ)
  count_date text not null,               -- 'YYYY-MM-DD' — วันที่ยึดเป็นจุดอ้างอิง
  design text not null default '',         -- ชื่อลาย (normalize แล้ว)
  color text not null default '',          -- สี (normalize แล้ว)
  size text not null default '',           -- ไซซ์ (XS..7XL)
  product_code text default '',            -- รหัสลายในแคตตาล็อก (ถ้าจับคู่ได้)
  qty integer not null default 0,          -- จำนวนที่นับได้
  kind text not null default 'count',      -- 'open' = ตั้งต้นจากไฟล์ · 'count' = นับรอบปกติ
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

-- ============================================================
-- VERIFY — ต้องได้ table_ok=true · rls_on=true · n_policies=1 · n_indexes>=4
-- ============================================================
-- select
--   (to_regclass('public.tmk_stock_counts') is not null) as table_ok,
--   (select relrowsecurity from pg_class where oid = 'public.tmk_stock_counts'::regclass) as rls_on,
--   (select count(*) from pg_policies where tablename = 'tmk_stock_counts') as n_policies,
--   (select count(*) from pg_indexes where tablename = 'tmk_stock_counts') as n_indexes;

-- ============================================================
-- ROLLBACK (ข้อมูลการนับจะหายถาวร)
-- ============================================================
-- drop table if exists public.tmk_stock_counts;

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('20260824-stock-counts.sql');
