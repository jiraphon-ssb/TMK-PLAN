/* ============================================================
   TMK Operation — Current User Context
   ============================================================
   ตัวตนผู้ใช้ปัจจุบันจาก Supabase Auth session (email)
   แล้ว enrich profile/role จาก tmk_user_roles + tmk_staff ตามอีเมล
   ============================================================ */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { TMK } from './data.js';
import { supabase } from './lib/supabaseClient.js';

const UserContext = createContext();

/* จำ "หน้าที่ถูกล็อก" ล่าสุดต่ออีเมล — ใช้ตอนอ่าน tmk_user_roles ไม่สำเร็จ
   เก็บแค่รายชื่อ section (ไม่ใช่ข้อมูลลูกค้า/เงิน) และผูกอีเมล กันข้ามคนบนเครื่องร่วม */
const LOCK_KEY = (email) => `tmk-locks:${String(email || '').toLowerCase()}`;
const cacheLocks = (email, list) => {
  try { localStorage.setItem(LOCK_KEY(email), JSON.stringify(list || [])); } catch { /* ignore quota */ }
};
const readCachedLocks = (email) => {
  try { const v = JSON.parse(localStorage.getItem(LOCK_KEY(email))); return Array.isArray(v) ? v : []; } catch { return []; }
};

/**
 * หน้าที่ถูกล็อกของ user คนนี้ — export เพื่อให้เทสยิงตัวจริงได้ (ห้ามเขียนซ้ำในเทส)
 * @param role      แถวจาก tmk_user_roles · undefined = อ่านไม่ได้ หรือยังไม่มีแถว
 * @param isAdminRole admin ไม่โดนล็อกเสมอ
 */
export function resolveLockedSections(role, email, isAdminRole) {
  /* ⚠️ admin ต้อง "เขียน cache ทับ" ด้วย ไม่ใช่ return ก่อน
     ตอนบูต getSession() (อ่าน localStorage) คืนอีเมลก่อน TMK.roles (network) เสมอ
     → ช่วงนั้น role = undefined → ตกมาอ่าน cache · ถ้า cache ยังเป็นของสมัยเป็น editor
       คนที่ถูกเลื่อนเป็น admin จะโดน App redirect ออกจากหน้าที่เคยถูกล็อก ทุกครั้งที่กด F5 ตลอดไป
       เพราะไม่มีอะไรมาเขียนทับ cache นั้นอีกเลย */
  if (isAdminRole) { cacheLocks(email, []); return []; }
  if (role) { cacheLocks(email, role.lockedSections || []); return role.lockedSections || []; }
  return readCachedLocks(email);   // อ่านไม่ได้ → ใช้ค่าล่าสุดที่รู้ (ไม่ปลดล็อกให้ฟรี)
}

export function UserProvider({ children, version }) {
  // อีเมลที่ล็อกอินจริง — มาจาก Supabase Auth session (persist/refresh ให้เอง)
  const [authEmail, setAuthEmail] = useState(null);
  useEffect(() => {
    if (!supabase) return; // ยังไม่ตั้งค่า Supabase → ข้าม (กัน TypeError ตอน mount)
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setAuthEmail(data.session?.user?.email || null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (alive) setAuthEmail(s?.user?.email || null); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // Enrich อีเมล → profile จาก Supabase (tmk_staff + tmk_user_roles)
  const enriched = React.useMemo(() => {
    if (!authEmail || typeof authEmail !== 'string') return null;
    // 1. หาใน tmk_staff ตามอีเมล
    const staffByEmail = (TMK.staff || []).find(s => s.email === authEmail);
    // 2. หาใน tmk_user_roles ตามอีเมล
    const role = (TMK.roles || []).find(r => r.email === authEmail);
    // 3. ถ้ามี role → ลองหา staff ตามชื่อด้วย
    const staffByName = role ? (TMK.staff || []).find(s => s.name === role.name) : null;
    const staff = staffByEmail || staffByName;

    // เคสพิเศษ: jiraphon.e@tmk.co = เจ้าของ — default ชื่อ "มัง" ถ้าไม่มีใน DB
    const isOwner = authEmail === 'jiraphon.e@tmk.co' || authEmail === 'jiraphon.e@saisabuygroup.co';
    const fallbackName = isOwner ? 'มัง' : authEmail.split('@')[0];
    const fallbackRole = isOwner ? 'admin' : 'viewer';

    const resolvedRole = role?.role || (staff?.role === 'Owner' ? 'admin' : null) || fallbackRole;

    /* ⚠️ อ่าน tmk_user_roles ไม่สำเร็จ (เน็ต/RLS/5xx) → TMK.roles = [] → role = undefined
       เดิม lockedSections กลายเป็น [] = **ล็อกหน้าหายทั้งเซสชัน** (fail-open ในด้านที่ควร fail-closed)
       คนที่ถูกล็อกหน้าประสิทธิภาพเซลล์/บันทึกกิจกรรมไว้ จะเดินเข้าได้จนกว่าจะรีโหลด
       แก้: จำ lockedSections ล่าสุดของอีเมลนี้ไว้ แล้วใช้ตอนอ่านไม่ได้
            — ไม่ล็อกทุกหน้าทิ้ง (จะพังเกินเหตุถ้าเน็ตกระตุกตอนเปิดแอป) แต่ไม่ปลดล็อกให้ฟรีเช่นกัน */
    const locks = resolveLockedSections(role, authEmail, resolvedRole === 'admin');
    return {
      email: authEmail,
      name: staff?.name || role?.name || fallbackName,
      role: resolvedRole,
      department: role?.department || role?.dutyName || staff?.role || '',
      color: staff?.color || (isOwner ? '#b07d33' : '#3b82f6'),
      avatarUrl: staff?.avatarUrl || '',
      // หน้าใหญ่ที่ถูกล็อก (deny-list) — admin ไม่โดนล็อกเสมอ บังคับที่นี่ไม่ว่าค่าใน DB จะเป็นอะไร
      lockedSections: locks,
      rolesReadOk: !!role || resolvedRole === 'admin',   // false = ยังไม่รู้สิทธิ์จริง (ผู้เรียกใช้ตัดสินใจ fail-closed ได้)
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version = สัญญาณว่าข้อมูล TMK (staff/roles) ถูก mutate ใหม่ · ต้องคงไว้เพื่อคำนวณสิทธิ์/ล็อกหน้าใหม่ (TMK เป็น global ที่ React มองไม่เห็น)
  }, [authEmail, version]);

  return (
    <UserContext.Provider value={{ user: enriched }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
