/** @vitest-environment jsdom */
/* smoke test — กราฟ "ยอดขายรายวัน" (DailySalesChart + OverviewTab) ต้อง render SVG จริง ไม่ crash
   (recharts ต้องการขนาด container → stub getBoundingClientRect ให้มีพื้นที่) */
import { describe, it, expect, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.getBoundingClientRect = () => ({ width: 800, height: 260, top: 0, left: 0, right: 800, bottom: 260, x: 0, y: 0, toJSON() {} });
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 260 });
import { DailySalesChart } from '../charts.jsx';
import { OverviewTab } from '../saleDashboardTabs.jsx';

const render = (el) => {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const root = createRoot(div);
  act(() => root.render(el));
  const html = div.innerHTML;
  act(() => root.unmount());
  div.remove();
  return html;
};

const labels = ['1 ส.ค.', '2 ส.ค.', '3 ส.ค.'];
const datasets = [
  { label: 'Facebook', data: [1000, 2500, 800], color: '#4a8be0' },
  { label: 'LINE', data: [500, 0, 1200], color: '#06c755' },
];

describe('DailySalesChart', () => {
  it('render แท่งซ้อน + เส้นอ้างอิง เป็น SVG จริง', () => {
    const html = render(<DailySalesChart labels={labels} tipLabels={labels} orders={[3, 5, 2]} datasets={datasets} refValue={1500} fmt={(v) => '฿' + v} onBarClick={() => {}} />);
    expect(html).toContain('<svg');
    expect(html).toContain('recharts-bar');
    expect(html).toContain('class="recharts-layer recharts-reference-line"');
  });
  it('ไม่มีเส้นอ้างอิงเมื่อ refValue = null', () => {
    const html = render(<DailySalesChart labels={labels} datasets={datasets} refValue={null} />);
    expect(html).toContain('recharts-bar');
    expect(html).not.toContain('class="recharts-layer recharts-reference-line"');
  });
});

describe('OverviewTab — การ์ดยอดขายรายวัน', () => {
  const A = {
    byChannel: [{ key: 'Facebook', sales: 4300 }, { key: 'LINE', sales: 1700 }],
    byDesign: [], byColor: [], byPayment: [], byJobType: [], byType: [], byQtyBand: [], bySize: [], byProvince: [], bySalesperson: [],
    _ords: [], _skus: [], kpi: { sales: 6000, orders: 3 },
  };
  const tc = { keys: ['2026-08-01', '2026-08-02', '2026-08-03'], labels, tipLabels: labels, orders: [3, 5, 2], datasets, best: { key: '2026-08-02', sales: 2500, label: '2 ส.ค.' }, ref: 1500 };
  it('render หัว + ป้ายขายดีสุด + legend ชิป · คลิกชิป = กรองช่องทาง', () => {
    const toggleFilter = vi.fn();
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    act(() => root.render(<OverviewTab ctx={{ A, prevA: null, cmp: true, trendByChannel: tc, gran: 'day', curLabel: 'สิงหาคม', prevLabel: 'กรกฎาคม', toggleFilter, setDayPay: () => {} }} />));
    const html = div.innerHTML;
    expect(html).toContain('ยอดขายรายวัน');
    expect(html).toContain('ขายดีสุด');
    expect(html).toContain('2 ส.ค.');
    expect(html).toContain('เฉลี่ย/วัน กรกฎาคม');
    const chip = [...div.querySelectorAll('button')].find(b => b.textContent.includes('LINE'));
    expect(chip).toBeTruthy();
    act(() => chip.click());
    expect(toggleFilter).toHaveBeenCalledWith('channel', 'LINE');
    act(() => root.unmount()); div.remove();
  });
});

