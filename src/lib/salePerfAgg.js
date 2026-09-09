/* ============================================================
   salePerfAgg.js — แกนคำนวณ "ประสิทธิภาพเซลล์" (leaderboard) แยกจาก salePerf.jsx (PART 84 Phase 6)
   ============================================================
   pure ล้วน (ไม่มี hook/JSX/supabase) — behavior-preserving extraction จาก salePerf.jsx
   เพื่อ (1) ลดขนาด god-file (2) ทำให้ buildPerf เทสต์ได้ (มี test คู่: salePerfAgg.test.js)
   ============================================================ */
import { funnelTotal, funnelBreakdown, funnelNewOld } from './saleData.js';
import { commissionFor } from './targets.js';
import { isChatOrder } from './saleFields.js';

export const NO_SELLER = 'ไม่ระบุเซลล์';
// เดือนปัจจุบันตาม "เวลาเครื่อง" — ห้ามใช้ toISOString() (UTC)
// ไทย UTC+7: ช่วง 00:00–07:00 ของวันที่ 1 UTC ยังเป็นเดือนก่อน แต่ getDate() เป็น 1 แล้ว
// → buildPerf ได้ dim ของเดือนก่อน คู่กับ daysPassed=1 → คาดการณ์สิ้นเดือนพุ่งเป็น 31 เท่า
export const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const daysInMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const dayOf = (iso) => Number(String(iso || '').slice(8, 10)) || 0;
export const isCancelled = (o) => String(o.status || '').toLowerCase() === 'cancelled';
export const spOf = (o) => (o.salesperson && String(o.salesperson).trim()) || NO_SELLER;
export const deltaPct = (cur, prev) => (prev > 0 ? (cur - prev) / prev * 100 : null);

/**
 * ตัวเศษของ %ปิดรวม — ออเดอร์ช่องแชทเฉพาะของเซลล์ที่ "กรอกคนทัก" ในช่วงนั้น
 * ถ้าไม่มีใครกรอกคนทักเลย → คืนผลรวมทั้งหมด (นิยามเดียวกับ channelTable · กันหารกับ 0 ไปเอง)
 * @param rows   แถวจาก buildPerf (หรือ subset ที่กรองแล้วบนหน้าจอ)
 * @param funnel แถวคนทักดิบของช่วงนั้น
 */
export function chatClosedOf(rows, funnel) {
  // ข้ามแถวชื่อว่างให้ตรงกับ channelTable/funnelCloseStats (ดู closeRateParity.test.js)
  const sellers = new Set((funnel || []).map(f => String(f.salesperson || '').trim()).filter(Boolean));
  const sum = (list) => list.reduce((a, r) => a + (r.chatOrders || 0), 0);
  return sellers.size ? sum((rows || []).filter(r => sellers.has(r.name))) : sum(rows || []);
}

