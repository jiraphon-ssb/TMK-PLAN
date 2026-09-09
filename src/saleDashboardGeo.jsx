/* ============================================================
   saleDashboardGeo.jsx — แผงพื้นที่การขาย: ThailandMap (คงเดิม) + GeoPanel (รื้อใหม่ 22 ส.ค. — แผงขวาชั้นเดียว ประเทศ→ภาค→จังหวัด ไม่มีปุ่มสลับ)
   ============================================================ */
import { useState, useMemo } from 'react';
import { N, Icon } from './components.jsx';
import { geoBreakdown, regionBreakdown } from './lib/saleAgg.js';
import { PROVINCES, REGIONS, TH_BBOX } from './lib/provinces.js';
import { TH_PATHS } from './lib/thMapPaths.js';
import { baht } from './lib/saleDashboardHelpers.js';
import { ExportBtn } from './saleDashboardChrome.jsx';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// ---------- แผนที่ไทย choropleth (สีไล่ 5 ขั้น + hover) ----------
const GEO_BUCKETS = [0.16, 0.34, 0.52, 0.72, 0.95]; // opacity ของ var(--accent) แต่ละขั้น
function bucketIdx(v, thr) { let i = 0; for (const t of thr) if (v >= t) i++; return i; }
function ThailandMap({ rows, valOf, thr, sel, hover, onHover, onClick, fmt: _fmt }) {
  const W = 300, H = 500, pad = 12;
  const { latMin, latMax, lngMin, lngMax } = TH_BBOX;
  const px = (lng) => pad + (lng - lngMin) / (lngMax - lngMin) * (W - 2 * pad);
  const py = (lat) => pad + (latMax - lat) / (latMax - latMin) * (H - 2 * pad);
  const byTh = {}; rows.forEach(p => byTh[p.th] = p);
  const dOf = (ring) => 'M' + ring.map(c => `${px(c[0]).toFixed(1)} ${py(c[1]).toFixed(1)}`).join('L') + 'Z';
  const top = [...rows].filter(r => valOf(r) > 0).sort((a, b) => valOf(b) - valOf(a)).slice(0, 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 480, display: 'block', margin: '0 auto' }} role="img" aria-label="แผนที่ระบายสียอดขายตามจังหวัด" onMouseLeave={() => onHover(null)}>
      {Object.entries(TH_PATHS).map(([th, ring]) => {
        const p = byTh[th]; const v = p ? valOf(p) : 0; const on = sel === th || hover === th;
        return <path key={th} d={dOf(ring)} fill={v > 0 ? 'var(--accent)' : 'var(--ink-4)'} fillOpacity={v > 0 ? GEO_BUCKETS[bucketIdx(v, thr)] : 0.06} stroke={on ? 'var(--accent-2)' : 'var(--surface)'} strokeWidth={on ? 2 : 0.5} style={{ cursor: 'pointer', transition: 'fill-opacity .12s' }} onClick={() => onClick(th)} onMouseEnter={() => onHover(th)} />;
      })}
      {top.map(p => <text key={'t' + p.th} x={px(p.lng)} y={py(p.lat)} textAnchor="middle" style={{ fontSize: 8.5, fontWeight: 700, fill: 'var(--ink)', pointerEvents: 'none', paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 2.6 }}>{p.th}</text>)}
    </svg>
  );
}

