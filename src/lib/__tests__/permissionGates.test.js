// @vitest-environment jsdom
/* ============================================================
   ด่านสิทธิ์ที่เคยรั่ว (8 ก.ย. 69)
   ============================================================
   RLS เป็น Tier 1/2 = ทุกคนที่ล็อกอินอ่านได้ทุกแถว → ตัวกรองฝั่งเว็บคือด่านเดียว
   ทั้ง 2 เคสนี้เคยเป็น fail-open:
   1. หน้า "บันทึกกิจกรรม" — CLAUDE.md และ header ของ views-log.jsx เขียนว่า
      "แอดมินเท่านั้น (gate ที่ App)" แต่ App ไม่เคยมี gate จริง มีแค่ isLocked('logs')
      ซึ่งเป็น deny-list ที่ default = เข้าได้ · log มี before→after ของเป้ายอด/เรตคอมรายคน
   2. อ่าน tmk_user_roles ไม่สำเร็จ → lockedSections กลายเป็น [] = ล็อกหน้าหายทั้งเซสชัน
   ============================================================ */
import { describe, it, expect, beforeEach } from 'vitest';
// ⚠️ ต้อง import "ของจริง" — เขียน logic ซ้ำในเทสคือเทสที่พิสูจน์อะไรไม่ได้
import { canSeeAuditLog } from '../roleAccess.js';
import { resolveLockedSections } from '../../userContext.jsx';

describe('หน้าที่เปิดให้แอดมินเท่านั้น', () => {
  const mayEnterLogs = (role) => canSeeAuditLog(role === undefined || role === null ? null : { role });

  it('admin เข้าได้', () => expect(mayEnterLogs('admin')).toBe(true));
  it('editor เข้าไม่ได้ แม้ไม่มีใครไปล็อกไว้', () => expect(mayEnterLogs('editor')).toBe(false));
  it('viewer เข้าไม่ได้', () => expect(mayEnterLogs('viewer')).toBe(false));
  it('ไม่รู้ role → เข้าไม่ได้ (fail-closed)', () => {
    expect(mayEnterLogs(undefined)).toBe(false);
    expect(mayEnterLogs(null)).toBe(false);
  });
});

describe('ล็อกหน้าต้องไม่หายเมื่ออ่าน tmk_user_roles ไม่สำเร็จ', () => {
  const KEY = (e) => `tmk-locks:${e.toLowerCase()}`;
  beforeEach(() => localStorage.clear());

  const resolveLocks = ({ role, email, isAdminRole }) => resolveLockedSections(role, email, !!isAdminRole);

  it('อ่านสำเร็จ → ใช้ค่าจาก DB และจำไว้', () => {
    const locks = resolveLocks({ role: { lockedSections: ['catalog:perf', 'logs'] }, email: 'fah@tmk.co' });
    expect(locks).toEqual(['catalog:perf', 'logs']);
    expect(JSON.parse(localStorage.getItem(KEY('fah@tmk.co')))).toEqual(['catalog:perf', 'logs']);
  });

  it('⛔ อ่านไม่สำเร็จรอบถัดมา → ต้องยังล็อกอยู่ ไม่ใช่ปลดให้ฟรี', () => {
    resolveLocks({ role: { lockedSections: ['catalog:perf'] }, email: 'fah@tmk.co' });
    const after = resolveLocks({ role: undefined, email: 'fah@tmk.co' });   // roles อ่านพลาด
    expect(after).toEqual(['catalog:perf']);
  });

  it('คนละอีเมล ไม่ใช้ล็อกของกันบนเครื่องเดียวกัน', () => {
    resolveLocks({ role: { lockedSections: ['logs'] }, email: 'fah@tmk.co' });
    expect(resolveLocks({ role: undefined, email: 'tukta@tmk.co' })).toEqual([]);
  });

  it('admin ไม่โดนล็อกเสมอ แม้ค่าใน DB จะมี', () => {
    expect(resolveLocks({ role: { lockedSections: ['logs'] }, email: 'art@tmk.co', isAdminRole: true })).toEqual([]);
  });

  it('⛔ เลื่อนเป็น admin แล้ว → cache ต้องถูกล้าง ไม่ใช่ค้างของสมัยเป็น editor', () => {
    /* ตอนบูต getSession() คืนอีเมลก่อน roles โหลด → ช่วงนั้น role = undefined → อ่าน cache
       ถ้า admin ไม่เขียนทับ cache คนที่ถูกเลื่อนขั้นจะโดนเด้งออกจากหน้าที่เคยถูกล็อกทุกครั้งที่ F5 ตลอดไป */
    resolveLocks({ role: { lockedSections: ['catalog:perf'] }, email: 'fah@tmk.co' });   // สมัยเป็น editor
    resolveLocks({ role: { role: 'admin' }, email: 'fah@tmk.co', isAdminRole: true });   // เลื่อนเป็น admin
    expect(resolveLocks({ role: undefined, email: 'fah@tmk.co' })).toEqual([]);          // รีเฟรชครั้งถัดไป
  });

  it('แอดมินถูกลดเป็น editor ที่มีล็อก → รอบถัดไปต้องล็อกตามค่าใหม่', () => {
    resolveLocks({ role: { role: 'admin' }, email: 'fah@tmk.co', isAdminRole: true });
    resolveLocks({ role: { lockedSections: ['logs'] }, email: 'fah@tmk.co' });
    expect(resolveLocks({ role: undefined, email: 'fah@tmk.co' })).toEqual(['logs']);
  });

  it('แอดมินถอดล็อกให้ (lockedSections ว่าง) → cache ต้องตามไปว่างด้วย', () => {
    resolveLocks({ role: { lockedSections: ['catalog:perf', 'logs'] }, email: 'fah@tmk.co' });
    resolveLocks({ role: { lockedSections: [] }, email: 'fah@tmk.co' });
    expect(resolveLocks({ role: undefined, email: 'fah@tmk.co' })).toEqual([]);
  });

  it('ค่าที่จำไว้เสียหาย → ถือว่าไม่มีล็อก (ไม่ throw)', () => {
    localStorage.setItem(KEY('fah@tmk.co'), '{ไม่ใช่ json');
    expect(resolveLocks({ role: undefined, email: 'fah@tmk.co' })).toEqual([]);
  });
});
