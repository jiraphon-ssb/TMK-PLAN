/* ============================================================
   views-settings-people-parts.jsx — ชิ้นส่วน UI ของแท็บ "ผู้ใช้/สิทธิ์" (แยกจาก views-settings-people.jsx)
   ============================================================
   roleMeta / LOCK_SECTIONS / LockPicker / DutySelect / RoleSelect — ยกออกมาทั้งดุ้น ไม่แก้เนื้อใน
   (component ระดับโมดูล ใช้ร่วมทั้ง dialog เพิ่มผู้ใช้ + dialog แก้ไขผู้ใช้ ใน RolesView)
   ============================================================ */
import { TMK } from './data.js';
import { useNav } from './appNav.jsx';
import { useLang } from './i18n.jsx';
import { Icon } from './components.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

/* ---- component ย่อยระดับโมดูล (ยกออกจาก RolesView — ไม่ให้ถูกสร้างใหม่ทุก render) ---- */
export const roleMeta = {
  admin: { l: 'ผู้ดูแลระบบ', cls: 'chip-accent', icon: 'shield', d: 'จัดการได้ทุกอย่าง รวมถึงสิทธิ์ผู้ใช้' },
  editor: { l: 'แก้ไขได้', cls: 'chip-good', icon: 'pencil', d: 'บันทึกยอดขาย จัดการงาน แก้ไขข้อมูล' },
  viewer: { l: 'ดูอย่างเดียว', cls: '', icon: 'eye', d: 'เปิดดูข้อมูลได้ แต่แก้ไขไม่ได้' }
};
// หน้าที่ล็อกได้ต่อคน (deny-list) — **สร้างจาก NAV_DEF** ไม่ hardcode ซ้ำ
// (เดิม hardcode ไว้ → หน้า "ส่งยอด & ข้อมูล" ที่ลบไปตั้งแต่ PART 102 ยังค้างอยู่ในรายการ ล็อกไปก็ไม่มีผล)
// หน้าหลัก (home) เข้าได้เสมอ · admin ไม่โดนล็อก · หน้าย่อยล็อกได้เฉพาะ Sale (composite "catalog:<sub>")
// NAV_DEF ไม่มี 'settings' (เข้าจากที่อื่น) → ต่อท้ายเอง · 'home' ไม่ให้ล็อก
const NO_LOCK = ['home'];
const WITH_SUBS = ['catalog'];
export function useLockSections() {
  const nav = useNav();
  const { t } = useLang();
  return [
    ...nav.filter(n => !NO_LOCK.includes(n.id)).map(n => ({
      id: n.id, label: n.label, icon: n.icon,
      subs: WITH_SUBS.includes(n.id) ? (n.subs || []).map(s => ({ id: s.id, label: s.label })) : null,
    })),
    { id: 'settings', label: t('navSystem'), icon: 'system', subs: null },
  ];
}

// ปุ่มสองสถานะ: เข้าได้ / ล็อก — ชัดกว่าชิปติ๊กเดิมที่ต้องอ่านคำอธิบายก่อนถึงจะรู้ว่าติ๊ก = ล็อก
function AccessToggle({ locked, onChange, disabled, label, small }) {
  const base = small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[11.5px]';
  return (
    <span className={'inline-flex shrink-0 rounded-md border p-0.5 ' + (disabled ? 'opacity-40' : '')} style={{ borderColor: 'var(--line)' }}>
      <button type="button" disabled={disabled} aria-pressed={!locked} aria-label={`${label}: เข้าได้`}
        onClick={() => onChange(false)}
        className={'rounded font-medium transition-colors ' + base + (!locked ? ' bg-[var(--good)] text-white' : ' text-muted-foreground hover:bg-muted')}>เข้าได้</button>
      <button type="button" disabled={disabled} aria-pressed={locked} aria-label={`${label}: ล็อก`}
        onClick={() => onChange(true)}
        className={'rounded font-medium transition-colors inline-flex items-center gap-1 ' + base + (locked ? ' bg-destructive text-white' : ' text-muted-foreground hover:bg-muted')}>
        <Icon name="lock" className="size-3" />ล็อก</button>
    </span>
  );
}

