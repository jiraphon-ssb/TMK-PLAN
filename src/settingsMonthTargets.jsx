/* ============================================================
   settingsMonthTargets.jsx — โซน "เป้าเดือน + เป้า/งบแอดต่อช่องทาง" ในหน้า ตั้งค่า → เป้า/คอม
   ============================================================
   PART 103 (D13): ย้ายมาจาก MonthlyTargetModal ("ตั้งค่ารายเดือน" ในหน้ายอดขายเดิม)
   → เป้าทุกชนิดอยู่หน้าเดียว (เดือนรวม / ต่อช่องทาง / ต่อเซลล์+คอม / CRM) · เลือกเดือนได้

   UX (22 ส.ค.): **auto-save ตอนออกจากโซน** (blur ออกนอกกรอบ) แบบเดียวกับเป้ารายคนด้านล่าง —
   หน้าเดียวกันต้องเซฟแบบเดียวกัน · ไอคอนสถานะข้างหัว: ● แก้ค้าง → กำลังบันทึก → ✓ บันทึกแล้ว

   ⚠️ ความปลอดภัยข้อมูล (สำคัญ):
   - เก็บที่ tmk_monthly_history เดิม (ไม่ต้อง migration) แต่เขียนลง **meta key ใหม่**
     `channelTargetsV2` / `adChannelsV2` ที่ key = ชื่อช่องทางชุด Sale (Facebook/LINE/…)
     ส่วน `channelTargets` / `adChannels` เดิม (key = id เก่า facebook/line_oa/…) **ไม่ถูกแตะ**
     → เดือนก่อน cutoff ยังอ่านของเดิมได้เป๊ะ · ไม่มีทางชนกัน/นับซ้ำ
   - เขียนเฉพาะ target + meta เท่านั้น — **ไม่แตะ actual/orders/projected** (บทเรียน PART 90 ยอดเดือนหาย)
   - id ในตารางเก่าเป็นปี พ.ศ. ('2569-08') — อ่านด้วย month+year(พ.ศ.) เอาแถวอัปเดตล่าสุด · เขียนใช้ id ของแถวที่เจอ
   ============================================================ */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from './components.jsx';
import { supabase } from './lib/supabaseClient.js';
import { logAudit } from './lib/audit.js';
import { toast } from './lib/appBus.js';
import { pgErrorText } from './lib/pgError.js';
import { MoneyInput } from './components/MoneyInput.jsx';
import { Skeleton } from '@/components/ui/skeleton';
import { CHANNELS } from './lib/saleFields.js';
import { AD_CHANNELS } from './lib/salesOverviewAgg.js';
import { THAI_MONTHS } from './lib/dateUtils.js';

const B = (n) => '฿' + (Number(n) || 0).toLocaleString('th-TH');
const nn = (v) => Number(v) || 0;
const beId = (ym) => { const [y, m] = ym.split('-'); return `${Number(y) + 543}-${m}`; };
const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return `${THAI_MONTHS[m - 1]} ${String(y + 543).slice(2)}`; };
/* คืน { row, error } — ห้ามกลืน error: ถ้าอ่านไม่ได้แล้วเราทำเป็น "ไม่มีแถว"
   ผู้ใช้จะเห็นฟอร์มว่าง พอกดเซฟ = ทับเป้าเดิมและลบคีย์ meta ยุคเก่าทิ้งถาวร */
const findRow = async (ym) => {
  const [y, m] = ym.split('-').map(Number);
  const { data, error } = await supabase.from('tmk_monthly_history').select('*')
    .eq('month', m).eq('year', y + 543).order('updated_at', { ascending: false }).limit(1);
  return { row: (data && data[0]) || null, error: error || null };
};
// เทียบ "ค่าที่บันทึกแล้ว" vs "ค่าในฟอร์ม" เป็นตัวเลขล้วน (กันเคส "1000" vs 1000 นับว่าแก้)
const normalize = (total, chT, adT) => JSON.stringify([nn(total),
  Object.fromEntries(Object.entries(chT).map(([k, v]) => [k, nn(v)]).filter(([, v]) => v > 0).sort()),
  Object.fromEntries(Object.entries(adT).map(([k, v]) => [k, nn(v)]).filter(([, v]) => v > 0).sort())]);

