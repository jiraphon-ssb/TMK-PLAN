import { describe, it, expect } from 'vitest';
import {
  contactStats, lastContactMap, snoozeMap, isDue, dueRows, contactBadge,
  nextSnoozeISO, callsFromContacts, answerRate, closedCount, CONTACT_KINDS, CONTACT_RESULTS,
} from '../crmContacts.js';

const c = (o) => ({ customer_key: 'C1', date: '2026-08-24', kind: 'other', result: 'answered', ...o });
const TODAY = '2026-08-24';

describe('contactStats — ตัวเลขสายที่เอาไปเติมบันทึกประจำวัน', () => {
  it('นับต่อกลุ่ม + รับสาย (ปิดการขายได้ = รับสายด้วย)', () => {
    const s = contactStats([
      c({ kind: '0day', result: 'answered' }),
      c({ kind: '0day', result: 'no_answer' }),
      c({ kind: '5day', result: 'closed' }),
      c({ kind: 'repurchase', result: 'no_answer' }),
      c({ kind: 'other', result: 'answered' }),
    ]);
    expect(s.d0).toEqual({ total: 2, answered: 1 });
    expect(s.d5).toEqual({ total: 1, answered: 1 });
    expect(s.rep).toEqual({ total: 1, answered: 0 });
    expect(s.total).toBe(5);       // รวม 'other' ด้วย
    expect(s.answered).toBe(3);
    expect(s.closed).toBe(1);
  });

  it('เลื่อนนัด (snooze) ไม่นับเป็นสายที่โทร', () => {
    const s = contactStats([c({ kind: '0day', result: 'snooze' }), c({ kind: '0day', result: 'answered' })]);
    expect(s.total).toBe(1);
    expect(s.d0).toEqual({ total: 1, answered: 1 });
  });

  it('callsFromContacts คืนรูปแบบเดียวกับฟอร์มบันทึกประจำวัน', () => {
    expect(callsFromContacts([c({ kind: '5day', result: 'answered' })]))
      .toEqual({ d0: { total: 0, answered: 0 }, d5: { total: 1, answered: 1 }, rep: { total: 0, answered: 0 } });
  });

  it('answerRate / closedCount', () => {
    const rows = [c({ result: 'answered' }), c({ result: 'no_answer' }), c({ result: 'closed' }), c({ result: 'no_answer' })];
    expect(answerRate(rows)).toBe(50);
    expect(closedCount(rows)).toBe(1);
    expect(answerRate([])).toBe(null);
  });
});

describe('ลิสต์ "ควรติดต่อ" — ตัดคนที่ทำแล้ว/เลื่อนแล้วออก', () => {
  const contacts = [
    c({ customer_key: 'A', date: TODAY }),                                  // ทำแล้ววันนี้
    c({ customer_key: 'B', date: '2026-08-20' }),                           // ทำเมื่อ 4 วันก่อน → ยังต้องทำ
    c({ customer_key: 'C', date: '2026-08-20', result: 'snooze', snooze_until: '2026-08-30' }), // เลื่อนถึง 30
    c({ customer_key: 'D', date: '2026-08-10', result: 'snooze', snooze_until: '2026-08-20' }), // เลื่อนหมดอายุแล้ว
  ];
  it('lastContactMap / snoozeMap เอาค่าล่าสุด', () => {
    expect(lastContactMap(contacts)).toMatchObject({ A: TODAY, B: '2026-08-20' });
    expect(snoozeMap(contacts)).toEqual({ C: '2026-08-30', D: '2026-08-20' });
  });
  it('isDue: ทำแล้ววันนี้=ไม่ต้อง · เลื่อนยังไม่ถึงกำหนด=ไม่ต้อง · เลื่อนหมดอายุ=ต้องทำ', () => {
    const ctx = { last: lastContactMap(contacts), snooze: snoozeMap(contacts), today: TODAY };
    expect(isDue('A', ctx)).toBe(false);
    expect(isDue('B', ctx)).toBe(true);
    expect(isDue('C', ctx)).toBe(false);
    expect(isDue('D', ctx)).toBe(true);
    expect(isDue('ใหม่ไม่เคยติดต่อ', ctx)).toBe(true);
  });
  it('dueRows กรองรายชื่อจริง (ใช้ key หรือ code)', () => {
    const rows = [{ key: 'A' }, { key: 'B' }, { code: 'C' }, { key: 'D' }, { key: 'E' }];
    expect(dueRows(rows, contacts, TODAY).map(r => r.key || r.code)).toEqual(['B', 'D', 'E']);
  });
  it('contactBadge บอกสถานะบนการ์ด', () => {
    expect(contactBadge('A', contacts, TODAY).kind).toBe('done');
    expect(contactBadge('C', contacts, TODAY).kind).toBe('snooze');
    expect(contactBadge('B', contacts, TODAY).kind).toBe('past');
    expect(contactBadge('E', contacts, TODAY)).toBe(null);
  });
});