describe('ProductsBlock — ลายขายดี + สัดส่วน', () => {
  it('render ตารางลาย (80/20 + vs ช่วงก่อน + สีขายดี) และแถบสัดส่วน · กดลาย = กรอง', async () => {
    const { ProductsBlock } = await import('../saleDashboardTabs.jsx');
    const { compute } = await import('../lib/saleAgg.js');
    const f = { from: '2026-08-01', to: '2026-08-31', channel: [], design: [], type: [], size: [], color: [], province: [], salesperson: [], job_type: [], payment_type: [], customer_type: [], qty_band: [], product_code: [], source: [] };
    const ords = [
      { order_no: 'a', order_date: '2026-08-02', channel: 'Facebook', sales: 9000, qty: 3, status: 'confirmed', payment_type: 'โอน', job_type: 'ปลีก', source: 'shipnity' },
      { order_no: 'b', order_date: '2026-08-03', channel: 'LINE', sales: 1200, qty: 1, status: 'confirmed', payment_type: 'COD', job_type: 'DFT', source: 'shipnity' },
    ];
    const skus = [
      { order_no: 'a', order_date: '2026-08-02', design: 'สิริกานต์', color: 'ดำ', size: 'L', qty: 3, line_sales: 9000, product_code: 'JSK101' },
      { order_no: 'b', order_date: '2026-08-03', design: 'ชบา', color: 'ขาว', size: 'M', qty: 1, line_sales: 1200, product_code: 'JSK102' },
    ];
    const A = compute(ords, skus, f);
    const prevA = compute([{ ...ords[0], order_no: 'p', order_date: '2026-07-05', sales: 6000 }], [{ ...skus[0], order_no: 'p', order_date: '2026-07-05', line_sales: 6000 }], { ...f, from: '2026-07-01', to: '2026-07-31' });
    const toggleFilter = vi.fn();
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    act(() => root.render(<ProductsBlock A={A} prevA={prevA} cmp={true} prevLabel="กรกฎาคม" toggleFilter={toggleFilter} />));
    const html = div.innerHTML;
    expect(html).toContain('ลายขายดี');
    expect(html).toContain('สิริกานต์');
    expect(html).toContain('+50%');          // 9000 vs 6000 (ฐาน ≥ 5k → โชว์ %)
    expect(html).toContain('ใหม่');           // ชบา ไม่มีในเดือนก่อน
    expect(html).toContain('ประเภทงาน');
    expect(html).toContain('สีขายดี');
    const cell = [...div.querySelectorAll('td')].find(td => td.textContent === 'สิริกานต์');
    act(() => cell.click());
    expect(toggleFilter).toHaveBeenCalledWith('design', 'สิริกานต์');
    act(() => root.unmount()); div.remove();
  });
});

describe('TargetGauge — จังหวะทำยอด (เกจโซน)', () => {
  it('คำนวณ pace/สถานะ/ต้องเฉลี่ยต่อวัน/run rate ถูก และ render เกจ', async () => {
    const { TargetGauge } = await import('../saleDashboardMerged.jsx');
    const mt = { has: true, isCur: true, dim: 31, passed: 22, target: 1000000, sales: 437062, orders: 954, chT: { Facebook: 480000 }, chSales: { Facebook: 224111 }, ad: 98000, adBudget: 161000, label: 'ส.ค. 2569' };
    const html = render(<TargetGauge mt={mt} />);
    expect(html).toContain('จังหวะทำยอด');
    expect(html).toContain('ใกล้เป้า');                 // 437,062 / 709,677 = 62% → โซนเหลือง (60–100%)
    expect(html).toContain('>62%<');
    expect(html).toContain('฿709,677');                 // เป้า pace
    expect(html).toContain('฿62,549');                  // ต้องเฉลี่ย/วัน = (1,000,000 − 437,062) / 9
    expect(html).toContain('฿615,860');                 // run rate = 437,062 / 22 × 31
    expect(html).toContain('<svg');
  });
  it('ไม่มีเป้า → ชวนไปตั้งค่า', async () => {
    const { TargetGauge } = await import('../saleDashboardMerged.jsx');
    const html = render(<TargetGauge mt={{ has: true, isCur: true, dim: 31, passed: 22, target: 0, sales: 1, orders: 1, chT: {}, chSales: {}, ad: 0, adBudget: 0, label: 'ส.ค. 2569' }} />);
    expect(html).toContain('ยังไม่ตั้งเป้าเดือน');
  });
});

