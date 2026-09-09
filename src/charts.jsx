/* ============================================================
   charts.jsx — ชุดคอมโพเนนต์กราฟ/การ์ดที่ใช้ซ้ำได้ทั้งระบบ
   recharts 2 + CSS variables → รองรับ dark/light อัตโนมัติ
   ============================================================ */
import React from 'react';
import { B, N, Icon } from './components.jsx';
import {
  PieChart, Pie, Cell,
  BarChart, Bar,
  ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceArea, ReferenceDot,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';

// จานสีหมวดหมู่ (categorical) — indigo-led ตรงกับ --chart-1..5
export const CAT_COLORS = ['#4f46e5', '#0ea5e9', '#14b8a6', '#f59e0b', '#8b5cf6', '#ec4899', '#84cc16', '#06b6d4', '#64748b'];
export const channelColor = (name) => ({ Shopee: '#ee6a3a', Lazada: '#6b5ce0', Facebook: '#4a8be0', LINE: '#06c755', Phone: '#3aa0c9', POS: '#e39b2e', Direct: '#8a909c', TikTok: '#18a0ab' }[name]) || '#6b7280';

// -------- shared style helpers --------
const TICK = { fill: 'var(--ink-3)', fontSize: 11 };
const AXP = { axisLine: false, tickLine: false };
const GRID = { strokeDasharray: '3 3', stroke: 'rgba(130,140,160,.18)' };
const KFMT = v => '฿' + Math.round(v / 1000) + 'k';
// formatter ให้ shadcn ChartTooltipContent: จุดสี + ชื่อชุด + ค่า (จัดรูปด้วย fmt) — รองรับ fmt ต่อชุดผ่าน map
const tipRow = (fmt) => (value, name, item) => (
  <>
    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: item?.color || item?.payload?.fill || 'var(--accent)' }} />
    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
      <span className="text-muted-foreground">{name}</span>
      <span className="font-semibold tabular-nums text-foreground">{(typeof fmt === 'function' ? fmt : (fmt && fmt[item?.dataKey]) || B)(value)}</span>
    </div>
  </>
);
// tooltip แยกช่องทาง — โชว์แต่ละช่องทาง: ยอด + % ของช่วงนั้น + แถว "รวม"
//  • โหมดแท่งซ้อน (StackedBars): ทุกชุดใน payload = ช่องทาง
//  • โหมดคอมโบ (ComboChart): ชุดหลัก (แท่ง/เส้น/เทียบ) โชว์ก่อน แล้วต่อด้วยแยกช่องทางจาก row._bd
function ChannelTip({ active, payload, label, fmt = B, mainKeys }) {
  if (!active || !payload || !payload.length) return null;
  const row0 = payload[0]?.payload || {};
  const bd = row0._bd; // combo: [{name,value,color}] ต่อ bucket
  const isCombo = Array.isArray(bd);
  const mains = isCombo
    ? payload.filter(p => mainKeys?.includes(p.dataKey) && p.value != null)
        .map(p => ({ name: p.name, value: Number(p.value) || 0, color: p.color, key: p.dataKey }))
    : [];
  let channels = (isCombo ? bd : payload)
    .map(c => ({ name: c.name, value: Number(c.value) || 0, color: c.color || c.payload?.fill }))
    .filter(c => c.value !== 0)
    .sort((a, b) => b.value - a.value);
  const total = channels.reduce((s, c) => s + c.value, 0);
  return (
    <div className="min-w-[11rem] rounded-lg border bg-background px-2.5 py-2 text-xs shadow-md">
      <div className="mb-1.5 font-medium text-foreground">{label}</div>
      {mains.map((m, i) => (
        <div key={'m' + i} className="mb-0.5 flex items-center gap-2">
          <span className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: m.color }} />
          <span className="flex-1 text-muted-foreground">{m.name}</span>
          <span className="font-semibold tabular-nums text-foreground">{(m.key === 'line' ? N : fmt)(m.value)}</span>
        </div>
      ))}
      {mains.length > 0 && channels.length > 0 && <div className="my-1.5 h-px bg-border" />}
      {channels.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: c.color }} />
          <span className="flex-1 text-muted-foreground">{c.name}</span>
          <span className="font-semibold tabular-nums text-foreground">{fmt(c.value)}</span>
          <span className="w-9 text-right tabular-nums text-muted-foreground">{total ? Math.round(c.value / total * 100) : 0}%</span>
        </div>
      ))}
      {channels.length > 1 && <div className="mt-1.5 flex items-center justify-between border-t pt-1"><span className="text-muted-foreground">รวม</span><span className="font-semibold tabular-nums text-foreground">{fmt(total)}</span></div>}
    </div>
  );
}
// config ขั้นต่ำให้ ChartContainer (label lookup) จาก [key,label] คู่ๆ
const mkCfg = (pairs) => Object.fromEntries(pairs.map(([k, label]) => [k, { label }]));
const CC_CLS = '!aspect-auto w-full';

