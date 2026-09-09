import { useState, useEffect, useMemo, Fragment } from 'react';
import { B, N, Icon, PersonAvatar, Skel, useDelayedFlag } from './components.jsx';
import { channelColor } from './charts.jsx';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { mergeOrderOverrides, resolveSkuDesigns, ORDER_OV_KEY } from './lib/saleOverrides.js';
import { deriveColorSize } from './lib/mpReport.js';
import { usePersistedState } from './hooks/usePersistedState.js';
import { useTableSort, SortHead, ColumnToggle, CardTable } from './components/DataTableParts.jsx';
import { supabase } from './lib/supabaseClient.js';
import { cachedFetchRange, getDateBounds, invalidateSaleCache, ORDERS_SEL, SKUS_SEL } from './lib/saleData.js';
import { restoreReceipt, deleteOrders, voidReceipts } from './lib/receiptSubmit.js';
import { useSaleRealtime } from './lib/saleRealtime.js';
import { ManualSaleSheet } from './ManualSaleSheet.jsx';
import { useUser } from './userContext.jsx';
import { useData } from './dataContext.jsx';
import { useRenderCount } from './realtime/useRenderCount.js';
import { isAdmin, orderVisibleTo } from './lib/roleAccess.js';
import { PRESETS, presetRange } from './lib/saleTime.js';
import { logAudit } from './lib/audit.js';
import { todayISO, THAI_MONTHS } from './lib/dateUtils.js';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox as ShadcnCheckbox } from '@/components/ui/checkbox';
import { SearchInput } from '@/components/ui/search-input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { MultiSelect, DateRangePicker, _pageList } from './saleWidgets.jsx';
import { OrderDrawer } from './orderDrawer.jsx';
import { canEdit as appCanEdit, toast, confirm, userName, userEmail } from './lib/appBus.js';


