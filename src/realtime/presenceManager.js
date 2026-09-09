/* ============================================================
   presenceManager.js — REALTIME blueprint §18/§20: Supabase Presence (แทน DB heartbeat)
   ============================================================
   เป้าหมาย (§18): เลิก upsert tmk_presence ทุก 45วิ + select ทุก 30วิ → ใช้ Supabase Presence
   กฎ §18: track ตอน subscribe · update section แบบ throttle ≥3-5วิ · ไม่เขียน DB · ไม่ track mouse
   injectable channelFactory + now() → unit-test ได้ (ไม่ต้องต่อ Supabase จริง)
   **ยังไม่ wire** (behind flag presence_v2) — cutover heartbeat ต้อง verify ด้วย 2 users (§27)
   ⚠️ ยังไม่ wire — primitive ของ REALTIME-C2-PLAN (ดู src/realtime/README.md) · อย่าลบเพราะ "ไม่มีใคร import"
   ============================================================ */

/**
 * @param {{ channelFactory:(topic:string)=>object, now?:()=>number, throttleMs?:number }} opts
 *   channelFactory(topic) → channel แบบ supabase (.on/.subscribe/.track/.untrack/.presenceState)
 */
export function createPresenceManager({ channelFactory, now = () => Date.now(), throttleMs = 4000 } = {}) {
  let channel = null, current = null, lastTrackAt = 0, syncCbs = [];

  function getOnline() {
    const st = channel?.presenceState?.();
    if (!st) return [];
    return Object.values(st).flat(); // { key: [state,...] } → [state,...]
  }
  const emitSync = () => { const online = getOnline(); for (const cb of syncCbs) cb(online); };

  return {
    // §18: track ตอน subscribe (ไม่เขียน DB)
    join(topic, state = {}) {
      current = { ...state, online_at: new Date(now()).toISOString() };
      channel = channelFactory(topic);
      channel.on?.('presence', { event: 'sync' }, emitSync);
      channel.subscribe?.((status) => {
        if (status === 'SUBSCRIBED') { channel.track?.(current); lastTrackAt = now(); }
      });
      return this;
    },
    // §18: update section แบบ throttle — เปลี่ยน section เท่านั้น + ห่างจาก track ล่าสุด ≥ throttleMs
    updateSection(section) {
      if (!channel || !current) return false;
      if (current.section === section) return false;      // ไม่เปลี่ยน → ข้าม
      if (now() - lastTrackAt < throttleMs) return false; // throttle (กัน track ถี่)
      current = { ...current, section, online_at: new Date(now()).toISOString() };
      channel.track?.(current); lastTrackAt = now();
      return true;
    },
    getOnline,
    onSync(cb) { syncCbs.push(cb); return () => { syncCbs = syncCbs.filter(f => f !== cb); }; },
    // cleanup ตอน logout/leave (§20)
    leave() {
      try { channel?.untrack?.(); channel?.unsubscribe?.(); } catch { /* ignore */ }
      channel = null; current = null; syncCbs = [];
    },
  };
}
