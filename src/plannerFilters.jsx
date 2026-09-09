/* ============================================================
   plannerFilters.jsx — แถบเครื่องมือของบอร์ดโครงการ (PART 104 · รื้อใหม่)
   ============================================================
   เดิม: การ์ดตัวกรองสูง 2 ชั้น (ช่วงวันที่ + ปุ่มตัวกรอง + ชิป + ค้นหา) กินพื้นที่เหนือบอร์ด
         ทุกวิว · ไม่บอกว่ากรองแล้วเหลือกี่งาน · ค้นหาเจอเฉพาะ "ชื่องาน"
   ใหม่: แถบเดียว = ค้นหา(กว้าง) + ชิปด่วน(ของฉัน/เลยกำหนด/ครบใน 7 วัน) + ช่วงวันที่ + ตัวกรองพับ
         + บรรทัดสรุป "แสดง N จาก M งาน" · ตรรกะกรองอยู่ที่ lib/taskFilters.js (มีเทส)
   ============================================================ */
import React from 'react';
import { Icon } from './components.jsx';
import { PRESETS, presetRange } from './lib/saleTime.js';
import { todayISO } from './lib/dateUtils.js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SearchInput } from '@/components/ui/search-input';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { DateRangePicker, DD } from './saleWidgets.jsx';

