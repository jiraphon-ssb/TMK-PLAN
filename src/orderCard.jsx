/* ============================================================
   orderCard.jsx — ระบบการ์ดออเดอร์กลาง (PART 88)
   ============================================================
   การ์ดออเดอร์ตัวเดียวใช้ทุก popup: วันของ perf ×2 · วัน CRM · ประวัติซื้อ
   ลูกค้า (CRM + dashboard · โหมดแถวย่อกดขยาย) · popup วันโอน/COD รายงานขาย
   ดีไซน์ = Lemon Squeezy ปรับเข้าข้อมูลเรา:
   - หัว: เลขออเดอร์ · ช่องทาง · ลูกค้า(กด→drawer) · badge · ยอดสุทธิ + ส่วนลดเห็นทันที
   - กลาง: รายการสินค้า → ปิดท้ายด้วยสรุป ราคาเสื้อ→−ส่วนลด(+ชิปโค้ด)→+ค่าส่ง→+VAT→ยอดขาย
   - ท้าย: ตัว/ชำระ/จังหวัด/เบอร์/โน้ตเต็ม
   + daySummary/DayTiles (10 ตัวชี้วัดรายวัน — ย้ายจาก salePerf มาเป็นของกลาง)
   + useOrderFinancials (batch attrs) / fetchOrderDetail (ขยายรายใบ)
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, Skel, PersonAvatar } from './components.jsx';
import { channelColor } from './charts.jsx';
import { fmtBaht } from './lib/money.js';
import { funnelCloseStats } from './lib/funnelClose.js';
import { SIZE_ORDER } from './lib/saleAgg.js';
import { loadResolverMaps, makeSkuResolver } from './lib/designResolve.js';
import { mergeOrderOverrides } from './lib/saleOverrides.js';
import { OVERRIDES_SEL } from './lib/saleData.js';
import { T } from './lib/tables.js';
import { Badge } from '@/components/ui/badge';

const B = (n) => fmtBaht(Number(n) || 0);
const num = (v) => Number(v) || 0;

export const JOB_COLOR = { DFT: 'var(--info)', OEM: 'var(--accent-2)' };
export const isCodOrder = (o) => o.payment_type === 'COD' || (Number(o.cod_amount) || 0) > 0;
export const closeTone = (v) => v == null ? 'var(--ink-4)' : v >= 15 ? 'var(--good)' : v >= 8 ? 'var(--warn)' : 'var(--bad)';
export const chLabel = (ch) => ch === 'Phone' ? 'โทร' : ch;
export function payLabel(o) {
  const cod = Number(o.cod_amount) || 0;
  if (o.payment_type === 'COD' || cod > 0) return `COD ${B(cod || o.sales)}`;
  return o.payment_type === 'โอน' ? 'โอน' : (o.payment_type || 'โอน');
}

/* ---- สรุปเงินท้ายรายการ (สไตล์ Lemon Squeezy — แถวแบน ไม่มีกล่อง) ----
   ราคาเสื้อ → −ส่วนลด (+ชิปโค้ดโปรโมชัน) → +ค่าส่ง → +VAT → ยอดขาย · ซ่อนเองถ้าไม่มี breakdown */
