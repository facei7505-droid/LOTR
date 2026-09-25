// ================= MAIN: views, input, HUD, menus, lobby, loop =================
const $ = id => document.getElementById(id);
const cv = $('cv'), mini = $('mini');
const store = { get(k, d) { try { const v = localStorage.getItem('ak_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('ak_' + k, JSON.stringify(v)); } catch (e) {} } };
// real-time 3D (three.js, WebGL) when available; the 2D canvas renderer stays as the fallback
const R = (() => {
  if (store.get('gfx', '3d') === '3d' && hasWebGL()) { try { return new Renderer3D(cv, $('gl')); } catch (e) { console.warn('3D renderer failed, using 2D', e); } }
  $('gl').hidden = true; return new Renderer(cv);
})();

// ---------- sound (audio.js) ----------
MQ.room = store.get('room', 'public');
Snd.on = store.get('snd', true); Snd.musicOn = store.get('music', true);
R.onThunder = () => Snd.play('thunder', 0.9);
const upBits = up => Object.keys(up || {}).reduce((m, k) => m | (UP_BIT[k] || 0), 0);

// ---------- views ----------
let V = null;        // active view
let game = null, ais = [], mode = 'menu'; // menu | local | host | client
let attract = null;

function makeLocalView(g, me) {
  const v = {
    kind: 'local', me, g, time: 0, fx: g.fx, over: -1,
    ents: g.ents,
    get(id) { const e = g.byId.get(id); return e && !e.dead ? e : null; },
    player(i) { const p = g.players[i]; if (!p) return null; const pi = g.popInfo(i); return { gold: p.gold, used: pi.used, cap: pi.cap, alive: p.alive, income: g.income(p), race: p.race, team: p.team, name: p.name, pts: p.pts, plvl: p.plvl, pxpF: (p.pxp - (p.plvl > 1 ? powerNeed(p.plvl - 1) : 0)) / (powerNeed(p.plvl) - (p.plvl > 1 ? powerNeed(p.plvl - 1) : 0)), spells: p.spells, scd: p.scd, up: p.up }; },
    heroes(pi) { const p = g.players[pi]; return ['h1', 'h2'].map(hk => { const s = p.heroes[hk]; const h = s.id ? g.byId.get(s.id) : null; return { hk, id: h ? h.id : 0, lvl: h ? h.lvl : (s.lvl || 1), xp: h ? h.xp / (150 * h.lvl) : 0, recruited: s.recruited, auto: !!s.auto, scd: h ? h.scd.slice() : [0, 0, 0, 0], d: DEF[p.race + '_' + hk] }; }); },
    sqInfo(id) { const s = g.squads.get(id); return s ? { lvl: s.lvl || 1, xp: g.sqXpF(s) / 99, cd: Math.max(0, s.flagCd || 0) } : null; },
    queue(bid) { const b = g.byId.get(bid); if (!b || !b.queue.length) return null; const q = b.queue[0]; if (q.up) return { n: b.queue.length, prog: q.t / UPG[q.up].time, ti: -1, up: q.up, items: [] }; return { n: b.queue.length, prog: q.t / DEF[q.u].time, ti: DEF[q.u].ti, items: b.queue.map(x => x.u) }; },
    send(c) { g.cmd(me, c); },
    canPlace(key, x, y) { return g.canPlace(me, key, x, y); },
    teamOf(i) { return g.players[i] ? g.players[i].team : -1; },
    nplayers: g.players.length,
    prep(alpha) {
      this.time = g.t + alpha * TICK; this.fx = g.fx; this.ents = g.ents; this.over = g.over; this.outposts = g.outposts; this.relic = g.relic; this.gameT = g.t; this.ups = g.players.map(p => upBits(p.up));
      const sqb = new Map(); for (const s of g.squads.values()) if (s.eq) sqb.set(s.id, upBits(s.eq));
      for (const e of g.ents) { e.rx = e.px + (e.x - e.px) * alpha; e.ry = e.py + (e.y - e.py) * alpha; e.atkT = e.atk; e.stunned = e.stun > 0; e.buffGlow = e.buffs.length > 0; e.eqv = e.sq ? sqb.get(e.sq) || 0 : 0; }
    },
  };
  return v;
}

function makeClientView(me, players, seed, mapType) {
  const ents = new Map();
  const v = {
    kind: 'client', me, time: 0, fx: [], over: -1, ents: [], ups: [], outposts: makeMap(seed, mapType).outposts.map(([x, y]) => ({ x, y, owner: -1, prog: 0, cap: -1 })), players, pl: [], hs: [], qs: new Map(), lastSnapT: -1, fxSeen: new Set(), interval: 0.1, lastRecv: 0, notesSeen: new Set(),
    seq: 0, outbox: [],
    get(id) { return ents.get(id) || null; },
    player(i) { const p = this.pl[i]; const P = players[i]; if (!p || !P) return null; return { gold: p[0], used: p[1], cap: p[2], alive: !!p[3], income: p[4] / 10, race: P.race, team: P.team, name: P.name, pts: p[5] | 0, pxpF: (p[6] | 0) / 99, plvl: p[7] | 0, up: Object.fromEntries(Object.keys(UP_BIT).filter(k => (p[8] | 0) & UP_BIT[k]).map(k => [k, 1])), spells: Object.fromEntries(SPELL_ORDER.filter((k, i) => (p[9] | 0) & (1 << i)).map(k => [k, 1])), scd: Object.fromEntries(SPELL_ORDER.map((k, i) => [k, p[10 + i] | 0])) }; },
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
    sqInfo(id) { const i = this.sqi && this.sqi.get(id), m = this.ents.find(e => e.sq === id); return { lvl: m ? m.lvl || 1 : 1, xp: i ? i.xp : 0, cd: i ? i.cd : 0 }; },
    queue(bid) { const q = this.qs.get(bid); if (!q) return null; return q[2] >= 100 ? { n: q[0], prog: q[1] / 99, ti: -1, up: UPGRADES[q[2] - 100].k, items: [] } : { n: q[0], prog: q[1] / 99, ti: q[2], items: [] }; },
    send(c) { this.seq++; this.outbox.push([this.seq, c]); if (this.outbox.length > 12) this.outbox.shift(); Net.set({ cmd: { l: this.outbox } }); },
    canPlace(key, x, y) { return Game.prototype.canPlace.call({ map: makeMap(seed, mapType), ents: this.ents, enemy: (a, b) => a !== b && players[a] && players[b] && players[a].team !== players[b].team }, me, key, x, y); },
    teamOf(i) { return players[i] ? players[i].team : -1; },
    nplayers: players.length,
    ingest(sn, now) {
      if (!sn || sn.t === this.lastSnapT) return;
      if (this.lastRecv) this.interval = clamp(now - this.lastRecv, 0.05, 0.4) * 0.3 + this.interval * 0.7;
      this.lastRecv = now; this.lastSnapT = sn.t;
      const list = unpackEnts(sn.u || '');
      const seen = new Set(), se = new Map(); this.sqi = new Map(); for (let k = 0; k + 3 < (sn.se || []).length; k += 4) { se.set(sn.se[k], sn.se[k + 1]); this.sqi.set(sn.se[k], { cd: sn.se[k + 2], xp: sn.se[k + 3] / 99 }); }
      for (const s of list) {
        const d = TYPES[s.ti]; if (!d) continue;
        seen.add(s.id);
        let e = ents.get(s.id);
        if (!e) { e = { id: s.id, d, r: d.r, owner: s.owner, x: s.x, y: s.y, rx: s.x, ry: s.y, fx0: s.x, fy0: s.y, maxhp: d.hp, hp: d.hp, face: 1, lvl: 1, rank: 0 }; ents.set(s.id, e); }
        e.sq = s.sq || 0; e.eqv = e.sq ? se.get(e.sq) || 0 : 0;
        e.fx0 = e.rx; e.fy0 = e.ry; e.x = s.x; e.y = s.y; e.t0 = now;
        e.hp = s.hp * e.maxhp;
        if (d.kind === 'b') { e.built = s.ex / 99; }
        else { e.built = 1; e.atkT = (s.ex & 1) ? 0.3 : 0; e.moving = !!(s.ex & 2); e.hd = (((s.ex >> 2) & 1) | (((s.ex >> 10) & 3) << 1)) * Math.PI / 4; e.face = Math.cos(e.hd) < -0.01 ? -1 : 1; e.stunned = !!(s.ex & 8); const lv = (s.ex >> 6) & 15; e.leader = e.sq ? (s.ex & 16 ? 1 : 0) : 0; e.rank = e.sq ? Math.max(0, lv - 1) : (s.ex >> 4) & 3; if (d.hero && lv > e.lvl && e.lvl) { /* level up */ } e.lvl = lv || 1; }
      }
      for (const id of [...ents.keys()]) if (!seen.has(id)) ents.delete(id);
      this.ents = [...ents.values()];
      this.relic = sn.rl ? { x: sn.rl[0], y: sn.rl[1], prog: sn.rl[2] / 99, cap: sn.rl[3], contested: !!sn.rl[4] } : null;
      this.pl = sn.pl || []; this.hs = sn.hs || []; this.ups = this.pl.map(p => p[8] | 0); this.gameT = sn.t / 100;
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
function sqIds(e) { if (!e || !e.sq) return e ? [e.id] : []; const out = []; for (const o of V.ents) if (o.sq === e.sq) out.push(o.id); return out; }
function expandSq(ids) {
  const sqs = new Set(), out = new Set(ids);
  for (const id of ids) { const e = V.get(id); if (e && e.sq && e.owner === V.me) sqs.add(e.sq); }
  if (sqs.size) for (const o of V.ents) if (o.sq && sqs.has(o.sq)) out.add(o.id);
  return [...out];
}
// compact command payload: battalions by id, single units (heroes, spirits) by entity id
function selCmd() { const ids = [], s = new Set(); for (const e of mySel()) { if (e.d.kind !== 'u') continue; if (e.sq) s.add(e.sq); else ids.push(e.id); } return { ids, s: [...s] }; }
function selSquads() { const m = new Map(); for (const e of mySel()) if (e.sq) { let q = m.get(e.sq); if (!q) { q = { id: e.sq, d: e.d, mem: [], rank: e.rank || 0, eqv: e.eqv | 0 }; m.set(e.sq, q); } q.mem.push(e); } return [...m.values()]; }
function selEnts() { const out = []; for (const id of UI.sel) { const e = V.get(id); if (e) out.push(e); } return out; }
function mySel() { return selEnts().filter(e => e.owner === V.me); }
function setSel(ids) { UI.sel = new Set(ids); UI.cmode = null; UI.ghost = null; UI.panelSig = ''; ringSig = ''; UI.buildOpen = ids.length > 0 && ids.every(id => { const e = V.get(id); return e && e.d.worker; }); }
function iconFor(d, owner) {
  const key = 'ic' + d.key + owner; if (SPR.has(key)) return SPR.get(key);
  const c = mkCanvas(64, 64), x = c.getContext('2d');
  if (d.kind === 'b') { const spr = bld3(d, TEAM_COLORS[owner], true); const s = Math.min(64 / spr.w, 64 / spr.h); x.drawImage(spr.cv, 32 - spr.w * s / 2, 64 - spr.h * s, spr.w * s, spr.h * s); }
  else x.drawImage(icon3(d, TEAM_COLORS[owner] || '#888'), 0, 0, 64, 64);
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
function pick(sx, sy, touch) {
  let best = null, bd = 1e9; const tol = touch ? 28 : 10;
  for (const e of V.ents) {
    let d;
    const k = R.pxAt(e.rx, e.ry);
    if (e.d.kind === 'b') { const c = R.proj(e.rx, e.ry, e.r * (R.is3D ? 1 : 0.5)); d = Math.hypot(sx - c.x, (sy - c.y) * 1.1) - e.r * 1.05 * k; }
    else { const c = R.proj(e.rx, e.ry, (e.d.hero ? 22 : e.d.sub === 'cav' ? 18 : 12) * (R.is3D ? 1.3 : 1)); d = Math.hypot(sx - c.x, (sy - c.y) * 0.8) - (e.r + (e.sq ? 3 : 6)) * k; }
    if (d < tol && d < bd) { bd = d; best = e; }
  }
  return best;
}
function issueAt(wx, wy, target) {
  const mine = mySel().filter(e => e.d.kind === 'u');
  if (!mine.length) return false;
  if (target && V.teamOf(target.owner) !== V.teamOf(V.me)) { V.send(Object.assign({ c: 'atk', t: target.id }, selCmd())); UI.targetMark = { id: target.id, t: performance.now() / 1000 }; }
  else { V.send(Object.assign({ c: 'move', x: wx, y: wy, a: UI.marchMode ? 0 : 1 }, selCmd())); pingAt(wx, wy, UI.marchMode ? '#8fd0ff' : '#f6e27a'); UI.moveMark = { x: wx, y: wy, t: performance.now() / 1000, n: selSquads().length }; }
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
    if (cm.t === 'power') { V.send({ c: 'power', k: cm.k, x: w.x, y: w.y }); pingAt(w.x, w.y, '#ffb35a'); UI.cmode = null; hint(''); UI.panelSig = ''; spellSig = ''; Snd.play('horn'); return; }
    if (cm.t === 'repair') { const b = pick(sx, sy, touch); if (b && b.owner === V.me && b.d.kind === 'b') { V.send({ c: 'work', t: b.id, ids: cm.ids }); toast('Строитель идёт чинить: ' + b.d.name); UI.cmode = null; hint(''); } else hint('Нажмите на своё здание'); return; }
    if (cm.t === 'rally') { V.send({ c: 'rally', b: cm.b, x: w.x, y: w.y }); const b = V.get(cm.b); if (b) b.rally = { x: w.x, y: w.y }; UI.cmode = null; hint(''); UI.panelSig = ''; pingAt(w.x, w.y, '#f6e27a'); return; }
  }
  const e = pick(sx, sy, touch);
  const now = performance.now();
  const selW = mySel().filter(u => u.d.kind === 'u');
  if (e && e.owner === V.me && e.d.kind === 'b' && selW.length && selW.every(u => u.d.worker) && (e.built < 1 || e.hp < e.maxhp - 1)) { V.send({ c: 'work', t: e.id, ids: selW.map(u => u.id) }); toast(e.built < 1 ? 'Строители продолжают стройку' : 'Строители чинят здание'); Snd.play('build'); return; }
  if (e && e.owner === V.me) {
    const hasUnits = mySel().some(u => u.d.kind === 'u');
    if (e.d.kind === 'u' && now - UI.lastTap.t < 380 && UI.lastTap.id === e.id) {
      // double tap: all of same type on screen
      const ids = V.ents.filter(o => o.owner === V.me && o.d === e.d && inScreen(o)).map(o => o.id); setSel(expandSq(ids));
      if (e.sq) toast('Выбраны все батальоны «' + e.d.name + '» на экране');
    } else setSel(sqIds(e));
    UI.lastTap = { t: now, id: e.id }; Snd.play('click');
    void hasUnits; return;
  }
  if (e && issueAt(w.x, w.y, e)) return;
  if (e) { setSel(e.sq ? sqIds(e) : [e.id]); return; }
  if (issueAt(w.x, w.y, null)) return;
  setSel([]);
}
function inScreen(e) { const s = R.toScreen(e.rx, e.ry); return s.x > -10 && s.y > -10 && s.x < R.w + 10 && s.y < R.h + 10; }
function buildHere() {
  const g = UI.ghost, cm = UI.cmode; if (!g || !cm) return;
  if (!V.canPlace(cm.key, g.x, g.y)) { toast('Здесь строить нельзя'); return; }
  const p = V.player(V.me); if (p.gold < DEF[cm.key].cost) { toast('Не хватает золота'); return; }
  if (!myWorkers().length) { toast('Нужен строитель — наймите его в цитадели'); return; }
  V.send({ c: 'build', t: cm.sub, x: g.x, y: g.y, ids: cm.ids || [] }); Snd.play('build');
  UI.cmode = null; UI.ghost = null; hint(''); UI.panelSig = ''; buildSig = ''; ringSig = '';
}
function boxSelect(x0, y0, x1, y1) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const ids = V.ents.filter(e => { if (e.owner !== V.me || e.d.kind !== 'u') return false; const s = R.proj(e.rx, e.ry, 10); return s.x >= ax && s.x <= bx && s.y >= ay && s.y <= by + 10; }).map(e => e.id);
  if (ids.length) { setSel(expandSq(ids)); Snd.play('click'); }
}

// ---------- pointer input ----------
const ptrs = new Map(); let gesture = null; let boxRect = null; let hoverW = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  Snd.init();
  if (!V || mode === 'menu') return;
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), type: e.pointerType, btn: e.button });
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    gesture = { t: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: R.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: { ...R.cam } }; boxRect = null;
  } else if (ptrs.size === 1) {
    gesture = { t: 'maybe', id: e.pointerId };
    if (e.pointerType === 'mouse') {
      if (e.button === 2) { const w = R.toWorld(e.clientX, e.clientY); const t = pick(e.clientX, e.clientY, false); if (UI.cmode) { UI.cmode = null; UI.ghost = null; hint(''); UI.panelSig = ''; } else issueAt(w.x, w.y, t); gesture = null; ptrs.delete(e.pointerId); return; }
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
    const z = clamp(gesture.z0 * d / Math.max(10, gesture.d0), 0.3, R.maxZ || 2.2);
    if (R.is3D) { R.zoomAt(mx, my, z); if (gesture.lmx !== undefined) R.panBy(gesture.lmx, gesture.lmy, mx, my); gesture.lmx = mx; gesture.lmy = my; return; }
    const cam0 = gesture.cam; const wx = cam0.x + gesture.mx / cam0.z, wy = cam0.y + gesture.my / cam0.z;
    R.cam.z = z; R.clampCam();
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
  if (gesture.t === 'pan') R.panBy(px, py, p.x, p.y);
  if (gesture.t === 'box' && boxRect) { boxRect.x1 = p.x; boxRect.y1 = p.y; }
});
function endPtr(e) {
  const p = ptrs.get(e.pointerId); if (!p) return;
  ptrs.delete(e.pointerId);
  if (!gesture) return;
  clearTimeout(gesture.lp);
  if (gesture.t === 'pinch') { if (ptrs.size === 0) gesture = null; else gesture = { t: 'none' }; return; }
  if (gesture.t === 'maybe' && e.type === 'pointerup') tapWorld(p.x, p.y, p.type !== 'mouse');
  if (gesture.t === 'box' && boxRect) { boxSelect(boxRect.x0, boxRect.y0, boxRect.x1, boxRect.y1); if (UI.boxMode) { UI.boxMode = false; ringSig = ''; } }
  boxRect = null; if (ptrs.size === 0) gesture = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('wheel', e => {
  if (!V) return; e.preventDefault();
  R.zoomAt(e.clientX, e.clientY, clamp(R.cam.z * Math.exp(-e.deltaY * 0.0015), 0.3, R.maxZ || 2.2));
}, { passive: false });
const keys = new Set();
window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  keys.add(e.key.toLowerCase());
  if (e.key === 'Escape') { UI.cmode = null; UI.ghost = null; hint(''); UI.panelSig = ''; ringSig = ''; closeBook(); }
  if (mode !== 'menu' && V) {
    const n = '1234'.indexOf(e.key);
    if (n >= 0) { const h = focusHero(); if (h) useSkill(h, n); }
    if (e.key.toLowerCase() === 'q') selectArmy();
    if (e.key.toLowerCase() === 'b') selectBuilders();
    if (e.key.toLowerCase() === 'e') { if ($('book').hidden) openBook(); else closeBook(); }
  }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
// minimap
function miniPos(e) { const r = mini.getBoundingClientRect(); return R.miniToWorld((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, mini.width); }
function miniJump(e) { const w = miniPos(e); R.centerOn(w.x, w.y); }
let miniDown = false;
let miniLast = 0;
mini.addEventListener('pointerdown', e => { e.preventDefault(); const now = performance.now(); if (now - miniLast < 350 && V && mySel().some(u => u.d.kind === 'u')) { const w = miniPos(e); issueAt(w.x, w.y, null); toast(UI.marchMode ? 'Войска идут маршем' : 'Войска выдвигаются в атаку'); miniLast = 0; return; } miniLast = now; miniDown = true; try { mini.setPointerCapture(e.pointerId); } catch (er) {} miniJump(e); });
mini.addEventListener('pointermove', e => { if (miniDown) miniJump(e); });
mini.addEventListener('pointerup', () => miniDown = false);
mini.addEventListener('pointercancel', () => miniDown = false);

// ---------- HUD: BFME-style palette (round map + command ring), spell book, builders ----------
const CLS_TIP = { inf: 'силён против копейщиков', spear: 'бьёт конницу', arch: 'бьёт пехоту издалека', cav: 'топчет стрелков', siege: 'ломает здания' };
const BLD_DESC = { farm: 'Золото +3/с и +12 к лимиту армии', barr: 'Пехота и копейщики', range: 'Стрелки', stable: 'Конница', forge: 'Осадные машины; нужна, чтобы открыть клинки, броню и огненные стрелы', fort: 'Герои, строители и улучшения крепости', tower: 'Сама стреляет по врагам' };
const short = s => { const w = String(s).split(/[ ,]/)[0]; return w.length > 8 ? w.slice(0, 7) + '.' : w; };
function myFort() { return V.ents.find(x => x.owner === V.me && x.d.sub === 'fort'); }
function myWorkers() { return V.ents.filter(e => e.owner === V.me && e.d.worker); }
function selectArmy() { const ids = V.ents.filter(e => e.owner === V.me && e.d.kind === 'u' && !e.d.worker).map(e => e.id); setSel(ids); if (ids.length) toast('Выбрана вся армия: ' + ids.length); }
function selectBuilders() {
  const ws = myWorkers();
  if (!ws.length) { const f = myFort(); if (f) { setSel([f.id]); R.centerOn(f.rx, f.ry); } toast('Строителей нет — наймите их в цитадели'); return; }
  const idle = ws.filter(w => !w.moving && !(w.atkT > 0)), list = idle.length ? idle : ws;
  UI.bIdx = ((UI.bIdx || 0) + 1) % list.length; const w = list[UI.bIdx];
  setSel([w.id]); UI.buildOpen = true; if (!inScreen(w)) R.centerOn(w.rx, w.ry);
}
function unitDesc(d) { return d.worker ? 'Строит и чинит здания' : (d.n > 1 ? 'Батальон ×' + d.n + ' · ' : '') + (d.range > 60 ? 'дальний бой' : 'ближний бой') + (CLS_TIP[d.cls] ? ' · ' + CLS_TIP[d.cls] : ''); }
function useSkill(h, si) {
  const sk = h.d.skills[si]; const hi = V.heroes(V.me).find(x => x.id === h.id);
  if (!sk) return;
  if (sk.type === 'aura') { toast(sk.name + ': ' + sk.desc); return; }
  if (!hi || hi.lvl < sk.lvl) { toast('Навык откроется на ' + sk.lvl + ' уровне'); return; }
  if (hi.scd[si] > 0) { toast('Перезарядка: ' + Math.ceil(hi.scd[si]) + ' с'); return; }
  if (sk.range) { UI.cmode = { t: 'skill', h: h.id, s: si, range: sk.range, radius: sk.radius || 60 }; hint(sk.name + ': нажмите на карту · двойное касание кнопки — авто-цель'); if (!inScreen(h)) R.centerOn(h.rx, h.ry); }
  else { V.send({ c: 'skill', h: h.id, s: si, x: h.rx, y: h.ry }); Snd.play('click'); }
  UI.panelSig = '';
}
function focusHero() {
  const sel = mySel().find(e => e.d.hero);
  if (sel) { UI.focusHero = sel.id; return sel; }
  const f = UI.focusHero ? V.get(UI.focusHero) : null;
  if (f && f.owner === V.me) return f;
  const h = V.heroes(V.me).map(x => x.id && V.get(x.id)).find(Boolean) || null;
  UI.focusHero = h ? h.id : 0; return h;
}
function castPower(k) {
  const P = V.player(V.me), S = SPELLS[k], nm = SPELL_NAMES[P.race][k][0];
  if (!P.spells[k]) { openBook(k); return; }
  if (P.scd[k] > 0) { toast(nm + ': перезарядка ' + Math.ceil(P.scd[k]) + ' с'); return; }
  if (S.target) { UI.cmode = { t: 'power', k, radius: S.radius || 120 }; hint(nm + ': нажмите на карту'); }
  else { V.send({ c: 'power', k }); Snd.play('horn'); }
  UI.panelSig = ''; spellSig = '';
}
function pickBuild(sub) {
  const P = V.player(V.me), key = P.race + '_' + sub, d = DEF[key];
  if (P.gold < d.cost) { toast('Не хватает золота: нужно ' + d.cost); return; }
  const ws = mySel().filter(e => e.d.worker).map(e => e.id);
  UI.cmode = { t: 'build', key, sub, ids: ws }; UI.ghost = null; UI.panelSig = ''; buildSig = '';
  hint(d.name + ': нажмите на карту рядом с базой');
  if (hoverW) UI.ghost = { d, x: hoverW.x, y: hoverW.y, ok: V.canPlace(key, hoverW.x, hoverW.y) };
}

// what the command ring shows for the current selection
function ringModel() {
  const P = V.player(V.me), race = P.race, sel = selEnts(), mine = sel.filter(e => e.owner === V.me), cm = UI.cmode;
  const M = { name: '', sub: '', core: null, slots: [] };
  const add = (act, arg, o) => M.slots.push(Object.assign({ act, arg: arg === undefined ? '' : arg }, o));
  const bld = mine.length === 1 && mine[0].d.kind === 'b' ? mine[0] : null;
  const units = mine.filter(e => e.d.kind === 'u');
  const hero = units.length === 1 && units[0].d.hero ? units[0] : null;
  const workers = units.length && units.every(u => u.d.worker) ? units : null;
  const heroSlot = (hs, act) => { const hd = hs.d, cost = hs.recruited ? Math.round(hd.cost * 0.5) : hd.cost, fq = V.queue((myFort() || {}).id), busy = fq && fq.ti === hd.ti; add(hs.id || busy ? 'center' : act, hs.id || hs.hk, { img: iconFor(hd, V.me), cap: short(hd.heroName), cost: hs.id ? '' : busy ? '' : cost, prog: busy ? fq.prog : null, cls: !hs.id && !busy && P.gold < cost ? 'off' : '', name: hd.name, desc: hs.id ? 'Уже в бою — нажмите, чтобы найти' : (hs.recruited ? 'Воскресить за ' : 'Нанять за ') + cost + ' золота' }); };
  if (cm && cm.t === 'build') {
    const d = DEF[cm.key]; M.name = 'Строим: ' + d.name; M.sub = 'Нажмите на карту рядом с базой'; M.core = { img: iconFor(d, V.me) };
    add('place', '', { g: '✔', cap: 'Ставить', cls: UI.ghost && UI.ghost.ok ? 'ready' : 'off', name: 'Поставить здание' });
    add('cancelmode', '', { g: '✖', cap: 'Отмена', name: 'Отменить стройку' });
  } else if (cm && cm.t === 'repair') {
    M.name = 'Ремонт'; M.sub = 'Нажмите на своё повреждённое здание'; M.core = { g: '⚒' };
    add('cancelmode', '', { g: '✖', cap: 'Отмена' });
  } else if (cm && cm.t === 'recruit') {
    M.name = 'Нанять'; M.sub = 'Лимит армии ' + P.used + '/' + P.cap; M.core = { g: '⚔' };
    if (myFort()) for (const hs of V.heroes(V.me)) heroSlot(hs, 'hero2');
    const types = []; for (const b of V.ents) if (b.owner === V.me && b.d.kind === 'b' && b.built >= 1 && b.d.trains) for (const u of b.d.trains) if (u !== 'hero' && !types.includes(u)) types.push(u);
    for (const u of types) { const ud = DEF[u]; let qn = 0; for (const b of V.ents) if (b.owner === V.me && b.d.trains && b.d.trains.includes(u)) { const q = V.queue(b.id); if (q && q.ti === ud.ti) qn += q.n; } add('rtrain', u, { img: iconFor(ud, V.me), cap: short(ud.name), cost: ud.cost, count: qn, cls: P.gold < ud.cost || P.used + ud.pop * ud.n > P.cap ? 'off' : '', name: ud.name + (ud.n > 1 ? ' ×' + ud.n : ''), desc: unitDesc(ud) }); }
    add('cancelmode', '', { g: '✖', cap: 'Закрыть' });
  } else if (bld) {
    const d = bld.d, q = V.queue(bld.id);
    M.name = d.name; M.sub = bld.built < 1 ? 'Строится… ' + Math.round(bld.built * 100) + '%' : 'Прочность ' + Math.ceil(bld.hp) + ' / ' + Math.round(bld.maxhp) + (BLD_DESC[d.sub] ? ' · ' + BLD_DESC[d.sub] : '');
    M.core = { img: iconFor(d, V.me), hp: bld.built < 1 ? bld.built : bld.hp / bld.maxhp, hc: bld.built < 1 ? '#9fd0ff' : null };
    if (bld.built >= 1) {
      if (d.trains) for (const u of d.trains) {
        if (u === 'hero') { for (const hs of V.heroes(V.me)) heroSlot(hs, 'hero'); continue; }
        const ud = DEF[u], inq = q && q.ti === ud.ti;
        add('train', u, { img: iconFor(ud, V.me), cap: short(ud.name), cost: ud.cost, cls: P.gold < ud.cost || P.used + ud.pop * ud.n > P.cap ? 'off' : '', prog: inq ? q.prog : null, count: inq ? q.n : 0, name: ud.name + (ud.n > 1 ? ' ×' + ud.n : ''), desc: unitDesc(ud) });
      }
      const hasForge = V.ents.some(e => e.owner === V.me && e.d.forge && e.built >= 1);
      for (const U of UPGRADES) { if (U.at !== d.sub) continue; const up = P.up || {}, busy = q && q.up === U.k, noF = U.forge && !hasForge; add(up[U.k] || busy ? 'noop' : 'research', U.k, { g: U.glyph, cap: short(upName(race, U.k)), cost: up[U.k] ? '✔' : busy ? '' : U.cost, cls: up[U.k] ? 'done' : !busy && (P.gold < U.cost || noF) ? 'off' : '', prog: busy ? q.prog : null, name: upName(race, U.k) + (U.eq && !up[U.k] ? ' — открыть' : ''), desc: (U.eq ? (up[U.k] ? 'Открыто. Покупайте батальонам: ' : 'Открыть снаряжение. Потом каждому батальону за ' + U.eq + ' зол.: ') : '') + U.desc + (noF ? ' · Нужна кузница' : '') }); }
      if (q) add('cancelq', '', { g: '↶', cap: 'Отмена', name: 'Отменить последний заказ' });
      if (d.trains) add('rally', '', { g: '⚑', cap: 'Сбор', cls: cm && cm.t === 'rally' ? 'on' : '', name: 'Точка сбора' });
    }
    if (bld.built < 1 || (bld.hp < bld.maxhp && d.sub !== 'fort')) add('sendworkers', bld.id, { g: '⚒', cap: 'Строит.', name: 'Прислать строителей', desc: 'Ближайший свободный строитель придёт работать' });
  } else if (workers) {
    const w = workers[0];
    M.name = workers.length === 1 ? w.d.name : 'Строители ×' + workers.length; M.sub = w.order && w.order.t === 'build' ? 'Работает на стройке' : 'Выберите здание справа или нажмите на стройку'; M.core = { img: iconFor(w.d, V.me), hp: w.hp / w.maxhp, cnt: workers.length > 1 ? workers.length : 0 };
    add('buildopen', '', { g: '⌂', cap: 'Строить', cls: UI.buildOpen ? 'on' : '', name: 'Выбрать здание' });
    add('repair', '', { g: '⚒', cap: 'Ремонт', name: 'Починить здание', desc: 'Строитель восстанавливает прочность' });
    add('nextworker', '', { g: '⟳', cap: 'Другой', name: 'Следующий строитель' });
  } else if (hero) {
    const hi = V.heroes(V.me).find(h => h.id === hero.id) || { lvl: 1, scd: [0, 0, 0, 0], hk: 'h1' };
    M.name = hero.d.name; M.sub = 'Уровень ' + hi.lvl + ' · здоровье ' + Math.ceil(hero.hp) + ' / ' + Math.round(hero.maxhp); M.core = { img: iconFor(hero.d, V.me), hp: hero.hp / hero.maxhp, cnt: hi.lvl };
    hero.d.skills.forEach((sk, si) => { const locked = hi.lvl < sk.lvl, cd = hi.scd[si], pas = sk.type === 'aura'; add('skill', si, { g: SKILL_GLYPH[sk.type], cap: short(sk.name), cls: [locked ? 'lock' : '', pas ? 'pas' : '', !locked && !pas && cd <= 0 ? 'ready' : '', cm && cm.t === 'skill' && cm.s === si ? 'on' : ''].join(' '), cd: !locked && cd > 0 ? cd : 0, cdMax: sk.cd || 1, lvl: locked ? sk.lvl : 0, name: sk.name + ' (ур. ' + sk.lvl + ')', desc: sk.desc }); });
    add('autocast', hi.hk, { g: hi.auto ? '⟳' : '☝', cap: hi.auto ? 'Авто' : 'Вручную', cls: hi.auto ? 'on' : '', name: 'Автоприменение навыков' });
    add('hold', '', { g: '⛨', cap: 'Стоять' }); add('retreat', '', { g: '↩', cap: 'Назад' });
  } else if (units.length) {
    const sqs = selSquads(), singles = units.filter(u => !u.sq);
    const counts = {}; for (const q of sqs) counts[q.d.key] = (counts[q.d.key] || 0) + 1; for (const u of singles) counts[u.d.key] = (counts[u.d.key] || 0) + 1;
    const keys = Object.keys(counts), dom = keys.sort((a, b) => counts[b] - counts[a])[0];
    let hp = 0, mx = 0; for (const u of units) { hp += u.hp; mx += u.maxhp; }
    if (sqs.length === 1 && !singles.length) { const q = sqs[0], si = V.sqInfo(q.id) || { lvl: 1, xp: 0 }; M.name = q.d.name + ' · ' + q.mem.length + '/' + q.d.n + ' · ур. ' + si.lvl + (q.mem.some(m => m.leader) ? ' · лидер' : ''); M.sub = (si.lvl < SQ_MAX_LVL ? 'Опыт ' + Math.round(si.xp * 100) + '% до ур. ' + (si.lvl + 1) + (si.lvl < LEADER_LVL ? ' · на ур. ' + LEADER_LVL + ' появится лидер' : '') : 'Высший уровень') + ' · ' + unitDesc(q.d); }
    else { M.name = (sqs.length ? 'Батальонов: ' + sqs.length : 'Отряд') + (singles.length ? ' + ' + singles.length : ''); M.sub = 'Бойцов ' + units.length + ' · двойное касание — все такие'; }
    M.core = { img: iconFor(DEF[dom], V.me), hp: hp / mx, cnt: sqs.length + singles.length > 1 ? sqs.length + singles.length : 0 };
    add('march', '', { g: UI.marchMode ? '➜' : '⚔', cap: UI.marchMode ? 'Марш' : 'Атака', cls: UI.marchMode ? 'on' : '', name: UI.marchMode ? 'Марш: идти, не отвлекаясь' : 'В атаку: бить всех по пути' });
    add('hold', '', { g: '⛨', cap: 'Стоять', name: 'Стоять на месте и держать строй' }); add('retreat', '', { g: '↩', cap: 'Назад', name: 'Отступить к цитадели' });
    const led = sqs.filter(q => q.mem.some(m => m.leader));
    if (led.length) { const cds = led.map(q => (V.sqInfo(q.id) || {}).cd || 0), ready = cds.some(c => c <= 0), cd = ready ? 0 : Math.min(...cds); add('flag', '', { g: '✠', cap: 'Знамя', cls: ready ? 'ready' : '', cd, cdMax: FLAG_CD, name: 'Поднять знамя', desc: 'Лидер возвращает в строй до 3 павших, батальон: +20% урона и +10% брони на 12 с, лечение' }); }
    // equipment for the selected battalions (unlocked in barracks / range)
    const eqSq = sqs.filter(q => !q.d.summon && !q.d.creep && !q.d.worker);
    for (const U of UPGRADES) {
      if (!U.eq || !(P.up || {})[U.k]) continue;
      const fit = eqSq.filter(q => U.cls.includes(q.d.cls)); if (!fit.length) continue;
      const need = fit.filter(q => !(q.eqv & UP_BIT[U.k])), nm = upName(race, U.k);
      add(need.length ? 'equip' : 'noop', U.k, { g: U.glyph, cap: short(nm), cost: need.length ? U.eq * need.length : '✔', cls: need.length ? (P.gold < U.eq ? 'off' : '') : 'done', name: nm + (need.length ? ' — купить' : ' — есть'), desc: U.desc + (need.length > 1 ? ' · ' + U.eq + ' зол. за батальон' : '') });
    }
    const worn = sqs.filter(q => q.mem.length < q.d.n);
    if (worn.length) { const cost = worn.reduce((a, q) => a + Math.ceil(q.d.cost / q.d.n * (q.d.n - q.mem.length) * 0.8), 0); const need = worn.reduce((a, q) => a + (q.d.n - q.mem.length) * q.d.pop, 0); add('refill', '', { g: '✚', cap: 'Пополн.', cost, cls: P.gold < cost || P.used + need > P.cap ? 'off' : '', name: 'Пополнить батальоны', desc: 'Рядом со своими зданиями' }); }
    if (keys.length > 1) for (const k of keys.slice(0, 2)) add('only', k, { img: iconFor(DEF[k], V.me), count: counts[k], name: 'Оставить только: ' + DEF[k].name });
  } else if (sel.length) {
    const e = sel[0], pl = V.player(e.owner);
    M.name = e.d.name; M.sub = (pl ? pl.name + ' · ' + RACES[pl.race].short : e.owner === NEUTRAL ? 'Дикие' : '') + ' · здоровье ' + Math.ceil(e.hp); M.core = { img: iconFor(e.d, e.owner), hp: e.hp / e.maxhp, hc: '#e0533f' };
    add('desel', '', { g: '✖', cap: 'Снять' });
  } else {
    const fort = myFort();
    M.name = RACES[race].name; M.sub = 'Касание — выбрать · по земле — идти · два пальца — зум'; M.core = fort ? { img: iconFor(fort.d, V.me) } : { g: '⚜' };
    add('army', '', { g: '⚔', cap: 'Армия', name: 'Выбрать всю армию' });
    add('builders', '', { g: '⚒', cap: 'Строит.', count: myWorkers().length, name: 'Строители', desc: 'Выбрать свободного строителя' });
    add('recruitmenu', '', { g: '⚑', cap: 'Нанять', name: 'Нанять войска' });
    add('book', '', { g: '✦', cap: 'Книга', cls: P.pts > 0 ? 'ready' : '', name: 'Книга сил' });
    if (fort) add('fortsel', fort.id, { g: '⌂', cap: 'Цитад.', name: 'Цитадель' });
    add('boxmode', '', { g: '▭', cap: 'Рамка', cls: UI.boxMode ? 'on' : '', name: 'Выделение рамкой' });
  }
  return M;
}
let ringSig = '', ringM = null;
function updateRing() {
  if (!V) return;
  if (UI.sel.size) { const ex = expandSq([...UI.sel].filter(id => V.get(id))); if (ex.length !== UI.sel.size) UI.sel = new Set(ex); }
  const M = ringModel(); ringM = M;
  const sig = JSON.stringify([M.name, M.sub, M.core && [M.core.img ? M.core.img.length : M.core.g, Math.round((M.core.hp || 0) * 30), M.core.cnt], M.slots.map(s => [s.act, s.arg, s.cls, s.cost, s.count, s.cap, s.g, s.img ? 1 : 0, s.prog !== null && s.prog !== undefined ? Math.round(s.prog * 24) : -1, s.cd ? Math.ceil(s.cd) : 0, s.lvl])]);
  if (sig === ringSig) return; ringSig = sig;
  $('selname').textContent = M.name; $('selsub').textContent = M.sub;
  const n = Math.max(4, M.slots.length), rf = n > 8 ? 39 : 37.5;
  let h = '';
  if (M.core) {
    const c = M.core;
    h += '<div class="core">' + (c.img ? '<img src="' + c.img + '" alt="">' : '<span class="g">' + c.g + '</span>') + (c.hp !== undefined ? '<i class="hpr" style="--p:' + clamp(c.hp, 0, 1).toFixed(3) + ';--hc:' + (c.hc || (c.hp > 0.5 ? '#6fd66a' : c.hp > 0.25 ? '#e0b640' : '#d9432f')) + '"></i>' : '') + (c.cnt ? '<b class="cnt">' + c.cnt + '</b>' : '') + '</div>';
  }
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + i / n * Math.PI * 2, x = 50 + Math.cos(a) * rf, y = 50 + Math.sin(a) * rf, s = M.slots[i];
    const pos = 'left:' + x.toFixed(2) + '%;top:' + y.toFixed(2) + '%';
    if (!s) continue;
    h += '<button class="slot ' + (s.cls || '') + '" data-i="' + i + '" style="' + pos + '" aria-label="' + escapeHtml(s.name || s.cap || '') + '">' +
      (s.img ? '<img src="' + s.img + '" alt="">' : '<span class="g">' + s.g + '</span>') + (s.cap && !s.img ? '<span class="cap">' + s.cap + '</span>' : '') +
      (s.prog !== null && s.prog !== undefined ? '<i class="pr" style="--p:' + clamp(s.prog, 0, 1).toFixed(3) + '"></i>' : '') +
      (s.cd ? '<i class="cdw" style="--p:' + clamp(s.cd / s.cdMax, 0, 1).toFixed(3) + '"></i><b class="cdn">' + Math.ceil(s.cd) + '</b>' : '') +
      (s.lvl ? '<b class="lv">' + s.lvl + '</b>' : '') + (s.cost !== undefined && s.cost !== '' ? '<b class="cost">' + s.cost + '</b>' : '') + (s.count ? '<b class="cnt">' + s.count + '</b>' : '') + '</button>';
  }
  $('ring').innerHTML = h;
}
function doAct(act, arg) {
  const sel = mySel(), P = V.player(V.me);
  switch (act) {
    case 'army': selectArmy(); break;
    case 'builders': case 'nextworker': selectBuilders(); break;
    case 'buildopen': UI.buildOpen = !UI.buildOpen; buildSig = ''; break;
    case 'repair': UI.cmode = { t: 'repair', ids: sel.filter(e => e.d.worker).map(e => e.id) }; hint('Нажмите на своё здание, которое нужно починить'); break;
    case 'sendworkers': { const b = V.get(+arg); if (!b) break; const ws = myWorkers().filter(w => !(w.order && w.order.t === 'build')); const list = (ws.length ? ws : myWorkers()).sort((a, c) => Math.hypot(a.rx - b.rx, a.ry - b.ry) - Math.hypot(c.rx - b.rx, c.ry - b.ry)).slice(0, 2); if (!list.length) { toast('Строителей нет — наймите их в цитадели'); break; } V.send({ c: 'work', t: b.id, ids: list.map(w => w.id) }); toast('Строители идут на стройку'); break; }
    case 'book': openBook(); break;
    case 'fortsel': { const f = V.get(+arg); if (f) { setSel([f.id]); R.centerOn(f.rx, f.ry); } break; }
    case 'recruitmenu': UI.cmode = UI.cmode && UI.cmode.t === 'recruit' ? null : { t: 'recruit' }; UI.ghost = null; hint(''); break;
    case 'rtrain': { const ud = DEF[arg]; if (P.gold < ud.cost) { toast('Не хватает золота'); break; } if (P.used + ud.pop * ud.n > P.cap) { toast('Лимит армии — постройте фермы или захватите аванпост'); break; }
      let best = null, bn = 99; for (const b of V.ents) if (b.owner === V.me && b.built >= 1 && b.d.trains && b.d.trains.includes(arg)) { const q = V.queue(b.id); const n = q ? q.n : 0; if (n < bn) { bn = n; best = b; } }
      if (best) V.send({ c: 'train', b: best.id, u: arg }); break; }
    case 'hero2': { const f = myFort(); if (f) V.send({ c: 'hero', b: f.id, h: arg }); break; }
    case 'hold': V.send(Object.assign({ c: 'hold' }, selCmd())); toast('Держать строй: бойцы не сойдут с места'); break;
    case 'retreat': V.send(Object.assign({ c: 'retreat' }, selCmd())); toast('Отступаем к цитадели'); break;
    case 'refill': { const sqs = selSquads().filter(q => q.mem.length < q.d.n); if (!sqs.length) { toast('Батальоны полные'); break; } const cost = sqs.reduce((a, q) => a + Math.ceil(q.d.cost / q.d.n * (q.d.n - q.mem.length) * 0.8), 0); if (P.gold < cost) { toast('Нужно ' + cost + ' золота'); break; } V.send({ c: 'refill', s: sqs.map(q => q.id) }); break; }
    case 'autocast': { const hs = V.heroes(V.me).find(x => x.hk === arg); const on = !(hs && hs.auto); V.send({ c: 'auto', hk: arg, on }); toast(on ? 'Герой сам применяет навыки' : 'Навыки героя — вручную'); break; }
    case 'boxmode': UI.boxMode = !UI.boxMode; hint(UI.boxMode ? 'Проведите пальцем, чтобы выделить рамкой' : ''); break;
    case 'place': buildHere(); break;
    case 'cancelmode': UI.cmode = null; UI.ghost = null; hint(''); buildSig = ''; break;
    case 'train': { const bld = sel.find(x => x.d.kind === 'b'); if (bld) V.send({ c: 'train', b: bld.id, u: arg }); if (P.gold < DEF[arg].cost) toast('Не хватает золота'); else if (P.used + DEF[arg].pop * DEF[arg].n > P.cap) toast('Лимит армии — постройте фермы'); break; }
    case 'hero': { const bld = sel.find(x => x.d.sub === 'fort'); if (bld) V.send({ c: 'hero', b: bld.id, h: arg }); break; }
    case 'flag': { const ids = selSquads().filter(q => q.mem.some(m => m.leader)).map(q => q.id); if (ids.length) { V.send({ c: 'flag', s: ids }); Snd.play('horn'); ringSig = ''; } break; }
    case 'equip': { const U = UPG[arg]; const sq = selSquads().filter(q => U && U.cls.includes(q.d.cls) && !(q.eqv & UP_BIT[U.k])); if (!sq.length) break; if (P.gold < U.eq) { toast('Нужно ' + U.eq + ' золота'); break; } V.send({ c: 'equip', s: sq.map(q => q.id), k: arg }); Snd.play('anvil'); ringSig = ''; break; }
    case 'research': { const U = UPG[arg]; const bld = U && sel.find(x => x.d.sub === U.at); if (!bld || !U) break; if (U.forge && !V.ents.some(e => e.owner === V.me && e.d.forge && e.built >= 1)) { toast('Сначала постройте кузницу'); break; } if (P.gold < U.cost) { toast('Нужно ' + U.cost + ' золота'); break; } V.send({ c: 'research', b: bld.id, k: arg }); break; }
    case 'cancelq': { const bld = sel.find(x => x.d.kind === 'b'); if (bld) V.send({ c: 'cancel', b: bld.id }); break; }
    case 'rally': { const bld = sel.find(x => x.d.kind === 'b'); if (bld) { UI.cmode = { t: 'rally', b: bld.id }; hint('Нажмите на карту — точка сбора'); } break; }
    case 'skill': { const h = focusHero(); if (h) useSkill(h, +arg); break; }
    case 'stop': V.send(Object.assign({ c: 'stop' }, selCmd())); break;
    case 'march': UI.marchMode = !UI.marchMode; break;
    case 'desel': setSel([]); break;
    case 'only': setSel(expandSq(sel.filter(x => x.d.key === arg).map(x => x.id))); break;
    case 'center': { const e1 = V.get(+arg); if (e1) { R.centerOn(e1.rx, e1.ry); setSel([e1.id]); } break; }
  }
  UI.panelSig = ''; ringSig = '';
}
// ring input: tap = act, long-press = description, double-tap on a targeted hero skill = smart cast
let ringPress = null, ringLast = { k: '', t: 0 };
function slotInfo(s) { if (s) toast((s.name || s.cap || '') + (s.desc ? ': ' + s.desc : '') + (s.cost !== undefined && s.cost !== '' && s.cost !== '✔' ? ' · ' + s.cost + ' золота' : '')); if (navigator.vibrate) try { navigator.vibrate(12); } catch (er) {} }
$('ring').addEventListener('pointerdown', e => {
  const b = e.target.closest('.slot[data-i]'); if (!b) return; e.preventDefault(); Snd.init();
  if (ringPress) clearTimeout(ringPress.timer);
  const P = { i: +b.dataset.i, long: false }; P.timer = setTimeout(() => { P.long = true; slotInfo(ringM && ringM.slots[P.i]); }, 480); ringPress = P;
});
$('ring').addEventListener('pointerup', e => {
  const P = ringPress; ringPress = null; if (!P) return; clearTimeout(P.timer); if (P.long || !ringM) return;
  const s = ringM.slots[P.i]; if (!s) return;
  Snd.play('click');
  if (s.act === 'skill') {
    const h = focusHero(), sk = h && h.d.skills[+s.arg], now = performance.now(), key = 'sk' + s.arg, dbl = ringLast.k === key && now - ringLast.t < 380; ringLast = { k: key, t: now };
    if (h && sk && sk.range && dbl) { V.send({ c: 'autoskill', h: h.id, s: +s.arg }); UI.cmode = null; hint(''); ringSig = ''; return; }
    if (UI.cmode && UI.cmode.t === 'skill' && UI.cmode.s === +s.arg) { UI.cmode = null; hint(''); ringSig = ''; return; }
  }
  doAct(s.act, s.arg);
});
$('ring').addEventListener('pointercancel', () => { if (ringPress) clearTimeout(ringPress.timer); ringPress = null; });
$('heroes').addEventListener('pointerdown', e => {
  const b = e.target.closest('.hp'); if (!b) return; e.preventDefault(); Snd.init();
  const id = +b.dataset.id;
  if (id) { const h = V.get(id); if (h) { if (UI.sel.size === 1 && UI.sel.has(id)) R.centerOn(h.rx, h.ry); setSel([id]); Snd.play('click'); } }
  else { const f = myFort(); if (f) { setSel([f.id]); R.centerOn(f.rx, f.ry); toast('Наймите героя в цитадели'); } }
});
$('bBook').addEventListener('click', () => { Snd.init(); Snd.play('click'); openBook(); });

// ---------- builders: 3D buildings slide out on the right ----------
let buildSig = '';
const bigIcons = {};
function bigIcon(d, owner) {
  const key = d.key + owner; if (bigIcons[key]) return bigIcons[key];
  const spr = bld3(d, TEAM_COLORS[owner], true), c = mkCanvas(160, 160), x = c.getContext('2d');
  const s = Math.min(150 / spr.w, 150 / spr.h);
  x.drawImage(spr.cv, 80 - spr.w * s / 2, 156 - spr.h * s, spr.w * s, spr.h * s);
  let url = ''; try { url = c.toDataURL(); } catch (e) {}
  return bigIcons[key] = url;
}
function updateBuildPanel() {
  const bp = $('buildpanel');
  const workers = mySel().filter(e => e.d.kind === 'u'), onlyW = workers.length && workers.every(u => u.d.worker);
  const cm = UI.cmode, show = onlyW && UI.buildOpen && !(cm && (cm.t === 'build' || cm.t === 'repair'));
  if (!show) { if (!bp.hidden) { bp.hidden = true; buildSig = ''; } return; }
  const P = V.player(V.me), race = P.race;
  let farms = 0; for (const e of V.ents) if (e.owner === V.me && e.d.sub === 'farm') farms++;
  const sig = race + '|' + Math.floor(P.gold / 25) + '|' + farms;
  if (!bp.hidden && sig === buildSig) return;
  buildSig = sig; bp.hidden = false;
  let h = '<h4>Постройки<button data-b="close" aria-label="Закрыть">✖</button></h4>';
  for (const sub of BUILD_ORDER) {
    const d = DEF[race + '_' + sub], lim = sub === 'farm' && farms >= 10;
    h += '<button class="bcard' + (P.gold < d.cost || lim ? ' off' : '') + '" data-b="' + sub + '"><img src="' + bigIcon(d, V.me) + '" alt=""><span><b>' + d.name + '</b><span class="cst">' + d.cost + ' · ' + d.time + ' с</span><span class="ds">' + (lim ? 'Максимум 10' : BLD_DESC[sub]) + '</span></span></button>';
  }
  bp.innerHTML = h;
}
$('buildpanel').addEventListener('click', e => {
  const b = e.target.closest('[data-b]'); if (!b) return; Snd.init(); Snd.play('click');
  if (b.dataset.b === 'close') { UI.buildOpen = false; buildSig = ''; updateBuildPanel(); ringSig = ''; return; }
  pickBuild(b.dataset.b); updateBuildPanel(); ringSig = '';
});

// ---------- spell book (power tree) ----------
let bookSel = null, bookSig = '';
function spellState(P, k) { const S = SPELLS[k], req = SPELL_REQ[k]; if (P.spells[k]) return 'own'; if ((!req || req.some(r => P.spells[r])) && P.pts >= TIER_COST[S.tier]) return 'can'; return 'lock'; }
function openBook(k) { bookSel = k || bookSel || 'heal'; bookSig = ''; $('book').hidden = false; renderBook(); }
function closeBook() { $('book').hidden = true; }
function renderBook() {
  const bk = $('book'); if (bk.hidden || !V) return;
  const P = V.player(V.me), race = P.race;
  const sig = JSON.stringify([P.pts, P.plvl, Object.keys(P.spells), bookSel, SPELL_ORDER.map(k => Math.ceil(P.scd[k] || 0))]);
  if (sig === bookSig) return; bookSig = sig;
  const roman = ['', 'I', 'II', 'III', 'IV'];
  let h = '<div class="bookcard"><button class="x" data-bk="close" aria-label="Закрыть">✖</button><h2>Книга сил</h2><div class="bs">Очков: <b style="color:#fff">' + P.pts + '</b> · уровень силы ' + P.plvl + ' · до нового очка ' + Math.round((1 - P.pxpF) * 100) + '% — побеждайте врагов, берите аванпосты и лагеря</div><div class="tree"><svg></svg>';
  for (let t = 1; t <= 4; t++) {
    h += '<div class="tier"><span class="tl">' + roman[t] + ' · ' + TIER_COST[t] + ' оч.</span>';
    for (const k of SPELL_ORDER) if (SPELLS[k].tier === t) { const st = spellState(P, k); h += '<button class="node ' + st + (bookSel === k ? ' sel' : '') + '" data-k="' + k + '"><span class="o">' + SPELLS[k].glyph + '</span><small>' + SPELL_NAMES[race][k][0] + '</small></button>'; }
    h += '</div>';
  }
  const k = bookSel, S = SPELLS[k], st = spellState(P, k), [nm, ds] = SPELL_NAMES[race][k], req = SPELL_REQ[k];
  h += '</div><div class="bdetail"><div class="t"><b>' + nm + '</b><span>' + ds + '</span><em>Ярус ' + roman[S.tier] + ' · ' + TIER_COST[S.tier] + ' оч. · перезарядка ' + S.cd + ' с' + (req ? ' · нужна одна из: ' + req.map(r => SPELL_NAMES[race][r][0]).join(', ') : '') + '</em></div>';
  if (st === 'own') h += (P.scd[k] > 0 ? '<button class="big alt" disabled>Перезарядка ' + Math.ceil(P.scd[k]) + ' с</button>' : '<button class="big" data-bk="cast">Применить</button>');
  else if (st === 'can') h += '<button class="big" data-bk="learn">Изучить · ' + TIER_COST[S.tier] + ' оч.</button>';
  else h += '<button class="big alt" disabled>' + (req && !req.some(r => P.spells[r]) ? 'Сначала изучите предыдущую' : 'Нужно ' + TIER_COST[S.tier] + ' оч.') + '</button>';
  bk.innerHTML = h + '</div></div>';
  // links between tiers
  const tree = bk.querySelector('.tree'), svg = tree.querySelector('svg'), tr = tree.getBoundingClientRect();
  let lines = '';
  for (const [kk, rq] of Object.entries(SPELL_REQ)) for (const r of rq) {
    const a = tree.querySelector('[data-k="' + r + '"] .o'), b = tree.querySelector('[data-k="' + kk + '"] .o'); if (!a || !b) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), on = P.spells[r] && P.spells[kk];
    lines += '<line x1="' + (ra.left + ra.width / 2 - tr.left) + '" y1="' + (ra.bottom - tr.top) + '" x2="' + (rb.left + rb.width / 2 - tr.left) + '" y2="' + (rb.top - tr.top) + '" stroke="' + (on ? '#e9c46a' : P.spells[r] ? '#b98bff' : '#5b4a3a') + '" stroke-width="' + (on ? 3 : 2) + '"/>';
  }
  svg.innerHTML = lines;
}
$('book').addEventListener('click', e => {
  const n = e.target.closest('[data-k]'), b = e.target.closest('[data-bk]');
  if (n) { bookSel = n.dataset.k; bookSig = ''; renderBook(); Snd.play('click'); return; }
  if (!b) { if (e.target.id === 'book') closeBook(); return; }
  Snd.play('click');
  if (b.dataset.bk === 'close') closeBook();
  if (b.dataset.bk === 'learn') { V.send({ c: 'learn', k: bookSel }); Snd.play('lvl'); setTimeout(() => { bookSig = ''; renderBook(); }, 120); }
  if (b.dataset.bk === 'cast') { closeBook(); castPower(bookSel); }
});
// learned powers: column on the left edge (BFME2)
let spellSig = '';
function updateSpells() {
  const P = V.player(V.me), el = $('spells');
  const own = SPELL_ORDER.filter(k => P.spells[k]), cm = UI.cmode;
  const sig = own.map(k => k + Math.ceil(P.scd[k] || 0)).join(',') + (cm && cm.t === 'power' ? cm.k : '');
  if (sig === spellSig) return; spellSig = sig;
  el.innerHTML = own.map(k => { const S = SPELLS[k], cd = P.scd[k] || 0; return '<button class="spl ' + (cd <= 0 ? 'ready' : '') + (cm && cm.t === 'power' && cm.k === k ? ' on' : '') + '" data-k="' + k + '" aria-label="' + SPELL_NAMES[P.race][k][0] + '">' + S.glyph + (cd > 0 ? '<i class="cdw" style="--p:' + clamp(cd / S.cd, 0, 1).toFixed(3) + '"></i><b>' + Math.ceil(cd) + '</b>' : '') + '</button>'; }).join('');
}
let splPress = null;
$('spells').addEventListener('pointerdown', e => { const b = e.target.closest('[data-k]'); if (!b) return; e.preventDefault(); Snd.init(); const P = { k: b.dataset.k, long: false }; P.timer = setTimeout(() => { P.long = true; const pl = V.player(V.me), [nm, ds] = SPELL_NAMES[pl.race][P.k]; toast(nm + ': ' + ds); }, 480); splPress = P; });
$('spells').addEventListener('pointerup', () => { const P = splPress; splPress = null; if (!P) return; clearTimeout(P.timer); if (P.long) return; if (UI.cmode && UI.cmode.t === 'power' && UI.cmode.k === P.k) { UI.cmode = null; hint(''); spellSig = ''; return; } castPower(P.k); });
$('spells').addEventListener('pointercancel', () => { if (splPress) clearTimeout(splPress.timer); splPress = null; });

// ---------- quick select & control groups ----------
const QCAT = { all: e => !e.d.hero && !e.d.worker, inf: e => e.d.sub === 'inf' || e.d.sub === 'spear' || e.d.summon, arch: e => e.d.sub === 'arch', cav: e => e.d.sub === 'cav' };
let quickSig = '', quickLast = { k: '', t: 0 };
function updateQuick() {
  const mine = V.ents.filter(e => e.owner === V.me && e.d.kind === 'u');
  const cnt = k => { const sq = new Set(); let n = 0; for (const e of mine) if (QCAT[k](e)) { if (e.sq) sq.add(e.sq); else n++; } return sq.size + n; };
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
    setSel(ids); if (!ids.length) toast('Таких войск нет'); return;
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
function updateHud() {
  const P = V.player(V.me); if (!P) return;
  $('gold').textContent = Math.floor(P.gold);
  $('inc').textContent = '+' + P.income.toFixed(0);
  const pe = $('pop'); pe.textContent = P.used + '/' + P.cap; pe.classList.toggle('full', P.used >= P.cap);
  $('clock').textContent = fmtT(V.kind === 'client' ? (V.lastSnapT / 100) : game.t);
  $('pts').textContent = P.pts; $('pxp').style.setProperty('--p', clamp(P.pxpF, 0, 1).toFixed(3));
  $('bBook').classList.toggle('ready', SPELL_ORDER.some(k => spellState(P, k) === 'can'));
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
  updateSpells(); renderBook();
}

// ---------- screens ----------
const setup = { race: store.get('race', 'hum'), modeN: store.get('modeN', 0), diff: store.get('diff', 1), name: store.get('name', ''), map: store.get('map', 'random') };
function pickMap(k) { return k === 'random' || !MAP_TYPES.some(m => m.k === k) ? MAP_TYPES[(Math.random() * MAP_TYPES.length) | 0].k : k; }
function mapName(k) { const m = MAP_TYPES.find(x => x.k === k); return m ? m.name : ''; }
function show(html) { const s = $('scr'); s.innerHTML = html; s.hidden = false; }
function hideScr() { $('scr').hidden = true; $('scr').innerHTML = ''; }
function heroThumbs(rk) { return HEROES[rk].map(h => '<img src="' + iconFor(DEF[rk + '_' + h.key], 0) + '" alt="' + h.name + '" title="' + h.name + '">').join(''); }
function raceCards(sel, act) {
  return '<div class="races">' + RACE_KEYS.map(rk => '<button class="race ' + (sel === rk ? 'on' : '') + '" data-a="' + act + '" data-v="' + rk + '"><b>' + RACES[rk].short + '</b><span>' + RACES[rk].name + '</span><div class="hh">' + heroThumbs(rk) + '</div><span>' + HEROES[rk].map(h => h.name).join(' · ') + '</span></button>').join('') + '</div>';
}
function menuMain() {
  mode = 'menu'; startAttract();
  show('<div class="card"><h1 class="logo">Пепельные Королевства<small>СТРАТЕГИЯ ЭПОХИ ЛЕГЕНД</small></h1>' +
    '<p class="lead">Шесть народов, двенадцать легендарных героев — от Короля Артура и Тора до Анубиса и Мордреда. Стройте крепость, ведите в бой батальоны под знамёнами, держите переправы через реку, прокачивайте героев и сокрушите цитадель врага.</p>' +
    (function () { const sv = store.get('save', null); return sv && sv.game ? '<div class="btns" style="margin-bottom:8px"><button class="big" data-a="load">Продолжить битву<small class="bsub">' + RACES[sv.race].short + ' · ' + mapName(sv.map) + ' · ' + fmtT(sv.game.t) + '</small></button></div>' : ''; })() +
    '<div class="btns"><button class="big' + (store.get('save', null) ? ' alt' : '') + '" data-a="skirm">Битва с ИИ</button><button class="big alt" data-a="online">Онлайн с друзьями</button><button class="big alt" data-a="help">Как играть и герои</button><button class="big alt" data-a="gfx">Графика: ' + (R.is3D ? '3D' : '2D') + '</button></div></div>');
}
function menuSkirm() {
  const modes = ['1 на 1', '2 на 2 (с ИИ-союзником)', 'Все против всех (4)'];
  show('<div class="card"><button class="x" data-a="main" aria-label="Назад">✖</button><h2>Битва с ИИ</h2><h3>Ваш народ</h3>' + raceCards(setup.race, 'race') +
    '<h3>Режим</h3><div class="seg">' + modes.map((m, i) => '<button data-a="modeN" data-v="' + i + '" class="' + (setup.modeN === i ? 'on' : '') + '">' + m + '</button>').join('') + '</div>' +
    '<h3>Сложность</h3><div class="seg">' + ['Лёгкий', 'Средний', 'Тяжёлый'].map((m, i) => '<button data-a="diff" data-v="' + i + '" class="' + (setup.diff === i ? 'on' : '') + '">' + m + '</button>').join('') + '</div>' +
    '<h3>Карта</h3><div class="seg">' + MAP_TYPES.concat([{ k: 'random', name: 'Случайная' }]).map(m => '<button data-a="map" data-v="' + m.k + '" class="' + (setup.map === m.k ? 'on' : '') + '"' + (m.desc ? ' title="' + m.desc + '"' : '') + '>' + m.name + '</button>').join('') + '</div>' +
    '<div class="btns" style="margin-top:16px"><button class="big" data-a="go">В бой!</button></div></div>');
}
function menuHelp() {
  let h = '<div class="card help"><button class="x" data-a="main" aria-label="Назад">✖</button><h2>Как играть</h2>' +
    '<p><b>Цель:</b> разрушить цитадель противника. Потеря своей цитадели — поражение.</p>' +
    '<p><b>Экономика:</b> золото идёт само. Фермы (у каждого народа свои) увеличивают доход и лимит армии.</p>' +
    '<p><b>Строители:</b> здания возводят строители. Нажмите на строителя — справа выедут здания; выберите здание и место. Стройка идёт, только пока рядом работают строители (чем больше, тем быстрее). Нажмите строителем на повреждённое здание — он его починит. Новых строителей нанимают в цитадели.</p>' +
    '<p><b>Панель как в BFME:</b> слева внизу круглая карта, вокруг неё золото, лимит армии и время. Рядом круг команд: в центре портрет выбранного, по кругу — действия. Удержание любой кнопки — подсказка.</p>' +
    '<p><b>Книга сил ✦</b> (над картой): за убийства, аванпосты и лагеря дают очки. Изучайте силы по древу — от лечения и золота до ультимативной силы народа. Изученные силы стоят колонкой слева.</p>' +
    '<p><b>Батальоны:</b> как в Battle for Middle-earth, воины нанимаются отрядами по 5–12 бойцов со знаменосцем. Батальон ходит строем, дерётся вместе и растёт в ветераны (★). Потрёпанный батальон можно <b>пополнить</b> рядом со своими зданиями.</p>' +
    '<p><b>Карты:</b> «Речная долина» — река с мостами (вброд медленно) и остров в центре; «Горный перевал» — скалы и узкие проходы; «Снежные холмы» — замёрзшие озёра и густой ельник. Войска сами обходят скалы, леса и здания.</p>' +
    '<p><b>Кузница:</b> постройте её, чтобы улучшить всю армию: клинки, броню, огненные стрелы и знамёна (батальоны лечатся и восполняют павших). Улучшения видны на бойцах.</p>' +
    '<p><b>Лагеря:</b> на карте живут волки, разбойники и тролли. Разбейте лагерь — заберёте сундук с золотом. Через несколько минут лагерь снова занимают.</p>' +
    '<p><b>Мир:</b> день сменяется ночью (в темноте светят факелы и костры), бывают дождь, туман и снегопад. Павшие остаются на поле, взрывы оставляют воронки, армии протаптывают дороги.</p>' +
    '<p><b>Сохранение:</b> битва сохраняется сама раз в минуту и при сворачивании; «Продолжить битву» — в главном меню.</p>' +
    '<p><b>Быстрое управление:</b> кнопки внизу слева — «Все», «Пехота», «Стрелки», «Конница» (двойное касание — камера к ним). Кнопки 1–3 — отряды: выделите войска и удерживайте кнопку, чтобы сохранить; касание — выбрать. «Нанять» — найм из любого здания без поиска на карте. Двойное касание по мини-карте — отправить выделенные войска туда.</p>' +
    '<p><b>Герой:</b> круглые кнопки навыков справа работают всегда — даже если герой не выделен. Касание — выбрать цель на карте, <b>двойное касание — умный удар</b> по самой плотной группе врагов, удержание — описание навыка. «АВТО» — герой сам применяет навыки. «Держать строй» — бойцы стоят на месте, «Отступить» — бегут к цитадели.</p>' +
    '<p><b>Управление:</b> касание — выбрать; касание по земле — идти в атаку (бойцы бьют всех по пути); «Марш» — идти, не отвлекаясь. Касание по врагу — атаковать. Удержите палец и ведите — рамка выделения. Двойное касание по бойцу — все такие на экране. Два пальца — зум и прокрутка. Мини-карта — быстрый переход.</p>' +
    '<p><b>Аванпосты:</b> семь древних руин на карте. Встаньте рядом войсками и удержите — аванпост даст +4 золота/с и +10 к лимиту армии.</p>' +
    
    '<p><b>Отряды:</b> копейщики бьют кавалерию, кавалерия — стрелков, стрелки — пехоту. Бойцы с опытом становятся ветеранами (★).</p>' +
    '<p><b>Герои</b> нанимаются в цитадели, растут до 10 уровня и открывают навыки на 1, 2, 4 и 6 уровне. Павшего героя можно воскресить за полцены.</p>' +
    '<p><b>ПК:</b> ПКМ — приказ, колесо — зум, ЛКМ с протяжкой — рамка, 1–4 — навыки героя, Q — вся армия, B — строитель, E — книга сил, WASD — камера.</p>';
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
    (mode === 'local' ? '<button class="big alt" data-a="save">Сохранить битву</button>' : '') +
    '<button class="big alt" data-a="sound">Звук: ' + (Snd.on ? 'вкл' : 'выкл') + '</button>' +
    '<button class="big alt" data-a="music">Музыка: ' + (Snd.musicOn ? 'вкл' : 'выкл') + '</button>' +
    (mode === 'local' ? '<button class="big alt" data-a="speed">Скорость: ' + (speed === 1 ? 'обычная' : '×' + speed) + '</button>' : '') +
    '<button class="big alt" data-a="gfx">Графика: ' + (R.is3D ? '3D' : '2D') + '</button>' +
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
    if (Net.kind === 'mqtt' && !Net.connecting && !Net.failed) Net.connectPublic().then(() => { if (mode === 'menu' && $('scr').innerHTML.includes('Онлайн с друзьями</h2>')) onlineScreen(); });
    h += Net.failed ? '<div class="warn">Не удалось подключиться к серверу лобби. Проверьте интернет и попробуйте ещё раз.</div><div class="btns"><button class="big" data-a="online2">Повторить</button></div>' : '<p class="note">Подключение к серверу лобби…</p>';
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
    if (Net.kind === 'mqtt') h += '<h3>Комната</h3><div class="roomrow"><input type="text" id="room" maxlength="24" value="' + escapeHtml(Net.roomCode) + '" placeholder="public"><button class="big alt" data-a="room">Войти</button></div><p class="note">«public» — общая комната: ваше лобби увидят все игроки в интернете. Придумайте свой код и скажите его друзьям, чтобы играть только вместе.</p>';
    h += '<p class="note" style="margin-top:12px">Сейчас в комнате: ' + Net.peers.length + ' чел.' + (Net.kind === 'room' ? ' Друзей приглашайте через «Поделиться» у этой игры на claude.ai.' : '') + '</p>';
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
    const now = performance.now(); if (now - lobbyRenderT > 300 && document.activeElement && !['nick', 'room'].includes(document.activeElement.id)) { lobbyRenderT = now; onlineScreen(); }
  }
  if (mode === 'host') hostPeersChanged();
  if (mode === 'client') clientPeersChanged();
});

// ---------- game start ----------
let speed = 1, paused = false, loading = null;
function beginView() {
  hideScr(); stopAttract();
  $('palette').hidden = false; $('quick').hidden = false; $('bMenu').hidden = false; $('spells').hidden = false; $('spells').innerHTML = ''; closeBook(); UI.groups = [[], [], []]; quickSig = ''; ringSig = ''; spellSig = null; buildSig = ''; heroSig = ''; UI.buildOpen = false;
  requestAnimationFrame(measurePads); tipsIdx = store.get('tipsDone', false) || mode !== 'local' ? 99 : 0;
  UI.sel = new Set(); UI.cmode = null; UI.ghost = null; UI.panelSig = ''; heroSig = ''; prevIds = new Map();
  R.resize();
  const me = V.player(V.me); void me;
  R.cam.z = R.w < 700 ? 0.75 : 1;
  const st = START_POS[V.me]; R.centerOn(st[0], st[1]);
  Snd.play('horn'); Snd.setTheme(me ? me.race : 'hum');
  prewarm3();
  // local battles wait (paused) until the 3D buildings and the idle poses are baked
  if (mode === 'local') { loading = { total: R.is3D ? R.geoQ.length : QB.length + Q3.length }; paused = true; show('<div class="card" style="text-align:center"><h2>Подготовка армий…</h2><p class="lead" id="ldp">0%</p></div>'); }
  endShown = false; saveT = 60;
}
// bake the idle poses of every army on the field in all 8 facings (walk/attack frames bake on demand)
function prewarm3() {
  const todo = [];
  for (let i = 0; i < V.nplayers; i++) { const p = V.player(i); if (p) for (const sub of ['inf', 'spear', 'arch', 'cav', 'worker', 'h1', 'h2']) todo.push([DEF[p.race + '_' + sub], TEAM_COLORS[i], i === V.me]); }
  for (const k of ['wolf', 'bandit', 'troll']) todo.push([DEF[k], TEAM_COLORS[NEUTRAL], false]);
  todo.sort((a, b) => b[2] - a[2]);
  if (R.is3D) { const bl = []; for (let i = 0; i < V.nplayers; i++) { const p = V.player(i); if (p) for (const sub of ['fort', ...BUILD_ORDER]) bl.push([DEF[p.race + '_' + sub], TEAM_COLORS[i]]); } R.prewarm(todo, bl); return; }
  for (let i = 0; i < V.nplayers; i++) { const p = V.player(i); if (p) for (const sub of ['fort', ...BUILD_ORDER]) bld3(DEF[p.race + '_' + sub], TEAM_COLORS[i]); }
  for (const [d, col] of todo) if (d) for (let dir = 0; dir < 8; dir++) unit3(d, col, 0, dir, 0);
}
// ---------- save / load (local battles, localStorage) ----------
let saveT = 60;
function saveGame() {
  if (mode !== 'local' || !game || game.over !== -1) return false;
  try {
    const aiState = ais.map(a => { const o = {}; for (const k of Object.keys(a)) if (k !== 'g' && k !== 'r' && typeof a[k] !== 'function') o[k] = a[k]; return o; });
    store.set('save', { at: Date.now(), race: game.players[0].race, map: game.mapType, game: game.serialize(), ais: aiState, groups: UI.groups });
    return !!store.get('save', null);
  } catch (e) { console.warn('save', e); return false; }
}
function loadGame() {
  const sv = store.get('save', null); if (!sv || !sv.game) { toast('Сохранения нет'); return; }
  try {
    game = Game.load(sv.game);
    ais = (sv.ais || []).map(o => Object.assign(new AI(game, o.pi), o));
    R.setWorld(game.seed, game.mapType);
    V = makeLocalView(game, 0); mode = 'local'; paused = false; speed = 1; noteIdx = 0;
    beginView();
    UI.groups = sv.groups || [[], [], []];
    const f = game.byId.get(game.players[0].fort); if (f) R.centerOn(f.x, f.y);
    toast('Битва загружена · ' + fmtT(game.t));
  } catch (e) { console.error(e); toast('Сохранение повреждено'); store.set('save', null); menuMain(); }
}
function startLocal() {
  const n = [2, 4, 4][setup.modeN];
  const others = RACE_KEYS.filter(r => r !== setup.race);
  const rr = mkRng(Date.now() & 0xffff);
  const players = [{ race: setup.race, team: 0, name: 'Вы' }];
  for (let i = 1; i < n; i++) players.push({ race: others[Math.floor(rr() * others.length)], team: setup.modeN === 1 ? (i === 2 ? 0 : 1) : setup.modeN === 0 ? 1 : i, ai: true, diff: setup.diff, name: 'ИИ ' + i });
  if (setup.modeN === 1) { players[2].name = 'Союзник'; players[2].diff = 1; }
  game = new Game({ seed: (Date.now() % 100000) + 1, players, mapType: pickMap(setup.map) });
  ais = game.players.filter(p => p.ai).map(p => new AI(game, p.i));
  R.setWorld(game.seed, game.mapType);
  V = makeLocalView(game, 0); mode = 'local'; paused = false; speed = 1;
  beginView();
  toast('Карта: ' + mapName(game.mapType));
}
function startHost() {
  const slots = lobby.slots;
  lobby.started = true;
  const seed = (Date.now() % 100000) + 1;
  const players = slots.map((s, i) => ({ race: s.race, team: s.team, ai: s.k === 'ai', diff: s.diff === undefined ? 1 : s.diff, remote: s.k === 'p', peer: s.peer, name: s.nm || (s.k === 'ai' ? 'ИИ ' + i : 'Игрок') }));
  const mapType = pickMap(setup.map);
  game = new Game({ seed, players, online: true, mapType });
  if (players.length > 2) game.popMax = 22;
  ais = game.players.filter(p => p.ai).map(p => new AI(game, p.i));
  R.setWorld(seed, mapType);
  V = makeLocalView(game, 0); mode = 'host'; paused = false; speed = 1;
  hostSeq = {};
  Net.set({ lob: { gid: lobby.gid, st: 1, seed, map: mapType, sl: slots.map(s => ({ k: s.k, peer: s.peer, race: s.race, team: s.team, nm: s.nm })) } });
  beginView();
}
function startClient(lob, idx) {
  lobby.started = true;
  const players = lob.sl.map((s, i) => ({ race: s.race, team: s.team, name: s.nm || ('Игрок ' + (i + 1)) }));
  game = null; ais = [];
  R.setWorld(lob.seed, lob.map);
  V = makeClientView(idx, players, lob.seed, lob.map); mode = 'client';
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
    case 'online2': Net.failed = false; onlineScreen(); break;
    case 'gfx': store.set('gfx', R.is3D ? '2d' : '3d'); if (mode === 'local') saveGame(); if (mode === 'host' || mode === 'client') { toast('Графика сменится после битвы'); break; } location.reload(); break;
    case 'room': { const rv = $('room'); if (rv) { Net.setRoom(rv.value); store.set('room', Net.roomCode); } onlineScreen(); break; }
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
    case 'sound': Snd.setOn(!Snd.on); store.set('snd', Snd.on); Snd.init(); menuPause(); break;
    case 'music': Snd.setMusic(!Snd.musicOn); store.set('music', Snd.musicOn); Snd.init(); menuPause(); break;
    case 'map': setup.map = v; store.set('map', v); menuSkirm(); break;
    case 'save': if (saveGame()) toast('Битва сохранена'); else toast('Не удалось сохранить'); break;
    case 'load': loadGame(); break;
    case 'speed': speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; menuPause(); break;
    case 'quit': if (mode === 'local') store.set('save', null); if (V && (mode === 'local' || mode === 'host')) game.cmd(V.me, { c: 'surrender' }); else if (mode === 'client') V.send({ c: 'surrender' }); setTimeout(() => { leaveGame(); menuMain(); }, mode === 'client' ? 400 : 0); break;
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
  $('palette').hidden = true; $('quick').hidden = true; $('bMenu').hidden = true; $('spells').hidden = true; $('buildpanel').hidden = true; closeBook(); hint('');
}

// ---------- attract mode (AI battle behind menus) ----------
function startAttract() {
  if (attract) return;
  const mt = MAP_TYPES[(attractN++) % MAP_TYPES.length].k;
  const g = new Game({ seed: 4242, mapType: mt, players: [0, 1, 2, 3].map(i => ({ race: RACE_KEYS[(i + attractN * 2) % RACE_KEYS.length], team: i, ai: true, diff: 2 })) });
  const as = g.players.map(p => new AI(g, p.i));
  for (let k = 0; k < 20 * 50; k++) { for (const a of as) a.step(TICK); for (const e of g.ents) { e.px = e.x; e.py = e.y; } g.step(TICK); }
  attract = { g, as, view: makeLocalView(g, -1), acc: 0 };
  R.setWorld(4242, mt); R.resize(); Snd.setTheme('menu'); Snd.setIntensity(0); R.cam.z = R.w < 700 ? 0.8 : 1.05; R.centerOn(MAP_W / 2, MAP_H / 2);
}
function stopAttract() { attract = null; }
let attractN = 0;

// ---------- corpses / fx sounds ----------
let prevIds = new Map(), lastFxSeen = 0, endShown = false;
function trackDeaths() {
  const cur = new Map();
  for (const e of V.ents) cur.set(e.id, e);
  for (const [id, e] of prevIds) if (!cur.has(id)) {
    R.addCorpse(e, V.time, e.eqv | 0);
    if (e.d.kind === 'b' || e.d.hero) { R.shake = Math.max(R.shake, e.d.sub === 'fort' ? 1 : 0.4); if (inScreen(e)) Snd.play('boom'); }
    else if (inScreen(e) && Math.random() < 0.3) Snd.play('death', 0.5, panOf(e));
    UI.sel.delete(id);
  }
  prevIds = cur;
}
function panOf(e) { return clamp(((e.rx - R.cam.x) * R.cam.z / R.w) * 2 - 1, -1, 1) * 0.7; }
// melee clashes, cavalry, battle intensity for the music, weather ambience
function battleSounds(dt) {
  let hits = 0, gallop = false;
  for (const e of V.ents) {
    if (e.d.kind !== 'u') continue;
    const at = e.atkT || 0, rising = at > (e.pAtk || 0) + 0.05; e.pAtk = at;
    if (!inScreen(e)) continue;
    if (rising && !e.d.proj) { hits++; if (Math.random() < 0.45) Snd.play(Math.random() < 0.7 ? 'clash' : 'hit', 0.6, panOf(e)); }
    if (e.moving && (e.d.sub === 'cav' || e.d.sub === 'wolf')) gallop = true;
  }
  if (gallop) Snd.play('gallop', 0.5);
  battleHeat = battleHeat * Math.exp(-dt * 0.6) + hits * 0.02;
  Snd.setIntensity(battleHeat);
  if (R.env) Snd.ambience(R.env.weather, R.env.wAmt);
}
let battleHeat = 0;
function fxSounds() {
  for (const f of V.fx) {
    if (f.id <= lastFxSeen && V.kind === 'local') continue;
    if (V.kind === 'client' && f.snd) continue;
    f.snd = 1;
    if (f.id > lastFxSeen) lastFxSeen = f.id;
    const s = R.toScreen(f.x2 !== undefined ? f.x2 : f.x, f.y2 !== undefined ? f.y2 : f.y);
    if (s.x < -50 || s.y < -50 || s.x > R.w + 50 || s.y > R.h + 50) continue;
    if (f.k === 'arrow' || f.k === 'bolt' || f.k === 'javelin' || f.k === 'farrow') Snd.play('arrow', 0.5);
    else if (f.k === 'boom') { Snd.play('boom'); R.shake = Math.max(R.shake, 0.35); }
    else if (f.k === 'heal' || f.k === 'buff') Snd.play('heal');
    else if (f.k === 'lvl') Snd.play('lvl');
  }
}

// ---------- first-game tips ----------
let tipsIdx = 99;
const TIPS = [
  { t: 1.5, text: 'Совет: нажмите на строителя (или «Строит.» в круге команд) — справа выедут здания. Начните с фермы.', done: () => V.ents.some(e => e.owner === V.me && e.d.sub === 'farm') },
  { t: 18, text: 'Совет: постройте казармы и нанимайте батальоны, нажав на здание.', done: () => V.ents.some(e => e.owner === V.me && e.d.sub === 'barr') },
  { t: 45, text: 'Совет: наймите героя — нажмите на портрет слева вверху или на цитадель.', done: () => V.heroes(V.me).some(h => h.recruited) },
  { t: 80, text: 'Совет: флаги на карте — аванпосты. Приведите туда войска, чтобы захватить.', done: () => (V.outposts || []).some(o => o.owner === V.me) },
  { t: 60, text: 'Совет: над картой — Книга сил ✦. За победы дают очки: изучайте силы, они появятся слева.', done: () => { const P = V.player(V.me); return Object.keys(P.spells || {}).length > 0; } },
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
        R.draw({ ents: g.ents, fx: g.fx, me: -1, sel: new Set(), time: attract.view.time, outposts: g.outposts, relic: g.relic, gameT: g.t, ups: attract.view.ups });
      }
      return;
    }
    if (!V) return;
    if (loading) {
      const t0 = performance.now(); if (R.is3D) R.pumpGeos(45); else if (pumpBld3(40) === 0) pumpUnit3(40 - (performance.now() - t0));
      const left = R.is3D ? R.geoQ.length : QB.length + Q3.length, el = $('ldp'); if (el) el.textContent = Math.round((1 - left / Math.max(1, loading.total)) * 100) + '%';
      if (!left || !el) { loading = null; hideScr(); paused = false; }
    }
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
      while (noteIdx < game.notes.length) { const n = game.notes[noteIdx++]; if (n.p === V.me && game.t - n.t < 2) { toast(n.text, n.x, n.y); if (n.text.includes('сокровище')) Snd.play('coins'); else if (n.text.includes('улучшение готово')) Snd.play('anvil'); } }
      if (mode === 'local' && !paused) { saveT -= dt; if (saveT <= 0) { saveT = 60; saveGame(); } }
      if (noteIdx > game.notes.length) noteIdx = game.notes.length;
    }
    V.prep(alpha);
    if (game && game.notes.length >= 30 && noteIdx >= 30) noteIdx = game.notes.length - 1;
    trackDeaths(); fxSounds(); battleSounds(dt);
    // ghost/skill range
    const S = { ents: V.ents, fx: V.fx, me: V.me, sel: UI.sel, time: V.time, ghost: UI.ghost, outposts: V.outposts, relic: V.relic, gameT: V.gameT, ups: V.ups };
    if (R.is3D) drawOverlay(now / 1000);
    R.draw(S);
    if (!R.is3D) drawOverlay(now / 1000);
    drawBoxRect();
    uiT -= dt;
    if (uiT <= 0) { uiT = 0.15; updateHud(); updateRing(); updateBuildPanel(); updateQuick(); V.alerts = UI.alerts; R.drawMini(mini, V); runTips(); if (Math.random() < 0.05) measurePads(); }
    if (V.over !== -1 && V.over !== undefined && !endShown) {
      endShown = true; if (mode === 'local') store.set('save', null);
      const myTeam = V.teamOf(V.me);
      setTimeout(() => endScreen(V.over === myTeam), 1200);
    }
  } catch (err) { console.error(err); if (!window.__errShown) { window.__errShown = 1; toast('Ошибка: ' + err.message); } }
}
function drawOverlay(now) {
  R.beginOverlay();
  if (UI.targetMark) { const tm = UI.targetMark, e = V.get(tm.id), a = now - tm.t; if (!e || a > 1.6) UI.targetMark = null; else { const rr = e.r * (1.5 + 0.25 * Math.sin(a * 12)); R.gDisc(e.rx, e.ry, rr, '#ff3c28', 0.12); R.gRing(e.rx, e.ry, rr, '#ff4632', 1 - a / 1.6, 2.5); for (let k = 0; k < 4; k++) { const an = k * Math.PI / 2 + a * 2; R.gLine(e.rx + Math.cos(an) * rr * 1.25, e.ry + Math.sin(an) * rr * 1.25, e.rx + Math.cos(an) * rr * 0.85, e.ry + Math.sin(an) * rr * 0.85, '#ff5a3c', 0.9, 2); } } }
  if (UI.moveMark && now - UI.moveMark.t < 0.9) { const m = UI.moveMark, a = (now - m.t) / 0.9; for (let k = 0; k < 3; k++) { const an = -Math.PI / 2 + (k - 1) * 0.5; R.gLine(m.x, m.y, m.x + Math.cos(an) * (22 + a * 10), m.y + Math.sin(an) * (R.is3D ? 22 + a * 10 : 12 + a * 5), '#f6e27a', 0.8 * (1 - a), 2); } }
  UI.pings = UI.pings.filter(p => now - p.t < 0.6);
  for (const p of UI.pings) { const a = (now - p.t) / 0.6; R.gRing(p.x, p.y, 8 + a * 16, p.col, 1, 2.5 * (1 - a) + 0.5); }
  if (UI.cmode && UI.cmode.t === 'power' && hoverW) { R.gDisc(hoverW.x, hoverW.y, UI.cmode.radius, '#ff7832', 0.15); R.gRing(hoverW.x, hoverW.y, UI.cmode.radius, '#ffb35a', 1, 2); }
  if (UI.cmode && UI.cmode.t === 'skill') {
    const h = V.get(UI.cmode.h);
    if (h) { R.gDisc(h.rx, h.ry, UI.cmode.range, '#ffc864', 0.06); R.gRing(h.rx, h.ry, UI.cmode.range, '#ffc864', 0.6, 1.5); }
    if (hoverW) { R.gDisc(hoverW.x, hoverW.y, UI.cmode.radius, '#ff7832', 0.15); R.gRing(hoverW.x, hoverW.y, UI.cmode.radius, '#ffb35a', 1, 2); }
  }
  R.endOverlay();
}
function drawBoxRect() {
  const c = R.c, dpr = R.dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (boxRect) { c.fillStyle = 'rgba(246,226,122,0.12)'; c.strokeStyle = '#f6e27a'; c.lineWidth = 1.5; const x = Math.min(boxRect.x0, boxRect.x1), y = Math.min(boxRect.y0, boxRect.y1), w = Math.abs(boxRect.x1 - boxRect.x0), h = Math.abs(boxRect.y1 - boxRect.y0); c.fillRect(x, y, w, h); c.strokeRect(x, y, w, h); }
}
function measurePads() { const b = $('palette'), t = $('quick'); R.padB = b.hidden ? 0 : Math.round(b.offsetHeight * 0.6); document.documentElement.style.setProperty('--bh', R.padB + 'px'); R.padT = t.hidden ? 0 : t.offsetTop + t.offsetHeight; }
window.addEventListener('resize', () => { R.resize(); measurePads(); UI.panelSig = ''; });
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'local' && !loading) { saveGame(); paused = true; menuPause(); } });

// ---------- boot ----------
R.resize();
menuMain();
requestAnimationFrame(frame);
Net.init().then(() => { if (mode === 'menu' && $('scr').innerHTML.includes('Онлайн с друзьями</h2>')) onlineScreen(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { UI.panelSig = ''; });
window.__AK = { get game() { return game; }, get V() { return V; }, R, UI, Net, startLocal, setup, get mode() { return mode; } };
