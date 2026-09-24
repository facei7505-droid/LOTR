// ================= MAIN: views, input, HUD, menus, lobby, loop =================
const $ = id => document.getElementById(id);
const cv = $('cv'), mini = $('mini');
const R = new Renderer(cv);
const store = { get(k, d) { try { const v = localStorage.getItem('ak_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('ak_' + k, JSON.stringify(v)); } catch (e) {} } };

// ---------- sound ----------
const Snd = {
  ctx: null, on: store.get('snd', true), last: {},
  init() { if (this.ctx || !this.on) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} },
  play(k, vol) {
    if (!this.on || !this.ctx) return; const t = this.ctx.currentTime; if (this.last[k] && t - this.last[k] < 0.07) return; this.last[k] = t;
    const c = this.ctx, g = c.createGain(); g.connect(c.destination); vol = (vol || 1) * 0.18;
    const noise = (dur, f, q) => { const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length); const s = c.createBufferSource(); s.buffer = b; const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q || 1; s.connect(fl); fl.connect(g); s.start(t); };
    const tone = (f1, f2, dur, type) => { const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur); o.connect(g); o.start(t); o.stop(t + dur); };
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    if (k === 'arrow') noise(0.12, 2400, 3);
    else if (k === 'boom') { noise(0.5, 180, 0.8); tone(120, 40, 0.4, 'triangle'); }
    else if (k === 'heal') { tone(520, 880, 0.35); }
    else if (k === 'lvl') { tone(440, 660, 0.15, 'triangle'); setTimeout(() => this.play('lvl2', vol * 5), 120); }
    else if (k === 'lvl2') tone(660, 990, 0.25, 'triangle');
    else if (k === 'click') { g.gain.setValueAtTime(vol * 0.5, t); tone(700, 500, 0.06, 'square'); }
    else if (k === 'horn') { tone(196, 220, 0.6, 'sawtooth'); }
    else if (k === 'build') noise(0.2, 600, 2);
  },
};

// ---------- views ----------
let V = null;        // active view
let game = null, ais = [], mode = 'menu'; // menu | local | host | client
let attract = null;

function makeLocalView(g, me) {
  const v = {
    kind: 'local', me, g, time: 0, fx: g.fx, over: -1,
    ents: g.ents,
    get(id) { const e = g.byId.get(id); return e && !e.dead ? e : null; },
    player(i) { const p = g.players[i]; if (!p) return null; const pi = g.popInfo(i); return { gold: p.gold, used: pi.used, cap: pi.cap, alive: p.alive, income: g.income(p), race: p.race, team: p.team, name: p.name, power: p.power, pcd: p.pcd.slice() }; },
    heroes(pi) { const p = g.players[pi]; return ['h1', 'h2'].map(hk => { const s = p.heroes[hk]; const h = s.id ? g.byId.get(s.id) : null; return { hk, id: h ? h.id : 0, lvl: h ? h.lvl : (s.lvl || 1), xp: h ? h.xp / (120 * h.lvl) : 0, recruited: s.recruited, auto: !!s.auto, scd: h ? h.scd.slice() : [0, 0, 0, 0], d: DEF[p.race + '_' + hk] }; }); },
    queue(bid) { const b = g.byId.get(bid); if (!b || !b.queue.length) return null; const q = b.queue[0]; return { n: b.queue.length, prog: q.t / DEF[q.u].time, ti: DEF[q.u].ti, items: b.queue.map(x => x.u) }; },
    send(c) { g.cmd(me, c); },
    canPlace(key, x, y) { return g.canPlace(me, key, x, y); },
    teamOf(i) { return g.players[i] ? g.players[i].team : -1; },
    nplayers: g.players.length,
    prep(alpha) {
      this.time = g.t + alpha * TICK; this.fx = g.fx; this.ents = g.ents; this.over = g.over; this.outposts = g.outposts;
      for (const e of g.ents) { e.rx = e.px + (e.x - e.px) * alpha; e.ry = e.py + (e.y - e.py) * alpha; e.atkT = e.atk; e.stunned = e.stun > 0; e.buffGlow = e.buffs.length > 0; }
    },
  };
  return v;
}

function makeClientView(me, players) {
  const ents = new Map();
  const v = {
    kind: 'client', me, time: 0, fx: [], over: -1, ents: [], outposts: OUTPOSTS.map(([x, y]) => ({ x, y, owner: -1, prog: 0, cap: -1 })), players, pl: [], hs: [], qs: new Map(), lastSnapT: -1, fxSeen: new Set(), interval: 0.1, lastRecv: 0, notesSeen: new Set(),
    seq: 0, outbox: [],
    get(id) { return ents.get(id) || null; },
    player(i) { const p = this.pl[i]; const P = players[i]; if (!p || !P) return null; return { gold: p[0], used: p[1], cap: p[2], alive: !!p[3], income: p[4] / 10, race: P.race, team: P.team, name: P.name, power: p[5] || 0, pcd: [p[6] || 0, p[7] || 0, p[8] || 0] }; },
    heroes(pi) {
      const out = [];
      for (let k = 0; k < this.hs.length; k += 11) {
        if (this.hs[k] !== pi) continue;
        const hk = 'h' + this.hs[k + 1];
        out.push({ hk, id: this.hs[k + 2], lvl: this.hs[k + 3], xp: this.hs[k + 4] / 99, recruited: !!this.hs[k + 5], auto: !!this.hs[k + 6], scd: this.hs.slice(k + 7, k + 11).map(x => x / 10), d: DEF[players[pi].race + '_' + hk] });
      }
      if (!out.length) return ['h1', 'h2'].map(hk => ({ hk, id: 0, lvl: 1, xp: 0, recruited: false, scd: [0, 0, 0, 0], d: DEF[players[pi].race + '_' + hk] }));
      return out;
    },
    queue(bid) { const q = this.qs.get(bid); return q ? { n: q[0], prog: q[1] / 99, ti: q[2], items: [] } : null; },
    send(c) { this.seq++; this.outbox.push([this.seq, c]); if (this.outbox.length > 12) this.outbox.shift(); Net.set({ cmd: { l: this.outbox } }); },
    canPlace(key, x, y) { return Game.prototype.canPlace.call({ ents: this.ents, enemy: (a, b) => a !== b && players[a] && players[b] && players[a].team !== players[b].team }, me, key, x, y); },
    teamOf(i) { return players[i] ? players[i].team : -1; },
    nplayers: players.length,
    ingest(sn, now) {
      if (!sn || sn.t === this.lastSnapT) return;
      if (this.lastRecv) this.interval = clamp(now - this.lastRecv, 0.05, 0.4) * 0.3 + this.interval * 0.7;
      this.lastRecv = now; this.lastSnapT = sn.t;
      const list = unpackEnts(sn.u || '');
      const seen = new Set();
      for (const s of list) {
        const d = TYPES[s.ti]; if (!d) continue;
        seen.add(s.id);
        let e = ents.get(s.id);
        if (!e) { e = { id: s.id, d, r: d.r, owner: s.owner, x: s.x, y: s.y, rx: s.x, ry: s.y, fx0: s.x, fy0: s.y, maxhp: d.hp, hp: d.hp, face: 1, lvl: 1, rank: 0 }; ents.set(s.id, e); }
        e.fx0 = e.rx; e.fy0 = e.ry; e.x = s.x; e.y = s.y; e.t0 = now;
        e.hp = s.hp * e.maxhp;
        if (d.kind === 'b') { e.built = s.ex / 99; }
        else { e.built = 1; e.atkT = (s.ex & 1) ? 0.3 : 0; e.moving = !!(s.ex & 2); e.face = (s.ex & 4) ? -1 : 1; e.stunned = !!(s.ex & 8); e.rank = (s.ex >> 4) & 3; const lv = (s.ex >> 6) & 15; if (d.hero && lv > e.lvl && e.lvl) { /* level up */ } e.lvl = lv || 1; }
      }
      for (const id of [...ents.keys()]) if (!seen.has(id)) ents.delete(id);
      this.ents = [...ents.values()];
      this.pl = sn.pl || []; this.hs = sn.hs || [];
      const op = sn.op || []; for (let k = 0, i = 0; k + 3 < op.length && i < this.outposts.length; k += 4, i++) { const o = this.outposts[i]; o.owner = op[k]; o.prog = op[k + 1] / 99; o.cap = op[k + 2]; o.contested = !!op[k + 3]; }
      this.qs = new Map(); const q = sn.q || []; for (let k = 0; k < q.length; k += 4) this.qs.set(q[k], [q[k + 1], q[k + 2], q[k + 3]]);
      const fx = sn.fx || []; const ckeys = Object.keys(FX_COLORS);
      for (let k = 0; k < fx.length; k += 9) {
        const id = fx[k]; if (this.fxSeen.has(id)) continue; this.fxSeen.add(id);
        this.fx.push({ id, k: FX_KINDS[fx[k + 1]], x: fx[k + 2], y: fx[k + 3], x2: fx[k + 4], y2: fx[k + 5], p: fx[k + 6], dur: Math.max(0.1, fx[k + 7] / 10), c: fx[k + 8] >= 0 ? ckeys[fx[k + 8]] : null, t0: now });
      }
      if (this.fxSeen.size > 3000) this.fxSeen = new Set([...this.fxSeen].slice(-800));
      for (const n of sn.n || []) { const key = n[2] + n[1]; if (n[0] === me && !this.notesSeen.has(key)) { this.notesSeen.add(key); toast(n[1], n[3], n[4]); } }
      this.over = sn.o;
    },
    prep() {
      const now = performance.now() / 1000; this.time = now;
      const dur = this.interval * 1.15;
      for (const e of this.ents) { const a = clamp((now - (e.t0 || now)) / dur, 0, 1); e.rx = e.fx0 + (e.x - e.fx0) * a; e.ry = e.fy0 + (e.y - e.fy0) * a; }
      this.fx = this.fx.filter(f => now - f.t0 < f.dur + 1);
    },
  };
  return v;
}

// ---------- selection & interaction state ----------
const UI = { alerts: [], groups: [[], [], []], targetMark: null, sel: new Set(), cmode: null, marchMode: false, boxMode: false, lastTap: { t: 0, id: 0 }, ghost: null, panelSig: '', notesShown: 0, pings: [] };
function selEnts() { const out = []; for (const id of UI.sel) { const e = V.get(id); if (e) out.push(e); } return out; }
function mySel() { return selEnts().filter(e => e.owner === V.me); }
function setSel(ids) { UI.sel = new Set(ids); UI.cmode = null; UI.ghost = null; UI.panelSig = ''; }
function iconFor(d, owner) {
  const key = 'ic' + d.key + owner; if (SPR.has(key)) return SPR.get(key);
  const spr = d.kind === 'b' ? bldSprite(d, TEAM_COLORS[owner]) : unitSprite(d, TEAM_COLORS[owner]);
  const c = mkCanvas(64, 64), x = c.getContext('2d');
  const s = Math.min(64 / spr.w, 64 / spr.h) * (d.kind === 'b' ? 1 : 1.25);
  x.drawImage(spr.cv, 32 - spr.w * s / 2, d.kind === 'b' ? 64 - spr.h * s : 60 - spr.h * s, spr.w * s, spr.h * s);
  let url = ''; try { url = c.toDataURL(); } catch (e) {}
  SPR.set(key, url); return url;
}
function toast(text, x, y) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = text;
  if (x !== undefined && x >= 0) { el.classList.add('go'); el.addEventListener('pointerdown', ev => { ev.preventDefault(); R.centerOn(x, y); el.remove(); }); UI.alerts.push({ x, y, t: performance.now() / 1000 }); if (UI.alerts.length > 8) UI.alerts.shift(); }
  const box = $('toasts'); box.appendChild(el); while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), 3800);
}
function hint(text) { const h = $('hint'); if (text) { h.textContent = text; h.hidden = false; } else h.hidden = true; }
function fmtT(s) { s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

// ---------- world picking ----------
function pick(wx, wy, touch) {
  let best = null, bd = 1e9; const tol = touch ? 28 / R.cam.z : 10 / R.cam.z;
  for (const e of V.ents) {
    let d;
    if (e.d.kind === 'b') { const dx = wx - e.rx, dy = (wy - (e.ry - e.r * 0.5)) * 1.1; d = Math.hypot(dx, dy) - e.r * 1.05; }
    else { const cy = e.ry - (e.d.hero ? 22 : 16); d = Math.hypot(wx - e.rx, (wy - cy) * 0.8) - e.r - 6; }
    if (d < tol && d < bd) { bd = d; best = e; }
  }
  return best;
}
function issueAt(wx, wy, target) {
  const mine = mySel().filter(e => e.d.kind === 'u');
  if (!mine.length) return false;
  if (target && V.teamOf(target.owner) !== V.teamOf(V.me)) { V.send({ c: 'atk', ids: mine.map(e => e.id), t: target.id }); UI.targetMark = { id: target.id, t: performance.now() / 1000 }; }
  else { V.send({ c: 'move', ids: mine.map(e => e.id), x: wx, y: wy, a: UI.marchMode ? 0 : 1 }); pingAt(wx, wy, UI.marchMode ? '#8fd0ff' : '#f6e27a'); }
  Snd.play('click'); return true;
}
function pingAt(x, y, col) { UI.pings.push({ x, y, col, t: performance.now() / 1000 }); }

function tapWorld(sx, sy, touch) {
  const w = R.toWorld(sx, sy);
  const cm = UI.cmode;
  if (cm) {
    if (cm.t === 'build') {
      const ok = V.canPlace(cm.key, w.x, w.y);
      if (UI.ghost && Math.hypot(UI.ghost.x - w.x, UI.ghost.y - w.y) < 40 / R.cam.z + 20 && UI.ghost.ok) { buildHere(); return; }
      if (!touch && ok) { UI.ghost = { d: DEF[cm.key], x: w.x, y: w.y, ok }; buildHere(); return; }
      UI.ghost = { d: DEF[cm.key], x: w.x, y: w.y, ok }; UI.panelSig = '';
      hint(ok ? 'Нажмите ещё раз на силуэт или «Поставить»' : 'Здесь строить нельзя: слишком далеко от базы или занято');
      return;
    }
    if (cm.t === 'skill') { V.send({ c: 'skill', h: cm.h, s: cm.s, x: w.x, y: w.y }); pingAt(w.x, w.y, '#ffb35a'); UI.cmode = null; hint(''); UI.panelSig = ''; Snd.play('click'); return; }
    if (cm.t === 'power') { V.send({ c: 'power', k: cm.k, x: w.x, y: w.y }); pingAt(w.x, w.y, '#ffb35a'); UI.cmode = null; hint(''); UI.panelSig = ''; Snd.play('horn'); return; }
    if (cm.t === 'rally') { V.send({ c: 'rally', b: cm.b, x: w.x, y: w.y }); const b = V.get(cm.b); if (b) b.rally = { x: w.x, y: w.y }; UI.cmode = null; hint(''); UI.panelSig = ''; pingAt(w.x, w.y, '#f6e27a'); return; }
  }
  const e = pick(w.x, w.y, touch);
  const now = performance.now();
  if (e && e.owner === V.me) {
    const hasUnits = mySel().some(u => u.d.kind === 'u');
    if (e.d.kind === 'u' && now - UI.lastTap.t < 380 && UI.lastTap.id === e.id) {
      // double tap: all of same type on screen
      const ids = V.ents.filter(o => o.owner === V.me && o.d === e.d && inScreen(o)).map(o => o.id); setSel(ids);
    } else setSel([e.id]);
    UI.lastTap = { t: now, id: e.id }; Snd.play('click');
    void hasUnits; return;
  }
  if (e && issueAt(w.x, w.y, e)) return;
  if (e) { setSel([e.id]); return; }
  if (issueAt(w.x, w.y, null)) return;
  setSel([]);
}
function inScreen(e) { const s = R.toScreen(e.rx, e.ry); return s.x > -10 && s.y > -10 && s.x < R.w + 10 && s.y < R.h + 10; }
function buildHere() {
  const g = UI.ghost, cm = UI.cmode; if (!g || !cm) return;
  if (!V.canPlace(cm.key, g.x, g.y)) { toast('Здесь строить нельзя'); return; }
  const p = V.player(V.me); if (p.gold < DEF[cm.key].cost) { toast('Не хватает золота'); return; }
  V.send({ c: 'build', t: cm.sub, x: g.x, y: g.y }); Snd.play('build');
  UI.cmode = null; UI.ghost = null; hint(''); UI.panelSig = '';
}
function boxSelect(x0, y0, x1, y1) {
  const a = R.toWorld(Math.min(x0, x1), Math.min(y0, y1)), b = R.toWorld(Math.max(x0, x1), Math.max(y0, y1));
  const ids = V.ents.filter(e => e.owner === V.me && e.d.kind === 'u' && e.rx >= a.x && e.rx <= b.x && e.ry >= a.y && e.ry <= b.y + 20).map(e => e.id);
  if (ids.length) { setSel(ids); Snd.play('click'); }
}

// ---------- pointer input ----------
const ptrs = new Map(); let gesture = null; let boxRect = null; let hoverW = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  Snd.init();
  if (!V || mode === 'menu') return;
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), type: e.pointerType, btn: e.button });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    gesture = { t: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: R.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: { ...R.cam } }; boxRect = null;
  } else if (ptrs.size === 1) {
    gesture = { t: 'maybe', id: e.pointerId };
    if (e.pointerType === 'mouse') {
      if (e.button === 2) { const w = R.toWorld(e.clientX, e.clientY); const t = pick(w.x, w.y, false); if (UI.cmode) { UI.cmode = null; UI.ghost = null; hint(''); UI.panelSig = ''; } else issueAt(w.x, w.y, t); gesture = null; ptrs.delete(e.pointerId); return; }
      if (e.button === 1) gesture = { t: 'pan', id: e.pointerId, cam: { ...R.cam } };
    }
    const id = e.pointerId;
    if (e.pointerType !== 'mouse') gesture.lp = setTimeout(() => { if (gesture && gesture.t === 'maybe' && gesture.id === id && !UI.cmode) { gesture.t = 'box'; const p = ptrs.get(id); boxRect = { x0: p.x0, y0: p.y0, x1: p.x, y1: p.y }; if (navigator.vibrate) try { navigator.vibrate(15); } catch (er) {} } }, 420);
  }
});
cv.addEventListener('pointermove', e => {
  if (!V) return;
  if (e.pointerType === 'mouse') { hoverW = R.toWorld(e.clientX, e.clientY); if (UI.cmode && UI.cmode.t === 'build') UI.ghost = { d: DEF[UI.cmode.key], x: hoverW.x, y: hoverW.y, ok: V.canPlace(UI.cmode.key, hoverW.x, hoverW.y) }; }
  const p = ptrs.get(e.pointerId); if (!p) return;
  const px = p.x, py = p.y; p.x = e.clientX; p.y = e.clientY;
  if (!gesture) return;
  if (gesture.t === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const cam0 = gesture.cam; const wx = cam0.x + gesture.mx / cam0.z, wy = cam0.y + gesture.my / cam0.z;
    R.cam.z = clamp(gesture.z0 * d / Math.max(10, gesture.d0), 0.3, 2.2); R.clampCam();
    R.cam.x = wx - mx / R.cam.z; R.cam.y = wy - my / R.cam.z; R.clampCam();
    return;
  }
  if (gesture.t === 'maybe') {
    const moved = Math.hypot(p.x - p.x0, p.y - p.y0);
    if (moved > 9) {
      clearTimeout(gesture.lp);
      if ((p.type === 'mouse' && p.btn === 0) || UI.boxMode) { gesture.t = 'box'; boxRect = { x0: p.x0, y0: p.y0, x1: p.x, y1: p.y }; }
      else { gesture.t = 'pan'; gesture.cam = { ...R.cam }; gesture.cam.x += (p.x - p.x0) / R.cam.z; gesture.cam.y += (p.y - p.y0) / R.cam.z; }
    }
  }
  if (gesture.t === 'pan') { R.cam.x -= (p.x - px) / R.cam.z; R.cam.y -= (p.y - py) / R.cam.z; R.clampCam(); }
  if (gesture.t === 'box' && boxRect) { boxRect.x1 = p.x; boxRect.y1 = p.y; }
});
function endPtr(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  ptrs.delete(e.pointerId);
  if (!gesture) return;
  clearTimeout(gesture.lp);
  if (gesture.t === 'pinch') { if (ptrs.size === 0) gesture = null; else gesture = { t: 'none' }; return; }
  if (gesture.t === 'maybe' && e.type === 'pointerup') tapWorld(p.x, p.y, p.type !== 'mouse');
  if (gesture.t === 'box' && boxRect) { boxSelect(boxRect.x0, boxRect.y0, boxRect.x1, boxRect.y1); if (UI.boxMode) { UI.boxMode = false; $('bBox').classList.remove('on'); } }
  boxRect = null; if (ptrs.size === 0) gesture = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => {
  if (!V) return; e.preventDefault();
  const w = R.toWorld(e.clientX, e.clientY);
  R.cam.z = clamp(R.cam.z * Math.exp(-e.deltaY * 0.0015), 0.3, 2.2); R.clampCam();
  R.cam.x = w.x - e.clientX / R.cam.z; R.cam.y = w.y - e.clientY / R.cam.z; R.clampCam();
}, { passive: false });
const keys = new Set();
window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
  if (e.key === 'Escape') { UI.cmode = null; UI.ghost = null; hint(''); UI.panelSig = ''; }
  if (mode !== 'menu' && V) {
    const n = '1234'.indexOf(e.key);
    if (n >= 0) { const h = mySel().find(x => x.d.hero); if (h) useSkill(h, n); }
    if (e.key.toLowerCase() === 'q') selectArmy();
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
// minimap
function miniJump(e) { const r = mini.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * MAP_W, y = (e.clientY - r.top) / r.height * MAP_H; R.centerOn(x, y); }
let miniDown = false;
let miniLast = 0;
mini.addEventListener('pointerdown', e => { e.preventDefault(); const now = performance.now(); if (now - miniLast < 350 && V && mySel().some(u => u.d.kind === 'u')) { const r = mini.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width * MAP_W, y = (e.clientY - r.top) / r.height * MAP_H; issueAt(x, y, null); toast(UI.marchMode ? 'Войска идут маршем' : 'Войска выдвигаются в атаку'); miniLast = 0; return; } miniLast = now; miniDown = true; mini.setPointerCapture(e.pointerId); miniJump(e); });
mini.addEventListener('pointermove', e => { if (miniDown) miniJump(e); });
mini.addEventListener('pointerup', () => miniDown = false);
mini.addEventListener('pointercancel', () => miniDown = false);

// ---------- HUD / command panel ----------
function selectArmy() { const ids = V.ents.filter(e => e.owner === V.me && e.d.kind === 'u').map(e => e.id); setSel(ids); if (ids.length) toast('Выбрана вся армия: ' + ids.length); }
function useSkill(h, si) {
  const sk = h.d.skills[si]; const hi = V.heroes(V.me).find(x => x.id === h.id);
  if (!sk || sk.type === 'aura') return;
  if (!hi || hi.lvl < sk.lvl) { toast('Навык откроется на ' + sk.lvl + ' уровне'); return; }
  if (hi.scd[si] > 0) { toast('Перезарядка: ' + Math.ceil(hi.scd[si]) + ' с'); return; }
  if (sk.range) { UI.cmode = { t: 'skill', h: h.id, s: si, range: sk.range, radius: sk.radius || 60 }; hint(sk.name + ': нажмите на карту, куда применить'); }
  else { V.send({ c: 'skill', h: h.id, s: si, x: h.rx, y: h.ry }); Snd.play('click'); }
  UI.panelSig = '';
}
$('bottom').addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  e.preventDefault(); Snd.init(); Snd.play('click');
  const act = b.dataset.act, arg = b.dataset.arg;
  const sel = mySel();
  switch (act) {
    case 'buildmenu': UI.cmode = UI.cmode && UI.cmode.t === 'buildmenu' ? null : { t: 'buildmenu' }; UI.ghost = null; hint(''); break;
    case 'army': selectArmy(); break;
    case 'recruitmenu': UI.cmode = UI.cmode && UI.cmode.t === 'recruit' ? null : { t: 'recruit' }; UI.ghost = null; hint(''); break;
    case 'rtrain': { const ud = DEF[arg]; const P2 = V.player(V.me); if (P2.gold < ud.cost) { toast('Не хватает золота'); break; } if (P2.used + ud.pop > P2.cap) { toast('Лимит армии — постройте фермы или захватите аванпост'); break; }
      let best = null, bn = 99; for (const b of V.ents) if (b.owner === V.me && b.built >= 1 && b.d.trains && b.d.trains.includes(arg)) { const q = V.queue(b.id); const n = q ? q.n : 0; if (n < bn) { bn = n; best = b; } }
      if (best) V.send({ c: 'train', b: best.id, u: arg }); break; }
    case 'hero2': { const f = V.ents.find(x => x.owner === V.me && x.d.sub === 'fort'); if (f) V.send({ c: 'hero', b: f.id, h: arg }); break; }
    case 'hold': V.send({ c: 'hold', ids: sel.map(x => x.id) }); toast('Держать позицию: бойцы не сойдут с места'); break;
    case 'retreat': V.send({ c: 'retreat', ids: sel.map(x => x.id) }); toast('Отступаем к цитадели'); break;
    case 'autocast': { const hs = V.heroes(V.me).find(x => x.hk === arg); const on = !(hs && hs.auto); V.send({ c: 'auto', hk: arg, on }); toast(on ? 'Герой сам применяет навыки' : 'Навыки героя — вручную'); break; }
    case 'powers': UI.cmode = UI.cmode && (UI.cmode.t === 'powers' || UI.cmode.t === 'power') ? null : { t: 'powers' }; UI.ghost = null; hint(''); break;
    case 'usepower': { const k = +arg, pw = POWERS[k], P2 = V.player(V.me); if (P2.pcd[k] > 0) { toast('Перезарядка: ' + Math.ceil(P2.pcd[k]) + ' с'); break; } if (P2.power < pw.cost) { toast('Нужно ' + pw.cost + ' очков силы — побеждайте врагов и захватывайте аванпосты'); break; } if (pw.target) { UI.cmode = { t: 'power', k, radius: pw.radius }; hint(POWER_NAMES[P2.race][k][0] + ': нажмите на карту'); } else { V.send({ c: 'power', k, x: 0, y: 0 }); UI.cmode = null; Snd.play('horn'); } break; }
    case 'boxmode': UI.boxMode = !UI.boxMode; $('bBox').classList.toggle('on', UI.boxMode); if (UI.boxMode) hint('Проведите пальцем, чтобы выделить рамкой'); else hint(''); break;
    case 'pickbuild': { const p = V.player(V.me); const key = p.race + '_' + arg; if (p.gold < DEF[key].cost) { toast('Не хватает золота'); break; } UI.cmode = { t: 'build', key, sub: arg }; UI.ghost = null; hint('Выберите место рядом с базой'); if (hoverW) UI.ghost = { d: DEF[key], x: hoverW.x, y: hoverW.y, ok: V.canPlace(key, hoverW.x, hoverW.y) }; break; }
    case 'place': buildHere(); break;
    case 'cancelmode': UI.cmode = null; UI.ghost = null; hint(''); break;
    case 'train': { const bld = sel.find(x => x.d.kind === 'b'); if (bld) V.send({ c: 'train', b: bld.id, u: arg }); const p = V.player(V.me); if (p && p.gold < DEF[arg].cost) toast('Не хватает золота'); else if (p && p.used + DEF[arg].pop > p.cap) toast('Лимит армии — постройте фермы'); break; }
    case 'hero': { const bld = sel.find(x => x.d.sub === 'fort'); if (bld) V.send({ c: 'hero', b: bld.id, h: arg }); break; }
    case 'cancelq': { const bld = sel.find(x => x.d.kind === 'b'); if (bld) V.send({ c: 'cancel', b: bld.id }); break; }
    case 'rally': { const bld = sel.find(x => x.d.kind === 'b'); if (bld) { UI.cmode = { t: 'rally', b: bld.id }; hint('Нажмите на карту — точка сбора'); } break; }
    case 'skill': { const h = sel.find(x => x.d.hero); if (h) useSkill(h, +arg); break; }
    case 'stop': V.send({ c: 'stop', ids: sel.map(x => x.id) }); break;
    case 'march': UI.marchMode = !UI.marchMode; break;
    case 'desel': setSel([]); break;
    case 'only': setSel(sel.filter(x => x.d.key === arg).map(x => x.id)); break;
    case 'center': { const e1 = V.get(+arg); if (e1) R.centerOn(e1.rx, e1.ry); break; }
  }
  UI.panelSig = '';
});
$('heroes').addEventListener('pointerdown', e => {
  const b = e.target.closest('.hp'); if (!b) return; e.preventDefault(); Snd.init();
  const id = +b.dataset.id; const hk = b.dataset.hk;
  if (id) { const h = V.get(id); if (h) { if (UI.sel.size === 1 && UI.sel.has(id)) R.centerOn(h.rx, h.ry); setSel([id]); Snd.play('click'); } }
  else { const f = V.ents.find(x => x.owner === V.me && x.d.sub === 'fort'); if (f) { setSel([f.id]); R.centerOn(f.rx, f.ry); toast('Наймите героя в цитадели'); } void hk; }
});