// แถวเดียวในสรุปเงิน — ประกาศระดับโมดูล (เดิมนิยามในตัว component → remount ทุก render)
function MoneyRow({ label, val, sign = '', tone, extra }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="flex items-center gap-1.5" style={{ color: 'var(--ink-4)' }}>{label}{extra}</span>
      <span className="num" style={{ color: tone || 'var(--ink-3)' }}>{sign}{B(val)}</span>
    </div>
  );
}
export function MoneySummaryRows({ fin, total }) {
  const d = num(fin?.discount), s = num(fin?.shipping), v = num(fin?.vat);
  const tot = num(total);
  const sub = fin?.subtotal != null && fin.subtotal !== '' ? Number(fin.subtotal) : null;
  const hasBreak = d || s || v || (sub != null && Math.abs(sub - tot) > 0.01);
  if (!hasBreak) return null;
  return (
    <div className="flex flex-col gap-1 border-t px-3 py-2" style={{ borderColor: 'var(--line)' }}>
      {sub != null && <MoneyRow label="ราคาเสื้อ" val={sub} />}
      {d ? <MoneyRow label="ส่วนลด" val={d} sign="−" tone="var(--bad)" extra={fin?.promo ? <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px] font-medium">{fin.promo}</Badge> : null} /> : null}
      {s ? <MoneyRow label="ค่าส่ง" val={s} sign="+" /> : null}
      {v ? <MoneyRow label="VAT" val={v} sign="+" /> : null}
      <div className="mt-0.5 flex items-center justify-between border-t pt-1.5 text-[13px]" style={{ borderColor: 'var(--line)' }}>
        <span className="font-semibold" style={{ color: 'var(--ink)' }}>ยอดขาย</span>
        <span className="num font-bold" style={{ color: 'var(--ink)' }}>{B(tot)}</span>
      </div>
    </div>
  );
}

/* ---- โหลดข้อมูลเสริมของออเดอร์ ----
   useOrderFinancials(ords) — batch attrs ตอน popup เปิด (คีย์ source:order_no กันชนข้าม source)
   fetchOrderDetail(stub) — ขยายรายใบจากประวัติซื้อ (แถวออเดอร์เต็ม + รายการสินค้า + fin) */
const finFromAttrs = (a = {}) => ({ subtotal: a.subtotal, discount: a.discount, shipping: a.shipping, vat: a.vat, promo: a.promo_code });
export const finOf = (finBy, o) => finBy?.[`${o.source || ''}:${o.order_no}`];
export function useOrderFinancials(ords) {
  const [finBy, setFinBy] = useState({});
  const nosKey = useMemo(() => [...new Set((ords || []).map(o => o.order_no).filter(x => x && !String(x).startsWith('(')))].sort().join(','), [ords]);
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ล้างค่าเก่าก่อนโหลดชุดใหม่ (async fetch) กันโชว์ส่วนลด/ค่าส่งของออเดอร์ชุดก่อน
    setFinBy({});
    (async () => {
      const nos = nosKey ? nosKey.split(',') : [];
      if (!nos.length) return;
      const out = {};
      for (let i = 0; i < nos.length; i += 150) {
        const { data } = await supabase.from(T.mpOrders).select('order_no,source,attrs').in('order_no', nos.slice(i, i + 150));
        (data || []).forEach(r => { out[`${r.source || ''}:${r.order_no}`] = finFromAttrs(r.attrs); });
      }
      if (live) setFinBy(out);
    })();
    return () => { live = false; };
  }, [nosKey]);
  return finBy;
}

// select แถวออเดอร์เต็มสำหรับการ์ด (รวม attrs — ใช้เฉพาะตอนขยายรายใบ ไม่เข้า list ใหญ่ กัน egress)
const ORDER_CARD_SEL = 'order_no,source,channel,salesperson,province,sales,qty,order_date,payment_type,cod_amount,customer_type,customer_name,customer_code,customer_phone,customer_social,job_type,note,attrs';
export async function fetchOrderDetail(stub) {
  const no = stub.order_no;
  const [{ data: oRows }, { data: sRows }] = await Promise.all([
    supabase.from(T.mpOrders).select(ORDER_CARD_SEL).eq('order_no', no).limit(5),
    supabase.from(T.mpSkus).select('order_no,design,color,size,qty,line_sales,product_code,raw_sku_or_name,order_date').eq('order_no', no),
  ]);
  // order_no อาจซ้ำข้าม source — เลือกแถวที่ channel ตรง stub ก่อน
  let or = (oRows || []).find(r => !stub.channel || r.channel === stub.channel) || (oRows || [])[0] || null;
  const lines = sRows || [];
  try {
    const maps = await loadResolverMaps(supabase);
    const resolve = makeSkuResolver(maps);
    lines.forEach(s => { s.design = resolve(s).design || s.design; });
  } catch { /* resolver ล้ม → ใช้ชื่อลายดิบ */ }
  // 3.4: merge override ของออเดอร์เอง (note/job_type/customer_type/payment/channel ที่แอดมินแก้) — stub จากประวัติซื้อไม่พก field พวกนี้ → ต้อง merge เอง ไม่งั้นโชว์ค่าก่อนแก้
  if (or) {
    try {
      const { data: ov } = await supabase.from(T.orderOverrides).select(OVERRIDES_SEL).eq('order_id', `${or.source || ''}:${no}`).maybeSingle();
      if (ov) or = mergeOrderOverrides([or], { [ov.order_id]: ov })[0];
    } catch { /* override optional */ }
  }
  // merge: ค่าใน stub (ผ่าน override/merge จากหน้าจอ) ชนะแถวดิบที่ merge override แล้ว · แถวดิบเติมช่องที่ stub ไม่มี
  const order = { ...(or || {}), ...Object.fromEntries(Object.entries(stub).filter(([, v]) => v != null && v !== '')) };
  if (!order.order_date && stub.date) order.order_date = stub.date;
  return { order, lines, fin: finFromAttrs(or?.attrs) };
}

