/* ============================================================
   monthlyRollup.js — สรุปยอดรายเดือน (PART 12 / T4)
   ============================================================
   - เขียนตอน import จาก master (order-level, dedup + ตัด cancelled แล้ว) → ตรงกับ compute()
   - graceful: ตาราง tmk_monthly_rollup ยังไม่มี → เขียน/อ่าน เงียบ (ไม่ทำ import/dashboard พัง)
   - "as-imported": แก้ override/re-match ภายหลังไม่อัปเดต rollup → รายงานละเอียด = source of truth
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { logAudit } from './audit.js';

const num = (v) => Number(v) || 0;

/** สร้างแถว rollup ต่อเดือนจาก master (1 แถว/ออเดอร์) */
export function buildRollupRows(master) {
  const byMonth = new Map();
  for (const m of (master || [])) {
    const month = m.order_month;
    if (!month) continue;
    /* ⚠️ ต้องตัดใบยกเลิกที่นี่ ไม่ใช่หวังให้ผู้เรียกกรองมาก่อน
       หัวไฟล์เขียนว่ารับ master ที่ "ตัด cancelled แล้ว" แต่ modals-import ส่ง master ดิบ
       (มีแต่ summarize() ที่กรอง) → ยอดที่ยกเลิกถูกบวกเข้าตารางเงินนี้
       status 'unknown' (อ่านคอลัมน์สถานะไม่ได้) ก็ไม่นับ — ไม่รู้ว่าใบไหนยกเลิก = ไม่ควรเดา */
    const st = String(m.status || '').toLowerCase();
    if (st === 'cancelled' || st === 'unknown') continue;
    let r = byMonth.get(month);
    if (!r) { r = { id: month, month, orders: 0, qty: 0, sales: 0, profit: 0, commission: 0, by_channel: {} }; byMonth.set(month, r); }
    r.orders += 1;
    r.qty += num(m.qty);
    r.sales += num(m.sales);
    r.profit += num(m.profit);
    r.commission += num(m.mkt_commission);
    const ch = m.channel || 'อื่นๆ';
    const c = r.by_channel[ch] || (r.by_channel[ch] = { orders: 0, qty: 0, sales: 0 });
    c.orders += 1; c.qty += num(m.qty); c.sales += num(m.sales);
  }
  // ปัดทศนิยมเงิน 2 ตำแหน่ง
  return [...byMonth.values()].map(r => ({
    ...r,
    qty: Math.round(r.qty),
    sales: Math.round(r.sales * 100) / 100,
    profit: Math.round(r.profit * 100) / 100,
    commission: Math.round(r.commission * 100) / 100,
    updated_at: new Date().toISOString(),
  }));
}

/** upsert rollup ของเดือนที่อยู่ใน import นี้ — non-blocking (โยน false ถ้าตารางยังไม่มี) */
export async function writeMonthlyRollup(master) {
  try {
    const rows = buildRollupRows(master);
    if (!rows.length) return true;
    const { error } = await supabase.from('tmk_monthly_rollup').upsert(rows, { onConflict: 'id' });
    if (error) return false;
    const months = [...new Set(rows.map(r => r.month).filter(Boolean))].sort();
    logAudit({ action: 'update', entityType: 'monthly', entityName: months.join(', ') || 'rollup', summary: `อัปเดตสรุปรายเดือน ${rows.length} แถว (${months.join(', ')})`, data: { rows: rows.length, months } });
    return true;
  } catch { return false; }
}

/** อ่าน rollup ทั้งหมด (เบา) → [] ถ้าตารางยังไม่มี/error · ใช้เป็น fast-path มี runtime fallback เสมอ */
export async function fetchMonthlyRollup() {
  try {
    const { data, error } = await supabase
      .from('tmk_monthly_rollup')
      .select('id,month,orders,qty,sales,profit,commission,by_channel')
      .order('month', { ascending: true });
    if (error) return [];
    return data || [];
  } catch { return []; }
}
