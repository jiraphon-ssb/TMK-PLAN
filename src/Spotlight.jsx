/* Spotlight (⌘K command palette) — แยกจาก App god-file (PART 84 REFACTOR-1) */
import { useState, useEffect, useRef, useMemo } from 'react';
import { TMK } from './data.js';
import { supabase } from './lib/supabaseClient.js';
import { fetchProductDesigns } from './lib/productCatalog.js';
import { Icon, B, Bk } from './components.jsx';
import { safeSearchTerm } from './lib/uiLogic.js';
import { isAdmin, myNamesOf } from './lib/roleAccess.js';
import { useUser } from './userContext.jsx';

/* ค้นหาของจริง (PART 116) — เดิมค้นจาก TMK.orders/TMK.customers ซึ่งเป็น "ระบบออเดอร์ยุคเก่า"
   ที่ไม่มีหน้าไหนใช้แล้ว → พิมพ์เลขออเดอร์จริงของ Sale หาไม่เจอสักใบ (และยังโหลด 2 ตารางนั้นทุกครั้งที่เปิดแอป)
   ตอนนี้ยิงค้นที่ฐานข้อมูลจริงตอนพิมพ์ (debounce 250ms · ตัวละ 5 แถว) → ไม่มีต้นทุนตอนเปิดแอปเลย */
const REMOTE_LIMIT = 5;
/* ⚠️ ต้องกรองสิทธิ์ที่นี่ด้วย — RLS เป็น Tier 1/2 (authenticated อ่านได้ทุกแถว)
   ตัวกรองฝั่งเว็บจึงเป็นด่านเดียว · หน้าออเดอร์/ประสิทธิภาพเซลล์ใช้ `orderVisibleTo` เสมอ
   ถ้า ⌘K ไม่กรอง = ทางลัดเห็นยอดเงิน/เบอร์ลูกค้าของเซลล์คนอื่น (และของหน้าที่ถูกล็อกด้วย)
   กรองที่ฝั่ง server (`.in('salesperson', …)`) = ไม่ดึงของคนอื่นมาที่เครื่องตั้งแต่แรก
   user ยังไม่โหลด → myNames = [] → `.in(...,[])` คืน 0 แถว = fail-closed (ถูกต้อง) */
async function searchRemote(term, { seeAll, names }) {
  // ตัดอักขระที่ทำ or=(...) พัง (มีเทสที่ lib/uiLogic.js) แล้วค่อย escape ไวลด์การ์ด % _
  const safe = safeSearchTerm(term);
  if (!safe) return { orders: [], customers: [], designs: [], err: false };
  const like = `%${safe.replace(/[%_]/g, m => '\\' + m)}%`;

  let oq = supabase.from('tmk_mp_orders').select('order_no,customer_name,sales,order_date,source,status,salesperson')
    .or(`order_no.ilike.${like},customer_name.ilike.${like}`);
  if (!seeAll) oq = oq.in('salesperson', names);
  const [ords, custs] = await Promise.all([
    oq.order('order_date', { ascending: false }).limit(REMOTE_LIMIT),
    // ⚠️ ห้ามใส่ 'source' — tmk_mp_customers ไม่มีคอลัมน์นี้ (42703) query พังทั้งก้อน
    //    ของเดิมกลืน error ไว้จึงไม่มีใครรู้ว่าหมวด "ลูกค้า" ไม่เคยคืนผลเลยสักครั้ง
    supabase.from('tmk_mp_customers').select('customer_code,name,phone')
      .or(`name.ilike.${like},phone.ilike.${like},customer_code.ilike.${like}`).limit(REMOTE_LIMIT),
  ]);
  const cat = await fetchProductDesigns().catch(() => ({ list: [] }));

  /* ลูกค้าไม่มีคอลัมน์ salesperson → เช็คผ่านออเดอร์: เก็บเฉพาะรายที่ "ฉันเคยขายให้"
     ผลค้นมี ≤5 ราย จึงถามกลับได้ด้วย query เดียวที่ขอบเขตจำกัด
     ลูกค้าที่ไม่มีรหัส = ยืนยันความเป็นเจ้าของไม่ได้ → ตัดทิ้ง (fail-closed) */
  let customers = custs.error ? [] : (custs.data || []);
  let custErr = !!custs.error;
  if (!seeAll && customers.length) {
    const codes = customers.map(c => c.customer_code).filter(Boolean);
    if (!codes.length) customers = [];
    else {
      const own = await supabase.from('tmk_mp_orders').select('customer_code')
        .in('customer_code', codes).in('salesperson', names).limit(200);
      if (own.error) { customers = []; custErr = true; }
      else {
        const ok = new Set((own.data || []).map(r => r.customer_code));
        customers = customers.filter(c => ok.has(c.customer_code));
      }
    }
  }

  const t = safe.toLowerCase();
  return {
    orders: ords.error ? [] : (ords.data || []),
    customers,
    designs: (cat.list || []).filter(d => d.name.toLowerCase().includes(t) || String(d.code).toLowerCase().includes(t)).slice(0, 4),
    // อ่านไม่สำเร็จ ≠ ไม่มีข้อมูล — ต้องบอก ไม่งั้นผู้ใช้เชื่อว่า "ฐานข้อมูลไม่มีออเดอร์นี้" แล้วเลิกหา
    err: !!ords.error || custErr,
  };
}

