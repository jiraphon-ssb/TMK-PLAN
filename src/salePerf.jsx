/* ============================================================
   TMK Operation — "ประสิทธิภาพเซลล์" (Salesperson Performance)
   ============================================================
   รายเดือน + รายวัน ละเอียดต่อคน — แยกรายคน (แบบหน้าออเดอร์/ส่งยอด · roleAccess):
   แอดมินเห็นทั้งทีม · เซลล์ (editor/viewer) เห็นเฉพาะของตัวเอง (salesperson = ชื่อ/อีเมล)
   - แหล่งข้อมูลเดียวกับรายงานขาย: tmk_mp_orders (ตัด cancelled) + tmk_sales_funnel + targets + tmk_sale_receipts
   - เทียบเดือนก่อน (▲▼%) + Sparkline/Heatmap แนวโน้มรายวัน (Q&A เลือก)
   - realtime: ส่งใบ/กรอกคนทัก → หน้านี้ขยับสด (useSaleRealtime)
   ============================================================ */
import { useState, useEffect, useMemo, useCallback, Suspense, useRef } from 'react';
import { lazyRetry } from './lib/lazyRetry.js';
import { createPortal } from 'react-dom';
import { Icon, N, PersonAvatar, SourceBadge, InfoTip } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import {
  cachedFetchRange, cachedFetchAll, ORDERS_SEL, SKUS_SEL, OVERRIDES_SEL, FUNNEL_SEL, funnelNewOld,
  strayOverrideOrderNos, fetchOrdersByNos, dedupeOrders,
} from './lib/saleData.js';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { mergeOrderOverrides } from './lib/saleOverrides.js';
import { fetchTargets, commissionFor, commissionDisplay } from './lib/targets.js';
import { channelRows } from './lib/uiLogic.js';
import { useUser } from './userContext.jsx';
import { isAdmin, myNamesOf, orderVisibleTo, canSeeTeamBoard } from './lib/roleAccess.js';
import { fmtB, monthLabel, prevMonthOf, MEDAL, closeTone, pickVoice } from './lib/salePerfView.js';
import { bucketLabel } from './lib/saleTime.js';
import { useRenderCount } from './realtime/useRenderCount.js';
import { buildPerf, chatClosedOf, NO_SELLER, curMonth, daysInMonth, dayOf, isCancelled, spOf, deltaPct } from './lib/salePerfAgg.js';
import { useSaleLiveReload } from './lib/useSaleLive.js';
import { pgErrorText } from './lib/pgError.js';
import { canEdit as busCanEdit, goSection, lockedSections } from './lib/appBus.js';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { SideSheet } from './modals-core.jsx';
import { VoiceFeed, QuickFab } from './saleWidgets.jsx';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { MonthPicker } from './components/MonthPicker.jsx';
import { OrderCard, daySummary, DaySummaryBar, isCodOrder } from './orderCard.jsx';
import { DayDetailSheet, VoiceCard, LeadPanel } from './dayDetailSheet.jsx';
import { CustomerDrawer, custFromOrders } from './customerDrawer.jsx';
import { usePersistedState } from './hooks/usePersistedState.js';
import { HBars, Sparkline, channelColor, DailySalesChart } from './charts.jsx';
import { KpiCard } from './saleDashboardChrome.jsx';
import { SortableTable } from './components/DataTableParts.jsx';
import { TableRow, TableCell } from '@/components/ui/table';
import { MultiSelect } from './components/MultiSelect.jsx'; // แหล่งเดียวของทั้งแอป (เดิมมีสำเนา 6 ชุด)
// PART 96: ปุ่มลัด "คนทัก+เสียงลูกค้า" / "ส่งยอด" — lazy โหลดเฉพาะตอนเปิด popup (กันหน้านี้หนักขึ้น)
const LeadsQuickSheet = lazyRetry(() => import('./views-sale-submit.jsx').then(m => ({ default: m.LeadsQuickSheet })), 'sale-submit-leads');
const SubmitQuickSheet = lazyRetry(() => import('./views-sale-submit.jsx').then(m => ({ default: m.SubmitQuickSheet })), 'sale-submit-submit');
// ป๊อปอัพ "ค่าคอมรอบตัด" (26→25) — lazy: โหลดเฉพาะตอนกดปุ่ม ไม่ถ่วงหน้า
const CommissionCycleSheet = lazyRetry(() => import('./commissionCycleSheet.jsx').then(m => ({ default: m.CommissionCycleSheet })), 'commissionCycleSheet');

