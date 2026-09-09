/* ============================================================
   salesOverviewAgg.js — แกนคำนวณของ "รายงานขาย" หลังรวมระบบยอดขาย × Sale (PART 103)
   ============================================================
   pure ล้วน (ไม่มี hook/JSX/supabase) — มีเทสคู่ที่ __tests__/salesOverviewAgg.test.js

   ทำไมต้องมี: เดิมเลข "ยอดต่อช่องทาง / คนทัก / ลูกค้าใหม่-เก่า" มี 2 แหล่ง
   (กรอกมือใน tmk_daily_sales กับคำนวณจากใบเสร็จจริง) → ไม่มีวันตรงกัน
   ไฟล์นี้ทำให้เหลือแหล่งเดียว: ออเดอร์จริง + funnel + ค่าแอดที่กรอก

   decision ที่ฝังอยู่ในไฟล์นี้ (docs/PLAN-SALES-MERGE.md):
   - D2 แกนช่องทาง = ชุด Sale (CHANNELS) ไม่ใช่ tmk_channels
   - D3 แถว CRM = ยอด LINE+Phone ของทีม CRM · **มุมมองเสริม ไม่บวกเข้ายอดรวม**
   - D4 มาร์เก็ตเพลส: เดือนมีข้อมูล import → ใช้ auto (ล็อกกรอก) · ไม่มี → ใช้ยอดที่กรอก
   - D5 คนทัก = funnel เท่านั้น · ลูกค้าใหม่/เก่า = customer_type ของออเดอร์
   - D6 cutoff: ก่อน MERGE_CUTOFF ใช้ข้อมูลกรอกมือทั้งก้อน (legacy) · ตั้งแต่นั้น = สูตรใหม่
   - D8 ทีม CRM = คนที่ถูกตั้งเป้า CRM ของเดือนนั้น
   - D11 ซื้อซ้ำ = ลูกค้าเก่า ÷ ลูกค้าทั้งหมด (เป้า 35%) · CLV = ยอด ÷ ลูกค้าไม่ซ้ำ
   ============================================================ */
import { CHANNELS, isChatOrder } from './saleFields.js';
import { funnelTotal, funnelBreakdown, funnelNewOld } from './saleData.js';
// สูตรยอดมาร์เก็ตเพลสกรอกมือ = canonical ที่ _shared (ใช้ร่วมกับ edge daily-sale-report · ห้าม copy มาแก้ที่นี่)
import { MANUAL_MP_CHANNELS, LEGACY_CHANNEL_IDS, isImportedOrder, isLeadChannel as _isLeadCh, mpExtraRevenue, readDailyChannels, mpRevByDateOf, manualExtraStats, MERGE_CUTOFF } from '../../supabase/functions/_shared/saleFormulas.js';

/** วันเริ่มใช้สูตรใหม่ (D6) — นิยามอยู่ที่ _shared แหล่งเดียว (edge ใช้ตัดสินยุคเก่า/ใหม่ด้วย) · re-export ต่อ
    เดิมวางไว้ 1 ก.ย. — user สั่งเลื่อนเข้า (21 ส.ค.): ไม่เอาฟอร์มเก่าแม้แต่ ส.ค. · ยอด ส.ค. โชว์จากออเดอร์จริง */
export { MERGE_CUTOFF };

// id ช่องทางยุคเก่า / ช่อง mp ที่กรอกมือได้ / กติกา import ชนะ — นิยามอยู่ที่ _shared แหล่งเดียว (re-export ต่อ)
export { LEGACY_CHANNEL_IDS, MANUAL_MP_CHANNELS, isImportedOrder, mpExtraRevenue };
/** เป้าอัตราซื้อซ้ำ (D11 · ตายตัว) */
export const REPEAT_TARGET = 35;
/** ช่องทางที่ยิงแอดได้ (D10 · แท็บโฆษณา) */
export const AD_CHANNELS = ['Facebook', 'LINE', 'Instagram', 'TikTok', 'Shopee', 'Lazada'];
/** ช่องทางที่นับเป็นงาน CRM (D3) */
export const CRM_CHANNELS = ['LINE', 'Phone'];

