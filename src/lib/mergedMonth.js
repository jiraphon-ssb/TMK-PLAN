/* ============================================================
   mergedMonth.js — ดึง "ยอดจริงต่อเดือน" จากออเดอร์ (สำหรับยุคหลัง cutoff · PART 103 · แก้บั๊ก #1)
   ============================================================
   ปัญหา: HomeView / MonthlyOverview อ่านผ่าน computeMonth ซึ่งใช้ tmk_daily_sales (กรอกมือ)
   ตั้งแต่ cutoff (1 ส.ค. 2569) ไม่กรอกยอดรายวันแล้ว → หน้าพวกนั้นโชว์ ~0 ทั้งที่มียอดจริง

   ทางแก้: เดือน >= MERGE_CUTOFF → ดึงออเดอร์จริง (tmk_mp_orders) + ค่าแอด (tmk_daily_sales) ของเดือนนั้น
   คำนวณผ่าน channelTable เดิม (สูตรเดียวกับรายงานขาย = เลขตรงกัน)
   - ไม่เขียน DB (ไม่มี snapshot/rollup → ไม่มีความเสี่ยงยอดค้างแบบ PART 90)
   - เดือนก่อน cutoff → คืน null (ให้ผู้เรียกใช้ computeMonth เดิมตามปกติ ข้อมูลเก่าไม่ถูกแตะ)
   ============================================================ */
import { supabase } from './supabaseClient.js';
import { cachedFetchRange, cachedFetchAll, ORDERS_SEL, OVERRIDES_SEL, FUNNEL_SEL, strayOverrideOrderNos, fetchOrdersByNos, dedupeOrders } from './saleData.js';
import { mergeOrderOverrides } from './saleOverrides.js';
import { channelTable, customerInsight, manualEntryAgg, crmTeamOf, isMergedEra, MERGE_CUTOFF, mpExtraRevenue } from './salesOverviewAgg.js';
import { fetchCrmTargets } from './crmTargets.js';

const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };

/** เดือน ym ('YYYY-MM') อยู่ในยุคใหม่ไหม (>= cutoff) — ผู้เรียกใช้เช็คก่อนตัดสินใจ fetch */
export const isMergedMonth = (ym) => isMergedEra(`${ym}-01`);

/**
 * ดึงสรุปเดือนจากออเดอร์จริง — คืน null ถ้าเดือนก่อน cutoff (ใช้ computeMonth เดิมแทน)
 * @returns { sales, orders, qty, newC, oldC, leads, ad, roas, closeRate, channels:[{ch,sales,orders,...}], crmRow, insight, days:[{day,sales,orders}] } | null
 */
