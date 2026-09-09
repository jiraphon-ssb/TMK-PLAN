/* ============================================================
   dayDetailSheet.jsx — เนื้อใน popup "รายละเอียดวัน" (ตัวกลางตัวเดียว)
   ============================================================
   รวม 2 ตัวที่เคยแยกกันแต่เป็นของเดียวกัน 80% :
     - DashDayDetail (รายงานขาย · saleDashboardModals) — มีตารางคนทักรายคน + กรองโอน/COD + เรียง
     - DayDetail     (ประสิทธิภาพเซล · salePerf)       — มีชิปเซลล์ + ตารางช่องทาง + เสียงลูกค้า
   ปัญหาเดิม: ฟีเจอร์กระจายคนละตัว (กรองโอน/COD มีที่เดียว · ตารางช่องทางมีที่เดียว ฯลฯ)
   เพราะโตทีละ PART ไม่มีใครกลับมารวม → ตัวนี้คือ union ของทั้งคู่ + ค้นหา

   หมายเหตุ: ป๊อปอัพ "รายคน" (DaySellerDetail) และ "CRM" (CrmDayDetail) ยังแยกไว้เหมือนเดิม
   เพราะมีบล็อกเฉพาะทาง (คอมประมาณ / ฟอร์มบันทึกประจำวัน) — ใช้ DaySummaryBar ร่วมกันอยู่แล้ว
   ============================================================ */
import { useMemo, useState, useEffect } from 'react';
import { N, Icon, PersonAvatar } from './components.jsx';
import { OrderCard, daySummary, DaySummaryBar, isCodOrder } from './orderCard.jsx';
import { funnelTotal, funnelNewOld } from './lib/saleData.js';
import { isChatOrder } from './lib/saleFields.js';
import { baht } from './lib/saleDashboardHelpers.js';
import { channelColor } from './charts.jsx';
import { closeTone } from './lib/salePerfView.js';
import { addDays } from './lib/saleTime.js';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';

const isCancelledOrder = (o) => String(o.status || '').toLowerCase() === 'cancelled';
const sellerOf = (o) => String(o.salesperson || '').trim() || 'ไม่ระบุเซลล์';

/* เสียงลูกค้า (ถาม/ชม/ติ) จากหน้าคนทัก — ใช้ทั้ง popup ทั้งวัน และ popup รายคน */
export function VoiceCard({ voice, seller }) {
  const v = voice || {};
  const rows = [['ถามหา', v.ask], ['ชม', v.praise], ['ติ', v.complaint]].filter(([, t]) => String(t || '').trim());
  if (!rows.length) return null;
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--warn-soft)', borderLeft: '3px solid var(--warn)' }}>
      <div className="text-[12px] font-semibold mb-2 flex items-center gap-1.5 [&_svg]:size-[15px]" style={{ color: 'var(--warn)' }}><Icon name="chat" /> เสียงลูกค้า{seller ? ` — ${seller}` : ''}</div>
      <div className="flex flex-col gap-1.5 text-[13px]">
        {rows.map(([lb, t]) => <div key={lb}><span className="text-[11px] font-medium" style={{ color: 'var(--ink-4)' }}>{lb}: </span><span style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{String(t).trim()}</span></div>)}
      </div>
    </div>
  );
}

/* คนทักแบบ 4 ช่อง (ทักรวม/ใหม่/เก่า/%ปิด) — ย้ายมาจาก salePerf ให้ popup วันทุกตัวใช้ร่วมกัน
   %ปิด ใช้ค่าจาก daySummary() เสมอ = ออเดอร์ช่องแชท ÷ คนทัก (สูตรกลาง · ตัดมาร์เก็ตเพลส) */
