/* ============================================================
   saleDashboardMerged.jsx — ส่วนที่ "ย้ายมาจากหน้ายอดขายเดิม" ในรายงานขาย (PART 103)
   ============================================================
   - MergedChannelTable : ตารางช่องทางรวม (ยอด/ออเดอร์/คนทัก/ใหม่-เก่า/%ปิด) + แถว CRM (ไม่บวกยอดรวม)
   - AdsTab             : แท็บโฆษณา (งบเดือน vs ใช้จริง · ค่าแอด/ROAS/CPI ต่อช่องทาง + แคมเปญ + โน้ต)
   - CustomerExtras     : แนวโน้มซื้อซ้ำ + ใหม่/เก่าต่อช่องทาง (เติมแท็บลูกค้า — ไม่ซ้ำการ์ดที่ CustomerTab มีอยู่แล้ว)
   - LongTermSection    : YoY / ไตรมาส · useMonthTarget : เป้าเดือนสำหรับฝังใน hero
   ทุกตัวรับข้อมูลที่คำนวณแล้วจาก lib/salesOverviewAgg.js (pure · มีเทส) — ที่นี่ทำแค่ render
   UI: ใช้ primitives ชุดเดียวกับแท็บอื่น (Card p-[22px] + CardTitle + .cap + Table/CardTable + MetricCard) ให้กลมกลืน
   ============================================================ */
import { useState, useEffect } from 'react';
import { Icon, N, InfoTip } from './components.jsx';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChannelLogo, channelTint } from './lib/channelLogos.jsx';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Progress } from '@/components/ui/progress';
import { channelColor, Sparkline, ZoneGauge } from './charts.jsx';
import { goSection, isAdmin as busIsAdmin } from './lib/appBus.js';
import { REPEAT_TARGET, manualEntryAgg } from './lib/salesOverviewAgg.js';
import { bucketKey, bucketLabel, enumerateBuckets } from './lib/saleTime.js';
import { todayISO } from './lib/dateUtils.js';
import { KpiCard } from './saleDashboardChrome.jsx';
import { DailySalesChart } from './charts.jsx';
import { CHANNELS } from './lib/saleFields.js';
import { TMK } from './data.js';
import { fetchYearMergedActuals } from './lib/mergedMonth.js';

import { deltaPct } from './lib/deltaChip.js';
const B = (n) => '฿' + Math.round(Number(n) || 0).toLocaleString('th-TH');
/** เลขเงินย่อ (฿480k / ฿1.2M) — ใช้ในที่แคบ (การ์ดช่องทาง/แท่งกราฟ) · เลขเต็มไว้ใน tooltip */
export const Bk = (n) => {
  const v = Math.round(Number(n) || 0);
  if (v >= 1_000_000) return '฿' + (v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1) + 'M';
  if (v >= 1000) return '฿' + (v / 1000).toFixed(v >= 100_000 ? 0 : 1) + 'k';
  return '฿' + v;
};
const pct = (v) => (v == null ? '—' : Math.round(v) + '%');
const closeTone = (v) => (v == null ? 'var(--ink-4)' : v >= 15 ? 'var(--good)' : v >= 8 ? 'var(--warn)' : 'var(--bad)');
const MO_AB = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
// สีใหม่/เก่า — ชุดเดียวกับกราฟ "ลูกค้าใหม่ vs เก่า" ในแท็บลูกค้า (ใหม่=info · เก่า=good)
const NEW_C = 'var(--info)', OLD_C = 'var(--good)';

/* ---------- ยอดต่อช่องทาง (แท็บภาพรวม · D2/D3/D4/D5) — รื้อใหม่ 22 ส.ค.: แถวต่อช่องทาง ไม่ใช่ตาราง 6 คอลัมน์ ----------
   แต่ละแถว: โลโก้ + ชื่อ + แถบสัดส่วน + ฿ + % + ออเดอร์ · บรรทัดย่อย "ใหม่/เก่า · ทัก → ปิด%" เฉพาะช่องที่มีข้อมูลจริง
   (มาร์เก็ตเพลส/POS ไม่มีคนทัก = ไม่มีบรรทัดย่อย ไม่โชว์ — / 0/0) · กดแถว = กรองช่องทางทั้งหน้า · แถว CRM/รวม = บรรทัดท้าย
   · ไม่มีป้าย "กรอกมือ" — นโยบาย (user 22 ส.ค.): Shopee/Lazada/TikTok กรอกมือเป็นปกติ สร้างออเดอร์เฉพาะเคสสำคัญ → ป้ายไม่ใช่ข้อมูล */
