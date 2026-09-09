/* ============================================================
   mapToTMKMemo.test.js — memo ต่อ "ส่วน" ใน mapToTMK
   ============================================================
   สัญญาที่ต้องถือให้ได้:
   1) input reference เดิม → คืน "ตัวเดิม" (ข้ามการ map ซ้ำ = ที่มาของความเร็ว)
   2) input reference ใหม่ → คำนวณใหม่ ค่าถูกต้องเสมอ (ห้ามคืนของเก่าค้าง = บั๊กข้อมูลผิด)
   3) ตารางอื่นเปลี่ยน ต้องไม่ทำให้ส่วนที่ไม่เกี่ยวถูกคำนวณใหม่
   4) clearMapMemo() ล้างแคชได้จริง (ใช้ตอน logout — กันข้อมูลข้าม user)
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
import { mapToTMK, clearMapMemo } from '../mapToTMK.js';

const baseRaw = () => ({
  settings: {}, channels: [], campaigns: [], tasks: [], brands: [], flows: [],
  products: [], audit: [], roles: [], staff: [], duties: [], daily: [],
  adCamps: [], segments: [], fbMetrics: {}, monthly: [], colorMix: [], sizeMix: [],
  customers: [], orders: [], customerTotals: [], commentCounts: [],
});

const brand = (id, name) => ({ id, name, color: '#000', sort_order: 0 });   // brands = memoSection แท้ (deps เดียว) ใช้พิสูจน์สัญญา memo
const task = (id, title, camp = '') => ({ id, title, date: '2026-08-11', responsible: '', camp, status: 'todo' });

describe('mapToTMK — memo ต่อส่วน', () => {
  beforeEach(() => clearMapMemo());

  it('reference เดิม → คืน array ตัวเดิม (ข้าม map ซ้ำ)', () => {
    const raw = baseRaw();
    raw.brands = [brand('b1', 'TEAMDEE')];
    const a = mapToTMK(raw);
    const b = mapToTMK(raw);
    expect(b.brands).toBe(a.brands); // ตัวเดิมจริงๆ ไม่ใช่แค่ค่าเท่ากัน
    expect(b.tasks).toBe(a.tasks);
  });

  it('reference ใหม่ → คำนวณใหม่ ได้ค่าที่ถูกต้อง (ไม่คืนของเก่าค้าง)', () => {
    const raw = baseRaw();
    raw.brands = [brand('b1', 'TEAMDEE')];
    const a = mapToTMK(raw);
    expect(a.brands.map(x => x.name)).toEqual(['TEAMDEE']);

    // จำลอง refreshTables: แทนเฉพาะ array ของตารางที่ดึงใหม่
    raw.brands = [brand('b1', 'TEAMDEE'), brand('b2', 'JK')];
    const b = mapToTMK(raw);
    expect(b.brands).not.toBe(a.brands);
    expect(b.brands.map(x => x.name)).toEqual(['TEAMDEE', 'JK']);
  });

  it('ตารางอื่นเปลี่ยน → ส่วนที่ไม่เกี่ยวยังเป็นตัวเดิม', () => {
    const raw = baseRaw();
    raw.brands = [brand('b1', 'TEAMDEE')];
    raw.tasks = [task('t1', 'งาน 1')];
    const a = mapToTMK(raw);

    raw.tasks = [task('t1', 'งาน 1'), task('t2', 'งาน 2')]; // เปลี่ยนแค่ tasks
    const b = mapToTMK(raw);

    expect(b.brands).toBe(a.brands);         // ทีมไม่ถูก map ใหม่
    expect(b.tasks).not.toBe(a.tasks);     // งานถูก map ใหม่
    expect(b.tasks).toHaveLength(2);
  });

  it('campaigns ขึ้นกับ tasks ด้วย — tasks เปลี่ยน จำนวนงานต่อแคมเปญต้องอัปเดต', () => {
    const raw = baseRaw();
    raw.campaigns = [{ id: 'c1', name: 'แคมเปญ 1', color: '#000', status: 'live', channels: [] }];
    raw.tasks = [task('t1', 'งาน 1', 'c1')];
    expect(mapToTMK(raw).campaigns[0].tasks).toBe(1);

    raw.tasks = [task('t1', 'งาน 1', 'c1'), task('t2', 'งาน 2', 'c1')];
    expect(mapToTMK(raw).campaigns[0].tasks).toBe(2); // ต้องไม่ค้างที่ 1
  });

  /* PART 118 — ระบบสินค้า/ออเดอร์/ลูกค้า "ยุคเก่า" ถูกถอดถาวร (Sale ใช้ tmk_mp_* แทน)
     ล็อกไว้ด้วยเทส: ถ้ามีใครเผลอเอา section กลับมา จะได้รู้ว่ากำลังปลุกตารางที่ไม่มีใครเขียนแล้ว */
  it('ตารางยุคเก่า (products/orders/customers) ต้องว่างเสมอ แม้ส่งข้อมูลเข้ามา', () => {
    const raw = baseRaw();
    raw.products = [{ id: 'p1', name: 'เสื้อ A', price: 100, lots: [], reservations: [] }];
    raw.customers = [{ id: 'cu1', name: 'ลูกค้า A', created_at: '2026-08-01' }];
    raw.orders = [{ id: 'o1', customer_id: 'cu1', total: 100, status: 'paid', items: [], created_at: '2026-08-01' }];
    const t = mapToTMK(raw);
    expect(t.products).toEqual([]);
    expect(t.orders).toEqual([]);
    expect(t.customers).toEqual([]);
  });

  it('tasks ขึ้นกับ commentCounts — จำนวนคอมเมนต์ต้องอัปเดต', () => {
    const raw = baseRaw();
    raw.tasks = [task('t1', 'งาน 1')];
    raw.commentCounts = [{ task_id: 't1', comment_count: 2 }];
    expect(mapToTMK(raw).tasks[0].commentCount).toBe(2);

    raw.commentCounts = [{ task_id: 't1', comment_count: 5 }];
    expect(mapToTMK(raw).tasks[0].commentCount).toBe(5);
  });

  it('clearMapMemo() ล้างแคชจริง (logout → ข้อมูล user เดิมไม่ค้าง)', () => {
    const raw = baseRaw();
    raw.brands = [brand('b1', 'TEAMDEE')];
    const a = mapToTMK(raw);
    clearMapMemo();
    const b = mapToTMK(raw);
    expect(b.brands).not.toBe(a.brands);                     // instance ใหม่
    expect(b.brands.map(x => x.name)).toEqual(['TEAMDEE']);    // ค่ายังถูก
  });
});
