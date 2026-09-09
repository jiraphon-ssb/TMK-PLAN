/* APP_VERSION ที่แยกออกมาเพื่อ first paint ต้องไม่หลุดจาก changelog
   (ถ้าลืมอัปเดตตอนเพิ่ม What's New จุดแดง "ยังไม่อ่าน" จะไม่เด้ง และหน้าตั้งค่าโชว์เวอร์ชันผิด) */
import { describe, it, expect } from 'vitest';
import { APP_VERSION } from '../../appVersion.js';
import { CHANGELOG } from '../../changelog.js';

describe('APP_VERSION', () => {
  it('ตรงกับเวอร์ชันบนสุดของ changelog', () => {
    expect(APP_VERSION).toBe(CHANGELOG[0].ver);
  });
  it('เป็นสตริงรูปแบบ x.y.z', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
