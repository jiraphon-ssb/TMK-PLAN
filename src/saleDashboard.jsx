/* ============================================================
   saleDashboard.jsx — แดชบอร์ดยอดขายเต็มระบบ (หน้า Sale)
   P1: time picker + global filter + 12 KPI + เทรนด์(S1) + ลาย(S3) + drill
   ข้อมูล: fetch ครั้งเดียว → aggregate ฝั่ง client (saleAgg/saleTime)
   ============================================================ */
import { useState, useEffect, useMemo, Suspense } from 'react';
import { lazyRetry } from './lib/lazyRetry.js';
import { N, Icon, useDelayedFlag, SourceBadge, CelebrationOverlay } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { MpImportModal } from './modals-import.jsx';
import { CountUp, GradientSparkline, channelColor, CumulativeCompare } from './charts.jsx';
import { channelTint } from './lib/channelLogos.jsx';
import { compute, series, deltaKpi, sizeRank, normColor } from './lib/saleAgg.js';
import { useRenderCount } from './realtime/useRenderCount.js';
import { bucketKey, bucketLabel, enumerateBuckets, autoGran, presetRange, PRESETS, prevPeriod, prevCalendarMonth, isFullCalendarMonth, diffDays } from './lib/saleTime.js';
import { todayISO } from './lib/dateUtils.js';
import { isAdmin as busIsAdmin, toast as busToast, goSection } from './lib/appBus.js';
import { createPortal } from 'react-dom';
import { QuickFab } from './saleWidgets.jsx';
import { CATALOG_TYPES } from './lib/catalogMeta.js';
import { normalizeProvince } from './lib/provinces.js';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { CustomerDrawer, custFromOrders } from './customerDrawer.jsx';
import { supabase } from './lib/supabaseClient.js';
import { cachedFetchAll, cachedFetchRange, getDateBounds, clearSaleCache, ORDERS_SEL, SKUS_SEL, OVERRIDES_SEL, FUNNEL_SEL, strayOverrideOrderNos, fetchOrdersByNos, dedupeOrders } from './lib/saleData.js';
import { funnelCloseStats } from './lib/funnelClose.js';
// PART 97: ข้อมูลใหม่เข้ารายงานขาย — CRM (โทร/LINE + บันทึกประจำวัน + เป้า) + สถานะส่งยอด
import { fetchCrmTargets } from './lib/crmTargets.js';
// PART 103: ส่วนที่ย้ายมาจากหน้ายอดขายเดิม (ตารางช่องทางรวม / แท็บโฆษณา / เติมแท็บลูกค้า)
import { MergedChannelTable, AdsTab, NotesStrip, LongTermSection, useMonthTarget, TargetGauge, ChannelTargetGrid } from './saleDashboardMerged.jsx';
const SalesDailyEntry = lazyRetry(() => import('./salesDailyEntry.jsx').then(m => ({ default: m.SalesDailyEntry })), 'salesDailyEntry'); // popup กรอกค่าแอด (ย้ายมาจากหน้าบันทึก — คำสั่ง user 21 ส.ค.)
import { channelTable, customerInsight, manualEntryAgg, crmTeamOf, mergeBounds, MERGE_CUTOFF } from './lib/salesOverviewAgg.js';
import { mergeOrderOverrides, resolveSkuDesigns } from './lib/saleOverrides.js';
import { DIM_FIELDS, emptyF, activeFilterCount, loadF, saveF, baht, thisMonthRange, fmtTh } from './lib/saleDashboardHelpers.js';
import { useSaleLiveReload } from './lib/useSaleLive.js';
import { pgErrorText } from './lib/pgError.js';
import { T } from './lib/tables.js';
// แถบควบคุม/หัวข้อ/skeleton + เนื้อแท็บ + แผงพื้นที่ + ลีดเดอร์บอร์ด + popup → แยกเป็นไฟล์ย่อย (โครง JSX เดิมทั้งดุ้น)
import { MultiSelect, DateRangePicker, SectionHead, DashboardSkeleton, KpiCard } from './saleDashboardChrome.jsx';
import { OverviewTab, ProductsBlock, VariantTab, CustomerTab, FunnelTab, DailyPaymentTable } from './saleDashboardTabs.jsx';
import { GeoPanel } from './saleDashboardGeo.jsx';
import { DrillModal, DashDayDetail } from './saleDashboardModals.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

import { deltaPct, deltaPoint } from './lib/deltaChip.js';
// ตัวกรอง/ค่าเริ่มต้น/persist + format วันที่+เงิน + ค่าคงที่สี → ย้ายไป ./lib/saleDashboardHelpers.js

