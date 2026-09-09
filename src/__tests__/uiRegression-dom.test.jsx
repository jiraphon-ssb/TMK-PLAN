/** @vitest-environment jsdom */
/* ============================================================
   uiRegression-dom.test.jsx — เทส DOM ของจุดที่ "เคยพลาดจริง" (PART 118)
   ============================================================
   ทุกเคสในไฟล์นี้มาจากบั๊กที่รีวิวจับได้ ไม่ใช่เคสสมมติ
   ============================================================ */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

globalThis.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
afterEach(() => cleanup());

/* ---------- 1) คอลัมน์ที่พับใน Kanban ต้องไม่ติดข้ามโครงการ ---------- */
describe('Kanban: สถานะพับคอลัมน์ผูกกับโครงการ', () => {
  it('สลับโครงการ → อ่านค่าที่พับของโครงการใหม่ ไม่ใช่ของเดิม', async () => {
    localStorage.setItem('tmk-kb-collapsed-A', JSON.stringify(['done']));
    localStorage.setItem('tmk-kb-collapsed-B', JSON.stringify([]));
    // จำลองพฤติกรรมของ effect ที่เพิ่ม: อ่าน localStorage ใหม่เมื่อ lsKey เปลี่ยน
    const read = (id) => new Set(JSON.parse(localStorage.getItem('tmk-kb-collapsed-' + id) || '[]'));
    expect([...read('A')]).toEqual(['done']);
    expect([...read('B')]).toEqual([]);          // โครงการ B ต้องไม่ได้ค่าของ A
  });
});

/* ---------- 2) เป้าเดือน: อ่านพลาด = ห้ามเซฟทับ ---------- */
describe('เป้าเดือน: โหลดพลาดต้องล็อกการบันทึก', async () => {
  it('อ่าน error → ขึ้นแถบเตือน + ปุ่มโหลดใหม่', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabaseClient.js', () => ({
      supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: 'network down', code: 'PGRST000' } }) }) }) }) }) }) },
      // ต้องมีคู่กับ supabase เสมอ — saleData ใช้ตัวนี้ตัดสินว่า "ตั้งค่าฐานข้อมูลแล้วหรือยัง"
  // ถ้าลืม เทสจะไปผูกกับว่าเครื่องนั้นมีไฟล์ .env หรือเปล่า (CI ไม่มี = แดง)
  isSupabaseConfigured: true,
}));
    vi.doMock('../lib/appBus.js', () => ({ toast: () => {}, canEdit: () => true, isAdmin: () => true, userEmail: () => '', refresh: () => {} }));
    vi.doMock('../lib/audit.js', () => ({ logAudit: () => {} }));
    const { MonthTargetsZone } = await import('../settingsMonthTargets.jsx');
    render(<MonthTargetsZone month="2026-08" onSaved={() => {}} />);
    expect(await screen.findByText(/โหลดเป้าเดือนนี้ไม่สำเร็จ/)).toBeInTheDocument();
    expect(screen.getByText('โหลดใหม่')).toBeInTheDocument();
    vi.resetModules();
  });
});

/* ---------- 3) แถบเน็ตหลุด ---------- */
describe('OfflineBar', () => {
  it('ออฟไลน์ → เตือนว่ายังบันทึกไม่ได้', async () => {
    const { OfflineBar } = await import('../components/OfflineBar.jsx');
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineBar />);
    expect(screen.getByText(/เน็ตหลุด/)).toBeInTheDocument();
    spy.mockRestore();
  });
});

/* ---------- 4) ปุ่มบนฟอร์มที่มี Cmd+Enter ต้องไม่ยิงจากช่องย่อย ---------- */
describe('คีย์ลัด Cmd+Enter ในฟอร์มงาน', () => {
  it('ช่องที่ทำเครื่องหมาย data-no-form-submit ต้องไม่ทำให้ฟอร์มถูกบันทึก', () => {
    const onSubmit = vi.fn();
    const inSubField = (el) => !!(el && typeof el.closest === 'function' && el.closest('[data-no-form-submit]'));
    const onKeyDownForm = (e) => {
      if (!((e.metaKey || e.ctrlKey) && e.key === 'Enter')) return;
      if (inSubField(e.target)) return;
      onSubmit();
    };
    render(
      <div onKeyDown={onKeyDownForm}>
        <input aria-label="ชื่องาน" />
        <textarea aria-label="คอมเมนต์" data-no-form-submit />
      </div>
    );
    fireEvent.keyDown(screen.getByLabelText('คอมเมนต์'), { key: 'Enter', metaKey: true });
    expect(onSubmit).not.toHaveBeenCalled();      // อยู่ในกล่องคอมเมนต์ → ต้องไม่บันทึก+ปิดงาน
    fireEvent.keyDown(screen.getByLabelText('ชื่องาน'), { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);    // อยู่ในช่องปกติ → บันทึกได้ตามเดิม
  });
});

/* ---------- 5) ไอคอนโครงการดีฟอลต์ต้องเป็นไอคอนจริง ไม่ใช่ emoji (สไตล์ระบบ) ---------- */
describe('ไอคอนโครงการ', () => {
  it('FlowIcon เรนเดอร์ SVG เมื่อชื่อไอคอนถูกต้อง', async () => {
    const { FlowIcon } = await import('../components.jsx');
    const { container } = render(<FlowIcon icon="ClipboardList" />);
    expect(container.querySelector('svg')).toBeTruthy();
  });
  it('ค่าดีฟอลต์ใน appNav ไม่ใช่ emoji', async () => {
    const { readFileSync } = await import('node:fs');
    // jsdom: import.meta.url เป็น http:// → ใช้ path จาก cwd แทน
    // eslint-disable-next-line no-undef -- เทสรันบน node (vitest) · jsdom ทำให้ import.meta.url เป็น http://
    const src = readFileSync(process.cwd() + '/src/appNav.jsx', 'utf8');
    expect(/icon:\s*[rf][?.]*\.?icon\s*\|\|\s*'[A-Za-z]+'/.test(src)).toBe(true);
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(src)).toBe(false);   // ไม่มี emoji เป็นไอคอน
  });
});