function OrdersSkeleton() {
  // คอลัมน์จริง: ออเดอร์/วันที่/ช่องทาง/ลูกค้า(avatar)/ลาย/งาน/ชำระ/สถานะ/หมายเหตุ/ตัว/ยอด — นำด้วย checkbox ปิดท้ายด้วยลูกศร
  const W = ['62%', '58%', '66%', '80%', '60%', '40%', '46%', '34%', '30%', '28%', '54%'];
  const CUST = 3; // คอลัมน์ลูกค้า (กว้างกว่า + มี avatar)
  return (
    <div className="content-inner rise">
      {/* toolbar แถวเดียว: ชื่อ + ช่วงวัน + ตัวกรอง · (ขวา) ค้นหา + คอลัมน์ + เพิ่มออเดอร์ */}
      <Card className="p-[22px] mb-4">
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Skel w={64} h={16} />
          <Skel w={150} h={30} r={8} />
          <Skel w={80} h={30} r={8} />
          <Skel w={158} h={32} r={8} style={{ marginLeft: 'auto' }} />
          <Skel w={84} h={32} r={8} />
          <Skel w={116} h={32} r={8} />
        </div>
      </Card>
      {/* ตาราง: checkbox + 11 คอลัมน์ (ลูกค้า=avatar+2บรรทัด) + ลูกศร · แถวจางลงให้รู้สึกมีของ */}
      <Card className="p-[22px]">
        <div style={{ display: 'grid', gap: 13 }}>
          <div className="row" style={{ gap: 14, alignItems: 'center' }}>
            <Skel w={16} h={16} r={4} />
            {W.map((w, i) => <div key={i} style={{ flex: i === CUST ? 1.5 : 1 }}><Skel w={w} h={11} /></div>)}
            <Skel w={14} h={14} r={4} />
          </div>
          {Array.from({ length: 10 }).map((_, r) => (
            <div key={r} className="row" style={{ gap: 14, alignItems: 'center', opacity: Math.max(0.3, 1 - r * 0.072) }}>
              <Skel w={16} h={16} r={4} />
              {W.map((w, i) => i === CUST
                ? <div key={i} className="row" style={{ flex: 1.5, gap: 8, alignItems: 'center' }}><Skel w={22} h={22} r="50%" style={{ flexShrink: 0 }} /><div style={{ flex: 1 }}><Skel w="72%" h={12} /><Skel w="46%" h={8} style={{ marginTop: 5 }} /></div></div>
                : <div key={i} style={{ flex: 1 }}><Skel w={w} h={13} /></div>)}
              <Skel w={14} h={14} r={4} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}


// (PART 81) เลิก fork OrderDatePicker — ใช้ DateRangePicker กลางจาก saleWidgets (เพิ่ม min/max รองรับแล้ว)


// คอลัมน์ตารางออเดอร์ (สำหรับ ColumnToggle) — ออเดอร์/ยอดขาย ล็อกไว้เสมอ
const ORDERS_COLS = [
  { key: 'order_no', label: 'ออเดอร์', locked: true },
  { key: 'date', label: 'วันที่' },
  { key: 'channel', label: 'ช่องทาง' },
  { key: 'customer', label: 'ลูกค้า' },
  { key: 'designs', label: 'ลายเสื้อ' },
  { key: 'job', label: 'งาน' },
  { key: 'payment', label: 'การชำระ' },
  { key: 'status', label: 'สถานะ' },
  { key: 'note', label: 'หมายเหตุ' },
  { key: 'qty', label: 'ตัว' },
  { key: 'sales', label: 'ยอดขาย', locked: true },
];
// accessor สำหรับ useTableSort (ตัวเลข vs ข้อความ — null ไปท้าย)
const ORDERS_SORT = {
  order_no: (o) => o.order_no || '',
  date: (o) => o.order_date || o.order_month || '',
  channel: (o) => o.channel || '',
  customer: (o) => o.customer_name || o.customer_code || '',
  payment: (o) => o.payment_type || '',
  qty: (o) => Number(o.qty) || 0,
  sales: (o) => Number(o.sales) || 0,
};

function MpOrdersView() {
  useRenderCount('orders'); // Phase 0 baseline (dev-only)
  const { staff } = useData();   // รายชื่อทีม → ตัวเลือกเซลล์ใน SellerCombobox (แพทเทิร์นเดียวกับ funnelSellers หน้า ส่งยอด)
  const [orders, setOrders] = useState(null);
  const [rawSkus, setRawSkus] = useState([]);          // SKU ดิบจาก DB (frozen) — resolve ตอนแสดงผล
  const [resolverMaps, setResolverMaps] = useState(null);  // catalog/alias/override สด (null = ยังไม่โหลด)
  const [orderOv, setOrderOv] = useState({});          // override ระดับออเดอร์ (job_type/ลูกค้า/เซลล์) keyed by source:order_no
  const [err, setErr] = useState('');
  const [bounds, setBounds] = useState({ min: null, max: null });
  const [range, setRange] = useState({ from: null, to: null }); // null = ยังไม่ตั้ง (รอขอบวันที่)
  const [channelF, setChannelF] = useState([]);
  const [jobF, setJobF] = useState([]);
  const [sellerF, setSellerF] = useState([]);
  const [statusF, setStatusF] = useState([]);   // ['ใช้งาน','ยกเลิก'] · ว่าง = ทั้งหมด
  const [payF, setPayF] = useState([]);          // การชำระ (โอน/COD/…) · ว่าง = ทั้งหมด
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [addOpen, setAddOpen] = useState(false); // เปิด sheet เพิ่มออเดอร์เอง
  const { user } = useUser();
  // มองเห็นออเดอร์ตาม "สิทธิการเข้าถึง" (role): ผู้ดูแลระบบ(admin) = เห็นทุกออเดอร์
  // แก้ไขได้(editor) + ดูอย่างเดียว(viewer) = เห็นเฉพาะของตัวเอง (salesperson = ชื่อ/อีเมลตัวเอง)
  // ผูกกับ user.role ตรงๆ (reactive · ไม่พึ่ง window.__isAdmin ที่เซ็ตใน effect อาจ lag รอบแรก)
  const canSeeAll = isAdmin(user);
  const PER_PAGE = 50;
  const [page, setPage] = useState(1);
  const [selSet, setSelSet] = useState(() => new Set()); // เลือกหลายออเดอร์ (order_no) สำหรับ action รวดเร็ว
  const [bulkBusy, setBulkBusy] = useState(false);
  const canEdit = appCanEdit();
  const [density] = usePersistedState('tmk-orders-density', 'cozy');
  // default ซ่อน วันที่/งาน/สถานะ/หมายเหตุ (รื้อ UI 22 ส.ค.: 3 คอลัมน์นี้ว่าง "—" เกือบทุกแถว · วันที่ไปอยู่แถวคั่นวัน) — เปิดคืนได้จาก "คอลัมน์" · key ใหม่ไม่ทับค่าที่ user เคยตั้ง
  const [hiddenCols, setHiddenCols] = usePersistedState('tmk-orders-hiddenCols-v2', ['date', 'job', 'status', 'note']);
  const colVisible = useMemo(() => new Set(ORDERS_COLS.map(c => c.key).filter(k => !hiddenCols.includes(k))), [hiddenCols]);
  const toggleCol = (k) => setHiddenCols(hc => hc.includes(k) ? hc.filter(x => x !== k) : [...hc, k]);

  const [reloadKey, setReloadKey] = useState(0);   // bump หลังแก้/ยกเลิก/ลบออเดอร์ → refetch สด

  // ขอบวันที่ของข้อมูล + ตั้งช่วงเริ่มต้น = เดือนปัจจุบันจริง (anchor วันจริง · ยุค realtime)
  useEffect(() => { (async () => {
    const b = await getDateBounds('tmk_mp_orders');
    setBounds({ min: b.min, max: b.max });
    if (b.max) { const r = presetRange('month', todayISO(), b.min, b.max); setRange({ from: r.from, to: r.to }); }
    else { setOrders([]); setRawSkus([]); }   // ตารางว่างทั้งระบบ → โชว์ empty-state (ไม่ค้าง skeleton)
  })(); }, [reloadKey]);

  // โหลดออเดอร์ตามช่วงวันที่ที่เลือก (server-side, มีแคช) — เปลี่ยนช่วงค่อยโหลดเฉพาะส่วน
  useEffect(() => {
    if (!range.from || !range.to) return; // รอขอบวันที่
    let cancel = false;
    (async () => {
      setOrders(null); setErr('');
      const o = await cachedFetchRange('tmk_mp_orders', ORDERS_SEL, range.from, range.to);
      if (cancel) return;
      if (o.error) { setErr(o.error.message || ''); setOrders([]); return; }
      const s = await cachedFetchRange('tmk_mp_skus', SKUS_SEL, range.from, range.to);
      if (cancel) return;
      setRawSkus(s.error ? [] : s.data || []);
      // คงออเดอร์ยกเลิกไว้ในลิสต์ (โชว์ dim + ชิป · กรองด้วยตัวกรองสถานะ) — ไม่กระทบรายงาน (saleAgg กรอง cancelled เอง)
      setOrders((o.data || []).sort((a, b) => (b.order_date || '').localeCompare(a.order_date || '')));
    })();
    return () => { cancel = true; };
  }, [range.from, range.to, reloadKey]);

  // โหลด map สด (catalog/alias/override + override ระดับออเดอร์) → live-resolve + apply override (กับดัก reimport)
  const reloadOverrides = async () => {
    const m = await loadResolverMaps(supabase); setResolverMaps(m);
    try { const r = await supabase.from('tmk_order_overrides').select('*'); const map = {}; if (!r.error) (r.data || []).forEach(x => { map[x.order_id] = x; }); setOrderOv(map); } catch { setOrderOv({}); }
  };
  // reload เต็ม (orders + skus + overrides) — ใช้หลังแก้ตรง/ยกเลิก/ลบ จาก drawer
  const reloadAll = () => {
    // reloadAll ใช้ทั้ง realtime-receive + หลังเซฟ — bust cache แต่ไม่ mark (การเขียนจริง mark เองแล้ว · กัน "หูหนวก" ต่อ event คนอื่น)
    // ล้าง override/funnel cache ด้วย (dashboard/perf โหลดผ่าน cachedFetchAll TTL 5 นาที) → แก้ override แล้วหน้าอื่นเห็นสด
    invalidateSaleCache('tmk_mp_orders', { mark: false }); invalidateSaleCache('tmk_mp_skus', { mark: false });
    invalidateSaleCache('tmk_order_overrides', { mark: false }); invalidateSaleCache('tmk_sales_funnel', { mark: false });
    setReloadKey(k => k + 1); reloadOverrides();
  };
  // realtime: ออเดอร์/รายการ/override เปลี่ยนที่ไหน (คนอื่นเพิ่ม/แก้/ยกเลิก/ลบ · ส่งยอดใบเสร็จ) → ตารางเด้งสด
  useSaleRealtime(['tmk_mp_orders', 'tmk_mp_skus', 'tmk_order_overrides', 'tmk_sale_receipts'], reloadAll);
  useEffect(() => { let cancel = false; (async () => { const m = await loadResolverMaps(supabase); if (cancel) return; setResolverMaps(m); try { const r = await supabase.from('tmk_order_overrides').select('*'); if (cancel) return; const map = {}; if (!r.error) (r.data || []).forEach(x => { map[x.order_id] = x; }); setOrderOv(map); } catch { /* ตารางยังไม่มี */ } })(); return () => { cancel = true; }; }, []);
  const orderOvKey = ORDER_OV_KEY;

  // ── เลือกหลายออเดอร์ + action รวดเร็ว (ยกเลิก/นำกลับ/ลบถาวร) ─────────────
  const isRcpt = (o) => (o.source || '') === 'shipnity';
  const toggleSel = (no) => setSelSet(s => { const n = new Set(s); n.has(no) ? n.delete(no) : n.add(no); return n; });
  const runBulk = async (kind) => {
    if (!canEdit) { toast('บัญชีนี้เป็นสิทธิ์ "ดูอย่างเดียว"', 'warn'); return; }
    const rows = (ordersM || []).filter(o => selSet.has(o.order_no) &&
      (kind === 'cancel' ? o.status !== 'cancelled' : kind === 'restore' ? o.status === 'cancelled' : true));
    if (!rows.length) return;
    const meta = {
      cancel: { title: `ยกเลิก ${rows.length} ออเดอร์`, body: 'ยอดจะถูกตัดออกจากรายงานทันที (ส่งใบเสร็จซ้ำได้)', danger: true, confirmText: 'ยกเลิก' },
      restore: { title: `นำ ${rows.length} ออเดอร์กลับมา`, body: 'ยอดจะกลับเข้ารายงานทันที', confirmText: 'นำกลับมา' },
      remove: { title: `ลบ ${rows.length} ออเดอร์ถาวร`, body: 'รายการสินค้า/ใบเสร็จจะถูกลบด้วย — ย้อนกลับไม่ได้', danger: true, confirmText: 'ลบถาวร' },
    }[kind];
    if (!await confirm(meta)) return;
    setBulkBusy(true);
    const by = userName() || userEmail() || '';
    // จัดกลุ่มตาม source (batch/RPC ทีเดียวต่อกลุ่ม แทน loop ทีละแถว)
    // ⚠️ ตารางร่วม: แถวที่ไม่มี source ห้ามเหมารวมเป็นกลุ่ม '' — กลุ่ม '' ทำให้ deleteOrders ลบข้ามช่องทาง
    //    และ .eq('source','') ก็ไม่แมตช์แถวที่เป็น NULL → อัปเดตเงียบ 0 แถว · คัดออกแล้วนับเป็น fail ให้ผู้ใช้เห็น
    const noSrc = rows.filter(o => !o.source);
    const bySource = (rs) => { const m = new Map(); rs.filter(o => o.source).forEach(o => { const s = o.source; (m.get(s) || m.set(s, []).get(s)).push(o); }); return m; };
    const nosOf = (rs) => rs.map(o => o.order_no);
    let fail = noSrc.length; // แถวไม่มี source = ทำไม่ได้ (ข้ามอย่างปลอดภัย ไม่เดาช่องทาง)
    if (noSrc.length) console.warn('[orders] ข้ามแถวที่ไม่มี source:', noSrc.map(o => o.order_no));
    try {
      if (kind === 'remove') {
        for (const [src, g] of bySource(rows)) await deleteOrders(nosOf(g), { source: src, overrideIds: g.map(orderOvKey) });
        logAudit({ action: 'delete', entityType: 'order', entityName: `${rows.length} ออเดอร์`, summary: `ลบถาวร ${rows.length} ออเดอร์` });
      } else if (kind === 'cancel') {
        const rc = rows.filter(isRcpt), other = rows.filter(o => !isRcpt(o));
        if (rc.length) await voidReceipts(nosOf(rc), { by, reason: 'ยกเลิกจากหน้าออเดอร์ (เลือกหลายรายการ)' });
        for (const [src, g] of bySource(other)) { const { error } = await supabase.from('tmk_mp_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).in('order_no', nosOf(g)).eq('source', src); if (error) throw error; }
        logAudit({ action: 'delete', entityType: 'order', entityName: `${rows.length} ออเดอร์`, summary: `ยกเลิก ${rows.length} ออเดอร์` });
      } else { // restore
        const rc = rows.filter(isRcpt), other = rows.filter(o => !isRcpt(o));
        for (const o of rc) { try { await restoreReceipt({ order_no: o.order_no }, { by }); } catch { fail++; } } // ใบเสร็จ: ต้องสร้าง sku คืน (client · กันเคสแถวหาย)
        for (const [src, g] of bySource(other)) { const { error } = await supabase.from('tmk_mp_orders').update({ status: 'active', updated_at: new Date().toISOString() }).in('order_no', nosOf(g)).eq('source', src); if (error) throw error; }
        logAudit({ action: 'update', entityType: 'order', entityName: `${rows.length} ออเดอร์`, summary: `นำ ${rows.length} ออเดอร์กลับมา` });
      }
    } catch (e) { fail = fail || rows.length; toast('ทำรายการไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    setBulkBusy(false);
    setSelSet(new Set());
    const okN = rows.length - fail;
    if (okN > 0) toast(`${meta.confirmText} ${okN} ออเดอร์${fail ? ` · ล้มเหลว ${fail}` : ''}`, fail ? 'warn' : 'success');
    invalidateSaleCache('tmk_mp_orders'); invalidateSaleCache('tmk_mp_skus');
    reloadAll();
  };

  // resolver จาก map สด — เปลี่ยน catalog/alias/override แล้ว recompute (ไม่ต้อง reimport)
  const resolver = useMemo(() => makeSkuResolver(resolverMaps || {}), [resolverMaps]);
  // ออเดอร์ที่ merge override ระดับออเดอร์ทับค่า frozen (job_type/ลูกค้า/เซลล์/ยอด ที่แก้ในเว็บ) — helper กลาง saleOverrides
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- ต้องคง memo: merge override ทั้งลิสต์ออเดอร์ (หลักพันแถว) + identity ที่เสถียรคือ input ของ filtered/useTableSort ข้างล่าง ถ้าเปลี่ยนทุก render ตารางจะ re-sort กระตุก
  const ordersM = useMemo(() => mergeOrderOverrides(orders, orderOv), [orders, orderOv]);
  // SKU แยกตามออเดอร์ — resolve ชื่อลาย/รหัสสด + derive สี/ไซซ์ตอน override (helper กลาง) แล้ว group ตามออเดอร์
  const skusByOrder = useMemo(() => {
    const byO = {};
    resolveSkuDesigns(rawSkus, resolver, { deriveColorSize }).forEach(s2 => {
      (byO[s2.order_no] = byO[s2.order_no] || []).push(s2);
    });
    return byO;
  }, [rawSkus, resolver]);
  // active preset (ให้ปฏิทินไฮไลต์) + ตัวจัดการเลือก preset/ช่วงเอง
  const activePreset = useMemo(() => { if (!bounds.max) return ''; for (const [id] of PRESETS) { const r = presetRange(id, todayISO(), bounds.min, bounds.max); if (range.from === r.from && range.to === r.to) return id; } return ''; }, [range.from, range.to, bounds.min, bounds.max]);
  const pickPreset = (id) => { const r = presetRange(id, todayISO(), bounds.min, bounds.max); setRange({ from: r.from, to: r.to }); };
  const channels = useMemo(() => [...new Set((ordersM || []).map(o => o.channel).filter(Boolean))], [ordersM]);
  const sellers = useMemo(() => [...new Set((ordersM || []).map(o => o.salesperson).filter(Boolean))].sort(), [ordersM]);
  const payments = useMemo(() => [...new Set((ordersM || []).map(o => o.payment_type || 'ไม่ระบุ'))].sort(), [ordersM]);
  // ตัวเลือกเซลล์ในฟอร์มแก้ = ทีม (staff) ∪ เซลล์ที่มีในข้อมูล — ชื่อต้อง match เป๊ะกับ funnel/เป้า (Tier-1)
  const sellerOptions = useMemo(() => [...new Set([...(staff || []).map(s => s?.name).filter(Boolean), ...sellers])], [staff, sellers]);
  // ตัวกรองแบบ multi-select (ว่าง = แสดงทั้งหมด) — แพทเทิร์นเดียวกับหน้ารายงานขาย
  const nFilters = jobF.length + channelF.length + sellerF.length + statusF.length + payF.length;
  const activeChips = [
    ...statusF.map(v => ({ dim: 'สถานะ', v, clear: () => setStatusF(statusF.filter(x => x !== v)) })),
    ...jobF.map(v => ({ dim: 'งาน', v, clear: () => setJobF(jobF.filter(x => x !== v)) })),
    ...channelF.map(v => ({ dim: 'ช่องทาง', v, clear: () => setChannelF(channelF.filter(x => x !== v)) })),
    ...payF.map(v => ({ dim: 'ชำระ', v, clear: () => setPayF(payF.filter(x => x !== v)) })),
    ...sellerF.map(v => ({ dim: 'เซลล์', v, clear: () => setSellerF(sellerF.filter(x => x !== v)) })),
  ];
  const clearFilters = () => { setJobF([]); setChannelF([]); setSellerF([]); setStatusF([]); setPayF([]); };
  const ql = q.trim().toLowerCase();
  // memoize — ต้องคง identity ของ filtered ให้เสถียร ไม่งั้น useTableSort re-sort ทุก render (กดเช็คบ็อกซ์/เปิด drawer/สลับหน้า → กระตุก)
  const filtered = useMemo(() => (ordersM || []).filter(o =>
    orderVisibleTo(o, user) &&
    (statusF.length === 0 || statusF.includes(o.status === 'cancelled' ? 'ยกเลิก' : 'ใช้งาน')) &&
    (channelF.length === 0 || channelF.includes(o.channel)) &&
    (payF.length === 0 || payF.includes(o.payment_type || 'ไม่ระบุ')) &&
    (jobF.length === 0 || jobF.includes(o.job_type || 'ปลีก')) &&
    (sellerF.length === 0 || sellerF.includes(o.salesperson || '')) &&
    (!ql || `${o.order_no} ${o.marketplace_id || ''} ${o.customer_name || ''} ${o.customer_code || ''} ${o.customer_social || ''} ${o.province || ''} ${o.salesperson || ''}`.toLowerCase().includes(ql) || (skusByOrder[o.order_no] || []).some(s => `${s.design || ''} ${s.color || ''} ${s.raw_sku_or_name || ''}`.toLowerCase().includes(ql)))
  ), [ordersM, statusF, channelF, payF, jobF, sellerF, ql, skusByOrder, user]);

  // เรียงตามคอลัมน์ (เริ่มต้น = วันที่ล่าสุดก่อน เหมือนเดิม)
  const { sorted, sortKey, sortDir, toggleSort } = useTableSort(filtered, { key: 'date', dir: 'desc', accessors: ORDERS_SORT });

  // แบ่งหน้า — รีเซ็ตกลับหน้า 1 เมื่อเปลี่ยนช่วงวันที่/ตัวกรอง/คำค้น/การเรียง
  // eslint-disable-next-line react-hooks/set-state-in-effect -- รีเซ็ตหน้า/การเลือกเมื่อเงื่อนไขเปลี่ยน (page/selSet เป็น state ที่ผู้ใช้แก้เองได้ จึง derive ตอน render ไม่ได้) — รื้อเสี่ยงเลือกข้ามหน้าผิดแถว
  useEffect(() => { setPage(1); setSelSet(new Set()); }, [range.from, range.to, jobF, channelF, sellerF, statusF, payF, q, sortKey, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageClamped - 1) * PER_PAGE, pageClamped * PER_PAGE);
  // สรุปช่วง/ตัวกรอง (ไม่นับใบยกเลิก) + ยอดต่อวันสำหรับแถวคั่นวัน (เมื่อเรียงตามวันที่)
  const live = filtered.filter(o => o.status !== 'cancelled');
  const sumSales = live.reduce((a, o) => a + (Number(o.sales) || 0), 0);
  const byDate = {}; live.forEach(o => { const d = o.order_date || o.order_month || ''; const g = byDate[d] || (byDate[d] = { n: 0, sales: 0 }); g.n += 1; g.sales += Number(o.sales) || 0; });
  const groupByDate = sortKey === 'date';
  const showDateCol = colVisible.has('date') || !groupByDate;   // ไม่ได้เรียงตามวัน → ต้องเห็นวันที่ในแถว
  const fmtD = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${Number(m[3])} ${THAI_MONTHS[Number(m[2]) - 1]} ${String(Number(m[1]) + 543).slice(2)}` : (iso || '—'); };
  const nCols = 2 + (canEdit ? 1 : 0) + ['channel', 'customer', 'designs', 'job', 'payment', 'status', 'note', 'qty'].filter(k => colVisible.has(k)).length + (showDateCol ? 1 : 0);
  // เลือกทั้งหน้า (checkbox หัวตาราง) + สรุปสิ่งที่เลือกไว้ (เพื่อโชว์ปุ่ม action ที่เกี่ยวข้อง)
  const pageNos = pageRows.map(o => o.order_no);
  const allOnPage = pageNos.length > 0 && pageNos.every(no => selSet.has(no));
  const toggleAllPage = () => setSelSet(s => { const n = new Set(s); if (allOnPage) pageNos.forEach(no => n.delete(no)); else pageNos.forEach(no => n.add(no)); return n; });
  const selRows = (ordersM || []).filter(o => selSet.has(o.order_no));
  const selHasCancelled = selRows.some(o => o.status === 'cancelled');

  const showSkel = useDelayedFlag(orders === null, 120); // โผล่หลัง 120ms · อยู่อย่างน้อย 300ms · cache ไว → เด้งทันที
  if (showSkel) return <OrdersSkeleton />;
  if (orders === null) return null;
  // ไม่มีข้อมูลเลยทั้งระบบ (ไม่มีเดือนใดเลย) → แนะนำนำเข้า · ถ้าแค่เดือนนี้ว่าง ยังให้เลือกเดือนอื่นได้
  if (err || (orders.length === 0 && !bounds.max)) return (
    <div className="content-inner rise"><Card className="p-[22px]"><div className="cap" style={{ textAlign: 'center', padding: 24, color: 'var(--ink-4)' }}>
      {/relation .* does not exist|tmk_mp_/i.test(err) ? 'ยังไม่ได้สร้างตาราง — รัน migration ก่อน' : 'ยังไม่มีออเดอร์ — ส่งใบเสร็จได้ที่ปุ่ม "ส่งยอด" ในหน้าประสิทธิภาพเซลล์'}
    </div></Card></div>
  );

  const buildDesigns = (sk) => { const dmap = {}; sk.forEach(s => { const d = s.design || '(จับคู่ไม่ได้)'; if (!dmap[d]) dmap[d] = { design: d, codes: new Set(), qty: 0, sales: 0 }; const g = dmap[d]; if (s.product_code) g.codes.add(s.product_code); g.qty += Number(s.qty) || 0; g.sales += Number(s.line_sales) || 0; }); return Object.values(dmap).sort((a, b) => b.qty - a.qty); };
  const jobChip = (j) => ({ 'ปลีก': '', 'DFT': 'chip-accent', 'OEM': 'chip-warn' }[j] || '');
  const statusChip = (s) => {
    if (!s || s === 'completed' || s === 'delivered') return 'chip-delivered';
    if (s === 'cancelled') return 'chip-cancelled';
    if (s === 'pending' || s === 'processing') return 'chip-pending';
    if (s === 'shipped') return 'chip-shipped';
    return '';
  };
  const statusLabel = (s) => ({ 'completed': 'สำเร็จ', 'delivered': 'ส่งแล้ว', 'cancelled': 'ยกเลิก', 'pending': 'รอดำเนินการ', 'processing': 'กำลังทำ', 'shipped': 'จัดส่งแล้ว' }[s] || s || '');
  return (
    <div className="content-inner rise">
      <Card className="p-[22px]">
        {/* หัว + เครื่องมือ แถวเดียว: ชื่อ · ช่วงวัน · ตัวกรอง · ล้าง | (ขวา) ค้นหา · คอลัมน์ · เพิ่มออเดอร์ */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 mr-1 text-base font-bold leading-tight" style={{ color: 'var(--ink)' }}>ออเดอร์ <span className="dim num" style={{ fontWeight: 500 }}>· {N(live.length)} · {B(sumSales)}</span></h3>
            {!canSeeAll && <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground"><Icon name="user" className="size-3" />เฉพาะของฉัน</Badge>}
            <DateRangePicker from={range.from} to={range.to} min={bounds.min} max={bounds.max}
              onChange={(a, b) => setRange({ from: a, to: b })} presets={PRESETS} activePreset={activePreset} onPickPreset={pickPreset} />
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 rounded-full">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name="chevD" style={filtersOpen ? { transform: 'rotate(180deg)' } : undefined} />
              </Button>
            </CollapsibleTrigger>
            {nFilters > 0 && <Button variant="ghost" size="sm" className="text-[var(--bad)]" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>}
            <div className="ml-auto flex items-center gap-2">
              <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา" wrapperClassName="w-full sm:w-[220px]" />
              <ColumnToggle columns={ORDERS_COLS} visible={colVisible} onToggle={toggleCol} />
              <Button size="sm" className="shrink-0 gap-1.5" disabled={!appCanEdit()} onClick={() => setAddOpen(true)}><Icon name="plus" /> เพิ่มออเดอร์</Button>
            </div>
          </div>
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {activeChips.map(({ dim, v, clear }) => <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>)}
            </div>
          )}
          <CollapsibleContent>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, marginTop: 10, borderTop: '1px solid var(--line)' }}>
              <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 64, flexShrink: 0 }}>ตัวกรอง</span>
              <MultiSelect label="สถานะ" options={['ใช้งาน', 'ยกเลิก']} value={statusF} onChange={setStatusF} />
              <MultiSelect label="งาน" options={['ปลีก', 'DFT', 'OEM']} value={jobF} onChange={setJobF} />
              <MultiSelect label="ช่องทาง" options={channels} value={channelF} onChange={setChannelF} />
              {payments.length > 0 && <MultiSelect label="การชำระ" options={payments} value={payF} onChange={setPayF} />}
              {canSeeAll && sellers.length > 0 && <MultiSelect label="เซลล์" options={sellers} value={sellerF} onChange={setSellerF} />}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {canEdit && selSet.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
            <span className="text-[13px] font-bold" style={{ color: 'var(--accent)' }}>เลือก {N(selSet.size)} ออเดอร์</span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {selHasCancelled && <Button variant="outline" size="sm" className="gap-1" style={{ color: 'var(--good)' }} disabled={bulkBusy} onClick={() => runBulk('restore')}><Icon name="refresh" /> นำกลับมา</Button>}
              <Button variant="outline" size="sm" className="gap-1" style={{ color: 'var(--bad)' }} disabled={bulkBusy} onClick={() => runBulk('remove')}><Icon name="trash" /> ลบถาวร</Button>
              <Button variant="ghost" size="sm" disabled={bulkBusy} onClick={() => setSelSet(new Set())}>เลิกเลือก</Button>
            </div>
          </div>
        )}

        <CardTable className={'table-sticky-first mt-4 ' + density}><Table>
          <TableHeader><TableRow>
            {canEdit && <TableHead className="w-9 cell-hide-m"><ShadcnCheckbox checked={allOnPage} onCheckedChange={toggleAllPage} aria-label="เลือกทั้งหน้า" /></TableHead>}
            <SortHead field="order_no" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ออเดอร์</SortHead>
            {showDateCol && <SortHead field="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>วันที่</SortHead>}
            {colVisible.has('channel') && <SortHead field="channel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ช่องทาง</SortHead>}
            {colVisible.has('customer') && <SortHead field="customer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>ลูกค้า</SortHead>}
            {colVisible.has('designs') && <TableHead>ลายเสื้อ</TableHead>}
            {colVisible.has('job') && <TableHead>งาน</TableHead>}
            {colVisible.has('payment') && <SortHead field="payment" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort}>การชำระ</SortHead>}
            {colVisible.has('status') && <TableHead>สถานะ</TableHead>}
            {colVisible.has('note') && <TableHead>หมายเหตุ</TableHead>}
            {colVisible.has('qty') && <SortHead field="qty" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ตัว</SortHead>}
            <SortHead field="sales" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right">ยอดขาย</SortHead>
          </TableRow></TableHeader>
          <TableBody>{pageRows.map((o, idx) => { const designs = buildDesigns(skusByOrder[o.order_no] || []);
            const d = o.order_date || o.order_month || '';
            const prevD = idx > 0 ? (pageRows[idx - 1].order_date || pageRows[idx - 1].order_month || '') : null;
            const divider = groupByDate && d !== prevD ? (
              <TableRow key={'d:' + d} className="order-date-row" aria-hidden={false}>
                <TableCell colSpan={nCols} className="cap cell-title"><span className="row" style={{ gap: 8, alignItems: 'baseline' }}><b style={{ color: 'var(--ink-2)', fontWeight: 700, fontSize: 12.5 }}>{fmtD(d)}</b><span className="num" style={{ color: 'var(--ink-4)' }}>{N(byDate[d]?.n || 0)} ออเดอร์ · {B(byDate[d]?.sales || 0)}</span></span></TableCell>
              </TableRow>
            ) : null;
            return (<Fragment key={o.order_no}>{divider}
              <TableRow data-state={selSet.has(o.order_no) ? 'selected' : undefined} className={`mp-order-row ${openId === o.order_no ? 'is-open' : ''} ${o.status === 'cancelled' ? 'opacity-55' : ''}`} onClick={() => setOpenId(o.order_no)} style={{ cursor: 'pointer' }}>
                {canEdit && <TableCell className="cell-hide-m" onClick={e => e.stopPropagation()}><ShadcnCheckbox checked={selSet.has(o.order_no)} onCheckedChange={() => toggleSel(o.order_no)} aria-label={`เลือก ${o.order_no}`} /></TableCell>}
                <TableCell className="cell-title"><span className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontWeight: 600, textDecoration: o.status === 'cancelled' ? 'line-through' : 'none' }}>{o.order_no}</span>{o.status === 'cancelled' && <span className="chip chip-cancelled">ยกเลิก</span>}{!colVisible.has('job') && o.job_type && o.job_type !== 'ปลีก' && <span className={'chip ' + jobChip(o.job_type)} title="ประเภทงาน">{o.job_type}</span>}</span></TableCell>
                {showDateCol && <TableCell className="cap num" style={{ whiteSpace: 'nowrap' }}>{fmtD(o.order_date || o.order_month)}</TableCell>}
                {colVisible.has('channel') && <TableCell><span className="row" style={{ gap: 7, alignItems: 'center', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: 600 }}><span className="order-channel-dot" style={{ background: channelColor(o.channel) }} />{o.channel}</span></TableCell>}
                {colVisible.has('customer') && <TableCell><div className="flex items-center gap-2 min-w-0">{o.customer_name && <PersonAvatar name={o.customer_name} color={channelColor(o.channel)} size={22} className="shrink-0" />}<div className="min-w-0">{o.customer_name || o.customer_code || '—'}{o.province && <div className="cap">{o.province}</div>}{!o.customer_name && !o.customer_code && <Badge variant="warning" className="rounded-full text-[10px] font-medium">ไม่มีลูกค้า</Badge>}</div>{!colVisible.has('note') && o.note && <span className="shrink-0 inline-flex" style={{ color: 'var(--warn)' }} title={`หมายเหตุ: ${o.note}`} role="img" aria-label={`หมายเหตุ: ${o.note}`}><Icon name="chat" /></span>}</div></TableCell>}
                {colVisible.has('designs') && <TableCell className="cell-hide-m">{designs.length === 0 ? <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span> : <span style={{ fontWeight: 600 }}>{designs.slice(0, 2).map(d => d.design).join(', ')}{designs.length > 2 ? ` +${designs.length - 2}` : ''}</span>}</TableCell>}
                {colVisible.has('job') && <TableCell>{(o.job_type && o.job_type !== 'ปลีก') ? <span className={'chip ' + jobChip(o.job_type)}>{o.job_type}</span> : <span className="cap">ปลีก</span>}</TableCell>}
                {colVisible.has('payment') && <TableCell><span className="cap" style={o.payment_type ? undefined : { color: 'var(--ink-4)' }}>{o.payment_type || '—'}</span></TableCell>}
                {colVisible.has('status') && <TableCell>{o.status && !['completed', 'active'].includes(o.status) ? <span className={'chip ' + statusChip(o.status)}>{statusLabel(o.status)}</span> : <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>}</TableCell>}
                {colVisible.has('note') && <TableCell className="cell-hide-m">{o.note ? <span className="block max-w-[160px] truncate text-[13px]" title={o.note}>{o.note}</span> : <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>}</TableCell>}
                {colVisible.has('qty') && <TableCell className="num" style={{ textAlign: 'right' }}>{N(o.qty)}</TableCell>}
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{B(o.sales)}</TableCell>
              </TableRow>
            </Fragment>); })}</TableBody>
        </Table></CardTable>
        {filtered.length > PER_PAGE && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="cap" style={{ color: 'var(--ink-4)' }}>แสดง {N((pageClamped - 1) * PER_PAGE + 1)}–{N(Math.min(pageClamped * PER_PAGE, filtered.length))} จาก {N(filtered.length)} ออเดอร์</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><Icon name="chevL" /> ก่อนหน้า</Button>
              {_pageList(pageClamped, totalPages).map((p, i) => p === '…'
                ? <span key={'e' + i} className="px-1.5 text-[var(--ink-4)]">…</span>
                : <Button key={p} variant={p === pageClamped ? 'default' : 'outline'} size="sm" className="min-w-9 px-0" onClick={() => setPage(p)}>{p}</Button>)}
              <Button variant="outline" size="sm" className="gap-1" disabled={pageClamped >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>ถัดไป <Icon name="chevR" /></Button>
            </div>
          </div>
        )}
      </Card>

      {openId && (() => {
        const o = (ordersM || []).find(x => x.order_no === openId);
        if (!o) return null;
        return <OrderDrawer order={o} sk={skusByOrder[o.order_no] || []} buildDesigns={buildDesigns} sellerOptions={sellerOptions} onClose={() => setOpenId(null)} onSaved={reloadOverrides} onChanged={reloadAll} />;
      })()}

      {addOpen && <ManualSaleSheet user={user} onClose={() => setAddOpen(false)} onSaved={reloadAll} />}
    </div>
  );
}


// รหัสลูกค้า = คีย์ CRM ภายใน (P<เบอร์>/S<โซเชียล>/N<ชื่อ>) — โชว์อ่านง่าย: ตัด prefix + ซ่อนถ้าซ้ำชื่อ (ไม่โชว์คีย์ดิบ)

export function OrdersHub() {
  return <MpOrdersView />;
}


