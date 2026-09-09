/* ============================================================
   guardClose.test.js — กล่องยืนยัน "ทิ้งข้อมูลที่ยังไม่บันทึก"
   ============================================================
   จุดนี้เสี่ยงที่สุดในชุดแก้ครั้งนี้ เพราะเปลี่ยนจาก window.confirm (sync)
   → กล่องของแอปผ่าน appBus (async) ถ้าพลาดจะได้อาการอย่างใดอย่างหนึ่ง:
     • ปิด modal ทิ้งข้อมูลโดยไม่ถามเลย  (อันตราย — งานผู้ใช้หาย)
     • กดยกเลิกแล้วยังปิดอยู่ดี          (อันตรายเหมือนกัน)
     • ไม่ได้แตะฟอร์มแต่ดันถาม           (น่ารำคาญ)
   ============================================================ */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// mock appBus ทั้งก้อน — ไม่ต้องมี provider จริง
const confirmMock = vi.fn();
vi.mock('../appBus.js', () => ({
  confirm: (...a) => confirmMock(...a),
  toast: vi.fn(),
  refresh: vi.fn(),
  patchRows: vi.fn(),
}));
// ตัดของหนักที่ modals-core ลากมา (supabase/audit/UI) ออกจากเทสต์
vi.mock('../supabaseClient.js', () => ({
  supabase: {},
  // ต้องมีคู่กับ supabase เสมอ — saleData ใช้ตัวนี้ตัดสินว่า "ตั้งค่าฐานข้อมูลแล้วหรือยัง"
  // ถ้าลืม เทสจะไปผูกกับว่าเครื่องนั้นมีไฟล์ .env หรือเปล่า (CI ไม่มี = แดง)
  isSupabaseConfigured: true,
}));
vi.mock('../audit.js', () => ({ logAudit: vi.fn() }));

const { guardClose, confirmDiscard, DISCARD_MSG } = await import('../../modals-core.jsx');

beforeEach(() => confirmMock.mockReset());

describe('guardClose — เตือนก่อนทิ้งข้อมูล', () => {
  it('ยังไม่ได้แตะฟอร์ม (touched=false) → ปิดเลย ไม่ถาม', async () => {
    const onClose = vi.fn();
    await guardClose(false, onClose);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('แตะฟอร์มแล้ว + ผู้ใช้ยืนยัน → ปิด', async () => {
    confirmMock.mockResolvedValue(true);
    const onClose = vi.fn();
    await guardClose(true, onClose);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('แตะฟอร์มแล้ว + ผู้ใช้กดยกเลิก → ไม่ปิด (ข้อมูลต้องไม่หาย)', async () => {
    confirmMock.mockResolvedValue(false);
    const onClose = vi.fn();
    await guardClose(true, onClose);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('confirmDiscard คืนค่าที่ผู้ใช้เลือกจริง (ไม่ใช่ค่าคงที่)', async () => {
    confirmMock.mockResolvedValue(true);
    await expect(confirmDiscard()).resolves.toBe(true);
    confirmMock.mockResolvedValue(false);
    await expect(confirmDiscard()).resolves.toBe(false);
  });

  it('ข้อความในกล่องบอกผลลัพธ์ชัด + ปุ่มสองฝั่งอ่านรู้เรื่อง', async () => {
    confirmMock.mockResolvedValue(true);
    await confirmDiscard();
    const opts = confirmMock.mock.calls[0][0];
    expect(opts.body).toBe(DISCARD_MSG);
    expect(opts.danger).toBe(true);
    expect(opts.confirmText).toMatch(/ไม่บันทึก/);   // ปุ่มยืนยันบอกว่าจะเสียอะไร
    expect(opts.cancelText).toMatch(/กลับ/);          // ปุ่มยกเลิกบอกว่าจะได้อะไรคืน
  });
});
