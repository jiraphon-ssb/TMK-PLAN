/* ============================================================
   crmBlocks.jsx — บล็อก "ลูกค้า & CRM" ของกลาง (รื้อรอบ 2 · 22 ส.ค. 69)
   ============================================================
   ใช้ร่วม 2 ที่: แท็บ "ลูกค้า & CRM" ในรายงานขาย (สโคป = ช่วง/ตัวกรองหน้า) และหน้า "ภาพรวม CRM" (สโคป = เดือน/ทีม CRM)
   แนวคิด: CRM = "คน" ไม่ใช่ตาราง KPI → ฐานลูกค้าเป็นวงจรชีวิต 5 ขั้น + เกจซื้อซ้ำ · การ์ดคนที่ควรติดต่อ · cohort กลับมาซื้อ
   - customerStats / stageOf / STAGES : สถิติลูกค้าจากออเดอร์ + ขั้นวงจรชีวิต (ใหม่ · ครั้งเดียว · ซื้อซ้ำ · ขาประจำ · เสี่ยงหลุด) — pure
   - CustomerHero         : เลขใหญ่ฐานลูกค้า + แถบวงจรชีวิต (คลิกกรอง) | เกจอัตราซื้อซ้ำ เทียบเป้า 35%
   - ContactCards         : การ์ดคนที่ควรติดต่อ (avatar · เหตุผล · ยอด · เบอร์) กลุ่ม เสี่ยงหลุด / ใหม่รอซื้อซ้ำ
   - NewOldDailyChart     : ใหม่/เก่า รายวัน + เส้น %ซื้อซ้ำ + เส้นประช่วงก่อน
   - ChannelNewOldRows    : ใหม่/เก่า ต่อช่องทาง
   - RfmTiles             : ระดับลูกค้า 4 ไทล์ (คลิกกรองตาราง)
   - CrmTeamStrip         : แถบทีม CRM บรรทัดเดียว (ยอด · LINE/โทร · เป้า · โทร) + ลิงก์หน้า CRM
   - CallActivityPanel / crmNotesSummary / CrmActivity : กิจกรรมโทรจากบันทึกประจำวัน (แผงสรุป + ตารางรายวัน)
   - cohortRetention / CohortMatrix : ลูกค้าใหม่แต่ละเดือน กลับมาซื้อซ้ำกี่ % ใน M+1..M+3
   - CustomerTable        : รายชื่อลูกค้า (ค้นหา · ระดับ · ขั้นวงจร · CSV · คลิก = drawer)
   สูตรทั้งหมดใช้ของเดิม: customerAgg/rfmTiers (saleAgg) · normNoteData (crmDailyNote) · REPEAT_TARGET (salesOverviewAgg)
   ============================================================ */
import { useState, useMemo } from 'react';
import { N, Icon, PersonAvatar, Ring } from './components.jsx';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SearchInput } from '@/components/ui/search-input';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { CardTable } from './components/DataTableParts.jsx';
import { ExportBtn } from './saleDashboardChrome.jsx';
import { contactBadge, dueRows, cadenceDays } from './lib/crmContacts.js';
import { followUpStatus } from './lib/crmFollowUp.js';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DailySalesChart, ZoneGauge } from './charts.jsx';
import { ChannelLogo, channelTint } from './lib/channelLogos.jsx';
import { customerAgg, rfmTiers } from './lib/saleAgg.js';
import { bucketKey, bucketLabel } from './lib/saleTime.js';
import { normNoteData } from './lib/crmDailyNote.js';
import { REPEAT_TARGET } from './lib/salesOverviewAgg.js';
import { baht, tierTone } from './lib/saleDashboardHelpers.js';
import { goSection } from './lib/appBus.js';
import { THAI_MONTHS } from './lib/dateUtils.js';

import { deltaPct } from './lib/deltaChip.js';
const TIER_CHIP = { 'เพชร': 'tier-chip-diamond', 'ทอง': 'tier-chip-gold', 'เงิน': 'tier-chip-silver', 'ทองแดง': 'tier-chip-bronze' };
const NEW_C = 'var(--info)', OLD_C = 'var(--good)';
const R = { textAlign: 'right' };
const Bk = (n) => { const v = Math.round(Number(n) || 0); return v >= 1000 ? '฿' + (v / 1000).toFixed(v >= 100000 ? 0 : 1) + 'k' : '฿' + v; };

/* ---------- วงจรชีวิตลูกค้า 5 ขั้น (exclusive · รวม = ลูกค้าทั้งหมด) ---------- */
export const STAGES = [
  { key: 'ใหม่', color: 'var(--info)', hint: 'ซื้อครั้งแรก ≤21 วัน' },
  { key: 'ครั้งเดียว', color: 'var(--ink-4)', hint: 'ซื้อครั้งเดียว >21 วัน · รอซื้อซ้ำ' },
  { key: 'ซื้อซ้ำ', color: 'var(--accent)', hint: 'ซื้อแล้ว 2 ครั้ง' },
  { key: 'ขาประจำ', color: 'var(--good)', hint: 'ซื้อ ≥3 ครั้ง · ยังเคลื่อนไหว' },
  { key: 'เสี่ยงหลุด', color: 'var(--bad)', hint: 'เคยซื้อ ≥2 ครั้ง · เงียบ ≥35 วัน' },
];
export const stageOf = (r) => r.flag === 'ใหม่' ? 'ใหม่' : r.flag === 'เสี่ยงหลุด' ? 'เสี่ยงหลุด' : r.flag === 'ขาประจำ' ? 'ขาประจำ' : r.orders >= 2 ? 'ซื้อซ้ำ' : 'ครั้งเดียว';
const stageColor = (k) => STAGES.find(s => s.key === k)?.color || 'var(--ink-4)';
const isWaiting = (r) => r.flag === '' && r.orders === 1 && r.recency != null && r.recency >= 21 && r.recency <= 45; // ซื้อครั้งเดียว 21–45 วันก่อน = รอซื้อซ้ำ

/* ---------- สถิติลูกค้า (pure) ---------- */
export function customerStats(ords, asOf) {
  const live = (ords || []).filter(o => String(o.status || '').toLowerCase() !== 'cancelled');
  const custs = customerAgg(live);
  const { rows, summary } = rfmTiers(custs, asOf);
  const customers = rows.length;
  const newC = live.filter(o => o.customer_type === 'ลูกค้าใหม่').length, oldC = live.filter(o => o.customer_type === 'ลูกค้าเก่า').length;
  const repeatC = rows.filter(r => r.orders > 1).length;
  const sales = rows.reduce((a, r) => a + r.sales, 0), orders = rows.reduce((a, r) => a + r.orders, 0);
  const phones = new Map(); live.forEach(o => { if (o.customer_code && (o.customer_phone || o.customer_social)) phones.set(o.customer_code, o.customer_phone || o.customer_social); });
  const contactable = rows.filter(r => phones.has(r.code)).length;
  const stages = {}; STAGES.forEach(s => { stages[s.key] = { count: 0, sales: 0 }; });
  rows.forEach(r => { const g = stages[stageOf(r)]; g.count += 1; g.sales += r.sales; });
  return {
    rows, summary, customers, newC, oldC, sales, orders, stages,
    newPct: (newC + oldC) ? newC / (newC + oldC) * 100 : null,
    repeatC, repeatPct: customers ? repeatC / customers * 100 : null,
    clv: customers ? sales / customers : null, freq: customers ? orders / customers : null,
    atRisk: stages['เสี่ยงหลุด'].count,
    waiting: rows.filter(isWaiting).length,
    contactable, contactPct: customers ? contactable / customers * 100 : null, phones,
  };
}
// สูตรส่วนต่าง = lib/deltaChip.js ที่เดียว
const dPct = (c, p, prevLabel, goodUp = true) => { const d = deltaPct(c, p, { goodUp }); return d && { ...d, title: `${prevLabel}: ${typeof p === 'number' && p >= 100 ? N(Math.round(p)) : (Math.round(p * 100) / 100)}` }; };
const dPt = (c, p, prevLabel, goodUp = true) => (c != null && p != null ? (() => { const d = Math.round(c - p); return { txt: (d >= 0 ? '+' : '−') + Math.abs(d) + ' pt', dir: d >= 0 ? 1 : -1, good: goodUp ? d >= 0 : d <= 0, title: `${prevLabel}: ${Math.round(p)}%` }; })() : null);
export function DeltaChip({ d, size = 12 }) {
  if (!d) return null;
  const tone = d.good == null ? 'var(--ink-3)' : d.good ? 'var(--good)' : 'var(--bad)';
  return <span className="kpi-delta num" title={d.title} style={{ color: tone, background: `color-mix(in srgb, ${tone} 13%, transparent)`, fontSize: size }}><Icon name={d.dir >= 0 ? 'up' : 'down'} />{d.txt}</span>;
}