export async function fetchMergedMonth(ym) {
  if (!ym || !isMergedMonth(ym)) return null;
  const from = `${ym}-01`, to = `${ym}-${String(lastDay(ym)).padStart(2, '0')}`;
  try {
    const [oR, ovR, fR, dR, crmT] = await Promise.all([
      cachedFetchRange('tmk_mp_orders', ORDERS_SEL, from, to, 'order_date'),
      cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
      supabase.from('tmk_sales_funnel').select(FUNNEL_SEL).gte('date', from).lte('date', to),
      supabase.from('tmk_daily_sales').select('date,channels,ad_spend,avg_reply_minutes,note,deleted_at').gte('date', from).lte('date', to),
      fetchCrmTargets(ym),
    ]);
    /* ⚠️ cachedFetchRange คืน { error } — **ไม่ throw** → ถ้าไม่เช็คตรงนี้ จะไม่มีทางเข้า catch
       แล้ว orders = [] ทำให้ทั้งฟังก์ชันคืน "เดือนนี้ขายได้ ฿0" อย่างมั่นใจ
       ซึ่งหน้าแรก/เกจเป้าเดือนเชื่อตรง ๆ (mt.has = !!mm) = โชว์ ฿0 · 0% ทั้งที่ยอดอยู่ครบใน DB
       คืน null = "ไม่รู้" ให้ผู้เรียกแยกออกจาก "รู้ว่าเป็นศูนย์" (fetchYearMergedActuals ก็ทำแบบนี้) */
    if (oR?.error) return null;
    const ovMap = {}; if (ovR && !ovR.error) (ovR.data || []).forEach(x => { ovMap[x.order_id] = x; });
      /* override ที่ "ย้ายวันที่" — ดึงใบที่วันที่ใหม่อยู่ในช่วงแต่วันที่ดิบไม่อยู่ (ไม่งั้นยอดหายจากเดือนนี้)
         แล้วกรองซ้ำด้วยวันที่ "หลัง merge" (ไม่งั้นใบที่ถูกย้ายออกไปเดือนอื่นจะยังถูกนับในเดือนนี้ + ลงผิดวัน) */
    const base = oR.data || [];
    const strayNos = strayOverrideOrderNos(ovMap, from, to, base);
    const strays = strayNos.length ? await fetchOrdersByNos('tmk_mp_orders', ORDERS_SEL, strayNos) : [];
    // dedupeOrders = กันซ้ำชั้นสอง (fetchOrdersByNos ค้นด้วย order_no อย่างเดียว จึงคืนข้ามช่องทางได้)
    const orders = mergeOrderOverrides(dedupeOrders([...base, ...strays]), ovMap)
      .filter(o => { const d = String(o.order_date || '').slice(0, 10); return !d || (d >= from && d <= to); });
    /* ⚠️ 2 query นี้เคยกลืน error เงียบ ทั้งที่บรรทัดบนตั้งใจ `if (oR?.error) return null` ไว้แล้ว
       - tmk_daily_sales พลาด → ยอด Shopee/TikTok/Lazada ที่กรอกมือ + ค่าแอด หายทั้งเดือน
       - tmk_sales_funnel พลาด → คนทัก 0 → %ปิด null เหมือนไม่มีใครทัก
       ทั้งคู่โผล่บนหน้าแรก/เกจเป้า โดยที่ moneyReadOk ยังเป็น true = ไม่มีแถบเตือน
       จึงต้องส่ง flag ออกไปให้ผู้เรียกตัดสินใจ (หน้าแรกใช้ขึ้นแถบเตือน) */
    const funnelOk = !!fR && !fR.error;
    const dailyOk = !!dR && !dR.error;
    const funnel = funnelOk ? (fR.data || []) : [];
    const dailyRows = dailyOk ? (dR.data || []).filter(d => !d.deleted_at) : [];
    const manual = manualEntryAgg(dailyRows);
    const { rows, total, crmRow } = channelTable(orders, funnel, manual, crmTeamOf(crmT), { from, to });
    const insight = customerInsight(orders);

    // ยอด/ออเดอร์รายวัน (สำหรับกราฟ + สรุปเมื่อวานหน้าหลัก) — ตัดยกเลิก
    // + บวกยอดมาร์เก็ตเพลสที่กรอกมือของวันนั้น (PART 107) ไม่งั้นสรุปรายวัน < รายงานขายของวันเดียวกัน
    const dayMap = {};
    orders.forEach(o => {
      if (String(o.status || '').toLowerCase() === 'cancelled') return;
      const d = Number(String(o.order_date || '').slice(8, 10)) || 0;
      if (!d) return;
      const g = dayMap[d] || (dayMap[d] = { day: d, sales: 0, orders: 0, mpManual: 0 });
      g.sales += Number(o.sales) || 0; g.orders += 1;
    });
    const mpX = mpExtraRevenue(orders, manual.mpRevByDate);
    Object.entries(mpX.byDate).forEach(([iso, v]) => {
      const d = Number(String(iso).slice(8, 10)) || 0;
      if (!d || !(v > 0)) return;
      const g = dayMap[d] || (dayMap[d] = { day: d, sales: 0, orders: 0, mpManual: 0 });
      g.sales += v; g.mpManual = (g.mpManual || 0) + v;
    });
    const days = Object.values(dayMap).sort((a, b) => a.day - b.day);

    return {
      sales: total.sales, orders: total.orders, qty: total.qty,
      /* ส่วนของ orders ที่ไม่มีใบเสร็จรายใบ → Σ days[].orders + legacyOrders === orders เสมอ
         (ผู้เรียกใช้บอกผู้ใช้ได้ว่าทำไมการ์ดกับกราฟไม่เท่ากัน) */
      legacyOrders: total.legacyOrders || 0,
      newC: total.newC, oldC: total.oldC, leads: total.leads, ad: total.ad,
      roas: total.roas, closeRate: total.closeRate,
      channels: rows, crmRow, insight, days,
      replyMins: manual.replyMins, notes: manual.notes,
      // false = ตัวเลขนี้ขาดของบางส่วน (ผู้เรียกต้องเตือน ไม่ใช่โชว์เป็นข้อเท็จจริง)
      manualOk: dailyOk, funnelOk,
    };
  } catch {
    return null;
  }
}