/* ---- Spotlight Search ---- */

// ---- Spotlight recents (localStorage) — boost รายการที่ใช้ล่าสุด ----
/* ⚠️ ต้องผูกกับอีเมลผู้ใช้ — เดิมเป็น key เดียวทั้งเบราว์เซอร์
   recents เก็บ label+sub ซึ่งของออเดอร์ = "ชื่อลูกค้า · ฿ยอด · วันที่" และของลูกค้า = "เบอร์ · รหัส"
   บนเครื่องที่ใช้ร่วมกัน: แอดมินกดดูออเดอร์ → logout → viewer login → กด ⌘K เห็นทันที
   โดยไม่ต้องพิมพ์อะไร = ทางอ้อมข้ามตัวกรองสิทธิ์ที่เพิ่งใส่ไป */
const spotRecentKey = (email) => `tmk-spotlight-recent:${String(email || '').toLowerCase() || 'anon'}`;
const readSpotRecents = (email) => { try { return JSON.parse(localStorage.getItem(spotRecentKey(email))) || []; } catch { return []; } };
const pushSpotRecent = (item, email) => {
  try {
    const list = readSpotRecents(email).filter(r => !(r.label === item.label && r.cat === item.cat));
    list.unshift({ cat: item.cat, icon: item.icon, label: item.label, sub: item.sub, color: item.color, go: item.go });
    localStorage.setItem(spotRecentKey(email), JSON.stringify(list.slice(0, 6)));
    // ล้างคีย์รุ่นเก่าที่ไม่ผูกผู้ใช้ทิ้ง (เคยเก็บข้อมูลของคนอื่นไว้)
    localStorage.removeItem('tmk-spotlight-recent');
  } catch { /* ignore quota/parse */ }
};