/* ---------- HERO: ฐานลูกค้า + วงจรชีวิต | เกจอัตราซื้อซ้ำ ---------- */
export function CustomerHero({ cur, prev = null, cmp = false, prevLabel = 'ช่วงก่อน', label = '', stageSel = 'all', onStage, eyebrow = 'ฐานลูกค้า' }) {
  const P = cmp && prev ? prev : null;
  const tot = Math.max(1, cur.customers);
  const rp = cur.repeatPct, hasRp = rp != null;
  const ratio = hasRp ? Math.round(rp) / REPEAT_TARGET : 0;   // เทียบด้วยเลขที่โชว์ (35% = ถึงเป้า ไม่ใช่ 34.8 → ใกล้เป้า)
  const tone = !hasRp ? 'var(--ink-3)' : ratio >= 1 ? 'var(--good)' : ratio >= 0.57 ? 'var(--warn)' : 'var(--bad)';
  const verdict = !hasRp ? '' : ratio >= 1 ? 'ถึงเป้าซื้อซ้ำ' : ratio >= 0.57 ? 'ใกล้เป้าซื้อซ้ำ' : 'ต่ำกว่าเป้าซื้อซ้ำ';
  const dRepeat = P ? dPt(rp, P.repeatPct, prevLabel) : null;
  const mini = [
    { l: 'CLV/คน', v: cur.clv == null ? '—' : baht(cur.clv), d: P ? dPct(cur.clv, P.clv, prevLabel) : null, tip: 'ยอดขายในช่วง ÷ จำนวนลูกค้า' },
    { l: 'ซื้อเฉลี่ย', v: cur.freq == null ? '—' : cur.freq.toFixed(2) + ' ครั้ง', d: P ? dPct(cur.freq, P.freq, prevLabel) : null, tip: 'ออเดอร์ ÷ ลูกค้า' },
    { l: 'ใหม่/เก่า (ออเดอร์)', v: cur.newPct == null ? '—' : `${Math.round(cur.newPct)}% ใหม่`, d: P ? dPt(cur.newPct, P.newPct, prevLabel) : null, tip: `ใหม่ ${N(cur.newC)} · เก่า ${N(cur.oldC)} ออเดอร์` },
    { l: 'ติดต่อได้', v: cur.contactPct == null ? '—' : `${Math.round(cur.contactPct)}%`, d: null, tip: `${N(cur.contactable)} คนมีเบอร์/ไอดี` },
  ];
  return (
    <Card className="p-[22px]">
      <div className="hero-bento">
        <div className="hero-total" style={{ minWidth: 0 }}>
          <div className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, letterSpacing: '.2px' }}>{eyebrow}{label ? <span style={{ fontWeight: 400 }}> · {label}</span> : null}</div>
          <div className="row" style={{ gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2 }}>
            <span className="num" style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.05, color: 'var(--ink)' }}>{N(cur.customers)}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-3)' }}>ลูกค้าที่ซื้อ</span>
            {P && <DeltaChip d={dPct(cur.customers, P.customers, prevLabel)} size={13} />}
            <span className="cap" style={{ color: 'var(--ink-4)' }}>{N(cur.orders)} ออเดอร์ · {baht(cur.sales)}</span>
          </div>
          <div className="row" style={{ gap: '6px 22px', flexWrap: 'wrap', marginTop: 10 }}>
            {mini.map(m => <span key={m.l} className="cap" title={m.tip} style={{ color: 'var(--ink-4)' }}>{m.l} <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 700, fontSize: 13 }}>{m.v}</b> {m.d && <DeltaChip d={m.d} size={11} />}</span>)}
          </div>
          {/* แถบวงจรชีวิต */}
          <div style={{ marginTop: 18 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span className="cap" style={{ color: 'var(--ink-3)', fontWeight: 700 }}>วงจรชีวิตลูกค้า <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>· ลูกค้าแต่ละคนอยู่ขั้นไหน{onStage ? ' · คลิกขั้น = กรองรายชื่อ' : ''}</span></span>
              {stageSel !== 'all' && onStage && <button type="button" className="cap text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }} onClick={() => onStage('all')}>ล้างตัวกรอง</button>}
            </div>
            <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)', marginTop: 8 }} role="img" aria-label={STAGES.map(s => `${s.key} ${cur.stages[s.key].count}`).join(' · ')}>
              {STAGES.map(s => { const c = cur.stages[s.key].count; return c ? <span key={s.key} title={`${s.key}: ${N(c)} คน (${Math.round(c / tot * 100)}%)`} style={{ width: `${c / tot * 100}%`, background: s.color, opacity: stageSel === 'all' || stageSel === s.key ? 1 : 0.3, transition: 'opacity .2s', minWidth: 2 }} /> : null; })}
            </div>
            <div className="lc-stages" style={{ marginTop: 8 }}>
              {STAGES.map(s => { const g = cur.stages[s.key]; const pc = cur.customers ? Math.round(g.count / cur.customers * 100) : 0; const on = stageSel === s.key; const pd = P ? dPct(g.count, P.stages?.[s.key]?.count ?? 0, prevLabel, s.key !== 'เสี่ยงหลุด' && s.key !== 'ครั้งเดียว') : null; return (
                <button type="button" key={s.key} disabled={!onStage} onClick={onStage ? () => onStage(on ? 'all' : s.key) : undefined} title={`${s.hint} · ${baht(g.sales)}`}
                  className={'lc-stage' + (on ? ' on' : '')} style={{ textAlign: 'left', padding: '7px 9px', borderRadius: 10, border: `1px solid ${on ? s.color : 'var(--line)'}`, background: on ? `color-mix(in srgb, ${s.color} 10%, var(--surface))` : 'var(--surface)', minWidth: 0, cursor: onStage ? 'pointer' : 'default' }}>
                  <span className="row cap" style={{ gap: 5, color: 'var(--ink-3)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flex: 'none' }} />{s.key}</span>
                  <span className="row" style={{ gap: 6, alignItems: 'baseline', marginTop: 2 }}><b className="num" style={{ fontSize: 20, fontWeight: 800, color: g.count ? 'var(--ink)' : 'var(--ink-4)', letterSpacing: '-.3px' }}>{N(g.count)}</b><span className="cap num" style={{ color: 'var(--ink-4)' }}>{pc}%</span></span>
                  {pd && <span style={{ display: 'block', marginTop: 2 }}><DeltaChip d={pd} size={10} /></span>}
                </button>
              ); })}
            </div>
          </div>
        </div>
        {/* เกจซื้อซ้ำ */}
        <div className="hero-target" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-.2px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>อัตราซื้อซ้ำ</h3>
              {hasRp && <span className="kpi-delta" style={{ color: tone, background: 'transparent', border: `1.5px solid color-mix(in srgb, ${tone} 55%, transparent)`, fontSize: 12, padding: '1px 9px' }}>{verdict}</span>}
            </div>
            <span className="cap num" style={{ color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>เป้า <b style={{ color: 'var(--ink-2)', fontWeight: 700, fontSize: 13 }}>≥ {REPEAT_TARGET}%</b></span>
          </div>
          <div style={{ margin: '8px auto 0', width: '100%', maxWidth: 300 }} title={`ลูกค้าที่สั่ง ≥2 ครั้งในช่วง ÷ ลูกค้าทั้งหมด · แดง <${Math.round(REPEAT_TARGET * 0.57)}% · เหลือง ถึง ${REPEAT_TARGET}% · เขียว ≥ ${REPEAT_TARGET}%`}>
            <ZoneGauge value={hasRp ? ratio : 0} max={1.3} zones={[{ to: 0.57, color: 'var(--bad)' }, { to: 1, color: 'var(--warn)' }, { to: 1.3, color: 'var(--good)' }]} height={150}
              text={hasRp ? `${Math.round(rp)}%` : '—'} subText={hasRp ? `${N(cur.repeatC)} จาก ${N(cur.customers)} คน` : 'ไม่มีลูกค้าในช่วง'} textColor={tone} ariaLabel="อัตราซื้อซ้ำ" />
          </div>
          <div style={{ textAlign: 'center', marginTop: 6, minHeight: 24 }}>
            {dRepeat ? <span className="row" style={{ gap: 6, justifyContent: 'center', alignItems: 'center' }}><DeltaChip d={dRepeat} /><span className="cap" style={{ color: 'var(--ink-4)' }}>เทียบ {prevLabel}</span></span> : null}
          </div>
          <div className="cap" style={{ textAlign: 'center', color: 'var(--ink-4)', marginTop: 6 }}>
            ขาประจำ <b className="num" style={{ color: 'var(--good)', fontWeight: 700 }}>{N(cur.stages['ขาประจำ'].count)}</b> · เสี่ยงหลุด <b className="num" style={{ color: cur.atRisk ? 'var(--bad)' : 'var(--ink-3)', fontWeight: 700 }}>{N(cur.atRisk)}</b> · รอซื้อซ้ำ <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{N(cur.waiting)}</b>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- การ์ดคนที่ควรติดต่อ ---------- */
export function ContactCards({ rows = [], onPick, phones, title = 'ควรติดต่อตอนนี้', limit = 8, sub, contacts = null, onLog, today, tasks = null, onFollowUp }) {
  const [grp, setGrp] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const [showDone, setShowDone] = useState(false);   // ปกติซ่อนคนที่ติดต่อ/เลื่อนแล้ว → ลิสต์เหลือเฉพาะงานที่ยังไม่ทำ
  const canLog = !!onLog && !!today;
  const todayISO = today || '';
  const badgeOf = (r) => (contacts ? contactBadge(r.key || r.code, contacts, todayISO) : null);
  const risk = rows.filter(r => r.flag === 'เสี่ยงหลุด').map(r => ({ ...r, why: `${r.orders >= 3 ? 'ขาประจำ' : 'เคยซื้อซ้ำ'} · เงียบ ${N(r.recency)} วัน`, tone: 'var(--bad)', grp: 'risk' }));
  const wait = rows.filter(isWaiting).map(r => ({ ...r, why: `ซื้อครั้งแรก ${N(r.recency)} วันก่อน · ชวนซื้อซ้ำ`, tone: 'var(--accent)', grp: 'wait' }));
  // ถึงรอบติดตามที่ตั้งไว้เอง (cadence ในโปรไฟล์) — เดิมกรอกไว้เฉยๆ ไม่มีอะไรเอาไปใช้ (PART 110)
  const dueKeys = new Set([...risk, ...wait].map(r => r.key || r.code));
  const cadence = rows.filter(r => { const d = cadenceDays(r.cadence); return d > 0 && Number(r.recency) >= d && !dueKeys.has(r.key || r.code); })
    .map(r => ({ ...r, why: `ถึงรอบติดตาม (ทุก ${cadenceDays(r.cadence)} วัน) · เงียบ ${N(r.recency)} วัน`, tone: 'var(--warn)', grp: 'cadence' }));
  const all = [...risk, ...wait, ...cadence].sort((a, b) => b.sales - a.sales);
  const base = grp === 'risk' ? risk.sort((a, b) => b.sales - a.sales) : grp === 'wait' ? wait.sort((a, b) => b.sales - a.sales) : grp === 'cadence' ? cadence.sort((a, b) => b.sales - a.sales) : all;
  // ตัดคนที่ "ติดต่อไปแล้ววันนี้ / เลื่อนนัดไว้" ออก (PART 110) — เดิมคนเดิมโผล่ทุกวันไม่มีวันหมด
  const list = (contacts && !showDone) ? dueRows(base, contacts, todayISO) : base;
  // จำนวน "ทำแล้ว" ต้องนับเฉพาะคนในลิสต์กลุ่มนี้ — เดิมนับลูกค้าทั้งหมดที่ติดต่อวันนี้ (รวมคนที่ไม่ได้อยู่ในลิสต์)
  // ทำให้กด "ทำแล้ว 10" แล้วมีชื่อโผล่มาแค่ 2 = ตัวเลขกับของที่เห็นไม่ตรงกัน
  const doneCount = contacts ? base.filter(r => { const b = badgeOf(r); return b && (b.kind === 'done' || b.kind === 'snooze'); }).length : 0;
  const shown = showAll ? list : list.slice(0, limit);
  const contactOf = (r) => r.contact || (phones && phones.get(r.code)) || '';
  const valueAtRisk = risk.reduce((a, r) => a + r.sales, 0);
  const CH = [['all', `ทั้งหมด ${N(all.length)}`], ['risk', `เสี่ยงหลุด ${N(risk.length)}`], ['wait', `ใหม่รอซื้อซ้ำ ${N(wait.length)}`],
    ...(cadence.length ? [['cadence', `ถึงรอบติดตาม ${N(cadence.length)}`]] : [])];
  return (
    <Card className="p-[22px]">
      <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <CardTitle className="m-0 text-base font-semibold">{title} <span className="dim">· {N(all.length)} คน</span></CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>{sub || <>เรียงตามยอดที่เคยซื้อ{valueAtRisk > 0 ? <> · ยอดที่เสี่ยงหาย <b className="num" style={{ color: 'var(--bad)', fontWeight: 700 }}>{baht(valueAtRisk)}</b></> : null} · คลิกการ์ด = ดูออเดอร์/ติดต่อ</>}</div>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {CH.map(([k, l]) => <button type="button" key={k} onClick={() => setGrp(k)} className="cap" style={{ padding: '4px 10px', borderRadius: 999, border: `1px solid ${grp === k ? 'var(--ink-2)' : 'var(--line)'}`, background: grp === k ? 'var(--ink-2)' : 'var(--surface)', color: grp === k ? 'var(--surface)' : 'var(--ink-3)', fontWeight: 600 }}>{l}</button>)}
          {contacts && doneCount > 0 && (
            <button type="button" onClick={() => setShowDone(v => !v)} className="cap" title="คนที่ติดต่อแล้ววันนี้ / เลื่อนนัดไว้"
              style={{ padding: '4px 10px', borderRadius: 999, border: `1px solid ${showDone ? 'var(--good)' : 'var(--line)'}`, background: showDone ? 'var(--good-soft)' : 'var(--surface)', color: showDone ? 'var(--good)' : 'var(--ink-4)', fontWeight: 600 }}>
              {showDone ? 'ซ่อนที่ทำแล้ว' : `ทำแล้ว ${N(doneCount)}`}
            </button>
          )}
        </div>
      </div>
      {shown.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
          {shown.map(r => { const ct = contactOf(r); const bd = badgeOf(r); return (
            <div key={r.code || r.key} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} onClick={onPick ? () => onPick(r) : undefined} onKeyDown={onPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r); } } : undefined}
              className={'contact-card' + (onPick ? ' cursor-pointer' : '')} style={{ border: '1px solid var(--line)', borderLeft: `3px solid ${r.tone}`, borderRadius: 12, padding: '10px 12px', minWidth: 0, background: 'var(--surface)' }}>
              <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
                <PersonAvatar name={r.name || r.code} size={34} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || r.code}</div>
                  <div className="cap" style={{ color: r.tone, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.why}</div>
                </div>
                {r.tier && <span className={`tier-chip ${TIER_CHIP[r.tier] || ''}`} style={{ flex: 'none' }}>{r.tier}</span>}
              </div>
              <div className="row cap" style={{ justifyContent: 'space-between', gap: 8, marginTop: 8, color: 'var(--ink-4)', minWidth: 0 }}>
                <span className="num" style={{ whiteSpace: 'nowrap' }}><b style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 13 }}>{baht(r.sales)}</b> · {N(r.orders)} ครั้ง</span>
                <span className="row num" style={{ gap: 4, color: ct ? 'var(--ink-3)' : 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}><Icon name="phone" />{ct || 'ไม่มีเบอร์'}</span>
              </div>
              {/* บันทึกผลการติดต่อ 1 คลิก (PART 110) — กดแล้วชื่อหลุดออกจากลิสต์วันนี้ */}
              {(canLog || bd || onFollowUp) && (
                <div className="row" style={{ gap: 5, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                  {bd && <span className="cap" style={{ color: bd.tone, fontWeight: 600, whiteSpace: 'nowrap' }}>{bd.text}</span>}
                  {/* งานติดตามในระบบโครงการ (PART 111) — ใช้ได้เลย ไม่ต้องรอ migration ของบันทึกการติดต่อ */}
                  {onFollowUp && (() => {
                    const fu = tasks ? followUpStatus(tasks, r.key || r.code, today) : null;
                    return fu && fu.open > 0
                      ? <span className="cap" style={{ color: fu.overdue ? 'var(--bad)' : 'var(--ink-3)', fontWeight: 600, whiteSpace: 'nowrap' }} title="มีงานติดตามในบอร์ดอยู่แล้ว">มีงานค้าง {N(fu.open)}</span>
                      : <button type="button" className="crm-log-btn" style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }} onClick={() => onFollowUp(r)} title="สร้างงานติดตามในบอร์ดโครงการ">+ งาน</button>;
                  })()}
                  {canLog && <>
                    <button type="button" className="crm-log-btn" style={{ borderColor: 'var(--good)', color: 'var(--good)' }}
                      onClick={() => onLog(r, { result: 'answered' })} title="โทรแล้ว ลูกค้ารับสาย">รับสาย</button>
                    <button type="button" className="crm-log-btn" style={{ borderColor: 'var(--warn)', color: 'var(--warn)' }}
                      onClick={() => onLog(r, { result: 'no_answer' })} title="โทรแล้ว ไม่รับสาย">ไม่รับ</button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="crm-log-btn" style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }} title="เลื่อนไปติดต่อวันหลัง">เลื่อน</button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {[3, 7, 14, 30].map(d => <DropdownMenuItem key={d} onSelect={() => onLog(r, { result: 'snooze', snoozeDays: d })}>เลื่อนไปอีก {d} วัน</DropdownMenuItem>)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>}
                </div>
              )}
            </div>
          ); })}
        </div>
      ) : <div className="cap" style={{ color: 'var(--ink-4)', padding: '18px 0', textAlign: 'center' }}>ไม่มีลูกค้าที่ต้องตามในกลุ่มนี้</div>}
      {list.length > limit && <button type="button" onClick={() => setShowAll(v => !v)} className="cap mt-3 text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }}>{showAll ? `ย่อเหลือ ${limit}` : `ดูทั้งหมด ${N(list.length)} คน`}</button>}
    </Card>
  );
}