/* ---- การ์ดออเดอร์กลาง ----
   o=ออเดอร์ (เต็มหรือ stub) · lines=รายการสินค้า · fin=breakdown · showSeller=โชว์เซลล์บนหัว
   onPickCustomer=(o)=>เปิด drawer ลูกค้า (ไม่ส่ง = ชื่อกดไม่ได้) · collapsed=โหมดแถวย่อกดขยาย
   (ขยายแล้วถ้าไม่มี lines/fin จะเรียก fetchOrderDetail ให้เอง — โหลดเฉพาะใบที่กด) */
/* รวมบรรทัดสินค้าตาม ลาย+สี แล้วยุบไซซ์เป็นรายการเดียว — ใบเดียวเคยยาว 14 บรรทัด (ชบา ดำ ทุกไซซ์) เหลือ 1 บรรทัด */
export function groupLines(lines) {
  const m = new Map();
  (lines || []).forEach(l => {
    const design = (l.design && String(l.design).trim()) || l.product_code || 'ไม่ระบุลาย';
    const color = (l.color || '').trim();
    const k = design + '|' + color;
    const g = m.get(k) || { key: k, design, color, qty: 0, sales: 0, hasSales: false, sizes: [] };
    g.qty += num(l.qty);
    if (l.line_sales != null) { g.sales += num(l.line_sales); g.hasSales = true; }
    const sz = (l.size || '').trim();
    const ex = g.sizes.find(x => x.size === sz);
    if (ex) ex.qty += num(l.qty); else g.sizes.push({ size: sz, qty: num(l.qty) });
    m.set(k, g);
  });
  const rank = (z) => { const i = SIZE_ORDER.indexOf(String(z || '').toUpperCase()); return i < 0 ? 99 : i; };
  return [...m.values()].map(g => ({ ...g, sales: g.hasSales ? g.sales : null, sizes: g.sizes.filter(z => z.size).sort((a, b) => rank(a.size) - rank(b.size)) }))
    .sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0) || b.qty - a.qty);
}