// ---------- แผงพื้นที่ (รื้อใหม่ 22 ส.ค.): แผนที่ (พระเอก) + แผงขวาชั้นเดียว ประเทศ → ภาค → จังหวัด ----------
// ไม่มีปุ่มสลับตัวชี้วัด (ยอดขายเป็นหลัก · hover/tooltip บอกออเดอร์+ตัว) · ไม่มีชิปภาค (คลิกแถวภาค) · ▲▼ ภาคเทียบช่วงก่อน (prevOrds/prevSkus)
const BarRow = ({ rank, label, value, max, sub, right, on, onClick, onEnter, onLeave, tone = 'var(--accent)' }) => (
  <div onClick={onClick} onMouseEnter={onEnter} onMouseLeave={onLeave} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    className={'rounded-lg px-2 py-1.5 -mx-2 transition-colors' + (onClick ? ' cursor-pointer hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-[var(--accent)]' : '')}
    style={{ background: on ? 'var(--accent-soft)' : undefined }}>
    <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
      {rank != null && <span className="num" style={{ width: 18, textAlign: 'center', color: 'var(--ink-4)', fontWeight: 700, fontSize: 12 }}>{rank}</span>}
      <span style={{ flex: '0 0 104px', fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', minWidth: 30 }}><span style={{ display: 'block', width: `${Math.max(1.5, max ? value / max * 100 : 0)}%`, height: '100%', background: tone, borderRadius: 4 }} /></span>
      {right}
    </div>
    {sub && <div className="cap row" style={{ gap: 10, marginLeft: rank != null ? 28 : 0, marginTop: 2, color: 'var(--ink-4)', flexWrap: 'wrap' }}>{sub}</div>}
  </div>
);
const Delta = ({ cur, prev, label }) => {
  if (!(prev > 0) || cur == null) return null;
  const d = (cur - prev) / prev; const up = d >= 0;
  return <span className="kpi-delta" title={`${label}: ${baht(prev)}`} style={{ padding: '0 5px', color: up ? 'var(--good)' : 'var(--bad)', background: up ? 'var(--good-soft)' : 'var(--bad-soft)' }}>{(up ? '+' : '−') + Math.abs(Math.round(d * 100))}%</span>;
};
const TopList = ({ title, items, valOf, max, dim, onFilter }) => (
  <div style={{ minWidth: 0 }}>
    <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600, marginBottom: 6 }}>{title}</div>
    {items.length ? <div style={{ display: 'grid', gap: 3 }}>{items.map(it => (
      <div key={it.key} role="button" tabIndex={0} onClick={() => onFilter(dim, it.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFilter(dim, it.key); } }} title={`กรอง${dim === 'design' ? 'ลาย' : 'สี'} ${it.key} ทั้งหน้า`} className="row rounded px-1.5 py-0.5 -mx-1.5 cursor-pointer hover:bg-muted/50" style={{ gap: 8, alignItems: 'center' }}>
        <span className="cap" style={{ flex: '0 0 88px', color: 'var(--ink-2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.key}</span>
        <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${max ? valOf(it) / max * 100 : 0}%`, height: '100%', background: 'var(--accent)', opacity: .85, borderRadius: 3 }} /></span>
        <span className="num cap" style={{ flex: '0 0 auto', minWidth: 64, textAlign: 'right' }}>{baht(valOf(it))}</span>
        <span className="num cap" style={{ flex: '0 0 auto', minWidth: 40, textAlign: 'right', color: 'var(--ink-4)' }}>{N(it.qty)} ตัว</span>
      </div>
    ))}</div> : <div className="cap" style={{ color: 'var(--ink-4)' }}>— ไม่มีข้อมูล</div>}
  </div>
);

export function GeoPanel({ ords, skus, prevOrds = [], prevSkus = [], cmp = false, prevLabel = 'ช่วงก่อน', selected = [], onFilter }) {
  const [hover, setHover] = useState(null);
  const [selRegion, setSelRegion] = useState(null);   // รหัสภาค | null
  const [selProv, setSelProv] = useState(null);       // ชื่อจังหวัด | null
  const [showAll, setShowAll] = useState(false);
  const bd = useMemo(() => geoBreakdown(ords, skus), [ords, skus]);
  const rg = useMemo(() => regionBreakdown(bd), [bd]);
  const prevRg = useMemo(() => (cmp && prevOrds.length ? regionBreakdown(geoBreakdown(prevOrds, prevSkus)) : null), [cmp, prevOrds, prevSkus]);
  const prevRegionSales = useMemo(() => Object.fromEntries((prevRg?.regions || []).map(r => [r.code, r.sales])), [prevRg]);
  const provByKey = useMemo(() => new Map(bd.provinces.map(p => [p.key, p])), [bd]);

  const allRows = PROVINCES.map(p => { const b = provByKey.get(p.th); return { ...p, sales: b ? b.sales : 0, orders: b ? b.orders : 0, qty: b ? b.qty : 0 }; });
  const rows = selRegion ? allRows.filter(p => p.region === selRegion) : allRows;
  const valOf = (p) => p.sales;
  const sorted = rows.filter(p => p.sales > 0).sort((a, b) => b.sales - a.sales);
  const total = sorted.reduce((a, p) => a + p.sales, 0);
  const vals = sorted.map(valOf).sort((a, b) => a - b);
  const q = (pp) => vals.length ? vals[Math.floor((vals.length - 1) * pp)] : 0;
  const thr = [q(0.2), q(0.4), q(0.6), q(0.8)];
  const hv = hover ? allRows.find(p => p.th === hover) : null;
  const grand = bd.total.sales || 0;
  const pct = (v) => grand ? Math.round(v / grand * 100) : 0;
  const flattenColors = (designs) => { const m = new Map(); (designs || []).forEach(d => d.colors.forEach(c => { const e = m.get(c.key) || { key: c.key, orders: 0, qty: 0, sales: 0 }; e.orders += c.orders; e.qty += c.qty; e.sales += c.sales; m.set(c.key, e); })); return [...m.values()]; };
  const regionNode = selRegion ? rg.regions.find(r => r.code === selRegion) : null;
  const provNode = selProv ? provByKey.get(selProv) : null;
  const scopeLabel = selProv || (selRegion ? REGIONS[selRegion] : 'ทั้งประเทศ');
  const pick = (th) => { setSelProv(th); const p = PROVINCES.find(x => x.th === th); if (p && !selRegion) setSelRegion(p.region); setShowAll(false); };   // ตั้งภาคของจังหวัดนั้นด้วย — เดิม setSelRegion(null) = ไม่ทำอะไรเลย ทำให้ย้อนกลับข้ามชั้นภาค
  const back = () => { if (selProv) setSelProv(null); else if (selRegion) setSelRegion(null); };
  const regionRows = [...rg.regions].sort((a, b) => b.sales - a.sales);
  const maxRegion = Math.max(1, ...regionRows.map(r => r.sales));
  const provList = showAll ? sorted : sorted.slice(0, 10);
  const maxProv = sorted[0]?.sales || 1;
  // ลาย/สี top 5 ของ scope
  const scopeDesigns = selProv ? [...(provNode?.designs ?? [])] : selRegion ? [...(regionNode?.designs ?? [])] : [];
  const scopeColors = selProv ? flattenColors(provNode?.designs) : selRegion ? [...(regionNode?.colors ?? [])] : [];
  const dTop = scopeDesigns.sort((a, b) => b.sales - a.sales).slice(0, 5), cTop = scopeColors.sort((a, b) => b.sales - a.sales).slice(0, 5);

  return (
    <Card className="p-[22px]">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <CardTitle className="m-0 text-base font-semibold">พื้นที่การขาย <span className="dim">· {scopeLabel}</span></CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>แตะจังหวัดบนแผนที่หรือแถวภาค/จังหวัดทางขวา · ชี้ดูออเดอร์/ตัว · กด "กรองทั้งหน้า" เพื่อดูทุกแท็บเฉพาะพื้นที่นั้น</div>
        </div>
        <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
          <span className="num" style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px' }}>{N(sorted.length)}</span><span className="cap" style={{ color: 'var(--ink-4)' }}>จังหวัดที่มียอด{selRegion ? `ใน${REGIONS[selRegion]}` : ''}</span>
          <span className="num" style={{ fontSize: 16, fontWeight: 700 }}>{baht(total)}</span>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 0.9fr) minmax(0, 1.3fr)', gap: 22, alignItems: 'start' }}>
        {/* ซ้าย — แผนที่ (คงเดิม) */}
        <div>
          <div style={{ position: 'relative' }}>
            <ThailandMap rows={rows} valOf={valOf} thr={thr} sel={selProv} hover={hover} onHover={setHover} onClick={(th) => pick(th)} />
            {hv && <div style={{ position: 'absolute', top: 6, left: 6, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '6px 10px', boxShadow: 'var(--sh-sm, 0 2px 8px rgba(0,0,0,.1))', pointerEvents: 'none' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{hv.th}</div>
              <div className="cap" style={{ color: 'var(--ink-3)' }}>{hv.sales > 0 ? `${baht(hv.sales)} · ${pct(hv.sales)}% · ${N(hv.orders)} ออเดอร์ · ${N(hv.qty)} ตัว` : 'ไม่มียอดในช่วงนี้'}</div>
            </div>}
          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'center', marginTop: 6, alignItems: 'center' }}>
            <span className="cap" style={{ color: 'var(--ink-4)' }}>น้อย</span>
            {GEO_BUCKETS.map((op, i) => <span key={i} style={{ width: 22, height: 10, borderRadius: 2, background: 'var(--accent)', opacity: op }} />)}
            <span className="cap" style={{ color: 'var(--ink-4)' }}>มาก</span>
          </div>
          {bd.noProvinceSales > 0 && <div className="cap" style={{ color: 'var(--ink-4)', textAlign: 'center', marginTop: 6 }}>ไม่ระบุจังหวัด (POS/มาร์เก็ตเพลส) {baht(bd.noProvinceSales)} — แยกออกจากแผนที่</div>}
        </div>

        {/* ขวา — แผงชั้นเดียว */}
        <div style={{ minWidth: 0 }}>
          {(selRegion || selProv) && (
            <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={back} className="cap row rounded-md border px-2 py-1 hover:bg-muted/50" style={{ gap: 4, color: 'var(--ink-2)', fontWeight: 600 }}><Icon name="arrowR" className="rotate-180" /> {selProv ? (selRegion ? REGIONS[selRegion] : 'ทั้งประเทศ') : 'ทั้งประเทศ'}</button>
              <span className="cap" style={{ color: 'var(--ink-4)' }}>›</span>
              <span style={{ fontWeight: 700 }}>{scopeLabel}</span>
              {selProv && <span className="row" style={{ gap: 6, marginLeft: 'auto' }}>
                <Button variant={selected.includes(selProv) ? 'default' : 'outline'} size="sm" className="h-8" onClick={() => onFilter('province', selProv)}>{selected.includes(selProv) ? '✓ กรองอยู่' : 'กรองทั้งหน้า'}</Button>
                <ExportBtn filename={`${selProv}-ลายสี`} rows={(provNode?.designs ?? []).flatMap(d => d.colors.map(c => ({ design: d.key, color: c.key, orders: c.orders, qty: c.qty, sales: c.sales })))} columns={[{ label: 'ลาย', key: 'design' }, { label: 'สี', key: 'color' }, { label: 'ออเดอร์', key: 'orders' }, { label: 'จำนวนตัว', key: 'qty' }, { label: 'ยอดขาย', key: 'sales' }]} />
              </span>}
            </div>
          )}

          {/* ชั้นจังหวัด */}
          {selProv && (
            <div style={{ display: 'grid', gap: 12 }}>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span className="num" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.4px' }}>{baht(provNode?.sales || 0)}</span>
                <span className="cap" style={{ color: 'var(--ink-4)' }}>{pct(provNode?.sales || 0)}% ของยอดรวม · {N(provNode?.orders || 0)} ออเดอร์ · {N(provNode?.qty || 0)} ตัว · {N(provNode?.designs?.length || 0)} ลาย</span>
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
                <TopList title="ลายขายดีในจังหวัดนี้" items={dTop} valOf={d => d.sales} max={dTop[0]?.sales || 1} dim="design" onFilter={onFilter} />
                <TopList title="สีขายดีในจังหวัดนี้" items={cTop} valOf={c => c.sales} max={cTop[0]?.sales || 1} dim="color" onFilter={onFilter} />
              </div>
            </div>
          )}

          {/* ชั้นประเทศ: แถวภาค */}
          {!selProv && !selRegion && (
            <div style={{ display: 'grid', gap: 2 }}>
              <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600, marginBottom: 4 }}>ภาค <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>· คลิกดูจังหวัดในภาค{cmp && prevRg ? ` · ▲▼ เทียบ${prevLabel}` : ''}</span></div>
              {regionRows.map(r => (
                <BarRow key={r.code} label={r.key} value={r.sales} max={maxRegion} onClick={() => { setSelRegion(r.code); setShowAll(false); }}
                  right={<><span className="num" style={{ flex: '0 0 auto', minWidth: 96, textAlign: 'right', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{baht(r.sales)} <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 400 }}>{pct(r.sales)}%</span></span>{cmp && prevRg && <span style={{ flex: '0 0 52px', textAlign: 'right' }}><Delta cur={r.sales} prev={prevRegionSales[r.code]} label={prevLabel} /></span>}</>}
                  sub={<><span>ลายเด่น <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{r.topDesign?.key || '—'}</b></span><span>สีเด่น <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{r.topColor?.key || '—'}</b></span><span>{N(r.orders)} ออเดอร์ · {N(r.qty)} ตัว</span></>} />
              ))}
              {!regionRows.length && <div className="cap" style={{ color: 'var(--ink-4)', padding: 12, textAlign: 'center' }}>ไม่มีข้อมูลภาคในช่วงนี้</div>}
            </div>
          )}

          {/* ชั้นภาค: สรุป + ลาย/สี top 5 */}
          {selRegion && !selProv && regionNode && (
            <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <span className="num" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.4px' }}>{baht(regionNode.sales)}</span>
                <span className="cap" style={{ color: 'var(--ink-4)' }}>{pct(regionNode.sales)}% ของยอดรวม · {N(regionNode.orders)} ออเดอร์ · {N(regionNode.qty)} ตัว</span>
                {cmp && prevRg && <Delta cur={regionNode.sales} prev={prevRegionSales[selRegion]} label={prevLabel} />}
              </div>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18 }}>
                <TopList title={`ลายขายดีใน${REGIONS[selRegion]}`} items={dTop} valOf={d => d.sales} max={dTop[0]?.sales || 1} dim="design" onFilter={onFilter} />
                <TopList title={`สีขายดีใน${REGIONS[selRegion]}`} items={cTop} valOf={c => c.sales} max={cTop[0]?.sales || 1} dim="color" onFilter={onFilter} />
              </div>
            </div>
          )}

          {/* จังหวัด top 10 (ประเทศ/ภาค) */}
          {!selProv && sorted.length > 0 && (
            <div style={{ marginTop: selRegion ? 0 : 14, paddingTop: selRegion ? 12 : 12, borderTop: '1px solid var(--line)' }}>
              <div className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600, marginBottom: 4 }}>จังหวัดขายดี{selRegion ? `ใน${REGIONS[selRegion]}` : ''} <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>· คลิกดูลาย/สีของจังหวัด</span></div>
              <div style={{ display: 'grid', gap: 2 }}>
                {provList.map((p, i) => (
                  <BarRow key={p.th} rank={i + 1} label={p.th} value={p.sales} max={maxProv} on={hover === p.th} onClick={() => pick(p.th)} onEnter={() => setHover(p.th)} onLeave={() => setHover(null)}
                    right={<><span className="num" style={{ flex: '0 0 auto', minWidth: 84, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{baht(p.sales)}</span><span className="num cap" style={{ flex: '0 0 40px', textAlign: 'right', color: 'var(--ink-4)' }}>{total ? Math.round(p.sales / total * 100) : 0}%</span></>} />
                ))}
              </div>
              {sorted.length > 10 && <button type="button" onClick={() => setShowAll(v => !v)} className="cap mt-2 text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }}>{showAll ? 'ย่อเหลือ 10 จังหวัด' : `ดูทั้งหมด ${N(sorted.length)} จังหวัด (อีก ${baht(sorted.slice(10).reduce((a, p) => a + p.sales, 0))})`}</button>}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
