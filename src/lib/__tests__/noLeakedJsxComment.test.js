// ============================================================
// คอมเมนต์บล็อกที่วางใน "ตำแหน่งลูกของ JSX" จะถูกเรนเดอร์เป็นข้อความจริงบนหน้าจอ
// ============================================================
// เจอบนหน้าประสิทธิภาพเซลล์ 9 ก.ย. 69: บรรทัดคอมเมนต์โผล่กลางหน้าให้ผู้ใช้เห็น
// ต้องครอบด้วยปีกกาเสมอ · eslint/build/เทสจับไม่ได้เพราะเป็น JSX ที่ถูกไวยากรณ์
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir, out = []) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) { if (f !== '__tests__' && f !== 'node_modules') walk(p, out); }
    else if (f.endsWith('.jsx')) out.push(p);
  }
  return out;
};

describe('ห้ามมีคอมเมนต์หลุดเป็นข้อความบนหน้าจอ', () => {
  it('ทุกไฟล์ .jsx: ห้ามมี /* ต่อท้าย JSX element โดยไม่ครอบด้วย { }', () => {
    const bad = [];
    for (const file of walk('src')) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // ปิดแท็ก (/> หรือ </Xxx>) แล้วตามด้วยช่องว่าง แล้วขึ้น /* = คอมเมนต์อยู่ในตำแหน่งลูกของ JSX
        if (/(\/>|<\/[A-Za-z][\w.]*>)\s+\/\*/.test(line)) bad.push(`${file}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
