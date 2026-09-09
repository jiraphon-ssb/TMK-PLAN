import { describe, it, expect } from 'vitest';
import { crmTaskTag, customerKeyOfTask, customerTasks, followUpStatus, addDaysISO, buildFollowUpTask } from '../crmFollowUp.js';

const TODAY = '2026-08-24';
const task = (o) => ({ id: String(Math.random()), status: 'todo', tags: [], ...o });

describe('ผูกงานติดตามกับลูกค้าด้วยแท็ก (ไม่ต้อง migration)', () => {
  it('crmTaskTag / customerKeyOfTask ไปกลับได้', () => {
    expect(crmTaskTag('C001')).toBe('crm:C001');
    expect(customerKeyOfTask({ tags: ['ด่วน', 'crm:C001'] })).toBe('C001');
    expect(customerKeyOfTask({ tags: ['ด่วน'] })).toBe(null);
    expect(crmTaskTag('')).toBe('');
  });

  it('customerTasks หยิบเฉพาะงานของลูกค้าคนนั้น เรียงใหม่→เก่า', () => {
    const tasks = [
      task({ id: 'a', tags: ['crm:C001'], dateISO: '2026-08-10' }),
      task({ id: 'b', tags: ['crm:C002'], dateISO: '2026-08-20' }),
      task({ id: 'c', tags: ['crm:C001'], dateISO: '2026-08-25' }),
    ];
    expect(customerTasks(tasks, 'C001').map(t => t.id)).toEqual(['c', 'a']);
    expect(customerTasks(tasks, 'ไม่มี')).toEqual([]);
  });
});

describe('followUpStatus — รู้ว่ามีงานค้างอยู่แล้วไหม (กันสร้างซ้ำ)', () => {
  const tasks = [
    task({ id: 'open-late', tags: ['crm:C001'], dateISO: '2026-08-20' }),            // ค้าง + เลยกำหนด
    task({ id: 'open-next', tags: ['crm:C001'], dateISO: '2026-08-28' }),            // ค้าง ยังไม่ถึง
    task({ id: 'done', tags: ['crm:C001'], dateISO: '2026-08-01', status: 'done' }), // ทำแล้ว
  ];
  it('นับค้าง/เลยกำหนด + วันที่ใกล้สุด + ครั้งล่าสุดที่ทำเสร็จ', () => {
    const s = followUpStatus(tasks, 'C001', TODAY);
    expect(s).toMatchObject({ total: 3, open: 2, overdue: 1, nextDue: '2026-08-20', lastDone: '2026-08-01' });
    expect(s.openTasks.map(t => t.id).sort()).toEqual(['open-late', 'open-next']);
  });
  it('รองรับคอลัมน์สถานะที่โครงการตั้งเอง (doneIds)', () => {
    const rows = [task({ tags: ['crm:C9'], status: 'closed', dateISO: '2026-08-01' })];
    expect(followUpStatus(rows, 'C9', TODAY, new Set(['closed'])).open).toBe(0);
    expect(followUpStatus(rows, 'C9', TODAY).open).toBe(1);   // ไม่บอก doneIds → 'closed' ยังนับว่าค้าง
  });
  it('ลูกค้าที่ไม่เคยมีงาน = ว่างทั้งหมด', () => {
    expect(followUpStatus([], 'C404', TODAY)).toMatchObject({ total: 0, open: 0, overdue: 0, nextDue: '', lastDone: '' });
  });
});

describe('addDaysISO', () => {
  it('บวกวันข้ามเดือน/ปี', () => {
    expect(addDaysISO(TODAY, 0)).toBe(TODAY);
    expect(addDaysISO(TODAY, 7)).toBe('2026-08-31');
    expect(addDaysISO('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDaysISO('', 3)).toBe('');
  });
});

describe('buildFollowUpTask — prefill ที่ส่งเข้าฟอร์มงาน', () => {
  const cust = { key: 'C001', name: 'สมชาย ใจดี', contact: '0812345678', last: '2026-06-01', recency: 84, sales: 48200, count: 6, tier: 'ทอง', flag: 'เสี่ยงหลุด', note: 'ชอบสีกรม' };
  it('ใส่แท็กผูกลูกค้า · วันครบกำหนดตามที่เลือก · ความสำคัญสูงเมื่อเสี่ยงหลุด', () => {
    const t = buildFollowUpTask(cust, { today: TODAY, days: 3, owner: 'FAH' });
    expect(t.tags).toEqual(['crm:C001']);
    expect(t.date).toBe('2026-08-27');
    expect(t.priority).toBe('high');
    expect(t.responsible).toEqual(['FAH']);
    expect(t.channel).toEqual(['Phone']);
    expect(t.title).toContain('สมชาย ใจดี');
    expect(t.detail).toContain('ยอดสะสม: ฿48,200 · 6 ครั้ง');
    expect(t.detail).toContain('ระดับ: ทอง · เสี่ยงหลุด');
  });
  it('ลูกค้าธรรมดา = ความสำคัญกลาง · ไม่มีเบอร์ = ไม่ตั้งช่องทางโทร', () => {
    const t = buildFollowUpTask({ key: 'C009', name: 'ร้านเล็ก', tier: 'ทองแดง' }, { today: TODAY });
    expect(t.priority).toBe('medium');
    expect(t.channel).toEqual([]);
    expect(t.date).toBe(TODAY);
  });
});
