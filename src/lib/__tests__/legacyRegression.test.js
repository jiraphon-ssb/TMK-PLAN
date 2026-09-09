/* ============================================================
   Regression: ยุคใหม่ (ตั้งแต่ 1 ส.ค. 69) ต้องไม่เปลี่ยนจากการแก้ยุคเก่า
   ============================================================ */
import { describe, it, expect } from 'vitest';
import { channelTable, manualEntryAgg } from '../salesOverviewAgg.js';

const ord = (o) => ({ status: 'confirmed', qty: 1, source: 'shipnity', ...o });

describe('ยุคใหม่ไม่กระทบ', () => {
  it('แถว daily ยุคใหม่ที่มี ord/inq ค้าง ต้องไม่ถูกนับ', () => {
    const daily = [{ date: '2026-08-10', channels: { Facebook: { ad: 500, rev: 0, ord: 99, inq: 999 } } }];
    const orders = [ord({ channel: 'Facebook', order_date: '2026-08-10', sales: 1000, salesperson: 'FAH' })];
    const funnel = [{ salesperson: 'FAH', date: '2026-08-10', leads: { Facebook: { new: 10, old: 5 } } }];
    const { rows, total } = channelTable(orders, funnel, manualEntryAgg(daily), new Set(), { from: '2026-08-01', to: '2026-08-31' });
    const fb = rows.find(r => r.ch === 'Facebook');
    expect(fb.orders).toBe(1);       // ไม่บวก 99
    expect(fb.leads).toBe(15);       // ไม่บวก 999
    expect(total.sales).toBe(1000);
    expect(fb.ad).toBe(500);         // ค่าแอดยังอ่านได้ตามเดิม
  });

  it('ยอด mp กรอกมือยุคใหม่ยังทำงานเหมือนเดิม (import ชนะรายวัน)', () => {
    const daily = [{ date: '2026-08-10', channels: { Shopee: { rev: 5000 } } }];
    const noImport = channelTable([], [], manualEntryAgg(daily), new Set(), { from: '2026-08-01', to: '2026-08-31' });
    expect(noImport.total.sales).toBe(5000);
    const withImport = channelTable(
      [ord({ channel: 'Shopee', order_date: '2026-08-10', source: 'shopee', sales: 3000 })],
      [], manualEntryAgg(daily), new Set(), { from: '2026-08-01', to: '2026-08-31' });
    expect(withImport.total.sales).toBe(3000);   // มี import แล้วยึด import
  });

  it('ช่องทาง crm ยุคใหม่ (key ตัวใหญ่ Phone) ไม่ซ้ำกับ legacy crm', () => {
    const daily = [{ date: '2026-06-10', channels: { Phone: { rev: 100 }, crm: { rev: 900 } } }];
    const { rows } = channelTable([], [], manualEntryAgg(daily), new Set(), { from: '2026-06-01', to: '2026-06-30' });
    expect(rows.find(r => r.ch === 'Phone').sales).toBe(100);   // key ใหม่ชนะ ไม่บวก 900 ซ้ำ
  });
});
