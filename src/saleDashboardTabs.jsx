/* ============================================================
   saleDashboardTabs.jsx — เนื้อหาแต่ละแท็บของรายงานขาย (saleDashboard.jsx)
   แยกมาจาก saleDashboard.jsx (ยกก้อน JSX มาทั้งดุ้น ไม่แก้เนื้อใน):
   OverviewTab · OverviewChannels · VariantTab · CustomerTab · FunnelTab
   + component ย่อยที่ใช้เฉพาะในแท็บ: ProductsBlock/SplitBar · ChannelHeatmap · VariantMatrix
   ค่าที่เคยเป็น closure ของหน้าแม่ (A/prevA/k/range/gran/…) ส่งลงมาทาง prop `ctx`
   ============================================================ */
import { useState, useMemo, Fragment } from 'react';
import { N, Icon } from './components.jsx';
import { bestWeekday } from './lib/uiLogic.js';
import { DailySalesChart, Heatmap, channelColor, CAT_COLORS } from './charts.jsx';
import { movers, pareto, sizeRank, normColor, normSize } from './lib/saleAgg.js';
import { bucketKey, bucketLabel, enumerateBuckets } from './lib/saleTime.js';
import { funnelBreakdown } from './lib/saleData.js';
import { funnelCloseStats, leadsOfRow, newOldOfRow, nmSeller } from './lib/funnelClose.js';
import { ChannelLogo, channelTint } from './lib/channelLogos.jsx';
import { todayISO } from './lib/dateUtils.js';
import { VoiceFeed } from './saleWidgets.jsx';
import { baht, COLOR_HEX, PAY_HEX } from './lib/saleDashboardHelpers.js';
import { SectionHead, KpiCard } from './saleDashboardChrome.jsx';
import { customerStats, CustomerHero, ContactCards, NewOldDailyChart, ChannelNewOldRows, RfmTiles, CrmTeamStrip, CustomerTable, crmNotesSummary } from './crmBlocks.jsx';
import { Card, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { CardTable } from './components/DataTableParts.jsx';

import { deltaPct } from './lib/deltaChip.js';
// ===== แท็บ "ภาพรวม" ส่วนบน — เทรนด์ + เจาะลึกยอดขาย + สัดส่วนธุรกิจ + 80/20 + ตารางรายวัน =====
/* ตารางยอดรายวันแยกการชำระ (โอน/COD) — แยกเป็น component วางคู่ตารางช่องทาง (2 คอลัมน์) */
export function DailyPaymentTable({ orders, onDayClick }) {
  const [showAll, setShowAll] = useState(false);
  // group ออเดอร์ (ผ่านตัวกรองแล้ว) ตามวัน → ยอดรวม/โอน/COD/อื่นๆ ต่อวัน
  const isCod = (o) => o.payment_type === 'COD' || (Number(o.cod_amount) || 0) > 0;
  const m = new Map();
  (orders || []).forEach(o => {
    const d = o.order_date; if (!d) return;
    const g = m.get(d) || { d, orders: 0, sales: 0, transfer: 0, cod: 0, other: 0 };
    const s = Number(o.sales) || 0;
    g.orders += 1; g.sales += s;
    if (isCod(o)) g.cod += s; else if (o.payment_type === 'โอน') g.transfer += s; else g.other += s;
    m.set(d, g);
  });
  const days = [...m.values()].sort((a, b) => b.d.localeCompare(a.d));
  const tot = days.reduce((a, g) => ({ orders: a.orders + g.orders, sales: a.sales + g.sales, transfer: a.transfer + g.transfer, cod: a.cod + g.cod, other: a.other + g.other }), { orders: 0, sales: 0, transfer: 0, cod: 0, other: 0 });
  const hasOther = tot.other > 0;
  const nDays = days.length || 1;
  const maxCod = days.reduce((b, g) => (g.cod > (b?.cod || 0) ? g : b), null);
  const segs = [['โอน', tot.transfer, PAY_HEX['โอน']], ['COD', tot.cod, PAY_HEX['COD']], ['อื่นๆ', tot.other, 'var(--ink-4)']].filter(x => x[1] > 0);
  const shown = showAll ? days : days.slice(0, 7);
  const R = { textAlign: 'right' };
  return (
        <Card className="p-[22px] flex flex-col min-w-0">
          <CardTitle className="m-0 text-base font-semibold mb-[6px]">การชำระเงิน <span className="dim">· โอน / COD</span></CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>COD = เก็บเงินปลายทาง · อื่นๆ = มาร์เก็ตเพลส/ไม่ระบุ · กดวันดูออเดอร์ทั้งวัน</div>
          {!days.length ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '20px 0', textAlign: 'center' }}>ไม่มีข้อมูลในช่วงนี้</div> : (<>
            {/* สรุป: แถบสัดส่วน + ตัวเลขก้อนใหญ่ + เฉลี่ย/วัน + วัน COD สูงสุด */}
            <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)' }} role="img" aria-label={`สัดส่วนการชำระ: ${segs.map(([k, v]) => `${k} ${Math.round(v / tot.sales * 100)}%`).join(' · ')}`}>
              {segs.map(([k, v, c]) => <span key={k} title={`${k} · ${baht(v)} · ${Math.round(v / tot.sales * 100)}%`} style={{ width: `${v / tot.sales * 100}%`, background: c, minWidth: 2 }} />)}
            </div>
            <div className="row" style={{ gap: 18, marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {segs.map(([k, v, c]) => (
                <div key={k} style={{ minWidth: 0 }}>
                  <div className="row cap" style={{ gap: 6, color: 'var(--ink-3)', fontWeight: 600 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: c }} />{k} <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>{Math.round(v / tot.sales * 100)}%</span></div>
                  <div className="num" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: c === 'var(--ink-4)' ? 'var(--ink-2)' : c }}>{baht(v)}</div>
                  <div className="cap" style={{ color: 'var(--ink-4)' }}>เฉลี่ย {baht(v / nDays)}/วัน</div>
                </div>
              ))}
              {maxCod && maxCod.cod > 0 && (
                <div style={{ marginLeft: 'auto', textAlign: 'right', minWidth: 0 }}>
                  <div className="cap" style={{ color: 'var(--ink-4)' }}>COD สูงสุด</div>
                  <div className="num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{bucketLabel(maxCod.d, 'day')} <span style={{ color: 'var(--warn)' }}>{baht(maxCod.cod)}</span></div>
                </div>
              )}
            </div>
            {/* รายวัน: 7 วันล่าสุด ไม่เลื่อน · กางดูทั้งหมดได้ */}
            <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600, marginTop: 14, marginBottom: 4 }}>{showAll ? `ทั้งหมด ${N(days.length)} วัน` : `${N(Math.min(7, days.length))} วันล่าสุด`}</div>
            <CardTable className="[&_td]:py-[7px]"><Table>
              <TableHeader><TableRow>
                <TableHead>วันที่</TableHead><TableHead style={R}>ออเดอร์</TableHead>
                <TableHead style={R}>โอน</TableHead><TableHead style={R}>COD</TableHead>
                {hasOther && <TableHead style={R}>อื่นๆ</TableHead>}
                <TableHead style={R}>ยอดรวม</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {shown.map(g => (
                  <TableRow key={g.d} onClick={() => onDayClick(g.d)} style={{ cursor: 'pointer' }} title="กดดูออเดอร์ทั้งวัน">
                    <TableCell className="cell-title num">{bucketLabel(g.d, 'day')}</TableCell>
                    <TableCell className="num" style={R}>{N(g.orders)}</TableCell>
                    <TableCell className="num" style={{ ...R, color: g.transfer ? 'var(--good)' : 'var(--ink-4)' }}>{g.transfer ? baht(g.transfer) : '—'}</TableCell>
                    <TableCell className="num" style={{ ...R, color: g.cod ? 'var(--warn)' : 'var(--ink-4)' }}>{g.cod ? baht(g.cod) : '—'}</TableCell>
                    {hasOther && <TableCell className="num" style={{ ...R, color: g.other ? 'var(--ink-3)' : 'var(--ink-4)' }}>{g.other ? baht(g.other) : '—'}</TableCell>}
                    <TableCell className="num" style={{ ...R, fontWeight: 700 }}>{baht(g.sales)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></CardTable>
            {days.length > 7 && (
              <button type="button" onClick={() => setShowAll(v => !v)} className="cap mt-2 self-start text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }}>
                {showAll ? 'ย่อเหลือ 7 วันล่าสุด' : `ดูทั้งหมด ${N(days.length)} วัน`}
              </button>
            )}
          </>)}
        </Card>
  );
}