/* ---------- ใหม่/เก่า รายวัน + เส้น %ซื้อซ้ำ ---------- */
export function NewOldDailyChart({ ords, prevOrds = [], bks, prevBks = [], gran, cmp, curLabel, prevLabel, onDayClick, height = 250 }) {
  const byB = {}; (ords || []).forEach(o => { if (String(o.status || '').toLowerCase() === 'cancelled') return; const b = bucketKey(o.order_date, gran); const g = byB[b] || (byB[b] = { n: 0, o: 0 }); if (o.customer_type === 'ลูกค้าใหม่') g.n += 1; else if (o.customer_type === 'ลูกค้าเก่า') g.o += 1; });
  const pByB = {}; (prevOrds || []).forEach(o => { if (o.customer_type !== 'ลูกค้าใหม่') return; const b = bucketKey(o.order_date, gran); pByB[b] = (pByB[b] || 0) + 1; });
  const labels = bks.map((b, i) => gran === 'day' ? ((i === 0 || b.endsWith('-01')) ? bucketLabel(b, 'day') : String(Number(b.slice(8, 10)))) : bucketLabel(b, gran).replace(/ \(.*/, ''));
  const tipLabels = bks.map(b => bucketLabel(b, gran));
  const weekend = gran === 'day' ? bks.map(b => { const w = new Date(b + 'T00:00:00').getDay(); return w === 0 || w === 6; }) : undefined;
  const datasets = [{ label: 'ลูกค้าใหม่', data: bks.map(b => byB[b]?.n || 0), color: NEW_C }, { label: 'ลูกค้าเก่า', data: bks.map(b => byB[b]?.o || 0), color: OLD_C }];
  const repeat = bks.map(b => { const g = byB[b]; const t = g ? g.n + g.o : 0; return t ? Math.round(g.o / t * 100) : null; });
  const prevSeries = cmp && prevBks.length ? bks.map((_, i) => (prevBks[i] ? (pByB[prevBks[i]] || 0) : null)) : null;
  const unit = gran === 'day' ? 'วัน' : gran === 'week' ? 'สัปดาห์' : 'เดือน';
  const totN = datasets[0].data.reduce((a, v) => a + v, 0), totO = datasets[1].data.reduce((a, v) => a + v, 0);
  return (
    <Card className="p-[22px] min-w-0">
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <CardTitle className="m-0 text-base font-semibold">ลูกค้าใหม่ vs เก่า ราย{unit} <span className="dim">· {curLabel}</span></CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>แท่ง = ออเดอร์จากลูกค้าใหม่/เก่า · เส้น = %ซื้อซ้ำของ{unit}นั้น (แกนขวา · ขีดเขียว = เป้า {REPEAT_TARGET}%){prevSeries ? ` · เส้นประ = ลูกค้าใหม่ ${prevLabel} วันเดียวกัน` : ''}{gran === 'day' && onDayClick ? ' · คลิกวันดูออเดอร์ทั้งวัน' : ''}</div>
        </div>
        <div className="row cap" style={{ gap: 12, color: 'var(--ink-4)' }}><span>ใหม่ <b className="num" style={{ color: NEW_C, fontWeight: 700 }}>{N(totN)}</b></span><span>เก่า <b className="num" style={{ color: OLD_C, fontWeight: 700 }}>{N(totO)}</b></span></div>
      </div>
      <DailySalesChart labels={labels} tipLabels={tipLabels} datasets={datasets} orders={repeat} weekend={weekend} prevValues={prevSeries} prevLabel={`ลูกค้าใหม่ ${prevLabel}`}
        fmt={N} axisFmt={(v) => N(v)} ordersLabel="%ซื้อซ้ำ" ordersFmt={(v) => (v == null ? '—' : Math.round(v) + '%')} rightRef={REPEAT_TARGET} emptyText="ไม่มีออเดอร์" clickText="คลิกเพื่อดูออเดอร์ทั้งวัน" height={height}
        onBarClick={gran === 'day' && onDayClick ? (i) => { const k = bks[i]; if (k) onDayClick(k); } : undefined} />
      <div className="cap row" style={{ gap: 6, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap', color: 'var(--ink-4)' }}>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: NEW_C }} /> ลูกค้าใหม่</span>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: OLD_C }} /> ลูกค้าเก่า</span>
        <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px solid var(--ink-3)' }} /> %ซื้อซ้ำ/{unit}</span>
        <span className="row" style={{ gap: 6 }}><span style={{ width: 16, borderTop: '2px dashed var(--good)' }} /> เป้า {REPEAT_TARGET}%</span>
        {prevSeries && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px dashed var(--accent-2)' }} /> ใหม่ {prevLabel} วันเดียวกัน</span>}
      </div>
    </Card>
  );
}

/* ---------- ใหม่/เก่า ต่อช่องทาง (แถว) ---------- */
export function ChannelNewOldRows({ byChannel = [], onPick }) {
  const rows = [...byChannel].filter(g => g.total > 0).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map(g => g.total));
  return (
    <Card className="p-[22px] flex flex-col min-w-0">
      <CardTitle className="m-0 text-base font-semibold mb-[6px]">ช่องทางไหนพาลูกค้าใหม่มา</CardTitle>
      <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>แถบ = ออเดอร์ใหม่ / เก่า · %เก่า = ซื้อซ้ำของช่องนั้น{onPick ? ' · กด = กรองทั้งหน้า' : ''}</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {rows.map(g => { const tint = channelTint(g.ch); const rp = g.total ? Math.round(g.oldC / g.total * 100) : 0; return (
          <div key={g.ch} role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} onClick={onPick ? () => onPick('channel', g.ch) : undefined} onKeyDown={onPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick('channel', g.ch); } } : undefined}
            title={`${g.ch}: ใหม่ ${N(g.newC)} · เก่า ${N(g.oldC)} ออเดอร์`} className={'rounded-lg px-2 py-1.5 -mx-2 transition-colors overflow-hidden' + (onPick ? ' cursor-pointer hover:bg-muted/50' : '')}>
            <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
              <span className="ch-logo" style={{ width: 26, height: 26, borderRadius: 8, color: tint, background: `color-mix(in srgb, ${tint} 14%, var(--surface))`, flex: 'none' }}><ChannelLogo name={g.ch} size={14} /></span>
              <span style={{ flex: '0 0 76px', fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.ch}</span>
              <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', display: 'flex', minWidth: 30 }}>
                <span style={{ width: `${g.newC / max * 100}%`, background: NEW_C }} /><span style={{ width: `${g.oldC / max * 100}%`, background: OLD_C }} />
              </span>
              <span className="num cap" style={{ flex: '0 0 auto', textAlign: 'right', whiteSpace: 'nowrap' }}><b style={{ color: NEW_C, fontWeight: 700 }}>{N(g.newC)}</b>/<b style={{ color: OLD_C, fontWeight: 700 }}>{N(g.oldC)}</b></span>
              <span className="num cap" style={{ flex: '0 0 44px', textAlign: 'right', whiteSpace: 'nowrap', color: rp >= REPEAT_TARGET ? 'var(--good)' : 'var(--ink-4)', fontWeight: 600 }}>{rp}%</span>
            </div>
          </div>
        ); })}
        {!rows.length && <div className="cap" style={{ color: 'var(--ink-4)', padding: 12, textAlign: 'center' }}>ไม่มีข้อมูล</div>}
      </div>
    </Card>
  );
}

/* ---------- ระดับลูกค้า (RFM) 4 ไทล์ ---------- */
export function RfmTiles({ summary = [], sel = 'all', onPick, title = 'ระดับลูกค้า (RFM)', sub }) {
  const totC = summary.reduce((a, t) => a + t.count, 0);
  return (
    <Card className="p-[22px]">
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 10 }}>
        <CardTitle className="m-0 text-base font-semibold">{title} <span className="dim">· {N(totC)} คน</span></CardTitle>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>{sub || <>ต้องผ่านทั้ง ยอดซื้อ + ความถี่ + ความสดใหม่{onPick ? ' · คลิกระดับ = กรองรายชื่อ' : ''}</>}</span>
      </div>
      <div className="rfm-tiles">
        {summary.map(t => { const on = sel === t.key; const tone = tierTone[t.key] || t.color; return (
          <button type="button" key={t.key} disabled={!onPick} onClick={onPick ? () => onPick(on ? 'all' : t.key) : undefined} title={t.desc}
            style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: `1px solid ${on ? tone : 'var(--line)'}`, background: on ? `color-mix(in srgb, ${tone} 10%, var(--surface))` : 'var(--surface)', minWidth: 0, cursor: onPick ? 'pointer' : 'default' }}>
            <div className="row" style={{ gap: 6, alignItems: 'center' }}><span className={`tier-chip ${TIER_CHIP[t.key] || ''}`}>{t.key}</span><span className="cap num" style={{ color: 'var(--ink-4)', marginLeft: 'auto' }}>{totC ? Math.round(t.count / totC * 100) : 0}% ของคน</span></div>
            <div className="row" style={{ gap: 8, alignItems: 'baseline', marginTop: 6 }}><b className="num" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.4px', color: t.count ? 'var(--ink)' : 'var(--ink-4)' }}>{N(t.count)}</b><span className="cap" style={{ color: 'var(--ink-4)' }}>คน</span></div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 8 }}><span style={{ display: 'block', width: `${Math.round(t.sharePct * 100)}%`, height: '100%', background: tone }} /></div>
            <div className="cap num" style={{ color: 'var(--ink-4)', marginTop: 5 }}><b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{baht(t.sales)}</b> · {Math.round(t.sharePct * 100)}% ของยอด · เฉลี่ย {Bk(t.avg)}/คน</div>
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2, lineHeight: 1.35 }}>{t.desc}</div>
          </button>
        ); })}
      </div>
    </Card>
  );
}