const num = (v) => Number(v) || 0;
const isCancelled = (o) => String(o?.status || '').toLowerCase() === 'cancelled';
/** ช่วงวันนี้ใช้สูตรใหม่หรือยัง (D6) — เทียบเป็น string ISO ได้ตรงๆ */
export const isMergedEra = (dateISO) => String(dateISO || '') >= MERGE_CUTOFF;

/** ทีม CRM ของเดือน = คนที่ถูกตั้งเป้า CRM > 0 (D8) — rows จาก fetchCrmTargets(month) */
export function crmTeamOf(crmTargets) {
  return new Set((crmTargets || []).filter(t => num(t.sales_target) > 0).map(t => String(t.salesperson || '').trim()).filter(Boolean));
}

/**
 * ยอด/ออเดอร์ที่กรอกมือของมาร์เก็ตเพลส + ค่าแอด จากแถว tmk_daily_sales ในช่วง
 * รูปแบบใหม่ (ตั้งแต่ cutoff): row.channels = { Shopee: {rev, ad}, Facebook: {ad}, ... } (key = ชื่อช่องทางชุด Sale)
 * @returns { ad: {ch: number}, mpRev: {ch: number}, mpRevByDate: {ch: {date: number}}, notes, replyMins }
 *   mpRevByDate = ยอด mp ที่กรอก **แยกรายวัน** — จำเป็นสำหรับกติกา "import ชนะรายวัน" (ดู mpExtraRevenue)
 */
export function manualEntryAgg(dailyRows) {
  const ad = {}, mpRev = {}, notes = [];
  const statsByDate = {};   // { [channel]: { [date]: {ord,inq,newC,oldC} } } — ตัวเลขยุคเก่าที่กรอกไว้
  let replySum = 0, replyN = 0;
  // ยอดรายวันต่อช่องทาง = สูตรกลาง (_shared): key ใหม่ชนะ key เก่า · fallback คอลัมน์แยกยุคเก่า · ก่อน cutoff คิดทุกช่องทาง
  const mpRevByDate = mpRevByDateOf(dailyRows);
  Object.entries(mpRevByDate).forEach(([ch, days]) => {
    Object.values(days).forEach(v => { mpRev[ch] = (mpRev[ch] || 0) + v; });
  });
  (dailyRows || []).forEach(r => {
    const cj = (r && typeof r.channels === 'object' && r.channels) || {};
    const { ad: adRow, stats } = readDailyChannels(r);
    Object.entries(adRow).forEach(([ch, v]) => { ad[ch] = (ad[ch] || 0) + v; });
    if (num(r.ad_spend) && !Object.keys(cj).length) ad._total = (ad._total || 0) + num(r.ad_spend); // เผื่อกรอกรวม (แถวยุคเก่า)
    const d = String(r?.date || '').slice(0, 10);
    if (d) Object.entries(stats || {}).forEach(([ch, v]) => { (statsByDate[ch] || (statsByDate[ch] = {}))[d] = v; });
    if (r.note) notes.push({ date: r.date, note: String(r.note) });
    if (num(r.avg_reply_minutes) > 0) { replySum += num(r.avg_reply_minutes); replyN += 1; }
  });
  return { ad, mpRev, mpRevByDate, statsByDate, notes, replyMins: replyN ? Math.round(replySum / replyN) : null };
}

/**
 * ตารางช่องทาง (D2/D3/D4/D5) — หัวใจของแท็บภาพรวม
 * @param orders   ออเดอร์ในช่วง (merge override แล้ว · ยังไม่ตัด cancelled)
 * @param funnel   แถว tmk_sales_funnel ในช่วง
 * @param manual   ผลจาก manualEntryAgg (ค่าแอด + ยอด mp ที่กรอก)
 * @param crmTeam  Set ชื่อทีม CRM (จาก crmTeamOf)
 * @param opts     { from, to, salespersons[], channels[], allowManual }
 *   - from/to: **กรองคนทักตามช่วงที่ดูอยู่** (บังคับกรองที่นี่จุดเดียว — เดิม caller ส่ง funnel ทั้งตาราง คนทักเลยรั่วข้ามเดือน)
 *   - salespersons/channels: ให้เลขตรงกับตัวกรองของหน้า
 *   - allowManual=false: หน้ากำลังกรองมิติที่ยอดกรอกมือ/ค่าแอดไม่มีความหมาย (เช่นกรองรายเซลล์) → ไม่บวกของกรอกมือ
 * @returns { rows, total, crmRow, unassignedAd }
 *   rows: [{ ch, sales, orders, qty, leads, newC, oldC, closeRate, over, ad, roas, cpi, isManual, manualRev }]
 *   total: ผลรวมของ rows (ไม่รวม crmRow — D3)
 */