export function OverviewTab({ ctx }) {
  const { cmp, trendByChannel: tc, gran, curLabel, prevLabel, toggleFilter, setDayPay } = ctx;
  const granWord = gran === 'day' ? 'รายวัน' : gran === 'week' ? 'รายสัปดาห์' : gran === 'month' ? 'รายเดือน' : 'รายไตรมาส';
  const unitWord = gran === 'day' ? 'วัน' : gran === 'week' ? 'สัปดาห์' : gran === 'month' ? 'เดือน' : 'ไตรมาส';
  const refLabel = tc?.ref ? `เฉลี่ย/${unitWord} ${prevLabel}` : '';
  return (<>
        {/* ===== ยอดขายรายวัน — รื้อใหม่ (22 ส.ค.): ไม่มีปุ่ม · แท่ง=ยอดขาย แยกสีช่องทางเสมอ · เส้นประ=เฉลี่ยช่วงก่อน · hover ดูออเดอร์/ช่องทาง · คลิกแท่ง(รายวัน)=popup ออเดอร์ทั้งวัน ===== */}
        {tc && tc.datasets.length > 0 && (
          <Card className="p-[22px]">
            <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <CardTitle className="m-0 text-base font-semibold">ยอดขาย{granWord} <span className="dim">· {curLabel}</span></CardTitle>
                <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>แท่ง = ยอดขาย แยกสีตามช่องทาง · เส้น = จำนวนออเดอร์ · เส้นประ = {prevLabel} วันเดียวกัน · ชี้ดูรายละเอียด{gran === 'day' ? ' · คลิกวันไหนดูออเดอร์ทั้งวัน' : ''}</div>
              </div>
              {tc.best && (
                <div className="row" style={{ gap: 8, alignItems: 'center', padding: '6px 12px', borderRadius: 10, background: 'var(--accent-soft)' }}>
                  <Icon name="star" size={14} style={{ color: 'var(--accent)' }} />
                  <span className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>ขายดีสุด</span>
                  <span className="cap" style={{ color: 'var(--ink)', fontWeight: 700 }}>{tc.best.label}</span>
                  <span className="num cap" style={{ fontWeight: 700, color: 'var(--accent)' }}>{baht(tc.best.sales)}</span>
                  {tc.best.orders > 0 && <span className="num cap" style={{ color: 'var(--ink-4)' }}>· {N(tc.best.orders)} ออเดอร์</span>}
                </div>
              )}
            </div>
            <DailySalesChart labels={tc.labels} tipLabels={tc.tipLabels} orders={tc.orders} weekend={gran === 'day' ? tc.weekend : undefined} datasets={tc.datasets}
              prevValues={cmp ? tc.prevSeries : null} prevLabel={prevLabel} refValue={cmp && !tc.prevSeries ? tc.ref : null} fmt={baht} height={270}
              onBarClick={gran === 'day' ? (i) => { const k = tc.keys[i]; if (k) setDayPay(k); } : undefined} />
            {/* legend = ชิปช่องทาง (กด = กรองช่องทางทั้งหน้า) + เส้นอ้างอิง */}
            <div className="cap row" style={{ gap: 6, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap', color: 'var(--ink-4)' }}>
              {tc.datasets.map(d => (
                <button key={d.label} type="button" onClick={() => toggleFilter('channel', d.label)} title={`กรองช่องทาง ${d.label}`}
                  className="row rounded-full border px-2.5 py-1 hover:bg-muted/50 transition-colors" style={{ gap: 6, color: 'var(--ink-3)', fontWeight: 600 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: d.color }} /> {d.label}
                </button>
              ))}
              {tc.orders?.some(v => v > 0) && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px solid var(--ink-2)', position: 'relative' }}><span style={{ position: 'absolute', left: 5, top: -4, width: 6, height: 6, borderRadius: 3, background: 'var(--surface)', border: '1.5px solid var(--ink-2)' }} /></span> ออเดอร์/{unitWord} (แกนขวา)</span>}
              {cmp && tc.prevSeries && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px dashed var(--accent-2)' }} /> {prevLabel} วันเดียวกัน</span>}
              {cmp && !tc.prevSeries && tc.ref > 0 && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px dashed var(--ink-3)' }} /> {refLabel} <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{baht(Math.round(tc.ref))}</b></span>}
              {gran === 'day' && tc.weekend?.some(Boolean) && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 14, height: 10, borderRadius: 2, background: 'rgba(130,140,160,.18)' }} /> เสาร์–อาทิตย์</span>}
            </div>
          </Card>
        )}

  </>);
}

/* ============================================================
   ProductsBlock — "ลายขายดี" + "สัดส่วน" (รื้อใหม่ 22 ส.ค.: ยุบ 8 การ์ดเดิมเหลือ 2 ใบสูงเท่ากัน ไม่มีปุ่ม)
   ============================================================
   เดิม: ยอดแต่ละลาย · ยอดแต่ละสี · ลาย×สี · การชำระ(โดนัท) · ประเภทงาน · หมวดสินค้า · กฎ 80/20 · ดาวรุ่ง · ดาวร่วง
   ใหม่:
   - ลายขายดี = ตารางเดียว: อันดับ · แถบยอดขาย · ตัว · สะสม% (เส้นคั่นตรง 80%) · vs ช่วงก่อน ▲▼ (แทนดาวรุ่ง/ดาวร่วง — เห็นทุกลาย)
     · สีขายดีของลายนั้น (แทนการ์ด ลาย×สี) · % เทียบเฉพาะฐานช่วงก่อน ≥ ฿5,000 (ต่ำกว่า = "ใหม่"/"ฐานเล็ก" จาง กันตัวเลขหลอก)
   - สัดส่วน = แถบแบ่งส่วน ประเภทงาน / หมวดสินค้า + สีขายดี top 5 (การชำระย้ายไปอยู่หัวตาราง โอน/COD)
   ทุกชื่อกด = กรองทั้งหน้า (toggleFilter) เหมือนกันหมด · ใช้ A/prevA ที่ compute แล้ว ไม่แตะสูตร
   ============================================================ */
const SMALL_BASE = 5000;   // ฐานช่วงก่อนต่ำกว่านี้ ไม่โชว์ % เด่น (฿4,862 → +674% = หลอก)
const fmtDelta = (cur, prev) => {
  if (!prev) return { txt: 'ใหม่', tone: 'var(--accent)', dim: true };
  const d = (cur - prev) / prev;
  const txt = (d >= 0 ? '+' : '−') + Math.round(Math.abs(d) * 100) + '%';
  if (prev < SMALL_BASE) return { txt: txt + ' · ฐานเล็ก', tone: 'var(--ink-4)', dim: true };
  return { txt, tone: d >= 0 ? 'var(--good)' : 'var(--bad)', up: d >= 0, dim: false };
};

/* แถบแบ่งส่วน + legend (ประเภทงาน/หมวดสินค้า) — ≤4 ก้อน + อื่นๆ · กดชื่อ = กรอง */
function SplitBar({ title, items, valKey, fmt, unit, dim, onPick, colors }) {
  const all = (items || []).filter(x => (x[valKey] || 0) > 0).sort((a, b) => b[valKey] - a[valKey]);
  const total = all.reduce((a, x) => a + x[valKey], 0);
  if (!total) return null;
  const top = all.slice(0, 4); const rest = all.slice(4);
  const segs = [...top.map((x, i) => ({ key: x.key, v: x[valKey], color: colors?.[x.key] || CAT_COLORS[i % CAT_COLORS.length], pick: true }))];
  if (rest.length) segs.push({ key: `อื่นๆ (${rest.length})`, v: rest.reduce((a, x) => a + x[valKey], 0), color: 'var(--ink-4)', pick: false });
  return (
    <div>
      <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)' }} role="img" aria-label={`${title}: ${segs.map(g => `${g.key} ${Math.round(g.v / total * 100)}%`).join(' · ')}`}>
        {segs.map(g => <span key={g.key} title={`${g.key} · ${fmt(g.v)}${unit ? ' ' + unit : ''} · ${Math.round(g.v / total * 100)}%`} style={{ width: `${g.v / total * 100}%`, background: g.color, minWidth: g.v > 0 ? 2 : 0 }} />)}
      </div>
      <div style={{ display: 'grid', gap: 3, marginTop: 7 }}>
        {segs.map(g => (
          <div key={g.key} className="row" style={{ gap: 8, alignItems: 'center', cursor: g.pick && onPick ? 'pointer' : 'default' }} onClick={() => g.pick && onPick && onPick(dim, g.key)} title={g.pick && onPick ? `กรอง ${g.key}` : undefined}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: g.color, flex: 'none' }} />
            <span className="cap" style={{ color: 'var(--ink-2)', fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.key}</span>
            <span className="num cap" style={{ fontWeight: 600 }}>{fmt(g.v)}{unit ? <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}> {unit}</span> : ''}</span>
            <span className="num cap" style={{ color: 'var(--ink-4)', width: 34, textAlign: 'right' }}>{Math.round(g.v / total * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductsBlock({ A, prevA, cmp, prevLabel, toggleFilter }) {
  const [showAll, setShowAll] = useState(false);
  // ลาย: เรียงตามยอดขาย (บาท) · สะสม% · เทียบช่วงก่อน · สีขายดีต่อลาย
  const ranked = useMemo(() => [...(A?.byDesign || [])].filter(d => d.sales > 0 && d.key !== 'ไม่ระบุลาย').sort((a, b) => b.sales - a.sales), [A]);
  const par = useMemo(() => pareto(ranked, 'sales'), [ranked]);
  const prevMap = useMemo(() => new Map((prevA?.byDesign || []).map(d => [d.key, d.sales])), [prevA]);
  const topColor = useMemo(() => {
    const m = {};
    (A?._skus || []).forEach(sk => { if (!sk.design) return; const c = normColor(sk.color); if (!c) return; const g = m[sk.design] || (m[sk.design] = { tot: 0, by: {} }); const q = Number(sk.qty) || 0; g.tot += q; g.by[c] = (g.by[c] || 0) + q; });
    const out = {};
    Object.entries(m).forEach(([d, g]) => { let best = null; Object.entries(g.by).forEach(([c, q]) => { if (!best || q > best.q) best = { c, q }; }); if (best && g.tot) out[d] = { color: best.c, share: best.q / g.tot }; });
    return out;
  }, [A]);
  if (!A) return null;
  const idx80 = par.findIndex(x => x.cumPct >= 0.8);
  const n80 = idx80 < 0 ? par.length : idx80 + 1;
  const maxSales = par[0]?.sales || 1;
  const shown = showAll ? par : par.slice(0, 10);
  const hasMore = par.length > 10;

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-stretch">
      {/* ---------- ลายขายดี ---------- */}
      <Card className="p-[22px] min-w-0">
        <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <CardTitle className="m-0 text-base font-semibold">ลายขายดี</CardTitle>
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>
              {par.length ? <><b style={{ color: 'var(--accent)', fontSize: 15, fontWeight: 700 }}>{n80}</b> ลาย ทำ <b style={{ color: 'var(--ink-2)' }}>80%</b> ของยอด · จากทั้งหมด {N(par.length)} ลาย · กดลาย/สี = กรองทั้งหน้า</> : 'ยังไม่มีข้อมูลลายในช่วงนี้'}
            </div>
          </div>
          {cmp && prevA && <span className="cap" style={{ color: 'var(--ink-4)' }}>▲▼ = เทียบ {prevLabel}</span>}
        </div>
        {par.length > 0 && (
          <CardTable className="[&_td]:py-[7px]"><Table>
            <TableHeader><TableRow>
              <TableHead style={{ width: 28 }}>#</TableHead>
              <TableHead>ลาย</TableHead>
              <TableHead>ยอดขาย</TableHead>
              <TableHead style={{ textAlign: 'right' }}>ตัว</TableHead>
              <TableHead style={{ textAlign: 'right' }} title="สัดส่วนยอดสะสมจากอันดับ 1 ถึงแถวนี้">สะสม</TableHead>
              {cmp && prevA && <TableHead style={{ textAlign: 'right' }}>vs ช่วงก่อน</TableHead>}
              <TableHead>สีขายดี</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {shown.map((d, i) => {
                const inTop = i < n80;
                const tc = topColor[d.key];
                const dl = cmp && prevA ? fmtDelta(d.sales, prevMap.get(d.key) || 0) : null;
                return (
                  <TableRow key={d.key} className={i === n80 && i > 0 ? 'border-t-2 border-dashed border-t-[var(--accent)]' : undefined} style={{ opacity: inTop ? 1 : 0.62 }} title={i === n80 ? 'ใต้เส้นนี้ = อีก 20% ของยอด' : undefined}>
                    <TableCell className="num" style={{ color: 'var(--ink-4)', fontWeight: 700 }}>{i + 1}</TableCell>
                    <TableCell className="cell-title" style={{ cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} onClick={() => toggleFilter('design', d.key)} title={`กรองลาย ${d.key}`}>{d.key}</TableCell>
                    <TableCell style={{ minWidth: 180 }}>
                      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                        <span style={{ flex: 1, height: 8, background: 'var(--surface-2)', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}><span style={{ display: 'block', width: `${Math.max(2, d.sales / maxSales * 100)}%`, height: '100%', background: inTop ? 'var(--accent)' : 'var(--ink-4)', borderRadius: 4 }} /></span>
                        <span className="num" style={{ fontWeight: 700, minWidth: 74, textAlign: 'right' }}>{baht(d.sales)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="num" style={{ textAlign: 'right' }}>{N(d.qty)}</TableCell>
                    <TableCell className="num" style={{ textAlign: 'right', color: 'var(--ink-3)' }}>{Math.round(d.cumPct * 100)}%</TableCell>
                    {dl && <TableCell className="num" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: dl.tone, fontWeight: dl.dim ? 500 : 700, fontSize: dl.dim ? 11 : undefined }}>{dl.up != null && <Icon name={dl.up ? 'up' : 'down'} size={12} />}{dl.txt}</span>
                    </TableCell>}
                    <TableCell>
                      {tc ? <span className="row cap" style={{ gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => toggleFilter('color', tc.color)} title={`กรองสี ${tc.color}`}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOR_HEX[tc.color] || 'var(--ink-4)', border: '1px solid var(--line)', flex: 'none' }} />
                        <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{tc.color}</span>
                        <span style={{ color: 'var(--ink-4)' }}>{Math.round(tc.share * 100)}%</span>
                      </span> : <span className="cap" style={{ color: 'var(--ink-4)' }}>—</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table></CardTable>
        )}
        {hasMore && (
          <button type="button" onClick={() => setShowAll(v => !v)} className="cap mt-2 text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }}>
            {showAll ? 'ย่อเหลือ 10 ลาย' : `ดูทั้งหมด ${N(par.length)} ลาย`}
          </button>
        )}
      </Card>

      {/* ---------- สัดส่วน ---------- */}
      <Card className="p-[22px] min-w-0" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
        <CardTitle className="m-0 text-base font-semibold">สัดส่วน <span className="dim">· ช่วงที่เลือก</span></CardTitle>
        <SplitBar title="ประเภทงาน · ตามยอดขาย" items={A.byJobType} valKey="sales" fmt={baht} dim="job_type" onPick={toggleFilter} />
        <SplitBar title="หมวดสินค้า · ตามจำนวนตัว" items={A.byType} valKey="qty" fmt={N} unit="ตัว" dim="type" onPick={toggleFilter} />
        <SplitBar title="สีขายดี · ตามจำนวนตัว" items={A.byColor} valKey="qty" fmt={N} unit="ตัว" dim="color" onPick={toggleFilter} colors={COLOR_HEX} />
        <SplitBar title="ไซซ์ขายดี · ตามจำนวนตัว" items={A.bySize} valKey="qty" fmt={N} unit="ตัว" dim="size" onPick={toggleFilter} />
      </Card>
    </div>
  );
}

// ===== แท็บ "ภาพรวม" ส่วนล่าง — ช่องทางการขาย (heatmap + ตาราง) =====
export function OverviewChannels({ ctx }) {
  const { A, prevA, orders, eff, gran, range, toggleFilter } = ctx;
  return (<>
        <SectionHead title="ช่องทางการขาย" sub="matrix ช่องทาง × เวลา + ตารางสรุป" />
        <Card className="p-[22px]">
          <CardTitle className="m-0 text-base font-semibold mb-[12px]">ช่องทาง × {gran === 'day' ? 'วัน' : gran === 'week' ? 'สัปดาห์' : gran === 'month' ? 'เดือน' : 'ไตรมาส'} (ยอดขาย)</CardTitle>
          <ChannelHeatmap orders={orders} eff={eff} gran={gran} range={range} channels={A.byChannel.map(c => c.key)} />
          <CardTable style={{ marginTop: 14 }}><Table>
            <TableHeader><TableRow><TableHead>ช่องทาง</TableHead><TableHead style={{ textAlign: 'right' }}>ยอดขาย</TableHead><TableHead style={{ textAlign: 'right' }}>ออเดอร์</TableHead><TableHead style={{ textAlign: 'right' }}>ตัว</TableHead><TableHead style={{ textAlign: 'right' }}>AOV</TableHead><TableHead style={{ textAlign: 'right' }}>%share</TableHead>{prevA && <TableHead style={{ textAlign: 'right' }}>%Δ</TableHead>}</TableRow></TableHeader>
            <TableBody>{A.byChannel.map(c => { const mv = prevA ? movers(A.byChannel, prevA.byChannel, 'sales').find(m => m.key === c.key) : null; return (
              <TableRow key={c.key} onClick={() => toggleFilter('channel', c.key)} style={{ cursor: 'pointer' }}>
                <TableCell className="cell-title"><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: channelColor(c.key), marginRight: 7 }} />{c.key}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{baht(c.sales)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.orders)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{N(c.qty)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{baht(c.aov)}</TableCell>
                <TableCell className="num" style={{ textAlign: 'right' }}>{Math.round(c.share * 100)}%</TableCell>
                {prevA && <TableCell className="num" style={{ textAlign: 'right', color: mv && mv.d >= 0 ? 'var(--good)' : 'var(--bad)' }}>{mv ? (mv.d >= 0 ? '+' : '') + Math.round(mv.d * 100) + '%' : '—'}</TableCell>}
              </TableRow>); })}</TableBody>
          </Table></CardTable>
        </Card>
  </>);
}

// ===== แท็บ "สินค้า & พื้นที่" ส่วนบน — เมทริกซ์ สี × ไซซ์ แบบคอมแพกต์ (รื้อใหม่ 22 ส.ค.) =====
// ยุบ ไซซ์ขายดี/สียอดนิยม (2 การ์ดเดิม) เข้าขอบเมทริกซ์: แถบรวมต่อไซซ์ด้านบน · รวมต่อสีด้านขวา · ช่อง 34px · สี top 8 + อื่นๆ
export function VariantTab({ ctx }) {
  const { A, f, toggleFilter } = ctx;
  return (
    <Card className="p-[22px]">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <CardTitle className="m-0 text-base font-semibold">สี × ไซซ์ <span className="dim">· จำนวนตัว{f.design.length === 1 ? ` · เฉพาะลาย ${f.design[0]}` : f.design.length > 1 ? ` · ${f.design.length} ลายที่กรอง` : ''}</span></CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>ใช้วางแผนผลิต/สต็อก — ช่องเข้ม = ขายดี · แถบบน = รวมต่อไซซ์ · แถบขวา = รวมต่อสี · คลิกหัวไซซ์/ชื่อสี = กรองทั้งหน้า{f.design.length ? '' : ' · เลือกลายจาก "ลายขายดี" ในแท็บภาพรวม แล้วตารางนี้จะเป็นของลายนั้น'}</div>
        </div>
      </div>
      <ColorSizeMatrix skus={A._skus} onFilter={toggleFilter} />
    </Card>
  );
}

function ColorSizeMatrix({ skus, onFilter }) {
  const { rows, cols, cell, colTot, rowTot, max, colMax, rowMax, grand } = useMemo(() => {
    const colorQty = {}, sizeQty = {}, m = {}; let grand = 0;
    (skus || []).forEach(s => { const c = normColor(s.color), z = normSize(s.size); if (!c || !z || c === 'ไม่ระบุ') return; const q = Number(s.qty) || 0; colorQty[c] = (colorQty[c] || 0) + q; sizeQty[z] = (sizeQty[z] || 0) + q; (m[c] = m[c] || {})[z] = (m[c]?.[z] || 0) + q; grand += q; });
    const allColors = Object.entries(colorQty).sort((a, b) => b[1] - a[1]);
    const top = allColors.slice(0, 8).map(([c]) => c), rest = allColors.slice(8).map(([c]) => c);
    const cols = Object.keys(sizeQty).filter(z => sizeQty[z] > 0 && z !== 'ไม่ระบุ').sort((a, b) => sizeRank(a) - sizeRank(b));
    const rows = [...top]; if (rest.length) rows.push('__rest');
    const cell = (r, z) => r === '__rest' ? rest.reduce((a, c) => a + (m[c]?.[z] || 0), 0) : (m[r]?.[z] || 0);
    const rowTot = (r) => r === '__rest' ? rest.reduce((a, c) => a + (colorQty[c] || 0), 0) : (colorQty[r] || 0);
    const colTot = (z) => sizeQty[z] || 0;
    let max = 1; rows.forEach(r => cols.forEach(z => { max = Math.max(max, cell(r, z)); }));
    return { rows, cols, cell, colTot, rowTot, max, colMax: Math.max(1, ...cols.map(colTot)), rowMax: Math.max(1, ...rows.map(rowTot)), grand };
  }, [skus]);
  if (!rows.length || !cols.length) return <div className="cap" style={{ color: 'var(--ink-4)', padding: 16, textAlign: 'center' }}>ไม่มีข้อมูลสี/ไซซ์ในช่วงนี้</div>;
  const lbl = (r) => r === '__rest' ? 'อื่นๆ' : r;
  return (
    <div className="overflow-x-auto">
      <div style={{ display: 'grid', gridTemplateColumns: `92px repeat(${cols.length}, minmax(44px, 1fr)) 110px`, gap: 3, alignItems: 'center', minWidth: 92 + cols.length * 46 + 110 }}>
        {/* แถวบน: แถบรวมต่อไซซ์ */}
        <div />
        {cols.map(z => <div key={'t' + z} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }} title={`${z}: ${N(colTot(z))} ตัว · ${grand ? Math.round(colTot(z) / grand * 100) : 0}%`}>
          <span className="num cap" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{N(colTot(z))}</span>
          <span style={{ width: '70%', height: 28, display: 'flex', alignItems: 'flex-end' }}><span style={{ width: '100%', height: `${Math.max(6, colTot(z) / colMax * 100)}%`, background: 'var(--accent)', opacity: .75, borderRadius: 3 }} /></span>
        </div>)}
        <div className="cap" style={{ color: 'var(--ink-4)', textAlign: 'right', paddingRight: 4 }}>รวมสี</div>
        {/* หัวไซซ์ */}
        <div className="cap" style={{ color: 'var(--ink-4)' }}>สี / ไซซ์</div>
        {cols.map(z => <button type="button" key={z} onClick={() => onFilter?.('size', z)} title={`กรองไซซ์ ${z} · ${N(colTot(z))} ตัว`} className="cap hover:underline" style={{ fontWeight: 700, color: 'var(--ink-2)', width: '100%', textAlign: 'center' }}>{z}</button>)}
        <div />
        {/* แถวสี */}
        {rows.map(r => (
          <Fragment key={r}>
            <button type="button" onClick={r === '__rest' ? undefined : () => onFilter?.('color', r)} disabled={r === '__rest'} title={r === '__rest' ? 'สีอื่นๆ รวมกัน' : `กรองสี ${r}`} className={'row' + (r === '__rest' ? '' : ' hover:underline')} style={{ gap: 6, textAlign: 'left', fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: COLOR_HEX[r] || 'var(--ink-4)', border: '1px solid var(--line)', flex: 'none' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lbl(r)}</span>
            </button>
            {cols.map(z => { const v = cell(r, z); const a = v / max; return (
              <div key={z} title={`${lbl(r)} · ${z}: ${N(v)} ตัว · ${rowTot(r) ? Math.round(v / rowTot(r) * 100) : 0}% ของสี · ${colTot(z) ? Math.round(v / colTot(z) * 100) : 0}% ของไซซ์`}
                className="num" style={{ height: 34, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: a > 0.55 ? 700 : 500, background: v ? `color-mix(in srgb, var(--accent) ${Math.round(10 + a * 80)}%, var(--surface))` : 'var(--surface-2)', color: a > 0.55 ? '#fff' : v ? 'var(--ink)' : 'var(--ink-4)' }}>{v || '·'}</div>
            ); })}
            <div className="row" style={{ gap: 6, alignItems: 'center' }} title={`${lbl(r)}: ${N(rowTot(r))} ตัว · ${grand ? Math.round(rowTot(r) / grand * 100) : 0}%`}>
              <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${rowTot(r) / rowMax * 100}%`, height: '100%', background: COLOR_HEX[r] || 'var(--ink-4)', borderRadius: 4 }} /></span>
              <span className="num cap" style={{ flex: '0 0 44px', textAlign: 'right', fontWeight: 600 }}>{N(rowTot(r))}</span>
            </div>
          </Fragment>
        ))}
      </div>
      <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8 }}>รวม {N(grand)} ตัว · แสดงสี 8 อันดับแรก ที่เหลือรวมเป็น "อื่นๆ" · ไซซ์เฉพาะที่มีขาย</div>
    </div>
  );
}

// ===== แท็บ "ลูกค้า & CRM" — รื้อรอบ 2 (22 ส.ค.) บล็อกกลางจาก crmBlocks.jsx · ใช้ร่วมกับหน้าภาพรวม CRM =====
// สโคป = ช่วงที่เลือก + ตัวกรองหน้า · HERO (ฐานลูกค้า + วงจรชีวิต | เกจซื้อซ้ำ) → การ์ดคนควรติดต่อ → กราฟใหม่/เก่า | ช่องทาง → RFM ไทล์ → แถบทีม CRM → รายชื่อ
export function CustomerTab({ ctx }) {
  const { A, prevA, cmp, curLabel, prevLabel, range, prevRange, gran, crmNotes, crmTargets, crmTeam, mergedTable, prevTable, mt, custInsight, toggleFilter, setDayPay, setCustDetail } = ctx;
  const [tierSel, setTierSel] = useState('all');
  const [stageSel, setStageSel] = useState('all');
  // คลิกขั้นวงจร/ระดับ RFM ด้านบน → กรองรายชื่อ + เลื่อนลงไปให้เห็นผลทันที (เดิมตารางอยู่ล่างสุด คนกดแล้วนึกว่าไม่มีอะไรเกิดขึ้น)
  const toList = () => setTimeout(() => document.getElementById('cust-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  const pickStage = (k) => { setStageSel(k); if (k !== 'all') toList(); };
  const pickTier = (k) => { setTierSel(k); if (k !== 'all') toList(); };
  const cur = useMemo(() => customerStats(A._ords, range.to), [A, range.to]);
  const prev = useMemo(() => (cmp && prevA && prevRange ? customerStats(prevA._ords, prevRange.to) : null), [cmp, prevA, prevRange]);
  const bks = enumerateBuckets(range.from, range.to, gran);
  const prevBks = cmp && prevRange ? enumerateBuckets(prevRange.from, prevRange.to, gran) : [];
  // ทีม CRM (D8): ยอด LINE+โทร ของคนที่มีเป้า CRM — ตัวเลขเดียวกับแถว CRM ในตารางช่องทาง
  const crmRow = mergedTable?.crmRow, prevCrmRow = prevTable?.crmRow;
  const crmOrds = (A._ords || []).filter(o => crmTeam?.has?.((o.salesperson || '').trim()) && (o.channel === 'LINE' || o.channel === 'Phone') && String(o.status || '').toLowerCase() !== 'cancelled');
  const lineSales = crmOrds.filter(o => o.channel === 'LINE').reduce((a, o) => a + (Number(o.sales) || 0), 0);
  const phoneSales = crmOrds.filter(o => o.channel === 'Phone').reduce((a, o) => a + (Number(o.sales) || 0), 0);
  const crmTarget = (crmTargets || []).reduce((a, t) => a + (Number(t.sales_target) || 0), 0);
  const activity = useMemo(() => crmNotesSummary((crmNotes || []).filter(n => !crmTeam?.size || crmTeam.has((n.salesperson || '').trim()))), [crmNotes, crmTeam]);
  const sameMonth = mt?.has && range.from && range.to && range.from.slice(0, 7) === range.to.slice(0, 7) && mt.ym === range.from.slice(0, 7);
  return (<>
    <CustomerHero cur={cur} prev={prev} cmp={cmp} prevLabel={prevLabel} label={curLabel} stageSel={stageSel} onStage={pickStage} />
    <ContactCards rows={cur.rows} phones={cur.phones} onPick={setCustDetail} />
    <div className="crm-split">
      <NewOldDailyChart ords={A._ords} prevOrds={prevA?._ords || []} bks={bks} prevBks={prevBks} gran={gran} cmp={cmp} curLabel={curLabel} prevLabel={prevLabel} onDayClick={setDayPay} />
      <ChannelNewOldRows byChannel={custInsight?.byChannel || []} onPick={toggleFilter} />
    </div>
    <RfmTiles summary={cur.summary} sel={tierSel} onPick={pickTier} />
    <CrmTeamStrip crmSales={crmRow?.sales || 0} prevCrmSales={prevCrmRow?.sales || 0} lineSales={lineSales} phoneSales={phoneSales} crmOrders={crmRow?.orders || 0}
      target={sameMonth ? crmTarget : 0} passed={sameMonth ? mt.passed : 0} dim={sameMonth ? mt.dim : 30} isCur={!!(sameMonth && mt.isCur)} activity={activity} cmp={cmp} prevLabel={prevLabel}
      team={crmTeam?.size ? [...crmTeam] : []} />
    <div id="cust-list" style={{ scrollMarginTop: 70 }}>
      <CustomerTable rows={cur.rows} phones={cur.phones} tierSel={tierSel} onTierSel={setTierSel} stageSel={stageSel} onStageSel={setStageSel} onPick={setCustDetail} sub={`${curLabel} · คลิกชื่อดูออเดอร์ทั้งหมดของลูกค้า`} />
    </div>
  </>);
}

// ===== แท็บ "คนทัก & ปิดการขาย" (funnel) — รื้อใหม่ 22 ส.ค. =====
// สูตรเดียวกับทั้งหน้า: ปิด = ออเดอร์ช่องแชท (isChatOrder) ของเซลล์ที่มีข้อมูลคนทัก ÷ คนทัก (เดิมแท็บนี้นับออเดอร์ทุกช่อง → 18% vs 17% ไม่ตรง)
// ใช้ข้อมูลที่รวมมา: ค่าแอดต่อช่องทาง → CPI · เวลาตอบแชท · ยอดเงินจากคนทัก · เดือนก่อน (▲▼/เส้นประ) · วันที่เซลล์กรอกครบ · แพตเทิร์นวันในสัปดาห์
const WD_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
const closeTone = (p) => (p == null ? 'var(--ink-4)' : p >= 15 ? 'var(--good)' : p >= 8 ? 'var(--warn)' : 'var(--bad)');
/* สถิติคนทักของช่วง — ใช้ funnelCloseStats (สูตรกลาง lib/funnelClose.js) ที่หัวรายงานขายใช้ตัวเดียวกัน
   เดิมเขียนเองที่นี่ แล้ว (1) ตัวส่วนไม่กรองช่องทางทั้งที่ตัวเศษกรอง (2) ไม่ trim ชื่อเซลล์
   → กดชิป Facebook แล้วหัวการ์ดกับแท็บนี้ขึ้น %ปิด คนละค่าในจอเดียวกัน */
const funnelSummary = (fr, ords, chSet) => funnelCloseStats(fr, ords, chSet);

export function FunnelTab({ ctx }) {
  const { A, prevA, f, funnel, range, prevRange, gran, cmp, curLabel, prevLabel, mergedTable, manualAgg, toggleFilter, setDayPay } = ctx;
  const inR = (d, r) => r && (!r.from || d >= r.from) && (!r.to || d <= r.to);
  const spOk = (sp) => !f.salesperson.length || f.salesperson.includes(sp);
  const fr = (funnel || []).filter(r => inR(r.date, range) && spOk(r.salesperson));
  if (!(funnel || []).length) return <Card className="p-9 text-center" style={{ color: 'var(--ink-4)' }}>ยังไม่มีข้อมูลคนทัก — ให้เซลล์กรอกผ่านปุ่ม <b>คนทัก</b> (มุมขวาล่าง) ในหน้า <b>ประสิทธิภาพเซลล์</b> ก่อน</Card>;
  if (!fr.length) return <Card className="p-9 text-center" style={{ color: 'var(--ink-4)' }}>ช่วงนี้ยังไม่มีข้อมูลคนทัก{f.salesperson.length ? ' ของเซลล์ที่กรอง' : ''} — เปลี่ยนช่วงเวลา หรือให้เซลล์กรอกผ่านปุ่ม <b>คนทัก</b> ในหน้าประสิทธิภาพเซลล์</Card>;

  // chSet ต้องเป็นชุดเดียวกับที่กรอง A._ords มาแล้ว ไม่งั้นเศษกับส่วนคนละฐาน
  const chSet = f.channel.length ? new Set(f.channel) : null;
  const cur = funnelSummary(fr, A._ords, chSet);
  const frPrev = (cmp && prevRange) ? (funnel || []).filter(r => inR(r.date, prevRange) && spOk(r.salesperson)) : [];
  const prev = (cmp && prevRange && frPrev.length) ? funnelSummary(frPrev, prevA?._ords || [], chSet) : null;
  const adTotal = Object.values(manualAgg?.ad || {}).reduce((a, v) => a + (Number(v) || 0), 0);
  const cpi = adTotal > 0 && cur.leads > 0 ? adTotal / cur.leads : null;
  const perLead = cur.leads > 0 ? cur.sales / cur.leads : null;
  const newPct = (cur.n + cur.o) > 0 ? cur.n / (cur.n + cur.o) * 100 : null;
  const prevNewPct = prev && (prev.n + prev.o) > 0 ? prev.n / (prev.n + prev.o) * 100 : null;
  // สูตรส่วนต่าง = lib/deltaChip.js ที่เดียว
  const dPct = (c, p, goodUp = true) => { const d = deltaPct(c, p, { goodUp }); return d && { ...d, title: `${prevLabel}: ${N(Math.round(p))}` }; };
  // clamp ±100 pt — เหมือน dPt ในหน้ารายงานขาย (ตัวชี้วัด % ส่วนต่างเกิน 100 pt ไม่มีความหมาย)
  const dPt = (c, p, goodUp = true) => (c != null && p != null ? (() => {
    const raw = Math.round(c - p); const d = Math.max(-100, Math.min(100, raw)); const over = raw !== d;
    return { txt: (d >= 0 ? '+' : '−') + Math.abs(d) + ' pt' + (over ? '+' : ''), dir: d >= 0 ? 1 : -1, good: goodUp ? d >= 0 : d <= 0, title: `${prevLabel}: ${Math.round(p)}%${over ? ` (ส่วนต่างจริง ${raw} pt)` : ''}` };
  })() : null);

  // รายวัน: แท่ง = ทักใหม่/เก่า(/ไม่ระบุ) · เส้น = ปิดได้ · เส้นประ = คนทักช่วงก่อน วันเดียวกัน
  const bks = enumerateBuckets(range.from, range.to, gran);
  // กราฟรายวันก็ต้องกรองช่องทาง ไม่งั้นผลรวมแท่งไม่เท่ากับ KPI คนทักข้างบน
  const byB = {}; fr.forEach(r => { const b = bucketKey(r.date, gran); const x = newOldOfRow(r, chSet); const g = byB[b] || (byB[b] = { n: 0, o: 0, u: 0 }); g.n += x.new; g.o += x.old; g.u += x.unknown; });
  const closeByB = {}; cur.chat.forEach(o => { const b = bucketKey(o.order_date, gran); closeByB[b] = (closeByB[b] || 0) + 1; });
  const hasU = bks.some(b => (byB[b]?.u || 0) > 0);
  const datasets = [{ label: 'ทักใหม่', data: bks.map(b => byB[b]?.n || 0), color: 'var(--info)' }, { label: 'ทักเก่า', data: bks.map(b => byB[b]?.o || 0), color: 'var(--good)' }, ...(hasU ? [{ label: 'ไม่ระบุ', data: bks.map(b => byB[b]?.u || 0), color: 'var(--ink-4)' }] : [])];
  const closes = bks.map(b => closeByB[b] || 0);
  const labels = bks.map((b, i) => gran === 'day' ? ((i === 0 || b.endsWith('-01')) ? bucketLabel(b, 'day') : String(Number(b.slice(8, 10)))) : bucketLabel(b, gran).replace(/ \(.*/, ''));
  const tipLabels = bks.map(b => bucketLabel(b, gran));
  const weekend = gran === 'day' ? bks.map(b => { const w = new Date(b + 'T00:00:00').getDay(); return w === 0 || w === 6; }) : undefined;
  let prevSeries = null;
  if (prev) { const pB = enumerateBuckets(prevRange.from, prevRange.to, gran); const pl = {}; frPrev.forEach(r => { const b = bucketKey(r.date, gran); pl[b] = (pl[b] || 0) + leadsOfRow(r, chSet); }); prevSeries = bks.map((_, i) => (pB[i] ? (pl[pB[i]] || 0) : null)); }
  let best = null; bks.forEach((b, i) => { const t = (byB[b]?.n || 0) + (byB[b]?.o || 0) + (byB[b]?.u || 0); if (t > (best?.leads || 0)) best = { key: b, leads: t, closes: closes[i], i }; });
  const unitWord = gran === 'day' ? 'วัน' : gran === 'week' ? 'สัปดาห์' : 'เดือน';

  // ต่อช่องทาง: จาก channelTable (leads/closeRate/over/ad/sales ต่อช่อง) + ใหม่/เก่าต่อแพลตฟอร์มจาก funnelBreakdown
  const platNO = {}; fr.forEach(r => { for (const [pf, v] of Object.entries(funnelBreakdown(r))) { const g = platNO[pf] || (platNO[pf] = { n: 0, o: 0 }); g.n += Number(v.new) || 0; g.o += Number(v.old) || 0; } });
  const chRows = (mergedTable?.rows || []).filter(r => r.leads > 0 || r.over || (r.chatOrders || 0) > 0).sort((a, b) => (b.leads || 0) - (a.leads || 0));
  const maxLeads = Math.max(1, ...chRows.map(r => r.leads || 0));
  const chatSalesByCh = {}; cur.chat.forEach(o => { chatSalesByCh[o.channel] = (chatSalesByCh[o.channel] || 0) + (Number(o.sales) || 0); });

  // ต่อเซลล์: ทัก (ใหม่/เก่า) · ปิด (ช่องแชท) · %ปิด · ยอด · กรอกครบกี่วัน · ▲▼ เทียบช่วงก่อน
  const today = todayISO();
  const daysInRange = bks.filter(b => gran !== 'day' || b <= today).length || 1;
  /* ⚠️ ตัวส่วนรายเซลล์ต้องกรองช่องทางเหมือน KPI ข้างบน (ตัวเศษ cur.chat กรองมาแล้ว)
     เดิมใช้ funnelTotal/funnelNewOld ที่ไม่สน chSet → กดชิป Facebook แล้ว KPI ขึ้น 15%
     แต่ตารางรายเซลล์ในแท็บเดียวกันขึ้น 10% (ตัวส่วนยังนับ LINE อยู่) */
  /* ⚠️ คีย์ต้อง trim ให้ตรงกับ funnelCloseStats (ซึ่งคัด cur.chat ด้วย nmSeller)
     ไม่งั้นแถว funnel ที่ชื่อมีช่องว่างหัว/ท้าย ('ฟ้า ') จะได้ leads = N แต่ "ปิด 0 · 0%"
     ขณะที่ KPI ข้างบนถูกต้อง — เคสเดิมที่ funnelClose.js อ้างว่าแก้แล้ว */
  const bySp = {}; fr.forEach(r => { const k = nmSeller(r.salesperson); const g = bySp[k] || (bySp[k] = { leads: 0, n: 0, o: 0, days: new Set() }); g.leads += leadsOfRow(r, chSet); const x = newOldOfRow(r, chSet); g.n += x.new; g.o += x.old; g.days.add(r.date); });
  const prevBySp = {}; frPrev.forEach(r => { const k = nmSeller(r.salesperson); const g = prevBySp[k] || (prevBySp[k] = { leads: 0 }); g.leads += leadsOfRow(r, chSet); });
  const spRows = Object.entries(bySp).map(([sp, g]) => {
    const mine = cur.chat.filter(o => nmSeller(o.salesperson) === sp);
    const sales = mine.reduce((a, o) => a + (Number(o.sales) || 0), 0);
    const pct = g.leads ? mine.length / g.leads * 100 : null;
    const pOrd = prev ? prev.chat.filter(o => nmSeller(o.salesperson) === sp).length : 0;
    const pLeads = prevBySp[sp]?.leads || 0;
    const pPct = pLeads ? pOrd / pLeads * 100 : null;
    return { sp, leads: g.leads, n: g.n, o: g.o, orders: mine.length, sales, pct, over: g.leads > 0 && mine.length > g.leads, filled: gran === 'day' ? g.days.size : null, delta: dPt(pct, pPct) };
  }).sort((a, b) => b.leads - a.leads);
  const maxSpLeads = Math.max(1, ...spRows.map(r => r.leads));

  // วันในสัปดาห์ (gran=day): เฉลี่ยคนทัก/วัน + %ปิด ต่อวัน จ–อา
  const wd = Array.from({ length: 7 }, () => ({ leads: 0, closes: 0, days: 0 }));
  if (gran === 'day') { bks.forEach((b, i) => { const w = new Date(b + 'T00:00:00').getDay(); const t = (byB[b]?.n || 0) + (byB[b]?.o || 0) + (byB[b]?.u || 0); wd[w].leads += t; wd[w].closes += closes[i]; wd[w].days += 1; }); }
  const wdOrder = [1, 2, 3, 4, 5, 6, 0];
  const wdMax = Math.max(1, ...wd.map(x => (x.days ? x.leads / x.days : 0)));
  const bestWd = bestWeekday(wd, wdOrder);   // ตรรกะ + เทสอยู่ที่ lib/uiLogic.js (เคสไม่มีวันจันทร์ในช่วง)

  return (<>
    {/* ===== KPI 8 ใบ — แบบเดียวกับตัวชี้วัดหลัก · ▲▼ เทียบช่วงก่อน ===== */}
    <div className="kpi8">
      <KpiCard index={0} label="คนทัก" tip="จำนวนคนที่ทักเข้ามาในช่วง (จากที่เซลล์กรอก) · แถบ = ใหม่ / เก่า" value={N(cur.leads)} tone="var(--info)" delta={prev ? dPct(cur.leads, prev.leads) : null}
        sub={`ใหม่ ${N(cur.n)} · เก่า ${N(cur.o)}${cur.u ? ` · ไม่ระบุ ${N(cur.u)}` : ''}`}>
        {cur.leads > 0 && <div style={{ display: 'flex', height: 7, borderRadius: 'var(--r-pill)', overflow: 'hidden', background: 'var(--surface-3)' }} role="img" aria-label={`ใหม่ ${cur.n} เก่า ${cur.o}`}><span style={{ width: `${cur.n / cur.leads * 100}%`, background: 'var(--info)' }} /><span style={{ width: `${cur.o / cur.leads * 100}%`, background: 'var(--good)' }} /></div>}
      </KpiCard>
      <KpiCard index={1} label="ทักใหม่" tip="สัดส่วนคนทักที่เป็นลูกค้าใหม่ (ไม่นับที่ไม่ระบุ)" value={newPct == null ? '—' : `${Math.round(newPct)}%`} tone="var(--info)" delta={dPt(newPct, prevNewPct)} sub={newPct == null ? 'ยังไม่ได้แยกใหม่/เก่า' : `${N(cur.n)} คน จาก ${N(cur.n + cur.o)} ที่ระบุ`} />
      <KpiCard index={2} label="ปิดได้" tip="ออเดอร์ช่องแชท (FB/LINE/IG/TikTok/โทร) ของเซลล์ที่มีข้อมูลคนทัก · ตัดมาร์เก็ตเพลส" value={N(cur.orders)} valueColor="var(--accent)" delta={prev ? dPct(cur.orders, prev.orders) : null} sub={`จาก ${N(cur.leads)} คนทัก`} />
      <KpiCard index={3} label="%ปิดการขาย" tip="ปิดได้ ÷ คนทัก · เกณฑ์ดี ≥ 15%" value={cur.over ? '—' : (cur.pct == null ? '—' : `${Math.round(cur.pct)}%`)} valueColor={cur.over ? 'var(--warn)' : closeTone(cur.pct)} tone={cur.over ? 'var(--warn)' : closeTone(cur.pct)}
        delta={!cur.over && prev && !prev.over ? dPt(cur.pct, prev.pct) : null} sub={cur.over ? 'ออเดอร์มากกว่าคนทัก — เซลล์กรอกคนทักไม่ครบ' : 'เกณฑ์ ≥ 15%'}>
        {!cur.over && cur.pct != null && (() => { const scale = 30; const p = Math.min(100, cur.pct / scale * 100); return (
          <div style={{ position: 'relative', height: 7, borderRadius: 'var(--r-pill)', background: 'var(--surface-3)' }} role="img" aria-label={`ปิดการขาย ${Math.round(cur.pct)}% เกณฑ์ 15%`} title="แถบเต็ม = 30% · ขีด = เกณฑ์ 15%">
            <span style={{ position: 'absolute', inset: 0, width: `${p}%`, borderRadius: 'var(--r-pill)', background: closeTone(cur.pct) }} />
            <span style={{ position: 'absolute', left: `${15 / scale * 100}%`, top: -3, width: 2, height: 13, background: 'var(--ink-3)', borderRadius: 1 }} />
          </div>
        ); })()}
      </KpiCard>
      <KpiCard index={4} label="ยอดจากคนทัก" tip="ยอดขายของออเดอร์ช่องแชทที่ปิดได้ในช่วง" value={baht(cur.sales)} valueColor="var(--good)" tone="var(--good)" delta={prev ? dPct(cur.sales, prev.sales) : null} sub={cur.orders ? `เฉลี่ย ${baht(cur.sales / cur.orders)}/ออเดอร์` : '—'} />
      <KpiCard index={5} label="มูลค่าต่อคนทัก" tip="ยอดจากคนทัก ÷ จำนวนคนทัก — ทัก 1 คนได้เงินเท่าไหร่โดยเฉลี่ย" value={perLead == null ? '—' : baht(perLead)} delta={prev && prev.leads ? dPct(perLead || 0, prev.sales / prev.leads) : null} sub="ต่อคนทัก 1 คน" />
      <KpiCard index={6} label="ค่าแอดต่อคนทัก" tip="ค่าแอดรวมที่กรอกในช่วง ÷ คนทัก (CPI) · ยิ่งต่ำยิ่งดี" value={cpi == null ? '—' : baht(cpi)} tone="var(--warn)" valueColor={cpi == null ? undefined : 'var(--ink)'} sub={adTotal > 0 ? `ค่าแอดรวม ${baht(adTotal)}` : 'ยังไม่ได้กรอกค่าแอดในช่วงนี้'} />
      <KpiCard index={7} label="ตอบแชทเฉลี่ย" tip="เวลาตอบแชทเฉลี่ย (นาที) ที่กรอกรายวัน" value={manualAgg?.replyMins != null ? `${manualAgg.replyMins} นาที` : '—'} sub={manualAgg?.replyMins != null ? 'จากที่กรอกรายวัน' : 'ยังไม่ได้กรอก'} />
    </div>

    {/* ===== รายวัน: คนทัก → ปิดได้ ===== */}
    <Card className="p-[22px]">
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <CardTitle className="m-0 text-base font-semibold">คนทัก → ปิดการขาย ราย{unitWord} <span className="dim">· {curLabel}</span></CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>แท่ง = คนทัก ใหม่/เก่า · เส้น = ปิดได้ (แกนขวา){prev ? ` · เส้นประ = คนทัก ${prevLabel} วันเดียวกัน` : ''}{gran === 'day' ? ' · คลิกวันดูออเดอร์ทั้งวัน' : ''}</div>
        </div>
        {best && <div className="row" style={{ gap: 8, alignItems: 'center', padding: '6px 12px', borderRadius: 10, background: 'var(--accent-soft)' }}>
          <Icon name="chat" size={14} style={{ color: 'var(--accent)' }} />
          <span className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>ทักเยอะสุด</span>
          <span className="cap" style={{ color: 'var(--ink)', fontWeight: 700 }}>{bucketLabel(best.key, gran)}</span>
          <span className="num cap" style={{ fontWeight: 700, color: 'var(--accent)' }}>{N(best.leads)} คน</span>
          <span className="num cap" style={{ color: 'var(--ink-4)' }}>· ปิด {N(best.closes)}</span>
        </div>}
      </div>
      <DailySalesChart labels={labels} tipLabels={tipLabels} datasets={datasets} orders={closes} weekend={weekend} prevValues={prevSeries} prevLabel={`คนทัก ${prevLabel}`}
        fmt={N} axisFmt={(v) => N(v)} ordersLabel="ปิดได้" emptyText="ไม่มีคนทัก" clickText="คลิกเพื่อดูออเดอร์ทั้งวัน" height={270}
        tipExtra={(row, total) => (total > 0 && row._orders != null ? <div className="mt-1 flex justify-between gap-3"><span className="text-muted-foreground">%ปิดวันนี้</span><span className="font-semibold tabular-nums" style={{ color: closeTone(row._orders / total * 100) }}>{Math.round(row._orders / total * 100)}%</span></div> : null)}
        onBarClick={gran === 'day' ? (i) => { const k = bks[i]; if (k) setDayPay(k); } : undefined} />
      <div className="cap row" style={{ gap: 6, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap', color: 'var(--ink-4)' }}>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--info)' }} /> ทักใหม่</span>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--good)' }} /> ทักเก่า</span>
        {hasU && <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--ink-4)' }} /> ไม่ระบุ</span>}
        <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px solid var(--ink-3)' }} /> ปิดได้/{unitWord} (แกนขวา)</span>
        {prev && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px dashed var(--accent-2)' }} /> คนทัก {prevLabel} วันเดียวกัน</span>}
        {weekend?.some(Boolean) && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 14, height: 10, borderRadius: 2, background: 'rgba(130,140,160,.18)' }} /> เสาร์–อาทิตย์</span>}
      </div>
    </Card>

    {/* ===== ช่องทางคนทัก | ต่อเซลล์ ===== */}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
      <Card className="p-[22px] flex flex-col min-w-0">
        <CardTitle className="m-0 text-base font-semibold mb-[6px]">ช่องทางคนทัก</CardTitle>
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>ทัก → ปิด → %ปิด · CPI = ค่าแอด ÷ คนทัก · กดช่องทางเพื่อกรองทั้งหน้า</div>
        {chRows.length === 0 ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '16px 0', textAlign: 'center' }}>ยังไม่มีคนทักแยกช่องทาง</div> : (
          <div style={{ display: 'grid', gap: 4 }}>
            {chRows.map(r => {
              const tint = channelTint(r.ch); const no = platNO[r.ch]; const cpiCh = r.ad > 0 && r.leads > 0 ? r.ad / r.leads : null; const chSales = chatSalesByCh[r.ch] || 0;
              return (
                <div key={r.ch} role="button" tabIndex={0} onClick={() => toggleFilter('channel', r.ch)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFilter('channel', r.ch); } }} title={`กรองช่องทาง ${r.ch}`}
                  className="rounded-lg px-2 py-1.5 -mx-2 transition-colors cursor-pointer hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                  <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
                    <span className="ch-logo" style={{ width: 30, height: 30, borderRadius: 8, color: tint, background: `color-mix(in srgb, ${tint} 14%, var(--surface))` }}><ChannelLogo name={r.ch} size={16} /></span>
                    <span style={{ flex: '0 0 84px', fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.ch}</span>
                    <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', minWidth: 40 }}><span style={{ display: 'block', width: `${Math.max(1.5, (r.leads || 0) / maxLeads * 100)}%`, height: '100%', background: tint, borderRadius: 4 }} /></span>
                    <span className="num" style={{ flex: '0 0 auto', minWidth: 86, textAlign: 'right', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{r.leads ? <>{N(r.leads)} <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 400 }}>ทัก</span></> : <span className="cap" style={{ color: 'var(--ink-4)' }}>ไม่มีคนทัก</span>}</span>
                    <span className="num cap" style={{ flex: '0 0 110px', textAlign: 'right', whiteSpace: 'nowrap' }}>{/* ⚠️ ต้องโชว์ chatClosed (ตัวเศษของ %ปิด) ไม่ใช่ chatOrders
                        chatOrders = ออเดอร์ช่องแชททั้งหมด · chatClosed = เฉพาะเซลล์ที่กรอกคนทัก
                        เดิมโชว์ chatOrders คู่กับ % ที่คิดจาก chatClosed → "ปิด 12 → 15%" (12/20 = 60%) */}
                      ปิด <b style={{ color: 'var(--ink-2)', fontWeight: 700 }}
                        title={(r.chatOrders || 0) !== (r.chatClosed || 0) ? `ออเดอร์ช่องแชททั้งหมด ${N(r.chatOrders || 0)} — นับเป็นตัวปิด ${N(r.chatClosed || 0)} (เฉพาะเซลล์ที่กรอกคนทัก)` : undefined}
                      >{N(r.chatClosed ?? r.chatOrders ?? 0)}</b> {(r.over || (!r.leads && (r.chatClosed ?? r.chatOrders ?? 0) > 0))
                      ? <span title={r.leads ? 'ออเดอร์ช่องแชทมากกว่าคนทักที่กรอก — เซลล์กรอกคนทักไม่ครบ' : 'มีออเดอร์ช่องนี้แต่ไม่มีใครกรอกคนทัก'} style={{ color: 'var(--warn)', fontWeight: 600 }}><Icon name="alertTriangle" size={11} /> {r.leads ? 'ไม่ครบ' : 'ไม่ได้กรอก'}</span>
                      : r.closeRate != null && <>→ <b style={{ color: closeTone(r.closeRate), fontWeight: 700 }}>{Math.round(r.closeRate)}%</b></>}</span>
                  </div>
                  <div className="cap row" style={{ gap: 10, marginLeft: 40, marginTop: 2, color: 'var(--ink-4)', flexWrap: 'wrap' }}>
                    {no && (no.n + no.o) > 0 && <span style={{ whiteSpace: 'nowrap' }}>ใหม่ <b style={{ color: 'var(--info)', fontWeight: 600 }}>{N(no.n)}</b> · เก่า <b style={{ color: 'var(--good)', fontWeight: 600 }}>{N(no.o)}</b></span>}
                    {chSales > 0 && <span style={{ whiteSpace: 'nowrap' }}>ยอด <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{baht(chSales)}</b></span>}
                    {r.ad > 0 && <span style={{ whiteSpace: 'nowrap' }}>แอด <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{baht(r.ad)}</b>{cpiCh != null && <> · CPI <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{baht(cpiCh)}</b></>}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card className="p-[22px] flex flex-col min-w-0">
        <CardTitle className="m-0 text-base font-semibold mb-[6px]">ต่อเซลล์</CardTitle>
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>ทัก → ปิด → %ปิด (▲▼ เทียบ{prev ? prevLabel : 'ช่วงก่อน'}) · ยอดจากคนทัก{gran === 'day' ? ` · กรอกคนทักครบกี่วันจาก ${daysInRange} วัน` : ''}</div>
        <div style={{ display: 'grid', gap: 4 }}>
          {spRows.map(r => {
            const missing = r.filled != null ? Math.max(0, daysInRange - r.filled) : 0;
            return (
              <div key={r.sp} role="button" tabIndex={0} onClick={() => toggleFilter('salesperson', r.sp)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFilter('salesperson', r.sp); } }} title={`กรองเซลล์ ${r.sp}`}
                className="rounded-lg px-2 py-1.5 -mx-2 transition-colors cursor-pointer hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
                <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <span style={{ flex: '0 0 84px', fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sp}</span>
                  <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', minWidth: 40 }}><span style={{ display: 'block', width: `${Math.max(1.5, r.leads / maxSpLeads * 100)}%`, height: '100%', background: 'var(--info)', borderRadius: 4 }} /></span>
                  <span className="num" style={{ flex: '0 0 auto', minWidth: 86, textAlign: 'right', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{N(r.leads)} <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 400 }}>ทัก</span></span>
                  <span className="num cap" style={{ flex: '0 0 124px', textAlign: 'right', whiteSpace: 'nowrap' }}>ปิด <b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{N(r.orders)}</b> {r.over
                    ? <span title="ออเดอร์มากกว่าคนทักที่กรอก" style={{ color: 'var(--warn)', fontWeight: 600 }}><Icon name="alertTriangle" size={11} /> ไม่ครบ</span>
                    : r.pct != null && <>→ <b style={{ color: closeTone(r.pct), fontWeight: 700 }}>{Math.round(r.pct)}%</b>{r.delta && <span className="kpi-delta" style={{ marginLeft: 4, padding: '0 5px', color: r.delta.good ? 'var(--good)' : 'var(--bad)', background: r.delta.good ? 'var(--good-soft)' : 'var(--bad-soft)' }}>{r.delta.txt}</span>}</>}</span>
                </div>
                <div className="cap row" style={{ gap: 10, marginLeft: 0, marginTop: 2, color: 'var(--ink-4)', flexWrap: 'wrap' }}>
                  {(r.n + r.o) > 0 && <span style={{ whiteSpace: 'nowrap' }}>ใหม่ <b style={{ color: 'var(--info)', fontWeight: 600 }}>{N(r.n)}</b> · เก่า <b style={{ color: 'var(--good)', fontWeight: 600 }}>{N(r.o)}</b></span>}
                  {r.sales > 0 && <span style={{ whiteSpace: 'nowrap' }}>ยอด <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{baht(r.sales)}</b></span>}
                  {r.filled != null && (missing > 0
                    ? <span style={{ whiteSpace: 'nowrap', color: 'var(--warn)', fontWeight: 600 }} title={`มีข้อมูลคนทัก ${r.filled} วัน จาก ${daysInRange} วันในช่วง`}><Icon name="alertTriangle" size={11} /> กรอก {r.filled}/{daysInRange} วัน · ขาด {missing}</span>
                    : <span style={{ whiteSpace: 'nowrap', color: 'var(--good)', fontWeight: 600 }}><Icon name="check" size={11} /> กรอกครบ {r.filled}/{daysInRange} วัน</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>

    {/* ===== วันในสัปดาห์ | เสียงลูกค้า ===== */}
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3 items-start">
      {gran === 'day' && wd.some(x => x.days > 0) && (
        <Card className="p-[22px] min-w-0">
          <CardTitle className="m-0 text-base font-semibold mb-[6px]">คนทักตามวันในสัปดาห์</CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 14 }}>เฉลี่ยคนทัก/วัน และ %ปิด ของแต่ละวัน ในช่วงที่เลือก{bestWd != null ? <> · ทักเยอะสุด <b style={{ color: 'var(--ink-2)' }}>วัน{WD_TH[bestWd]}</b></> : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gap: 6, alignItems: 'end', height: 150 }}>
            {wdOrder.map(w => { const x = wd[w]; const avg = x.days ? x.leads / x.days : 0; const pct = x.leads ? x.closes / x.leads * 100 : null; const we = w === 0 || w === 6; return (
              <div key={w} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }} title={`วัน${WD_TH[w]} · เฉลี่ย ${Math.round(avg)} คน/วัน (${x.days} วัน) · ปิด ${N(x.closes)} · %ปิด ${pct == null ? '—' : Math.round(pct) + '%'}`}>
                <span className="num cap" style={{ fontWeight: 700, color: pct == null ? 'var(--ink-4)' : closeTone(pct) }}>{pct == null ? '—' : Math.round(pct) + '%'}</span>
                <span style={{ width: '100%', maxWidth: 34, height: `${Math.max(4, avg / wdMax * 100)}%`, borderRadius: 4, background: w === bestWd ? 'var(--accent)' : we ? 'var(--ink-4)' : 'var(--info)', opacity: x.days ? 1 : 0.3 }} />
                <span className="num cap" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{Math.round(avg)}</span>
                <span className="cap" style={{ color: we ? 'var(--ink-4)' : 'var(--ink-3)' }}>{WD_TH[w]}</span>
              </div>
            ); })}
          </div>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 8, textAlign: 'center' }}>บน = %ปิดของวันนั้น · แท่ง = เฉลี่ยคนทัก/วัน · ม่วง = วันที่ทักเยอะสุด</div>
        </Card>
      )}
      <div className="min-w-0" style={{ gridColumn: (gran === 'day' && wd.some(x => x.days > 0)) ? undefined : '1 / -1' }}><VoiceFeed funnel={fr} title="เสียงลูกค้าในช่วงนี้" /></div>
    </div>
  </>);
}

// ---------- movers card ----------

// ---------- channel × time heatmap ----------
function ChannelHeatmap({ orders, eff: _eff, gran, range, channels }) {
  // key ตามค่าจริง (range/channels เป็น object/array ใหม่ทุก render ของ parent)
  const rangeKey = JSON.stringify(range);
  const channelsKey = channels.join();
  const data = useMemo(() => {
    const buckets = enumerateBuckets(range.from, range.to, gran);
    const m = {}; channels.forEach(c => m[c] = {});
    orders.forEach(o => { if (o.status === 'cancelled') return; if (o.order_date < range.from || o.order_date > range.to) return; if (!channels.includes(o.channel)) return; const b = bucketKey(o.order_date, gran); m[o.channel][b] = (m[o.channel][b] || 0) + (Number(o.sales) || 0); });
    return { buckets, m };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- memo ตาม rangeKey/channelsKey (ค่าจริง) ไม่ใช่ตัว object/array ที่สร้างใหม่ทุก render
  }, [orders, rangeKey, gran, channelsKey]);
  const cols = data.buckets.map(b => ({ key: b, label: bucketLabel(b, gran).replace(/ \(.*/, '') }));
  return <Heatmap rows={channels.map(c => ({ key: c, label: c }))} cols={cols} cell={(r, c) => data.m[r.key]?.[c.key] || 0} fmt={(v) => v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)} />;
}

