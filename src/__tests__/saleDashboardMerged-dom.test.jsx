/** @vitest-environment jsdom */
/* smoke test — component ใหม่ PART 103 (merged) ต้อง render ได้จริงด้วยข้อมูลจริงรูปเดียวกับ prod
   (จับ crash ชนิดที่ build/lint มองไม่เห็น เช่น undefined ใน JSX path) */
import { describe, it, expect } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { MergedChannelTable, AdsTab, CustomerExtras, NotesStrip } from '../saleDashboardMerged.jsx';
import { DailyPaymentTable } from '../saleDashboardTabs.jsx';
import { channelTable, customerInsight, customerSeries, manualEntryAgg } from '../lib/salesOverviewAgg.js';

const orders = [
  { order_no: 'A1', channel: 'Facebook', sales: 1000, qty: 2, status: 'confirmed', order_date: '2026-09-05', salesperson: 'FAH', customer_type: 'ลูกค้าใหม่', customer_code: 'C1', payment_type: 'โอน', source: 'shipnity' },
  { order_no: 'A2', channel: 'LINE', sales: 500, qty: 1, status: 'confirmed', order_date: '2026-09-06', salesperson: 'FAH', customer_type: 'ลูกค้าเก่า', customer_code: 'C1', payment_type: 'COD', cod_amount: 500, source: 'shipnity' },
  { order_no: 'A3', channel: 'Phone', sales: 700, qty: 1, status: 'cancelled', order_date: '2026-09-06', salesperson: 'PAI', customer_code: 'C2', source: 'shipnity' },
];
const funnel = [{ salesperson: 'FAH', date: '2026-09-05', leads: { Facebook: { new: 5, old: 3 } } }];
const daily = [{ date: '2026-09-05', channels: { Facebook: { ad: 300 }, Shopee: { rev: 450 } }, ad_spend: 300, avg_reply_minutes: 4, note: 'ไลฟ์เย็น 1 รอบ' }];

const render = (el) => {
  const div = document.createElement('div');
  const root = createRoot(div);
  act(() => root.render(el));
  const html = div.innerHTML;
  act(() => root.unmount());
  return html;
};

describe('PART 103 merged components render จริง', () => {
  const manual = manualEntryAgg(daily);
  const table = channelTable(orders, funnel, manual, new Set(['FAH']));

  it('MergedChannelTable + แถว CRM', () => {
    const html = render(<MergedChannelTable table={table} />);
    expect(html).toContain('Facebook');
    expect(html).toContain('CRM');
  });

  it('DailyPaymentTable (โอน/COD) + maxHeight', () => {
    const html = render(<DailyPaymentTable orders={orders} onDayClick={() => {}} maxHeight={400} />);
    expect(html).toContain('โอน');
    expect(html).toContain('COD');
  });

  it('AdsTab (รื้อใหม่): KPI + กราฟ + แถวช่องทาง + โน้ต', () => {
    const html = render(<AdsTab table={table} dailyRows={daily} range={{ from: '2026-09-01', to: '2026-09-07' }} gran="day" cmp={false} curLabel="กันยายน" prevLabel="สิงหาคม" ords={orders} replyMins={manual.replyMins} notes={manual.notes} />);
    expect(html).toContain('ค่าแอดรวม');
    expect(html).toContain('ROAS');
    expect(html).toContain('Facebook');
    expect(html).toContain('ต่อช่องทาง');
    expect(html).toContain('โน้ตประจำวัน');
    expect(html).not.toContain('แคมเปญ');       // user ยังไม่เอาแคมเปญมาแสดง
  });

  /* PART 107 — เงินต้องไม่หาย/ไม่เกินบนหน้าจอจริง */
  it('ยอด Shopee ที่กรอกมือขึ้นในตารางช่องทาง (ไม่หาย)', () => {
    const html = render(<MergedChannelTable table={table} />);
    expect(html).toContain('Shopee');
    expect(table.rows.find(r => r.ch === 'Shopee').sales).toBe(450);
    expect(table.total.sales).toBe(1950);   // 1,000 + 500 + 450 (ยกเลิก 700 ไม่นับ)
  });

  it('ค่าแอดที่กรอกไม่ระบุช่องทาง → ขึ้นแถบเตือนในแท็บโฆษณา', () => {
    const legacyDaily = [{ date: '2026-09-05', ad_spend: 800 }];   // ไม่มี channels → ไม่รู้ว่าช่องไหน
    const t2 = channelTable(orders, funnel, manualEntryAgg(legacyDaily), new Set());
    expect(t2.unassignedAd).toBe(800);
    const html = render(<AdsTab table={t2} dailyRows={legacyDaily} range={{ from: '2026-09-01', to: '2026-09-07' }} gran="day" cmp={false} curLabel="กันยายน" prevLabel="สิงหาคม" ords={orders} notes={[]} />);
    expect(html).toContain('ไม่ระบุช่องทาง');
  });

  it('CustomerExtras + series ซื้อซ้ำ', () => {
    const insight = customerInsight(orders);
    const buckets = ['2026-09-05', '2026-09-06'];
    const series = { labels: ['5', '6'], rows: customerSeries(orders, buckets, (d) => d) };
    const html = render(<CustomerExtras insight={insight} series={series} />);
    expect(html).toContain('ซื้อซ้ำ');
  });

  it('NotesStrip', () => {
    const html = render(<NotesStrip notes={manual.notes} />);
    expect(html).toContain('ไลฟ์เย็น');
  });
});
