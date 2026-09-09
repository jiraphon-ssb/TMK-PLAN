-- ============================================================
-- 20260731-crm-targets-notes.sql — เป้ายอดขาย CRM ต่อเซลล์ + บันทึกประจำวัน CRM (PART 87.2)
-- ============================================================
-- เป้า CRM แยกตารางจาก tmk_targets เพราะ salePerf ทำ map ต่อ salesperson จาก fetchTargets —
-- แถวเป้า CRM ซ้ำชื่อเซลล์จะทับเป้าปกติ (และ sentinel prefix จะโผล่เป็น orphan ใน TargetsView)
--
-- RLS: ทั้งระบบเปิด RLS + policy tmk_authenticated_all (for all to authenticated) ตั้งแต่ PART 84
-- (20260716-enable-rls-tier1.sql วนเฉพาะตารางที่มีตอนนั้น — ตารางใหม่ต้องเพิ่ม policy เอง
--  ไม่งั้น insert โดน 42501 new row violates row-level security policy)
-- ไฟล์นี้ idempotent — รันซ้ำได้ ไม่ต้องลบตาราง

-- เป้ายอดขาย CRM ต่อเซลล์ ต่อเดือน (แสดงในหน้า "ภาพรวม CRM" · กรอกใน ตั้งค่า › เป้า & คอม)
create table if not exists public.tmk_crm_targets (
  id text primary key,            -- "<salesperson>::<YYYY-MM>"
  salesperson text not null,
  month text not null,            -- 'YYYY-MM'
  sales_target numeric default 0, -- เป้ายอด CRM (บาท)
  updated_at timestamptz default now()
);
create index if not exists idx_crm_targets_month on public.tmk_crm_targets(month);

-- บันทึกประจำวัน CRM ต่อ (เซลล์, วัน) — เช่น "ลูกค้าสอบถามเสื้อสีเทา อสม. เข้ามาเยอะ"
create table if not exists public.tmk_crm_notes (
  id text primary key,            -- "<salesperson>::<YYYY-MM-DD>"
  salesperson text not null,
  date text not null,             -- 'YYYY-MM-DD'
  note text default '',
  updated_at timestamptz default now()
);
create index if not exists idx_crm_notes_date on public.tmk_crm_notes(date);

grant select, insert, update, delete on public.tmk_crm_targets to anon, authenticated;
grant select, insert, update, delete on public.tmk_crm_notes to anon, authenticated;

-- RLS + policy (เหมือนทุกตาราง tmk_ · role authenticated เขียน/อ่านได้)
alter table public.tmk_crm_targets enable row level security;
alter table public.tmk_crm_notes  enable row level security;
-- ⚠️ สร้าง policy เปิดกว้าง **เฉพาะตอนที่ตารางยังไม่มี policy ของ Tier 3**
--    เดิม drop แล้ว create ทื่อ ๆ → รันไฟล์นี้ซ้ำหลังรัน Tier 3 = คืนสิทธิ์เขียนให้ viewer
--    (permissive policy ถูก OR กัน → <table>_rls_write ที่ผูก tmk_can_write() ถูกข้าม)
do $$
declare t text;
begin
  foreach t in array array['tmk_crm_targets', 'tmk_crm_notes'] loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
               and policyname like '%\_rls\_%' escape '\') then
      raise notice 'ข้าม % — มี policy Tier 3 อยู่แล้ว (ไม่ทับ)', t;
    else
      execute format('drop policy if exists tmk_authenticated_all on public.%I', t);
      execute format('create policy tmk_authenticated_all on public.%I as permissive for all to authenticated using (true) with check (true)', t);
    end if;
  end loop;
end $$;