export function OrderCard({ o, lines, fin, showSeller, onPickCustomer, collapsed = false, hideDate = false, hideCustomer = false }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const expand = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!detail && (!lines || fin === undefined)) {
      setBusy(true);
      try { setDetail(await fetchOrderDetail(o)); } catch { /* แสดงเท่าที่มี */ }
      setBusy(false);
    }
  };
  if (!collapsed) return <OrderCardBody o={o} lines={lines} fin={fin} showSeller={showSeller} onPickCustomer={onPickCustomer} />;
  const eo = detail?.order || o;
  const disc = num((detail?.fin ?? fin)?.discount);
  return (
    <div className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--line)' }}>
      {/* แถวย่อ — วันที่ · เลข · ช่องทาง · ตัว · ยอด (+ป้ายส่วนลดหลังขยายแล้วรู้ค่า) */}
      <button type="button" onClick={expand} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--surface-2)]" style={{ background: open ? 'var(--surface-2)' : 'transparent' }}>
        {!hideDate && <span className="num cap shrink-0" style={{ color: 'var(--ink-4)' }}>{o.order_date || o.date || '—'}</span>}
        <span className="num text-[12px] font-semibold shrink-0" style={{ color: 'var(--ink-3)' }}>{o.order_no}</span>
        {o.channel && <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px] font-medium shrink-0" style={{ color: channelColor(o.channel), borderColor: `color-mix(in srgb, ${channelColor(o.channel)} 40%, transparent)` }}>{chLabel(o.channel)}</Badge>}
        {/* ชื่อลูกค้า — สำคัญกว่าวันที่ในป๊อปอัพรายวัน (เดิมแถวย่อไม่มีชื่อ ต้องกางถึงจะรู้ว่าใคร) */}
        {hideCustomer
          ? <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: 'var(--ink-4)' }}>{(lines || []).length ? [...new Set((lines || []).map(l => (l.design || '').trim()).filter(Boolean))].slice(0, 2).join(', ') : ''}</span>
          : <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" style={{ color: 'var(--ink)' }}>{o.customer_name || o.customer_code || 'ไม่ระบุลูกค้า'}</span>}
        {o.customer_type === 'ลูกค้าใหม่' && <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px] shrink-0" style={{ color: 'var(--accent)', borderColor: 'currentColor' }}>ใหม่</Badge>}
        {(String(o.job_type || '').toUpperCase() === 'DFT' || String(o.job_type || '').toUpperCase() === 'OEM') && <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[10px] shrink-0" style={{ color: JOB_COLOR[String(o.job_type).toUpperCase()], borderColor: 'currentColor' }}>{String(o.job_type).toUpperCase()}</Badge>}
        {showSeller && (o.salesperson || '').trim() && <span className="inline-flex shrink-0 items-center gap-1 text-[10px]" style={{ color: 'var(--ink-4)' }}><PersonAvatar name={(o.salesperson || '').trim()} size={16} />{(o.salesperson || '').trim()}</span>}
        {disc > 0 && <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px] shrink-0" style={{ color: 'var(--bad)' }}>ลด −{B(disc)}</Badge>}
        <span className="num shrink-0 text-[11px]" style={{ color: 'var(--ink-4)' }}>{N(o.qty)} ตัว</span>
        <span className="num shrink-0 text-[13px] font-bold" style={{ color: 'var(--ink)' }}>{B(o.sales)}</span>
        <Icon name="chevD" style={open ? { transform: 'rotate(180deg)' } : undefined} />
      </button>
      {open && (busy
        ? <div className="border-t p-3" style={{ borderColor: 'var(--line)' }}><Skel w="100%" h={72} r={8} /></div>
        : <div className="border-t" style={{ borderColor: 'var(--line)' }}>
            <OrderCardBody o={eo} lines={detail?.lines?.length ? detail.lines : lines} fin={detail?.fin ?? fin} showSeller={showSeller} onPickCustomer={onPickCustomer} bare hideHead />
          </div>)}
    </div>
  );
}

