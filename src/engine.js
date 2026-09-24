// ================= ENGINE: deterministic-ish simulation =================
const TICK = 0.05;
const MAP_W = 3200, MAP_H = 2200;
function mkRng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const START_POS = [[360, 360], [MAP_W - 360, MAP_H - 360], [MAP_W - 360, 360], [360, MAP_H - 360]];

class Game {
  constructor(cfg) {
    this.cfg = cfg;
    this.seed = cfg.seed || 1;
    this.rand = mkRng(this.seed);
    this.t = 0; this.nextId = 1;
    this.ents = []; this.byId = new Map();
    this.proj = []; this.fx = []; this.fxSeq = 1; this.pending = [];
    this.notes = []; // {p, text, t}
    this.over = -1; // winning team
    this.popMax = cfg.online ? 30 : 40;
    this.auraT = 0;
    this.outposts = OUTPOSTS.map(([x, y]) => ({ x, y, owner: -1, prog: 0, cap: -1 }));
    this.players = cfg.players.map((p, i) => ({
      i, race: p.race, team: p.team, ai: !!p.ai, diff: p.diff || 1, remote: !!p.remote, name: p.name || ('Игрок ' + (i + 1)),
      color: TEAM_COLORS[i], gold: 900, alive: true, heroes: {}, start: START_POS[i], kills: 0, lost: 0, lastAlert: -99, power: 0, pcd: [0, 0, 0], peer: p.peer || null,
    }));
    for (const p of this.players) {
      const [sx, sy] = p.start;
      const f = this.spawn(p.race + '_fort', p.i, sx, sy);
      p.fort = f.id;
      const toC = Math.atan2(MAP_H / 2 - sy, MAP_W / 2 - sx);
      for (let k = 0; k < 3; k++) {
        const a = toC + (k - 1) * 0.5;
        this.spawn(p.race + '_inf', p.i, sx + Math.cos(a) * 110, sy + Math.sin(a) * 110);
      }
      for (const h of HEROES[p.race]) p.heroes[h.key] = { id: 0, dead: false, recruited: false };
    }
  }
  spawn(key, owner, x, y, opt) {
    const d = DEF[key];
    const e = { id: this.nextId++, d, owner, x, y, px: x, py: y, hp: d.hp, maxhp: d.hp, r: d.r, order: null, tgt: 0, cd: 0, face: 1,
      buffs: [], aura: {}, xp: 0, rank: 0, kills: 0, lvl: 1, scd: [0, 0, 0, 0], stun: 0, built: 1, queue: [], rally: null, life: 0,
      atk: 0, moving: 0, dead: false, scanT: this.rand() * 0.4, anchor: { x, y }, stuckT: 0 };
    if (d.kind === 'b' && opt && opt.construct) { e.built = 0; e.hp = d.hp * 0.1; }
    this.ents.push(e); this.byId.set(e.id, e);
    return e;
  }
  enemy(a, b) { return a !== b && this.players[a] && this.players[b] && this.players[a].team !== this.players[b].team; }
  addFx(k, x, y, x2, y2, p, dur) { const f = { id: this.fxSeq++, k, x, y, x2, y2, p: p || 0, t0: this.t, dur: dur || 0.5 }; this.fx.push(f); return f; }
  note(p, text, x, y) { this.notes.push({ p, text, t: this.t, x: x === undefined ? -1 : Math.round(x), y: y === undefined ? -1 : Math.round(y) }); if (this.notes.length > 30) this.notes.shift(); }

  // ---- stats ----
  statAdd(e, s) { let v = e.aura[s] || 0; for (const b of e.buffs) if (b.s === s) v += b.v; return v; }
  mult(e, s) { return Math.max(0.2, 1 + this.statAdd(e, s)); }
  rankMul(e) { return 1 + 0.15 * e.rank + (e.d.hero ? 0.08 * (e.lvl - 1) : 0); }
  income(p) {
    if (!p.alive) return 0;
    let farms = 0; for (const e of this.ents) if (e.owner === p.i && e.d.sub === 'farm' && e.built >= 1 && !e.dead) farms++;
    let inc = 5 + 3 * Math.min(farms, 10) + 4 * this.outposts.filter(o => o.owner === p.i).length;
    if (p.ai) inc *= [0.75, 1, 1.35][p.diff] || 1;
    return inc;
  }
  popInfo(pi) {
    let used = 0, farms = 0;
    for (const e of this.ents) {
      if (e.owner !== pi || e.dead) continue;
      if (e.d.kind === 'u' && !e.d.hero && !e.d.summon) used += e.d.pop;
      if (e.d.sub === 'farm' && e.built >= 1) farms++;
      if (e.d.kind === 'b') for (const q of e.queue) if (!q.hero) used += DEF[q.u].pop;
    }
    return { used, cap: Math.min(this.popMax, 12 + 4 * farms + 3 * this.outposts.filter(o => o.owner === pi).length) };
  }