export function SaleDashboard() {
  useRenderCount('saleDashboard'); // Phase 0 baseline (dev-only)
  const [orders, setOrders] = useState(null);
  const [readErr, setReadErr] = useState([]);   // ตารางที่อ่านไม่สำเร็จ — ต้องบอก ไม่ใช่โชว์ว่าง
  const [skus, setSkus] = useState([]);
  const [err, setErr] = useState('');
  const [, setLoadedAt] = useState('');
  const [f, setF] = useState(loadF);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compare] = useState(true); // เทียบช่วงก่อน (เดือนที่แล้ว) เปิดถาวร — ไม่มี toggle
  const [tab, setTab] = useState('overview');
  const [drill, setDrill] = useState(null);
  const [custDetail, setCustDetail] = useState(null);
  const [dayPay, setDayPay] = useState(null); // วันที่ (ISO) — คลิกแถวตารางโอน/COD → popup ออเดอร์ทั้งวัน (PART 88)
  const [importOpen, setImportOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [funnel, setFunnel] = useState([]);   // คนทักของหน้าต่างเวลาที่ดูอยู่ (ช่วงนี้+ช่วงก่อน) — ไม่ใช่ทั้งตาราง
  const [aliases, setAliases] = useState([]);
  const [orderOv, setOrderOv] = useState({});   // override ระดับออเดอร์ (แก้ในเว็บ: งาน/ลูกค้า/เซลล์/โน้ต) — ให้รายงานเห็นค่าที่แก้ด้วย
  const [resolverMaps, setResolverMaps] = useState(null);
  const [dbBounds, setDbBounds] = useState({ min: null, max: null });
  const [autoRanged, setAutoRanged] = useState(null);   // ข้อความแถบ "เดือนนี้ยังไม่มีข้อมูล → ถอยให้อัตโนมัติ"
  const [, setLoadingOrders] = useState(true);
  // PART 97: ข้อมูลใหม่เข้ารายงาน
  const [crmNotes, setCrmNotes] = useState([]);       // บันทึกประจำวัน CRM ในช่วง (data jsonb)
  const [crmTargets, setCrmTargets] = useState([]);   // เป้า CRM ของเดือน (เฉพาะช่วง=เดือนเดียว)
  // PART 103: ค่าแอด/ยอดมาร์เก็ตเพลสที่กรอกมือ (tmk_daily_sales) + เป้าเดือน (tmk_monthly_history)
  const [dailyRows, setDailyRows] = useState([]);
  const [dailyErr, setDailyErr] = useState('');   // อ่านค่าแอด/ยอดกรอกมือไม่ได้ → เตือน ไม่ใช่ปล่อยยอดหาย
  const [entryOpen, setEntryOpen] = useState(false);         // popup กรอกค่าแอด/ยอด mp (แอดมิน)
  const [entryDirty, setEntryDirty] = useState(false);       // ฟอร์มกรอกค่าแอดมีแก้ค้าง → ถามก่อนปิด sheet
  const [adEnteredToday, setAdEnteredToday] = useState(true); // badge แดงเมื่อวันนี้ยังไม่กรอกค่าแอด (default true กันวูบ)

  // ตารางเล็ก + ขอบวันที่ (โหลดครั้งเดียวตอนเข้า / หลังนำเข้า) — ไม่หนัก
  useEffect(() => { let alive = true; (async () => {
    // PART 109 (ลด egress): เลิกดึง tmk_mp_customers ทั้งตาราง — ป้อนแค่ตัวเลข lifetime ที่ไม่ได้โชว์ในหน้านี้แล้ว
    // (มุมลูกค้าของหน้านี้คำนวณจากออเดอร์ในช่วงผ่าน customerInsight/customerStats อยู่แล้ว)
    /* ขอบวันที่ต้องครอบ "ทุกแหล่ง" ไม่ใช่แค่ตารางออเดอร์ (PART 121)
       ยุคก่อนรวมระบบ (มิ.ย. 69 เป็นต้นมา) ยอด/ค่าแอด/คนทัก อยู่ใน tmk_daily_sales + tmk_sales_funnel
       เดิมขอบมาจากออเดอร์อย่างเดียว → ปฏิทินเลือกย้อนก่อนวันออเดอร์แรกไม่ได้ = 44 วันแรกมองไม่เห็นเลย */
    const [bndO, bndD, bndF, sa, ov] = await Promise.all([
      getDateBounds('tmk_mp_orders'),
      getDateBounds('tmk_daily_sales', 'date'),
      getDateBounds('tmk_sales_funnel', 'date'),
      cachedFetchAll('tmk_sales_aliases', 'handle,display_name'),
      cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
    ]);
    if (!alive) return;
    const bnd = mergeBounds([bndO, bndD, bndF]);
    setDbBounds(bnd);
    /* ทุกวันที่ 1 ของเดือน ช่วงเริ่มต้น "เดือนนี้" = วันเดียวและยังไม่มีออเดอร์ → รายงานว่างทั้งหน้า
       ถ้าเดือนปัจจุบันยังไม่มีข้อมูลจริงเลย ให้ถอยไป "30 วันล่าสุด" (คร่อมเดือน) แล้วขึ้นแถบบอก
       แตะเฉพาะตอนที่ผู้ใช้ยังไม่ได้เลือกช่วงเอง (ช่วงยังเป็นค่าเริ่มต้นของเดือนนี้) */
    const dflt = thisMonthRange();
    setF(prev => {
      if (prev.from !== dflt.from || prev.to !== dflt.to) return prev;      // ผู้ใช้เลือกเองแล้ว = ไม่ยุ่ง
      if (!bnd.max || bnd.max >= dflt.from) return prev;                    // เดือนนี้มีข้อมูลแล้ว = ไม่ต้องถอย
      const r = presetRange('d30', todayISO(), bnd.min, bnd.max);
      setAutoRanged(`${fmtTh(dflt.from).slice(2)} ยังไม่มีข้อมูล — กำลังแสดง 30 วันล่าสุด`);
      return { ...prev, from: r.from, to: r.to };
    });
    setAliases(sa.error ? [] : (sa.data || []));
    const om = {}; if (!ov.error) (ov.data || []).forEach(x => { om[x.order_id] = x; });
    setOrderOv(om);
  })(); return () => { alive = false; }; }, [reloadKey]);
  // โหลด map สำหรับ live-resolve ชื่อลาย/รหัส (catalog/alias/override) — รีโหลดหลังนำเข้า/แก้ catalog
  useEffect(() => { let alive = true; (async () => {
    const m = await loadResolverMaps(supabase);
    if (alive) setResolverMaps(m);
  })(); return () => { alive = false; }; }, [reloadKey]);
  const resolver = useMemo(() => makeSkuResolver(resolverMaps || {}), [resolverMaps]);
  useEffect(() => { saveF(f); }, [f]);
  // realtime: ออเดอร์/ใบเสร็จ/คนทัก/แคตตาล็อก/override เปลี่ยนที่ไหน รายงานเด้งสด (ไม่ต้องรีเฟรช)
  // realtime: invalidate เฉพาะตาราง sale ที่ dashboard ใช้ (ไม่ clear ทั้ง Map — กันทิ้ง cache เดือน/หน้าอื่น + ลด egress)
  // + เป้า: 'tmk_monthly_history' (เป้า/ยอดกรอกมือรายเดือน) · 'tmk_crm_targets' (แถว CRM) · 'tmk_targets' (เป้ารายคน)
  //   แก้ที่หน้าตั้งค่า → รายงานขายที่เปิดค้างต้องเด้งเอง (คู่กับ migration 20260821-realtime-targets)
  useSaleLiveReload([T.mpOrders, T.mpSkus, T.saleReceipts, T.salesFunnel, T.orderOverrides, T.mpCustomers, 'tmk_monthly_history', 'tmk_crm_targets', 'tmk_targets'], () => setReloadKey(k => k + 1), { invalidate: [T.mpOrders, T.mpSkus, T.mpCustomers, T.salesFunnel, T.orderOverrides] });

  const bounds = dbBounds;
  const range = { from: f.from || bounds.min, to: f.to || bounds.max };
  const eff = { ...f, from: range.from, to: range.to };
  // เทียบ: ถ้าช่วง = เดือนปฏิทินเต็ม → เทียบ "เดือนก่อนหน้า" (เต็มเดือน) ไม่งั้นเทียบช่วงยาวเท่ากัน
  const fullMonth = isFullCalendarMonth(range.from, range.to);
  const prevRange = (range.from && range.to) ? (fullMonth ? prevCalendarMonth(range.from, range.to) : prevPeriod(range.from, range.to)) : null;
  // key ตามค่าจริงของ filter/ช่วง (f/eff/prevRange เป็น object ใหม่ทุก render → ใช้ string เป็น dep แทน)
  const effKey = JSON.stringify(eff);
  const fKey = JSON.stringify(f);
  const prevRangeKey = JSON.stringify(prevRange);
  // ป้ายช่วงเวลา — ต้องสะท้อน "ช่วงจริง" ไม่ใช่แค่ชื่อเดือน
  // บั๊กเดิม: เลือก "วันนี้" (1 วัน) → cur กับ prev อยู่เดือนเดียวกันทั้งคู่ → ป้าย "สิงหาคม vs สิงหาคม"
  // กติกา: วันเดียว = "24 ส.ค." · เดือนปฏิทินเต็ม = "สิงหาคม" · นอกนั้น = ช่วงวันที่
  const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const TH_MON_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const rangeLabel = (from, to, fallback) => {
    if (!from || !to) return fallback;
    const d1 = new Date(from), d2 = new Date(to);
    const yr = (d) => (range.from && d.getFullYear() !== new Date(range.from).getFullYear()) ? ` ${String(d.getFullYear() + 543).slice(2)}` : '';
    if (from === to) return `${d1.getDate()} ${TH_MON_SHORT[d1.getMonth()]}${yr(d1)}`;              // วันเดียว
    if (isFullCalendarMonth(from, to)) return TH_MONTHS[d1.getMonth()] + yr(d1);                     // เดือนเต็ม
    if (d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear())                    // ในเดือนเดียวแต่ไม่เต็มเดือน
      return `${d1.getDate()}–${d2.getDate()} ${TH_MON_SHORT[d1.getMonth()]}${yr(d1)}`;
    return `${d1.getDate()} ${TH_MON_SHORT[d1.getMonth()]}–${d2.getDate()} ${TH_MON_SHORT[d2.getMonth()]}${yr(d2)}`;
  };
  const curLabel = rangeLabel(range.from, range.to, 'ช่วงนี้');
  const prevLabel = rangeLabel(prevRange?.from, prevRange?.to, 'ช่วงก่อน');
  const gran = range.from && range.to ? autoGran(range.from, range.to) : 'day'; // มุมมองเวลาอัตโนมัติอย่างเดียว (รายวัน ≤31 วัน · สัปดาห์ · เดือน) — ไม่มีปุ่มให้เลือกแล้ว

  // หน้าต่างเวลาที่ต้องโหลด = ครอบช่วงปัจจุบัน + ช่วงก่อน (ไว้เทียบ) → server-side filter
  const winFrom = (compare && prevRange?.from) ? prevRange.from : range.from;
  const winTo = range.to;
  // โหลด orders/skus เฉพาะหน้าต่างเวลา (เปลี่ยนช่วงแล้วโหลดใหม่ · แคชต่อช่วง)
   
  // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูล async (pattern ปกติ) · setLoadingOrders(true) = เปิดสถานะกำลังโหลดก่อนยิง query
  useEffect(() => { let alive = true; setLoadingOrders(true); (async () => {
    const [o, s, fn] = await Promise.all([
      cachedFetchRange('tmk_mp_orders', ORDERS_SEL, winFrom, winTo),
      cachedFetchRange('tmk_mp_skus', SKUS_SEL, winFrom, winTo),
      // คนทัก: เฉพาะหน้าต่างที่ดูอยู่ + เฉพาะคอลัมน์ที่ใช้ (เดิมดึงทั้งตารางทุกครั้งที่เข้าหน้า)
      cachedFetchRange('tmk_sales_funnel', FUNNEL_SEL, winFrom, winTo, 'date'),
    ]);
    if (!alive) return;
    if (o.error) { setErr(o.error.message); setLoadingOrders(false); return; }
    /* stray-override pass — หน้านี้เป็นทางเดียวที่ยังขาด (homeView/salePerf/mergedMonth มีครบ)
       ใบที่แก้วันที่ในเว็บแล้ว "วันดิบ" หลุดออกนอกหน้าต่างที่โหลด จะหายจาก hero/ตารางช่องทาง/KPI
       แต่เกจเป้าเดือน (useMonthTarget → fetchMergedMonth) นับให้ = เลข 2 ชุดบนจอเดียวกัน
       dedupeOrders กันซ้ำ (fetchOrdersByNos ค้นด้วย order_no อย่างเดียว จึงคืนข้ามช่องทางได้) */
    let baseOrders = o.data || [];
    try {
      const ovAll = await cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL);
      if (!ovAll.error) {
        const ovM = {}; (ovAll.data || []).forEach(x => { ovM[x.order_id] = x; });
        const nos = strayOverrideOrderNos(ovM, winFrom, winTo, baseOrders);
        if (nos.length) baseOrders = dedupeOrders([...baseOrders, ...await fetchOrdersByNos('tmk_mp_orders', ORDERS_SEL, nos)]);
      }
    } catch { /* ดึงเพิ่มไม่ได้ = กลับไปเท่าเดิม ไม่ทำให้แย่ลง */ }
    if (!alive) return;
    setOrders(baseOrders);
    /* ⚠️ อ่านไม่ได้ ≠ ไม่มีข้อมูล — เดิมกลืน error เป็น [] ทั้งคู่:
         funnel พลาด → แท็บคนทักขึ้น "ให้เซลล์กรอกก่อน" = โทษเซลล์ที่กรอกครบแล้ว
         skus พลาด  → "ยังไม่มีข้อมูลลายในช่วงนี้" ขณะที่ KPI "ตัวที่ขาย" ยังขึ้นปกติ (ดูเหมือนหน้าไม่พัง)
       หน้านี้มีแถบเตือนให้ tmk_daily_sales อยู่แล้ว — 2 ตารางนี้ตกสำรวจ */
    setSkus(s.error ? [] : (s.data || []));
    setFunnel(fn.error ? [] : (fn.data || []));
    setReadErr([
      s.error ? 'ลาย/สินค้า (tmk_mp_skus)' : '',
      fn.error ? 'คนทัก (tmk_sales_funnel)' : '',
    ].filter(Boolean));
    setLoadingOrders(false);
    setLoadedAt(new Date().toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
  })(); return () => { alive = false; }; }, [winFrom, winTo, reloadKey]);

  // PART 97: บันทึกประจำวัน CRM ในช่วง (data jsonb) — graceful ถ้าตาราง/คอลัมน์ยังไม่ migrate
  useEffect(() => { let alive = true; (async () => {
    if (!range.from || !range.to) { setCrmNotes([]); return; }
    let notes;
    try {
      let r = await supabase.from('tmk_crm_notes').select('salesperson,date,note,data').gte('date', range.from).lte('date', range.to);
      if (r.error && /column .*\bdata\b.* does not exist|schema cache/i.test(r.error.message || '')) r = await supabase.from('tmk_crm_notes').select('salesperson,date,note').gte('date', range.from).lte('date', range.to);
      notes = r.error ? [] : (r.data || []);
    } catch { notes = []; }
    if (alive) setCrmNotes(notes);
  })(); return () => { alive = false; }; }, [range.from, range.to, reloadKey]);
  // เป้า CRM — ใช้เดือนของวันสุดท้ายในช่วง (เดิมโหลดเฉพาะตอนช่วง = เดือนเต็ม → ดู "30 วันล่าสุด" แล้วแถว CRM หายเงียบ)
  // การเทียบ "เป้า" ยังใช้เฉพาะตอนช่วง = เดือนเต็ม (ดู sameMonth ใน CustomerTab) — ที่นี่แค่ทำให้รู้ว่าใครอยู่ทีม CRM
  const crmMonth = (range.to || range.from) ? String(range.to || range.from).slice(0, 7) : null;
  useEffect(() => { let alive = true; (async () => {
    if (!crmMonth) { setCrmTargets([]); return; }
    const t = await fetchCrmTargets(crmMonth);
    if (alive) setCrmTargets(t);
  })(); return () => { alive = false; }; }, [crmMonth, reloadKey]);

  // PART 103: ดึงค่าแอด/ยอด mp ที่กรอกมือ (รายวันในช่วง) + เป้าเดือน (เมื่อช่วง = เดือนเดียว)
  // ดึงทั้งหน้าต่าง (ช่วงก่อน + ช่วงนี้) แล้วแยกทีหลัง → แท็บโฆษณาเทียบค่าแอดเดือนก่อนได้
  useEffect(() => { let alive = true; (async () => {
    if (!winFrom || !winTo) { setDailyRows([]); return; }
    try {
      const { data, error } = await supabase.from('tmk_daily_sales')
        .select('date,channels,ad_spend,avg_reply_minutes,note,deleted_at')
        .gte('date', winFrom).lte('date', winTo);
      if (!alive) return;
      /* ⚠️ ห้ามกลืน error — แถวนี้คือ "ค่าแอด" กับ "ยอดมาร์เก็ตเพลสที่กรอกมือ"
         ถ้าอ่านไม่ได้แล้วปล่อยเป็น [] ยอดรวมจะหายเท่ากับยอด Shopee/TikTok/Lazada ทั้งช่วง
         และ ROAS/ค่าแอดกลายเป็น 0 โดยหน้าจอไม่บอกอะไรเลย (กติกา: อ่านไม่ได้ ≠ ไม่มีข้อมูล) */
      if (error) { setDailyErr(pgErrorText(error)); return; }
      setDailyErr('');
      setDailyRows((data || []).filter(d => !d.deleted_at));
    } catch (e) { if (alive) setDailyErr(e?.message || 'อ่านค่าแอด/ยอดกรอกมือไม่สำเร็จ'); }
  })(); return () => { alive = false; }; }, [winFrom, winTo, reloadKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม effKey (ค่าจริงของช่วง) ไม่ใช่ object range ที่สร้างใหม่ทุก render
  const dailyInRange = useMemo(() => dailyRows.filter(d => (!range.from || d.date >= range.from) && (!range.to || d.date <= range.to)), [dailyRows, effKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม prevRangeKey (ค่าจริง)
  const dailyPrev = useMemo(() => (prevRange ? dailyRows.filter(d => d.date >= prevRange.from && d.date <= prevRange.to) : []), [dailyRows, prevRangeKey]);

  // เป้าเดือน (ฝังใน hero): ยึดเดือนของวันสุดท้ายในช่วง · เทียบยอดสะสมทั้งเดือนจริง (ไม่ผูกช่วงที่กรอง)
  const targetYm = String(range.to || todayISO()).slice(0, 7);
  const mt = useMonthTarget(targetYm);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!mt || !mt.has || !mt.isCur || !mt.target || mt.sales < mt.target) return;
    const key = `tmk-target-celebrated-${Number(mt.ym.slice(0, 4)) + 543}-${Number(mt.ym.slice(5, 7))}`;
    try { if (localStorage.getItem(key) === '1') return; localStorage.setItem(key, '1'); } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ฉลองครั้งเดียว/เดือน: อ่าน/เขียน localStorage ก่อนตัดสินใจ
    setCelebrate(true);
  }, [mt]);

  // ประมวลผล: apply override ที่แก้ในเว็บ (งาน/ลูกค้า/เซลล์/โน้ต — แพทเทิร์นเดียวกับหน้าออเดอร์)
  // + normalize จังหวัด + รวมชื่อเซลล์ (handle→ชื่อจริง) + รวมยอดเซลล์
  const procOrders = useMemo(() => {
    if (!orders) return null;
    const spMap = new Map((aliases || []).filter(a => a.display_name).map(a => [a.handle, a.display_name]));
    // merge override (helper กลาง — ตรงกับหน้าออเดอร์/ประสิทธิภาพเซลล์) → normalize จังหวัด + alias เซลล์
    return mergeOrderOverrides(orders, orderOv).map(o1 => {
      const th = o1.province ? normalizeProvince(o1.province) : null;
      const sp = spMap.get(o1.salesperson);
      return (th && th !== o1.province) || sp ? { ...o1, province: (th && th !== o1.province) ? th : o1.province, salesperson: sp || o1.salesperson } : o1;
    });
  }, [orders, aliases, orderOv]);
  // remap SKU ของ Shopee (order_no = marketplace_id) → เลขออเดอร์จริง แล้ว resolve ชื่อลายสด (helper กลาง)
  const procSkus = useMemo(() => {
    if (!orders) return [];
    const ordNos = new Set(orders.map(x => x.order_no));
    const mid2ono = new Map(orders.filter(x => x.marketplace_id && x.marketplace_id !== '-').map(x => [x.marketplace_id, x.order_no]));
    const remapped = (skus || []).map(s => (!ordNos.has(s.order_no) && mid2ono.has(s.order_no)) ? { ...s, order_no: mid2ono.get(s.order_no) } : s);
    return resolveSkuDesigns(remapped, resolver);
  }, [orders, skus, resolver]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม effKey (ค่าจริงของ eff) ไม่ใช่ object ที่สร้างใหม่ทุก render
  const A = useMemo(() => procOrders ? compute(procOrders, procSkus, eff) : null, [procOrders, procSkus, effKey]);

  // PART 103: ตารางช่องทางรวม + มุมลูกค้า + ค่าแอด — ใช้ lib กลาง (pure · มีเทส)
  const manualAgg = useMemo(() => manualEntryAgg(dailyInRange), [dailyInRange]);
  const prevManualAgg = useMemo(() => manualEntryAgg(dailyPrev), [dailyPrev]);
  const crmTeam = useMemo(() => crmTeamOf(crmTargets), [crmTargets]);
  // ยอดที่กรอกมือ (มาร์เก็ตเพลส/ค่าแอด) ไม่มีเจ้าของรายเซลล์/ลูกค้า/ลาย → ถ้าหน้ากำลังกรองมิติพวกนั้น ห้ามเอามาบวก (ยอดจะเกินจริง)
  /* ยุคก่อนรวมระบบ (ก่อน 1 ส.ค. 69): ยอด/ออเดอร์/คนทัก มาจากที่กรอกรายวัน ไม่มีออเดอร์รายใบให้เจาะ
     → ต้องบอกผู้ใช้ และห้ามโชว์ตัวชี้วัดที่ต้องใช้ใบจริง (ลาย/จังหวัด/ตะกร้า) เป็น 0 เฉย ๆ */
  const legacyDays = useMemo(() => dailyInRange.filter(d => d.date < MERGE_CUTOFF).length, [dailyInRange]);
  const hasLegacy = legacyDays > 0;

  const manualOk = !['payment_type', 'customer_type', 'qty_band', 'salesperson', 'province', 'source', 'job_type', 'design', 'product_code', 'size', 'color', 'type']
    .some(k => (f[k] || []).length > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ผูก effKey (ค่าจริงของช่วง/ตัวกรอง) แทน object range/f ที่สร้างใหม่ทุก render
  const tableOpts = useMemo(() => ({ from: range.from, to: range.to, salespersons: f.salesperson, channels: f.channel, allowManual: manualOk }), [effKey, manualOk]);
  const mergedTable = useMemo(() => (A?._ords ? channelTable(A._ords, funnel, manualAgg, crmTeam, tableOpts) : null), [A, funnel, manualAgg, crmTeam, tableOpts]);
  const custInsight = useMemo(() => (A?._ords ? customerInsight(A._ords) : null), [A]);

  // badge "ยังไม่กรอกวันนี้" — เช็คแถว daily ของวันนี้มีค่าแอดหรือยัง (เฉพาะแอดมิน · เช็คใหม่หลังปิด popup)
  useEffect(() => {
    if (!busIsAdmin()) return;
    let live = true;
    (async () => {
      try {
        const { data } = await supabase.from('tmk_daily_sales').select('channels,ad_spend').eq('date', todayISO()).maybeSingle();
        if (!live) return;
        const filled = !!data && (Number(data.ad_spend) > 0 || Object.values(data.channels || {}).some(v => Number(v?.ad) > 0));
        setAdEnteredToday(filled);
      } catch { /* เงียบ — badge ไม่โชว์ */ }
    })();
    return () => { live = false; };
  }, [entryOpen]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม fKey/prevRangeKey (ค่าจริง) ไม่ใช่ object ที่สร้างใหม่ทุก render
  const prevA = useMemo(() => (procOrders && compare && prevRange) ? compute(procOrders, procSkus, { ...f, ...prevRange }) : null, [procOrders, procSkus, fKey, prevRangeKey, compare]);
  const dk = useMemo(() => A ? deltaKpi(A.kpi, prevA?.kpi) : null, [A, prevA]);
  // ตารางช่องทางของช่วงก่อน (แท็บโฆษณาใช้เทียบ ▲▼) — ต้องอยู่หลัง prevA (TDZ)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ผูก prevRangeKey (ค่าจริงของช่วงก่อน)
  const prevTableOpts = useMemo(() => ({ from: prevRange?.from, to: prevRange?.to, salespersons: f.salesperson, channels: f.channel, allowManual: manualOk }), [prevRangeKey, fKey, manualOk]);
  const prevTable = useMemo(() => (prevA?._ords ? channelTable(prevA._ords, funnel, prevManualAgg, crmTeam, prevTableOpts) : null), [prevA, funnel, prevManualAgg, crmTeam, prevTableOpts]);
  const cmp = compare && prevA && prevA.kpi.orders > 0; // โชว์ %Δ เฉพาะเมื่อช่วงก่อนมีข้อมูลจริง

  // options สำหรับ filter dropdown (จากข้อมูลทั้งหมด)
  const opts = useMemo(() => {
    const po = procOrders || [], ps = procSkus || [];
    const u = (arr, k) => [...new Set(arr.map(r => r[k]).filter(Boolean))];
    return {
      channel: u(po, 'channel'), payment_type: u(po, 'payment_type'), customer_type: u(po, 'customer_type'),
      qty_band: u(po, 'qty_band'), salesperson: u(po, 'salesperson'), province: u(po, 'province').sort(),
      source: u(po, 'source'), job_type: u(po, 'job_type'),
      design: u(ps, 'design').sort(), size: [...new Set(ps.map(s => s.size).filter(Boolean))].sort((a, b) => sizeRank(a) - sizeRank(b)),
      color: [...new Set(ps.map(s => normColor(s.color)).filter(Boolean))].sort(), type: CATALOG_TYPES,
    };
  }, [procOrders, procSkus]);

  // กราฟ "ยอดขายรายวัน" (รื้อใหม่ 22 ส.ค.): แท่งซ้อนสีตามช่องทาง (ยอดขายเสมอ) + เส้นอ้างอิง = เฉลี่ยต่อ bucket ของช่วงก่อน + วันขายดีสุด
  // ไม่มีปุ่มตัวชี้วัด/มุมมอง/แยกช่องทางแล้ว — มุมมองตาม gran อัตโนมัติ · คลิกแท่ง (รายวัน) = popup ออเดอร์ทั้งวัน
  const trendByChannel = useMemo(() => {
    if (!A || !range.from) return null;
    const bks = enumerateBuckets(range.from, range.to, gran);
    const channels = A.byChannel.map(c => c.key); // เรียงตามยอดมาก→น้อย
    const acc = {}; channels.forEach(ch => acc[ch] = {});
    const tot = {}, cnt = {};
    (A._ords || []).forEach(o => { if (!(o.channel in acc)) return; const b = bucketKey(o.order_date, gran); const v = Number(o.sales) || 0; acc[o.channel][b] = (acc[o.channel][b] || 0) + v; tot[b] = (tot[b] || 0) + v; cnt[b] = (cnt[b] || 0) + 1; });
    // ป้ายแกน x รายวัน = เลขวันสั้นๆ (ครบทุกแท่ง ไม่ต้องเว้น) · ใส่ชื่อเดือนเฉพาะแท่งแรกกับวันที่ 1 (กันงงตอนช่วงคร่อมเดือน)
    const lbl = (b, i) => gran === 'day' ? ((i === 0 || b.endsWith('-01')) ? bucketLabel(b, 'day') : String(Number(b.slice(8, 10)))) : bucketLabel(b, gran).replace(/ \(.*/, '');
    let best = null; bks.forEach(b => { if ((tot[b] || 0) > (best?.sales || 0)) best = { key: b, sales: tot[b], orders: cnt[b] || 0 }; });
    // วันหยุด (เสาร์/อาทิตย์) ต่อ bucket — ใช้เฉพาะ gran=day
    const weekend = bks.map(b => { const d = new Date(b + 'T00:00:00'); const w = d.getDay(); return w === 0 || w === 6; });
    // เทียบช่วงก่อน: ยอดต่อ bucket ของช่วงก่อน "ลำดับเดียวกัน" (วันที่ 1 ↔ วันที่ 1) → เส้นประในกราฟ · ref = เฉลี่ย (fallback ถ้าไม่มี series)
    let ref = null, prevSeries = null;
    if (compare && prevA && prevRange && prevA.kpi.sales > 0) {
      const pBks = enumerateBuckets(prevRange.from, prevRange.to, gran);
      ref = prevA.kpi.sales / (pBks.length || 1);
      const pTot = {}; (prevA._ords || []).forEach(o => { const b = bucketKey(o.order_date, gran); pTot[b] = (pTot[b] || 0) + (Number(o.sales) || 0); });
      prevSeries = bks.map((_, i) => (pBks[i] ? (pTot[pBks[i]] || 0) : null));
    }
    return {
      keys: bks,
      labels: bks.map(lbl),
      tipLabels: bks.map(b => bucketLabel(b, gran)),   // ป้ายเต็มใน tooltip (เช่น "14 ส.ค." / "W33 (11–17 ส.ค.)")
      orders: bks.map(b => cnt[b] || 0),
      weekend,
      prevSeries,
      datasets: channels.map(ch => ({ label: ch, data: bks.map(b => acc[ch][b] || 0), color: channelColor(ch) })),
      best: best ? { ...best, label: bucketLabel(best.key, gran) } : null,
      ref,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม prevRangeKey (ค่าจริง) ไม่ใช่ object ที่สร้างใหม่ทุก render
  }, [A, prevA, gran, range.from, range.to, compare, prevRangeKey]);

  const showSkel = useDelayedFlag(!A, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (err) return <div className="content-inner"><Card className="p-6" style={{ color: 'var(--bad)' }}>โหลดข้อมูลไม่ได้: {err}</Card></div>;
  if (showSkel) return <DashboardSkeleton />;
  if (!A) return null;
  if (orders && orders.length === 0 && !dbBounds.max) return <div className="content-inner"><Card className="p-10 text-center">
    <div style={{ color: 'var(--ink-4)', marginBottom: 16 }}>ยังไม่มีข้อมูลขาย — นำเข้าไฟล์ Shipnity / Shopee / TikTok + catalog เพื่อเริ่มใช้งาน</div>
    <Button onClick={() => setImportOpen(true)}><Icon name="external" /> นำเข้าไฟล์ขาย</Button>
    {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
  </Card></div>;

  /* KPI ต้องตรงกับตาราง "ยอดต่อช่องทาง" บนจอเดียวกัน (PART 121)
     ช่วงที่คาบยุคเก่า: ออเดอร์/ลูกค้าใหม่-เก่า ต้องรวมตัวเลขที่กรอกรายวันด้วย
     ส่วน "ตัวที่ขาย/ตะกร้า/ยอดต่อตัว" ยังใช้เฉพาะออเดอร์รายใบ (ยุคเก่าไม่ได้กรอกจำนวนตัว) */
  const k = (() => {
    const base = A.kpi;
    const t = mergedTable?.total;
    if (!t) return base;
    /* ⚠️ ต้องใช้ฐานเดียวกับแถว "รวม" ของตารางช่องทางเสมอ ไม่ใช่เฉพาะช่วงที่คาบยุคเก่า
       เดิม `if (!hasLegacy) return base` → ยุคใหม่ KPI ใช้ออเดอร์รายใบล้วน (137)
       แต่แถวรวมบวก ordMp (ออเดอร์มาร์เก็ตเพลสที่กรอกมือ) ด้วย (282) = 2 เลขบนจอเดียวกัน
       และ hero "ยอดขายรวม" ก็รวม mp อยู่แล้ว → ตัวหารของ AOV ต้องรวมด้วยถึงจะไม่เพี้ยน */
    const orders = t.orders || base.orders;
    return { ...base, orders, newC: t.newC ?? base.newC, oldC: t.oldC ?? base.oldC, aov: orders ? (t.sales || base.sales) / orders : 0 };
  })();
  // KPI เสริมจากข้อมูลที่มี: ซื้อซ้ำ% (ลูกค้าที่ซื้อ >1 ครั้ง) + ยอด/วัน เฉลี่ย
  const heroStats = (() => {
    const cc = {}; A._ords.forEach(o => { if (o.customer_code) cc[o.customer_code] = (cc[o.customer_code] || 0) + 1; });
    const vals = Object.values(cc); const repeatC = vals.filter(n => n > 1).length;
    const repeatRate = vals.length ? repeatC / vals.length : 0;
    const days = Math.max(1, (range.from && range.to ? diffDays(range.from, range.to) + 1 : 1));
    const activeDays = new Set(A._ords.map(o => o.order_date).filter(Boolean)).size || 1;
    // sparkline ต่อ metric (ราย bucket ตามมุมมองเวลา)
    const sg = series(A._ords, eff, gran); const bks = enumerateBuckets(range.from, range.to, gran);
    const sparkOf = (m) => bks.map(b => { const g = sg.get(b); return g ? g[m] : 0; });
    // สะสมเทียบช่วงก่อน (hero): ยอดต่อ bucket ของช่วงนี้ + ช่วงก่อน (ฐาน = ออเดอร์ทั้งคู่) · แกน = ลำดับ bucket ในช่วง (วันที่ 1..N)
    let cumPrev = null, cumPrevBks = [];
    if (compare && prevRange && procOrders) {
      const pv = series(procOrders, { ...f, ...prevRange }, gran); cumPrevBks = enumerateBuckets(prevRange.from, prevRange.to, gran);
      cumPrev = cumPrevBks.map(b => { const g = pv.get(b); return g ? g.sales : 0; });
    }
    const today = todayISO();
    const cumLabels = bks.map((b, i) => gran === 'day' ? String(i + 1) : bucketLabel(b, gran).replace(/ \(.*/, ''));
    const cumTips = bks.map(b => bucketLabel(b, gran));
    const nMax = Math.max(bks.length, cumPrev ? cumPrev.length : 0);
    for (let i = bks.length; i < nMax; i++) { cumLabels.push(gran === 'day' ? String(i + 1) : (cumPrevBks[i] ? bucketLabel(cumPrevBks[i], gran).replace(/ \(.*/, '') : String(i + 1))); cumTips.push(gran === 'day' ? `วันที่ ${i + 1} (เฉพาะ${prevLabel})` : (cumPrevBks[i] ? bucketLabel(cumPrevBks[i], gran) : '')); }
    const cumTodayIdx = gran === 'day' ? bks.indexOf(today) : -1;
    // โปรไฟล์ลูกค้า (Shipnity): ซื้อซ้ำ lifetime + ตามต่อได้ (มีเบอร์)
    // เดือนขายดีสุด (วิว "ทั้งหมด") — สรุปยอดรายเดือนแล้วหายอดสูงสุด
    const mg = series(A._ords, eff, 'month');
    let bestMonth = null;
    for (const g of mg.values()) { if (!bestMonth || g.sales > bestMonth.sales) bestMonth = g; }
    const bestMonthLabel = bestMonth ? bucketLabel(bestMonth.key, 'month') : '';
    return { repeatC, repeatRate, perDay: k.sales / days, perActiveDay: k.sales / activeDays, days, activeDays, sparkSales: sparkOf('sales'), sparkOrders: sparkOf('orders'), sparkQty: sparkOf('qty'), bestMonth, bestMonthLabel,
      cum: { cur: sparkOf('sales'), prev: cumPrev, labels: cumLabels, tips: cumTips, todayIdx: cumTodayIdx, prevTotal: cumPrev ? cumPrev.reduce((a, v) => a + v, 0) : 0, prevAtSame: cumPrev ? cumPrev.slice(0, bks.length).reduce((a, v) => a + v, 0) : 0 } };
  })();
  const setRange = (from, to) => setF(p => ({ ...p, from, to }));
  // preset ที่ active อยู่ (ตรงกับช่วงปัจจุบัน) — ให้ ToggleGroup รู้ค่าที่เลือก
  const activePreset = (() => { for (const [id] of PRESETS) { const r = presetRange(id, todayISO(), bounds.min, bounds.max); if (id === 'all' ? (!f.from && !f.to) : (f.from === r.from && f.to === r.to)) return id; } return ''; })();
  const nFilters = activeFilterCount(f);
  // cross-filter: คลิกกราฟ → สลับค่าในตัวกรองสากล (กรองทั้งหน้า)
  const toggleFilter = (dim, value) => setF(p => { const cur = p[dim] || []; return { ...p, [dim]: cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value] }; });
  const DIM_LABEL = { channel: 'ช่องทาง', design: 'ลาย', type: 'หมวด', size: 'ไซซ์', color: 'สี', province: 'จังหวัด', salesperson: 'เซลล์', job_type: 'งาน', payment_type: 'ชำระ', customer_type: 'ลูกค้า', qty_band: 'ขนาด', product_code: 'รหัส', source: 'ที่มา' };
  const activeChips = DIM_FIELDS.flatMap(dim => (f[dim] || []).map(v => ({ dim, v })));
  // คนทัก/%ปิด ของช่วงใดก็ได้ (ช่วงนี้ + ช่วงก่อน ใช้ฟังก์ชันเดียวกัน → เทียบได้ตรง)
  // - นับคนทักผ่าน funnelTotal (รองรับ 3 ฟอร์แมต) · ใหม่/เก่า/ไม่ระบุ ผ่าน funnelNewOld (n+o+u = totalLeads เสมอ)
  // - %ปิด = ออเดอร์ช่องแชท (isChatOrder ตัดมาร์เก็ตเพลส) ของเซลล์ที่มีข้อมูลคนทัก ÷ คนทัก
  /* การ์ด KPI "คนทัก"/"%ปิด" ต้องได้เลขเดียวกับตาราง "ยอดต่อช่องทาง" บนจอเดียวกัน
     กติกาต้องตรงกับ channelTable ทุกข้อ:
     · กรองช่องทางที่ "คนทัก" ด้วย (เดิมนับทุกแพลตฟอร์มขณะที่ตัวเศษถูกกรอง → 20% กับ 12% พร้อมกัน)
     · เทียบชื่อเซลล์แบบ trim (เดิมชื่อมีช่องว่างหัวท้ายทำให้ตัวเศษเป็น 0 → %ปิด 0%)
     · ไม่มีคนทัก → null ไม่ใช่ 0 (0% สีแดงทั้งที่แปลว่า "ไม่มีข้อมูล") */
  const funnelStats = (ords, from, to) => {
    const inR = (d) => (!from || d >= from) && (!to || d <= to);
    const chSet = f.channel.length ? new Set(f.channel) : null;
    const fr = (funnel || []).filter(r => inR(r.date) && (!f.salesperson.length || f.salesperson.includes(r.salesperson)));
    if (!fr.length) return null;
    // สูตรอยู่ที่ lib/funnelClose.js ที่เดียว — แท็บ "คนทัก" ใช้ตัวเดียวกันนี้ (เดิมเขียนแยกแล้วเพี้ยนออกจากกัน)
    const st = funnelCloseStats(fr, ords, chSet);
    return { totalLeads: st.leads, orders: st.orders, pct: st.pct == null ? null : Math.round(st.pct), n: st.n, o: st.o, u: st.u };
  };
  const funnelClose = funnelStats(A._ords, range.from, range.to);
  const prevFunnel = (cmp && prevRange) ? funnelStats(prevA?._ords, prevRange.from, prevRange.to) : null;
  /* ตัว/ออเดอร์ ต้องใช้ฐานเดียวกันทั้งเศษและส่วน — k.qty มาจากออเดอร์รายใบเท่านั้น
     แต่ k.orders ถูกแทนด้วยยอดรวมที่บวก "ออเดอร์ยุคเก่าที่กรอกมือ" เข้าไปด้วย (ซึ่งไม่มีจำนวนตัว)
     → ช่วงคาบยุคเก่าจะได้ 1.29 ตัว/ออเดอร์ แทนที่จะเป็น 2.25 · ใช้ออเดอร์รายใบเป็นตัวส่วน (ตรงกับคอมเมนต์เดิม) */
  const basketQty = A.kpi.orders ? k.qty / A.kpi.orders : 0;
  /* การ์ด "คนทัก" และ "%ปิดการขาย" ต้องใช้ตัวเลขชุดเดียวกับตารางช่องทางบนจอเดียวกัน (PART 121)
     ช่วงที่คาบยุคเก่า: คนทักมาจาก funnel (ยุคใหม่) + inq ที่กรอกรายวัน (ยุคเก่า) */
  const leadView = (() => {
    const t = mergedTable?.total;
    if (!hasLegacy || !t || !(t.leads > 0)) return null;
    return { totalLeads: t.leads, closed: Math.round(t.chatClosed || 0), pct: t.closeRate == null ? 0 : Math.round(t.closeRate) };
  })();
  // ชิปเทียบช่วงก่อน — % สำหรับจำนวน/เงิน · "pt" สำหรับอัตรา · good=ดีขึ้น (COD เป็นกลาง)
  // สูตรส่วนต่าง = lib/deltaChip.js ที่เดียว (เดิมก๊อป 4 ที่)
  const dPct = (cur, prev, { goodUp = true } = {}) => {
    const d = deltaPct(cur, prev, { goodUp, on: cmp });
    return d && { ...d, title: `${prevLabel}: ${typeof prev === 'number' && prev >= 1000 ? N(Math.round(prev)) : prev}` };
  };
  // ส่วนต่างของตัวชี้วัดที่เป็น % (หน่วย pt) = lib/deltaChip.js · clamp ±100 อยู่ในนั้น
  const dPt = (cur, prev, { goodUp = true, neutral = false } = {}) => {
    const d = deltaPoint(cur, prev, { goodUp, neutral, on: cmp });
    return d && { ...d, title: `${prevLabel}: ${Math.round(prev)}%${d.over ? ` (ส่วนต่างจริง ${d.raw} pt — ช่วงก่อนมีข้อมูลน้อยเกินจะเทียบ)` : ''}` };
  };
  // COD: ยอดเงิน + สัดส่วนโอน (จาก byPayment) — การ์ดใหม่แทนพิลล์
  const codSales = (A._ords || []).reduce((a, o) => a + ((o.payment_type === 'COD' || (Number(o.cod_amount) || 0) > 0) ? (Number(o.sales) || 0) : 0), 0);
  const transferShare = (A.byPayment || []).find(p => p.key === 'โอน')?.share || 0;
  const closeTone = (p) => (p >= 15 ? 'var(--good)' : p >= 8 ? 'var(--warn)' : 'var(--bad)');

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>

      {/* เดือนใหม่ยังไม่มีข้อมูล → ถอยช่วงให้อัตโนมัติ แล้วบอกให้รู้ว่ากำลังดูช่วงไหน (กดปิดได้) */}
      {autoRanged && (
        <div role="status" className="row" style={{ gap: 10, alignItems: 'center', padding: '9px 13px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb, var(--info) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)' }}>
          <span style={{ color: 'var(--info)', flexShrink: 0 }}><Icon name="calendarDays" size={15} /></span>
          <span className="sm" style={{ flex: 1, minWidth: 0 }}>{autoRanged}</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setAutoRanged(null)}>ปิด</Button>
        </div>
      )}

      {readErr.length > 0 && (
        <div role="alert" className="row" style={{ gap: 10, alignItems: 'center', padding: '9px 13px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb, var(--bad) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--bad) 35%, transparent)' }}>
          <span style={{ color: 'var(--bad)', flexShrink: 0 }}><Icon name="alertTriangle" size={15} /></span>
          <span className="sm" style={{ flex: 1, minWidth: 0 }}>
            อ่าน <b>{readErr.join(' · ')}</b> ไม่สำเร็จ — ตัวเลขคนทัก/%ปิด และบล็อกลายในหน้านี้ยังไม่ใช่ของจริง (<b>ไม่ได้แปลว่าเซลล์ไม่ได้กรอก</b>)
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setReloadKey(k => k + 1)}>ลองใหม่</Button>
        </div>
      )}

      {dailyErr && (
        <div role="alert" className="row" style={{ gap: 10, alignItems: 'center', padding: '9px 13px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb, var(--bad) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--bad) 35%, transparent)' }}>
          <span style={{ color: 'var(--bad)', flexShrink: 0 }}><Icon name="alertTriangle" size={15} /></span>
          <span className="sm" style={{ flex: 1, minWidth: 0 }}>อ่านค่าแอด / ยอดมาร์เก็ตเพลสที่กรอกมือไม่สำเร็จ — ยอดรวมและ ROAS ในหน้านี้ยังไม่ครบ ({dailyErr})</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => setReloadKey(k => k + 1)}>ลองใหม่</Button>
        </div>
      )}

      {/* ===== แผงควบคุมรวม: แถวเดียว — ช่วงเวลา + ตัวกรอง (ยุบได้) ===== */}
      <Card className="overflow-visible" style={{ padding: 0 }}>
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="filter-compact row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '11px 14px' }}>
            <DateRangePicker from={range.from} to={range.to} min={bounds.min} max={(bounds.max && bounds.max > todayISO()) ? bounds.max : todayISO()} onChange={(a, b) => setRange(a, b)}
              presets={PRESETS} activePreset={activePreset}
              presetRangeOf={(id) => presetRange(id, todayISO(), bounds.min, bounds.max)}
              onPickPreset={(id) => { const r = presetRange(id, todayISO(), bounds.min, bounds.max); setRange(id === 'all' ? null : r.from, id === 'all' ? null : r.to); }} />
            <span className="h-5 w-px bg-[var(--line)]" />
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name="chevD" style={filtersOpen ? { transform: 'rotate(180deg)' } : undefined} />
              </Button>
            </CollapsibleTrigger>
            {/* ชิปที่กรองอยู่ — ห่อบรรทัดได้ ไม่บีบ/ไม่ตัดค่าทิ้ง (chip-collection-reflow) · role=status ให้ screen reader รู้ว่ากรองกี่ตัว */}
            <div className="row" role="status" aria-atomic="true" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', minWidth: 0, flex: '1 1 auto' }}>
              {activeChips.length > 0
                ? <>
                    <span className="sr-only">กรองอยู่ {nFilters} รายการ</span>
                    {activeChips.map(({ dim, v }) => (
                      <Badge key={dim + v} variant="outline" onClick={() => toggleFilter(dim, v)}
                        title={`${DIM_LABEL[dim]}: ${v} — คลิกเพื่อเอาออก`}
                        className="cursor-pointer gap-1 rounded-full border-[var(--accent)] bg-[var(--accent-soft)] py-0.5 pl-2 pr-1.5 text-[var(--accent-2)] transition-colors hover:bg-[var(--surface-2)]">
                        <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>{DIM_LABEL[dim]}</span>
                        <span style={{ fontWeight: 600 }}>{v}</span>
                        <Icon name="x" className="size-3" />
                      </Badge>
                    ))}
                  </>
                : <span className="cap" style={{ color: 'var(--ink-4)' }}>ยังไม่ได้กรอง — แสดงทุกออเดอร์</span>}
            </div>
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)] ml-auto shrink-0" onClick={() => setF(p => ({ ...emptyF(), from: p.from, to: p.to }))}><Icon name="x" /> ล้างทั้งหมด</Button>}
          </div>
          <CollapsibleContent>
            <div style={{ display: 'grid', gap: 10, padding: '0 14px 12px' }}>
              <div style={{ display: 'grid', gap: 10, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                {[
                  ['ออเดอร์', [['ช่องทาง', 'channel'], ['ประเภทงาน', 'job_type'], ['การชำระ', 'payment_type'], ['ขนาดออเดอร์', 'qty_band']]],
                  ['สินค้า', [['ลาย', 'design'], ['หมวด', 'type'], ['ไซซ์', 'size'], ['สี', 'color']]],
                  ['ลูกค้า & พื้นที่', [['ลูกค้า', 'customer_type'], ['จังหวัด', 'province'], ['เซลล์', 'salesperson']]],
                ].map(([grp, dims]) => {
                  // จำนวนที่เลือกในกลุ่มนี้ → โชว์ข้างชื่อกลุ่ม + ปุ่มล้างเฉพาะกลุ่ม (เดิมล้างได้แค่ทีละชิปหรือทั้งหมด)
                  const grpN = dims.reduce((a, [, dim]) => a + (f[dim]?.length || 0), 0);
                  return (
                    <div key={grp} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="row cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 104, flexShrink: 0, gap: 5, alignItems: 'center' }}>
                        {grp}
                        {grpN > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{grpN}</Badge>}
                      </span>
                      {dims.map(([label, dim]) => <MultiSelect key={dim} label={label} options={opts[dim]} value={f[dim]} onChange={v => setF(p => ({ ...p, [dim]: v }))} />)}
                      {grpN > 0 && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-[var(--ink-4)] hover:text-[var(--bad)]"
                          title={`ล้างตัวกรองกลุ่ม ${grp}`}
                          onClick={() => setF(p => { const n = { ...p }; dims.forEach(([, dim]) => { n[dim] = []; }); return n; })}>ล้างกลุ่มนี้</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ===== Hero (executive) ===== */}
      {(() => {
        const unknownC = Math.max(0, k.orders - k.newC - k.oldC);
        const seg = (n) => k.orders ? (n / k.orders * 100) : 0;
        return <>
          {(() => {
            const up = cmp && dk.sales.d >= 0;
            // ยอดรวมใน hero = ยอดจากออเดอร์ + ยอดมาร์เก็ตเพลสที่กรอกมือ (ตรงกับ "รวม" ในการ์ดยอดต่อช่องทาง — เดิม 2 เลขไม่ตรงกันบนหน้าเดียว)
            const heroRows = mergedTable?.rows || [];
            /* ต้องใช้ manualExtra (ยอดที่ "กรอกมือ" ล้วน) ไม่ใช่ r.sales (= ออเดอร์จริง + กรอกมือ)
               เดิม Shopee import 300,000 + กรอกมือ 50,000 → เขียนว่า "รวมมาร์เก็ตเพลส ฿350,000" เกิน 7 เท่า */
            const manualSales = heroRows.filter(r => r.isManual).reduce((a, r) => a + (Number(r.manualExtra) || 0), 0);
            const heroTotal = mergedTable ? mergedTable.total.sales : k.sales;
            const bR = (n) => '฿' + Math.round(Number(n) || 0).toLocaleString('th-TH'); // hero: เงินเต็มบาท ไม่เอาสตางค์
            const chanRows = heroRows.filter(r => r.sales > 0 && (mergedTable?.total.sales ? r.sales / mergedTable.total.sales >= 0.005 : true)); // ตัดช่องที่ <0.5% (โชว์ 0% ไม่มีประโยชน์)
            const shown = chanRows.slice(0, 5), rest = chanRows.slice(5);
            const chanSegs = [...shown.map(r => ({ key: r.ch, v: r.sales, color: channelTint(r.ch), pick: true })), ...(rest.length ? [{ key: `อื่นๆ (${rest.length})`, v: rest.reduce((a, r) => a + r.sales, 0), color: 'var(--ink-4)', pick: false }] : [])];
            return (
              <Card className="p-[22px]">
                <div className="hero-bento">
                  {/* ซ้าย — ยอดขายรวมช่วงที่เลือก + เทียบเดือนก่อน + สัดส่วนช่องทาง */}
                  <div className="hero-total">
                    <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-.2px', color: 'var(--ink)' }}>ยอดขายรวม <span className="dim" style={{ fontSize: 13, fontWeight: 500 }}>· {curLabel}</span></h3>
                      {cmp
                        ? <Badge variant="outline" className="gap-1 rounded-full font-semibold" style={{ background: up ? 'var(--good-soft)' : 'var(--bad-soft)', color: up ? 'var(--good)' : 'var(--bad)', borderColor: 'transparent' }} title={`ยอดจากออเดอร์ ${curLabel} เทียบ ${prevLabel} (ช่วงเท่ากัน · ไม่รวมมาร์เก็ตเพลส)`}><Icon name={up ? 'up' : 'down'} size={12} />{up ? '+' : '−'}{Math.abs(Math.round(dk.sales.d * 100))}% vs ออเดอร์ {prevLabel}</Badge>
                        : <Badge variant="secondary" className="rounded-full" style={{ color: 'var(--ink-4)' }}>ทั้งช่วงข้อมูล</Badge>}
                      {k.skuFilterActive && <Badge variant="outline" className="rounded-full font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'transparent' }}>ทั้งออเดอร์ที่มีลายนี้</Badge>}
                    </div>
                    <div className="num" style={{ fontSize: 'clamp(32px,3.8vw,50px)', fontWeight: 700, letterSpacing: '-1.6px', lineHeight: 1 }}><CountUp value={heroTotal} fmt={bR} duration={1100} /></div>
                    <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 6 }}>
                      {manualSales > 0 ? <>รวมมาร์เก็ตเพลส <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{bR(manualSales)}</b> · </> : null}
                      {/* ช่วงวันเดียว: "เฉลี่ย/วัน" = ยอดรวมเป๊ะๆ → ไม่ต้องโชว์ซ้ำ บอกแค่วันที่พอ */}
                      {heroStats.days > 1
                        ? <>เฉลี่ย <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{bR(heroTotal / heroStats.days)}/วัน</b> · {N(heroStats.days)} วัน</>
                        : <>{curLabel} · 1 วัน</>}
                      {k.skuFilterActive && <> · เฉพาะลายที่เลือก ≈ <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{baht(k.attrSales)}</b> · {N(k.attrQty)} ตัว</>}
                    </div>
                    {/* กราฟสะสม ส.ค. vs ก.ค. (แทน sparkline ที่ซ้ำกับกราฟรายวันข้างล่าง) — เห็นว่าเดือนนี้นำ/ตามตั้งแต่วันไหน
                        ซ่อนทั้งบล็อกเมื่อช่วงมี bucket เดียว (เช่นกรอง "วันนี้"): เส้นสะสมจุดเดียวไม่มีความหมาย
                        และการเทียบ "วันนี้ที่ยังไม่จบ" กับ "เมื่อวานเต็มวัน" ให้เลขหลอกตา (bug ที่ user เจอ) */}
                    {heroStats.cum.cur.length > 1 && <>
                    <div className="cap row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: 'var(--ink-3)', fontWeight: 600 }}>ยอดสะสมรายวัน</span>
                      <span className="row" style={{ gap: 5, color: 'var(--ink-4)' }}><span style={{ width: 14, borderTop: '2.4px solid var(--accent)' }} /> {curLabel}</span>
                      {cmp && heroStats.cum.prev && <span className="row" style={{ gap: 5, color: 'var(--ink-4)' }}><span style={{ width: 14, borderTop: '1.6px dashed var(--ink-4)' }} /> {prevLabel}</span>}
                      {cmp && heroStats.cum.prev && gran === 'day' && <span style={{ color: 'var(--ink-4)' }}>· ณ วันเดียวกัน {prevLabel} <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{bR(heroStats.cum.prevAtSame)}</b> → {heroStats.cum.cur.reduce((a, v) => a + v, 0) >= heroStats.cum.prevAtSame ? <span style={{ color: 'var(--good)', fontWeight: 600 }}>นำอยู่ {bR(heroStats.cum.cur.reduce((a, v) => a + v, 0) - heroStats.cum.prevAtSame)}</span> : <span style={{ color: 'var(--bad)', fontWeight: 600 }}>ตามอยู่ {bR(heroStats.cum.prevAtSame - heroStats.cum.cur.reduce((a, v) => a + v, 0))}</span>}</span>}
                    </div>
                    <div className="hero-chartwrap" style={{ minHeight: 180, marginTop: 4 }}>
                      <CumulativeCompare cur={heroStats.cum.cur} prev={cmp ? heroStats.cum.prev : null} labels={heroStats.cum.labels} tipLabels={heroStats.cum.tips}
                        curLabel={curLabel} prevLabel={prevLabel} todayIdx={heroStats.cum.todayIdx} fmt={bR} height={180} ariaLabel={`ยอดสะสม ${curLabel}${cmp ? ` เทียบ ${prevLabel}` : ''}`} />
                    </div>
                    </>}
                    {/* เทียบเดือนก่อน 2 แถบ (ยอดจากออเดอร์ ฐานเดียวกันทั้งคู่) · ไม่มีช่วงก่อน = เดือนขายดีสุด */}
                    {cmp
                      ? (() => { const cmax = Math.max(k.sales, dk.sales.prev, 1); return (
                          <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
                            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                              <span className="cap" style={{ flex: '0 0 110px', color: 'var(--ink-3)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="ยอดจากออเดอร์ (ไม่รวมมาร์เก็ตเพลส) — ฐานเดียวกันทั้ง 2 เดือน">ออเดอร์ {curLabel}</span>
                              <Progress value={k.sales / cmax * 100} indicatorColor="var(--accent)" className="h-2.5 flex-1" aria-label={`ยอดขาย ${curLabel}`} />
                              <span className="num cap" style={{ flex: '0 0 auto', minWidth: 80, textAlign: 'right', fontWeight: 700 }}>{bR(k.sales)}</span>
                            </div>
                            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                              <span className="cap" style={{ flex: '0 0 110px', color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="ยอดจากออเดอร์ (ไม่รวมมาร์เก็ตเพลส)">ออเดอร์ {prevLabel}</span>
                              <Progress value={dk.sales.prev / cmax * 100} indicatorColor="var(--ink-4)" className="h-2.5 flex-1" aria-label={`ยอดขาย ${prevLabel}`} />
                              <span className="num cap" style={{ flex: '0 0 auto', minWidth: 80, textAlign: 'right', color: 'var(--ink-4)' }}>{bR(dk.sales.prev)}</span>
                            </div>
                          </div>
                        ); })()
                      : heroStats.bestMonth && (
                          <div className="row" style={{ marginTop: 12, gap: 8, alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: 'var(--accent-soft)' }}>
                            <Icon name="star" size={15} style={{ color: 'var(--accent)' }} />
                            <span className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>เดือนขายดีสุด</span>
                            <span className="cap" style={{ color: 'var(--ink)', fontWeight: 700 }}>{heroStats.bestMonthLabel}</span>
                            <span className="num cap" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--accent)' }}>{baht(heroStats.bestMonth.sales)}</span>
                          </div>
                        )}
                    {/* สัดส่วนช่องทาง — แถบเดียว + legend (กด = กรองช่องทาง) · รายละเอียดอยู่การ์ด "ยอดต่อช่องทาง" ด้านล่าง (แทนการ์ด 6 ใบเดิมที่ซ้ำกัน) */}
                    {chanSegs.length > 0 && heroTotal > 0 && (
                      <div style={{ marginTop: 'auto', paddingTop: 14 }}>
                        <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)' }} role="img" aria-label={`สัดส่วนช่องทาง: ${chanSegs.map(g => `${g.key} ${Math.round(g.v / heroTotal * 100)}%`).join(' · ')}`}>
                          {chanSegs.map(g => <span key={g.key} title={`${g.key} · ${bR(g.v)} · ${Math.round(g.v / heroTotal * 100)}%`} style={{ width: `${g.v / heroTotal * 100}%`, background: g.color, minWidth: 2 }} />)}
                        </div>
                        <div className="row cap" style={{ gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
                          {chanSegs.map(g => g.pick
                            ? <button key={g.key} type="button" onClick={() => toggleFilter('channel', g.key)} title={`กรองช่องทาง ${g.key}`} className="row rounded-full border px-2 py-0.5 hover:bg-muted/50 transition-colors" style={{ gap: 5, color: 'var(--ink-3)', fontWeight: 600 }}>
                                <span style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />{g.key} <span className="num" style={{ color: 'var(--ink-4)', fontWeight: 500 }}>{Math.round(g.v / heroTotal * 100)}%</span>
                              </button>
                            : <span key={g.key} className="row px-2 py-0.5" style={{ gap: 5, color: 'var(--ink-4)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: g.color }} />{g.key} {Math.round(g.v / heroTotal * 100)}%</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* ขวา — เกจจังหวะทำยอด (เป้าเดือน · สโคปทั้งเดือน) */}
                  {/* เกจเป็นสโคป "ทั้งเดือน ทุกช่องทาง" เสมอ — ต้องบอกให้ชัดเมื่อผู้ใช้กรองอยู่
                      ไม่งั้นตอนไม่กรอง 2 เลขนี้ตรงกันพอดี → พอกรองแล้วต่างกัน คนอ่านว่าเลขผิด */}
                  {mt?.has
                    ? <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <TargetGauge mt={mt} />
                        {nFilters > 0 && (
                          <span className="cap" style={{ color: 'var(--ink-4)', textAlign: 'center', marginTop: -6 }}>
                            เกจนี้เป็นของ<b>ทั้งเดือน ทุกช่องทาง</b> — ไม่ตามตัวกรองด้านบน
                          </span>
                        )}
                      </div>
                    : <div className="hero-target" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}><span className="cap" style={{ color: 'var(--ink-4)' }}>{mt === null ? 'กำลังโหลดเป้าเดือน…' : `เดือน ${targetYm} อยู่ยุคก่อนรวมระบบ — ไม่มีเป้าเดือนในหน้านี้`}</span></div>}
                </div>
              </Card>
            );
          })()}

          {/* ===== เป้ารายช่องทาง — เกจเล็กต่อช่องทาง (เฉพาะที่ตั้งเป้า/งบแอดไว้) · สโคปทั้งเดือน (user ขอ 22 ส.ค.) ===== */}
          {mt?.has && (<>
            <SectionHead title="เป้ารายช่องทาง" sub={`${mt.label} ทั้งเดือน · ยอด vs เป้า · ค่าแอดใช้ไป/เหลือ · กดการ์ด = กรองช่องทาง`} right={<button type="button" className="cap text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }} onClick={() => goSection('settings', 'targets')}>ตั้งเป้า/งบแอด →</button>} />
            <ChannelTargetGrid mt={mt} onPick={toggleFilter} />
          </>)}

          {/* ===== ตัวชี้วัดหลัก — 8 การ์ดแบบเดียวกัน 2 แถว ทุกใบมีชิปเทียบช่วงก่อน (รื้อ 22 ส.ค. แทน 4 การ์ดใหญ่ + 3 MetricCard + 3 พิลล์) ===== */}
          <SectionHead title="ตัวชี้วัดหลัก" sub={`${curLabel} · ${N(heroStats.days)} วัน${cmp ? ` · ▲▼ เทียบ ${prevLabel}` : ''}`} right={<SourceBadge kind="analytics" align="right" />} />
          {hasLegacy && (
            <div className="cap" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 'var(--r-sm)', background: 'color-mix(in srgb, var(--info) 8%, transparent)', color: 'var(--ink-2)', marginTop: -2 }}>
              <Icon name="help" style={{ color: 'var(--info)', flex: 'none', marginTop: 1 }} />
              <span>
                ช่วงนี้มี <b>{N(legacyDays)} วัน</b> ที่เป็นยุคก่อนรวมระบบ (ก่อน 1 ส.ค. 69) — ยอดขาย ค่าแอด ออเดอร์ และคนทัก มาจาก<b>ตัวเลขที่กรอกรายวัน</b> ไม่มีออเดอร์รายใบให้เจาะ
                <br />ตัวชี้วัดที่ต้องใช้ใบจริง (ลายขายดี · จังหวัด · ขนาดตะกร้า · ประเภทงาน) จึงนับเฉพาะวันที่มีออเดอร์จริงเท่านั้น
              </span>
            </div>
          )}
          <div className="kpi8">
            {/* แถว 1 — การขาย */}
            {/* ช่วงที่รวมยุคเก่า: ชิป ▲▼ ต้องเทียบกับฐานเดียวกัน (ตารางของช่วงก่อน) */}
            <KpiCard index={0} label="ออเดอร์" tip="จำนวนออเดอร์ในช่วงที่เลือก (ตัดที่ยกเลิกออกแล้ว) · นับตามวันที่ออเดอร์" value={<CountUp value={k.orders} fmt={N} />}
              delta={dPct(k.orders, hasLegacy ? (prevTable?.total?.orders ?? prevA?.kpi.orders) : prevA?.kpi.orders)} sub={k.cancelled ? `ยกเลิก ${N(k.cancelled)} ออเดอร์` : 'ไม่มียกเลิก'}>
              <GradientSparkline data={heroStats.sparkOrders} height={26} color="var(--accent)" />
            </KpiCard>
            <KpiCard index={1} label="ยอดเฉลี่ย/ออเดอร์" tip="ยอดขาย ÷ จำนวนออเดอร์ (AOV)" value={baht(k.aov)} valueColor="var(--accent)"
              delta={dPct(k.aov, prevA?.kpi.aov)} sub={`${basketQty.toFixed(2)} ตัว/ออเดอร์ · ${baht(k.ppu)}/ตัว`} />
            <KpiCard index={2} label={'ตัวที่ขาย' + (k.skuFilterActive ? ' (เฉพาะลาย)' : '')} tip="จำนวนเสื้อ/ชิ้นที่ขายในช่วง (จากรายการสินค้าในออเดอร์)" value={N(k.skuFilterActive ? k.attrQty : k.qty)} valueColor="var(--good)" tone="var(--good)"
              delta={dPct(k.skuFilterActive ? k.attrQty : k.qty, prevA ? (k.skuFilterActive ? prevA.kpi.attrQty : prevA.kpi.qty) : null)}
              sub={k.skuFilterActive ? `${N(k.qty)} ตัวรวมทั้งออเดอร์` : k.big > 0 ? `ก้อนใหญ่ ${N(k.big)} ออเดอร์ · ${Math.round(k.bigPct * 100)}% (≥11 ตัว)` : 'ไม่มีออเดอร์ก้อนใหญ่ (≥11 ตัว)'} />
            <KpiCard index={3} label="COD" tip="สัดส่วนออเดอร์เก็บเงินปลายทาง · ที่เหลือ = โอน/อื่นๆ" value={`${Math.round(k.codPct * 100)}%`} tone="var(--warn)"
              delta={dPt(k.codPct * 100, prevA ? prevA.kpi.codPct * 100 : null, { neutral: true })} sub={`${N(k.codO)} ออเดอร์ · ${baht(codSales)} · โอน ${Math.round(transferShare * 100)}%`}>
              <div style={{ display: 'flex', height: 7, borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'var(--surface-3)' }} role="img" aria-label={`COD ${Math.round(k.codPct * 100)}%`}>
                <span style={{ width: `${k.codPct * 100}%`, background: 'var(--warn)' }} />
              </div>
            </KpiCard>

            {/* แถว 2 — ลูกค้า / คนทัก */}
            <KpiCard index={4} label="คนทัก" tip="จำนวนคนที่ทักเข้ามาในช่วง (จากที่เซลล์กรอก) · แถบ = ใหม่ / เก่า / ไม่ระบุ" value={leadView ? <CountUp value={leadView.totalLeads} fmt={N} /> : funnelClose ? <CountUp value={funnelClose.totalLeads} fmt={N} /> : '—'} tone="var(--info)"
              delta={funnelClose && prevFunnel ? dPct(funnelClose.totalLeads, prevFunnel.totalLeads) : null}
              sub={leadView ? `รวมที่กรอกรายวันยุคเก่า · ทักใหม่/เก่าแยกได้เฉพาะช่วงที่มีตารางคนทัก` : funnelClose ? `ทักใหม่ ${N(funnelClose.n)} · เก่า ${N(funnelClose.o)}${funnelClose.u ? ` · ไม่ระบุ ${N(funnelClose.u)}` : ''}` : 'ยังไม่มีข้อมูลคนทัก'}>
              {funnelClose && funnelClose.totalLeads > 0 && (() => { const t = funnelClose.totalLeads; const sg = (v) => (v / t * 100); return (
                <div style={{ display: 'flex', height: 7, borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'var(--surface-3)' }} role="img" aria-label={`ทักใหม่ ${funnelClose.n} เก่า ${funnelClose.o}`}>
                  <span style={{ width: sg(funnelClose.n) + '%', background: 'var(--info)' }} />
                  <span style={{ width: sg(funnelClose.o) + '%', background: 'var(--accent-soft)' }} />
                </div>
              ); })()}
            </KpiCard>
            <KpiCard index={5} label="%ปิดการขาย" tip="ออเดอร์ช่องแชท (FB/LINE/IG/TikTok/โทร) ÷ คนทัก · ตัดออเดอร์มาร์เก็ตเพลสที่ไม่มีการทัก · เกณฑ์ดี ≥ 15%" value={leadView ? `${leadView.pct}%` : funnelClose ? `${funnelClose.pct}%` : '—'} valueColor={closeTone((leadView || funnelClose)?.pct)} tone={(leadView || funnelClose) ? closeTone((leadView || funnelClose).pct) : 'var(--ink-4)'}
              delta={funnelClose && prevFunnel ? dPt(funnelClose.pct, prevFunnel.pct) : null}
              sub={leadView ? `ปิด ${N(leadView.closed)} / ${N(leadView.totalLeads)} คนทัก · เกณฑ์ ≥ 15%`
                : funnelClose ? `ปิด ${N(funnelClose.orders)} / ${N(funnelClose.totalLeads)} คนทัก · เกณฑ์ ≥ 15%` : 'ยังไม่มีข้อมูลคนทัก'}>
              {/* ⚠️ ข้างในต้องใช้ pct (ที่มาจาก leadView || funnelClose) เท่านั้น — ห้ามอ้าง funnelClose ตรง ๆ
                  guard เป็น "อย่างใดอย่างหนึ่ง" → ช่วงยุคเก่าที่ไม่มีแถวคนทักเลย funnelClose เป็น null
                  แต่ leadView มีค่า (คนทักมาจาก inq ที่กรอกรายวัน) → เดิม null deref = รายงานขายจอขาวทั้งหน้า */}
              {(leadView || funnelClose) && (() => { const pct = (leadView || funnelClose).pct; const scale = 30; const p = Math.min(100, pct / scale * 100); return (
                <div style={{ position: 'relative', height: 7, borderRadius: 'var(--r-pill)', background: 'var(--surface-3)', overflow: 'visible' }} role="img" aria-label={`ปิดการขาย ${pct}% เกณฑ์ 15%`} title="แถบเต็ม = 30% · ขีด = เกณฑ์ 15%">
                  <span style={{ position: 'absolute', inset: 0, width: `${p}%`, borderRadius: 'var(--r-pill)', background: closeTone(pct) }} />
                  <span style={{ position: 'absolute', left: `${15 / scale * 100}%`, top: -3, width: 2, height: 13, background: 'var(--ink-3)', borderRadius: 1 }} />
                </div>
              ); })()}
            </KpiCard>
            <KpiCard index={6} label="ลูกค้าใหม่" tip="% ออเดอร์จากลูกค้าที่ซื้อครั้งแรก (ในช่วงที่เลือก) · แถบ = ใหม่ / เก่า / ไม่ทราบ" value={<CountUp value={Math.round(k.newPct * 100)} fmt={(v) => `${Math.round(v)}%`} />} tone="var(--accent-2)"
              delta={dPt(k.newPct * 100, prevA ? prevA.kpi.newPct * 100 : null)} sub={`ใหม่ ${N(k.newC)} · เก่า ${N(k.oldC)}${unknownC ? ` · ไม่ทราบ ${N(unknownC)}` : ''}`}>
              <div style={{ display: 'flex', height: 7, borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'var(--surface-3)' }} role="img" aria-label={`ลูกค้าใหม่ ${k.newC} เก่า ${k.oldC}`}>
                <span style={{ width: seg(k.newC) + '%', background: 'var(--accent-2)' }} />
                <span style={{ width: seg(k.oldC) + '%', background: 'var(--accent-soft)' }} />
              </div>
            </KpiCard>
            <KpiCard index={7} label="ลูกค้า" tip="จำนวนลูกค้าไม่ซ้ำ (ตามรหัสลูกค้า) ในช่วง · ซื้อซ้ำ = ลูกค้าที่สั่งมากกว่า 1 ครั้งในช่วงนี้" value={N(k.nCustomers)}
              delta={dPct(k.nCustomers, prevA?.kpi.nCustomers)} sub={`ซื้อซ้ำในช่วง ${Math.round(heroStats.repeatRate * 100)}% · เฉลี่ย ${baht(k.nCustomers ? k.sales / k.nCustomers : 0)}/คน`} />
          </div>
        </>;
      })()}

      {/* ===== แท็บ ===== */}
      <div className="dashboard-spacer" />
      <Tabs value={tab} onValueChange={setTab}>
        {/* PART 98: ยุบ 7→4 แท็บ · ช่องทาง→ภาพรวม · พื้นที่→สินค้า · อันดับเซลล์เอาออก (มีในหน้าประสิทธิภาพเซล) */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">ภาพรวม</TabsTrigger>
            <TabsTrigger value="funnel">คนทัก & ปิดการขาย</TabsTrigger>
            <TabsTrigger value="customer">ลูกค้า & CRM</TabsTrigger>
            <TabsTrigger value="variant">สินค้า & พื้นที่</TabsTrigger>
            <TabsTrigger value="ads">โฆษณา</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      {/* ===== S1 เทรนด์ ===== */}
      {tab === 'overview' && trendByChannel && <OverviewTab ctx={{ A, prevA, cmp, trendByChannel, gran, curLabel, prevLabel, toggleFilter, setDayPay }} />}

      {/* ===== ช่องทาง — ย้ายเข้า "ภาพรวม" (PART 98) ===== */}
      {/* PART 103: ตารางช่องทางรวม (ยอด+คนทัก+ลูกค้า+%ปิด ที่เดียว) — มาแทนการ์ดช่องทางของหน้ายอดขายเดิม */}
      {/* เป้าเดือน — การ์ดถาวร ไม่ผูกกับช่วงที่เลือก (แก้บั๊ก "ตั้งเป้าแล้วไม่โชว์" ตอนดู MTD/30วัน) */}
      {/* ยอดต่อช่องทาง (ซ้าย) + ยอดรายวันแยกการชำระ (ขวา) — 2 คอลัมน์บนจอกว้าง · พับบน-ล่างจอแคบ */}
      {tab === 'overview' && mergedTable && (
        <div className="content-inner grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch" style={{ paddingTop: 0 }}>
          <MergedChannelTable table={mergedTable} onPick={toggleFilter} />
          {A && <DailyPaymentTable orders={A._ords} onDayClick={setDayPay} />}
        </div>
      )}
      {/* ลายขายดี (80/20 + เทียบช่วงก่อน + สีขายดี) + สัดส่วน (ประเภทงาน/หมวด/สี) — รื้อจาก 8 การ์ดเดิม (22 ส.ค.) */}
      {tab === 'overview' && A && <div className="content-inner" style={{ paddingTop: 0 }}><ProductsBlock A={A} prevA={prevA} cmp={cmp} prevLabel={prevLabel} toggleFilter={toggleFilter} /></div>}
      {tab === 'overview' && manualAgg.notes.length > 0 && <div className="content-inner" style={{ paddingTop: 0 }}><NotesStrip notes={manualAgg.notes} /></div>}
      {/* D15 (user ตอบ ข): YoY + ไตรมาส อยู่ในแท็บภาพรวมของรายงานขาย — ปีอิงช่วงที่เลือก */}
      {tab === 'overview' && range.to && <div className="content-inner" style={{ paddingTop: 0 }}><LongTermSection yearBE={Number(String(range.to).slice(0, 4)) + 543} /></div>}
      {/* PART 103: OverviewChannels เดิมถูกแทนด้วย MergedChannelTable ด้านบน — เอาออกกันโชว์ตารางช่องทางซ้ำ 2 ชุด */}

      {/* ===== S4 สินค้า (สี & ไซซ์) + พื้นที่ — PART 98 ===== */}
      {tab === 'variant' && <VariantTab ctx={{ A, f, toggleFilter }} />}

      {/* ===== S6 ลูกค้า ===== */}
      {/* PART 103: เติมแท็บลูกค้า — ซื้อซ้ำ/CLV/ใหม่-เก่าต่อช่องทาง (ตามที่ user ขอให้มีครบ) */}
      {tab === 'customer' && <CustomerTab ctx={{ A, prevA, cmp, curLabel, prevLabel, range, prevRange: cmp ? prevRange : null, gran, crmNotes, crmTargets, crmTeam, mergedTable, prevTable: cmp ? prevTable : null, mt, custInsight, toggleFilter, setDayPay, setCustDetail }} />}
      {tab === 'ads' && <div className="content-inner"><AdsTab table={mergedTable} prevTable={cmp ? prevTable : null} dailyRows={dailyInRange} prevDailyRows={cmp ? dailyPrev : []} mt={mt} range={range} prevRange={cmp ? prevRange : null} gran={gran} cmp={cmp} curLabel={curLabel} prevLabel={prevLabel}
        ords={A._ords} replyMins={manualAgg.replyMins} notes={manualAgg.notes} toggleFilter={toggleFilter} setDayPay={setDayPay} onOpenEntry={busIsAdmin() ? () => setEntryOpen(true) : undefined} /></div>}

      {/* ===== S7 พื้นที่ — ย้ายเข้า "สินค้า & พื้นที่" (PART 98) · drill จังหวัด→ลาย→สี + pivot + มุมมองประเทศ ===== */}
      {tab === 'variant' && A && (<>
        <SectionHead title="พื้นที่การขาย" sub="จังหวัด → ลาย → สี · แผนที่ + ตาราง" />
        <GeoPanel ords={A._ords} skus={A._skus} prevOrds={prevA?._ords || []} prevSkus={prevA?._skus || []} cmp={cmp} prevLabel={prevLabel} selected={f.province} onFilter={toggleFilter} />
      </>)}

      {/* PART 109: แท็บ "อันดับเซลล์" ถูกลบ — ไม่มีปุ่มเข้ามาตั้งแต่ PART 103 (โค้ดตาย) และซ้ำกับ
          "ตารางอันดับเซลล์" ในหน้าประสิทธิภาพเซลที่ใช้งานจริง → ลบไฟล์ saleDashboardTeam.jsx ทิ้ง */}

      {/* ===== S?: คนทัก & ปิดการขาย (funnel) ===== */}
      {tab === 'funnel' && <FunnelTab ctx={{ A, prevA, f, funnel, range, prevRange, gran, cmp, curLabel, prevLabel, mergedTable, manualAgg, toggleFilter, setDayPay }} />}

      {drill && <DrillModal drill={drill} orders={orders} skus={skus} eff={eff} onClose={() => setDrill(null)} />}
      {custDetail && A && <CustomerDrawer cust={custDetail} ords={A._ords} skus={A._skus} onClose={() => setCustDetail(null)} />}
      {/* ปุ่มลอยมุมขวาล่าง แบบเดียวกับ "ส่งยอด" ในประสิทธิภาพเซล (คำสั่ง user) · จุดแดง = วันนี้ยังไม่กรอกค่าแอด */}
      {busIsAdmin() && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-7 sm:right-7 print:hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          <QuickFab icon="pencil" label="กรอกค่าแอด" tone="ads" dot={!adEnteredToday} dotTitle="วันนี้ยังไม่ได้กรอกค่าแอด" onClick={() => setEntryOpen(true)} />
        </div>, document.body)}
      {celebrate && mt && <CelebrationOverlay amount={mt.sales} target={mt.target} pct={mt.target > 0 ? mt.sales / mt.target * 100 : 100} onClose={() => setCelebrate(false)} />}
      {entryOpen && <SideSheet size="md" icon="pencil" title="กรอกค่าแอด & ยอดมาร์เก็ตเพลส" sub="รายวัน · เฉพาะแอดมิน — ยอดขาย/ออเดอร์/คนทัก ระบบดึงเองจากใบเสร็จ" confirmOnClose={entryDirty} onClose={() => { setEntryOpen(false); setEntryDirty(false); }}>
        <Suspense fallback={null}><SalesDailyEntry onDirtyChange={setEntryDirty} onSaved={(d) => { setEntryDirty(false); setEntryOpen(false); busToast(`บันทึกค่าแอด ${bucketLabel(d, 'day')} แล้ว`, 'success'); }} /></Suspense>
      </SideSheet>}
      {dayPay && A && (() => {
        const dOrds = (A._ords || []).filter(o => o.order_date === dayPay);
        const dSales = dOrds.reduce((s, o) => s + (Number(o.sales) || 0), 0);
        return <SideSheet size="lg" icon="calendarDays" title={bucketLabel(dayPay, 'day')} sub={`${N(dOrds.length)} ออเดอร์ · ${baht(dSales)} · เจาะจากยอดรายวัน`} onClose={() => setDayPay(null)}>
        <DashDayDetail dateISO={dayPay} ords={A._ords} skus={A._skus}
          funnelRows={(funnel || []).filter(r => r.date === dayPay && (!f.salesperson.length || f.salesperson.includes(r.salesperson)))}
          onChangeDate={setDayPay}
          onPickCustomer={(o) => setCustDetail(custFromOrders(o, A._ords))} />
      </SideSheet>;
      })()}
      {importOpen && <MpImportModal onClose={() => setImportOpen(false)} onDone={() => { clearSaleCache(); setReloadKey(k => k + 1); }} />}
    </div>
  );
}