export function channelTable(orders, funnel, manual, crmTeam, opts = {}) {
  const { from, to, salespersons, channels, allowManual = true } = opts;
  const inR = (d) => (!from || d >= from) && (!to || d <= to);
  const spOk = (sp) => !(salespersons && salespersons.length) || salespersons.includes(sp);
  const chOk = (ch) => !(channels && channels.length) || channels.includes(ch);
  const live = (orders || []).filter(o => !isCancelled(o));
  const byCh = {};
  const ensure = (ch) => (byCh[ch] || (byCh[ch] = {
    ch, sales: 0, orders: 0, qty: 0, chatOrders: 0, leads: 0, newC: 0, oldC: 0,
    ad: 0, isManual: false, manualRev: 0, importedRev: 0, _chatBy: [],
  }));

  live.forEach(o => {
    const ch = o.channel || 'Direct';
    const s = ensure(ch);
    s.sales += num(o.sales); s.orders += 1; s.qty += num(o.qty);
    if (isChatOrder(o)) { s.chatOrders += 1; s._chatBy.push(String(o.salesperson || '').trim()); }  // ตัวตั้ง %ปิด (กรองเซลล์ทีหลัง)
    if (o.customer_type === 'ลูกค้าใหม่') s.newC += 1;
    else if (o.customer_type === 'ลูกค้าเก่า') s.oldC += 1;
    if (MANUAL_MP_CHANNELS.includes(ch)) s.importedRev += num(o.sales); // มี import จริงของ mp เดือนนี้
  });

  // คนทัก (D5) — 'อื่นๆ' ในฟอร์ม = 'Direct' ฝั่งออเดอร์ (นิยามเดียวกับ salePerfAgg)
  // กรองช่วงวัน + เซลล์ + ช่องทาง ที่นี่ (ไม่พึ่ง caller) → เลขตรงกับการ์ด KPI "คนทัก" เสมอ
  /* เซลล์ที่ "กรอกคนทัก" จริงในช่วงนี้ — %ปิด ต้องนับเฉพาะออเดอร์ของคนกลุ่มนี้
     ไม่งั้นคนที่ไม่กรอกคนทักเลยจะเอาออเดอร์ไปหารกับคนทักของคนอื่น → การ์ด KPI (12%)
     กับบรรทัดรวมในตารางช่องทาง (22%) ขัดกันเองบนจอเดียว (bug ที่รีวิวจับได้) */
  const funnelSellers = new Set();
  const funnelDates = [];
  /* ⚠️ แถวที่ชื่อเซลล์ว่าง = attribute ไม่ได้ → ข้ามทั้งแถว (ทั้ง leads และ orders)
     เดิมเติม '' เข้า set → ออเดอร์ที่ไม่ระบุเซลล์เข้าตัวเศษ ขณะที่ buildPerf ทิ้งทั้งแถว
     และ funnelClose ตัด '' แต่ยังนับ leads → ข้อมูลชุดเดียวได้ %ปิด 3 ค่า (33.33 / 29.41 / 27.78)
     ดู closeRateParity.test.js */
  (funnel || []).filter(f => inR(String(f?.date || '')) && spOk(f?.salesperson) && String(f?.salesperson || '').trim()).forEach(f => {
    funnelSellers.add(String(f?.salesperson || '').trim());
    funnelDates.push(String(f?.date || '').slice(0, 10));
    const bd = funnelBreakdown(f);
    Object.entries(bd).forEach(([plat, v]) => {
      const ch = plat === 'อื่นๆ' ? 'Direct' : plat;
      if (!chOk(ch)) return;
      ensure(ch).leads += num(v.new) + num(v.old) + num(v.unknown);
    });
  });

  // ยอดมาร์เก็ตเพลสที่กรอกมือ (D4 · รื้อ PART 107) — คิดรายวัน ผ่าน mpExtraRevenue (import ชนะรายวัน)
  const mpX = allowManual ? mpExtraRevenue(live, manual?.mpRevByDate || {}) : { extra: {}, byDate: {}, manualDays: {} };
  if (allowManual) {
    Object.entries(manual?.mpRev || {}).forEach(([ch, rev]) => { if (chOk(ch)) ensure(ch).manualRev = num(rev); });
    Object.entries(mpX.extra).forEach(([ch, v]) => {
      if (!chOk(ch) || !(v > 0)) return;
      const s = ensure(ch);
      s.sales += v; s.manualExtra = v; s.isManual = true;
    });
    // ค่าแอดที่กรอก (ต่อช่องทาง)
    Object.entries(manual?.ad || {}).forEach(([ch, v]) => { if (ch !== '_total' && chOk(ch)) ensure(ch).ad += num(v); });
  }
  // ค่าแอดที่กรอกแบบรวม ไม่ระบุช่องทาง (แถวยุคเก่า) — เดิมถูกทิ้งเงียบ ตอนนี้เอาไปรวมใน ROAS รวม + บอกให้เห็น
  const unassignedAd = (allowManual && !(channels && channels.length)) ? num(manual?.ad?._total) : 0;

  /* สถิติยุคก่อนรวมระบบ (ord/inq/newC/oldC ที่กรอกรายวัน) — บวกเฉพาะส่วนที่ยังไม่มีของยุคใหม่
     กติกากันซ้ำ: วันไหนมีออเดอร์ import แล้วไม่นับ ord ซ้ำ · วันไหนมีแถวคนทักแล้วไม่นับ inq ซ้ำ */
  if (allowManual) {
    const extraStats = manualExtraStats(live, manual?.statsByDate || {}, funnelDates);
    Object.entries(extraStats).forEach(([ch, v]) => {
      if (!chOk(ch)) return;
      const s2 = ensure(ch);
      /* ord   = ยุคเก่า (ก่อน 1 ส.ค. 69) — ไม่มีออเดอร์รายใบเลย
         ordMp = มาร์เก็ตเพลสยุคใหม่ที่กรอกจำนวนเอง (วันที่ไม่มีไฟล์นำเข้า)
         ทั้งคู่ "ไม่มีใบให้เจาะ" เหมือนกัน แต่ **เฉพาะ ord เท่านั้น**ที่เป็นตัวตั้ง %ปิด
         เพราะออเดอร์มาร์เก็ตเพลสไม่มีการทักก่อนซื้อ (TikTok เป็นช่องแชท แต่ยอดที่กรอกคือยอดร้าน) */
      const ordAll = num(v.ord) + num(v.ordMp);
      s2.orders += ordAll; s2.leads += num(v.inq);
      s2.newC += num(v.newC); s2.oldC += num(v.oldC);
      s2.legacyOrders = ordAll;   // ไว้ให้ UI รู้ว่าออเดอร์ส่วนนี้ไม่มีใบให้เจาะ
      // ยุคเก่าไม่มี "เซลล์" ผูกกับออเดอร์ → ใช้จำนวนที่กรอกเป็นตัวตั้ง %ปิด ตรง ๆ (ช่องแชทเท่านั้น)
      if (_isLeadCh(ch)) s2.legacyChat = num(v.ord);
    });
  }

  // ตัวตั้ง %ปิด = ออเดอร์ช่องแชทของ "เซลล์ที่กรอกคนทัก" เท่านั้น (ตรงกับการ์ด KPI)
  Object.values(byCh).forEach(s2 => {
    const fromOrders = funnelSellers.size ? s2._chatBy.filter(n => funnelSellers.has(n)).length : s2.chatOrders;
    s2.chatClosed = fromOrders + num(s2.legacyChat);   // ยุคใหม่ (ออเดอร์จริง) + ยุคเก่า (ที่กรอกไว้)
    delete s2._chatBy;
  });

  const order = (ch) => { const i = CHANNELS.indexOf(ch); return i < 0 ? 999 : i; };
  const rows = Object.values(byCh)
    .map(s => {
      /* "ไม่มีการทักก่อนซื้อ" ต้องใช้นิยามเดียวกับ isLeadChannel ที่ใช้ตอนสะสม legacyChat (บรรทัดบน)
         เดิมใช้ MANUAL_MP_CHANNELS (ลิสต์ "ช่องที่กรอกยอดมือ") ซึ่งมี TikTok อยู่ด้วย
         → TikTok มี leads/chatClosed บวกเข้าแถวรวม แต่แถวตัวเองโชว์ '—' และขัดกับ buildPerf ที่คิด %ปิด TikTok ปกติ */
      const noLead = !_isLeadCh(s.ch);
      const closeRate = (!noLead && s.leads > 0) ? s.chatClosed / s.leads * 100 : null;
      return {
        ...s,
        closeRate,
        over: !noLead && s.leads > 0 && s.chatClosed > s.leads,   // ปิด > ทัก = คนทักกรอกไม่ครบ
        roas: s.ad > 0 ? s.sales / s.ad : null,
        cpi: s.ad > 0 && s.leads > 0 ? s.ad / s.leads : null,     // CPI จาก "คนทักจริง" ครั้งแรก
        cpo: s.ad > 0 && s.orders > 0 ? s.ad / s.orders : null,
      };
    })
    .filter(s => s.sales || s.orders || s.leads || s.ad)
    .sort((a, b) => (b.sales - a.sales) || (order(a.ch) - order(b.ch)));

  const total = rows.reduce((a, r) => ({
    sales: a.sales + r.sales, orders: a.orders + r.orders, qty: a.qty + r.qty,
    leads: a.leads + r.leads, newC: a.newC + r.newC, oldC: a.oldC + r.oldC,
    chatOrders: a.chatOrders + r.chatOrders, chatClosed: a.chatClosed + (r.chatClosed || 0), ad: a.ad + r.ad,
    /* ออเดอร์ที่ "กรอกจำนวนเอง" (ยุคเก่า + มาร์เก็ตเพลสวันที่ไม่มีไฟล์นำเข้า) — ไม่มีใบให้เจาะ
       ต้องส่งออกมาเป็นตัวเลข ไม่ใช่ซ่อนอยู่ใน orders เฉย ๆ ไม่งั้นการ์ด "13 ออเดอร์"
       กับกราฟรายวันที่รวมได้ 7 จะขัดกันเองบนจอเดียว โดยไม่มีอะไรอธิบาย */
    legacyOrders: a.legacyOrders + num(r.legacyOrders),
  }), { sales: 0, orders: 0, qty: 0, leads: 0, newC: 0, oldC: 0, chatOrders: 0, chatClosed: 0, ad: 0, legacyOrders: 0 });
  total.ad += unassignedAd;
  total.closeRate = total.leads > 0 ? total.chatClosed / total.leads * 100 : null;
  total.roas = total.ad > 0 ? total.sales / total.ad : null;

  // แถว CRM (D3) — ยอด LINE+Phone ของทีม CRM · "ไม่บวกเข้ายอดรวม"
  const team = crmTeam instanceof Set ? crmTeam : new Set(crmTeam || []);
  const crmOrds = live.filter(o => team.has(String(o.salesperson || '').trim()) && CRM_CHANNELS.includes(o.channel));
  const crmRow = {
    ch: 'CRM', excluded: true,
    sales: crmOrds.reduce((a, o) => a + num(o.sales), 0),
    orders: crmOrds.length,
    qty: crmOrds.reduce((a, o) => a + num(o.qty), 0),
    newC: crmOrds.filter(o => o.customer_type === 'ลูกค้าใหม่').length,
    oldC: crmOrds.filter(o => o.customer_type === 'ลูกค้าเก่า').length,
    members: [...team],
  };

  return { rows, total, crmRow, unassignedAd, mpManualDays: mpX.manualDays };
}