function btn(act, arg, inner, cls, extra) { return '<button class="cb ' + (cls || '') + '" data-act="' + act + '"' + (arg !== undefined ? ' data-arg="' + arg + '"' : '') + '>' + inner + (extra || '') + '</button>'; }
function updatePanel() {
  if (!V) return;
  const P = V.player(V.me); if (!P) return;
  const sel = selEnts();
  const mine = sel.filter(e => e.owner === V.me);
  const cm = UI.cmode;
  let sig = [cm ? cm.t + (cm.key || '') + (cm.k === undefined ? '' : cm.k) + (UI.ghost ? 'g' : '') : '', Math.floor(P.power || 0), (P.pcd || []).map(Math.ceil).join(','), UI.marchMode, Math.floor(P.gold / 10), P.used, P.cap, sel.map(e => e.id + ':' + Math.round(e.hp / e.maxhp * 20) + ':' + (e.lvl || 0) + ':' + Math.round((e.built || 1) * 10)).join(',')].join('|');
  const bld = mine.length === 1 && mine[0].d.kind === 'b' ? mine[0] : null;
  const hero = mine.find(e => e.d.hero);
  let q = null, hi = null;
  if (bld) { q = V.queue(bld.id); sig += q ? '|q' + q.n + ':' + Math.round(q.prog * 20) + ':' + q.ti : ''; if (bld.d.sub === 'fort') sig += '|h' + JSON.stringify(V.heroes(V.me).map(h => [h.id, h.recruited])); }
  if (hero) { hi = V.heroes(V.me).find(h => h.id === hero.id); if (hi) sig += '|s' + hi.scd.map(c => Math.ceil(c)).join(',') + hi.lvl; }
  if (sig === UI.panelSig) return;
  UI.panelSig = sig;
  let h = '';
  const race = P.race;
  if (cm && cm.t === 'recruit') {
    h += '<div class="ttl">Нанять войска</div><div class="sub">Воины выходят из ближайшего свободного здания · лимит ' + P.used + '/' + P.cap + '</div><div class="row">';
    const fort = V.ents.find(x => x.owner === V.me && x.d.sub === 'fort');
    if (fort) for (const hs of V.heroes(V.me)) { const hd = hs.d; const cost = hs.recruited ? Math.round(hd.cost * 0.5) : hd.cost; const q = V.queue(fort.id); const busy = q && q.ti === hd.ti;
      h += btn(hs.id || busy ? 'center' : 'hero2', hs.id ? hs.id : hs.hk, '<img src="' + iconFor(hd, V.me) + '" alt=""><span>' + hd.heroName + '</span><span class="c">' + (hs.id ? 'В бою' : busy ? 'Готовится' : cost) + '</span>', !hs.id && !busy && P.gold < cost ? 'off' : ''); }
    const types = []; for (const b of V.ents) if (b.owner === V.me && b.d.kind === 'b' && b.built >= 1 && b.d.trains && b.d.sub !== 'fort') for (const u of b.d.trains) if (!types.includes(u)) types.push(u);
    for (const u of types) { const ud = DEF[u]; let qn = 0; for (const b of V.ents) if (b.owner === V.me && b.d.trains && b.d.trains.includes(u)) { const q = V.queue(b.id); if (q && q.ti === ud.ti) qn += q.n; }
      h += btn('rtrain', u, '<img src="' + iconFor(ud, V.me) + '" alt=""><span>' + ud.name + '</span><span class="c">' + ud.cost + '</span>', P.gold < ud.cost || P.used + ud.pop > P.cap ? 'off' : '', qn ? '<span class="qn">' + qn + '</span>' : ''); }
    if (!types.length) h += '<span class="sub" style="align-self:center">Постройте казармы, стрельбище или конюшню</span>';
    h += btn('cancelmode', undefined, '<span class="g">✖</span>Закрыть') + '</div>';
  } else if (cm && (cm.t === 'powers' || cm.t === 'power')) {
    h += '<div class="ttl">Силы народа · ✦ ' + Math.floor(P.power) + '</div><div class="sub">Очки силы даются за победы над врагами и захват аванпостов</div><div class="row">';
    POWERS.forEach((pw, k) => {
      const [nm, ds] = POWER_NAMES[race][k]; const cd = P.pcd[k];
      h += btn('usepower', k, '<span class="g">' + pw.glyph + '</span><span>' + nm + '</span><span class="c">✦ ' + pw.cost + '</span>', (P.power < pw.cost ? 'off ' : '') + (cm.t === 'power' && cm.k === k ? 'on' : ''), cd > 0 ? '<span class="cd">' + Math.ceil(cd) + '</span>' : '');
      void ds;
    });
    h += btn('cancelmode', undefined, '<span class="g">✖</span>Закрыть') + '</div>';
  } else if (cm && (cm.t === 'buildmenu' || cm.t === 'build')) {
    if (cm.t === 'build') {
      const d = DEF[cm.key];
      h += '<div class="ttl">Строим: ' + d.name + '</div><div class="sub">Нажмите на карту рядом с базой, затем «Поставить»</div><div class="row">';
      h += btn('place', undefined, '<span class="g">✔</span>Поставить', UI.ghost && UI.ghost.ok ? 'on' : 'off');
      h += btn('cancelmode', undefined, '<span class="g">✖</span>Отмена');
      h += '</div>';
    } else {
      h += '<div class="ttl">Постройки</div><div class="sub">Фермы дают золото и лимит армии</div><div class="row">';
      for (const sub of BUILD_ORDER) {
        const d = DEF[race + '_' + sub];
        h += btn('pickbuild', sub, '<img src="' + iconFor(d, V.me) + '" alt=""><span>' + d.name + '</span><span class="c">' + d.cost + '</span>', P.gold < d.cost ? 'off' : '');
      }
      h += btn('cancelmode', undefined, '<span class="g">✖</span>Закрыть');
      h += '</div>';
    }
  } else if (bld) {
    const d = bld.d;
    h += '<div class="ttl">' + d.name + '</div><div class="sub">' + (bld.built < 1 ? 'Строится… ' + Math.round(bld.built * 100) + '%' : 'Прочность ' + Math.ceil(bld.hp) + ' / ' + Math.round(bld.maxhp) + (d.income ? ' · +' + (3).toFixed(0) + ' золота/с, +4 к лимиту' : '') + (d.shoot ? ' · стреляет по врагам' : '')) + '</div><div class="row">';
    if (bld.built >= 1 && d.trains) {
      if (d.sub === 'fort') {
        for (const hs of V.heroes(V.me)) {
          const hd = hs.d; const cost = hs.recruited ? Math.round(hd.cost * 0.5) : hd.cost;
          const busy = q && q.ti === hd.ti;
          const label = hs.id ? 'В бою' : busy ? 'Готовится' : hs.recruited ? 'Воскресить' : 'Нанять';
          h += btn(hs.id || busy ? 'center' : 'hero', hs.id ? hs.id : hs.hk, '<img src="' + iconFor(hd, V.me) + '" alt=""><span>' + hd.heroName + '</span><span class="c">' + (hs.id || busy ? label : cost) + '</span>', !hs.id && !busy && P.gold < cost ? 'off' : '', busy ? '<i class="pb" style="width:' + Math.round(q.prog * 100) + '%"></i>' : '');
        }
      } else for (const u of d.trains) {
        const ud = DEF[u];
        const inq = q && q.ti === ud.ti;
        h += btn('train', u, '<img src="' + iconFor(ud, V.me) + '" alt=""><span>' + ud.name + '</span><span class="c">' + ud.cost + '</span>', P.gold < ud.cost || P.used + ud.pop > P.cap ? 'off' : '', (inq ? '<i class="pb" style="width:' + Math.round(q.prog * 100) + '%"></i>' : '') + (q && q.n && inq ? '<span class="qn">' + q.n + '</span>' : ''));
      }
      if (q) h += btn('cancelq', undefined, '<span class="g">↶</span>Отменить<span>(' + q.n + ')</span>');
      h += btn('rally', undefined, '<span class="g">⚑</span>Точка сбора', cm && cm.t === 'rally' ? 'on' : '');
    }
    h += btn('desel', undefined, '<span class="g">✖</span>Снять');
    h += '</div>';
  } else if (mine.length) {
    const units = mine.filter(e => e.d.kind === 'u');
    if (hero && hi) {
      const d = hero.d;
      h += '<div class="ttl">' + d.name + ' · ур. ' + hi.lvl + '</div><div class="sub">Здоровье ' + Math.ceil(hero.hp) + ' / ' + Math.round(hero.maxhp) + ' · опыт ' + Math.round(hi.xp * 100) + '%' + (units.length > 1 ? ' · в отряде ' + units.length : '') + '</div><div class="row">';
      h += btn('autocast', hi.hk, '<span class="g">' + (hi.auto ? '⟳' : '☝') + '</span>' + (hi.auto ? 'Навыки: авто' : 'Навыки: вручную'), hi.auto ? 'on' : '');
    } else {
      const counts = {}; for (const u of units) counts[u.d.key] = (counts[u.d.key] || 0) + 1;
      const keys = Object.keys(counts);
      h += '<div class="ttl">' + (units.length === 1 ? units[0].d.name : 'Отряд: ' + units.length) + '</div>';
      if (units.length === 1) { const u = units[0]; h += '<div class="sub">Здоровье ' + Math.ceil(u.hp) + ' / ' + Math.round(u.maxhp) + ' · урон ' + u.d.dmg + ' · ' + (u.d.range > 60 ? 'дальний бой' : 'ближний бой') + (u.rank ? ' · ветеран ' + '★'.repeat(u.rank) : '') + '</div>'; }
      else h += '<div class="sub">Двойное касание по бойцу — выбрать всех такого типа</div>';
      h += '<div class="row">';
      if (keys.length > 1) for (const k of keys) h += btn('only', k, '<img src="' + iconFor(DEF[k], V.me) + '" alt=""><span class="c">×' + counts[k] + '</span>');
    }
    h += btn('march', undefined, '<span class="g">' + (UI.marchMode ? '➜' : '⚔') + '</span>' + (UI.marchMode ? 'Марш' : 'В атаку'), UI.marchMode ? 'on' : '');
    h += btn('hold', undefined, '<span class="g">⛨</span>Держать');
    h += btn('stop', undefined, '<span class="g">■</span>Стоп');
    h += btn('retreat', undefined, '<span class="g">↩</span>Отступить');
    h += btn('desel', undefined, '<span class="g">✖</span>Снять');
    h += '</div>';
  } else if (sel.length) {
    const e = sel[0];
    const pl = V.player(e.owner);
    h += '<div class="ttl">' + e.d.name + '</div><div class="sub">' + (pl ? pl.name + ' · ' + RACES[pl.race].short : '') + ' · здоровье ' + Math.ceil(e.hp) + '</div><div class="row">' + btn('desel', undefined, '<span class="g">✖</span>Снять') + '</div>';
  } else {
    h += '<div class="ttl">' + RACES[race].name + '</div><div class="sub">Касание — выбрать · касание по земле — идти · удержание и ведение — рамка · два пальца — зум</div><div class="row">';
    const fort = V.ents.find(x => x.owner === V.me && x.d.sub === 'fort');
    if (fort) h += btn('center', fort.id, '<img src="' + iconFor(fort.d, V.me) + '" alt=""><span>Цитадель</span>');
    h += btn('buildmenu', undefined, '<span class="g">⚒</span>Строить');
    h += '</div>';
  }
  $('panel').innerHTML = h;
}
// ---------- hero skill bar (thumb zone) ----------
let skillSig = '';
function updateSkillbar() {
  const bar = $('skillbar');
  const hero = mySel().find(e => e.d.hero);
  const hi = hero ? V.heroes(V.me).find(h => h.id === hero.id) : null;
  if (!hero || !hi) { if (!bar.hidden) { bar.hidden = true; skillSig = ''; } return; }
  const cm = UI.cmode;
  const sig = hero.id + '|' + hi.lvl + '|' + hi.auto + '|' + hi.scd.map(c => Math.ceil(c * 2)).join(',') + '|' + (cm && cm.t === 'skill' ? cm.s : '');
  bar.hidden = false;
  if (sig === skillSig) return; skillSig = sig;
  let h = '';
  hero.d.skills.forEach((sk, si) => {
    const locked = hi.lvl < sk.lvl, cd = hi.scd[si], pas = sk.type === 'aura';
    const cls = ['sk2', locked ? 'lock' : '', pas ? 'pas' : '', !locked && !pas && cd <= 0 ? 'ready' : '', cm && cm.t === 'skill' && cm.s === si ? 'on' : ''].join(' ');
    const p = sk.cd ? clamp(cd / sk.cd, 0, 1) : 0;
    h += '<button class="' + cls + '" data-sk="' + si + '" aria-label="' + sk.name + '">' + SKILL_GLYPH[sk.type] + (cd > 0 && !locked ? '<i class="cdw" style="--p:' + p.toFixed(3) + '"></i><b>' + Math.ceil(cd) + '</b>' : '') + (locked ? '<b class="lv">' + sk.lvl + '</b>' : '') + '<small>' + sk.name + '</small></button>';
  });
  h += '<button class="autob ' + (hi.auto ? 'on' : '') + '" data-auto="' + hi.hk + '">АВТО</button>';
  bar.innerHTML = h;
}
$('skillbar').addEventListener('pointerdown', e => {
  const b = e.target.closest('button'); if (!b) return; e.preventDefault(); Snd.init();
  const hero = mySel().find(x => x.d.hero); if (!hero) return;
  if (b.dataset.auto) { const hs = V.heroes(V.me).find(x => x.hk === b.dataset.auto); const on = !(hs && hs.auto); V.send({ c: 'auto', hk: b.dataset.auto, on }); toast(on ? hero.d.heroName + ' сам применяет навыки' : 'Навыки героя — вручную'); skillSig = ''; return; }
  const si = +b.dataset.sk; const sk = hero.d.skills[si];
  if (sk.type === 'aura') { toast(sk.name + ': ' + sk.desc); return; }
  if (UI.cmode && UI.cmode.t === 'skill' && UI.cmode.s === si) { UI.cmode = null; hint(''); skillSig = ''; return; }
  useSkill(hero, si); skillSig = '';
});
// ---------- quick select & control groups ----------
const QCAT = { all: e => true, inf: e => e.d.sub === 'inf' || e.d.sub === 'spear' || e.d.summon, arch: e => e.d.sub === 'arch', cav: e => e.d.sub === 'cav' };
let quickSig = '', quickLast = { k: '', t: 0 };
function updateQuick() {
  const mine = V.ents.filter(e => e.owner === V.me && e.d.kind === 'u');
  const cnt = k => mine.filter(QCAT[k]).length;
  const gcnt = g => UI.groups[g].filter(id => V.get(id)).length;
  const sig = ['all', 'inf', 'arch', 'cav'].map(cnt).join(',') + '|' + [0, 1, 2].map(gcnt).join(',');
  if (sig === quickSig) return; quickSig = sig;
  const names = { all: 'Все', inf: 'Пехота', arch: 'Стрелки', cav: 'Конница' };
  let h = '';
  for (const k of ['all', 'inf', 'arch', 'cav']) { const n = cnt(k); h += '<button data-q="' + k + '"' + (n ? '' : ' class="off"') + '>' + names[k] + ' <b>' + n + '</b></button>'; }
  h += '<span class="sep"></span>';
  for (const g of [0, 1, 2]) { const n = gcnt(g); h += '<button class="grp' + (n ? ' has' : '') + '" data-g="' + g + '" aria-label="Отряд ' + (g + 1) + '">' + (g + 1) + (n ? '<b>' + n + '</b>' : '') + '</button>'; }
  $('quick').innerHTML = h;
}
function centerOnIds(ids) { let x = 0, y = 0, n = 0; for (const id of ids) { const e = V.get(id); if (e) { x += e.rx; y += e.ry; n++; } } if (n) R.centerOn(x / n, y / n); }
let grpTimer = null, grpHeld = false;
$('quick').addEventListener('pointerdown', e => {
  const b = e.target.closest('button'); if (!b) return; e.preventDefault(); Snd.init(); Snd.play('click');
  if (b.dataset.q) {
    const ids = V.ents.filter(x => x.owner === V.me && x.d.kind === 'u' && QCAT[b.dataset.q](x)).map(x => x.id);
    const now = performance.now();
    if (quickLast.k === b.dataset.q && now - quickLast.t < 450) centerOnIds(ids);
    quickLast = { k: b.dataset.q, t: now };
    setSel(ids); return;
  }
  if (b.dataset.g !== undefined) {
    const g = +b.dataset.g; grpHeld = false;
    grpTimer = setTimeout(() => { grpHeld = true; const ids = mySel().filter(x => x.d.kind === 'u').map(x => x.id); UI.groups[g] = ids; quickSig = ''; toast(ids.length ? 'Отряд ' + (g + 1) + ' сохранён: ' + ids.length + ' бойцов' : 'Выделите войска, затем удерживайте кнопку'); if (navigator.vibrate) try { navigator.vibrate(20); } catch (er) {} }, 450);
  }
});
$('quick').addEventListener('pointerup', e => {
  const b = e.target.closest('button'); clearTimeout(grpTimer);
  if (!b || b.dataset.g === undefined || grpHeld) return;
  const g = +b.dataset.g; const ids = UI.groups[g].filter(id => V.get(id));
  if (!ids.length) { toast('Отряд ' + (g + 1) + ' пуст. Выделите войска и удерживайте кнопку, чтобы сохранить'); return; }
  const same = ids.length === UI.sel.size && ids.every(id => UI.sel.has(id));
  setSel(ids); if (same) centerOnIds(ids);
});
$('quick').addEventListener('pointercancel', () => clearTimeout(grpTimer));

