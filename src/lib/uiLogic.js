/* ============================================================
   uiLogic.js — ตรรกะเล็ก ๆ ของหน้าจอที่ "เคยพลาดมาแล้ว" (PART 118)
   ============================================================
   ทำไมต้องแยกไฟล์: บั๊กชุดที่รีวิวจับได้รอบก่อน (วันจันทร์ค้าง · ชิปนับไม่ตรงตัวกรอง ·
   ช่องทางที่มีคนทักแต่ปิด 0 หายทั้งแถว · คำค้นที่มี , ทำ query พัง · เซฟทับยอดรับเข้า)
   ล้วนเป็นตรรกะ 3-10 บรรทัดที่ฝังอยู่ใน JSX → เทสไม่ได้ ใครแก้ทีหลังก็ทำพังซ้ำได้
   ย้ายมาที่นี่ = มีเทสคู่ทุกตัว
   ============================================================ */
import { sizeRank } from './saleAgg.js';   // eslint-disable-line no-unused-vars -- reserved: ใช้ในเวอร์ชันถัดไป (จัดเรียงไซซ์ในตารางช่องทาง)

/** วันในสัปดาห์ที่ "ทักเยอะสุด" — ค่าเฉลี่ยต่อวัน · วันที่ไม่มีในช่วง (days=0) ต้องไม่ชนะ
 *  @param wd [{leads, days}] index 0-6 (อา-ส) · @returns index หรือ null */
export function bestWeekday(wd, order = [1, 2, 3, 4, 5, 6, 0]) {
  const avg = (w) => (wd?.[w]?.days ? wd[w].leads / wd[w].days : 0);
  let best = null;
  order.forEach(w => { if (avg(w) > (best == null ? -1 : avg(best))) best = w; });
  return best != null && avg(best) > 0 ? best : null;
}

/** จำนวนงานตามกำหนด — ต้องใช้ตัวเดียวกับตัวกรอง ไม่งั้นชิปโชว์เลขหนึ่ง กดแล้วได้อีกเลข
 *  @param diffs อาร์เรย์ของ "จำนวนวันจนถึงกำหนด" (null = ไม่มีกำหนด) ของงานที่ยังไม่เสร็จ */
export function dueCounts(diffs) {
  const d = (diffs || []).filter(x => x != null);
  return {
    overdue: d.filter(x => x < 0).length,
    today: d.filter(x => x === 0).length,
    week: d.filter(x => x >= 0 && x <= 7).length,   // = ตัวกรอง 'week' (รวมงานที่ครบวันนี้)
  };
}

/** แถวช่องทางในหน้าประสิทธิภาพเซล — ต้องรวมช่องที่ "มีคนทักแต่ยังปิดไม่ได้" (0%) ด้วย */
export function channelRows(channels, channelClose) {
  const closeBy = new Map((channelClose || []).map(c => [c.ch, c]));
  const names = [...new Set([...Object.keys(channels || {}), ...(channelClose || []).map(c => c.ch)])];
  return names.map(ch => {
    const c = closeBy.get(ch) || {};
    const sales = Number(channels?.[ch]) || 0;
    return { ch, sales, leads: c.leads || 0, orders: c.orders || 0, closeRate: c.leads ? (c.closeRate ?? null) : null, over: !!c.over };
  }).filter(r => r.sales || r.leads || r.orders)
    .sort((a, b) => (b.sales - a.sales) || (b.leads - a.leads));
}

/** คำค้นที่ปลอดภัยกับ filter ของ PostgREST — , ( ) ทำให้ or=(...) พังทั้งก้อน */
export function safeSearchTerm(term) {
  return String(term || '').replace(/[(),."'\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** รวมรายการใบสั่งผลิตก่อนเซฟ — ห้ามย้อนยอด "รับแล้ว" ที่คนอื่นเพิ่งบันทึก
 *  @param serverItems รายการล่าสุดจากฐานข้อมูล · @param localItems รายการในฟอร์มที่กำลังจะเซฟ */
export function mergeReceivedItems(serverItems, localItems, keyOf) {
  const key = keyOf || ((it) => `${String(it?.design || '').trim()}||${it?.color || ''}||${it?.size || ''}`);
  const recvOf = new Map((serverItems || []).map(it => [key(it), Math.round(Number(it?.received) || 0)]));
  return (localItems || []).map(it => {
    const server = recvOf.get(key(it));
    const local = Math.round(Number(it?.received) || 0);
    return (server != null && server > local) ? { ...it, received: server } : it;
  });
}

/** ช่วง 7 วันข้างหน้าแบบเวลาท้องถิ่น — toISOString() จะเลื่อนวันที่ UTC+7 */
export function plusDaysISO(iso, days) {
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
