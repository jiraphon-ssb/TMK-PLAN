/* ============================================================
   deltaChip — สูตรชิป "เทียบช่วงก่อน" ที่เดียวของทั้งระบบ
   ============================================================
   ทำไมต้องมี: สูตรนี้เคยถูกก๊อปไว้ 4 ที่ (saleDashboard · saleDashboardMerged ·
   saleDashboardTabs · crmBlocks) ด้วยเงื่อนไข "มีผล/ไม่มีผล" ที่ไม่ตรงกัน
   → แท็บหนึ่งโชว์ชิป อีกแท็บไม่โชว์ บนตัวเลขคู่เดียวกัน
   (คลาสเดียวกับบั๊ก %ปิด 5 สำเนา ที่ทำให้ข้อมูลชุดเดียวได้ 3 ค่า)
   ข้อความ title ยังปล่อยให้แต่ละหน้าประกอบเอง เพราะฟอร์แมตยอด/จำนวนต่างกันจริง
   ============================================================ */

/** ส่วนต่างเป็น % (จำนวน/เงิน) — คืน null เมื่อเทียบไม่ได้ (ไม่ใช่ 0%)
 *  @param {number|null} cur ค่าปัจจุบัน · @param {number|null} prev ค่าช่วงก่อน
 *  @param {{goodUp?: boolean|null, on?: boolean}} o goodUp=null → เป็นกลาง (ไม่ตัดสินดี/แย่) · on=false → ปิดการเทียบ
 *  @returns {{txt: string, dir: 1|-1, good: boolean|null}|null}
 */
export function deltaPct(cur, prev, { goodUp = true, on = true } = {}) {
  if (!on || cur == null || prev == null || !(prev > 0)) return null;
  const d = (cur - prev) / prev;
  return {
    txt: (d >= 0 ? '+' : '−') + Math.abs(Math.round(d * 100)) + '%',
    dir: d >= 0 ? 1 : -1,
    good: goodUp == null ? null : (goodUp ? d >= 0 : d <= 0),
  };
}

/** ส่วนต่างของตัวชี้วัดที่เป็น % อยู่แล้ว (0–100) → หน่วย "pt"
 *  clamp ±100 เพราะเกินนั้นเป็นไปไม่ได้เชิงความหมาย (ช่วงก่อนคนทัก 2 ใบ ออเดอร์ร้อย → "−167 pt") */
export function deltaPoint(cur, prev, { goodUp = true, neutral = false, on = true } = {}) {
  if (!on || cur == null || prev == null) return null;
  const raw = Math.round(cur - prev);
  const d = Math.max(-100, Math.min(100, raw));
  const over = raw !== d;   // ถูก clamp = ช่วงก่อนมีข้อมูลน้อยเกินจะเทียบ (หน้าจอใช้เติม '+' และอธิบายใน title)
  return {
    txt: (d >= 0 ? '+' : '−') + Math.abs(d) + ' pt' + (over ? '+' : ''),
    dir: d >= 0 ? 1 : -1,
    good: neutral ? null : (goodUp ? d >= 0 : d <= 0),
    raw, over,
  };
}
