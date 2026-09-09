// @vitest-environment jsdom
/* เดือนที่จำไว้ต้องไม่ค้างข้ามเดือน (B1) — หน้า CRM เคยเปิดมาเจอ ส.ค. ตลอดไป */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { usePersistedMonth } from '../usePersistedState.js';

const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const KEY = 'test-month';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('usePersistedMonth', () => {
  it('ยังไม่เคยเก็บ = เดือนปัจจุบัน', () => {
    const { result } = renderHook(() => usePersistedMonth(KEY));
    expect(result.current[0]).toBe(curMonth());
  });

  it('ค่าที่ถูกตั้งไว้ "เดือนก่อน" = ทิ้ง เริ่มที่เดือนปัจจุบัน', () => {
    localStorage.setItem(KEY, JSON.stringify({ m: '2026-08', at: '2026-08' }));
    const { result } = renderHook(() => usePersistedMonth(KEY));
    expect(result.current[0]).toBe(curMonth());
  });

  it('ผู้ใช้เลือกเดือนย้อนหลังในเดือนนี้ = เคารพค่าที่เลือก ไม่เด้งกลับ', () => {
    const { result } = renderHook(() => usePersistedMonth(KEY));
    act(() => result.current[1]('2026-06'));
    expect(result.current[0]).toBe('2026-06');
    cleanup();
    const again = renderHook(() => usePersistedMonth(KEY));
    expect(again.result.current[0]).toBe('2026-06');
  });

  it('ค่ารูปแบบเก่า (สตริงล้วน) ไม่ทำให้พัง — ถือว่าค้าง เริ่มที่เดือนปัจจุบัน', () => {
    localStorage.setItem(KEY, JSON.stringify('2026-08'));
    const { result } = renderHook(() => usePersistedMonth(KEY));
    expect(result.current[0]).toBe(curMonth());
  });

  it('localStorage พัง = ยังคืนเดือนปัจจุบัน ไม่โยน error', () => {
    localStorage.setItem(KEY, '{ไม่ใช่ json');
    const { result } = renderHook(() => usePersistedMonth(KEY));
    expect(result.current[0]).toBe(curMonth());
  });
});
