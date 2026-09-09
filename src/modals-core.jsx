/* ============================================================
   modals-core.jsx — base dialog primitives + shared modal helpers
   (แยกจาก modals.jsx · PART 79 · คง eager = base ที่ sale views ใช้ร่วม)
   ============================================================ */
import { useState, useRef } from 'react';
import { TMK } from './data.js';
import { Icon } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import * as RDialog from '@radix-ui/react-dialog';
import { toast as busToast, confirm, refresh, patchRows } from './lib/appBus.js';

// Toast helper
export const toast = (m, k = 'success', duration, action) => busToast(m, k, duration, action);

// แปลงเลข + กันค่าติดลบ + clamp เพดาน 1e12 (กันเลขมหาศาล 1e308 ทำลายกราฟ/ยอดรวม)
export const nn = (v) => Math.max(0, Math.min(Number(v) || 0, 1e12));
// ปัดเงินเป็น 2 ตำแหน่งสตางค์ (ตัด noise float) — ค่าจริงครบ
export const money = (v) => Math.min(1e12, Math.max(0, Math.round((Number(v) || 0) * 100) / 100));
// เงิน → ข้อความ ฿ + สตางค์ 2 ตำแหน่งเสมอ (ใช้ใน confirm/audit ให้ตรงกับทั้งเว็บ)
export const bahtStr = (v) => '฿' + (Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// เตือนทิ้งข้อมูลก่อนปิด (ใช้ร่วมกับ Modal + ปุ่มยกเลิก ให้สม่ำเสมอ)
export const DISCARD_MSG = 'ข้อมูลที่ยังไม่ได้บันทึกจะหายไป';
// ใช้ AlertDialog ของแอป (ConfirmHost ผ่าน appBus) แทน window.confirm ของเบราว์เซอร์
// เดิม: กล่องเทาไม่มีธีม + ขึ้นชื่อโดเมนกำกับ (ดูเหมือนไม่ใช่ระบบเรา) + บล็อก event loop ทั้งเส้น
export const confirmDiscard = () => confirm({
  title: 'ปิดหน้านี้?', body: DISCARD_MSG, danger: true,
  confirmText: 'ปิดโดยไม่บันทึก', cancelText: 'กลับไปแก้ต่อ',
});
// async — call site ทั้งหมดเรียกแบบ fire-and-forget (onClick) จึงไม่ต้องแก้ฝั่งเรียก
export const guardClose = async (touched, onClose) => { if (touched && !(await confirmDiscard())) return; onClose(); };

// ID ที่ไม่ชนกัน (กันกดบันทึกซ้ำ/หลายคนพร้อมกัน → ข้อมูลซ้ำหรือทับกัน)
export const uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Generic save wrapper — ส่ง audit (optional) เพื่อบันทึกประวัติการใช้งานเมื่อสำเร็จ
export async function saveRow(table, row, label = 'บันทึก', audit = null) {
  try {
    // .select() → ได้แถวที่ DB เขียนจริงกลับมา (รวม default/trigger ที่ฝั่ง client ไม่รู้)
    const { data, error } = await supabase.from(table).upsert(row).select();
    if (error) throw error;
    if (audit) logAudit(audit);
    // เห็นผลทันทีโดยไม่รอ network รอบสอง — เดิมมีช่วง 200-400ms ที่ toast ขึ้น "สำเร็จ" แล้วแต่จอยังเป็นค่าเก่า
    patchRows(table, data && data.length ? data : [row]);
    refresh([table]); // ตามมา reconcile ลำดับแถว/derived view ให้ตรง query จริง (กันหน้าค้างถ้า realtime ช้าด้วย)
    toast(label + 'สำเร็จ', 'success');
    return true;
  } catch (err) {
    console.error(`Save ${table} failed:`, err);
    toast(label + 'ไม่สำเร็จ: ' + err.message, 'error');
    return false;
  }
}

// Generic soft-delete (ย้ายไปถังขยะ — กู้คืนได้) สำหรับโมดัลที่แก้ไขอยู่
export async function deleteRow(table, id, label, audit = null) {
  if (!await confirm({ title: `ลบ${label}`, body: "จะย้ายไปถังขยะ (กู้คืนได้ภายหลัง)", danger: true, confirmText: "ลบ" })) return false;
  try {
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      if (/deleted_at/.test(error.message || '')) { toast('ต้องรัน SQL migration (deleted_at) ก่อนจึงจะลบได้', 'error'); return false; }
      throw error;
    }
    if (audit) logAudit(audit);
    refresh([table]);
    toast(`ย้าย${label}ไปถังขยะแล้ว`, 'success', 6000, {
      label: 'เลิกทำ',
      onClick: async () => {
        try {
          const { error: e2 } = await supabase.from(table).update({ deleted_at: null }).eq('id', id);
          if (e2) throw e2;
          refresh([table]);
          toast(`กู้คืน${label}แล้ว`, 'success');
        } catch (e) { toast('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
      },
    });
    return true;
  } catch (err) { toast('ลบไม่สำเร็จ: ' + err.message, 'error'); return false; }
}

export const MD = TMK;

// เปิด/ปิดแบบมีอนิเมชัน: คุม open เอง แล้ว unmount "เมื่อ exit animation จบจริง" (animationend)
// BUGFIX 22 ส.ค. — popup กระพริบตอนปิด: เดิม unmount ด้วย setTimeout(delay) อย่างเดียว ซึ่งยาวกว่า animation (190/420ms)
// พอ animation จบ element เด้งกลับ opacity 1 (tailwindcss-animate ไม่ตั้ง fill-mode) → เห็น popup โผล่เต็มอีกแวบก่อนหาย
// ถ้าเบราว์เซอร์ throttle timer (แท็บไม่ active/เครื่องหน่วง) ช่องว่างยืดเป็นวินาที → กระพริบชัด · เกิดกับทุก popup
// แก้ 2 ชั้น: (1) CSS ตรึง state ปลายด้วย fill-mode: forwards (index.css/sheet/dialog/alert)
//            (2) ที่นี่ — ผูก animationend ของ content แล้วปิดทันที · timeout เหลือเป็น fallback (reduced-motion/ไม่มี animation)
function useAnimatedClose(onClose, confirmOnClose, delay = 200) {
  const [open, setOpen] = useState(true);
  const nodeRef = useRef(null);
  const closing = useRef(false);
  const asking = useRef(false);
  const done = useRef(false);
  const doClose = () => {
    if (closing.current) return;
    closing.current = true;
    setOpen(false);
    const finish = () => { if (done.current) return; done.current = true; onClose && onClose(); };
    const el = nodeRef.current;
    if (el) el.addEventListener('animationend', (e) => { if (e.target === el) finish(); }, { once: true });
    setTimeout(finish, delay);   // fallback: ไม่มี animation / animationend ไม่ยิง
  };
  const onOpenChange = (o) => {
    if (o) return;
    if (closing.current) return;
    // ยืนยันก่อนปิดแบบ async — คง open=true ไว้ก่อน (เราคุม open เอง) แล้วค่อยปิดเมื่อผู้ใช้ยืนยัน
    if (confirmOnClose) {
      if (asking.current) return;      // กันเปิดกล่องซ้อน (กด ESC/คลิกนอกรัวๆ)
      asking.current = true;
      confirmDiscard().then((ok) => { asking.current = false; if (ok) doClose(); });
      return;
    }
    doClose();
  };
  return { open, onOpenChange, nodeRef };
}

/* ---------- Modal shell (Radix Dialog — ประกอบกับ Radix Select/Dropdown ได้ถูกต้อง) ---------- */
export function Modal({ icon, title, sub, onClose, footer, wide, xl, children, confirmOnClose, hideHeader }) {
  // กันคลิกใน overlay ซ้อน (AlertDialog ยืนยัน / dropdown / toast) ไม่ให้ Modal ปิดเอง
  const guardOutside = (e) => {
    const t = e?.detail?.originalEvent?.target;
    if (t && t.closest && t.closest('[role="alertdialog"],[data-radix-popper-content-wrapper],[data-sonner-toast],[data-radix-toast-viewport]')) e.preventDefault();
  };
  const { open, onOpenChange, nodeRef } = useAnimatedClose(onClose, confirmOnClose);
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal forceMount>
        <RDialog.Overlay className="dialog-overlay" forceMount />
        <RDialog.Content ref={nodeRef} className={'dialog-content' + (xl ? ' dialog-content-xl' : wide ? ' dialog-content-lg' : '')} aria-describedby={undefined} forceMount
          onPointerDownOutside={guardOutside} onInteractOutside={guardOutside}>
          {hideHeader ? (
            <>
              <RDialog.Title className="sr-only">{title}</RDialog.Title>
              <RDialog.Close asChild><Button variant="ghost" size="icon" aria-label="ปิด" className="absolute right-2.5 top-2.5 z-10 size-8 rounded-full bg-background/70 hover:bg-muted"><Icon name="x" /></Button></RDialog.Close>
            </>
          ) : (
            <div className="dialog-header">
              {icon && <div className="mh-icon"><Icon name={icon} /></div>}
              <div style={{ minWidth: 0 }}>
                <RDialog.Title className="dialog-title">{title}</RDialog.Title>
                <RDialog.Description className={sub ? 'dialog-description' : 'sr-only'}>{sub || title}</RDialog.Description>
              </div>
              <RDialog.Close asChild><Button variant="ghost" size="icon" className="dialog-close" aria-label="ปิด"><Icon name="x" /></Button></RDialog.Close>
            </div>
          )}
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-footer">{footer}</div>}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

/* ---------- Side sheet — สร้างบน shadcn Sheet · คง props/หัว-เนื้อ-ฟุตเตอร์เดิม ---------- */
const SIDE_SHEET_W = {
  sm: 'w-full sm:w-[440px] sm:max-w-[440px]',
  md: 'w-full sm:w-[560px] sm:max-w-[560px]',
  lg: 'w-full sm:w-[680px] sm:max-w-[680px]',
  xl: 'w-full sm:w-[760px] sm:max-w-[760px]',
};
export function SideSheet({ icon, title, sub, onClose, footer, size = 'md', children, confirmOnClose, showCloseButton = true, position = 'right' }) {
  const { open, onOpenChange, nodeRef } = useAnimatedClose(onClose, confirmOnClose, 430);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent ref={nodeRef} side={position === 'left' ? 'left' : 'right'} hideClose
        aria-describedby={undefined}
        className={`${SIDE_SHEET_W[size] || SIDE_SHEET_W.md} p-0 gap-0 flex flex-col overflow-hidden`}>
        <div className="side-sheet-head">
          {icon && <div className="mh-icon"><Icon name={icon} /></div>}
          <div style={{ minWidth: 0 }}>
            <RDialog.Title className="dialog-title">{title}</RDialog.Title>
            <RDialog.Description className={sub ? 'dialog-description' : 'sr-only'}>{sub || title}</RDialog.Description>
          </div>
          {showCloseButton && <RDialog.Close asChild><Button variant="ghost" size="icon" className="dialog-close" aria-label="ปิด"><Icon name="x" /></Button></RDialog.Close>}
        </div>
        <div className="side-sheet-body">{children}</div>
        {footer && <div className="side-sheet-foot">{footer}</div>}
      </SheetContent>
    </Sheet>
  );
}