// เนื้อการ์ดเต็ม (bare = ไม่มีกรอบนอก — ใช้ตอนซ้อนใน collapsed row)
function OrderCardBody({ o, lines, fin, showSeller, onPickCustomer, bare = false, hideHead = false }) {
  const ch = o.channel || '';
  const isNew = o.customer_type === 'ลูกค้าใหม่';
  const job = (o.job_type || '').toUpperCase();
  const seller = (o.salesperson || '').trim();
  const disc = num(fin?.discount);
  const custName = o.customer_name || o.customer_code || 'ไม่ระบุลูกค้า';
  return (
    <div className={bare ? '' : 'overflow-hidden rounded-lg border'} style={bare ? undefined : { borderColor: 'var(--line)' }}>
      {/* หัว — เลข/ช่องทาง/ลูกค้า/badge + ยอดสุทธิ (ส่วนลดเห็นทันที) · ซ่อนเมื่อกางจากแถวย่อ (ข้อมูลซ้ำ) */}
      {!hideHead && <div className="flex items-center gap-2 px-3 py-2 flex-wrap" style={{ background: 'var(--surface-2)' }}>
        <span className="num text-[12px] font-semibold" style={{ color: 'var(--ink-3)' }}>{o.order_no}</span>
        {ch && <Badge variant="outline" className="rounded-full text-[10px] font-medium" style={{ color: channelColor(ch), background: `color-mix(in srgb, ${channelColor(ch)} 14%, transparent)`, borderColor: `color-mix(in srgb, ${channelColor(ch)} 40%, transparent)` }}>{chLabel(ch)}</Badge>}
        {onPickCustomer
          ? <button type="button" onClick={() => onPickCustomer(o)} className="truncate text-[13px] font-semibold hover:underline" style={{ color: 'var(--ink)', maxWidth: 200 }} title="ดูโปรไฟล์ลูกค้า">{custName}</button>
          : <span className="truncate text-[13px] font-semibold" style={{ color: 'var(--ink)', maxWidth: 200 }}>{custName}</span>}
        {isNew && <Badge variant="outline" className="rounded-full text-[10px]" style={{ color: 'var(--accent)', borderColor: 'currentColor' }}>ใหม่</Badge>}
        {(job === 'DFT' || job === 'OEM') && <Badge variant="outline" className="rounded-full text-[10px]" style={{ color: JOB_COLOR[job], borderColor: 'currentColor' }}>{job}</Badge>}
        {showSeller && seller && <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: 'var(--ink-4)' }}><PersonAvatar name={seller} size={16} />{seller}</span>}
        <span className="ml-auto text-right">
          <span className="num block text-[14px] font-bold leading-tight" style={{ color: 'var(--accent-2)' }}>{B(o.sales)}</span>
          {disc > 0 && <span className="num block text-[10px] leading-tight" style={{ color: 'var(--bad)' }}>ลด −{B(disc)}</span>}
        </span>
      </div>}
      {/* รายการสินค้า */}
      {lines && lines.length > 0 && (
        <div className="px-3 py-1.5">
          {groupLines(lines).map((g, i) => (
            <div key={g.key || i} className="row items-start gap-2 py-0.5 text-[12px]">
              <span className="min-w-0 flex-1" style={{ color: 'var(--ink-2)' }}>
                {g.design}{g.color ? <span className="cap" style={{ color: 'var(--ink-4)' }}> · {g.color}</span> : null}
                {g.sizes.length > 0 && <div className="cap" style={{ color: 'var(--ink-4)' }}>{g.sizes.map(z => `${z.size || '—'}×${N(z.qty)}`).join('  ')}</div>}
              </span>
              <span className="shrink-0 num" style={{ color: 'var(--ink-3)', width: 42, textAlign: 'right' }}>{N(g.qty)} ตัว</span>
              <span className="shrink-0 num" style={{ color: 'var(--ink-2)', width: 74, textAlign: 'right' }}>{g.sales != null ? B(g.sales) : '—'}</span>
            </div>
          ))}
        </div>
      )}
      {/* สรุปเงินท้ายรายการ (Lemon) — ซ่อนเองถ้าไม่มี breakdown */}
      <MoneySummaryRows fin={fin} total={o.sales} />
      {/* ท้าย */}
      <div className="row flex-wrap gap-x-3 gap-y-0.5 border-t px-3 py-1.5 text-[11px]" style={{ color: 'var(--ink-4)', borderColor: 'var(--line)' }}>
        <span>จำนวน <b style={{ color: 'var(--ink-3)' }}>{N(o.qty)}</b> ตัว</span>
        <span>ชำระ: <b style={{ color: 'var(--ink-3)' }}>{payLabel(o)}</b></span>
        {o.province && <span>{o.province}</span>}
        {(o.customer_phone || o.customer_social) && <span className="num">{o.customer_phone || '@' + o.customer_social}</span>}
      </div>
      {o.note && <div className="px-3 pb-2 pt-1 text-[11px]" style={{ color: 'var(--ink-3)', whiteSpace: 'pre-wrap' }}><Icon name="pencil" /> {o.note}</div>}
    </div>
  );
}

