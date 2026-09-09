/* ============================================================
   whatsNewPage.jsx — หน้า "มีอะไรใหม่" (แยกออกจาก WhatsNew.jsx เพื่อ first paint)
   ============================================================
   ไฟล์นี้เป็นที่เดียวที่ import CHANGELOG (~216 KB ของข้อความย้อนหลังทุกเวอร์ชัน)
   App.jsx โหลดแบบ lazy → entry chunk ไม่ต้องแบกข้อความที่ผู้ใช้ยังไม่ได้กดเปิดอ่าน
   ⚠️ อย่า import ไฟล์นี้แบบ static จากที่ไหน (จะดึง changelog กลับเข้า first paint)
   ============================================================ */
import { useState, useEffect } from 'react';
import { CHANGELOG } from './changelog.js';
import { APP_VERSION } from './appVersion.js';
import { markVersionSeen } from './WhatsNew.jsx';
import { Icon, N } from './components.jsx';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SearchInput } from '@/components/ui/search-input';

const TYPE_META = {
  feature:     { c: 'var(--good)',     l: 'ฟีเจอร์ใหม่' },
  improvement: { c: 'var(--accent-2)', l: 'ปรับปรุง' },
  fix:         { c: 'var(--info)',     l: 'อัปเดต & แก้บั๊ก' },
  release:     { c: 'var(--warn)',     l: 'เปิดตัว' },
};
function splitEntry(text) {
  const t = String(text || '').trim();
  const i = t.indexOf(':');
  if (i > 0 && i < 90) return { head: t.slice(0, i).trim(), body: t.slice(i + 1).trim() };
  const j = t.indexOf(' — ');
  if (j > 0 && j < 90) return { head: t.slice(0, j).trim(), body: t.slice(j + 3).trim() };
  return { head: t.length > 80 ? t.slice(0, 80).trim() + '…' : t, body: t.length > 80 ? t : '' };
}
// ป้ายชนิดต่อรายการ (เดา จากคำในข้อความ) — ให้กวาดตาแยกออกว่าอันไหนของใหม่/แก้บั๊ก
function entryKind(text) {
  const t = String(text || '');
  if (/แก้บั๊ก|แก้บัค|บั๊ก|แก้เตือนผิด|แก้ปัญหา/.test(t)) return { l: 'แก้บั๊ก', c: 'var(--bad)' };
  if (/^ใหม่|เพิ่ม|ใหม่:/.test(t)) return { l: 'ของใหม่', c: 'var(--good)' };
  if (/รื้อ|ยุบ|เปลี่ยน|จัดใหม่|ปรับ/.test(t)) return { l: 'ปรับปรุง', c: 'var(--accent)' };
  return { l: 'ปรับปรุง', c: 'var(--accent)' };
}
const SHOW_FIRST = 5;   // ต่อเวอร์ชัน — เหลือกด "ดูทั้งหมด"

function ChangeItem({ it, tone, q }) {
  const [open, setOpen] = useState(false);
  const obj = it && typeof it === 'object';
  const text = obj ? it.text : it;
  const { head, body } = splitEntry(text);
  const kind = entryKind(text);
  const hit = q && String(text).toLowerCase().includes(q);
  return (
    <div className="flex items-start gap-2.5" style={hit ? { background: 'var(--warn-soft)', borderRadius: 8, padding: '4px 6px', margin: '-4px -6px' } : undefined}>
      <span className="grid place-items-center rounded-md flex-none mt-px" style={{ width: 21, height: 21, background: `color-mix(in srgb, ${tone} 13%, transparent)`, color: tone }}>
        <Icon name={obj && it.icon ? it.icon : 'checkCheck'} className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13.5px] font-semibold leading-snug" style={{ color: 'var(--ink)' }}>{head}</span>
          <span className="text-[10px] font-medium rounded-full px-1.5 py-px shrink-0" style={{ color: kind.c, background: `color-mix(in srgb, ${kind.c} 12%, transparent)` }}>{kind.l}</span>
        </div>
        {body && (<>
          <p className={'m-0 mt-0.5 text-[12.5px] leading-relaxed' + (open ? '' : ' line-clamp-2')} style={{ color: 'var(--ink-3)' }}>{body}</p>
          {body.length > 120 && (
            <button type="button" onClick={() => setOpen(v => !v)} className="mt-0.5 text-[11.5px] font-medium hover:underline" style={{ color: 'var(--accent)' }}>
              {open ? 'ย่อ' : 'อ่านต่อ'}
            </button>
          )}
        </>)}
      </div>
    </div>
  );
}

