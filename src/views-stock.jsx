/* ============================================================
   views-stock.jsx — หน้า "สต็อก" เฟส 1: สต็อกตั้งต้น + นับสต็อก (PART 112)
   ============================================================
   คงเหลือ = ที่นับได้ครั้งล่าสุด + ที่รับเข้าหลังนับ − ที่ขายหลังนับ (lib/stockMoves.js · มีเทส)
   ยังไม่มี move ในระบบ → ถอยไปสูตรเดิม "ที่นับได้ − ที่ขายหลังนับ" (lib/stockCount.js) อัตโนมัติ
   - คุมเฉพาะ "ลายที่ขายจริง" (user สั่ง) — เลือกช่วงได้ 90/180 วัน/ทั้งหมด
   - นำเข้าตั้งต้นจาก Excel/CSV/วางจากคลิปบอร์ด (แอดมิน) · นับรอบปกติทำได้ทุกคนที่แก้ไขได้
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { Icon, N, PageSkeleton, CardHead } from './components.jsx';
import { SideSheet } from './modals-core.jsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchInput } from '@/components/ui/search-input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { CardTable, SortableTable } from './components/DataTableParts.jsx';
import { KpiCard } from './saleDashboardChrome.jsx';
import { Field, SellerCombobox, PersonChips } from './saleWidgets.jsx';
import { useData } from './dataContext.jsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DatePicker } from '@/components/ui/date-picker';
import { EmptyState } from './components/EmptyState.jsx';
import { toast, canEdit, isAdmin, userEmail, confirm } from './lib/appBus.js';
import { logAudit } from './lib/audit.js';
import { cachedFetchRange, SKUS_SEL } from './lib/saleData.js';
import { todayISO } from './lib/dateUtils.js';
import { resolveDesign } from './lib/shirtCatalog.js';
import { sizeRank } from './lib/saleAgg.js';
import {
  stockBalance, stockByDesign, designGrid, activeDesigns, addDays,
  parseStockGrid, mergeStockRows, matchDesigns, pasteToGrid, skuKey, normSizeStock, sessionVariance, allSessionTotals, excludeCancelled,
} from './lib/stockCount.js';
import { fetchStockCounts, saveStockCount, deleteStockSession, sessionsOf, STOCK_MIGRATION, MOVES_MIGRATION, MOVES_ROUND_MIGRATION, appendStockMoves, fetchStockMoves } from './lib/stockData.js';
import { movesFromReceive, movesFromCount, balanceFromMoves, skuLedger, sessionsFromMoves, voidMove } from './lib/stockMoves.js';
import { pgErrorText } from './lib/pgError.js';
import { fetchProductDesigns, productMatrix, stockDesignNames, catalogResolver, findProduct } from './lib/productCatalog.js';
import { DesignCombobox, ColorSelect, SizeSelect } from './components/ProductPicker.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSaleRealtime } from './lib/saleRealtime.js';
import {
  PO_STATUS, poStatusMeta, isPoOpen, nextPoId, poTotals, poSummary, incomingBySku, poPeople,
  fetchPurchaseOrders, savePurchaseOrder, PO_MIGRATION,
} from './lib/productionOrders.js';
import { PersonAvatar } from './components.jsx';
import { normColor } from './lib/saleAgg.js';

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const SCOPE_MAX_DAYS = 365;   // ช่วงยอดขายที่ดึงมากที่สุด = ตัวเลือกกว้างสุดของ "ลายที่ขายจริงใน …"

/* ชื่อลาย (string[]) → รายการที่ DesignCombobox ใช้ได้ — ลายในแคตตาล็อกได้รหัส/ประเภทติดมาด้วย
   ลายที่มีของค้างแต่ไม่อยู่ในแคตตาล็อกแล้ว ยังเลือกได้ (ป้าย "นอกแคตตาล็อก") ไม่งั้นของค้างจะนับไม่ได้ */
function designItems(catalog, names) {
  return (names || []).map(n => findProduct(catalog, n) || { code: '', name: n, type: 'นอกแคตตาล็อก' });
}

/* ---------- อ่านไฟล์ (xlsx / csv) → กริด 2 มิติ · ใช้ pattern เดียวกับหน้านำเข้ามาร์เก็ตเพลส ---------- */
async function fileToGrid(file) {
  if (file?.size > MAX_IMPORT_BYTES) throw new Error('ไฟล์ใหญ่เกิน 25MB');
  if (/\.(xlsx|xls|xlsm|xlsb)$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array' });
    if (!wb?.SheetNames?.length) throw new Error('ไฟล์ไม่มีชีตข้อมูล');
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
  }
  const text = await file.text();
  return pasteToGrid(text);
}

