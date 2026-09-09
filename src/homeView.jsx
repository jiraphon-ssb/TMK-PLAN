/* ============================================================
   homeView.jsx — หน้าแรก (รื้อใหม่ PART 122)
   ============================================================
   เดิมอยู่ใน views-1.jsx และมีตัวเลขเงินแค่ "เมื่อวาน" · ไม่มีเป้าเดือน ไม่มียอดวันนี้
   ตอนนี้: ยอดวันนี้ (ใหญ่) + เกจเป้าเดือน → ต้องทำวันนี้ → อันดับเซลล์ → ทีม/แคมเปญ

   กติกาเลข (สำคัญ — กันหน้าแรก ≠ รายงานขาย):
   - ยอด/ออเดอร์ "ทั้งบริษัท"  → fetchMergedMonth (channelTable) = สูตรเดียวกับรายงานขาย
     (รวมยอดมาร์เก็ตเพลสที่กรอกมือด้วย · ผลรวม buildPerf รายคนไม่มีส่วนนี้)
   - ยอด "รายคน" (อันดับเซลล์ · คนทัก · %ปิด) → buildPerf = สูตรเดียวกับประสิทธิภาพเซล
   - เกจเป้าเดือน → useMonthTarget + TargetGauge ตัวเดียวกับรายงานขาย (ไม่เขียนเกจใหม่)
   ============================================================ */
import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { TMK } from './data.js';
import { B, N, P, Icon, Avatar } from './components.jsx';
import { useUser } from './userContext.jsx';
import { getToday, THAI_MONTHS_FULL, todayISO } from './lib/dateUtils.js';
import { useMonthTarget } from './lib/monthTarget.js';
import { fetchMergedMonth, isMergedMonth } from './lib/mergedMonth.js';
// ใบสั่งผลิต/สต็อก ใช้เฉพาะใน effect หลังหน้าขึ้นแล้ว → import แบบ dynamic ไม่ให้ติดมากับ first paint
import { buildPerf, curMonth, daysInMonth } from './lib/salePerfAgg.js';
import { prevMonthOf } from './lib/salePerfView.js';
import { DEFAULT_CUTOFF_DAY, normCutoffDay, currentCycleEndMonth } from './lib/commissionCycle.js';
import { fetchTargets, fetchTargetsResult } from './lib/targets.js';
import { cachedFetchRange, cachedFetchAll, ORDERS_SEL, SKUS_SEL, OVERRIDES_SEL, FUNNEL_SEL, strayOverrideOrderNos, fetchOrdersByNos, dedupeOrders } from './lib/saleData.js';
import { mergeOrderOverrides } from './lib/saleOverrides.js';
import { supabase } from './lib/supabaseClient.js';
import { useSaleLiveReload } from './lib/useSaleLive.js';
import {
  dailySeries, todayPulse, sellerRank, buildTodos, missingFunnelYesterday, countNoSeller, homeMoneyVisibility,
} from './lib/homeAgg.js';
import { TeamTodayCard, CampaignsCard } from './views-1.jsx';
import { visibleFlows } from './flowsShared.js';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast, openModal, isAdmin as busIsAdmin, lockedSections } from './lib/appBus.js';

// recharts อยู่ในไฟล์แยก โหลดหลัง first paint (กติกา PART 95 — หน้าแรกห้ามลาก recharts)
const HomeGauge = lazy(() => import('./homeCharts.jsx').then(m => ({ default: m.HomeGauge })));
const HomeSpark = lazy(() => import('./homeCharts.jsx').then(m => ({ default: m.HomeSpark })));

const D = TMK;
const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const LEVEL_COLOR = { bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--info)' };

// ป้ายออนไลน์ต้องขยับตามจริง — เดิมอ่าน navigator.onLine ตอน render อย่างเดียว เน็ตหลุดแล้วยังเขียว
/* แท็บที่เปิดค้างข้ามเที่ยงคืน/ข้ามเดือน: todayISO()/curMonth() ขยับแล้ว แต่ไม่มีอะไร trigger re-render
   → ยอดวันนี้ค้างเป็น ฿0 และคอลัมน์ "วันนี้" ในอันดับเซลล์เป็นเลขของวันที่ 1 เดือนก่อน
   เช็คทุก 60 วิ + ตอนกลับมาที่แท็บ ถ้าวันเปลี่ยนค่อยบังคับ re-render (ถูกกว่า setInterval รายวินาที) */
function useDayTick() {
  const [day, setDay] = useState(() => todayISO());
  useEffect(() => {
    const check = () => setDay(d => (todayISO() !== d ? todayISO() : d));
    const id = setInterval(check, 60000);
    document.addEventListener('visibilitychange', check);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', check); };
  }, []);
  return day;
}