/* ---- สรุปยอดต่อวัน + กริด 10 ตัวชี้วัด (ย้ายจาก salePerf → ของกลาง ใช้ 3 หน้า) ---- */
export function daySummary(ords, dayFunnel) {
  const sales = ords.reduce((s, o) => s + num(o.sales), 0);
  const qty = ords.reduce((s, o) => s + num(o.qty), 0);
  // COD ก่อน (เก็บปลายทาง) → โอน = ที่เหลือที่ payment_type='โอน' · กันนับซ้ำถ้าออเดอร์เป็นทั้งโอน+cod_amount
  const cod = ords.filter(isCodOrder).reduce((s, o) => s + num(o.sales), 0);
  const transfer = ords.filter(o => !isCodOrder(o) && o.payment_type === 'โอน').reduce((s, o) => s + num(o.sales), 0);
  const newC = ords.filter(o => o.customer_type === 'ลูกค้าใหม่').length;
  /* %ปิด ต้องมาจากสูตรกลาง lib/funnelClose.js — เดิมคำนวณเองที่นี่โดยไม่จำกัดตัวเศษ
     ไว้เฉพาะเซลล์ที่กรอกคนทักในวันนั้น → popup รายละเอียดวันขึ้น 40% ขณะที่หน้าจอข้างหลังขึ้น 15%
     (คอมเมนต์ใน dayDetailSheet.jsx เคยเขียนว่าใช้ "สูตรกลาง" ซึ่งไม่จริงมาตลอด) */
  const st = funnelCloseStats(dayFunnel || [], ords, null);
  const orders = ords.length;
  return { sales, qty, transfer, cod, newC, leads: st.leads, orders, chatOrders: st.orders,
    other: Math.max(0, sales - transfer - cod),
    close: st.pct == null ? null : Math.round(st.pct), aov: orders ? sales / orders : 0, avgQty: orders ? qty / orders : 0 };
}
/* สรุปวัน — ยอดรวมเด่น + แถบ โอน/COD + ค่ารองแถวเดียว (รื้อ 22 ส.ค.)
   เดิม DayTiles = 10 กล่องเท่ากันหมด · โอน/COD เป็นส่วนย่อยของยอดรวม · Basket/AVG เป็นค่าอนุพันธ์ที่เด่นเท่ายอดขาย */
export function DaySummaryBar({ s }) {
  const pay = s.transfer + s.cod;
  const seg = [
    ['โอน', s.transfer, 'var(--good)'],
    ['COD', s.cod, 'var(--warn)'],
    ['อื่นๆ', Math.max(0, s.sales - pay), 'var(--ink-4)'],
  ].filter(([, v]) => v > 0);
  const segTot = seg.reduce((a, [, v]) => a + v, 0) || 1;
  const stats = [
    ['ออเดอร์', N(s.orders), s.orders ? `${s.avgQty.toFixed(1)} ตัว/ออเดอร์` : ''],
    ['จำนวนตัว', N(s.qty), ''],
    ['ลูกค้าใหม่', N(s.newC), s.orders ? `${Math.round(s.newC / s.orders * 100)}% ของออเดอร์` : ''],
    ['คนทัก', N(s.leads), ''],
    ['เฉลี่ย/ออเดอร์', s.orders ? B(s.aov) : '—', ''],
  ];
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
      <div className="row" style={{ gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div>
          <div className="text-[11px] text-muted-foreground">ยอดขายรวมของวัน</div>
          <div className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.6px', lineHeight: 1.1, color: 'var(--accent-2)' }}>{B(s.sales)}</div>
        </div>
        {s.close != null && (
          <div className="ml-auto text-right" title="ออเดอร์ช่องแชท ÷ คนทัก (ตัดมาร์เก็ตเพลส) · เกณฑ์ดี ≥15%">
            <div className="text-[11px] text-muted-foreground">%ปิดการขาย</div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800, color: closeTone(s.close) }}>{s.close}%<span className="text-[11px] font-normal text-muted-foreground"> · ปิด {N(s.chatOrders)}/{N(s.leads)}</span></div>
          </div>
        )}
      </div>
      {segTot > 1 && (
        <div style={{ marginTop: 12 }}>
          <div className="row cap" style={{ gap: '4px 14px', flexWrap: 'wrap', color: 'var(--ink-4)' }}>
            {seg.map(([l, v, c]) => <span key={l} className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />{l} <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{B(v)}</b> · {Math.round(v / segTot * 100)}%</span>)}
          </div>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-3)', marginTop: 5 }} role="img" aria-label={seg.map(([l, v]) => `${l} ${Math.round(v / segTot * 100)}%`).join(' · ')}>
            {seg.map(([l, v, c]) => <span key={l} style={{ width: `${v / segTot * 100}%`, background: c }} />)}
          </div>
        </div>
      )}
      <div className="day-stats" style={{ marginTop: 12 }}>
        {stats.map(([l, v, sub]) => (
          <div key={l} style={{ minWidth: 0 }}>
            <div className="text-[11px] text-muted-foreground whitespace-nowrap">{l}</div>
            <div className="num" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{v}</div>
            {sub && <div className="text-[10.5px] text-muted-foreground whitespace-nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
