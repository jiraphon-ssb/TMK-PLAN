/* ============================================================
   saleCrmPanels.jsx — แยกมาจาก saleCrm.jsx (หน้า "ภาพรวม CRM")
   ============================================================
   ยกก้อน UI ออกมาทั้งดุ้น ไม่แก้เนื้อใน — ค่าที่เคยเป็น closure ส่งเป็น props เหมือนเดิม
   - MultiSelect      : dropdown ตัวกรองหลายตัวเลือก
   - CrmSkeleton      : โครงร่างตอนโหลด
   - CrmDashboard     : แดชบอร์ดยอด CRM รายเดือน (โทร + LINE)
   - CrmDayDetail     : popup รายละเอียดวัน (กดแท่งกราฟ) + ฟอร์มบันทึกประจำวัน
   hook โหลดข้อมูล/aggregate ระดับหน้ายังอยู่ที่ saleCrm.jsx (CrmView) เหมือนเดิม
   ============================================================ */
import { useState, useEffect, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import { N, Icon, Skel, SkelTable, PersonAvatar } from './components.jsx';
import { DailySalesChart } from './charts.jsx';
import { OrderCard } from './orderCard.jsx';
import { num, LINE_C, PHONE_C } from './lib/crmDirectory.js';
import { TargetGauge } from './saleDashboardMerged.jsx';
import { CrmActivity, ContactCards, CallActivityPanel, CohortMatrix, DeltaChip } from './crmBlocks.jsx';
import { bucketLabel } from './lib/saleTime.js';
import { todayISO, THAI_MONTHS } from './lib/dateUtils.js';
import { CardTitle } from '@/components/ui/card';
import { isCrmOrder, crmCustomerKey } from './lib/crmAgg.js';
import { isCancelled } from './lib/salePerfAgg.js';
import { fetchCrmNotes, saveCrmNote } from './lib/crmTargets.js';
import { blankNoteData, normNoteData, isNoteDataEmpty, noteSummaryText, totalCalls, buildCrmDailyReport } from './lib/crmDailyNote.js';
import { callsFromContacts, contactStats } from './lib/crmContacts.js';
import { isAdmin, myNamesOf } from './lib/roleAccess.js';
import { fmtBaht } from './lib/money.js';
import { MonthPicker } from './components/MonthPicker.jsx';
import { makeSkuResolver, loadResolverMaps } from './lib/designResolve.js';
import { toast, goSection } from './lib/appBus.js';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
export { MultiSelect } from './components/MultiSelect.jsx'; // แหล่งเดียวของทั้งแอป (เดิมมีสำเนา 6 ชุด)

const baht = (n) => fmtBaht(Number(n) || 0); // decimal-aware กลาง (lib/money.js)


/* ---------- Skeleton (แดชบอร์ด + ตาราง) ---------- */
export function CrmSkeleton() {
  return (
    <div className="content-inner rise" style={{ display: 'grid', gap: 14 }}>
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}><Skel w={200} h={18} /><Skel w={130} h={30} r={8} /></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Card key={i} className="p-3"><Skel w={70} h={9} /><Skel w={80} h={22} style={{ marginTop: 8 }} /></Card>)}</div>
      <div className="grid lg:grid-cols-3 gap-3"><Card className="p-4 lg:col-span-2"><Skel w={140} h={14} style={{ marginBottom: 12 }} /><Skel w="100%" h={200} r={9} /></Card><Card className="p-4"><Skel w={120} h={14} style={{ marginBottom: 12 }} /><Skel w="100%" h={150} r={9} /></Card></div>
      <Card className="p-4">
        <div className="row between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 12 }}><Skel w={160} h={16} /><Skel w={90} h={28} r={8} /></div>
        <Skel w="100%" h={34} r={9} style={{ marginBottom: 12 }} />
        <SkelTable cols={6} rows={9} />
      </Card>
    </div>
  );
}