export function StockView() {
  const [counts, setCounts] = useState(null);
  /* PLAN-STOCK-V2 ระยะ 3 — อ่านคงเหลือจากสมุดเคลื่อนไหว
     moves = null แปลว่า "ยังไม่ได้รัน migration" → ถอยไปใช้สูตรเดิม (ระบบไม่พัง) */
  const [moves, setMoves] = useState(null);
  const [ledgerKey, setLedgerKey] = useState(null);   // SKU ที่กำลังดูประวัติ
  const [missing, setMissing] = useState(false);
  const [loadErr, setLoadErr] = useState('');   // error จริงจาก DB (ไม่ใช่เรื่อง migration) — ต้องเห็น ไม่ใช่หน้าว่างเปล่า
  const [catalog, setCatalog] = useState([]);  // ลาย/สี/ไซซ์ = ยึดจากหน้า "สินค้า" (tmk_shirt_catalog + GOLDEN)
  const [skus, setSkus] = useState([]);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('90');           // ลายที่ขายจริงในกี่วัน (สูงสุด = SCOPE_MAX_DAYS)
  const [openDesign, setOpenDesign] = useState(null); // กางกริดสี×ไซซ์
  const [countFor, setCountFor] = useState(null);     // เปิดโหมดนับของลายนี้
  const [importOpen, setImportOpen] = useState(false);
  const [openSession, setOpenSession] = useState(null);   // รอบนับที่กางดูผลต่าง
  const [tab, setTab] = useState('stock');       // stock | po
  const [pos, setPos] = useState([]);
  const [poMissing, setPoMissing] = useState(false);
  const [poEdit, setPoEdit] = useState(null);    // ใบที่กำลังสร้าง/แก้
  const [poReceive, setPoReceive] = useState(null);
  const [poPerson, setPoPerson] = useState('');  // ตัวกรอง "แยกรายคน"
  const [poStatus, setPoStatus] = useState('open');
  const [rk, setRk] = useState(0);
  const { staff } = useData();     // รายชื่อทีม → ตัวเลือก "ผู้รับผิดชอบ" ในใบสั่งผลิต
  const today = todayISO();
  const mayEdit = canEdit();

  useEffect(() => { let live = true; (async () => {
    const [r, mv] = await Promise.all([fetchStockCounts(), fetchStockMoves()]);
    if (!live) return;
    setCounts(r.rows); setMissing(!!r.missing);
    // ยังไม่ได้รัน migration (missing) → null = ใช้สูตรเดิม · error อื่น = บอกผู้ใช้ ไม่เงียบ
    setMoves(mv.missing ? null : (mv.rows || []));
    /* ⚠️ ต้องรวมทั้งสอง error แล้ว setLoadErr "ครั้งเดียว"
       เคยเขียนเป็น 2 บรรทัด (moves ก่อน แล้ว counts ทับ) → moves อ่านไม่ได้ถูกล้างเป็น '' ทันที
       ผลคือหน้าเงียบ ๆ ถอยไปใช้สูตรเดิมเหมือนไม่มีข้อมูล ทั้งที่จริงคืออ่านไม่ผ่าน (สิทธิ์/เน็ต) */
    const errs = [];
    if (r.error && !r.missing) errs.push(pgErrorText(r.error));
    if (mv.error && !mv.missing) errs.push('โหลดสมุดเคลื่อนไหวสต็อกไม่สำเร็จ: ' + pgErrorText(mv.error));
    setLoadErr(errs.join(' · '));
    /* ช่วงยอดขายที่ต้องดึง = ย้อนไปให้ครอบคลุมทั้ง (ก) วันนับแรกสุด — ใช้หักของออก
       และ (ข) ช่วงที่ตัวเลือก "ลายที่ขายจริงใน 90/180/365 วัน" ต้องใช้
       เดิมดึงแค่ตั้งแต่วันนับแรกสุด → เลือก 180 วันแต่ข้อมูลมีแค่ 20 กว่าวัน = ป้าย "เลิกขายแล้ว" มั่ว */
    const earliest = r.rows.length ? r.rows.map(c => c.count_date).sort()[0] : addDays(today, -90);
    const from = earliest < addDays(today, -SCOPE_MAX_DAYS) ? earliest : addDays(today, -SCOPE_MAX_DAYS);
    const [s, ordR] = await Promise.all([
      cachedFetchRange('tmk_mp_skus', SKUS_SEL, from, today),
      cachedFetchRange('tmk_mp_orders', 'order_no,source,status,order_date', from, today, 'order_date'),
    ]);
    if (live) {
      // ตัดบรรทัดของใบที่ยกเลิกออกก่อน (มีเทสคู่ที่ stockCount.test.js — เทียบ source:order_no)
      setSkus(s.error ? [] : excludeCancelled(s.data || [], ordR?.data || []));
      // error ของยอดขาย = ห้ามเงียบ (skus ว่าง → คงเหลือ = ที่นับได้ = ตัวเลขสูงเกินจริง)
      if (s.error) setLoadErr(prev => prev || ('โหลดยอดขายไม่สำเร็จ — ตัวเลขคงเหลือยังไม่หักของที่ขายไป: ' + pgErrorText(s.error)));
      else if (ordR?.error) setLoadErr(prev => prev || ('โหลดสถานะออเดอร์ไม่สำเร็จ — ใบที่ยกเลิกอาจยังถูกหักออกจากสต็อก: ' + pgErrorText(ordR.error)));
    }
    const cat = await fetchProductDesigns();
    if (live) setCatalog(cat.list);
    const p = await fetchPurchaseOrders();
    if (live) {
      setPos(p.rows); setPoMissing(!!p.missing);
      if (p.error && !p.missing) setLoadErr(prev => prev || pgErrorText(p.error));
    }
  })(); return () => { live = false; }; }, [rk, today]);

  // แก้สินค้าที่หน้า "สินค้า" → ตัวเลือกลาย/สี/ไซซ์ที่นี่เด้งตามทันที (ไม่ต้องรีเฟรช)
  useSaleRealtime(['tmk_shirt_catalog'], () => { fetchProductDesigns(true).then(c => setCatalog(c.list)); });

  /* คงเหลือ = สมุดเคลื่อนไหว (ตั้งต้น + รับเข้า − ขาย) ถ้ามี · ไม่งั้นถอยไปสูตรเดิม
     เทส parity ใน stockMoves.test.js บังคับว่าสองสูตรได้เลขเท่ากันในเคสที่โมเดลเดิมทำได้
     → สลับมาแล้วตัวเลขต้องไม่ขยับ ส่วนที่ต่างคือเคสที่โมเดลเดิม "ทำไม่ได้" (รับเข้าแยกแถว/นับตอนเช้า) */
  const usingMoves = Array.isArray(moves) && moves.length > 0;
  const rows = useMemo(
    () => (usingMoves ? balanceFromMoves(moves, skus) : stockBalance(counts || [], skus)),
    [usingMoves, moves, counts, skus],
  );
  const byDesign = useMemo(() => stockByDesign(rows), [rows]);
  const active = useMemo(() => activeDesigns(skus, { days: Number(scope), today }), [skus, scope, today]);
  const activeSet = useMemo(() => new Set(active.map(a => a.design)), [active]);
  /* ระยะ 4 — ประวัติรอบอ่านจากสมุดเคลื่อนไหว (การรับเข้าจาก PO จะโผล่ในประวัติด้วย
     ซึ่งของเดิมทำไม่ได้เพราะถูกเขียนกลบเป็น "รอบนับ" ธรรมดา) · ไม่มี moves = ถอยไปของเดิม */
  const sessions = useMemo(
    () => (usingMoves ? sessionsFromMoves(moves) : sessionsOf(counts || [])),
    [usingMoves, moves, counts],
  );
  // balanceByKey ถูกลบ — เคยใช้ป้อน buildReceiveAnchors ซึ่งเลิกใช้แล้ว (ระยะ 4)
  const incoming = useMemo(() => incomingBySku(pos), [pos]);
  const poStat = useMemo(() => poSummary(pos), [pos]);
  const people = useMemo(() => poPeople(pos), [pos]);
  // ตัวเลือกผู้รับผิดชอบใบสั่ง = ทีม (staff) ∪ คนที่มีใบอยู่แล้ว — แพทเทิร์นเดียวกับ SellerCombobox หน้าออเดอร์
  const teamNames = useMemo(() => [...new Set([...(staff || []).map(x => x?.name).filter(Boolean), ...people])], [staff, people]);
  const posShown = useMemo(() => pos.filter(p =>
    (poStatus === 'all' || (poStatus === 'open' ? isPoOpen(p) : p.status === poStatus))
    && (!poPerson || String(p.responsible || '').trim() === poPerson)
  ), [pos, poStatus, poPerson]);

  // ตารางหลัก: ลายที่ขายจริง (มีสต็อกหรือไม่ก็ตาม) + ลายที่มีสต็อกแต่ไม่ได้ขายแล้ว (กลุ่มท้าย)
  const list = useMemo(() => {
    const byName = new Map(byDesign.map(d => [d.design, d]));
    const merged = active.map(a => ({
      design: a.design, sold90: a.qty, lastSold: a.lastSold,
      ...(byName.get(a.design) || { balance: null, counted: 0, sold: 0, skus: 0, colors: 0, lastCount: '', negative: 0 }),
    }));
    const extras = byDesign.filter(d => !activeSet.has(d.design)).map(d => ({ ...d, sold90: 0, lastSold: '', extra: true }));
    const ql = q.trim().toLowerCase();
    const f = (r) => !ql || r.design.toLowerCase().includes(ql) || String(r.productCode || '').toLowerCase().includes(ql);
    return { main: merged.filter(f), extras: extras.filter(f) };
  }, [active, byDesign, activeSet, q]);

  const kpi = useMemo(() => ({
    skus: rows.length,
    qty: rows.reduce((a, r) => a + r.balance, 0),
    negative: rows.filter(r => r.balance < 0).length,
    notCounted: list.main.filter(r => r.balance == null).length,
    lastCount: sessions[0]?.date || '',
  }), [rows, list, sessions]);

  if (counts === null) return <PageSkeleton />;

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {!!loadErr && (
        <Card className="p-4" style={{ borderLeft: '3px solid var(--bad)' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Icon name="alertTriangle" style={{ color: 'var(--bad)' }} />
            <b>โหลดข้อมูลสต็อกไม่สำเร็จ</b>
            <span className="cap" style={{ color: 'var(--ink-3)' }}>{loadErr}</span>
            <Button variant="outline" size="sm" onClick={() => setRk(k => k + 1)}><Icon name="refresh" /> ลองใหม่</Button>
          </div>
        </Card>
      )}

      {missing && (
        <Card className="p-4" style={{ borderLeft: '3px solid var(--warn)' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Icon name="alertTriangle" style={{ color: 'var(--warn)' }} />
            <b>ยังเปิดใช้ระบบสต็อกไม่ได้</b>
            <span className="cap" style={{ color: 'var(--ink-3)' }}>ต้องรัน <code>{STOCK_MIGRATION}</code> ใน Supabase ก่อน — หน้านี้จะทำงานทันทีหลังรัน</span>
          </div>
        </Card>
      )}

      {/* ระยะ 4 — บอกให้ชัดว่าคงเหลือคำนวณจากอะไร เพื่อยืนยันก่อนตัดระบบเดิมทิ้ง
          (ยังไม่รัน migration = ยังใช้สูตรเดิม ต้องรู้ ไม่ใช่เดา) */}
      {!missing && !moves && (
        <Card className="p-3.5" style={{ borderLeft: '3px solid var(--info)' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Icon name="alertTriangle" style={{ color: 'var(--info)' }} />
            <b>ยังใช้วิธีคิดคงเหลือแบบเดิม</b>
            <span className="cap" style={{ color: 'var(--ink-3)' }}>
              รัน <code>20260902-stock-moves.sql</code> เพื่อเปิดสมุดเคลื่อนไหว — จะได้ประวัติรายชิ้น · การรับเข้าแยกแถว · ตัวเลือกเวลานับ
            </span>
          </div>
        </Card>
      )}

      {/* สลับ คงเหลือ ↔ ใบสั่งผลิต */}
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleGroup type="single" value={tab} onValueChange={(v) => v && setTab(v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5">
          <ToggleGroupItem value="stock" size="sm" className="px-3 data-[state=on]:bg-background data-[state=on]:shadow-sm"><Icon name="box" className="size-3.5 mr-1" /> คงเหลือ</ToggleGroupItem>
          <ToggleGroupItem value="po" size="sm" className="px-3 data-[state=on]:bg-background data-[state=on]:shadow-sm"><Icon name="listChecks" className="size-3.5 mr-1" /> ใบสั่งผลิต{poStat.open ? ` (${poStat.open})` : ''}</ToggleGroupItem>
        </ToggleGroup>
        {tab === 'po' && poStat.pending > 0 && <span className="cap" style={{ color: 'var(--ink-3)' }}>ของที่กำลังจะเข้า <b className="num" style={{ color: 'var(--ink)' }}>{N(poStat.pending)}</b> ตัว</span>}
      </div>

      {tab === 'po' ? (
        <PoPanel
          pos={posShown} allPos={pos} missing={poMissing} people={people} person={poPerson} setPerson={setPoPerson}
          status={poStatus} setStatus={setPoStatus} mayEdit={mayEdit}
          onNew={() => setPoEdit({ id: nextPoId(pos, today), order_date: today, due_date: '', supplier: '', responsible: '', status: 'ordered', items: [], note: '' })}
          onEdit={(p) => setPoEdit({ ...p, items: Array.isArray(p.items) ? p.items : [], createdExisting: true })}
          onReceive={(p) => setPoReceive(p)}
        />
      ) : (<>
      {/* หัว: สรุป + ปุ่มหลัก */}
      <Card className="p-[22px]">
        {/* CardHead = หัวการ์ดมาตรฐานของแอป (ไอคอน + ชื่อ + คำอธิบาย + ปุ่มขวา) */}
        <CardHead icon="box" title="สต็อกคงเหลือ"
          sub={`คงเหลือ = ที่นับได้ครั้งล่าสุด${usingMoves ? ' + ที่รับเข้าหลังนับ' : ''} − ที่ขายหลังนับ · ยกเลิกใบเสร็จแล้วของกลับเข้าสต็อกเอง${kpi.lastCount ? ` · นับล่าสุด ${kpi.lastCount}` : ''}`}
          right={<div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {isAdmin() && <Button variant="outline" size="sm" disabled={missing} onClick={() => setImportOpen(true)}><Icon name="upload" /> นำเข้าสต็อกตั้งต้น</Button>}
            {mayEdit && <Button size="sm" disabled={missing} onClick={() => setCountFor({ design: '' })}><Icon name="listChecks" /> นับสต็อก</Button>}
          </div>} />
        {/* KpiCard = การ์ดตัวชี้วัดชุดเดียวกับรายงานขาย (ไม่ทำสไตล์ใหม่ซ้ำ) */}
        <div className="kpi8" style={{ marginTop: 14 }}>
          <KpiCard index={0} label="ตัวคงเหลือรวม" value={N(kpi.qty)} sub="จากที่นับ − ที่ขายหลังนับ" tip="คิดสดทุกครั้ง: จำนวนที่นับครั้งล่าสุด ลบด้วยที่ขายไปหลังวันนับ" />
          <KpiCard index={1} label="SKU ที่คุมอยู่" value={N(kpi.skus)} sub="ลาย × สี × ไซซ์ ที่เคยนับ" tone="var(--info)" />
          <KpiCard index={2} label="ยังไม่ได้นับ" value={N(kpi.notCounted)} sub="ลายที่ขายอยู่แต่ไม่มียอดตั้งต้น" tone="var(--warn)" />
          {/* ⚠️ "ติดลบ 0 · ปกติ (เขียว)" ตอนที่ยังไม่เคยนับอะไรเลย = บอกว่าสต็อกเรียบร้อยทั้งที่ไม่มีข้อมูลให้ตัดสิน
              ต้องแยก "รู้ว่าไม่มีติดลบ" ออกจาก "ยังไม่รู้" */}
          <KpiCard index={3} label="ติดลบ" value={N(kpi.negative)} valueColor={kpi.negative ? 'var(--bad)' : undefined}
            sub={kpi.negative ? 'ขายเกินที่นับ — ต้องนับใหม่' : (kpi.skus ? 'ปกติ' : 'ยังไม่เคยนับ — ยังตัดสินไม่ได้')}
            tone={kpi.negative ? 'var(--bad)' : (kpi.skus ? 'var(--good)' : 'var(--ink-4)')} />
        </div>
      </Card>

      {/* ตัวกรอง */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>คุมเฉพาะลายที่ขายจริงใน</span>
        <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5">
          {[['90', '90 วัน'], ['180', '180 วัน'], ['365', '1 ปี']].map(([v, l]) => (
            <ToggleGroupItem key={v} value={v} size="sm" className="px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">{l}</ToggleGroupItem>
          ))}
        </ToggleGroup>
        <SearchInput placeholder="ค้นหาลาย" value={q} onChange={e => setQ(e.target.value)} wrapperClassName="w-full sm:w-[220px] sm:ml-auto" />
      </div>

      {/* ตารางรายลาย */}
      <Card className="p-0 overflow-hidden">
        {list.main.length === 0 && list.extras.length === 0 ? (
          <EmptyState icon="box" title="ยังไม่มีข้อมูลสต็อก" hint={isAdmin() ? 'เริ่มจาก "นำเข้าสต็อกตั้งต้น" จากไฟล์ Excel ที่มีอยู่' : 'รอแอดมินนำเข้าสต็อกตั้งต้น'} />
        ) : (
          // SortableTable = ตารางกลางของทั้งแอป — เรียงคอลัมน์ได้ + แปลงเป็นการ์ดอัตโนมัติบนมือถือ (cards)
          <SortableTable
            cards
            wrapClassName="table-wrap"
            initial={{ key: 'balance', dir: 'desc' }}
            columns={[
              { key: 'design', label: 'ลาย', className: 'w-[34%]' },
              { key: 'balance', label: 'คงเหลือ', align: 'right', accessor: r => (r.balance == null ? -1 : r.balance) },
              { key: 'counted', label: 'นับได้', align: 'right', className: 'hidden sm:table-cell' },
              { key: 'sold', label: 'ขายหลังนับ', align: 'right', className: 'hidden sm:table-cell' },
              { key: 'lastCount', label: 'นับล่าสุด', className: 'hidden md:table-cell' },
              { key: 'incoming', label: 'กำลังจะเข้า', align: 'right', className: 'hidden lg:table-cell',
                accessor: r => rows.filter(x => x.design === r.design).reduce((a, x) => a + (incoming[x.key] || 0), 0) },
              { key: 'sold90', label: `ขาย ${scope} วัน`, align: 'right' },
              { key: '_act', label: '', sortable: false },
            ]}
            rows={[...list.main, ...list.extras]}
            renderRow={(r) => {
                const never = r.balance == null;
                return (
                  <TableRow key={r.design} className="cursor-pointer" onClick={() => setOpenDesign(openDesign === r.design ? null : r.design)}>
                    <TableCell className="cell-title">
                      <div className="row" style={{ gap: 6, alignItems: 'center', minWidth: 0 }}>
                        <Icon name={openDesign === r.design ? 'chevD' : 'chevR'} className="size-3.5 shrink-0" style={{ color: 'var(--ink-4)' }} />
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.design}</span>
                        {r.extra && <Badge variant="outline" className="shrink-0 text-[10px]">เลิกขายแล้ว</Badge>}
                        {r.negative > 0 && <Badge variant="outline" className="shrink-0 text-[10px]" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}>ติดลบ</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="num text-right" style={{ fontWeight: 800, color: never ? 'var(--ink-4)' : r.balance < 0 ? 'var(--bad)' : 'var(--ink)' }}>
                      {never ? 'ยังไม่นับ' : N(r.balance)}
                    </TableCell>
                    <TableCell className="num text-right hidden sm:table-cell" style={{ color: 'var(--ink-3)' }}>{never ? '—' : N(r.counted)}</TableCell>
                    <TableCell className="num text-right hidden sm:table-cell" style={{ color: 'var(--ink-3)' }}>{never ? '—' : N(r.sold)}</TableCell>
                    <TableCell className="cap hidden md:table-cell" style={{ color: 'var(--ink-4)' }}>{r.lastCount || '—'}</TableCell>
                    <TableCell className="num text-right hidden lg:table-cell" style={{ color: 'var(--info)' }}>
                      {(() => { const inc = rows.filter(x => x.design === r.design).reduce((a, x) => a + (incoming[x.key] || 0), 0); return inc ? N(inc) : '—'; })()}
                    </TableCell>
                    <TableCell className="num text-right" style={{ color: 'var(--ink-3)' }}>{r.sold90 ? N(r.sold90) : '—'}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {mayEdit && <Button variant="ghost" size="sm" className="h-7" disabled={missing} onClick={() => setCountFor({ design: r.design })}>นับ</Button>}
                    </TableCell>
                  </TableRow>
                );
            }}
          />
        )}
      </Card>

      {/* กริดสี×ไซซ์ของลายที่กาง */}
      {openDesign && <DesignGridCard rows={rows} design={openDesign} onClose={() => setOpenDesign(null)}
        onPickSku={usingMoves ? setLedgerKey : null} />}
      {ledgerKey && <SkuLedgerSheet skuKey={ledgerKey} moves={moves} skus={skus} onClose={() => setLedgerKey(null)} />}

      {/* ประวัติการนับ — ตารางเต็ม + ผลต่างรายรอบ + ยกเลิกรอบได้ */}
      {sessions.length > 0 && (
        <CountHistory sessions={sessions} counts={counts || []} skus={skus} mayEdit={mayEdit}
          onOpen={setOpenSession}
          usingMoves={usingMoves} moves={moves} pos={pos}
          onDeleted={() => { setOpenSession(null); setRk(k => k + 1); }} />
      )}
      {openSession && (
        <SessionDetailSheet session={openSession} counts={counts || []} skus={skus}
          onClose={() => setOpenSession(null)} />
      )}

      </>)}

      {countFor && <CountSheet initial={countFor} rows={rows} catalog={catalog} designs={stockDesignNames(catalog, [...active.map(a => a.design), ...byDesign.map(d => d.design)])}
        onClose={() => setCountFor(null)} onSaved={() => { setCountFor(null); setRk(k => k + 1); }} />}
      {importOpen && <ImportSheet catalog={catalog} onClose={() => setImportOpen(false)} onSaved={() => { setImportOpen(false); setRk(k => k + 1); }} />}
      {poEdit && <PoSheet po={poEdit} catalog={catalog} people={teamNames} designs={stockDesignNames(catalog, [...active.map(a => a.design), ...byDesign.map(d => d.design)])} rows={rows}
        onClose={() => setPoEdit(null)} onSaved={() => { setPoEdit(null); setRk(k => k + 1); }} />}
      {poReceive && <PoReceiveSheet po={poReceive}
        onClose={() => setPoReceive(null)} onSaved={() => { setPoReceive(null); setRk(k => k + 1); }} />}
    </div>
  );
}

/* ---------- ประวัติการเคลื่อนไหวของ SKU เดียว (PLAN-STOCK-V2 ระยะ 3) ----------
   ตอบคำถาม "ทำไมเหลือ N" — เริ่มจากหมุดนับล่าสุด แล้วไล่ทีละเหตุการณ์พร้อมยอดสะสม */
const LEDGER_META = {
  open:   { label: 'สต็อกตั้งต้น', color: 'var(--info)' },
  count:  { label: 'นับสต็อก', color: 'var(--info)' },
  in:     { label: 'รับเข้า', color: 'var(--good)' },
  out:    { label: 'ขายออก', color: 'var(--bad)' },
  adjust: { label: 'ปรับยอด', color: 'var(--warn)' },
  return: { label: 'รับคืน', color: 'var(--good)' },
};

function SkuLedgerSheet({ skuKey: key, moves, skus, onClose }) {
  const rowsL = useMemo(() => skuLedger(key, moves || [], skus || []), [key, moves, skus]);
  const [design, color, size] = String(key || '').split('||');
  const final = rowsL.length ? rowsL[rowsL.length - 1].running : 0;
  return (
    <SideSheet size="lg" icon="clock" title="ประวัติการเคลื่อนไหว" sub={`${design} · ${color} · ${size}`} onClose={onClose}>
      {!rowsL.length ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">ยังไม่เคยนับตัวนี้ — ไม่มีฐานให้ไล่ประวัติ</Card>
      ) : (<>
        <div className="rounded-xl border p-3 mb-3 flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">คงเหลือตอนนี้</span>
          <span className="num text-2xl font-bold" style={{ color: final < 0 ? 'var(--bad)' : 'var(--ink)' }}>{N(final)}</span>
        </div>
        {final < 0 && (
          <div role="status" className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: 'color-mix(in srgb, var(--bad) 10%, transparent)', color: 'var(--bad)' }}>
            ติดลบ = นับตกหรือขายซ้ำ — ควรนับใหม่เพื่อตั้งฐานให้ตรง (ระบบไม่ปัดเป็น 0 เพราะจะกลบปัญหา)
          </div>
        )}
        <CardTable><Table>
          <TableHeader><TableRow>
            <TableHead>วันที่</TableHead><TableHead>รายการ</TableHead>
            <TableHead className="text-right">จำนวน</TableHead><TableHead className="text-right">คงเหลือ</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rowsL.map((x, i) => {
              const m = LEDGER_META[x.kind] || { label: x.kind, color: 'var(--ink-3)' };
              return (
                <TableRow key={i}>
                  <TableCell className="num whitespace-nowrap">{x.on}</TableCell>
                  <TableCell>
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: m.color + '1a', color: m.color }}>{m.label}</span>
                    {x.ref_type === 'po' && x.ref_id ? <span className="ml-1.5 text-xs text-muted-foreground">ใบสั่ง {x.ref_id}</span> : null}
                    {x.note ? <span className="ml-1.5 text-xs text-muted-foreground">{x.note}</span> : null}
                  </TableCell>
                  <TableCell className="num text-right" style={{ color: x.qty < 0 ? 'var(--bad)' : 'var(--good)', fontWeight: 600 }}>
                    {x.qty > 0 ? '+' : ''}{N(x.qty)}
                  </TableCell>
                  <TableCell className="num text-right" style={{ fontWeight: 700 }}>{N(x.running)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table></CardTable>
      </>)}
    </SideSheet>
  );
}

/* ---------- กริด สี × ไซซ์ (อ่านอย่างเดียว) ---------- */
function DesignGridCard({ rows, design, onClose, onPickSku }) {
  const { colors, sizes, cell } = useMemo(() => designGrid(rows, design), [rows, design]);
  if (!colors.length) return null;
  return (
    <Card className="p-[22px]">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div className="text-[15px] font-semibold">{design} <span className="dim">· คงเหลือต่อสี × ไซซ์</span></div>
        <Button variant="ghost" size="sm" onClick={onClose}><Icon name="x" /> ปิด</Button>
      </div>
      <CardTable><Table>
        <TableHeader><TableRow><TableHead>สี</TableHead>{sizes.map(s => <TableHead key={s} className="text-right">{s}</TableHead>)}<TableHead className="text-right">รวม</TableHead></TableRow></TableHeader>
        <TableBody>
          {colors.map(c => {
            const tot = sizes.reduce((a, s) => a + (cell[c]?.[s]?.balance || 0), 0);
            return (
              <TableRow key={c}>
                <TableCell className="cell-title" style={{ fontWeight: 600 }}>{c}</TableCell>
                {sizes.map(s => { const v = cell[c]?.[s]; return (
                  <TableCell key={s} className="num text-right p-0" style={{ color: !v ? 'var(--ink-4)' : v.balance < 0 ? 'var(--bad)' : v.balance === 0 ? 'var(--ink-4)' : 'var(--ink)' }}>
                    {v && onPickSku
                      ? <button type="button" className="w-full h-full px-3 py-2 text-right hover:bg-muted/50 transition-colors"
                          title="ดูประวัติการเคลื่อนไหวของตัวนี้" onClick={() => onPickSku(v.key || `${design}||${c}||${s}`)}>{N(v.balance)}</button>
                      : <span className="block px-3 py-2">{v ? N(v.balance) : '—'}</span>}
                  </TableCell>
                ); })}
                <TableCell className="num text-right" style={{ fontWeight: 700 }}>{N(tot)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table></CardTable>
    </Card>
  );
}

/* ============================================================
   ประวัติการนับ (PART 115)
   ============================================================
   เดิมเป็นลิสต์ 8 บรรทัดอ่านอย่างเดียว — ย้อนดูไม่ได้ว่ารอบนั้นต่างจากระบบเท่าไร และนับผิดแล้วลบไม่ได้
   ตอนนี้: ตารางเรียงได้ + คอลัมน์ผลต่าง + กดดูรายละเอียดราย SKU + ยกเลิกรอบ (คืนค่าไปใช้การนับก่อนหน้า)
   ============================================================ */
const DiffChip = ({ diff, first }) => {
  if (first) return <span className="cap" style={{ color: 'var(--ink-4)' }}>นับครั้งแรก</span>;
  if (diff === 0) return <span className="cap" style={{ color: 'var(--good)', fontWeight: 700 }}>ตรง</span>;
  return <span className="num" style={{ color: diff > 0 ? 'var(--info)' : 'var(--bad)', fontWeight: 700 }}>{diff > 0 ? '+' : ''}{N(diff)}</span>;
};

export function CountHistory({ sessions, counts, skus, mayEdit, usingMoves, moves, pos, onOpen, onDeleted }) {
  const [busy, setBusy] = useState('');
  // ผลต่างทุกรอบในครั้งเดียว (สร้างดัชนีรอบเดียว) — เรียกทีละรอบทำให้หน้าค้างเมื่อของเยอะจริง
  const stat = useMemo(() => allSessionTotals(counts, skus), [counts, skus]);

  const remove = async (se) => {
    const t = stat[se.sessionId] || {};
    // ประวัติในโหมด moves รวม "การรับเข้าจาก PO" ด้วย → ข้อความต้องไม่เรียกทุกอย่างว่า "รอบนับ"
    const isIn = se.kind === 'in';
    const what = isIn ? 'การรับเข้า' : se.kind === 'open' ? 'สต็อกตั้งต้น' : 'การนับ';
    const ok = await confirm({
      title: `ยกเลิก${what} ${se.date}`,
      body: `${what} ${N(se.rows)} SKU รวม ${N(se.qty)} ตัว${t.diff ? ` (ผลต่าง ${t.diff > 0 ? '+' : ''}${N(t.diff)} ตัว)` : ''}\n\n${isIn
        ? 'ของที่รับเข้ารอบนี้จะถูกหักออกจากคงเหลือ'
        : 'คงเหลือของ SKU ในรอบนี้จะย้อนไปใช้ "การนับครั้งก่อนหน้า" แทน · ถ้าไม่มีการนับก่อนหน้า SKU นั้นจะกลับไปเป็น "ยังไม่นับ"'}\n${usingMoves
        ? 'ระบบจะบันทึกเป็น "รายการยกเลิก" ต่อท้ายสมุด (ประวัติเดิมยังอยู่ ตรวจย้อนได้)'
        : 'ลบแล้วกู้คืนไม่ได้'}`,
      danger: true, confirmText: 'ยกเลิกรอบนี้',
    });
    if (!ok) return;
    setBusy(se.sessionId);
    /* ⚠️ สมุดเคลื่อนไหวเป็น append-only (revoke delete) — ลบแถวไม่ได้
       เดิมยิง deleteStockSession ที่ลบเฉพาะ tmk_stock_counts แล้วรายงานสำเร็จเสมอ
       พอหน้าอ่านจาก moves = หมุดเดิมยังอยู่ คงเหลือไม่ขยับ แต่ toast บอกว่าย้อนแล้ว
       (รอบที่เป็น "รับเข้าจาก PO" ยิ่งหนัก — แมตช์ 0 แถวใน counts จึงไม่ error เลย)
       โหมด moves จึง "ลงแถวยกเลิก" ตามหลักการของสมุดเอง */
    const r = usingMoves
      ? await appendStockMoves([voidMove({ roundId: se.roundId, movedOn: todayISO(), by: userEmail() || '', note: `ยกเลิก${what} ${se.date}` })])
      : await deleteStockSession(se.sessionId);
    const error = r?.error;
    setBusy('');
    if (error) {
      toast(r?.missing ? `ต้องรัน migration ${MOVES_MIGRATION} ก่อน` : 'ยกเลิกรอบไม่สำเร็จ: ' + pgErrorText(error), r?.missing ? 'warn' : 'error');
      return;
    }
    /* ⚠️ ยกเลิก "การรับเข้า" ต้องย้อนใบสั่งผลิตด้วย ไม่ใช่แค่สมุดสต็อก
       เดิมสต็อกลดถูกต้อง แต่ใบยัง received เต็ม + status='received' (ปิดใบ)
       → ช่องรับเข้าเริ่มต้น = qty − received = 0 → รับของงวดนั้นกลับเข้าใหม่ไม่ได้เลย */
    let poWarn = '';
    if (isIn && se.refType === 'po' && se.sessionId) {
      const po = (pos || []).find(x => x.id === se.sessionId);
      if (po) {
        const back = {};
        (moves || []).forEach(m => {
          if (m.kind !== 'in' || String(m.ref_id) !== se.sessionId) return;
          if ((m.round_id || '') !== se.roundId && (m.id || '').indexOf(se.roundId) !== 0) return;
          back[skuKey(m.design, m.color, m.size)] = (back[skuKey(m.design, m.color, m.size)] || 0) + (Number(m.qty) || 0);
        });
        const items = (po.items || []).map(it => {
          const b = back[skuKey(it.design, it.color, it.size)] || 0;
          return b ? { ...it, received: Math.max(0, (Number(it.received) || 0) - b) } : it;
        });
        const done = items.every(it => (Number(it.received) || 0) >= (Number(it.qty) || 0));
        const pr = await savePurchaseOrder({ ...po, items, status: done ? 'received' : 'producing', received_date: done ? po.received_date : '' });
        if (pr?.error) poWarn = ` — แต่ปรับใบสั่ง ${po.id} ไม่สำเร็จ (${pgErrorText(pr.error)}) ให้เปิดใบตรวจอีกครั้ง`;
      }
    }
    logAudit({ action: 'delete', entityType: 'product', entityName: `${what} ${se.date}`, summary: `ยกเลิก${what} ${se.date} · ${se.rows} SKU ${se.qty} ตัว${usingMoves ? ' (ลงรายการยกเลิกในสมุด)' : ''}` });
    toast(`ยกเลิก${what} ${se.date} แล้ว${poWarn}`, poWarn ? 'warn' : 'success');
    onDeleted();
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-[22px] pb-3">
        <CardHead icon="clock" title="ประวัติการนับ"
          sub={`${N(sessions.length)} รอบ · กดที่แถวเพื่อดูผลต่างราย SKU (นับได้ เทียบกับที่ระบบคิด ณ วันนั้น)`} />
      </div>
      <SortableTable
        cards
        initial={{ key: 'date', dir: 'desc' }}
        columns={[
          { key: 'date', label: 'วันที่นับ' },
          { key: 'kind', label: 'ประเภท' },
          { key: 'rows', label: 'SKU', align: 'right' },
          { key: 'qty', label: 'นับได้', align: 'right' },
          { key: 'diff', label: 'ผลต่าง', align: 'right', accessor: se => Math.abs(stat[se.sessionId]?.diff || 0) },
          { key: 'by', label: 'โดย', className: 'hidden md:table-cell' },
          { key: 'note', label: 'หมายเหตุ', className: 'hidden lg:table-cell', sortable: false },
          { key: '_act', label: '', sortable: false },
        ]}
        rows={sessions}
        renderRow={(se) => {
          const t = stat[se.sessionId] || {};
          const allFirst = (t.skus || 0) > 0 && t.first === t.skus;
          return (
            <TableRow key={se.sessionId} className="cursor-pointer" onClick={() => onOpen(se)}>
              <TableCell className="cell-title num" style={{ fontWeight: 600 }}>{se.date}</TableCell>
              <TableCell><Badge variant={se.kind === 'open' ? 'secondary' : 'outline'}>{se.kind === 'open' ? 'ตั้งต้น' : 'นับปกติ'}</Badge></TableCell>
              <TableCell className="num text-right" style={{ color: 'var(--ink-3)' }}>{N(se.rows)}</TableCell>
              <TableCell className="num text-right" style={{ fontWeight: 700 }}>{N(se.qty)}</TableCell>
              <TableCell className="text-right"><DiffChip diff={t.diff} first={allFirst} /></TableCell>
              <TableCell className="cap hidden md:table-cell" style={{ color: 'var(--ink-4)' }}>{se.by || '—'}</TableCell>
              <TableCell className="cap hidden lg:table-cell" style={{ color: 'var(--ink-4)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{se.note || '—'}</TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm" className="h-7" onClick={() => onOpen(se)}>ดู</Button>
                {mayEdit && isAdmin() && (
                  <Button variant="ghost" size="sm" className="h-7" style={{ color: 'var(--bad)' }} disabled={busy === se.sessionId} onClick={() => remove(se)}>
                    {busy === se.sessionId ? 'กำลังลบ…' : 'ยกเลิกรอบ'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        }}
      />
    </Card>
  );
}

/* ---------- รายละเอียดรอบนับ: ผลต่างราย SKU ---------- */
function SessionDetailSheet({ session, counts, skus, onClose }) {
  const v = useMemo(() => sessionVariance(counts, skus, session.sessionId), [counts, skus, session]);
  const t = v.totals;
  return (
    <SideSheet size="lg" icon="clock" title={`รอบนับ ${session.date}`}
      sub={`${session.kind === 'open' ? 'สต็อกตั้งต้น' : 'นับรอบปกติ'} · ${N(t.skus)} SKU · นับได้ ${N(t.counted)} ตัว${session.by ? ` · โดย ${session.by}` : ''}`}
      onClose={onClose} footer={<Button variant="outline" onClick={onClose}>ปิด</Button>}>
      <div className="flex flex-col gap-3">
        <div className="kpi8">
          <KpiCard index={0} label="นับได้" value={N(t.counted)} sub={`${N(t.skus)} SKU`} />
          <KpiCard index={1} label="ระบบคิดไว้" value={t.skus > t.first ? N(t.system) : '—'} sub={t.first ? `${N(t.first)} SKU นับครั้งแรก` : 'เทียบได้ทุก SKU'} tone="var(--info)" />
          <KpiCard index={2} label="ผลต่างรวม" value={t.skus > t.first ? `${t.diff > 0 ? '+' : ''}${N(t.diff)}` : '—'}
            valueColor={t.diff === 0 ? 'var(--good)' : t.diff > 0 ? 'var(--info)' : 'var(--bad)'}
            sub={t.diff === 0 ? 'ตรงกับระบบทั้งหมด' : t.diff > 0 ? 'ของเกินระบบ' : 'ของขาดจากระบบ'}
            tone={t.diff === 0 ? 'var(--good)' : 'var(--warn)'} />
          <KpiCard index={3} label="ตรง / เกิน / ขาด" value={`${N(t.match)} / ${N(t.plus)} / ${N(t.minus)}`} sub="จำนวน SKU" tone="var(--accent)" />
        </div>
        {session.note && <div className="cap" style={{ color: 'var(--ink-3)' }}>หมายเหตุ: {session.note}</div>}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--line)' }}>
          <div className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px] gap-2 px-3 py-1.5 bg-muted/40 cap" style={{ color: 'var(--ink-4)' }}>
            <span>SKU</span><span className="text-right">ระบบคิด</span><span className="text-right">นับได้</span><span className="text-right">ต่าง</span>
          </div>
          <div className="divide-y">
            {v.rows.map(r => (
              <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_72px_72px_72px] gap-2 items-center px-3 py-1.5">
                <span className="text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.design} · {r.color} · <b>{r.size}</b>
                  {!r.first && <span className="cap" style={{ color: 'var(--ink-4)' }}> · นับก่อนหน้า {N(r.prevQty)} ({r.prevDate}) − ขาย {N(r.sold)}</span>}
                </span>
                <span className="num text-right cap" style={{ color: 'var(--ink-4)' }}>{r.first ? '—' : N(r.system)}</span>
                <span className="num text-right" style={{ fontWeight: 700 }}>{N(r.counted)}</span>
                <span className="text-right"><DiffChip diff={r.diff} first={r.first} /></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SideSheet>
  );
}

/* ---------- โหมดนับ: เลือกลาย → กรอกจำนวนจริงต่อ สี × ไซซ์ ---------- */
function CountSheet({ initial, rows, designs, catalog = [], onClose, onSaved }) {
  const [design, setDesign] = useState(initial.design || '');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  /* นับตอนไหน — เปลี่ยนความหมายของ "ยอดขายวันที่นับ"
     ปิดร้าน (ค่าเริ่มต้น · พฤติกรรมเดิมของระบบ) = ที่นับได้รวมยอดขายวันนั้นแล้ว
     ตอนเช้า = นับก่อนเปิดขาย → ต้องหักยอดของวันนั้นออกด้วย ไม่งั้นคงเหลือสูงเกินจริง */
  const [eod, setEod] = useState(true);
  const [vals, setVals] = useState({});      // key → จำนวนที่นับได้ (string)
  const [busy, setBusy] = useState(false);
  const [extraColor, setExtraColor] = useState('');
  const [extraSize, setExtraSize] = useState('');
  // ช่องที่ต้องนับ = "สี × ไซซ์ ตามสินค้า" เป็นหลัก (ลายที่ยังไม่เคยขายก็นับได้)
  // แล้ว union กับของที่มีอยู่จริงในสต็อก (กันของค้างที่หลุดจากแคตตาล็อกหาย)
  const matrix = useMemo(() => productMatrix(catalog, design), [catalog, design]);
  const product = useMemo(() => findProduct(catalog, design), [catalog, design]);
  const grid = useMemo(() => designGrid(rows, design), [rows, design]);
  const cur = useMemo(() => Object.fromEntries((rows || []).filter(r => r.design === design).map(r => [skuKey(r.design, r.color, r.size), r.balance])), [rows, design]);
  const keys = useMemo(() => {
    const out = [];
    const push = (color, size) => { if (color && size && !out.some(x => x.color === color && x.size === size)) out.push({ color, size }); };
    matrix.colors.forEach(c => matrix.sizes.forEach(sz => push(c, sz)));                     // จากสินค้า
    grid.colors.forEach(c => grid.sizes.forEach(sz => { if (grid.cell[c]?.[sz]) push(c, sz); })); // ของที่มีอยู่จริง
    Object.keys(vals).forEach(k => { const [, c, sz] = k.split('||'); push(c, sz); });        // แถวที่เพิ่งเพิ่มเอง
    return out.sort((a, b) => a.color.localeCompare(b.color, 'th') || sizeRank(a.size) - sizeRank(b.size));
  }, [matrix, grid, vals]);
  const offCatalog = useMemo(() => {
    if (!matrix.colors.length) return [];
    return keys.filter(k => !matrix.colors.includes(k.color) || !matrix.sizes.includes(k.size));
  }, [keys, matrix]);

  const setVal = (color, size, v) => setVals(p => ({ ...p, [skuKey(design, color, size)]: v }));
  const addRow = () => {
    if (!extraColor.trim() || !extraSize.trim()) { toast('ใส่ทั้งสีและไซซ์', 'warn'); return; }
    setVal(normColor(extraColor), normSizeStock(extraSize), '0');
    setExtraColor(''); setExtraSize('');
  };
  const filled = Object.entries(vals).filter(([, v]) => String(v).trim() !== '');
  const totalCounted = filled.reduce((a, [, v]) => a + (Number(v) || 0), 0);
  const totalSystem = filled.reduce((a, [k]) => a + (Number(cur[k]) || 0), 0);
  const diff = totalCounted - totalSystem;

  const save = async () => {
    if (!design) { toast('เลือกลายก่อน', 'warn'); return; }
    if (!filled.length) { toast('ยังไม่ได้กรอกจำนวน', 'warn'); return; }
    setBusy(true);
    const hit = product || resolveDesign(design);   // รหัสสินค้า: ยึดแคตตาล็อกก่อน
    const payload = filled.map(([k, v]) => { const [, color, size] = k.split('||'); return { design, color, size, qty: Number(v) || 0, productCode: hit?.code || '' }; });
    let movesErr = '';
    const r = await saveStockCount({ rows: payload, countDate: date, kind: 'count', note, by: userEmail() || '' });
    // เขียนคู่ลงสมุดเคลื่อนไหว (ธง eod มีผลเฉพาะเมื่ออ่านจาก moves)
    if (!r.error && r.sessionId) {
      // moves เป็นแหล่งอ่านหลักแล้ว → เขียนพลาดต้องบอก ไม่งั้นนับแล้วตัวเลขไม่ขยับโดยไม่รู้สาเหตุ
      const mr = await appendStockMoves(movesFromCount({ rows: payload, countDate: date, kind: 'count', sessionId: r.sessionId, by: userEmail() || '', note, eod })).catch(e => ({ error: e }));
      /* ⚠️ missing (ตาราง/คอลัมน์หาย) ก็ต้องบอก — เดิมกลืนเงียบแล้ว toast success ต่อ
         ซึ่งคือ "นับแล้วตัวเลขไม่ขยับโดยไม่รู้สาเหตุ" ที่ทั้งระบบนี้ตั้งใจกำจัด */
      movesErr = mr?.error
        ? (mr.missing ? `ยังไม่ได้รัน migration ${MOVES_ROUND_MIGRATION} — คงเหลือจะยังไม่อัปเดต`
                      : 'บันทึกลงสมุดเคลื่อนไหวไม่สำเร็จ: ' + pgErrorText(mr.error))
        : '';
    }
    setBusy(false);
    if (r.error) { toast(r.missing ? `ต้องรัน migration ${STOCK_MIGRATION} ก่อน` : 'บันทึกไม่สำเร็จ: ' + pgErrorText(r.error), r.missing ? 'warn' : 'error'); return; }
    logAudit({ action: 'update', entityType: 'product', entityName: design, summary: `นับสต็อก "${design}" ${payload.length} SKU รวม ${totalCounted} ตัว (${date})` });
    if (movesErr) toast(`บันทึกการนับแล้ว แต่ ${movesErr}`, 'warn');
    else toast(`บันทึกการนับ ${payload.length} SKU แล้ว`, 'success');
    onSaved();
  };

  return (
    <SideSheet size="lg" icon="listChecks" title="นับสต็อก" sub={design ? `${design} · นับ ณ ${date}` : 'เลือกลายที่จะนับ'} onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
        <Button disabled={busy || !filled.length} onClick={save}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : `บันทึกการนับ (${filled.length} SKU)`}</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="ลาย (จากสินค้า)">
            <DesignCombobox value={design} code={matrix.code} items={designItems(catalog, designs)}
              onPick={({ name }) => { setDesign(name); setVals({}); }} placeholder="ค้นหา/เลือกลายจากสินค้า" />
          </Field>
          <Field label="นับ ณ วันที่">
            {/* กันเลือกวันอนาคต — anchor วันอนาคตทำให้ SKU นั้นหยุดหักยอดขายจนถึงวันนั้น */}
            <DatePicker value={date} onChange={setDate} clearable={false} max={todayISO()} />
          </Field>
          <Field label="นับตอนไหน">
            {/* เปลี่ยนความหมายของยอดขายวันที่นับ — นับตอนเช้าแล้วขายต่อทั้งวัน ถ้าไม่บอกระบบ คงเหลือจะสูงเกินจริง */}
            <ToggleGroup type="single" value={eod ? 'eod' : 'am'} onValueChange={(v) => v && setEod(v === 'eod')} className="justify-start">
              <ToggleGroupItem value="eod" className="h-9 px-3 text-xs">ปิดร้าน</ToggleGroupItem>
              <ToggleGroupItem value="am" className="h-9 px-3 text-xs">ก่อนเปิดขาย</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        </div>
        <div className="text-[11px] -mt-1" style={{ color: 'var(--ink-4)' }}>
          {eod
            ? 'นับตอนปิดร้าน = ยอดที่ขายไปวันนี้ถือว่ารวมอยู่ในจำนวนที่นับแล้ว'
            : 'นับก่อนเปิดขาย = ระบบจะหักยอดที่ขายวันนี้ออกจากจำนวนที่นับให้อีกที'}
        </div>

        {design ? (
          <>
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--line)' }}>
              <div className="grid grid-cols-[1fr_84px_84px_72px] gap-2 px-3 py-1.5 bg-muted/40 cap" style={{ color: 'var(--ink-4)' }}>
                <span>สี / ไซซ์</span><span className="text-right">ระบบคิด</span><span className="text-right">นับได้</span><span className="text-right">ต่าง</span>
              </div>
              <div className="divide-y">
                {keys.length === 0 && <div className="p-4 cap" style={{ color: 'var(--ink-4)' }}>ลายนี้ยังไม่ได้ตั้งสี/ไซซ์ในหน้า "สินค้า" — เพิ่มสี/ไซซ์ด้านล่างเพื่อเริ่มนับ</div>}
                {keys.map(({ color, size }) => {
                  const k = skuKey(design, color, size);
                  const sys = Number(cur[k]) || 0;
                  const v = vals[k] ?? '';
                  const d = String(v).trim() === '' ? null : (Number(v) || 0) - sys;
                  return (
                    <div key={k} className="grid grid-cols-[1fr_84px_84px_72px] gap-2 items-center px-3 py-1.5">
                      <span className="text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{color} · <b>{size}</b></span>
                      <span className="num text-right cap" style={{ color: 'var(--ink-4)' }}>{N(sys)}</span>
                      <Input type="number" inputMode="numeric" min="0" value={v} placeholder="—" className="h-8 text-right"
                        aria-label={`นับได้ ${color} ${size}`} onChange={e => setVal(color, size, e.target.value)} />
                      <span className="num text-right cap" style={{ color: d == null ? 'var(--ink-4)' : d === 0 ? 'var(--good)' : d > 0 ? 'var(--info)' : 'var(--bad)', fontWeight: 700 }}>
                        {d == null ? '' : d === 0 ? 'ตรง' : (d > 0 ? '+' : '') + N(d)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {/* เลือกจากสี/ไซซ์ของสินค้า (ไม่พิมพ์เอง → ไม่มี SKU เพี้ยนจากพิมพ์ผิด) */}
              <div style={{ width: 150 }}><ColorSelect design={product} value={extraColor} onChange={setExtraColor} placeholder="เพิ่มสี" /></div>
              <div style={{ width: 110 }}><SizeSelect design={product} value={extraSize} onChange={setExtraSize} placeholder="ไซซ์" /></div>
              <Button variant="outline" size="sm" className="h-8" onClick={addRow}><Icon name="plus" /> เพิ่มแถว</Button>
              {offCatalog.length > 0 && (
                <Badge variant="outline" className="gap-1" title={offCatalog.map(k => `${k.color}·${k.size}`).join(', ')}>
                  <Icon name="alertTriangle" style={{ color: 'var(--warn)' }} /> {N(offCatalog.length)} ช่องไม่มีในสินค้า
                </Badge>
              )}
              <span className="cap ml-auto" style={{ color: 'var(--ink-4)' }}>กรอกแล้ว {N(filled.length)} ช่อง · รวมนับได้ <b style={{ color: 'var(--ink)' }}>{N(totalCounted)}</b> ตัว {filled.length > 0 && <>· ต่างจากระบบ <b style={{ color: diff === 0 ? 'var(--good)' : 'var(--warn)' }}>{diff === 0 ? 'ไม่ต่าง' : (diff > 0 ? '+' : '') + N(diff)}</b></>}</span>
            </div>

            <Field label="หมายเหตุ (ไม่บังคับ)">
              <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น นับรอบสิ้นเดือน / เจอของเสีย 2 ตัว" />
            </Field>
          </>
        ) : <div className="cap" style={{ color: 'var(--ink-4)' }}>เลือกลายก่อน — ระบบจะกางช่องนับตามสี × ไซซ์ ที่ตั้งไว้ในหน้า "สินค้า"</div>}
      </div>
    </SideSheet>
  );
}

/* ---------- นำเข้าสต็อกตั้งต้นจากไฟล์ ---------- */
function ImportSheet({ catalog = [], onClose, onSaved }) {
  const [grid, setGrid] = useState(null);
  const [paste, setPaste] = useState('');
  const [date, setDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const parsed = useMemo(() => (grid ? parseStockGrid(grid) : null), [grid]);
  const merged = useMemo(() => (parsed ? mergeStockRows(parsed.rows) : []), [parsed]);
  // จับคู่ชื่อในไฟล์ → ลายจริง: แคตตาล็อก "สินค้า" ก่อน (ชื่อ/รหัส) แล้วค่อย resolver เดิม (alias/สะกดต่าง)
  const resolver = useMemo(() => catalogResolver(catalog, resolveDesign), [catalog]);
  const matched = useMemo(() => matchDesigns(merged, resolver), [merged, resolver]);
  const totalQty = matched.rows.reduce((a, r) => a + r.qty, 0);

  const onFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setErr('');
    try { setGrid(await fileToGrid(f)); } catch (ex) { setErr(ex?.message || 'อ่านไฟล์ไม่สำเร็จ'); }
  };

  const save = async () => {
    if (!matched.rows.length) return;
    setBusy(true);
    const r = await saveStockCount({ rows: matched.rows, countDate: date, kind: 'open', note: 'นำเข้าสต็อกตั้งต้นจากไฟล์', by: userEmail() || '' });
    if (!r.error && r.sessionId) {
      const mr = await appendStockMoves(movesFromCount({ rows: matched.rows, countDate: date, kind: 'open', sessionId: r.sessionId, by: userEmail() || '', note: 'นำเข้าสต็อกตั้งต้นจากไฟล์' })).catch(e => ({ error: e }));
      if (mr?.error && !mr?.missing) toast('บันทึกลงสมุดเคลื่อนไหวไม่สำเร็จ — คงเหลืออาจยังไม่อัปเดต: ' + pgErrorText(mr.error), 'error');
    }
    setBusy(false);
    if (r.error) { toast(r.missing ? `ต้องรัน migration ${STOCK_MIGRATION} ก่อน` : 'บันทึกไม่สำเร็จ: ' + pgErrorText(r.error), r.missing ? 'warn' : 'error'); return; }
    logAudit({ action: 'create', entityType: 'product', entityName: 'สต็อกตั้งต้น', summary: `นำเข้าสต็อกตั้งต้น ${matched.rows.length} SKU รวม ${totalQty} ตัว (ณ ${date})` });
    toast(`นำเข้าสต็อกตั้งต้น ${matched.rows.length} SKU แล้ว`, 'success');
    onSaved();
  };

  return (
    <SideSheet size="lg" icon="upload" title="นำเข้าสต็อกตั้งต้น" sub="จากไฟล์ Excel/CSV หรือคัดลอกจากตารางมาวาง" onClose={onClose}
      footer={<>
        <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
        <Button disabled={busy || !matched.rows.length} onClick={save}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : `บันทึกเป็นสต็อกตั้งต้น (${matched.rows.length} SKU)`}</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          <div className="cap" style={{ color: 'var(--ink-3)' }}>
            รองรับ 2 แบบ: <b>คอลัมน์ยาว</b> (ลาย · สี · ไซซ์ · จำนวน) หรือ <b>ตารางไขว้</b> (แถว = สี · คอลัมน์ = ไซซ์ · ชื่อลายอยู่บรรทัดหัว)
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer rounded-md border px-3 py-1.5 hover:bg-muted" style={{ borderColor: 'var(--line)' }}>
            <Icon name="upload" /> เลือกไฟล์ (.xlsx/.csv)
            <input type="file" accept=".xlsx,.xls,.xlsm,.xlsb,.csv" className="hidden" onChange={onFile} />
          </label>
          <span className="cap" style={{ color: 'var(--ink-4)' }}>หรือคัดลอกจาก Excel แล้ววางด้านล่าง</span>
          <span className="row" style={{ gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
            <span className="cap" style={{ color: 'var(--ink-3)' }}>ยอดนี้คือ ณ วันที่</span>
            <DatePicker value={date} onChange={setDate} clearable={false} max={todayISO()} className="w-40" />
          </span>
        </div>
        <Textarea rows={4} value={paste} placeholder="วางตารางที่คัดลอกมาที่นี่…" onChange={e => { setPaste(e.target.value); setGrid(e.target.value.trim() ? pasteToGrid(e.target.value) : null); }} />

        {err && <div className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--bad)', color: 'var(--bad)' }}>{err}</div>}

        {parsed && (
          <>
            <div className="row cap" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge variant={parsed.layout.mode === 'unknown' ? 'destructive' : 'secondary'}>
                {parsed.layout.mode === 'long' ? 'อ่านแบบคอลัมน์ยาว' : parsed.layout.mode === 'matrix' ? 'อ่านแบบตารางไขว้' : 'อ่านหัวตารางไม่ออก'}
              </Badge>
              <span style={{ color: 'var(--ink-3)' }}>ได้ <b style={{ color: 'var(--ink)' }}>{N(matched.rows.length)}</b> SKU · รวม <b style={{ color: 'var(--ink)' }}>{N(totalQty)}</b> ตัว</span>
              {parsed.skipped.length > 0 && <span style={{ color: 'var(--warn)', fontWeight: 600 }}>ข้าม {N(parsed.skipped.length)} แถว</span>}
            </div>

            {matched.unmatched.length > 0 && (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 7%, transparent)' }}>
                <div className="cap" style={{ fontWeight: 700, color: 'var(--warn)', marginBottom: 4 }}>ชื่อลายที่จับคู่กับแคตตาล็อกไม่ได้ ({matched.unmatched.length})</div>
                <div className="cap" style={{ color: 'var(--ink-3)' }}>{matched.unmatched.slice(0, 10).map(u => `${u.design} (${u.rows})`).join(' · ')}{matched.unmatched.length > 10 ? ' …' : ''}</div>
                <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>ยังบันทึกได้ตามชื่อในไฟล์ — แต่ยอดขายจะหักออกก็ต่อเมื่อชื่อลายตรงกับที่ขายจริง</div>
              </div>
            )}

            {parsed.skipped.length > 0 && (
              <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
                <div className="cap" style={{ fontWeight: 700, marginBottom: 4 }}>แถวที่ข้าม</div>
                <div className="flex flex-col gap-0.5">
                  {parsed.skipped.slice(0, 8).map((s, i) => <div key={i} className="cap" style={{ color: 'var(--ink-4)' }}>แถว {s.row}: {s.reason}</div>)}
                  {parsed.skipped.length > 8 && <div className="cap" style={{ color: 'var(--ink-4)' }}>…อีก {parsed.skipped.length - 8} แถว</div>}
                </div>
              </div>
            )}

            {matched.rows.length > 0 && (
              <CardTable style={{ maxHeight: 320, overflow: 'auto' }}><Table>
                <TableHeader><TableRow><TableHead>ลาย</TableHead><TableHead>สี</TableHead><TableHead>ไซซ์</TableHead><TableHead className="text-right">จำนวน</TableHead></TableRow></TableHeader>
                <TableBody>
                  {matched.rows.slice(0, 200).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="cell-title">{r.design}{r.productCode ? <span className="cap" style={{ color: 'var(--ink-4)' }}> · {r.productCode}</span> : null}</TableCell>
                      <TableCell>{r.color}</TableCell><TableCell>{r.size}</TableCell>
                      <TableCell className="num text-right" style={{ fontWeight: 700 }}>{N(r.qty)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table></CardTable>
            )}
            {matched.rows.length > 200 && <div className="cap" style={{ color: 'var(--ink-4)' }}>แสดง 200 แถวแรก — บันทึกทั้งหมด {N(matched.rows.length)} SKU</div>}
          </>
        )}
      </div>
    </SideSheet>
  );
}

/* ============================================================
   ใบสั่งผลิต (PO) — PART 113
   ============================================================
   รายการใบ + ตัวกรอง "แยกรายคน" · สร้าง/แก้ใบ · รับเข้า (แปลงเป็นจุดอ้างอิงสต็อกใหม่)
   ============================================================ */
export function PoPanel({ pos, allPos, missing, people, person, setPerson, status, setStatus, mayEdit, onNew, onEdit, onReceive }) {
  const sum = poSummary(allPos);
  if (missing) {
    return (
      <Card className="p-4" style={{ borderLeft: '3px solid var(--warn)' }}>
        <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="alertTriangle" style={{ color: 'var(--warn)' }} />
          <b>ยังเปิดใช้ใบสั่งผลิตไม่ได้</b>
          <span className="cap" style={{ color: 'var(--ink-3)' }}>ต้องรัน <code>{PO_MIGRATION}</code> ใน Supabase ก่อน</span>
        </div>
      </Card>
    );
  }
  return (
    <>
      <Card className="p-[22px]">
        <CardHead icon="listChecks" title="ใบสั่งผลิต"
          sub={`เปิดอยู่ ${N(sum.open)} ใบ · สั่งรวม ${N(sum.qty)} ตัว · ค้างรับ ${N(sum.pending)} ตัว · รับเข้าแล้วสต็อกอัปเดตให้เอง`}
          right={mayEdit ? <Button size="sm" onClick={onNew}><Icon name="plus" /> สร้างใบสั่งผลิต</Button> : null} />
        {/* ตัวกรอง: สถานะ + แยกรายคน */}
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          <ToggleGroup type="single" value={status} onValueChange={(v) => v && setStatus(v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5">
            <ToggleGroupItem value="open" size="sm" className="px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">ที่ยังไม่ปิด</ToggleGroupItem>
            {PO_STATUS.filter(s => s.id !== 'draft').map(s => (
              <ToggleGroupItem key={s.id} value={s.id} size="sm" className="px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">{s.label}</ToggleGroupItem>
            ))}
            <ToggleGroupItem value="all" size="sm" className="px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">ทั้งหมด</ToggleGroupItem>
          </ToggleGroup>
          {/* ชิปเลือกคน = คอมโพเนนต์กลาง (ใช้ร่วมกับ popup รายวัน) ไม่ทำสไตล์ชิปซ้ำ */}
          <PersonChips people={people} value={person} onChange={setPerson} />
        </div>
      </Card>

      {pos.length === 0
        ? <Card className="p-0 overflow-hidden"><EmptyState icon="listChecks" title="ยังไม่มีใบสั่งผลิตตามตัวกรอง" hint={mayEdit ? 'กด "สร้างใบสั่งผลิต" เพื่อเปิดใบแรก' : ''} /></Card>
        : <div className="flex flex-col gap-2">
            {pos.map(p => {
              const t = poTotals(p), st = poStatusMeta(p.status);
              const late = isPoOpen(p) && p.due_date && p.due_date < todayISO();
              return (
                <Card key={p.id} className="p-[14px]">
                  <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="num" style={{ fontWeight: 800, fontSize: 14 }}>{p.id}</span>
                    <Badge variant="outline" style={{ color: st.tone, borderColor: st.tone }}>{st.label}</Badge>
                    {late && <Badge variant="outline" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}>เลยกำหนดรับ</Badge>}
                    {p.responsible && <span className="row cap" style={{ gap: 5, alignItems: 'center', color: 'var(--ink-3)' }}><PersonAvatar name={p.responsible} size={18} />{p.responsible}</span>}
                    {p.supplier && <span className="cap" style={{ color: 'var(--ink-4)' }}>· {p.supplier}</span>}
                    <span className="row cap" style={{ gap: 10, marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: 'var(--ink-4)' }}>สั่ง {p.order_date}{p.due_date ? ` · รับ ${p.due_date}` : ''}</span>
                      <span className="num" style={{ color: 'var(--ink)', fontWeight: 700 }}>{N(t.received)}/{N(t.qty)} ตัว</span>
                      {mayEdit && <>
                        {isPoOpen(p) && <Button size="sm" className="h-7" onClick={() => onReceive(p)}><Icon name="upload" /> รับเข้า</Button>}
                        <Button variant="ghost" size="sm" className="h-7" onClick={() => onEdit(p)}><Icon name="pencil" /> แก้ไข</Button>
                      </>}
                    </span>
                  </div>
                  {t.qty > 0 && (
                    <Progress className="mt-2 h-1.5" value={t.pct} indicatorColor={t.pct >= 100 ? 'var(--good)' : 'var(--accent)'}
                      aria-label={`รับเข้าแล้ว ${t.received} จาก ${t.qty} ตัว`} />
                  )}
                  <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 6 }}>
                    {(Array.isArray(p.items) ? p.items : []).slice(0, 4).map(it => `${it.design} ${it.color} ${it.size}×${it.qty}`).join(' · ')}
                    {(p.items || []).length > 4 ? ` …อีก ${(p.items || []).length - 4} รายการ` : ''}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </Card>
              );
            })}
          </div>}
    </>
  );
}

/* ---------- สร้าง/แก้ใบสั่งผลิต ---------- */
function PoSheet({ po, designs, rows, catalog = [], people = [], onClose, onSaved }) {
  const [f, setF] = useState(() => ({ ...po, items: [...(po.items || [])] }));
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState({ design: '', color: '', size: '', qty: '' });
  const pickProduct = useMemo(() => findProduct(catalog, pick.design), [catalog, pick.design]);
  const t = poTotals(f);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const addItem = () => {
    if (!pick.design || !pick.color.trim() || !pick.size.trim() || !(Number(pick.qty) > 0)) { toast('เลือกลาย/สี/ไซซ์ และใส่จำนวนให้ครบ', 'warn'); return; }
    setF(p => ({ ...p, items: [...p.items, { design: pick.design, color: normColor(pick.color), size: normSizeStock(pick.size), qty: Math.round(Number(pick.qty)), received: 0 }] }));
    setPick({ design: pick.design, color: '', size: '', qty: '' });
  };
  const rmItem = (i) => setF(p => ({ ...p, items: p.items.filter((_, j) => j !== i) }));
  const save = async () => {
    if (!f.items.length) { toast('ยังไม่มีรายการในใบสั่ง', 'warn'); return; }
    setBusy(true);
    const r = await savePurchaseOrder({ ...f, created_by: userEmail() || '' }, { isNew: !po.createdExisting });
    setBusy(false);
    if (r.error) {
      // readFailed = อ่านใบเดิมไม่ได้ จึงยังไม่เขียนอะไรเลย (กันทับใบคนอื่น/ย้อนยอดรับเข้า)
      toast(r.missing ? `ต้องรัน migration ${PO_MIGRATION} ก่อน`
        : r.readFailed ? 'อ่านใบสั่งเดิมไม่สำเร็จ — ยังไม่บันทึก (กันเขียนทับของคนอื่น) ลองใหม่อีกครั้ง'
        : 'บันทึกไม่สำเร็จ: ' + pgErrorText(r.error), r.missing ? 'warn' : 'error');
      return;
    }
    if (r.renamedTo) toast(`มีคนใช้เลขใบนี้ไปแล้ว — บันทึกเป็น ${r.renamedTo} แทน`, 'info');
    logAudit({ action: 'create', entityType: 'product', entityName: f.id, summary: `ใบสั่งผลิต ${f.id} · ${f.items.length} รายการ ${t.qty} ตัว${f.responsible ? ` · ${f.responsible}` : ''}` });
    toast(`บันทึกใบสั่งผลิต ${f.id} แล้ว`, 'success');
    onSaved();
  };
  return (
    <SideSheet size="lg" icon="listChecks" title={`ใบสั่งผลิต ${f.id}`} sub={`${N(t.lines)} รายการ · ${N(t.qty)} ตัว`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button disabled={busy || !f.items.length} onClick={save}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : 'บันทึกใบสั่ง'}</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="วันที่สั่ง"><DatePicker value={f.order_date} onChange={v => set('order_date', v)} clearable={false} /></Field>
          <Field label="กำหนดรับ"><DatePicker value={f.due_date || ''} min={f.order_date} onChange={v => set('due_date', v)} placeholder="ยังไม่กำหนด" /></Field>
          <Field label="ผู้รับผิดชอบ"><SellerCombobox value={f.responsible || ''} onChange={v => set('responsible', v)} options={people} placeholder="เลือกคนดูแลใบนี้" /></Field>
          <Field label="โรงงาน/ผู้ผลิต"><Input value={f.supplier || ''} onChange={e => set('supplier', e.target.value)} placeholder="เว้นว่างได้" /></Field>
          <Field label="สถานะ">
            <Select value={f.status} onValueChange={v => set('status', v)}>
              <SelectTrigger aria-label="สถานะใบสั่ง"><SelectValue /></SelectTrigger>
              <SelectContent>{PO_STATUS.map(st => <SelectItem key={st.id} value={st.id}>{st.label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        {/* เพิ่มรายการ */}
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          <div className="cap" style={{ fontWeight: 700, marginBottom: 8 }}>เพิ่มรายการที่สั่ง</div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* ลาย/สี/ไซซ์ = ยึดจากสินค้าเหมือนหน้านับสต็อก (คอมโพเนนต์ชุดเดียวกับฟอร์มออเดอร์) */}
            <div style={{ minWidth: 200, flex: '1 1 200px' }}>
              <DesignCombobox value={pick.design} code={pickProduct?.code} items={designItems(catalog, designs)}
                onPick={({ name }) => setPick(p => ({ ...p, design: name, color: '', size: '' }))} placeholder="เลือกลายจากสินค้า" />
            </div>
            <div style={{ width: 140 }}><ColorSelect design={pickProduct} value={pick.color} onChange={v => setPick(p => ({ ...p, color: v }))} /></div>
            <div style={{ width: 110 }}><SizeSelect design={pickProduct} value={pick.size} onChange={v => setPick(p => ({ ...p, size: v }))} /></div>
            <Input type="number" inputMode="numeric" min="1" value={pick.qty} onChange={e => setPick(p => ({ ...p, qty: e.target.value }))} placeholder="จำนวน" className="h-8 w-[90px] text-right" />
            <Button variant="outline" size="sm" className="h-8" onClick={addItem}><Icon name="plus" /> เพิ่ม</Button>
            {pick.design && <span className="cap" style={{ color: 'var(--ink-4)' }}>คงเหลือตอนนี้ {N(rows.filter(r => r.design === pick.design).reduce((a, r) => a + r.balance, 0))} ตัว</span>}
          </div>
        </div>

        {f.items.length > 0 && (
          <CardTable><Table>
            <TableHeader><TableRow><TableHead>ลาย</TableHead><TableHead>สี</TableHead><TableHead>ไซซ์</TableHead><TableHead className="text-right">สั่ง</TableHead><TableHead className="text-right">รับแล้ว</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {f.items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell className="cell-title">{it.design}</TableCell><TableCell>{it.color}</TableCell><TableCell>{it.size}</TableCell>
                  <TableCell className="num text-right" style={{ fontWeight: 700 }}>{N(it.qty)}</TableCell>
                  <TableCell className="num text-right" style={{ color: 'var(--ink-3)' }}>{N(it.received || 0)}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" className="size-7" aria-label="ลบรายการ" onClick={() => rmItem(i)}><Icon name="trash" className="size-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table></CardTable>
        )}

        <Field label="หมายเหตุ"><Textarea rows={2} value={f.note || ''} onChange={e => set('note', e.target.value)} placeholder="เช่น ผ้าล็อตใหม่ / เร่งงานส่ง 5 ก.ย." /></Field>
      </div>
    </SideSheet>
  );
}

/* ---------- รับเข้าจากใบสั่งผลิต → สร้างจุดอ้างอิงสต็อกใหม่ (ยอดเดิม + ที่รับ) ---------- */
function PoReceiveSheet({ po, onClose, onSaved }) {
  const items = Array.isArray(po.items) ? po.items : [];
  const [date, setDate] = useState(todayISO());
  const [vals, setVals] = useState(() => Object.fromEntries(items.map((it, i) => [i, String(Math.max(0, (Number(it.qty) || 0) - (Number(it.received) || 0)))])));
  const [busy, setBusy] = useState(false);
  const lines = items.map((it, i) => ({ ...it, i, recv: Number(vals[i]) || 0 })).filter(l => l.recv > 0);
  const totalRecv = lines.reduce((a, l) => a + l.recv, 0);

  const save = async () => {
    if (!lines.length) { toast('ยังไม่ได้กรอกจำนวนที่รับ', 'warn'); return; }
    setBusy(true);
    const noteTxt = `รับเข้าจากใบสั่งผลิต ${po.id}` + (date !== todayISO() ? ` (ของมาถึง ${date})` : '');
    /* ============================================================
       การรับเข้า — เขียน "แถวบวก" ลงสมุดเคลื่อนไหวอย่างเดียว (PLAN-STOCK-V2 ระยะ 4)
       ============================================================
       ⛔ ห้ามเขียน anchor ลง tmk_stock_counts พร้อมกันเด็ดขาด:
          anchor เดิม = คงเหลือ + ที่รับ (รวมของแล้ว) · move = ที่รับ เฉย ๆ
          ถ้าเขียนทั้งสองที่ แล้ววันหลังมีใครรัน migration ซ้ำ §2 จะ import anchor นั้น
          เข้ามาเป็น count move → หมุดที่รวมของแล้ว + แถว in อีกรอบ = **นับของที่รับซ้ำสองเท่า**
          (on conflict do nothing กันไม่ได้ เพราะแถว counts ที่สร้างหลัง migration เป็น id ใหม่)
       ผลพลอยได้: หมด read-modify-write ของ buildReceiveAnchors ที่เป็นต้นเหตุเลขผิดถาวร
       ถ้ายังไม่ได้รัน migration (missing) → บอกให้รันก่อน ไม่เขียนอะไรครึ่ง ๆ

       moved_on = "วันที่ของมาถึง" ที่ผู้ใช้เลือก ไม่ใช่วันนี้ — รับเข้าย้อนหลังต้องใช้วันจริง
       ไม่งั้นถ้ามีการนับสต็อกคั่นอยู่ (ซึ่งนับของล็อตนี้ไปแล้ว) แถว in จะไปโผล่ "หลังหมุด" = บวกซ้ำ
       ============================================================ */
    // seq = จำนวนที่ "เคยรับมาแล้ว" ก่อนรอบนี้ — คงที่ภายในรอบเดียวกัน (กดซ้ำ = id เดิม = ไม่บวกซ้ำ)
    // แต่ต่างกันระหว่างรอบ (รับ 5 แล้วรับอีก 5 → seq 0 กับ 5) = id ไม่ชนกัน
    const seq = (po.items || []).reduce((a, it) => a + (Number(it.received) || 0), 0);
    const rs = await appendStockMoves(movesFromReceive({
      lines: lines.map(l => ({ design: l.design, color: l.color, size: l.size, qty: l.recv, productCode: l.productCode })),
      poId: po.id, movedOn: date, by: userEmail() || '', note: noteTxt, seq,
    })).catch(e => ({ error: e }));
    if (rs?.error) {
      setBusy(false);
      toast(rs.missing ? `ต้องรัน migration ${MOVES_MIGRATION} ก่อนจึงจะรับเข้าได้` : 'บันทึกการรับเข้าไม่สำเร็จ: ' + pgErrorText(rs.error), rs.missing ? 'warn' : 'error');
      return;
    }
    // 2) อัปเดตใบสั่ง: บวกยอดรับ + ปิดใบเมื่อรับครบ
    const nextItems = items.map((it, i) => { const add = Number(vals[i]) || 0; return add > 0 ? { ...it, received: (Number(it.received) || 0) + add } : it; });
    const done = nextItems.every(it => (Number(it.received) || 0) >= (Number(it.qty) || 0));
    const r = await savePurchaseOrder({ ...po, items: nextItems, status: done ? 'received' : 'producing', received_date: done ? date : (po.received_date || '') });
    setBusy(false);
    if (r.error) {
      /* ⚠️ ถึงจุดนี้ move ถูกเขียนไปแล้ว (สต็อกขึ้นแล้ว) แต่ใบสั่งอัปเดตไม่ผ่าน
         ต้องบอกให้ชัดว่าเกิดอะไรขึ้น ไม่งั้นผู้ใช้กดรับซ้ำ = ใบบวก received 2 รอบ */
      toast(r.readFailed
        ? `สต็อกเพิ่มแล้ว แต่ปรับสถานะใบ ${po.id} ไม่สำเร็จ (อ่านใบเดิมไม่ได้) — อย่ากดรับซ้ำ ให้รีเฟรชแล้วดูใบอีกครั้ง`
        : `สต็อกเพิ่มแล้ว แต่ปรับสถานะใบไม่สำเร็จ: ${pgErrorText(r.error)} — อย่ากดรับซ้ำ`, 'error');
      onSaved();
      return;
    }
    logAudit({ action: 'update', entityType: 'product', entityName: po.id, summary: `รับเข้าจากใบสั่งผลิต ${po.id} · ${totalRecv} ตัว (${date})${done ? ' · ครบแล้ว' : ''}` });
    toast(done ? `รับเข้าครบแล้ว — ปิดใบ ${po.id}` : `รับเข้า ${totalRecv} ตัว · ยังค้างอยู่`, 'success');
    onSaved();
  };

  return (
    <SideSheet size="lg" icon="upload" title={`รับเข้า · ${po.id}`} sub={`สต็อกจะเพิ่มขึ้นตามจำนวนที่รับ (ลงเป็นรายการรับเข้า ณ วันที่ของมาถึง)`} onClose={onClose}
      footer={<><Button variant="outline" onClick={onClose}>ยกเลิก</Button><Button disabled={busy || !lines.length} onClick={save}><Icon name="check" /> {busy ? 'กำลังบันทึก…' : `รับเข้า ${N(totalRecv)} ตัว`}</Button></>}>
      <div className="flex flex-col gap-3">
        <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="cap" style={{ color: 'var(--ink-3)' }}>วันที่รับ</span>
          <DatePicker value={date} onChange={setDate} clearable={false} max={todayISO()} className="w-40" />
          <span className="cap" style={{ color: 'var(--ink-4)' }}>ค่าเริ่มต้น = จำนวนที่ยังค้างรับ · แก้ได้ถ้ารับมาไม่ครบ</span>
        </div>
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--line)' }}>
          <div className="grid grid-cols-[minmax(0,1fr)_70px_70px_92px] gap-2 px-3 py-1.5 bg-muted/40 cap" style={{ color: 'var(--ink-4)' }}>
            <span>รายการ</span><span className="text-right">สั่ง</span><span className="text-right">รับแล้ว</span><span className="text-right">รับรอบนี้</span>
          </div>
          <div className="divide-y">
            {items.map((it, i) => {
              const left = Math.max(0, (Number(it.qty) || 0) - (Number(it.received) || 0));
              return (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_70px_70px_92px] gap-2 items-center px-3 py-1.5">
                  <span className="text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.design} · {it.color} · <b>{it.size}</b></span>
                  <span className="num text-right cap" style={{ color: 'var(--ink-4)' }}>{N(it.qty)}</span>
                  <span className="num text-right cap" style={{ color: 'var(--ink-4)' }}>{N(it.received || 0)}</span>
                  <Input type="number" inputMode="numeric" min="0" max={left || undefined} value={vals[i] ?? ''} className="h-8 text-right"
                    aria-label={`รับเข้า ${it.design} ${it.color} ${it.size}`} onChange={e => setVals(p => ({ ...p, [i]: e.target.value }))} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