describe('ChannelTargetGrid — เป้ารายช่องทาง (เกจเล็ก + แอดใช้ไป/เหลือ)', () => {
  it('render การ์ดเฉพาะช่องที่มีเป้า/งบแอด · คำนวณ %เป้า · เหลือ · ROAS', async () => {
    const { ChannelTargetGrid } = await import('../saleDashboardMerged.jsx');
    const mt = { has: true, isCur: true, dim: 31, passed: 22, label: 'ส.ค. 2569', chT: { Facebook: 480000, LINE: 60000 }, chSales: { Facebook: 224111, LINE: 52000, Phone: 9000 }, chAd: { Facebook: 98000 }, chAdBudget: { Facebook: 120000 } };
    const html = render(<ChannelTargetGrid mt={mt} onPick={() => {}} />);
    expect(html).toContain('Facebook');
    expect(html).toContain('LINE');
    expect(html).toContain('Phone');                 // ไม่มีเป้า/งบ ก็ต้องมีการ์ด (โชว์ยอด + ยังไม่ตั้งเป้า)
    expect(html).toContain('ยังไม่ตั้งเป้า');
    expect(html).not.toContain('Lazada');            // 0 ทุกอย่างทั้งเดือน → ไม่โชว์
    expect(html).toContain('>47%<');                 // 224,111 / 480,000
    expect(html).toContain('ใกล้เป้า');              // 47% อยู่ระหว่าง 60%×71%=43% กับ 71% → เหลือง
    expect(html).toContain('ตามเป้า');               // LINE 87% ≥ 71%
    expect(html).toContain('฿22.0k');                // แอดเหลือ 120k − 98k
    expect(html).toContain('฿98.0k');                // แอดใช้ไป (เลขย่อ)
    expect(html).toContain('ROAS 2.3x');
  });
});

describe('CumulativeCompare + DailySalesChart เส้นออเดอร์/วันหยุด', () => {
  it('กราฟสะสม: render 2 เส้น (ช่วงนี้/ช่วงก่อน) + เส้นวันนี้ · prev ยาวกว่า cur ได้', async () => {
    const { CumulativeCompare } = await import('../charts.jsx');
    const html = render(<CumulativeCompare cur={[100, 200, 300]} prev={[80, 90, 100, 110, 120]} labels={['1', '2', '3', '4', '5']} curLabel="ส.ค." prevLabel="ก.ค." todayIdx={2} fmt={(v) => '฿' + v} />);
    expect(html).toContain('<svg');
    expect((html.match(/recharts-area-curve/g) || []).length).toBeGreaterThanOrEqual(2);   // cur + prev
    expect(html).toContain('class="recharts-layer recharts-reference-line"');               // เส้นวันนี้
  });
  it('กราฟรายวัน: มีเส้นออเดอร์ (แกนขวา) + แรเงาวันหยุด', () => {
    const html = render(<DailySalesChart labels={labels} tipLabels={labels} orders={[3, 5, 2]} weekend={[false, true, true]} datasets={datasets} refValue={null} />);
    expect(html).toContain('recharts-line');                 // เส้นออเดอร์
    expect(html).toContain('ออเดอร์');                        // ป้ายแกนขวา
    expect((html.match(/recharts-reference-area/g) || []).length).toBeGreaterThanOrEqual(2); // แรเงา 2 วัน
  });
});