export function MonthTargetsZone({ month, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');   // อ่านเป้าเดือนไม่สำเร็จ → ห้ามเซฟทับ
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [total, setTotal] = useState('');
  const [chT, setChT] = useState({});     // { channel: เป้ายอด }
  const [adT, setAdT] = useState({});     // { channel: งบแอด }
  const [baseRow, setBaseRow] = useState(null);
  const [snap, setSnap] = useState('');   // ค่าที่บันทึกแล้ว (normalize) → dirty = ต่างจากนี้
  const flashT = useRef(null);
  const monthRef = useRef(month);                             // กัน save ของเดือนเก่าไปทับ state หลังสลับเดือน (blur ยิงก่อนเปลี่ยนเดือน)
  useEffect(() => { monthRef.current = month; }, [month]);

  const load = useCallback(async (ym) => {
    setLoading(true);
    try {
      const { row: data, error: readErr } = await findRow(ym);
      if (readErr) {                       // อ่านไม่ได้ = ล็อกฟอร์มไว้ ไม่ให้เซฟทับของเดิม
        setLoadErr(pgErrorText(readErr));
        setBaseRow(null); setTotal(''); setChT({}); setAdT({}); setSnap('');
        return;
      }
      setLoadErr('');
      const meta = (data && data.meta) || {};
      const t = data?.target ? String(data.target) : '', c = { ...(meta.channelTargetsV2 || {}) }, a = { ...(meta.adChannelsV2 || {}) };
      setBaseRow(data || null); setTotal(t); setChT(c); setAdT(a);
      setSnap(normalize(t, c, a));
    } catch (e) { setLoadErr(e?.message || 'โหลดเป้าเดือนไม่สำเร็จ'); setBaseRow(null); setTotal(''); setChT({}); setAdT({}); setSnap(''); }
    finally { setLoading(false); }
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลด async ตอนเปลี่ยนเดือน (pattern ปกติ)
  useEffect(() => { if (month) load(month); }, [month, load]);
  useEffect(() => () => clearTimeout(flashT.current), []);

  const [showAllCh, setShowAllCh] = useState(false);   // ช่องทางที่ยังไม่ตั้งเป้า = พับไว้ (เดิมโชว์ 9 แถวเต็มไปด้วย 0)
  const [copying, setCopying] = useState(false);
  const chSum = Object.values(chT).reduce((a, v) => a + nn(v), 0);
  const adSum = Object.values(adT).reduce((a, v) => a + nn(v), 0);
  const totalNum = nn(total);
  const diff = totalNum - chSum;
  const dirty = !loading && normalize(total, chT, adT) !== snap;

  const save = async () => {
    if (saving || !dirty) return;
    if (loadErr) { toast('ยังโหลดเป้าเดือนนี้ไม่สำเร็จ — กดโหลดใหม่ก่อนบันทึก (กันเขียนทับของเดิม)', 'warn'); return; }
    setSaving(true);
    const ym = month;
    try {
      const [y, m] = ym.split('-').map(Number);
      const prevMeta = (baseRow && baseRow.meta) || {};
      const meta = {
        ...prevMeta,                                     // preserve ทุกคีย์เดิม (channelTargets/adChannels/entryMode/…)
        channelTargetsV2: Object.fromEntries(Object.entries(chT).map(([k, v]) => [k, nn(v)]).filter(([, v]) => v > 0)),
        adChannelsV2: Object.fromEntries(Object.entries(adT).map(([k, v]) => [k, nn(v)]).filter(([, v]) => v > 0)),
        adBudgetV2: adSum,
      };
      // เขียนเฉพาะ target + meta — ไม่ส่ง actual/orders/projected (PostgREST อัปเฉพาะคอลัมน์ที่ส่ง)
      const { error } = await supabase.from('tmk_monthly_history')
        .upsert({ id: baseRow?.id || beId(ym), month: m, year: y + 543, month_th: THAI_MONTHS[m - 1], target: totalNum, meta });
      if (error) throw error;
      const fields = [{ label: 'เป้ารวม', value: B(totalNum) }];
      Object.entries(meta.channelTargetsV2).forEach(([k, v]) => fields.push({ label: `เป้า ${k}`, value: B(v) }));
      Object.entries(meta.adChannelsV2).forEach(([k, v]) => fields.push({ label: `งบแอด ${k}`, value: B(v) }));
      logAudit({ action: 'update', entityType: 'target', entityName: `เป้าเดือน ${ym}`, summary: `ตั้งเป้าเดือน ${ym}`, fields });
      if (monthRef.current !== ym) return;                    // สลับเดือนไปแล้วระหว่างรอ — ไม่แตะ state ของเดือนใหม่
      setSnap(normalize(total, chT, adT));
      if (!baseRow) setBaseRow({ id: beId(ym), meta });      // แถวใหม่ — จำ id/meta ไว้ให้รอบถัดไป merge ต่อ (ไม่ต้อง refetch ทั้งแถว)
      else setBaseRow({ ...baseRow, meta });
      setSavedFlash(true); clearTimeout(flashT.current); flashT.current = setTimeout(() => setSavedFlash(false), 1600);
      onSaved?.();
    } catch (e) {
      toast('บันทึกเป้าเดือนไม่สำเร็จ: ' + (e?.message || ''), 'error');
    } finally { setSaving(false); }
  };
  // คัดลอกเป้าจากเดือนก่อน — เดิมต้องพิมพ์ใหม่ทั้งชุดทุกเดือน (10 ช่อง)
  const copyPrev = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const [y, m] = month.split('-').map(Number);
      const pm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
      /* findRow คืน { row, error } — เคยเขียน `const row = await findRow(pm)` ตรง ๆ
         ทำให้ row.target/row.meta เป็น undefined เสมอ → ปุ่มนี้เด้ง "ยังไม่ได้ตั้งเป้า" ทุกครั้ง ใช้ไม่ได้เลย */
      const { row, error: readErr } = await findRow(pm);
      // อ่านไม่ได้ ≠ ไม่มีเป้า — ถ้าบอกว่า "ยังไม่ได้ตั้งเป้า" ผู้ใช้อาจไปตั้งใหม่ทับของจริง
      if (readErr) { toast(`อ่านเป้าเดือน ${monthLabel(pm)} ไม่สำเร็จ: ${readErr.message || ''}`, 'error'); return; }
      const meta = (row && row.meta) || {};
      const c = { ...(meta.channelTargetsV2 || {}) }, a = { ...(meta.adChannelsV2 || {}) };
      if (!row || (!row.target && !Object.keys(c).length)) { toast(`เดือน ${monthLabel(pm)} ยังไม่ได้ตั้งเป้า`, 'warn'); return; }
      setTotal(row.target ? String(row.target) : ''); setChT(c); setAdT(a);
      toast(`คัดลอกเป้าจาก ${monthLabel(pm)} แล้ว — ออกจากกรอบเพื่อบันทึก`, 'success');
    } catch (e) { toast('คัดลอกไม่สำเร็จ: ' + (e?.message || ''), 'error'); }
    finally { setCopying(false); }
  };

  // auto-save เมื่อโฟกัสออกนอกโซน (กดไล่ช่องในโซนไม่ยิงซ้ำ)
  const onZoneBlur = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) save(); };

  if (loading) return <div className="grid gap-2"><Skeleton className="h-10 w-full rounded-lg" /><Skeleton className="h-28 w-full rounded-lg" /></div>;

  const status = saving ? <span className="size-2 rounded-full bg-[var(--accent)] animate-pulse shrink-0" title="กำลังบันทึก" aria-label="กำลังบันทึก" />
    : savedFlash ? <Icon name="check" className="size-3.5 text-[var(--good)] shrink-0" aria-label="บันทึกแล้ว" />
    : dirty ? <span className="size-2 rounded-full bg-[var(--warn)] shrink-0" title="ยังไม่บันทึก — ออกจากโซนนี้แล้วบันทึกเอง" aria-label="ยังไม่บันทึก" /> : null;

  return (
    <div className="rounded-lg border overflow-hidden" onBlur={onZoneBlur}>
      {loadErr && (
        <div className="px-3 py-2 text-xs border-b" style={{ background: 'color-mix(in srgb, var(--bad) 8%, transparent)', color: 'var(--ink-2)' }}>
          <Icon name="alertTriangle" className="inline size-3.5 mr-1" style={{ color: 'var(--bad)' }} />
          โหลดเป้าเดือนนี้ไม่สำเร็จ — {loadErr} · ยังไม่บันทึกทับของเดิม
          <button type="button" className="underline ml-2" onClick={() => load(month)}>โหลดใหม่</button>
        </div>
      )}
      {/* หัวโซน: เป้ารวมของเดือนที่เลือก + ตัวเช็คผลรวม + สถานะเซฟ */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 bg-muted/40 border-b">
        <span className="text-sm font-medium inline-flex items-center gap-1.5"><Icon name="target" className="size-4" /> เป้าเดือน {monthLabel(month)} {status}</span>
        <span className="w-[140px]"><MoneyInput value={total} onChange={e => setTotal(e.target.value)} aria-label="เป้ายอดรวมของเดือน (บาท)" className="h-8" placeholder="0" suffix="฿" /></span>
        {totalNum > 0 && chSum > 0 && (
          <span className="text-[11px]" style={{ color: diff === 0 ? 'var(--good)' : 'var(--warn)' }}>
            {diff === 0 ? 'เป้าช่องทางรวมพอดี' : `เป้าช่องทางรวม ${B(chSum)} · ${diff > 0 ? `ขาด ${B(diff)}` : `เกิน ${B(-diff)}`}`}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <button type="button" onClick={copyPrev} disabled={copying}
            className="text-[11.5px] text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50">
            {copying ? 'กำลังคัดลอก…' : 'คัดลอกจากเดือนก่อน'}
          </button>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">พิมพ์แล้วออกจากกรอบ = บันทึกเอง</span>
        </span>
      </div>

      {/* ต่อช่องทาง: เป้ายอด + งบแอด — คอลัมน์ยืดหยุ่น (มือถือไม่ล้น) */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(96px,150px)_minmax(96px,150px)] gap-2 items-center px-3 py-1.5 text-[11px] text-muted-foreground border-b">
        <span>ช่องทาง</span><span className="text-right">เป้ายอด (บาท)</span><span className="text-right">งบแอด (บาท)</span>
      </div>
      <div className="divide-y">
        {(showAllCh ? CHANNELS : CHANNELS.filter(ch => nn(chT[ch]) > 0 || nn(adT[ch]) > 0)).map(ch => {
          const share = chSum > 0 ? Math.round(nn(chT[ch]) / chSum * 100) : 0;
          return (
            <div key={ch} className="grid grid-cols-[minmax(0,1fr)_minmax(96px,150px)_minmax(96px,150px)] gap-2 items-center px-3 py-1.5">
              <span className="text-sm truncate flex items-center gap-2">
                {ch}
                {share > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">{share}%</span>}
              </span>
              <MoneyInput value={chT[ch] ?? ''} placeholder="0" className="h-8 min-w-0" aria-label={`เป้ายอด ${ch}`}
                onChange={e => setChT(p => ({ ...p, [ch]: e.target.value }))} />
              {AD_CHANNELS.includes(ch)
                ? <MoneyInput value={adT[ch] ?? ''} placeholder="0" className="h-8 min-w-0" aria-label={`งบแอด ${ch}`}
                    onChange={e => setAdT(p => ({ ...p, [ch]: e.target.value }))} />
                : <span className="text-right text-[11px] text-muted-foreground pr-2">—</span>}
            </div>
          );
        })}
        {/* ช่องทางที่ยังไม่ตั้งเป้า — พับไว้ ไม่งั้นเป็นกำแพงเลข 0 */}
        {(() => {
          const nEmpty = CHANNELS.filter(ch => !nn(chT[ch]) && !nn(adT[ch])).length;
          if (!nEmpty) return null;
          return (
            <button type="button" onClick={() => setShowAllCh(v => !v)}
              className="w-full px-3 py-2 text-left text-[11.5px] text-muted-foreground hover:bg-muted/30 transition-colors">
              {showAllCh ? 'ซ่อนช่องทางที่ยังไม่ตั้งเป้า' : `+ ตั้งเป้าช่องทางอื่น (${nEmpty} ช่องทางที่ยังไม่ตั้ง)`}
            </button>
          );
        })()}
      </div>
      {adSum > 0 && <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t">งบแอดรวม {B(adSum)} · ROAS เป้า {totalNum > 0 ? (totalNum / adSum).toFixed(1) + 'x' : '—'}</div>}
    </div>
  );
}