export function Spotlight({ onClose, onGo }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const [remote, setRemote] = useState({ orders: [], customers: [], designs: [], err: false });
  /* useUser() คืน { user } — เคยเขียน `const user = useUser()` ทำให้ user.role เป็น undefined
     → แม้แอดมินก็ถูกกรองเป็น "เห็นเฉพาะของตัวเอง" (พลาดไปทางปลอดภัย แต่ค้นอะไรไม่เจอเลย) */
  const { user } = useUser();
  const seeAll = isAdmin(user);
  /* dep ของ effect ต้องเป็นค่าคงที่ ไม่ใช่ object — UserProvider ส่ง value={{ user }} ใหม่ทุก render
     ใส่ object ตรง ๆ = effect รีสตาร์ต debounce ไม่รู้จบ ผลค้นหาไม่มาสักที */
  const namesKey = myNamesOf(user).join('\u0000');
  // recents ผูกกับอีเมลผู้ใช้ (ดูคอมเมนต์ที่ spotRecentKey) — เปลี่ยนคนล็อกอิน = คนละลิสต์
  /* ⚠️ กรองตอนอ่านด้วย ไม่ใช่แค่ผูกอีเมล — คนที่เคยเป็นแอดมินแล้วถูกลดสิทธิ์
     ยังเห็นชื่อลูกค้า+ยอดเงินของทีมในลิสต์ "ล่าสุด" ทันทีที่กด ⌘K (อีเมลเดียวกัน คีย์เดียวกัน)
     non-admin เห็นได้เฉพาะรายการนำทาง/งาน/สินค้า — หมวดที่ผูกกับข้อมูลลูกค้าถูกตัดทิ้ง */
  const recents = useMemo(() => {
    const all = readSpotRecents(user?.email);
    if (seeAll) return all;
    const SENSITIVE = new Set(['ออเดอร์', 'ลูกค้า']);
    return all.filter(r => !SENSITIVE.has(r.cat));
  }, [user?.email, seeAll]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  // ค้นออเดอร์/ลูกค้าจริงที่ฐานข้อมูล (debounce) — เริ่มค้นเมื่อพิมพ์ตั้งแต่ 2 ตัวอักษร
  useEffect(() => {
    const term = q.trim();
    let live = true;
    const t = setTimeout(() => {
      if (!live) return;
      if (term.length < 2) { setRemote({ orders: [], customers: [], designs: [], err: false }); return; }
      // catch = ค้นไม่สำเร็จ ต้องขึ้น err ไม่ใช่เงียบแล้วโชว์ "ไม่พบผลลัพธ์"
      searchRemote(term, { seeAll, names: namesKey ? namesKey.split('\u0000') : [] })
        .then(r => { if (live) setRemote(r); })
        .catch(() => { if (live) setRemote({ orders: [], customers: [], designs: [], err: true }); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, seeAll, namesKey]);
  // เปลี่ยนคำค้น → reset ตัวเลือกเป็นรายการแรก (ทำตอนพิมพ์ ไม่ใช่ใน effect → กัน re-render ซ้ำ)
  const onQuery = (v) => { setQ(v); setIdx(0); };

  const ql = q.toLowerCase().trim();
  const results = [];

  // Helper — safe lowercase (handles null/undefined/non-string)
  const lc = (v) => String(v || '').toLowerCase();

  // เปิดรายการ + จำไว้เป็น "ล่าสุด" (go = [section, sub] แบบ serialize ได้)
  /* จดเป็น "ล่าสุด" หลัง go() สำเร็จเท่านั้น — เดิมจดก่อนเสมอ ทำให้รายการของหน้าที่ถูกล็อก
     (go() ปฏิเสธ) ยังค้างอยู่ในลิสต์ล่าสุดถาวร พร้อมชื่อลูกค้า/ยอดเงินติดไปด้วย */
  const fire = (r) => {
    if (onGo(r.go[0], r.go[1]) === false) { onClose(); return; }
    pushSpotRecent(r, user?.email);
    onClose();
  };

  if (ql) {
    // Tasks
    (TMK.tasks || []).filter(t => lc(t.title).includes(ql) || lc(t.detail).includes(ql)).slice(0, 5).forEach(t => {
      const c = (TMK.campaigns || []).find(x => x.id === t.camp);
      results.push({ cat: 'งาน', icon: 'listChecks', label: t.title, sub: `${t.date} · ${c?.name || ''}`, color: c?.color, go: ['flows', 'kanban'] });
    });
    // สินค้า (ลายเสื้อจากแคตตาล็อกจริง — เดิมค้นจากตารางสินค้ายุคเก่า)
    remote.designs.forEach(p => {
      results.push({ cat: 'สินค้า', icon: 'bag', label: p.name, sub: [p.code, p.type].filter(Boolean).join(' · '), color: 'var(--accent)', go: ['catalog', 'shirts'] });
    });
    // Campaigns
    (TMK.campaigns || []).filter(c => lc(c.name).includes(ql)).slice(0, 3).forEach(c => {
      results.push({ cat: 'แคมเปญ', icon: 'megaphone', label: c.name, sub: `${c.start}–${c.end}`, color: c.color, go: ['settings', 'campaigns'] });
    });
    // Staff
    (TMK.staff || []).filter(s => lc(s.name).includes(ql) || lc(s.role).includes(ql)).forEach(s => {
      results.push({ cat: 'ทีม', icon: 'users', label: s.name, sub: s.role, color: s.color, go: ['settings', 'roles'] });
    });
    // Channels
    (TMK.channels || []).filter(c => lc(c.name).includes(ql)).forEach(c => {
      results.push({ cat: 'ช่องทาง', icon: 'layers', label: c.name, sub: `เป้า ${Bk(c.target)}`, color: c.hex, go: ['catalog', 'report'] });   // section 'sales' ถูกยุบเข้ารายงานขายแล้ว
    });
    // ออเดอร์จริง (tmk_mp_orders · ค้นที่ฐานข้อมูลตอนพิมพ์)
    remote.orders.forEach(o => {
      results.push({ cat: 'ออเดอร์', icon: 'listChecks', label: o.order_no || o.customer_name || 'ออเดอร์',
        sub: `${o.customer_name || ''} · ${B(o.sales)}${o.order_date ? ' · ' + o.order_date : ''}${o.status === 'cancelled' ? ' · ยกเลิก' : ''}`,
        color: 'var(--accent-2)', go: ['catalog', 'orders'] });
    });
    // ลูกค้าจริง (tmk_mp_customers)
    remote.customers.forEach(c => {
      results.push({ cat: 'ลูกค้า', icon: 'users', label: c.name || c.customer_code || 'ลูกค้า',
        sub: [c.phone, c.customer_code].filter(Boolean).join(' · '), color: 'var(--info)', go: ['catalog', 'crm'] });
    });
    // Navigation
    [{ l: 'หน้าหลัก', s: 'home' }, { l: 'ยอดขาย', s: 'catalog', sub: 'report' }, { l: 'ปฏิทิน', s: 'flows', sub: 'calendar' }, { l: 'Kanban', s: 'flows', sub: 'kanban' }, { l: 'ไทม์ไลน์', s: 'flows', sub: 'timeline' },
     { l: 'รายงานขาย', s: 'catalog', sub: 'report' }, { l: 'ประสิทธิภาพเซลล์', s: 'catalog', sub: 'perf' }, { l: 'ออเดอร์', s: 'catalog', sub: 'orders' }, { l: 'ภาพรวม CRM', s: 'catalog', sub: 'crm' },
     { l: 'สินค้า', s: 'catalog', sub: 'shirts' }, { l: 'สต็อก', s: 'catalog', sub: 'stock' }, { l: 'ใบสั่งผลิต', s: 'catalog', sub: 'stock' }, { l: 'แคมเปญ', s: 'settings', sub: 'campaigns' }, { l: 'ตั้งค่า', s: 'settings', sub: 'general' }]
      .filter(n => lc(n.l).includes(ql)).forEach(n => {
        results.push({ cat: 'นำทาง', icon: 'arrowR', label: `ไปที่ ${n.l}`, sub: '', color: 'var(--ink-3)', go: [n.s, n.sub] });
      });
  } else {
    // ไม่มีคำค้น → โชว์ "ล่าสุด" ที่เคยเปิด (recent boost)
    recents.forEach(r => results.push({ ...r, cat: 'ล่าสุด' }));
  }

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[idx]) { fire(results[idx]); }
    else if (e.key === 'Escape') { onClose(); }
  };

  // Group by cat
  const grouped = {};
  results.forEach((r, i) => { r._i = i; grouped[r.cat] = grouped[r.cat] || []; grouped[r.cat].push(r); });

  return (
    <div className="spotlight-scrim" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', width: '100%', maxWidth: 580, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-xl)', boxShadow: 'var(--sh-pop)', overflow: 'hidden', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}>
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ width: 20, height: 20, flexShrink: 0, color: 'var(--ink-3)' }}><Icon name="search" /></span>
          <input ref={inputRef} value={q} onChange={e => onQuery(e.target.value)} onKeyDown={onKey}
            placeholder="ค้นหา"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 'var(--fs-h3)', fontWeight: 500, color: 'var(--ink)', fontFamily: 'var(--font)' }} />
          <kbd style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-micro)', color: 'var(--ink-3)', border: '1px solid var(--line)', borderRadius: 5, padding: '2px 6px', background: 'var(--surface-2)' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!ql && results.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
              <div style={{ fontSize: 'var(--fs-sm)', marginBottom: 4 }}>พิมพ์เพื่อค้นหา</div>
              <div className="cap">ออเดอร์ · ลูกค้า · งาน · ลายเสื้อ · ทีม · ช่องทาง · นำทาง</div>
            </div>
          )}
          {/* อ่านไม่สำเร็จ "บางส่วน" ก็ต้องบอก — เดิมแถบนี้ขึ้นเฉพาะตอนไม่มีผลลัพธ์เลย
              ถ้า query ลูกค้าพังแต่ออเดอร์สำเร็จ ผู้ใช้เห็นผลแล้วสรุปว่า "ไม่มีลูกค้าคนนี้" */}
          {ql && remote.err && results.length > 0 && (
            <div className="cap" style={{ padding: '8px 14px', color: 'var(--bad)', borderBottom: '1px solid var(--line)' }}>
              <Icon name="alertTriangle" className="inline size-3.5 mr-1" />
              ผลค้นหาไม่ครบ — บางส่วนอ่านจากฐานข้อมูลไม่สำเร็จ
            </div>
          )}
          {ql && results.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--ink-3)' }}>
              {remote.err ? (
                /* ห้ามบอกว่า "ไม่พบ" ตอนที่จริง ๆ คืออ่านไม่ได้ — ผู้ใช้จะเลิกหาทั้งที่ของมีอยู่ */
                <>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--bad)' }}>ค้นที่ฐานข้อมูลไม่สำเร็จ</div>
                  <div className="cap" style={{ marginTop: 8, lineHeight: 1.7 }}>
                    ยังไม่รู้ว่ามี "{q}" อยู่หรือเปล่า — พิมพ์ใหม่อีกครั้ง หรือค้นในหน้าออเดอร์/ภาพรวม CRM โดยตรง
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 'var(--fs-sm)' }}>ไม่พบผลลัพธ์สำหรับ "{q}"</div>
                  {/* บอกขอบเขตให้ชัด — ค้นที่ฐานข้อมูลจริง แต่โชว์ผลละ 5 รายการ */}
                  <div className="cap" style={{ marginTop: 8, lineHeight: 1.7 }}>
                    {seeAll ? 'ค้นออเดอร์/ลูกค้าจากฐานข้อมูลทั้งหมด' : 'ค้นเฉพาะออเดอร์/ลูกค้าของฉัน'} (โชว์ 5 รายการแรกต่อประเภท)
                    <br />ต้องการดูครบทุกรายการ ให้ค้นในหน้าออเดอร์ หรือหน้าภาพรวม CRM โดยตรง
                  </div>
                </>
              )}
            </div>
          )}
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat}>
              <div className="eyebrow" style={{ padding: '10px 20px 4px' }}>{cat}</div>
              {items.map(r => (
                <button key={r._i} onClick={() => fire(r)} onMouseEnter={() => setIdx(r._i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 20px', border: 'none', background: idx === r._i ? 'var(--accent-soft)' : 'transparent', color: 'var(--ink)', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)', transition: 'background 0.08s' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 'var(--r-sm)', background: (r.color || 'var(--ink-3)') + '18', color: r.color || 'var(--ink-3)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><Icon name={r.icon} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="sm" style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                    {r.sub && <div className="cap" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>}
                  </div>
                  {idx === r._i && <span className="cap" style={{ flexShrink: 0 }}>↵ เปิด</span>}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        {results.length > 0 && (
          <div style={{ padding: '8px 20px', borderTop: '1px solid var(--line)', display: 'flex', gap: 16, justifyContent: 'center' }}>
            <span className="cap row" style={{ gap: 4 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, padding: '1px 4px' }}>↑↓</kbd> เลือก</span>
            <span className="cap row" style={{ gap: 4 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, padding: '1px 4px' }}>↵</kbd> เปิด</span>
            <span className="cap row" style={{ gap: 4 }}><kbd style={{ fontFamily: 'var(--mono)', fontSize: 9, border: '1px solid var(--line)', borderRadius: 3, padding: '1px 4px' }}>esc</kbd> ปิด</span>
          </div>
        )}
      </div>
    </div>
  );
}
