/* ============================================================
   MoneyInput.jsx — ช่องกรอกเงิน/จำนวน แบบมีคอมมา — PART 106
   ============================================================
   เดิมหน้าตั้งเป้าใช้ <Input type="number"> ล้วน → "1000000" อ่านไม่ออกว่าล้านหรือแสน
   + มีลูกศร spinner ที่กดพลาดแล้วเลขเปลี่ยนโดยไม่รู้ตัว (เส้นเงินวิ่งผ่านช่องพวกนี้)
   ใหม่: แสดงเป็น 1,000,000 · พิมพ์ได้เฉพาะตัวเลข · onChange คืนค่าเป็นสตริงตัวเลขล้วน
   (สัญญาเดิมของ caller ไม่เปลี่ยน — ยังส่ง e.target.value ที่เป็นตัวเลขล้วน)
   ============================================================ */
import { Input } from '@/components/ui/input';

const digits = (v) => String(v ?? '').replace(/[^\d]/g, '');
const withComma = (v) => { const d = digits(v); return d ? Number(d).toLocaleString('en-US') : ''; };

export function MoneyInput({ value, onChange, className = '', suffix, ...rest }) {
  const handle = (e) => {
    const raw = digits(e.target.value);
    onChange?.({ ...e, target: { ...e.target, value: raw } });
  };
  return (
    <span className="relative inline-flex w-full items-center">
      <Input {...rest} type="text" inputMode="numeric" autoComplete="off"
        value={withComma(value)} onChange={handle}
        className={'text-right tabular-nums ' + (suffix ? 'pr-7 ' : '') + className} />
      {suffix && <span className="pointer-events-none absolute right-2.5 text-[11px] text-muted-foreground">{suffix}</span>}
    </span>
  );
}