  // ---- damage ----
  damage(src, tgt, amt, skill) {
    if (!tgt || tgt.dead) return;
    let a = amt;
    if (!skill && src) { const b = BONUS[src.d.cls]; if (b && b[tgt.d.cls]) a *= b[tgt.d.cls]; }
    if (skill && tgt.d.kind === 'b') a *= 0.5;
    const arm = clamp((tgt.d.armor || 0) + this.statAdd(tgt, 'armor'), 0, 0.8);
    a *= 1 - arm;
    tgt.hp -= a;
    const p = this.players[tgt.owner];
    if (p && this.t - p.lastAlert > 12 && (tgt.d.kind === 'b' || tgt.d.hero)) { p.lastAlert = this.t; this.note(tgt.owner, tgt.d.kind === 'b' ? tgt.d.name + ' атакована! Нажмите, чтобы перейти' : 'Герой ' + tgt.d.heroName + ' в бою!', tgt.x, tgt.y); }
    if (tgt.hp <= 0) this.kill(tgt, src);
  }
  heal(e, amt) { if (!e.dead) e.hp = Math.min(e.maxhp, e.hp + amt); }
  kill(e, src) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    const p = this.players[e.owner];
    if (p) p.lost++;
    if (src && src.owner !== e.owner && this.players[src.owner]) {
      this.players[src.owner].power = Math.min(200, this.players[src.owner].power + (e.d.cost || 70) * (e.d.kind === 'b' ? 0.05 : 0.08));
      this.players[src.owner].kills++;
      const val = (e.d.cost || 70) * (e.d.kind === 'b' ? 0.25 : 0.6) + (e.d.hero ? 250 : 0);
      if (src.d.hero && !src.dead) this.giveXp(src, val);
      for (const h of this.ents) if (h.d.hero && !h.dead && h.owner === src.owner && h !== src && dist(h, e) < 480) this.giveXp(h, val * 0.5);
      if (!src.d.hero && src.d.kind === 'u') { src.kills++; const nr = src.kills >= 6 ? 2 : src.kills >= 2 ? 1 : 0; if (nr > src.rank) { const f = (1 + 0.15 * nr) / (1 + 0.15 * src.rank); src.maxhp *= f; src.hp *= f; src.rank = nr; } }
    }
    if (e.d.hero && p) { const hs = p.heroes[e.d.key.split('_')[1]]; if (hs) { hs.dead = true; hs.id = 0; hs.lvl = e.lvl; } this.note(e.owner, 'Герой ' + e.d.heroName + ' пал! Воскресите его в цитадели.'); }
    if (e.d.sub === 'fort' && p && p.alive) this.eliminate(p, src);
  }
  giveXp(h, v) {
    if (h.lvl >= 10) return;
    h.xp += v;
    let need = 120 * h.lvl;
    while (h.xp >= need && h.lvl < 10) {
      h.xp -= need; h.lvl++; need = 120 * h.lvl;
      const f = (1 + 0.08 * (h.lvl - 1)) / (1 + 0.08 * (h.lvl - 2));
      h.maxhp *= f; h.hp = Math.min(h.maxhp, h.hp * f + h.maxhp * 0.2);
      this.addFx('lvl', h.x, h.y, h.x, h.y, 0, 1.2);
      const sk = h.d.skills.find(s => s.lvl === h.lvl);
      if (sk) this.note(h.owner, h.d.heroName + ' достиг ' + h.lvl + ' ур. — новый навык: ' + sk.name);
    }
    if (h.lvl >= 10) h.xp = 0;
  }
  eliminate(p, src) {
    p.alive = false;
    for (const e of this.ents) if (e.owner === p.i && !e.dead) { e.dead = true; e.hp = 0; }
    for (const q of this.players) this.note(q.i, p.name + ' (' + RACES[p.race].short + ') повержен!');
    const teams = new Set(this.players.filter(q => q.alive).map(q => q.team));
    if (teams.size <= 1) this.over = teams.size ? [...teams][0] : -2;
  }

  // ---- queries ----
  findEnemy(e, R, unitsOnly) {
    let best = null, bd = 1e9;
    for (const o of this.ents) {
      if (o.dead || !this.enemy(e.owner, o.owner)) continue;
      if (unitsOnly && o.d.kind !== 'u') continue;
      const dd = Math.hypot(o.x - e.x, o.y - e.y) - o.r;
      if (dd > R) continue;
      const score = dd + (o.d.kind === 'b' ? 120 : 0);
      if (score < bd) { bd = score; best = o; }
    }
    return best;
  }
  unitsIn(x, y, R, pred) { const out = []; for (const o of this.ents) if (!o.dead && pred(o) && Math.hypot(o.x - x, o.y - y) <= R + o.r) out.push(o); return out; }

  // ---- building placement ----
  canPlace(pi, key, x, y) {
    const d = DEF[key]; if (!d) return false;
    if (x < d.r + 20 || y < d.r + 20 || x > MAP_W - d.r - 20 || y > MAP_H - d.r - 20) return false;
    let near = false;
    for (const o of this.ents) {
      if (o.dead) continue;
      const dd = Math.hypot(o.x - x, o.y - y);
      if (o.d.kind === 'b') {
        if (dd < o.r + d.r + 12) return false;
        if (o.owner === pi && ((o.d.sub === 'fort' && dd < 560) || dd < o.r + d.r + 230)) near = true;
        if (this.enemy(pi, o.owner) && dd < 380) return false;
      }
    }
    return near;
  }

  // ---- commands ----
  cmd(pi, c) {
    const p = this.players[pi]; if (!p || !p.alive || this.over !== -1 || !c) return;
    const own = id => { const e = this.byId.get(id); return e && !e.dead && e.owner === pi ? e : null; };
    switch (c.c) {
      case 'move': case 'atk': case 'stop': {
        const us = (c.ids || []).slice(0, 80).map(own).filter(e => e && e.d.kind === 'u');
        if (!us.length) return;
        if (c.c === 'stop') { for (const e of us) { e.order = null; e.tgt = 0; e.anchor = { x: e.x, y: e.y }; } return; }
        if (c.c === 'atk') { const t = this.byId.get(c.t); if (!t || t.dead) return; for (const e of us) { e.order = { t: 'atk', id: t.id }; e.tgt = t.id; } return; }
        const x = clamp(+c.x || 0, 20, MAP_W - 20), y = clamp(+c.y || 0, 20, MAP_H - 20);
        // formation: sort by class so melee go front
        let cx = 0, cy = 0; for (const e of us) { cx += e.x; cy += e.y; } cx /= us.length; cy /= us.length;
        const ang = Math.atan2(y - cy, x - cx);
        const order = us.slice().sort((a, b) => (a.d.range > 60) - (b.d.range > 60));
        const cols = Math.max(1, Math.ceil(Math.sqrt(us.length * 1.6)));
        const sp = 30;
        order.forEach((e, i) => {
          const row = Math.floor(i / cols), col = i % cols;
          const lx = -row * sp, ly = (col - (cols - 1) / 2) * sp;
          const tx = x + lx * Math.cos(ang) - ly * Math.sin(ang), ty = y + lx * Math.sin(ang) + ly * Math.cos(ang);
          e.order = { t: c.a ? 'amove' : 'move', x: clamp(tx, 15, MAP_W - 15), y: clamp(ty, 15, MAP_H - 15) }; e.tgt = 0; e.stuckT = 0;
        });
        return;
      }
      case 'train': {
        const b = own(c.b); if (!b || b.d.kind !== 'b' || b.built < 1 || !b.d.trains || !b.d.trains.includes(c.u)) return;
        const u = DEF[c.u]; if (!u || b.queue.length >= 6 || p.gold < u.cost) return;
        const pop = this.popInfo(pi); if (pop.used + u.pop > pop.cap) { if (!p.ai) this.note(pi, 'Нужно больше ферм (лимит армии)'); return; }
        p.gold -= u.cost; b.queue.push({ u: c.u, t: 0, cost: u.cost }); return;
      }
      case 'hero': {
        const b = own(c.b); if (!b || b.d.sub !== 'fort') return;
        const hs = p.heroes[c.h]; const key = p.race + '_' + c.h; const d = DEF[key];
        if (!hs || !d || hs.id || b.queue.some(q => q.u === key)) return;
        const cost = hs.recruited ? Math.round(d.cost * 0.5) : d.cost;
        if (p.gold < cost) return;
        p.gold -= cost; b.queue.push({ u: key, t: 0, cost, hero: true }); return;
      }
      case 'cancel': {
        const b = own(c.b); if (!b || !b.queue.length) return;
        const q = b.queue.pop(); p.gold += q.cost; return;
      }
      case 'build': {
        const key = p.race + '_' + c.t; const d = DEF[key];
        if (!d || !BUILD_ORDER.includes(c.t) || p.gold < d.cost) return;
        if (c.t === 'farm') { let n = 0; for (const e of this.ents) if (e.owner === pi && !e.dead && e.d.sub === 'farm') n++; if (n >= 10) { this.note(pi, 'Максимум 10 ферм'); return; } }
        if (!this.canPlace(pi, key, c.x, c.y)) return;
        p.gold -= d.cost; const b = this.spawn(key, pi, c.x, c.y, { construct: true });
        b.rally = null; return;
      }
      case 'auto': { const hk = c.hk === 'h2' ? 'h2' : 'h1'; p.heroes[hk].auto = !!c.on; const h = this.byId.get(p.heroes[hk].id); if (h) h.auto = !!c.on; return; }
      case 'hold': case 'retreat': {
        const us = (c.ids || []).slice(0, 80).map(own).filter(e => e && e.d.kind === 'u'); if (!us.length) return;
        if (c.c === 'hold') { for (const e of us) { e.order = { t: 'hold' }; e.tgt = 0; e.anchor = { x: e.x, y: e.y }; } return; }
        const f = this.byId.get(p.fort); if (!f) return;
        const toC = Math.atan2(MAP_H / 2 - f.y, MAP_W / 2 - f.x);
        this.cmd(pi, { c: 'move', ids: us.map(e => e.id), x: f.x + Math.cos(toC) * (f.r + 80), y: f.y + Math.sin(toC) * (f.r + 80), a: 0 });
        return;
      }
      case 'rally': { const b = own(c.b); if (b && b.d.kind === 'b') b.rally = { x: clamp(c.x, 10, MAP_W - 10), y: clamp(c.y, 10, MAP_H - 10) }; return; }
      case 'skill': { const h = own(c.h); if (h && h.d.hero) this.tryCast(h, c.s | 0, +c.x || h.x, +c.y || h.y); return; }
      case 'power': {
        const k = c.k | 0, pw = POWERS[k]; if (!pw || p.pcd[k] > 0 || p.power < pw.cost) return;
        const x = clamp(+c.x || 0, 20, MAP_W - 20), y = clamp(+c.y || 0, 20, MAP_H - 20);
        const fort = this.byId.get(p.fort); if (!fort) return;
        p.power -= pw.cost; p.pcd[k] = pw.cd;
        const nm = POWER_NAMES[p.race][k][0];
        if (pw.k === 'heal') { for (const o of this.unitsIn(x, y, pw.radius, o => o.owner === pi && o.d.kind === 'u')) this.heal(o, pw.heal); this.addFx('heal', x, y, x, y, pw.radius, 1.2); }
        if (pw.k === 'reinf') {
          const toC = Math.atan2(MAP_H / 2 - fort.y, MAP_W / 2 - fort.x);
          for (let i = 0; i < pw.count; i++) { const a = toC + (i - 1.5) * 0.35; const u = this.spawn(p.race + '_' + (i % 2 ? 'spear' : 'inf'), pi, fort.x + Math.cos(a) * (fort.r + 30), fort.y + Math.sin(a) * (fort.r + 30)); this.addFx('summon', u.x, u.y, u.x, u.y, 30, 0.8); }
        }
        if (pw.k === 'meteor') {
          this.addFx('mark', x, y, x, y, pw.radius, pw.delay);
          const f = this.addFx('fireball', x - 200, y - 500, x, y, 0, pw.delay); f.big = 1;
          this.pending.push({ at: this.t + pw.delay, fn: () => { for (const o of this.unitsIn(x, y, pw.radius, o => this.enemy(pi, o.owner))) this.damage({ d: { cls: 'hero' }, owner: pi }, o, pw.dmg, true); this.addFx('boom', x, y, x, y, pw.radius, 0.8).c = 'fire'; } });
        }
        for (const q of this.players) if (q.i === pi || this.enemy(pi, q.i)) this.note(q.i, (q.i === pi ? 'Сила: ' : 'Враг применил силу: ') + nm);
        return;
      }
      case 'surrender': { if (p.alive) { const f = this.byId.get(p.fort); if (f) this.kill(f, null); } return; }
    }
  }

  // ---- hero auto-cast (used by AI and by players' "auto" toggle) ----
  autoCastHero(h) {
    const pi = h.owner; const center = list => { let x = 0, y = 0; for (const o of list) { x += o.x; y += o.y; } return { x: x / list.length, y: y / list.length }; };
    h.d.skills.forEach((sk, si) => {
      if (!this.skillReady(h, si) || (h.order && h.order.t === 'cast')) return;
      const R = sk.range || sk.radius;
      const foes = this.unitsIn(h.x, h.y, Math.max(R, 200), o => this.enemy(pi, o.owner) && o.d.kind === 'u');
      if (sk.type === 'heal') {
        const hurt = this.unitsIn(h.x, h.y, sk.range, o => o.owner === pi && o.d.kind === 'u' && o.hp < o.maxhp * 0.6);
        if (hurt.length >= 2 || (hurt.length && hurt[0].d.hero)) { const c = center(hurt); this.tryCast(h, si, c.x, c.y); }
        return;
      }
      if (!foes.length) return;
      if (sk.type === 'buff' || sk.type === 'summon' || sk.type === 'debuff') { if (foes.length >= 3) this.tryCast(h, si, h.x, h.y); return; }
      if (sk.type === 'strike') { const near = foes.filter(o => Math.hypot(o.x - h.x, o.y - h.y) < sk.radius); if (near.length >= 3 || (near.length && near[0].d.hero)) this.tryCast(h, si, h.x, h.y); return; }
      if (foes.length >= 2 || foes[0].d.hero) { const c = center(foes); this.tryCast(h, si, c.x, c.y); }
    });
  }

  // ---- skills ----
  skillReady(h, si) { const sk = h.d.skills[si]; return sk && sk.type !== 'aura' && h.lvl >= sk.lvl && h.scd[si] <= 0 && !h.dead; }
  tryCast(h, si, x, y) {
    if (!this.skillReady(h, si)) return false;
    const sk = h.d.skills[si];
    if (sk.range) {
      const dd = Math.hypot(x - h.x, y - h.y);
      if (dd > sk.range) { h.order = { t: 'cast', s: si, x, y }; h.tgt = 0; return true; }
    }
    this.doCast(h, si, x, y); return true;
  }
  doCast(h, si, x, y) {
    const sk = h.d.skills[si]; const lv = 1 + 0.07 * (h.lvl - 1);
    h.scd[si] = sk.cd; h.atk = 0.35;
    const foes = (cx, cy, R) => this.unitsIn(cx, cy, R, o => this.enemy(h.owner, o.owner));
    const allies = (cx, cy, R) => this.unitsIn(cx, cy, R, o => !this.enemy(h.owner, o.owner) && o.d.kind === 'u');
    const col = FX_COLORS[sk.fx] ? sk.fx : 'def';
    switch (sk.type) {
      case 'dash': {
        const a = Math.atan2(y - h.y, x - h.x), dd = Math.min(sk.range, Math.hypot(x - h.x, y - h.y));
        const nx = clamp(h.x + Math.cos(a) * dd, 20, MAP_W - 20), ny = clamp(h.y + Math.sin(a) * dd, 20, MAP_H - 20);
        this.addFx('dash', h.x, h.y, nx, ny, 0, 0.4);
        h.x = nx; h.y = ny; h.order = null; h.anchor = { x: nx, y: ny };
        for (const o of foes(nx, ny, sk.radius)) { this.damage(h, o, sk.dmg * lv, true); if (sk.stun && o.d.kind === 'u') o.stun = Math.max(o.stun, sk.stun); }
        this.addFx('boom', nx, ny, nx, ny, sk.radius, 0.5);
        break;
      }
      case 'strike': x = h.x; y = h.y; // fallthrough
      case 'aoe': {
        const delay = sk.delay || (sk.proj ? Math.hypot(x - h.x, y - h.y) / 600 : 0);
        if (sk.proj) this.addFx(sk.proj, h.x, h.y - 14, x, y, 0, delay);
        if (sk.delay) this.addFx('mark', x, y, x, y, sk.radius, sk.delay);
        this.pending.push({ at: this.t + delay, fn: () => {
          for (const o of foes(x, y, sk.radius)) { this.damage(h.dead ? null : h, o, sk.dmg * lv, true); if (sk.stun && o.d.kind === 'u' && !o.dead) o.stun = Math.max(o.stun, sk.stun); }
          this.addFx('boom', x, y, x, y, sk.radius, 0.6).c = col;
        } });
        break;
      }
      case 'heal': {
        for (const o of allies(x, y, sk.radius)) this.heal(o, sk.heal * lv);
        this.addFx('heal', x, y, x, y, sk.radius, 0.9);
        break;
      }
      case 'buff': case 'debuff': {
        const list = sk.type === 'buff' ? allies(h.x, h.y, sk.radius) : foes(h.x, h.y, sk.radius).filter(o => o.d.kind === 'u');
        for (const o of list) for (const [s, v] of sk.buffs) { o.buffs = o.buffs.filter(b => !(b.s === s && b.src === sk.name)); o.buffs.push({ s, v: v * (sk.type === 'buff' ? lv : 1), until: this.t + sk.dur, src: sk.name }); }
        this.addFx(sk.type, h.x, h.y, h.x, h.y, sk.radius, 0.9);
        break;
      }
      case 'summon': {
        for (let k = 0; k < sk.count; k++) {
          const a = this.rand() * Math.PI * 2;
          const s = this.spawn(sk.unit, h.owner, clamp(h.x + Math.cos(a) * 50, 20, MAP_W - 20), clamp(h.y + Math.sin(a) * 50, 20, MAP_H - 20));
          s.life = sk.dur; s.maxhp = s.hp = s.d.hp * lv;
          this.addFx('summon', s.x, s.y, s.x, s.y, 30, 0.8);
        }
        break;
      }
      case 'volley': {
        for (let k = 0; k < sk.count; k++) {
          const a = this.rand() * Math.PI * 2, rr = Math.sqrt(this.rand()) * sk.radius;
          const tx = x + Math.cos(a) * rr, ty = y + Math.sin(a) * rr, at = 0.15 + k * 0.07;
          this.pending.push({ at: this.t + at, fn: () => {
            const f = this.addFx('star', tx - 60, ty - 260, tx, ty, 0, 0.35); f.c = col;
            this.pending.push({ at: this.t + 0.35, fn: () => { for (const o of foes(tx, ty, 45)) this.damage(h.dead ? null : h, o, sk.dmg * lv, true); } });
          } });
        }
        this.addFx('mark', x, y, x, y, sk.radius, 1.4);
        break;
      }
    }
  }

  // ---- main step ----
  step(dt) {
    if (this.over !== -1) return;
    this.t += dt;
    for (const p of this.players) p.gold += this.income(p) * dt;
    // pending
    if (this.pending.length) {
      const due = this.pending.filter(q => q.at <= this.t); this.pending = this.pending.filter(q => q.at > this.t);
      for (const q of due) q.fn();
    }
    // projectiles
    for (const pr of this.proj) {
      pr.left -= dt;
      if (pr.left <= 0) {
        pr.done = true;
        const t = this.byId.get(pr.tid);
        if (t && !t.dead) this.damage(this.byId.get(pr.src) || { d: pr.sd, owner: pr.own }, t, pr.dmg, false);
      }
    }
    this.proj = this.proj.filter(p => !p.done);
    // auras
    this.auraT -= dt;
    if (this.auraT <= 0) {
      this.auraT = 0.5;
      for (const e of this.ents) e.aura = {};
      for (const h of this.ents) {
        if (!h.d.hero || h.dead) continue;
        h.d.skills.forEach(sk => {
          if (sk.type !== 'aura' || h.lvl < sk.lvl) return;
          for (const o of this.ents) if (!o.dead && o.d.kind === 'u' && o.owner === h.owner && Math.hypot(o.x - h.x, o.y - h.y) < sk.radius) o.aura[sk.stat] = Math.max(o.aura[sk.stat] || 0, sk.v);
        });
      }
    }
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.buffs.length) e.buffs = e.buffs.filter(b => b.until > this.t);
      if (e.d.kind === 'u') this.updUnit(e, dt); else this.updBld(e, dt);
    }
    this.separate();
    this.updOutposts(dt);
    for (const p of this.players) for (let k = 0; k < 3; k++) if (p.pcd[k] > 0) p.pcd[k] -= dt;
    if (this.ents.some(e => e.dead)) {
      this.ents = this.ents.filter(e => { if (e.dead) { this.byId.delete(e.id); return false; } return true; });
    }
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
    this.fx = this.fx.filter(f => this.t - f.t0 < f.dur + 0.5);
  }
  updOutposts(dt) {
    for (const op of this.outposts) {
      if (op.owner >= 0 && !this.players[op.owner].alive) { op.owner = -1; op.prog = 0; }
      const cnt = new Map(), byP = new Map();
      for (const e of this.ents) {
        if (e.dead || e.d.kind !== 'u' || !this.players[e.owner] || !this.players[e.owner].alive) continue;
        if (Math.abs(e.x - op.x) > 130 || Math.abs(e.y - op.y) > 130 || Math.hypot(e.x - op.x, e.y - op.y) > 130) continue;
        const t = this.players[e.owner].team; cnt.set(t, (cnt.get(t) || 0) + 1); byP.set(e.owner, (byP.get(e.owner) || 0) + 1);
      }
      op.contested = cnt.size > 1;
      if (cnt.size !== 1) { if (op.owner < 0 && cnt.size === 0) op.prog = Math.max(0, op.prog - dt / 12); continue; }
      const team = [...cnt.keys()][0];
      let best = -1, bn = 0; for (const [pi, n] of byP) if (n > bn) { bn = n; best = pi; }
      const rate = dt / 7;
      if (op.owner >= 0) {
        if (this.players[op.owner].team === team) op.prog = Math.min(1, op.prog + rate);
        else { op.prog -= rate; if (op.prog <= 0) { this.note(op.owner, 'Мы потеряли аванпост!', op.x, op.y); op.owner = -1; op.prog = 0; op.cap = best; } }
      } else {
        if (op.cap < 0 || this.players[op.cap].team !== team) { op.cap = best; op.prog = 0; }
        op.prog += rate;
        if (op.prog >= 1) { op.prog = 1; op.owner = op.cap; const p = this.players[op.owner]; p.power = Math.min(200, p.power + 10); this.note(op.owner, 'Аванпост захвачен: +4 золота/с и +3 к лимиту армии'); }
      }
    }
  }
  moveToward(e, tx, ty, dt) {
    const dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy);
    if (dd < 0.5) { e.moving = 0; return; }
    const sp = e.d.speed * this.mult(e, 'spd') * dt;
    const s = Math.min(sp, dd);
    e.x += dx / dd * s; e.y += dy / dd * s; e.moving = 1;
    if (Math.abs(dx) > 1) e.face = dx > 0 ? 1 : -1;
  }
  attack(e, t) {
    e.atk = 0.3;
    if (Math.abs(t.x - e.x) > 1) e.face = t.x > e.x ? 1 : -1;
    const dmg = e.d.dmg * this.mult(e, 'dmg') * this.rankMul(e);
    if (e.d.proj) {
      const dd = Math.hypot(t.x - e.x, t.y - e.y);
      const fly = Math.max(0.12, dd / 560);
      this.proj.push({ tid: t.id, src: e.id, sd: e.d, own: e.owner, dmg, left: fly });
      this.addFx(e.d.proj, e.x, e.y - (e.d.kind === 'b' ? e.r * 0.8 : 12), t.x, t.y - 8, 0, fly);
    } else this.damage(e, t, dmg, false);
  }
  updUnit(e, dt) {
    if (e.life > 0) { e.life -= dt; if (e.life <= 0) { this.kill(e, null); return; } }
    for (let i = 0; i < 4; i++) if (e.scd[i] > 0) e.scd[i] -= dt;
    e.cd -= dt; if (e.atk > 0) e.atk -= dt;
    if (e.d.hero && e.hp < e.maxhp && this.t - (e.lastHit || 0) > 6) e.hp = Math.min(e.maxhp, e.hp + e.maxhp * 0.01 * dt);
    if (e.stun > 0) { e.stun -= dt; e.moving = 0; return; }
    const o = e.order;
    if (o && o.t === 'cast') {
      const sk = e.d.skills[o.s];
      if (!sk || !this.skillReady(e, o.s)) { e.order = null; return; }
      if (Math.hypot(o.x - e.x, o.y - e.y) <= sk.range) { e.order = null; this.doCast(e, o.s, o.x, o.y); }
      else this.moveToward(e, o.x, o.y, dt);
      return;
    }
    if (e.auto && e.d.hero) { e.autoT = (e.autoT || 0) - dt; if (e.autoT <= 0) { e.autoT = 0.5; this.autoCastHero(e); if (e.order && e.order.t === 'cast') return; } }
    if (o && o.t === 'hold') {
      let t = e.tgt ? this.byId.get(e.tgt) : null;
      if (!t || t.dead || Math.hypot(t.x - e.x, t.y - e.y) - t.r - e.r > e.d.range + 4) { t = this.findEnemy(e, e.d.range + e.r + 4); e.tgt = t ? t.id : 0; }
      e.moving = 0;
      if (t) { if (Math.abs(t.x - e.x) > 1) e.face = t.x > e.x ? 1 : -1; if (e.cd <= 0) { this.attack(e, t); e.cd = e.d.rate / this.mult(e, 'aspd'); } }
      return;
    }
    let tgt = null;
    if (o && o.t === 'atk') {
      tgt = this.byId.get(o.id);
      if (!tgt || tgt.dead) { e.order = null; e.tgt = 0; tgt = null; e.anchor = { x: e.x, y: e.y }; }
    } else if (!o || o.t === 'amove') {
      tgt = e.tgt ? this.byId.get(e.tgt) : null;
      if (tgt && (tgt.dead || Math.hypot(tgt.x - e.x, tgt.y - e.y) > e.d.aggro + 160)) { tgt = null; e.tgt = 0; }
      e.scanT -= dt;
      if (e.scanT <= 0) {
        e.scanT = 0.4 + this.rand() * 0.2;
        // retarget to closer foe when current is a building or far away
        const f = this.findEnemy(e, e.d.aggro);
        if (f && (!tgt || (tgt.d.kind === 'b' && f.d.kind === 'u') || Math.hypot(f.x - e.x, f.y - e.y) + 40 < Math.hypot(tgt.x - e.x, tgt.y - e.y))) { tgt = f; e.tgt = f.id; }
      }
      if (tgt && !o) {
        const leash = Math.hypot(e.x - e.anchor.x, e.y - e.anchor.y);
        if (leash > 420 && tgt.d.kind === 'u' && Math.hypot(tgt.x - e.anchor.x, tgt.y - e.anchor.y) > 420) { tgt = null; e.tgt = 0; e.order = { t: 'move', x: e.anchor.x, y: e.anchor.y, ret: 1 }; }
      }
    }
    if (tgt) {
      const dd = Math.hypot(tgt.x - e.x, tgt.y - e.y) - tgt.r - e.r;
      if (dd <= e.d.range) { e.moving = 0; if (e.cd <= 0) { this.attack(e, tgt); e.cd = e.d.rate / this.mult(e, 'aspd'); } }
      else this.moveToward(e, tgt.x, tgt.y, dt);
      return;
    }
    if (o && (o.t === 'move' || o.t === 'amove')) {
      const dd = Math.hypot(o.x - e.x, o.y - e.y);
      const bx = e.x, by = e.y;
      this.moveToward(e, o.x, o.y, dt);
      const prog = Math.hypot(e.x - bx, e.y - by);
      if (dd < 6) { e.order = null; e.anchor = { x: e.x, y: e.y }; e.moving = 0; }
      else {
        e.stuckT = (e.lastProg !== undefined && Math.hypot(e.x - e.lastPx, e.y - e.lastPy) < e.d.speed * dt * 0.25) ? e.stuckT + dt : Math.max(0, e.stuckT - dt);
        e.lastPx = e.x; e.lastPy = e.y; e.lastProg = prog;
        if (e.stuckT > 1.2 && dd < 90) { e.order = null; e.anchor = { x: e.x, y: e.y }; e.moving = 0; }
      }
      return;
    }
    e.moving = 0;
  }
  updBld(b, dt) {
    if (b.built < 1) {
      const inc = dt / b.d.time;
      b.built = Math.min(1, b.built + inc); b.hp = Math.min(b.maxhp, b.hp + b.maxhp * 0.9 * inc);
      if (b.built >= 1) this.note(b.owner, b.d.name + ': строительство завершено');
      return;
    }
    if (b.d.shoot) {
      b.cd -= dt;
      if (b.cd <= 0) {
        const t = this.findEnemy(b, b.d.range, true) || this.findEnemy(b, b.d.range * 0.6, false);
        if (t) { this.attack(b, t); b.cd = b.d.rate; } else b.cd = 0.3;
      }
    }
    if (b.queue.length) {
      const q = b.queue[0]; const d = DEF[q.u];
      q.t += dt;
      if (q.t >= d.time) {
        b.queue.shift();
        const p = this.players[b.owner];
        const rp = b.rally || { x: b.x + (MAP_W / 2 - b.x) * 0.12, y: b.y + (MAP_H / 2 - b.y) * 0.12 };
        const a = Math.atan2(rp.y - b.y, rp.x - b.x);
        const u = this.spawn(q.u, b.owner, b.x + Math.cos(a) * (b.r + 16), b.y + Math.sin(a) * (b.r + 16));
        u.order = { t: 'amove', x: rp.x + (this.rand() - 0.5) * 50, y: rp.y + (this.rand() - 0.5) * 50 };
        if (d.hero) { const hk = q.u.split('_')[1]; const hs = p.heroes[hk]; hs.id = u.id; hs.dead = false; if (hs.recruited) { u.lvl = hs.lvl || 1; const f = 1 + 0.08 * (u.lvl - 1); u.maxhp = u.hp = d.hp * f; } u.auto = !!hs.auto; hs.recruited = true; this.note(b.owner, 'Герой ' + d.heroName + ' готов к бою!'); }
      }
    }
  }
  separate() {
    const us = this.ents;
    const n = us.length;
    for (let i = 0; i < n; i++) {
      const a = us[i]; if (a.dead) continue;
      for (let j = i + 1; j < n; j++) {
        const b = us[j]; if (b.dead) continue;
        const ab = a.d.kind === 'b', bb = b.d.kind === 'b';
        if (ab && bb) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r - (ab || bb ? 0 : 4);
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        let d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        let nx, ny;
        if (d < 0.01) { const ang = (a.id * 7 + b.id * 13) % 6.28; nx = Math.cos(ang); ny = Math.sin(ang); d = 0; } else { nx = dx / d; ny = dy / d; }
        const push = (min - d);
        if (ab) { b.x += nx * push; b.y += ny * push; }
        else if (bb) { a.x -= nx * push; a.y -= ny * push; }
        else {
          // moving units push through idle ones more easily
          let wa = 0.5, wb = 0.5;
          if (a.moving && !b.moving) { wa = 0.2; wb = 0.8; } else if (b.moving && !a.moving) { wa = 0.8; wb = 0.2; }
          if (a.d.hero && !b.d.hero) { wa *= 0.5; wb = 1 - wa; } else if (b.d.hero && !a.d.hero) { wb *= 0.5; wa = 1 - wb; }
          const p2 = push * 0.6;
          a.x -= nx * p2 * wa; a.y -= ny * p2 * wa; b.x += nx * p2 * wb; b.y += ny * p2 * wb;
        }
      }
    }
    for (const e of us) if (e.d.kind === 'u') { e.x = clamp(e.x, 10, MAP_W - 10); e.y = clamp(e.y, 10, MAP_H - 10); }
  }

  // ---- network snapshot ----
  snapshot(forPeers) {
    const u = [];
    for (const e of this.ents) {
      if (e.dead) continue;
      let ex;
      if (e.d.kind === 'b') ex = Math.round(e.built * 99);
      else ex = (e.atk > 0 ? 1 : 0) | (e.moving ? 2 : 0) | (e.face < 0 ? 4 : 0) | (e.stun > 0 ? 8 : 0) | (e.rank << 4) | (e.lvl << 6);
      u.push(e.id, e.d.ti, e.owner, Math.round(e.x), Math.round(e.y), Math.ceil(e.hp / e.maxhp * 99), ex);
    }
    const fx = [];
    const recent = this.fx.filter(f => this.t - f.t0 < 0.35);
    let proj = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      const f = recent[i];
      const isProj = f.k === 'arrow' || f.k === 'bolt' || f.k === 'javelin';
      if (isProj && ++proj > 22) continue;
      fx.push(f.id, FX_IDX[f.k], Math.round(f.x), Math.round(f.y), Math.round(f.x2), Math.round(f.y2), Math.round(f.p), Math.round(f.dur * 10), f.c ? Object.keys(FX_COLORS).indexOf(f.c) : -1);
    }
    const pl = this.players.map(p => { const pi = this.popInfo(p.i); return [Math.floor(p.gold), pi.used, pi.cap, p.alive ? 1 : 0, Math.round(this.income(p) * 10), Math.floor(p.power), ...p.pcd.map(c => Math.max(0, Math.ceil(c)))]; });
    const op = []; for (const o of this.outposts) op.push(o.owner, Math.round(o.prog * 99), o.cap, o.contested ? 1 : 0);
    const hs = [];
    for (const p of this.players) for (const hk of Object.keys(p.heroes)) {
      const s = p.heroes[hk]; const h = s.id ? this.byId.get(s.id) : null;
      hs.push(p.i, hk === 'h1' ? 1 : 2, h ? h.id : 0, h ? h.lvl : (s.lvl || 1), h ? Math.round(h.xp / (120 * h.lvl) * 99) : 0, s.recruited ? 1 : 0, s.auto ? 1 : 0,
        ...(h ? h.scd.map(c => Math.max(0, Math.ceil(c * 10))) : [0, 0, 0, 0]));
    }
    const q = [];
    for (const e of this.ents) if (e.d.kind === 'b' && e.queue.length) { const d0 = DEF[e.queue[0].u]; q.push(e.id, e.queue.length, Math.round(e.queue[0].t / d0.time * 99), d0.ti); }
    const notes = this.notes.filter(n => this.t - n.t < 3 && this.players[n.p] && this.players[n.p].remote).slice(-4).map(n => [n.p, n.text, Math.round(n.t * 10), n.x, n.y]);
    return { t: Math.round(this.t * 100), u, fx, pl, hs, q, op, n: notes, o: this.over };
  }
}
