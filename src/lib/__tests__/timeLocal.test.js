/* เดือน/วัน ต้องมาจาก "เวลาเครื่อง" ชุดเดียวกันเสมอ
   บั๊กเดิม: curMonth() ใช้ toISOString() (UTC) แต่ todayISO()/getDate() ใช้เวลาเครื่อง
   → ไทย (UTC+7) ช่วง 00:00–07:00 ของวันที่ 1 ได้คนละเดือน แล้ว buildPerf คำนวณ pace เพี้ยนหนัก */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { curMonth } from '../salePerfAgg.js';
import { todayISO } from '../dateUtils.js';

afterEach(() => vi.useRealTimers());

const INSTANTS = [
  '2026-08-31T23:00:00Z',   // 1 ก.ย. 06:00 ไทย — ขอบเดือน + ขอบวัน
  '2026-08-31T17:30:00Z',   // 1 ก.ย. 00:30 ไทย
  '2026-12-31T20:00:00Z',   // 1 ม.ค. 03:00 ไทย — ข้ามปีด้วย
  '2026-09-15T12:00:00Z',   // กลางเดือน กลางวัน (เคสปกติ)
];

describe('curMonth ต้องเป็นเวลาเครื่อง ไม่ใช่ UTC', () => {
  INSTANTS.forEach(iso => {
    it(`ตรงกับ todayISO ที่ ${iso}`, () => {
      vi.useFakeTimers(); vi.setSystemTime(new Date(iso));
      expect(curMonth()).toBe(todayISO().slice(0, 7));
    });
  });

  it('ตรงกับ getFullYear/getMonth ของเครื่อง', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-31T23:00:00Z'));
    const d = new Date();
    expect(curMonth()).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });
});
