import { describe, it, expect } from 'vitest';
import { myNameSet, dueInfo, taskMatchesQuery, filterTasks, sortTasks, taskStats, isoToday } from '../taskFilters.js';

const T = '2026-08-23';
const mk = (o) => ({ id: o.id || String(Math.random()), title: '', status: 'todo', ...o });

describe('taskFilters', () => {
  it('myNameSet เก็บทั้งชื่อคนและชื่อบทบาท (case-insensitive email)', () => {
    const s = myNameSet('A@x.com', { roles: [{ email: 'a@x.com', name: 'อาร์ต', dutyName: 'ดีไซน์' }], staff: [{ email: 'b@x.com', name: 'บี' }] });
    expect([...s].sort()).toEqual(['ดีไซน์', 'อาร์ต']);
  });

  it('dueInfo แยก overdue/today/soon/later/done/none', () => {
    expect(dueInfo(mk({ dateISO: '2026-08-20' }), T).state).toBe('overdue');
    expect(dueInfo(mk({ dateISO: T }), T).state).toBe('today');
    expect(dueInfo(mk({ dateISO: '2026-08-28' }), T).state).toBe('soon');
    expect(dueInfo(mk({ dateISO: '2026-09-30' }), T).state).toBe('later');
    expect(dueInfo(mk({ dateISO: '2026-08-20', status: 'done' }), T).state).toBe('done');
    expect(dueInfo(mk({}), T).state).toBe('none');
  });

  it('dueInfo ใช้ dateEnd เป็นกำหนดส่งเมื่อมีช่วงวัน + เคารพ doneIds ของโครงการ', () => {
    expect(dueInfo(mk({ dateISO: '2026-08-01', dateEnd: '2026-08-28' }), T).state).toBe('soon');
    expect(dueInfo(mk({ dateISO: '2026-08-01', status: 'closed' }), T, new Set(['closed'])).state).toBe('done');
  });

  it('ค้นหากว้าง — เจอจากรายละเอียด/แท็ก/ผู้รับผิดชอบ ไม่ใช่แค่ชื่อ', () => {
    const t = mk({ title: 'ทำโปสเตอร์', detail: 'ส่งไฟล์ AI', tags: ['ด่วน'], responsible: ['อาร์ต'] });
    expect(taskMatchesQuery(t, 'โปสเตอร์')).toBe(true);
    expect(taskMatchesQuery(t, 'อาร์ต')).toBe(true);
    expect(taskMatchesQuery(t, 'ด่วน')).toBe(true);
    expect(taskMatchesQuery(t, 'ไฟล์')).toBe(true);
    expect(taskMatchesQuery(t, 'ไม่มีคำนี้')).toBe(false);
    expect(taskMatchesQuery(t, '')).toBe(true);
  });

  it('quick filter: mine / overdue / week / open', () => {
    const rows = [
      mk({ id: 'a', dateISO: '2026-08-20', responsible: ['อาร์ต'] }),
      mk({ id: 'b', dateISO: '2026-08-25', responsible: ['บี'] }),
      mk({ id: 'c', dateISO: '2026-08-20', status: 'done' }),
    ];
    const my = new Set(['อาร์ต']);
    const ids = (q) => filterTasks(rows, { quick: q, myNames: my, today: T }).map(r => r.id);
    expect(ids('mine')).toEqual(['a']);
    expect(ids('overdue')).toEqual(['a']);
    expect(ids('week')).toEqual(['b']);
    expect(ids('open')).toEqual(['a', 'b']);
    expect(ids(null)).toEqual(['a', 'b', 'c']);
  });

  it('ช่วงวันที่กรองแบบ overlap (งานคร่อมช่วงต้องติด)', () => {
    const rows = [mk({ id: 'x', dateISO: '2026-08-01', dateEnd: '2026-08-31' }), mk({ id: 'y', dateISO: '2026-09-05' })];
    expect(filterTasks(rows, { filterDateFrom: '2026-08-20', filterDateTo: '2026-08-22' }).map(r => r.id)).toEqual(['x']);
  });

  it('sortTasks: manual tie → เรียงตามกำหนดส่ง · due ไม่มีวันไปท้าย', () => {
    const rows = [mk({ id: 'a', dateISO: '2026-08-30' }), mk({ id: 'b' }), mk({ id: 'c', dateISO: '2026-08-10' })];
    expect(sortTasks(rows, 'manual').map(r => r.id)).toEqual(['c', 'a', 'b']);
    expect(sortTasks(rows, 'due').map(r => r.id)).toEqual(['c', 'a', 'b']);
    expect(sortTasks([mk({ id: 'l', priority: 'low' }), mk({ id: 'h', priority: 'high' })], 'priority').map(r => r.id)).toEqual(['h', 'l']);
  });

  it('taskStats นับ ค้าง/เสร็จ/เลยกำหนด/ครบสัปดาห์ + %', () => {
    const rows = [
      mk({ dateISO: '2026-08-20' }), mk({ dateISO: T }), mk({ dateISO: '2026-08-26' }),
      mk({ dateISO: '2026-12-01' }), mk({ status: 'done' }),
    ];
    const s = taskStats(rows, null, T);
    expect(s).toMatchObject({ total: 5, done: 1, open: 4, overdue: 1, today: 1, week: 2, pct: 20 });
  });

  it('isoToday เป็นเวลาท้องถิ่น (ไม่ใช่ UTC)', () => {
    expect(isoToday(new Date(2026, 7, 23, 1, 0, 0))).toBe('2026-08-23');
  });
});

describe('myNameSet — อีเมลว่างต้องไม่แมตช์ใคร (หน้าแชร์สาธารณะ)', () => {
  const roles = [{ email: 'a@b.c', name: 'อาร์ต' }, { email: '', name: 'พนักงานไม่มีอีเมล' }];
  const staff = [{ email: '', name: 'ฟ้า' }];
  it('ไม่มีอีเมล = เซ็ตว่าง', () => {
    expect([...myNameSet('', { roles, staff })]).toEqual([]);
    expect([...myNameSet(null, { roles, staff })]).toEqual([]);
  });
  it('มีอีเมล = ได้เฉพาะชื่อของคนนั้น', () => {
    expect([...myNameSet('a@b.c', { roles, staff })]).toEqual(['อาร์ต']);
  });
});