// กลุ่มเลือกหน้าที่จะล็อก — ใช้ทั้ง modal แก้ไข + dialog เพิ่มผู้ใช้ (admin = ซ่อน เข้าได้ทุกหน้า)
export const LockPicker = ({ role, locks, setLocks }) => {
  const sections = useLockSections();
  if (role === 'admin') return null;
  // ล็อกทั้งหมวด = ตัดคีย์หน้าย่อยทิ้ง (ซ้ำซ้อน) · ปลดล็อกหมวด = เอาเฉพาะคีย์หมวดออก
  const set = (key, locked) => {
    const isSection = key.indexOf(':') < 0;
    setLocks(locked
      ? [...new Set([...locks.filter(x => !(isSection && x.startsWith(key + ':'))), key])]
      : locks.filter(x => x !== key));
  };
  const nLocked = sections.filter(s => locks.includes(s.id)).length
    + sections.reduce((n, s) => n + (locks.includes(s.id) ? 0 : (s.subs || []).filter(sub => locks.includes(`${s.id}:${sub.id}`)).length), 0);
  const allKeys = sections.map(s => s.id);
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="mb-0">การเข้าถึงหน้า</Label>
        <span className="text-xs text-muted-foreground">{nLocked ? `ล็อกอยู่ ${nLocked} หน้า` : 'เข้าได้ทุกหน้า'}</span>
        <span className="ml-auto flex items-center gap-2">
          <button type="button" className="text-[11.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setLocks(allKeys)}>ล็อกทั้งหมด</button>
          <button type="button" className="text-[11.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={() => setLocks([])}>ปลดล็อกทั้งหมด</button>
        </span>
      </div>
      <div className="rounded-lg border divide-y" style={{ borderColor: 'var(--line)' }}>
        {sections.map(s => {
          const on = locks.includes(s.id);
          const subLocked = (s.subs || []).filter(sub => locks.includes(`${s.id}:${sub.id}`)).length;
          return (
            <div key={s.id}>
              <div className="flex items-center gap-2 px-3 py-2">
                <Icon name={on ? 'lock' : s.icon} className={'size-4 shrink-0 ' + (on ? 'text-destructive' : 'text-muted-foreground')} />
                <span className={'text-sm min-w-0 flex-1 truncate ' + (on ? 'text-destructive font-medium' : '')}>{s.label}</span>
                {!on && subLocked > 0 && <span className="text-[11px] text-destructive shrink-0">ล็อกหน้าย่อย {subLocked}</span>}
                <AccessToggle locked={on} label={s.label} onChange={(v) => set(s.id, v)} />
              </div>
              {s.subs && s.subs.length > 0 && (
                <div className={'px-3 pb-2 flex flex-col gap-1 ' + (on ? 'opacity-40 pointer-events-none' : '')}>
                  {s.subs.map(sub => {
                    const key = `${s.id}:${sub.id}`; const sOn = on || locks.includes(key);
                    return (
                      <div key={key} className="flex items-center gap-2 pl-6">
                        <span className="text-[12px] text-muted-foreground min-w-0 flex-1 truncate">{sub.label}</span>
                        <AccessToggle small locked={sOn} disabled={on} label={sub.label} onChange={(v) => set(key, v)} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">หน้าที่ล็อกจะโชว์จาง + มีกุญแจในเมนู กดแล้วแจ้งว่าไม่มีสิทธิ์ · ล็อกทั้งหมวด หรือเลือกล็อกเฉพาะหน้าย่อยก็ได้ · หน้าหลักเข้าได้เสมอ · แอดมินไม่ถูกล็อก</p>
    </div>
  );
};

// dropdown ย่อ (แทนชิปเยอะๆ) — ใช้ร่วมทั้ง add + edit · Radix Select ห้าม value="" → ใช้ '__none__'
export const DutySelect = ({ value, onChange }) => (
  <Select value={value || '__none__'} onValueChange={(v) => onChange(v === '__none__' ? '' : v)}>
    <SelectTrigger className="bg-background"><SelectValue placeholder="— ไม่ระบุ —" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="__none__">— ไม่ระบุ —</SelectItem>
      {(TMK.duties || []).map(d => (
        <SelectItem key={d.id} value={d.id}>
          <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: d.color }} />{d.name}</span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
export const RoleSelect = ({ value, onChange }) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
    <SelectContent>
      {Object.entries(roleMeta).map(([k, v]) => (
        <SelectItem key={k} value={k}>
          <span className="flex items-center gap-2"><Icon name={v.icon} className="size-4" />{v.l}</span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