describe('FunnelTab — คนทัก & ปิดการขาย (รื้อใหม่)', () => {
  it('render KPI 8 ใบ + กราฟ + ช่องทาง/เซลล์ · %ปิดใช้ออเดอร์ช่องแชท · เตือนกรอกไม่ครบ', async () => {
    const { FunnelTab } = await import('../saleDashboardTabs.jsx');
    const { compute } = await import('../lib/saleAgg.js');
    const { channelTable, manualEntryAgg } = await import('../lib/salesOverviewAgg.js');
    const f = { from: '2026-08-01', to: '2026-08-03', channel: [], design: [], type: [], size: [], color: [], province: [], salesperson: [], job_type: [], payment_type: [], customer_type: [], qty_band: [], product_code: [], source: [] };
    const ords = [
      { order_no: 'a', order_date: '2026-08-01', channel: 'Facebook', sales: 1000, qty: 1, status: 'confirmed', salesperson: 'FAH', customer_type: 'ลูกค้าใหม่', source: 'shipnity' },
      { order_no: 'b', order_date: '2026-08-02', channel: 'Facebook', sales: 1500, qty: 1, status: 'confirmed', salesperson: 'FAH', customer_type: 'ลูกค้าเก่า', source: 'shipnity' },
      { order_no: 'c', order_date: '2026-08-02', channel: 'Shopee', sales: 900, qty: 1, status: 'confirmed', salesperson: 'FAH', source: 'shipnity' },   // มาร์เก็ตเพลส — ไม่นับเป็น "ปิด"
      { order_no: 'd', order_date: '2026-08-03', channel: 'Phone', sales: 700, qty: 1, status: 'confirmed', salesperson: 'PAI', source: 'shipnity' },    // PAI ไม่กรอกคนทัก
    ];
    const funnel = [
      { salesperson: 'FAH', date: '2026-08-01', leads: { Facebook: { new: 6, old: 4 } } },
      { salesperson: 'FAH', date: '2026-08-02', leads: { Facebook: { new: 5, old: 5 } } },
    ];
    const A = compute(ords, [], f);
    const manualAgg = manualEntryAgg([{ date: '2026-08-01', channels: { Facebook: { ad: 400 } }, ad_spend: 400, avg_reply_minutes: 3 }]);
    const mergedTable = channelTable(A._ords, funnel, manualAgg, new Set());
    const html = render(<FunnelTab ctx={{ A, prevA: null, f, funnel, range: { from: '2026-08-01', to: '2026-08-03' }, prevRange: null, gran: 'day', cmp: false, curLabel: 'สิงหาคม', prevLabel: 'กรกฎาคม', mergedTable, manualAgg, toggleFilter: () => {}, setDayPay: () => {} }} />);
    expect(html).toContain('คนทัก');
    expect(html).toContain('>20<');                   // คนทักรวม 20
    expect(html).toContain('>2<');                    // ปิดได้ = 2 (เฉพาะ Facebook ของ FAH · ไม่นับ Shopee · ไม่นับ PAI ที่ไม่มีคนทัก)
    expect(html).toContain('10%');                    // 2/20
    expect(html).toContain('฿20');                    // CPI 400/20
    expect(html).toContain('3 นาที');
    expect(html).toContain('ช่องทางคนทัก');
    expect(html).toContain('ต่อเซลล์');
    expect(html).toContain('กรอก 2/3 วัน');           // FAH กรอก 2 จาก 3 วัน → ขาด 1
    expect(html).toContain('คนทักตามวันในสัปดาห์');
  });
});