// เทียบเดือนก่อน — cap ที่ 300% กันตัวเลขระเบิด (ช่วงข้อมูลยังน้อย เช่น ส.ค. เทียบ ก.ค. ที่เพิ่งเริ่ม → 8600%)
const DELTA_CAP = 300;
// delta → รูปแบบที่ KpiCard ใช้ (▲▼ + สี) · cap เท่ากับ dPill
const dObj = (d) => {
  if (d == null) return null;
  const mag = Math.abs(Math.round(d));
  const shown = Math.min(mag, DELTA_CAP);
  return { txt: (d >= 0 ? '+' : '−') + shown + '%' + (mag > DELTA_CAP ? '+' : ''), dir: d >= 0 ? 1 : -1, good: d >= 0 };
};
const dPill = (d) => {
  if (d == null) return null;
  const mag = Math.abs(Math.round(d));
  const shown = Math.min(mag, DELTA_CAP);
  return (
    <span className={`text-[11px] font-medium ${d >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{d >= 0 ? '▲' : '▼'} {shown}%{mag > DELTA_CAP ? '+' : ''}</span>
  );
};
/* คนทัก = การ์ดย่อย (tiles: ทักรวม/ใหม่/เก่า/%ปิด) — อ่านง่าย · โชว์เสมอแม้ 0 + hint · compact สำหรับการ์ดเซลล์ */

/* Skeleton หน้าประสิทธิภาพเซลล์ — ตรงเลย์เอาต์จริง (การ์ดทีม/คนทัก/กราฟ/การ์ดเซลล์) · bodyOnly = ใต้ header จริง */
// shadcn <Skeleton> (shimmer .skel) — ให้ลุคตรงกับ skeleton หน้าอื่นทั้งแอป
const Sk = ({ className }) => <Skeleton className={className} />;
function PerfSkeleton({ bodyOnly = false }) {
  const body = (
    <div className="flex flex-col gap-4">
      {/* การ์ดทีมบน 3 ใบ */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => <div key={i} className="rounded-xl border p-3 flex flex-col gap-2"><Sk className="h-3 w-16" /><Sk className="h-6 w-24" /></div>)}
      </div>
      {/* คนทัก panel (4 tiles) */}
      <div className="rounded-xl border p-3 flex flex-col gap-2">
        <Sk className="h-3 w-24" />
        <div className="grid grid-cols-4 gap-2">{[0, 1, 2, 3].map(i => <div key={i} className="rounded-lg border p-2 flex flex-col items-center gap-1.5"><Sk className="h-2.5 w-10" /><Sk className="h-4 w-8" /></div>)}</div>
      </div>
      {/* กราฟแนวโน้ม */}
      <div className="rounded-xl border p-4 flex flex-col gap-3"><Sk className="h-3 w-40" /><Sk className="h-[200px] w-full rounded-xl" /></div>
      {/* การ์ดเซลล์ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="rounded-2xl border p-4 flex flex-col gap-3.5">
            <div className="flex items-center gap-2.5"><Sk className="size-9 rounded-full" /><div className="flex-1 flex flex-col gap-1.5"><Sk className="h-3 w-24" /><Sk className="h-2 w-16" /></div></div>
            <Sk className="h-7 w-32" /><Sk className="h-1.5 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map(j => <div key={j} className="flex flex-col items-center gap-1.5"><Sk className="h-2.5 w-8" /><Sk className="h-3.5 w-10" /></div>)}</div>
            <div className="grid grid-cols-4 gap-1.5">{[0, 1, 2, 3].map(j => <Sk key={j} className="h-9 rounded-lg" />)}</div>
          </div>
        ))}
      </div>
    </div>
  );
  if (bodyOnly) return body;
  return (
    <div className="content-inner rise flex flex-col gap-4">
      <div className="rounded-xl border p-4 flex items-center gap-2 flex-wrap"><Sk className="h-5 w-32" /><Sk className="h-8 w-28 rounded-full" /><Sk className="h-8 w-40 rounded-full sm:ml-auto" /></div>
      {body}
    </div>
  );
}


/* ---- aggregate ต่อเดือน ---- */
/* ---- การ์ดเซลล์รายคน (โหมด default แท็บรายเดือน) — คลิกเปิด drawer เดิม ---- */
/* ---- ตารางอันดับทีม (แทนการ์ดรายคน · user เลือก 22 ส.ค.) ----
   เดิมการ์ด 1 ใบ/คน มี 6 ชั้น → เทียบข้ามคนต้องกวาดสายตาขึ้นลง · ranking = งานของตาราง/บาร์ (ui-ux-pro-max chart)
   แถวเดียวเห็น: อันดับ · คน · แถบยอด+%ของทีม · Δ · ออเดอร์/ตัว/เฉลี่ย · คนทัก+%ปิด · เป้า/คอม · แนวโน้ม
   มือถือ (≤700px) แปลงเป็นการ์ดอัตโนมัติด้วย CardTable pattern เดิมของระบบ (prop cards) */
function TeamBoard({ rows, rankMap, teamSales, deltas, onOpen }) {
  const maxSales = Math.max(1, ...rows.map(r => r.sales));
  return (
    <Card className="p-[22px]">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div className="text-base font-semibold">อันดับเซลล์ <span className="dim font-normal">· {N(rows.length)} คน</span></div>
        <span className="cap" style={{ color: 'var(--ink-4)' }}>คลิกแถวเพื่อดูรายละเอียดรายคน · %ปิด เกณฑ์ดี ≥15%</span>
      </div>
      <SortableTable cards density="cozy" initial={{ key: 'sales', dir: 'desc' }}
        columns={[
          { key: 'name', label: 'เซลล์', accessor: r => r.name },
          { key: 'sales', label: 'ยอดขาย', align: 'right', accessor: r => r.sales },
          { key: 'orders', label: 'ออเดอร์', align: 'right', accessor: r => r.orders },
          { key: 'qty', label: 'ตัว', align: 'right', accessor: r => r.qty },
          { key: 'aov', label: 'เฉลี่ย/ออเดอร์', align: 'right', accessor: r => r.aov },
          { key: 'leads', label: 'คนทัก', align: 'right', accessor: r => r.leads },
          { key: 'close', label: '%ปิด', align: 'right', accessor: r => (r.closeRate == null ? -1 : r.closeRate) },
          { key: 'money', label: 'เป้า/คอม', sortable: false },
          { key: 'trend', label: 'แนวโน้ม', sortable: false },
        ]}
        rows={rows}
        renderRow={(r) => {
          const rank = rankMap.get(r.name) ?? 99;
          const medal = rank < 3 ? MEDAL[rank] : null;
          const cmp = deltas.get(r.name);
          const noSeller = r.name === NO_SELLER;
          const share = teamSales > 0 ? r.sales / teamSales * 100 : 0;
          const cd = commissionDisplay(r);
          const nw = r.newOld?.new || 0, old = r.newOld?.old || 0, lt = nw + old;
          return (
            <TableRow key={r.name} onClick={() => onOpen(r.name)} style={{ cursor: 'pointer' }} title={`ดูรายละเอียดของ ${noSeller ? 'ไม่ระบุเซลล์' : r.name}`}>
              <TableCell className="cell-title">
                <span className="row" style={{ gap: 9, alignItems: 'center', minWidth: 0 }}>
                  <span className="grid place-items-center size-6 rounded-lg text-[11px] font-extrabold shrink-0"
                    style={medal ? { background: `color-mix(in srgb, ${medal} 18%, transparent)`, color: medal } : { background: 'var(--surface-2)', color: 'var(--ink-4)' }}>{rank + 1}</span>
                  {noSeller
                    ? <span className="grid place-items-center rounded-full size-7 shrink-0" style={{ background: 'var(--surface-3)', color: 'var(--ink-3)' }}><Icon name="external" className="size-3.5" /></span>
                    : <PersonAvatar name={r.name} size={28} className="shrink-0" />}
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{noSeller ? 'ไม่ระบุเซลล์' : r.name}</span>
                </span>
              </TableCell>
              <TableCell style={{ minWidth: 190 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <span className="tb-bar" style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', minWidth: 40 }}>
                    <span style={{ display: 'block', width: `${Math.max(2, r.sales / maxSales * 100)}%`, height: '100%', borderRadius: 4, background: medal ? `linear-gradient(90deg, var(--accent), ${medal})` : 'linear-gradient(90deg, var(--accent), var(--accent-2))' }} />
                  </span>
                  <span className="num" style={{ fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap' }}>{fmtB(r.sales)}</span>
                </div>
                <div className="row cap tb-share" style={{ gap: 6, justifyContent: 'flex-end', color: 'var(--ink-4)', marginTop: 2, whiteSpace: 'nowrap' }}>
                  <span>{Math.round(share)}% ของทีม</span>{dPill(cmp ? cmp.sales : r.dSales)}
                </div>
              </TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{N(r.orders)}{cmp?.orders != null && <div className="leading-none">{dPill(cmp.orders)}</div>}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{N(r.qty)}</TableCell>
              <TableCell className="num" style={{ textAlign: 'right' }}>{fmtB(r.aov)}{cmp?.aov != null && <div className="leading-none">{dPill(cmp.aov)}</div>}</TableCell>
              <TableCell style={{ textAlign: 'right' }}>
                {r.leads ? (<>
                  <span className="num" style={{ fontWeight: 600 }}>{N(r.leads)}</span>
                  {lt > 0 && <div className="row" style={{ gap: 4, justifyContent: 'flex-end', alignItems: 'center', marginTop: 3 }} title={`ใหม่ ${N(nw)} · เก่า ${N(old)}`}>
                    <span className="flex h-1.5 w-14 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
                      <span style={{ width: `${nw / lt * 100}%`, background: 'var(--good)' }} /><span style={{ width: `${old / lt * 100}%`, background: 'var(--ink-4)' }} />
                    </span>
                  </div>}
                </>) : <span className="cap" style={{ color: 'var(--warn)' }}>ยังไม่กรอก</span>}
              </TableCell>
              <TableCell className="num" style={{ textAlign: 'right', fontWeight: 700, color: r.closeRate == null ? 'var(--ink-4)' : closeTone(r.closeRate) }}>
                {r.closeRate == null ? '—' : (r.closeRate > 100 ? '100%+' : Math.round(r.closeRate) + '%')}
              </TableCell>
              <TableCell className="cap" style={{ whiteSpace: 'nowrap' }}>
                {cd.mode === 'target' ? (
                  <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                    <span style={{ width: 44, height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden', flex: 'none' }}>
                      <span style={{ display: 'block', width: `${Math.min(100, r.pctTarget)}%`, height: '100%', background: r.sales >= r.target ? 'var(--good)' : 'var(--accent)' }} />
                    </span>
                    <span className="num" style={{ color: r.sales >= r.target ? 'var(--good)' : 'var(--ink-3)', fontWeight: 700 }}>{Math.round(r.pctTarget)}%</span>
                    {r.comm > 0 && <span className="num" style={{ color: 'var(--accent-2)', fontWeight: 600 }}>· คอม {fmtB(r.comm)}</span>}
                  </span>
                ) : cd.mode === 'commOnly' ? <span className="num" style={{ color: 'var(--accent-2)', fontWeight: 600 }}>คอม {fmtB(cd.comm)} <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>· {cd.rateLabel}</span></span>
                  : (!noSeller && busCanEdit()
                    ? <button type="button" className="text-[var(--accent)] hover:underline" onClick={(e) => { e.stopPropagation(); goSection('settings', 'targets'); }}>ตั้งเป้า/คอม</button>
                    : <span style={{ color: 'var(--ink-4)' }}>—</span>)}
              </TableCell>
              <TableCell><span className="row" style={{ gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}><Sparkline data={r.daily.map(d => d.sales)} w={92} h={22} /><Icon name="arrowR" /></span></TableCell>
            </TableRow>
          );
        }} />
    </Card>
  );
}

/* ---- คนทักแบบบรรทัดเดียว (การ์ดเซลล์/แผงรายคน) — เดิม 4 ไทล์กรอบใหญ่ ซ้ำแพตเทิร์นกับ KPI ทำให้การ์ดแน่น ---- */
function LeadLine({ total = 0, nw = 0, old = 0, close = null, chatOrders = 0, hint = true }) {
  const t = nw + old;
  if (!total) return hint ? <div className="text-[11px]" style={{ color: 'var(--warn)' }}>ยังไม่กรอกคนทัก — กรอกที่ปุ่ม “คนทัก”</div> : null;
  return (
    <div className="flex items-center gap-2.5 flex-wrap text-[12px]">
      <span className="text-muted-foreground">คนทัก <b className="num" style={{ color: 'var(--ink)', fontWeight: 700 }}>{N(total)}</b></span>
      {t > 0 && (
        <span className="flex items-center gap-1.5 min-w-0" title={`ใหม่ ${N(nw)} · เก่า ${N(old)}`}>
          <span className="flex h-1.5 w-16 overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
            <span style={{ width: `${nw / t * 100}%`, background: 'var(--good)' }} /><span style={{ width: `${old / t * 100}%`, background: 'var(--ink-4)' }} />
          </span>
          <span className="text-muted-foreground">ใหม่ <b className="num" style={{ color: 'var(--good)' }}>{N(nw)}</b> · เก่า <b className="num" style={{ color: 'var(--ink-3)' }}>{N(old)}</b></span>
        </span>
      )}
      <span className="ml-auto whitespace-nowrap" title={close == null ? 'ยังไม่มีข้อมูลคนทัก' : `ปิดได้ ${N(chatOrders)} จาก ${N(total)} · เกณฑ์ดี ≥15%`}>
        <span className="text-muted-foreground">%ปิด </span>
        <b className="num" style={{ color: close == null ? 'var(--ink-4)' : closeTone(close), fontWeight: 700 }}>{close == null ? '—' : (close > 100 ? '100%+' : Math.round(close) + '%')}</b>
      </span>
    </div>
  );
}

/* ---- HERO A (รื้อรอบ 2 · 22 ส.ค.): ยอดรวมใหญ่ + แถบ โอน/COD เต็มกว้าง + สถิติที่คำนวณจากยอดจริง ----
   user ตัด "เป้า/ค่าคอมทีม" ออก → ครึ่งขวาเปลี่ยนเป็น เฉลี่ย/วัน · คาดสิ้นเดือน · วันที่ขายดีสุด (ไม่ต้องตั้งค่าอะไรก็มีค่าเสมอ) */
function TeamHero({ sales, dSales, transfer, cod, dailyTotals = [], passed, dim, isCur, prevLabel, monthName }) {
  const pay = transfer + cod;
  const avgDay = passed > 0 ? sales / passed : 0;
  const runRate = isCur && passed > 0 ? sales / passed * dim : null;
  const best = dailyTotals.reduce((b, v, i) => (v > b.v ? { v, i } : b), { v: 0, i: -1 });
  const activeDays = dailyTotals.filter(v => v > 0).length;
  const stat = (label, value, sub, tone) => (
    <div key={label} className="perf-stat" style={{ minWidth: 0 }}>
      <div className="perf-stat-label text-[11px] text-muted-foreground">{label}</div>
      <div className="perf-stat-value num" style={{ color: tone || 'var(--ink)' }}>{value}</div>
      {sub && <div className="perf-stat-sub cap" style={{ color: 'var(--ink-4)' }}>{sub}</div>}
    </div>
  );
  return (
    <Card className="p-[22px]">
      <div className="perf-hero">
        <div style={{ minWidth: 0 }}>
          <div className="text-[11px] font-semibold text-muted-foreground">ยอดขายรวม <span className="font-normal">· {monthName}</span></div>
          <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2 }}>
            <span className="num" style={{ fontSize: 40, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.05, color: 'var(--accent-2)' }}>{fmtB(sales)}</span>
            {dPill(dSales)}
            {dSales != null && <span className="text-[11px] text-muted-foreground">เทียบ {prevLabel}</span>}
          </div>
          {pay > 0 ? (
            <div style={{ marginTop: 14 }}>
              <div className="row cap" style={{ justifyContent: 'space-between', color: 'var(--ink-4)' }}>
                <span>โอน <b className="num" style={{ color: 'var(--good)', fontWeight: 700 }}>{fmtB(transfer)}</b> · {Math.round(transfer / pay * 100)}%</span>
                <span>COD <b className="num" style={{ color: 'var(--warn)', fontWeight: 700 }}>{fmtB(cod)}</b> · {Math.round(cod / pay * 100)}%</span>
              </div>
              <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)', marginTop: 5 }} role="img" aria-label={`โอน ${Math.round(transfer / pay * 100)}% · COD ${Math.round(cod / pay * 100)}%`}>
                <span style={{ width: `${transfer / pay * 100}%`, background: 'var(--good)' }} />
                <span style={{ width: `${cod / pay * 100}%`, background: 'var(--warn)' }} />
              </div>
              {Math.abs(pay - sales) > 1 && <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 4 }}>อีก {fmtB(Math.max(0, sales - pay))} ยังไม่ระบุวิธีชำระ</div>}
            </div>
          ) : <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 12 }}>ยังไม่มีข้อมูลวิธีชำระเงินในเดือนนี้</div>}
        </div>
        <div className="perf-hero-stats">
          {stat('เฉลี่ย/วัน', fmtB(Math.round(avgDay)), isCur ? `จาก ${N(passed)} วันที่ผ่านไป` : `จาก ${N(dim)} วัน`)}
          {runRate != null
            ? stat('คาดทั้งเดือน', fmtB(Math.round(runRate)), 'ถ้าทำได้เท่านี้ต่อวัน', 'var(--accent-2)')
            : stat('วันที่ขายได้', `${N(activeDays)} วัน`, `จาก ${N(dim)} วัน`)}
          {best.i >= 0 ? stat('วันขายดีสุด', fmtB(Math.round(best.v)), `วันที่ ${best.i + 1}`) : stat('วันขายดีสุด', '—', 'ยังไม่มียอด')}
        </div>
      </div>
    </Card>
  );
}

/* ---- คนทักระดับทีม: แถบเดียว (เดิม 4 ไทล์ลอย ไม่มีบริบทว่าดี/ไม่ดี) ---- */
function LeadStrip({ total = 0, nw = 0, old = 0, close = null, chatOrders = 0, title = 'คนทัก' }) {
  const t = nw + old;
  const tone = close == null ? 'var(--ink-3)' : closeTone(close);
  return (
    <Card className="p-[16px_22px]">
      <div className="row" style={{ gap: '12px 26px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div className="text-[11px] text-muted-foreground">{title}</div>
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <span className="num" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.4px' }}>{N(total)}</span>
            <span className="cap text-muted-foreground">คนที่ทักเข้ามา</span>
          </div>
        </div>
        {t > 0 && (
          <div style={{ flex: '1 1 180px', maxWidth: 300, minWidth: 0 }}>
            <div className="row cap" style={{ justifyContent: 'space-between', color: 'var(--ink-4)' }}><span>ใหม่ <b className="num" style={{ color: 'var(--good)', fontWeight: 700 }}>{N(nw)}</b></span><span>เก่า <b className="num" style={{ color: 'var(--ink-3)', fontWeight: 700 }}>{N(old)}</b></span></div>
            <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)', marginTop: 4 }}>
              <span style={{ width: `${nw / t * 100}%`, background: 'var(--good)' }} /><span style={{ width: `${old / t * 100}%`, background: 'var(--ink-4)' }} />
            </div>
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="text-[11px] text-muted-foreground">%ปิดการขาย <InfoTip text="ออเดอร์จากช่องแชท ÷ คนทัก (ตัดมาร์เก็ตเพลส) · เกณฑ์: ≥15% ดี · 8–15% พอใช้ · ต่ำกว่า 8% ต้องปรับ" /></div>
          <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <span className="num" style={{ fontSize: 24, fontWeight: 800, color: tone, letterSpacing: '-.4px' }}>{close == null ? '—' : (close > 100 ? '100%+' : Math.round(close) + '%')}</span>
            <span className="cap text-muted-foreground">{close == null ? 'ยังไม่มีข้อมูลคนทัก' : `ปิดได้ ${N(chatOrders)} จาก ${N(total)} · เกณฑ์ดี ≥15%`}</span>
          </div>
        </div>
        {!total && <span className="cap ml-auto" style={{ color: 'var(--warn)' }}>ยังไม่กรอกคนทักเดือนนี้ — กรอกที่ปุ่ม "คนทัก" มุมขวาล่าง</span>}
      </div>
    </Card>
  );
}

/* ---- HERO C: แนวโน้มรายวัน — ใช้กราฟกลาง DailySalesChart (เสาร์-อาทิตย์จาง · เส้นประเดือนก่อน · เส้นคนทักแกนขวา · tooltip เต็ม) ---- */
function TrendCard({ rows, dim, month, onOpenDay, prevSeries, prevLabel }) {
  const bars = Array.from({ length: dim }, (_, i) => rows.reduce((a, r) => a + (r.daily[i]?.sales || 0), 0));
  const line = Array.from({ length: dim }, (_, i) => rows.reduce((a, r) => a + (r.daily[i]?.leads || 0), 0));
  const hasLeads = line.some(v => v > 0);
  const hasCmp = prevSeries && prevSeries.some(v => v > 0);
  const days = Array.from({ length: dim }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const labels = days.map((d, i) => (i === 0 ? bucketLabel(d, 'day') : String(i + 1)));
  const tipLabels = days.map(d => bucketLabel(d, 'day'));
  const weekend = days.map(d => { const w = new Date(d + 'T00:00:00').getDay(); return w === 0 || w === 6; });
  const total = bars.reduce((a, v) => a + v, 0);
  return (
    <Card className="p-[22px]">
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <div>
          <div className="text-base font-semibold">ยอดขายรายวัน <span className="dim font-normal">· {monthLabel(month)}</span></div>
          <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>แท่ง = ยอดขายของวัน{hasLeads ? ' · เส้น = คนทัก (แกนขวา)' : ''}{hasCmp ? ` · เส้นประ = ${prevLabel} วันเดียวกัน` : ''} · คลิกวันเพื่อดูออเดอร์ทั้งวัน</div>
        </div>
        <span className="cap num" style={{ color: 'var(--ink-4)' }}>รวม <b style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{fmtB(total)}</b></span>
      </div>
      <DailySalesChart labels={labels} tipLabels={tipLabels} datasets={[{ label: 'ยอดขาย', data: bars, color: 'var(--accent)' }]}
        orders={hasLeads ? line : null} ordersLabel="คนทัก" weekend={weekend} prevValues={hasCmp ? prevSeries : null} prevLabel={prevLabel || 'เดือนก่อน'}
        fmt={fmtB} height={230} emptyText="ยังไม่มียอดในเดือนนี้" clickText="คลิกเพื่อดูออเดอร์ทั้งวัน"
        onBarClick={onOpenDay ? (i) => onOpenDay(i + 1) : undefined} />
      <div className="cap row" style={{ gap: 8, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap', color: 'var(--ink-4)' }}>
        <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: 'var(--accent)' }} /> ยอดขาย</span>
        {hasLeads && <span className="row" style={{ gap: 6 }}><span style={{ width: 16, borderTop: '2px solid var(--ink-3)' }} /> คนทัก/วัน</span>}
        {hasCmp && <span className="row" style={{ gap: 6 }}><span style={{ width: 16, borderTop: '2px dashed var(--accent-2)' }} /> {prevLabel} วันเดียวกัน</span>}
        <span className="row" style={{ gap: 6 }}><span style={{ width: 14, height: 10, borderRadius: 2, background: 'rgba(130,140,160,.18)' }} /> เสาร์–อาทิตย์</span>
      </div>
    </Card>
  );
}

/* ---- โซโล่: แผงเจาะลึกคนเดียว (ช่องทาง/ลาย) + ปุ่มดูเต็ม — ช่องทางเป็นแถบแทนโดนัท (1-2 ช่องทางอ่านโดนัทไม่ได้ความ) ---- */
function DeepPanel({ r, onOpen }) {
  const chRows = Object.entries(r.channels).sort((a, b) => b[1] - a[1]);
  const chMax = Math.max(1, ...chRows.map(([, v]) => v));
  const chTot = chRows.reduce((a, [, v]) => a + v, 0);
  const designs = Object.entries(r.designs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold">เจาะลึก · {r.name === NO_SELLER ? 'ไม่ระบุเซลล์' : r.name}</span>
        <span className="text-xs text-muted-foreground">ขายจริง {N(r.daysActive)} วัน</span>
        <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={onOpen}>ดูรายละเอียดเต็ม <Icon name="chevR" className="size-3.5" /></Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {chRows.length > 0 && (
          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">ช่องทาง <span className="text-xs font-normal text-muted-foreground">— ยอดขาย</span></div>
            <div style={{ display: 'grid', gap: 5 }}>
              {chRows.map(([ch, v]) => (
                <div key={ch} className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <span className="row" style={{ gap: 6, flex: '0 0 92px', minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>
                    <span className="size-2 rounded-full shrink-0" style={{ background: channelColor(ch) }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch}</span>
                  </span>
                  <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', minWidth: 24 }}>
                    <span style={{ display: 'block', width: `${v / chMax * 100}%`, height: '100%', background: channelColor(ch), borderRadius: 4 }} />
                  </span>
                  <span className="num cap" style={{ flex: '0 0 90px', textAlign: 'right', fontWeight: 700 }}>{fmtB(v)}</span>
                  <span className="num cap" style={{ flex: '0 0 38px', textAlign: 'right', color: 'var(--ink-4)' }}>{chTot ? Math.round(v / chTot * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        {designs.length > 0 && <Card className="p-4"><div className="text-sm font-semibold mb-1">ลายขายดี <span className="text-xs font-normal text-muted-foreground">— จำนวนตัว</span></div><HBars data={designs} height={Math.max(150, designs.length * 24)} unit=" ตัว" /></Card>}
      </div>
    </div>
  );
}

// PART 96/98.3: ปุ่มลัด CTA pill ลอย — สวย+ใช้ง่าย: gradient + เงาแบบแก้ว(glossy sheen) + เงาเรืองสี · ไอคอนในวงแหวนขยับตอน hover · กดยุบเบา · ป้ายชื่อชัด
/* QuickFab ย้ายไป saleWidgets.jsx (ของกลาง — รายงานขายใช้ด้วย) */

// กรองด้วยวันที่ "หลัง merge override" — ใบที่ถูกย้ายวันออกนอกช่วง ต้องไม่ถูกนับ/ลงผิดวัน
const withinRange = (rows, from, to) => (rows || []).filter(o => { const d = String(o.order_date || '').slice(0, 10); return !d || (d >= from && d <= to); });

export function SalePerfView() {
  useRenderCount('salePerf'); // Phase 0 baseline (dev-only)
  // แยกรายคน: admin เห็นทั้งทีม · เซลล์เห็นเฉพาะของตัวเอง — reactive useUser (ไม่ใช้ window.__isAdmin ที่ lag first render)
  const { user } = useUser();
  const canSeeAll = isAdmin(user);
  const mineSet = useMemo(() => new Set(myNamesOf(user)), [user]);
  // PART 96: ปุ่มลัดลอยมุมขวาล่าง (คนทัก/ส่งยอด) + เคารพสิทธิ์เดิม — ปุ่มส่งยอดซ่อนถ้าถูกล็อกหน้า "ส่งยอด/ข้อมูล" (catalog:data)
  const [quick, setQuick] = useState(null); // popup ที่เปิด: null | 'leads' | 'submit' — ทีละอัน ไม่ซ้อน
  const [cycleOpen, setCycleOpen] = useState(false); // ป๊อปอัพค่าคอมรอบตัด (26→25)
  const canEdit = busCanEdit();
  const dataLocked = lockedSections().some(x => x === 'catalog' || x === 'catalog:data');
  const [month, setMonth] = useState(curMonth());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ orders: [], skus: [], funnel: [], receipts: [], prevFull: null });
  const [maps, setMaps] = useState(null);   // resolver maps (catalog/alias/override/version) — ชื่อลาย resolve สด
  const [targets, setTargets] = useState({});
  const [detail, setDetail] = useState(null);   // เซลล์ที่เปิด drawer (รายเดือน)
  // เครื่องมือ: ค้นหา/ตัวกรอง/คอลัมน์/ความหนาแน่น (จำค่า localStorage)
  const [q, setQ] = useState('');
  const [channelF, setChannelF] = useState([]);
  const [onlyTargets, setOnlyTargets] = useState(false);
  const [hideNoSeller, setHideNoSeller] = usePersistedState('tmk-perf-hidenoseller', false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // เทียบเดือนก่อน = อัตโนมัติเสมอ · เดือนปัจจุบันเทียบช่วงเดียวกัน (MTD 1–วันนี้) · เดือนเก่า = เต็มเดือน
  const [prevTargets, setPrevTargets] = useState({});
  const [loadErr, setLoadErr] = useState('');    // โหลดพลาด → บอก ไม่ใช่โชว์ 0 เงียบ ๆ
  const seqRef = useRef(0);
  useEffect(() => () => { seqRef.current += 1; }, []);

  const load = useCallback(async (force = false) => {
    /* กันคำตอบเก่าทับใหม่ — realtime ยิง load(true) ซ้อนได้ และกดสลับเดือนเร็ว ๆ ก็สร้างรอบซ้อน
       เดิมไม่มี guard เลย: รอบของเดือนเก่าที่ตอบช้ากว่าจะ setData ทับ
       → หัวข้อบอก "มิถุนายน" แต่ leaderboard/ค่าคอมเป็นตัวเลขเดือนสิงหาคม (state ไม่ผูกเดือน) */
    const mySeq = ++seqRef.current;
    const fresh = () => seqRef.current === mySeq;
    if (!force) setLoading(true);   // realtime refetch (force) = อัปเดตในที่ ไม่ต้องล้างเป็น skeleton (กันจอกระพริบ)
    try {
      const from = `${month}-01`, to = `${month}-${daysInMonth(month)}`;
      const pm = prevMonthOf(month), pFrom = `${pm}-01`, pTo = `${pm}-${daysInMonth(pm)}`;
      // กัน skeleton ค้าง: ถ้า fetch ค้าง (เน็ต/auth หลุด) → timeout 15 วิ → เข้า catch → เลิก skeleton โชว์ empty
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
      const base = [
        cachedFetchRange('tmk_mp_orders', ORDERS_SEL, from, to, 'order_date', force),
        cachedFetchRange('tmk_mp_skus', SKUS_SEL, from, to, 'order_date', force),
        supabase.from('tmk_sales_funnel').select(FUNNEL_SEL).gte('date', from).lte('date', to),
        supabase.from('tmk_sale_receipts').select('order_no,salesperson,sales,qty,order_date,status,channel').eq('order_month', month),
        fetchTargets(month),
        // override ระดับออเดอร์ (แก้เซลล์/ยอดในเว็บ) — เดิมหน้านี้ "ลืม" merge → leaderboard ไม่ตรง dashboard/ออเดอร์
        cachedFetchAll('tmk_order_overrides', OVERRIDES_SEL),
      ];
      // เทียบเดือนก่อนอัตโนมัติ: ดึงเดือนก่อนแบบเต็ม (orders/skus/funnel/targets) เสมอ เพื่อคำนวณ delta ครบทุกค่า
      const cmp = [
        cachedFetchRange('tmk_mp_orders', ORDERS_SEL, pFrom, pTo, 'order_date', force),
        cachedFetchRange('tmk_mp_skus', SKUS_SEL, pFrom, pTo, 'order_date', force),
        supabase.from('tmk_sales_funnel').select(FUNNEL_SEL).gte('date', pFrom).lte('date', pTo),
        fetchTargets(pm),
      ];
      const [ordersR, skusR, funnelR, receiptsR, tg, ovR, pOrdersR, pSkusR, pFunnelR, pTg] =
        await Promise.race([timeout, Promise.all([...base, ...cmp])]);
      if (!fresh()) return;
      const firstErr = [ordersR, skusR, funnelR, receiptsR].find(r => r?.error)?.error;
      setLoadErr(firstErr ? pgErrorText(firstErr) : '');
      const tmap = {}; (tg || []).forEach(t => { tmap[t.salesperson] = t; }); setTargets(tmap);
      const ptmap = {}; (pTg || []).forEach(t => { ptmap[t.salesperson] = t; }); setPrevTargets(ptmap);
      // map override (order_id = "source:order_no") แล้ว merge ทับ orders ปัจจุบัน + เดือนก่อน (เต็ม) — ให้ตรง dashboard
      const ovMap = {}; if (ovR && !ovR.error) (ovR.data || []).forEach(x => { ovMap[x.order_id] = x; });
      /* override ที่ "ย้ายวันที่": ดึงใบที่วันที่ใหม่อยู่ในเดือนนี้แต่วันที่ดิบไม่อยู่ (ไม่งั้นยอดหาย)
         + กรองซ้ำด้วยวันที่หลัง merge (ไม่งั้นใบที่ถูกย้ายออกไปเดือนอื่นจะลงผิดวันในกราฟ/รายวัน) */
      const baseOrders = ordersR.data || [];
      const strayNos = strayOverrideOrderNos(ovMap, from, to, baseOrders);
      const strays = strayNos.length ? await fetchOrdersByNos('tmk_mp_orders', ORDERS_SEL, strayNos) : [];
      setData({
        orders: withinRange(mergeOrderOverrides(dedupeOrders([...baseOrders, ...strays]), ovMap), from, to), skus: skusR.data || [],
        funnel: funnelR.data || [], receipts: receiptsR.data || [],
        /* ⚠️ เดือนก่อนต้องกรองซ้ำด้วยวันที่ "หลัง merge" เหมือนเดือนปัจจุบันบรรทัดบน
           ไม่งั้นใบที่ override ย้ายวันจาก 30 ส.ค. → 2 ก.ย. จะถูกนับ **ทั้งสองเดือน**
           (เดือน ก.ย. ดึงมาผ่าน stray pass · เดือน ส.ค. ยังนับใบเดิมเพราะวันดิบอยู่ในช่วง)
           → ชิปเทียบเดือนก่อนเพี้ยน และ "ยอดเดือนก่อน" ไม่ตรงกับตอนเปิดดูเดือนนั้นตรง ๆ */
        prevFull: {
          orders: withinRange(mergeOrderOverrides(pOrdersR?.data || [], ovMap), pFrom, pTo),
          skus: pSkusR?.data || [], funnel: pFunnelR?.data || [],
        },
      });
    } catch (e) {
      // เดิมปล่อยว่าง → ทั้งหน้าเป็น 0 แยกไม่ออกจาก "เดือนนี้ยังไม่มียอด"
      if (fresh()) setLoadErr(e?.message === 'timeout' ? 'โหลดข้อมูลนานเกินไป (timeout)' : (e?.message || 'โหลดข้อมูลไม่สำเร็จ'));
    }
    finally { if (fresh()) setLoading(false); }
  }, [month]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูล async (pattern ปกติ) — load เป็น useCallback ผูก [month]
  useEffect(() => { load(); }, [load]);
  // resolver maps (catalog/alias/override/version) — โหลดครั้งเดียว ไม่ผูกเดือน · ชื่อลาย resolve สดตามแคตตาล็อก
  useEffect(() => { let live = true; loadResolverMaps(supabase).then(m => { if (live) setMaps(m); }); return () => { live = false; }; }, []);
  // 'tmk_targets' = เป้า/เรตคอมรายคน (แก้ที่หน้า ตั้งค่า › เป้า & คอม) — ต้องอยู่ในลิสต์ ไม่งั้นหน้านี้ที่เปิดค้างไม่ขยับ
  // (migration 20260821-realtime-targets เปิดฝั่ง DB ให้แล้ว แต่ฝั่งเว็บต้อง subscribe ด้วยถึงจะเด้ง)
  useSaleLiveReload(['tmk_sale_receipts', 'tmk_sales_funnel', 'tmk_mp_orders', 'tmk_mp_skus', 'tmk_order_overrides', 'tmk_targets'], () => load(true), { invalidate: ['tmk_mp_orders', 'tmk_mp_skus', 'tmk_order_overrides', 'tmk_sales_funnel'] });

  // ช่องทางทั้งหมด (ทำ option ตัวกรอง) — เซลล์เห็นเฉพาะช่องทางที่ตัวเองมียอด
  const channels = useMemo(() => [...new Set((data.orders || []).filter(o => canSeeAll || orderVisibleTo(o, user)).map(o => o.channel).filter(Boolean))].sort(), [data.orders, canSeeAll, user]);
  // ชื่อลาย resolve สด (catalog→alias→golden→frozen + as-of) — ตรงแดชบอร์ด/CRM · คง color/size เดิม
  const resolvedSkus = useMemo(() => {
    if (!maps) return data.skus;
    const R = makeSkuResolver(maps);
    return (data.skus || []).map(k => { const r = R(k); return { ...k, design: r.design || k.design, product_code: r.product_code || k.product_code }; });
  }, [data.skus, maps]);
  // กรองช่องทาง + scope "แยกรายคน" → orders/skus ที่กรองแล้ว (ใช้ทั้ง buildPerf + drill-down รายวันรายออเดอร์)
  // scope ที่ต้นทางตรงนี้ (ไม่ใช่ rowsView) — DayDetail/DaySellerDetail รับ ordersF/skusF ตรง → ไม่รั่วออเดอร์คนอื่นตอนเจาะรายวัน
  const { ordersF, skusF } = useMemo(() => {
    const chSet = channelF.length ? new Set(channelF) : null;
    let os = chSet ? data.orders.filter(o => chSet.has(o.channel)) : data.orders;
    if (!canSeeAll) os = os.filter(o => orderVisibleTo(o, user));      // predicate เดียวกับหน้าออเดอร์
    let ks = chSet ? resolvedSkus.filter(k => chSet.has(k.channel)) : resolvedSkus;
    if (!canSeeAll) { const keep = new Set(os.map(o => o.order_no)); ks = ks.filter(k => keep.has(k.order_no)); } // sku ไม่มี salesperson — join ผ่าน order_no
    return { ordersF: os, skusF: ks };
  }, [data.orders, resolvedSkus, channelF, canSeeAll, user]);
  /* ---------- ชุดข้อมูล "ทั้งทีม" สำหรับแถบภาพรวม (2 ก.ย. 69) ----------
     user สั่งให้ทุก role เห็นภาพรวมทีมได้ แต่ไม่เห็นตารางรายคน (มีค่าคอมของทุกคน)
     → ไม่แตะ ordersF/skusF/funnelF เดิม (ยัง scope รายคนเหมือนเดิม · ใช้กับ drill-down รายวัน)
       แต่ทำชุดคู่ขนานที่กรอง "ช่องทาง" อย่างเดียวไว้ป้อนเฉพาะแถบภาพรวม
     ข้อมูลทั้งทีมโหลดมาอยู่แล้ว (กรองฝั่ง browser) → ไม่ยิงเพิ่ม ไม่ติด RLS (อ่าน = ทุกคนที่ล็อกอิน) */
  const { ordersAll, skusAll } = useMemo(() => {
    if (canSeeAll) return { ordersAll: ordersF, skusAll: skusF };
    const chSet = channelF.length ? new Set(channelF) : null;
    return {
      ordersAll: chSet ? data.orders.filter(o => chSet.has(o.channel)) : data.orders,
      skusAll: chSet ? resolvedSkus.filter(k => chSet.has(k.channel)) : resolvedSkus,
    };
  }, [canSeeAll, ordersF, skusF, data.orders, resolvedSkus, channelF]);

  // funnel/receipts มี field salesperson (ชื่อ staff) เหมือน orders → กรองด้วย mineSet
  const funnelF = useMemo(() => canSeeAll ? data.funnel : (data.funnel || []).filter(f => mineSet.has(f.salesperson)), [data.funnel, canSeeAll, mineSet]);
  const receiptsF = useMemo(() => canSeeAll ? data.receipts : (data.receipts || []).filter(r => mineSet.has(r.salesperson)), [data.receipts, canSeeAll, mineSet]);
  const prevOrdersF = useMemo(() => {
    const po = data.prevFull?.orders || [];
    return canSeeAll ? po : po.filter(o => orderVisibleTo(o, user));
  }, [data.prevFull, canSeeAll, user]);
  // prev = prevFull.orders (merge override แล้ว) → MoM delta ต่อเซลล์สะท้อน override ตรงกับ dashboard (เดิมใช้ prevOrders select แคบ merge ไม่ได้)
  const perf = useMemo(() => buildPerf(month, ordersF, skusF, funnelF, receiptsF, targets, prevOrdersF),
    [month, ordersF, skusF, funnelF, receiptsF, targets, prevOrdersF]);
  // perf ของทั้งทีม — แอดมินใช้ตัวเดิม (เคารพตัวกรองบนจอ) · คนอื่นสร้างจากชุดที่ไม่กรองตามสิทธิ์
  const perfAll = useMemo(() => canSeeAll ? perf
    : buildPerf(month, ordersAll, skusAll, data.funnel || [], data.receipts || [], targets, data.prevFull?.orders || []),
  [canSeeAll, perf, month, ordersAll, skusAll, data.funnel, data.receipts, data.prevFull, targets]);

  // โหมดเทียบเดือนก่อน: กรองช่องทาง + clamp วัน (MTD) แล้วรัน buildPerf รอบ 2
  const isCurMonth = month === curMonth();
  const daysPassed = isCurMonth ? Math.min(new Date().getDate(), daysInMonth(month)) : daysInMonth(month);
  const mtdClamp = isCurMonth;   // เดือนปัจจุบัน = เทียบช่วงเดียวกัน (1–วันนี้) เสมอ · เดือนเก่า = เต็มเดือน
  const perfPrev = useMemo(() => {
    if (!data.prevFull) return null;
    const pm = prevMonthOf(month);
    const chSet = channelF.length ? new Set(channelF) : null;
    const clampDay = mtdClamp ? daysPassed : Infinity;
    // scope เดือนก่อนด้วยกติกาเดียวกัน — delta/กราฟเทียบไม่รั่วยอดคนอื่น
    let po = data.prevFull.orders.filter(o => (!chSet || chSet.has(o.channel)) && dayOf(o.order_date) <= clampDay);
    if (!canSeeAll) po = po.filter(o => orderVisibleTo(o, user));
    let ps = data.prevFull.skus.filter(k => (!chSet || chSet.has(k.channel)) && dayOf(k.order_date) <= clampDay);
    if (!canSeeAll) { const keep = new Set(po.map(o => o.order_no)); ps = ps.filter(k => keep.has(k.order_no)); }
    let pf = data.prevFull.funnel.filter(f => dayOf(f.date) <= clampDay);
    if (!canSeeAll) pf = pf.filter(f => mineSet.has(f.salesperson));
    return buildPerf(pm, po, ps, pf, [], prevTargets, []);
  }, [data.prevFull, channelF, mtdClamp, daysPassed, month, prevTargets, canSeeAll, user, mineSet]);
  /* ฐานเทียบของ "ภาพรวมทีม" ต้อง scope เดียวกับตัวตั้ง
     เดิม teamCmp เอา teamView (ทั้งทีมสำหรับ non-admin) ไปเทียบ perfPrev.team (ยังเป็นรายคน)
     → editor ที่เดือนก่อนทำได้ ฿80,000 เห็นทีมเดือนนี้ ฿1,200,000 = ▲ +1,400% ทั้งที่ทีมโตไม่กี่ % */
  const perfAllPrev = useMemo(() => {
    if (canSeeAll) return perfPrev;
    if (!data.prevFull) return null;
    const pm = prevMonthOf(month);
    const chSet = channelF.length ? new Set(channelF) : null;
    const clampDay = mtdClamp ? daysPassed : Infinity;
    const po = data.prevFull.orders.filter(o => (!chSet || chSet.has(o.channel)) && dayOf(o.order_date) <= clampDay);
    const ps = data.prevFull.skus.filter(k => (!chSet || chSet.has(k.channel)) && dayOf(k.order_date) <= clampDay);
    const pf = data.prevFull.funnel.filter(f => dayOf(f.date) <= clampDay);
    return buildPerf(pm, po, ps, pf, [], prevTargets, []);
  }, [canSeeAll, perfPrev, data.prevFull, channelF, mtdClamp, daysPassed, month, prevTargets]);

  // delta ต่อเซลล์ (ยอด/ออเดอร์/ตัว/AOV/คอม/คนทัก/%ปิด) — เทียบ perf กับ perfPrev (match ด้วยชื่อ)
  const deltasByName = useMemo(() => {
    const m = new Map();
    if (!perfPrev) return m;
    const prevByName = new Map(perfPrev.rows.map(r => [r.name, r]));
    perf.rows.forEach(r => {
      const p = prevByName.get(r.name);
      m.set(r.name, {
        sales: deltaPct(r.sales, p?.sales || 0), orders: deltaPct(r.orders, p?.orders || 0),
        qty: deltaPct(r.qty, p?.qty || 0), aov: deltaPct(r.aov, p?.aov || 0),
        comm: deltaPct(r.comm, p?.comm || 0), leads: deltaPct(r.leads, p?.leads || 0),
        // closeRate = null แปลว่า "ยังไม่มีข้อมูลคนทัก" ไม่ใช่ 0% — เดิม || 0 ทำให้ชิปขึ้น ▼100% ทั้งที่ยอดโต
        closeRate: (r.closeRate == null || p?.closeRate == null) ? null : deltaPct(r.closeRate, p.closeRate),
      });
    });
    return m;
  }, [perf, perfPrev]);
  const [dayDrill, setDayDrill] = useState(null);   // { name, day } — เซลล์+วันที่เปิดดูออเดอร์รายตัว (drill-down รายวัน)
  const [dayAll, setDayAll] = useState(null);       // วันที่ (number) — คลิกจากกราฟ → ป๊อปอัพออเดอร์ทั้งวัน
  const [custDrill, setCustDrill] = useState(null); // กดชื่อลูกค้าบนการ์ดออเดอร์ → drawer ลูกค้า (PART 88)
  // กรอง rows ฝั่งแสดงผล (ค้นหา/เฉพาะมีเป้า/ซ่อนไม่ระบุเซลล์) + คำนวณทีมใหม่ + จัดอันดับตามยอด
  const ql = q.trim().toLowerCase();
  const rowsView = useMemo(() => perf.rows.filter(r =>
    (!ql || r.name.toLowerCase().includes(ql)) &&
    (!onlyTargets || r.target > 0) &&
    (!hideNoSeller || r.name !== NO_SELLER)
  ), [perf.rows, ql, onlyTargets, hideNoSeller]);
  /* แถวที่ใช้ "สรุประดับทีม" — แอดมินเคารพตัวกรองบนจอ (rowsView) · role อื่นใช้ทั้งทีม (perfAll)
     ตัวกรองพวกนั้น (ค้นหา/เฉพาะมีเป้า/ซ่อนไม่ระบุเซลล์) เป็น control ของแอดมินเท่านั้นอยู่แล้ว */
  const teamRows = canSeeAll ? rowsView : perfAll.rows;
  const teamFunnel = useMemo(() => (canSeeAll ? funnelF : (data.funnel || [])), [canSeeAll, funnelF, data.funnel]);
  const teamOrders = canSeeAll ? ordersF : ordersAll;

  const teamView = useMemo(() => {
    const t = teamRows.reduce((a, r) => ({ sales: a.sales + r.sales, orders: a.orders + r.orders, chatOrders: a.chatOrders + (r.chatOrders || 0), qty: a.qty + r.qty, leads: a.leads + r.leads, newC: a.newC + r.newC, newLeads: a.newLeads + (r.newOld?.new || 0), oldLeads: a.oldLeads + (r.newOld?.old || 0) }), { sales: 0, orders: 0, chatOrders: 0, qty: 0, leads: 0, newC: 0, newLeads: 0, oldLeads: 0 });
    // ตัวเศษนับเฉพาะเซลล์ที่กรอกคนทัก (นิยามเดียวกับรายงานขาย · เทส closeRateParity)
    t.chatClosed = chatClosedOf(teamRows, teamFunnel);
    t.closeRate = t.leads > 0 ? t.chatClosed / t.leads * 100 : null;  // ออเดอร์ช่องแชท ÷ คนทัก (ตัดมาร์เก็ตเพลส)
    t.aov = t.orders > 0 ? t.sales / t.orders : 0;
    t.dSales = perf.team.dSales;
    return t;
  }, [teamRows, teamFunnel, perf.team.dSales]);
  // ยอดรวมรายวันของทีม (ใช้ทั้ง hero stats และกราฟแนวโน้ม)
  const teamDaily = useMemo(() => Array.from({ length: perf.dim }, (_, i) => teamRows.reduce((a, r) => a + (r.daily[i]?.sales || 0), 0)), [teamRows, perf.dim]);
  const rankMap = useMemo(() => { const m = new Map(); [...rowsView].sort((a, b) => b.sales - a.sales).forEach((r, i) => m.set(r.name, i)); return m; }, [rowsView]);
  // แยกยอดโอน/COD ของทีม (จาก ordersF ของเซลล์ที่โชว์อยู่ · ตัดยกเลิก) — ให้การ์ดสรุปบนโชว์เหมือนป๊อปอัพรายวัน
  const teamPay = useMemo(() => {
    const names = new Set(teamRows.map(r => r.name));
    let transfer = 0, cod = 0;
    (teamOrders || []).forEach(o => { if (isCancelled(o) || !names.has(spOf(o))) return; const s = Number(o.sales) || 0; if (isCodOrder(o)) cod += s; else if (o.payment_type === 'โอน') transfer += s; });
    return { transfer, cod };
  }, [teamOrders, teamRows]);
  const openSp = perf.rows.find(r => r.name === detail) || null;

  const nFilters = channelF.length + (onlyTargets ? 1 : 0) + (hideNoSeller ? 1 : 0);
  const commTotal = useMemo(() => rowsView.reduce((s, r) => s + (r.comm || 0), 0), [rowsView]);
  // delta ทีมรวม (เทียบ teamView ที่แสดงจริง กับทีมเดือนก่อน)
  const teamCmp = useMemo(() => {
    if (!perfAllPrev) return null;
    const pt = perfAllPrev.team, prevComm = perfAllPrev.rows.reduce((s, r) => s + (r.comm || 0), 0);
    return {
      sales: deltaPct(teamView.sales, pt.sales), orders: deltaPct(teamView.orders, pt.orders),
      qty: deltaPct(teamView.qty, pt.qty), comm: deltaPct(commTotal, prevComm),
      leads: deltaPct(teamView.leads, pt.leads || 0), aov: deltaPct(teamView.aov, pt.orders > 0 ? pt.sales / pt.orders : 0),
    };
  }, [perfAllPrev, teamView, commTotal]);
  // adaptive: ทีมเล็ก (≤1 คนจริง) → โซโล่ (ไม่มีอันดับ/แชร์ · เน้นคนเดียว) · หลายคน → เทียบ/อันดับ
  const realSellers = useMemo(() => rowsView.filter(r => r.name !== NO_SELLER), [rowsView]);
  const soloMode = realSellers.length <= 1;
  const focus = realSellers[0] || rowsView[0] || null;
  // (เดิมมี teamMonthTotal = แถบยอดรวมทีมบรรทัดเดียวสำหรับเซลล์ — เลิกใช้แล้ว
  //  ตั้งแต่ 2 ก.ย. 69 ทุก role เห็นแถบฮีโร่ของทีมเต็ม ๆ ซึ่งรวมยอดนี้อยู่แล้ว)

  // ไม่มี skeleton หลอกตอนเข้าหน้า — การโหลดจริงมี PerfSkeleton bodyOnly คุมอยู่ด้านล่าง

  const clearFilters = () => { setChannelF([]); setOnlyTargets(false); setHideNoSeller(false); };

  /* กราฟด้านหลังเป็นยอด "ทั้งทีม" แต่ popup มีสิทธิ์เห็นเฉพาะออเดอร์ตัวเอง (นโยบาย 8 ก.ย. 69)
     เดิมจึงปิดปุ่มกดทิ้งไปเลย = เซลล์กดวันไหนก็ไม่มีอะไรเกิดขึ้น หาสาเหตุไม่ได้
     ตอนนี้กดได้ทุก role แล้วบอกตรง ๆ ว่าตัวเลขใน popup แคบกว่าแท่ง — พร้อมยอดทีมของวันนั้นให้เทียบ */
  const dayScopeNote = (day) => {
    if (canSeeAll || !day) return null;
    return 'มุมมองทั้งทีมของวันนี้ — ยอด · ออเดอร์ทุกใบ · คนทักรายคน · %ปิด ของทุกเซลล์ (ตรงกับแท่งในกราฟ)';
  };

  // ป๊อปอัพ drill รายวัน (ใช้ทั้งหน้ารายชื่อ + หน้าเซลล์เต็ม)
  const drillSheets = (
    <>
      {dayDrill && <SideSheet size="lg" icon="user" title={dayDrill.name === NO_SELLER ? 'ไม่ระบุเซลล์' : dayDrill.name} sub={`วันที่ ${dayDrill.day} ${monthLabel(month)}`} onClose={() => setDayDrill(null)}>
        <DaySellerDetail name={dayDrill.name} day={dayDrill.day} month={month} orders={ordersF} skus={skusF} funnel={funnelF} target={targets[dayDrill.name]} onOpenMonth={() => { const n = dayDrill.name; setDayDrill(null); setDetail(n); }} onPickCustomer={(o) => setCustDrill(custFromOrders(o, ordersF))} />
      </SideSheet>}
      {dayAll && <SideSheet size="lg" icon="calendarDays" title={`วันที่ ${dayAll} ${monthLabel(month)}`} sub="ออเดอร์ทั้งวัน · ทั้งทีม" onClose={() => setDayAll(null)}>
        {/* PART 117: ใช้ตัวกลางตัวเดียวกับ popup วันของรายงานขาย (dayDetailSheet) — ได้กรองโอน/COD + เรียง + ค้นหา เพิ่มมาด้วย */}
        {/* ⚠️ ข้อยกเว้นสิทธิ์ที่ user สั่งเอง 9 ก.ย. 69 — popup "วันที่ …" ที่กดจากกราฟภาพรวมทีม
            เห็น **ทั้งวันของทุกเซลล์** (ยอด · ออเดอร์ทุกใบ · คนทักรายคน · %ปิด) "แค่ในนี้"
            → รวมชื่อ/เบอร์ลูกค้าของออเดอร์เซลล์คนอื่นด้วย · หน้าออเดอร์กับ ⌘K ยังคุมเหมือนเดิม
            บันทึกไว้ที่ CLAUDE.md · ล็อกด้วย __tests__/dayDetailScope-dom.test.jsx */}
        <DayDetailSheet dateISO={`${month}-${String(dayAll).padStart(2, '0')}`}
          orders={canSeeAll ? ordersF : ordersAll} skus={canSeeAll ? skusF : skusAll}
          funnelRows={canSeeAll ? funnelF : (data.funnel || [])}
          onChangeDate={(iso) => setDayAll(Number(iso.slice(8, 10)))}
          scopeNote={dayScopeNote(dayAll)}
          onPickCustomer={(o) => setCustDrill(custFromOrders(o, ordersF))} />
      </SideSheet>}
      {custDrill && <CustomerDrawer cust={custDrill} ords={ordersF} skus={skusF} onClose={() => setCustDrill(null)} />}
    </>
  );

  // เปิดเซลล์ = แสดง "หน้าเต็ม" (ไม่ใช่ popup) — ปุ่มกลับไปหน้ารายชื่อ
  if (openSp) {
    return (
      <div className="content-inner rise flex flex-col gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-1" onClick={() => setDetail(null)}><Icon name="chevL" /> ประสิทธิภาพเซลล์</Button>
          <MonthPicker value={month} onChange={setMonth} max={curMonth()} className="h-8" />
        </div>
        <Card className="p-4 sm:p-5"><SpDetail sp={openSp} month={month} inline cmp={deltasByName.get(openSp.name)} onDay={(day) => setDayDrill({ name: openSp.name, day })} /></Card>
        {drillSheets}
      </div>
    );
  }

  return (
    <div className="content-inner rise flex flex-col gap-4">
      {/* หัว: เครื่องมือแถวเดียว + แถบสรุปทีม inline (เนื้อๆ · ตัวเลข 0 ซ่อนอัตโนมัติ) */}
      <Card className="p-4">
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base font-semibold">ประสิทธิภาพเซลล์</span>
            <SourceBadge kind="analytics" />
            {/* เดิมเขียน "เฉพาะของฉัน" — ตอนนี้ครึ่งหน้าเป็นตัวเลขทั้งทีมแล้ว ป้ายเดิมทำให้เข้าใจว่ายอดทีมคือยอดตัวเอง */}
            {!canSeeAll && <Badge variant="outline" className="gap-1 text-[11px] text-muted-foreground"><Icon name="users" className="size-3" />ภาพรวมทีม + รายละเอียดของฉัน</Badge>}
            {loading && perf.rows.length > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-[var(--accent)] animate-pulse" />กำลังอัปเดต…</span>}
            <MonthPicker value={month} onChange={setMonth} max={curMonth()} className="h-8" />
            {/* ทางเข้า "เงินของเซลล์" — เน้นสี accent ให้เด่นกว่าปุ่มอื่นในแถบ (เซลล์กดบ่อยสุด) */}
            <Button size="sm" className="h-8 gap-1.5 shadow-sm" onClick={() => setCycleOpen(true)} title="ค่าคอมตามรอบตัดจริง (เช่น 26 ก.ค. – 25 ส.ค.)"><Icon name="wallet" className="size-3.5" /> ค่าคอมรอบตัด</Button>
            {canSeeAll && <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา" wrapperClassName="w-full sm:w-[180px] sm:ml-auto" className="h-8" />}
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className={'h-8 gap-1.5' + (nFilters ? ' border-[var(--accent)] text-[var(--accent-2)]' : '')}>
                <Icon name="filter" className="size-3.5" /> ตัวกรอง{nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
              </Button>
            </CollapsibleTrigger>
          </div>
          {nFilters > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {channelF.map(c => <Badge key={c} variant="outline" className="cursor-pointer" onClick={() => setChannelF(channelF.filter(x => x !== c))}>ช่องทาง: {c} <Icon name="x" className="size-3" /></Badge>)}
              {onlyTargets && <Badge variant="outline" className="cursor-pointer" onClick={() => setOnlyTargets(false)}>เฉพาะมีเป้า <Icon name="x" className="size-3" /></Badge>}
              {hideNoSeller && <Badge variant="outline" className="cursor-pointer" onClick={() => setHideNoSeller(false)}>ซ่อนไม่ระบุเซลล์ <Icon name="x" className="size-3" /></Badge>}
              <Button variant="ghost" size="sm" className="h-7 text-[var(--bad)]" onClick={clearFilters}><Icon name="x" className="size-3" /> ล้าง</Button>
            </div>
          )}
          <CollapsibleContent>
            <div className="flex items-center gap-2 flex-wrap pt-3 mt-3 border-t">
              <MultiSelect label="ช่องทาง" options={channels} value={channelF} onChange={setChannelF} />
              {/* ตัวกรองระดับทีม — มีความหมายเฉพาะตอนเห็นหลายคน (admin) */}
              {canSeeAll && <Button variant="outline" size="sm" className={'h-8 rounded-full font-normal' + (onlyTargets ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')} onClick={() => setOnlyTargets(v => !v)}>{onlyTargets ? '✓ ' : ''}เฉพาะที่มีเป้า</Button>}
              {canSeeAll && <Button variant="outline" size="sm" className={'h-8 rounded-full font-normal' + (hideNoSeller ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')} onClick={() => setHideNoSeller(v => !v)}>{hideNoSeller ? '✓ ' : ''}ซ่อนไม่ระบุเซลล์</Button>}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* ⚠️ ประตูทางเข้าต้องดูจาก "ข้อมูลที่หน้านี้จะแสดง" ไม่ใช่ perf.rows ของตัวเอง
          เดิมใช้ !perf.rows.length → viewer/เซลล์ใหม่ที่ยังไม่มียอดของตัวเอง จะไม่เห็นภาพรวมทีมเลย
          ทั้งที่ทีมมียอด = ฟีเจอร์ "ทุก role เห็นภาพรวมทีม" ไม่ทำงานกับคนที่ควรใช้มากที่สุด */}
      {/* โหลดพลาด → บอกให้เห็น ไม่ใช่ปล่อยให้ทั้งหน้าเป็น 0 แล้วเข้าใจว่า "เดือนนี้ยังไม่มียอด" */}
      {loadErr && (
        <div role="alert" className="mb-3 rounded-lg border px-3 py-2.5 text-sm flex items-center gap-2.5"
          style={{ color: 'var(--bad)', background: 'color-mix(in srgb, var(--bad) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--bad) 35%, transparent)' }}>
          <Icon name="alertTriangle" className="size-4 shrink-0" />
          <span className="flex-1 min-w-0">โหลดข้อมูลไม่สำเร็จ — ตัวเลขบนหน้านี้อาจไม่ครบ ({loadErr})</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => load(true)}>ลองใหม่</Button>
        </div>
      )}
      {loading && !perfAll.rows.length ? <PerfSkeleton bodyOnly /> : !perfAll.rows.length ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{canSeeAll ? 'ยังไม่มีข้อมูลยอดเดือนนี้ — กดปุ่ม "ส่งยอด" ด้านบนเพื่ออัปโหลดใบเสร็จ แล้วยอดจะขึ้นที่นี่' : 'ทีมยังไม่มียอดในเดือนนี้ — กดปุ่ม "ส่งยอด" ด้านบนเพื่ออัปโหลดใบเสร็จ แล้วยอดจะขึ้นที่นี่'}</Card>
      ) : (canSeeAll && !rowsView.length) ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">ไม่พบเซลล์ตามตัวกรอง · <button className="text-[var(--accent)] hover:underline" onClick={() => { setQ(''); clearFilters(); }}>ล้างตัวกรอง</button></Card>
      ) : (
            <div className="flex flex-col gap-4">
              {/* HERO ทีม: ยอดรวม + โอน/COD + จังหวะทำยอดเทียบเป้ารวม (รื้อ 22 ส.ค. — เดิม KPI 6 ใบระดับเดียวกัน) */}
              <TeamHero sales={teamView.sales} dSales={teamCmp ? teamCmp.sales : null} transfer={teamPay.transfer} cod={teamPay.cod}
                dailyTotals={teamDaily} passed={daysPassed} dim={perf.dim} isCur={isCurMonth}
                prevLabel={monthLabel(prevMonthOf(month))} monthName={monthLabel(month)} />
              {/* ตัวชี้วัดรอง 3 ใบ — เทียบเดือนก่อนช่วงเดียวกัน (user ตัดเป้า/ค่าคอมทีมออก · ค่าคอมดูที่ปุ่ม "ค่าคอมรอบตัด" และการ์ดรายคน) */}
              <div className="kpi3">
                <KpiCard index={0} label="ออเดอร์" tip="จำนวนออเดอร์รวมของทีมในช่วง (ตัดที่ยกเลิกออกแล้ว)" value={N(teamView.orders)} delta={teamCmp ? dObj(teamCmp.orders) : null} sub={`${N(teamView.newC)} ลูกค้าใหม่`} />
                <KpiCard index={1} label="จำนวนตัว" tip="จำนวนชิ้นสินค้ารวมที่ขายได้" value={N(teamView.qty)} delta={teamCmp ? dObj(teamCmp.qty) : null} sub={teamView.orders ? `${(teamView.qty / teamView.orders).toFixed(1)} ตัว/ออเดอร์` : 'ต่อออเดอร์'} />
                <KpiCard index={2} label="เฉลี่ย/ออเดอร์" tip="ยอดขายรวม ÷ จำนวนออเดอร์ (AOV/Basket)" value={fmtB(teamView.aov)} delta={teamCmp ? dObj(teamCmp.aov) : null} sub="ต่อ 1 ออเดอร์" />
              </div>
              {/* chatClosed = ตัวเศษที่หาร closeRate จริง — ต้องเป็นตัวเดียวกัน
                  เดิมโชว์ 136 แต่ % คิดจาก 135 และตารางใต้มันก็รวมได้ 135 */}
              <LeadStrip title="คนทักทั้งทีม" total={teamView.leads} nw={teamView.newLeads} old={teamView.oldLeads} close={teamView.closeRate} chatOrders={teamView.chatClosed ?? teamView.chatOrders} />
              {/* เสียงลูกค้ารวมทั้งเดือน (จากหน้าคนทัก) — 2 กล่อง ถามหา/ติ + ฟีดรายวัน */}
              <VoiceFeed funnel={teamFunnel} title="เสียงลูกค้าเดือนนี้" />
              {/* กราฟต้องเป็นชุดเดียวกับฮีโร่ (teamRows) ไม่งั้นหัวการ์ดบอกยอดทีม แต่แท่งเป็นของตัวเอง
                  non-admin กดได้แล้ว — popup รับ ordersF (scope รายคน) จึงติด scopeNote บอกว่า
                  รายการเป็นของตัวเอง พร้อมยอดทีมของวันนั้นให้เทียบ (เดิมปิดปุ่มทิ้ง = กดแล้วเงียบ) */}
              <TrendCard rows={teamRows} dim={perf.dim} month={month} onOpenDay={setDayAll}
                prevSeries={perfAllPrev ? Array.from({ length: perf.dim }, (_, i) => perfAllPrev.rows.reduce((a, r) => a + (r.daily[i]?.sales || 0), 0)) : null}
                prevLabel={perfAllPrev ? monthLabel(prevMonthOf(month)) : null} />
              {/* ตารางรายคนมีคอลัมน์ "เป้า/คอม" = ค่าตอบแทนรายบุคคล → แอดมินเท่านั้น (2 ก.ย. 69)
                  role อื่นได้การ์ดรายละเอียด "ของตัวเอง" แทน (ค่าคอมของตัวเองยังเห็นในนั้น) */}
              {!canSeeTeamBoard(user) ? (
                focus ? (
                  <Card className="p-4 sm:p-5">
                    <SpDetail sp={focus} month={month} cmp={deltasByName.get(focus.name)} onDay={(day) => setDayDrill({ name: focus.name, day })} />
                  </Card>
                ) : (
                  /* ทีมมียอดแต่เราไม่มี — เกิดได้จริงหลังแก้ประตูทางเข้า (เซลล์ใหม่/viewer) */
                  <Card className="p-6 text-center text-sm text-muted-foreground">ยังไม่มียอดของคุณในเดือนนี้ — ภาพรวมทีมด้านบนอัปเดตตามปกติ</Card>
                )
              ) : soloMode ? (
                focus && <DeepPanel r={focus} onOpen={() => setDetail(focus.name)} />
              ) : (
            <>
            <TeamBoard rows={rowsView} rankMap={rankMap} teamSales={teamView.sales} deltas={deltasByName} onOpen={(name) => setDetail(name)} />
            </>
            )}
            </div>
      )}

      {/* ป๊อปอัพ drill รายวัน (เซลล์+วัน / ทั้งวัน) — เปิดเซลล์เป็นหน้าเต็มแทน popup แล้ว */}
      {drillSheets}

      {/* PART 96/98.2: ปุ่มลัดลอยมุมขวาล่าง (คนทัก/ส่งยอด) — portal ไป body ให้ fixed ยึด "มุมจอจริง"
          (เดิม fixed ถูกผูกกับ .content ที่มี transform → ไปเกาะมุมการ์ด ทับเนื้อหา) · bottom offset เผื่อแถบเมนูล่างมือถือ */}
      {(canEdit || !dataLocked) && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-24 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-7 sm:right-7 print:hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
          {canEdit && <QuickFab icon="chat" label="คนทัก" onClick={() => setQuick('leads')} />}
          {!dataLocked && <QuickFab icon="upload" label="ส่งยอด" tone="submit" onClick={() => setQuick('submit')} />}
        </div>, document.body)}
      {/* popup โหลด lazy + เปิดทีละอัน (ไม่ซ้อน) */}
      {quick === 'leads' && <Suspense fallback={null}><LeadsQuickSheet onClose={() => setQuick(null)} /></Suspense>}
      {quick === 'submit' && <Suspense fallback={null}><SubmitQuickSheet onClose={() => setQuick(null)} /></Suspense>}
      {cycleOpen && <Suspense fallback={null}><CommissionCycleSheet onClose={() => setCycleOpen(false)} user={user} canSeeTeam={canSeeAll} /></Suspense>}
    </div>
  );
}

/* ---- แท็บรายวัน: กราฟภาพรวมเดือน + สมุดบันทึกรายวัน (เฉพาะวันที่มียอด · คลิกเซลล์เปิดออเดอร์รายตัว) ---- */
/* ---- Drawer: เซลล์รายคน (กราฟรายวัน + ช่องทาง + ลายขายดี + ใบเสร็จ) ---- */
function SpDetail({ sp, onDay, cmp, month }) {
  const dateOf = (day) => (month ? `${month}-${String(day).padStart(2, '0')}` : '');
  const labels = sp.daily.map((d, i) => (i === 0 && month ? bucketLabel(dateOf(d.day), 'day') : String(d.day)));
  const tipLabels = sp.daily.map(d => (month ? bucketLabel(dateOf(d.day), 'day') : `วันที่ ${d.day}`));
  const weekend = sp.daily.map(d => (month ? [0, 6].includes(new Date(dateOf(d.day) + 'T00:00:00').getDay()) : false));
  const hasLeads = sp.daily.some(d => (d.leads || 0) > 0);
  // ช่องทาง: ยอด + คนทัก/ปิด รวมแถวเดียว (join channels ↔ channelClose)
  // รวมช่องที่ "มีคนทักแต่ยังปิดไม่ได้" ด้วย — ตรรกะ + เทสอยู่ที่ lib/uiLogic.js
  const chRows = channelRows(sp.channels, sp.channelClose);
  const chMax = Math.max(1, ...chRows.map(c => c.sales));
  const designs = Object.entries(sp.designs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v }));
  const deltaBadge = sp.dSales != null && <Badge variant="secondary" className={sp.dSales >= 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'}>{sp.dSales >= 0 ? '▲' : '▼'} {Math.abs(Math.round(sp.dSales))}%</Badge>;
  const head = <span className="flex items-center gap-2"><PersonAvatar name={sp.name} size={30} />{sp.name}{deltaBadge}</span>;
  return (
    <>
      <div className="text-lg font-bold">{head}</div>
      <div className="flex flex-col gap-4 mt-3">
        {/* ยอดขายเด่น + KPI รอง 3 ใบ (เดิม 4 กล่องเท่ากันหมด ยอดขายไม่เด่นกว่าใคร) */}
        <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          <div className="text-[11px] text-muted-foreground">ยอดขาย <InfoTip text="ยอดขายของเซลล์คนนี้ในช่วง (ตัดยกเลิกออกแล้ว)" /></div>
          <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <span className="num" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.6px', color: 'var(--accent-2)', lineHeight: 1.1 }}>{fmtB(sp.sales)}</span>
            {dPill(cmp?.sales != null ? cmp.sales : sp.dSales)}
            <span className="cap text-muted-foreground">ขายจริง {N(sp.daysActive)} วัน · เฉลี่ย {fmtB(sp.daysActive ? sp.sales / sp.daysActive : 0)}/วันที่ขาย</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg overflow-hidden" style={{ background: 'var(--surface)' }}>
            {[
              ['ออเดอร์', N(sp.orders), cmp?.orders, 'จำนวนออเดอร์ที่เซลล์คนนี้ปิดได้ในช่วง'],
              ['จำนวนตัว', N(sp.qty), cmp?.qty, 'จำนวนชิ้นสินค้ารวมที่ขายได้'],
              ['เฉลี่ย/ออเดอร์', fmtB(sp.aov), cmp?.aov, 'ยอดขาย ÷ จำนวนออเดอร์ (AOV)'],
            ].map(([l, v, d, tip]) => (
              <div key={l} className="p-2.5" style={{ borderLeft: l === 'ออเดอร์' ? 'none' : '1px solid var(--line)' }}>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">{l} <InfoTip text={tip} /></div>
                <div className="row" style={{ gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}><b className="num" style={{ fontSize: 17, fontWeight: 800 }}>{v}</b>{d != null && dPill(d)}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
            <LeadLine total={sp.leads} nw={sp.newOld?.new || 0} old={sp.newOld?.old || 0} close={sp.closeRate} chatOrders={sp.chatOrders || 0} />
          </div>
        </div>
        {/* เงิน: คอม (เด่น) + เป้า — การ์ดเดียว 2 ฝั่ง · คอมคือสิ่งที่เซลล์อยากเห็นที่สุด → ตัวใหญ่ พื้นสี */}
        {(sp.comm > 0 || sp.target > 0) && (
          <div className="rounded-xl border overflow-hidden grid sm:grid-cols-2">
            {sp.comm > 0 && (
              <div className="flex items-center gap-3 p-4" style={{ background: 'var(--accent-soft)' }}>
                <span className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--surface)' }}>
                  <Icon name="wallet" className="size-5" style={{ color: 'var(--accent)' }} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-muted-foreground">คอมเดือนนี้</div>
                  <div className="num text-[26px] font-extrabold leading-none tracking-tight" style={{ color: 'var(--accent-2)' }}>{fmtB(sp.comm)}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {sp.tgt && Array.isArray(sp.tgt.tiers) && sp.tgt.tiers.length ? 'ขั้นบันได' : `เรต ${Number(sp.tgt?.commission_rate) || 0}%`} × ยอด {fmtB(sp.sales)}
                  </div>
                </div>
              </div>
            )}
            {sp.target > 0 && (
              <div className={'p-4 flex flex-col justify-center gap-2' + (sp.comm > 0 ? ' border-t sm:border-t-0 sm:border-l' : '')}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">เป้าเดือนนี้</span>
                  <span><b className="num">{fmtB(sp.sales)}</b> <span className="text-muted-foreground">/ {fmtB(sp.target)}</span></span>
                </div>
                <Progress value={Math.min(100, sp.pctTarget)} className="h-2" indicatorColor={sp.sales >= sp.target ? 'var(--good)' : 'var(--accent)'} />
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span className="font-semibold" style={{ color: sp.sales >= sp.target ? 'var(--good)' : 'var(--accent-2)' }}>
                    {Math.round(sp.pctTarget)}% ของเป้า{sp.sales >= sp.target ? ' · ถึงแล้ว 🎉' : ''}
                  </span>
                  <span>คาดสิ้นเดือน {fmtB(sp.projected)}</span>
                </div>
              </div>
            )}
          </div>
        )}
        <div>
          <div className="text-sm font-semibold mb-1">ยอดขายรายวัน <span className="text-xs font-normal text-muted-foreground">— แท่ง = ยอด · เส้น = คนทัก (แกนขวา) · เสาร์–อาทิตย์พื้นจาง · คลิกวันเพื่อดูออเดอร์</span></div>
          <DailySalesChart labels={labels} tipLabels={tipLabels} datasets={[{ label: 'ยอดขาย', data: sp.daily.map(d => d.sales), color: 'var(--accent)' }]}
            orders={hasLeads ? sp.daily.map(d => d.leads) : null} ordersLabel="คนทัก" weekend={weekend} fmt={fmtB} height={215}
            emptyText="ยังไม่มียอดในเดือนนี้" clickText="คลิกเพื่อดูออเดอร์ทั้งวัน"
            onBarClick={onDay ? (i) => { const d = sp.daily[i]; if (d) onDay(d.day); } : undefined} />
        </div>
        {/* ช่องทาง — ยอด + ทัก + ปิด + %ปิด รวมในตารางเดียว (เดิมแยกโดนัท + ตาราง %ปิด · โดนัท 1-2 ช่องทางอ่านไม่ได้ความ) */}
        {chRows.length > 0 && (
          <div>
            <div className="text-sm font-semibold mb-1.5">ช่องทางที่ขายได้ <span className="text-xs font-normal text-muted-foreground">— แถบ = สัดส่วนยอด · %ปิด เกณฑ์ดี ≥15%</span></div>
            <div style={{ display: 'grid', gap: 4 }}>
              {chRows.map(c => (
                <div key={c.ch} className="ch-close-row">
                  <span className="ch-close-name row" style={{ gap: 6, minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>
                    <span className="size-2 rounded-full shrink-0" style={{ background: channelColor(c.ch) }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ch}</span>
                  </span>
                  <span className="ch-close-bar" style={{ height: 8, borderRadius: 4, background: 'var(--surface-2)', overflow: 'hidden', minWidth: 24 }}>
                    <span style={{ display: 'block', width: `${chMax ? c.sales / chMax * 100 : 0}%`, height: '100%', background: channelColor(c.ch), borderRadius: 4 }} />
                  </span>
                  <span className="ch-close-sales num" style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtB(c.sales)}</span>
                  <span className="ch-close-meta num cap" style={{ textAlign: 'right', color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{c.leads ? `ทัก ${N(c.leads)} · ปิด ${N(c.orders)}` : '—'}</span>
                  <span className="ch-close-pct num cap" style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: c.closeRate == null ? 'var(--ink-4)' : c.over ? 'var(--warn)' : closeTone(c.closeRate) }}
                    title={c.over ? 'ออเดอร์มากกว่าคนทักที่กรอก — คนทักอาจกรอกไม่ครบ' : undefined}>
                    {c.closeRate == null ? '—' : c.over ? 'ทัก?' : Math.round(c.closeRate) + '%'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {designs.length > 0 && <div><div className="text-sm font-semibold mb-1">ลายขายดี <span className="text-xs font-normal text-muted-foreground">— จำนวนตัว</span></div><HBars data={designs} height={Math.max(150, designs.length * 26)} unit=" ตัว" /></div>}
      </div>
    </>
  );
}

/* การ์ดออเดอร์ + daySummary/DayTiles ย้ายไปเป็นของกลางใน orderCard.jsx (PART 88) — import ด้านบน */

/* ---- ป๊อปอัพ "ทั้งวัน" (คลิกจากกราฟรายวัน) — ออเดอร์ทุกใบของวันนั้นในขอบเขตที่กรอง ----
   สรุปวัน (10 ตัวชี้วัด: ยอดรวม/โอน/COD/ออเดอร์/ตัว/ลูกค้าใหม่/คนทัก/%ปิด/Basket/AVG) + แยกช่องทาง + การ์ดออเดอร์รายตัว */
// การ์ดโชว์ "เสียงลูกค้า" (อ่านอย่างเดียว · จาก tmk_sales_funnel.voice) — โทนเหลืองเข้าชุดกับฟอร์มกรอกในหน้าคนทัก
/* ---- Drill-down รายวัน: ออเดอร์รายตัวของเซลล์ในวันนั้น (ตรวจสอบ/คิดคอม) ---- */
function DaySellerDetail({ name, day, orders, skus, funnel, target, onOpenMonth, onPickCustomer }) {
  // ออเดอร์ของเซลล์คนนี้ในวันนี้ (ตัดยกเลิก) เรียงยอดมาก→น้อย
  const ords = (orders || []).filter(o => !isCancelled(o) && spOf(o) === name && dayOf(o.order_date) === day)
    .sort((a, b) => (Number(b.sales) || 0) - (Number(a.sales) || 0));
  // ไม่ prefetch ส่วนลด/ค่าส่ง/VAT แล้ว — การ์ดออเดอร์ย่อไว้ กดแล้วค่อยดึงรายละเอียดใบนั้น (ลด query ตอนเปิด popup)
  // คนทักของเซลล์คนนี้ในวันนี้ (แยกใหม่/เก่า) — จากแถว funnel วันนั้น
  const dayFunnel = (funnel || []).filter(f => String(f.salesperson || '').trim() === name && dayOf(f.date) === day);
  // leadTot ถูกแทนด้วย daySum.leads (สูตรกลาง) — เดิมสองที่คิดคนละแบบแล้ววางติดกัน
  const leadNO = dayFunnel.reduce((a, f) => { const x = funnelNewOld(f); return { new: a.new + x.new, old: a.old + x.old }; }, { new: 0, old: 0 });
  // index sku ต่อ order_no (line items ลาย/สี/ไซซ์/ยอด)
  const skuBy = new Map();
  (skus || []).forEach(k => { const arr = skuBy.get(k.order_no) || []; arr.push(k); skuBy.set(k.order_no, arr); });
  const sales = ords.reduce((s, o) => s + (Number(o.sales) || 0), 0);
  const comm = target ? commissionFor(sales, target) : 0;
  const tierMode = target && Array.isArray(target.tiers) && target.tiers.length;
  const rate = target && !tierMode ? Number(target.commission_rate) || 0 : null;

  const daySum = daySummary(ords, dayFunnel);

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* สรุปวัน — 10 ตัวชี้วัด (ชุดเดียวกับป๊อปอัพทั้งวัน) · %ปิด จาก lib/funnelClose.js ที่เดียว */}
        {/* ทั้งสองแถบต้องใช้ตัวเลขชุดเดียวกัน — เดิม LeadPanel คิด %ปิด เองด้วย ords.length (นับรวมมาร์เก็ตเพลส)
            แล้ววางติดกับ DaySummaryBar ที่ใช้สูตรกลาง = %ปิด 2 ค่าห่างกัน 1 บรรทัด */}
        <DaySummaryBar s={daySum} />
        <LeadPanel title="คนทักวันนี้ (แยกใหม่/เก่า)" total={daySum.leads} nw={leadNO.new} old={leadNO.old} close={daySum.close} />
        {/* เสียงลูกค้า — จากหน้าคนทัก (ถ้าเซลล์กรอกไว้วันนี้) */}
        <VoiceCard voice={pickVoice(dayFunnel)} />
        {/* คอมของวัน (ประมาณ) — คิดจากยอดวันนี้ × เรต · หมายเหตุ: คอมจริงคิดจากยอดรวมทั้งเดือน */}
        {target && (
          <div className="rounded-lg border p-3 text-sm flex items-center gap-3 flex-wrap" style={{ background: 'color-mix(in srgb, var(--accent) 5%, transparent)' }}>
            <div><div className="text-[11px] text-muted-foreground">คอมประมาณ (จากยอดวันนี้)</div><div className="font-bold text-[var(--accent-2)]">{fmtB(comm)}</div></div>
            <div className="text-xs text-muted-foreground">{tierMode ? 'เรตขั้นบันได — ตามยอดสะสม' : `เรต ${rate}%`} · เป้าเดือน {fmtB(Number(target.sales_target) || 0)}</div>
            {onOpenMonth && <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={onOpenMonth}>สรุปเดือน <Icon name="chevR" className="size-3.5" /></Button>}
          </div>
        )}

        {/* รายการออเดอร์รายตัว + line items */}
        <div>
          <div className="text-sm font-semibold mb-1.5">ออเดอร์วันนี้ ({ords.length})</div>
          {ords.length === 0 ? (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">ไม่มีออเดอร์ของเซลล์คนนี้ในวันนี้</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {ords.map(o => <OrderCard key={o.order_no} o={o} lines={skuBy.get(o.order_no) || []} onPickCustomer={onPickCustomer} collapsed hideDate />)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