let heroSig = '';
function updateTop() {
  const P = V.player(V.me); if (!P) return;
  $('gold').textContent = Math.floor(P.gold);
  $('inc').textContent = '+' + P.income.toFixed(1) + '/с';
  $('pw').textContent = '✦ ' + Math.floor(P.power || 0);
  $('bPow').classList.toggle('on', !!(UI.cmode && (UI.cmode.t === 'powers' || UI.cmode.t === 'power')));
  $('bPow').classList.toggle('ready', POWERS.some((pw, k) => P.power >= pw.cost && !(P.pcd[k] > 0)));
  const pe = $('pop'); pe.textContent = '⚔ ' + P.used + '/' + P.cap; pe.classList.toggle('full', P.used >= P.cap);
  $('clock').textContent = fmtT(V.kind === 'client' ? (V.lastSnapT / 100) : game.t);
  $('bBuild').classList.toggle('on', !!(UI.cmode && (UI.cmode.t === 'buildmenu' || UI.cmode.t === 'build')));
  const hs = V.heroes(V.me);
  let s = ''; const parts = [];
  for (const h of hs) {
    const e = h.id ? V.get(h.id) : null;
    const f = e ? clamp(e.hp / e.maxhp, 0, 1) : 0;
    parts.push(h.hk + (e ? Math.round(f * 20) : 'x') + h.lvl + h.recruited + UI.sel.has(h.id));
    s += '<div class="hp ' + (e ? '' : h.recruited ? 'dead' : 'none') + (UI.sel.has(h.id) ? ' sel' : '') + '" data-id="' + (e ? e.id : 0) + '" data-hk="' + h.hk + '"><img src="' + iconFor(h.d, V.me) + '" alt="' + h.d.heroName + '"><span class="lv">' + h.lvl + '</span>' + (e ? '' : '<span class="st">' + (h.recruited ? 'пал' : 'нанять') + '</span>') + '<div class="bar"><i style="width:' + Math.round(f * 100) + '%"></i></div></div>';
  }
  const sig = parts.join('|');
  if (sig !== heroSig) { heroSig = sig; $('heroes').innerHTML = s; }
}

