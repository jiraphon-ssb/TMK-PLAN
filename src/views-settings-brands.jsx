/* ============================================================
   views-settings-brands.jsx — แท็บ "แบรนด์" (แยกจาก views-settings-catalog.jsx)
   ============================================================
   ยก BrandsView ออกมาทั้งดุ้น (CRUD + logo + color + drag-reorder + soft-delete/undo) · ไม่แก้เนื้อใน
   re-export กลับที่ views-settings-catalog.jsx
   ============================================================ */
import { useState } from 'react';
import { TMK } from './data.js';
import { ReorderButtons } from './components/ReorderButtons.jsx';
import { Icon, ColorPicker } from './components.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { guardEdit } from './saleWidgets.jsx';
import { toast, confirm } from './lib/appBus.js';

/* ====================  BRANDS VIEW (แบรนด์ — จัดกลุ่ม/ป้ายกำกับโครงการ)  ==================== */
// เลียนแบบ ChannelsView (CRUD + logo upload + color + drag-reorder + soft-delete+undo + graceful)
// ตาราง tmk_brands ยังไม่ migrate → โชว์ป้ายเตือน (MigrationNotice) แทน
export function BrandsView() {
  const { reload, refresh } = useData() || {};
  const PALETTE = ['#6b5ce0', '#4a8be0', '#18a0ab', '#06c755', '#2f9e6e', '#c08a3e', '#ee6a3a', '#ec4899', '#cf4d5c', '#0a5aa0'];
  const brands = (TMK.brands || []);

  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  // add
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLogo, setNewLogo] = useState('');
  const [newTagline, setNewTagline] = useState('');
  const [newColor, setNewColor] = useState(PALETTE[0]);
  // edit
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editLogo, setEditLogo] = useState('');
  const [editTagline, setEditTagline] = useState('');
  const [editColor, setEditColor] = useState('');

  const isMissing = (err) => /relation .* does not exist|does not exist|schema cache|PGRST205|42P01/i.test(err?.message || err?.code || '');
  const [need, setNeed] = useState(false);

  const readFileAsBase64 = (file) => new Promise((resolve, reject) => {
    if (!file) return reject('no file');
    if (file.size > 500 * 1024) return reject('ไฟล์ใหญ่เกิน 500KB');
    const r = new FileReader();
    r.onload = ev => resolve(ev.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const addBrand = async () => {
    if (!guardEdit()) return;
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      // eslint-disable-next-line react-hooks/purity -- Date.now() ตอนกดปุ่มเพิ่มแบรนด์ (event handler ไม่ใช่ตอน render) · ใช้เป็น fallback id เมื่อชื่อไม่มีตัวอักษร a-z0-9
      const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('brand-' + Date.now());
      let id = baseId, counter = 1;
      while (brands.find(b => b.id === id)) id = `${baseId}_${counter++}`;
      const maxOrder = Math.max(0, ...brands.map(b => b.sortOrder || 0));
      const { error } = await supabase.from('tmk_brands').insert({ id, name, color: newColor, logo_url: newLogo, tagline: newTagline.trim(), sort_order: maxOrder + 1 });
      if (error) { if (isMissing(error)) { setNeed(true); throw new Error('ยังไม่ได้รัน migration — รัน 20260710-flows-brands.sql ก่อน'); } throw error; }
      logAudit({ action: 'create', entityType: 'brand', entityName: name, summary: `เพิ่มแบรนด์ "${name}"` });
      if (refresh) await refresh(['tmk_brands']); else if (reload) await reload();
      setNewName(''); setNewLogo(''); setNewTagline(''); setNewColor(PALETTE[0]); setShowAdd(false);
      toast('เพิ่มแบรนด์เรียบร้อย', 'success');
    } catch (err) { toast('เพิ่มไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const startEdit = (b) => { setEditing(b.id); setEditName(b.name); setEditLogo(b.logoUrl || ''); setEditTagline(b.tagline || ''); setEditColor(b.color || PALETTE[0]); };

  const saveEdit = async () => {
    if (!guardEdit()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_brands').update({ name: editName.trim(), color: editColor, logo_url: editLogo, tagline: editTagline.trim() }).eq('id', editing);
      if (error) throw error;
      logAudit({ action: 'update', entityType: 'brand', entityName: editName.trim(), summary: `แก้ไขแบรนด์ "${editName.trim()}"` });
      if (refresh) await refresh(['tmk_brands']); else if (reload) await reload();
      setEditing(null);
      toast('อัปเดตแบรนด์เรียบร้อย', 'success');
    } catch (err) { toast('บันทึกไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const deleteBrand = async (b) => {
    if (!guardEdit()) return;
    const linked = (TMK.flows || []).filter(f => (f.brandIds || []).includes(b.id) || f.brandId === b.id).length;
    if (!await confirm({ title: 'ลบแบรนด์', body: linked > 0 ? `แบรนด์ "${b.name}" ผูกกับ ${linked} โครงการ — ลบจะปลดป้ายแบรนด์ออก` : `ลบแบรนด์ "${b.name}"?`, danger: true, confirmText: 'ลบ' })) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('tmk_brands').update({ deleted_at: new Date().toISOString() }).eq('id', b.id);
      if (error) throw error;
      logAudit({ action: 'delete', entityType: 'brand', entityName: b.name, summary: `ลบแบรนด์ "${b.name}"` });
      if (refresh) await refresh(['tmk_brands']); else if (reload) await reload();
      setEditing(null);
      toast('ย้ายแบรนด์ไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          try { await supabase.from('tmk_brands').update({ deleted_at: null }).eq('id', b.id); if (refresh) await refresh(['tmk_brands']); else if (reload) await reload(); toast('กู้คืนแบรนด์แล้ว', 'success'); }
          catch (e) { toast('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) { toast('ลบไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  const reorderBrand = async (fromId, toId) => {
    if (!guardEdit()) return;
    if (fromId === toId) return;
    const fromIdx = brands.findIndex(b => b.id === fromId), toIdx = brands.findIndex(b => b.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const reordered = [...brands];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setBusy(true);
    try {
      const results = await Promise.all(reordered.map((b, i) => supabase.from('tmk_brands').update({ sort_order: i + 1 }).eq('id', b.id)));
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;
      if (refresh) await refresh(['tmk_brands']); else if (reload) await reload();
      toast('เรียงลำดับใหม่เรียบร้อย', 'success');
    } catch (err) { toast('เลื่อนไม่สำเร็จ: ' + err.message, 'error'); } finally { setBusy(false); }
  };

  if (need || (brands.length === 0)) {
    // ยังไม่มีแบรนด์ — ถ้าตารางหาย โชว์ป้าย migration, ถ้าตารางมีแต่ว่าง โชว์ empty + ปุ่มเพิ่ม
    // (เรนเดอร์ต่อ — empty state อยู่ในลิสต์ด้านล่างแล้ว ยกเว้นตารางหายจริง)
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl w-full">
      <p className="text-sm text-muted-foreground">แต่ละโครงการเลือกแบรนด์ไปใช้เป็นป้ายกำกับงานได้</p>
      {need ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
            <Icon name="store" className="size-12 opacity-20" />
            <div className="font-semibold">ยังไม่ได้รัน migration</div>
            <div className="text-sm text-muted-foreground">รัน <code className="px-1.5 py-0.5 rounded bg-muted">20260710-flows-brands.sql</code> ใน Supabase → SQL Editor ก่อน แล้วรีเฟรช</div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
            <CardTitle className="text-lg flex items-center gap-2">
              <Icon name="store" className="size-5 text-muted-foreground" /> แบรนด์ทั้งหมด ({brands.length})
            </CardTitle>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Icon name="plus" className="size-4 mr-2" /> เพิ่มแบรนด์
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex flex-col">
              {brands.length === 0 && (
                <div className="p-10 text-center text-muted-foreground">
                  <p className="text-sm">ยังไม่มีแบรนด์ — กด "เพิ่มแบรนด์" เพื่อเริ่ม</p>
                </div>
              )}
              {brands.map((b, idx) => {
                const isOver = dragOver === b.id;
                return (
                  <div key={b.id}
                    draggable
                    onDragStart={() => setDragId(b.id)}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    onDragOver={(e) => { e.preventDefault(); if (dragId && dragId !== b.id) setDragOver(b.id); }}
                    onDragLeave={() => setDragOver(o => o === b.id ? null : o)}
                    onDrop={() => { if (dragId) reorderBrand(dragId, b.id); setDragId(null); setDragOver(null); }}
                    className="flex items-center gap-3 p-4 border-b border-border/50 last:border-b-0 cursor-move transition-colors"
                    style={{ background: isOver ? 'hsl(var(--accent)/0.1)' : 'transparent', opacity: dragId === b.id ? 0.4 : 1 }}>
                    <ReorderButtons label={b.name} index={idx} total={brands.length} disabled={busy}
                      onMove={(d) => reorderBrand(b.id, brands[idx + d].id)} />
                    {b.logoUrl ? (
                      <img src={b.logoUrl} alt={b.name} className="w-10 h-10 rounded-lg object-contain shrink-0 border bg-white" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold shrink-0" style={{ background: (b.color || '#666') + '18', color: b.color || '#666' }}>
                        {b.name?.[0] || '?'}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground text-base truncate">{b.name}</div>
                      {b.tagline && <div className="text-xs text-muted-foreground truncate">{b.tagline}</div>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(b)} title="แก้ไข">
                      <Icon name="pencil" className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) { setShowAdd(false); setNewName(''); setNewLogo(''); setNewTagline(''); setNewColor(PALETTE[0]); } }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icon name="store" className="size-5" /> เพิ่มแบรนด์</DialogTitle>
            <DialogDescription>แบรนด์ใช้เป็นป้ายกำกับ/จัดกลุ่มโครงการ</DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
              {newLogo ? <img src={newLogo} alt="" className="size-10 rounded object-contain bg-white" /> : <div className="size-10 rounded flex items-center justify-center shrink-0 text-white font-bold" style={{ background: newColor }}>{newName.trim()?.[0] || '?'}</div>}
              <div className="min-w-0"><div className="font-semibold text-base truncate">{newName.trim() || 'ชื่อแบรนด์'}</div>{newTagline.trim() && <div className="text-xs text-muted-foreground truncate">{newTagline.trim()}</div>}</div>
            </div>
            <div className="grid gap-2">
              <Label>ชื่อแบรนด์ <span className="text-destructive">*</span></Label>
              <Input placeholder="เช่น TMK, สายเกรซ, OEM" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !busy) addBrand(); }} />
            </div>
            <div className="grid gap-2">
              <Label>คำโปรย (ออปชัน)</Label>
              <Input placeholder="เช่น เสื้อยืดพรีเมียม" value={newTagline} onChange={e => setNewTagline(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>โลโก้ (PNG/SVG)</Label>
              <div className="flex items-start gap-4">
                <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 overflow-hidden relative" style={newLogo ? { background: '#fff' } : {}}>
                  {newLogo ? <img src={newLogo} alt="" className="w-full h-full object-contain" /> : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground"><Icon name="image" className="size-6 mb-1 opacity-50" /><span className="text-[10px] uppercase font-semibold">Upload</span></div>
                  )}
                  <input type="file" accept="image/*" className="hidden" onChange={async e => { try { setNewLogo(await readFileAsBase64(e.target.files?.[0])); } catch (err) { toast(String(err), 'error'); } }} />
                </label>
                {newLogo && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setNewLogo('')}>ลบรูป</Button>}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>สีประจำแบรนด์</Label>
              <ColorPicker value={newColor} onChange={setNewColor} presets={PALETTE} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addBrand} disabled={!newName.trim() || busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          {editing && (() => {
            const b = brands.find(x => x.id === editing);
            if (!b) return null;
            return (
              <>
                <DialogHeader><DialogTitle className="flex items-center gap-2"><Icon name="store" className="size-5" /> แก้ไขแบรนด์: {b.name}</DialogTitle></DialogHeader>
                <div className="grid gap-6 py-4">
                  <div className="grid gap-2"><Label>ชื่อแบรนด์ <span className="text-destructive">*</span></Label><Input value={editName} onChange={e => setEditName(e.target.value)} /></div>
                  <div className="grid gap-2"><Label>คำโปรย</Label><Input value={editTagline} onChange={e => setEditTagline(e.target.value)} /></div>
                  <div className="grid gap-2">
                    <Label>โลโก้</Label>
                    <div className="flex items-start gap-4">
                      <label className="flex flex-col items-center justify-center w-20 h-20 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 overflow-hidden relative" style={editLogo ? { background: '#fff' } : {}}>
                        {editLogo ? <img src={editLogo} alt="" className="w-full h-full object-contain" /> : (
                          <div className="flex flex-col items-center justify-center text-muted-foreground"><Icon name="image" className="size-6 mb-1 opacity-50" /><span className="text-[10px] uppercase font-semibold">Upload</span></div>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={async e => { try { setEditLogo(await readFileAsBase64(e.target.files?.[0])); } catch (err) { toast(String(err), 'error'); } }} />
                      </label>
                      {editLogo && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setEditLogo('')}>ลบรูป</Button>}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>สีประจำแบรนด์</Label>
                    <ColorPicker value={editColor} onChange={setEditColor} presets={PALETTE} />
                  </div>
                </div>
                <DialogFooter className="flex-row justify-between sm:justify-between">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteBrand(b)} disabled={busy}><Icon name="trash" className="size-4 mr-1" /> ลบ</Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>ยกเลิก</Button>
                    <Button onClick={saveEdit} disabled={!editName.trim() || busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
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