/* ---------- สรุปกิจกรรมจากบันทึกประจำวัน (pure) ---------- */
export function crmNotesSummary(notes = []) {
  const a = { total: 0, answered: 0, d0: 0, d5: 0, rep: 0, d0a: 0, d5a: 0, repa: 0, upO: 0, upB: 0, free: 0, bday: 0, days: new Set(), rows: [] };
  (notes || []).forEach(nr => {
    const d = normNoteData(nr.data); const c = d.calls;
    const t = c.d0.total + c.d5.total + c.rep.total, an = c.d0.answered + c.d5.answered + c.rep.answered;
    a.total += t; a.answered += an; a.d0 += c.d0.total; a.d5 += c.d5.total; a.rep += c.rep.total; a.d0a += c.d0.answered; a.d5a += c.d5.answered; a.repa += c.rep.answered;
    a.upO += d.upsellOrders; a.upB += d.upsellBaht; a.free += d.freebieOrders; a.bday += d.birthdayOrders;
    if (t || d.upsellOrders || d.freebieOrders || d.birthdayOrders || (nr.note || '').trim()) a.days.add(nr.date);
    a.rows.push({ date: nr.date, seller: nr.salesperson, total: t, answered: an, d0: c.d0.total, d5: c.d5.total, rep: c.rep.total, upO: d.upsellOrders, upB: d.upsellBaht, free: d.freebieOrders, bday: d.birthdayOrders, note: (nr.note || d.extra || '').trim(), ask: d.ask, praise: d.praise, complaint: d.complaint });
  });
  a.ansPct = a.total ? Math.min(100, Math.round(a.answered / a.total * 100)) : null;   // กันกรอกรับ > โทร (ข้อมูลผิด) ไม่ให้โชว์เกิน 100%
  a.has = a.total > 0 || a.upO > 0 || a.free > 0 || a.bday > 0 || a.rows.some(r => r.note);
  a.rows.sort((x, y) => (x.date < y.date ? 1 : -1));
  return a;
}