export function MergedChannelTable({ table, onPick }) {
  if (!table) return null;
  const { rows, total, crmRow } = table;
  if (!rows.length && !crmRow?.orders) return null;
  const max = Math.max(1, ...rows.map(r => r.sales));
  const share = (v) => (total.sales > 0 ? v / total.sales * 100 : 0);
  const pick = onPick ? (ch) => onPick('channel', ch) : null;

  return (
    <Card className="p-[22px] flex flex-col min-w-0">
      <CardTitle className="m-0 text-base font-semibold mb-[6px]">ยอดต่อช่องทาง <span className="dim">· ช่วงที่เลือก</span></CardTitle>
      <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>ยอด/ออเดอร์/ลูกค้า จากออเดอร์จริง + มาร์เก็ตเพลสที่กรอกมือ · คนทัก จากที่เซลล์กรอก · %ปิด = ออเดอร์ช่องแชท ÷ คนทัก{pick ? ' · กดช่องทางเพื่อกรองทั้งหน้า' : ''}</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {rows.map(r => {
          const tint = channelTint(r.ch);
          const hasLeads = r.leads > 0 || r.over;
          const hasCust = (r.newC + r.oldC) > 0;
          return (
            <div key={r.ch} role={pick ? 'button' : undefined} tabIndex={pick ? 0 : undefined}
              onClick={pick ? () => pick(r.ch) : undefined} onKeyDown={pick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(r.ch); } } : undefined}
              title={pick ? `กรองช่องทาง ${r.ch}` : undefined}
              className={'rounded-lg px-2 py-1.5 -mx-2 transition-colors' + (pick ? ' cursor-pointer hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-[var(--accent)]' : '')}>
              <div className="ch-row">
                <span className="ch-logo ch-row-logo" style={{ width: 30, height: 30, borderRadius: 8, color: tint, background: `color-mix(in srgb, ${tint} 14%, var(--surface))` }}><ChannelLogo name={r.ch} size={16} /></span>
                <span className="ch-row-name">{r.ch}</span>
                <span className="ch-row-bar"><span style={{ display: 'block', width: `${Math.max(1.5, r.sales / max * 100)}%`, height: '100%', background: tint, borderRadius: 4 }} /></span>
                <span className="num ch-row-money">{B(r.sales)} <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 400 }}>{Math.round(share(r.sales))}%</span></span>
                {/* กดช่องทางแล้วเจาะรายวันจะเจอ "ใบจริง" น้อยกว่าเลขนี้ ถ้ามีส่วนที่กรอกจำนวนเอง
                    ไม่เพิ่มป้ายบนจอ (นโยบาย user 22 ส.ค.) แต่ต้องอธิบายได้เมื่อชี้ */}
                <span className="num cap ch-row-orders"
                  title={r.legacyOrders > 0 ? `${N(r.orders)} ออเดอร์ — จากใบเสร็จจริง ${N(r.orders - r.legacyOrders)} · กรอกจำนวนเอง ${N(r.legacyOrders)} (ไม่มีใบให้เจาะ)` : undefined}>
                  {r.orders ? `${N(r.orders)} ออเดอร์` : ''}</span>
              </div>
              {(hasLeads || hasCust) && (
                <div className="cap row" style={{ gap: 10, marginLeft: 40, marginTop: 2, color: 'var(--ink-4)', flexWrap: 'wrap', alignItems: 'center' }}>
                  {hasCust && <span style={{ whiteSpace: 'nowrap' }}>ใหม่ <b style={{ color: NEW_C, fontWeight: 600 }}>{N(r.newC)}</b> · เก่า <b style={{ color: OLD_C, fontWeight: 600 }}>{N(r.oldC)}</b></span>}
                  {hasLeads && <span style={{ whiteSpace: 'nowrap' }}>ทัก <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{N(r.leads)}</b>{r.over
                    ? <span className="row" style={{ display: 'inline-flex', gap: 3, marginLeft: 6, color: 'var(--warn)', fontWeight: 600 }} title="ออเดอร์ช่องแชทมากกว่าคนทักที่กรอก — เซลล์กรอกคนทักไม่ครบ"><Icon name="alertTriangle" size={12} /> กรอกไม่ครบ</span>
                    : <> → ปิด <b style={{ color: closeTone(r.closeRate), fontWeight: 700 }}>{pct(r.closeRate)}</b></>}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* รวม + CRM — บรรทัดท้าย */}
      <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
        <div className="row cap" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 13 }}>รวม</span>
          <span className="num" style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 14 }}>{B(total.sales)}</span>
          <span className="num" style={{ color: 'var(--ink-3)' }}
            title={total.legacyOrders > 0 ? `${N(total.orders)} ออเดอร์ — จากใบเสร็จจริง ${N(total.orders - total.legacyOrders)} · กรอกจำนวนเอง ${N(total.legacyOrders)} (ไม่มีใบให้เจาะ)` : undefined}>{N(total.orders)} ออเดอร์</span>
          {(total.newC + total.oldC) > 0 && <span>ใหม่ <b style={{ color: NEW_C, fontWeight: 600 }}>{N(total.newC)}</b> · เก่า <b style={{ color: OLD_C, fontWeight: 600 }}>{N(total.oldC)}</b></span>}
          {total.leads > 0 && <span>ทัก <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{N(total.leads)}</b> → ปิด <b style={{ color: closeTone(total.closeRate), fontWeight: 700 }}>{pct(total.closeRate)}</b></span>}
        </div>
        {crmRow && crmRow.orders > 0 && (
          <div className="row cap" style={{ gap: 6, marginTop: 4, color: 'var(--ink-4)', alignItems: 'center', flexWrap: 'wrap' }}>
            <Icon name="users" size={12} /> CRM ({crmRow.members.join(', ') || '—'}) <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{B(crmRow.sales)}</b> · {N(crmRow.orders)} ออเดอร์ · ไม่รวมในยอดรวม
            <InfoTip text="ยอดจากช่อง LINE + โทร ของทีม CRM · แสดงไว้ดูเฉยๆ (ยอดนี้นับอยู่ในแถวช่องทางแล้ว)" />
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------- แท็บโฆษณา — รื้อใหม่ 22 ส.ค.: "ครบเรื่องแอดที่เดียว" ----------
   งบเดือน (จังหวะใช้งบ + ต่อช่องทาง) · KPI 8 ใบ ▲▼ เทียบเดือนก่อน · กราฟค่าแอด vs ROAS รายวัน ·
   แถวช่องทาง (ROAS/CPI/CPO/%ปิด/ลูกค้าใหม่/งบเดือน) · โน้ต+ตอบแชท · (แคมเปญ: user ยังไม่เอามาแสดง)
   ข้อมูล: dailyRows (ค่าแอดรายวัน) · table/prevTable (channelTable ช่วงนี้/ช่วงก่อน) · mt (งบเดือน) · ords (ออเดอร์ช่วงนี้ → ยอดรายวันของช่องที่ยิงแอด) */
const roasTone = (r) => (r == null ? 'var(--ink-4)' : r >= 3 ? 'var(--good)' : r >= 1.5 ? 'var(--warn)' : 'var(--bad)');
const adPerBucket = (rows, bks, gran) => {   // { bucket: { ch: ad } } ผ่าน manualEntryAgg ต่อ bucket (กติกา key ใหม่ชนะ)
  const by = {}; (rows || []).forEach(r => { const b = bucketKey(r.date, gran); (by[b] = by[b] || []).push(r); });
  const out = {}; bks.forEach(b => { out[b] = by[b] ? manualEntryAgg(by[b]).ad : {}; }); return out;
};
export function AdsTab({ table, prevTable, dailyRows = [], prevDailyRows = [], mt = null, range, prevRange, gran = 'day', cmp, curLabel = 'ช่วงนี้', prevLabel = 'ช่วงก่อน', ords = [], replyMins, notes = [], toggleFilter, setDayPay, onOpenEntry }) {
  if (!table) return null;
  const rows = table.rows.filter(r => r.ad > 0).sort((a, b) => b.ad - a.ad);
  const total = table.total;
  const prevRows = prevTable?.rows || [];
  const prevTotal = prevTable?.total;
  const adSales = rows.reduce((a, r) => a + r.sales, 0);                 // ยอดเฉพาะช่องที่ยิงแอด
  const prevAdRows = prevRows.filter(r => r.ad > 0);
  const prevAdSales = prevAdRows.reduce((a, r) => a + r.sales, 0);
  const roas = total.ad > 0 ? adSales / total.ad : null;
  const prevRoas = prevTotal?.ad > 0 ? prevAdSales / prevTotal.ad : null;
  const acos = adSales > 0 && total.ad > 0 ? total.ad / adSales * 100 : null;
  const prevAcos = prevAdSales > 0 && prevTotal?.ad > 0 ? prevTotal.ad / prevAdSales * 100 : null;
  const adLeads = rows.reduce((a, r) => a + (r.leads || 0), 0), prevAdLeads = prevAdRows.reduce((a, r) => a + (r.leads || 0), 0);
  const cpi = total.ad > 0 && adLeads > 0 ? total.ad / adLeads : null, prevCpi = prevTotal?.ad > 0 && prevAdLeads > 0 ? prevTotal.ad / prevAdLeads : null;
  const adOrders = rows.reduce((a, r) => a + (r.orders || 0), 0), prevAdOrders = prevAdRows.reduce((a, r) => a + (r.orders || 0), 0);
  const cpo = total.ad > 0 && adOrders > 0 ? total.ad / adOrders : null, prevCpo = prevTotal?.ad > 0 && prevAdOrders > 0 ? prevTotal.ad / prevAdOrders : null;
  // วันที่กรอกค่าแอด (ครบ/ขาด) — นับเฉพาะวัน ≤ วันนี้
  const today = todayISO();
  const bks = range?.from && range?.to ? enumerateBuckets(range.from, range.to, gran) : [];
  const daysTotal = gran === 'day' ? bks.filter(b => b <= today).length : bks.length;
  const adByB = adPerBucket(dailyRows, bks, gran);
  const daysFilled = bks.filter(b => Object.values(adByB[b] || {}).some(v => v > 0)).length;
  const perDay = daysFilled > 0 ? total.ad / daysFilled : 0;
  const prevBks = prevRange ? enumerateBuckets(prevRange.from, prevRange.to, gran) : [];
  const prevAdByB = adPerBucket(prevDailyRows, prevBks, gran);
  const prevDaysFilled = prevBks.filter(b => Object.values(prevAdByB[b] || {}).some(v => v > 0)).length;
  const prevPerDay = prevDaysFilled > 0 && prevTotal ? prevTotal.ad / prevDaysFilled : null;
  // สูตรส่วนต่าง = lib/deltaChip.js ที่เดียว (เดิมก๊อป 4 ที่ เงื่อนไขไม่ตรงกัน) · title ยังประกอบเองเพราะฟอร์แมตต่างจริง
  const dPct = (c, p, goodUp = true) => { const d = deltaPct(c, p, { goodUp, on: cmp }); return d && { ...d, title: `${prevLabel}: ${typeof p === 'number' ? (p >= 100 ? B(p) : p.toFixed(2)) : p}` }; };
  const dPt = (c, p, goodUp = true) => (cmp && c != null && p != null ? (() => { const d = Math.round(c - p); return { txt: (d >= 0 ? '+' : '−') + Math.abs(d) + ' pt', dir: d >= 0 ? 1 : -1, good: goodUp ? d >= 0 : d <= 0, title: `${prevLabel}: ${Math.round(p)}%` }; })() : null);

  // ---- งบเดือน: จังหวะใช้งบ ----
  const Budget = mt?.has && mt.adBudget > 0 ? (() => {
    const usedPct = mt.ad / mt.adBudget * 100, elapsed = mt.dim ? mt.passed / mt.dim * 100 : 100;
    const left = Math.max(0, mt.adBudget - mt.ad), daysLeft = Math.max(0, mt.dim - mt.passed);
    const over = mt.ad > mt.adBudget;
    const pace = elapsed > 0 ? usedPct / elapsed : 0;   // 1 = ตามแผน
    const paceTxt = over ? 'เกินงบแล้ว' : pace > 1.15 ? 'ใช้เร็วกว่าแผน' : pace < 0.7 ? 'ใช้ช้ากว่าแผน' : 'ตามแผน';
    const paceTone = over ? 'var(--bad)' : pace > 1.15 ? 'var(--warn)' : pace < 0.7 ? 'var(--info)' : 'var(--good)';
    const chBud = Object.entries(mt.chAdBudget || {}).filter(([, v]) => Number(v) > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
    return (
      <Card className="p-[22px]">
        <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <CardTitle className="m-0 text-base font-semibold">งบแอด {mt.label}</CardTitle>
            <span className="kpi-delta" style={{ color: paceTone, background: 'transparent', border: `1.5px solid color-mix(in srgb, ${paceTone} 55%, transparent)` }}>{paceTxt}</span>
          </div>
          <span className="num" style={{ fontWeight: 800, fontSize: 16, color: over ? 'var(--bad)' : 'var(--ink)' }}>{B(mt.ad)} <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 400 }}>/ {B(mt.adBudget)} · {Math.round(usedPct)}%</span></span>
        </div>
        <div style={{ position: 'relative', marginTop: 10 }}>
          <Progress value={Math.min(100, usedPct)} indicatorColor={over ? 'var(--bad)' : usedPct >= 85 ? 'var(--warn)' : 'var(--accent)'} className="h-3" aria-label={`งบแอดใช้ไป ${Math.round(usedPct)}%`} />
          {/* ขีด = ผ่านไปกี่ % ของเดือน (ควรใช้ถึงตรงนี้ถ้าเฉลี่ยเท่ากันทุกวัน) */}
          <span style={{ position: 'absolute', left: `${Math.min(100, elapsed)}%`, top: -4, width: 2, height: 20, background: 'var(--ink-3)', borderRadius: 1 }} title={`ผ่านไป ${Math.round(elapsed)}% ของเดือน`} />
        </div>
        <div className="cap row" style={{ gap: 14, marginTop: 8, flexWrap: 'wrap', color: 'var(--ink-4)' }}>
          <span>ผ่านไป <b style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{Math.round(elapsed)}%</b> ของเดือน (ขีด)</span>
          {!over && <span>เหลือ <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{B(left)}</b>{mt.isCur ? ` · ${daysLeft} วัน` : ''}</span>}
          {over && <span style={{ color: 'var(--bad)', fontWeight: 600 }}>เกินงบ {B(mt.ad - mt.adBudget)}</span>}
          {mt.isCur && daysLeft > 0 && !over && <span>ใช้ได้อีก <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{B(left / daysLeft)}/วัน</b> (ตอนนี้เฉลี่ย {B(mt.passed ? mt.ad / mt.passed : 0)}/วัน)</span>}
        </div>
        {chBud.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px 18px', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            {chBud.map(([ch, v]) => { const bud = Number(v), used = Number(mt.chAd?.[ch]) || 0, p = used / bud * 100, o = used > bud; const tint = channelTint(ch); return (
              <div key={ch} className="row cap" style={{ gap: 8, alignItems: 'center' }} title={`${ch}: ใช้ ${B(used)} จากงบ ${B(bud)}`}>
                <span className="row" style={{ gap: 6, flex: '0 0 86px', color: 'var(--ink-3)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: tint }} />{ch}</span>
                <span style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.min(100, p)}%`, height: '100%', background: o ? 'var(--bad)' : p >= 85 ? 'var(--warn)' : tint, borderRadius: 999 }} /></span>
                <span className="num" style={{ flex: '0 0 auto', whiteSpace: 'nowrap', color: o ? 'var(--bad)' : 'var(--ink-4)' }}>{Bk(used)}/{Bk(bud)} · {Math.round(p)}%{p >= 85 && !o ? ' ⚠' : ''}</span>
              </div>
            ); })}
          </div>
        )}
      </Card>
    );
  })() : null;

  // ค่าแอดที่กรอกรวมโดยไม่ระบุช่องทาง (แถวยุคเก่า) — นับใน ROAS รวมแล้ว แต่เกลี่ยลงช่องทางไม่ได้ → บอกให้เห็น
  const unassignedAd = Number(table.unassignedAd) || 0;
  const UnassignedNote = unassignedAd > 0 ? (
    <Card className="p-3 flex items-center gap-2" style={{ borderLeft: '3px solid var(--warn)' }}>
      <Icon name="alertTriangle" size={14} style={{ color: 'var(--warn)' }} />
      <span className="cap" style={{ color: 'var(--ink-3)' }}>
        ค่าแอด <b className="num" style={{ color: 'var(--ink)' }}>{B(unassignedAd)}</b> ถูกกรอกไว้แบบไม่ระบุช่องทาง (ข้อมูลยุคเก่า) — รวมใน ROAS รวมแล้ว แต่แยกลงรายช่องทางไม่ได้
      </span>
    </Card>
  ) : null;

  if (!rows.length) {
    return (
      <div className="grid gap-3">
        {Budget}
        {UnassignedNote}
        <Card className="p-9 text-center">
          <div style={{ color: 'var(--ink-3)', fontWeight: 600 }}>ยังไม่ได้กรอกค่าแอดของช่วงนี้</div>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>ค่าแอดต่อช่องทางกรอกรายวัน (แอดมิน) — ระบบจะคำนวณ ROAS / CPI / ค่าแอดต่อออเดอร์ ให้เอง{replyMins != null ? ` · เวลาตอบแชทเฉลี่ย ${replyMins} นาที` : ''}</div>
          {onOpenEntry && <Button size="sm" className="mt-4" onClick={onOpenEntry}><Icon name="pencil" /> กรอกค่าแอด</Button>}
        </Card>
      </div>
    );
  }

  // ---- กราฟรายวัน: แท่ง = ค่าแอดแยกช่องทาง · เส้น = ROAS/วัน (แกนขวา · ขีด 3x) · เส้นประ = ค่าแอดช่วงก่อน ----
  const adChans = rows.map(r => r.ch);
  const salesByB = {}; (ords || []).forEach(o => { if (!adChans.includes(o.channel) || String(o.status || '').toLowerCase() === 'cancelled') return; const b = bucketKey(o.order_date, gran); salesByB[b] = (salesByB[b] || 0) + (Number(o.sales) || 0); });
  const datasets = adChans.map(ch => ({ label: ch, data: bks.map(b => adByB[b]?.[ch] || 0), color: channelTint(ch) }));
  const adTotByB = bks.map(b => adChans.reduce((a, ch) => a + (adByB[b]?.[ch] || 0), 0));
  const roasByB = bks.map((b, i) => (adTotByB[i] > 0 ? Math.round((salesByB[b] || 0) / adTotByB[i] * 10) / 10 : null));
  const prevSeries = prevBks.length ? bks.map((_, i) => (prevBks[i] ? Object.values(prevAdByB[prevBks[i]] || {}).reduce((a, v) => a + v, 0) : null)) : null;
  const labels = bks.map((b, i) => gran === 'day' ? ((i === 0 || b.endsWith('-01')) ? bucketLabel(b, 'day') : String(Number(b.slice(8, 10)))) : bucketLabel(b, gran).replace(/ \(.*/, ''));
  const tipLabels = bks.map(b => bucketLabel(b, gran));
  const weekend = gran === 'day' ? bks.map(b => { const w = new Date(b + 'T00:00:00').getDay(); return w === 0 || w === 6; }) : undefined;
  let best = null; bks.forEach((b, i) => { if (adTotByB[i] > 0 && roasByB[i] != null && (best == null || roasByB[i] > best.roas)) best = { key: b, roas: roasByB[i], ad: adTotByB[i], sales: salesByB[b] || 0 }; });
  const unitWord = gran === 'day' ? 'วัน' : gran === 'week' ? 'สัปดาห์' : 'เดือน';
  const maxAd = Math.max(1, ...rows.map(r => r.ad));
  const prevByCh = Object.fromEntries(prevRows.map(r => [r.ch, r]));

  return (
    <div className="grid gap-3">
      {Budget}
      {UnassignedNote}
      {/* ===== KPI 8 ใบ ===== */}
      <div className="kpi8">
        <KpiCard index={0} label="ค่าแอดรวม" tip="ค่าแอดที่กรอกในช่วงนี้ (ทุกช่องทาง)" value={B(total.ad)} tone="var(--warn)" delta={dPct(total.ad, prevTotal?.ad, null)} sub={`${rows.length} ช่องทาง · ${N(daysFilled)} ${unitWord}ที่กรอก`} />
        <KpiCard index={1} label="ยอดจากช่องที่ยิงแอด" tip="ยอดขายของช่องทางที่มีค่าแอดในช่วง (ช่องที่ไม่ยิงแอดไม่นับ)" value={B(adSales)} valueColor="var(--accent)" delta={dPct(adSales, prevAdSales)} sub={total.sales > 0 ? `${Math.round(adSales / total.sales * 100)}% ของยอดขายทั้งหมด` : '—'} />
        <KpiCard index={2} label="ROAS" tip="ยอดจากช่องที่ยิงแอด ÷ ค่าแอด · เกณฑ์ดี ≥ 3x" value={roas == null ? '—' : roas.toFixed(2) + 'x'} valueColor={roasTone(roas)} tone={roasTone(roas)} delta={dPct(roas, prevRoas)} sub="เกณฑ์ ≥ 3x">
          {roas != null && (() => { const scale = 6; const p = Math.min(100, roas / scale * 100); return (
            <div style={{ position: 'relative', height: 7, borderRadius: 'var(--r-pill)', background: 'var(--surface-3)' }} role="img" aria-label={`ROAS ${roas.toFixed(2)} เกณฑ์ 3`} title="แถบเต็ม = 6x · ขีด = เกณฑ์ 3x">
              <span style={{ position: 'absolute', inset: 0, width: `${p}%`, borderRadius: 'var(--r-pill)', background: roasTone(roas) }} />
              <span style={{ position: 'absolute', left: `${3 / scale * 100}%`, top: -3, width: 2, height: 13, background: 'var(--ink-3)', borderRadius: 1 }} />
            </div>
          ); })()}
        </KpiCard>
        <KpiCard index={3} label="แอดต่อยอดขาย" tip="ค่าแอด ÷ ยอดจากช่องที่ยิงแอด (ACoS) · ยิ่งต่ำยิ่งดี" value={acos == null ? '—' : `${Math.round(acos)}%`} delta={dPt(acos, prevAcos, false)} sub="ค่าแอดกี่ % ของยอดที่ได้" />
        <KpiCard index={4} label="ค่าแอดต่อคนทัก" tip="ค่าแอด ÷ คนทักของช่องที่ยิงแอด (CPI) · ยิ่งต่ำยิ่งดี" value={cpi == null ? '—' : B(cpi)} delta={dPct(cpi, prevCpi, false)} sub={adLeads ? `คนทัก ${N(adLeads)} คน` : 'ยังไม่มีข้อมูลคนทัก'} />
        <KpiCard index={5} label="ค่าแอดต่อออเดอร์" tip="ค่าแอด ÷ ออเดอร์ของช่องที่ยิงแอด (CPO) · ยิ่งต่ำยิ่งดี" value={cpo == null ? '—' : B(cpo)} delta={dPct(cpo, prevCpo, false)} sub={adOrders ? `${N(adOrders)} ออเดอร์` : '—'} />
        <KpiCard index={6} label={`เฉลี่ยค่าแอด/${unitWord}`} tip={`ค่าแอดรวม ÷ จำนวน${unitWord}ที่กรอก`} value={B(perDay)} delta={dPct(perDay, prevPerDay, null)} sub={replyMins != null ? `ตอบแชทเฉลี่ย ${replyMins} นาที` : '—'} />
        <KpiCard index={7} label="กรอกค่าแอด" tip={`จำนวน${unitWord}ที่มีค่าแอด เทียบกับ${unitWord}ในช่วง (ถึงวันนี้)`} value={`${N(daysFilled)}/${N(daysTotal)}`} valueColor={daysFilled >= daysTotal ? 'var(--good)' : 'var(--warn)'} tone={daysFilled >= daysTotal ? 'var(--good)' : 'var(--warn)'}
          sub={daysFilled >= daysTotal ? `ครบทุก${unitWord}` : `ขาด ${N(daysTotal - daysFilled)} ${unitWord} — กดปุ่ม "กรอกค่าแอด" เติมได้`} />
      </div>

      {/* ===== กราฟรายวัน ===== */}
      <Card className="p-[22px]">
        <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <div>
            <CardTitle className="m-0 text-base font-semibold">ค่าแอด vs ROAS ราย{unitWord} <span className="dim">· {curLabel}</span></CardTitle>
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>แท่ง = ค่าแอดแยกช่องทาง · เส้น = ROAS ของ{unitWord}นั้น (แกนขวา · ขีดเขียว = 3x){prevSeries ? ` · เส้นประ = ค่าแอด ${prevLabel} วันเดียวกัน` : ''}{gran === 'day' ? ' · คลิกวันดูออเดอร์ทั้งวัน' : ''}</div>
          </div>
          {best && <div className="row" style={{ gap: 8, alignItems: 'center', padding: '6px 12px', borderRadius: 10, background: 'var(--accent-soft)' }}>
            <Icon name="zap" size={14} style={{ color: 'var(--accent)' }} />
            <span className="cap" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>คุ้มสุด</span>
            <span className="cap" style={{ color: 'var(--ink)', fontWeight: 700 }}>{bucketLabel(best.key, gran)}</span>
            <span className="num cap" style={{ fontWeight: 700, color: roasTone(best.roas) }}>ROAS {best.roas.toFixed(1)}x</span>
            <span className="num cap" style={{ color: 'var(--ink-4)' }}>· แอด {B(best.ad)} → {B(best.sales)}</span>
          </div>}
        </div>
        <DailySalesChart labels={labels} tipLabels={tipLabels} datasets={datasets} orders={roasByB} weekend={weekend} prevValues={prevSeries} prevLabel={`ค่าแอด ${prevLabel}`}
          fmt={B} ordersLabel="ROAS" ordersFmt={(v) => (v == null ? '—' : Number(v).toFixed(1) + 'x')} rightRef={3} emptyText="ไม่ได้กรอกค่าแอด" clickText="คลิกเพื่อดูออเดอร์ทั้งวัน" height={270}
          tipExtra={(row) => { const i = tipLabels.indexOf(row._tip); const sl = i >= 0 ? (salesByB[bks[i]] || 0) : 0; return i >= 0 ? <div className="mt-1 flex justify-between gap-3"><span className="text-muted-foreground">ยอดช่องที่ยิงแอด</span><span className="font-semibold tabular-nums text-foreground">{B(sl)}</span></div> : null; }}
          onBarClick={gran === 'day' && setDayPay ? (i) => { const k = bks[i]; if (k) setDayPay(k); } : undefined} />
        <div className="cap row" style={{ gap: 6, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap', color: 'var(--ink-4)' }}>
          {datasets.map(d => <span key={d.label} className="row rounded-full border px-2.5 py-1" style={{ gap: 6, color: 'var(--ink-3)', fontWeight: 600 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: d.color }} /> {d.label}</span>)}
          <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px solid var(--ink-3)' }} /> ROAS/{unitWord}</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 16, borderTop: '2px dashed var(--good)' }} /> เกณฑ์ 3x</span>
          {prevSeries && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px dashed var(--accent-2)' }} /> ค่าแอด {prevLabel} วันเดียวกัน</span>}
        </div>
      </Card>

      {/* ===== ต่อช่องทาง ===== */}
      <Card className="p-[22px]">
        <CardTitle className="m-0 text-base font-semibold mb-[6px]">ต่อช่องทาง</CardTitle>
        <div className="cap" style={{ color: 'var(--ink-4)', marginBottom: 12 }}>ค่าแอด → ยอด → ROAS · CPI = แอด ÷ คนทัก · ต่อออเดอร์ = แอด ÷ ออเดอร์ · ▲▼ ROAS เทียบ{cmp ? prevLabel : 'ช่วงก่อน'} · กดช่องทางเพื่อกรองทั้งหน้า</div>
        <div style={{ display: 'grid', gap: 4 }}>
          {rows.map(r => {
            const tint = channelTint(r.ch); const pr = prevByCh[r.ch]; const dR = pr && pr.roas != null ? dPct(r.roas, pr.roas) : null;
            const bud = Number(mt?.chAdBudget?.[r.ch]) || 0, used = Number(mt?.chAd?.[r.ch]) || 0;
            const suspicious = r.ad > 0 && r.sales < r.ad * 0.05;   // ยอดต่ำผิดปกติเทียบแอด → น่าจะยังไม่ได้กรอก/นำเข้ายอด
            return (
              <div key={r.ch} role={toggleFilter ? 'button' : undefined} tabIndex={toggleFilter ? 0 : undefined} onClick={toggleFilter ? () => toggleFilter('channel', r.ch) : undefined}
                onKeyDown={toggleFilter ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleFilter('channel', r.ch); } } : undefined} title={`กรองช่องทาง ${r.ch}`}
                className={'rounded-lg px-2 py-1.5 -mx-2 transition-colors' + (toggleFilter ? ' cursor-pointer hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-[var(--accent)]' : '')}>
                <div className="ad-row">
                  <span className="ch-logo ad-row-logo" style={{ width: 30, height: 30, borderRadius: 8, color: tint, background: `color-mix(in srgb, ${tint} 14%, var(--surface))` }}><ChannelLogo name={r.ch} size={16} /></span>
                  <span className="ad-row-name">{r.ch}</span>
                  <span className="ad-row-bar"><span style={{ display: 'block', width: `${Math.max(1.5, r.ad / maxAd * 100)}%`, height: '100%', background: tint, borderRadius: 4 }} /></span>
                  <span className="num ad-row-ad"><span className="cap" style={{ color: 'var(--ink-4)' }}>แอด </span><b style={{ fontWeight: 700, fontSize: 14 }}>{B(r.ad)}</b> <span className="cap" style={{ color: 'var(--ink-4)' }}>{Math.round(r.ad / total.ad * 100)}%</span></span>
                  <span className="num ad-row-sales"><span className="cap" style={{ color: 'var(--ink-4)' }}>ยอด </span><b style={{ fontWeight: 700, fontSize: 14 }}>{B(r.sales)}</b></span>
                  <span className="num ad-row-roas"><span className="cap" style={{ color: 'var(--ink-4)' }}>ROAS </span><b style={{ fontWeight: 800, fontSize: 14, color: roasTone(r.roas) }}>{r.roas == null ? '—' : r.roas.toFixed(2) + 'x'}</b>{dR && <span className="kpi-delta" style={{ marginLeft: 4, padding: '0 5px', color: dR.good ? 'var(--good)' : 'var(--bad)', background: dR.good ? 'var(--good-soft)' : 'var(--bad-soft)' }}>{dR.txt}</span>}</span>
                </div>
                <div className="cap row" style={{ gap: 10, marginLeft: 40, marginTop: 2, color: 'var(--ink-4)', flexWrap: 'wrap' }}>
                  {r.cpi != null && <span style={{ whiteSpace: 'nowrap' }}>CPI <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{B(r.cpi)}</b></span>}
                  {r.cpo != null && <span style={{ whiteSpace: 'nowrap' }}>ต่อออเดอร์ <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{B(r.cpo)}</b></span>}
                  {r.leads > 0 && <span style={{ whiteSpace: 'nowrap' }}>ทัก <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{N(r.leads)}</b>{r.closeRate != null && !r.over && <> → ปิด <b style={{ color: closeTone(r.closeRate), fontWeight: 700 }}>{Math.round(r.closeRate)}%</b></>}</span>}
                  {r.newC > 0 && <span style={{ whiteSpace: 'nowrap' }}>ลูกค้าใหม่ <b className="num" style={{ color: NEW_C, fontWeight: 600 }}>{N(r.newC)}</b></span>}
                  {bud > 0 && <span style={{ whiteSpace: 'nowrap', color: used > bud ? 'var(--bad)' : undefined }}>งบเดือน ใช้ <b className="num" style={{ fontWeight: 600, color: used > bud ? 'var(--bad)' : 'var(--ink-3)' }}>{Math.round(used / bud * 100)}%</b> ของ {Bk(bud)}</span>}
                  {suspicious && <span className="row" style={{ gap: 4, whiteSpace: 'nowrap', color: 'var(--warn)', fontWeight: 600 }} title="มีค่าแอดแต่ยอดขายของช่องนี้ต่ำกว่า 5% ของค่าแอด — น่าจะยังไม่ได้กรอกยอด/นำเข้าออเดอร์ของช่องนี้"><Icon name="alertTriangle" size={11} /> ยอดต่ำผิดปกติ — ยังไม่ได้กรอก/นำเข้ายอด?</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ===== โน้ตรายวัน + ตอบแชท ===== */}
      {(notes.length > 0 || replyMins != null) && (
        <div className="grid gap-3">
          {notes.length > 0 && <NotesStrip notes={notes} />}
          {replyMins != null && notes.length === 0 && <Card className="p-[22px]"><span className="cap" style={{ color: 'var(--ink-4)' }}>ตอบแชทเฉลี่ย <b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{replyMins} นาที</b> (จากที่กรอกรายวัน)</span></Card>}
        </div>
      )}
    </div>
  );
}

/* โน้ตรายวัน (จากฟอร์มกรอกค่าแอด) — timeline อ่านง่าย แทน hover บนกราฟ */
export function NotesStrip({ notes }) {
  if (!notes || !notes.length) return null;
  return (
    <Card className="p-[22px]">
      <CardTitle className="m-0 text-base font-semibold mb-[10px] inline-flex items-center gap-2"><Icon name="pencil" size={15} /> โน้ตประจำวัน</CardTitle>
      <div className="grid gap-1.5">
        {[...notes].sort((a, b) => (a.date < b.date ? 1 : -1)).map((n, i) => {
          const d = Number(String(n.date).slice(8, 10)), mo = MO_AB[Number(String(n.date).slice(5, 7)) - 1] || '';
          return (
            <div key={i} className="flex gap-2.5 text-sm border-t pt-1.5 first:border-0 first:pt-0">
              <span className="num cap shrink-0 w-[56px]" style={{ color: 'var(--ink-4)' }}>{d} {mo}</span>
              <span className="flex-1">{n.note}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- เติมแท็บลูกค้า: แนวโน้มซื้อซ้ำ + ใหม่/เก่าต่อช่องทาง ----------
   (การ์ดลูกค้าใหม่/เก่า/CLV เอาออก — ซ้ำกับ KPI "ลูกค้าใหม่" ด้านบน + กราฟใหม่/เก่าใน CustomerTab · ตามที่ user เคาะ C6) */
export function CustomerExtras({ insight, series }) {
  if (!insight) return null;
  const { repeatPct, hitTarget, byChannel } = insight;
  const hasTrend = series && series.rows.some(r => r.repeatPct != null);
  if (!hasTrend && !byChannel.length) return null;
  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      {hasTrend && (
        <Card className="p-[22px]">
          <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <CardTitle className="m-0 text-base font-semibold">อัตราซื้อซ้ำ <InfoTip text={`สัดส่วนออเดอร์จากลูกค้าเก่าในช่วงนี้ · เป้าหมาย ≥ ${REPEAT_TARGET}%`} /></CardTitle>
            <span className="num" style={{ fontSize: 20, fontWeight: 700, color: hitTarget ? 'var(--good)' : 'var(--warn)' }}>{pct(repeatPct)} <span className="cap" style={{ color: 'var(--ink-4)', fontWeight: 400 }}>· เป้า ≥ {REPEAT_TARGET}%</span></span>
          </div>
          <div style={{ marginTop: 10 }}><Sparkline data={series.rows.map(r => r.repeatPct || 0)} w={640} h={48} color={hitTarget ? 'var(--good)' : 'var(--warn)'} /></div>
          <div className="grid gap-0.5 mt-1" style={{ gridTemplateColumns: `repeat(${series.labels.length}, 1fr)` }}>
            {series.rows.map((r, i) => (
              <div key={i} className="text-center cap" style={{ minWidth: 0 }}>
                <div className="num" style={{ fontWeight: 700, color: (r.repeatPct || 0) >= REPEAT_TARGET ? 'var(--good)' : 'var(--ink-4)' }}>{r.repeatPct == null ? '—' : Math.round(r.repeatPct) + '%'}</div>
                <div className="truncate" style={{ color: 'var(--ink-4)' }}>{series.labels[i]}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {byChannel.length > 0 && (
        <Card className="p-[22px]">
          <CardTitle className="m-0 text-base font-semibold mb-[12px]">ลูกค้าใหม่ vs เก่า แยกตามช่องทาง</CardTitle>
          <div className="grid gap-2">
            {byChannel.map(g => {
              const np = g.total ? g.newC / g.total * 100 : 0;
              return (
                <div key={g.ch} className="grid grid-cols-[minmax(72px,auto)_1fr_auto] items-center gap-3" title={`${g.ch}: ใหม่ ${Math.round(np)}% · เก่า ${Math.round(100 - np)}%`}>
                  <span className="cap inline-flex items-center gap-1.5 truncate"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(g.ch) }} />{g.ch}</span>
                  <span className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--surface-2)' }} role="img" aria-label={`${g.ch} ใหม่ ${N(g.newC)} เก่า ${N(g.oldC)}`}>
                    <span style={{ width: `${np}%`, background: NEW_C }} />
                    <span style={{ width: `${100 - np}%`, background: OLD_C }} />
                  </span>
                  <span className="num cap whitespace-nowrap">
                    <span style={{ color: NEW_C }}>{N(g.newC)} ใหม่</span> · <span style={{ color: OLD_C }}>{N(g.oldC)} เก่า</span>
                  </span>
                </div>
              );
            })}
          </div>
          <div className="cap row" style={{ gap: 14, marginTop: 10, justifyContent: 'center', color: 'var(--ink-4)' }}>
            <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: NEW_C }} /> ใหม่</span>
            <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: OLD_C }} /> เก่า</span>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ============================================================
   LongTermSection — "แนวโน้มระยะยาว" ในแท็บภาพรวมรายงานขาย (D15 = คำตอบ ข ของ user)
   ============================================================
   YoY (ปีนี้ vs ปีก่อน รายเดือน) + ไตรมาส (เป้า/จริง 4 ไตรมาสของปี)
   - ปีก่อน/เดือนยุคเก่า = คลัง tmk_monthly_history · เดือนยุค merged = ยอดจริงจากออเดอร์ (fetchYearMergedActuals)
   - ไม่เขียน DB · โหลดเบา (คลังอยู่ใน TMK แล้ว + query เดียวเฉพาะเดือน merged)
   ============================================================ */
export function LongTermSection({ yearBE }) {
  const [view, setView] = useState('yoy');           // 'yoy' | 'quarter'
  const [mergedYr, setMergedYr] = useState(null);    // { mo: sales } เดือนยุคใหม่ของปีนี้
  const [mergedPrev, setMergedPrev] = useState(null);// ปีก่อน — ต้องดึงด้วย ไม่งั้นพอขึ้นปีใหม่ เดือนยุค merged ของปีก่อนจะเทียบกับ 0
  useEffect(() => {
    let live = true;
    Promise.all([fetchYearMergedActuals(yearBE), fetchYearMergedActuals(yearBE - 1)])
      .then(([cur, prev]) => { if (!live) return; setMergedYr(cur || {}); setMergedPrev(prev || {}); });
    return () => { live = false; };
  }, [yearBE]);

  const allM = TMK.monthly || [];
  const rec = (y, mo) => allM.find(m => m.year === y && m.month === mo);
  // ยอดจริงของเดือน: ยุค merged = คำนวณจากออเดอร์+ยอดที่กรอก (สูตรเดียวกับรายงานขาย) · ยุคเก่า = คลัง tmk_monthly_history
  const act = (y, mo) => {
    const src = y === yearBE ? mergedYr : (y === yearBE - 1 ? mergedPrev : null);
    if (src && src[mo] != null) return src[mo];
    return Number(rec(y, mo)?.actual || 0);
  };
  const now = new Date();
  const curMo = (now.getFullYear() + 543 === yearBE) ? now.getMonth() + 1 : 0;   // เดือนปัจจุบัน (เน้นในกราฟ) · 0 = ปีอื่น

  // YoY rows
  const yoy = []; let yoyMax = 1;
  for (let mo = 1; mo <= 12; mo++) {
    // ปีก่อนต้องใช้ act() ด้วย — ไม่งั้น mergedPrev ที่อุตส่าห์ดึงมาไม่ถูกใช้เลย
    // และพอขึ้นปีใหม่ เดือน ส.ค.–ธ.ค. 2569 (ยุค merged ที่ไม่มีแถวใน tmk_monthly_history) จะเทียบกับ 0
    const cur = act(yearBE, mo), prev = act(yearBE - 1, mo);
    if (cur || prev) { yoy.push({ mo, cur, prev }); yoyMax = Math.max(yoyMax, cur, prev); }
  }
  // Quarter rows
  const quarters = [0, 1, 2, 3].map(q => {
    const months = [q * 3 + 1, q * 3 + 2, q * 3 + 3];
    const actual = months.reduce((a, mo) => a + act(yearBE, mo), 0);
    const target = months.reduce((a, mo) => a + Number(rec(yearBE, mo)?.target || 0), 0);
    return { q, actual, target, isCur: curMo && months.includes(curMo) };
  });

  if (mergedYr === null || mergedPrev === null) return null;   // ยังโหลด — ไม่วูบวาบ
  if (!yoy.length && !quarters.some(x => x.actual || x.target)) return null;  // ไม่มีข้อมูลระยะยาวเลย

  return (
    <Card className="p-[22px]">
      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <CardTitle className="m-0 text-base font-semibold">แนวโน้มระยะยาว <span className="dim">· ปี {yearBE}</span></CardTitle>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>{view === 'yoy' ? `เทียบรายเดือนกับปี ${yearBE - 1}` : 'ยอดจริง vs เป้ารวมรายไตรมาส'} · เดือนตั้งแต่ ส.ค. 2569 = ยอดจริงจากออเดอร์ + ยอดมาร์เก็ตเพลสที่กรอกมือ</div>
        </div>
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v)} className="gap-0.5 rounded-md border bg-muted/30 p-0.5 shrink-0">
          <ToggleGroupItem value="yoy" size="sm" className="px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">ปีต่อปี</ToggleGroupItem>
          <ToggleGroupItem value="quarter" size="sm" className="px-2.5 data-[state=on]:bg-background data-[state=on]:shadow-sm">ไตรมาส</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === 'yoy' ? (
        yoy.length < 2 ? <div className="cap" style={{ color: 'var(--ink-4)', padding: '16px 0', textAlign: 'center' }}>ยังมีข้อมูลไม่พอเทียบปีต่อปี</div> : (
          <>
            <div className="flex items-end gap-1.5" style={{ height: 150 }} role="img" aria-label={`ยอดขายรายเดือน ปี ${yearBE} เทียบ ${yearBE - 1}`}>
              {yoy.map(({ mo, cur, prev }) => {
                const isCur = mo === curMo;
                const dimmed = curMo && !isCur;
                return (
                  <div key={mo} className="flex-1 flex flex-col items-center gap-1 min-w-0" style={{ opacity: dimmed ? 0.78 : 1 }}>
                    <span className="num cap" style={{ fontWeight: 700, color: 'var(--accent)', height: 14, lineHeight: '14px', visibility: isCur || yoy.length <= 6 ? 'visible' : 'hidden' }}>{cur ? Bk(cur) : ''}</span>
                    <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: 104 }}>
                      <span title={`${MO_AB[mo - 1]} ${yearBE - 1} · ${B(prev)}`} style={{ width: 8, height: `${Math.max(prev ? 2 : 0, prev / yoyMax * 100)}%`, background: 'var(--ink-4)', borderRadius: 2, opacity: 0.55 }} />
                      <span title={`${MO_AB[mo - 1]} ${yearBE} · ${B(cur)}`} style={{ width: 8, height: `${Math.max(cur ? 2 : 0, cur / yoyMax * 100)}%`, background: 'var(--accent)', borderRadius: 2, outline: isCur ? '2px solid color-mix(in srgb, var(--accent) 35%, transparent)' : 'none', outlineOffset: 1 }} />
                    </div>
                    <span className="cap" style={{ color: isCur ? 'var(--ink)' : 'var(--ink-4)', fontWeight: isCur ? 700 : 400 }}>{MO_AB[mo - 1]}</span>
                  </div>
                );
              })}
            </div>
            <div className="cap row" style={{ gap: 14, marginTop: 8, justifyContent: 'center', color: 'var(--ink-4)' }}>
              <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--accent)' }} /> {yearBE}</span>
              <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--ink-4)', opacity: 0.55 }} /> {yearBE - 1}</span>
            </div>
          </>
        )
      ) : (
        <div className="metric-grid">
          {quarters.map(({ q, actual, target, isCur }) => {
            const p = target > 0 ? Math.round(actual / target * 100) : null;
            return (
              <div key={q} className="metric-card" style={isCur ? { outline: '2px solid color-mix(in srgb, var(--accent) 35%, transparent)' } : undefined}>
                <div className="cap" style={{ color: 'var(--ink-3)' }}>Q{q + 1}/{yearBE}{isCur ? ' · ปัจจุบัน' : ''}</div>
                <div className="num" style={{ fontSize: 22, fontWeight: 700, marginTop: 3 }}>{actual ? B(actual) : '—'}</div>
                {target > 0
                  ? <><div className="cap" style={{ color: actual >= target ? 'var(--good)' : 'var(--ink-4)', marginTop: 2 }}>เป้า {B(target)} · {p}%</div>
                      <Progress value={Math.min(100, p)} indicatorColor={actual >= target ? 'var(--good)' : 'var(--accent)'} className="h-1.5 mt-2" aria-label={`ไตรมาส ${q + 1} ถึงเป้า ${p}%`} /></>
                  : <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>ไม่มีเป้า</div>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   TargetGauge — การ์ด "เป้าเดือน" ใน hero (รื้อ 22 ส.ค. · เกจโซนตามภาพ Company Dashboard ที่ user ส่ง)
   ============================================================
   จังหวะทำยอด (pace) = ยอดสะสมเดือน ÷ เป้าที่ "ควรได้ตอนนี้" (เป้า × วันที่ผ่านไป/วันทั้งเดือน)
   - เข็ม/เลขใหญ่ = pace% · โซน แดง <70% · เหลือง 70–100% · เขียว ≥100% (ตรงเกณฑ์ = ขีดกลาง)
   - สถานะ: หลุดเป้า / ใกล้เป้า / ตามเป้า / นำเป้า · ถึงเป้าทั้งเดือน = เขียวเต็ม
   - บรรทัดตัวเลข (ตามที่ user ขอ): MTD / เป้า pace · ต้องเฉลี่ย/วัน (ที่เหลือ) · Run rate (คาดสิ้นเดือน) · ออเดอร์ · AOV · งบแอด
   - เป้าต่อช่องทาง (ถ้ามี) = แถบจิ๋วท้ายการ์ด · ไม่มีเป้า = ลิงก์ไปตั้งค่า
   ข้อมูลทั้งหมดจาก useMonthTarget (สโคปทั้งเดือน ไม่ผูกช่วงที่กรอง)
   ============================================================ */
/* สถิติใต้เกจ — 3 ช่องเลขใหญ่ (ไม่ใช่ grid เล็กๆ 6 ช่อง) */
function Stat({ l, v, c, t }) {
  return <div title={t} style={{ minWidth: 0, textAlign: 'center' }}><div className="cap" style={{ color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{l}</div><div className="num" style={{ fontSize: 17, fontWeight: 800, color: c || 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-.3px', marginTop: 1 }}>{v}</div></div>;
}
export function TargetGauge({ mt, title = 'จังหวะทำยอด', emptyTitle = 'ยังไม่ตั้งเป้าเดือน', onSetTarget }) {
  if (!mt || !mt.has) return null;
  const { target, sales, dim, passed, isCur, ad, adBudget, label } = mt;
  if (!(target > 0)) {
    return (
      <div className="hero-target" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', gap: 6, minHeight: 180 }}>
        <Icon name="target" size={26} style={{ color: 'var(--ink-4)' }} />
        <div style={{ fontWeight: 700, color: 'var(--ink-2)' }}>{emptyTitle} {label}</div>
        <div className="cap" style={{ color: 'var(--ink-4)' }}>ตั้งเป้าได้ที่ ตั้งค่า → เป้า/คอม</div>
        {/* เป้าเดือน = หน้าแอดมิน (PART 119) — คนอื่นเห็นปุ่มแล้วกดไปเจอหน้าว่าง */}
        {busIsAdmin() && <button type="button" className="cap mt-1 text-[var(--accent)] hover:underline" style={{ fontWeight: 600 }} onClick={onSetTarget || (() => goSection('settings', 'targets'))}>ไปตั้งเป้า →</button>}
      </div>
    );
  }
  const paceTarget = target * (passed / dim);
  const pace = paceTarget > 0 ? sales / paceTarget : 0;
  const hit = sales >= target;
  const daysLeft = Math.max(0, dim - passed);
  const needDaily = daysLeft > 0 ? Math.max(0, target - sales) / daysLeft : 0;
  const curDaily = passed > 0 ? sales / passed : 0;
  const runRate = isCur && passed > 0 ? sales / passed * dim : sales;
  const tone = hit || pace >= 1 ? 'var(--good)' : pace >= 0.6 ? 'var(--warn)' : 'var(--bad)';
  const status = hit ? 'ถึงเป้าแล้ว' : pace >= 1.1 ? 'นำเป้า' : pace >= 1 ? 'ตามเป้า' : pace >= 0.6 ? 'ใกล้เป้า' : 'หลุดเป้า';
  const gap = sales - paceTarget;
  const pctTotal = sales / target * 100;
  return (
    <div className="hero-target" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      {/* หัว: ชื่อ + สถานะ · เป้าเดือนมุมขวา (แบบ "Target:" ในภาพอ้างอิง) */}
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-.2px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>{title} <span className="dim" style={{ fontSize: 13, fontWeight: 500 }}>· {label}</span></h3>
          <span className="kpi-delta" style={{ color: tone, background: 'transparent', border: `1.5px solid color-mix(in srgb, ${tone} 55%, transparent)`, fontSize: 12, padding: '1px 9px' }}>{status}</span>
        </div>
        <span className="cap num" style={{ color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>เป้า <b style={{ color: 'var(--ink-2)', fontWeight: 700, fontSize: 13 }}>{B(target)}</b></span>
      </div>
      {/* เกจ + เลขใหญ่ + ชิปช้า/เร็วกว่าแผน */}
      <div style={{ margin: '8px auto 0', width: '100%', maxWidth: 300 }} title="เข็ม = ยอดสะสมทั้งเดือน ÷ เป้าที่ควรได้ ณ วันนี้ (เป้า × วันที่ผ่านไป ÷ วันทั้งเดือน) · ขีดกลาง = ตรงแผนพอดี">
        <ZoneGauge value={hit ? 1.3 : pace} height={150} text={`${Math.round(pace * 100)}%`} subText="ของที่ควรได้วันนี้" textColor={tone} ariaLabel={`จังหวะทำยอดเดือน ${label}`} />
      </div>
      <div style={{ textAlign: 'center', marginTop: 6 }}>
        {hit
          ? <span className="kpi-delta" style={{ color: 'var(--good)', background: 'var(--good-soft)', fontSize: 12, padding: '3px 10px' }}><Icon name="check" size={12} /> เกินเป้า {B(sales - target)}</span>
          : <span className="kpi-delta" style={{ color: tone, background: `color-mix(in srgb, ${tone} 14%, transparent)`, fontSize: 12, padding: '3px 10px' }}><Icon name={gap >= 0 ? 'up' : 'down'} size={12} /> {gap >= 0 ? 'เร็วกว่าแผน' : 'ช้ากว่าแผน'} {B(Math.abs(gap))}</span>}
      </div>
      <div className="cap" style={{ textAlign: 'center', color: 'var(--ink-4)', marginTop: 8 }}>
        ทำได้ <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{B(sales)}</b> · ควรได้ตอนนี้ <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{B(paceTarget)}</b>{isCur ? ` · เหลือ ${daysLeft} วัน` : ''}
      </div>
      {/* 3 ตัวเลขที่ต้องรู้ — เลขใหญ่ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        {isCur && !hit
          ? <Stat l="ต้องเฉลี่ย/วัน" v={B(needDaily)} c={needDaily > curDaily * 1.5 ? 'var(--bad)' : needDaily > curDaily ? 'var(--warn)' : 'var(--good)'} t={`ยอดที่ต้องทำต่อวันจากนี้ถึงสิ้นเดือนเพื่อถึงเป้า · ตอนนี้ทำได้เฉลี่ย ${B(curDaily)}/วัน`} />
          : <Stat l="เฉลี่ย/วัน" v={B(curDaily)} t="ยอดเฉลี่ยต่อวันของเดือนนี้" />}
        <Stat l="Run rate" v={B(runRate)} c={runRate >= target ? 'var(--good)' : 'var(--ink)'} t="คาดยอดสิ้นเดือนถ้ารักษาจังหวะปัจจุบัน" />
        <Stat l="ทั้งเดือน" v={`${Math.round(pctTotal)}%`} c={hit ? 'var(--good)' : 'var(--ink)'} t={`ยอดสะสม ${B(sales)} จากเป้า ${B(target)}`} />
      </div>
      {/* งบแอดรวม — บรรทัดเล็กท้ายการ์ด (รายช่องทางดูที่การ์ด "เป้ารายช่องทาง" ใต้ hero) */}
      {adBudget > 0 && (() => { const p = ad / adBudget * 100; const over = ad > adBudget; return (
        <div className="row cap" style={{ gap: 8, alignItems: 'center', marginTop: 12 }} title={`ใช้ไป ${B(ad)} จากงบ ${B(adBudget)} · เหลือ ${B(Math.max(0, adBudget - ad))}`}>
          <span style={{ flex: '0 0 66px', color: 'var(--ink-3)', fontWeight: 600 }}>งบแอด</span>
          <span style={{ flex: 1, height: 5, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.min(100, p)}%`, height: '100%', background: over ? 'var(--bad)' : p >= 85 ? 'var(--warn)' : 'var(--accent)', borderRadius: 999 }} /></span>
          <span className="num" style={{ flex: '0 0 auto', color: over ? 'var(--bad)' : 'var(--ink-4)', whiteSpace: 'nowrap' }}>ใช้ {B(ad)} / {Bk(adBudget)} · เหลือ {Bk(Math.max(0, adBudget - ad))}</span>
        </div>
      ); })()}
    </div>
  );
}

