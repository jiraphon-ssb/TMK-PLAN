/* ============================================================
   views-settings-people.jsx — แท็บ "ผู้ใช้/สิทธิ์" (PART 84 REFACTOR-1 · แยกจาก views-settings-tabs)
   ============================================================
   admin people-management (RolesView) · behavior-preserving file-split · re-export กลับที่ views-settings-tabs
   - DutiesView (แท็บ "หน้าที่/ตำแหน่ง") ย้ายไป views-settings-duties.jsx แล้ว re-export ต่อจากที่นี่
   - roleMeta / LOCK_SECTIONS / LockPicker / DutySelect / RoleSelect ย้ายไป views-settings-people-parts.jsx
   ============================================================ */
import { useState } from 'react';
import { TMK } from './data.js';
import { Icon, Avatar } from './components.jsx';
import { useData } from './dataContext.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit, diffFields } from './lib/audit.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { guardAdmin } from './saleWidgets.jsx';
import { toast, confirm } from './lib/appBus.js';
import { roleMeta, LockPicker, DutySelect, RoleSelect } from './views-settings-people-parts.jsx';

/* DutiesView (หน้าที่/ตำแหน่ง) แยกไป views-settings-duties.jsx — re-export กัน consumer แก้ */
export { DutiesView } from './views-settings-duties.jsx';