/* ---------- แถบทีม CRM บรรทัดเดียว (ในแท็บรายงานขาย) ---------- */
export function CrmTeamStrip({ crmSales = 0, prevCrmSales = 0, lineSales = 0, phoneSales = 0, crmOrders = 0, target = 0, passed = 0, dim = 30, isCur = false, activity = null, cmp = false, prevLabel = 'ช่วงก่อน', team = [] }) {
  const d = cmp ? dPct(crmSales, prevCrmSales, prevLabel) : null;
  const pace = target > 0 && dim > 0 && passed > 0 ? (crmSales / (target * passed / dim)) : null;
  const tone = pace == null ? 'var(--ink-3)' : pace >= 1 ? 'var(--good)' : pace >= 0.6 ? 'var(--warn)' : 'var(--bad)';
  const tot = lineSales + phoneSales;
  const cell = { minWidth: 0 };
  const lbl = { color: 'var(--ink-4)' };
  return (
    <Card className="p-[16px_22px]">
      <div className="row" style={{ gap: '12px 26px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 10, alignItems: 'center', ...cell }}>
          <span className="row" style={{ gap: 0 }}>{(team.length ? team : ['CRM']).slice(0, 3).map((n, i) => <PersonAvatar key={n} name={n} size={30} className={i ? '-ml-2 ring-2 ring-[var(--surface)]' : ''} />)}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', whiteSpace: 'nowrap' }}>ทีม CRM</div>
            <div className="cap" style={{ ...lbl, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{team.length ? team.join(', ') : 'ยังไม่ตั้งเป้า CRM ใคร'} · LINE + โทร</div>
          </div>
        </div>
        <div style={cell}>
          <div className="cap" style={lbl}>ยอด CRM</div>
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}><span className="num" style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent-2)', letterSpacing: '-.4px' }}>{baht(crmSales)}</span><DeltaChip d={d} /><span className="cap" style={lbl}>{N(crmOrders)} ออเดอร์</span></div>
        </div>
        {tot > 0 && <div style={{ ...cell, flex: '1 1 160px', maxWidth: 260 }}>
          <div className="row cap" style={{ justifyContent: 'space-between', ...lbl }}><span>LINE <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{Math.round(lineSales / tot * 100)}%</b></span><span>โทร <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 600 }}>{Math.round(phoneSales / tot * 100)}%</b></span></div>
          <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)', marginTop: 4 }}><span style={{ width: `${lineSales / tot * 100}%`, background: channelTint('LINE') }} /><span style={{ width: `${phoneSales / tot * 100}%`, background: channelTint('Phone') }} /></div>
        </div>}
        <div style={cell}>
          <div className="cap" style={lbl}>เป้าเดือนนี้</div>
          {target > 0 ? <div className="row" style={{ gap: 8, alignItems: 'baseline' }}><span className="num" style={{ fontSize: 20, fontWeight: 800, color: tone }}>{Math.round(crmSales / target * 100)}%</span><span className="cap" style={lbl}>ของ {Bk(target)}{isCur && pace != null ? ` · ${pace >= 1 ? 'ตามเป้า' : pace >= 0.6 ? 'ใกล้เป้า' : 'หลุดเป้า'}` : ''}</span></div>
            : <div className="cap" style={{ ...lbl, marginTop: 2 }}>{isCur ? 'ยังไม่ตั้งเป้า' : 'แสดงเมื่อดูเดือนเดียว'}</div>}
        </div>
        <div style={cell}>
          <div className="cap" style={lbl}>กิจกรรมโทร</div>
          {activity?.has ? <div className="row" style={{ gap: 8, alignItems: 'baseline' }}><span className="num" style={{ fontSize: 20, fontWeight: 800 }}>{N(activity.total)}</span><span className="cap" style={lbl}>สาย · รับ {activity.ansPct == null ? '—' : activity.ansPct + '%'}{activity.upO ? ` · อัพเซลล์ ${N(activity.upO)}` : ''}</span></div>
            : <div className="cap" style={{ ...lbl, marginTop: 2 }}>ยังไม่มีบันทึกประจำวัน</div>}
        </div>
        <Button variant="outline" size="sm" className="h-8 ml-auto" onClick={() => goSection('catalog', 'crm')}>หน้าภาพรวม CRM <Icon name="arrowR" /></Button>
      </div>
    </Card>
  );
}

