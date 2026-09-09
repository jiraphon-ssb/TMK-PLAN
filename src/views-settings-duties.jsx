/* ============================================================
   views-settings-duties.jsx — แท็บ "หน้าที่/ตำแหน่ง" (แยกจาก views-settings-people.jsx)
   ============================================================
   ยก DutiesView ออกมาทั้งดุ้น (CRUD หน้าที่ + soft-delete/undo) · ไม่แก้เนื้อใน · re-export กลับที่ views-settings-people.jsx
   ============================================================ */
import { useState } from 'react';
import { TMK } from './data.js';
import { Icon } from './components.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { guardEdit } from './saleWidgets.jsx';
import { toast, confirm } from './lib/appBus.js';

/* ====================  DUTIES VIEW (หน้าที่/ตำแหน่ง)  ==================== */
export function DutiesView() {
  const { reload, refresh } = useData() || {};
  const PALETTE = ['#b07d33', '#0a5aa0', '#2f9e6e', '#4a8be0', '#6b5ce0', '#c08a3e', '#ee6a3a', '#cf4d5c'];
  const [editing, setEditing] = useState(null); // duty id
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [busy, setBusy] = useState(false);

  // New duty form
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [newDesc, setNewDesc] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const duties = TMK.duties || [];

  // นับผู้ใช้ในแต่ละหน้าที่
  const userCount = (dutyId) => (TMK.roles || []).filter(r => r.dutyId === dutyId).length;

  const startEdit = (d) => {
    setEditing(d.id);
    setEditName(d.name);
    setEditColor(d.color);
    setEditDesc(d.description || '');
  };

  const saveEdit = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_duties').update({
        name: editName.trim(),
        color: editColor,
        description: editDesc.trim(),
      }).eq('id', editing);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'duty', entityName: editName.trim(), summary: `แก้ไขหน้าที่ "${editName.trim()}"` });
      if (refresh) await refresh(['tmk_duties', 'tmk_user_roles']); else if (reload) await reload();
      setEditing(null);
      if (toast) toast('อัปเดตหน้าที่เรียบร้อย', 'success');
    } catch (err) {
      if (toast) toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const deleteDuty = async (duty) => {
    if (!guardEdit()) return;
    const count = userCount(duty.id);
    if (count > 0) {
      if (toast) toast(`ลบไม่ได้ — ยังมีผู้ใช้ ${count} คนใช้หน้าที่นี้`, 'warn');
      return;
    }
    if (!await confirm?.({ title: 'ลบหน้าที่', body: `ลบหน้าที่ "${duty.name}"?`, danger: true, confirmText: 'ลบ' })) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_duties').update({ deleted_at: new Date().toISOString() }).eq('id', duty.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'duty', entityName: duty.name, summary: `ลบหน้าที่ "${duty.name}"` });
      if (refresh) await refresh(['tmk_duties', 'tmk_user_roles']); else if (reload) await reload();
      setEditing(null);
      if (toast) toast('ย้ายหน้าที่ไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try {
            await supabase.from('tmk_duties').update({ deleted_at: null }).eq('id', duty.id);
            if (refresh) await refresh(['tmk_duties', 'tmk_user_roles']); else if (reload) await reload();
            toast?.('กู้คืนหน้าที่แล้ว', 'success');
          } catch (e) { toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) {
      if (toast) toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  const addDuty = async () => {
    if (!guardEdit()) return;
    const name = newName.trim();
    if (!name) return;
    if (duties.find(d => d.name === name)) {
      if (toast) toast('หน้าที่นี้มีอยู่แล้ว', 'warn');
      return;
    }
    setBusy(true);
    try {
      // eslint-disable-next-line react-hooks/purity -- Date.now() ตอนกดปุ่มเพิ่มหน้าที่ (event handler ไม่ใช่ตอน render) · ใช้เป็น fallback id เมื่อชื่อไม่มีตัวอักษร a-z0-9
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('d-' + Date.now());
      const maxOrder = Math.max(0, ...duties.map(d => d.sortOrder || 0));
      // upsert + deleted_at:null → ถ้าชื่อนี้เคยถูกลบ (soft-delete) จะกู้กลับมาแทนที่จะชน PK
      const { error } = await supabase.from('tmk_duties').upsert({
        id,
        name,
        color: newColor,
        description: newDesc.trim(),
        sort_order: maxOrder + 1,
        deleted_at: null,
      });
      if (error) throw error;
      logAudit({ action: 'create', entityType: 'duty', entityName: name, summary: `เพิ่มหน้าที่ "${name}"` });
      if (refresh) await refresh(['tmk_duties', 'tmk_user_roles']); else if (reload) await reload();
      setNewName(''); setNewColor(PALETTE[0]); setNewDesc(''); setShowAdd(false);
      if (toast) toast('เพิ่มหน้าที่เรียบร้อย', 'success');
    } catch (err) {
      if (toast) toast('เพิ่มไม่สำเร็จ: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-4 max-w-3xl w-full">
      <p className="text-sm text-muted-foreground">ผู้ใช้ 1 คนมี 1 หน้าที่ · ใช้เลือก "ผู้รับผิดชอบ" ตอนสร้างงาน</p>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="shield" className="size-5 text-muted-foreground" /> หน้าที่ทั้งหมด ({duties.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Icon name="plus" className="size-4 mr-2" /> เพิ่มหน้าที่ใหม่
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-col">
            {duties.length === 0 && (
              <div className="p-10 text-center text-muted-foreground">
                <p className="text-sm">ยังไม่มีหน้าที่ — กด "เพิ่มหน้าที่ใหม่" เพื่อเริ่ม</p>
              </div>
            )}
            {duties.map(d => {
              const count = userCount(d.id);

              return (
                <div key={d.id} className="flex items-center gap-3 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="size-4 rounded-sm shrink-0" style={{ background: d.color }}></div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-foreground text-sm">{d.name}</div>
                    {d.description && <div className="text-xs text-muted-foreground mt-0.5 truncate">{d.description}</div>}
                  </div>
                  <Badge variant="outline" className="font-semibold" style={{ background: d.color + '10', color: d.color, borderColor: d.color + '30' }}>
                    {count} คน
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => startEdit(d)} title="แก้ไข">
                    <Icon name="pencil" className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* เพิ่มหน้าที่ใหม่ Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => {
        if (!open) {
          setShowAdd(false); setNewName(''); setNewColor(PALETTE[0]); setNewDesc('');
        }
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="shield" className="size-5" /> เพิ่มหน้าที่ใหม่
            </DialogTitle>
            <DialogDescription>
              ใช้มอบหมายงานและจัดกลุ่มผู้รับผิดชอบ
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-6 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
              <div className="size-4 rounded-full shrink-0" style={{ background: newColor }}></div>
              <div className="font-semibold text-lg truncate flex-1">
                {newName.trim() || 'ชื่อหน้าที่'}
                {newDesc.trim() && <span className="text-sm font-normal text-muted-foreground ml-2">· {newDesc.trim()}</span>}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>ชื่อหน้าที่ <span className="text-destructive">*</span></Label>
              <Input autoFocus placeholder="เช่น Logistics, Customer Service" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addDuty(); }} />
            </div>

            <div className="grid gap-2">
              <Label>สีประจำหน้าที่</Label>
              <div className="flex flex-wrap gap-2">
                {PALETTE.map(c => (
                  <button key={c} type="button" className={`size-8 rounded-full flex items-center justify-center transition-all ${newColor === c ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`} 
                    onClick={() => setNewColor(c)} style={{ background: c }}>
                    {newColor === c && <Icon name="check" className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <Label>คำอธิบาย</Label>
              <Input placeholder="เช่น ทีมจัดส่งสินค้า / แพ็คของ" value={newDesc} onChange={e => setNewDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addDuty(); }} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addDuty} disabled={!newName.trim() || busy}>
              {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
              {busy ? 'กำลังบันทึก…' : 'บันทึก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* แก้ไขหน้าที่ Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          {editing && (() => {
            const d = duties.find(x => x.id === editing);
            if (!d) return null;
            const count = userCount(d.id);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon name="shield" className="size-5" /> แก้ไขหน้าที่: {d.name}
                  </DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                    <div className="size-4 rounded-full shrink-0" style={{ background: editColor }}></div>
                    <div className="font-semibold text-lg truncate flex-1">
                      {editName.trim() || 'ชื่อหน้าที่'}
                      {editDesc.trim() && <span className="text-sm font-normal text-muted-foreground ml-2">· {editDesc.trim()}</span>}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>ชื่อหน้าที่ <span className="text-destructive">*</span></Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && editName.trim() && !busy) saveEdit(); }} />
                  </div>

                  <div className="grid gap-2">
                    <Label>สีประจำหน้าที่</Label>
                    <div className="flex flex-wrap gap-2">
                      {PALETTE.map(c => (
                        <button key={c} type="button" className={`size-8 rounded-full flex items-center justify-center transition-all ${editColor === c ? 'ring-2 ring-offset-2 ring-ring' : 'hover:scale-110'}`} 
                          onClick={() => setEditColor(c)} style={{ background: c }}>
                          {editColor === c && <Icon name="check" className="size-4 text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>คำอธิบาย</Label>
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && editName.trim() && !busy) saveEdit(); }} />
                  </div>
                </div>

                <DialogFooter className="flex-row sm:justify-between">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteDuty(d)} disabled={busy}>
                    <Icon name="trash" className="mr-2 size-4" /> ลบ {count > 0 && `(${count} คน)`}
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</Button>
                    <Button onClick={saveEdit} disabled={!editName.trim() || busy}>
                      {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
                      {busy ? 'กำลังบันทึก…' : 'บันทึก'}
                    </Button>
                  </div>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
