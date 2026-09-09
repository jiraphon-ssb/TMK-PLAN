/* ============================================================
   flowShareDialog.jsx — กล่องแชร์ลิงก์โครงการ (แยกจาก views-flows.jsx)
   - ShareFlowDialog ยกมาทั้งดุ้น ไม่แก้เนื้อใน · รับ flow/open/onOpenChange เป็น props เหมือนเดิม
   ============================================================ */
import { useState, useEffect } from 'react';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { toast } from './lib/appBus.js';
import { logAudit } from './lib/audit.js';
import { Icon } from './components.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { QRCodeSVG } from 'qrcode.react';
import { guardEdit } from './flowsShared.js';

/* ============================================================
   ShareFlowDialog — แชร์ลิงก์โครงการ (อ่านอย่างเดียว) แบบ Dialog สวย + QR
   - เปิดจากปุ่ม "แชร์" ในแถบหัวบอร์ด (ไม่ฝังในตั้งค่าแล้ว)
   - สวิตช์เปิด/ปิด + คัดลอกลิงก์ + QR + เปิดดูตัวอย่าง + รีเซ็ตลิงก์ · graceful
   ============================================================ */
/** token สุ่มแบบเข้ารหัส 128 บิต → base36 (~25 ตัวอักษร) */
function randomToken() {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') throw new Error('เบราว์เซอร์นี้สร้างลิงก์แชร์ที่ปลอดภัยไม่ได้ — กรุณาอัปเดตเบราว์เซอร์');
  const b = c.getRandomValues(new Uint8Array(16));
  let hex = ''; b.forEach(x => { hex += x.toString(16).padStart(2, '0'); });
  return BigInt('0x' + hex).toString(36);
}

export function ShareFlowDialog({ flow, open, onOpenChange }) {
  const { reload, refresh } = useData() || {};
  const [enabled, setEnabled] = useState(!!flow?.shareEnabled);
  const [token, setToken] = useState(flow?.shareToken || '');
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- sync state จาก props เมื่อโครงการ/ค่าแชร์เปลี่ยน (รื้อเป็น derived เสี่ยงกว่าประโยชน์)
  useEffect(() => { setEnabled(!!flow?.shareEnabled); setToken(flow?.shareToken || ''); }, [flow?.id, flow?.shareEnabled, flow?.shareToken]);
  const link = token ? `${window.location.origin}/?share=${token}` : '';
  const apply = async (on, rotate) => {
    if (!guardEdit() || !flow?.id || flow.isGeneral) return;
    setBusy(true);
    try {
      let tok = token;
      /* ⚠️ token นี้คือกุญแจของ endpoint ที่ **ไม่ต้องล็อกอิน** (tmk_public_flow_bundle · grant to anon)
         เดิมใช้ Math.random() ซึ่งไม่ใช่ CSPRNG — V8 กู้ state จาก output ไม่กี่ตัวได้ = เดา token อื่นต่อได้
         ตอนนี้ใช้ crypto.getRandomValues (128 บิต) · ถ้าเบราว์เซอร์ไม่มี ให้ล้มไปเลย ดีกว่าออก token อ่อน ๆ */
      if (rotate || (on && !tok)) tok = 'shr_' + randomToken();
      const { error } = await supabase.from('tmk_flows').update({ share_token: tok, share_enabled: on }).eq('id', flow.id);
      if (error) { if (/share_token|share_enabled|column/i.test(error.message || '')) throw new Error('ยังไม่ได้รัน migration — รัน 20260720-flow-cover-share.sql ก่อน'); throw error; }
      setToken(tok); setEnabled(on);
      logAudit({ action: 'update', entityType: 'flow', entityName: flow.name, summary: `${on ? 'เปิด' : 'ปิด'}แชร์ลิงก์โครงการ "${flow.name}"${rotate ? ' (รีเซ็ตลิงก์)' : ''}`, flowId: flow.scopeId ?? flow.id });
      if (refresh) await refresh(['tmk_flows']); else if (reload) await reload();
      toast(on ? (rotate ? 'รีเซ็ตลิงก์แชร์แล้ว' : 'เปิดแชร์ลิงก์แล้ว') : 'ปิดแชร์ลิงก์แล้ว', 'success');
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast('คัดลอกลิงก์แล้ว', 'success'); } catch { toast('คัดลอกไม่สำเร็จ', 'error'); } };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon name="layers" className="size-5 text-primary" /> แชร์โครงการ "{flow?.name}"</DialogTitle>
          <DialogDescription>ให้คนนอกเปิดลิงก์ดูบอร์ดแบบอ่านอย่างเดียว (ไม่ต้องล็อกอิน · แก้ไขไม่ได้)</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div className="flex flex-col">
            <span className="font-medium text-sm">{enabled ? 'เปิดแชร์อยู่' : 'ปิดแชร์อยู่'}</span>
            <span className="text-xs text-muted-foreground">{enabled ? 'ใครมีลิงก์ก็เปิดดูได้' : 'เปิดเพื่อสร้างลิงก์'}</span>
          </div>
          <Switch checked={enabled} disabled={busy} onCheckedChange={(v) => apply(v, false)} />
        </div>
        {enabled && link && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input readOnly value={link} onFocus={e => e.target.select()} className="font-mono text-xs" />
              <Button type="button" onClick={copy} className="shrink-0"><Icon name="external" className="size-4 mr-1" /> คัดลอก</Button>
            </div>
            <div className="flex justify-center py-1">
              <div className="rounded-xl border bg-white p-3"><QRCodeSVG value={link} size={168} level="M" includeMargin={false} /></div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <a href={link} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1"><Icon name="eye" className="size-3.5" /> เปิดดูตัวอย่าง</a>
              <button type="button" className="text-muted-foreground hover:text-foreground underline" disabled={busy} onClick={() => apply(true, true)}>รีเซ็ตลิงก์ (ลิงก์เดิมใช้ไม่ได้)</button>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground flex gap-2">
          <Icon name="shield" className="size-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <span>ใครก็ตามที่มีลิงก์นี้จะดูข้อมูลในโครงการได้ (งาน/ผู้รับผิดชอบ/แคมเปญ) — แชร์เฉพาะคนที่ไว้ใจ · ปิดสวิตช์เพื่อตัดสิทธิ์ทันที</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
