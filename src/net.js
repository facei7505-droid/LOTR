// ================= NET: room presence transport + compact snapshot codec =================
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function enc(n, w) { n = Math.max(0, Math.floor(n)); let s = ''; for (let i = 0; i < w; i++) { s = B64[n & 63] + s; n >>= 6; } return s; }
function dec(s, o, w) { let n = 0; for (let i = 0; i < w; i++) n = n * 64 + B64.indexOf(s[o + i]); return n; }
const ENT_W = 12;
function packEnts(u) { // u: flat [id, ti, own, x, y, hp99, ex]
  let s = '';
  for (let i = 0; i < u.length; i += 7) s += enc(u[i], 3) + enc(u[i + 1], 1) + enc(u[i + 2], 1) + enc(u[i + 3], 2) + enc(u[i + 4], 2) + enc(Math.round(u[i + 5] / 99 * 63), 1) + enc(u[i + 6], 2);
  return s;
}
function unpackEnts(s) {
  const out = [];
  for (let o = 0; o + ENT_W <= s.length; o += ENT_W) out.push({ id: dec(s, o, 3), ti: dec(s, o + 3, 1), owner: dec(s, o + 4, 1), x: dec(s, o + 5, 2), y: dec(s, o + 7, 2), hp: dec(s, o + 9, 1) / 63, ex: dec(s, o + 10, 2) });
  return out;
}
const utf8len = s => new TextEncoder().encode(s).length;
function packSnap(game) {
  const sn = game.snapshot();
  sn.u = packEnts(sn.u);
  let json = JSON.stringify(sn);
  if (utf8len(json) > 3500) { sn.n = []; json = JSON.stringify(sn); }
  while (utf8len(json) > 3500 && sn.fx.length) { sn.fx.length = Math.max(0, sn.fx.length - 27); json = JSON.stringify(sn); }
  return sn;
}

const Net = {
  room: null, ready: false, failed: false, conn: false, peers: [], listeners: [],
  async init() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') { this.failed = true; return null; }
      const room = await window.claude.use('room');
      if (!room) { this.failed = true; return null; }
      this.room = room; this.ready = true;
      room.onPeers(ch => { this.peers = ch.peers; for (const f of this.listeners) try { f(ch); } catch (e) { console.error(e); } }, err => { this.err = err.code; this.failed = true; });
      room.onConnection(c => { this.conn = c; }, () => {});
      return room;
    } catch (e) { console.warn('room init', e); this.failed = true; return null; }
  },
  onPeers(f) { this.listeners.push(f); },
  mePeer() { const m = this.peers.find(p => p.sameTab); return m ? m.peer : null; },
  set(patch) { if (!this.room) return; this.room.presence(patch).catch(e => console.warn('presence', e && e.code, e && e.message)); },
  peer(id) { return this.peers.find(p => p.peer === id); },
};