// ---------- screens ----------
const setup = { race: store.get('race', 'hum'), modeN: store.get('modeN', 0), diff: store.get('diff', 1), name: store.get('name', '') };
function show(html) { const s = $('scr'); s.innerHTML = html; s.hidden = false; }
function hideScr() { $('scr').hidden = true; $('scr').innerHTML = ''; }
function heroThumbs(rk) { return HEROES[rk].map(h => '<img src="' + iconFor(DEF[rk + '_' + h.key], 0) + '" alt="' + h.name + '" title="' + h.name + '">').join(''); }
function raceCards(sel, act) {
  return '<div class="races">' + RACE_KEYS.map(rk => '<button class="race ' + (sel === rk ? 'on' : '') + '" data-a="' + act + '" data-v="' + rk + '"><b>' + RACES[rk].short + '</b><span>' + RACES[rk].name + '</span><div class="hh">' + heroThumbs(rk) + '</div><span>' + HEROES[rk].map(h => h.name).join(' · ') + '</span></button>').join('') + '</div>';
}
function menuMain() {
  mode = 'menu'; startAttract();
  show('<div class="card"><h1 class="logo">Пепельные Королевства<small>СТРАТЕГИЯ ЭПОХИ ЛЕГЕНД</small></h1>' +
    '<p class="lead">Четыре народа, восемь легендарных героев — от Короля Артура до Тора и Кощея Бессмертного. Стройте крепость, собирайте армию, прокачивайте героев и сокрушите цитадель врага.</p>' +
    '<div class="btns"><button class="big" data-a="skirm">Битва с ИИ</button><button class="big alt" data-a="online">Онлайн с друзьями</button><button class="big alt" data-a="help">Как играть и герои</button></div></div>');
}
function menuSkirm() {
  const modes = ['1 на 1', '2 на 2 (с ИИ-союзником)', 'Все против всех (4)'];
  show('<div class="card"><button class="x" data-a="main" aria-label="Назад">✖</button><h2>Битва с ИИ</h2><h3>Ваш народ</h3>' + raceCards(setup.race, 'race') +
    '<h3>Режим</h3><div class="seg">' + modes.map((m, i) => '<button data-a="modeN" data-v="' + i + '" class="' + (setup.modeN === i ? 'on' : '') + '">' + m + '</button>').join('') + '</div>' +
    '<h3>Сложность</h3><div class="seg">' + ['Лёгкий', 'Средний', 'Тяжёлый'].map((m, i) => '<button data-a="diff" data-v="' + i + '" class="' + (setup.diff === i ? 'on' : '') + '">' + m + '</button>').join('') + '</div>' +
    '<div class="btns" style="margin-top:16px"><button class="big" data-a="go">В бой!</button></div></div>');
}
function menuHelp() {
  let h = '<div class="card help"><button class="x" data-a="main" aria-label="Назад">✖</button><h2>Как играть</h2>' +
    '<p><b>Цель:</b> разрушить цитадель противника. Потеря своей цитадели — поражение.</p>' +
    '<p><b>Экономика:</b> золото идёт само. Стройте <b>фермы</b> (у каждого народа свои) — они увеличивают доход и лимит армии.</p>' +
    '<p><b>Быстрое управление:</b> кнопки внизу слева — «Все», «Пехота», «Стрелки», «Конница» (двойное касание — камера к ним). Кнопки 1–3 — отряды: выделите войска и удерживайте кнопку, чтобы сохранить; касание — выбрать. «Нанять» — найм из любого здания без поиска на карте. Двойное касание по мини-карте — отправить выделенные войска туда.</p>' +
    '<p><b>Герой:</b> выберите героя (портрет слева вверху) — справа появятся круглые кнопки навыков. «АВТО» — герой сам применяет навыки. «Держать» — бойцы стоят на месте, «Отступить» — бегут к цитадели.</p>' +
    '<p><b>Управление:</b> касание — выбрать; касание по земле — идти в атаку (бойцы бьют всех по пути); «Марш» — идти, не отвлекаясь. Касание по врагу — атаковать. Удержите палец и ведите — рамка выделения. Двойное касание по бойцу — все такие на экране. Два пальца — зум и прокрутка. Мини-карта — быстрый переход.</p>' +
    '<p><b>Аванпосты:</b> пять древних руин на карте. Встаньте рядом войсками и удержите — аванпост даст +4 золота/с и +3 к лимиту армии.</p>' +
    '<p><b>Силы народа:</b> за победы копятся очки силы ✦. Кнопка «Силы» — лечение армии, подкрепление и удар с небес.</p>' +
    '<p><b>Отряды:</b> копейщики бьют кавалерию, кавалерия — стрелков, стрелки — пехоту. Бойцы с опытом становятся ветеранами (★).</p>' +
    '<p><b>Герои</b> нанимаются в цитадели, растут до 10 уровня и открывают навыки на 1, 2, 4 и 6 уровне. Павшего героя можно воскресить за полцены.</p>' +
    '<p><b>ПК:</b> ПКМ — приказ, колесо — зум, ЛКМ с протяжкой — рамка, 1–4 — навыки героя, Q — вся армия, WASD — камера.</p>';
  for (const rk of RACE_KEYS) {
    h += '<h3>' + RACES[rk].short + ' — ' + RACES[rk].name + '</h3><p class="note">' + RACES[rk].desc + '</p>';
    for (const hd of HEROES[rk]) {
      h += '<p><b>' + hd.name + '</b>, ' + hd.title + '</p>';
      for (const sk of hd.skills) h += '<div class="sk"><i>' + SKILL_GLYPH[sk.type] + '</i><span><b>' + sk.name + '</b> (ур. ' + sk.lvl + (sk.cd ? ', ' + sk.cd + ' с' : '') + ') — ' + sk.desc + '</span></div>';
    }
  }
  show(h + '<div class="btns" style="margin-top:14px"><button class="big alt" data-a="main">Назад</button></div></div>');
}
function menuPause() {
  const online = mode === 'host' || mode === 'client';
  show('<div class="card"><h2>' + (online ? 'Меню' : 'Пауза') + '</h2><div class="btns"><button class="big" data-a="resume">Продолжить</button>' +
    '<button class="big alt" data-a="sound">Звук: ' + (Snd.on ? 'вкл' : 'выкл') + '</button>' +
    (mode === 'local' ? '<button class="big alt" data-a="speed">Скорость: ' + (speed === 1 ? 'обычная' : '×' + speed) + '</button>' : '') +
    '<button class="big alt" data-a="help2">Герои и навыки</button><button class="big alt" data-a="quit">Сдаться и выйти</button></div></div>');
}
function endScreen(win) {
  const P = V.player(V.me);
  let kills = 0, lost = 0; if (game) { kills = game.players[V.me].kills; lost = game.players[V.me].lost; }
  const t = V.kind === 'client' ? V.lastSnapT / 100 : game.t;
  show('<div class="card"><h2 class="' + (win ? 'win' : 'lose') + '" style="font-size:34px">' + (win ? 'Победа!' : 'Поражение') + '</h2><p class="lead">' + (win ? 'Цитадели врагов лежат в руинах. Барды сложат о вас песни.' : 'Ваша цитадель пала. Соберите силы и попробуйте снова.') + '</p>' +
    '<div class="stats"><div><b>' + fmtT(t) + '</b><span>длительность</span></div>' + (game ? '<div><b>' + kills + '</b><span>врагов уничтожено</span></div><div><b>' + lost + '</b><span>потери</span></div>' : '') + '<div><b>' + RACES[P ? P.race : 'hum'].short + '</b><span>ваш народ</span></div></div>' +
    '<div class="btns"><button class="big" data-a="main">В главное меню</button></div></div>');
}

