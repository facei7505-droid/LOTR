// ================= NET: room presence transport + compact snapshot codec =================
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function enc(n, w) { n = Math.max(0, Math.floor(n)); let s = ''; for (let i = 0; i < w; i++) { s = B64[n & 63] + s; n >>= 6; } return s; }
function dec(s, o, w) { let n = 0; for (let i = 0; i < w; i++) n = n * 64 + B64.indexOf(s[o + i]); return n; }
const ENT_W = 16;
function packEnts(u) { // u: flat [id, ti, own, x, y, hp99, ex, squad]
  let s = '';
  for (let i = 0; i < u.length; i += 8) s += enc(u[i], 3) + enc(u[i + 1], 2) + enc(u[i + 2], 1) + enc(u[i + 3], 2) + enc(u[i + 4], 2) + enc(Math.round(u[i + 5] / 99 * 63), 1) + enc(u[i + 6], 2) + enc(u[i + 7], 3);
  return s;
}
function unpackEnts(s) {
  const out = [];
  for (let o = 0; o + ENT_W <= s.length; o += ENT_W) out.push({ id: dec(s, o, 3), ti: dec(s, o + 3, 2), owner: dec(s, o + 5, 1), x: dec(s, o + 6, 2), y: dec(s, o + 8, 2), hp: dec(s, o + 10, 1) / 63, ex: dec(s, o + 11, 2), sq: dec(s, o + 13, 3) });
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

function loadScript(src, sri) { return new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.async = true; if (sri) { s.integrity = sri; s.crossOrigin = 'anonymous'; } s.onload = ok; s.onerror = () => bad(new Error('load ' + src)); document.head.appendChild(s); }); }
// Standalone copies (GitHub Pages, a downloaded file) have no claude.ai room: the lobby then runs over a public MQTT broker (WebSockets).
// Every tab keeps its presence as a retained message on ak/v3/<room>/p/<id>; the broker's last will clears it when the tab disappears.
const MQTT_LIB = 'https://cdn.jsdelivr.net/npm/mqtt@5.10.1/dist/mqtt.min.js';
const MQTT_URLS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const MQ = {
  cli: null, id: 'p' + Math.random().toString(36).slice(2, 10), room: 'public', me: {}, map: new Map(), pubT: 0, timer: 0, url: '',
  base() { return 'ak/v3/' + this.room + '/'; },
  async connect(onChange) {
    if (!window.mqtt) await loadScript(MQTT_LIB, 'sha384-u4uqeACkFcoKl57rBQJHVGDd1pqhW4w8X3WjTu1ZksPdxoLqdt34jpoNkJisE25W');
    this.onChange = onChange;
    for (const url of MQTT_URLS) {
      const ok = await new Promise(res => {
        const topic = this.base() + 'p/' + this.id;
        let done = false;
        const cli = window.mqtt.connect(url, { clientId: 'ak_' + this.id + '_' + Math.random().toString(36).slice(2, 6), clean: true, keepalive: 20, reconnectPeriod: 2000, connectTimeout: 6000, will: { topic, payload: '', retain: true, qos: 0 } });
        const fail = () => { if (done) return; done = true; try { cli.end(true); } catch (e) {} res(false); };
        const to = setTimeout(fail, 7000);
        cli.on('connect', () => {
          if (done) { this.resub(); return; } // automatic reconnects re-join the room
          done = true; clearTimeout(to); this.cli = cli; this.url = url; this.topic = topic;
          cli.on('message', (t, m) => this.onMsg(t, m));
          this.resub(); res(true);
        });
        cli.on('error', () => { if (!this.cli) fail(); });
      });
      if (ok) break;
    }
    if (!this.cli) return false;
    setInterval(() => { this.publish(true); this.prune(); }, 5000);
    window.addEventListener('pagehide', () => { try { this.cli.publish(this.topic, '', { retain: true, qos: 0 }); } catch (e) {} });
    return true;
  },
  resub() { this.cli.subscribe(this.base() + 'p/+', { qos: 0 }); this.publish(true); },
  setRoom(room) {
    room = String(room || 'public').toLowerCase().replace(/[^a-z0-9а-яё_-]/gi, '').slice(0, 24) || 'public';
    if (room === this.room || !this.cli) return;
    try { this.cli.publish(this.topic, '', { retain: true, qos: 0 }); this.cli.unsubscribe(this.base() + 'p/+'); } catch (e) {}
    this.room = room; this.topic = this.base() + 'p/' + this.id; this.map.clear();
    // the last will still points at the old room; it only matters if the tab dies, and stale presences expire anyway
    this.resub(); this.emit();
  },
  onMsg(t, m) {
    const b = this.base() + 'p/'; if (!t.startsWith(b)) return;
    const id = t.slice(b.length); if (id === this.id) return;
    const s = m && m.length ? m.toString() : '';
    if (!s) { if (this.map.delete(id)) this.emit(); return; }
    let p; try { p = JSON.parse(s); } catch (e) { return; }
    if (!p || typeof p !== 'object' || Date.now() - (+p._t || 0) > 20000) { this.map.delete(id); return; }
    p._seen = Date.now(); this.map.set(id, p); this.emit();
  },
  prune() { let ch = false; for (const [id, p] of this.map) if (Date.now() - p._seen > 16000) { this.map.delete(id); ch = true; } if (ch) this.emit(); },
  set(patch) { Object.assign(this.me, patch); this.publish(false); },
  publish(force) {
    if (!this.cli) return;
    const now = Date.now(), wait = 70 - (now - this.pubT);
    if (!force && wait > 0) { if (!this.timer) this.timer = setTimeout(() => { this.timer = 0; this.publish(true); }, wait); return; }
    this.pubT = now; this.me._t = now;
    try { this.cli.publish(this.topic, JSON.stringify(this.me), { retain: true, qos: 0 }); } catch (e) {}
  },
  peers() { const out = [{ peer: this.id, presence: this.me, sameTab: true }]; for (const [id, p] of this.map) out.push({ peer: id, presence: p, sameTab: false }); return out; },
  emit() { if (this.onChange) this.onChange(this.peers()); },
};