export function WhatsNewPage() {
  useEffect(() => { markVersionSeen(); }, []);
  const [q, setQ] = useState('');
  const [openVer, setOpenVer] = useState({});   // ver → true = กางทุกรายการ
  const ql = q.trim().toLowerCase();
  if (!CHANGELOG.length) return null;
  // รวมบล็อกที่เป็นเวอร์ชันเดียวกันให้เป็นการ์ดเดียว (changelog.js มี v เดียวกันหลายก้อน เช่น improvement + feature)
  const merged = [];
  CHANGELOG.forEach(u => {
    const same = merged.find(x => x.ver === u.ver);
    if (same) { same.items = [...(same.items || []), ...(u.items || [])]; return; }
    merged.push({ ...u, items: [...(u.items || [])] });
  });
  // ค้นหา: กรองเฉพาะเวอร์ชันที่มีรายการตรงคำค้น + ตัดรายการที่ไม่ตรงออก
  const list = ql
    ? merged.map(u => ({ ...u, items: (u.items || []).filter(it => String(typeof it === 'object' ? it.text : it).toLowerCase().includes(ql)) })).filter(u => u.items.length)
    : merged;
  const nHit = ql ? list.reduce((a, u) => a + u.items.length, 0) : 0;
  return (
    <div className="content-inner pb-6">
      <div className="mx-auto w-full" style={{ maxWidth: 760 }}>
      {/* หัวหน้า + ค้นหา */}
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <span className="grid size-8 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] flex-none"><Icon name="sparkle" className="size-4" /></span>
        <div className="min-w-0">
          <h1 className="m-0 text-base font-semibold leading-tight">มีอะไรใหม่</h1>
          <div className="text-xs text-muted-foreground">ประวัติการอัปเดตของระบบ TMK</div>
        </div>
        <Badge variant="outline" className="ml-auto rounded-full font-medium text-[11px] shrink-0" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>v{APP_VERSION} ล่าสุด</Badge>
      </div>
      <div className="mb-4">
        <SearchInput value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาในประวัติอัปเดต (เช่น ออเดอร์ · คนทัก · แก้บั๊ก)" className="h-9" />
        {ql && <div className="mt-1.5 text-[12px] text-muted-foreground">พบ {nHit} รายการ ใน {list.length} เวอร์ชัน{nHit === 0 ? ' — ลองคำอื่น' : ''}</div>}
      </div>

      {/* timeline */}
      <div className="relative">
        <span className="absolute left-[13px] top-2 bottom-2 w-px" style={{ background: 'var(--line)' }} aria-hidden="true" />
        <div className="flex flex-col gap-4">
          {list.map((u, i) => {
            const m = TYPE_META[u.type] || TYPE_META.fix;
            const items = u.items || [];
            const isLatest = !ql && i === 0;
            const expanded = ql ? true : !!openVer[u.ver];
            const shown = expanded ? items : items.slice(0, SHOW_FIRST);
            return (
              <div key={u.ver + '-' + i} className="relative pl-9">
                <span className="absolute left-[3px] top-1 grid size-[21px] place-items-center rounded-full border-2 bg-background z-[1]"
                  style={{ borderColor: isLatest ? 'var(--accent)' : 'var(--line)' }}>
                  <span className="size-2 rounded-full" style={{ background: isLatest ? 'var(--accent)' : 'var(--ink-4)' }} />
                </span>
                <Card className={'p-3.5 sm:p-4 transition-colors ' + (isLatest ? '' : 'bg-card/60')}
                  style={isLatest ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent-soft)' } : undefined}>
                  <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: items.length ? 10 : 0 }}>
                    <span className="text-[13px] font-bold num">v{u.ver}</span>
                    <Badge className="rounded-full font-medium border-transparent text-[10.5px] px-2 py-0" style={{ background: m.c, color: '#fff' }}>{m.l}</Badge>
                    {isLatest && <Badge variant="secondary" className="rounded-full text-[10.5px] px-2 py-0">ใหม่</Badge>}
                    <span className="text-[11px] text-muted-foreground">· {N(items.length)} รายการ</span>
                    <span className="text-[11px] text-muted-foreground ml-auto">{u.date}</span>
                  </div>
                  {items.length > 0 && (
                    <div className="flex flex-col gap-3">
                      {shown.map((it, j) => <ChangeItem key={j} it={it} tone={m.c} q={ql} />)}
                    </div>
                  )}
                  {!ql && items.length > SHOW_FIRST && (
                    <button type="button" onClick={() => setOpenVer(o => ({ ...o, [u.ver]: !o[u.ver] }))}
                      className="mt-3 text-[12px] font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                      {expanded ? 'ย่อรายการ' : `ดูทั้งหมด ${N(items.length)} รายการ`}
                    </button>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      </div>
      </div>
    </div>
  );
}
