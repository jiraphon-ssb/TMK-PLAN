/* ============================================================
   entityStore.js — REALTIME blueprint §11.1: versioned entity store + patch algorithm
   ============================================================
   เป้าหมาย (§11): เลิก global mutable singleton เป็นเส้นทางหลักของ realtime patch
   store: { byId, versions } ต่อ entity type · applyDomainEvent ตรวจ dedup/version/gap
   - event.entity_version <= current → duplicate/stale (ข้าม)
   - event.entity_version == current+1 → patch (apply)
   - event.entity_version > current+1 → gap (ต้อง sync เฉพาะ entity · §5.3/§15)
   pure → unit-test ได้ (§28 Unit: patch reducers · version gap detection)
   ยังไม่ wire dataContext (TMK เป็น holistic derived object · ต้อง refactor แยก · session เฉพาะ)
   ⚠️ ยังไม่ wire — primitive ของ REALTIME-C2-PLAN (ดู src/realtime/README.md) · อย่าลบเพราะ "ไม่มีใคร import"
   ============================================================ */

/** สร้าง store ว่าง (mutable object · แต่ apply เป็น pure-ish: คืน status + แก้ store in-place) */
export function createEntityStore() {
  return { byId: Object.create(null), versions: Object.create(null) };
}

/**
 * apply domain event ตาม §11.1
 * @param {object} store createEntityStore()
 * @param {object} event { entity_id, entity_version, patch, event_id, event_type }
 * @param {{onGap?:(id,version)=>void}} hooks
 * @returns {{ status:'applied'|'duplicate'|'stale'|'gap'|'deleted'|'invalid', id?, version? }}
 */
export function applyDomainEvent(store, event, hooks = {}) {
  if (!store || !event || event.entity_id == null) return { status: 'invalid' };
  const id = event.entity_id;
  const incoming = Number(event.entity_version);
  if (!Number.isFinite(incoming)) return { status: 'invalid' };
  const current = store.versions[id] ?? 0;

  // ตามหลัง/เท่ากับที่มี → ซ้ำหรือช้า (ข้าม · idempotent)
  if (incoming <= current) return { status: incoming < current ? 'stale' : 'duplicate', id, version: current };

  // ข้าม version (มากกว่า current+1) → มี event หาย = gap → ขอ sync เฉพาะ entity นี้ (ไม่ patch มั่ว)
  if (incoming > current + 1) {
    hooks.onGap?.(id, current);
    return { status: 'gap', id, version: current };
  }

  // ต่อเนื่องพอดี (current+1) → apply
  if (event.event_type && /\.deleted$/.test(event.event_type)) {
    delete store.byId[id];
    store.versions[id] = incoming;
    return { status: 'deleted', id, version: incoming };
  }
  const prev = store.byId[id] || {};
  store.byId[id] = { ...prev, ...(event.patch || {}), id };
  store.versions[id] = incoming;
  return { status: 'applied', id, version: incoming };
}

/** โหลด snapshot (§5.3 step 3-4) — set รายการ + version พร้อมกัน (bounded ตาม caller) */
export function loadSnapshot(store, rows, { idKey = 'id', versionKey = 'row_version' } = {}) {
  for (const row of rows || []) {
    const id = row?.[idKey];
    if (id == null) continue;
    store.byId[id] = row;
    store.versions[id] = Number(row[versionKey] ?? 1);
  }
  return store;
}

/** อ่าน entity ปัจจุบัน (selector) */
export function getEntity(store, id) { return store?.byId?.[id]; }