/* ---------- แดชบอร์ดยอด CRM รายเดือน (โทร + LINE) — PART 87 · รื้อรอบ 2 (22 ส.ค.) ---------- */
// HERO 3 ช่อง (เกจเป้า CRM | ยอด CRM + LINE/โทร + 4 สถิติ | ทีมรายคน) → กราฟรายวัน | แผงกิจกรรมโทร → การ์ดคนควรติดต่อ | cohort กลับมาซื้อ → ตารางบันทึกรายวัน (ยุบ) · RFM ไทล์ย้ายไปอยู่เหนือตารางรายชื่อ (saleCrm.jsx · ชุดเดียวกับตาราง)
export function CrmDashboard({ stats, prevStats = null, month, setMonth, curYm, seller, setSeller, target, isAdminUser, onDayClick, team = [], crmTargets = [], notesSummary = null, custRows = [], cohortRows = [], onPickCustomer, onEditDay, onNewNote, todayFilled = null, contacts = null, contactsMissing = false, onLogContact, tasks = null, onFollowUp }) {
  const s = stats;
  const empty = s.crmOrders === 0;
  const isCurMonth = month === curYm;
  const [y, m] = month.split('-').map(Number);
  const dim = new Date(y, m, 0).getDate();
  const today = todayISO();
  const passed = isCurMonth ? Math.min(Number(today.slice(8, 10)), dim) : dim;
  const label = `${THAI_MONTHS[m - 1]} ${y + 543}`;
  const scopeLabel = seller || 'รวมทีม CRM';
  const mt = { has: true, isCur: isCurMonth, dim, passed, target: Number(target) || 0, sales: s.crmSales, ad: 0, adBudget: 0, label, ym: month };
  const prevLabel = (() => { const pm = m === 1 ? 12 : m - 1; return THAI_MONTHS[pm - 1]; })();
  const dP = (c, p, goodUp = true) => (p > 0 && c != null ? (() => { const d = (c - p) / p; return { txt: (d >= 0 ? '+' : '−') + Math.abs(Math.round(d * 100)) + '%', dir: d >= 0 ? 1 : -1, good: goodUp ? d >= 0 : d <= 0, title: `${prevLabel}: ${p >= 100 ? baht(p) : p}` }; })() : null);
  const dPt = (c, p, goodUp = true) => (c != null && p != null && p > 0 ? (() => { const d = Math.round(c - p); return { txt: (d >= 0 ? '+' : '−') + Math.abs(d) + ' pt', dir: d >= 0 ? 1 : -1, good: goodUp ? d >= 0 : d <= 0, title: `${prevLabel}: ${Math.round(p)}%` }; })() : null);
  const aov = s.crmOrders ? s.crmSales / s.crmOrders : 0, prevAov = prevStats?.crmOrders ? prevStats.crmSales / prevStats.crmOrders : 0;
  // ทีมรายคน (เมื่อดูรวมทีม): ยอดจาก bySeller · เป้าจาก crmTargets
  // เป้ากิจกรรมของ scope ที่ดูอยู่ (คนเดียว = ของคนนั้น · รวมทีม = บวกกัน/เฉลี่ย)
  const actTargets = (() => {
    const rows = (crmTargets || []).filter(t => (seller ? t.salesperson === seller : true));
    const calls = rows.reduce((a, t) => a + (Number(t.calls_target) || 0), 0);
    const ansRows = rows.filter(t => Number(t.answer_rate_target) > 0);
    const answer = ansRows.length ? Math.round(ansRows.reduce((a, t) => a + Number(t.answer_rate_target), 0) / ansRows.length) : 0;
    return { calls, answer };
  })();
  const teamRows = (team.length ? team : []).map(name => ({ name, sales: s.bySeller.find(x => x.name === name)?.sales || 0, orders: s.bySeller.find(x => x.name === name)?.orders || 0, target: Number(crmTargets.find(t => t.salesperson === name)?.sales_target) || 0 }));
  // กราฟรายวัน: LINE/โทร + เส้นสายโทร (จากบันทึก) + เส้นประเดือนก่อน
  const labels = s.byDay.map((d, i) => (i === 0 ? bucketLabel(d.date, 'day') : String(i + 1)));
  const tipLabels = s.byDay.map(d => bucketLabel(d.date, 'day'));
  const weekend = s.byDay.map(d => { const w = new Date(d.date + 'T00:00:00').getDay(); return w === 0 || w === 6; });
  const callsByDate = {}; (notesSummary?.rows || []).forEach(r => { callsByDate[r.date] = (callsByDate[r.date] || 0) + r.total; });
  const calls = s.byDay.map(d => callsByDate[d.date] || 0);
  const prevSeries = prevStats ? s.byDay.map((_, i) => (prevStats.byDay[i] ? prevStats.byDay[i].line + prevStats.byDay[i].phone : null)) : null;
  const daysTotal = passed;
  const lineTone = LINE_C, phoneTone = PHONE_C;
  const stat = (l, v, sub, d, tip) => (
    <div key={l} title={tip} style={{ minWidth: 0 }}>
      <div className="cap" style={{ color: 'var(--ink-4)', whiteSpace: 'nowrap' }}>{l}</div>
      <div className="row" style={{ gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}><b className="num" style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-.3px', color: 'var(--ink)' }}>{v}</b><DeltaChip d={d} size={11} /></div>
      {sub && <div className="cap" style={{ color: 'var(--ink-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* หัว — สลับเซลล์/ทีม + เลือกเดือน (คงเดิม) */}
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <div className="row items-center" style={{ gap: 10, minWidth: 0 }}>
          <PersonAvatar name={scopeLabel} size={40} />
          <div style={{ minWidth: 0 }}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="row items-center gap-1.5 text-lg font-bold leading-tight hover:opacity-80" style={{ color: 'var(--ink)' }}>
                  {scopeLabel} <Icon name="chevD" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-52 overflow-auto">
                <DropdownMenuLabel className="py-1">เลือกเซลล์ CRM</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {team.length > 1 && (
                  <DropdownMenuItem onSelect={() => setSeller('')}>
                    <span className="min-w-0 flex-1">รวมทีม CRM</span>{!seller && <Icon name="check" />}
                  </DropdownMenuItem>
                )}
                {(team.length ? team : s.bySeller.map(x => x.name)).map(name => (
                  <DropdownMenuItem key={name} onSelect={() => setSeller(name)}>
                    <PersonAvatar name={name} size={20} />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    {seller === name && <Icon name="check" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 1 }}>ยอด CRM (โทร + LINE){seller ? '' : ' รวมทีม CRM'} · ไม่นับใบยกเลิก{team.length === 0 ? ' · ยังไม่ตั้งเป้า CRM ใคร → ตั้งค่า → เป้า/คอม' : ''}</div>
          </div>
        </div>
        <MonthPicker value={month} onChange={setMonth} max={curYm} />
      </div>

      {/* HERO: เกจเป้า CRM | ยอด CRM | ทีมรายคน */}
      <Card className="p-[22px]">
        <div className={'crm-hero' + (teamRows.length ? '' : ' no-team')}>
          <div style={{ minWidth: 0 }}>
            <TargetGauge mt={mt} title="เป้า CRM" emptyTitle="ยังไม่ตั้งเป้า CRM เดือน" onSetTarget={isAdminUser ? () => goSection('settings', 'targets') : undefined} />
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="cap" style={{ color: 'var(--ink-4)', fontWeight: 600 }}>ยอด CRM <span style={{ fontWeight: 400 }}>· {label}</span></div>
            <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 2 }}>
              <span className="num" style={{ fontSize: 38, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.05, color: 'var(--accent)' }}>{baht(s.crmSales)}</span>
              <DeltaChip d={dP(s.crmSales, s.prev.crmSales)} size={13} />
            </div>
            <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>{N(s.crmOrders)} ออเดอร์ · {N(s.crmQty)} ตัว · AOV <b className="num" style={{ color: 'var(--ink-2)', fontWeight: 700 }}>{baht(aov)}</b> <DeltaChip d={dP(aov, prevAov)} size={10} /></div>
            {s.crmSales > 0 && <div style={{ marginTop: 12 }}>
              <div className="row cap" style={{ justifyContent: 'space-between', color: 'var(--ink-4)' }}><span><b style={{ color: lineTone, fontWeight: 700 }}>LINE</b> {baht(s.lineSales)} · {Math.round(s.lineSales / s.crmSales * 100)}%</span><span><b style={{ color: phoneTone, fontWeight: 700 }}>โทร</b> {baht(s.phoneSales)} · {Math.round(s.phoneSales / s.crmSales * 100)}%</span></div>
              <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-2)', marginTop: 5 }} role="img" aria-label={`LINE ${Math.round(s.lineSales / s.crmSales * 100)}% โทร ${Math.round(s.phoneSales / s.crmSales * 100)}%`}><span style={{ width: `${s.lineSales / s.crmSales * 100}%`, background: lineTone }} /><span style={{ width: `${s.phoneSales / s.crmSales * 100}%`, background: phoneTone }} /></div>
            </div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 16px', marginTop: 'auto', paddingTop: 16 }}>
              {stat('ลูกค้าที่ซื้อ', N(s.buyers), `ใหม่ ${N(s.newBuyers)} · ซื้อซ้ำ ${N(s.repeatBuyers)}${s.buyers ? ` (${Math.round(s.repeatBuyers / s.buyers * 100)}%)` : ''}`, dP(s.buyers, s.prev.buyers), 'ลูกค้าไม่ซ้ำที่ซื้อผ่าน LINE/โทร เดือนนี้ · ซื้อซ้ำ = เคยซื้อผ่าน CRM มาก่อน')}
              {stat('สัดส่วน CRM', `${Math.round(s.crmShare)}%`, `จากยอดรวม ${baht(s.totalSales)}`, dPt(s.crmShare, s.prev.crmShare), 'ยอด CRM ÷ ยอดขายรวมทั้งบริษัทเดือนนี้')}
              {stat('โทรออก', notesSummary?.total ? N(notesSummary.total) : '—', notesSummary?.total ? `รับสาย ${notesSummary.ansPct}% · ${N(notesSummary.days.size)} วันที่บันทึก` : 'ยังไม่มีบันทึกประจำวัน', null, 'จำนวนสายจากบันทึกประจำวัน (0DAY + 5DAY + ชวนซื้อซ้ำ)')}
              {stat('อัพเซลล์', notesSummary?.upO ? N(notesSummary.upO) : '—', notesSummary?.upB ? `${baht(notesSummary.upB)} · แถม ${N(notesSummary.free)} · วันเกิด ${N(notesSummary.bday)}` : 'จากบันทึกประจำวัน', null, 'ออเดอร์ที่อัพเซลล์ได้ · ยอดเพิ่ม · แถม · วันเกิด')}
            </div>
          </div>
          {teamRows.length > 0 && (
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div className="cap" style={{ fontWeight: 700, color: 'var(--ink-2)', marginBottom: 10 }}>ทีม CRM รายคน <span style={{ color: 'var(--ink-4)', fontWeight: 400 }}>· คลิกชื่อดูเฉพาะคน</span></div>
              <div style={{ display: 'grid', gap: 8 }}>
                {teamRows.map(r => { const pct = r.target > 0 ? r.sales / r.target * 100 : null; const pace = r.target > 0 && passed ? r.sales / (r.target * passed / dim) : null; const tone = pace == null ? 'var(--accent)' : pace >= 1 ? 'var(--good)' : pace >= 0.6 ? 'var(--warn)' : 'var(--bad)'; const on = seller === r.name; return (
                  <div key={r.name} role="button" tabIndex={0} onClick={() => setSeller(on && team.length > 1 ? '' : r.name)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSeller(on && team.length > 1 ? '' : r.name); } }} className="rounded-xl cursor-pointer" style={{ padding: '9px 11px', border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent-soft)' : 'var(--surface)' }}>
                    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                      <PersonAvatar name={r.name} size={30} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="row" style={{ justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}><span style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span><span className="num" style={{ fontWeight: 800, fontSize: 15, whiteSpace: 'nowrap' }}>{baht(r.sales)}</span></div>
                        <div className="row cap" style={{ justifyContent: 'space-between', gap: 8, color: 'var(--ink-4)' }}><span>{N(r.orders)} ออเดอร์</span>{r.target > 0 ? <span>เป้า {fmtBaht(r.target)} · <b style={{ color: tone, fontWeight: 700 }}>{Math.round(pct)}%</b>{pace != null ? ` · ${pace >= 1 ? 'ตามเป้า' : pace >= 0.6 ? 'ใกล้เป้า' : 'หลุดเป้า'}` : ''}</span> : <span>ไม่มีเป้า</span>}</div>
                      </div>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden', marginTop: 7 }}><span style={{ display: 'block', width: `${Math.min(100, pct ?? 0)}%`, height: '100%', background: tone, borderRadius: 3 }} /></div>
                  </div>
                ); })}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* กราฟรายวัน | แผงกิจกรรมโทร */}
      <div className="crm-split">
        <Card className="p-[22px] min-w-0">
          <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <div>
              <CardTitle className="m-0 text-base font-semibold">ยอด CRM รายวัน <span className="dim">· {label}</span></CardTitle>
              <div className="cap" style={{ color: 'var(--ink-4)', marginTop: 2 }}>แท่ง = LINE / โทร · เส้น = สายที่โทร (แกนขวา){prevSeries ? ` · เส้นประ = ยอด CRM ${prevLabel} วันเดียวกัน` : ''} · คลิกวันดูออเดอร์/บันทึก</div>
            </div>
          </div>
          {empty && !notesSummary?.has
            ? <div className="flex items-center justify-center text-center" style={{ minHeight: 200, color: 'var(--ink-4)' }}>ยังไม่มียอด CRM ในเดือนนี้</div>
            : <DailySalesChart labels={labels} tipLabels={tipLabels} datasets={[{ label: 'LINE', data: s.byDay.map(d => d.line), color: LINE_C }, { label: 'โทร', data: s.byDay.map(d => d.phone), color: PHONE_C }]}
                orders={calls.some(v => v > 0) ? calls : null} ordersLabel="สายโทร" weekend={weekend} prevValues={prevSeries} prevLabel={`ยอด CRM ${prevLabel}`} fmt={baht} height={260}
                emptyText="ไม่มียอด CRM" clickText="คลิกเพื่อดูออเดอร์/บันทึกวันนี้" onBarClick={(i) => onDayClick(i)} />}
          <div className="cap row" style={{ gap: 6, marginTop: 10, justifyContent: 'center', flexWrap: 'wrap', color: 'var(--ink-4)' }}>
            <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: LINE_C }} /> LINE</span>
            <span className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 8, borderRadius: 2, background: PHONE_C }} /> โทร</span>
            {calls.some(v => v > 0) && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px solid var(--ink-3)' }} /> สายโทร/วัน (แกนขวา)</span>}
            {prevSeries && <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 16, borderTop: '2px dashed var(--accent-2)' }} /> ยอด CRM {prevLabel} วันเดียวกัน</span>}
            <span className="row" style={{ gap: 6, marginLeft: 8 }}><span style={{ width: 14, height: 10, borderRadius: 2, background: 'rgba(130,140,160,.18)' }} /> เสาร์–อาทิตย์</span>
          </div>
        </Card>
        <CallActivityPanel summary={notesSummary} daysTotal={daysTotal} month={label} onNewNote={isCurMonth ? onNewNote : undefined} todayFilled={isCurMonth ? todayFilled : null}
          callsTarget={actTargets.calls} answerTarget={actTargets.answer} />
      </div>

      {/* คนที่ควรติดต่อ | cohort กลับมาซื้อซ้ำ */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
        <ContactCards rows={custRows} onPick={onPickCustomer} title="ลูกค้า CRM ที่ควรติดต่อ" limit={6}
          contacts={contactsMissing ? null : contacts} onLog={contactsMissing ? undefined : onLogContact} today={todayISO()}
          tasks={tasks} onFollowUp={onFollowUp}
          sub={contactsMissing ? 'บันทึกการติดต่อยังใช้ไม่ได้ — ต้องรัน migration 20260824-crm-contacts.sql ก่อน' : undefined} />
        <CohortMatrix rows={cohortRows} title="ลูกค้า CRM ใหม่ กลับมาซื้อซ้ำ" sub="แถว = เดือนที่ซื้อผ่าน LINE/โทรครั้งแรก · ช่อง = % ที่กลับมาซื้อในเดือนที่ 1–3 ถัดไป · คอลัมน์ขวา = กลับมาซื้ออีกอย่างน้อย 1 ครั้ง" />
      </div>

      {/* ตารางบันทึกรายวัน (ยุบ) */}
      <CrmActivity summary={notesSummary} daysTotal={daysTotal} month={label} onEditDay={onEditDay} collapsible />
    </div>
  );
}

/* ---------- Popup รายละเอียดวัน (กดแท่งกราฟ) — แบบหน้าประสิทธิภาพเซลล์ ---------- */
// ช่องตัวเลขฟอร์มบันทึกประจำวัน — 0 โชว์ว่าง (พิมพ์ทับง่าย) · กึ่งกลาง tabular · พื้นขาวเด่นบนการ์ดสีหมวด
function NoteNum({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>{label}</span>
      <Input type="number" inputMode="numeric" min={0} className="h-9 text-[13px] text-center tabular-nums"
        style={{ background: 'var(--surface)' }} value={value === 0 ? '' : value} placeholder="0" onChange={e => onChange(e.target.value)} />
    </label>
  );
}
// กลุ่มโทร (0DAY / 5DAY / Repurchase) — การ์ดขาว: โทรทั้งหมด + รับสาย เคียงกัน · ไม่รับคิดอัตโนมัติ (แบบ A)
function NoteCallGroup({ title, g, onChange, tone }) {
  const missed = Math.max(0, (Number(g.total) || 0) - (Number(g.answered) || 0));
  const cell = (key, lb) => (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10.5px]" style={{ color: 'var(--ink-4)' }}>{lb}</span>
      <Input type="number" inputMode="numeric" min={0} className="h-9 text-[13px] text-center tabular-nums"
        style={{ background: 'var(--surface)' }} value={g[key] === 0 ? '' : g[key]} placeholder="0" onChange={e => onChange(key, e.target.value)} />
    </label>
  );
  return (
    <div className="rounded-lg p-2.5" style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div className="text-[12px] font-semibold mb-2" style={{ color: tone }}>{title}</div>
      <div className="grid grid-cols-2 gap-1.5">{cell('total', 'โทร')}{cell('answered', 'รับ')}</div>
      <div className="text-[11px] mt-1.5 text-center" style={{ color: 'var(--ink-4)' }}>ไม่รับ <b style={{ color: 'var(--ink-2)' }}>{missed}</b> สาย</div>
    </div>
  );
}
// การ์ดออเดอร์ → ใช้ OrderCard กลาง (orderCard.jsx · PART 88) — ดีไซน์ Lemon: ส่วนลดที่หัว + สรุปเงินท้ายรายการ
export function CrmDayDetail({ dateISO, orders, allOrders, seller, user, onPickCustomer, contacts = [] }) {
  const [lineBy, setLineBy] = useState(null); // order_no → [{design,color,size,qty,line_sales}]
  const [finBy, setFinBy] = useState({});     // "source:order_no" → {subtotal,discount,shipping,vat}
  const [notes, setNotes] = useState([]);     // บันทึกประจำวัน ของวันนั้น (ทุกคน)
  const [noteData, setNoteData] = useState(blankNoteData()); // ฟอร์มมีช่อง (PART 91)
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false); // ย่อ/กางฟอร์มบันทึกประจำวัน (กดเพื่อเปิด · แบบ A)
  const loading = lineBy === null;

  // ออเดอร์ CRM (LINE/โทร) ของวันนั้น — เรียงยอดมาก→น้อย
  const ords = useMemo(() => (orders || []).filter(o => o.order_date === dateISO && !isCancelled(o) && isCrmOrder(o))
    .sort((a, b) => (num(b.sales) - num(a.sales))), [orders, dateISO]);
  const line = ords.filter(o => o.channel === 'LINE').reduce((x, o) => x + num(o.sales), 0);
  const phone = ords.filter(o => o.channel === 'Phone').reduce((x, o) => x + num(o.sales), 0);
  const qty = ords.reduce((x, o) => x + num(o.qty), 0);
  const buyers = new Set(ords.map(o => crmCustomerKey(o)).filter(Boolean)).size;

  // ลูกค้าเก่า/ใหม่ + ปิดการขาย Repurchase — คิดสดจากวันซื้อครั้งแรกทั้งบริษัท (allOrders · เก่า=เคยซื้อก่อนวันนี้แม้กับเซลล์คนอื่น)
  const { oldCust, newCust, repurchaseOrders, repurchaseBaht } = useMemo(() => {
    const firstDate = {};
    (allOrders || orders || []).forEach(o => {
      if (isCancelled(o)) return;
      const k = crmCustomerKey(o), dt = o.order_date || '';
      if (!k || !dt) return;
      if (!firstDate[k] || dt < firstDate[k]) firstDate[k] = dt;
    });
    const keys = [...new Set(ords.map(o => crmCustomerKey(o)).filter(Boolean))];
    const nc = keys.filter(k => (firstDate[k] || dateISO) >= dateISO).length;
    const rep = ords.filter(o => { const k = crmCustomerKey(o); return k && (firstDate[k] || dateISO) < dateISO; });
    return { oldCust: keys.length - nc, newCust: nc, repurchaseOrders: rep.length, repurchaseBaht: rep.reduce((x, o) => x + num(o.sales), 0) };
  }, [allOrders, orders, ords, dateISO]);

  // lazy: รายการสินค้า (skus) + แยกราคา (attrs) — โหลดตอนเปิด popup เท่านั้น (ออเดอร์/วันไม่มาก · egress ต่ำ)
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ล้างค่าเดิมก่อนโหลด async ตอนเปลี่ยนวัน/ชุดออเดอร์ (กันโชว์รายการสินค้าของวันเก่าค้าง)
    setLineBy(null); setFinBy({});
    (async () => {
      const nos = [...new Set(ords.map(o => o.order_no).filter(x => x && !String(x).startsWith('(')))];
      const lb = new Map();
      if (nos.length) {
        const rows = [];
        for (let i = 0; i < nos.length; i += 150) {
          const { data } = await supabase.from('tmk_mp_skus').select('order_no,design,color,size,qty,line_sales,product_code,raw_sku_or_name,order_date').in('order_no', nos.slice(i, i + 150));
          rows.push(...(data || []));
        }
        // resolve ชื่อลายสด (ตรงหน้าออเดอร์/แดชบอร์ด)
        const maps = await loadResolverMaps(supabase);
        if (!live) return;
        const resolve = makeSkuResolver(maps);
        rows.forEach(s => { s.design = resolve(s).design || s.design; const g = lb.get(s.order_no) || []; g.push(s); lb.set(s.order_no, g); });
        // attrs (ส่วนลด/ค่าส่ง/VAT/ราคาเสื้อ) — คีย์ source:order_no กันชนข้าม source
        const fb = {};
        const { data: aData } = await supabase.from('tmk_mp_orders').select('order_no,source,attrs').in('order_no', nos);
        (aData || []).forEach(r => { const a = r.attrs || {}; fb[`${r.source || ''}:${r.order_no}`] = { subtotal: a.subtotal, discount: a.discount, shipping: a.shipping, vat: a.vat, promo: a.promo_code }; });
        if (live) setFinBy(fb);
      }
      if (live) setLineBy(lb);
    })();
    return () => { live = false; };
  }, [dateISO, ords]);

  // บันทึกประจำวัน — โหลดแยกจากออเดอร์ (คีย์ [dateISO] เท่านั้น) · กัน realtime ออเดอร์เข้ามาระหว่างกรอก → ฟอร์มรีเซ็ต/ที่พิมพ์หาย
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ล้างก่อนโหลด async ตอนเปลี่ยนวัน (กันโน้ตวันเก่าค้างให้เห็น)
    setNotes([]);
    fetchCrmNotes(dateISO).then(n => { if (live) setNotes(n); });
    return () => { live = false; };
  }, [dateISO]);

  // ส่วนลดรวมของวัน (จาก attrs · ไม่มี = 0 ตามจริง — ใบเสร็จที่ไม่มีส่วนลดจะไม่เขียน attrs.discount)
  const discTotal = useMemo(() => ords.reduce((x, o) => x + (Number(finBy[`${o.source || ''}:${o.order_no}`]?.discount) || 0), 0), [ords, finBy]);

  // บันทึกประจำวัน — scope เดี่ยว = ของเซลล์คนนั้น · แก้ได้ถ้า admin หรือเป็นตัวเอง
  const canEditNote = (sp) => isAdmin(user) || myNamesOf(user).includes(sp);
  const singleRow = seller ? notes.find(n => n.salesperson === seller) : null;
  // โหลดค่าเดิม · แถวเก่าก่อนมีฟอร์ม (มี note ข้อความ ไม่มี data) → ยกข้อความมาไว้ช่อง "หมายเหตุเพิ่มเติม" กันหาย
  const savedData = useMemo(() => {
    const d = normNoteData(singleRow?.data);
    if (!singleRow?.data && singleRow?.note && !d.extra.trim()) d.extra = String(singleRow.note);
    return d;
  }, [singleRow]);
  // โหลดค่าเข้าฟอร์มเมื่อดึงโน้ตใหม่/เปลี่ยนวัน (notes identity เปลี่ยนเฉพาะตอน refetch → ไม่ทับที่กำลังพิมพ์)
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- ตั้งใจ sync ฟอร์มจากค่าที่ดึงมา เฉพาะตอน refetch/เปลี่ยนวัน/เปลี่ยนเซลล์ (ใส่ savedData เป็น dep จะทับสิ่งที่กำลังพิมพ์)
  useEffect(() => { setNoteData(savedData); }, [notes, seller, dateISO]);
  const noteDirty = useMemo(() => JSON.stringify(normNoteData(noteData)) !== JSON.stringify(savedData), [noteData, savedData]);

  const saveNote = async (sp) => {
    setNoteBusy(true);
    const data = normNoteData(noteData);
    const empty = isNoteDataEmpty(data);
    const summary = empty ? '' : (noteSummaryText(data) || 'มีข้อมูลบันทึกประจำวัน');
    const { error, degraded } = await saveCrmNote({ salesperson: sp, date: dateISO, note: summary, data: empty ? null : data });
    setNoteBusy(false);
    if (error) {
      const miss = /relation .* does not exist|tmk_crm_notes|schema cache/i.test(error.message || '');
      toast(miss ? 'ต้องรัน migration 20260731-crm-targets-notes.sql ใน Supabase ก่อน' : 'บันทึกไม่สำเร็จ', 'error');
      return;
    }
    if (degraded) toast('บันทึกข้อความแล้ว แต่ช่องตัวเลขยังไม่ถูกเก็บ — ต้องรัน migration 20260805-crm-note-data.sql', 'warn');
    else toast('บันทึกแล้ว', 'success');
    setNotes(await fetchCrmNotes(dateISO));
  };
  // helpers อัปเดตฟอร์ม · setCall กัน "รับ > โทรทั้งหมด" (ให้ total ≥ answered เสมอ → รายงานไม่ขัดกัน)
  const setCall = (grp, key, v) => setNoteData(d => {
    const g = { ...d.calls[grp] };
    g[key] = Math.max(0, Math.round(Number(v) || 0));
    if (key === 'total' && g.answered > g.total) g.answered = g.total;   // ลดโทรรวม → รับตามลง
    if (key === 'answered' && g.answered > g.total) g.total = g.answered; // รับเกินโทรรวม → ดันโทรรวมขึ้น
    return { ...d, calls: { ...d.calls, [grp]: g } };
  });
  // คัดลอกรายงาน CRM ประจำวัน (ฟอร์แมตกลางทั้งทีม) — auto = ตัวเลขที่ระบบคิดจากออเดอร์จริงของวันนั้น
  const copyReport = async () => {
    const txt = buildCrmDailyReport({
      seller, dateISO,
      auto: { crmSales: line + phone, line, phone, orders: ords.length, qty, buyers, oldCust, newCust, repurchaseOrders, repurchaseBaht },
      data: noteData,
    });
    try { await navigator.clipboard.writeText(txt); toast('คัดลอกรายงานแล้ว — วางในไลน์ได้เลย', 'success'); }
    catch { toast('คัดลอกไม่สำเร็จ — กดค้างที่ข้อความเพื่อคัดลอกเอง', 'warn'); }
  };
  const setNum = (key, v) => setNoteData(d => ({ ...d, [key]: Math.max(0, Number(v) || 0) }));
  // บันทึกการติดต่อของวันนี้ (เฉพาะเซลล์ที่กำลังดู ถ้าเลือกไว้) → ใช้เติมจำนวนสายอัตโนมัติ
  const dayContacts = useMemo(() => (contacts || []).filter(c => c.date === dateISO && (!seller || !c.salesperson || c.salesperson === seller)), [contacts, dateISO, seller]);
  const autoCalls = useMemo(() => callsFromContacts(dayContacts), [dayContacts]);
  const callsDiffer = JSON.stringify(autoCalls) !== JSON.stringify(normNoteData(noteData).calls);
  const applyAutoCalls = () => setNoteData(d => ({ ...d, calls: autoCalls }));
  const setTxt = (key, v) => setNoteData(d => ({ ...d, [key]: v }));

  return (
    <div className="flex flex-col gap-4">
      {/* สรุปวัน — ยอด CRM เด่น + แถบ LINE/โทร + สถิติแถวเดียว (รื้อ 22 ส.ค. · เดิม 7 กล่องเท่ากันหมด ทั้งที่ LINE/โทร เป็นส่วนย่อยของยอด CRM) */}
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
        <div className="row" style={{ gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <div className="text-[11px] text-muted-foreground">ยอด CRM ของวัน <span className="font-normal">· LINE + โทร</span></div>
            <div className="num" style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.6px', lineHeight: 1.1, color: 'var(--accent)' }}>{baht(line + phone)}</div>
          </div>
          {repurchaseOrders > 0 && (
            <div className="ml-auto text-right" title="ออเดอร์จากลูกค้าที่เคยซื้อมาก่อนวันนี้ (ปิด Repurchase)">
              <div className="text-[11px] text-muted-foreground">ปิดซื้อซ้ำ</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 800, color: 'var(--good)' }}>{N(repurchaseOrders)}<span className="text-[11px] font-normal text-muted-foreground"> ใบ · {baht(repurchaseBaht)}</span></div>
            </div>
          )}
        </div>
        {(line + phone) > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="row cap" style={{ justifyContent: 'space-between', color: 'var(--ink-4)' }}>
              <span>LINE <b className="num" style={{ color: LINE_C, fontWeight: 700 }}>{baht(line)}</b> · {Math.round(line / (line + phone) * 100)}%</span>
              <span>โทร <b className="num" style={{ color: PHONE_C, fontWeight: 700 }}>{baht(phone)}</b> · {Math.round(phone / (line + phone) * 100)}%</span>
            </div>
            <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--surface-3)', marginTop: 5 }} role="img" aria-label={`LINE ${Math.round(line / (line + phone) * 100)}% · โทร ${Math.round(phone / (line + phone) * 100)}%`}>
              <span style={{ width: `${line / (line + phone) * 100}%`, background: LINE_C }} /><span style={{ width: `${phone / (line + phone) * 100}%`, background: PHONE_C }} />
            </div>
          </div>
        )}
        <div className="day-stats" style={{ marginTop: 12 }}>
          {[
            ['ออเดอร์', N(ords.length), ords.length ? `${(qty / ords.length).toFixed(1)} ตัว/ออเดอร์` : ''],
            ['จำนวนตัว', N(qty), ''],
            ['ลูกค้าที่ซื้อ', N(buyers), buyers ? `ใหม่ ${N(newCust)} · เก่า ${N(oldCust)}` : ''],
            ['เฉลี่ย/ออเดอร์', ords.length ? baht((line + phone) / ords.length) : '—', ''],
            ['ส่วนลดรวม', discTotal > 0 ? baht(discTotal) : '—', discTotal > 0 ? 'จากใบเสร็จ' : ''],
          ].map(([l, v, sub]) => (
            <div key={l} style={{ minWidth: 0 }}>
              <div className="text-[11px] text-muted-foreground whitespace-nowrap">{l}</div>
              <div className="num" style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>{v}</div>
              {sub && <div className="text-[10.5px] text-muted-foreground whitespace-nowrap" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* บันทึกประจำวัน CRM — ฟอร์มมีช่อง แบบ A (การ์ดสีประจำหมวด · กดเพื่อเปิด) · อยู่ในรูปแคปด้วย */}
      {seller ? (
        (canEditNote(seller) || singleRow?.note) && (
          canEditNote(seller) ? (
            <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--line)' }}>
              {/* หัวกดเพื่อย่อ/กาง */}
              <button type="button" onClick={() => setNoteOpen(o => !o)} className="w-full flex items-center gap-3 p-3 text-left" style={{ background: 'transparent' }}>
                <span className="shrink-0 grid place-items-center rounded-lg [&_svg]:size-[18px]" style={{ width: 34, height: 34, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Icon name="chat" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold" style={{ color: 'var(--ink)' }}>บันทึกประจำวัน — {seller}</span>
                  <span className="block text-[12px] truncate" style={{ color: 'var(--ink-4)' }}>{noteDirty ? 'มีการแก้ยังไม่บันทึก' : (isNoteDataEmpty(savedData) ? 'ยังไม่กรอก · กดเพื่อเปิดฟอร์ม' : `บันทึกแล้ว · ${noteSummaryText(savedData) || 'มีข้อมูล'}`)}</span>
                </span>
                <span className="shrink-0 transition-transform [&_svg]:size-[18px]" style={{ color: 'var(--ink-4)', transform: noteOpen ? 'rotate(-180deg)' : 'none' }}><Icon name="chevD" /></span>
              </button>
              {noteOpen && (
                <div className="flex flex-col gap-3 p-3 pt-0">
                  {/* PART 110: มีบันทึกการติดต่อรายลูกค้าของวันนี้ → เติมจำนวนสายให้อัตโนมัติ ไม่ต้องนับเอง */}
                  {dayContacts.length > 0 && (
                    <div className="rounded-[10px] p-2.5 flex items-center gap-2 flex-wrap" style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                      <Icon name="phone" style={{ color: 'var(--accent)' }} />
                      <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>
                        {/* แยกให้ชัด: "ทั้งหมด" รวมการติดต่อจากป็อปอัพลูกค้า (kind other) ซึ่งเติมลงฟอร์มไม่ได้
                            เดิมโชว์แต่ total แล้วบอกว่า "ตรงกับที่กรอกแล้ว" ทั้งที่ฟอร์มเป็น 0 = เข้าใจผิด */}
                        วันนี้บันทึกการติดต่อไว้ <b style={{ color: 'var(--ink)' }}>{contactStats(dayContacts).total}</b> ครั้ง
                        {contactStats(dayContacts).other > 0 && <> (เข้ากลุ่ม 0/5/ซื้อซ้ำ {contactStats(dayContacts).grouped} · อื่นๆ {contactStats(dayContacts).other})</>}
                        {' '}· รับสาย {contactStats(dayContacts).answered}
                      </span>
                      {callsDiffer && <Button size="sm" variant="outline" className="h-7 ml-auto" onClick={applyAutoCalls}>ใช้ตัวเลขนี้</Button>}
                      {!callsDiffer && <span className="cap ml-auto" style={{ color: 'var(--good)', fontWeight: 600 }}>ตรงกับที่กรอกแล้ว</span>}
                    </div>
                  )}
                  {/* การโทร — โซนฟ้า */}
                  <div className="rounded-[10px] p-3" style={{ background: 'var(--accent-soft)', borderLeft: '3px solid var(--accent)' }}>
                    <div className="text-[12px] font-semibold mb-2.5 [&_svg]:size-[15px] flex items-center gap-1.5" style={{ color: 'var(--accent-2)' }}><Icon name="phone" /> การโทร</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <NoteCallGroup title="0DAY" g={noteData.calls.d0} onChange={(k, v) => setCall('d0', k, v)} tone="var(--accent-2)" />
                      <NoteCallGroup title="5DAY" g={noteData.calls.d5} onChange={(k, v) => setCall('d5', k, v)} tone="var(--accent-2)" />
                      <NoteCallGroup title="Repurchase" g={noteData.calls.rep} onChange={(k, v) => setCall('rep', k, v)} tone="var(--accent-2)" />
                    </div>
                    <div className="text-[11px] mt-2" style={{ color: 'var(--accent-2)' }}>รวม <b>{totalCalls(noteData)}</b> สาย — คิดให้อัตโนมัติ</div>
                  </div>
                  {/* ผลการขาย — โซนเขียว */}
                  <div className="rounded-[10px] p-3" style={{ background: 'var(--good-soft)', borderLeft: '3px solid var(--good)' }}>
                    <div className="text-[12px] font-semibold mb-2.5 [&_svg]:size-[15px] flex items-center gap-1.5" style={{ color: 'var(--good)' }}><Icon name="chat" /> ผลการขาย</div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <NoteNum label="อัพเซลล์ (ออเดอร์)" value={noteData.upsellOrders} onChange={v => setNum('upsellOrders', v)} />
                      <NoteNum label="อัพเซลล์ (บาท)" value={noteData.upsellBaht} onChange={v => setNum('upsellBaht', v)} />
                      <NoteNum label="ออเดอร์แถม" value={noteData.freebieOrders} onChange={v => setNum('freebieOrders', v)} />
                      <NoteNum label="โปรวันเกิด" value={noteData.birthdayOrders} onChange={v => setNum('birthdayOrders', v)} />
                    </div>
                  </div>
                  {/* เสียงลูกค้า — โซนเหลือง */}
                  <div className="rounded-[10px] p-3" style={{ background: 'var(--warn-soft)', borderLeft: '3px solid var(--warn)' }}>
                    <div className="text-[12px] font-semibold mb-2.5 [&_svg]:size-[15px] flex items-center gap-1.5" style={{ color: 'var(--warn)' }}><Icon name="chat" /> เสียงลูกค้า</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ถามหาอะไร</span><Textarea rows={2} className="text-[13px]" style={{ background: 'var(--surface)' }} value={noteData.ask} onChange={e => setTxt('ask', e.target.value)} placeholder="เช่น เสื้อแบบมีกระเป๋า" /></label>
                      <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ชมเรื่องอะไร</span><Textarea rows={2} className="text-[13px]" style={{ background: 'var(--surface)' }} value={noteData.praise} onChange={e => setTxt('praise', e.target.value)} placeholder="—" /></label>
                      <label className="flex flex-col gap-1"><span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>ติอะไร</span><Textarea rows={2} className="text-[13px]" style={{ background: 'var(--surface)' }} value={noteData.complaint} onChange={e => setTxt('complaint', e.target.value)} placeholder="—" /></label>
                    </div>
                  </div>
                  {/* หมายเหตุเพิ่มเติม (รับข้อความโน้ตเก่าก่อนมีฟอร์มมาไว้ที่นี่ด้วย) */}
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px]" style={{ color: 'var(--ink-4)' }}>หมายเหตุเพิ่มเติม (ถ้ามี)</span>
                    <Textarea rows={2} className="text-[13px]" value={noteData.extra} onChange={e => setTxt('extra', e.target.value)} placeholder="เรื่องอื่นๆ ที่อยากบันทึกไว้" />
                  </label>
                  {/* ระบบเติมเอง (คิดสดจากออเดอร์จริง — เข้ารายงานอัตโนมัติ ไม่ต้องกรอก) */}
                  <div className="rounded-[10px] px-3 py-2 text-[12px] leading-relaxed" style={{ background: 'var(--accent-soft)', color: 'var(--accent-2)' }}>
                    <b>ระบบเติมให้เอง</b> (เข้ารายงานอัตโนมัติ): ยอด CRM {baht(line + phone)} (LINE {baht(line)} · โทร {baht(phone)}) · {N(ords.length)} ออเดอร์ · {N(qty)} ตัว · ปิด Repurchase {N(repurchaseOrders)} ({baht(repurchaseBaht)}) · ลูกค้าซื้อ {N(buyers)} คน (เก่า {N(oldCust)} · ใหม่ {N(newCust)})
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end items-center">
                    {/* คัดลอกรายงานฉบับเต็ม (ฟอร์แมตเดียวกับที่ทีมส่งไลน์) — ตัวเลขยอด/ลูกค้า/Repurchase ระบบเติมให้เอง */}
                    <Button size="sm" variant="outline" onClick={copyReport}><Icon name="external" /> คัดลอกรายงานวันนี้</Button>
                    <Button size="sm" disabled={noteBusy || !noteDirty} onClick={() => saveNote(seller)}><Icon name="check" /> บันทึก</Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
              <div className="cap mb-1.5" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>บันทึกประจำวัน — {seller}</div>
              <div className="text-[13px]" style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{singleRow?.note}</div>
            </div>
          )
        )
      ) : (
        <>
          {/* ดู "รวมทีม CRM" อยู่ → ฟอร์มกรอกไม่ขึ้น (บันทึกผูกกับคน) · เดิมเงียบจนงงว่าปุ่มเสีย */}
          <div className="rounded-xl border p-3 flex items-center gap-2" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
            <Icon name="lightbulb" className="shrink-0" style={{ color: 'var(--warn)' }} />
            <span className="text-[12.5px]" style={{ color: 'var(--ink-3)' }}>กำลังดูรวมทีม CRM — เลือกชื่อเซลล์ที่หัวหน้าจอก่อน จึงจะกรอก/แก้บันทึกประจำวันได้</span>
          </div>
          {notes.length > 0 && (
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
          <div className="cap mb-1.5" style={{ fontWeight: 700, color: 'var(--ink-2)' }}>บันทึกประจำวัน</div>
          <div className="flex flex-col gap-1.5">
            {notes.filter(n => (n.note || '').trim()).map(n => <div key={n.id} className="text-[13px]" style={{ color: 'var(--ink-2)' }}><b style={{ color: 'var(--ink)' }}>{n.salesperson}:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{n.note}</span></div>)}
          </div>
        </div>
          )}
        </>
      )}

      <div>
        <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--ink)' }}>ออเดอร์ CRM วันนี้ <span className="font-normal" style={{ color: 'var(--ink-4)' }}>· {N(ords.length)} ใบ · แตะเพื่อดูรายการ</span></div>
        {ords.length === 0
          ? <div className="rounded-lg border p-6 text-center text-sm" style={{ color: 'var(--ink-4)' }}>ไม่มีออเดอร์ CRM ในวันนี้</div>
          : loading
            ? <div className="flex flex-col gap-1.5">{Array.from({ length: Math.min(ords.length, 3) }).map((_, i) => <Skel key={i} w="100%" h={38} r={9} />)}</div>
            : <div className="flex flex-col gap-1.5">
                {ords.map((o, i) => (
                  <OrderCard key={o.order_no + '#' + i} o={o} lines={lineBy?.get(o.order_no)} fin={finBy[`${o.source || ''}:${o.order_no}`]} onPickCustomer={onPickCustomer} collapsed hideDate />
                ))}
              </div>}
      </div>
    </div>
  );
}
