/* ============================================================
   saleCatalog.jsx — แคตตาล็อกเสื้อ (Sale → แคตตาล็อกเสื้อ) → tmk_shirt_catalog
   ตารางเดียว เน้นข้อมูล — ไม่มีระบบรูปแล้ว (PART 42 · คอลัมน์ image ใน DB คงไว้ ไม่แตะ)
   รื้อ UI/UX 22 ส.ค. (design-audit): ชิปสถานะ/ไม่ครบใต้หัว · ไซซ์ย่อ · แก้ราคาในตาราง (PriceCell) · ไม่มีถังขยะรายแถว (ลบใน Sheet)
   · Sheet: FormSection/Field กลาง · pills แทน Select · สี/ไซซ์ toggle แบบเดียวกัน · error ใต้ช่อง + aria · หัวบอกความครบสด
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { cachedFetchAll, invalidateSaleCache } from './lib/saleData.js';
import { useSaleRealtime } from './lib/saleRealtime.js';
import { fetchStockCounts } from './lib/stockData.js';
import { countedByDesign } from './lib/stockCount.js';
import { Icon, Skel, SkelTable, useDelayedFlag, N } from './components.jsx';
import { Modal, SideSheet } from './modals-core.jsx';
import { logAudit } from './lib/audit.js';
import { toast, canEdit } from './lib/appBus.js';
import { FormSection, Field } from './saleWidgets.jsx';
import { logCatalogVersion, fetchCatalogVersions } from './lib/catalogVersions.js';
import { GOLDEN_DESIGNS, COLOR_TH2CODE } from './lib/shirtCatalog.js';
import { usePersistedState } from './hooks/usePersistedState.js';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { Toggle } from '@/components/ui/toggle';
import { SearchInput } from '@/components/ui/search-input';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SortableTable } from './components/DataTableParts.jsx';
import { MultiSelect } from './components/MultiSelect.jsx'; // แหล่งเดียวของทั้งแอป (เดิมมีสำเนา 6 ชุด)
import { EmptyState } from './components/EmptyState.jsx';

const baht = (n) => '฿' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const uid = () => 'sc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// คอลัมน์ที่ตารางใช้จริง (เลิก select '*') — ไม่ดึง image/images แล้ว (เลิกใช้รูป · ลด egress)
const CATALOG_SEL = 'id,code,name,type,price,price_wholesale,colors,sizes,status,job_type,shirt_class,note,variants,updated_at';

const TYPES = ['เสื้อโปโล', 'เสื้อกล้าม', 'กระเป๋า', 'กล่องสุ่ม', 'ถุงเท้า', 'ของแถม/โปร', 'อื่นๆ'];
const STATUSES = ['พร้อมขาย', 'พรีออเดอร์', 'หมด', 'เลิกผลิต'];
const JOB_TYPES = ['ปลีก', 'OEM', 'DFT'];   // ประเภทงาน — ตรงกับ orders (ปลีก=รวมส่ง / OEM=สกรีนองค์กร / DFT=ผลิตตามสั่ง)
const SHIRT_CLASSES = ['เสื้อปกติ', 'เสื้อลายพิเศษ', 'เสื้อตราหน่วยงาน'];   // กลุ่มเสื้อ — แกนจัดประเภทอิสระ (ผู้ใช้นิยาม/จัดเอง)
const ADD_TYPE = '__add__';   // sentinel ตัวเลือก "เพิ่มหมวดใหม่…" ใน Select หมวด
const statusTone = (s) => ({ 'พร้อมขาย': 'var(--good)', 'พรีออเดอร์': 'var(--accent)', 'หมด': 'var(--bad)', 'เลิกผลิต': 'var(--ink-4)' }[s] || 'var(--ink-3)');

// หัวข้อกลุ่มฟิลด์ใน drawer
const SecHead = ({ children }) => <div className="cat-sec-head">{children}</div>;

// 10D — ประวัติการแก้ไข (versioned catalog) · ซ่อนเงียบถ้าตารางยังไม่ migrate หรือไม่มีประวัติ
const fmtWhen = (s) => { try { return new Date(s).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s || ''; } };
function CatalogHistory({ catalogId }) {
  const [rows, setRows] = useState(null);   // null = ยังไม่โหลด · [] = ไม่มี/ตารางไม่มี
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- รีเซ็ตเป็น "ยังไม่โหลด" ก่อนดึง async ตอนเปลี่ยนรายการ (กันโชว์ประวัติของลายเก่าค้าง)
    setRows(null);
    fetchCatalogVersions(catalogId, 20).then(r => { if (live) setRows(r); });
    return () => { live = false; };
  }, [catalogId]);
  if (!rows || rows.length === 0) return null;   // ไม่มีประวัติ/ตารางยังไม่มี → ซ่อนเงียบ
  return (
    <>
      <Separator />
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="row between cat-hist-trigger" style={{ width: '100%', background: 'none', border: 0, padding: '4px 0', cursor: 'pointer' }}>
            <SecHead>ประวัติการแก้ไข <span className="cap" style={{ color: 'var(--ink-4)' }}>({rows.length})</span></SecHead>
            <span style={{ display: 'inline-flex', color: 'var(--ink-4)', transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}><Icon name="chevD" /></span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="cat-hist-list" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
            {rows.map((v, i) => (
              <div key={v.id} className="row between" style={{ gap: 8, padding: '6px 8px', borderRadius: 8, background: i === 0 ? 'var(--accent-soft)' : 'var(--surface-2)' }}>
                <div className="col" style={{ gap: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name || v.code || '—'}{i === 0 && <Badge variant="outline" className="ml-1.5 text-[10px]" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>ล่าสุด</Badge>}</span>
                  <span className="cap" style={{ color: 'var(--ink-4)' }}>{fmtWhen(v.changed_at)}{v.changed_by && v.changed_by !== 'system' ? ' · ' + v.changed_by : ''}</span>
                </div>
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{baht(v.price)}</span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
}

const blank = () => ({ code: '', name: '', type: 'เสื้อโปโล', price: '', price_wholesale: '', colors: '', sizes: '', status: 'พร้อมขาย', job_type: 'ปลีก', shirt_class: 'เสื้อปกติ', note: '', variants: {} });
// variants อาจมาเป็น object (jsonb) หรือ string → คืน object เสมอ
const parseVariants = (v) => { if (!v) return {}; if (typeof v === 'object') return v; try { return JSON.parse(v) || {}; } catch { return {}; } };
// แปลง row จาก DB → form (numeric เป็น string ในช่องกรอก)
const toForm = (it) => ({ ...blank(), ...it, price: it.price ?? '', price_wholesale: it.price_wholesale ?? '', variants: parseVariants(it.variants) });

// พาเลตสี/ไซซ์มาตรฐาน + ตัวช่วยแก้ไขแบบชิป
const COLOR_HEX = { 'ขาว':'#ffffff','ดำ':'#1a1a1a','กรม':'#1f2d50','กรมท่า':'#1f2d50','ฟ้า':'#4a8be0','น้ำเงิน':'#1f3aa0','เขียว':'#2f9e6e','เหลือง':'#e8c23b','แดง':'#c0392b','ชมพู':'#e06aa0','ม่วง':'#6b5ce0','ส้ม':'#e0772f','โอรส':'#e0772f','ครีม':'#efe7d2' };
const STD_COLORS = Object.keys(COLOR_TH2CODE);
const STD_SIZES = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL','7XL'];
const splitList = (s) => (s || '').split(',').map(x => x.trim()).filter(Boolean);
const sizeRank = (s) => { const i = STD_SIZES.indexOf(s); return i < 0 ? 99 : i; };
// ข้อมูลที่ยังขาด (ราคา/สี/ไซซ์) — โชว์ badge เตือนสั้นๆ ในตาราง
const missingOf = (it) => {
  const m = [];
  if (!(Number(it.price) > 0)) m.push('ราคา');
  if (!splitList(it.colors).length) m.push('สี');
  if (!splitList(it.sizes).length) m.push('ไซซ์');
  return m;
};
// จุดสีเล็กในตาราง (แทนข้อความรายชื่อสี)
const ColorDots = ({ colors }) => {
  const list = splitList(colors);
  if (!list.length) return <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>;
  return (
    <span className="row" style={{ gap: 3, alignItems: 'center', flexWrap: 'wrap' }} title={list.join(', ')}>
      {list.slice(0, 6).map(c => <span key={c} style={{ width: 12, height: 12, borderRadius: 999, background: COLOR_HEX[c] || '#bbb', border: '1px solid var(--line)', display: 'inline-block' }} />)}
      {list.length > 6 && <span className="cap" style={{ color: 'var(--ink-4)' }}>+{list.length - 6}</span>}
    </span>
  );
};

// ไซซ์ย่อในตาราง: "XS–5XL · 9" (ทั้งหมดใน title) — เดิมพิมพ์รายชื่อเต็มซ้ำทุกแถว กินครึ่งตาราง
const sizeSummary = (sizes) => {
  const list = [...new Set(splitList(sizes))].sort((a, b) => sizeRank(a) - sizeRank(b));
  if (!list.length) return null;
  if (list.length <= 2) return { text: list.join(', '), full: list.join(', '), n: list.length };
  return { text: `${list[0]}–${list[list.length - 1]} · ${list.length}`, full: list.join(', '), n: list.length };
};
// ช่องราคาในตาราง — คลิกแก้ได้เลย · blur/Enter = บันทึก (จุดเหลือง→✓ เขียว เหมือนหน้าเป้า/คอม) · Esc = ยกเลิก
function PriceCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState('');
  const [state, setState] = useState('');   // '' | 'saving' | 'ok' | 'err'
  const has = Number(value) > 0;
  const start = (e) => { e.stopPropagation(); if (!canEdit()) return; setV(has ? String(Number(value)) : ''); setEditing(true); };
  const commit = async () => {
    setEditing(false);
    const n = v.trim() === '' ? 0 : Number(v);
    if (!Number.isFinite(n) || n < 0 || n === (Number(value) || 0)) return;
    setState('saving');
    const ok = await onSave(n);
    setState(ok ? 'ok' : 'err');
    if (ok) setTimeout(() => setState(''), 1600);
  };
  if (editing) return (
    <span className="row" style={{ justifyContent: 'flex-end', gap: 4 }} onClick={e => e.stopPropagation()}>
      <span className="cap" style={{ color: 'var(--ink-4)' }}>฿</span>
      <input autoFocus type="number" inputMode="decimal" min="0" step="1" value={v} onChange={e => setV(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); } }}
        aria-label="ราคาปลีก" className="num" style={{ width: 88, textAlign: 'right', fontSize: 13, fontWeight: 600, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface)', color: 'var(--ink)', outline: 'none' }} />
    </span>
  );
  return (
    <button type="button" onClick={start} title={has ? 'คลิกเพื่อแก้ราคา' : 'ยังไม่ใส่ราคา — คลิกเพื่อใส่'} className="num cat-price" aria-label={has ? `ราคา ${baht(value)} คลิกเพื่อแก้` : 'ยังไม่ใส่ราคา คลิกเพื่อใส่'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', width: '100%', padding: '3px 6px', borderRadius: 6, border: '1px solid transparent', background: 'none', font: 'inherit', fontWeight: 600, color: has ? 'var(--ink)' : 'var(--warn)', cursor: 'text' }}>
      {state === 'saving' && <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--warn)', flex: 'none' }} title="กำลังบันทึก" />}
      {state === 'ok' && <span style={{ color: 'var(--good)', display: 'inline-flex' }} title="บันทึกแล้ว"><Icon name="check" /></span>}
      {state === 'err' && <span style={{ color: 'var(--bad)', display: 'inline-flex' }} title="บันทึกไม่สำเร็จ"><Icon name="alertTriangle" /></span>}
      {has ? baht(value) : '—'}
    </button>
  );
}
// พิลล์เลือกค่าเดียว (สถานะ/ประเภทงาน/กลุ่มเสื้อ) — เห็นทุกตัวเลือก กดทีเดียว แทน Select
function PillPick({ options, value, onChange, dotOf, ariaLabel }) {
  return (
    <div className="chip-add" role="radiogroup" aria-label={ariaLabel} style={{ marginTop: 0 }}>
      {options.map(o => { const on = value === o; return (
        <Toggle type="button" key={o} variant="pill" size="sm" pressed={on} role="radio" aria-checked={on} onPressedChange={() => onChange(o)}>
          {dotOf && <span style={{ width: 8, height: 8, borderRadius: 999, background: dotOf(o), flex: 'none', marginRight: 5 }} />}{o}
        </Toggle>
      ); })}
    </div>
  );
}

/* ---------- Skeleton (ตารางเดียว) ---------- */
function CatalogSkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <Card className="p-[22px]">
        <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 10 }}><Skel w={200} h={16} /><Skel w={90} h={30} r={8} /></div>
        <Skel w="100%" h={34} r={9} style={{ marginBottom: 12 }} />
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{Array.from({ length: 5 }).map((_, i) => <Skel key={i} w={i % 2 ? 78 : 56} h={26} r={8} />)}</div>
      </Card>
      <Card className="p-[22px]"><SkelTable cols={8} rows={9} /></Card>
    </div>
  );
}

