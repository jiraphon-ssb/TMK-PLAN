/* ============================================================
   trashTables.js — นิยามถังขยะ (ตารางที่กวาด + กติกาลบถาวร)
   ============================================================
   แยกออกจาก views-settings-tabs.jsx เพื่อทำเทสได้ · ที่นั่นเหลือแค่ render
   ⚠️ ชื่อตารางที่นี่ถูกเอาไปต่อเป็น supabase.from(...) ตรง ๆ
      → ต้องเป็น allowlist คงที่เท่านั้น ห้ามรับค่าจากข้อมูลผู้ใช้
   ============================================================ */

/* money: true = แถวนี้คือ "เงิน" — ลบถาวรแล้วยอดขาย/ค่าแอดหายจริง
   ต้องกั้นแอดมินฝั่งเว็บให้ตรงกับ policy ฝั่ง DB (migration 20260824-rls-tier3b-narrow.sql
   ตั้ง delete = admin ไว้แล้ว) ไม่งั้นคนแก้ไขได้จะกดแล้วเจอ error RLS งง ๆ แทนที่จะไม่เห็นปุ่ม */
export const TRASH_TABLES = [
  { table: 'tmk_tasks', type: 'งาน', nameCol: 'title', key: 'id' },
  { table: 'tmk_campaigns', type: 'แคมเปญ', nameCol: 'name', key: 'id' },
  { table: 'tmk_channels', type: 'ช่องทาง', nameCol: 'name', key: 'id' },
  { table: 'tmk_duties', type: 'หน้าที่', nameCol: 'name', key: 'id' },
  { table: 'tmk_ad_campaigns', type: 'แคมเปญแอด', nameCol: 'name', key: 'id' },
  { table: 'tmk_user_roles', type: 'ผู้ใช้', nameCol: 'name', key: 'email', adminOnly: true },
  // ยอดรายวัน = ยอดขาย/ค่าแอดยุคก่อนรวมระบบ (มิ.ย.–ก.ค. 69 · PART 121 เพิ่งกู้กลับมา)
  // ต้องอยู่ในถังขยะต่อ เพราะ "ลบวัน" เป็น soft-delete แล้วกรอกใหม่/กู้คืนได้จริง
  { table: 'tmk_daily_sales', type: 'ยอดรายวัน', nameCol: 'date', key: 'id', adminOnly: true, money: true },
  // PART 123d: ตัด tmk_products / tmk_customer_segments ออก — ตารางยุคเก่าที่ไม่มีหน้าไหนใช้แล้ว
  //   (เลิกโหลดตั้งแต่ PART 116/109) เหลือไว้ = ยิง query เปล่าทุกครั้งที่เปิดถังขยะ
];

/** ลบถาวรแถวนี้ต้องเป็นแอดมินไหม — ไม่รู้จัก/ว่าง = ต้องแอดมิน (ปลอดภัยไว้ก่อน) */
export function needsAdminToPurge(meta) {
  if (!meta || !meta.table) return true;
  const row = TRASH_TABLES.find(t => t.table === meta.table);
  return row ? !!row.adminOnly : true;
}

/** ข้อความยืนยันก่อนลบถาวร — ของที่เป็นเงินต้องบอกให้ชัดว่ากำลังทำลายอะไร */
export function purgeWarning(meta, name) {
  const base = `ลบถาวร "${name}"?\nลบแล้วกู้คืนไม่ได้อีก`;
  if (meta?.money || TRASH_TABLES.find(t => t.table === meta?.table)?.money) {
    return `ลบถาวรยอดรายวันของ "${name}"?\n\nนี่คือ ยอดขาย · ค่าแอด · คนทัก ของวันนั้นทั้งวัน`
      + `\nลบแล้วรายงานย้อนหลังจะขาดวันนี้ไป และกู้คืนไม่ได้อีก`;
  }
  return base;
}