describe('crmBlocks — customerStats / CustomerHero / ContactCards / CohortMatrix / CustomerTable / crmNotesSummary', () => {
  it('customerStats คำนวณ ลูกค้า/ซื้อซ้ำ/ขั้นวงจร · CustomerHero เกจ+ขั้น · ContactCards · cohort · CustomerTable คลิก', async () => {
    const { customerStats, CustomerHero, ContactCards, cohortRetention, CohortMatrix, CustomerTable, crmNotesSummary } = await import('../crmBlocks.jsx');
    const ords = [
      { order_no: 'a', order_date: '2026-08-01', customer_code: 'C1', customer_name: 'สมชาย', customer_phone: '0811111111', customer_type: 'ลูกค้าใหม่', sales: 1000, status: 'confirmed' },
      { order_no: 'b', order_date: '2026-08-10', customer_code: 'C1', customer_name: 'สมชาย', customer_phone: '0811111111', customer_type: 'ลูกค้าเก่า', sales: 1500, status: 'confirmed' },
      { order_no: 'c', order_date: '2026-08-05', customer_code: 'C2', customer_name: 'สมหญิง', customer_type: 'ลูกค้าใหม่', sales: 700, status: 'confirmed' },
      { order_no: 'd', order_date: '2026-08-06', customer_code: 'C3', customer_type: 'ลูกค้าใหม่', sales: 900, status: 'cancelled' },   // ยกเลิก — ไม่นับ
    ];
    const st = customerStats(ords, '2026-08-22');
    expect(st.customers).toBe(2);
    expect(st.repeatC).toBe(1);            // C1 ซื้อ 2 ครั้ง
    expect(Math.round(st.repeatPct)).toBe(50);
    expect(st.contactable).toBe(1);        // C1 มีเบอร์
    expect(st.stages['ซื้อซ้ำ'].count).toBe(1); expect(st.stages['ใหม่'].count).toBe(1);   // C1 ซื้อ 2 ครั้ง · C2 ซื้อครั้งแรก 17 วันก่อน
    const html = render(<CustomerHero cur={st} prev={customerStats([ords[0]], '2026-07-31')} cmp prevLabel="ก.ค." label="ส.ค." onStage={() => {}} />);
    expect(html).toContain('ลูกค้าที่ซื้อ');
    expect(html).toContain('อัตราซื้อซ้ำ');
    expect(html).toContain('ถึงเป้าซื้อซ้ำ');   // 50% ≥ 35%
    expect(html).toContain('วงจรชีวิตลูกค้า');
    // ContactCards: ลูกค้าเสี่ยงหลุด (ซื้อ 2 ครั้ง เงียบ 40 วัน)
    const risky = customerStats([{ order_no: 'x', order_date: '2026-06-01', customer_code: 'R1', customer_name: 'เสี่ยง', customer_phone: '0899999999', sales: 2000, status: 'confirmed' }, { order_no: 'y', order_date: '2026-07-13', customer_code: 'R1', customer_name: 'เสี่ยง', sales: 1000, status: 'confirmed' }], '2026-08-22');
    const ch = render(<ContactCards rows={risky.rows} phones={risky.phones} onPick={() => {}} />);
    expect(ch).toContain('เสี่ยง'); expect(ch).toContain('เงียบ 40 วัน'); expect(ch).toContain('0899999999');
    // cohort: ลูกค้าใหม่ มิ.ย. 1 คน กลับมา ก.ค. → M+1 = 100%
    const co = cohortRetention([{ order_date: '2026-06-01', customer_code: 'R1' }, { order_date: '2026-07-13', customer_code: 'R1' }, { order_date: '2026-07-20', customer_code: 'R2' }], { asOfYm: '2026-08', months: 3 });
    expect(co.map(r => r.ym)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(co[0].size).toBe(1); expect(Math.round(co[0].cells[0].pct)).toBe(100); expect(co[0].cells[2]).toBeNull();   // M+3 = ก.ย. ยังไม่ถึง
    expect(co[1].size).toBe(1); expect(co[1].cells[0].n).toBe(0);
    expect(render(<CohortMatrix rows={co} />)).toContain('100%');
    const toggle = vi.fn();
    const div = document.createElement('div'); document.body.appendChild(div);
    const root = createRoot(div);
    act(() => root.render(<CustomerTable rows={st.rows} phones={st.phones} onPick={toggle} />));
    expect(div.innerHTML).toContain('สมชาย');
    const row = [...div.querySelectorAll('tr')].find(tr => tr.textContent.includes('สมหญิง'));
    act(() => row.click());
    expect(toggle).toHaveBeenCalled();
    act(() => root.unmount()); div.remove();
    const sum = crmNotesSummary([{ salesperson: 'FAH', date: '2026-08-01', data: { calls: { d0: { total: 4, answered: 3 }, d5: { total: 1, answered: 1 }, rep: { total: 0, answered: 0 } }, upsellOrders: 1, upsellBaht: 500 } }]);
    expect(sum.total).toBe(5); expect(sum.ansPct).toBe(80); expect(sum.upB).toBe(500); expect(sum.has).toBe(true);
  });
});