// สร้าง leaderboard รายเซลล์ต่อเดือน — ยอด/ออเดอร์/ตัว/AOV/คนทัก/%ปิด/เป้า/คอม/pace + รายวัน + เทียบเดือนก่อน
export function buildPerf(month, orders, skus, funnel, receipts, targets, prevOrders) {
  const dim = daysInMonth(month);
  const isCur = month === curMonth();
  const daysPassed = isCur ? Math.min(new Date().getDate(), dim) : dim;
  // order_no → salesperson (สำหรับ join skus)
  const onToSp = new Map();
  const bySp = new Map();
  const ensure = (name) => {
    if (!bySp.has(name)) bySp.set(name, {
      name, sales: 0, orders: 0, chatOrders: 0, qty: 0, newC: 0, leads: 0,
      channels: {}, chStats: {}, leadsByPlat: {}, newOld: { new: 0, old: 0 },
      designs: {}, daily: Array.from({ length: dim }, (_, i) => ({ day: i + 1, sales: 0, leads: 0, orders: 0 })),
      receipts: [],
    });
    return bySp.get(name);
  };
  orders.forEach(o => {
    if (isCancelled(o)) return;
    const name = spOf(o); const s = ensure(name);
    onToSp.set(o.order_no, name);
    const amt = Number(o.sales) || 0, q = Number(o.qty) || 0;
    s.sales += amt; s.orders += 1; s.qty += q;
    // %ปิด = ออเดอร์ช่องแชท ÷ คนทัก — isChatOrder เช็คทั้ง channel และ source='shipnity'
    // (เดิมเช็คแค่ channel → TikTok Shop จาก import (source='tiktok' · เซลล์ '(TikTok)') หลุดเข้าตัวตั้ง → %ปิดทีมสูงเกินจริง)
    if (isChatOrder(o)) s.chatOrders += 1;
    if (o.customer_type === 'ลูกค้าใหม่') s.newC += 1;
    if (o.channel) {
      s.channels[o.channel] = (s.channels[o.channel] || 0) + amt;
      const cs = s.chStats[o.channel] || (s.chStats[o.channel] = { orders: 0, sales: 0, chat: 0 });
      cs.orders += 1; cs.sales += amt;
      if (isChatOrder(o)) cs.chat += 1;   // ตัวตั้งของ %ปิดต่อช่องทาง (ต้องนิยามเดียวกับ chatOrders รวม)
    }
    const d = dayOf(o.order_date); if (d >= 1 && d <= dim) { s.daily[d - 1].sales += amt; s.daily[d - 1].orders += 1; }
  });
  // skus → design tally ต่อเซลล์ (join ผ่าน order_no)
  (skus || []).forEach(k => {
    const name = onToSp.get(k.order_no); if (!name) return;
    const s = bySp.get(name); if (!s) return;
    const dz = (k.design && String(k.design).trim()) || 'ไม่ระบุลาย';
    s.designs[dz] = (s.designs[dz] || 0) + (Number(k.qty) || 0);
  });
  // funnel → leads ต่อเซลล์ + รายวัน + ต่อแพลตฟอร์ม (คนทัก) + ใหม่/เก่า
  (funnel || []).forEach(f => {
    const name = (f.salesperson && String(f.salesperson).trim()); if (!name) return;
    const s = ensure(name); const tot = funnelTotal(f);
    s.leads += tot;
    // 'อื่นๆ' ในฟอร์มคนทัก = ช่องทางที่ระบุไม่ได้ ฝั่งออเดอร์ค่าเดียวกันชื่อ 'Direct' (fallback ของ normChannel)
    // เดิมสองชื่อไม่ join กัน → ตาราง %ปิดรายช่องทางโชว์ 2 แถวพัง (Direct มีออเดอร์แต่ leads=0 · อื่นๆ มี leads แต่ 0%)
    // รวมเป็น 'Direct' เฉพาะตอน aggregate — "ไม่แตะ" ค่าที่เซฟใน jsonb (ฟอร์ม/ข้อมูลเก่ายังเป็น 'อื่นๆ' เหมือนเดิม)
    const bd = funnelBreakdown(f); Object.entries(bd).forEach(([plat, v]) => { const key = plat === 'อื่นๆ' ? 'Direct' : plat; s.leadsByPlat[key] = (s.leadsByPlat[key] || 0) + ((Number(v.new) || 0) + (Number(v.old) || 0) + (Number(v.unknown) || 0)); });
    const no = funnelNewOld(f); s.newOld.new += Number(no.new) || 0; s.newOld.old += Number(no.old) || 0;
    const d = dayOf(f.date); if (d >= 1 && d <= dim) s.daily[d - 1].leads += tot;
  });
  // receipts → รายการต่อเซลล์ (โชว์ใน drawer/รายวัน)
  (receipts || []).forEach(r => {
    const name = (r.salesperson && String(r.salesperson).trim()) || NO_SELLER;
    const s = ensure(name); if (r.status !== 'void') s.receipts.push(r);
  });
  // prev month sales ต่อเซลล์ (เทียบ)
  const prevSp = new Map();
  (prevOrders || []).forEach(o => { if (isCancelled(o)) return; const name = spOf(o); prevSp.set(name, (prevSp.get(name) || 0) + (Number(o.sales) || 0)); });

  const rows = [...bySp.values()].map(s => {
    const t = targets[s.name] || null;
    const target = Number(t?.sales_target) || 0;
    const closeRate = s.leads > 0 ? s.chatOrders / s.leads * 100 : null;
    const projected = isCur && daysPassed > 0 ? s.sales / daysPassed * dim : s.sales;
    // %ปิดต่อช่องทาง — จับคู่ leads(แพลตฟอร์ม) กับ orders(channel) ชื่อเดียวกัน (มาร์เก็ตเพลส/POS ไม่มีคนทัก → closeRate null)
    const channelClose = Object.keys({ ...s.chStats, ...s.leadsByPlat }).map(ch => {
      // "ปิด" = ออเดอร์ช่องแชทของช่องทางนั้น (นิยามเดียวกับ chatOrders รวม — เดิมใช้ orders ทั้งหมด
      // ทำให้แถวมาร์เก็ตเพลสที่มีคนทัก เช่น TikTok โชว์ %ปิดสูงเกินจริง และไม่ตรงกับตัวเลขรวมบนจอเดียวกัน)
      const orders = s.chStats[ch]?.chat || 0, csales = s.chStats[ch]?.sales || 0, leads = s.leadsByPlat[ch] || 0;
      // over = ปิดมากกว่าคนทัก → %ปิด > 100% เป็นไปไม่ได้ = คนทักกรอกไม่ครบ (อย่าโชว์ % มั่ว)
      return { ch, orders, sales: csales, leads, closeRate: leads > 0 ? orders / leads * 100 : null, over: leads > 0 && orders > leads };
    }).sort((a, b) => (b.leads + b.orders) - (a.leads + a.orders));
    const pace = target > 0 ? (s.sales >= target ? 'over' : projected >= target ? 'ontrack' : 'risk') : null;
    const daysActive = s.daily.filter(d => d.sales > 0).length;
    return {
      ...s,
      aov: s.orders ? s.sales / s.orders : 0,
      closeRate, target, pctTarget: target ? s.sales / target * 100 : null,
      comm: t ? commissionFor(s.sales, t) : 0, tgt: t,
      projected, pace, channelClose, daysActive,
      dSales: deltaPct(s.sales, prevSp.get(s.name) || 0),
    };
  }).sort((a, b) => b.sales - a.sales);

  const team = rows.reduce((a, r) => ({
    sales: a.sales + r.sales, orders: a.orders + r.orders, chatOrders: a.chatOrders + (r.chatOrders || 0), qty: a.qty + r.qty,
    leads: a.leads + r.leads, newC: a.newC + r.newC,
  }), { sales: 0, orders: 0, chatOrders: 0, qty: 0, leads: 0, newC: 0 });
  // ตัวเศษของ %ปิดรวม = ออเดอร์ช่องแชทของ "เซลล์ที่กรอกคนทักในช่วงนั้น" เท่านั้น
  // (ตัวส่วนมีแค่คนที่กรอก — ถ้าตัวเศษนับคนที่ไม่กรอกด้วย = คนละกลุ่มกัน %ปิดพองเกินจริง)
  // นิยามเดียวกับ channelTable ในรายงานขาย · มีเทส closeRateParity คุมไว้
  team.chatClosed = chatClosedOf(rows, funnel);
  team.closeRate = team.leads > 0 ? team.chatClosed / team.leads * 100 : null;
  const prevTeam = [...prevSp.values()].reduce((a, v) => a + v, 0);
  team.dSales = deltaPct(team.sales, prevTeam);
  return { rows, team, dim };
}