export function RolesView() {
  const [userQuery, setUserQuery] = useState('');   // ค้นหาผู้ใช้ในรายการ
  const { reload, refresh } = useData() || {};
  // หน้าที่ — ดึงจาก tmk_duties (Supabase) — เพิ่ม/แก้/ลบได้ใน tab "หน้าที่"
  const DUTIES = TMK.duties || [];

  // ใช้ TMK.roles + TMK.staff โดยตรง (re-render เมื่อ Supabase อัปเดต)
  const users = (TMK.roles || []).map(r => {
    const s = (TMK.staff || []).find(st => st.email === r.email);
    return {
      ...r,
      department: r.department || s?.role || '',
      color: r.color || s?.color || '#3b82f6',
      avatar: r.avatarUrl || s?.avatarUrl || '',
    };
  });

  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('viewer');
  const [editDutyId, setEditDutyId] = useState('');
  const [editLocks, setEditLocks] = useState([]); // หน้าที่ล็อกของ user ที่กำลังแก้
  const [busy, setBusy] = useState(false);
  // ตั้ง/รีเซ็ตรหัสผ่านเข้าระบบ (แอดมินเท่านั้น)
  const [pwInput, setPwInput] = useState('');
  const [pwShow, setPwShow] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  // New user form
  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [newDutyId, setNewDutyId] = useState(DUTIES[0]?.id || '');
  const [newLocks, setNewLocks] = useState([]);

  const startEdit = (u) => {
    setEditing(u.email);
    setEditName(u.name);
    setEditRole(u.role);
    setEditDutyId(u.dutyId || '');
    setEditLocks(Array.isArray(u.lockedSections) ? u.lockedSections : []);
    setPwInput(''); setPwShow(false);
  };

  // สุ่มรหัสผ่านชั่วคราวให้แอดมินส่งต่อ
  const genPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    const arr = new Uint32Array(12);
    (window.crypto || window.msCrypto).getRandomValues(arr);
    for (let i = 0; i < 12; i++) s += chars[arr[i] % chars.length];
    setPwInput(s); setPwShow(true);
  };

  // ตั้ง/รีเซ็ตรหัสผ่านเข้าระบบของ user (ผ่าน RPC tmk_admin_set_password — enforce admin ที่ DB)
  const resetPassword = async (email) => {
    if (!guardAdmin()) return;
    if (pwInput.length < 6) { if (toast) toast('รหัสผ่านอย่างน้อย 6 ตัวอักษร', 'error'); return; }
    setPwBusy(true);
    try {
      const { data, error } = await supabase.rpc('tmk_admin_set_password', { p_email: email, p_password: pwInput });
      if (error) throw error;
      if (!data?.ok) {
        const m = { forbidden: 'เฉพาะแอดมินเท่านั้น', too_short: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร', not_found: 'ยังไม่มีบัญชีเข้าระบบของอีเมลนี้ — สร้างใน Supabase Dashboard ก่อน' }[data?.error] || ('ตั้งรหัสไม่สำเร็จ' + (data?.error ? ': ' + data.error : ''));
        if (toast) toast(m, 'error');
        return;
      }
      logAudit({ action: 'update', entityType: 'user', entityName: email, summary: `รีเซ็ตรหัสผ่าน ${email}` }); // ไม่ log ตัวรหัส
      if (toast) toast(`ตั้งรหัสผ่านให้ ${email} แล้ว — ส่งรหัสนี้ให้ผู้ใช้`, 'success');
      setPwInput(''); setPwShow(false);
    } catch (err) {
      if (toast) toast('ตั้งรหัสไม่สำเร็จ: ' + (err.message || ''), 'error');
    } finally {
      setPwBusy(false);
    }
  };

  // Save edit ลง Supabase จริง — defensive: ลอง column ใหม่ก่อน → fallback
  const saveEdit = async () => {
    if (!guardAdmin()) return;
    setBusy(true);
    try {
      const duty = DUTIES.find(d => d.id === editDutyId);

      // === 1. Update tmk_user_roles ===
      // ลองรวม duty_id + locked_sections ก่อน (ถ้า migration รันแล้ว)
      const rolePayload = {
        email: editing,
        role: editRole,
        name: editName,
        department: duty?.name || '',
        duty_id: editDutyId || null,
        locked_sections: editRole === 'admin' ? [] : editLocks, // admin ไม่โดนล็อกเสมอ (20260702 · graceful)
      };
      let { error: e1 } = await supabase.from('tmk_user_roles').upsert(rolePayload);
      // คอลัมน์ locked_sections ยังไม่ migrate → ตัดออกแล้วลองใหม่ (คง name/duty ไว้)
      if (e1 && /locked_sections/i.test(e1.message || '')) {
        delete rolePayload.locked_sections;
        ({ error: e1 } = await supabase.from('tmk_user_roles').upsert(rolePayload));
      }
      // ถ้า column ไม่มี (duty_id หรืออื่น) → ลองแบบไม่มี
      if (e1 && /column .* does not exist/i.test(e1.message)) {
        console.warn('Falling back: duty_id column missing', e1.message);
        const { error: e1b } = await supabase.from('tmk_user_roles').upsert({
          email: editing,
          role: editRole,
        });
        if (e1b) throw e1b;
      } else if (e1) throw e1;

      // === 2. Update tmk_staff (รูป + ชื่อ + สี) ===
      const existingStaff = (TMK.staff || []).find(s => s.email === editing);
      const staffId = existingStaff?.id || ('s-' + editing.replace(/[^a-z0-9]/gi, '').toLowerCase());
      const { error: e2 } = await supabase.from('tmk_staff').upsert({
        id: staffId,
        name: editName,
        role: duty?.name || existingStaff?.role || 'Staff',
        email: editing,
        color: duty?.color || existingStaff?.color || '#3b82f6',
      });
      if (e2) {
        // log แต่ไม่ throw — let user_roles save succeed
        console.error('tmk_staff upsert failed:', e2);
        if (toast) toast('บันทึกรูป/ชื่อใน staff ไม่สำเร็จ: ' + e2.message, 'warn');
      }

      // before→after สิทธิ์ (security-critical) — role + หน้าที่ล็อก
      const before = users.find(x => x.email === editing) || {};
      const lockLabel = (arr) => (Array.isArray(arr) && arr.length ? `${arr.length} หน้า (${arr.join(', ')})` : 'ไม่ล็อก');
      const roleChanges = diffFields(
        { role: before.role, locks: before.lockedSections || [] },
        { role: editRole, locks: editRole === 'admin' ? [] : editLocks },
        [['role', 'สิทธิ์'], { key: 'locks', label: 'หน้าที่ล็อก', fmt: lockLabel }],
      );
      logAudit({
        action: 'update', entityType: 'user', entityName: editing,
        severity: roleChanges.some(c => c.label === 'สิทธิ์') ? 'warn' : undefined, // เปลี่ยน role = สำคัญ
        summary: `แก้ไขผู้ใช้ ${editName} (${editing})`,
        changes: roleChanges.length ? roleChanges : null,
      });

      // === 3. Force reload data (in case realtime doesn't fire) ===
      if (refresh) await refresh(['tmk_user_roles', 'tmk_staff']); else if (reload) await reload();

      setEditing(null);
      if (toast) toast('อัปเดตผู้ใช้เรียบร้อย', 'success');
    } catch (err) {
      console.error(err);
      if (toast) toast('บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelEdit = () => { setEditing(null); setPwInput(''); setPwShow(false); };

  // Delete user ลบจาก Supabase
  const deleteUser = async (email) => {
    if (!guardAdmin()) return;
    if (!await confirm?.({ title: 'ลบผู้ใช้', body: `ลบผู้ใช้ ${email}?`, danger: true, confirmText: 'ลบ' })) return;
    setBusy(true);
    try {
      const ts = new Date().toISOString();
      const { error: er1 } = await supabase.from('tmk_user_roles').update({ deleted_at: ts }).eq('email', email);
      if (er1) throw er1;
      await supabase.from('tmk_staff').update({ deleted_at: ts }).eq('email', email);
      logAudit({ action: 'delete', entityType: 'user', entityName: email, summary: `ลบผู้ใช้ ${email}` });
      if (refresh) await refresh(['tmk_user_roles', 'tmk_staff']); else if (reload) await reload();
      setEditing(null);
      if (toast) toast('ย้ายผู้ใช้ไปถังขยะแล้ว', 'success', 6000, {
        label: 'เลิกทำ',
        onClick: async () => {
          if (!guardAdmin()) return;
          try {
            await supabase.from('tmk_user_roles').update({ deleted_at: null }).eq('email', email);
            await supabase.from('tmk_staff').update({ deleted_at: null }).eq('email', email);
            logAudit({ action: 'restore', entityType: 'user', entityName: email, summary: `กู้คืนผู้ใช้ ${email}` });
            if (refresh) await refresh(['tmk_user_roles', 'tmk_staff']); else if (reload) await reload();
            toast?.('กู้คืนผู้ใช้แล้ว', 'success');
          } catch (e) { toast?.('กู้คืนไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
        },
      });
    } catch (err) {
      if (toast) toast('ลบไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Add user ลง Supabase จริง
  const addUser = async () => {
    if (!guardAdmin()) return;
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { if (toast) toast('รูปแบบอีเมลไม่ถูกต้อง', 'error'); return; }
    if (users.find(u => u.email === email)) {
      if (toast) toast('อีเมลนี้มีอยู่แล้ว', 'warn');
      return;
    }
    setBusy(true);
    try {
      const name = newName.trim() || email.split('@')[0];
      const duty = DUTIES.find(d => d.id === newDutyId);
      const dutyColor = duty?.color || '#3b82f6';

      // 1. Upsert tmk_user_roles (+ deleted_at:null → กู้คืนถ้าเคยลบ แทน error PK)
      const rolePayload = {
        email,
        role: newRole,
        name,
        department: duty?.name || '',
        duty_id: newDutyId || null,
        color: dutyColor,
        created_by: 'system',
        deleted_at: null,
        locked_sections: newRole === 'admin' ? [] : newLocks, // admin ไม่โดนล็อกเสมอ (20260702 · graceful)
      };
      let { error: e1 } = await supabase.from('tmk_user_roles').upsert(rolePayload);
      // คอลัมน์ locked_sections ยังไม่ migrate → ตัดออกแล้วลองใหม่
      if (e1 && /locked_sections/i.test(e1.message || '')) {
        delete rolePayload.locked_sections;
        ({ error: e1 } = await supabase.from('tmk_user_roles').upsert(rolePayload));
      }
      if (e1) throw e1;

      // 2. Upsert tmk_staff (+ deleted_at:null)
      const staffId = 's-' + email.replace(/[^a-z0-9]/gi, '').toLowerCase();
      const { error: e2 } = await supabase.from('tmk_staff').upsert({
        id: staffId,
        name,
        role: duty?.name || 'Staff',
        email,
        color: dutyColor,
        deleted_at: null,
      });
      if (e2) throw e2;

      logAudit({ action: 'create', entityType: 'user', entityName: email, summary: `เพิ่มผู้ใช้ ${name} (${email})` });
      setNewEmail(''); setNewName(''); setNewRole('editor'); setNewDutyId(DUTIES[0]?.id || ''); setNewLocks([]); setShowAdd(false);
      if (refresh) await refresh(['tmk_user_roles', 'tmk_staff']); else if (reload) await reload();
      if (toast) toast('เพิ่มผู้ใช้เรียบร้อย', 'success');
    } catch (err) {
      console.error(err);
      if (toast) toast('เพิ่มไม่สำเร็จ: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // นับ tasks ที่ user รับผิดชอบ — match by name หรือ duty
  const taskCount = (name, dutyName) => (TMK.tasks || []).filter(t => {
    const resp = Array.isArray(t.responsible) ? t.responsible : String(t.responsible || '').split(',').map(s => s.trim());
    return resp.includes(name) || (dutyName && resp.includes(dutyName));
  }).length;

  const uq = userQuery.trim().toLowerCase();
  const shownUsers = uq ? users.filter(u => [u.name, u.email, u.department].some(x => String(x || '').toLowerCase().includes(uq))) : users;

  const closeAdd = () => { setShowAdd(false); setNewEmail(''); setNewName(''); setNewRole('editor'); setNewDutyId(DUTIES[0]?.id || ''); setNewLocks([]); };

  return (
    <div className="flex flex-col gap-4 max-w-3xl w-full">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-border/50 bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="shield" className="size-5 text-primary" /> ผู้ใช้ & สิทธิ์ <span className="text-sm font-normal text-muted-foreground">({users.length})</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {users.length > 6 && <SearchInput placeholder="ค้นหาชื่อ / อีเมล" value={userQuery} onChange={e => setUserQuery(e.target.value)} wrapperClassName="w-[190px]" />}
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Icon name="userPlus" className="size-4 mr-2" /> เพิ่มผู้ใช้ใหม่
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="flex flex-col">
            {shownUsers.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">ไม่พบผู้ใช้ที่ตรงกับ "{userQuery}"</div>}
            {shownUsers.map(u => {
              const tasks = taskCount(u.name, u.department);
              const meta = roleMeta[u.role] || { l: u.role, cls: '' };
              
              return (
                <div key={u.email} className="flex flex-wrap items-center gap-4 p-4 border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <Avatar name={u.name} color={u.color || '#888'} size={40} />
                  <div className="flex-1 min-w-[150px]">
                    <div className="font-bold text-foreground text-sm truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{u.email}</div>
                  </div>
                  
                  <div className="flex items-center justify-end gap-3 flex-wrap ml-auto">
                    {u.department && (
                      <Badge variant="outline" className="font-semibold" style={{ background: (u.color || '#666') + '10', color: u.color || '#666', borderColor: (u.color || '#666') + '30' }}>
                        {u.department}
                      </Badge>
                    )}
                    {tasks > 0 && (
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{tasks} งาน</span>
                    )}
                    {(u.lockedSections || []).length > 0 && (
                      <Badge variant="outline" className="whitespace-nowrap text-muted-foreground gap-1"><Icon name="lock" className="size-3" />ล็อก {u.lockedSections.length} หน้า</Badge>
                    )}
                    <Badge variant="outline" className={`whitespace-nowrap ${meta.cls === 'chip-good' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : meta.cls === 'chip-accent' ? 'bg-primary/10 text-primary border-primary/20' : ''}`}>
                      {meta.l}
                    </Badge>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(u)} title="แก้ไข" className="shrink-0">
                      <Icon name="pencil" className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* เพิ่มผู้ใช้ใหม่ Dialog */}
      <Dialog open={showAdd} onOpenChange={(open) => { if (!open) closeAdd(); }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon name="userPlus" className="size-5" /> เพิ่มผู้ใช้ใหม่
            </DialogTitle>
            <DialogDescription className="sr-only">เพิ่มสมาชิกใหม่เข้าทีม</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-3 max-h-[70vh] overflow-y-auto px-1">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>อีเมล <span className="text-destructive">*</span></Label>
                <Input type="email" placeholder="name@tmk.co" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>ชื่อที่แสดง</Label>
                <Input placeholder="เว้นว่าง = ใช้ชื่อหน้าอีเมล" value={newName} onChange={e => setNewName(e.target.value)} />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>หน้าที่ / แผนก</Label>
                <DutySelect value={newDutyId} onChange={setNewDutyId} />
              </div>
              <div className="grid gap-1.5">
                <Label>สิทธิ์การเข้าถึง</Label>
                <RoleSelect value={newRole} onChange={(v) => { setNewRole(v); if (v === 'admin') setNewLocks([]); }} />
              </div>
            </div>

            <LockPicker role={newRole} locks={newLocks} setLocks={setNewLocks} />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAdd} disabled={busy}>ยกเลิก</Button>
            <Button onClick={addUser} disabled={!newEmail.trim() || busy}>
              {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="userPlus" className="mr-2 size-4" />}
              {busy ? 'กำลังบันทึก…' : 'เพิ่มผู้ใช้'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* แก้ไขผู้ใช้ Dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) cancelEdit(); }}>
        <DialogContent className="sm:max-w-[640px]">
          {editing && (() => {
            const u = users.find(x => x.email === editing);
            if (!u) return null;
            const tasks = taskCount(u.name, u.department);
            
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon name="pencil" className="size-5" /> แก้ไขผู้ใช้
                  </DialogTitle>
                  <DialogDescription className="truncate">
                    {u.email}
                  </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-4 py-3 max-h-[72vh] overflow-y-auto px-1">
                  <div className="flex gap-4 items-end">
                    <Avatar name={u.name} color={u.color || 'var(--ink-3)'} size={52} />
                    <div className="grid gap-1.5 flex-1">
                      <Label>ชื่อที่แสดง <span className="text-xs font-normal text-muted-foreground">(ลิงก์กับงาน)</span></Label>
                      <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="ชื่อที่ใช้แสดงในระบบ" className="font-semibold" />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label>หน้าที่ / แผนก</Label>
                      <DutySelect value={editDutyId} onChange={setEditDutyId} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>สิทธิ์การเข้าถึง</Label>
                      <RoleSelect value={editRole} onChange={(v) => { setEditRole(v); if (v === 'admin') setEditLocks([]); }} />
                    </div>
                  </div>

                  <LockPicker role={editRole} locks={editLocks} setLocks={setEditLocks} />

                  {tasks > 0 && (
                    <div className="text-xs text-primary flex items-center gap-2 bg-primary/10 px-2.5 py-1.5 rounded">
                      <Icon name="listChecks" className="size-4 shrink-0" /> เปลี่ยนชื่อจะอัปเดตใน {tasks} งานที่เกี่ยวข้อง
                    </div>
                  )}

                  <div className="grid gap-1.5 pt-3 border-t border-dashed">
                    <Label>รหัสผ่านเข้าระบบ</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input type={pwShow ? 'text' : 'password'} value={pwInput} onChange={e => setPwInput(e.target.value)} placeholder="ตั้งรหัสใหม่ (อย่างน้อย 6 ตัว)" autoComplete="new-password" className="pr-10" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full w-10 text-muted-foreground hover:text-foreground" onClick={() => setPwShow(!pwShow)}>
                          <Icon name="eye" className="size-4" />
                        </Button>
                      </div>
                      <Button type="button" variant="outline" size="icon" onClick={genPassword} disabled={pwBusy} title="สุ่มรหัส">
                        <Icon name="sparkle" className="size-4 text-primary" />
                      </Button>
                      <Button type="button" onClick={() => resetPassword(u.email)} disabled={pwBusy || pwInput.length < 6}>
                        {pwBusy ? 'กำลังตั้ง...' : 'ตั้งรหัส'}
                      </Button>
                    </div>
                  </div>
                </div>

                <DialogFooter className="flex-row sm:justify-between pt-2">
                  <Button variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteUser(u.email)} disabled={busy}>
                    <Icon name="trash" className="mr-2 size-4" /> ลบ
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={cancelEdit} disabled={busy}>ยกเลิก</Button>
                    <Button onClick={saveEdit} disabled={!editName.trim() || busy}>
                      {busy ? <Icon name="loader" className="mr-2 size-4 animate-spin" /> : <Icon name="check" className="mr-2 size-4" />}
                      {busy ? 'กำลังบันทึก...' : 'บันทึก'}
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
