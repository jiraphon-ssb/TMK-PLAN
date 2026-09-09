/* ============================================================
   crmAgg.js — แกนคำนวณ "ยอด CRM" (PART 87) · pure ล้วน เทสต์ได้
   ============================================================
   นิยาม (ADR-001): ยอด CRM = ออเดอร์ไม่ยกเลิก (หลัง merge override)
   ที่ channel ∈ CRM_CHANNELS (LINE + โทร) — ผูกกับช่องทาง ไม่ผูกตัวคน
   หมายเหตุ: segment "ลูกค้า CRM" ในตาราง (segCrm) กว้างกว่านิยามนี้
   (รวมคนที่ตั้ง contact_channel ไว้) — ดู docs/GLOSSARY.md
   ============================================================ */
import { isCancelled } from './salePerfAgg.js';
// crmCustomerKey = สูตร canonical ร่วมกับ edge (daily-sale-report) → import จาก _shared แหล่งเดียว (P2-4)
import { crmCustomerKey } from '../../supabase/functions/_shared/saleFormulas.js';

export const CRM_CHANNELS = ['LINE', 'Phone'];
export const isCrmOrder = (o) => CRM_CHANNELS.includes(o?.channel);

// คีย์ลูกค้าฝั่งอ่าน — ตรรกะเดียวกับ buildDirectory (saleCrm.jsx) ·
// ลูกค้าปกปิด (Shopee mask "ณ******์") → '' ไม่คลัสเตอร์ · code ว่าง → จับด้วยชื่อ ('N'+ชื่อ) · re-export ต่อ
export { crmCustomerKey };

const num = (v) => Number(v) || 0;
const daysIn = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const prevYm = (ym) => { const [y, m] = ym.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

// สรุปยอด CRM รายเดือน — orders = ทุกออเดอร์ (all-time · merge override แล้ว), month = 'YYYY-MM'
// seller (optional) = scope ยอด CRM: '' = ไม่ scope · ชื่อเดียว = เซลล์คนนั้น · Set/array = ทีม CRM (D8)
// (totalSales/crmShare คิดจากยอดรวมทั้งบริษัทเสมอ · bySeller ไม่โดน filter)
export function buildCrmMonth(orders, month, seller = '') {
  const os = (orders || []).filter(o => !isCancelled(o));
  const teamSet = seller instanceof Set ? seller : Array.isArray(seller) ? new Set(seller) : null;
  const inScope = (o) => { const sp = (o.salesperson || '').trim(); return teamSet ? teamSet.has(sp) : (!seller || sp === seller); };
  // firstCrmDate ต่อลูกค้า (สแกนทุกเดือน · scope ตามเซลล์ที่เลือก) → ใช้ตัด "ใหม่ vs ซื้อซ้ำ" ของเดือนที่เลือก
  const firstCrm = new Map();
  os.forEach(o => {
    if (!isCrmOrder(o) || !inScope(o)) return;
    const k = crmCustomerKey(o); const d = o.order_date || '';
    if (!k || !d) return;
    if (!firstCrm.has(k) || d < firstCrm.get(k)) firstCrm.set(k, d);
  });

  const mk = () => ({ crmSales: 0, lineSales: 0, phoneSales: 0, crmOrders: 0, crmQty: 0, totalSales: 0, totalOrders: 0, buyerSet: new Set() });
  const cur = mk(), prv = mk();
  const pm = prevYm(month);
  const dim = daysIn(month);
  const byDay = Array.from({ length: dim }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, '0')}`, line: 0, phone: 0 }));
  const bySeller = new Map();

  os.forEach(o => {
    const ym = (o.order_date || '').slice(0, 7);
    const b = ym === month ? cur : ym === pm ? prv : null;
    if (!b) return;
    // totalSales/totalOrders = ยอดรวมทั้งบริษัท (ไม่ scope) → crmShare สะท้อนสัดส่วนจริง
    b.totalSales += num(o.sales); b.totalOrders += 1;
    if (!isCrmOrder(o)) return;
    const s = num(o.sales);
    // bySeller = ทุกคน (ไว้เป็น options ตัวสลับ · ไม่ผูกกับ scope)
    if (b === cur) {
      const sp = (o.salesperson || '').trim();
      if (sp) { const r = bySeller.get(sp) || { name: sp, sales: 0, orders: 0 }; r.sales += s; r.orders += 1; bySeller.set(sp, r); }
    }
    if (!inScope(o)) return;   // ตัวเลข CRM (crmSales/byDay/buyers) scope ตามเซลล์
    b.crmSales += s; b.crmOrders += 1; b.crmQty += num(o.qty);
    if (o.channel === 'LINE') b.lineSales += s; else b.phoneSales += s;
    const k = crmCustomerKey(o);
    if (k) b.buyerSet.add(k);
    if (b === cur) {
      const day = Number((o.order_date || '').slice(8, 10));
      if (day >= 1 && day <= dim) { if (o.channel === 'LINE') byDay[day - 1].line += s; else byDay[day - 1].phone += s; }
    }
  });

  // ใหม่ = ซื้อผ่าน LINE/โทรครั้งแรกในเดือนนี้ · ซื้อซ้ำ = มีประวัติ CRM ก่อนหน้า (new+repeat = buyers เสมอ)
  let newBuyers = 0;
  cur.buyerSet.forEach(k => { if ((firstCrm.get(k) || '').slice(0, 7) === month) newBuyers += 1; });
  const share = (b) => b.totalSales > 0 ? b.crmSales / b.totalSales * 100 : 0;

  return {
    crmSales: cur.crmSales, lineSales: cur.lineSales, phoneSales: cur.phoneSales,
    crmOrders: cur.crmOrders, crmQty: cur.crmQty, buyers: cur.buyerSet.size,
    totalSales: cur.totalSales, totalOrders: cur.totalOrders, crmShare: share(cur),
    byDay, newBuyers, repeatBuyers: cur.buyerSet.size - newBuyers,
    bySeller: [...bySeller.values()].sort((a, b) => b.sales - a.sales),
    prev: { crmSales: prv.crmSales, crmOrders: prv.crmOrders, buyers: prv.buyerSet.size, crmShare: share(prv) },
  };
}

const dayOf = (iso) => Number(String(iso || '').slice(8, 10)) || 0;

// ความคืบหน้าต่อเป้า CRM รายเดือน (pure) — pattern เดียวกับ leaderboard (salePerfAgg.js)
// { pct, daysPassed, daysLeft, gap, projected } · daysLeft = วันที่เหลือ "ไม่นับวันนี้" (dim−daysPassed) เดือนอดีต = 0
// gap = crmSales − target (ติดลบ = ตามหลังเป้า) · projected = คาดสิ้นเดือนจาก pace (เฉพาะเดือนปัจจุบัน) · target 0 → pct null
export function crmTargetProgress({ crmSales = 0, month, target = 0, todayISO }) {
  const dim = daysIn(month);
  const isCur = String(todayISO || '').slice(0, 7) === month;
  const daysPassed = isCur ? Math.min(dayOf(todayISO), dim) : dim;
  const daysLeft = Math.max(0, dim - daysPassed);
  const t = Number(target) || 0;
  const s = Number(crmSales) || 0;
  return {
    pct: t > 0 ? s / t * 100 : null,
    daysPassed, daysLeft,
    gap: s - t,
    projected: isCur && daysPassed > 0 ? s / daysPassed * dim : s,
  };
}
