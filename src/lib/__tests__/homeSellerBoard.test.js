// ยาม: %เป้ารายคนบนหน้าแรก = แอดมินเท่านั้น (ตัดสิน 9 ก.ย. 69)
// ยอดรายคนเห็นได้ทุก role (ภาพรวมทีม) แต่ %เป้าผูกกับเป้า/คอมรายบุคคล
// ซึ่งหน้าประสิทธิภาพเซลล์กันไว้ให้แอดมินอยู่แล้ว (canSeeTeamBoard) — หน้าแรกต้องไม่เปิดรูอ้อม
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/homeView.jsx', 'utf8');

describe('อันดับเซลล์บนหน้าแรก', () => {
  it('⛔ ชิป %เป้า ต้องผูกกับสิทธิ์แอดมิน', () => {
    expect(src).toMatch(/const showTargetPct = busIsAdmin\(\)/);
    const chip = src.split('\n').find(l => l.includes('Math.round(r.pctTarget)'));
    expect(chip, 'ไม่เจอชิป %เป้า — โครงหน้าเปลี่ยน ให้ทบทวนยามตัวนี้').toBeTruthy();
    expect(chip).toContain('showTargetPct &&');
  });

  it('ยอดขายรายคนยังเห็นได้ทุก role (ภาพรวมทีม — ไม่ใช่ของลับ)', () => {
    const line = src.split('\n').find(l => l.includes('{B(r.sales)}'));
    expect(line).toBeTruthy();
    expect(line).not.toContain('showTargetPct');
    expect(line).not.toContain('busIsAdmin');
  });
});