/**
 * มุมลูกค้า (D11) — ใหม่/เก่า · อัตราซื้อซ้ำ + เป้า · CLV · แยกต่อช่องทาง
 * @returns { newC, oldC, totalC, newPct, oldPct, repeatPct, hitTarget, clv, nCustomers, byChannel }
 */
export function customerInsight(orders) {
  const live = (orders || []).filter(o => !isCancelled(o));
  const newC = live.filter(o => o.customer_type === 'ลูกค้าใหม่').length;
  const oldC = live.filter(o => o.customer_type === 'ลูกค้าเก่า').length;
  const totalC = newC + oldC;
  const sales = live.reduce((a, o) => a + num(o.sales), 0);
  const uniq = new Set(live.map(o => o.customer_code || o.customer_name).filter(Boolean));
  const nCustomers = uniq.size;

  const byCh = {};
  live.forEach(o => {
    const ch = o.channel || 'Direct';
    const g = byCh[ch] || (byCh[ch] = { ch, newC: 0, oldC: 0 });
    if (o.customer_type === 'ลูกค้าใหม่') g.newC += 1;
    else if (o.customer_type === 'ลูกค้าเก่า') g.oldC += 1;
  });
  const byChannel = Object.values(byCh)
    .map(g => ({ ...g, total: g.newC + g.oldC }))
    .filter(g => g.total > 0)
    .sort((a, b) => b.total - a.total);

  const repeatPct = totalC > 0 ? oldC / totalC * 100 : null;
  return {
    newC, oldC, totalC,
    newPct: totalC > 0 ? newC / totalC * 100 : null,
    oldPct: totalC > 0 ? oldC / totalC * 100 : null,
    repeatPct,
    hitTarget: repeatPct != null && repeatPct >= REPEAT_TARGET,
    clv: nCustomers > 0 ? sales / nCustomers : null,   // CLV = ยอดช่วง ÷ ลูกค้าไม่ซ้ำ (D11)
    nCustomers,
    byChannel,
  };
}