/* ---------- แผงกิจกรรมโทร (หน้าภาพรวม CRM) ---------- */
export function CallActivityPanel({ summary, daysTotal = 0, onNewNote, month, todayFilled = null, callsTarget = 0, answerTarget = 0 }) {
  const s = summary;
  const filled = s ? s.days.size : 0;
  const ansTone = s?.ansPct == null ? 'var(--ink-3)' : s.ansPct >= 70 ? 'var(--good)' : s.ansPct >= 50 ? 'var(--warn)' : 'var(--bad)';
  const types = s ? [{ k: '0DAY', v: s.d0, a: s.d0a, c: 'var(--info)' }, { k: '5DAY', v: s.d5, a: s.d5a, c: 'var(--accent)' }, { k: 'ชวนซื้อซ้ำ', v: s.rep, a: s.repa, c: 'var(--good)' }] : [];
  const tt = types.reduce((a, t) => a + t.v, 0);
  return (
    <Card className="p-[22px] flex flex-col min-w-0">
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div><CardTitle className="m-0 text-base font-semibold">กิจกรรมโทร <span className="dim">· {month}</span></CardTitle><div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>จากบันทึกประจำวันของเซลล์</div></div>
        {/* ยังไม่กรอกของวันนี้ = ปุ่มเด่น + จุดแดง (แพทเทิร์นเดียวกับปุ่มส่งยอด/ค่าแอด) */}
        {onNewNote && (
          <Button size="sm" className="h-8 relative" variant={todayFilled === false ? 'default' : 'outline'} onClick={onNewNote}
            title={todayFilled === false ? 'วันนี้ยังไม่ได้กรอกบันทึกประจำวัน' : 'แก้ไข/ดูบันทึกของวันนี้'}>
            <Icon name="pencil" /> บันทึกวันนี้
            {todayFilled === false && <span className="absolute -top-1 -right-1 size-2.5 rounded-full" style={{ background: 'var(--bad)', boxShadow: '0 0 0 2px var(--surface)' }} />}
          </Button>
        )}
      </div>
      {!s?.has ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '24px 0', textAlign: 'center', flex: 1, display: 'grid', placeItems: 'center' }}>ยังไม่มีบันทึกประจำวันในเดือนนี้{onNewNote ? ' — กด "บันทึกวันนี้" เพื่อเริ่ม' : ''}</div> : (<>
        <div className="row" style={{ gap: 16, alignItems: 'center' }}>
          <Ring pct={s.ansPct ?? 0} size={84} stroke={9} color={ansTone}><div><div className="num" style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: ansTone }}>{s.ansPct == null ? '—' : s.ansPct + '%'}</div><div className="cap" style={{ color: 'var(--ink-4)', fontSize: 10 }}>รับสาย</div></div></Ring>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 6, alignItems: 'baseline' }}><span className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.5px' }}>{N(s.total)}</span><span className="cap" style={{ color: 'var(--ink-4)' }}>สายที่โทร</span></div>
            <div className="cap" style={{ color: 'var(--ink-4)' }}>รับ {N(s.answered)} สาย · {daysTotal > 0 ? `เฉลี่ย ${(s.total / Math.max(1, filled)).toFixed(0)} สาย/วันที่บันทึก` : ''}</div>
            {/* เทียบเป้ากิจกรรม (PART 110) — ตั้งที่ ตั้งค่า › เป้า & คอม · ไม่ตั้ง = ไม่โชว์ */}
            {callsTarget > 0 && (() => { const p = Math.min(100, Math.round(s.total / callsTarget * 100)); return (
              <div style={{ marginTop: 6, minWidth: 150 }}>
                <div className="cap row" style={{ justifyContent: 'space-between', gap: 6, color: 'var(--ink-4)' }}>
                  <span>เป้าสาย/เดือน</span><span className="num" style={{ color: s.total >= callsTarget ? 'var(--good)' : 'var(--ink-3)', fontWeight: 700 }}>{N(s.total)}/{N(callsTarget)} · {p}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden', marginTop: 3 }}>
                  <span style={{ display: 'block', width: `${p}%`, height: '100%', background: s.total >= callsTarget ? 'var(--good)' : 'var(--accent)' }} />
                </div>
              </div>
            ); })()}
            {answerTarget > 0 && s.ansPct != null && (
              <div className="cap" style={{ marginTop: 4, color: s.ansPct >= answerTarget ? 'var(--good)' : 'var(--warn)', fontWeight: 600 }}>
                อัตรารับสาย {s.ansPct}% {s.ansPct >= answerTarget ? 'ถึงเป้า' : `· เป้า ${answerTarget}%`}
              </div>
            )}
          </div>
        </div>
        {tt > 0 && <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)' }} role="img" aria-label={types.map(t => `${t.k} ${t.v}`).join(' · ')}>{types.map(t => t.v ? <span key={t.k} title={`${t.k}: โทร ${N(t.v)} รับ ${N(t.a)}`} style={{ width: `${t.v / tt * 100}%`, background: t.c }} /> : null)}</div>
          <div className="row cap" style={{ gap: '4px 14px', marginTop: 6, flexWrap: 'wrap', color: 'var(--ink-4)' }}>{types.map(t => <span key={t.k} className="row" style={{ gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: t.c }} />{t.k} <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{N(t.v)}</b><span>รับ {t.v ? Math.min(100, Math.round(t.a / t.v * 100)) : 0}%</span></span>)}</div>
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginTop: 12 }}>
          {[['อัพเซลล์', s.upO ? `${N(s.upO)}` : '—', s.upB ? Bk(s.upB) : 'ออเดอร์'], ['แถม', s.free ? N(s.free) : '—', 'ออเดอร์'], ['วันเกิด', s.bday ? N(s.bday) : '—', 'ออเดอร์']].map(([l, v, u]) => (
            <div key={l} style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', minWidth: 0 }}><div className="cap" style={{ color: 'var(--ink-4)' }}>{l}</div><div className="row" style={{ gap: 5, alignItems: 'baseline' }}><b className="num" style={{ fontSize: 18, fontWeight: 800, color: v === '—' ? 'var(--ink-4)' : 'var(--ink)' }}>{v}</b><span className="cap num" style={{ color: 'var(--ink-4)' }}>{u}</span></div></div>
          ))}
        </div>
        {daysTotal > 0 && <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <div className="row cap" style={{ justifyContent: 'space-between', color: filled >= daysTotal ? 'var(--good)' : 'var(--warn)', fontWeight: 600 }}><span className="row" style={{ gap: 4 }}><Icon name={filled >= daysTotal ? 'check' : 'alertTriangle'} /> กรอกบันทึก {N(filled)}/{N(daysTotal)} วัน</span>{filled < daysTotal && <span>ขาด {N(daysTotal - filled)} วัน</span>}</div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 4 }}><span style={{ display: 'block', width: `${Math.min(100, filled / daysTotal * 100)}%`, height: '100%', background: filled >= daysTotal ? 'var(--good)' : 'var(--warn)' }} /></div>
        </div>}
      </>)}
    </Card>
  );
}