export function LeadPanel({ total = 0, nw = 0, old = 0, close = null, title = 'คนทัก', compact = false }) {
  const tiles = [
    ['ทักรวม', N(total), 'var(--ink)'],
    ['ใหม่', N(nw), 'var(--good)'],
    ['เก่า', N(old), 'var(--ink-3)'],
    ['%ปิด', close == null ? '—' : close > 100 ? '100%+' : Math.round(close) + '%', close > 100 ? 'var(--warn)' : closeTone(close)],
  ];
  const pad = compact ? 'py-1 px-0.5' : 'py-1.5 px-1';
  const vsz = compact ? 'text-[13px]' : 'text-base';
  return (
    <div>
      {title && <div className="text-[11px] text-muted-foreground mb-1">{title}</div>}
      <div className={`grid grid-cols-4 ${compact ? 'gap-1' : 'gap-2'}`}>
        {tiles.map(([l, v, c]) => (
          <div key={l} className={`rounded-lg border ${pad} text-center`} style={{ borderColor: 'var(--line)' }}>
            <div className="text-[10px] text-muted-foreground leading-tight">{l}</div>
            <div className={`num font-bold leading-tight ${vsz}`} style={{ color: c }}>{v}</div>
          </div>
        ))}
      </div>
      {!total && <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">ยังไม่กรอกคนทัก — กรอกในหน้าส่งยอด</div>}
    </div>
  );
}

const TH_MON_S = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const fmtDayLabel = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return `${TH_DOW[d.getDay()]} ${d.getDate()} ${TH_MON_S[d.getMonth()]} ${d.getFullYear() + 543}`;
};

/* แถบเลื่อนวัน ◀ ▶ — เดิมต้องปิด popup แล้วกดวันใหม่ทุกครั้ง
   ขอบเขต = ช่วงวันที่มีข้อมูลใน popup นั้น (รายงานขาย = ช่วงที่กรอง · ประสิทธิภาพเซล = เดือนนั้น)
   รองรับปุ่มลูกศรซ้าย/ขวาบนคีย์บอร์ดด้วย (ข้ามให้เมื่อโฟกัสอยู่ในช่องกรอก) */
function DayNav({ dateISO, prevDay, nextDay, onGo, nOrders }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target;
      const tag = t && t.tagName ? t.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
      const to = e.key === 'ArrowLeft' ? prevDay : nextDay;
      if (to) { e.preventDefault(); onGo(to); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevDay, nextDay, onGo]);

  return (
    <div className="row" role="group" aria-label="เลื่อนวัน"
      style={{ position: 'sticky', top: -20, zIndex: 5, margin: '-20px -22px 0', padding: '10px 22px',
        gap: 8, alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface)', borderBottom: '1px solid var(--line)' }}>
      <Button variant="outline" size="sm" className="h-8 gap-1 shrink-0" disabled={!prevDay}
        onClick={() => prevDay && onGo(prevDay)} title={prevDay ? `ไปวันที่ ${fmtDayLabel(prevDay)} (ลูกศรซ้าย)` : 'ไม่มีข้อมูลก่อนหน้านี้'}>
        <Icon name="chevL" className="size-4" /><span className="max-sm:sr-only">ก่อนหน้า</span>
      </Button>
      <div className="min-w-0 text-center">
        <div className="truncate text-[13px] font-semibold" style={{ color: 'var(--ink)' }}>{fmtDayLabel(dateISO)}</div>
        <div className="cap" style={{ color: 'var(--ink-4)' }}>{nOrders ? `${N(nOrders)} ออเดอร์` : 'ไม่มีออเดอร์'}</div>
      </div>
      <Button variant="outline" size="sm" className="h-8 gap-1 shrink-0" disabled={!nextDay}
        onClick={() => nextDay && onGo(nextDay)} title={nextDay ? `ไปวันที่ ${fmtDayLabel(nextDay)} (ลูกศรขวา)` : 'ไม่มีข้อมูลหลังจากนี้'}>
        <span className="max-sm:sr-only">ถัดไป</span><Icon name="chevR" className="size-4" />
      </Button>
    </div>
  );
}

const chipStyle = (on) => ({ padding: '3px 10px', borderRadius: 999, border: `1px solid ${on ? 'var(--ink-2)' : 'var(--line)'}`, background: on ? 'var(--ink-2)' : 'var(--surface)', color: on ? 'var(--surface)' : 'var(--ink-3)', fontSize: 12, fontWeight: 600, cursor: 'pointer' });