/** ซีรีส์ลูกค้าใหม่/เก่า + %ซื้อซ้ำ ต่อ bucket (สำหรับกราฟรายสัปดาห์ตามภาพ user) */
export function customerSeries(orders, buckets, keyOf) {
  const m = {};
  (orders || []).filter(o => !isCancelled(o)).forEach(o => {
    const b = keyOf(o.order_date); if (!b) return;
    const g = m[b] || (m[b] = { n: 0, o: 0 });
    if (o.customer_type === 'ลูกค้าใหม่') g.n += 1;
    else if (o.customer_type === 'ลูกค้าเก่า') g.o += 1;
  });
  return (buckets || []).map(b => {
    const g = m[b] || { n: 0, o: 0 };
    const t = g.n + g.o;
    return { bucket: b, newC: g.n, oldC: g.o, repeatPct: t > 0 ? g.o / t * 100 : null };
  });
}

/** สรุปคนทักทั้งช่วง (ใช้ที่ hero/แท็บคนทัก) — total/new/old จาก funnel ล้วน */
export function funnelSummary(funnel) {
  let total = 0, nw = 0, od = 0;
  (funnel || []).forEach(f => {
    total += funnelTotal(f);
    const x = funnelNewOld(f); nw += num(x.new); od += num(x.old);
  });
  return { total, new: nw, old: od, unknown: Math.max(total - nw - od, 0) };
}

/**
 * รวมขอบวันที่จากหลายตาราง — รายงานต้องเลือกช่วงได้ครอบ "ทุกแหล่งที่มีข้อมูล"
 * เดิมใช้ขอบของตารางออเดอร์อย่างเดียว → เลือกย้อนก่อนวันออเดอร์แรกไม่ได้เลย
 * ทั้งที่ยอด/ค่าแอดที่กรอกรายวัน (ยุคก่อนรวมระบบ) เก่ากว่านั้น
 * @param list [{min,max}] · @returns {min,max}
 */
export function mergeBounds(list) {
  let min = null, max = null;
  (list || []).forEach(b => {
    if (!b) return;
    if (b.min && (!min || b.min < min)) min = b.min;
    if (b.max && (!max || b.max > max)) max = b.max;
  });
  return { min, max };
}
