import { useState, useEffect } from 'react';

/* useState ที่จำค่าไว้ใน localStorage — กันตัวกรองรีเซ็ตเวลาสลับแท็บ/รีเฟรช */
export function usePersistedState(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s != null ? JSON.parse(s) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* โควต้าเต็ม/โหมดส่วนตัว */ }
  }, [key, v]);
  return [v, setV];
}

/* เดือนที่จำไว้ (YYYY-MM) — จำได้ "ภายในเดือนเดียวกัน" เท่านั้น
   ปัญหาเดิม: usePersistedState('tmk-crm-month', เดือนปัจจุบัน) → ค่า default ใช้แค่ครั้งแรก
   พอเก็บลง localStorage แล้วไม่มีวันขยับ = เปิดหน้า CRM เดือน ธ.ค. ก็ยังเห็น ส.ค. ตลอดไป
   วิธีแก้: เก็บคู่กับ "เดือนที่ตั้งค่านั้นไว้" (at) — ถ้า at ไม่ใช่เดือนปัจจุบัน = ค้างจากเดือนก่อน ทิ้ง
   → ผู้ใช้ยังเลือกย้อนเดือนได้ตามปกติ และค่าที่เลือกอยู่จนจบเดือนนั้น */
const curMonthLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function usePersistedMonth(key) {
  const cur = curMonthLocal();
  const [m, setM] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem(key));
      return (s && typeof s === 'object' && s.at === cur && s.m) ? s.m : cur;   // สตริงล้วน (ของเก่า) = ถือว่าค้าง
    } catch { return cur; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ m, at: cur })); } catch { /* โควต้าเต็ม/โหมดส่วนตัว */ }
  }, [key, m, cur]);
  return [m, setM];
}