/* ============================================================
   fetchYearMergedActuals — ยอดจริงต่อเดือน (จากออเดอร์) เฉพาะเดือน merged ของปี พ.ศ. ที่ระบุ
   ============================================================
   ใช้กับ YoY / ไตรมาส: ปีเก่าอยู่ใน tmk_monthly_history ครบแล้ว · ขาดแค่เดือนใหม่ (ก.ย. 69+)
   → ดึง query เดียวช่วง merged ของปีนั้น group ตามเดือน (ตัดยกเลิก) · ไม่เขียน DB · ไม่มี feedback
   PART 107: **บวกยอดมาร์เก็ตเพลสที่กรอกมือด้วย** (สูตรเดียวกับรายงานขาย — mpExtraRevenue รายวัน)
   ไม่งั้นกราฟ "แนวโน้มระยะยาว" ต่ำกว่ารายงานขายของเดือนเดียวกันเท่ากับยอด Shopee/TikTok/Lazada ที่กรอก
   คืน { [monthNum 1-12]: ยอดขาย } เฉพาะเดือนที่ >= cutoff (เดือนก่อน cutoff ไม่รวม — ใช้คลังเดิม)
   ============================================================ */
export async function fetchYearMergedActuals(yearBE) {
  const yearCE = yearBE - 543;
  const cutMonth = Number(MERGE_CUTOFF.slice(5, 7)), cutYear = Number(MERGE_CUTOFF.slice(0, 4));
  // เดือน merged ของปีนี้: ถ้าปี < ปี cutoff → ไม่มี · ถ้า = ปี cutoff → ตั้งแต่ cutMonth · ถ้า > → ทั้งปี
  let fromMonth;
  if (yearCE < cutYear) return {};
  else if (yearCE === cutYear) fromMonth = cutMonth;
  else fromMonth = 1;
  const from = `${yearCE}-${String(fromMonth).padStart(2, '0')}-01`;
  const to = `${yearCE}-12-31`;
  try {
    const [oR, ovR, dR] = await Promise.all([
      cachedFetchRange('tmk_mp_orders', 'order_no,sales,status,order_date,channel,source', from, to, 'order_date'),
      cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
      supabase.from('tmk_daily_sales').select('date,channels,deleted_at').gte('date', from).lte('date', to),
    ]);
    if (oR.error) return {};
    /* ต้อง merge override เหมือน fetchMergedMonth — ไม่งั้นยอดที่แก้ในเว็บ (sales/channel/order_date)
       จะโผล่เฉพาะการ์ดหลัก แต่กราฟปีต่อปี/ไตรมาสยังเป็นยอดดิบจาก import = เลข 2 ชุดในหน้าเดียวกัน */
    const ovMap = {}; if (ovR && !ovR.error) (ovR.data || []).forEach(x => { ovMap[x.order_id] = x; });
    /* ⚠️ ต้องกรองช่วงซ้ำ "หลัง merge" เหมือน fetchMergedMonth
       override ย้ายวันที่ได้ → ใบที่วันดิบอยู่ในช่วง แต่วันใหม่หลุดออกนอกช่วง ต้องไม่ถูกนับ
       ไม่งั้นใบที่ถูกย้ายไป ก.ค. (ก่อน cutoff) จะสร้าง by[7] ขึ้นมา แล้ว act() เลือกค่านั้น
       แทนยอดคลัง tmk_monthly_history ของ ก.ค. (~฿700k) = กราฟปีต่อปียุบทันที */
    const orders = mergeOrderOverrides(oR.data || [], ovMap)
      .filter(o => String(o.status || '').toLowerCase() !== 'cancelled')
      .filter(o => { const d = String(o.order_date || '').slice(0, 10); return d >= from && d <= to; });
    const by = {};
    orders.forEach(o => {
      const d = String(o.order_date || '');
      /* ไม่ต้องเทียบปีซ้ำ: from/to ถูกผูกกับ yearCE อยู่แล้ว (`${yearCE}-..-01` ถึง `${yearCE}-12-31`)
         และ .filter ด้านบนกรองด้วยวัน "หลัง merge" ไปแล้ว → ใบที่ override ย้ายข้ามปีตกไปตั้งแต่ตรงนั้น
         (เคยใส่ไว้แล้ว mutation test พิสูจน์ว่าเป็นโค้ดตาย — เอาออกดีกว่าเก็บไว้ให้เข้าใจผิดว่ามีด่านสองชั้น) */
      const mo = Number(d.slice(5, 7)) || 0;
      if (mo < 1) return;
      by[mo] = (by[mo] || 0) + (Number(o.sales) || 0);
    });
    // ยอด mp ที่กรอกมือ — คิดรายวันด้วยกติกาเดียวกับรายงานขาย แล้วรวมเข้าเดือน
    const dailyRows = (dR && !dR.error) ? (dR.data || []).filter(d => !d.deleted_at) : [];
    if (dailyRows.length) {
      const { byDate } = mpExtraRevenue(orders, manualEntryAgg(dailyRows).mpRevByDate);
      Object.entries(byDate).forEach(([iso, v]) => {
        const mo = Number(String(iso).slice(5, 7)) || 0;
        if (mo < 1 || !(v > 0)) return;
        by[mo] = (by[mo] || 0) + v;
      });
    }
    return by;
  } catch { return {}; }
}
