/* ============================================================
   funnelClose.js — สูตร "คนทัก → ปิดการขาย" ที่เดียวทั้งระบบ (7 ก.ย. 69) · pure ล้วน
   ============================================================
   ทำไมต้องแยกไฟล์: ตรรกะนี้เคยถูกเขียนซ้ำ 2 ที่ (หัวหน้ารายงานขาย vs แท็บ "คนทัก")
   แล้วสองที่นั้นก็เพี้ยนออกจากกัน — ตัวหนึ่งกรองช่องทาง อีกตัวไม่กรอง
   → กดชิป Facebook แล้วหัวการ์ดขึ้น 22% แต่แท็บข้างล่างขึ้น 15% ในจอเดียวกัน
   (และตัวหนึ่ง trim ชื่อเซลล์ อีกตัวไม่ trim → ชื่อมีช่องว่างหัวท้าย = ตัวเศษเป็น 0)

   กติกา (ต้องตรงกับ channelTable/buildPerf — ดู closeRateParity.test.js):
   1. ตัวส่วน = คนทักของ "เซลล์ที่กรอกคนทัก" ในช่วงนั้น · กรองช่องทางด้วยถ้ามีตัวกรอง
   2. ตัวเศษ = ออเดอร์ช่องแชทของเซลล์กลุ่มเดียวกัน (isChatOrder = ตัดมาร์เก็ตเพลส)
   3. เทียบชื่อเซลล์แบบ trim ทั้งสองฝั่ง
   4. ไม่มีคนทัก → pct = null (ไม่ใช่ 0 — 0% แดงทั้งที่แปลว่า "ไม่มีข้อมูล")
   ============================================================ */
import { funnelTotal, funnelBreakdown, funnelNewOld } from './saleData.js';
import { isChatOrder } from '../../supabase/functions/_shared/saleFormulas.js';

/** ชื่อเซลล์สำหรับจับคู่ — ต้องใช้ตัวนี้ทั้งฝั่ง funnel และฝั่งออเดอร์ */
export const nmSeller = (v) => String(v ?? '').trim();

/**
 * จำนวนคนทักของ funnel 1 แถว เมื่อกรองช่องทาง
 * chSet = null (ไม่กรอง) → รวมทุกแพลตฟอร์ม
 * 'อื่นๆ' ฝั่งฟอร์มคนทัก = 'Direct' ฝั่งออเดอร์ (ตรงกับ channelTable)
 */
export function leadsOfRow(r, chSet) {
  if (!chSet) return funnelTotal(r);
  const bd = funnelBreakdown(r);
  return Object.entries(bd).reduce((a, [plat, v]) => {
    const ch = plat === 'อื่นๆ' ? 'Direct' : plat;
    if (!chSet.has(ch)) return a;
    return a + (Number(v.new) || 0) + (Number(v.old) || 0) + (Number(v.unknown) || 0);
  }, 0);
}

/** ใหม่/เก่า/ไม่ระบุ ของ funnel 1 แถว เมื่อกรองช่องทาง (chSet = null → ทุกแพลตฟอร์ม) */
export function newOldOfRow(r, chSet) {
  if (!chSet) return funnelNewOld(r);
  const bd = funnelBreakdown(r);
  return Object.entries(bd).reduce((a, [plat, v]) => {
    const ch = plat === 'อื่นๆ' ? 'Direct' : plat;
    if (!chSet.has(ch)) return a;
    a.new += Number(v.new) || 0; a.old += Number(v.old) || 0; a.unknown += Number(v.unknown) || 0;
    return a;
  }, { new: 0, old: 0, unknown: 0 });
}

/**
 * สรุปคนทัก + ปิดการขาย
 * @param fr    แถว funnel ที่กรองช่วง/เซลล์มาแล้ว
 * @param ords  ออเดอร์ในช่วง (กรองช่องทางมาแล้วตามตัวกรองหน้าจอ)
 * @param chSet Set ช่องทางที่กรอง หรือ null = ไม่กรอง — **ต้องเป็นชุดเดียวกับที่ใช้กรอง ords**
 * @returns { leads, n, o, u, orders, sales, pct, over, chat, sps }
 */
export function funnelCloseStats(fr, ords, chSet = null) {
  /* แถวที่ชื่อเซลล์ว่าง = attribute ไม่ได้ → ข้ามทั้งแถว ให้ตรงกับ buildPerf/channelTable
     (นับ leads แต่ไม่นับ orders = %ปิดต่ำเกินจริงของทุกคน) */
  const rows = (fr || []).filter(r => nmSeller(r?.salesperson));
  const leads = rows.reduce((a, r) => a + leadsOfRow(r, chSet), 0);
  /* ใหม่/เก่า ต้องกรองช่องทางด้วย ไม่งั้นการ์ดติดกันขัดกันเอง
     (เจอจริง: "คนทัก 755" แต่บรรทัดล่างเขียน "449 คน จาก 761 ที่ระบุ")
     กติกา: n + o + u ต้องเท่ากับ leads เสมอ */
  const no = rows.reduce((a, r) => {
    const x = newOldOfRow(r, chSet); a.n += x.new; a.o += x.old; a.u += x.unknown; return a;
  }, { n: 0, o: 0, u: 0 });
  // เซลล์ที่กรอกคนทัก — ชื่อว่างไม่นับ (ตรงกับ buildPerf ที่ map ไป NO_SELLER แล้วตัดออก)
  const sps = new Set(rows.map(r => nmSeller(r.salesperson)));
  const chat = (ords || []).filter(o => sps.has(nmSeller(o.salesperson)) && isChatOrder(o));
  const sales = chat.reduce((a, o) => a + (Number(o.sales) || 0), 0);
  return {
    leads, ...no, orders: chat.length, sales,
    pct: leads ? chat.length / leads * 100 : null,
    over: leads > 0 && chat.length > leads,   // ออเดอร์ > คนทัก = เซลล์กรอกคนทักไม่ครบ
    chat, sps,
  };
}
