/* ============================================================
   monthTarget.js — hook เป้าเดือน (ยอดจริง + เป้า + งบแอด) สำหรับเกจ/การ์ดเป้า
   ============================================================
   แยกออกจาก saleDashboardMerged.jsx (PART 122) เพราะไฟล์นั้น import charts.jsx → recharts
   หน้าแรกต้องใช้ hook นี้ แต่ห้ามลาก recharts เข้า first paint (กติกา PART 95)
   ที่นี่มีแต่ data — ตัวเกจ (TargetGauge) ยังอยู่ที่ saleDashboardMerged เหมือนเดิม
   ============================================================ */
import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient.js';
import { fetchMergedMonth } from './mergedMonth.js';
import { useSaleRealtime } from './saleRealtime.js';

const MO_AB = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function useMonthTarget(ym) {
  const [st, setSt] = useState(null);
  const [bump, setBump] = useState(0);
  // เป้าเดือนแก้ที่หน้าตั้งค่า (tmk_monthly_history) → เกจ/การ์ดเป้าที่เปิดค้างต้องขยับเอง
  // ไม่ invalidate cache ยอดขาย (คนละเรื่องกัน) — แค่ refetch แถวเป้า
  useSaleRealtime(['tmk_monthly_history'], () => setBump(b => b + 1));
  useEffect(() => {
    /* เดิมผูกทั้ง visibilitychange และ focus เข้าตัวเดียวกัน → กลับมาที่แท็บ browser ยิงทั้งคู่
       = bump +2 = query tmk_monthly_history + fetchMergedMonth ซ้ำ 2 รอบทุกครั้ง
       ใช้ visibilitychange อย่างเดียวพอ (ครอบทั้งสลับแท็บและสลับหน้าต่าง) */
    const onVis = () => { if (document.visibilityState === 'visible') setBump(b => b + 1); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); };
  }, []);
  useEffect(() => {
    if (!ym) return;
    let live = true;
    (async () => {
      try {
        const [y, m] = ym.split('-').map(Number);
        const [{ data: rows, error: rowsErr }, mm] = await Promise.all([
          supabase.from('tmk_monthly_history').select('target,meta')
            .eq('month', m).eq('year', y + 543).order('updated_at', { ascending: false }).limit(1),
          fetchMergedMonth(ym),
        ]);
        if (!live) return;
        const row = rows && rows[0];
        const meta = (row && row.meta) || {};
        const chSales = {}, chAd = {}; (mm?.channels || []).forEach(c => { chSales[c.ch] = c.sales; chAd[c.ch] = c.ad || 0; });
        const now = new Date();
        const isCur = ym === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const dim = new Date(y, m, 0).getDate();
        const passed = isCur ? Math.min(now.getDate(), dim) : dim;
        const sales = mm?.sales || 0;
        setSt({
          ym, has: !!mm, isCur, dim, passed,
          // อ่านแถวเป้าไม่สำเร็จ ≠ ยังไม่ได้ตั้งเป้า — หน้าแรกต้องไม่ชวนให้ไป "คัดลอกจากเดือนก่อน" ทับของจริง
          targetReadOk: !rowsErr,
          target: Number(row?.target) || 0,
          chT: meta.channelTargetsV2 || {},
          chAdBudget: meta.adChannelsV2 || {},
          chAd,
          adBudget: Object.values(meta.adChannelsV2 || {}).reduce((a, v) => a + (Number(v) || 0), 0),
          sales, orders: mm?.orders || 0, chSales, ad: mm?.ad || 0,
          projected: isCur && passed > 0 ? sales / passed * dim : sales,
          label: `${MO_AB[m - 1]} ${y + 543}`,
        });
      } catch { if (live) setSt({ ym, has: false, targetReadOk: false, target: 0, chT: {}, chAdBudget: {}, chAd: {}, adBudget: 0, sales: 0, chSales: {}, ad: 0, projected: 0, isCur: false, dim: 30, passed: 0, label: ym }); }
    })();
    return () => { live = false; };
  }, [ym, bump]);
  return st && st.ym === ym ? st : null;
}