// ดรอปดาวน์ฟิลเตอร์ (multi-select) — ซ่อนตัวเองถ้าไม่มีตัวเลือก
function FilterDropdown({ label, icon, options, value, onChange }) {
  const sel = Array.isArray(value) ? value : (value ? [value] : []);
  const active = sel.length > 0;
  const selOpts = options.filter(o => sel.includes(o.id));
  const trigText = sel.length === 0 ? label : sel.length === 1 ? (selOpts[0]?.name || label) : `${label} (${sel.length})`;
  const toggle = (id) => onChange(sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={'h-8 rounded-full font-medium' + (active ? ' border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]' : '')}>
          <span className="inline-flex w-4 items-center justify-center shrink-0">
            {sel.length === 1 ? <span className="dot-c" style={{ background: selOpts[0]?.color }} /> : <Icon name={icon} />}
          </span>
          <span className="max-w-[140px] truncate">{trigText}</span>
          <Icon name="chevD" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="max-h-72 w-52 overflow-auto">
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); onChange([]); }}>
          <span className="flex-1">ทั้งหมด</span>{sel.length === 0 && <Icon name="check" />}
        </DropdownMenuItem>
        {options.map(o => (
          <DropdownMenuItem key={o.id} onSelect={(e) => { e.preventDefault(); toggle(o.id); }}>
            <span className="dot-c" style={{ background: o.color }} />
            <span className="min-w-0 flex-1 truncate">{o.name}</span>
            {sel.includes(o.id) && <Icon name="check" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ชิปกรองด่วน — กดซ้ำ = ปิด · ตัวเลขมาจาก stats ชุดเดียวกับหัวบอร์ด
function QuickChip({ on, label, count, color, onClick }) {
  const dim = !count && !on;
  return (
    <button type="button" onClick={onClick} aria-pressed={on} disabled={dim}
      className={'inline-flex items-center gap-1.5 h-8 rounded-full border px-3 text-[12.5px] font-semibold transition-colors' + (dim ? ' opacity-45' : '')}
      style={{ borderColor: on ? color : 'var(--line)', background: on ? `color-mix(in srgb, ${color} 12%, var(--surface))` : 'var(--surface)', color: on ? color : 'var(--ink-3)' }}>
      <span className="size-2 rounded-full shrink-0" style={{ background: color }} />{label}
      {count != null && <b className="num">{count}</b>}
    </button>
  );
}

export function PlannerFilters({ filterCamp, setFilterCamp, filterStatus, setFilterStatus, filterResp, setFilterResp, search, setSearch, respOptions, campScope,
  filterPriority, setFilterPriority, filterTags, setFilterTags, tagOptions, filterChannel, setFilterChannel,
  filterDateFrom, setFilterDateFrom, filterDateTo, setFilterDateTo, datePreset, setDatePreset,
  quick, setQuick, stats, shown, total }) {
  const [open, setOpen] = React.useState(false);
  const respColor = (name) => (DD.duties.find(d => d.name === name)?.color) || (DD.staff.find(s => s.name === name)?.color) || 'var(--ink-3)';
  const dateActive = !!(filterDateFrom || filterDateTo);
  const campOpts = (DD.campaigns || []).filter(c => campScope == null || campScope.includes(c.id)).map(c => ({ id: c.id, name: c.name, color: c.color }));
  const respOpts = (respOptions || []).map(r => ({ id: r, name: r, color: respColor(r) }));
  const prioOpts = [{ id: 'high', name: 'สูง', color: '#cf4d5c' }, { id: 'medium', name: 'กลาง', color: '#c08a3e' }, { id: 'low', name: 'ต่ำ', color: '#64748b' }];
  const tagOpts = (tagOptions || []).map(tg => ({ id: tg, name: tg, color: 'var(--ink-3)' }));
  const chanOpts = (DD.channels || []).map(c => ({ id: c.name, name: c.name, color: c.hex }));
  const stOpts = [{ id: 'active', name: 'กำลังทำ', color: 'var(--info)' }, { id: 'done', name: 'เสร็จแล้ว', color: 'var(--good)' }];
  const nFilters = (filterStatus !== 'all' ? 1 : 0) + (filterCamp?.length || 0) + (filterResp?.length || 0) + (filterPriority?.length || 0) + (filterTags?.length || 0) + (filterChannel?.length || 0);
  const anyActive = nFilters > 0 || dateActive || !!search || !!quick;
  const clearAll = () => {
    setFilterStatus('all'); setFilterCamp([]); setFilterResp([]); setSearch('');
    setFilterPriority?.([]); setFilterTags?.([]); setFilterChannel?.([]);
    setFilterDateFrom?.(''); setFilterDateTo?.(''); setDatePreset?.('all'); setQuick?.(null);
  };
  const pickPreset = (id) => { const r = presetRange(id, todayISO()); setDatePreset?.(id); setFilterDateFrom?.(r.from || ''); setFilterDateTo?.(r.to || ''); };
  const pickRange = (f, t) => { setDatePreset?.(''); setFilterDateFrom?.(f || ''); setFilterDateTo?.(t || ''); };
  const toggleQuick = (k) => setQuick?.(quick === k ? null : k);
  // ชิปตัวกรองที่เลือก (ถอดได้)
  const chips = [];
  if (filterStatus !== 'all') chips.push({ k: 'st', label: (stOpts.find(o => o.id === filterStatus)?.name) || filterStatus, color: stOpts.find(o => o.id === filterStatus)?.color, remove: () => setFilterStatus('all') });
  (filterCamp || []).forEach(id => { const o = campOpts.find(x => x.id === id); chips.push({ k: 'c' + id, label: o?.name || id, color: o?.color, remove: () => setFilterCamp(filterCamp.filter(x => x !== id)) }); });
  (filterResp || []).forEach(id => { const o = respOpts.find(x => x.id === id); chips.push({ k: 'r' + id, label: id, color: o?.color, remove: () => setFilterResp(filterResp.filter(x => x !== id)) }); });
  (filterPriority || []).forEach(id => { const o = prioOpts.find(x => x.id === id); chips.push({ k: 'p' + id, label: o?.name || id, color: o?.color, remove: () => setFilterPriority(filterPriority.filter(x => x !== id)) }); });
  (filterTags || []).forEach(id => chips.push({ k: 't' + id, label: '#' + id, remove: () => setFilterTags(filterTags.filter(x => x !== id)) }));
  (filterChannel || []).forEach(id => { const o = chanOpts.find(x => x.id === id); chips.push({ k: 'ch' + id, label: id, color: o?.color, remove: () => setFilterChannel(filterChannel.filter(x => x !== id)) }); });

  return (
    <div className="flex flex-col gap-2" style={{ marginBottom: 12 }}>
      {/* แถวเดียว: ค้นหา · ชิปด่วน · ช่วงวันที่ · ตัวกรอง · ล้าง */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput placeholder="ค้นหางาน / คน / แท็ก" value={search} onChange={e => setSearch(e.target.value)} wrapperClassName="w-full sm:w-[230px] shrink-0" />
        {stats && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <QuickChip on={quick === 'mine'} label="ของฉัน" count={stats.mine} color="var(--accent)" onClick={() => toggleQuick('mine')} />
            <QuickChip on={quick === 'overdue'} label="เลยกำหนด" count={stats.overdue} color="var(--bad)" onClick={() => toggleQuick('overdue')} />
            <QuickChip on={quick === 'week'} label="ครบใน 7 วัน" count={stats.week} color="var(--warn)" onClick={() => toggleQuick('week')} />
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <DateRangePicker from={filterDateFrom} to={filterDateTo} onChange={pickRange} presets={PRESETS} activePreset={dateActive ? datePreset : 'all'} onPickPreset={pickPreset} />
          <Button variant={nFilters > 0 ? 'secondary' : 'outline'} size="sm" className="h-8 gap-1.5" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            <Icon name="filter" className="size-3.5" /> ตัวกรอง {nFilters > 0 && <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">{nFilters}</Badge>}
            <Icon name="chevD" className="size-3.5 opacity-60" style={open ? { transform: 'rotate(180deg)' } : undefined} />
          </Button>
          {anyActive && <Button variant="ghost" size="sm" className="h-8 text-[var(--bad)]" onClick={clearAll}><Icon name="x" className="size-3.5" /> ล้าง</Button>}
        </div>
      </div>

      {/* แผงตัวกรองละเอียด (พับไว้) */}
      {open && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border p-2.5" style={{ borderColor: 'var(--line)', background: 'var(--surface-2)' }}>
          <ToggleGroup type="single" value={filterStatus} onValueChange={(v) => v && setFilterStatus(v)} className="gap-0.5 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1">
            {[['all', 'ทั้งหมด'], ['active', 'กำลังทำ'], ['done', 'เสร็จแล้ว']].map(([s, l]) => (
              <ToggleGroupItem key={s} value={s} size="sm" className="h-7 rounded-full px-3 text-[var(--ink-3)] hover:text-[var(--ink)] data-[state=on]:bg-[var(--ink)] data-[state=on]:text-white">{l}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="h-6 w-px bg-[var(--line)] mx-0.5 hidden sm:block" />
          {campOpts.length > 0 && <FilterDropdown label="แคมเปญ" icon="megaphone" options={campOpts} value={filterCamp} onChange={setFilterCamp} />}
          {respOpts.length > 0 && <FilterDropdown label="ผู้รับผิดชอบ" icon="users" options={respOpts} value={filterResp} onChange={setFilterResp} />}
          <FilterDropdown label="ความสำคัญ" icon="target" options={prioOpts} value={filterPriority} onChange={setFilterPriority} />
          {tagOpts.length > 0 && <FilterDropdown label="แท็ก" icon="star" options={tagOpts} value={filterTags} onChange={setFilterTags} />}
          {chanOpts.length > 0 && <FilterDropdown label="ช่องทาง" icon="layers" options={chanOpts} value={filterChannel} onChange={setFilterChannel} />}
        </div>
      )}

      {/* ชิปที่เลือก + จำนวนที่เหลือหลังกรอง (เดิมไม่บอก — กรองแล้วงานหายไม่รู้ว่าเพราะอะไร) */}
      {(chips.length > 0 || anyActive) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(ch => (
            <Badge key={ch.k} variant="secondary" className="gap-1 pl-2 pr-1 font-normal">
              {ch.color && <span className="size-2 rounded-full shrink-0" style={{ background: ch.color }} />}
              <span className="truncate max-w-[120px]">{ch.label}</span>
              <button onClick={ch.remove} className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10" aria-label={`เอาตัวกรอง ${ch.label} ออก`}><Icon name="x" className="size-3" /></button>
            </Badge>
          ))}
          {total != null && <span className="text-xs text-muted-foreground tabular-nums ml-auto">แสดง {shown} จาก {total} งาน</span>}
        </div>
      )}
    </div>
  );
}