/* ============================================================
   ChannelTargetGrid — "เป้ารายช่องทาง" ใต้ hero (user ขอ 22 ส.ค.: เกจครึ่งวงกลมรายช่องทาง + ค่าแอดใช้ไป/เหลือ)
   ============================================================
   การ์ดละช่องทาง (เฉพาะช่องที่ตั้งเป้ายอดหรืองบแอดไว้): โลโก้ · เกจ = % ของเป้าเดือน (โซนแดง/เหลือง/เขียวเลื่อนตามวันที่ผ่านไป:
   เขียว ≥ ควรได้ตอนนี้ · เหลือง 70–100% ของควรได้ · แดง ต่ำกว่า · ขีด = 100% เป้า) · ทำได้/เป้า/เหลือ
   · แอด: ใช้ไป/งบ/เหลือ + ROAS · สโคปทั้งเดือน (ข้อมูลจาก useMonthTarget)
   ============================================================ */
export function ChannelTargetGrid({ mt, onPick }) {
  if (!mt || !mt.has) return null;
  const { chT = {}, chSales = {}, chAd = {}, chAdBudget = {}, dim, passed, label } = mt;
  // ทุกช่องทาง (user สั่ง 22 ส.ค.: ไม่มีเป้า/ไม่ใช้แอดก็ต้องโชว์) = ชุดช่องทางมาตรฐาน ∪ ที่มีเป้า ∪ ที่มียอดเดือนนี้
  // เรียง: มีเป้า (เป้ามาก→น้อย) ก่อน → ที่เหลือเรียงตามยอดเดือนนี้
  const chans = [...new Set([...CHANNELS, ...Object.keys(chT), ...Object.keys(chAdBudget), ...Object.keys(chSales)])]
    .filter(k => Number(chT[k]) > 0 || Number(chAdBudget[k]) > 0 || Number(chSales[k]) > 0 || Number(chAd[k]) > 0) // ช่องที่ไม่มีอะไรเลยทั้งเดือน (0 ทุกอย่าง) ไม่โชว์ — ไม่ใช่ข้อมูล
    .sort((a, b) => ((Number(chT[b]) || 0) - (Number(chT[a]) || 0)) || ((Number(chSales[b]) || 0) - (Number(chSales[a]) || 0)));
  if (!chans.length) return null;
  const exp = Math.max(0.02, Math.min(1, passed / dim)); // ควรได้ตอนนี้ (สัดส่วนของเป้า)
  const zones = [{ to: 0.6 * exp, color: 'var(--gauge-bad)' }, { to: exp, color: 'var(--gauge-warn)' }, { to: 1.3, color: 'var(--gauge-good)' }];
  const withTarget = chans.filter(ch => Number(chT[ch]) > 0);
  const noTarget = chans.filter(ch => !(Number(chT[ch]) > 0));
  const pickProps = (ch) => onPick ? { role: 'button', tabIndex: 0, onClick: () => onPick('channel', ch), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick('channel', ch); } } } : {};
  return (
    <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
    {/* การ์ดเกจ: flex ยืดเต็มแถว (ใบละ 280–460px) · ช่องไม่มีเป้า = คอลัมน์เล็กซ้อนแนวตั้งทางขวา (เติมที่ว่าง ไม่มีแถวลอย) */}
    {withTarget.map((ch, i) => {
        const tg = Number(chT[ch]) || 0, ms = Number(chSales[ch]) || 0;
        const ad = Number(chAd[ch]) || 0, bud = Number(chAdBudget[ch]) || 0;
        const p = tg > 0 ? ms / tg : 0;
        const hit = tg > 0 && ms >= tg;
        const tone = hit || p >= exp ? 'var(--good)' : p >= 0.6 * exp ? 'var(--warn)' : 'var(--bad)';
        const status = hit ? 'ถึงเป้า' : p >= exp ? 'ตามเป้า' : p >= 0.6 * exp ? 'ใกล้เป้า' : 'หลุดเป้า';
        const tint = channelTint(ch);
        const adP = bud > 0 ? ad / bud * 100 : 0, adOver = bud > 0 && ad > bud;
        const roas = ad > 0 ? ms / ad : null;
        return (
          <div key={ch} className="metric-card metric-anim" style={{ '--i': i, borderLeft: `3px solid ${tint}`, display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 280px', maxWidth: 460, cursor: onPick ? 'pointer' : undefined }}
            role={onPick ? 'button' : undefined} tabIndex={onPick ? 0 : undefined} onClick={onPick ? () => onPick('channel', ch) : undefined}
            onKeyDown={onPick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick('channel', ch); } } : undefined}
            title={`${ch} · เป้าเดือน ${label}${onPick ? ' · กดเพื่อกรองช่องทางทั้งหน้า' : ''}`}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <span className="row" style={{ gap: 7, alignItems: 'center', minWidth: 0 }}>
                <span className="ch-logo" style={{ width: 24, height: 24, borderRadius: 7, color: tint, background: `color-mix(in srgb, ${tint} 14%, var(--surface))` }}><ChannelLogo name={ch} size={13} /></span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch}</span>
              </span>
              <span className="kpi-delta" style={{ color: tone, background: 'transparent', border: `1.5px solid color-mix(in srgb, ${tone} 55%, transparent)` }}>{status}</span>
            </div>
            {(
              <>
                <div style={{ margin: '4px auto 0', width: '100%', maxWidth: 200 }}>
                  <ZoneGauge value={p} max={1.3} zones={zones} height={96} text={`${Math.round(p * 100)}%`} subText="ของเป้าเดือน" textColor={tone} ariaLabel={`${ch} ทำได้ ${Math.round(p * 100)}% ของเป้า`} />
                </div>
                <div className="cap" style={{ textAlign: 'center', color: 'var(--ink-4)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`ทำได้ ${B(ms)} · เป้า ${B(tg)} · ควรได้ตอนนี้ ${B(tg * exp)}`}>
                  <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{B(ms)}</b> / {B(tg)}
                  {!hit && <> · เหลือ <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{Bk(tg - ms)}</b></>}
                  {hit && <> · <span style={{ color: 'var(--good)', fontWeight: 600 }}>เกิน {Bk(ms - tg)}</span></>}
                </div>
              </>
            )}
            {/* แอด: ใช้ไป / งบ / เหลือ + ROAS */}
            {(bud > 0 || ad > 0) && (
              <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                {bud > 0 && (
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-3)', overflow: 'hidden' }} role="img" aria-label={`แอด ${ch} ใช้ไป ${Math.round(adP)}% ของงบ`}>
                    <span style={{ display: 'block', width: `${Math.min(100, adP)}%`, height: '100%', background: adOver ? 'var(--bad)' : adP >= 85 ? 'var(--warn)' : 'var(--accent)', borderRadius: 999 }} />
                  </div>
                )}
                <div className="cap row" style={{ justifyContent: 'space-between', gap: '2px 8px', marginTop: bud > 0 ? 5 : 0, color: 'var(--ink-4)', whiteSpace: 'nowrap', flexWrap: 'wrap' }} title={`ค่าแอด ${B(ad)}${bud > 0 ? ` จากงบ ${B(bud)}` : ''}`}>
                  <span>แอด <b className="num" style={{ color: adOver ? 'var(--bad)' : 'var(--ink-2)', fontWeight: 700 }}>{Bk(ad)}</b>{bud > 0 && <> / {Bk(bud)} · {adOver ? <span style={{ color: 'var(--bad)', fontWeight: 600 }}>เกิน {Bk(ad - bud)}</span> : <>เหลือ <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 600 }}>{Bk(bud - ad)}</b></>}</>}</span>
                  {roas != null && <span className="num" style={{ fontWeight: 700, color: roas >= 3 ? 'var(--good)' : roas >= 1.5 ? 'var(--warn)' : 'var(--bad)' }} title="ROAS = ยอดขาย ÷ ค่าแอด (ทั้งเดือน)">ROAS {roas.toFixed(1)}x</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    {/* ไม่มีเป้า = การ์ดเล็กซ้อนแนวตั้ง (คอลัมน์ขวา · กว้าง 200–260px · สูงตามแถว) */}
    {noTarget.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '1 1 200px', minWidth: 190, maxWidth: 280, alignSelf: 'stretch' }}>
        <div className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600, padding: '0 2px' }}>ช่องทางอื่น · ยังไม่ตั้งเป้า</div>
        {noTarget.map(ch => {
          const ms = Number(chSales[ch]) || 0, ad = Number(chAd[ch]) || 0, bud = Number(chAdBudget[ch]) || 0, tint = channelTint(ch);
          return (
            <div key={ch} {...pickProps(ch)} className="metric-card" title={`${ch} · ยอดเดือนนี้ ${B(ms)} · ยังไม่ตั้งเป้า${onPick ? ' · กดเพื่อกรองช่องทาง' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px 7px 9px', borderLeft: `3px solid ${tint}`, cursor: onPick ? 'pointer' : undefined, minWidth: 0, flex: '1 1 auto' }}>
              <span className="ch-logo" style={{ width: 26, height: 26, borderRadius: 7, color: tint, background: `color-mix(in srgb, ${tint} 14%, var(--surface))`, flex: 'none' }}><ChannelLogo name={ch} size={14} /></span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="cap" style={{ display: 'block', color: 'var(--ink-3)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch}</span>
                <span className="num" style={{ display: 'block', fontSize: 15, fontWeight: 800, color: ms > 0 ? 'var(--ink)' : 'var(--ink-4)', lineHeight: 1.15 }}>{B(ms)}</span>
                {(ad > 0 || bud > 0) && <span className="cap" style={{ display: 'block', color: ad > bud && bud > 0 ? 'var(--bad)' : 'var(--ink-4)', whiteSpace: 'nowrap' }}>แอด {Bk(ad)}{bud > 0 ? ` / ${Bk(bud)}` : ''}</span>}
              </span>
              <button type="button" className="cap text-[var(--accent)] hover:underline" style={{ fontWeight: 600, whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); goSection('settings', 'targets'); }} title="ตั้งเป้ายอด/งบแอดให้ช่องทางนี้">ตั้งเป้า</button>
            </div>
          );
        })}
      </div>
    )}
    </div>
  );
}

/* ============================================================
   useMonthTarget — ข้อมูลเป้าเดือน (เป้ารวม/ต่อช่องทาง/งบแอด + ยอดสะสมทั้งเดือนจริง) สำหรับฝังใน hero รายงานขาย
   ============================================================
   - ไม่ผูกกับช่วงที่เลือก — ยึด "เดือนของวันสุดท้ายในช่วง" · เทียบกับยอดสะสมทั้งเดือนจริง (fetchMergedMonth · แชร์ cache)
     → เป้าโชว์เสมอแม้ดู MTD/30วัน · ตัวเลขความหมายตรง (เป้าเดือน vs ยอดเดือน)
   - อ่านแถวด้วย month+year(พ.ศ.) (id ในตารางเก่าเป็น พ.ศ. — ห้าม hardcode) · refetch เมื่อกลับมาโฟกัสหน้า
   - คืน null ระหว่างโหลด / เดือนยุคเก่า
   ============================================================ */

// useMonthTarget ย้ายไป lib/monthTarget.js (PART 122 — หน้าแรกต้องใช้แต่ห้ามลาก recharts เข้า first paint)
// re-export ให้โค้ดเดิมที่ import จากไฟล์นี้ยังทำงาน
export { useMonthTarget } from './lib/monthTarget.js';
