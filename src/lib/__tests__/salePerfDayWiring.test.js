// ============================================================
// ยามระดับซอร์ส — ปุ่มเจาะรายวันในหน้าประสิทธิภาพเซลล์
// ============================================================
// บั๊กที่ user เจอเอง 9 ก.ย. 69: เซลล์กดแท่งกราฟแล้วไม่มีอะไรเกิดขึ้น
// เพราะ onOpenDay ถูกกั้นด้วย canSeeAll (แอดมินเท่านั้น) ทั้งที่ใต้กราฟเขียนว่า "คลิกวันเพื่อดูออเดอร์ทั้งวัน"
//
// ทำไมเป็นเทสระดับซอร์ส: จุดนี้เป็นการ "ต่อสาย" ใน salePerf.jsx (คอมโพเนนต์ใหญ่ที่ต้อง mock ทั้งระบบ)
// เทส DOM ของ popup (__tests__/dayDetailScope-dom) คุมพฤติกรรมข้างในไปแล้ว แต่ไม่เห็นการต่อสายนี้
// mutation test พิสูจน์ว่าถ้าไม่มียามตัวนี้ การเผลอใส่ canSeeAll กลับไปจะผ่านทุกเทส
// ============================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/salePerf.jsx', 'utf8');

describe('กราฟภาพรวมทีม → popup รายวัน', () => {
  it('⛔ onOpenDay ต้องไม่ถูกกั้นด้วยสิทธิ์ (ทุก role ต้องกดได้)', () => {
    const line = src.split('\n').find(l => l.includes('<TrendCard rows={teamRows}'));
    expect(line, 'ไม่เจอ TrendCard ของภาพรวมทีม — โครงหน้าเปลี่ยน ให้ทบทวนยามตัวนี้').toBeTruthy();
    expect(line).toContain('onOpenDay={setDayAll}');
    expect(line).not.toMatch(/onOpenDay=\{[^}]*canSeeAll/);
  });

  it('⛔ popup ต้องรับชุดข้อมูล "ทั้งทีม" สำหรับคนที่ไม่ใช่แอดมิน (user สั่ง 9 ก.ย. 69)', () => {
    const block = src.slice(src.indexOf('{dayAll && <SideSheet'), src.indexOf('{custDrill &&'));
    expect(block).toContain('orders={canSeeAll ? ordersF : ordersAll}');
    expect(block).toContain('funnelRows={canSeeAll ? funnelF : (data.funnel || [])}');
    expect(block).toContain('scopeNote={dayScopeNote(dayAll)}');
  });
});