export function ShirtCatalogView() {
  const [items, setItems] = useState(null);
  const [noTable, setNoTable] = useState(false);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [typeF, setTypeF] = usePersistedState('tmk-catalog-typeF', []);
  const [statusF, setStatusF] = usePersistedState('tmk-catalog-statusF', []);
  const [jobF, setJobF] = usePersistedState('tmk-catalog-jobF', []);
  const [classF, setClassF] = usePersistedState('tmk-catalog-classF', []);
  /* key ต้อง -v2: ค่าตัวเลือกเปลี่ยนจาก ['ใกล้หมด','หมดสต็อก'] เป็น ['ใกล้หมด (≤10)','นับได้ 0','ยังไม่เคยนับ']
     ถ้าใช้ key เดิม ค่าที่ค้างใน localStorage จะไม่ตรงกับตัวเลือกใหม่ → ตารางว่างเปล่า
     และ dropdown "สต็อก" ถูกซ่อนตอนยังไม่มีข้อมูลนับ = ผู้ใช้หาทางล้างตัวกรองไม่เจอ */
  const [stockF, setStockF] = usePersistedState('tmk-catalog-stockF-v2', []);   // 10A — กรองสถานะสต็อก
  const [missF, setMissF] = usePersistedState('tmk-catalog-missF', false);  // ชิป "ข้อมูลไม่ครบ" (ขาดราคา/สี/ไซซ์)
  const [showErr, setShowErr] = useState(false);   // โชว์ error ใต้ช่อง หลัง blur/กดบันทึกครั้งแรก (validate on blur ไม่ใช่ทุกคีย์)
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [edit, setEdit] = useState(null);      // form object หรือ null
  const [addType, setAddType] = useState(null); // string|null — โหมดพิมพ์หมวดใหม่ใน Select หมวด
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [skuOpen, setSkuOpen] = useState(false);   // ส่วนรหัส SKU ในฟอร์ม — พับไว้ก่อน (ลดความรก)
  /* สถานะสต็อก (PART 115) — เดิมอ่านจาก tmk_products.stock ของ "ระบบคลังเก่า" ที่ถอดไปตั้งแต่ PART 35
     → ไม่มีใครอัปเดตอีกเลย ป้ายจึงโกหก · ตอนนี้อ่านจากระบบนับสต็อกจริง (tmk_stock_counts)
     จงใจใช้ "ยอดที่นับได้ล่าสุด" (ไม่หักยอดขายหลังวันนับ) เพื่อไม่ต้องดึงตารางยอดขายมาทั้งก้อนในหน้านี้
     → ป้ายจึงบอกวันที่นับกำกับเสมอ · คงเหลือสดดูที่หน้าสต็อก */
  const [stockByDesignName, setStockByDesignName] = useState({});
  useEffect(() => { let live = true; (async () => {
    const r = await fetchStockCounts();
    if (live && !r.missing && !r.error) setStockByDesignName(countedByDesign(r.rows));
  })(); return () => { live = false; }; }, []);
  const stockOf = (name) => stockByDesignName[String(name || '').trim()] || null;
  const stockBadge = (name) => {
    const st = stockOf(name);
    if (!st) return null;
    const tone = st.qty <= 0 ? 'var(--bad)' : st.qty <= 10 ? 'var(--warn)' : 'var(--ink-3)';
    return (
      <Badge variant="outline" className="ml-1.5 align-middle text-[10px] font-medium" style={{ color: tone, borderColor: tone }}
        title={`ยอดที่นับได้ล่าสุด ${st.date} · ${st.skus} SKU — ยังไม่หักที่ขายหลังวันนับ (ดูคงเหลือสดที่หน้าสต็อก)`}>
        {st.qty <= 0 ? 'นับได้ 0' : `นับได้ ${N(st.qty)}`} · {st.date.slice(5)}
      </Badge>
    );
  };
  const [importing, setImporting] = useState(false);
  const [askImport, setAskImport] = useState(false);

  // เรียงล่าสุดก่อน (cachedFetchAll ไม่ได้ order ฝั่ง server → sort ฝั่ง client)
  const sortByUpdated = (rows) => [...rows].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const load = async (force = false) => {
    // ใช้ cache กลาง (TTL 5นาที + dedup) — สลับหน้าออก/เข้าไม่ดึงซ้ำ · narrow คอลัมน์ (ไม่ดึง base64 ก้อนใหญ่)
    let r = await cachedFetchAll('tmk_shirt_catalog', CATALOG_SEL, force);
    // graceful: คอลัมน์ใหม่ (job_type/shirt_class) ยังไม่ถูก migrate → fallback select('*')
    if (r.error && /column|does not exist|job_type|shirt_class/i.test(r.error.message || '')) {
      r = await cachedFetchAll('tmk_shirt_catalog', '*', force);
    }
    if (r.error) {
      if (/relation|does not exist|tmk_shirt_catalog/i.test(r.error.message)) setNoTable(true);
      else setErr(r.error.message);
      setItems([]); return;
    }
    setNoTable(false); setItems(sortByUpdated(r.data || []));
  };
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- โหลดข้อมูล async ครั้งเดียวตอน mount (load สร้างใหม่ทุก render — ใส่เป็น dep จะยิงซ้ำไม่จบ)
  useEffect(() => { load(); }, []);
  useSaleRealtime(['tmk_shirt_catalog'], () => load(true)); // แคตตาล็อกแก้ที่ไหน เห็นสดทุกเครื่อง
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync รีเซ็ตโหมดฟอร์มตอนปิดชีต/เปลี่ยนรายการ (รื้อเป็น derived state เสี่ยงกว่าประโยชน์)
  useEffect(() => { if (!edit) { setAddType(null); setSkuOpen(false); setShowErr(false); } }, [edit]);   // ปิดชีต/เปลี่ยนรายการ → รีเซ็ตโหมดฟอร์ม

  const types = useMemo(() => { const s = new Set(); (items || []).forEach(i => { if (i.type) s.add(i.type); }); return [...s].sort(); }, [items]);
  const filtered = useMemo(() => {
    let r = items || [];
    if (typeF.length) r = r.filter(i => typeF.includes(i.type || ''));
    if (statusF.length) r = r.filter(i => statusF.includes(i.status || 'พร้อมขาย'));
    if (jobF.length) r = r.filter(i => jobF.includes(i.job_type || 'ปลีก'));
    if (classF.length) r = r.filter(i => classF.includes(i.shirt_class || 'เสื้อปกติ'));
    if (stockF.length) r = r.filter(i => {
      const st = stockOf(i.name);
      const lbl = !st ? 'ยังไม่เคยนับ' : st.qty <= 0 ? 'นับได้ 0' : st.qty <= 10 ? 'ใกล้หมด (≤10)' : null;
      return lbl && stockF.includes(lbl);
    });
    if (missF) r = r.filter(i => missingOf(i).length > 0);
    const ql = q.trim().toLowerCase();
    if (ql) r = r.filter(i => `${i.code} ${i.name} ${i.type} ${i.colors} ${i.note}`.toLowerCase().includes(ql));
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stockOf สร้างใหม่ทุก render (ใส่เป็น dep = memo ไร้ผล) · input จริงของมันคือ stockByCode ซึ่งอยู่ใน deps แล้ว
  }, [items, typeF, statusF, jobF, classF, stockF, missF, stockByDesignName, q]);
  const nFilters = typeF.length + jobF.length + classF.length + stockF.length;   // สถานะ/ไม่ครบ เป็นชิปใต้หัว ไม่นับในตัวกรองพับ
  const activeChips = [
    ...typeF.map(v => ({ dim: 'หมวด', v, clear: () => setTypeF(typeF.filter(x => x !== v)) })),
    ...jobF.map(v => ({ dim: 'งาน', v, clear: () => setJobF(jobF.filter(x => x !== v)) })),
    ...classF.map(v => ({ dim: 'กลุ่มเสื้อ', v, clear: () => setClassF(classF.filter(x => x !== v)) })),
    ...stockF.map(v => ({ dim: 'สต็อก', v, clear: () => setStockF(stockF.filter(x => x !== v)) })),
  ];
  const clearFilters = () => { setTypeF([]); setStatusF([]); setJobF([]); setClassF([]); setStockF([]); setMissF(false); };

  const save = async () => {
    if (!edit) return;
    if (!edit.code.trim() && !edit.name.trim()) { setShowErr(true); document.getElementById('cat-name')?.focus(); return; }   // error ใต้ช่อง + โฟกัสช่องแรกที่ผิด (ไม่ toast ซ้ำ)
    if (Number(edit.price) < 0) { document.getElementById('cat-price')?.focus(); return; }
    setBusy(true);
    const row = {
      id: edit.id || uid(),
      code: edit.code.trim(), name: edit.name.trim(), type: edit.type || '',
      price: Number(edit.price) || 0, price_wholesale: Number(edit.price_wholesale) || 0,
      colors: (edit.colors || '').trim(), sizes: (edit.sizes || '').trim(), status: edit.status || 'พร้อมขาย',
      job_type: edit.job_type || 'ปลีก',
      shirt_class: edit.shirt_class || 'เสื้อปกติ',
      note: (edit.note || '').trim(), variants: edit.variants || {}, updated_at: new Date().toISOString(),
    };
    // ครอบ try/finally — upsert throw (network/client) จะได้ไม่ค้าง spinner "กำลังบันทึก"
    try {
      // ไม่แตะ image/images ใน DB (เลิกใช้รูปแล้ว — upsert ไม่ส่ง key = คงค่าเดิม)
      let { error } = await supabase.from('tmk_shirt_catalog').upsert(row, { onConflict: 'id' });
      // ยังไม่ได้รัน migration variants/job_type/shirt_class → ตัดคอลัมน์ที่ DB ยังไม่มีออก แล้วบันทึกส่วนที่เหลือ
      if (error && /variants|job_type|shirt_class/i.test(error.message)) {
        const row2 = { ...row };
        const dropCol = (re, col, label) => { if (re.test(error.message) && row2[col] !== undefined) { delete row2[col]; return label; } return null; };
        let dropped = [];
        // ตัดทุกคอลัมน์ที่ error ชี้ในรอบเดียว แล้วลองซ้ำ จนกว่าจะไม่มี error คอลัมน์ค้าง
        for (let pass = 0; pass < 4 && error && /variants|job_type|shirt_class/i.test(error.message); pass++) {
          const d = [
            dropCol(/variants/i, 'variants', 'รหัสรายตัว (variants)'),
            dropCol(/job_type/i, 'job_type', 'ประเภทงาน (job_type)'),
            dropCol(/shirt_class/i, 'shirt_class', 'กลุ่มเสื้อ (shirt_class)'),
          ].filter(Boolean);
          dropped = [...new Set([...dropped, ...d])];
          ({ error } = await supabase.from('tmk_shirt_catalog').upsert(row2, { onConflict: 'id' }));
        }
        if (!error) { toast('บันทึกแล้ว — แต่ ' + dropped.join(' + ') + ' ยังไม่เก็บ (รัน migration ก่อน)', 'info'); logCatalogVersion(row); invalidateSaleCache('tmk_shirt_catalog'); setItems(prev => [row, ...(prev || []).filter(x => x.id !== row.id)]); setEdit(null); return; }
      }
      if (error) { toast(noTable ? 'ต้องรัน migration tmk_shirt_catalog ก่อน' : 'บันทึกไม่สำเร็จ: ' + error.message, 'error'); return; }
      toast(edit.id ? 'แก้ไขแล้ว' : 'เพิ่มสินค้าแล้ว', 'success');
      logAudit({
        action: edit.id ? 'update' : 'create', entityType: 'product', entityName: row.code || row.name || 'catalog', entityId: row.id || row.code,
        summary: `${edit.id ? 'แก้ไข' : 'เพิ่ม'}แคตตาล็อก ${row.code || row.name}`,
        fields: [
          { label: 'รหัส', value: row.code || '—' },
          { label: 'ชื่อลาย', value: row.name || '—' },
          ...(row.category ? [{ label: 'หมวด', value: row.category }] : []),
          ...(row.shirt_class ? [{ label: 'กลุ่มเสื้อ', value: row.shirt_class }] : []),
          ...(row.color ? [{ label: 'สี', value: row.color }] : []),
          ...(row.price != null && row.price !== '' ? [{ label: 'ราคา', value: `฿${Number(row.price).toLocaleString()}` }] : []),
        ],
      });
      logCatalogVersion(row);   // 10D — snapshot เวอร์ชัน (fire-and-forget, เงียบถ้าตารางยังไม่มี)
      // อัปเดต state in-place + invalidate cache — ไม่ refetch ทั้งชุดทุกครั้งที่แก้เสื้อ 1 ตัว (ลด egress)
      invalidateSaleCache('tmk_shirt_catalog');
      setItems(prev => [row, ...(prev || []).filter(x => x.id !== row.id)]);
      setEdit(null);
    } catch (e) {
      toast('บันทึกไม่สำเร็จ: ' + (e?.message || 'เชื่อมต่อฐานข้อมูลไม่ได้'), 'error');
    } finally { setBusy(false); }
  };

  const del = async () => {
    if (!delTarget) return;
    const { error } = await supabase.from('tmk_shirt_catalog').delete().eq('id', delTarget.id);
    if (error) { toast('ลบไม่สำเร็จ', 'error'); return; }
    toast('ลบแล้ว', 'success');
    logAudit({ action: 'delete', entityType: 'product', entityName: 'catalog', summary: `ลบแคตตาล็อก ${delTarget.code || delTarget.name}` });
    invalidateSaleCache('tmk_shirt_catalog');
    setItems(prev => (prev || []).filter(x => x.id !== delTarget.id));
    setDelTarget(null); setEdit(null);
  };

  // แก้ราคาจากช่องในตาราง — update เฉพาะคอลัมน์ราคา (ไม่ทับคอลัมน์อื่น) · คืน true/false ให้ช่องโชว์ ✓/⚠
  const quickPrice = async (it, price) => {
    const updated_at = new Date().toISOString();
    const { error } = await supabase.from('tmk_shirt_catalog').update({ price, updated_at }).eq('id', it.id);
    if (error) { toast('บันทึกราคาไม่สำเร็จ: ' + error.message, 'error'); return false; }
    const row = { ...it, price, updated_at };
    logAudit({ action: 'update', entityType: 'product', entityName: row.code || row.name || 'catalog', entityId: row.id || row.code, summary: `แก้ราคา ${row.code || row.name} → ฿${Number(price).toLocaleString()}`, fields: [{ label: 'ราคา', value: `฿${Number(price).toLocaleString()}` }] });
    logCatalogVersion(row);
    invalidateSaleCache('tmk_shirt_catalog');
    setItems(prev => (prev || []).map(x => (x.id === it.id ? row : x)));
    return true;
  };

  // นำเข้า 47 ลายจากตารางลายเสื้อ (golden) — พร้อมรหัส/หมวด/ราคา/สี/ไซซ์ · ข้ามลายที่มีแล้ว
  const importLegacy = async () => {
    setAskImport(false); setImporting(true);
    const existing = new Set((items || []).map(i => (i.name || '').trim().toLowerCase()));
    const rows = GOLDEN_DESIGNS
      .filter(d => !existing.has((d.name || '').trim().toLowerCase()))
      .map(d => ({ id: uid(), code: d.code || '', name: d.name || '', type: d.type || '', price: d.price || 0, price_wholesale: 0, colors: (d.colors || []).join(', '), sizes: (d.sizes || []).join(', '), status: 'พร้อมขาย', note: '', updated_at: new Date().toISOString() }));
    if (!rows.length) { setImporting(false); toast('มีครบแล้ว ไม่มีลายใหม่ให้นำเข้า', 'info'); return; }
    let ok = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { error } = await supabase.from('tmk_shirt_catalog').insert(chunk);
      if (error) {
        // chunk พังกลางคัน → บอกจำนวนที่ลงจริง + reload ให้ items สะท้อนของที่ลงแล้ว (retry จะข้ามลายเดิม ไม่ dup)
        toast(noTable ? 'ต้องรัน migration tmk_shirt_catalog ก่อน' : `นำเข้าได้ ${ok} ลาย แล้วหยุด: ${error.message}`, 'error');
        setImporting(false);
        if (ok > 0) { invalidateSaleCache('tmk_shirt_catalog'); load(true); }
        return;
      }
      ok += chunk.length;
    }
    setImporting(false); toast(`นำเข้า ${ok} ลายแล้ว — แก้ไขเติมราคา/สี/ไซซ์ได้เลย`, 'success');
    logAudit({ action: 'create', entityType: 'product', entityName: 'catalog', summary: `นำเข้าลายเสื้อจากตาราง ${ok} ลาย` });
    invalidateSaleCache('tmk_shirt_catalog'); load(true);
  };

  const showSkel = useDelayedFlag(items === null, 120);
  if (err) return <div className="content-inner"><Card className="p-5" style={{ color: 'var(--bad)' }}>{err}</Card></div>;
  if (showSkel) return <CatalogSkeleton />;
  if (items === null) return null;

  const empty = items.length === 0;

  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      {noTable && <Card className="p-3" style={{ color: 'var(--warn)', borderLeft: '3px solid var(--warn)' }}><Icon name="alertTriangle" /> ยังไม่ได้สร้างตาราง <code>tmk_shirt_catalog</code> — รัน <code>supabase/migrations/20260624-shirt-catalog.sql</code> ใน Supabase ก่อนจึงจะเพิ่ม/บันทึกได้</Card>}

      <Card className="p-[22px]">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h3 className="m-0 text-base font-bold leading-tight" style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>สินค้า <span className="dim" style={{ fontWeight: 500 }}>· {items.length}</span></h3>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา รหัส/ชื่อ/สี" wrapperClassName="w-full sm:w-[240px]" />
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 flex-none">
                <Icon name="filter" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
                <Icon name="chevD" style={filtersOpen ? { transform: 'rotate(180deg)' } : undefined} />
              </Button>
            </CollapsibleTrigger>
            <Button size="sm" className="flex-none" onClick={() => setEdit(blank())}><Icon name="plus" /> เพิ่มสินค้า</Button>
          </div>
        </div>
        {/* ชิปสถานะ + ข้อมูลไม่ครบ — กดทีเดียว ไม่ต้องเปิดตัวกรอง */}
        {!empty && (() => {
          const all = items || [];
          const cnt = (st) => all.filter(i => (i.status || 'พร้อมขาย') === st).length;
          const nMiss = all.filter(i => missingOf(i).length > 0).length;
          const cur = statusF.length === 1 ? statusF[0] : statusF.length === 0 ? 'all' : 'multi';
          const chip = (on, label, n, tone, onClick, title) => (
            <button type="button" key={label} onClick={onClick} title={title} aria-pressed={on} className="cat-chip" style={{ borderColor: on ? (tone || 'var(--ink-2)') : 'var(--line)', background: on ? (tone ? `color-mix(in srgb, ${tone} 12%, var(--surface))` : 'var(--ink-2)') : 'var(--surface)', color: on ? (tone || 'var(--surface)') : 'var(--ink-3)' }}>
              {tone && <span style={{ width: 7, height: 7, borderRadius: 999, background: tone, flex: 'none' }} />}{label} <b className="num" style={{ fontWeight: 700 }}>{n}</b>
            </button>
          );
          return (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              {chip(cur === 'all' && !missF, 'ทั้งหมด', all.length, null, () => { setStatusF([]); setMissF(false); })}
              {STATUSES.map(st => chip(cur === st, st, cnt(st), statusTone(st), () => setStatusF(cur === st ? [] : [st]), `ดูเฉพาะสถานะ ${st}`))}
              <span style={{ width: 1, height: 18, background: 'var(--line)', margin: '0 4px' }} />
              {chip(missF, 'ข้อมูลไม่ครบ', nMiss, 'var(--warn)', () => setMissF(v => !v), 'ขาด ราคา / สี / ไซซ์ — เติมได้จากตาราง (ราคา) หรือเปิดแก้')}
            </div>
          );
        })()}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {activeChips.map(({ dim, v, clear }) => <Badge key={dim + v} variant="outline" onClick={clear} title="คลิกเพื่อเอาออก" style={{ cursor: 'pointer', padding: '2px 8px' }}><span style={{ color: 'var(--ink-4)' }}>{dim}:</span> {v || '(ไม่ระบุ)'} <Icon name="x" /></Badge>)}
              <Button variant="ghost" size="sm" className="text-[var(--bad)] ml-auto" onClick={clearFilters}><Icon name="x" /> ล้าง</Button>
            </div>
          )}
          <CollapsibleContent>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 12, marginTop: 10, borderTop: '1px solid var(--line)' }}>
              <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, width: 64, flexShrink: 0 }}>ตัวกรอง</span>
              <MultiSelect label="หมวด" options={types} value={typeF} onChange={setTypeF} />
              <MultiSelect label="งาน" options={JOB_TYPES} value={jobF} onChange={setJobF} />
              <MultiSelect label="กลุ่มเสื้อ" options={SHIRT_CLASSES} value={classF} onChange={setClassF} />
              {Object.keys(stockByDesignName).length > 0 && <MultiSelect label="สต็อก" options={['ใกล้หมด (≤10)', 'นับได้ 0', 'ยังไม่เคยนับ']} value={stockF} onChange={setStockF} />}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {empty ? (
          <div className="mt-4">
            <EmptyState
              title="ยังไม่มีสินค้าในแคตตาล็อก"
              hint="เพิ่มเอง หรือดึง 47 ลายมาตรฐานมาใส่ก่อนก็ได้ (พร้อมสี/ไซซ์/ราคา)"
              action={{ label: 'เพิ่มสินค้า', icon: 'plus', onClick: () => setEdit(blank()) }}
            />
            <div className="row mt-2" style={{ gap: 8, justifyContent: 'center' }}>
              <Button variant="outline" size="sm" onClick={() => setAskImport(true)} disabled={importing}><Icon name="external" /> นำเข้าลายเสื้อ (47 ลาย)</Button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState className="mt-4" mode="filtered" title="ไม่พบรายการที่ค้นหา" hint="ลองเปลี่ยนคำค้น หรือล้างตัวกรองเพื่อดูทั้งหมด" />
        ) : (
          <div className="mt-4">
          <SortableTable cards density="cozy" initial={{ key: 'code', dir: 'asc' }}
            columns={[
              { key: 'code', label: 'รหัส', accessor: it => it.code || '' },
              { key: 'name', label: 'ชื่อลาย', accessor: it => it.name || '' },
              { key: 'type', label: 'หมวด', accessor: it => it.type || '' },
              { key: 'price', label: 'ราคาปลีก', align: 'right', accessor: it => Number(it.price) || 0 },
              { key: 'colors', label: 'สี', sortable: false },
              { key: 'sizes', label: 'ไซซ์', accessor: it => splitList(it.sizes).length },
              { key: 'status', label: 'สถานะ', accessor: it => it.status || 'พร้อมขาย' },
            ]}
            rows={filtered}
            renderRow={it => {
              const miss = missingOf(it); const sz = sizeSummary(it.sizes); const st = it.status || 'พร้อมขาย'; const nColors = splitList(it.colors).length;
              return (
                <TableRow key={it.id} onClick={() => setEdit(toForm(it))} style={{ cursor: 'pointer' }} title="คลิกเพื่อแก้ไข">
                  <TableCell className="num" style={{ whiteSpace: 'nowrap', color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 12.5 }}>{it.code || '—'}</TableCell>
                  <TableCell style={{ fontWeight: 600 }}>
                    <span className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span>{it.name || <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>(ไม่มีชื่อ)</span>}</span>
                      {stockBadge(it.name)}
                      {it.job_type && it.job_type !== 'ปลีก' && <Badge variant="secondary" className="rounded-full text-[10px] font-semibold" title="ประเภทงาน">{it.job_type}</Badge>}
                      {it.shirt_class && it.shirt_class !== 'เสื้อปกติ' && <Badge variant="outline" className="rounded-full text-[10px] font-medium" title="กลุ่มเสื้อ">{it.shirt_class}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="cap" style={{ color: 'var(--ink-3)' }}>{it.type || '—'}</TableCell>
                  <TableCell style={{ textAlign: 'right', padding: '4px 8px' }}><PriceCell value={it.price} onSave={(n) => quickPrice(it, n)} /></TableCell>
                  <TableCell><span className="row" style={{ gap: 6, alignItems: 'center' }}><ColorDots colors={it.colors} />{nColors > 0 && <span className="cap num" style={{ color: 'var(--ink-4)' }}>{nColors}</span>}</span></TableCell>
                  <TableCell className="cap num" style={{ whiteSpace: 'nowrap', color: sz ? 'var(--ink-2)' : 'var(--ink-4)' }} title={sz ? sz.full : 'ยังไม่ใส่ไซซ์'}>{sz ? sz.text : '—'}</TableCell>
                  <TableCell>
                    <span className="row" style={{ gap: 8, alignItems: 'center', whiteSpace: 'nowrap' }}>
                      <span className="row cap" style={{ gap: 5, color: statusTone(st), fontWeight: 600 }}><span style={{ width: 7, height: 7, borderRadius: 999, background: statusTone(st), flex: 'none' }} />{st}</span>
                      {miss.length > 0 && <span role="img" aria-label={`ขาด ${miss.join(', ')}`} title={`ขาด ${miss.join(' · ')} — คลิกแถวเพื่อเติม${miss.includes('ราคา') ? ' (ราคาแก้ในช่องได้เลย)' : ''}`} style={{ color: 'var(--warn)', display: 'inline-flex' }}><Icon name="alertTriangle" /></span>}
                    </span>
                  </TableCell>
                </TableRow>
              );
            }} />
          </div>
        )}
      </Card>

      {/* ---------- เพิ่ม/แก้ไข (Sheet ขวา shadcn · ฟอร์มกลาง FormSection/Field · pills แทน Select · error ใต้ช่อง) ---------- */}
      {edit && (() => {
        const miss = missingOf(edit);
        const noKey = !edit.code.trim() && !edit.name.trim();
        const badPrice = Number(edit.price) < 0;
        const saveWhy = noKey ? 'ใส่ชื่อลายหรือรหัสสินค้าอย่างน้อย 1 อย่าง' : badPrice ? 'ราคาต้องไม่ติดลบ' : undefined;
        const colorList = splitList(edit.colors);
        const setColors = (arr) => setEdit({ ...edit, colors: [...new Set(arr)].join(', ') });
        const sizeList = splitList(edit.sizes);
        const setSizes = (arr) => setEdit({ ...edit, sizes: [...new Set(arr)].sort((a, b) => sizeRank(a) - sizeRank(b)).join(', ') });
        const nSku = (colorList.length || 1) * (sizeList.length || 1);
        const overrideN = Object.keys(edit.variants || {}).length;
        const skuAll = (() => { const base = (edit.code || '').trim(); if (!base) return []; const cols = colorList.length ? colorList : [null], szs = sizeList.length ? sizeList : [null]; const vmap = edit.variants || {}; const out = []; cols.forEach(c => szs.forEach(sz => { const k = `${c || ''}|${sz || ''}`; const o = vmap[k]; out.push((o != null && o !== '') ? o : [base, c ? (COLOR_TH2CODE[c] || c) : null, sz].filter(Boolean).join('-')); })); return out; })();
        return (
        <SideSheet size="lg" icon="bag" title={edit.name.trim() || (edit.id ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า')}
          sub={<span className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {edit.id && edit.code && <span className="row num" title="รหัสเป็นกุญแจผูกออเดอร์ทั้งหมด — เปลี่ยนไม่ได้ · ถ้าต้องการรหัสใหม่ให้สร้างลายใหม่" style={{ gap: 4, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 999, padding: '1px 8px' }}><Icon name="lock" />{edit.code}</span>}
            {!edit.id && <span className="cap" style={{ color: 'var(--ink-4)' }}>สินค้าใหม่</span>}
            {miss.length ? <span className="row cap" style={{ gap: 4, color: 'var(--warn)', fontWeight: 600 }}><Icon name="alertTriangle" /> ขาด {miss.join(' · ')}</span> : <span className="row cap" style={{ gap: 4, color: 'var(--good)', fontWeight: 600 }}><Icon name="check" /> ข้อมูลครบ</span>}
          </span>}
          onClose={() => setEdit(null)}
          footer={<div className="row between" style={{ width: '100%' }}>
            {edit.id ? <Button variant="outline" size="sm" className="text-[var(--bad)]" onClick={() => { setDelTarget(edit); setEdit(null); }}><Icon name="trash" /> ลบ</Button> : <span />}
            <div className="row" style={{ gap: 8 }}>
              <Button variant="outline" onClick={() => setEdit(null)}>ยกเลิก</Button>
              <Button disabled={busy} title={saveWhy} onClick={save}>{busy ? 'กำลังบันทึก…' : edit.id ? 'บันทึกการแก้ไข' : 'เพิ่มสินค้า'}</Button>
            </div>
          </div>}>
          <div style={{ display: 'grid', gap: 12 }}>
            {/* ข้อมูลสินค้า */}
            <FormSection icon="bag" title="ข้อมูลสินค้า">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="ชื่อลาย / ชื่อเสื้อ">
                  <Input id="cat-name" aria-label="ชื่อลาย / ชื่อเสื้อ" autoComplete="off" autoFocus={!edit.id} value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} onBlur={() => setShowErr(true)} placeholder="เช่น กนกประยุกต์" aria-invalid={showErr && noKey} aria-describedby={showErr && noKey ? 'cat-key-err' : undefined} title={edit.id ? 'แก้ชื่อได้ — รายงาน/แดชบอร์ด/CRM อัปเดตทันที (ผูกด้วยรหัส)' : undefined} />
                </Field>
                <Field label="รหัสสินค้า">
                  {edit.id
                    ? <div className="row num" title="รหัสเป็นกุญแจผูกออเดอร์ทั้งหมด — เปลี่ยนไม่ได้ · ถ้าต้องการรหัสใหม่ให้สร้างลายใหม่" style={{ gap: 6, height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-3)', fontFamily: 'var(--mono)', fontSize: 13 }}><Icon name="lock" />{edit.code || '—'}<span className="cap" style={{ marginLeft: 'auto', color: 'var(--ink-4)' }}>ล็อก</span></div>
                    : <Input id="cat-code" aria-label="รหัสสินค้า" autoComplete="off" spellCheck={false} value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value })} onBlur={() => setShowErr(true)} placeholder="เช่น JKN111" className="font-mono" aria-invalid={showErr && noKey} aria-describedby={showErr && noKey ? 'cat-key-err' : undefined} />}
                </Field>
                {showErr && noKey && <p id="cat-key-err" className="field-err sm:col-span-2" role="alert">ใส่ชื่อลายหรือรหัสสินค้าอย่างน้อย 1 อย่าง — รหัสใช้สร้าง SKU และผูกออเดอร์</p>}
                <Field label="ราคาปลีก">
                  <div className="row" style={{ position: 'relative' }}>
                    <span className="num" aria-hidden style={{ position: 'absolute', left: 12, color: 'var(--ink-4)', fontWeight: 700, fontSize: 15, pointerEvents: 'none' }}>฿</span>
                    <Input id="cat-price" aria-label="ราคาปลีก (บาท)" type="number" inputMode="decimal" min="0" step="1" aria-invalid={badPrice} aria-describedby={badPrice ? 'cat-price-err' : undefined} value={edit.price} onChange={e => setEdit({ ...edit, price: e.target.value })} placeholder="0" className="num pl-7 h-10 text-[17px] font-bold" style={{ color: Number(edit.price) > 0 ? 'var(--ink)' : 'var(--ink-3)' }} />
                  </div>
                  {badPrice && <p id="cat-price-err" className="field-err" role="alert">ราคาต้องไม่ติดลบ</p>}
                </Field>
                <Field label="หมวด">
                  {addType === null ? (
                    <Select value={edit.type || 'อื่นๆ'} onValueChange={v => { if (v === ADD_TYPE) setAddType(''); else setEdit({ ...edit, type: v }); }}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[...new Set([...TYPES, ...types, edit.type].filter(Boolean))].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        <SelectItem value={ADD_TYPE}><span className="row" style={{ gap: 6 }}><Icon name="plus" /> เพิ่มหมวดใหม่…</span></SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="row" style={{ gap: 6 }}>
                      <Input autoFocus value={addType} onChange={e => setAddType(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (addType.trim()) setEdit({ ...edit, type: addType.trim() }); setAddType(null); } else if (e.key === 'Escape') { e.preventDefault(); setAddType(null); } }}
                        placeholder="พิมพ์หมวดใหม่ แล้ว Enter" />
                      <Button size="sm" onClick={() => { if (addType.trim()) setEdit({ ...edit, type: addType.trim() }); setAddType(null); }} title="ยืนยัน"><Icon name="check" /></Button>
                      <Button variant="outline" size="sm" onClick={() => setAddType(null)} title="ยกเลิก"><Icon name="x" /></Button>
                    </div>
                  )}
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <Field label="สถานะ"><PillPick ariaLabel="สถานะ" options={STATUSES} value={edit.status || 'พร้อมขาย'} onChange={v => setEdit({ ...edit, status: v })} dotOf={statusTone} /></Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="ประเภทงาน"><PillPick ariaLabel="ประเภทงาน" options={JOB_TYPES} value={edit.job_type || 'ปลีก'} onChange={v => setEdit({ ...edit, job_type: v })} /></Field>
                  <Field label="กลุ่มเสื้อ"><PillPick ariaLabel="กลุ่มเสื้อ" options={SHIRT_CLASSES} value={edit.shirt_class || 'เสื้อปกติ'} onChange={v => setEdit({ ...edit, shirt_class: v })} /></Field>
                </div>
              </div>
            </FormSection>

            {/* สี & ไซซ์ — พิลล์ toggle ทั้งคู่ (แพตเทิร์นเดียวกัน) */}
            <FormSection icon="tag" title="สี & ไซซ์" sub={colorList.length || sizeList.length ? `${colorList.length} สี × ${sizeList.length} ไซซ์ = ${nSku} SKU` : 'เลือกสี/ไซซ์ → สร้างรหัส SKU ให้อัตโนมัติ'}>
              <Field label={`สีที่มี (${colorList.length})`}>
                <div className="chip-add" style={{ marginTop: 0 }}>
                  {[...STD_COLORS, ...colorList.filter(c => !STD_COLORS.includes(c))].map(c => { const on = colorList.includes(c); return (
                    <Toggle type="button" key={c} variant="pill" size="sm" pressed={on} aria-label={`สี ${c}`} onPressedChange={() => setColors(on ? colorList.filter(x => x !== c) : [...colorList, c])}>
                      <span className="sw" style={{ background: COLOR_HEX[c] || '#bbb', marginRight: 5 }} />{c}
                    </Toggle>
                  ); })}
                  <Input className="h-7 w-28" placeholder="+ สีอื่น ↵" aria-label="เพิ่มสีอื่น" onKeyDown={e => { const v = e.target.value.trim(); if (e.key === 'Enter' && v) { e.preventDefault(); setColors([...colorList, v]); e.target.value = ''; } }} />
                </div>
              </Field>
              <div className="mt-3">
              <Field label={`ไซซ์ที่มี (${sizeList.length})`}>
                <div className="chip-add" style={{ marginTop: 0 }}>
                  {[...STD_SIZES, ...sizeList.filter(z => !STD_SIZES.includes(z))].map(z => { const on = sizeList.includes(z); return <Toggle type="button" key={z} variant="pill" size="sm" pressed={on} aria-label={`ไซซ์ ${z}`} onPressedChange={() => setSizes(on ? sizeList.filter(x => x !== z) : [...sizeList, z])}>{z}</Toggle>; })}
                  <Input className="h-7 w-24" placeholder="+ อื่น ↵" aria-label="เพิ่มไซซ์อื่น" onKeyDown={e => { const v = e.target.value.trim().toUpperCase(); if (e.key === 'Enter' && v) { e.preventDefault(); setSizes([...sizeList, v]); e.target.value = ''; } }} />
                </div>
              </Field>
              </div>
            </FormSection>

            {/* รหัสสินค้า (SKU) — พับไว้ · หัวแถวบอกจำนวน/แก้เอง + คัดลอกได้ไม่ต้องกาง */}
            <Collapsible open={skuOpen} onOpenChange={setSkuOpen}>
              <div className="rounded-xl border" style={{ borderColor: 'var(--line)', background: 'var(--surface)' }}>
                <div className="row between" style={{ padding: '10px 14px', gap: 8, flexWrap: 'wrap' }}>
                  <CollapsibleTrigger asChild>
                    <button type="button" className="row" style={{ gap: 8, background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', color: 'var(--ink)', minWidth: 0 }} aria-expanded={skuOpen}>
                      <span className="grid place-items-center rounded-lg size-7" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', flex: 'none' }}><Icon name="layers" /></span>
                      <span className="text-[13px] font-bold">รหัส SKU</span>
                      <span className="cap" style={{ color: 'var(--ink-4)' }}>· {skuAll.length ? `${skuAll.length} แบบ` : `${nSku} แบบ (ใส่รหัสสินค้าก่อน)`}{overrideN ? <span style={{ color: 'var(--accent)' }}> · แก้เอง {overrideN}</span> : ''} · สร้างจากสี×ไซซ์อัตโนมัติ</span>
                      <span style={{ display: 'inline-flex', color: 'var(--ink-4)', transition: 'transform .15s', transform: skuOpen ? 'rotate(180deg)' : 'none' }}><Icon name="chevD" /></span>
                    </button>
                  </CollapsibleTrigger>
                  {skuAll.length > 0 && <Button variant="outline" size="sm" className="h-7" onClick={() => { try { navigator.clipboard.writeText(skuAll.join('\n')); toast(`คัดลอก ${skuAll.length} รหัสแล้ว`, 'success'); } catch { toast('คัดลอกไม่ได้', 'error'); } }}><Icon name="layers" /> คัดลอกทั้งหมด</Button>}
                </div>
                <CollapsibleContent>
                  <div style={{ padding: '0 14px 14px' }}>
            {(() => {
              const cs = colorList, ss = sizeList, base = (edit.code || '').trim();
              if (!base) return <div className="cap" style={{ color: 'var(--ink-4)' }}>ใส่ <b>รหัสสินค้า</b> ด้านบน เพื่อสร้างรหัสรายสี/ไซซ์อัตโนมัติ</div>;
              const cols = cs.length ? cs : [null], szs = ss.length ? ss : [null];
              const vmap = edit.variants || {};
              const vkey = (c, s) => `${c || ''}|${s || ''}`;
              const formula = (c, s) => [base, c ? (COLOR_TH2CODE[c] || c) : null, s].filter(Boolean).join('-');
              const codeOf = (c, s) => { const o = vmap[vkey(c, s)]; return (o != null && o !== '') ? o : formula(c, s); };
              const setCode = (c, s, val) => { const k = vkey(c, s), v = { ...vmap }, def = formula(c, s); const t = val.trim(); if (!t || t === def) delete v[k]; else v[k] = t; setEdit({ ...edit, variants: v }); };
              const resetAll = () => setEdit({ ...edit, variants: {} });
              return (
                <div className="fld">
                  <div className="row between" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                    <span className="cap" style={{ color: 'var(--ink-4)' }}>แก้รหัสในช่องได้เลย — ตัวที่แก้มีกรอบสี ตัวที่ไม่แก้ปรับตามรหัส/สี/ไซซ์อัตโนมัติ</span>
                    {overrideN > 0 && <Button variant="outline" size="sm" className="h-7" onClick={resetAll} title="คืนทุกรหัสเป็นสูตร"><Icon name="refresh" /> รีเซ็ตสูตร</Button>}
                  </div>
                  <div className="sku-table-wrap">
                    <Table className="sku-table"><TableBody>
                      {cols.map(c => (
                        <TableRow key={c || '_'}>
                          <TableCell className="sku-color">{c ? <><span className="sw" style={{ background: COLOR_HEX[c] || '#bbb' }} />{c} <span className="cap" style={{ color: 'var(--ink-4)' }}>{COLOR_TH2CODE[c] || '?'}</span></> : <span className="cap" style={{ color: 'var(--ink-4)' }}>ไม่ระบุสี</span>}</TableCell>
                          <TableCell><div className="sku-codes">{szs.map(s => { const ov = vmap[vkey(c, s)] != null && vmap[vkey(c, s)] !== ''; return <input key={s || '_'} className={'sku-input' + (ov ? ' edited' : '')} value={codeOf(c, s)} title={s ? `ไซซ์ ${s}` : ''} aria-label={`รหัส ${c || ''} ${s || ''}`} onChange={e => setCode(c, s, e.target.value)} />; })}</div></TableCell>
                        </TableRow>
                      ))}
                    </TableBody></Table>
                  </div>
                </div>
              );
            })()}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* รายละเอียด / โน้ต */}
            <Field label="รายละเอียด / โน้ต"><Textarea aria-label="รายละเอียด / โน้ต" rows={3} value={edit.note} onChange={e => setEdit({ ...edit, note: e.target.value })} placeholder="เนื้อผ้า / รายละเอียดเพิ่มเติม" /></Field>

            {/* 10D — ประวัติการแก้ไข (เฉพาะตอนแก้ของเดิม · ซ่อนเงียบถ้ายังไม่มีประวัติ) */}
            {edit.id && <CatalogHistory catalogId={edit.id} />}
          </div>
        </SideSheet>
        );
      })()}

      {/* ---------- ยืนยันลบ ---------- */}
      {delTarget && (
        <Modal icon="trash" title="ลบสินค้าออกจากรายการ?" onClose={() => setDelTarget(null)}
          footer={<div className="row" style={{ gap: 8, marginLeft: 'auto' }}><Button variant="outline" onClick={() => setDelTarget(null)}>ยกเลิก</Button><Button style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} onClick={del}>ลบ</Button></div>}>
          <div>ลบ "<b>{delTarget.name || delTarget.code || 'รายการนี้'}</b>" ออกจากแคตตาล็อก? — ย้อนกลับไม่ได้</div>
        </Modal>
      )}

      {/* ---------- ยืนยันนำเข้า 47 ลาย ---------- */}
      {askImport && (
        <Modal icon="external" title="นำเข้าลายเสื้อ 47 ลาย?" onClose={() => setAskImport(false)}
          footer={<div className="row" style={{ gap: 8, marginLeft: 'auto' }}><Button variant="outline" onClick={() => setAskImport(false)}>ยกเลิก</Button><Button onClick={importLegacy}>นำเข้าเลย</Button></div>}>
          <div>ดึง 47 ลายจากตารางลายเสื้อ (รหัส · ชื่อลาย · หมวด · ราคา · สีที่มี · ไซซ์ที่มี) มาใส่ <b>ข้ามลายที่มีอยู่แล้ว</b> — จากนั้นเติมรูป/ราคาที่ว่างได้เลย</div>
        </Modal>
      )}
    </div>
  );
}
