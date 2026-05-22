import React, { useState, useEffect, useRef, useCallback } from 'react';
import { tmkRepository } from './lib/tmkRepository';

// Initial seed data from original HTML (May - June 2026)
const initialCampaigns = [
  { id: 'c1', name: 'Campaign 1: เตรียมการ & เปิดตัว "ลายใหม่ (1)"', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  { id: 'c2', name: 'Campaign 2: Mid-Month เสื้อดำ & ระบายสต็อก', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  { id: 'c3', name: 'Campaign 3: ลายใหม่ (2) & เก็บยอด Payday', color: '#ea580c', bg: '#fff7ed', border: '#ffedd5' }
];

const initialChannels = [
  { id: 'ch1', name: 'Sales (Direct)', percentage: 44, actual: 440000, color: '#5b9bd5' },
  { id: 'ch2', name: 'Shopee & Lazada', percentage: 25, actual: 250000, color: '#ed7d31' },
  { id: 'ch3', name: 'TikTok', percentage: 25, actual: 250000, color: '#4f4f4f' },
  { id: 'ch4', name: 'CRM', percentage: 6, actual: 60000, color: '#ffc000' }
];

const initialProducts = [
  { id: 'p1', name: 'สินค้าใหม่', price: 279, targetUnits: 2400, actualUnits: 2400, stockOnHand: 620, reservedUnits: 160, reorderPoint: 250, strategy: 'เน้นขายกลุ่มลูกค้าเก่า' },
  { id: 'p2', name: 'ลายขายดี', price: 259, targetUnits: 600, actualUnits: 600, stockOnHand: 210, reservedUnits: 40, reorderPoint: 120, strategy: '-' },
  { id: 'p3', name: 'สินค้าระบายสต็อก', price: 99, targetUnits: 820, actualUnits: 820, stockOnHand: 430, reservedUnits: 20, reorderPoint: 80, strategy: 'จัดโปรโมชั่นต่างๆ' },
  { id: 'p4', name: 'สินค้าเสื้อดำ', price: 159, targetUnits: 600, actualUnits: 600, stockOnHand: 95, reservedUnits: 18, reorderPoint: 100, strategy: 'เสนอขายเมื่อสนใจโปรแลกซื้อ 99 บาท' }
];

const initialTasks = [
  { id: 't1', date: '2026-05-18', camp: 'c1', title: 'บรีฟงาน Graphic', detail: 'ออกแบบลายใหม่ (1)', responsible: 'มัง', channel: 'หลังบ้าน', status: 'done' },
  { id: 't2', date: '2026-05-19', camp: 'c1', title: 'บรีฟงาน Graphic', detail: 'ออกแบบลายใหม่ (1)', responsible: 'มัง', channel: 'หลังบ้าน', status: 'done' },
  { id: 't3', date: '2026-05-20', camp: 'c1', title: 'บรีฟงาน Graphic', detail: 'ออกแบบลายใหม่ (1)', responsible: 'มัง', channel: 'หลังบ้าน', status: 'done' },
  { id: 't4', date: '2026-05-22', camp: 'c1', title: 'กราฟิกส่งงาน', detail: 'ส่งแบบลายใหม่ (1)', responsible: 'Graphic', channel: 'หลังบ้าน', status: 'done' },
  { id: 't5', date: '2026-05-23', camp: 'c1', title: 'ขึ้นตัวอย่าง เทสสี', detail: 'ส่งเทสลายพิมพ์และเนื้อผ้า', responsible: 'มัง', channel: 'หลังบ้าน', status: 'done' },
  { id: 't6', date: '2026-05-26', camp: 'c1', title: 'ได้รับตัวอย่าง พร้อมเปิด PO ลายใหม่ (1)', detail: 'เช็กความเรียบร้อยและเปิด PO 500 ตัว', responsible: 'มัง', channel: 'หลังบ้าน', status: 'done' },
  { id: 't7', date: '2026-05-30', camp: 'c1', title: 'เทรนเซล (Admin)', detail: 'เตรียมข้อมูลสำหรับการขาย ลายใหม่ (1)', responsible: 'มัง', channel: 'หลังบ้าน', status: 'done' },
  { id: 't8', date: '2026-05-31', camp: 'c1', title: 'Teaser ลายใหม่ (1)', detail: 'ภาพโปรโมต Teaser', responsible: 'MKT', channel: 'Line Broadcast', status: 'done' },
  { id: 't9', date: '2026-06-01', camp: 'c3', title: 'บรีฟงาน Graphic', detail: 'ออกแบบลายใหม่ (2)', responsible: 'มัง', channel: 'หลังบ้าน', status: 'done' },
  { id: 't10', date: '2026-06-02', camp: 'c1', title: 'แจ้งเตือนก่อนเปิดตัว ลายใหม่ (1)', detail: 'แจ้งเตือนก่อนเปิดพรีออเดอร์', responsible: 'MKT', channel: 'Line Broadcast', status: 'todo' },
  { id: 't11', date: '2026-06-03', camp: 'c1', title: '🚀 เปิดตัวลายใหม่ (1) อย่างเป็นทางการ', detail: 'พร้อม Pre-Order', responsible: 'มัง, MKT', channel: 'ทุกแพลตฟอร์ม + BC (Line OA/FB)', status: 'todo' },
  { id: 't12', date: '2026-06-04', camp: 'c3', title: 'กราฟิกอัปเดตงาน', detail: 'อัปเดตลายใหม่ (2)', responsible: 'Graphic', channel: 'หลังบ้าน', status: 'todo' },
  { id: 't13', date: '2026-06-05', camp: 'c3', title: 'กราฟิกส่งงาน', detail: 'สรุปแบบลายใหม่ (2)', responsible: 'Graphic', channel: 'หลังบ้าน', status: 'todo' },
  { id: 't14', date: '2026-06-06', camp: 'c3', title: 'กราฟิกส่งงาน', detail: 'AW โหวตลายเสื้อ', responsible: 'Graphic', channel: 'หลังบ้าน', status: 'todo' },
  { id: 't15', date: '2026-06-08', camp: 'c1', title: 'พร้อมส่ง ลายใหม่ (1)', detail: 'อัปเดตสินค้าพร้อมส่ง', responsible: 'มัง, MKT', channel: 'ทุกแพลตฟอร์ม + BC (Line OA/FB)', status: 'todo' },
  { id: 't16', date: '2026-06-09', camp: 'c3', title: 'โหวตลายใหม่ (2)', detail: 'กิจกรรมเปิดให้โหวตลายดีไซน์ใหม่ล่าสุด', responsible: 'มัง, MKT', channel: 'ทุกแพลตฟอร์ม', status: 'todo' },
  { id: 't17', date: '2026-06-10', camp: 'c3', title: 'ขึ้นตัวอย่าง', detail: 'ขึ้นตัวอย่างลายใหม่ (2)', responsible: 'มัง', channel: 'หลังบ้าน', status: 'todo' },
  { id: 't18', date: '2026-06-12', camp: 'c3', title: 'ได้รับตัวอย่าง', detail: 'ตัวอย่างลายใหม่ (2) เช็กความเรียบร้อย และเปิด PO 500 ตัว', responsible: 'มัง', channel: 'หลังบ้าน', status: 'todo' },
  { id: 't19', date: '2026-06-13', camp: 'c2', title: 'เทรนเซล (Admin)', detail: 'เตรียมข้อมูลเสื้อสีดำ', responsible: 'มัง', channel: 'หลังบ้าน', status: 'todo' },
  { id: 't20', date: '2026-06-15', camp: 'c2', title: 'โปรโล๊ะสต็อก & เริ่มรันดันเสื้อสีดำ', detail: 'โปรโล๊ะสต็อก ซื้อ 2 แถม 1 ราคา 299.- และ เสื้อสีดำ ราคา 159.-', responsible: 'มัง, MKT', channel: 'Line/FB Broadcast, MKP (Flash Sale 24 h)', status: 'todo' },
  { id: 't21', date: '2026-06-18', camp: 'c3', title: 'เทรนเซล & Teaser ลายใหม่ (2)', detail: 'เตรียมข้อมูลสำหรับการขาย ลายใหม่ (2)', responsible: 'มัง, MKT', channel: 'Line Broadcast', status: 'todo' },
  { id: 't22', date: '2026-06-21', camp: 'c3', title: 'แจ้งเตือนก่อนเปิดตัว ลายใหม่ (2)', detail: 'แจ้งเตือนการสั่งสินค้า', responsible: 'MKT', channel: 'Line Broadcast', status: 'todo' },
  { id: 't23', date: '2026-06-22', camp: 'c3', title: 'พร้อมส่ง ลายใหม่ (2)', detail: 'อัปเดตสินค้าพร้อมส่ง', responsible: 'มัง, MKT', channel: 'ทุกแพลตฟอร์ม + BC (Line OA/FB)', status: 'todo' },
  { id: 't24', date: '2026-06-26', camp: 'c3', title: 'กระตุ้นใกล้หมด ลายใหม่(2)', detail: 'โปรโมทกระตุ้นยอดขายใกล้หมดลายใหม่', responsible: 'มัง, MKT', channel: 'Line/FB Broadcast', status: 'todo' }
];

const initialPOs = [
  { id: 'po-1', product: 'ลายใหม่ (1)', quantity: 500, orderDate: '2026-05-26', arrivalDate: '2026-06-08', status: 'Pending' },
  { id: 'po-2', product: 'ลายใหม่ (2)', quantity: 500, orderDate: '2026-06-12', arrivalDate: '2026-06-22', status: 'Pending' }
];

const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const dayLabels = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const getLocalDateString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getCampaignStyle = (camp, currentTheme) => {
  if (!camp) return { backgroundColor: 'var(--surface-hover)', borderColor: 'var(--border)', color: 'var(--text-main)' };
  
  const color = camp.color || '#64748b';
  
  if (currentTheme === 'dark') {
    const hexToRgba = (hex, alpha) => {
      let c = String(hex).trim().replace('#', '');
      if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
      const r = parseInt(c.substring(0, 2), 16) || 0;
      const g = parseInt(c.substring(2, 4), 16) || 0;
      const b = parseInt(c.substring(4, 6), 16) || 0;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    
    try {
      return {
        backgroundColor: hexToRgba(color, 0.12),
        borderColor: hexToRgba(color, 0.35),
        color: color
      };
    } catch {
      return {
        backgroundColor: 'rgba(99, 102, 241, 0.12)',
        borderColor: 'rgba(99, 102, 241, 0.35)',
        color: color
      };
    }
  } else {
    return {
      backgroundColor: camp.bg || '#f1f5f9',
      borderColor: camp.border || '#e2e8f0',
      color: color
    };
  }
};

const safeReadJson = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeStoredProducts = (products) => products.map(product => ({
  ...product,
  stockOnHand: Number(product.stockOnHand || 0),
  reservedUnits: Number(product.reservedUnits || 0),
  reorderPoint: Number(product.reorderPoint || 0)
}));

function SearchableMultiSelect({
  placeholder,
  options,
  selectedValues,
  onChange,
  onAddOption,
  onDeleteOption,
  addPlaceholder = "เพิ่มรายการใหม่..."
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = React.useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isOpen]);

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleOption = (val) => {
    if (selectedValues.includes(val)) {
      onChange(selectedValues.filter(v => v !== val));
    } else {
      onChange([...selectedValues, val]);
    }
  };

  const handleAdd = () => {
    const trimmed = searchTerm.trim();
    if (trimmed) {
      const exists = options.some(o => o.toLowerCase() === trimmed.toLowerCase());
      if (!exists) {
        onAddOption(trimmed);
        onChange([...selectedValues, trimmed]);
        setSearchTerm('');
      } else {
        const existingName = options.find(o => o.toLowerCase() === trimmed.toLowerCase());
        if (!selectedValues.includes(existingName)) {
          onChange([...selectedValues, existingName]);
        }
        setSearchTerm('');
      }
    }
  };

  return (
    <div className="custom-select-container" ref={containerRef}>
      <div
        className="custom-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedValues.map(val => (
          <span
            key={val}
            className="select-tag"
            onClick={(e) => {
              e.stopPropagation();
              toggleOption(val);
            }}
          >
            {val}
            <button
              type="button"
              className="tag-remove-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleOption(val);
              }}
            >
              &times;
            </button>
          </span>
        ))}
        {selectedValues.length === 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{placeholder}</span>
        )}
        <i
          className="fa-solid fa-chevron-down"
          style={{
            position: 'absolute',
            right: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            pointerEvents: 'none'
          }}
        ></i>
      </div>

      {isOpen && (
        <div className="custom-select-dropdown">
          <input
            type="text"
            className="dropdown-search-input"
            placeholder={addPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleAdd();
              }
            }}
            autoFocus
          />

          <div className="dropdown-options-list">
            {filteredOptions.map(opt => {
              const checked = selectedValues.includes(opt);
              return (
                <div
                  key={opt}
                  className={`dropdown-option-item ${checked ? 'selected' : ''}`}
                  onClick={() => toggleOption(opt)}
                >
                  <label className="dropdown-option-checkbox-label" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleOption(opt)}
                    />
                    <span>{opt}</span>
                  </label>
                  {onDeleteOption && (
                    <button
                      type="button"
                      className="dropdown-option-delete-btn"
                      title="ลบตัวเลือกนี้ออกจากระบบ"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`ต้องการลบ "${opt}" ออกจากรายการใช่หรือไม่?`)) {
                          onDeleteOption(opt);
                          if (checked) {
                            onChange(selectedValues.filter(v => v !== opt));
                          }
                        }
                      }}
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  )}
                </div>
              );
            })}
            {filteredOptions.length === 0 && searchTerm.trim() && (
              <div className="dropdown-option-item add-new-option" onClick={(e) => {
                e.stopPropagation();
                handleAdd();
              }}>
                <span style={{ color: 'var(--primary)', fontWeight: '600' }}>
                  <i className="fa-solid fa-plus" style={{ marginRight: '6px' }}></i>
                  เพิ่ม "{searchTerm}"
                </span>
              </div>
            )}
            {filteredOptions.length === 0 && !searchTerm.trim() && (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' }}>
                ไม่พบข้อมูล
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Theme & Page States
  const [theme, setTheme] = useState(() => localStorage.getItem('tmk_theme') || 'light');
  const [activeTab, setActiveTab] = useState(() => {
    const savedTab = localStorage.getItem('tmk_active_tab');
    return savedTab && savedTab !== 'today' ? savedTab : 'dashboard';
  });
  const todayStr = getLocalDateString();
  
  // Responsive Screen Width State
  const [windowWidth, setWindowWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    localStorage.removeItem('tmk_staff_list');
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Timeline Filter & Search States
  const [timelineFilter, setTimelineFilter] = useState('master');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [timelinePriority, setTimelinePriority] = useState('all');

  // Main Data States
  const [campaigns, setCampaigns] = useState(() => safeReadJson('tmk_campaigns', initialCampaigns));
  const [channels, setChannels] = useState(() => safeReadJson('tmk_channels', initialChannels));
  const [products, setProducts] = useState(() => normalizeStoredProducts(safeReadJson('tmk_products', initialProducts)));
  const [tasks, setTasks] = useState(() => safeReadJson('tmk_tasks', initialTasks));
  const [poTracker, setPoTracker] = useState(() => safeReadJson('tmk_pos', initialPOs));
  const [remoteReady, setRemoteReady] = useState(!tmkRepository.isConfigured);
  const [remoteStatus, setRemoteStatus] = useState(tmkRepository.isConfigured ? 'กำลังเชื่อมต่อ Supabase...' : 'Local mode');
  const [isRefreshingRemote, setIsRefreshingRemote] = useState(false);

  // Dynamic staff list state
  const [staffList, setStaffList] = useState(() => {
    const saved = localStorage.getItem('tmk_staff_list_v2');
    return saved ? safeReadJson('tmk_staff_list_v2', []) : ['มัง', 'MKT', 'Graphic', 'Admin'];
  });

  // Dynamic promo channels list state
  const [promoChannels, setPromoChannels] = useState(() => {
    const saved = localStorage.getItem('tmk_promo_channels');
    return saved ? safeReadJson('tmk_promo_channels', []) : ['หลังบ้าน', 'Line Broadcast', 'FB Post', 'TikTok Shop', 'ทุกแพลตฟอร์ม', 'Line/FB Broadcast', 'ทุกแพลตฟอร์ม + BC (Line OA/FB)'];
  });

  // Recycle Bin State
  const [trashItems, setTrashItems] = useState(() => {
    const saved = localStorage.getItem('tmk_recycle_bin');
    return saved ? safeReadJson('tmk_recycle_bin', []) : [];
  });
  const [showTrashModal, setShowTrashModal] = useState(false);

  useEffect(() => {
    localStorage.setItem('tmk_recycle_bin', JSON.stringify(trashItems));
  }, [trashItems]);
  
  
  // Dashboard & Target States
  const [totalTarget, setTotalTarget] = useState(() => Number(localStorage.getItem('tmk_total_target')) || 1001580);
  const [totalUnitsTarget, setTotalUnitsTarget] = useState(() => Number(localStorage.getItem('tmk_total_units')) || 3850);
  const [isEditingTargets, setIsEditingTargets] = useState(false);

  // Calendar State
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateString());
  const [campFilter, setCampFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  // Modals & Forms States
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskModalMode, setTaskModalMode] = useState('add'); // 'add' | 'edit'
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskForm, setTaskForm] = useState({ date: '', title: '', detail: '', responsible: 'มัง', channel: 'หลังบ้าน', camp: 'c1', status: 'todo', priority: 'medium', checklist: [], comments: [], attachments: [], reminderDays: 1 });
  const [showDataMenu, setShowDataMenu] = useState(false);
  const [draggedOverCol, setDraggedOverCol] = useState(null);

  const [showChannelModal, setShowChannelModal] = useState(false);
  const [channelForm, setChannelForm] = useState({ id: '', name: '', percentage: 0, actual: 0, color: '#3b82f6' });
  const [isChannelEditMode, setIsChannelEditMode] = useState(false);

  const [showProductModal, setShowProductModal] = useState(false);
  const [productForm, setProductForm] = useState({ id: '', name: '', price: 0, targetUnits: 0, actualUnits: 0, stockOnHand: 0, reservedUnits: 0, reorderPoint: 0, strategy: '' });
  const [isProductEditMode, setIsProductEditMode] = useState(false);

  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ id: '', name: '', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' });
  const [isCampaignEditMode, setIsCampaignEditMode] = useState(false);

  const [showPoModal, setShowPoModal] = useState(false);
  const [poForm, setPoForm] = useState({ id: '', product: '', quantity: 0, orderDate: '', arrivalDate: '', status: 'Pending' });
  const [isPoEditMode, setIsPoEditMode] = useState(false);
  const syncingFromRemoteRef = useRef(false);
  const hasRestoredScrollRef = useRef(false);

  const applyRemoteData = useCallback((remoteData) => {
    if (!remoteData) return;
    syncingFromRemoteRef.current = true;
    setCampaigns(remoteData.campaigns);
    setChannels(remoteData.channels);
    setProducts(remoteData.products);
    setTasks(remoteData.tasks);
    setPoTracker(remoteData.poTracker);
    setTotalTarget(remoteData.totalTarget);
    setTotalUnitsTarget(remoteData.totalUnitsTarget);
    window.setTimeout(() => {
      syncingFromRemoteRef.current = false;
    }, 500);
  }, []);

  const loadRemoteData = useCallback(async (statusLabel = 'Supabase connected') => {
    if (!tmkRepository.isConfigured) return;
    const remoteData = await tmkRepository.loadAll();
    if (!remoteData) return;
    applyRemoteData(remoteData);
    setRemoteStatus(statusLabel);
  }, [applyRemoteData]);

  const refreshRemoteData = async () => {
    if (!tmkRepository.isConfigured || isRefreshingRemote) return;
    const scrollY = window.scrollY;
    setIsRefreshingRemote(true);
    try {
      await loadRemoteData('Supabase refreshed');
      window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
    } catch (error) {
      console.error('Supabase manual refresh failed:', error);
      setRemoteStatus('Supabase refresh error');
    } finally {
      setIsRefreshingRemote(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrapRemoteData = async () => {
      if (!tmkRepository.isConfigured) return;
      try {
        await loadRemoteData();
      } catch (error) {
        console.error('Supabase load failed:', error);
        setRemoteStatus('Supabase error: ใช้ข้อมูลในเครื่องชั่วคราว');
      } finally {
        if (!cancelled) setRemoteReady(true);
      }
    };

    bootstrapRemoteData();

    const unsubscribe = tmkRepository.subscribeToChanges(async () => {
      if (cancelled) return;
      try {
        await loadRemoteData('Supabase realtime synced');
      } catch (error) {
        console.error('Supabase realtime refresh failed:', error);
        setRemoteStatus('Supabase realtime error');
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadRemoteData]);

  const saveRemote = useCallback(async (label, saveFn) => {
    if (!remoteReady || !tmkRepository.isConfigured) return;
    if (syncingFromRemoteRef.current) return;
    try {
      await saveFn();
    } catch (error) {
      console.error(`Supabase save failed: ${label}`, error);
    }
  }, [remoteReady]);

  // Sync to local storage and Supabase when configured.
  useEffect(() => {
    localStorage.setItem('tmk_theme', theme);
    document.documentElement.classList.toggle('dark-theme', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('tmk_campaigns', JSON.stringify(campaigns));
    saveRemote('campaigns', () => tmkRepository.saveCampaigns(campaigns));
  }, [campaigns, saveRemote]);

  useEffect(() => {
    localStorage.setItem('tmk_channels', JSON.stringify(channels));
    saveRemote('channels', () => tmkRepository.saveChannels(channels));
  }, [channels, saveRemote]);

  useEffect(() => {
    localStorage.setItem('tmk_products', JSON.stringify(products));
    saveRemote('products', () => tmkRepository.saveProducts(products));
  }, [products, saveRemote]);

  useEffect(() => {
    localStorage.setItem('tmk_tasks', JSON.stringify(tasks));
    saveRemote('tasks', () => tmkRepository.saveTasks(tasks));
  }, [tasks, saveRemote]);

  useEffect(() => {
    localStorage.setItem('tmk_staff_list_v2', JSON.stringify(staffList));
  }, [staffList]);

  useEffect(() => {
    localStorage.setItem('tmk_active_tab', activeTab);
    const savedScroll = sessionStorage.getItem(`tmk_scroll_${activeTab}`);
    if (!hasRestoredScrollRef.current && savedScroll) {
      hasRestoredScrollRef.current = true;
      window.requestAnimationFrame(() => window.scrollTo(0, Number(savedScroll) || 0));
    }
  }, [activeTab]);

  useEffect(() => {
    const saveScroll = () => {
      sessionStorage.setItem(`tmk_scroll_${activeTab}`, String(window.scrollY));
    };
    window.addEventListener('beforeunload', saveScroll);
    return () => {
      saveScroll();
      window.removeEventListener('beforeunload', saveScroll);
    };
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('tmk_promo_channels', JSON.stringify(promoChannels));
  }, [promoChannels]);

  useEffect(() => {
    localStorage.setItem('tmk_pos', JSON.stringify(poTracker));
    saveRemote('purchase orders', () => tmkRepository.savePurchaseOrders(poTracker));
  }, [poTracker, saveRemote]);

  useEffect(() => {
    localStorage.setItem('tmk_total_target', totalTarget.toString());
    saveRemote('target', () => tmkRepository.saveSettings({ totalTarget, totalUnitsTarget }));
  }, [totalTarget, totalUnitsTarget, saveRemote]);

  useEffect(() => {
    localStorage.setItem('tmk_total_units', totalUnitsTarget.toString());
  }, [totalUnitsTarget]);

  // Extract staff and channel options dynamically from tasks to prevent empty lists on fresh browser/Vercel load
  useEffect(() => {
    if (!tasks || tasks.length === 0) return;

    // 1. Merge staff from tasks
    const currentStaffSet = new Set(staffList);
    let staffUpdated = false;
    tasks.forEach(t => {
      if (t.responsible) {
        t.responsible.split(/[,/+\s]+/).forEach(s => {
          const name = s.trim();
          if (name && !currentStaffSet.has(name)) {
            currentStaffSet.add(name);
            staffUpdated = true;
          }
        });
      }
    });
    if (staffUpdated) {
      setStaffList(Array.from(currentStaffSet));
    }

    // 2. Merge promo channels from tasks
    const currentChannelsSet = new Set(promoChannels);
    let channelsUpdated = false;
    tasks.forEach(t => {
      if (t.channel) {
        t.channel.split(/[,/+\s]+/).forEach(c => {
          const name = c.trim();
          if (name && !currentChannelsSet.has(name)) {
            currentChannelsSet.add(name);
            channelsUpdated = true;
          }
        });
      }
    });
    if (channelsUpdated) {
      setPromoChannels(Array.from(currentChannelsSet));
    }
  }, [tasks]);

  // Calc summaries
  const totalActualSales = channels.reduce((sum, ch) => sum + ch.actual, 0);
  const totalActualUnits = products.reduce((sum, prod) => sum + prod.actualUnits, 0);
  const targetCompletedPercent = totalTarget > 0 ? Math.min(999, Number(((totalActualSales / totalTarget) * 100).toFixed(1))) : 0;
  const targetCompletedLabel = Number.isInteger(targetCompletedPercent) ? `${targetCompletedPercent}%` : `${targetCompletedPercent.toFixed(1)}%`;

  // Change Month Nav
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  // Generate Month Grid
  const getDaysInMonth = (yr, mo) => {
    const firstDayIndex = new Date(yr, mo, 1).getDay();
    const totalDays = new Date(yr, mo + 1, 0).getDate();
    return { firstDayIndex, totalDays };
  };

  const { firstDayIndex, totalDays } = getDaysInMonth(currentYear, currentMonth);

  // Filter Tasks
  const getFilteredTasks = (dateStr) => {
    return tasks.filter(task => {
      const isDate = task.date === dateStr;
      const isCamp = campFilter === 'all' || task.camp === campFilter;
      const isRole = roleFilter === 'all' || new RegExp(roleFilter, 'i').test(task.responsible);
      const isPriority = timelinePriority === 'all' || (task.priority || 'medium') === timelinePriority;
      
      let isSearch = true;
      if (timelineSearch.trim()) {
        const q = timelineSearch.toLowerCase();
        isSearch = task.title.toLowerCase().includes(q) || 
                   task.detail.toLowerCase().includes(q) || 
                   task.responsible.toLowerCase().includes(q) ||
                   (task.channel || '').toLowerCase().includes(q);
      }
      return isDate && isCamp && isRole && isPriority && isSearch;
    });
  };

  // Filter Kanban Tasks
  const getFilteredKanbanTasks = (status) => {
    return tasks.filter(task => {
      const isStatus = task.status === status;
      const isCamp = campFilter === 'all' || task.camp === campFilter;
      const isRole = roleFilter === 'all' || new RegExp(roleFilter, 'i').test(task.responsible);
      const isPriority = timelinePriority === 'all' || (task.priority || 'medium') === timelinePriority;
      
      let isSearch = true;
      if (timelineSearch.trim()) {
        const q = timelineSearch.toLowerCase();
        isSearch = task.title.toLowerCase().includes(q) || 
                   task.detail.toLowerCase().includes(q) || 
                   task.responsible.toLowerCase().includes(q) ||
                   (task.channel || '').toLowerCase().includes(q);
      }
      return isStatus && isCamp && isRole && isPriority && isSearch;
    });
  };

  // Render Priority Badge
  const renderPriorityBadge = (priority) => {
    const p = priority || 'medium';
    if (p === 'high') {
      return <span className="priority-badge high"><i className="fa-solid fa-fire"></i> สูง</span>;
    }
    if (p === 'low') {
      return <span className="priority-badge low"><i className="fa-solid fa-moon"></i> ต่ำ</span>;
    }
    return <span className="priority-badge medium"><i className="fa-solid fa-bolt"></i> กลาง</span>;
  };

  // Drag and Drop (Kanban)
  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('text/plain', taskId);
  };

  const handleDrop = (e, status) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t));
    setDraggedOverCol(null);
  };



  // Checklist handlers
  const toggleChecklistItem = (taskId, itemId) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const checklist = (t.checklist || []).map(item => 
          item.id === itemId ? { ...item, completed: !item.completed } : item
        );
        return { ...t, checklist };
      }
      return t;
    }));
  };

  const addChecklistItem = (taskId, text) => {
    if (!text || !text.trim()) return;
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const newItem = { id: 'sub-' + Date.now() + Math.random().toString(36).substr(2, 5), text: text.trim(), completed: false };
        return { ...t, checklist: [...(t.checklist || []), newItem] };
      }
      return t;
    }));
  };

  const deleteChecklistItem = (taskId, itemId) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const checklist = (t.checklist || []).filter(item => item.id !== itemId);
        return { ...t, checklist };
      }
      return t;
    }));
  };

  const getTimelineDateParts = (dateStr) => {
    const parts = dateStr.split('-');
    if (parts.length < 3) return { day: '00', month: 'ม.ค.', year: '2026' };
    const day = parts[2];
    const monthIndex = parseInt(parts[1]) - 1;
    const shortMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const month = shortMonths[monthIndex] || '';
    return { day, month, year: parts[0] };
  };

  const getStaffList = () => {
    return staffList;
  };

  const getTimelineTasks = (campId) => {
    let filtered = tasks;
    if (campId && campId !== 'master' && campId !== 'stacked') {
      filtered = filtered.filter(t => t.camp === campId);
    }
    if (timelineSearch.trim()) {
      const q = timelineSearch.toLowerCase();
      filtered = filtered.filter(t => 
        t.title.toLowerCase().includes(q) || 
        t.detail.toLowerCase().includes(q) || 
        t.responsible.toLowerCase().includes(q) ||
        t.channel.toLowerCase().includes(q)
      );
    }
    if (timelinePriority !== 'all') {
      filtered = filtered.filter(t => (t.priority || 'medium') === timelinePriority);
    }
    return [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const renderInlineChecklist = (task) => {
    const list = task.checklist || [];
    const completed = list.filter(item => item.completed).length;
    const total = list.length;
    
    return (
      <div className="checklist-container" onClick={(e) => e.stopPropagation()}>
        <div className="checklist-title">
          <span>เช็คลิสต์งานย่อย</span>
          <span>{completed}/{total}</span>
        </div>
        {list.map(item => (
          <div key={item.id} className="checklist-item">
            <input 
              type="checkbox" 
              className="checklist-checkbox" 
              checked={item.completed} 
              onChange={() => toggleChecklistItem(task.id, item.id)} 
            />
            <span className={`checklist-text ${item.completed ? 'crossed' : ''}`}>
              {item.text}
            </span>
            <button 
              type="button" 
              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', marginLeft: 'auto', padding: '2px 4px' }}
              onClick={() => deleteChecklistItem(task.id, item.id)}
              title="ลบงานย่อย"
            >
              <i className="fa-solid fa-trash-can" style={{ fontSize: '11px' }}></i>
            </button>
          </div>
        ))}
        <div className="checklist-add-row" style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
          <input 
            type="text" 
            placeholder="เพิ่มงานย่อย แล้วกด Enter..." 
            className="checklist-input" 
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addChecklistItem(task.id, e.target.value);
                e.target.value = '';
              }
            }}
          />
          <button 
            type="button" 
            className="btn" 
            style={{ padding: '4px 10px', fontSize: '11px' }}
            onClick={(e) => {
              const input = e.currentTarget.previousSibling;
              if (input && input.value) {
                addChecklistItem(task.id, input.value);
                input.value = '';
              }
            }}
          >
            เพิ่ม
          </button>
        </div>
      </div>
    );
  };

  const getHashColor = (str, isChannel = false) => {
    const colors = [
      { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.3)', text: 'var(--primary)' }, // Indigo
      { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)', text: 'var(--success)' }, // Green/Emerald
      { bg: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.3)', text: 'var(--kpi-blue)' }, // Sky Blue
      { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: 'var(--warning)' }, // Amber
      { bg: 'rgba(217, 70, 239, 0.12)', border: 'rgba(217, 70, 239, 0.3)', text: '#d946ef' }, // Fuchsia
      { bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.3)', text: 'var(--danger)' }, // Red
      { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.3)', text: '#8b5cf6' }, // Purple
      { bg: 'rgba(20, 184, 166, 0.12)', border: 'rgba(20, 184, 166, 0.3)', text: '#14b8a6' }, // Teal
    ];
    
    if (!isChannel) {
      if (str === 'มัง') return colors[0];
      if (str === 'ฝ้าย') return colors[1];
      if (str === 'บีม') return colors[2];
      if (str === 'แตงโม') return colors[4];
      if (str === 'Graphic') return colors[6];
      if (str === 'MKT') return colors[3];
      if (str === 'Admin') return colors[7];
    } else {
      if (str === 'หลังบ้าน') return colors[0];
      if (str === 'Line Broadcast') return colors[2];
      if (str === 'FB Post') return colors[3];
      if (str === 'TikTok Shop') return colors[4];
      if (str === 'ทุกแพลตฟอร์ม') return colors[1];
    }
    
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const renderResponsibleTags = (responsibleStr) => {
    if (!responsibleStr) return null;
    const staffArr = responsibleStr.split(',').map(s => s.trim()).filter(Boolean);
    return staffArr.map(staff => {
      const colors = getHashColor(staff, false);
      return (
        <span 
          key={staff} 
          className="task-pill-responsible" 
          style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
        >
          <i className="fa-solid fa-user-circle" style={{ fontSize: '10px' }}></i>
          {staff}
        </span>
      );
    });
  };

  const renderChannelTags = (channelStr) => {
    if (!channelStr) return null;
    const channelArr = channelStr.split(',').map(c => c.trim()).filter(Boolean);
    return channelArr.map(chan => {
      const colors = getHashColor(chan, true);
      return (
        <span 
          key={chan} 
          className="task-pill-channel" 
          style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }}
        >
          <i className="fa-solid fa-circle-nodes" style={{ fontSize: '10px' }}></i>
          {chan}
        </span>
      );
    });
  };


  // Task CRUD Handlers
  const openAddTask = (dateStr) => {
    setTaskModalMode('add');
    setTaskForm({ 
      date: dateStr || '', 
      title: '', 
      detail: '', 
      responsible: 'มัง', 
      channel: 'หลังบ้าน', 
      camp: campaigns[0]?.id || 'c1', 
      status: 'todo',
      priority: 'medium',
      checklist: [],
      comments: [],
      attachments: [],
      reminderDays: 1
    });
    setShowTaskModal(true);
  };

  const openEditTask = (task) => {
    setTaskModalMode('edit');
    setEditingTaskId(task.id);
    setTaskForm({ 
      priority: 'medium',
      checklist: [],
      comments: [],
      attachments: [],
      reminderDays: 1,
      ...task 
    });
    setShowTaskModal(true);
  };

  const saveTask = (e) => {
    e.preventDefault();
    if (taskModalMode === 'add') {
      const newTask = {
        ...taskForm,
        id: 't-' + Date.now()
      };
      setTasks(prev => [...prev, newTask]);
    } else {
      setTasks(prev => prev.map(t => t.id === editingTaskId ? { ...taskForm, id: editingTaskId } : t));
    }
    setShowTaskModal(false);
  };

  const deleteTask = (taskId) => {
    if (confirm('ยืนยันที่จะลบหัวข้องานปฏิบัตินี้ออกใช่หรือไม่?')) {
      const taskToDelete = tasks.find(t => t.id === taskId);
      if (taskToDelete) {
        setTrashItems(prev => [
          ...prev,
          {
            id: 'trash-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            originalId: taskToDelete.id,
            type: 'task',
            name: taskToDelete.title || 'ไม่มีหัวข้อ',
            deletedAt: new Date().toISOString(),
            data: taskToDelete
          }
        ]);
      }
      setTasks(prev => prev.filter(t => t.id !== taskId));
    }
  };

  // Channel CRUD Handlers
  const openAddChannel = () => {
    setIsChannelEditMode(false);
    setChannelForm({ id: '', name: '', percentage: 0, actual: 0, color: '#3b82f6' });
    setShowChannelModal(true);
  };

  const openEditChannel = (ch) => {
    setIsChannelEditMode(true);
    setChannelForm({ ...ch });
    setShowChannelModal(true);
  };

  const saveChannel = (e) => {
    e.preventDefault();
    if (!isChannelEditMode) {
      const newCh = { ...channelForm, id: 'ch-' + Date.now() };
      setChannels(prev => [...prev, newCh]);
    } else {
      setChannels(prev => prev.map(ch => ch.id === channelForm.id ? channelForm : ch));
    }
    setShowChannelModal(false);
  };

  const deleteChannel = (id) => {
    if (confirm('คุณต้องการลบช่องทางการขายนี้ใช่หรือไม่?')) {
      const channelToDelete = channels.find(ch => ch.id === id);
      if (channelToDelete) {
        setTrashItems(prev => [
          ...prev,
          {
            id: 'trash-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            originalId: channelToDelete.id,
            type: 'channel',
            name: channelToDelete.name || 'ไม่มีชื่อช่องทาง',
            deletedAt: new Date().toISOString(),
            data: channelToDelete
          }
        ]);
      }
      setChannels(prev => prev.filter(ch => ch.id !== id));
    }
  };



  // Product CRUD Handlers
  const openAddProduct = () => {
    setIsProductEditMode(false);
    setProductForm({ id: '', name: '', price: 0, targetUnits: 0, actualUnits: 0, stockOnHand: 0, reservedUnits: 0, reorderPoint: 0, strategy: '' });
    setShowProductModal(true);
  };

  const openEditProduct = (prod) => {
    setIsProductEditMode(true);
    setProductForm({ ...prod });
    setShowProductModal(true);
  };

  const saveProduct = (e) => {
    e.preventDefault();
    if (!isProductEditMode) {
      const newProd = { ...productForm, id: 'p-' + Date.now() };
      setProducts(prev => [...prev, newProd]);
    } else {
      setProducts(prev => prev.map(p => p.id === productForm.id ? productForm : p));
    }
    setShowProductModal(false);
  };

  const deleteProduct = (id) => {
    if (confirm('คุณต้องการลบสินค้านี้ใช่หรือไม่?')) {
      const productToDelete = products.find(p => p.id === id);
      if (productToDelete) {
        setTrashItems(prev => [
          ...prev,
          {
            id: 'trash-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            originalId: productToDelete.id,
            type: 'product',
            name: productToDelete.name || 'ไม่มีชื่อสินค้า',
            deletedAt: new Date().toISOString(),
            data: productToDelete
          }
        ]);
      }
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  // Campaign CRUD Handlers
  const openAddCampaign = () => {
    setIsCampaignEditMode(false);
    setCampaignForm({ id: '', name: '', color: '#3b82f6', bg: '#f0f9ff', border: '#bae6fd' });
    setShowCampaignModal(true);
  };

  const openEditCampaign = (camp) => {
    setIsCampaignEditMode(true);
    setCampaignForm({ ...camp });
    setShowCampaignModal(true);
  };

  const saveCampaign = (e) => {
    e.preventDefault();
    if (!isCampaignEditMode) {
      const newCamp = { ...campaignForm, id: 'c-' + Date.now() };
      setCampaigns(prev => [...prev, newCamp]);
    } else {
      setCampaigns(prev => prev.map(c => c.id === campaignForm.id ? campaignForm : c));
    }
    setShowCampaignModal(false);
  };

  const deleteCampaign = (id) => {
    if (confirm('ลบแคมเปญนี้ จะทำให้งานทั้งหมดที่ผูกอยู่ไม่มีสีแคมเปญ ต้องการลบใช่หรือไม่?')) {
      const campaignToDelete = campaigns.find(c => c.id === id);
      if (campaignToDelete) {
        setTrashItems(prev => [
          ...prev,
          {
            id: 'trash-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            originalId: campaignToDelete.id,
            type: 'campaign',
            name: campaignToDelete.name || 'ไม่มีชื่อแคมเปญ',
            deletedAt: new Date().toISOString(),
            data: campaignToDelete
          }
        ]);
      }
      setCampaigns(prev => prev.filter(c => c.id !== id));
    }
  };

  // PO CRUD Handlers
  const openAddPo = () => {
    setIsPoEditMode(false);
    setPoForm({ id: '', product: '', quantity: 0, orderDate: '', arrivalDate: '', status: 'Pending' });
    setShowPoModal(true);
  };

  const openEditPo = (po) => {
    setIsPoEditMode(true);
    setPoForm({ ...po });
    setShowPoModal(true);
  };

  const savePo = (e) => {
    e.preventDefault();
    if (!isPoEditMode) {
      const newPo = { ...poForm, id: 'po-' + Date.now() };
      setPoTracker(prev => [...prev, newPo]);
    } else {
      setPoTracker(prev => prev.map(p => p.id === poForm.id ? poForm : p));
    }
    setShowPoModal(false);
  };

  const deletePo = (id) => {
    if (confirm('ต้องการลบประวัติ PO นี้ออกใช่หรือไม่?')) {
      const poToDelete = poTracker.find(p => p.id === id);
      if (poToDelete) {
        setTrashItems(prev => [
          ...prev,
          {
            id: 'trash-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            originalId: poToDelete.id,
            type: 'po',
            name: `PO: ${poToDelete.product} (${poToDelete.quantity} ชิ้น)`,
            deletedAt: new Date().toISOString(),
            data: poToDelete
          }
        ]);
      }
      setPoTracker(prev => prev.filter(p => p.id !== id));
    }
  };

  const restoreTrashItem = (item) => {
    if (!item || !item.data) return;
    const type = item.type;
    const data = item.data;
    
    if (type === 'task') {
      setTasks(prev => {
        if (prev.some(t => t.id === data.id)) return prev;
        return [...prev, data];
      });
    } else if (type === 'product') {
      setProducts(prev => {
        if (prev.some(p => p.id === data.id)) return prev;
        return [...prev, data];
      });
    } else if (type === 'campaign') {
      setCampaigns(prev => {
        if (prev.some(c => c.id === data.id)) return prev;
        return [...prev, data];
      });
    } else if (type === 'po') {
      setPoTracker(prev => {
        if (prev.some(p => p.id === data.id)) return prev;
        return [...prev, data];
      });
    } else if (type === 'channel') {
      setChannels(prev => {
        if (prev.some(c => c.id === data.id)) return prev;
        return [...prev, data];
      });
    }
    
    setTrashItems(prev => prev.filter(t => t.id !== item.id));
    alert(`กู้คืน "${item.name}" เรียบร้อยแล้ว`);
  };

  const deleteTrashItemPermanently = (itemId) => {
    const item = trashItems.find(t => t.id === itemId);
    if (!item) return;
    if (confirm(`คุณต้องการลบ "${item.name}" ทิ้งให้สิ้นซาก (ถาวร) ใช่หรือไม่?`)) {
      setTrashItems(prev => prev.filter(t => t.id !== itemId));
    }
  };

  const emptyTrash = () => {
    if (confirm('คุณต้องการล้างถังขยะทั้งหมด (ทิ้งให้สิ้นซาก) ใช่หรือไม่?')) {
      setTrashItems([]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Top Command Header */}
      <header className="app-header">
        <div className="header-brand-block">
          <div className="brand-mark">TMK</div>
          <div className="brand-copy">
            <div className="brand-eyebrow">
              <span className="live-dot"></span>
              Operations Hub
            </div>
            <h1>Campaign Control Room</h1>
            <p>Sales target, launch work, team execution, and factory PO in one place.</p>
            <span className={`sync-status ${tmkRepository.isConfigured ? 'remote' : 'local'}`}>
              <i className={`fa-solid ${tmkRepository.isConfigured ? 'fa-database' : 'fa-laptop'}`}></i>
              {remoteStatus}
            </span>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="icon-btn"
            onClick={refreshRemoteData}
            disabled={!tmkRepository.isConfigured || isRefreshingRemote}
            title="รีเฟรชข้อมูลจาก Supabase"
            aria-label="รีเฟรชข้อมูลจาก Supabase"
          >
            <i className={`fa-solid fa-rotate ${isRefreshingRemote ? 'fa-spin' : ''}`}></i>
          </button>
          <button className="btn btn-primary header-main-action" onClick={() => openAddTask(todayStr)}>
            <i className="fa-solid fa-plus"></i>
            <span>เพิ่มงานวันนี้</span>
          </button>
          <div className="data-menu-wrapper">
            <button className={`icon-btn ${showDataMenu ? 'active' : ''}`} onClick={() => setShowDataMenu(prev => !prev)} title="จัดการข้อมูล" aria-label="จัดการข้อมูล">
              <i className="fa-solid fa-ellipsis-vertical"></i>
            </button>
            {showDataMenu && (
              <div className="data-menu">
                <button type="button" onClick={() => { setActiveTab('campaigns'); setShowDataMenu(false); }}>
                  <i className="fa-solid fa-layer-group"></i>
                  <span>
                    <strong>Campaign Settings</strong>
                    <small>จัดการชื่อและสีแคมเปญ</small>
                  </span>
                </button>
                <button type="button" onClick={() => { setTheme(prev => prev === 'light' ? 'dark' : 'light'); setShowDataMenu(false); }}>
                  <i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i>
                  <span>
                    <strong>{theme === 'light' ? 'โหมดมืด (Dark Mode)' : 'โหมดสว่าง (Light Mode)'}</strong>
                    <small>{theme === 'light' ? 'เปลี่ยนหน้าจอเป็นสีเข้ม' : 'เปลี่ยนหน้าจอเป็นสีสว่าง'}</small>
                  </span>
                </button>
                <button type="button" className="danger" onClick={() => { setShowTrashModal(true); setShowDataMenu(false); }}>
                  <i className="fa-solid fa-trash-can"></i>
                  <span>
                    <strong>ถังขยะ (Recycle Bin)</strong>
                    <small>กู้คืนข้อมูล หรือลบทิ้งถาวร</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Tab Links */}
      <div className="nav-tabs-wrapper">
        <nav className="nav-tabs">
          <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
            <i className="fa-solid fa-chart-pie"></i> แดชบอร์ดเป้าหมาย
          </button>
          <button className={`tab-btn ${activeTab === 'timelines' ? 'active' : ''}`} onClick={() => setActiveTab('timelines')}>
            <i className="fa-solid fa-route"></i> ไทม์ไลน์แคมเปญ (Timelines)
          </button>
          <button className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
            <i className="fa-solid fa-calendar-days"></i> ปฏิทินปฏิบัติงาน
          </button>
          <button className={`tab-btn ${activeTab === 'kanban' ? 'active' : ''}`} onClick={() => setActiveTab('kanban')}>
            <i className="fa-solid fa-list-check"></i> บอร์ดคุมงาน (Kanban)
          </button>
          <button className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`} onClick={() => setActiveTab('products')}>
            <i className="fa-solid fa-shirt"></i> แผนสินค้า / PO
          </button>
        </nav>
      </div>

      {/* Global Unified Filters Bar for Calendar and Kanban */}
      {(activeTab === 'calendar' || activeTab === 'kanban') && (
        <div className="global-filter-bar">
          <div className="filter-group">
            <div className="filter-select-wrapper">
              <i className="fa-solid fa-flag" style={{ color: 'var(--primary)' }}></i>
              <span>แคมเปญ:</span>
              <select value={campFilter} onChange={(e) => setCampFilter(e.target.value)}>
                <option value="all">ทั้งหมด</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name.split(':')[0]}</option>)}
              </select>
            </div>

            <div className="filter-select-wrapper">
              <i className="fa-solid fa-users" style={{ color: 'var(--success)' }}></i>
              <span>ผู้รับผิดชอบ:</span>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="all">ทุกคน</option>
                {getStaffList().map(staff => <option key={staff} value={staff}>{staff}</option>)}
              </select>
            </div>

            <div className="filter-select-wrapper">
              <i className="fa-solid fa-triangle-exclamation" style={{ color: 'var(--warning)' }}></i>
              <span>ความสำคัญ:</span>
              <select value={timelinePriority} onChange={(e) => setTimelinePriority(e.target.value)}>
                <option value="all">ทุกระดับ</option>
                <option value="high">🔥 สูง (High)</option>
                <option value="medium">⚡ ปานกลาง (Medium)</option>
                <option value="low">💤 ต่ำ (Low)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-input-wrapper">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input 
                type="text" 
                placeholder="ค้นหางาน (หัวข้อ, รายละเอียด)..." 
                value={timelineSearch} 
                onChange={(e) => setTimelineSearch(e.target.value)} 
              />
            </div>
            {activeTab === 'calendar' && (
              <button className="btn btn-primary" onClick={() => openAddTask(selectedDate)}>
                <i className="fa-solid fa-plus"></i> เพิ่มงานในวันที่เลือก
              </button>
            )}
          </div>
        </div>
      )}

      {/* RENDER ACTIVE TAB */}

      {/* 1. Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="dashboard-grid">
          
          {/* Target Sidebar */}
          <aside className="sidebar-targets">
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '15px', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                <i className="fa-solid fa-bullseye" style={{ color: 'var(--kpi-blue)', marginRight: '6px' }}></i>
                Sales Target Overview
              </h3>
              
              {!isEditingTargets ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="target-kpi-card">
                    <div className="target-kpi-info">
                      <div className="label">เป้ายอดขายรวม</div>
                      <div className="value">{totalTarget.toLocaleString()} ฿</div>
                      <div className="label" style={{ marginTop: '4px' }}>เป้าชิ้น: {totalUnitsTarget.toLocaleString()} ตัว</div>
                      <div className="sub-label" style={{ marginTop: '4px' }}>ยอดขายจริง: {totalActualSales.toLocaleString()} ฿</div>
                    </div>
                    <div className="circular-progress-wrapper">
                      <svg width="72" height="72">
                        <circle className="circular-progress-bg" cx="36" cy="36" r="28" />
                        <circle 
                          className="circular-progress-fill" 
                          cx="36" 
                          cy="36" 
                          r="28" 
                          strokeDasharray={2 * Math.PI * 28} 
                          strokeDashoffset={2 * Math.PI * 28 - (Math.min(targetCompletedPercent, 100) / 100) * (2 * Math.PI * 28)} 
                        />
                      </svg>
                      <div className="circular-progress-text">{targetCompletedLabel}</div>
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setIsEditingTargets(true)}>
                    <i className="fa-solid fa-pencil"></i> แก้ไขเป้าหมายหลัก
                  </button>
                </div>
              ) : (
                <div className="target-kpi-card" style={{ textAlign: 'left', flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label className="form-label">เป้ายอดขายรวม (บาท)</label>
                    <input type="number" className="form-input" value={totalTarget} onChange={(e) => setTotalTarget(Number(e.target.value))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label className="form-label">เป้าจำนวนสินค้า (ตัว)</label>
                    <input type="number" className="form-input" value={totalUnitsTarget} onChange={(e) => setTotalUnitsTarget(Number(e.target.value))} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-success" style={{ flexGrow: 1, justifyContent: 'center' }} onClick={() => setIsEditingTargets(false)}>
                      บันทึก
                    </button>
                  </div>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase' }}>สัดส่วนเป้าตามช่องทาง</h4>
                  <button className="btn" style={{ padding: '4px 8px', fontSize: '11px' }} onClick={openAddChannel}>
                    <i className="fa-solid fa-plus"></i> เพิ่มช่องทาง
                  </button>
                </div>
                <div className="channel-stats">
                  {channels.map(ch => {
                    const channelProgress = Math.round((ch.actual / ch.percentage / (totalTarget / 100)) * 100) || 0;
                    return (
                      <div key={ch.id} className="channel-item">
                        <div className="channel-header">
                          <span className="channel-info">
                            <span className="channel-dot" style={{ backgroundColor: ch.color }}></span>
                            {ch.name} ({ch.percentage}%)
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {ch.actual.toLocaleString()} ฿
                          </span>
                        </div>
                        <div className="progress-bar-bg">
                          <div className="progress-bar-fill" style={{ width: `${Math.min(100, Math.max(0, channelProgress))}%`, backgroundColor: ch.color }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-light)', marginTop: '2px' }}>
                          <span>เป้า: {Math.round((ch.percentage / 100) * totalTarget).toLocaleString()} ฿</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <span style={{ cursor: 'pointer', color: 'var(--kpi-blue)' }} onClick={() => openEditChannel(ch)}>แก้ไข</span>
                            <span style={{ cursor: 'pointer', color: 'var(--danger)' }} onClick={() => deleteChannel(ch.id)}>ลบ</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          {/* Main Dashboard Content */}
          <main style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Monthly Highlight Summary */}
            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>
                <i className="fa-solid fa-star" style={{ color: '#facc15', marginRight: '8px' }}></i>
                สรุปแผนงานและกิจกรรมแคมเปญประจำเดือนนี้
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                {campaigns.map((camp, index) => {
                  const campTasksCount = tasks.filter(t => t.camp === camp.id).length;
                  const doneTasksCount = tasks.filter(t => t.camp === camp.id && t.status === 'done').length;
                  const campStyle = getCampaignStyle(camp, theme);
                  return (
                    <div key={camp.id} style={{ backgroundColor: campStyle.backgroundColor, border: `1px solid ${campStyle.borderColor}`, padding: '16px', borderRadius: '12px' }}>
                      <span style={{ backgroundColor: camp.color, color: 'white', padding: '3px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>
                        Campaign {index + 1}
                      </span>
                      <h4 style={{ marginTop: '10px', fontSize: '15px', fontWeight: '600' }}>{camp.name}</h4>
                      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>ความคืบหน้าแผนงาน:</span>
                        <strong>{doneTasksCount}/{campTasksCount} งานสำเร็จ</strong>
                      </div>
                      <div className="progress-bar-bg" style={{ marginTop: '6px', height: '6px' }}>
                        <div className="progress-bar-fill" style={{ width: `${(doneTasksCount / (campTasksCount || 1)) * 100}%`, backgroundColor: camp.color }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Staff Workload & Performance Tracker */}
            <div className="card">
              <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '12px' }}>
                <i className="fa-solid fa-users-gear" style={{ color: 'var(--kpi-blue)', marginRight: '8px' }}></i>
                ประเมินภาระงานและผลงานรายบุคคล (Staff Workload Dashboard)
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                วิเคราะห์การกระจายงาน ความคืบหน้าของงานทั้งหมดที่แต่ละคนดูแล เพื่อประสิทธิภาพในการจัดสรรงาน
              </p>
              
              <div className="staff-workload-grid">
                {getStaffList().map(staff => {
                  const staffTasks = tasks.filter(t => new RegExp(`\\b${staff}\\b|${staff}`, 'i').test(t.responsible || ''));
                  const total = staffTasks.length;
                  const completed = staffTasks.filter(t => t.status === 'done').length;
                  const inProgress = staffTasks.filter(t => t.status === 'inprogress').length;
                  const pending = staffTasks.filter(t => t.status === 'todo' || t.status === 'review').length;
                  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                  
                  return (
                    <div key={staff} className="staff-card">
                      <div className="staff-name">
                        <i className="fa-solid fa-user-circle" style={{ color: 'var(--kpi-blue)', fontSize: '18px' }}></i>
                        <span>{staff}</span>
                      </div>
                      <div className="staff-stat-row" style={{ marginTop: '4px' }}>
                        <span>งานทั้งหมด:</span>
                        <strong>{total} งาน</strong>
                      </div>
                      <div className="progress-bar-bg" style={{ height: '6px', margin: '4px 0' }}>
                        <div className="progress-bar-fill" style={{ width: `${percent}%`, backgroundColor: 'var(--success)' }}></div>
                      </div>
                      <div className="staff-stat-row" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span>สำเร็จ {completed} | กำลังทำ {inProgress} | รอทำ/ตรวจ {pending}</span>
                        <strong>{percent}%</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Product Matrix Overview Table */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '700' }}>
                  <i className="fa-solid fa-gem" style={{ color: '#0284c7', marginRight: '8px' }}></i>
                  สัดส่วนและเป้ายอดขายตามกลุ่มสินค้า
                </h3>
                <button className="btn btn-primary" onClick={openAddProduct}>
                  <i className="fa-solid fa-plus"></i> เพิ่มกลุ่มสินค้า
                </button>
              </div>
              
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>กลุ่มสินค้า</th>
                      <th style={{ textAlign: 'right' }}>ราคาขาย (บาท)</th>
                      <th style={{ textAlign: 'right' }}>เป้าจำหน่าย (ตัว)</th>
                      <th style={{ textAlign: 'right' }}>ยอดขายจำหน่ายจริง (ตัว)</th>
                      <th style={{ textAlign: 'right' }}>สต็อกใช้ได้</th>
                      <th style={{ textAlign: 'right' }}>ยอดขายเป้าหมาย (บาท)</th>
                      <th style={{ textAlign: 'right' }}>คิดเป็น % จากเป้า</th>
                      <th>กลยุทธ์หลัก</th>
                      <th style={{ textAlign: 'center' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(prod => {
                      const prodTargetSales = prod.price * prod.targetUnits;
                      const targetPercent = Math.round((prodTargetSales / totalTarget) * 100) || 0;
                      const availableStock = Number(prod.stockOnHand || 0) - Number(prod.reservedUnits || 0);
                      const isLowStock = availableStock <= Number(prod.reorderPoint || 0);
                      return (
                        <tr key={prod.id}>
                          <td style={{ fontWeight: '600' }}>{prod.name}</td>
                          <td style={{ textAlign: 'right' }}>{prod.price.toLocaleString()}</td>
                          <td style={{ textAlign: 'right' }}>{prod.targetUnits.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontWeight: '600', color: 'var(--success)' }}>{prod.actualUnits.toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontWeight: '700', color: isLowStock ? 'var(--danger)' : 'var(--text-main)' }}>
                            {availableStock.toLocaleString()} ตัว
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: '700' }}>{prodTargetSales.toLocaleString()} ฿</td>
                          <td style={{ textAlign: 'right', color: 'var(--kpi-blue)', fontWeight: '600' }}>{targetPercent}%</td>
                          <td style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{prod.strategy}</td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                              <button className="btn" style={{ padding: '4px 8px' }} onClick={() => openEditProduct(prod)}>
                                <i className="fa-solid fa-pencil"></i>
                              </button>
                              <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => deleteProduct(prod.id)}>
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    
                    {/* Summary Row */}
                    <tr style={{ backgroundColor: 'var(--surface-hover)', fontWeight: '800' }}>
                      <td>รวมทั้งหมด</td>
                      <td style={{ textAlign: 'right' }}>-</td>
                      <td style={{ textAlign: 'right' }}>{products.reduce((acc, p) => acc + p.targetUnits, 0).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', color: 'var(--success)' }}>{totalActualUnits.toLocaleString()}</td>
                      <td style={{ textAlign: 'right' }}>{products.reduce((acc, p) => acc + (Number(p.stockOnHand || 0) - Number(p.reservedUnits || 0)), 0).toLocaleString()} ตัว</td>
                      <td style={{ textAlign: 'right' }}>{products.reduce((acc, p) => acc + (p.price * p.targetUnits), 0).toLocaleString()} ฿</td>
                      <td style={{ textAlign: 'right', color: 'var(--success)' }}>
                        {Math.round((products.reduce((acc, p) => acc + (p.price * p.targetUnits), 0) / totalTarget) * 100)}%
                      </td>
                      <td>-</td>
                      <td style={{ textAlign: 'center' }}>-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* 2. Operations Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className="calendar-view-container card">
          
          {/* Main Grid Calendar */}
          <div>
            
            <div style={{ marginBottom: '10px' }}></div>

            {/* Navigation Header */}
            <div className="month-nav-header">
              <span className="month-title">
                {monthNames[currentMonth]} {currentYear}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn" onClick={handlePrevMonth}>
                  <i className="fa-solid fa-chevron-left"></i>
                  <span className="btn-text-responsive"> ย้อนกลับ</span>
                </button>
                <button className="btn" onClick={handleNextMonth}>
                  <span className="btn-text-responsive">ถัดไป </span>
                  <i className="fa-solid fa-chevron-right"></i>
                </button>
              </div>
            </div>

            {/* Day Headers */}
            <div className="calendar-grid-scroll-wrapper">
              <div className="calendar-grid">
                {dayLabels.map(day => <div key={day} className="cal-day-header">{day}</div>)}
                
                {/* Empty placeholder cells */}
                {Array.from({ length: firstDayIndex }).map((_, idx) => (
                  <div key={`empty-${idx}`} className="cal-cell empty"></div>
                ))}

                {/* Day cells */}
                {Array.from({ length: totalDays }).map((_, idx) => {
                  const dayNum = idx + 1;
                  const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                  const dayTasks = getFilteredTasks(dateStr);
                  const isSelected = selectedDate === dateStr;

                  // Check channels icons
                  const channelsIcons = new Set();
                  dayTasks.forEach(task => {
                    const ch = (task.channel || '').toLowerCase();
                    if (ch.includes('fb') || ch.includes('facebook')) channelsIcons.add(<i key="fb" className="fa-brands fa-facebook" style={{ color: '#1877F2' }}></i>);
                    if (ch.includes('line')) channelsIcons.add(<i key="line" className="fa-brands fa-line" style={{ color: '#00B900' }}></i>);
                    if (ch.includes('tiktok')) channelsIcons.add(<i key="tt" className="fa-brands fa-tiktok"></i>);
                  });

                  return (
                    <div key={dateStr} className={`cal-cell ${isSelected ? 'active-selected' : ''}`} onClick={() => setSelectedDate(dateStr)}>
                      <div className="cal-cell-top">
                        <span className="cal-day-num">{dayNum}</span>
                        <div className="cal-channels-icons">{Array.from(channelsIcons)}</div>
                      </div>
                      
                      <div className="cal-events-list">
                        {(() => {
                          const maxVisibleTasks = windowWidth < 480 ? 1 : (windowWidth < 1024 ? 2 : 3);
                          const visibleTasks = dayTasks.slice(0, maxVisibleTasks);
                          const remainingTasks = dayTasks.length - maxVisibleTasks;
                          return (
                            <>
                              {visibleTasks.map(task => {
                                const campObj = campaigns.find(c => c.id === task.camp) || { color: '#64748b' };
                                return (
                                  <div key={task.id} className="cal-event-pill" style={{ backgroundColor: campObj.color }} title={task.title}>
                                    {task.title}
                                  </div>
                                );
                              })}
                              {remainingTasks > 0 && (
                                <div className="cal-more-indicator">
                                  + อีก {remainingTasks} งาน
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Side Drawer Daily Detail panel */}
          <aside className="details-panel">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-clipboard-list" style={{ color: 'var(--kpi-blue)' }}></i>
              รายละเอียดงานรายวัน
            </h3>
            
            <div className="date-selected-badge">
              {(() => {
                const parts = selectedDate.split('-');
                if (parts.length < 3) return 'กรุณาเลือกวันที่';
                const d = parseInt(parts[2]);
                const m = monthNames[parseInt(parts[1]) - 1];
                return `${d} ${m} ${parts[0]}`;
              })()}
            </div>

            <div className="tasks-container">
              {getFilteredTasks(selectedDate).length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 10px', fontSize: '13px' }}>
                  ไม่มีกำหนดการแคมเปญในวันนี้
                </div>
              ) : (
                getFilteredTasks(selectedDate).map(task => {
                  const campObj = campaigns.find(c => c.id === task.camp) || { name: 'ไม่มีแคมเปญ', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
                  return (
                    <div key={task.id} className="task-detail-card" style={{ borderLeft: `5px solid ${campObj.color}` }}>
                      {(() => {
                        const campStyle = getCampaignStyle(campObj, theme);
                        return (
                          <span className="campaign-tag" style={{ backgroundColor: campStyle.backgroundColor, color: campStyle.color, border: `1px solid ${campStyle.borderColor}` }}>
                            {campObj.name.split(':')[0]}
                          </span>
                        );
                      })()}
                      <div className="title">{task.title}</div>
                      <div className="desc">{task.detail}</div>
                      
                      {/* Render inline checklist for daily schedule drawer */}
                      {renderInlineChecklist(task)}

                      <div className="meta-row" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                        {renderResponsibleTags(task.responsible)}
                        {renderChannelTags(task.channel)}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '4px' }}>
                        <button className="btn" style={{ flexGrow: 1, padding: '4px', fontSize: '12px', justifyContent: 'center' }} onClick={() => openEditTask(task)}>
                          <i className="fa-solid fa-pencil"></i> แก้ไข
                        </button>
                        <button className="btn btn-danger" style={{ flexGrow: 1, padding: '4px', fontSize: '12px', justifyContent: 'center' }} onClick={() => deleteTask(task.id)}>
                          <i className="fa-solid fa-trash"></i> ลบ
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => openAddTask(selectedDate)}>
              <i className="fa-solid fa-plus"></i> เพิ่มงานในวันนี้
            </button>
          </aside>

        </div>
      )}

      {/* 3. Kanban Task Board Tab */}
      {activeTab === 'kanban' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700' }}>
              <i className="fa-solid fa-list-check" style={{ color: 'var(--kpi-blue)', marginRight: '8px' }}></i>
              บอร์ดติดตามสถานะปฏิบัติการของทีม
            </h2>
          </div>

          <div className="kanban-grid">
            
            {/* Columns definition */}
            {['todo', 'inprogress', 'review', 'done'].map(status => {
              const statusName = status === 'todo' ? 'To-Do (รอกระทำ)' : status === 'inprogress' ? 'In Progress (กำลังทำ)' : status === 'review' ? 'Review (ส่งตรวจสอบ)' : 'Done (สำเร็จ)';
              const columnTasks = getFilteredKanbanTasks(status);
              
              // Sum of all subtasks and completed ones in this column
              const totalSubtasks = columnTasks.reduce((sum, t) => sum + (t.checklist || []).length, 0);
              const completedSubtasks = columnTasks.reduce((sum, t) => sum + (t.checklist || []).filter(item => item.completed).length, 0);
              
              return (
                <div 
                  key={status} 
                  className={`kanban-column ${draggedOverCol === status ? 'dragging-over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedOverCol !== status) setDraggedOverCol(status);
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDraggedOverCol(status);
                  }}
                  onDragLeave={() => {
                    setDraggedOverCol(null);
                  }}
                  onDrop={(e) => handleDrop(e, status)}
                >
                  <div className="kanban-column-header">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13.5px', fontWeight: '700' }}>{statusName}</span>
                      {totalSubtasks > 0 && (
                        <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: '500' }}>
                          <i className="fa-solid fa-list-check" style={{ marginRight: '4px' }}></i>
                          งานย่อยสำเร็จ: {completedSubtasks}/{totalSubtasks}
                        </span>
                      )}
                    </div>
                    <span className="kanban-column-count">{columnTasks.length}</span>
                  </div>

                  <div className="kanban-card-list">
                    {columnTasks.map(task => {
                      const campObj = campaigns.find(c => c.id === task.camp) || { name: 'ไม่มีแคมเปญ', color: '#64748b' };
                      return (
                        <div key={task.id} className="kanban-card" draggable onDragStart={(e) => handleDragStart(e, task.id)}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '10px', color: campObj.color, fontWeight: '700', textTransform: 'uppercase' }}>
                              {campObj.name.split(':')[0]}
                            </span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              {renderPriorityBadge(task.priority)}
                              <span style={{ fontSize: '10.5px', color: 'var(--text-light)' }}>{task.date}</span>
                            </div>
                          </div>
                          
                          <h4 style={{ fontSize: '13.5px', fontWeight: '600' }}>{task.title}</h4>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineSelf: 'stretch' }}>{task.detail}</p>
                          
                          {/* Subtask checklist progress bar */}
                          {task.checklist && task.checklist.length > 0 && (() => {
                            const completed = task.checklist.filter(item => item.completed).length;
                            const total = task.checklist.length;
                            const pct = Math.round((completed / total) * 100);
                            return (
                              <div style={{ marginTop: '8px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                  <span><i className="fa-solid fa-list-check" style={{ marginRight: '4px' }}></i>ความคืบหน้า</span>
                                  <span>{completed}/{total} ({pct}%)</span>
                                </div>
                                <div style={{ height: '4px', width: '100%', backgroundColor: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: pct === 100 ? 'var(--success)' : 'var(--primary)', transition: 'width 0.3s ease' }}></div>
                                </div>
                              </div>
                            );
                          })()}

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {renderResponsibleTags(task.responsible)}
                            </div>
                            
                            <select className="form-input" style={{ padding: '2px 4px', fontSize: '10.5px' }} value={task.status} onChange={(e) => {
                              const newStatus = e.target.value;
                              setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
                            }}>
                              <option value="todo">To-Do</option>
                              <option value="inprogress">In Prog</option>
                              <option value="review">Review</option>
                              <option value="done">Done</option>
                            </select>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '2px' }}>
                            <span style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--kpi-blue)' }} onClick={() => openEditTask(task)}>แก้ไข</span>
                            <span style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--danger)' }} onClick={() => deleteTask(task.id)}>ลบ</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

          </div>
        </div>
      )}

      {/* 4. Products & Strategy Manager Tab */}
      {activeTab === 'products' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Production PO Tracker */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>
                <i className="fa-solid fa-box" style={{ color: 'var(--kpi-blue)', marginRight: '8px' }}></i>
                ใบสั่งผลิต & เปิด PO โรงงาน (PO Tracker)
              </h3>
              <button className="btn btn-primary" onClick={openAddPo}>
                <i className="fa-solid fa-plus"></i> บันทึกใบ PO การผลิตใหม่
              </button>
            </div>
            
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>รายการสินค้า</th>
                    <th style={{ textAlign: 'right' }}>จำนวน (ตัว)</th>
                    <th>วันที่ส่งคำสั่ง PO</th>
                    <th>กำหนดเสร็จ/ของเข้า</th>
                    <th>สถานะการสั่งผลิต</th>
                    <th style={{ textAlign: 'center' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {poTracker.map(po => (
                    <tr key={po.id}>
                      <td style={{ fontWeight: '600' }}>{po.product}</td>
                      <td style={{ textAlign: 'right' }}>{po.quantity.toLocaleString()}</td>
                      <td>{po.orderDate}</td>
                      <td>{po.arrivalDate}</td>
                      <td>
                        <span style={{
                          backgroundColor: po.status === 'Completed' ? 'var(--success-light)' : '#fef3c7',
                          color: po.status === 'Completed' ? 'var(--success)' : '#d97706',
                          padding: '4px 10px',
                          borderRadius: '20px',
                          fontSize: '11.5px',
                          fontWeight: '700'
                        }}>
                          {po.status === 'Completed' ? 'ของเข้าแล้ว' : 'กำลังผลิต'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          {po.status !== 'Completed' && (
                            <button className="btn btn-success" style={{ padding: '4px 8px', fontSize: '11.5px' }} onClick={() => {
                              setPoTracker(prev => prev.map(p => p.id === po.id ? { ...p, status: 'Completed' } : p));
                              setProducts(prev => prev.map(prod => (
                                po.product.includes(prod.name) || prod.name.includes(po.product)
                                  ? { ...prod, stockOnHand: Number(prod.stockOnHand || 0) + Number(po.quantity || 0) }
                                  : prod
                              )));
                            }}>
                              <i className="fa-solid fa-check"></i> รับสินค้าแล้ว
                            </button>
                          )}
                          <button className="btn" style={{ padding: '4px 8px' }} onClick={() => openEditPo(po)}>
                            <i className="fa-solid fa-pencil"></i>
                          </button>
                          <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => deletePo(po.id)}>
                            <i className="fa-solid fa-trash"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {poTracker.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>ไม่มีข้อมูลการเปิด PO การผลิต</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>
                <i className="fa-solid fa-warehouse" style={{ color: 'var(--kpi-blue)', marginRight: '8px' }}></i>
                Stock Watch
              </h3>
              <button className="btn btn-primary" onClick={openAddProduct}>
                <i className="fa-solid fa-plus"></i> เพิ่มสินค้า
              </button>
            </div>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th style={{ textAlign: 'right' }}>คงเหลือ</th>
                    <th style={{ textAlign: 'right' }}>จอง/กันไว้</th>
                    <th style={{ textAlign: 'right' }}>ใช้ได้</th>
                    <th style={{ textAlign: 'right' }}>จุดเติม</th>
                    <th>สถานะ</th>
                    <th style={{ textAlign: 'center' }}>จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(prod => {
                    const availableStock = Number(prod.stockOnHand || 0) - Number(prod.reservedUnits || 0);
                    const isLowStock = availableStock <= Number(prod.reorderPoint || 0);
                    return (
                      <tr key={prod.id}>
                        <td style={{ fontWeight: '700' }}>{prod.name}</td>
                        <td style={{ textAlign: 'right' }}>{Number(prod.stockOnHand || 0).toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>{Number(prod.reservedUnits || 0).toLocaleString()}</td>
                        <td style={{ textAlign: 'right', fontWeight: '800', color: isLowStock ? 'var(--danger)' : 'var(--success)' }}>{availableStock.toLocaleString()}</td>
                        <td style={{ textAlign: 'right' }}>{Number(prod.reorderPoint || 0).toLocaleString()}</td>
                        <td>
                          <span className={`stock-badge ${isLowStock ? 'low' : 'ok'}`}>
                            {isLowStock ? 'ควรเติมสต็อก' : 'พอขาย'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn" style={{ padding: '4px 8px' }} onClick={() => openEditProduct(prod)}>
                            <i className="fa-solid fa-pencil"></i> แก้ไข
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* 5. Campaign Config Tab */}
      {activeTab === 'campaigns' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700' }}>
              <i className="fa-solid fa-layer-group" style={{ color: 'var(--kpi-blue)', marginRight: '8px' }}></i>
              ตั้งค่าแคมเปญการตลาด (Campaign Settings)
            </h2>
            <button className="btn btn-primary" onClick={openAddCampaign}>
              <i className="fa-solid fa-plus"></i> เพิ่มแคมเปญใหม่
            </button>
          </div>

          <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
            ตั้งค่าแคมเปญและสีประจำแคมเปญ เพื่อให้ระบบนำไปวาดและจำแนกจุดกำหนดการบนปฏิทินปฏิบัติงาน และคำนวณข้อมูลผลงานรายแคมเปญ
          </p>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>รหัสแคมเปญ</th>
                  <th>ชื่อแคมเปญการตลาด</th>
                  <th>สีหลัก</th>
                  <th>สีพื้นหลังแท็ก</th>
                  <th>สีเส้นขอบแท็ก</th>
                  <th style={{ textAlign: 'center' }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(camp => (
                  <tr key={camp.id}>
                    <td style={{ fontFamily: 'monospace' }}>{camp.id}</td>
                    <td style={{ fontWeight: '600' }}>{camp.name}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: camp.color, border: '1px solid var(--border)' }}></span>
                        {camp.color}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: camp.bg, border: '1px solid var(--border)' }}></span>
                        {camp.bg}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '16px', height: '16px', borderRadius: '4px', backgroundColor: camp.border, border: '1px solid var(--border)' }}></span>
                        {camp.border}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button className="btn" style={{ padding: '4px 8px' }} onClick={() => openEditCampaign(camp)}>
                          <i className="fa-solid fa-pencil"></i> แก้ไข
                        </button>
                        <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => deleteCampaign(camp.id)}>
                          <i className="fa-solid fa-trash"></i> ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. Campaign Vertical Timelines Tab */}
      {activeTab === 'timelines' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Timeline Filter Controls Card */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700' }}>
                  <i className="fa-solid fa-route" style={{ color: 'var(--kpi-blue)', marginRight: '8px' }}></i>
                  ไทม์ไลน์แผนปฏิบัติงานแนวตั้ง (Campaign Roadmap)
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  ติดตาม กำหนดการ และขั้นตอนย่อยของทุกแคมเปญ เพื่อให้ทีมทำงานร่วมกันได้อย่างเป็นระบบ
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn" onClick={() => window.print()}>
                  <i className="fa-solid fa-print"></i> พิมพ์แผนงาน / PDF
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              
              {/* Campaign Filter Buttons */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flexGrow: 1 }}>
                <button 
                  className={`btn ${timelineFilter === 'master' ? 'btn-primary' : ''}`}
                  onClick={() => setTimelineFilter('master')}
                  style={{ borderRadius: '20px', padding: '6px 16px' }}
                >
                  <i className="fa-solid fa-globe"></i> ภาพรวม (Master Timeline)
                </button>
                <button 
                  className={`btn ${timelineFilter === 'stacked' ? 'btn-primary' : ''}`}
                  onClick={() => setTimelineFilter('stacked')}
                  style={{ borderRadius: '20px', padding: '6px 16px' }}
                >
                  <i className="fa-solid fa-cubes"></i> ดูแยกแคมเปญทั้งหมด (Stacked)
                </button>
                {campaigns.map(c => (
                  <button 
                    key={c.id}
                    className={`btn ${timelineFilter === c.id ? 'btn-primary' : ''}`}
                    onClick={() => setTimelineFilter(c.id)}
                    style={{ 
                      borderRadius: '20px', 
                      padding: '6px 16px',
                      borderColor: timelineFilter === c.id ? c.color : 'var(--border)',
                      backgroundColor: timelineFilter === c.id ? c.color : 'var(--surface)'
                    }}
                  >
                    <span style={{ 
                      width: '8px', 
                      height: '8px', 
                      borderRadius: '50%', 
                      backgroundColor: timelineFilter === c.id ? 'white' : c.color, 
                      marginRight: '6px', 
                      display: 'inline-block' 
                    }}></span>
                    {c.name.split(':')[0]}
                  </button>
                ))}
              </div>

              {/* Priority and Search Filters */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: '50px', backgroundColor: 'var(--surface)' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-triangle-exclamation"></i> ความสำคัญ:
                  </span>
                  <select 
                    className="form-input" 
                    style={{ border: 'none', padding: '0', fontWeight: '600', fontSize: '12.5px' }} 
                    value={timelinePriority} 
                    onChange={(e) => setTimelinePriority(e.target.value)}
                  >
                    <option value="all">ทั้งหมด</option>
                    <option value="high">สูง (High)</option>
                    <option value="medium">ปานกลาง (Medium)</option>
                    <option value="low">ต่ำ (Low)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid var(--border)', padding: '4px 12px', borderRadius: '50px', backgroundColor: 'var(--surface)' }}>
                  <i className="fa-solid fa-magnifying-glass" style={{ color: 'var(--text-muted)', fontSize: '12px' }}></i>
                  <input 
                    type="text" 
                    placeholder="ค้นหางาน..." 
                    className="form-input" 
                    style={{ border: 'none', padding: '0', fontWeight: '600', width: '120px', fontSize: '12.5px' }} 
                    value={timelineSearch}
                    onChange={(e) => setTimelineSearch(e.target.value)}
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Campaign Health Overview Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '10px' }}>
            {campaigns.map(camp => {
              const campTasks = tasks.filter(t => t.camp === camp.id);
              const completedTasks = campTasks.filter(t => t.status === 'done').length;
              const totalTasks = campTasks.length;
              const healthPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
              
              return (
                <div key={camp.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderLeft: `6px solid ${camp.color}`, position: 'relative', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', zIndex: 1 }}>
                    <span style={{ fontSize: '11px', color: camp.color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {camp.name.split(':')[0]}
                    </span>
                    <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                      {camp.name.split(':').slice(1).join(':').trim() || camp.name}
                    </h4>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      ความคืบหน้าแผนงาน: <strong style={{ color: 'var(--text-main)' }}>{completedTasks}/{totalTasks} งาน</strong>
                    </span>
                  </div>
                  
                  {/* SVG Progress Ring */}
                  <div style={{ position: 'relative', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                    <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                      <circle 
                        cx="28" 
                        cy="28" 
                        r="22" 
                        stroke="var(--border)" 
                        strokeWidth="4" 
                        fill="transparent" 
                      />
                      <circle 
                        cx="28" 
                        cy="28" 
                        r="22" 
                        stroke={camp.color} 
                        strokeWidth="4" 
                        fill="transparent" 
                        strokeDasharray={`${2 * Math.PI * 22}`}
                        strokeDashoffset={`${2 * Math.PI * 22 * (1 - healthPercent / 100)}`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                      />
                    </svg>
                    <span style={{ position: 'absolute', fontSize: '11.5px', fontWeight: '700', color: 'var(--text-main)' }}>
                      {healthPercent}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Timeline Nodes Container */}
          <div className="timeline-section-container">
            
            {/* Case A: Master Timeline (Single merged list) */}
            {timelineFilter === 'master' && (
              <div className="campaign-card-timeline">
                <div className="campaign-header-timeline" style={{ backgroundColor: 'var(--surface-hover)', borderLeft: '6px solid var(--kpi-blue)' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fa-solid fa-list-ol" style={{ color: 'var(--kpi-blue)' }}></i>
                    ลำดับแผนปฏิบัติงานภาพรวมตามช่วงเวลา (Master Timeline View)
                  </h3>
                </div>
                <div className="timeline-list">
                  {(() => {
                    const tasksInView = getTimelineTasks('master');
                    const nextUpTask = tasksInView.find(t => t.status !== 'done');
                    
                    if (tasksInView.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px' }}>
                          ไม่มีงานสอดคล้องกับตัวกรองที่เลือก
                        </div>
                      );
                    }
                    
                    return tasksInView.map(task => {
                      const campObj = campaigns.find(c => c.id === task.camp) || { name: 'ไม่มีแคมเปญ', color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
                      const { day, month, year } = getTimelineDateParts(task.date);
                      const isNextUp = nextUpTask && nextUpTask.id === task.id;
                      
                      return (
                        <div key={task.id} className="timeline-item-vertical">
                          <div className="timeline-time-side">
                            <div className="timeline-time-date">{day} {month}</div>
                            <div className="timeline-time-month">{year}</div>
                          </div>
                          
                          <div className="timeline-node-side">
                            <div 
                              className={`timeline-time-dot ${isNextUp ? 'pulse' : ''}`} 
                              style={{ 
                                borderColor: campObj.color, 
                                color: campObj.color, 
                                backgroundColor: task.status === 'done' ? campObj.color : 'var(--surface)' 
                              }}
                            >
                              {task.status === 'done' && <i className="fa-solid fa-check" style={{ fontSize: '8px', color: 'white', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}></i>}
                            </div>
                            <div className="timeline-time-line"></div>
                          </div>
                          
                          <div className="timeline-content-side">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                              <h4 className="timeline-task-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {task.title}
                              </h4>
                              {(() => {
                                const campStyle = getCampaignStyle(campObj, theme);
                                return (
                                  <span className="campaign-tag" style={{ backgroundColor: campStyle.backgroundColor, color: campStyle.color, border: `1px solid ${campStyle.borderColor}` }}>
                                    {campObj.name.split(':')[0]}
                                  </span>
                                );
                              })()}
                            </div>
                            
                            <div className="timeline-task-detail-box" style={{ borderLeft: `4px solid ${campObj.color}` }}>
                              <p style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{task.detail}</p>
                              
                              {/* Checklist component */}
                              {renderInlineChecklist(task)}

                              <div className="timeline-actions-row">
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {renderResponsibleTags(task.responsible)}
                                  {renderChannelTags(task.channel)}
                                  {task.priority && (
                                    <span className="timeline-responsible-tag" style={{ 
                                      backgroundColor: task.priority === 'high' ? 'rgba(239, 68, 68, 0.15)' : task.priority === 'low' ? 'rgba(16, 185, 129, 0.15)' : 'var(--border)', 
                                      color: task.priority === 'high' ? 'var(--danger)' : task.priority === 'low' ? 'var(--success)' : 'var(--text-muted)' 
                                    }}>
                                      <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '4px' }}></i>
                                      {task.priority === 'high' ? 'สูง' : task.priority === 'low' ? 'ต่ำ' : 'ปานกลาง'}
                                    </span>
                                  )}
                                </div>

                                <div style={{ display: 'flex', gap: '8px' }}>
                                  <button 
                                    className="btn" 
                                    style={{ padding: '4px 8px', fontSize: '11px', color: task.status === 'done' ? 'var(--success)' : 'var(--text-muted)' }}
                                    onClick={() => {
                                      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: t.status === 'done' ? 'todo' : 'done' } : t));
                                    }}
                                  >
                                    <i className={task.status === 'done' ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}></i>
                                    {task.status === 'done' ? 'สำเร็จแล้ว' : 'ทำเครื่องหมายสำเร็จ'}
                                  </button>
                                  <button className="btn" style={{ padding: '4px 8px', fontSize: '11.5px' }} onClick={() => openEditTask(task)}>
                                    <i className="fa-solid fa-pencil"></i>
                                  </button>
                                  <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '11.5px' }} onClick={() => deleteTask(task.id)}>
                                    <i className="fa-solid fa-trash"></i>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Case B: Stacked or Individual Campaigns */}
            {timelineFilter !== 'master' && campaigns.filter(c => timelineFilter === 'stacked' || c.id === timelineFilter).map(camp => {
              const tasksInView = getTimelineTasks(camp.id);
              const nextUpTask = tasksInView.find(t => t.status !== 'done');
              
              return (
                <div key={camp.id} className="campaign-card-timeline">
                  {(() => {
                    const campStyle = getCampaignStyle(camp, theme);
                    return (
                      <div className="campaign-header-timeline" style={{ backgroundColor: campStyle.backgroundColor, borderBottom: `1px solid ${campStyle.borderColor}`, borderLeft: `6px solid ${camp.color}` }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '700', color: camp.color }}>
                          {camp.name}
                        </h3>
                      </div>
                    );
                  })()}
                  <div className="timeline-list">
                    {tasksInView.length === 0 ? (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
                        ไม่มีงานสอดคล้องกับตัวกรองที่เลือกสำหรับแคมเปญนี้
                      </div>
                    ) : (
                      tasksInView.map(task => {
                        const { day, month, year } = getTimelineDateParts(task.date);
                        const isNextUp = nextUpTask && nextUpTask.id === task.id;
                        
                        return (
                          <div key={task.id} className="timeline-item-vertical">
                            <div className="timeline-time-side">
                              <div className="timeline-time-date" style={{ color: camp.color }}>{day} {month}</div>
                              <div className="timeline-time-month">{year}</div>
                            </div>
                            
                            <div className="timeline-node-side">
                              <div 
                                className={`timeline-time-dot ${isNextUp ? 'pulse' : ''}`} 
                                style={{ 
                                  borderColor: camp.color, 
                                  color: camp.color, 
                                  backgroundColor: task.status === 'done' ? camp.color : 'var(--surface)' 
                                }}
                              >
                                {task.status === 'done' && <i className="fa-solid fa-check" style={{ fontSize: '8px', color: 'white', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}></i>}
                              </div>
                              <div className="timeline-time-line"></div>
                            </div>
                            
                            <div className="timeline-content-side">
                              <h4 className="timeline-task-title">{task.title}</h4>
                              <div className="timeline-task-detail-box" style={{ borderLeft: `4px solid ${camp.color}` }}>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{task.detail}</p>
                                
                                {/* Checklist component */}
                                {renderInlineChecklist(task)}

                                <div className="timeline-actions-row">
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {renderResponsibleTags(task.responsible)}
                                    {renderChannelTags(task.channel)}
                                    {task.priority && (
                                      <span className="timeline-responsible-tag" style={{ 
                                        backgroundColor: task.priority === 'high' ? 'rgba(239, 68, 68, 0.15)' : task.priority === 'low' ? 'rgba(16, 185, 129, 0.15)' : 'var(--border)', 
                                        color: task.priority === 'high' ? 'var(--danger)' : task.priority === 'low' ? 'var(--success)' : 'var(--text-muted)' 
                                      }}>
                                        <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '4px' }}></i>
                                        {task.priority === 'high' ? 'สูง' : task.priority === 'low' ? 'ต่ำ' : 'ปานกลาง'}
                                      </span>
                                    )}
                                  </div>

                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                      className="btn" 
                                      style={{ padding: '4px 8px', fontSize: '11px', color: task.status === 'done' ? 'var(--success)' : 'var(--text-muted)' }}
                                      onClick={() => {
                                        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: t.status === 'done' ? 'todo' : 'done' } : t));
                                      }}
                                    >
                                      <i className={task.status === 'done' ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'}></i>
                                      {task.status === 'done' ? 'สำเร็จแล้ว' : 'ทำเครื่องหมายสำเร็จ'}
                                    </button>
                                    <button className="btn" style={{ padding: '4px 8px', fontSize: '11.5px' }} onClick={() => openEditTask(task)}>
                                      <i className="fa-solid fa-pencil"></i>
                                    </button>
                                    <button className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '11.5px' }} onClick={() => deleteTask(task.id)}>
                                      <i className="fa-solid fa-trash"></i>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* ALL MODAL DIALOGS */}

      {/* 1. Add/Edit Task Modal */}
      {showTaskModal && (
        <div className="modal-overlay">
          <form className="modal-dialog" onSubmit={saveTask}>
            <div className="modal-header">
              <h2>{taskModalMode === 'add' ? 'เพิ่มแผนงานปฏิบัติการรายวัน' : 'แก้ไขแผนงานปฏิบัติการ'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowTaskModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">วันที่ปฏิบัติงาน</label>
                <input type="date" className="form-input" required value={taskForm.date} onChange={(e) => setTaskForm({ ...taskForm, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">หัวข้องานหลัก</label>
                <input type="text" className="form-input" required placeholder="เช่น บรีฟงาน Graphic / แจ้งเตือนก่อนเปิดตัว" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">รายละเอียดของงาน</label>
                <textarea className="form-input" style={{ minHeight: '80px', resize: 'vertical' }} placeholder="ระบุเนื้อหารายละเอียดขั้นตอนทำงาน..." value={taskForm.detail} onChange={(e) => setTaskForm({ ...taskForm, detail: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">ผู้รับผิดชอบงาน</label>
                <SearchableMultiSelect
                  placeholder="เลือกผู้รับผิดชอบงาน..."
                  options={staffList}
                  defaultOptions={['มัง', 'ฝ้าย', 'บีม', 'แตงโม', 'Graphic', 'MKT', 'Admin']}
                  selectedValues={taskForm.responsible ? taskForm.responsible.split(',').map(s => s.trim()).filter(Boolean) : []}
                  onChange={(newVals) => setTaskForm({ ...taskForm, responsible: newVals.join(', ') })}
                  onAddOption={(newVal) => setStaffList(prev => [...prev, newVal])}
                  onDeleteOption={(val) => setStaffList(prev => prev.filter(v => v !== val))}
                  addPlaceholder="เพิ่มผู้รับผิดชอบใหม่..."
                />
              </div>
              <div className="form-group">
                <label className="form-label">ช่องทางโปรโมต</label>
                <SearchableMultiSelect
                  placeholder="เลือกช่องทางโปรโมต..."
                  options={promoChannels}
                  defaultOptions={['หลังบ้าน', 'Line Broadcast', 'FB Post', 'TikTok Shop', 'ทุกแพลตฟอร์ม', 'Line/FB Broadcast', 'ทุกแพลตฟอร์ม + BC (Line OA/FB)']}
                  selectedValues={taskForm.channel ? taskForm.channel.split(',').map(s => s.trim()).filter(Boolean) : []}
                  onChange={(newVals) => setTaskForm({ ...taskForm, channel: newVals.join(', ') })}
                  onAddOption={(newVal) => setPromoChannels(prev => [...prev, newVal])}
                  onDeleteOption={(val) => setPromoChannels(prev => prev.filter(v => v !== val))}
                  addPlaceholder="เพิ่มช่องทางโปรโมตใหม่..."
                />
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                <div className="form-group">
                  <label className="form-label">เชื่อมโยงแคมเปญ</label>
                  <select className="form-input" value={taskForm.camp} onChange={(e) => setTaskForm({ ...taskForm, camp: e.target.value })}>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">สถานะการทำ</label>
                  <select className="form-input" value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}>
                    <option value="todo">To-Do (รอทำงาน)</option>
                    <option value="inprogress">In Progress (กำลังทำ)</option>
                    <option value="review">Review (ตรวจสอบ)</option>
                    <option value="done">Done (สำเร็จแล้ว)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">ความสำคัญ (Priority)</label>
                  <select className="form-input" value={taskForm.priority || 'medium'} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                    <option value="low">ต่ำ (Low)</option>
                    <option value="medium">ปานกลาง (Medium)</option>
                    <option value="high">สูง / วิกฤต (High)</option>
                  </select>
                </div>
              </div>

              {/* Task Modal Checklist section */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '4px' }}>
                <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>เช็คลิสต์งานย่อย (Sub-todos)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto', marginBottom: '10px' }}>
                  {(taskForm.checklist || []).map((item) => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => {
                          const updatedChecklist = taskForm.checklist.map(ch => 
                            ch.id === item.id ? { ...ch, completed: !ch.completed } : ch
                          );
                          setTaskForm({ ...taskForm, checklist: updatedChecklist });
                        }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        style={{ flexGrow: 1, padding: '4px 6px', fontSize: '12px' }}
                        value={item.text}
                        onChange={(e) => {
                          const updatedChecklist = taskForm.checklist.map(ch => 
                            ch.id === item.id ? { ...ch, text: e.target.value } : ch
                          );
                          setTaskForm({ ...taskForm, checklist: updatedChecklist });
                        }}
                      />
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ padding: '3px 6px', fontSize: '11px' }}
                        onClick={() => {
                          const updatedChecklist = taskForm.checklist.filter(ch => ch.id !== item.id);
                          setTaskForm({ ...taskForm, checklist: updatedChecklist });
                        }}
                      >
                        <i className="fa-solid fa-trash-can"></i>
                      </button>
                    </div>
                  ))}
                  {(taskForm.checklist || []).length === 0 && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ไม่มีงานย่อยในขณะนี้</div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    id="new-modal-subtodo"
                    placeholder="เพิ่มหัวข้องานย่อย..."
                    className="form-input"
                    style={{ flexGrow: 1, padding: '5px 10px', fontSize: '12px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = e.target.value.trim();
                        if (val) {
                          const newItem = { id: 'sub-' + Date.now() + Math.random().toString(36).substr(2, 5), text: val, completed: false };
                          setTaskForm({ ...taskForm, checklist: [...(taskForm.checklist || []), newItem] });
                          e.target.value = '';
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '5px 10px', fontSize: '11px' }}
                    onClick={() => {
                      const input = document.getElementById('new-modal-subtodo');
                      const val = input.value.trim();
                      if (val) {
                        const newItem = { id: 'sub-' + Date.now() + Math.random().toString(36).substr(2, 5), text: val, completed: false };
                        setTaskForm({ ...taskForm, checklist: [...(taskForm.checklist || []), newItem] });
                        input.value = '';
                      }
                    }}
                  >
                    เพิ่ม
                  </button>
                </div>
              </div>

              <div className="modal-subsection">
                <label className="form-label">ไฟล์ / ลิงก์อ้างอิง</label>
                <div className="support-list">
                  {(taskForm.attachments || []).map(attachment => (
                    <div className="support-row" key={attachment.id}>
                      <span>{attachment.label}</span>
                      <button type="button" onClick={() => setTaskForm({ ...taskForm, attachments: taskForm.attachments.filter(item => item.id !== attachment.id) })}>
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px' }}>
                  <input id="new-modal-attachment-label" type="text" className="form-input" placeholder="ชื่อไฟล์/ลิงก์" style={{ padding: '6px 10px', fontSize: '12px' }} />
                  <input id="new-modal-attachment-url" type="text" className="form-input" placeholder="URL หรือ path" style={{ padding: '6px 10px', fontSize: '12px' }} />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      const labelInput = document.getElementById('new-modal-attachment-label');
                      const urlInput = document.getElementById('new-modal-attachment-url');
                      const label = labelInput.value.trim();
                      const url = urlInput.value.trim();
                      if (label || url) {
                        setTaskForm({ ...taskForm, attachments: [...(taskForm.attachments || []), { id: 'attach-' + Date.now(), label: label || url, url }] });
                        labelInput.value = '';
                        urlInput.value = '';
                      }
                    }}
                  >
                    เพิ่ม
                  </button>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowTaskModal(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">บันทึกข้อมูล</button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Add/Edit Channel Modal */}
      {showChannelModal && (
        <div className="modal-overlay">
          <form className="modal-dialog" onSubmit={saveChannel}>
            <div className="modal-header">
              <h2>{isChannelEditMode ? 'แก้ไขช่องทางการขาย' : 'เพิ่มช่องทางการขาย'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowChannelModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">ชื่อช่องทางขาย</label>
                <input type="text" className="form-input" required placeholder="เช่น TikTok Shop, Shopee" value={channelForm.name} onChange={(e) => setChannelForm({ ...channelForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">สัดส่วนเป้าหมาย (%)</label>
                <input type="number" className="form-input" required min="0" max="100" value={channelForm.percentage} onChange={(e) => setChannelForm({ ...channelForm, percentage: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">ยอดขายทำจริงขณะนี้ (บาท)</label>
                <input type="number" className="form-input" required min="0" value={channelForm.actual} onChange={(e) => setChannelForm({ ...channelForm, actual: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">รหัสสีสัญลักษณ์</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="color" className="form-input" style={{ width: '50px', padding: '2px', height: '38px' }} value={channelForm.color} onChange={(e) => setChannelForm({ ...channelForm, color: e.target.value })} />
                  <input type="text" className="form-input" style={{ flexGrow: 1 }} value={channelForm.color} onChange={(e) => setChannelForm({ ...channelForm, color: e.target.value })} />
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowChannelModal(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">บันทึก</button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Add/Edit Product Modal */}
      {showProductModal && (
        <div className="modal-overlay">
          <form className="modal-dialog" onSubmit={saveProduct}>
            <div className="modal-header">
              <h2>{isProductEditMode ? 'แก้ไขสินค้า / กลุ่มสินค้า' : 'เพิ่มกลุ่มสินค้าใหม่'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowProductModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">ชื่อกลุ่มสินค้า</label>
                <input type="text" className="form-input" required placeholder="เช่น สินค้าใหม่, ลายขายดี" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">ราคาขายต่อหน่วย (บาท)</label>
                <input type="number" className="form-input" required min="0" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: Number(e.target.value) })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">เป้าจำนวนขาย (ตัว)</label>
                  <input type="number" className="form-input" required min="0" value={productForm.targetUnits} onChange={(e) => setProductForm({ ...productForm, targetUnits: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">จำนวนที่ขายจริงได้แล้ว (ตัว)</label>
                  <input type="number" className="form-input" required min="0" value={productForm.actualUnits} onChange={(e) => setProductForm({ ...productForm, actualUnits: Number(e.target.value) })} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">สต็อกคงเหลือ</label>
                  <input type="number" className="form-input" required min="0" value={productForm.stockOnHand || 0} onChange={(e) => setProductForm({ ...productForm, stockOnHand: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">จอง/กันไว้</label>
                  <input type="number" className="form-input" required min="0" value={productForm.reservedUnits || 0} onChange={(e) => setProductForm({ ...productForm, reservedUnits: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">จุดเติมสต็อก</label>
                  <input type="number" className="form-input" required min="0" value={productForm.reorderPoint || 0} onChange={(e) => setProductForm({ ...productForm, reorderPoint: Number(e.target.value) })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">กลยุทธ์การขายสินค้า</label>
                <input type="text" className="form-input" placeholder="เช่น เน้นขายส่ง Line, ทำโปรโมชั่นซื้อ 2 แถม 1" value={productForm.strategy} onChange={(e) => setProductForm({ ...productForm, strategy: e.target.value })} />
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowProductModal(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">บันทึก</button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Add/Edit Campaign Modal */}
      {showCampaignModal && (
        <div className="modal-overlay">
          <form className="modal-dialog" onSubmit={saveCampaign}>
            <div className="modal-header">
              <h2>{isCampaignEditMode ? 'แก้ไขรายละเอียดแคมเปญ' : 'เพิ่มแคมเปญการตลาดใหม่'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowCampaignModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              {!isCampaignEditMode && (
                <div className="form-group">
                  <label className="form-label">รหัสแคมเปญ (ห้ามซ้ำ)</label>
                  <input type="text" className="form-input" required placeholder="เช่น c4" value={campaignForm.id} onChange={(e) => setCampaignForm({ ...campaignForm, id: e.target.value.toLowerCase().trim() })} />
                </div>
              )}
              <div className="form-group">
                <label className="form-label">ชื่อแคมเปญการตลาด</label>
                <input type="text" className="form-input" required placeholder="เช่น Campaign 4: เปิดตัวลายพิมพ์สามมิติ" value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">สีประจำแคมเปญ (Hex Color)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="color" className="form-input" style={{ width: '50px', padding: '2px', height: '38px' }} value={campaignForm.color} onChange={(e) => setCampaignForm({ ...campaignForm, color: e.target.value })} />
                  <input type="text" className="form-input" style={{ flexGrow: 1 }} value={campaignForm.color} onChange={(e) => setCampaignForm({ ...campaignForm, color: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">สีพื้นหลังแท็กการแสดงผล (Hex Color)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="color" className="form-input" style={{ width: '50px', padding: '2px', height: '38px' }} value={campaignForm.bg} onChange={(e) => setCampaignForm({ ...campaignForm, bg: e.target.value })} />
                  <input type="text" className="form-input" style={{ flexGrow: 1 }} value={campaignForm.bg} onChange={(e) => setCampaignForm({ ...campaignForm, bg: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">สีขอบแท็กการแสดงผล (Hex Color)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="color" className="form-input" style={{ width: '50px', padding: '2px', height: '38px' }} value={campaignForm.border} onChange={(e) => setCampaignForm({ ...campaignForm, border: e.target.value })} />
                  <input type="text" className="form-input" style={{ flexGrow: 1 }} value={campaignForm.border} onChange={(e) => setCampaignForm({ ...campaignForm, border: e.target.value })} />
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowCampaignModal(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">บันทึก</button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Add/Edit PO Modal */}
      {showPoModal && (
        <div className="modal-overlay">
          <form className="modal-dialog" onSubmit={savePo}>
            <div className="modal-header">
              <h2>{isPoEditMode ? 'แก้ไขรายละเอียดใบ PO' : 'บันทึกใบสั่งผลิต PO ใหม่'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowPoModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">ชื่อสินค้าสั่งผลิต</label>
                <input type="text" className="form-input" required placeholder="เช่น เสื้อลายใหม่ (1), เสื้อสีดำล้วน" value={poForm.product} onChange={(e) => setPoForm({ ...poForm, product: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">จำนวนสินค้าสั่งผลิต (ตัว)</label>
                <input type="number" className="form-input" required min="1" value={poForm.quantity} onChange={(e) => setPoForm({ ...poForm, quantity: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label className="form-label">วันที่ส่งสั่งผลิต (PO Date)</label>
                <input type="date" className="form-input" required value={poForm.orderDate} onChange={(e) => setPoForm({ ...poForm, orderDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">วันของเข้าโดยประมาณ (Delivery Date)</label>
                <input type="date" className="form-input" required value={poForm.arrivalDate} onChange={(e) => setPoForm({ ...poForm, arrivalDate: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">สถานะการผลิต</label>
                <select className="form-input" value={poForm.status} onChange={(e) => setPoForm({ ...poForm, status: e.target.value })}>
                  <option value="Pending">กำลังผลิต (Pending)</option>
                  <option value="Completed">ของเข้าโกดังแล้ว (Completed)</option>
                </select>
              </div>
            </div>
            
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShowPoModal(false)}>ยกเลิก</button>
              <button type="submit" className="btn btn-primary">บันทึก</button>
            </div>
          </form>
        </div>
      )}
      {/* 6. Recycle Bin Modal */}
      {showTrashModal && (
        <div className="modal-overlay">
          <div className="modal-dialog" style={{ maxWidth: '800px', width: '90%' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-trash-can" style={{ color: 'var(--danger)' }}></i>
                ถังขยะ (Recycle Bin)
              </h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowTrashModal(false)}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                รายการที่ถูกลบจะถูกเก็บไว้ที่นี่ชั่วคราว คุณสามารถเลือกกู้คืนข้อมูลกลับไปยังระบบหลัก หรือเลือกลบทิ้งแบบถาวร (ทิ้งให้สิ้นซาก) ได้
              </p>
              {trashItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)' }}>
                  <i className="fa-regular fa-folder-open" style={{ fontSize: '32px', marginBottom: '12px', display: 'block' }}></i>
                  ถังขยะว่างเปล่า ไม่มีข้อมูลที่ถูกลบ
                </div>
              ) : (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ประเภทข้อมูล</th>
                        <th>ชื่อข้อมูล / รายละเอียด</th>
                        <th>เวลาที่ลบ</th>
                        <th style={{ textAlign: 'center' }}>การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trashItems.map(item => {
                        let typeLabel = '';
                        let typeIcon = '';
                        if (item.type === 'task') {
                          typeLabel = 'งานปฏิบัติการ';
                          typeIcon = 'fa-list-check';
                        } else if (item.type === 'product') {
                          typeLabel = 'กลุ่มสินค้า';
                          typeIcon = 'fa-shirt';
                        } else if (item.type === 'campaign') {
                          typeLabel = 'แคมเปญ';
                          typeIcon = 'fa-layer-group';
                        } else if (item.type === 'po') {
                          typeLabel = 'ประวัติ PO';
                          typeIcon = 'fa-receipt';
                        } else if (item.type === 'channel') {
                          typeLabel = 'ช่องทางขาย';
                          typeIcon = 'fa-chart-pie';
                        }
                        
                        return (
                          <tr key={item.id}>
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--surface-hover)', border: '1px solid var(--border)' }}>
                                <i className={`fa-solid ${typeIcon}`} style={{ color: 'var(--primary)' }}></i>
                                {typeLabel}
                              </span>
                            </td>
                            <td style={{ fontWeight: '600', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>
                              {item.name}
                            </td>
                            <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {new Date(item.deletedAt).toLocaleString('th-TH')}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                <button type="button" className="btn btn-sm btn-success-light" onClick={() => restoreTrashItem(item)}>
                                  <i className="fa-solid fa-rotate-left"></i> กู้คืน
                                </button>
                                <button type="button" className="btn btn-sm btn-danger" onClick={() => deleteTrashItemPermanently(item.id)}>
                                  <i className="fa-solid fa-trash-can"></i> ทิ้งให้สิ้นซาก
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div>
                {trashItems.length > 0 && (
                  <button type="button" className="btn btn-danger" onClick={emptyTrash}>
                    <i className="fa-solid fa-dumpster"></i> ล้างถังขยะทั้งหมด
                  </button>
                )}
              </div>
              <button type="button" className="btn" onClick={() => setShowTrashModal(false)}>ปิดหน้าต่าง</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