/**
 * เนื้อใน popup รายละเอียดวัน (ครอบด้วย SideSheet จากฝั่งผู้เรียก)
 * @param dateISO   วันที่ 'YYYY-MM-DD'
 * @param orders    ออเดอร์ (ยังไม่กรองวัน · ตัดยกเลิกมาแล้วจาก compute แต่กรองซ้ำกันพลาด)
 * @param skus      รายการสินค้า (line items) ทั้งชุด
 * @param funnelRows แถวคนทักของ "วันนั้น" (ผู้เรียกกรองวันมาแล้ว หรือส่งทั้งชุดก็ได้ — กรองซ้ำให้)
 * @param show      เปิด/ปิดบล็อกเสริม { sellerTable, channelTable, voice } (ค่าเริ่มต้น = เปิดหมด)
 */
export function DayDetailSheet({ dateISO, orders, skus, funnelRows, onPickCustomer, onChangeDate, show = {}, scopeNote = null }) {
  const opt = { sellerTable: true, channelTable: true, voice: true, leadPanel: true, ...show };
  const [sortBy, setSortBy] = useState('sales');   // sales | no | seller
  const [payF, setPayF] = useState('all');         // all | transfer | cod
  const [sellerF, setSellerF] = useState('');      // '' = ทั้งหมด
  const [q, setQ] = useState('');                  // ค้นหา เลขที่/ลูกค้า (ใหม่ — เดิมไม่มีทั้ง 2 ตัว)

  // เปลี่ยนวัน (ปุ่ม ◀ ▶) → ล้างตัวกรองในตัว: เซลล์ที่เลือกไว้อาจไม่มีออเดอร์ในวันใหม่ = จอว่างงงๆ
  // ใช้รูปแบบ "ปรับ state ตอน render เมื่อ prop เปลี่ยน" ตามที่ React แนะนำ (ไม่ใช้ effect)
  const [lastDate, setLastDate] = useState(dateISO);
  if (lastDate !== dateISO) { setLastDate(dateISO); setSellerF(''); setPayF('all'); setQ(''); }

  const allDayOrds = useMemo(
    () => (orders || []).filter(o => o.order_date === dateISO && !isCancelledOrder(o)),
    [orders, dateISO]);
  const allDayFunnel = useMemo(
    () => (funnelRows || []).filter(f => !f.date || f.date === dateISO),
    [funnelRows, dateISO]);

  // กรองรายเซลล์ (มีผลทั้ง popup: สรุปวัน + ช่องทาง + เสียงลูกค้า + รายการออเดอร์)
  const dayOrds = useMemo(() => (sellerF ? allDayOrds.filter(o => sellerOf(o) === sellerF) : allDayOrds), [allDayOrds, sellerF]);
  const dayFunnel = useMemo(() => (sellerF ? allDayFunnel.filter(f => String(f.salesperson || '').trim() === sellerF) : allDayFunnel), [allDayFunnel, sellerF]);


  // ตารางคนทักรายคน (ทั้งวัน ไม่ขึ้นกับตัวกรอง) — ทัก/ใหม่ · ปิดได้ · %ปิด · ยอด · กดชื่อ = กรองทั้ง popup
  const perSeller = useMemo(() => {
    const m = new Map();
    const ensure = (name) => {
      const k = String(name || '').trim() || 'ไม่ระบุเซลล์';
      if (!m.has(k)) m.set(k, { name: k, leads: 0, nw: 0, old: 0, unknown: 0, chat: 0, orders: 0, sales: 0 });
      return m.get(k);
    };
    allDayFunnel.forEach(f => {
      const g = ensure(f.salesperson);
      g.leads += funnelTotal(f);
      const x = funnelNewOld(f); g.nw += x.new; g.old += x.old; g.unknown += x.unknown;
    });
    allDayOrds.forEach(o => {
      const g = ensure(o.salesperson);
      g.orders += 1; g.sales += Number(o.sales) || 0;
      if (isChatOrder(o)) g.chat += 1;
    });
    return [...m.values()]
      .map(g => ({ ...g, close: g.leads > 0 ? Math.round(g.chat / g.leads * 100) : null }))
      .sort((a, b) => b.sales - a.sales || b.leads - a.leads);
  }, [allDayFunnel, allDayOrds]);
  const totLeads = perSeller.reduce((a, r) => a + r.leads, 0);

  // ช่องทางของวัน (ตามตัวกรองเซลล์)
  const chans = useMemo(() => {
    const m = new Map();
    dayOrds.forEach(o => { const c = o.channel || 'ไม่ระบุ'; const g = m.get(c) || { orders: 0, sales: 0 }; g.orders += 1; g.sales += Number(o.sales) || 0; m.set(c, g); });
    return [...m.entries()].sort((a, b) => b[1].sales - a[1].sales);
  }, [dayOrds]);
  const chanTotal = chans.reduce((a, [, g]) => a + g.sales, 0);

  const skuBy = useMemo(() => {
    const noSet = new Set(dayOrds.map(o => o.order_no));
    const m = new Map();
    (skus || []).forEach(k => { if (!noSet.has(k.order_no)) return; const arr = m.get(k.order_no) || []; arr.push(k); m.set(k.order_no, arr); });
    return m;
  }, [skus, dayOrds]);

  const nCod = dayOrds.filter(isCodOrder).length;
  const nTransfer = dayOrds.filter(o => !isCodOrder(o) && o.payment_type === 'โอน').length;

  const shown = useMemo(() => {
    let r = dayOrds;
    if (payF === 'cod') r = r.filter(isCodOrder);
    else if (payF === 'transfer') r = r.filter(o => !isCodOrder(o) && o.payment_type === 'โอน');
    const needle = q.trim().toLowerCase();
    if (needle) r = r.filter(o => `${o.order_no || ''} ${o.customer_name || ''} ${o.salesperson || ''}`.toLowerCase().includes(needle));
    const by = {
      sales: (a, b) => (Number(b.sales) || 0) - (Number(a.sales) || 0),
      no: (a, b) => String(a.order_no).localeCompare(String(b.order_no)),
      seller: (a, b) => sellerOf(a).localeCompare(sellerOf(b)) || (Number(b.sales) || 0) - (Number(a.sales) || 0),
    };
    return [...r].sort(by[sortBy] || by.sales);
  }, [dayOrds, payF, sortBy, q]);

  // เสียงลูกค้าที่กรอกไว้วันนั้น (ตามตัวกรองเซลล์)
  const voices = useMemo(() => dayFunnel
    .map(f => ({ seller: String(f.salesperson || '').trim(), v: f.voice }))
    .filter(x => x.v && (x.v.ask || x.v.praise || x.v.complaint)), [dayFunnel]);

  const multiSeller = !sellerF && perSeller.length > 1;

  const sum = daySummary(dayOrds, dayFunnel);
  // คนทักของช่วงที่กำลังดู (ทั้งวัน หรือเฉพาะเซลล์ที่เลือก) แยกใหม่/เก่า
  const leadNO = useMemo(() => dayFunnel.reduce((a, f) => {
    const x = funnelNewOld(f);
    return { new: a.new + x.new, old: a.old + x.old, unknown: a.unknown + x.unknown };
  }, { new: 0, old: 0, unknown: 0 }), [dayFunnel]);

  // ขอบวันที่เลื่อนได้ = ช่วงที่มีข้อมูลจริงใน popup นี้ (กันเลื่อนออกนอกชุดข้อมูลที่โหลดมา)
  const bounds = useMemo(() => {
    let min = null, max = null;
    (orders || []).forEach(o => { const d = o.order_date; if (!d) return; if (!min || d < min) min = d; if (!max || d > max) max = d; });
    return { min, max };
  }, [orders]);
  const stepDay = (delta) => {
    if (!onChangeDate || !dateISO) return null;
    const next = addDays(dateISO, delta);
    if (bounds.min && next < bounds.min) return null;
    if (bounds.max && next > bounds.max) return null;
    return next;
  };
  const prevDay = stepDay(-1), nextDay = stepDay(1);

  return (
    <div className="flex flex-col gap-4">
      {onChangeDate && (prevDay || nextDay) && (
        <DayNav dateISO={dateISO} prevDay={prevDay} nextDay={nextDay} onGo={onChangeDate} nOrders={allDayOrds.length} />
      )}
      {/* scopeNote = บอกตรง ๆ ว่า popup นี้แคบกว่าที่กราฟข้างหลังแสดง
          (เซลล์กดแท่ง "ยอดทีม" แล้วเห็นเฉพาะออเดอร์ตัวเอง — ถ้าไม่บอก เลขจะดูขัดกันเอง) */}
      {scopeNote && (
        <div className="cap row" style={{ gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-3)' }}>
          <Icon name="info" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ lineHeight: 1.55 }}>{scopeNote}</span>
        </div>
      )}
      <DaySummaryBar s={sum} />

      {/* ---- คนทักแยกใหม่/เก่า (แบบเดียวกับ popup รายคน) — %ปิด ใช้สูตรกลางจาก daySummary ---- */}
      {opt.leadPanel && sum.leads > 0 && (
        <LeadPanel title={`คนทัก${sellerF ? ` · ${sellerF}` : 'วันนี้'} (แยกใหม่/เก่า)`}
          total={sum.leads} nw={leadNO.new} old={leadNO.old} close={sum.close} />
      )}

      {/* ---- คนทักรายคน — กดชื่อ = กรองทั้ง popup (แทนชิปเซลล์เดิมของ salePerf: ได้ตัวเลขครบกว่า) ---- */}
      {opt.sellerTable && perSeller.length > 0 && (
        <div>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
              คนทักรายคน <span className="font-normal" style={{ color: 'var(--ink-4)' }}>· {N(perSeller.length)} คน{totLeads > 0 ? ` · ทักรวม ${N(totLeads)}` : ''}</span>
            </div>
            {sellerF && <button type="button" onClick={() => setSellerF('')} style={chipStyle(false)}><Icon name="x" className="size-3" /> ดูทั้งหมด</button>}
          </div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--line)' }}>
            <div className="grid grid-cols-[minmax(0,1fr)_66px_66px_58px_84px] gap-2 px-3 py-1.5 bg-muted/40 cap" style={{ color: 'var(--ink-4)' }}>
              <span>เซลล์</span><span className="text-right">ทัก</span><span className="text-right">ปิดได้</span><span className="text-right">%ปิด</span><span className="text-right">ยอด</span>
            </div>
            <div className="divide-y">
              {perSeller.map(r => {
                const on = sellerF === r.name;
                return (
                  <button type="button" key={r.name} onClick={() => setSellerF(on ? '' : r.name)} aria-pressed={on}
                    className="w-full grid grid-cols-[minmax(0,1fr)_66px_66px_58px_84px] gap-2 items-center px-3 py-2 text-left transition-colors hover:bg-muted/30"
                    style={on ? { background: 'var(--accent-soft)' } : undefined} title={on ? 'กดอีกครั้งเพื่อดูทั้งหมด' : `ดูเฉพาะ ${r.name}`}>
                    <span className="row" style={{ gap: 8, alignItems: 'center', minWidth: 0 }}>
                      <PersonAvatar name={r.name} size={22} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: on ? 'var(--accent-2)' : 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                    </span>
                    <span className="num text-right" style={{ fontSize: 13, fontWeight: 700 }}>
                      {r.leads ? N(r.leads) : '—'}
                      {(r.nw + r.old) > 0 && <span className="cap" style={{ display: 'block', color: 'var(--ink-4)', fontWeight: 400 }}>ใหม่ {N(r.nw)}</span>}
                    </span>
                    <span className="num text-right" style={{ fontSize: 13 }}>{r.chat ? N(r.chat) : '—'}</span>
                    <span className="num text-right" style={{ fontSize: 13, fontWeight: 700, color: r.close == null ? 'var(--ink-4)' : r.close >= 15 ? 'var(--good)' : r.close >= 8 ? 'var(--warn)' : 'var(--bad)' }}>
                      {r.close == null ? '—' : r.close + '%'}
                    </span>
                    <span className="num text-right" style={{ fontSize: 13, fontWeight: 700 }}>{r.sales ? baht(r.sales) : '—'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---- ช่องทางของวัน (เดิมมีเฉพาะ popup ฝั่ง salePerf) ---- */}
      {opt.channelTable && chans.length > 0 && (
        <div>
          <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--ink)' }}>ช่องทาง{sellerF ? ` · ${sellerF}` : 'ของวันนี้'}</div>
          <div className="rounded-lg border overflow-hidden text-xs" style={{ borderColor: 'var(--line)' }}>
            <table className="w-full">
              <thead className="bg-muted/40 text-muted-foreground"><tr>
                <th className="text-left px-2 py-1 font-medium">ช่องทาง</th>
                <th className="text-right px-2 py-1 font-medium">ออเดอร์</th>
                <th className="text-right px-2 py-1 font-medium">ยอด</th>
                <th className="text-right px-2 py-1 font-medium">%</th>
              </tr></thead>
              <tbody>{chans.map(([c, m]) => (
                <tr key={c} className="border-t">
                  <td className="px-2 py-1"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full shrink-0" style={{ background: channelColor(c) }} />{c}</span></td>
                  <td className="px-2 py-1 text-right num">{N(m.orders)}</td>
                  <td className="px-2 py-1 text-right num font-semibold">{baht(m.sales)}</td>
                  <td className="px-2 py-1 text-right num text-muted-foreground">{chanTotal ? Math.round(m.sales / chanTotal * 100) : 0}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---- เสียงลูกค้า (เดิมมีเฉพาะฝั่ง salePerf — ตอนนี้รายงานขายก็เห็น) ---- */}
      {opt.voice && voices.length > 0 && (
        <div className="flex flex-col gap-2">
          {voices.map((x, i) => <VoiceCard key={x.seller + i} voice={x.v} seller={x.seller} />)}
        </div>
      )}

      {/* ---- รายการออเดอร์ + กรองโอน/COD + เรียง + ค้นหา ---- */}
      <div>
        <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            ออเดอร์{sellerF ? ` · ${sellerF}` : 'ทั้งวัน'} <span className="font-normal" style={{ color: 'var(--ink-4)' }}>· {N(shown.length)}{shown.length !== dayOrds.length ? ` จาก ${N(dayOrds.length)}` : ''} ใบ · แตะเพื่อดูรายการ</span>
          </div>
          {dayOrds.length > 1 && (
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {(nCod > 0 && nTransfer > 0) && [['all', `ทั้งหมด ${N(dayOrds.length)}`], ['transfer', `โอน ${N(nTransfer)}`], ['cod', `COD ${N(nCod)}`]].map(([k, l]) => (
                <button type="button" key={k} onClick={() => setPayF(k)} aria-pressed={payF === k} style={chipStyle(payF === k)}>{l}</button>
              ))}
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="เรียงลำดับ"
                style={{ ...chipStyle(false), paddingRight: 6 }}>
                <option value="sales">เรียง: ยอดมาก→น้อย</option>
                <option value="no">เรียง: เลขที่</option>
                <option value="seller">เรียง: เซลล์</option>
              </select>
            </div>
          )}
        </div>
        {/* ค้นหา — โผล่เมื่อออเดอร์เยอะพอที่จะไล่หายาก */}
        {dayOrds.length >= 8 && (
          <div style={{ marginBottom: 8 }}>
            <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา เลขที่ / ชื่อลูกค้า / เซลล์" className="h-8" />
          </div>
        )}
        {shown.length === 0
          ? <div className="rounded-lg border p-6 text-center text-sm" style={{ color: 'var(--ink-4)' }}>{dayOrds.length ? 'ไม่มีออเดอร์ตามตัวกรอง' : 'ไม่มีออเดอร์ในวันนี้'}</div>
          : <div className="flex flex-col gap-1.5">
              {shown.map((o, i) => <OrderCard key={(o.order_no || '') + '#' + i} o={o} lines={skuBy.get(o.order_no) || []} showSeller={multiSeller} onPickCustomer={onPickCustomer} collapsed hideDate />)}
            </div>}
      </div>
    </div>
  );
}