// ---------- online lobby ----------
const lobby = { role: null, gid: null, slots: [], hostPeer: null, started: false };
function onlineScreen() {
  mode = 'menu';
  let h = '<div class="card"><button class="x" data-a="leaveLobby" aria-label="Назад">✖</button><h2>Онлайн с друзьями</h2>';
  if (!Net.ready) {
    h += Net.failed ? '<div class="warn">Онлайн работает, когда игра открыта по ссылке на claude.ai. Друзей нужно пригласить к этой игре (кнопка «Поделиться» → добавить по email), и они должны войти в свой аккаунт Claude. Офлайн-файл поддерживает только битву с ИИ.</div>' : '<p class="note">Подключение к комнате…</p>';
    show(h + '</div>'); return;
  }
  h += '<h3>Ваше имя</h3><input type="text" id="nick" maxlength="16" value="' + escapeHtml(setup.name) + '" placeholder="Например: Странник">';
  if (!lobby.role) {
    h += '<h3>Ваш народ</h3>' + raceCards(setup.race, 'race');
    h += '<div class="btns" style="margin-top:12px"><button class="big" data-a="host">Создать игру</button></div>';
    const open = Net.peers.filter(p => !p.sameTab && p.presence && p.presence.lob && p.presence.lob.st === 0);
    h += '<h3>Открытые игры</h3>';
    if (!open.length) h += '<p class="note">Пока нет. Попросите друга открыть эту игру и нажать «Создать игру», или создайте сами — друзья увидят её здесь.</p>';
    h += '<div class="slots">' + open.map(p => '<div class="slot"><span class="nm">' + escapeHtml(p.presence.nm || 'Игрок') + '</span><span class="note">' + (p.presence.lob.sl || []).length + '/4</span><button class="big" style="min-height:38px;font-size:15px" data-a="join" data-v="' + p.peer + '">Войти</button></div>').join('') + '</div>';
    h += '<p class="note" style="margin-top:12px">Сейчас в игре: ' + Net.peers.length + ' чел. Друзей приглашайте через «Поделиться» у этой игры на claude.ai.</p>';
  } else {
    const isHost = lobby.role === 'host';
    h += '<h3>Лобби</h3><div class="slots">';
    const sl = isHost ? lobby.slots : ((Net.peer(lobby.hostPeer) || {}).presence || {}).lob ? Net.peer(lobby.hostPeer).presence.lob.sl : [];
    (sl || []).forEach((s, i) => {
      h += '<div class="slot"><span class="dot" style="background:' + TEAM_COLORS[i] + '"></span><span class="nm">' + escapeHtml(s.nm || (s.k === 'ai' ? 'ИИ' : 'Игрок')) + (s.k === 'h' ? ' (хост)' : '') + '</span>';
      if (isHost && s.k === 'ai') h += '<select data-sl="' + i + '" data-f="race">' + RACE_KEYS.map(rk => '<option value="' + rk + '"' + (s.race === rk ? ' selected' : '') + '>' + RACES[rk].short + '</option>').join('') + '</select><select data-sl="' + i + '" data-f="diff">' + ['Лёгкий', 'Средний', 'Тяжёлый'].map((m, k) => '<option value="' + k + '"' + (s.diff === k ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>';
      else h += '<span class="note">' + RACES[s.race].short + '</span>';
      if (isHost) h += '<select data-sl="' + i + '" data-f="team">' + [0, 1, 2, 3].map(t => '<option value="' + t + '"' + (s.team === t ? ' selected' : '') + '>Команда ' + (t + 1) + '</option>').join('') + '</select>';
      else h += '<span class="note">Команда ' + (s.team + 1) + '</span>';
      if (isHost && s.k === 'ai') h += '<button class="x" style="float:none" data-a="rmslot" data-v="' + i + '">✖</button>';
      h += '</div>';
    });
    h += '</div>';
    if (!isHost) h += '<h3>Ваш народ</h3>' + raceCards(setup.race, 'race');
    if (isHost) {
      h += '<div class="btns" style="margin-top:10px">' + (lobby.slots.length < 4 ? '<button class="big alt" data-a="addai">+ Добавить ИИ</button>' : '') +
        '<button class="big" data-a="start"' + (lobby.slots.length < 2 || new Set(lobby.slots.map(s => s.team)).size < 2 ? ' disabled' : '') + '>Начать битву</button></div>';
      h += '<p class="note" style="margin-top:8px">Друзья, открывшие игру, увидят ваше лобби в «Открытых играх». Нужно минимум две команды.</p>';
    } else h += '<p class="note" style="margin-top:10px">Ждём, пока хост начнёт битву…</p>';
  }
  show(h + '</div>');
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hostSync() {
  if (lobby.role !== 'host' || lobby.started) return;
  const me = Net.mePeer();
  // update guests
  const guests = Net.peers.filter(p => !p.sameTab && p.presence && p.presence.join === lobby.gid);
  lobby.slots = lobby.slots.filter(s => s.k !== 'p' || guests.some(g => g.peer === s.peer));
  for (const g of guests) {
    let s = lobby.slots.find(x => x.peer === g.peer);
    if (!s && lobby.slots.length < 4) { s = { k: 'p', peer: g.peer, team: lobby.slots.length % 2, race: 'hum' }; lobby.slots.push(s); }
    if (s) { s.race = RACE_KEYS.includes(g.presence.race) ? g.presence.race : 'hum'; s.nm = String(g.presence.nm || 'Игрок').slice(0, 16); }
  }
  const h = lobby.slots[0]; h.peer = me; h.race = setup.race; h.nm = setup.name || 'Хост';
  Net.set({ nm: setup.name || 'Хост', lob: { gid: lobby.gid, st: 0, sl: lobby.slots } });
}
let lobbyRenderT = 0;
Net.onPeers(() => {
  if (lobby.role === 'host' && !lobby.started) hostSync();
  if (lobby.role === 'guest' && !lobby.started) {
    const hp = Net.peer(lobby.hostPeer);
    if (!hp) { lobby.role = null; toast('Хост закрыл лобби'); }
    else if (hp.presence.lob && hp.presence.lob.st === 1) {
      const lob = hp.presence.lob; const me = Net.mePeer();
      const idx = (lob.sl || []).findIndex(s => s.peer === me);
      if (idx >= 0) startClient(lob, idx); else { lobby.role = null; toast('Игра началась без вас'); }
    }
  }
  if (mode === 'menu' && $('scr').querySelector('#nick') || (mode === 'menu' && lobby.role)) {
    const now = performance.now(); if (now - lobbyRenderT > 300 && document.activeElement && document.activeElement.id !== 'nick') { lobbyRenderT = now; onlineScreen(); }
  }
  if (mode === 'host') hostPeersChanged();
  if (mode === 'client') clientPeersChanged();
});

// ---------- game start ----------
let speed = 1, paused = false;
function beginView() {
  hideScr(); stopAttract();
  $('top').hidden = false; $('bottom').hidden = false; $('heroes').hidden = false; $('quick').hidden = false; UI.groups = [[], [], []]; quickSig = ''; skillSig = '';
  requestAnimationFrame(measurePads); tipsIdx = store.get('tipsDone', false) || mode !== 'local' ? 99 : 0;
  UI.sel = new Set(); UI.cmode = null; UI.ghost = null; UI.panelSig = ''; heroSig = ''; prevIds = new Map();
  R.resize();
  const me = V.player(V.me); void me;
  R.cam.z = R.w < 700 ? 0.75 : 1;
  const st = START_POS[V.me]; R.centerOn(st[0], st[1]);
  Snd.play('horn');
  endShown = false;
}
function startLocal() {
  const n = [2, 4, 4][setup.modeN];
  const others = RACE_KEYS.filter(r => r !== setup.race);
  const rr = mkRng(Date.now() & 0xffff);
  const players = [{ race: setup.race, team: 0, name: 'Вы' }];
  for (let i = 1; i < n; i++) players.push({ race: others[Math.floor(rr() * others.length)], team: setup.modeN === 1 ? (i === 2 ? 0 : 1) : setup.modeN === 0 ? 1 : i, ai: true, diff: setup.diff, name: 'ИИ ' + i });
  if (setup.modeN === 1) { players[2].name = 'Союзник'; players[2].diff = 1; }
  game = new Game({ seed: (Date.now() % 100000) + 1, players });
  ais = game.players.filter(p => p.ai).map(p => new AI(game, p.i));
  R.setWorld(game.seed);
  V = makeLocalView(game, 0); mode = 'local'; paused = false; speed = 1;
  beginView();
}
function startHost() {
  const slots = lobby.slots;
  lobby.started = true;
  const seed = (Date.now() % 100000) + 1;
  const players = slots.map((s, i) => ({ race: s.race, team: s.team, ai: s.k === 'ai', diff: s.diff === undefined ? 1 : s.diff, remote: s.k === 'p', peer: s.peer, name: s.nm || (s.k === 'ai' ? 'ИИ ' + i : 'Игрок') }));
  game = new Game({ seed, players, online: true });
  if (players.length > 2) game.popMax = 22;
  ais = game.players.filter(p => p.ai).map(p => new AI(game, p.i));
  R.setWorld(seed);
  V = makeLocalView(game, 0); mode = 'host'; paused = false; speed = 1;
  hostSeq = {};
  Net.set({ lob: { gid: lobby.gid, st: 1, seed, sl: slots.map(s => ({ k: s.k, peer: s.peer, race: s.race, team: s.team, nm: s.nm })) } });
  beginView();
}
function startClient(lob, idx) {
  lobby.started = true;
  const players = lob.sl.map((s, i) => ({ race: s.race, team: s.team, name: s.nm || ('Игрок ' + (i + 1)) }));
  game = null; ais = [];
  R.setWorld(lob.seed);
  V = makeClientView(idx, players); mode = 'client';
  beginView();
}
let hostSeq = {}, snapT = 0;
function hostPeersChanged() {
  if (!game) return;
  for (const p of game.players) {
    if (!p.remote) continue;
    const peer = Net.peer(p.peer);
    if (!peer) { p.remote = false; p.ai = true; p.diff = 1; ais.push(new AI(game, p.i)); for (const q of game.players) game.note(q.i, p.name + ' отключился — его заменил ИИ'); toast(p.name + ' отключился — его заменил ИИ'); continue; }
    const cmd = peer.presence && peer.presence.cmd;
    if (cmd && Array.isArray(cmd.l)) {
      const last = hostSeq[p.peer] || 0; let mx = last;
      for (const it of cmd.l) { if (!Array.isArray(it)) continue; const [s, c] = it; if (typeof s === 'number' && s > last && c && typeof c === 'object') { game.cmd(p.i, c); if (s > mx) mx = s; } }
      hostSeq[p.peer] = mx;
    }
  }
}
function clientPeersChanged() {
  const hp = Net.peer(lobby.hostPeer);
  if (!hp) { if (!endShown) { endShown = true; show('<div class="card"><h2>Хост покинул игру</h2><p class="lead">Связь с хостом потеряна.</p><div class="btns"><button class="big" data-a="main">В главное меню</button></div></div>'); } return; }
  if (hp.presence && hp.presence.snap) V.ingest(hp.presence.snap, performance.now() / 1000);
}

// ---------- screen clicks ----------
$('scr').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  Snd.init(); Snd.play('click');
  const a = b.dataset.a, v = b.dataset.v;
  const nick = $('nick'); if (nick) { setup.name = nick.value.trim().slice(0, 16); store.set('name', setup.name); }
  switch (a) {
    case 'main': leaveGame(); menuMain(); break;
    case 'skirm': menuSkirm(); break;
    case 'help': menuHelp(); break;
    case 'help2': { const back = mode; menuHelp(); const card = $('scr').querySelector('.card'); card.querySelectorAll('[data-a="main"]').forEach(x => { x.dataset.a = 'resume'; }); void back; break; }
    case 'online': onlineScreen(); break;
    case 'race': setup.race = v; store.set('race', v); if (lobby.role === 'guest') Net.set({ race: v }); if (lobby.role === 'host') hostSync(); if (mode === 'menu' && (lobby.role || $('nick'))) onlineScreen(); else menuSkirm(); break;
    case 'modeN': setup.modeN = +v; store.set('modeN', +v); menuSkirm(); break;
    case 'diff': setup.diff = +v; store.set('diff', +v); menuSkirm(); break;
    case 'go': startLocal(); break;
    case 'host': lobby.role = 'host'; lobby.gid = Math.random().toString(36).slice(2, 8); lobby.slots = [{ k: 'h', race: setup.race, team: 0, nm: setup.name || 'Хост' }]; lobby.started = false; hostSync(); onlineScreen(); break;
    case 'join': lobby.role = 'guest'; lobby.hostPeer = v; lobby.started = false; { const hp = Net.peer(v); lobby.gid = hp && hp.presence.lob ? hp.presence.lob.gid : null; } Net.set({ nm: setup.name || 'Гость', join: lobby.gid, race: setup.race, lob: null, cmd: null, snap: null }); onlineScreen(); break;
    case 'leaveLobby': lobby.role = null; lobby.started = false; Net.set({ lob: null, join: null }); menuMain(); break;
    case 'addai': if (lobby.slots.length < 4) { lobby.slots.push({ k: 'ai', race: RACE_KEYS[lobby.slots.length % 4], team: lobby.slots.length % 2, diff: 1, nm: 'ИИ' }); hostSync(); onlineScreen(); } break;
    case 'rmslot': lobby.slots.splice(+v, 1); hostSync(); onlineScreen(); break;
    case 'start': startHost(); break;
    case 'resume': hideScr(); paused = false; break;
    case 'sound': Snd.on = !Snd.on; store.set('snd', Snd.on); if (Snd.on) Snd.init(); menuPause(); break;
    case 'speed': speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; menuPause(); break;
    case 'quit': if (V && (mode === 'local' || mode === 'host')) game.cmd(V.me, { c: 'surrender' }); else if (mode === 'client') V.send({ c: 'surrender' }); setTimeout(() => { leaveGame(); menuMain(); }, mode === 'client' ? 400 : 0); break;
  }
});
$('scr').addEventListener('change', e => {
  const s = e.target; if (!s.dataset || s.dataset.sl === undefined) return;
  const sl = lobby.slots[+s.dataset.sl]; if (!sl) return;
  const f = s.dataset.f; sl[f] = f === 'race' ? s.value : +s.value; hostSync();
});
$('scr').addEventListener('input', e => { if (e.target.id === 'nick') { setup.name = e.target.value.trim().slice(0, 16); store.set('name', setup.name); if (lobby.role === 'host') hostSync(); else if (Net.ready) Net.set({ nm: setup.name }); } });
$('bMenu').addEventListener('click', () => { Snd.init(); if (mode === 'local') paused = true; menuPause(); });
function leaveGame() {
  if (mode === 'host' || mode === 'client' || lobby.role) Net.set({ lob: null, join: null, snap: null, cmd: null });
  lobby.role = null; lobby.started = false;
  game = null; ais = []; V = null; mode = 'menu';
  $('top').hidden = true; $('bottom').hidden = true; $('heroes').hidden = true; $('quick').hidden = true; $('skillbar').hidden = true; hint('');
}

// ---------- attract mode (AI battle behind menus) ----------
function startAttract() {
  if (attract) return;
  const g = new Game({ seed: 4242, players: RACE_KEYS.map((r, i) => ({ race: r, team: i, ai: true, diff: 2 })) });
  const as = g.players.map(p => new AI(g, p.i));
  for (let k = 0; k < 20 * 120; k++) { for (const a of as) a.step(TICK); for (const e of g.ents) { e.px = e.x; e.py = e.y; } g.step(TICK); }
  attract = { g, as, view: makeLocalView(g, -1), acc: 0 };
  R.setWorld(4242); R.resize(); R.cam.z = R.w < 700 ? 0.8 : 1.05; R.centerOn(MAP_W / 2, MAP_H / 2);
}
function stopAttract() { attract = null; }

// ---------- corpses / fx sounds ----------
let prevIds = new Map(), lastFxSeen = 0, endShown = false;
function trackDeaths() {
  const cur = new Map();
  for (const e of V.ents) cur.set(e.id, e);
  for (const [id, e] of prevIds) if (!cur.has(id)) { R.corpses.push({ x: e.rx, y: e.ry, r: e.r, b: e.d.kind === 'b', t: V.time }); if (e.d.kind === 'b' || e.d.hero) { R.shake = Math.max(R.shake, e.d.sub === 'fort' ? 1 : 0.4); if (inScreen(e)) Snd.play('boom'); } UI.sel.delete(id); }
  prevIds = cur;
}
function fxSounds() {
  for (const f of V.fx) {
    if (f.id <= lastFxSeen && V.kind === 'local') continue;
    if (V.kind === 'client' && f.snd) continue;
    f.snd = 1;
    if (f.id > lastFxSeen) lastFxSeen = f.id;
    const s = R.toScreen(f.x2 !== undefined ? f.x2 : f.x, f.y2 !== undefined ? f.y2 : f.y);
    if (s.x < -50 || s.y < -50 || s.x > R.w + 50 || s.y > R.h + 50) continue;
    if (f.k === 'arrow' || f.k === 'bolt' || f.k === 'javelin') Snd.play('arrow', 0.5);
    else if (f.k === 'boom') { Snd.play('boom'); R.shake = Math.max(R.shake, 0.35); }
    else if (f.k === 'heal' || f.k === 'buff') Snd.play('heal');
    else if (f.k === 'lvl') Snd.play('lvl');
  }
}

// ---------- first-game tips ----------
let tipsIdx = 99;
const TIPS = [
  { t: 1.5, text: 'Совет: нажмите «Строить» → ферма. Фермы дают золото и лимит армии.', done: () => V.ents.some(e => e.owner === V.me && e.d.sub === 'farm') },
  { t: 18, text: 'Совет: постройте казармы и нанимайте воинов, нажав на здание.', done: () => V.ents.some(e => e.owner === V.me && e.d.sub === 'barr') },
  { t: 45, text: 'Совет: наймите героя — нажмите на портрет слева вверху или на цитадель.', done: () => V.heroes(V.me).some(h => h.recruited) },
  { t: 80, text: 'Совет: флаги на карте — аванпосты. Приведите туда войска, чтобы захватить.', done: () => (V.outposts || []).some(o => o.owner === V.me) },
  { t: 140, text: 'Совет: копите очки силы ✦ и используйте кнопку «Силы» в бою.', done: () => false },
];
function runTips() {
  if (tipsIdx >= TIPS.length || !game) return;
  const tp = TIPS[tipsIdx];
  if (game.t >= tp.t) { if (!tp.done()) toast(tp.text); tipsIdx++; if (tipsIdx >= TIPS.length) store.set('tipsDone', true); }
}

// ---------- main loop ----------
let last = performance.now(), acc = 0, uiT = 0, noteIdx = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  try {
    if (mode === 'menu') {
      if (attract) {
        const g = attract.g; attract.acc += dt;
        while (attract.acc >= TICK) { for (const a of attract.as) a.step(TICK); for (const e of g.ents) { e.px = e.x; e.py = e.y; } g.step(TICK); attract.acc -= TICK; }
        if (g.over !== -1) { attract = null; startAttract(); return; }
        attract.view.prep(attract.acc / TICK);
        R.cam.x += dt * 12; if (R.cam.x > MAP_W - R.w / R.cam.z) R.cam.x = 0; R.clampCam();
        R.draw({ ents: g.ents, fx: g.fx, me: -1, sel: new Set(), time: attract.view.time, outposts: g.outposts });
      }
      return;
    }
    if (!V) return;
    // keyboard pan
    const kp = 600 * dt / R.cam.z;
    if (keys.has('w') || keys.has('arrowup')) R.cam.y -= kp; if (keys.has('s') || keys.has('arrowdown')) R.cam.y += kp;
    if (keys.has('a') || keys.has('arrowleft')) R.cam.x -= kp; if (keys.has('d') || keys.has('arrowright')) R.cam.x += kp;
    R.clampCam();
    let alpha = 1;
    if (mode === 'local' || mode === 'host') {
      if (!paused || mode === 'host') {
        acc += dt * speed;
        let n = 0;
        while (acc >= TICK && n < 12) { for (const a of ais) a.step(TICK); for (const e of game.ents) { e.px = e.x; e.py = e.y; } game.step(TICK); acc -= TICK; n++; }
        if (n >= 12) acc = 0;
      }
      alpha = clamp(acc / TICK, 0, 1);
      if (mode === 'host') { snapT -= dt; if (snapT <= 0) { snapT = 0.1; Net.set({ snap: packSnap(game) }); } }
      // local notes
      while (noteIdx < game.notes.length) { const n = game.notes[noteIdx++]; if (n.p === V.me && game.t - n.t < 2) toast(n.text, n.x, n.y); }
      if (noteIdx > game.notes.length) noteIdx = game.notes.length;
    }
    V.prep(alpha);
    if (game && game.notes.length >= 30 && noteIdx >= 30) noteIdx = game.notes.length - 1;
    trackDeaths(); fxSounds();
    // ghost/skill range
    const S = { ents: V.ents, fx: V.fx, me: V.me, sel: UI.sel, time: V.time, ghost: UI.ghost, outposts: V.outposts };
    R.draw(S);
    drawOverlay(now / 1000);
    uiT -= dt;
    if (uiT <= 0) { uiT = 0.15; updateTop(); updatePanel(); updateSkillbar(); updateQuick(); V.alerts = UI.alerts; R.drawMini(mini, V); runTips(); if (Math.random() < 0.05) measurePads(); }
    if (V.over !== -1 && V.over !== undefined && !endShown) {
      endShown = true;
      const myTeam = V.teamOf(V.me);
      setTimeout(() => endScreen(V.over === myTeam), 1200);
    }
  } catch (err) { console.error(err); if (!window.__errShown) { window.__errShown = 1; toast('Ошибка: ' + err.message); } }
}
function drawOverlay(now) {
  const c = R.c, cam = R.cam, dpr = R.dpr;
  c.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, -cam.x * cam.z * dpr, -cam.y * cam.z * dpr);
  if (UI.targetMark) { const tm = UI.targetMark, e = V.get(tm.id), a = now - tm.t; if (!e || a > 1.6) UI.targetMark = null; else { const rr = e.r * (1.5 + 0.25 * Math.sin(a * 12)); ell(c, e.rx, e.ry, rr, rr * 0.5, 'rgba(255,60,40,0.12)', 'rgba(255,70,50,' + (1 - a / 1.6) + ')', 2.5); for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2 + a * 2; line(c, e.rx + Math.cos(an) * rr * 1.25, e.ry + Math.sin(an) * rr * 0.62, e.rx + Math.cos(an) * rr * 0.85, e.ry + Math.sin(an) * rr * 0.42, 'rgba(255,90,60,0.9)', 2); } } }
  UI.pings = UI.pings.filter(p => now - p.t < 0.6);
  for (const p of UI.pings) { const a = (now - p.t) / 0.6; ell(c, p.x, p.y, 8 + a * 16, (8 + a * 16) * 0.5, null, p.col, 2.5 * (1 - a) + 0.5); }
  if (UI.cmode && UI.cmode.t === 'power' && hoverW) ell(c, hoverW.x, hoverW.y, UI.cmode.radius, UI.cmode.radius * 0.55, 'rgba(255,120,60,0.15)', '#ffb35a', 2);
  if (UI.cmode && UI.cmode.t === 'skill') {
    const h = V.get(UI.cmode.h);
    if (h) ell(c, h.rx, h.ry, UI.cmode.range, UI.cmode.range * 0.55, 'rgba(255,200,100,0.06)', 'rgba(255,200,100,0.6)', 1.5);
    if (hoverW) ell(c, hoverW.x, hoverW.y, UI.cmode.radius, UI.cmode.radius * 0.55, 'rgba(255,120,60,0.15)', '#ffb35a', 2);
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (boxRect) { c.fillStyle = 'rgba(246,226,122,0.12)'; c.strokeStyle = '#f6e27a'; c.lineWidth = 1.5; const x = Math.min(boxRect.x0, boxRect.x1), y = Math.min(boxRect.y0, boxRect.y1), w = Math.abs(boxRect.x1 - boxRect.x0), h = Math.abs(boxRect.y1 - boxRect.y0); c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); }
}
function measurePads() { const b = $('bottom'), t = $('top'); R.padB = b.hidden ? 0 : b.offsetHeight; document.documentElement.style.setProperty('--bh', R.padB + 'px'); R.padT = t.hidden ? 0 : t.offsetTop + t.offsetHeight; }
window.addEventListener('resize', () => { R.resize(); measurePads(); UI.panelSig = ''; });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'local') { paused = true; menuPause(); } });

// ---------- boot ----------
R.resize();
menuMain();
requestAnimationFrame(frame);
Net.init().then(() => { if (mode === 'menu' && $('scr').innerHTML.includes('Онлайн с друзьями</h2>')) onlineScreen(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { UI.panelSig = ''; });
window.__AK = { get game() { return game; }, get V() { return V; }, R, UI, Net, startLocal, setup, get mode() { return mode; } };
