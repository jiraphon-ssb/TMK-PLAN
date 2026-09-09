// ============================================================
// env ขาด (VITE_SUPABASE_*) ต้อง "บอกว่าอ่านไม่ได้" ไม่ใช่จอขาว
// ============================================================
// supabaseClient.js ตั้งใจไว้ว่า "ไม่ throw กันแอปทั้งตัวล่มถ้า env หลุดชั่วคราวบน prod"
// แต่ของจริง supabase = null แล้ว saleData เรียก supabase.from() → TypeError → หน้าแรกจอขาว
// แทนที่จะขึ้นแถบ "อ่านยอดขายไม่สำเร็จ" ที่ทำไว้แล้ว
// เจอตอน CI แดง 9 ก.ย. 69 (CI ไม่มี .env = สภาพเดียวกับ deploy ที่ตั้ง env ไม่ครบ)
// ============================================================
import { describe, it, expect, vi } from 'vitest';

vi.mock('../supabaseClient.js', () => ({
  supabase: null,                 // เหมือนของจริงเป๊ะเมื่อ env ขาด
  isSupabaseConfigured: false,
}));

const { cachedFetchRange, cachedFetchAll, getDateBounds, fetchOrdersByNos } = await import('../saleData.js');

describe('saleData เมื่อยังไม่ได้ตั้งค่าฐานข้อมูล', () => {
  it('⛔ cachedFetchRange ต้องคืน error ไม่ใช่ throw', async () => {
    const r = await cachedFetchRange('tmk_mp_orders', 'order_no', '2026-09-01', '2026-09-30');
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
    expect(r.error.code).toBe('NO_SUPABASE_CONFIG');
  });

  it('⛔ cachedFetchAll ต้องคืน error ไม่ใช่ throw', async () => {
    const r = await cachedFetchAll('tmk_order_overrides', '*');
    expect(r.error?.code).toBe('NO_SUPABASE_CONFIG');
  });

  it('getDateBounds คืน min/max = null (ไม่รู้) ไม่ throw', async () => {
    await expect(getDateBounds('tmk_mp_orders')).resolves.toEqual({ min: null, max: null });
  });

  it('fetchOrdersByNos คืน [] ไม่ throw', async () => {
    await expect(fetchOrdersByNos('tmk_mp_orders', '*', ['L1'])).resolves.toEqual([]);
  });

  it('ข้อความ error ต้องบอกสาเหตุจริง (คนอ่าน log แล้วรู้ว่าต้องตั้ง env)', async () => {
    const r = await cachedFetchRange('tmk_mp_orders', '*', '2026-09-01', '2026-09-30');
    expect(r.error.message).toMatch(/VITE_SUPABASE/);
  });
});