// hex → rgba (used by Heatmap for alpha-varying cell backgrounds)
function hexA(hex, a) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return `rgba(120,120,140,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

// ---- โดนัท (สัดส่วน เช่น ช่องทาย) ----
export function DonutChart({ data, height = 190, ariaLabel = 'กราฟวงแหวน', tooltip = true }) {
  const items = (data || []).filter(d => (d.value || 0) > 0);
  const total = items.reduce((a, d) => a + d.value, 0);
  const cfg = mkCfg(items.map(d => [d.label, d.label]));
  return (
    <ChartContainer config={cfg} className={CC_CLS} style={{ height }}>
      <PieChart aria-label={ariaLabel}>
        {tooltip && <ChartTooltip wrapperStyle={{ zIndex: 50 }} allowEscapeViewBox={{ x: true, y: true }} content={<ChartTooltipContent nameKey="label" formatter={tipRow(v => `${B(v)} (${Math.round(v / (total || 1) * 100)}%)`)} />} />}
        <Pie data={items} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="82%" paddingAngle={2} stroke="none">
          {items.map((d, i) => <Cell key={i} fill={d.color || CAT_COLORS[i % CAT_COLORS.length]} />)}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

// ---- เส้น/พื้นที่ (เทรนด์ + เส้นคาดการณ์ประ) · compact=มินิไม่มีแกน (ใช้ใน hero) ----
export function AreaTrend({ labels, values, forecast = [], height = 190, color, ariaLabel = 'กราฟแนวโน้ม', compact = false, valFmt }) {
  const c = color || '#4338ca';
  const hasForecast = forecast && forecast.some(v => v != null);
  const chartData = (labels && labels.length ? labels : values.map((_, i) => i + 1)).map((label, i) => ({
    label,
    actual: values[i] ?? null,
    forecast: hasForecast ? (forecast[i] ?? null) : undefined,
  }));
  return (
    <ChartContainer config={mkCfg([['actual', 'ยอดขาย'], ['forecast', 'คาดการณ์']])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={chartData} margin={compact ? { top: 4, right: 4, bottom: 0, left: 4 } : { top: 4, right: 8, bottom: 0, left: 0 }} aria-label={ariaLabel}>
        {!compact && <CartesianGrid {...GRID} vertical={false} />}
        {!compact && <XAxis dataKey="label" tick={TICK} {...AXP} />}
        {!compact && <YAxis tickFormatter={KFMT} tick={TICK} {...AXP} width={52} />}
        <ChartTooltip cursor={{ stroke: 'var(--line)' }} content={<ChartTooltipContent hideLabel={compact} formatter={tipRow(valFmt || B)} />} />
        <Area type="monotone" dataKey="actual" name="ยอดขาย" stroke={c} fill={c} fillOpacity={0.14} strokeWidth={2} dot={compact ? false : { r: 3, fill: c }} activeDot={{ r: 3.5 }} connectNulls />
        {hasForecast && <Line type="monotone" dataKey="forecast" name="คาดการณ์" stroke={c} strokeDasharray="5 4" strokeWidth={2} dot={{ r: 4, fill: '#4f46e5' }} connectNulls />}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- แท่งแนวนอน (เช่น ลายขายดี) ----
export function HBars({ data, height = 240, unit = '', color, ariaLabel = 'กราฟแท่ง' }) {
  const items = data || [];
  return (
    <ChartContainer config={mkCfg([['value', unit || 'ค่า']])} className={CC_CLS} style={{ height }}>
      <BarChart data={items} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} aria-label={ariaLabel}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" tick={TICK} {...AXP} />
        <YAxis dataKey="label" type="category" width={90} interval={0} tick={{ fill: 'var(--ink)', fontSize: 12 }} {...AXP} />
        <ChartTooltip content={<ChartTooltipContent hideLabel formatter={tipRow(v => `${Math.round(v).toLocaleString()}${unit ? ' ' + unit : ''}`)} />} />
        <Bar dataKey="value" name={unit || 'ค่า'} radius={[0, 5, 5, 0]} maxBarSize={22}>
          {items.map((d, i) => <Cell key={i} fill={d.color || color || '#4338ca'} />)}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// ---- แท่งแนวตั้งกลุ่ม (เช่น ลาย × ช่อง) ----
export function GroupBars({ labels, datasets, height = 240, fmt, ariaLabel = 'กราฟแท่ง' }) {
  const ds = datasets || [];
  const chartData = (labels || []).map((label, i) => {
    const row = { label };
    ds.forEach((d, j) => { row[`d${j}`] = d.data[i]; });
    return row;
  });
  return (
    <ChartContainer config={mkCfg(ds.map((d, i) => [`d${i}`, d.label]))} className={CC_CLS} style={{ height }}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} aria-label={ariaLabel}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} {...AXP} />
        <YAxis tick={TICK} {...AXP} width={48} />
        <ChartTooltip content={<ChartTooltipContent formatter={tipRow(fmt || B)} />} />
        {ds.map((d, i) => (
          <Bar key={i} dataKey={`d${i}`} name={d.label} fill={d.color || CAT_COLORS[i % CAT_COLORS.length]} radius={4} maxBarSize={26} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

// ---- เกจครึ่งวงกลม (เป้า/pacing) — SVG ล้วน ----
export function Gauge({ value, max, label, sub, height = 150 }) {
  const pct = max > 0 ? Math.min(1.15, value / max) : 0;
  const ang = -Math.PI + Math.min(1, pct) * Math.PI;
  const cx = 100, cy = 96, r = 78;
  const x = cx + r * Math.cos(ang), y = cy + r * Math.sin(ang);
  const big = pct >= 1;
  const tone = pct >= 1 ? 'var(--good)' : pct >= 0.7 ? 'var(--warn)' : 'var(--bad)';
  const arc = (a) => `${cx + r * Math.cos(-Math.PI + a * Math.PI)} ${cy + r * Math.sin(-Math.PI + a * Math.PI)}`;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 200 116" width="100%" height={height} role="img" aria-label={`${label} ${Math.round(pct * 100)}%`}>
        <path d={`M ${arc(0)} A ${r} ${r} 0 0 1 ${arc(1)}`} fill="none" stroke="var(--line)" strokeWidth="13" strokeLinecap="round" />
        <path d={`M ${arc(0)} A ${r} ${r} 0 ${big ? 1 : 0} 1 ${x} ${y}`} fill="none" stroke={tone} strokeWidth="13" strokeLinecap="round" />
        <text x="100" y="84" textAnchor="middle" style={{ fontSize: 26, fontWeight: 700, fill: 'var(--ink)' }}>{Math.round(pct * 100)}%</text>
        <text x="100" y="104" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--ink-3)' }}>{sub || ''}</text>
      </svg>
      {label && <div className="cap" style={{ marginTop: 2 }}>{label}</div>}
    </div>
  );
}

// ---- เกจครึ่งวงกลมแบบมีโซน (ตามภาพ Company Dashboard ที่ user ชอบ · memory gauge-kpi-pattern) ----
// value = ค่าปัจจุบันเทียบเกณฑ์ (1 = ตรงเกณฑ์พอดี) · zones = [{to, color}] เรียงจากซ้าย (0) → ขวา (max) · เข็มชี้ค่า
// text = ตัวเลขใหญ่วางในโค้ง (สี = textColor) · ขีดกลาง = เกณฑ์ (value 1) · โซนที่เข็มอยู่เข้ม โซนอื่นจางลง
export function ZoneGauge({ value = 0, max = 1.3, zones, height = 120, text, subText, textColor = 'var(--ink)', ariaLabel = 'เกจ' }) {
  // โซน default: แดง <60% ของเกณฑ์ · เหลือง 60–100% · เขียว ≥ เกณฑ์ (เหลืองกว้างพอให้เห็น — เดิม 70–100 บางจนเป็นเส้น)
  // ใช้ --gauge-* (สีสำหรับโค้งเกจโดยเฉพาะ) ไม่ใช่ --good/--warn/--bad ที่เข้มไว้สำหรับตัวหนังสือ
  const zs = zones || [{ to: 0.6, color: 'var(--gauge-bad)' }, { to: 1, color: 'var(--gauge-warn)' }, { to: max, color: 'var(--gauge-good)' }];
  const cx = 100, cy = 100, r = 82, w = 18;
  const clamp = (v) => Math.max(0, Math.min(max, v));
  const angOf = (v) => -Math.PI + (clamp(v) / max) * Math.PI;
  const pt = (v, rr = r) => `${cx + rr * Math.cos(angOf(v))} ${cy + rr * Math.sin(angOf(v))}`;
  const arc = (from, to) => `M ${pt(from)} A ${r} ${r} 0 0 1 ${pt(to)}`; // ครึ่งวงกลม: ทุกช่วง ≤180° → large-arc = 0 เสมอ
  const nv = clamp(value), na = angOf(nv);
  const segs = zs.map((z, i) => ({ from: i === 0 ? 0 : zs[i - 1].to, to: z.to, color: z.color, active: nv >= (i === 0 ? 0 : zs[i - 1].to) && (nv < z.to || i === zs.length - 1) }));
  return (
    <svg viewBox="0 0 200 108" width="100%" height={height} role="img" aria-label={`${ariaLabel} ${Math.round(value * 100)}%`} style={{ display: 'block', overflow: 'visible' }}>
      {/* โซนที่เข็มอยู่ = สีเต็ม · โซนอื่นจางลงแต่ยังอ่านออก (เดิม 0.38 จางจนสีเพี้ยนไปคนละโทน) */}
      {segs.map((z, i) => <path key={i} d={arc(z.from, z.to)} fill="none" stroke={z.color} strokeWidth={w} strokeLinecap={i === 0 || i === segs.length - 1 ? 'round' : 'butt'} opacity={z.active ? 1 : 0.28} />)}
      {/* ขีดเกณฑ์ (value = 1) */}
      <line x1={cx + (r - w / 2 - 3) * Math.cos(angOf(1))} y1={cy + (r - w / 2 - 3) * Math.sin(angOf(1))} x2={cx + (r + w / 2 + 3) * Math.cos(angOf(1))} y2={cy + (r + w / 2 + 3) * Math.sin(angOf(1))} stroke="var(--ink)" strokeWidth="2.2" opacity="0.6" />
      {/* เลขใหญ่ในโค้ง */}
      {text != null && <text x={cx} y={subText ? cy - 16 : cy - 6} textAnchor="middle" className="num" style={{ fontSize: 34, fontWeight: 800, fill: textColor, letterSpacing: '-1px' }}>{text}</text>}
      {/* ป้ายความหมายของตัวเลข (ใต้เลข ในโค้ง) — กันเกจคนละฐานถูกเอามาเทียบกันผิด */}
      {subText && <text x={cx} y={cy - 2} textAnchor="middle" style={{ fontSize: 9.5, fontWeight: 600, fill: 'var(--ink-4)' }}>{subText}</text>}
      {/* ตัวชี้ = สามเหลี่ยมเล็กใต้โค้ง ชี้ออกไปที่โซน (แบบภาพอ้างอิง) — ไม่ลากเส้นผ่านตัวเลขกลางเกจ */}
      <polygon points={`${cx + (r - w / 2 - 3) * Math.cos(na)},${cy + (r - w / 2 - 3) * Math.sin(na)} ${cx + (r - w / 2 - 16) * Math.cos(na - 0.09)},${cy + (r - w / 2 - 16) * Math.sin(na - 0.09)} ${cx + (r - w / 2 - 16) * Math.cos(na + 0.09)},${cy + (r - w / 2 - 16) * Math.sin(na + 0.09)}`} fill="var(--ink)" style={{ transition: 'all .6s ease' }} />
    </svg>
  );
}

// ---- เลขนับวิ่ง (count-up) ด้วย requestAnimationFrame · ease-out · เคารพ prefers-reduced-motion ----
export function useCountUp(target, { duration = 900, decimals = 0 } = {}) {
  const end = Number(target) || 0;
  const [val, setVal] = React.useState(end);
  const fromRef = React.useRef(end);
  React.useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    if (reduce || from === end || duration <= 0) { fromRef.current = end; setVal(end); return; }
    // แท็บที่ถูกซ่อน/ย่อ = requestAnimationFrame ไม่ทำงาน → เดิมเลขค้างที่ค่าเก่าถาวร
    // (เจอจริงตอนเปลี่ยนช่วงวันแล้วการ์ด "ออเดอร์" ค้าง 473 ทั้งที่ค่าจริง 4,761)
    if (typeof document !== 'undefined' && document.hidden) {
      fromRef.current = end;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ตั้งค่าจริงทันทีเมื่อ animate ไม่ได้ (แท็บซ่อน) · ไม่เกิดลูกโซ่ (deps = ค่าเป้าหมายล้วน)
      setVal(end);
      return;
    }
    let raf, start = null, guard;
    const m = Math.pow(10, decimals);
    const done = () => { fromRef.current = end; setVal(end); };
    const step = (ts) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round((from + (end - from) * e) * m) / m);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = end;
    };
    raf = requestAnimationFrame(step);
    guard = setTimeout(done, duration + 400);   // กันเฟรมไม่มา (แท็บพื้นหลัง/เครื่องหน่วง) → เลขต้องลงที่ค่าจริงเสมอ
    return () => { if (raf) cancelAnimationFrame(raf); clearTimeout(guard); };
  }, [end, duration, decimals]);
  return val;
}

// ---- ตัวเลขนับวิ่งพร้อม formatter (countTo=ตัวเลขดิบ, fmt=ฟังก์ชันจัดรูป) ----
export function CountUp({ value, fmt = N, duration = 900, decimals = 0 }) {
  const v = useCountUp(value, { duration, decimals });
  return <>{(fmt || N)(v)}</>;
}

// ---- การ์ดตัวเลขสรุป (KPI) พร้อม delta + ไอคอน · countTo=นับวิ่ง, index=ลำดับ stagger ----
export function MetricCard({ label, value, countTo, fmt, decimals, delta, deltaUp, sub, tone, icon, index, animate = true }) {
  return (
    <div className={'metric-card' + (animate ? ' metric-anim' : '')} style={index != null ? { '--i': index } : undefined}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="cap" style={{ color: 'var(--ink-3)' }}>{label}</div>
        {icon && <span style={{ color: tone || 'var(--ink-4)', opacity: 0.85 }}><Icon name={icon} /></span>}
      </div>
      <div className="num" style={{ fontSize: 23, fontWeight: 700, marginTop: 4, color: tone || 'var(--ink)' }}>
        {countTo != null ? <CountUp value={countTo} fmt={fmt} decimals={decimals} /> : value}
      </div>
      <div className="row" style={{ gap: 6, marginTop: 3 }}>
        {delta != null && <span className="cap" style={{ fontWeight: 700, color: deltaUp ? 'var(--good)' : 'var(--bad)', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Icon name={deltaUp ? 'up' : 'down'} size={12} />{delta}</span>}
        {sub && <span className="cap" style={{ color: 'var(--ink-4)' }}>{sub}</span>}
      </div>
    </div>
  );
}

// ---- มินิบาร์แนวตั้ง (sparkbars เช่น ไซซ์) — HTML flex ----
export function MiniBars({ data, color, height = 44 }) {
  const max = Math.max(1, ...(data || []).map(d => d.value));
  return (
    <div>
      <div className="row" style={{ gap: 5, alignItems: 'flex-end', height }}>
        {(data || []).map((d, i) => (
          <div key={i} title={`${d.label} ${N(d.value)}`} style={{ flex: 1, height: `${Math.max(5, (d.value / max) * 100)}%`, background: color || 'var(--accent)', borderRadius: '3px 3px 0 0', opacity: 1 - i * 0.07 }} />
        ))}
      </div>
      <div className="row between" style={{ marginTop: 5 }}>
        {(data || []).map((d, i) => <span key={i} className="cap" style={{ fontSize: 10, flex: 1, textAlign: 'center' }}>{d.label}</span>)}
      </div>
    </div>
  );
}

// ---- คอมโบ: แท่ง(ยอด) + เส้น(ออเดอร์) สองแกน + เส้นเทียบช่วงก่อน ----
export function ComboChart({ labels, bars, line, cmpBars, breakdown, barLabel = 'ยอดขาย', lineLabel = 'ออเดอร์', barFmt, lineFmt, cmpLabel = 'ช่วงก่อน', height = 230, ariaLabel = 'กราฟยอดขายตามเวลา', onDayClick }) {
  const hasCmp = cmpBars && cmpBars.some(v => v != null);
  const hasLine = line != null;
  const hasBd = Array.isArray(breakdown) && breakdown.some(b => b && b.length);
  const chartData = (labels || []).map((label, i) => ({
    label,
    bars: bars[i] ?? null,
    line: hasLine ? (line[i] ?? null) : undefined,
    cmpBars: hasCmp ? (cmpBars[i] ?? null) : undefined,
    _bd: hasBd ? breakdown[i] : undefined,
  }));
  const comboFmt = { bars: barFmt || B, cmpBars: barFmt || B, line: lineFmt || (v => v) };
  return (
    <ChartContainer config={mkCfg([['bars', barLabel], ['line', lineLabel], ['cmpBars', cmpLabel]])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 40, bottom: 0, left: 0 }} aria-label={ariaLabel}
        style={onDayClick ? { cursor: 'pointer' } : undefined}
        onClick={onDayClick ? (st) => { const i = st?.activeTooltipIndex; if (i != null && i >= 0) onDayClick(i); } : undefined}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} {...AXP} interval="preserveStartEnd" />
        <YAxis yAxisId="y" tickFormatter={KFMT} tick={TICK} {...AXP} width={52} />
        {hasLine && <YAxis yAxisId="y1" orientation="right" tick={TICK} {...AXP} width={32} />}
        {hasBd
          ? <ChartTooltip content={<ChannelTip fmt={barFmt || B} mainKeys={['bars', 'cmpBars', 'line']} />} />
          : <ChartTooltip content={<ChartTooltipContent formatter={tipRow(comboFmt)} />} />}
        <Bar yAxisId="y" dataKey="bars" name={barLabel} fill="#4338ca" fillOpacity={0.85} radius={4} maxBarSize={34} />
        {hasCmp && <Bar yAxisId="y" dataKey="cmpBars" name={cmpLabel} fill="rgba(130,140,160,.28)" radius={4} maxBarSize={34} />}
        {hasLine && <Line type="monotone" yAxisId="y1" dataKey="line" name={lineLabel} stroke="#4f46e5" strokeWidth={2} dot={{ r: 2 }} connectNulls />}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- แท่งซ้อน (channel × เวลา) ----
export function StackedBars({ labels, datasets, height = 230, fmt, ariaLabel = 'กราฟแท่งซ้อน', onDayClick }) {
  const ds = datasets || [];
  const chartData = (labels || []).map((label, i) => {
    const row = { label };
    ds.forEach((d, j) => { row[`d${j}`] = d.data[i]; });
    return row;
  });
  return (
    <ChartContainer config={mkCfg(ds.map((d, i) => [`d${i}`, d.label]))} className={CC_CLS} style={{ height }}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} aria-label={ariaLabel}
        style={onDayClick ? { cursor: 'pointer' } : undefined}
        onClick={onDayClick ? (st) => { const i = st?.activeTooltipIndex; if (i != null && i >= 0) onDayClick(i); } : undefined}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} {...AXP} interval="preserveStartEnd" />
        <YAxis tickFormatter={KFMT} tick={TICK} {...AXP} width={52} />
        <ChartTooltip content={<ChannelTip fmt={fmt || B} />} />
        {ds.map((d, i) => (
          <Bar key={i} dataKey={`d${i}`} name={d.label} stackId="a" fill={d.color || CAT_COLORS[i % CAT_COLORS.length]} radius={i === ds.length - 1 ? [2, 2, 0, 0] : 0} maxBarSize={40} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

// ---- ยอดขายรายวัน (รายงานขาย · รื้อใหม่): แท่งซ้อนสีตามช่องทาง + เส้นประอ้างอิง (เฉลี่ยช่วงก่อน) · คลิกแท่ง ----
// tooltip: วันที่ + จำนวนออเดอร์ · ช่องทางเรียงมาก→น้อย (ยอด + %) · รวม · hint คลิกดูออเดอร์
function DailyTip({ active, payload, label, fmt = B, clickable, prevLabel = 'ช่วงก่อน', ordersLabel = 'ออเดอร์', ordersFmt = N, emptyText = 'ไม่มียอดขาย', clickText = 'คลิกเพื่อดูออเดอร์ทั้งวัน', extra }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload || {};
  const channels = payload.filter(c => String(c.dataKey || '').startsWith('d')).map(c => ({ name: c.name, value: Number(c.value) || 0, color: c.color || c.payload?.fill })).filter(c => c.value > 0).sort((a, b) => b.value - a.value);
  const total = channels.reduce((s, c) => s + c.value, 0);
  return (
    <div className="min-w-[12rem] rounded-lg border bg-background px-2.5 py-2 text-xs shadow-md">
      <div className="mb-1.5 flex items-center justify-between gap-3"><span className="font-semibold text-foreground">{row._tip || label}</span>{row._orders != null && <span className="tabular-nums text-muted-foreground">{ordersLabel} {ordersFmt(row._orders)}</span>}</div>
      {channels.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="inline-block size-2.5 shrink-0 rounded-[3px]" style={{ background: c.color }} />
          <span className="flex-1 text-muted-foreground">{c.name}</span>
          <span className="font-semibold tabular-nums text-foreground">{fmt(c.value)}</span>
          <span className="w-9 text-right tabular-nums text-muted-foreground">{total ? Math.round(c.value / total * 100) : 0}%</span>
        </div>
      ))}
      {channels.length === 0 && <div className="text-muted-foreground">{emptyText}</div>}
      {channels.length > 1 && <div className="mt-1.5 flex items-center justify-between border-t pt-1"><span className="text-muted-foreground">รวม</span><span className="font-semibold tabular-nums text-foreground">{fmt(total)}</span></div>}
      {row._prev != null && <div className="mt-1 flex items-center justify-between gap-3"><span className="text-muted-foreground">{prevLabel} วันเดียวกัน</span><span className="tabular-nums"><span className="text-muted-foreground">{fmt(row._prev)}</span> <span className="font-semibold" style={{ color: total >= row._prev ? 'var(--good)' : 'var(--bad)' }}>{(total >= row._prev ? '+' : '−') + fmt(Math.abs(total - row._prev))}</span></span></div>}
      {extra && extra(row, total)}
      {clickable && total > 0 && <div className="mt-1.5 text-[10px] text-muted-foreground">{clickText}</div>}
    </div>
  );
}
// ป้ายแกน x ของกราฟรายวัน: วันหยุดจางลง (ข้อมูลเดียวกับแรเงา — ไม่ใช่สีอย่างเดียว) · render function ระดับโมดูล (ไม่สร้าง component ใน render)
const renderWeTick = ({ x, y, payload, index }, rows) => (
  <text x={x} y={y + 12} textAnchor="middle" fontSize={11} fill={rows[index]?._we ? 'var(--ink-4)' : 'var(--ink-3)'} opacity={rows[index]?._we ? 0.85 : 1}>{payload.value}</text>
);
// weekend = boolean[] ต่อ bucket (เสาร์/อาทิตย์ → แรเงาพื้นหลัง + ป้ายวันจาง) · showOrders = เส้นออเดอร์/วัน บนแกนขวา (ป้าย "ออเดอร์")
// prevValues = ยอดช่วงก่อน ณ ลำดับวันเดียวกัน (เส้นประ แกนซ้าย) — ใช้แทนเส้นเฉลี่ยแบน (user: "กราฟเดือนที่แล้ว" ต้องดูเทียบวันต่อวันได้)
export function DailySalesChart({ labels, tipLabels, datasets, orders, weekend, prevValues, prevLabel = 'ช่วงก่อน', showOrders = true, refValue, rightRef, height = 250, fmt, axisFmt, ordersLabel = 'ออเดอร์', ordersFmt, emptyText, clickText, tipExtra, ariaLabel = 'กราฟยอดขายรายวัน', onBarClick }) {
  const ds = datasets || [];
  const hasPrev = Array.isArray(prevValues) && prevValues.some(v => v > 0);
  const chartData = (labels || []).map((label, i) => {
    const row = { label, _tip: tipLabels ? tipLabels[i] : label, _orders: orders ? orders[i] : null, _we: !!(weekend && weekend[i]), _prev: hasPrev && prevValues[i] != null ? prevValues[i] : null };
    ds.forEach((d, j) => { row[`d${j}`] = d.data[i]; });
    return row;
  });
  const n = chartData.length;
  const hasOrders = showOrders && Array.isArray(orders) && orders.some(v => v > 0);
  const weIdx = chartData.map((r, i) => (r._we ? i : -1)).filter(i => i >= 0);
  return (
    <ChartContainer config={mkCfg([...ds.map((d, i) => [`d${i}`, d.label]), ['_orders', ordersLabel], ['_prev', prevLabel]])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={chartData} margin={{ top: 8, right: hasOrders ? 4 : 8, bottom: 0, left: 0 }} aria-label={ariaLabel} barCategoryGap={n > 16 ? '24%' : '32%'}
        style={onBarClick ? { cursor: 'pointer' } : undefined}
        onClick={onBarClick ? (st) => { const i = st?.activeTooltipIndex; if (i != null && i >= 0) onBarClick(i); } : undefined}>
        <CartesianGrid {...GRID} vertical={false} />
        {/* แรเงาวันหยุด (เสาร์/อาทิตย์) — เห็นแพตเทิร์นวันหยุดทันที */}
        {weIdx.map(i => <ReferenceArea key={'we' + i} yAxisId="l" x1={chartData[i].label} x2={chartData[i].label} fill="rgba(130,140,160,.09)" stroke="none" ifOverflow="visible" />)}
        <XAxis dataKey="label" tick={weekend ? (tp) => renderWeTick(tp, chartData) : TICK} {...AXP} interval={n <= 31 ? 0 : 'preserveStartEnd'} minTickGap={6} />
        <YAxis yAxisId="l" tickFormatter={axisFmt || KFMT} tick={TICK} {...AXP} width={52} allowDecimals={false} />
        {hasOrders && <YAxis yAxisId="r" orientation="right" tick={TICK} {...AXP} width={44} allowDecimals={!!ordersFmt} tickFormatter={ordersFmt}
          label={{ value: ordersLabel, angle: 90, position: 'insideRight', fill: 'var(--ink-4)', fontSize: 10, offset: -2 }} />}
        <ChartTooltip cursor={{ fill: 'rgba(130,140,160,.10)' }} content={<DailyTip fmt={fmt || B} clickable={!!onBarClick} prevLabel={prevLabel} ordersLabel={ordersLabel} ordersFmt={ordersFmt || N} emptyText={emptyText} clickText={clickText} extra={tipExtra} />} />
        {ds.map((d, i) => (
          <Bar key={i} yAxisId="l" dataKey={`d${i}`} name={d.label} stackId="a" fill={d.color || CAT_COLORS[i % CAT_COLORS.length]} radius={i === ds.length - 1 ? [3, 3, 0, 0] : 0} maxBarSize={44} isAnimationActive={false} />
        ))}
        {/* เส้นประ = ช่วงก่อน ณ วันเดียวกัน (แกนซ้าย) — user เลือกเส้นประ (ไม่เอาขีดสั้น) */}
        {hasPrev && <Line yAxisId="l" type="monotone" dataKey="_prev" name={prevLabel} stroke="var(--accent-2)" strokeWidth={1.7} strokeDasharray="5 4" dot={false} activeDot={{ r: 3.5 }} isAnimationActive={false} connectNulls />}
        {/* เส้นออเดอร์/วัน — แกนขวา สีเข้มกลาง จุดเล็ก ไม่แย่งแท่ง */}
        {hasOrders && <Line yAxisId="r" type="monotone" dataKey="_orders" name={ordersLabel} stroke="var(--ink-3)" strokeWidth={1.6} dot={{ r: 2.4, fill: 'var(--surface)', stroke: 'var(--ink-3)', strokeWidth: 1.5 }} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls />}
        {/* เส้นอ้างอิง — ไม่มีป้ายในกราฟ (ทับแท่ง) · ความหมาย/ตัวเลขอยู่ใน legend ใต้กราฟ */}
        {refValue > 0 && <ReferenceLine yAxisId="l" y={refValue} stroke="var(--ink-3)" strokeDasharray="5 4" strokeWidth={1.4} ifOverflow="extendDomain" />}
        {hasOrders && rightRef > 0 && <ReferenceLine yAxisId="r" y={rightRef} stroke="var(--good)" strokeDasharray="3 3" strokeWidth={1.2} ifOverflow="extendDomain" />}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- กราฟสะสมเทียบเดือนก่อน (hero รายงานขาย): เส้นสะสมช่วงนี้ (ทึบ) vs ช่วงก่อน (ประ) บนแกน "วันที่ N ของช่วง" ----
// cur/prev = ยอดต่อ bucket (ไม่ใช่สะสม — คำนวณสะสมในนี้) · prev ยาวกว่า cur ได้ (เดือนก่อนเต็มเดือน) · todayIdx = index ของวันนี้ (เส้นแนวตั้งจาง)
function CumTip({ active, payload, label, fmt = B, curLabel, prevLabel }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0]?.payload || {};
  const c = row.cur, p = row.prev;
  return (
    <div className="min-w-[11rem] rounded-lg border bg-background px-2.5 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-foreground">{row._tip || label}</div>
      {c != null && <div className="flex justify-between gap-3"><span className="text-muted-foreground">สะสม {curLabel}</span><span className="font-semibold tabular-nums" style={{ color: 'var(--accent)' }}>{fmt(c)}</span></div>}
      {p != null && <div className="flex justify-between gap-3"><span className="text-muted-foreground">สะสม {prevLabel}</span><span className="font-semibold tabular-nums text-muted-foreground">{fmt(p)}</span></div>}
      {c != null && p != null && <div className="mt-1 flex justify-between gap-3 border-t pt-1"><span className="text-muted-foreground">ส่วนต่าง</span><span className="font-semibold tabular-nums" style={{ color: c >= p ? 'var(--good)' : 'var(--bad)' }}>{(c >= p ? '+' : '−') + fmt(Math.abs(c - p))}</span></div>}
    </div>
  );
}
export function CumulativeCompare({ cur = [], prev = null, labels = [], tipLabels, curLabel = 'ช่วงนี้', prevLabel = 'ช่วงก่อน', todayIdx = -1, height = 180, fmt, ariaLabel = 'กราฟยอดสะสมเทียบช่วงก่อน' }) {
  const n = Math.max(cur.length, prev ? prev.length : 0);
  const data = []; let cc = 0, pc = 0;
  for (let i = 0; i < n; i++) {
    const hasC = i < cur.length, hasP = prev && i < prev.length;
    if (hasC) cc += Number(cur[i]) || 0;
    if (hasP) pc += Number(prev[i]) || 0;
    data.push({ label: labels[i] != null ? labels[i] : String(i + 1), _tip: tipLabels ? tipLabels[i] : (labels[i] != null ? labels[i] : `วันที่ ${i + 1}`), cur: hasC ? cc : null, prev: hasP ? pc : null });
  }
  if (!n) return <div style={{ height }} />;
  const curEnd = cur.length ? data[cur.length - 1] : null;
  const prevEnd = prev && prev.length ? data[prev.length - 1] : null;
  const prevSame = prev && cur.length ? data[Math.min(cur.length, prev.length) - 1] : null;
  const ahead = curEnd && prevSame && prevSame.prev != null ? curEnd.cur >= prevSame.prev : null;
  const curColor = ahead == null ? 'var(--accent)' : ahead ? 'var(--good)' : 'var(--accent)';
  // ป้ายแกน x: ทุก 5 (1,5,10,…) + ตัวสุดท้าย — ไม่แน่น
  const ticks = data.filter((d, i) => i === 0 || (i + 1) % 5 === 0 || (i === n - 1 && n % 5 >= 3)).map(d => d.label);
  return (
    <ChartContainer config={mkCfg([['cur', curLabel], ['prev', prevLabel]])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={data} margin={{ top: 18, right: 16, bottom: 0, left: 0 }} aria-label={ariaLabel}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" tick={TICK} {...AXP} ticks={ticks} interval={0} />
        <YAxis tickFormatter={KFMT} tick={TICK} {...AXP} width={52} />
        <ChartTooltip cursor={{ stroke: 'var(--ink-4)', strokeDasharray: '3 3' }} content={<CumTip fmt={fmt || B} curLabel={curLabel} prevLabel={prevLabel} />} />
        {prev && <Area type="monotone" dataKey="prev" name={prevLabel} stroke="var(--ink-4)" strokeWidth={1.6} strokeDasharray="5 4" fill="transparent" dot={false} isAnimationActive={false} connectNulls={false} />}
        <Area type="monotone" dataKey="cur" name={curLabel} stroke={curColor} strokeWidth={2.6} fill={curColor} fillOpacity={0.10} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} connectNulls={false} />
        {/* ปลายเส้น = จุดเปล่า — ป้าย "ชื่อเดือน + ตัวเลข" ถูกเอาออก (user 24 ส.ค.: รก)
            ชื่อเส้นอ่านได้จาก legend เหนือกราฟ · ตัวเลขดูได้จาก tooltip ตอน hover */}
        {curEnd && <ReferenceDot x={curEnd.label} y={curEnd.cur} r={4} fill={curColor} stroke="var(--surface)" strokeWidth={2} />}
        {prevEnd && prevEnd.prev != null && <ReferenceDot x={prevEnd.label} y={prevEnd.prev} r={3} fill="var(--ink-4)" stroke="var(--surface)" strokeWidth={2} />}
        {prevSame && prevSame !== prevEnd && prevSame.prev != null && <ReferenceDot x={prevSame.label} y={prevSame.prev} r={3} fill="var(--ink-4)" stroke="var(--surface)" strokeWidth={2} />}
        {todayIdx >= 0 && data[todayIdx] && <ReferenceLine x={data[todayIdx].label} stroke="var(--ink-4)" strokeDasharray="2 3" strokeWidth={1} label={{ value: 'วันนี้', position: 'top', fill: 'var(--ink-4)', fontSize: 10 }} />}
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- Pareto: แท่ง(ค่า) + เส้นสะสม%(80/20) ----
export function ParetoChart({ items, valKey = 'sales', height = 230, fmt, ariaLabel = 'กราฟพาเรโต' }) {
  const it = items || [];
  const total = it.reduce((a, x) => a + (x[valKey] || 0), 0);
  const chartData = [];
  let cum = 0;
  for (const x of it) {
    cum += (x[valKey] || 0);
    chartData.push({ key: x.key, value: x[valKey] || 0, cumPct: total ? Math.round(cum / total * 100) : 0 });
  }
  const parFmt = { value: fmt || B, cumPct: v => `สะสม ${v}%` };
  return (
    <ChartContainer config={mkCfg([['value', 'ยอดขาย'], ['cumPct', 'สะสม %']])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={chartData} margin={{ top: 4, right: 40, bottom: 30, left: 0 }} aria-label={ariaLabel}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="key" tick={{ fill: 'var(--ink)', fontSize: 11 }} {...AXP} interval={0} angle={-30} textAnchor="end" height={50} />
        <YAxis yAxisId="y" tick={TICK} {...AXP} width={52} />
        <YAxis yAxisId="y1" orientation="right" domain={[0, 100]} tickFormatter={v => v + '%'} tick={TICK} {...AXP} width={36} />
        <ChartTooltip content={<ChartTooltipContent formatter={tipRow(parFmt)} />} />
        <Bar yAxisId="y" dataKey="value" name="ยอดขาย" fill="#4338ca" fillOpacity={0.85} radius={4} maxBarSize={30} />
        <Line type="monotone" yAxisId="y1" dataKey="cumPct" name="สะสม %" stroke="#e39b2e" strokeWidth={2} dot={{ r: 2 }} />
      </ComposedChart>
    </ChartContainer>
  );
}

// ---- Heatmap (matrix) — HTML grid ----
export function Heatmap({ rows, cols, cell, fmt = (v) => N(v), color = '#4f46e5', height: _height, onCell }) {
  const all = [];
  (rows || []).forEach(r => (cols || []).forEach(c => all.push(cell(r, c) || 0)));
  const max = Math.max(1, ...all);
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `minmax(64px,auto) repeat(${(cols || []).length}, minmax(38px,1fr))`, gap: 3, minWidth: 'max-content' }}>
        <div />
        {(cols || []).map((c, i) => (
          <div key={i} className="cap" style={{ fontSize: 10, textAlign: 'center', color: 'var(--ink-3)', padding: '2px 0', whiteSpace: 'nowrap' }}>{c.label ?? c}</div>
        ))}
        {(rows || []).map((r, ri) => (
          <React.Fragment key={ri}>
            <div className="cap" style={{ fontSize: 11, color: 'var(--ink)', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', paddingRight: 6 }}>{r.label ?? r}</div>
            {(cols || []).map((c, ci) => {
              const v = cell(r, c) || 0;
              const a = v / max;
              return (
                <div key={ci} title={`${r.label ?? r} · ${c.label ?? c}: ${fmt(v)}`}
                  onClick={onCell ? () => onCell(r, c, v) : undefined}
                  style={{ aspectRatio: '1.4', minHeight: 26, borderRadius: 4, background: v ? hexA(color, 0.12 + a * 0.78) : 'var(--surface-2, rgba(130,140,160,.06))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: a > 0.55 ? '#fff' : 'var(--ink-3)', fontWeight: a > 0.55 ? 600 : 400, cursor: onCell ? 'pointer' : undefined }}>
                  {v ? fmt(v) : ''}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---- Sparkline — SVG ล้วน ----
export function Sparkline({ data = [], w = 120, h = 30, color = 'var(--accent)', fill = true, strokeW = 1.7 }) {
  const v = (data || []).map(n => Number(n) || 0);
  if (v.length < 2) return <svg width={w} height={h} aria-hidden="true" />;
  const min = Math.min(...v), max = Math.max(...v), span = (max - min) || 1;
  const x = i => (i / (v.length - 1)) * (w - 4) + 2;
  const y = n => h - 3 - ((n - min) / span) * (h - 6);
  const pts = v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
  const last = v.length - 1;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }} aria-hidden="true">
      {fill && <polygon points={`2,${h} ${pts} ${w - 2},${h}`} fill={color} opacity="0.09" />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(last)} cy={y(v[last])} r="2.4" fill={color} />
    </svg>
  );
}

// ---- Sparkline แบบ recharts gradient-fill (เฟี้ยวกว่า · ใช้ใน KPI hero / ตารางลาย) ----
let _gradSeq = 0;
export function GradientSparkline({ data = [], height = 36, color = '#4f46e5', strokeW = 2, ariaLabel = 'กราฟย่อแนวโน้ม' }) {
  const v = (data || []).map(n => Number(n) || 0);
  const gid = React.useMemo(() => `spark-grad-${_gradSeq++}`, []);
  if (v.length < 2) return <div style={{ height }} aria-hidden="true" />;
  const chartData = v.map((n, i) => ({ i, value: n }));
  return (
    <ChartContainer config={mkCfg([['value', 'ค่า']])} className={CC_CLS} style={{ height }}>
      <ComposedChart data={chartData} margin={{ top: 2, right: 1, bottom: 1, left: 1 }} aria-label={ariaLabel}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={strokeW} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ChartContainer>
  );
}
