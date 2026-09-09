-- ============================================================
-- 20260824-crm-contacts.sql — บันทึก "การติดต่อรายลูกค้า" ของทีม CRM (PART 110)
-- ============================================================
-- ทำไม: เดิมระบบรู้แค่ "วันนี้โทรกี่สาย" (tmk_crm_notes = ตัวเลขรวม 3 กลุ่ม)
--   → ตรวจไม่ได้ว่าโทรหาใครไปแล้วบ้าง · คนเดิมโดนโทรซ้ำ/ตกหล่น · วัดผลรายคนไม่ได้
--   ตารางนี้เก็บ 1 แถว = 1 ครั้งที่ติดต่อลูกค้า 1 คน → ลิสต์ "ควรติดต่อ" ตัดคนที่ทำแล้วออกได้
--   และตัวเลขรวมในบันทึกประจำวันคำนวณจากตารางนี้ได้เลย (ไม่ต้องกรอกมือ)
--
-- ปลอดภัย: idempotent (รันซ้ำได้) · ไม่แตะตารางเดิม · ไม่มีข้อมูลเงินอยู่ในตารางนี้
-- RLS: ตาม convention เดิมของโปรเจกต์ (authenticated ทำได้ทุกอย่าง — Tier 1/2)
-- ============================================================

create table if not exists public.tmk_crm_contacts (
  id text primary key,                 -- "<date>::<customer_key>::<epoch>" (สร้างฝั่งเว็บ)
  customer_key text not null,          -- คีย์ลูกค้าเดียวกับ crmCustomerKey() (รหัส หรือ 'N'+ชื่อ)
  customer_name text default '',       -- เก็บชื่อ ณ ตอนติดต่อ (ไว้ดูย้อนหลังแม้โปรไฟล์เปลี่ยน)
  salesperson text not null default '',-- คนที่ติดต่อ
  date text not null,                  -- 'YYYY-MM-DD' (วันที่ติดต่อ)
  kind text not null default 'other',  -- '0day' | '5day' | 'repurchase' | 'other'
  result text not null default 'answered', -- 'answered' | 'no_answer' | 'closed' | 'snooze'
  snooze_until text default null,      -- 'YYYY-MM-DD' — ไม่ต้องขึ้นลิสต์จนถึงวันนี้
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

-- ============================================================
-- VERIFY — รันแล้วต้องได้ 1 แถว ok=true
-- ============================================================
-- select
--   (to_regclass('public.tmk_crm_contacts') is not null) as table_ok,
--   (select relrowsecurity from pg_class where oid = 'public.tmk_crm_contacts'::regclass) as rls_on,
--   (select count(*) from pg_policies where tablename = 'tmk_crm_contacts') as n_policies,
--   (select count(*) from pg_indexes where tablename = 'tmk_crm_contacts') as n_indexes;

-- ============================================================
-- ROLLBACK — ถ้าจะถอย (ข้อมูลการติดต่อจะหายถาวร)
-- ============================================================
-- drop table if exists public.tmk_crm_contacts;

-- จดว่ารันแล้ว:
-- select public.tmk_migration_applied('20260824-crm-contacts.sql');