function useOnline() {
  const [on, setOn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const yesterdayISO = () => { const y = new Date(); y.setDate(y.getDate() - 1); return isoOf(y); };

/* เดือนที่ "รอบค่าคอม" จะไปจบ — อ่านวันตัดรอบจาก settings แบบไม่ล้มทุกกรณี
   คืน null เมื่ออ่านไม่ได้เลย = ไม่รู้ ก็ไม่เตือน (ดีกว่าเตือนมั่ว) */
async function cycleEndMonthSafe(fallbackYm) {
  try {
    const r = await supabase.from('tmk_settings').select('commission_cutoff_day').eq('id', 'main').maybeSingle();
    const day = (!r?.error && r?.data?.commission_cutoff_day != null)
      ? normCutoffDay(r.data.commission_cutoff_day) : DEFAULT_CUTOFF_DAY;
    return currentCycleEndMonth(todayISO(), day);
  } catch {
    // คอลัมน์ยังไม่ migrate / maybeSingle ไม่มี / เน็ตพลาด → ใช้วันตัด default ยังดีกว่าไม่เตือนเลย
    try { return currentCycleEndMonth(todayISO(), DEFAULT_CUTOFF_DAY); } catch { return fallbackYm; }
  }
}

/* ---------- โหลดข้อมูลเงินของหน้าแรก (เดือนปัจจุบัน) ---------- */
function useHomeMoney(ym) {
  const [st, setSt] = useState(null);
  /* กันคำตอบเก่าทับคำตอบใหม่: realtime ยิง reload ซ้อนกันได้ และแต่ละรอบใช้เวลาไม่เท่ากัน
     ถ้ารอบเก่าตอบทีหลัง มันจะเขียนทับยอดล่าสุดเงียบ ๆ → นับ seq แล้วยอมรับเฉพาะรอบล่าสุด
     (unmount ก็ใช้ตัวเดียวกัน — เพิ่ม seq ทิ้งไว้ ทุกคำตอบที่ค้างอยู่จะถูกเมิน) */
  const seqRef = useRef(0);
  useEffect(() => () => { seqRef.current += 1; }, []);
  const load = useCallback(async (force = false) => {
    const mySeq = seqRef.current + 1;
    seqRef.current = mySeq;
    const fresh = () => seqRef.current === mySeq;
    const from = `${ym}-01`, to = `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`;
    const yIso = yesterdayISO();
    const pm = prevMonthOf(ym);
    // ทุกวันที่ 1 ของเดือน "เมื่อวาน" กับ "เฉลี่ย 7 วัน" อยู่เดือนก่อน → ต้องดึงคร่อมขอบเดือน
    // (ช่วงต้นเดือนเท่านั้น · หลังวันที่ 8 ไม่ต้องดึงเดือนก่อนอีก)
    const needPrev = Number(todayISO().slice(8, 10)) <= 8;
    const funnelFrom = yIso < from ? yIso : from;      // ครอบคลุมเมื่อวานเสมอ แม้ข้ามเดือน
    try {
      const [oR, skR, fR, rcR, tg, ovR, mm, mmPrev, tgPrev] = await Promise.all([
        cachedFetchRange('tmk_mp_orders', ORDERS_SEL, from, to, 'order_date', force),
        cachedFetchRange('tmk_mp_skus', SKUS_SEL, from, to, 'order_date', force),
        supabase.from('tmk_sales_funnel').select(FUNNEL_SEL).gte('date', funnelFrom).lte('date', to),
        supabase.from('tmk_sale_receipts').select('order_no,salesperson,sales,status').eq('order_month', ym),
        fetchTargetsResult(ym),
        cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
        fetchMergedMonth(ym),
        needPrev ? fetchMergedMonth(pm) : Promise.resolve(null),
        yIso < from ? fetchTargets(pm) : Promise.resolve(null),   // เมื่อวานอยู่เดือนก่อน → ใช้เป้าของเดือนนั้นตัดสิน
      ]);
      /* รอบค่าคอม 26→25: ตั้งแต่วันที่ 26 รอบที่กำลังเดินจะไปจบ "เดือนหน้า"
         และป๊อปอัพค่าคอมใช้เป้าของเดือนที่จบรอบ → ถ้าเดือนนั้นยังไม่มีเป้า คอมเป็น 0 ทั้งกระดาน
         จึงต้องเช็คเป้าของเดือนนั้นด้วย ไม่ใช่แค่เดือนปฏิทินปัจจุบัน
         ⚠️ ทั้งสอง query นี้เป็น "ของเสริม" — ห้ามอยู่ใน Promise.all ก้อนบน
            ถ้ามันพลาด (คอลัมน์ยังไม่ migrate / RLS) ต้องไม่ลากยอดขายทั้งหน้าตกไปด้วย */
      const cycleYm = await cycleEndMonthSafe(ym);
      const cycleTg = cycleYm && cycleYm !== ym ? await fetchTargetsResult(cycleYm).catch(() => null) : null;
      const ovMap = {}; if (ovR && !ovR.error) (ovR.data || []).forEach(x => { ovMap[x.order_id] = x; });
      /* override ที่ "ย้ายวันที่": ดึงใบที่วันที่ใหม่อยู่ในเดือนนี้แต่วันที่ดิบไม่อยู่ (ไม่งั้นยอดหาย)
         + กรองซ้ำด้วยวันที่หลัง merge (ไม่งั้นใบที่ถูกย้ายออกไปเดือนอื่นจะลงผิดวันในกราฟ/รายวัน) */
      const base = oR.data || [];
      const strayNos = strayOverrideOrderNos(ovMap, from, to, base);
      const strays = strayNos.length ? await fetchOrdersByNos('tmk_mp_orders', ORDERS_SEL, strayNos) : [];
      const orders = mergeOrderOverrides(dedupeOrders([...base, ...strays]), ovMap)
        .filter(o => { const d = String(o.order_date || '').slice(0, 10); return !d || (d >= from && d <= to); });
      const tmap = {}; (tg?.rows || []).forEach(t => { tmap[t.salesperson] = t; });
      const tmapY = tgPrev ? Object.fromEntries(tgPrev.map(t => [t.salesperson, t])) : tmap;
      const funnelOk = !!fR && !fR.error;
      const funnel = funnelOk ? (fR.data || []) : [];
      if (!fresh()) return;
      setSt({
        perf: buildPerf(ym, orders, skR.data || [], funnel.filter(f => String(f.date || '') >= from), (rcR && !rcR.error) ? (rcR.data || []) : [], tmap, []),
        mm, mmPrev, ym, pm, orders, funnel, targets: tmap, targetsForYesterday: tmapY,
        /* อ่านยอดไม่ได้ ≠ ขายไม่ได้ — fetchMergedMonth คืน null เมื่ออ่านไม่สำเร็จ (คอมเมนต์ในไฟล์นั้นเขียนไว้เอง)
           ถ้าไม่แยกไว้ หน้าแรกจะโชว์ "฿0 · ออเดอร์ 0" เป็นข้อเท็จจริง ทั้งที่ยอดอยู่ครบใน DB
           (เดือนก่อน cutoff คืน null โดยดีไซน์ = ไม่ใช่ error) */
        /* ต้องดู oR.error ด้วย — cachedFetchRange คืน { error } โดยไม่ทิ้ง cache เดิม
           ถ้าออเดอร์อ่านไม่ได้แต่ fetchMergedMonth คืนค่าจาก cache (TTL 5 นาที) จะได้ mm != null
           → เดิม moneyReadOk = true ทั้งที่ perf/อันดับเซลล์เป็น 0 ทั้งกระดาน = ไม่มีแถบเตือน */
        /* ยอดขาดของบางส่วนก็ต้องเตือน — mm != null แต่ manualOk/funnelOk = false
           แปลว่ายอดมาร์เก็ตเพลสที่กรอกมือ + ค่าแอด (หรือคนทัก) หายไปจากตัวเลขนี้ */
        moneyReadOk: !oR?.error && (!isMergedMonth(ym) || mm != null)
          && (mm ? (mm.manualOk !== false && mm.funnelOk !== false) : true)
          // เดือนก่อนก็ต้องครบ — ไม่งั้นชิป "เทียบเดือนก่อน" ผิดโดยไม่มีอะไรบอก
          && (mmPrev ? (mmPrev.manualOk !== false && mmPrev.funnelOk !== false) : true),
        targetsReadOk: !tg?.error,      // อ่านเป้าไม่ได้ ≠ ไม่มีเป้า — ห้ามเตือนให้ไปตั้งใหม่
        funnelReadOk: funnelOk,         // อ่านคนทักไม่ได้ ≠ ไม่มีใครกรอก — ห้ามฟ้องทั้งทีม
        cycleYm,
        noCycleTarget: cycleTg ? (!cycleTg.error && cycleTg.rows.length === 0) : false,
      });
    } catch {
      // รอบที่พังก็ต้องเช็ค fresh() เหมือนกัน — ไม่งั้นรอบเก่าที่ล้มเหลวและตอบช้า
      // จะไปล้างยอดที่รอบใหม่โหลดสำเร็จแล้ว (หน้ากลายเป็น ฿0 ทั้งที่ข้อมูลมา)
      if (!fresh()) return;
      setSt({ perf: null, mm: null, mmPrev: null, ym, pm, orders: [], funnel: [], targets: {}, targetsForYesterday: {}, moneyReadOk: false, targetsReadOk: false, funnelReadOk: false, noCycleTarget: false });
    }
  }, [ym]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลด async ตอน mount (แพทเทิร์นเดียวกับ salePerf/saleDashboard)
  useEffect(() => { load(); }, [load]);
  useSaleLiveReload(
    ['tmk_mp_orders', 'tmk_mp_skus', 'tmk_sales_funnel', 'tmk_sale_receipts', 'tmk_order_overrides', 'tmk_targets'],
    () => load(true),
    { invalidate: ['tmk_mp_orders', 'tmk_mp_skus', 'tmk_order_overrides'] },
  );
  return st;
}

/* ---------- แถบฮีโร่: ยอดวันนี้ ---------- */
function TodayCard({ money, go }) {
  const perf = money?.perf || null;

  // ยอด/ออเดอร์ = ยอดบริษัท (mergedMonth · รวมมาร์เก็ตเพลสกรอกมือ) · คนทัก = จาก buildPerf (มีเฉพาะรายคน)
  // ต่อเดือนก่อน+เดือนนี้เป็นเส้นเดียว → ทุกวันที่ 1 ยังเห็น "เมื่อวาน/เฉลี่ย 7 วัน" ของเดือนที่แล้ว
  const series = useMemo(() => {
    if (!money?.mm) return null;
    const leadsByIso = {};
    (perf?.rows || []).forEach(r => (r.daily || []).forEach(d => {
      if (!d.leads) return;
      const iso = `${money.ym}-${String(d.day).padStart(2, '0')}`;
      leadsByIso[iso] = (leadsByIso[iso] || 0) + d.leads;
    }));
    return dailySeries(money.mm, money.ym, money.mmPrev, money.pm, leadsByIso);
  }, [money, perf]);

  const pulse = series ? todayPulse(series, todayISO()) : null;
  const loading = !money;

  if (loading) return (
    <Card className="p-[22px]"><Skeleton className="h-8 w-40 mb-3" /><Skeleton className="h-14 w-64 mb-4" /><Skeleton className="h-10 w-full" /></Card>
  );

  const up = (pulse?.dAvg7 ?? 0) >= 0;
  /* อ่านยอดไม่สำเร็จ → ห้ามเรนเดอร์ ฿0 เป็นข้อเท็จจริง
     (salePerf/saleDashboard ขึ้นแถบเตือนทั้งคู่ · หน้าแรกเคยเงียบทั้งที่เป็นจอแรกหลังล็อกอิน) */
  const moneyErr = money.moneyReadOk === false;
  return (
    <Card className="p-[22px] flex flex-col">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-muted-foreground">ยอดวันนี้</span>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => go('catalog', 'report')}>รายงานขาย <Icon name="arrowR" className="ml-1 size-3" /></Button>
      </div>
      {moneyErr && (
        <div role="status" className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs"
          style={{ background: 'color-mix(in srgb, var(--bad) 10%, transparent)', color: 'var(--bad)' }}>
          <Icon name="alertTriangle" className="size-4 shrink-0 mt-px" />
          <span style={{ lineHeight: 1.6 }}>
            <b>อ่านยอดขายไม่สำเร็จ</b> — ตัวเลขบนหน้านี้ยังไม่ใช่ของจริง (ไม่ได้แปลว่าวันนี้ขายไม่ได้)
            <br />ลองรีเฟรชอีกครั้ง หรือเปิดหน้ารายงานขายเพื่อดูสาเหตุ
          </span>
        </div>
      )}
      <div className="flex items-end gap-3 flex-wrap">
        <span className="num" style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-1.5px', lineHeight: 1.05 }}
          title={moneyErr ? 'อ่านยอดไม่สำเร็จ — ยังไม่รู้ยอดวันนี้' : undefined}>
          {moneyErr ? '—' : B(pulse?.today || 0)}
        </span>
        {pulse?.dAvg7 != null && (
          /* mixedBasis = เฉลี่ย 7 วันมียอดมาร์เก็ตเพลสที่กรอกมือ แต่วันนี้ยังไม่ได้กรอก
             → เทียบคนละฐาน ต้องบอก ไม่ใช่โชว์ "−44%" เป็นข้อเท็จจริง */
          <span className="kpi-delta mb-1" style={{ color: pulse.mixedBasis ? 'var(--ink-4)' : (up ? 'var(--good)' : 'var(--bad)'), background: pulse.mixedBasis ? 'var(--surface-3)' : `color-mix(in srgb, ${up ? 'var(--good)' : 'var(--bad)'} 13%, transparent)`, fontSize: 12, padding: '3px 9px' }}
            title={pulse.mixedBasis ? 'เฉลี่ย 7 วันรวมยอดมาร์เก็ตเพลสที่กรอกมือ ซึ่งวันนี้ยังไม่ได้กรอก — ตัวเลขนี้ยังเทียบกันไม่ได้เต็มที่' : undefined}>
            <Icon name={pulse.mixedBasis ? 'alertTriangle' : (up ? 'up' : 'down')} size={12} /> {up ? '+' : ''}{pulse.dAvg7.toFixed(0)}% เทียบเฉลี่ย 7 วัน{pulse.mixedBasis ? ' · ยังไม่ครบฐาน' : ''}
          </span>
        )}
      </div>
      <div className="cap mt-1" style={{ color: 'var(--ink-4)' }}>
        เมื่อวาน {pulse?.yest != null ? B(pulse.yest) : '—'} · เฉลี่ย 7 วัน {pulse?.avg7 != null ? B(pulse.avg7) : '—'}
      </div>

      {/* สปาร์คไลน์รายวันของเดือนนี้ (ถึงวันนี้) */}
      {series && series.length > 1 && (
        <div className="mt-3" title={`ยอดรายวัน ${series.length} วันล่าสุดที่มีข้อมูล`}>
          <Suspense fallback={<div style={{ height: 40 }} />}>
            <HomeSpark data={series.slice(-30).map(d => d.sales)} />
          </Suspense>
        </div>
      )}

      {/* 3 ตัวเลขวันนี้ */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
        <Mini l="ออเดอร์วันนี้" v={N(pulse?.orders || 0)} />
        <Mini l="คนทักวันนี้" v={N(pulse?.leads || 0)} />
        <Mini l="%ปิดเดือนนี้" v={perf?.team?.closeRate != null ? P(perf.team.closeRate, 0) : '—'}
          tip="ออเดอร์ช่องแชททั้งเดือน ÷ คนทักทั้งเดือน (สโคปเดือน ไม่ใช่วันนี้)" />
      </div>
    </Card>
  );
}

function Mini({ l, v, tip }) {
  return (
    <div title={tip}>
      <div className="cap" style={{ color: 'var(--ink-4)' }}>{l}</div>
      <div className="num" style={{ fontSize: 20, fontWeight: 700, marginTop: 1 }}>{v}</div>
    </div>
  );
}

/* ---------- ต้องทำวันนี้ ---------- */
function TodoCard({ money, go, targetGap }) {
  const [po, setPo] = useState(null);
  const [outOfStock, setOutOfStock] = useState(0);

  useEffect(() => {
    let live = true;
    (async () => {
      const { fetchPurchaseOrders, isPoOpen, poSummary } = await import('./lib/productionOrders.js');
      const r = await fetchPurchaseOrders();
      if (!live || r.missing || r.error) return;
      const open = (r.rows || []).filter(isPoOpen);
      const today = todayISO();
      setPo({ open: open.length, late: open.filter(p => p.due_date && p.due_date < today).length, sum: poSummary(r.rows || []) });
    })();
    return () => { live = false; };
  }, []);

  // สต็อกหมด/ติดลบ — เลื่อนไปโหลดตอนว่าง (ต้องดึงยอดขายตั้งแต่วันนับล่าสุด = ก้อนใหญ่ ไม่ควรถ่วง first paint)
  useEffect(() => {
    let live = true;
    const run = async () => {
      const [{ fetchStockCounts }, { stockBalance }] = await Promise.all([import('./lib/stockData.js'), import('./lib/stockCount.js')]);
      const r = await fetchStockCounts();
      if (!live || r.missing || r.error || !(r.rows || []).length) return;
      const first = r.rows.map(c => String(c.count_date || '').slice(0, 10)).filter(Boolean).sort()[0];
      if (!first) return;
      const today = todayISO();
      const [skR, oR] = await Promise.all([
        cachedFetchRange('tmk_mp_skus', SKUS_SEL, first, today, 'order_date'),
        cachedFetchRange('tmk_mp_orders', 'order_no,source,status,order_date', first, today, 'order_date'),
      ]);
      if (!live) return;
      const cancelled = new Set((oR.data || []).filter(o => String(o.status || '').toLowerCase() === 'cancelled').map(o => `${o.source}::${o.order_no}`));
      const skus = (skR.data || []).filter(s => !cancelled.has(`${s.source}::${s.order_no}`));
      setOutOfStock(stockBalance(r.rows, skus).filter(x => x.balance <= 0).length);
    };
    const id = (typeof requestIdleCallback === 'function')
      ? requestIdleCallback(run, { timeout: 3000 })
      : setTimeout(run, 1200);
    const usedIdle = typeof requestIdleCallback === 'function';
    return () => {
      live = false;
      // ต้องยกเลิกด้วยฟังก์ชันคู่กับตอนตั้ง — เดิมถ้าเบราว์เซอร์มี requestIdleCallback แต่ไม่มี cancelIdleCallback
      // จะไปเรียก clearTimeout กับ handle ของ idle (คนละชนิด = ไม่ถูกยกเลิกจริง)
      if (usedIdle && typeof cancelIdleCallback === 'function') cancelIdleCallback(id);
      else if (!usedIdle) clearTimeout(id);
    };
  }, []);

  const today = todayISO();
  /* หน้าหลักล็อกไม่ได้ = เป็นจุดที่ชื่องานจากโครงการ "ส่วนตัว" ของคนอื่นหลุดออกมาง่ายที่สุด
     กรองด้วยรายการโครงการที่มองเห็นได้ (ตัด archived + private ของคนอื่น) เหมือน sidebar/บอร์ด */
  const visibleFlowIds = useMemo(() => new Set(visibleFlows().map(f => f.scopeId ?? f.id)), []);
  const myTasks = (D.tasks || []).filter(t => !t.flowId || visibleFlowIds.has(t.flowId));
  const dueTasks = myTasks.filter(t => t.status !== 'done' && t.dateISO && t.dateISO <= today);
  const todos = buildTodos({
    dueTasks, po, outOfStock,
    // เมื่อวานอาจอยู่เดือนก่อน → ใช้เป้าของเดือนนั้นตัดสินว่าใครต้องกรอก (ไม่งั้นทุกวันที่ 1 เตือนผิดทั้งทีม)
    // อ่านคนทักไม่สำเร็จ → ไม่ฟ้อง (เดิมฟ้อง "ยังไม่กรอก" ทั้งทีม แล้วหัวหน้าไปไล่บี้คนที่กรอกครบแล้ว)
    missingFunnel: money?.funnelReadOk ? missingFunnelYesterday(money.funnel, money.targetsForYesterday, yesterdayISO()) : [],
    noSeller: money ? countNoSeller(money.orders) : 0,
    targetGap,
    locked: lockedSections(),
  });
  const todayTasks = myTasks.filter(t => t.status === 'inprogress' || t.status === 'review' || t.dateISO === today);

  return (
    <Card className="p-[22px] flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0 p-0 pb-3.5">
        <CardTitle className="m-0 text-lg font-semibold flex items-center gap-2">
          <span style={{ color: 'var(--accent)' }}><Icon name="listChecks" /></span> ต้องทำวันนี้
          {todos.length > 0 && <span className="text-xs font-normal text-muted-foreground">({todos.length})</span>}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => go('flows', 'kanban')}>งานทั้งหมด <Icon name="arrowR" /></Button>
      </CardHeader>
      {todos.length > 0 ? (
        <div className="flex flex-col gap-2" style={{ marginBottom: todayTasks.length ? 16 : 0 }}>
          {todos.map(t => (
            <button key={t.key} type="button" onClick={() => go(t.go[0], t.go[1])}
              className="flex items-center gap-2.5 text-left rounded-[var(--r-sm)] px-2.5 py-2.5 hover:brightness-[1.03] transition"
              style={{ background: 'var(--surface-2)', borderLeft: `3px solid ${LEVEL_COLOR[t.level]}` }}>
              <span style={{ color: LEVEL_COLOR[t.level], flexShrink: 0 }}><Icon name={t.icon} size={15} /></span>
              <span className="flex-1 min-w-0">
                <span className="sm block font-semibold">{t.title}</span>
                {t.detail && <span className="cap block truncate mt-px" style={{ color: 'var(--ink-4)' }}>{t.detail}</span>}
              </span>
              <span style={{ flexShrink: 0, color: 'var(--ink-3)' }}><Icon name="arrowR" /></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="cap text-center" style={{ padding: '18px 0', color: 'var(--good)', fontWeight: 600 }}><Icon name="check" /> ไม่มีอะไรค้าง — เคลียร์หมดแล้ว</div>
      )}

      {todayTasks.length > 0 && (<>
        <div className="text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wide">งานวันนี้ <span className="opacity-70">({todayTasks.length})</span></div>
        <div className="flex flex-col divide-y divide-border/50">
          {todayTasks.slice(0, 5).map(t => {
            const st = { todo: { l: 'รอทำ', c: 'var(--ink-3)' }, inprogress: { l: 'กำลังทำ', c: 'var(--info)' }, review: { l: 'รอตรวจ', c: 'var(--warn)' }, done: { l: 'เสร็จ', c: 'var(--good)' } }[t.status] || { l: '—', c: 'var(--ink-3)' };
            const names = Array.isArray(t.responsible) ? t.responsible : String(t.responsible || '').split(',').map(s => s.trim()).filter(Boolean);
            const assignees = names.map(n => {
              const s = (D.staff || []).find(x => x.name === n); const du = (D.duties || []).find(x => x.name === n);
              return { name: n, color: s?.color || du?.color || 'var(--ink-3)' };
            });
            return (
              <div key={t.id} onClick={() => openModal('task', { ...t, channel: Array.isArray(t.channel) ? t.channel : [t.channel] })}
                className="flex items-center gap-3 px-2 py-2.5 -mx-1 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors">
                <span className="size-2 rounded-full shrink-0" style={{ background: st.c }} />
                <span className="text-sm font-medium flex-1 truncate">{t.title}</span>
                {assignees.length > 0 && (
                  <div className="flex -space-x-1.5 shrink-0" title={assignees.map(a => a.name).join(', ')}>
                    {assignees.slice(0, 2).map((a, i) => <span key={i} className="inline-flex rounded-full ring-2 ring-card"><Avatar name={a.name} color={a.color} size={22} /></span>)}
                    {assignees.length > 2 && <span className="inline-flex items-center justify-center size-[22px] rounded-full ring-2 ring-card bg-muted text-[10px] font-semibold text-muted-foreground">+{assignees.length - 2}</span>}
                  </div>
                )}
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: st.c + '1a', color: st.c }}>{st.l}</span>
              </div>
            );
          })}
        </div>
      </>)}
    </Card>
  );
}

/* ---------- อันดับเซลล์เดือนนี้ ---------- */
function SellerBoard({ money, go }) {
  const td = getToday();
  const rows = money?.perf ? sellerRank(money.perf.rows, 6, td.day) : null;
  const max = rows?.length ? Math.max(...rows.map(r => r.sales)) : 0;
  /* ยอดรายคน = "ภาพรวมทีม" → เห็นได้ทุก role (แนวเดียวกับภาพรวม CRM และ popup วันในประสิทธิภาพเซลล์)
     แต่ **%เป้า ผูกกับเป้า/คอมรายบุคคล** ซึ่งหน้าประสิทธิภาพเซลล์กันไว้ให้แอดมินเท่านั้นอยู่แล้ว
     (canSeeTeamBoard) — ถ้าหน้าแรกโชว์ให้ทุกคน ก็เท่ากับด่านนั้นไม่มีความหมาย
     ตรงกับที่ user เคยบอก: "ภาพรวมทีมได้ แต่ไม่เอาให้เห็นค่าคอมคนอื่น" */
  const showTargetPct = busIsAdmin();

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center text-base font-semibold">
          <Icon name="flame" className="mr-2 h-4 w-4 text-primary" /> อันดับเซลล์เดือนนี้
        </CardTitle>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => go('catalog', 'perf')}>ประสิทธิภาพเซล <Icon name="arrowR" className="ml-2 h-3 w-3" /></Button>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2.5">
        {!rows ? <><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></>
          : rows.length === 0 ? <div className="text-center text-sm text-muted-foreground py-6">ยังไม่มียอดของเดือนนี้</div>
            : rows.map((r, i) => {
              const tone = r.pctTarget == null ? 'var(--ink-3)' : r.pctTarget >= 100 ? 'var(--good)' : r.pace === 'ontrack' ? 'var(--warn)' : 'var(--bad)';
              return (
                <button key={r.name} type="button" onClick={() => go('catalog', 'perf')}
                  className="text-left rounded-lg px-2 py-1.5 -mx-1 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="num text-xs font-bold w-4 shrink-0" style={{ color: i === 0 ? 'var(--accent)' : 'var(--ink-4)' }}>{i + 1}</span>
                    <Avatar name={r.name} size={24} />
                    <span className="text-sm font-semibold flex-1 truncate">{r.name}</span>
                    <span className="num text-sm font-bold shrink-0">{B(r.sales)}</span>
                    {showTargetPct && r.pctTarget != null && <span className="num text-[11px] font-bold px-1.5 py-0.5 rounded-md shrink-0" style={{ background: tone + '1a', color: tone }}>{Math.round(r.pctTarget)}%</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
                      <span className="block h-full rounded-full" style={{ width: `${max > 0 ? (r.sales / max) * 100 : 0}%`, background: tone === 'var(--ink-3)' ? 'var(--accent)' : tone }} />
                    </span>
                    <span className="cap shrink-0 num" style={{ color: 'var(--ink-4)' }}>วันนี้ {B(r.today)}</span>
                  </div>
                </button>
              );
            })}
      </CardContent>
    </Card>
  );
}

/* ============================================================
   HomeView
   ============================================================ */
export function HomeView({ go }) {
  const { user } = useUser() || {};
  const userName = user?.name || 'มัง';
  const ym = curMonth();
  const money = useHomeMoney(ym);
  const mt = useMonthTarget(ym);
  /* หน้าหลักล็อกไม่ได้ แต่ของบนหน้าต้องเคารพ "ล็อกหน้า" รายคน
     ไม่งั้นล็อก catalog:report / catalog:perf ให้ใครไว้ ก็ยังเห็นยอดบริษัทและ %เป้าของเพื่อนที่หน้าแรก */
  const vis = homeMoneyVisibility(lockedSections());
  const online = useOnline();
  useDayTick();   // ข้ามเที่ยงคืนแล้วหน้าต้องขยับเอง (ym/todayISO คำนวณตอน render)

  /* ขึ้นเดือนใหม่ = เป้าทุกชนิดเริ่มจากศูนย์ (เก็บเป็นแถวรายเดือน ไม่มีการสืบทอด)
     เตือนเฉพาะแอดมิน + เฉพาะตอนที่โหลดข้อมูลเสร็จแล้วจริง ๆ (กันเตือนวูบตอนกำลังโหลด) */
  const moLabel = (y) => `${THAI_MONTHS_FULL[Number(y.slice(5, 7)) - 1]} ${Number(y.slice(0, 4)) + 543}`;
  const targetGap = (mt && money && money.targetsReadOk && mt.targetReadOk !== false) ? {
    isAdmin: busIsAdmin(),
    month: moLabel(ym),
    noMonthTarget: !(Number(mt.target) > 0),
    noPeopleTarget: Object.keys(money.targets || {}).length === 0,
    cycleMonth: money.cycleYm ? moLabel(money.cycleYm) : '',
    noCycleTarget: !!money.noCycleTarget,
  } : null;

  const copyDigest = () => {
    /* ใช้ชุดเดียวกับการ์ด (dailySeries ต่อเดือนก่อน+เดือนนี้) — เดิมหาเมื่อวานจาก mm.days ของเดือนปัจจุบัน
       ทำให้ทุกวันที่ 1 ข้อความที่คัดลอกไม่มีเมื่อวาน ขณะที่การ์ดข้างบนโชว์ยอดวันสุดท้ายของเดือนก่อนอยู่ */
    const series = money?.mm ? dailySeries(money.mm, money.ym, money.mmPrev, money.pm) : [];
    const pulseNow = series.length ? todayPulse(series, todayISO()) : null;
    const txt = `สรุปยอด TMK — วันนี้ ${B(pulseNow?.today || 0)}`
      + (pulseNow?.yest != null ? ` · เมื่อวาน ${B(pulseNow.yest)}` : '')
      + (mt?.target ? ` · เดือนนี้ ${B(mt.sales)} / เป้า ${B(mt.target)} (${Math.round(mt.sales / mt.target * 100)}%)` : '');
    // writeText คืน Promise — try/catch จับ rejection ไม่ได้ (permission ถูกปฏิเสธ/เอกสารไม่ได้ focus)
    // เดิมขึ้น "คัดลอกแล้ว" ทั้งที่ล้มเหลว + unhandled rejection
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(txt))
      .then(() => toast('คัดลอกสรุปแล้ว — แปะส่งไลน์ได้เลย', 'success'))
      .catch(() => toast('คัดลอกไม่สำเร็จ — กดค้างเพื่อคัดลอกเองได้', 'error'));
  };

  return (
    <div className="content-inner rise">
      {/* greeting */}
      <div className="row between wrap" style={{ marginBottom: 18, gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>
            {(() => { const td = getToday(); return `${THAI_WEEKDAYS[new Date().getDay()]} ${td.day} ${THAI_MONTHS_FULL[td.month - 1]} ${td.yearBE}`; })()}
          </div>
          <h1 className="display">
            {(() => { const h = new Date().getHours(); return h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : h < 21 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนดึก'; })()}, {userName}
          </h1>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {money?.mm && <Button variant="outline" size="sm" onClick={copyDigest} title="คัดลอกสรุปยอด — แปะส่งไลน์ได้เลย">คัดลอกสรุป</Button>}
          <Badge variant={online ? 'success' : 'warning'}>
            <span className="dot-c" style={{ background: online ? 'var(--good)' : 'var(--warn)' }}></span> {online ? 'ออนไลน์' : 'ออฟไลน์'}
          </Badge>
        </div>
      </div>

      {/* แถวเงิน: ยอดวันนี้ | เกจเป้าเดือน — ซ่อนถ้าถูกล็อกหน้ารายงานขาย */}
      {vis.showCompanyMoney && (
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)' }}>
        <TodayCard money={money} go={go} />
        <Card className="p-[22px]">
          {mt
            ? <Suspense fallback={<><Skeleton className="h-5 w-32 mb-3" /><Skeleton className="h-[150px] w-full" /></>}><HomeGauge mt={mt} /></Suspense>
            : <><Skeleton className="h-5 w-32 mb-3" /><Skeleton className="h-[150px] w-full" /></>}
        </Card>
      </div>
      )}

      {/* ต้องทำวันนี้ | อันดับเซลล์ (อันดับเซลล์มี %เป้ารายคน → ซ่อนถ้าถูกล็อกหน้าประสิทธิภาพเซล) */}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: vis.showSellerBoard ? 'minmax(0,1.35fr) minmax(0,1fr)' : '1fr', marginTop: 16 }}>
        <TodoCard money={money} go={go} targetGap={targetGap} />
        {vis.showSellerBoard && <SellerBoard money={money} go={go} />}
      </div>

      {/* ทีมวันนี้ | แคมเปญ — ย่อลงมาแถวล่าง */}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', marginTop: 16 }}>
        <TeamTodayCard go={go} />
        <CampaignsCard go={go} />
      </div>
    </div>
  );
}