const Net = {
  room: null, ready: false, failed: false, conn: false, peers: [], listeners: [], kind: '', connecting: false,
  async init() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') { this.kind = 'mqtt'; return null; }
      const room = await window.claude.use('room');
      if (!room) { this.failed = true; return null; }
      this.room = room; this.ready = true; this.kind = 'room';
      room.onPeers(ch => { this.peers = ch.peers; for (const f of this.listeners) try { f(ch); } catch (e) { console.error(e); } }, err => { this.err = err.code; this.failed = true; });
      room.onConnection(c => { this.conn = c; }, () => {});
      return room;
    } catch (e) { console.warn('room init', e); this.kind = 'mqtt'; return null; }
  },
  // public internet lobby (standalone copies); resolves true when connected
  async connectPublic() {
    if (this.ready || this.connecting || this.kind !== 'mqtt') return this.ready;
    this.connecting = true; this.failed = false;
    try {
      const ok = await MQ.connect(list => { this.peers = list; for (const f of this.listeners) try { f({ peers: list }); } catch (e) { console.error(e); } });
      this.ready = ok; this.failed = !ok; if (ok) { this.peers = MQ.peers(); this.conn = true; }
    } catch (e) { console.warn('mqtt', e); this.failed = true; }
    this.connecting = false; return this.ready;
  },
  get roomCode() { return this.kind === 'mqtt' ? MQ.room : ''; },
  setRoom(code) { if (this.kind === 'mqtt') MQ.setRoom(code); },
  onPeers(f) { this.listeners.push(f); },
  mePeer() { const m = this.peers.find(p => p.sameTab); return m ? m.peer : null; },
  set(patch) { if (this.kind === 'mqtt') { if (this.ready) { MQ.set(patch); this.peers = MQ.peers(); } return; } if (!this.room) return; this.room.presence(patch).catch(e => console.warn('presence', e && e.code, e && e.message)); },
  peer(id) { return this.peers.find(p => p.peer === id); },
};
