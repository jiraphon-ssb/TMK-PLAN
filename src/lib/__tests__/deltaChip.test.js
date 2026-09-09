/* deltaChip — ชิปเทียบช่วงก่อน ต้องได้เลขเดียวกันทุกหน้า (เขียนก่อนรวมสำเนา) */
import { describe, it, expect } from 'vitest';
import { deltaPct, deltaPoint } from '../deltaChip.js';

describe('deltaPct', () => {
  it('เพิ่มขึ้น → +% · dir 1 · good', () => {
    expect(deltaPct(150, 100)).toEqual({ txt: '+50%', dir: 1, good: true });
  });
  it('ลดลง → ใช้ − (U+2212) ไม่ใช่ hyphen · good=false', () => {
    expect(deltaPct(50, 100)).toEqual({ txt: '−50%', dir: -1, good: false });
  });
  it('goodUp=false (ยิ่งน้อยยิ่งดี เช่น CPO) → ลดลง = ดี', () => {
    expect(deltaPct(50, 100, { goodUp: false }).good).toBe(true);
  });
  it('goodUp=null → เป็นกลาง ไม่ตัดสิน', () => {
    expect(deltaPct(150, 100, { goodUp: null }).good).toBeNull();
  });
  it('⛔ ช่วงก่อน = 0 หรือ null → null ("เทียบไม่ได้") ไม่ใช่ +100%', () => {
    expect(deltaPct(150, 0)).toBeNull();
    expect(deltaPct(150, null)).toBeNull();
  });
  it('⛔ ค่าปัจจุบัน null (อ่านไม่ได้) → null ไม่ใช่ −100%', () => {
    expect(deltaPct(null, 100)).toBeNull();
  });
  it('on=false (ไม่ได้เปิดโหมดเทียบ) → null', () => {
    expect(deltaPct(150, 100, { on: false })).toBeNull();
  });
  it('ปัดเศษแบบเดียวกันทุกหน้า (Math.round ที่ตัวเลข % แล้ว)', () => {
    expect(deltaPct(100.4, 100).txt).toBe('+0%');
    expect(deltaPct(100.5, 100).txt).toBe('+1%');
  });
});

describe('deltaPoint', () => {
  it('ตัวชี้วัดที่เป็น % → หน่วย pt', () => {
    expect(deltaPoint(22, 15)).toEqual({ txt: '+7 pt', dir: 1, good: true, raw: 7, over: false });
  });
  it('⛔ clamp ±100 pt (เดิมโชว์ −167 pt จนคนไม่เชื่อตัวเลขอื่น) + ติดธง over ให้หน้าจออธิบายได้', () => {
    const d = deltaPoint(5, 300);
    expect(d.txt).toBe('−100 pt+');
    expect(d.over).toBe(true);
    expect(d.raw).toBe(-295);
    expect(deltaPoint(300, 5).txt).toBe('+100 pt+');
  });
  it('prev = 0 เทียบได้ (ต่างจาก %) เพราะเป็นการลบ ไม่ใช่การหาร', () => {
    expect(deltaPoint(12, 0).txt).toBe('+12 pt');
  });
  it('neutral → ไม่ตัดสินดี/แย่', () => {
    expect(deltaPoint(22, 15, { neutral: true }).good).toBeNull();
  });
});