/* ---------- ตารางกิจกรรม CRM รายวัน (หน้าภาพรวม CRM) ---------- */
export function CrmActivity({ summary, daysTotal = 0, onEditDay, onNewNote, month, collapsible = false }) {
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(!collapsible);
  const rows = summary?.rows || [];
  const filled = summary ? summary.days.size : 0;
  const shown = showAll ? rows : rows.slice(0, 7);
  if (!summary?.has && collapsible) return null;
  return (
    <Card className="p-[22px]">
      <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: open ? 10 : 0 }}>
        <div>
          <CardTitle className="m-0 text-base font-semibold">บันทึกรายวัน <span className="dim">· {month}{daysTotal > 0 ? ` · กรอกแล้ว ${N(filled)}/${N(daysTotal)} วัน` : ''}</span></CardTitle>
          {open && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>โทร 0DAY/5DAY/ชวนซื้อซ้ำ · อัพเซลล์ · แถม · วันเกิด · โน้ต/เสียงลูกค้า · คลิกแถว = เปิดวันนั้น/แก้บันทึก</div>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          {onNewNote && !collapsible && <Button size="sm" className="h-8" onClick={onNewNote}><Icon name="pencil" /> บันทึกวันนี้</Button>}
          {collapsible && <Button variant="outline" size="sm" className="h-8" onClick={() => setOpen(v => !v)}>{open ? 'ซ่อนตาราง' : `ดูรายวัน ${N(rows.length)} รายการ`} <Icon name="chevD" style={open ? { transform: 'rotate(180deg)' } : undefined} /></Button>}
        </div>
      </div>
      {!open ? null : !summary?.has ? (
        <div className="cap" style={{ color: 'var(--ink-4)', padding: '14px 0', textAlign: 'center' }}>ยังไม่มีบันทึกประจำวันในเดือนนี้{onNewNote ? ' — กด "บันทึกวันนี้" เพื่อเริ่ม' : ''}</div>
      ) : (<>
        <CardTable className="[&_td]:py-[7px]"><Table>
          <TableHeader><TableRow>
            <TableHead>วันที่</TableHead><TableHead>เซลล์</TableHead>
            <TableHead style={R}>โทร</TableHead><TableHead style={R}>รับ%</TableHead>
            <TableHead style={R}>0DAY</TableHead><TableHead style={R}>5DAY</TableHead><TableHead style={R}>ซื้อซ้ำ</TableHead>
            <TableHead style={R}>อัพเซลล์</TableHead><TableHead style={R}>แถม</TableHead><TableHead style={R}>วันเกิด</TableHead>
            <TableHead>โน้ต</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {shown.map((r, i) => { const ap = r.total ? Math.min(100, Math.round(r.answered / r.total * 100)) : null; return (
              <TableRow key={r.date + r.seller + i} onClick={onEditDay ? () => onEditDay(r.date) : undefined} style={{ cursor: onEditDay ? 'pointer' : undefined }} title={onEditDay ? 'คลิกเปิดวันนี้ / แก้บันทึก' : undefined}>
                <TableCell className="cell-title num">{bucketLabel(r.date, 'day')}</TableCell>
                <TableCell className="cap">{r.seller}</TableCell>
                <TableCell className="num" style={R}>{r.total ? N(r.total) : <span style={{ color: 'var(--ink-4)' }}>—</span>}</TableCell>
                <TableCell className="num" style={{ ...R, color: ap == null ? 'var(--ink-4)' : ap >= 70 ? 'var(--good)' : 'var(--warn)', fontWeight: 600 }}>{ap == null ? '—' : ap + '%'}</TableCell>
                <TableCell className="num" style={R}>{r.d0 || '—'}</TableCell>
                <TableCell className="num" style={R}>{r.d5 || '—'}</TableCell>
                <TableCell className="num" style={R}>{r.rep || '—'}</TableCell>
                <TableCell className="num" style={R}>{r.upO ? `${N(r.upO)}${r.upB ? ` · ${Bk(r.upB)}` : ''}` : '—'}</TableCell>
                <TableCell className="num" style={R}>{r.free || '—'}</TableCell>
                <TableCell className="num" style={R}>{r.bday || '—'}</TableCell>
                <TableCell className="cap" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={[r.note, r.ask && `ถาม: ${r.ask}`, r.praise && `ชม: ${r.praise}`, r.complaint && `ติ: ${r.complaint}`].filter(Boolean).join(' · ')}>
                  {r.note || r.ask || r.praise || r.complaint ? [r.note, r.ask && `ถาม: ${r.ask}`, r.complaint && `ติ: ${r.complaint}`, r.praise && `ชม: ${r.praise}`].filter(Boolean).join(' · ') : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                </TableCell>
              </TableRow>
            ); })}
          </TableBody>
        </Table></CardTable>
        {rows.length > 7 && <button type="button" onClick={() => setShowAll(v => !v)} className="cap mt-2 text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }}>{showAll ? 'ย่อเหลือ 7 วันล่าสุด' : `ดูทั้งหมด ${N(rows.length)} รายการ`}</button>}
      </>)}
    </Card>
  );
}

/* ---------- Cohort: ลูกค้าใหม่แต่ละเดือน กลับมาซื้อซ้ำกี่ % (pure) ---------- */
// ords = ออเดอร์ทุกเดือน (สโคปแล้ว) · keyOf = คีย์ลูกค้า · asOfYm = เดือนล่าสุดที่นับ · months = จำนวน cohort ย้อนหลัง · horizon = M+1..M+h
export function cohortRetention(ords, { keyOf = (o) => o.customer_code, asOfYm, months = 6, horizon = 3 } = {}) {
  const first = new Map(), buys = new Map();
  (ords || []).forEach(o => { if (String(o.status || '').toLowerCase() === 'cancelled') return; const k = keyOf(o), ym = (o.order_date || '').slice(0, 7); if (!k || ym.length !== 7) return; if (!first.has(k) || ym < first.get(k)) first.set(k, ym); (buys.get(k) || buys.set(k, new Set()).get(k)).add(ym); });
  const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  const rows = [];
  for (let i = months - 1; i >= 0; i--) {
    const ym = ymAdd(asOfYm, -i);
    const members = [...first.entries()].filter(([, f]) => f === ym).map(([k]) => k);
    const cells = Array.from({ length: horizon }, (_, h) => { const t = ymAdd(ym, h + 1); if (t > asOfYm) return null; const n = members.filter(k => buys.get(k).has(t)).length; return { ym: t, n, pct: members.length ? n / members.length * 100 : 0 }; });
    const anyLater = members.filter(k => [...buys.get(k)].some(b => b > ym)).length;
    rows.push({ ym, size: members.length, cells, anyLater, anyPct: members.length ? anyLater / members.length * 100 : 0 });
  }
  return rows;
}
const ymTh = (ym) => { const [y, m] = ym.split('-').map(Number); return `${THAI_MONTHS[m - 1]?.slice(0, 3) || ''} ${String(y + 543).slice(2)}`; };
export function CohortMatrix({ rows = [], title = 'ลูกค้าใหม่กลับมาซื้อซ้ำ', sub, horizon = 3 }) {
  const max = Math.max(10, ...rows.flatMap(r => r.cells.filter(Boolean).map(c => c.pct)));
  const sized = rows.filter(r => r.size > 0);
  return (
    <Card className="p-[22px] min-w-0">
      <CardTitle className="m-0 text-base font-semibold">{title}</CardTitle>
      <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2, marginBottom: 12 }}>{sub || 'แถว = เดือนที่ซื้อครั้งแรก · ช่อง = % ที่กลับมาซื้ออีกในเดือนที่ 1–3 ถัดไป · เข้ม = กลับมาเยอะ'}</div>
      {!sized.length ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '18px 0', textAlign: 'center' }}>ยังไม่มีลูกค้าใหม่ในช่วง {rows.length} เดือน</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: `84px 64px repeat(${horizon}, minmax(0, 1fr)) 70px`, gap: 4, alignItems: 'center' }}>
          <div className="cap" style={{ color: 'var(--ink-4)' }}>เริ่มซื้อ</div><div className="cap" style={{ color: 'var(--ink-4)', textAlign: 'right' }}>ใหม่</div>
          {Array.from({ length: horizon }, (_, h) => <div key={h} className="cap" style={{ color: 'var(--ink-4)', textAlign: 'center' }}>เดือน +{h + 1}</div>)}
          <div className="cap" style={{ color: 'var(--ink-4)', textAlign: 'right' }}>กลับมาเลย</div>
          {rows.map(r => (
            <div key={r.ym} style={{ display: 'contents' }}>
              <div className="cap" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{ymTh(r.ym)}</div>
              <div className="num cap" style={{ textAlign: 'right', fontWeight: 700, color: r.size ? 'var(--ink)' : 'var(--ink-4)' }}>{N(r.size)}</div>
              {r.cells.map((c, h) => c == null || !r.size ? <div key={h} className="cap num" style={{ height: 32, borderRadius: 7, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--ink-4)' }}>{c == null ? '·' : '—'}</div>
                : <div key={h} className="num" title={`${ymTh(r.ym)} → ${ymTh(c.ym)}: ${N(c.n)} จาก ${N(r.size)} คน`} style={{ height: 32, borderRadius: 7, display: 'grid', placeItems: 'center', fontSize: 12.5, fontWeight: c.pct / max > 0.55 ? 700 : 500, background: c.n ? `color-mix(in srgb, var(--accent) ${Math.round(10 + Math.min(1, c.pct / max) * 80)}%, var(--surface))` : 'var(--surface-2)', color: c.pct / max > 0.55 ? '#fff' : c.n ? 'var(--ink)' : 'var(--ink-4)' }}>{c.n ? `${Math.round(c.pct)}%` : '0%'}</div>)}
              <div className="num cap" style={{ textAlign: 'right', fontWeight: 700, color: r.size && r.anyPct >= REPEAT_TARGET ? 'var(--good)' : r.size ? 'var(--ink-2)' : 'var(--ink-4)' }}>{r.size ? `${Math.round(r.anyPct)}%` : '—'}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- รายชื่อลูกค้า (ของกลาง) ---------- */
export function CustomerTable({ rows = [], onPick, title = 'รายชื่อลูกค้า', sub, pageSize = 40, showContact = false, phones, tierSel, onTierSel, stageSel, onStageSel }) {
  const [tierState, setTierState] = useState('all');
  const [stageState, setStageState] = useState('all');
  const tier = tierSel ?? tierState; const setTier = onTierSel ?? setTierState;
  const stage = stageSel ?? stageState; const setStage = onStageSel ?? setStageState;
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return rows.filter(r => (tier === 'all' || r.tier === tier) && (stage === 'all' || stageOf(r) === stage) && (!qq || String(r.name || '').toLowerCase().includes(qq) || String(r.code || r.key || '').toLowerCase().includes(qq) || String(r.contact || (phones && phones.get(r.code)) || '').includes(qq)));
  }, [rows, tier, stage, q, phones]);
  const shown = showAll ? filtered : filtered.slice(0, pageSize);
  return (
    <Card className="p-[22px]">
      <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div>
          <CardTitle className="m-0 text-base font-semibold">{title}{tier !== 'all' ? ` · ระดับ${tier}` : ''}{stage !== 'all' ? ` · ${stage}` : ''} <span className="dim">· {N(filtered.length)} คน</span></CardTitle>
          {sub && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>{sub}</div>}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อ/รหัส/เบอร์" wrapperClassName="w-[200px]" />
          <Tabs value={tier} onValueChange={setTier}><TabsList className="h-auto flex-wrap">{['all', 'เพชร', 'ทอง', 'เงิน', 'ทองแดง'].map(t => <TabsTrigger key={t} value={t}>{t === 'all' ? 'ทุกระดับ' : t}</TabsTrigger>)}</TabsList></Tabs>
          <Tabs value={stage} onValueChange={setStage}><TabsList className="h-auto flex-wrap">{[['all', 'ทุกขั้น'], ...STAGES.map(s => [s.key, s.key])].map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}</TabsList></Tabs>
          <ExportBtn filename={`ลูกค้า_${filtered.length}ราย`} rows={filtered.map(r => ({ ...r, stage: stageOf(r) }))} columns={[{ label: 'รหัส', key: 'code' }, { label: 'ชื่อ', key: 'name' }, ...(showContact ? [{ label: 'ติดต่อ', key: 'contact' }] : []), { label: 'ระดับ', key: 'tier' }, { label: 'ยอดซื้อ', key: 'sales' }, { label: 'ครั้ง', key: 'orders' }, { label: 'เฉลี่ย/ครั้ง', key: 'aov' }, { label: 'ซื้อล่าสุด', key: 'last' }, { label: 'ขั้น', key: 'stage' }]} />
        </div>
      </div>
      {shown.length ? <CardTable className="[&_td]:py-[7px]"><Table>
        <TableHeader><TableRow>
          <TableHead>ลูกค้า</TableHead>{showContact && <TableHead>ติดต่อ</TableHead>}<TableHead>ระดับ</TableHead>
          <TableHead style={R}>ยอดซื้อ</TableHead><TableHead style={R}>ครั้ง</TableHead><TableHead style={R}>เฉลี่ย/ครั้ง</TableHead>
          <TableHead style={R}>ซื้อล่าสุด</TableHead><TableHead>ขั้น</TableHead>
        </TableRow></TableHeader>
        <TableBody>{shown.map((c, i) => { const st = stageOf(c); return (
          <TableRow key={c.code || c.key} onClick={onPick ? () => onPick(c) : undefined} className={onPick ? 'cursor-pointer' : undefined}>
            <TableCell className="cell-title"><span className="row" style={{ gap: 8, alignItems: 'center' }}><span className="num cap" style={{ color: 'var(--ink-4)', width: 22 }}>{i + 1}</span><PersonAvatar name={c.name || c.code} size={24} />{c.name || c.code}</span></TableCell>
            {showContact && <TableCell className="num cap" style={{ color: 'var(--ink-3)' }}>{c.contact || (phones && phones.get(c.code)) || '—'}</TableCell>}
            <TableCell><span className={`tier-chip ${TIER_CHIP[c.tier] || ''}`}>{c.tier}</span></TableCell>
            <TableCell className="num" style={{ ...R, fontWeight: 600 }}>{baht(c.sales)}</TableCell>
            <TableCell className="num" style={R}>{N(c.orders)}</TableCell>
            <TableCell className="num" style={{ ...R, color: 'var(--ink-3)' }}>{baht(c.aov)}</TableCell>
            <TableCell className="num cap" style={{ ...R, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{c.last ? bucketLabel(c.last, 'day') : '—'}{c.recency != null ? ` (${c.recency}ว.)` : ''}</TableCell>
            <TableCell><span className="row" style={{ gap: 6, justifyContent: 'space-between' }}><Badge variant="outline" style={{ fontSize: 10, color: stageColor(st), borderColor: `color-mix(in srgb, ${stageColor(st)} 45%, transparent)` }}>{st}</Badge>{onPick && <Icon name="arrowR" />}</span></TableCell>
          </TableRow>
        ); })}</TableBody>
      </Table></CardTable> : <div className="cap" style={{ color: 'var(--ink-4)', padding: 16, textAlign: 'center' }}>ไม่พบลูกค้าตามเงื่อนไข</div>}
      <div className="cap row" style={{ color: 'var(--ink-4)', marginTop: 8, gap: 10, alignItems: 'center' }}>
        <span>แสดง {N(shown.length)} จาก {N(filtered.length)} คน{rows.length !== filtered.length ? ` (ทั้งหมด ${N(rows.length)})` : ''} · เฉพาะออเดอร์ที่มีรหัสลูกค้า</span>
        {filtered.length > pageSize && <button type="button" onClick={() => setShowAll(v => !v)} className="text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }}>{showAll ? `ย่อเหลือ ${pageSize}` : `ดูทั้งหมด ${N(filtered.length)}`}</button>}
      </div>
    </Card>
  );
}

/* ---------- ลูกค้าที่น่าจะเป็นคนเดียวกัน (PART 110) — ชี้เป้าให้คนตรวจ ไม่รวมให้อัตโนมัติ ---------- */
export function DuplicateCustomers({ groups = [], onPick, limit = 5 }) {
  const [open, setOpen] = useState(false);
  if (!groups.length) return null;
  const shown = open ? groups : groups.slice(0, limit);
  return (
    <Card className="p-[22px]">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'center', textAlign: 'left' }}>
        <div style={{ minWidth: 0 }}>
          <CardTitle className="m-0 text-base font-semibold">ลูกค้าที่น่าจะเป็นคนเดียวกัน <span className="dim">· {N(groups.length)} กลุ่ม</span></CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>เกิดจากออเดอร์เก่าที่ไม่มีรหัสลูกค้า — ยอดสะสม/ระดับของคนนั้นจะถูกแยกเป็น 2 แถว (ยอดรวมบริษัทไม่กระทบ)</div>
        </div>
        <Icon name={open ? 'chevD' : 'chevR'} style={{ color: 'var(--ink-4)', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {shown.map((g, i) => (
            <div key={i} className="rounded-lg border p-2.5" style={{ borderColor: 'var(--line)' }}>
              <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 6 }}>{g.reason} · รวม {baht(g.sales)}</div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {g.rows.map(r => (
                  <button type="button" key={r.key || r.code} onClick={onPick ? () => onPick(r) : undefined}
                    className="row cap" style={{ gap: 6, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px', background: 'var(--surface)', cursor: onPick ? 'pointer' : 'default' }}>
                    <PersonAvatar name={r.name || r.code} size={20} />
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{r.name || r.code}</span>
                    <span className="num" style={{ color: 'var(--ink-4)' }}>{baht(r.sales)} · {N(r.orders || r.count || 0)} ครั้ง</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="cap" style={{ color: 'var(--ink-4)' }}>วิธีรวม: เปิดออเดอร์เก่าของแถวที่ไม่มีรหัส แล้วแก้ "ลูกค้า" ให้ตรงกับโปรไฟล์จริง (หน้าออเดอร์ › แก้ไข)</div>
        </div>
      )}
    </Card>
  );
}