describe('nextSnoozeISO', () => {
  it('บวกวันข้ามเดือนถูกต้อง', () => {
    expect(nextSnoozeISO('2026-08-24', 7)).toBe('2026-08-31');
    expect(nextSnoozeISO('2026-08-30', 3)).toBe('2026-09-02');
    expect(nextSnoozeISO('2026-12-30', 14)).toBe('2027-01-13');
    expect(nextSnoozeISO('', 7)).toBe('');
  });
});

describe('ค่าคงที่', () => {
  it('kinds/results ตรงกับที่ migration รองรับ', () => {
    expect(CONTACT_KINDS.map(k => k.id)).toEqual(['0day', '5day', 'repurchase', 'other']);
    expect(CONTACT_RESULTS.map(r => r.id)).toEqual(['answered', 'closed', 'no_answer', 'snooze']);
  });
});

/* ---- PART 110 ชุด 3: รอบติดตาม (cadence) + ลูกค้าซ้ำ ---- */
import { cadenceDays, isCadenceDue } from '../crmContacts.js';
import { findDuplicateCustomers } from '../crmDirectory.js';

describe('cadenceDays — แปลงรอบติดตามที่คนกรอกจริง', () => {
  it('รองรับหลายรูปแบบ', () => {
    expect(cadenceDays('30')).toBe(30);
    expect(cadenceDays('30 วัน')).toBe(30);
    expect(cadenceDays('30D')).toBe(30);
    expect(cadenceDays('ทุก 45 วัน')).toBe(45);
    expect(cadenceDays('2 เดือน')).toBe(60);
    expect(cadenceDays('')).toBe(0);
    expect(cadenceDays('ทุกเดือน')).toBe(0);   // ไม่มีตัวเลข → ไม่เดา
  });
  it('isCadenceDue: เงียบเกินรอบ + ยังไม่ได้ติดต่อ/เลื่อน', () => {
    const ctx = { last: { A: '2026-08-24' }, snooze: { B: '2026-09-30' }, today: '2026-08-24' };
    expect(isCadenceDue({ key: 'X', cadence: '30', recency: 45 }, ctx)).toBe(true);
    expect(isCadenceDue({ key: 'X', cadence: '30', recency: 10 }, ctx)).toBe(false);  // ยังไม่ถึงรอบ
    expect(isCadenceDue({ key: 'A', cadence: '30', recency: 45 }, ctx)).toBe(false);  // ติดต่อแล้ววันนี้
    expect(isCadenceDue({ key: 'B', cadence: '30', recency: 45 }, ctx)).toBe(false);  // เลื่อนนัดไว้
    expect(isCadenceDue({ key: 'X', cadence: '', recency: 999 }, ctx)).toBe(false);   // ไม่ได้ตั้งรอบ
  });
});

describe('findDuplicateCustomers — ชี้เป้าลูกค้าที่น่าจะเป็นคนเดียวกัน', () => {
  it('จับคู่จากเบอร์ (ตัดขีด/เว้นวรรค) และชื่อ', () => {
    const rows = [
      { key: 'C001', name: 'สมชาย ใจดี', contact: '081-234-5678', sales: 5000 },
      { key: 'Nสมชาย ใจดี', name: 'สมชาย ใจดี', contact: '0812345678', sales: 3000 },
      { key: 'C002', name: 'สมหญิง', contact: '0899999999', sales: 1000 },
    ];
    const dup = findDuplicateCustomers(rows);
    expect(dup.length).toBe(1);
    expect(dup[0].rows.map(r => r.key).sort()).toEqual(['C001', 'Nสมชาย ใจดี']);
    expect(dup[0].sales).toBe(8000);
  });
  it('เบอร์สั้นเกิน/ชื่อสั้นเกิน ไม่จับคู่ (กัน false positive)', () => {
    expect(findDuplicateCustomers([{ key: 'A', name: 'ก', contact: '123' }, { key: 'B', name: 'ข', contact: '123' }])).toEqual([]);
  });
  it('ไม่คืนกลุ่มซ้ำเมื่อจับได้ทั้งเบอร์และชื่อ', () => {
    const rows = [
      { key: 'A', name: 'บริษัท ทดสอบ', contact: '0812345678', sales: 10 },
      { key: 'B', name: 'บริษัท ทดสอบ', contact: '0812345678', sales: 20 },
    ];
    expect(findDuplicateCustomers(rows).length).toBe(1);
  });
});
