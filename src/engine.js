// ================= ENGINE: deterministic-ish simulation =================
const TICK = 0.05;
const MAP_W = 3800, MAP_H = 2600;
function mkRng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const START_POS = [[400, 400], [MAP_W - 400, MAP_H - 400], [MAP_W - 400, 400], [400, MAP_H - 400]];

class Game {
  constructor(cfg) {
    this.cfg = cfg;
    this.seed = cfg.seed || 1;
    this.mapType = cfg.mapType || 'river';
    this.rand = mkRng(this.seed);
    this.map = makeMap(this.seed, this.mapType);
    this.dyn = new Uint8Array(this.map.NW * this.map.NH); // cells blocked by buildings
    this.t = 0; this.nextId = 1; this.nextSq = 1;
    this.ents = []; this.byId = new Map(); this.squads = new Map();
    this.proj = []; this.fx = []; this.fxSeq = 1; this.pending = []; this.relic = null; this.relicT = 170;
    this.notes = []; // {p, text, t}
    this.over = -1; // winning team
    this.popMax = cfg.popMax || (cfg.online ? 60 : 150);
    this.auraT = 0;
    this.gcw = Math.ceil(MAP_W / GCELL) + 2; this.gch = Math.ceil(MAP_H / GCELL) + 2;
    this.gcells = Array.from({ length: this.gcw * this.gch }, () => []);
    this.outposts = this.map.outposts.map(([x, y]) => ({ x, y, owner: -1, prog: 0, cap: -1 }));
    this.camps = this.map.camps.map(([x, y, kind], i) => ({ i, x, y, kind, ids: [], alive: false, respawn: 0, lastOwner: -1 }));
    this.campT = 0;
    this.mode = cfg.mode || 'battle'; this.wave = 0; this.waveT = 50; this.waveMax = 15; this.waveLive = false;
    if (this.mode === 'survival') this.relicT = 1e9;
    this.players = cfg.players.map((p, i) => ({
      i, race: p.race, team: p.team, ai: !!p.ai, diff: p.diff || 1, remote: !!p.remote, horde: !!p.horde, name: p.name || ('Игрок ' + (i + 1)),
      color: TEAM_COLORS[i], gold: 1000, alive: true, heroes: {}, start: START_POS[i], kills: 0, lost: 0, lastAlert: -99, pxp: 0, plvl: 1, pts: 1, spells: {}, scd: {}, peer: p.peer || null, up: {},
    }));
    for (const p of this.players) for (const h of HEROES[p.race]) p.heroes[h.key] = { id: 0, dead: false, recruited: false };
    if (cfg.restore) return;
    for (const c of this.camps) this.spawnCamp(c);
    for (const p of this.players) {
      if (p.horde) { p.fort = 0; continue; }
      const [sx, sy] = p.start;
      const f = this.spawn(p.race + '_fort', p.i, sx, sy);
      p.fort = f.id;
      const toC = Math.atan2(MAP_H / 2 - sy, MAP_W / 2 - sx);
      this.spawnSquad(p.race + '_inf', p.i, sx + Math.cos(toC) * 170, sy + Math.sin(toC) * 170, toC);
      for (let k = 0; k < 2; k++) { const a = toC + Math.PI * 0.55 * (k ? 1 : -1); this.spawn(p.race + '_worker', p.i, sx + Math.cos(a) * 105, sy + Math.sin(a) * 105); }
    }
  }
  // ---- power points (spell book) ----
  addPxp(p, v) {
    if (!p || !p.alive) return;
    p.pxp += v;
    const lvl = powerLevelAt(p.pxp);
    if (lvl > p.plvl) { p.pts += lvl - p.plvl; p.plvl = lvl; if (!p.ai) this.note(p.i, 'Новое очко силы! Откройте книгу сил ✦'); }
  }
  // ---- save / load (local games) ----
  serialize() {
    const KEYS = ['id', 'owner', 'x', 'y', 'hp', 'maxhp', 'order', 'tgt', 'cd', 'face', 'buffs', 'xp', 'rank', 'kills', 'lvl', 'scd', 'stun', 'built', 'queue', 'rally', 'life', 'sq', 'slot', 'anchor', 'auto', 'camp', 'leader', 'lastHit'];
    return { v: 2, cfg: { seed: this.seed, mapType: this.mapType, popMax: this.popMax, players: this.cfg.players }, t: this.t, nextId: this.nextId, nextSq: this.nextSq, fxSeq: this.fxSeq,
      players: this.players.map(p => ({ gold: p.gold, alive: p.alive, heroes: p.heroes, kills: p.kills, lost: p.lost, pxp: p.pxp, plvl: p.plvl, pts: p.pts, spells: p.spells, scd: p.scd, fort: p.fort, up: p.up, ai: p.ai, diff: p.diff })),
      ents: this.ents.filter(e => !e.dead).map(e => { const o = { key: e.d.key }; for (const k of KEYS) if (e[k] !== undefined && e[k] !== null) o[k] = e[k]; return o; }),
      squads: [...this.squads.values()].map(q => ({ id: q.id, owner: q.owner, key: q.key, mem: q.mem, x: q.x, y: q.y, tx: q.tx, ty: q.ty, ang: q.ang, want: q.want, turnTo: q.turnTo, mode: q.mode, tid: q.tid, kills: q.kills, rank: q.rank, path: q.path, fightT: q.fightT, eq: q.eq, stance: q.stance, lvl: q.lvl, xp: q.xp, flagCd: q.flagCd, leadT: q.leadT })),
      outposts: this.outposts, camps: this.camps, relic: this.relic, relicT: this.relicT, mode: this.mode, wave: this.wave, waveT: this.waveT, waveLive: this.waveLive,
      proj: this.proj.map(pr => ({ tid: pr.tid, src: pr.src, own: pr.own, dmg: pr.dmg, left: pr.left, key: pr.sd && pr.sd.key })) };
  }
  static load(S) {
    const g = new Game(Object.assign({}, S.cfg, { restore: true }));
    g.t = S.t; g.fxSeq = S.fxSeq || 1; g.rand = mkRng((g.seed * 7919 + Math.floor(S.t * 20)) >>> 0);
    g.relic = S.relic || null; g.relicT = S.relicT === undefined ? 170 : S.relicT; g.mode = S.mode || g.mode; g.wave = S.wave || 0; g.waveT = S.waveT === undefined ? g.waveT : S.waveT; g.waveLive = !!S.waveLive;
    S.players.forEach((q, i) => { if (g.players[i]) Object.assign(g.players[i], q); });
    for (const o of S.ents) {
      if (!DEF[o.key]) continue;
      const e = g.spawn(o.key, o.owner, o.x, o.y); g.byId.delete(e.id);
      Object.assign(e, o); delete e.key; e.px = e.x; e.py = e.y; g.byId.set(e.id, e);
    }
    for (const o of S.squads) g.squads.set(o.id, Object.assign({}, o, { d: DEF[o.key], cnt: o.mem.length, eng: false, trail: [{ x: o.x, y: o.y }], tbase: 0 }));
    S.outposts.forEach((o, i) => { if (g.outposts[i]) Object.assign(g.outposts[i], o); });
    (S.camps || []).forEach((c, i) => { if (g.camps[i]) Object.assign(g.camps[i], c); });
    g.proj = (S.proj || []).map(pr => Object.assign({}, pr, { sd: DEF[pr.key] || { cls: 'hero' } }));
    g.nextId = S.nextId; g.nextSq = S.nextSq;
    return g;
  }
  // ---- wild camps ----
  spawnCamp(c) {
    const ang = Math.atan2(MAP_H / 2 - c.y, MAP_W / 2 - c.x);
    c.ids = [];
    if (c.kind === 'troll') { for (let k = 0; k < 2; k++) { const e = this.spawn('troll', NEUTRAL, c.x + Math.cos(ang + Math.PI / 2) * (k ? 34 : -34), c.y + Math.sin(ang + Math.PI / 2) * (k ? 34 : -34)); e.camp = c.i; c.ids.push(e.id); } }
    else { const q = this.spawnSquad(c.kind === 'wolves' ? 'wolf' : 'bandit', NEUTRAL, c.x + Math.cos(ang) * 30, c.y + Math.sin(ang) * 30, ang); for (const id of q.mem) { this.byId.get(id).camp = c.i; c.ids.push(id); } }
    c.alive = true; c.lastOwner = -1;
  }
  updCamps() {
    for (const c of this.camps) {
      if (c.alive) {
        if (c.ids.some(id => { const e = this.byId.get(id); return e && !e.dead; })) continue;
        c.alive = false; c.respawn = this.t + 240;
        const p = this.players[c.lastOwner];
        if (p && p.alive) { p.gold += 400; this.addPxp(p, 15); this.note(p.i, 'Лагерь разбит! Найдено сокровище: +400 золота', c.x, c.y); this.addFx('lvl', c.x, c.y, c.x, c.y, 0, 1.4); }
      } else if (this.t >= c.respawn) {
        let busy = false; this.near(c.x, c.y, 520, e => { if (!e.dead && e.owner !== NEUTRAL && e.d.kind === 'u' && Math.hypot(e.x - c.x, e.y - c.y) < 520) busy = true; });
        if (!busy) this.spawnCamp(c);
      }
    }
  }
  // ---- navigation ----
  markBld(e, v) {
    const M = this.map, R = e.r + 14;
    for (let y = Math.max(0, Math.floor((e.y - R) / NC)); y <= Math.min(M.NH - 1, Math.floor((e.y + R) / NC)); y++)
      for (let x = Math.max(0, Math.floor((e.x - R) / NC)); x <= Math.min(M.NW - 1, Math.floor((e.x + R) / NC)); x++)
        if (Math.hypot((x + 0.5) * NC - e.x, (y + 0.5) * NC - e.y) < R) { const i = y * M.NW + x; this.dyn[i] = Math.max(0, this.dyn[i] + v); }
  }
  blockedAt(x, y) { const M = this.map, i = clamp(Math.floor(y / NC), 0, M.NH - 1) * M.NW + clamp(Math.floor(x / NC), 0, M.NW - 1); return M.nblk[i] || this.dyn[i]; }
  los(x0, y0, x1, y1, strict) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 12);
    for (let k = 1; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, y = y0 + (y1 - y0) * k / n; if (this.blockedAt(x, y) || (strict && this.map.water(x, y) === 1)) return false; }
    return true;
  }
  findPath(sx, sy, tx, ty, maxIt) {
    if (this.los(sx, sy, tx, ty, true)) return [{ x: tx, y: ty }];
    const M = this.map, cellOf = (x, y) => clamp(Math.floor(y / NC), 0, M.NH - 1) * M.NW + clamp(Math.floor(x / NC), 0, M.NW - 1);
    let s = cellOf(sx, sy), t = cellOf(tx, ty), moved = false;
    if (M.nblk[s] || this.dyn[s]) s = nearestFree(M, this.dyn, s);
    if (M.nblk[t] || this.dyn[t]) { t = nearestFree(M, this.dyn, t); moved = true; }
    const cells = s >= 0 && t >= 0 ? astar(M, this.dyn, s, t, null, maxIt) : null;
    if (!cells) return [{ x: tx, y: ty }];
    const pts = cells.map(i => ({ x: (i % M.NW + 0.5) * NC, y: (Math.floor(i / M.NW) + 0.5) * NC }));
    if (!moved) pts[pts.length - 1] = { x: tx, y: ty };
    // string-pull: keep only corners needed to stay clear of obstacles and water
    const out = []; let ax = sx, ay = sy;
    for (let k = 1; k < pts.length; k++) if (!this.los(ax, ay, pts[k].x, pts[k].y, true)) { out.push(pts[k - 1]); ax = pts[k - 1].x; ay = pts[k - 1].y; }
    out.push(pts[pts.length - 1]);
    return out;
  }
  spawn(key, owner, x, y, opt) {
    const d = DEF[key];
    const e = { id: this.nextId++, d, owner, x, y, px: x, py: y, hp: d.hp, maxhp: d.hp, r: d.r, order: null, tgt: 0, cd: 0, face: 1,
      buffs: [], aura: {}, xp: 0, rank: 0, kills: 0, lvl: 1, scd: [0, 0, 0, 0], stun: 0, built: 1, queue: [], rally: null, life: 0,
      atk: 0, moving: 0, dead: false, scanT: this.rand() * 0.4, anchor: { x, y }, stuckT: 0, sq: 0, slot: 0 };
    if (d.kind === 'b' && opt && opt.construct) { e.built = 0; e.hp = d.hp * 0.1; }
    if (d.kind === 'b') this.markBld(e, 1);
    this.ents.push(e); this.byId.set(e.id, e);
    return e;
  }
  enemy(a, b) { if (a === b) return false; if (a === NEUTRAL || b === NEUTRAL) { const o = this.players[a === NEUTRAL ? b : a]; return a >= 0 && b >= 0 && !(o && o.horde); } return !!(this.players[a] && this.players[b] && this.players[a].team !== this.players[b].team); }
  addFx(k, x, y, x2, y2, p, dur) { const f = { id: this.fxSeq++, k, x, y, x2, y2, p: p || 0, t0: this.t, dur: dur || 0.5 }; this.fx.push(f); return f; }
  note(p, text, x, y) { this.notes.push({ p, text, t: this.t, x: x === undefined ? -1 : Math.round(x), y: y === undefined ? -1 : Math.round(y) }); if (this.notes.length > 30) this.notes.shift(); }
  terrainMul(x, y) { const w = this.map.water(x, y); return w === 1 ? 0.55 : w === 4 ? 0.85 : 1; }

  // ---- battalions ----
  sqCols(d) { return d.n <= 6 ? d.n : Math.ceil(d.n / 2); }
  sqSpacing(d) { return d.r * 2.5; }
  sqWidth(s) { return Math.min(this.sqCols(s.d), s.mem.length || 1) * this.sqSpacing(s.d); }
  sqDepth(s) { return Math.ceil((s.mem.length || 1) / this.sqCols(s.d)) * this.sqSpacing(s.d); }
  slotPos(s, i, cnt) {
    const cols = Math.max(1, Math.min(this.sqCols(s.d), cnt)), sp = this.sqSpacing(s.d);
    const row = Math.floor(i / cols), col = i % cols, rows = Math.ceil(cnt / cols);
    const inRow = row === rows - 1 ? cnt - row * cols : cols;
    const lx = -row * sp, ly = (col - (inRow - 1) / 2) * sp, ca = Math.cos(s.ang), sa = Math.sin(s.ang);
    return { x: s.x + lx * ca - ly * sa, y: s.y + lx * sa + ly * ca };
  }
  spawnSquad(key, owner, x, y, ang, count) {
    const d = DEF[key];
    const s = { id: this.nextSq++, owner, d, key, mem: [], x, y, tx: x, ty: y, ang, turnTo: ang, mode: 'idle', tid: 0, kills: 0, rank: 0, lvl: 1, xp: 0, flagCd: 0, cnt: 0, eng: false, trail: [{ x, y }], tbase: 0 };
    this.squads.set(s.id, s);
    const n = count || d.n;
    for (let i = 0; i < n; i++) {
      const p = this.slotPos(s, i, n);
      const e = this.spawn(key, owner, clamp(p.x, 12, MAP_W - 12), clamp(p.y, 12, MAP_H - 12));
      e.sq = s.id; e.slot = i; s.mem.push(e.id);
    }
    s.cnt = n;
    return s;
  }
  // battalion experience: level up (+4% per level), a leader at LEADER_LVL
  sqXp(s, v) {
    s.xp = (s.xp || 0) + v; let L = s.lvl || 1;
    while (L < SQ_MAX_LVL && s.xp >= SQ_XP[L]) L++;
    if (L > (s.lvl || 1)) this.sqSetLvl(s, L, true);
  }
  sqSetLvl(s, L, announce) {
    const old = s.lvl || 1, f = (1 + 0.04 * (L - 1)) / (1 + 0.04 * (old - 1));
    s.lvl = L; s.rank = L - 1;
    const mem = this.sqMembers(s);
    for (const m of mem) { m.maxhp *= f; m.hp *= f; m.rank = L - 1; m.lvl = L; }
    if (L >= LEADER_LVL && s.d.n > 1 && !mem.some(m => m.leader)) this.sqPromote(s, mem);
    if (announce && this.players[s.owner] && !this.players[s.owner].ai) this.note(s.owner, s.d.name + ': батальон достиг ' + L + ' уровня' + (L === LEADER_LVL ? ' — появился лидер!' : ''), s.x, s.y);
    if (announce) for (const m of mem) this.addFx('lvl', m.x, m.y, m.x, m.y, 0, 0.8);
  }
  // the standard bearer becomes the battalion's leader: tougher, hits harder, raises the fallen
  sqPromote(s, mem) {
    mem = mem || this.sqMembers(s); if (!mem.length) return;
    const e = mem.reduce((a, b) => (a.slot <= b.slot ? a : b));
    e.leader = 1; e.maxhp *= 2.2; e.hp = e.maxhp; s.leadT = 0;
    this.addFx('buff', e.x, e.y, e.x, e.y, 30, 1.2);
  }
  sqRevive(s, mem, n) {
    let done = 0; const lead = mem.find(m => m.leader) || mem[0]; if (!lead) return 0;
    for (let k = 0; k < n && mem.length + done < s.d.n; k++) {
      const pop = this.popInfo(s.owner); if (pop.used + s.d.pop > pop.cap) break;
      const a = this.rand() * 6.28, e = this.spawn(s.key, s.owner, lead.x + Math.cos(a) * 14, lead.y + Math.sin(a) * 14);
      e.sq = s.id; e.slot = mem.length + done; e.rank = s.rank; e.lvl = s.lvl || 1; e.maxhp *= 1 + 0.04 * e.rank; e.hp = e.maxhp; s.mem.push(e.id); done++;
      this.addFx('summon', e.x, e.y, e.x, e.y, 16, 0.8);
    }
    return done;
  }
  sqMembers(s) { const out = []; for (const id of s.mem) { const e = this.byId.get(id); if (e && !e.dead) out.push(e); } return out; }
  sqRecenter(s, mem) {
    mem = mem || this.sqMembers(s); if (!mem.length) return;
    let cx = 0, cy = 0; for (const e of mem) { cx += e.x; cy += e.y; } cx /= mem.length; cy /= mem.length;
    const back = (this.sqDepth(s) - this.sqSpacing(s.d)) / 2;
    s.x = cx + Math.cos(s.ang) * back; s.y = cy + Math.sin(s.ang) * back; s.tx = s.x; s.ty = s.y;
  }
  // hand out formation slots by where soldiers already stand (front rank = most forward), so a turn never makes them cross through each other
  sqReslot(s, mem) {
    if (mem.length < 2) return;
    const fx = Math.cos(s.ang), fy = Math.sin(s.ang), cols = Math.max(1, Math.min(this.sqCols(s.d), mem.length));
    const byF = mem.slice().sort((a, b) => (b.x * fx + b.y * fy) - (a.x * fx + a.y * fy));
    let k = 0;
    for (let i = 0; i < byF.length; i += cols) {
      const row = byF.slice(i, i + cols).sort((a, b) => (a.y * fx - a.x * fy) - (b.y * fx - b.x * fy));
      for (const e of row) e.slot = k++;
    }
    mem.sort((a, b) => a.slot - b.slot); s.mem = mem.map(e => e.id);
  }
  // a formation slot that fell into a forest or onto a cliff slides toward the banner
  freeSlot(s, p) {
    if (!this.blockedAt(p.x, p.y) && this.map.water(p.x, p.y) !== 3) return p;
    for (let t = 0.25; t <= 1.001; t += 0.25) { const x = p.x + (s.x - p.x) * t, y = p.y + (s.y - p.y) * t; if (!this.blockedAt(x, y) && this.map.water(x, y) !== 3) return { x, y }; }
    return { x: s.x, y: s.y };
  }
  sqHalt(s, mem) { s.mode = 'idle'; s.tid = 0; s.path = null; this.sqRecenter(s, mem); s.want = s.ang; }
  sqOrder(s, x, y, ang, mode) {
    x = clamp(x, 20, MAP_W - 20); y = clamp(y, 20, MAP_H - 20);
    const mem = this.sqMembers(s);
    let cx = 0, cy = 0; for (const e of mem) { cx += e.x; cy += e.y; } if (mem.length) { cx /= mem.length; cy /= mem.length; } else { cx = s.x; cy = s.y; }
    const far = Math.hypot(x - cx, y - cy) > 40;
    s.ang = far ? Math.atan2(y - cy, x - cx) : ang;
    const back = (this.sqDepth(s) - this.sqSpacing(s.d)) / 2;
    s.x = cx + Math.cos(s.ang) * back; s.y = cy + Math.sin(s.ang) * back;
    s.tx = x; s.ty = y; s.turnTo = ang; s.mode = mode; s.tid = 0;
    s.path = this.findPath(s.x, s.y, x, y);
    s.trail = [{ x: cx, y: cy }, { x: s.x, y: s.y }]; s.tbase = (s.tbase || 0) + 1000; for (const e of mem) e.ti = -1;
    if (far && s.path.length) s.ang = Math.atan2(s.path[0].y - cy, s.path[0].x - cx);
    s.want = s.ang;
    this.sqReslot(s, mem);
    for (const e of mem) e.tgt = 0;
  }
  // arrange battalions (melee in front, ranged behind) and single units (heroes) around a point
  formUp(sqs, singles, x, y, mode) {
    let cx = 0, cy = 0, n = 0;
    for (const s of sqs) { cx += s.x; cy += s.y; n++; } for (const e of singles) { cx += e.x; cy += e.y; n++; }
    if (!n) return; cx /= n; cy /= n;
    const ang = Math.hypot(x - cx, y - cy) > 5 ? Math.atan2(y - cy, x - cx) : (sqs[0] ? sqs[0].ang : 0);
    const px = Math.cos(ang + Math.PI / 2), py = Math.sin(ang + Math.PI / 2), fx = Math.cos(ang), fy = Math.sin(ang);
    const proj = s => (s.x - cx) * px + (s.y - cy) * py;
    const front = sqs.filter(s => s.d.range < 60).sort((a, b) => proj(a) - proj(b)), back = sqs.filter(s => s.d.range >= 60).sort((a, b) => proj(a) - proj(b));
    const MAXW = 640, GAP = 16;
    let depth = 0;
    const place = list => {
      let i = 0;
      while (i < list.length) {
        const row = []; let w = 0;
        while (i < list.length && (!row.length || w + GAP + this.sqWidth(list[i]) <= MAXW)) { w += (row.length ? GAP : 0) + this.sqWidth(list[i]); row.push(list[i]); i++; }
        let off = -w / 2, rd = 0;
        for (const s of row) { const sw = this.sqWidth(s), o = off + sw / 2; off += sw + GAP; this.sqOrder(s, x + px * o - fx * depth, y + py * o - fy * depth, ang, mode); rd = Math.max(rd, this.sqDepth(s)); }
        depth += rd + 22;
      }
    };
    place(front);
    const heroDepth = front.length ? depth - 8 : 0;
    if (front.length && back.length) depth += 16;
    place(back);
    singles.forEach((e, k) => {
      const o = (k - (singles.length - 1) / 2) * 44;
      const tx = clamp(x + px * o - fx * heroDepth, 15, MAP_W - 15), ty = clamp(y + py * o - fy * heroDepth, 15, MAP_H - 15);
      e.order = { t: mode === 'move' ? 'move' : 'amove', x: tx, y: ty, path: this.findPath(e.x, e.y, tx, ty) }; e.tgt = 0; e.stuckT = 0;
    });
  }
  // selection from a command: single units (heroes, spirits) and battalions
  resolve(pi, c) {
    const singles = [], sqs = new Set();
    for (const id of (c.ids || []).slice(0, 400)) {
      const e = this.byId.get(id); if (!e || e.dead || e.owner !== pi || e.d.kind !== 'u') continue;
      if (e.sq && this.squads.has(e.sq)) sqs.add(this.squads.get(e.sq)); else singles.push(e);
    }
    for (const sid of (c.s || []).slice(0, 60)) { const s = this.squads.get(sid); if (s && s.owner === pi) sqs.add(s); }
    return { singles, sqs: [...sqs] };
  }

  // ---- stats ----
  statAdd(e, s) { let v = e.aura[s] || 0; for (const b of e.buffs) if (b.s === s) v += b.v; if (e.sq) { const q = this.squads.get(e.sq), st = q && q.stance && STANCES[q.stance]; if (st && st[s]) v += st[s]; } return v; }
  mult(e, s) { return Math.max(0.2, 1 + this.statAdd(e, s)); }
  rankMul(e) { return (1 + 0.04 * e.rank + (e.d.hero ? 0.08 * (e.lvl - 1) : 0)) * (e.leader ? 1.6 : 1); }
  income(p) {
    if (!p.alive || p.horde) return 0;
    let farms = 0; for (const e of this.ents) if (e.owner === p.i && e.d.sub === 'farm' && e.built >= 1 && !e.dead) farms++;
    let inc = 6 + 3 * Math.min(farms, 10) + 4 * this.outposts.filter(o => o.owner === p.i).length + (p.up.treasury ? 3 : 0);
    if (p.ai) inc *= [0.75, 1, 1.35][p.diff] || 1;
    return inc;
  }
  popInfo(pi) {
    let used = 0, farms = 0;
    for (const e of this.ents) {
      if (e.owner !== pi || e.dead) continue;
      if (e.d.kind === 'u' && !e.d.hero && !e.d.summon && !(e.life > 0)) used += e.d.pop;
      if (e.d.sub === 'farm' && e.built >= 1) farms++;
      if (e.d.kind === 'b') for (const q of e.queue) if (!q.hero && !q.up) used += DEF[q.u].pop * DEF[q.u].n;
    }
    return { used, cap: Math.min(this.popMax, 30 + 12 * farms + 10 * this.outposts.filter(o => o.owner === pi).length) };
  }

  // ---- spatial grid ----
  buildGrid() {
    const cells = this.gcells, W = this.gcw, used = this.gused || (this.gused = []);
    for (const i of used) cells[i].length = 0;
    used.length = 0;
    for (const e of this.ents) if (!e.dead) { const i = clamp((e.y / GCELL) | 0, 0, this.gch - 1) * W + clamp((e.x / GCELL) | 0, 0, W - 1); if (!cells[i].length) used.push(i); cells[i].push(e); }
  }
  near(x, y, R, fn) {
    const W = this.gcw, x0 = clamp(((x - R) / GCELL) | 0, 0, W - 1), x1 = clamp(((x + R) / GCELL) | 0, 0, W - 1), y0 = clamp(((y - R) / GCELL) | 0, 0, this.gch - 1), y1 = clamp(((y + R) / GCELL) | 0, 0, this.gch - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) { const cell = this.gcells[cy * W + cx]; for (let i = 0; i < cell.length; i++) fn(cell[i]); }
  }

  // ---- damage ----
  damage(src, tgt, amt, skill) {
    if (!tgt || tgt.dead) return;
    let a = amt;
    if (!skill && src) { const b = BONUS[src.d.cls]; if (b && b[tgt.d.cls]) a *= b[tgt.d.cls]; }
    if (skill && tgt.d.kind === 'b') a *= 0.5;
    if (skill && tgt.sq) a *= 0.6; // battalions soak hero skills; ultimates still break them
    let arm = (tgt.d.armor || 0) + this.statAdd(tgt, 'armor');
    if (tgt.sq) { const q = this.eqOf(tgt); if (q && q.armor) arm += 0.2; }
    if (tgt.d.sub === 'fort') { const pt = this.players[tgt.owner]; if (pt && pt.up.walls) arm += 0.15; }
    arm = clamp(arm, 0, 0.8);
    a *= 1 - arm;
    tgt.hp -= a; tgt.lastHit = this.t;
    const p = this.players[tgt.owner];
    if (p && this.t - p.lastAlert > 12 && (tgt.d.kind === 'b' || tgt.d.hero)) { p.lastAlert = this.t; this.note(tgt.owner, tgt.d.kind === 'b' ? tgt.d.name + ' атакована! Нажмите, чтобы перейти' : 'Герой ' + tgt.d.heroName + ' в бою!', tgt.x, tgt.y); }
    if (tgt.hp <= 0) this.kill(tgt, src);
  }
  heal(e, amt) { if (!e.dead) e.hp = Math.min(e.maxhp, e.hp + amt); }
  kill(e, src) {
    if (e.dead) return;
    e.dead = true; e.hp = 0;
    const p = this.players[e.owner];
    if (p && !e.d.summon) p.lost++;
    const unitCost = (e.d.cost || 70) / (e.d.n || 1);
    if (e.camp !== undefined && src && this.players[src.owner] && this.camps[e.camp]) this.camps[e.camp].lastOwner = src.owner;
    if (src && src.owner !== e.owner && this.players[src.owner]) {
      const sp = this.players[src.owner];
      this.addPxp(sp, unitCost * (e.d.kind === 'b' ? 0.05 : 0.08));
      sp.kills++;
      const val = unitCost * (e.d.kind === 'b' ? 0.25 : 0.6) + (e.d.hero ? 250 : 0);
      if (src.d && src.d.hero && !src.dead) this.giveXp(src, val);
      this.near(e.x, e.y, 480, h => { if (h.d.hero && !h.dead && h.owner === src.owner && h !== src) this.giveXp(h, val * 0.5); });
      const s = src.sq ? this.squads.get(src.sq) : null;
      if (s) {
        s.kills += e.d.kind === 'b' ? 3 : 1;
        this.sqXp(s, e.d.kind === 'b' ? 4 : e.d.hero ? 6 : 1);
      } else if (src.d && !src.d.hero && src.d.kind === 'u' && !src.dead) { src.kills++; const nr = src.kills >= 6 ? 2 : src.kills >= 2 ? 1 : 0; if (nr > src.rank) { const f = (1 + 0.15 * nr) / (1 + 0.15 * src.rank); src.maxhp *= f; src.hp *= f; src.rank = nr; } }
    }
    if (e.d.hero && p) { const hs = p.heroes[e.d.key.split('_')[1]]; if (hs) { hs.dead = true; hs.id = 0; hs.lvl = e.lvl; } this.note(e.owner, 'Герой ' + e.d.heroName + ' пал! Воскресите его в цитадели.'); }
    if (e.d.sub === 'fort' && p && p.alive) this.eliminate(p, src);
  }
  giveXp(h, v) {
    if (h.lvl >= 10) return;
    h.xp += v;
    let need = 150 * h.lvl;
    while (h.xp >= need && h.lvl < 10) {
      h.xp -= need; h.lvl++; need = 150 * h.lvl;
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
    this.near(e.x, e.y, R + 70, o => {
      if (o.dead || !this.enemy(e.owner, o.owner)) return;
      if (unitsOnly && o.d.kind !== 'u') return;
      const dd = Math.hypot(o.x - e.x, o.y - e.y) - o.r;
      if (dd > R) return;
      const score = dd + (o.d.kind === 'b' ? 120 : 0);
      if (score < bd) { bd = score; best = o; }
    });
    return best;
  }
  unitsIn(x, y, R, pred) { const out = []; this.near(x, y, R + 70, o => { if (!o.dead && pred(o) && Math.hypot(o.x - x, o.y - y) <= R + o.r) out.push(o); }); return out; }

  // ---- building placement ----
  canPlace(pi, key, x, y) {
    const d = DEF[key]; if (!d) return false;
    if (x < d.r + 20 || y < d.r + 20 || x > MAP_W - d.r - 20 || y > MAP_H - d.r - 20) return false;
    const map = this.map;
    for (let a = 0; a < 6.28; a += 0.8) { const px = x + Math.cos(a) * d.r * 0.8, py = y + Math.sin(a) * d.r * 0.8; if (map.water(px, py) || map.nblk[clamp(Math.floor(py / NC), 0, map.NH - 1) * map.NW + clamp(Math.floor(px / NC), 0, map.NW - 1)]) return false; }
    if (map.water(x, y)) return false;
    for (const t of map.trees) if (Math.abs(t.x - x) < d.r + 10 && Math.abs(t.y - y) < d.r + 10 && Math.hypot(t.x - x, t.y - y) < d.r + t.r) return false;
    let near = false;
    for (const o of this.ents) {
      if (o.dead) continue;
      const dd = Math.hypot(o.x - x, o.y - y);
      if (o.d.kind === 'b') {
        if (dd < o.r + d.r + 12) return false;
        if (o.owner === pi && ((o.d.sub === 'fort' && dd < 600) || dd < o.r + d.r + 230)) near = true;
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
      case 'move': {
        const { singles, sqs } = this.resolve(pi, c); if (!singles.length && !sqs.length) return;
        this.formUp(sqs, singles, clamp(+c.x || 0, 20, MAP_W - 20), clamp(+c.y || 0, 20, MAP_H - 20), c.a ? 'amove' : 'move');
        return;
      }
      case 'atk': {
        const { singles, sqs } = this.resolve(pi, c); const t = this.byId.get(c.t); if (!t || t.dead) return;
        for (const e of singles) { e.order = { t: 'atk', id: t.id }; e.tgt = t.id; }
        for (const s of sqs) { s.mode = 'atk'; s.tid = t.id; for (const m of this.sqMembers(s)) m.tgt = t.id; }
        return;
      }
      case 'stop': case 'hold': {
        const { singles, sqs } = this.resolve(pi, c);
        for (const e of singles) { e.order = c.c === 'hold' ? { t: 'hold' } : null; e.tgt = 0; e.anchor = { x: e.x, y: e.y }; }
        for (const s of sqs) { this.sqHalt(s); if (c.c === 'hold') s.mode = 'hold'; }
        return;
      }
      case 'retreat': {
        const { singles, sqs } = this.resolve(pi, c); if (!singles.length && !sqs.length) return;
        const f = this.byId.get(p.fort); if (!f) return;
        const toC = Math.atan2(MAP_H / 2 - f.y, MAP_W / 2 - f.x);
        this.formUp(sqs, singles, f.x + Math.cos(toC) * (f.r + 110), f.y + Math.sin(toC) * (f.r + 110), 'move');
        return;
      }
      case 'refill': {
        const { sqs } = this.resolve(pi, c);
        let done = 0, far = 0, capped = 0;
        for (const s of sqs) {
          const mem = this.sqMembers(s), missing = s.d.n - mem.length; if (missing <= 0 || !mem.length) continue;
          let bld = null, bd = 900;
          for (const b of this.ents) if (b.owner === pi && !b.dead && b.d.kind === 'b' && b.built >= 1) { const dd = Math.hypot(b.x - s.x, b.y - s.y) - b.r; if (dd < bd) { bd = dd; bld = b; } }
          if (!bld) { far++; continue; }
          const cost = Math.ceil(s.d.cost / s.d.n * missing * 0.8);
          const pop = this.popInfo(pi);
          if (pop.used + missing * s.d.pop > pop.cap) { capped++; continue; }
          if (p.gold < cost) continue;
          p.gold -= cost;
          const a = Math.atan2(s.y - bld.y, s.x - bld.x);
          for (let k = 0; k < missing; k++) {
            const e = this.spawn(s.key, pi, bld.x + Math.cos(a + (k - missing / 2) * 0.15) * (bld.r + 14), bld.y + Math.sin(a + (k - missing / 2) * 0.15) * (bld.r + 14));
            e.sq = s.id; e.slot = mem.length + k; e.rank = s.rank; e.lvl = s.lvl || 1; if (s.rank) { e.maxhp *= 1 + 0.04 * s.rank; e.hp = e.maxhp; }
            s.mem.push(e.id);
            this.addFx('summon', e.x, e.y, e.x, e.y, 16, 0.6);
          }
          done++;
        }
        if (!p.ai) { if (done) this.note(pi, 'Батальоны пополнены: ' + done); else if (capped) this.note(pi, 'Лимит армии — постройте фермы или захватите аванпост'); else if (far) this.note(pi, 'Пополнить можно рядом со своими зданиями'); }
        return;
      }
      case 'research': {
        const b = own(c.b), U = UPG[c.k];
        if (!b || b.built < 1 || !U || b.d.sub !== U.at || p.up[U.k] || p.gold < U.cost || b.queue.length >= 4) return;
        if (U.forge && !this.ents.some(e => e.owner === pi && !e.dead && e.d.forge && e.built >= 1)) { if (!p.ai) this.note(pi, 'Сначала постройте кузницу'); return; }
        if (this.ents.some(e => e.owner === pi && !e.dead && e.queue.some(q => q.up === U.k))) return;
        p.gold -= U.cost; b.queue.push({ up: U.k, t: 0, cost: U.cost }); return;
      }
      case 'stance': {
        if (!STANCES[c.k]) return;
        for (const sid of (c.s || []).slice(0, 60)) { const s = this.squads.get(sid); if (s && s.owner === pi && !s.d.summon && s.d.n > 1) s.stance = c.k === 'norm' ? undefined : c.k; }
        return;
      }
      case 'flag': {
        let n = 0;
        for (const sid of (c.s || []).slice(0, 60)) {
          const s = this.squads.get(sid); if (!s || s.owner !== pi || s.flagCd > 0) continue;
          const mem = this.sqMembers(s), lead = mem.find(m => m.leader); if (!lead) continue;
          s.flagCd = FLAG_CD; n++;
          this.sqRevive(s, mem, 3);
          for (const m of this.sqMembers(s)) { m.buffs = m.buffs.filter(b => b.src !== 'flag'); m.buffs.push({ s: 'dmg', v: 0.2, until: this.t + 12, src: 'flag' }, { s: 'armor', v: 0.1, until: this.t + 12, src: 'flag' }); if (m.hp < m.maxhp) this.heal(m, m.maxhp * 0.25); }
          this.addFx('buff', lead.x, lead.y, lead.x, lead.y, 90, 1.2);
        }
        if (n && !p.ai) this.note(pi, 'Знамя поднято! Павшие встают в строй');
        return;
      }
      case 'equip': {
        const U = UPG[c.k]; if (!U || !U.eq || !p.up[U.k]) return;
        let n = 0, poor = false;
        for (const sid of (c.s || []).slice(0, 60)) {
          const s = this.squads.get(sid);
          if (!s || s.owner !== pi || (s.eq && s.eq[U.k]) || !U.cls.includes(s.d.cls) || s.d.summon || s.d.worker || s.d.creep) continue;
          if (p.gold < U.eq) { poor = true; break; }
          p.gold -= U.eq; s.eq = Object.assign({}, s.eq, { [U.k]: 1 }); n++;
          for (const m of this.sqMembers(s)) this.addFx('buff', m.x, m.y, m.x, m.y, 14, 0.7);
        }
        if (!p.ai) { if (n) this.note(pi, upName(p.race, U.k) + ': снаряжено батальонов — ' + n); else if (poor) this.note(pi, 'Не хватает золота на снаряжение'); }
        return;
      }
      case 'train': {
        const b = own(c.b); if (!b || b.d.kind !== 'b' || b.built < 1 || !b.d.trains || !b.d.trains.includes(c.u)) return;
        const u = DEF[c.u]; if (!u || b.queue.length >= 6 || p.gold < u.cost) return;
        const pop = this.popInfo(pi); if (pop.used + u.pop * u.n > pop.cap) { if (!p.ai) this.note(pi, 'Нужно больше ферм (лимит армии)'); return; }
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
        let ws = (c.ids || []).slice(0, 12).map(own).filter(e => e && e.d.worker);
        if (!ws.length) { let best = null, bd = 1e9; for (const e of this.ents) if (e.owner === pi && !e.dead && e.d.worker) { const dd = Math.hypot(e.x - c.x, e.y - c.y) + (e.order && e.order.t === 'build' ? 3000 : 0); if (dd < bd) { bd = dd; best = e; } } if (best) ws = [best]; }
        if (!ws.length) { if (!p.ai) this.note(pi, 'Нужен строитель — наймите его в цитадели'); return; }
        p.gold -= d.cost; const b = this.spawn(key, pi, c.x, c.y, { construct: true });
        b.rally = null;
        for (const w of ws) this.assignWork(w, b);
        return;
      }
      case 'work': {
        const b = own(c.t); if (!b || b.d.kind !== 'b') return;
        for (const w of (c.ids || []).slice(0, 12).map(own).filter(e => e && e.d.worker)) this.assignWork(w, b);
        return;
      }
      case 'learn': {
        const S = SPELLS[c.k]; if (!S || p.spells[c.k]) return;
        const cost = TIER_COST[S.tier], req = SPELL_REQ[c.k];
        if (p.pts < cost || (req && !req.some(r => p.spells[r]))) return;
        p.pts -= cost; p.spells[c.k] = 1; p.scd[c.k] = 0;
        if (!p.ai) this.note(pi, 'Изучена сила: ' + SPELL_NAMES[p.race][c.k][0]);
        return;
      }
      case 'auto': { const hk = c.hk === 'h2' ? 'h2' : 'h1'; p.heroes[hk].auto = !!c.on; const h = this.byId.get(p.heroes[hk].id); if (h) h.auto = !!c.on; return; }
      case 'rally': { const b = own(c.b); if (b && b.d.kind === 'b') b.rally = { x: clamp(c.x, 10, MAP_W - 10), y: clamp(c.y, 10, MAP_H - 10) }; return; }
      case 'skill': { const h = own(c.h); if (h && h.d.hero) this.tryCast(h, c.s | 0, +c.x || h.x, +c.y || h.y); return; }
      case 'autoskill': { const h = own(c.h); if (h && h.d.hero && !this.autoCastOne(h, c.s | 0, true) && !p.ai) this.note(pi, 'Нет целей для навыка рядом с героем'); return; }
      case 'power': {
        const k = c.k, S = SPELLS[k]; if (!S || !p.spells[k] || (p.scd[k] || 0) > 0) return;
        const fort = this.byId.get(p.fort); if (!fort) return;
        const x = clamp(+c.x || fort.x, 20, MAP_W - 20), y = clamp(+c.y || fort.y, 20, MAP_H - 20);
        p.scd[k] = S.cd;
        this.castSpell(p, k, x, y);
        const nm = SPELL_NAMES[p.race][k][0];
        for (const q of this.players) if (q.i === pi || this.enemy(pi, q.i)) this.note(q.i, (q.i === pi ? 'Сила: ' : 'Враг применил силу: ') + nm);
        return;
      }
      case 'surrender': { if (p.alive) { const f = this.byId.get(p.fort); if (f) this.kill(f, null); } return; }
    }
  }

  assignWork(w, b) { w.order = { t: 'build', id: b.id, path: this.findPath(w.x, w.y, b.x, b.y) }; w.tgt = 0; }
  findWork(e, R) { let best = null, bd = R || 700; for (const b of this.ents) if (b.owner === e.owner && !b.dead && b.d.kind === 'b' && (b.built < 1 || (b.hp < b.maxhp * 0.97 && b.d.sub !== 'fort'))) { const dd = Math.hypot(b.x - e.x, b.y - e.y); if (dd < bd) { bd = dd; best = b; } } return best; }
  updWorker(e, dt) {
    const o = e.order;
    if (o && o.t === 'build') {
      const b = this.byId.get(o.id);
      if (!b || b.dead || (b.built >= 1 && b.hp >= b.maxhp - 0.5)) { e.order = null; const nb = this.findWork(e, 600); if (nb) this.assignWork(e, nb); e.moving = 0; return; }
      const gap = Math.hypot(b.x - e.x, b.y - e.y) - b.r - e.r;
      // blocked by trees or other units close to the site: good enough, start working
      e.stuckT = e.lastPx !== undefined && Math.hypot(e.x - e.lastPx, e.y - e.lastPy) < e.d.speed * dt * 0.4 ? (e.stuckT || 0) + dt : Math.max(0, (e.stuckT || 0) - dt * 0.5); e.lastPx = e.x; e.lastPy = e.y;
      if (gap > 40 && !(gap < 110 && e.stuckT > 1)) {
        const wp = o.path && o.path.length ? o.path[0] : b;
        if (o.path && o.path.length > 1 && Math.hypot(wp.x - e.x, wp.y - e.y) < 14) { o.path.shift(); return; }
        this.moveToward(e, wp.x, wp.y, dt); return;
      }
      e.moving = 0; if (Math.abs(b.x - e.x) > 1) e.face = b.x > e.x ? 1 : -1; e.hd = Math.atan2(b.y - e.y, b.x - e.x);
      b.bw = (b.bw || 0) + 1;
      if (e.cd <= 0) { e.atk = 0.3; e.cd = 0.7; }
      return;
    }
    if (o && (o.t === 'move' || o.t === 'amove')) {
      const wp = o.path && o.path.length ? o.path[0] : o;
      if (o.path && o.path.length > 1 && Math.hypot(wp.x - e.x, wp.y - e.y) < 14) { o.path.shift(); return; }
      this.moveToward(e, wp.x, wp.y, dt);
      if (Math.hypot(o.x - e.x, o.y - e.y) < 6) { e.order = null; e.moving = 0; }
      return;
    }
    e.moving = 0;
    e.scanT -= dt;
    if (e.scanT <= 0) { e.scanT = 1.5; const nb = this.findWork(e, 450); if (nb) this.assignWork(e, nb); }
  }
  castSpell(p, k, x, y) {
    const S = SPELLS[k], pi = p.i, fort = this.byId.get(p.fort), race = p.race;
    const allies = R => this.unitsIn(x, y, R, o => o.owner === pi && o.d.kind === 'u');
    const foes = R => this.unitsIn(x, y, R, o => this.enemy(pi, o.owner));
    const src = { d: { cls: 'hero' }, owner: pi };
    const buff = (list, pairs, dur, tag) => { for (const o of list) for (const [s2, v] of pairs) { o.buffs = o.buffs.filter(b => !(b.s === s2 && b.src === tag)); o.buffs.push({ s: s2, v, until: this.t + dur, src: tag }); } };
    const summonSq = (key, n, rank, life) => { for (let i = 0; i < n; i++) { const a = i * 2.4, q = this.spawnSquad(key, pi, clamp(x + Math.cos(a) * 50 * i, 30, MAP_W - 30), clamp(y + Math.sin(a) * 40 * i, 30, MAP_H - 30), 0); q.rank = rank; q.lvl = rank + 1; for (const m of this.sqMembers(q)) { m.life = life || S.dur; m.rank = rank; m.lvl = rank + 1; m.maxhp = m.hp = m.d.hp * (1 + 0.04 * rank); this.addFx('summon', m.x, m.y, m.x, m.y, 18, 0.8); } } };
    const summonOne = (key, n, life) => { for (let i = 0; i < n; i++) { const a = i / n * 6.28, e = this.spawn(key, pi, clamp(x + Math.cos(a) * 60, 30, MAP_W - 30), clamp(y + Math.sin(a) * 45, 30, MAP_H - 30)); e.life = life; this.addFx('summon', e.x, e.y, e.x, e.y, 30, 0.9); } };
    switch (k) {
      case 'heal': for (const o of allies(S.radius)) this.heal(o, S.heal); this.addFx('heal', x, y, x, y, S.radius, 1.2); break;
      case 'gold': p.gold += S.gold; if (fort) this.addFx('lvl', fort.x, fort.y, fort.x, fort.y, 0, 1.4); break;
      case 'haste': { const us = this.ents.filter(o => !o.dead && o.owner === pi && o.d.kind === 'u'); buff(us, [['spd', 0.3]], S.dur, k); for (let i = 0; i < Math.min(8, us.length); i++) { const o = us[(i * 7919) % us.length]; this.addFx('buff', o.x, o.y, o.x, o.y, 40, 0.8); } break; }
      case 'reinf': {
        const f = fort || { x, y, r: 60 }, toC = Math.atan2(MAP_H / 2 - f.y, MAP_W / 2 - f.x);
        for (let i = 0; i < S.count; i++) { const a = toC + (i - 0.5) * 0.9, s2 = this.spawnSquad(race + '_' + (i % 2 ? 'spear' : 'inf'), pi, f.x + Math.cos(a) * (f.r + 70), f.y + Math.sin(a) * (f.r + 70), toC); for (const m of this.sqMembers(s2)) this.addFx('summon', m.x, m.y, m.x, m.y, 18, 0.8); }
        break;
      }
      case 'rally': buff(allies(S.radius), [['dmg', 0.3], ['armor', 0.2]], S.dur, k); this.addFx('buff', x, y, x, y, S.radius, 1.1); break;
      case 'curse': buff(foes(S.radius).filter(o => o.d.kind === 'u'), [['dmg', -0.35], ['spd', -0.35]], S.dur, k); this.addFx('debuff', x, y, x, y, S.radius, 1.1); break;
      case 'meteor': {
        this.addFx('mark', x, y, x, y, S.radius, S.delay);
        const f = this.addFx('fireball', x - 200, y - 500, x, y, 0, S.delay); f.big = 1;
        this.pending.push({ at: this.t + S.delay, fn: () => { for (const o of foes(S.radius)) this.damage(src, o, S.dmg, true); this.addFx('boom', x, y, x, y, S.radius, 0.8).c = race === 'dwf' ? 'hammer' : race === 'elf' ? 'star' : race === 'und' ? 'shadow' : race === 'des' ? 'holy' : 'fire'; } });
        break;
      }
      case 'summon':
        if (race === 'hum') summonSq('hum_cav', 1, 2);
        else if (race === 'dwf') summonSq('dwf_inf', 2, 2);
        else if (race === 'elf') summonOne('treant', 2, S.dur);
        else if (race === 'und') summonSq('ghoul', 2, 2);
        else if (race === 'des') summonSq('des_cav', 1, 2);
        else summonOne('troll', 2, S.dur);
        break;
      case 'ult':
        if (race === 'hum') {
          this.addFx('mark', x, y, x, y, S.radius, 1.8);
          const f = this.addFx('holy', x - 60, y - 600, x, y, 0, 1.8); f.big = 1;
          this.pending.push({ at: this.t + 1.8, fn: () => { for (const o of foes(S.radius)) { this.damage(src, o, 650, true); if (o.d.kind === 'u' && !o.dead) { o.stun = Math.max(o.stun, 2); if (!o.d.hero) this.knock(o, x, y, 30); } } this.addFx('boom', x, y, x, y, S.radius, 1).c = 'holy'; } });
        } else if (race === 'elf') { summonOne('treant', 5, 60); for (const o of allies(300)) this.heal(o, 400); this.addFx('heal', x, y, x, y, 300, 1.3); }
        else if (race === 'dwf') {
          this.addFx('mark', x, y, x, y, S.radius + 20, 3.4);
          for (let i = 0; i < 28; i++) { const a = this.rand() * 6.28, rr = Math.sqrt(this.rand()) * (S.radius + 20), tx = x + Math.cos(a) * rr, ty = y + Math.sin(a) * rr;
            this.pending.push({ at: this.t + 0.2 + i * 0.11, fn: () => { this.addFx('star', tx - 30, ty - 300, tx, ty, 0, 0.25).c = 'hammer'; this.pending.push({ at: this.t + 0.25, fn: () => { for (const o of this.unitsIn(tx, ty, 55, o => this.enemy(pi, o.owner))) { this.damage(src, o, 130, true); if (o.d.kind === 'u' && !o.dead) o.stun = Math.max(o.stun, 0.6); } this.addFx('boom', tx, ty, tx, ty, 50, 0.4).c = 'hammer'; } }); } });
          }
        } else if (race === 'und') {
          this.addFx('debuff', x, y, x, y, S.radius, 1.4);
          for (const o of foes(S.radius)) if (o.d.kind === 'u' && !o.d.hero) o.stun = Math.max(o.stun, 3); else if (o.d.hero) o.stun = Math.max(o.stun, 1.2);
          summonSq('ghoul', 3, 3, 60);
        } else if (race === 'des') {
          this.addFx('mark', x, y, x, y, S.radius, 3.2);
          for (let w = 0; w < 5; w++) this.pending.push({ at: this.t + 0.4 + w * 0.6, fn: () => {
            const hit = foes(S.radius); for (const o of hit) this.damage(src, o, 150, true);
            buff(hit.filter(o => o.d.kind === 'u'), [['spd', -0.45]], 4, 'sand');
            const a = this.rand() * 6.28, rr = this.rand() * S.radius * 0.4; this.addFx('boom', x + Math.cos(a) * rr, y + Math.sin(a) * rr, x, y, S.radius * 0.85, 0.9).c = 'quake';
          } });
        } else {
          const f0 = fort || { x: x - 300, y }, a = Math.atan2(y - f0.y, x - f0.x);
          for (let i = -4; i <= 4; i++) { const tx = clamp(x + Math.cos(a) * i * 75, 20, MAP_W - 20), ty = clamp(y + Math.sin(a) * i * 75, 20, MAP_H - 20);
            this.pending.push({ at: this.t + 0.5 + (i + 4) * 0.14, fn: () => { for (const o of this.unitsIn(tx, ty, 110, o => this.enemy(pi, o.owner))) this.damage(src, o, 280, true); this.addFx('boom', tx, ty, tx, ty, 105, 0.7).c = 'fire'; } });
          }
          const fb = this.addFx('fireball', x - Math.cos(a) * 420, y - Math.sin(a) * 420 - 120, x + Math.cos(a) * 420, y + Math.sin(a) * 420 - 120, 0, 1.8); fb.big = 1;
        }
        break;
    }
  }
  // ---- hero auto-cast (AI, players' "auto" toggle, and double-tap smart cast) ----
  autoCastHero(h) { h.d.skills.forEach((sk, si) => { if (!(h.order && h.order.t === 'cast')) this.autoCastOne(h, si, false); }); }
  autoCastOne(h, si, force) {
    const sk = h.d.skills[si]; if (!sk || !this.skillReady(h, si)) return false;
    const pi = h.owner; const center = list => { let x = 0, y = 0; for (const o of list) { x += o.x; y += o.y; } return { x: x / list.length, y: y / list.length }; };
    const R = sk.range || sk.radius;
    const foes = this.unitsIn(h.x, h.y, Math.max(R, 200) * (force ? 1.5 : 1), o => this.enemy(pi, o.owner) && o.d.kind === 'u');
    if (sk.type === 'heal') {
      const hurt = this.unitsIn(h.x, h.y, sk.range * (force ? 1.5 : 1), o => o.owner === pi && o.d.kind === 'u' && o.hp < o.maxhp * (force ? 0.95 : 0.6));
      if (hurt.length >= (force ? 1 : 3) || (hurt.length && hurt.some(o => o.d.hero))) { const c = center(hurt); return this.tryCast(h, si, c.x, c.y); }
      return false;
    }
    if (!foes.length) {
      if (force && (sk.type === 'buff' || sk.type === 'summon')) return this.tryCast(h, si, h.x, h.y);
      if (force && (sk.type === 'aoe' || sk.type === 'volley' || sk.type === 'dash')) { const b = this.findEnemy(h, 700, false); if (b) return this.tryCast(h, si, b.x, b.y); }
      return false;
    }
    if (sk.type === 'buff' || sk.type === 'summon' || sk.type === 'debuff') { if (force || foes.length >= 4) return this.tryCast(h, si, h.x, h.y); return false; }
    if (sk.type === 'strike') { const near = foes.filter(o => Math.hypot(o.x - h.x, o.y - h.y) < sk.radius); if (force || near.length >= 4 || (near.length && near[0].d.hero)) return this.tryCast(h, si, h.x, h.y); return false; }
    // targeted: aim at the densest spot (weighted centre of nearby foes around the closest group)
    let best = foes[0], bn = 0;
    for (let k = 0; k < foes.length; k += Math.max(1, (foes.length / 12) | 0)) { const o = foes[k]; let n = 0; for (const q of foes) if (Math.hypot(q.x - o.x, q.y - o.y) < (sk.radius || 80)) n++; if (n > bn) { bn = n; best = o; } }
    const grp = foes.filter(q => Math.hypot(q.x - best.x, q.y - best.y) < (sk.radius || 80));
    if (force || grp.length >= 3 || best.d.hero) { const c = center(grp); return this.tryCast(h, si, c.x, c.y); }
    return false;
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
        for (const o of foes(nx, ny, sk.radius)) { this.damage(h, o, sk.dmg * lv, true); if (sk.stun && o.d.kind === 'u') o.stun = Math.max(o.stun, sk.stun); if (o.d.kind === 'u' && !o.d.hero && !o.dead) this.knock(o, nx, ny, 26); }
        this.addFx('boom', nx, ny, nx, ny, sk.radius, 0.5);
        break;
      }
      case 'strike': x = h.x; y = h.y; // fallthrough
      case 'aoe': {
        const delay = sk.delay || (sk.proj ? Math.hypot(x - h.x, y - h.y) / 600 : 0);
        if (sk.proj) this.addFx(sk.proj, h.x, h.y - 14, x, y, 0, delay);
        if (sk.delay) this.addFx('mark', x, y, x, y, sk.radius, sk.delay);
        this.pending.push({ at: this.t + delay, fn: () => {
          for (const o of foes(x, y, sk.radius)) { this.damage(h.dead ? null : h, o, sk.dmg * lv, true); if (sk.stun && o.d.kind === 'u' && !o.dead) o.stun = Math.max(o.stun, sk.stun); if (o.d.kind === 'u' && !o.d.hero && !o.dead) this.knock(o, x, y, 22); }
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
        const a0 = this.rand() * Math.PI * 2;
        if (sk.squad) {
          const s = this.spawnSquad(sk.unit, h.owner, clamp(h.x + Math.cos(a0) * 60, 30, MAP_W - 30), clamp(h.y + Math.sin(a0) * 60, 30, MAP_H - 30), h.face > 0 ? 0 : Math.PI);
          for (const m of this.sqMembers(s)) { m.life = sk.dur; m.maxhp = m.hp = m.d.hp * lv; this.addFx('summon', m.x, m.y, m.x, m.y, 20, 0.8); }
        } else for (let k = 0; k < sk.count; k++) {
          const a = a0 + k * 2.1;
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
  // knockback never throws anyone into a cliff, a forest thicket or a building: it stops at the last free spot
  knock(o, cx, cy, amt) {
    const a = Math.atan2(o.y - cy, o.x - cx), M = this.map;
    for (let k = 4; k >= 1; k--) {
      const x = clamp(o.x + Math.cos(a) * amt * k / 4, 10, MAP_W - 10), y = clamp(o.y + Math.sin(a) * amt * k / 4, 10, MAP_H - 10);
      if (M.water(x, y) === 3 || this.blockedAt(x, y)) continue;
      o.x = x; o.y = y; break;
    }
    o.knockT = 0.4;
  }

  // ---- main step ----
  step(dt) {
    if (this.over !== -1) return;
    this.t += dt;
    for (const p of this.players) p.gold += this.income(p) * dt;
    if (this.pending.length) {
      const due = this.pending.filter(q => q.at <= this.t); this.pending = this.pending.filter(q => q.at > this.t);
      for (const q of due) q.fn();
    }
    this.buildGrid();
    for (const pr of this.proj) {
      pr.left -= dt;
      if (pr.left <= 0) {
        pr.done = true;
        const t = this.byId.get(pr.tid);
        if (t && !t.dead) this.damage(this.byId.get(pr.src) || { d: pr.sd, owner: pr.own }, t, pr.dmg, false);
      }
    }
    this.proj = this.proj.filter(p => !p.done);
    this.auraT -= dt;
    if (this.auraT <= 0) {
      this.auraT = 0.5;
      for (const e of this.ents) e.aura = {};
      for (const h of this.ents) {
        if (!h.d.hero || h.dead) continue;
        h.d.skills.forEach(sk => {
          if (sk.type !== 'aura' || h.lvl < sk.lvl) return;
          this.near(h.x, h.y, sk.radius, o => { if (!o.dead && o.d.kind === 'u' && o.owner === h.owner && Math.hypot(o.x - h.x, o.y - h.y) < sk.radius) o.aura[sk.stat] = Math.max(o.aura[sk.stat] || 0, sk.v); });
        });
      }
    }
    this.campT -= dt; if (this.campT <= 0) { this.campT = 0.5; this.updCamps(); }
    this.updSquads(dt);
    for (const e of this.ents) {
      if (e.dead) continue;
      if (e.buffs.length) e.buffs = e.buffs.filter(b => b.until > this.t);
      if (e.d.kind === 'u') this.updUnit(e, dt); else this.updBld(e, dt);
    }
    this.buildGrid();
    this.separate();
    this.trample(dt);
    this.updOutposts(dt); this.updRelic(dt); if (this.mode === 'survival') this.updWaves(dt);
    for (const p of this.players) for (const k in p.scd) if (p.scd[k] > 0) p.scd[k] -= dt;
    if (this.ents.some(e => e.dead)) {
      this.ents = this.ents.filter(e => { if (e.dead) { this.byId.delete(e.id); if (e.d.kind === 'b') this.markBld(e, -1); return false; } return true; });
    }
    if (this.fx.length > 500) this.fx.splice(0, this.fx.length - 500);
    this.fx = this.fx.filter(f => this.t - f.t0 < f.dur + 0.5);
  }
  updSquads(dt) {
    for (const s of this.squads.values()) {
      const mem = this.sqMembers(s);
      if (!mem.length) { this.squads.delete(s.id); continue; }
      if (mem.length !== s.mem.length) { mem.sort((a, b) => a.slot - b.slot); mem.forEach((e, i) => { e.slot = i; }); s.mem = mem.map(e => e.id); }
      s.cnt = mem.length;
      let eng = false; for (const e of mem) if (e.tgt) { eng = true; break; }
      s.eng = eng;
      if (eng) s.fightT = this.t;
      if (s.want !== undefined && Math.abs(s.want - s.ang) > 1e-3) s.ang = turnAng(s.ang, s.want, 2.4 * dt);
      const P = this.players[s.owner];
      if (s.flagCd > 0) s.flagCd -= dt;
      if ((s.lvl || 1) >= LEADER_LVL && !s.d.summon && s.d.n > 1) {
        const lead = mem.find(m => m.leader);
        if (!lead) { s.leadT = (s.leadT || 0) + dt; if (s.leadT > 30) this.sqPromote(s, mem); }
        else if (mem.length < s.d.n) { s.revT = (s.revT || 0) + dt; if (s.revT > (eng ? 16 : 8)) { s.revT = 0; this.sqRevive(s, mem, 1); } }
      }
      if (s.eq && s.eq.banner && !eng && this.t - (s.fightT || 0) > 6) {
        for (const m of mem) if (m.hp < m.maxhp) m.hp = Math.min(m.maxhp, m.hp + m.maxhp * 0.02 * dt);
        s.regenT = (s.regenT || 0) + dt;
        if (s.regenT > 15 && mem.length < s.d.n) {
          s.regenT = 0; const pop = this.popInfo(s.owner);
          if (pop.used + s.d.pop <= pop.cap) { const b = mem[0], e = this.spawn(s.key, s.owner, b.x, b.y); e.sq = s.id; e.slot = mem.length; e.rank = s.rank; e.lvl = s.lvl || 1; if (s.rank) { e.maxhp *= 1 + 0.04 * s.rank; e.hp = e.maxhp; } s.mem.push(e.id); this.addFx('summon', e.x, e.y, e.x, e.y, 16, 0.6); }
        }
      }
      s.vx = 0; s.vy = 0;
      if (s.mode === 'atk') { const t = this.byId.get(s.tid); if (!t || t.dead) this.sqHalt(s, mem); continue; }
      if (s.mode !== 'move' && s.mode !== 'amove') continue;
      if (s.mode === 'amove' && eng) continue;
      while (s.path && s.path.length > 1 && Math.hypot(s.path[0].x - s.x, s.path[0].y - s.y) < 18) s.path.shift();
      const wp = s.path && s.path.length ? s.path[0] : { x: s.tx, y: s.ty };
      const dx = wp.x - s.x, dy = wp.y - s.y, dd = Math.hypot(dx, dy);
      if (dd < 3) { s.x = wp.x; s.y = wp.y; s.want = s.turnTo; s.mode = 'idle'; s.path = null; continue; }
      if (dd > 30) s.want = Math.atan2(dy, dx);
      // pace the banner to the bulk of the battalion (median), so one stuck soldier cannot hold everyone back
      const lags = [], sm0 = [];
      for (const e of mem) { const p = this.slotPos(s, e.slot, s.cnt); lags.push(Math.hypot(e.x - p.x, e.y - p.y)); sm0.push(e.stun > 0 ? 0.2 : this.mult(e, 'spd')); }
      lags.sort((a, b) => a - b); sm0.sort((a, b) => a - b);
      const lag = lags[lags.length >> 1], sm = sm0[sm0.length >> 1];
      const f = clamp(1.5 - lag / 110, 0.5, 1);
      const sp = Math.min(dd, s.d.speed * sm * 0.92 * f * this.terrainMul(s.x, s.y) * dt);
      s.x += dx / dd * sp; s.y += dy / dd * sp; s.vx = dx / dd * sp / dt; s.vy = dy / dd * sp / dt;
      // breadcrumbs along the banner's route: stragglers follow them around cliffs, forests and fords
      const tl = s.trail[s.trail.length - 1];
      if (!tl || Math.hypot(tl.x - s.x, tl.y - s.y) > 36) { s.trail.push({ x: s.x, y: s.y }); if (s.trail.length > 150) { s.trail.shift(); s.tbase++; } }
    }
  }
  // ancient relic: appears every few minutes in the middle of the field; hold it alone for 8 s to claim gold and a war cry
  updRelic(dt) {
    const alive = this.players.filter(p => p.alive).length; if (alive < 2) return;
    if (!this.relic) {
      this.relicT -= dt; if (this.relicT > 0) return;
      this.relicT = 230;
      let spot = null;
      for (let k = 0; k < 40 && !spot; k++) {
        const x = MAP_W * (0.3 + this.rand() * 0.4), y = MAP_H * (0.25 + this.rand() * 0.5);
        if (this.blockedAt(x, y) || this.map.water(x, y) || this.outposts.some(o => Math.hypot(o.x - x, o.y - y) < 260) || this.ents.some(e => e.d.kind === 'b' && Math.hypot(e.x - x, e.y - y) < 300)) continue;
        spot = { x, y };
      }
      if (!spot) return;
      this.relic = { x: Math.round(spot.x), y: Math.round(spot.y), prog: 0, cap: -1, t0: this.t, contested: false };
      for (const p of this.players) if (p.alive) this.note(p.i, 'Появилась древняя реликвия! Удержите её 8 секунд', spot.x, spot.y);
      this.addFx('lvl', spot.x, spot.y, spot.x, spot.y, 0, 2);
      return;
    }
    const R = this.relic;
    if (this.t - R.t0 > 150) { this.relic = null; this.relicT = 120; return; }
    const teams = new Map();
    this.near(R.x, R.y, 110, e => { if (e.dead || e.d.kind !== 'u' || e.owner === NEUTRAL || !this.players[e.owner] || Math.hypot(e.x - R.x, e.y - R.y) > 110) return; const t = this.players[e.owner].team; if (!teams.has(t)) teams.set(t, new Map()); const m = teams.get(t); m.set(e.owner, (m.get(e.owner) || 0) + 1); });
    R.contested = teams.size > 1;
    if (teams.size !== 1) { R.prog = Math.max(0, R.prog - dt / 16); return; }
    const [team, byP] = [...teams.entries()][0]; let best = -1, bn = 0; for (const [pi, n] of byP) if (n > bn) { bn = n; best = pi; }
    if (R.cap < 0 || this.players[R.cap].team !== team) { R.cap = best; R.prog = Math.max(0, R.prog - dt / 4); if (R.prog > 0) return; }
    R.prog += dt / 8;
    if (R.prog < 1) return;
    const p = this.players[R.cap];
    p.gold += 400; this.addPxp(p, 30);
    for (const e of this.ents) if (!e.dead && e.owner === p.i && e.d.kind === 'u') { e.buffs = e.buffs.filter(b => b.src !== 'relic'); e.buffs.push({ s: 'dmg', v: 0.25, until: this.t + 90, src: 'relic' }, { s: 'spd', v: 0.15, until: this.t + 90, src: 'relic' }); }
    this.addFx('boom', R.x, R.y, R.x, R.y, 120, 1).c = 'holy'; this.addFx('buff', R.x, R.y, R.x, R.y, 200, 1.4);
    for (const q of this.players) if (q.alive) this.note(q.i, q.i === p.i ? 'Реликвия ваша: +400 золота, армия +25% урона и +15% скорости на 90 с!' : p.name + ' забрал реликвию', R.x, R.y);
    this.relic = null; this.relicT = 230;
  }
  // survival: waves of the horde march on the defenders' citadels; bosses every fifth wave
  updWaves(dt) {
    if (this.over !== -1) return;
    const horde = this.players.find(p => p.horde), foes = this.players.filter(p => !p.horde && p.alive); if (!horde || !foes.length) return;
    const live = this.ents.filter(e => !e.dead && e.owner === horde.i && e.d.kind === 'u');
    if (this.waveLive && !live.length) {
      this.waveLive = false;
      if (this.wave >= this.waveMax) { this.over = foes[0].team; for (const p of this.players) this.note(p.i, 'Все ' + this.waveMax + ' волн отбиты — победа!'); return; }
      for (const p of foes) { p.gold += 150 + 20 * this.wave; this.addPxp(p, 8 + this.wave); this.note(p.i, 'Волна ' + this.wave + ' отбита! +' + (150 + 20 * this.wave) + ' золота'); }
      this.waveT = Math.min(this.waveT, 25);
    }
    // stragglers keep coming for the citadels
    this.waveOrderT = (this.waveOrderT || 0) - dt;
    if (this.waveOrderT <= 0 && live.length) {
      this.waveOrderT = 8;
      for (const s of this.squads.values()) if (s.owner === horde.i && s.mode === 'idle' && !s.eng) { const f = this.byId.get(foes[(s.id) % foes.length].fort); if (f) this.sqOrder(s, f.x, f.y, 0, 'amove'); }
      for (const e of live) if (!e.sq && !e.order && !e.tgt) { const f = this.byId.get(foes[e.id % foes.length].fort); if (f) e.order = { t: 'amove', x: f.x, y: f.y, path: this.findPath(e.x, e.y, f.x, f.y) }; }
    }
    if (this.wave >= this.waveMax) { if (this.t - (this.lastWaveAt || 0) > 150 && live.length <= 4) { this.waveLive = true; for (const e of live) this.kill(e, null); } return; }
    this.waveT -= dt; if (this.waveT > 0) return;
    const k = ++this.wave, race = horde.race; this.waveLive = true; this.waveT = Math.max(35, 62 - k * 1.6);
    const edges = [[MAP_W - 150, 150], [MAP_W - 150, MAP_H - 150], [150, MAP_H - 150], [MAP_W / 2, 120], [MAP_W / 2, MAP_H - 120], [MAP_W - 120, MAP_H / 2]]
      .filter(([x, y]) => foes.every(p => Math.hypot(x - p.start[0], y - p.start[1]) > 1500));
    const types = ['inf', 'spear', 'arch', 'inf', 'cav', 'spear', 'arch'], n = Math.max(1, Math.round((1.5 + k * 1.05) * ([0.7, 1, 1.4][this.cfg.waveDiff === undefined ? 1 : this.cfg.waveDiff] || 1))), lvl = Math.min(SQ_MAX_LVL, 1 + Math.floor(k * 0.6));
    this.lastWaveAt = this.t;
    for (let i = 0; i < n; i++) {
      const [ex, ey] = edges[(i + k) % edges.length], [x, y] = this.drySpot(clamp(ex + (this.rand() - 0.5) * 160, 60, MAP_W - 60), clamp(ey + (this.rand() - 0.5) * 160, 60, MAP_H - 60));
      const key = race + '_' + (k >= 6 && i === n - 1 ? 'siege' : types[(i + k) % types.length]);
      const s = this.spawnSquad(key, horde.i, x, y, 0); if (lvl > 1) this.sqSetLvl(s, lvl, false);
      if (k >= 4 && i % 3 === 0) s.stance = 'charge';
      const f = this.byId.get(foes[i % foes.length].fort); if (f) this.sqOrder(s, f.x, f.y, 0, 'amove');
    }
    if (k % 5 === 0) { // boss wave
      const [ex, ey] = this.drySpot(...edges[k % edges.length]);
      for (let j = 0; j < k / 5; j++) { const t = this.spawn('troll', horde.i, ex + j * 40, ey); t.maxhp = t.hp = t.maxhp * (1 + k * 0.08); const f = this.byId.get(foes[0].fort); if (f) t.order = { t: 'amove', x: f.x, y: f.y, path: this.findPath(t.x, t.y, f.x, f.y) }; }
      if (k >= 10) { const h = this.spawn(race + '_h1', horde.i, ex, ey + 50); h.lvl = Math.min(10, k / 2 | 0); h.maxhp = h.hp = h.d.hp * (1 + 0.08 * (h.lvl - 1)); h.auto = true; const f = this.byId.get(foes[0].fort); if (f) h.order = { t: 'amove', x: f.x, y: f.y, path: this.findPath(h.x, h.y, f.x, f.y) }; }
    }
    for (const p of this.players) this.note(p.i, (k % 5 === 0 ? 'Волна ' + k + ' — идут вожди орды!' : 'Волна ' + k + ' из ' + this.waveMax + ' идёт на вас!'), edges[k % edges.length][0], edges[k % edges.length][1]);
  }
  // nearest dry, walkable spot (spawns must not land in rivers, cliffs or forests)
  drySpot(x, y) {
    for (let r = 0; r < 600; r += 30) for (let a = 0; a < 6.28; a += r ? 0.5 : 7) { const px = clamp(x + Math.cos(a) * r, 40, MAP_W - 40), py = clamp(y + Math.sin(a) * r, 40, MAP_H - 40); if (!this.blockedAt(px, py) && !this.map.water(px, py)) return [px, py]; }
    return [x, y];
  }
  updOutposts(dt) {
    for (const op of this.outposts) {
      if (op.owner >= 0 && !this.players[op.owner].alive) { op.owner = -1; op.prog = 0; }
      const cnt = new Map(), byP = new Map();
      this.near(op.x, op.y, 130, e => {
        if (e.dead || e.d.kind !== 'u' || !this.players[e.owner] || !this.players[e.owner].alive) return;
        if (Math.hypot(e.x - op.x, e.y - op.y) > 130) return;
        const t = this.players[e.owner].team; cnt.set(t, (cnt.get(t) || 0) + 1); byP.set(e.owner, (byP.get(e.owner) || 0) + 1);
      });
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
        if (op.prog >= 1) { op.prog = 1; op.owner = op.cap; const p = this.players[op.owner]; this.addPxp(p, 10); this.note(op.owner, 'Аванпост захвачен: +4 золота/с и +10 к лимиту армии'); }
      }
    }
  }
  moveToward(e, tx, ty, dt, k) {
    const dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy);
    if (dd < 0.5) { e.moving = 0; return; }
    const sp = e.d.speed * this.mult(e, 'spd') * (k || 1) * this.terrainMul(e.x, e.y) * dt;
    const s = Math.min(sp, dd);
    let ux = dx / dd, uy = dy / dd;
    // steer around tree trunks instead of pushing into them
    const TG = this.map.tgrid, gx = clamp((e.x / GCELL) | 0, 0, this.gcw - 1), gy = clamp((e.y / GCELL) | 0, 0, this.gch - 1);
    let best = null, bt = 1e9;
    for (let yy = Math.max(0, gy - 1); yy <= Math.min(this.gch - 1, gy + 1); yy++) for (let xx = Math.max(0, gx - 1); xx <= Math.min(this.gcw - 1, gx + 1); xx++) for (const t of TG[yy * this.gcw + xx]) {
      const tx2 = t.x - e.x, ty2 = t.y - e.y, along = tx2 * ux + ty2 * uy, min = t.r * 0.85 + Math.min(e.r, 9) * 0.75 + 3;
      if (along <= 0 || along > Math.min(dd, min + 22) || Math.abs(tx2 * uy - ty2 * ux) >= min) continue;
      if (along < bt) { bt = along; best = t; }
    }
    if (best) {
      const tx2 = best.x - e.x, ty2 = best.y - e.y, cr = tx2 * uy - ty2 * ux;
      // pass on the side away from the trunk; keep the chosen side for a moment so a trunk dead ahead can't make us dither
      let side = cr > 0 ? 1 : -1;
      if (e.avT > this.t && e.avTree === best) side = e.avSide; else { e.avTree = best; e.avSide = side; } e.avT = this.t + 0.8;
      const w = clamp(1 - bt / 40, 0.35, 1), nx = ux * (1 - w * 0.6) + uy * side * w, ny = uy * (1 - w * 0.6) - ux * side * w, nl = Math.hypot(nx, ny); ux = nx / nl; uy = ny / nl;
    }
    let nx2 = e.x + ux * s, ny2 = e.y + uy * s;
    // slide along cliff edges instead of freezing against them
    const W3 = this.map.water;
    if (W3(nx2, ny2) === 3 && W3(e.x, e.y) !== 3) { if (W3(nx2, e.y) !== 3) ny2 = e.y; else if (W3(e.x, ny2) !== 3) nx2 = e.x; else { const px = -uy, py = ux, sg = (px * dx + py * dy) >= 0 ? 1 : -1; if (W3(e.x + px * sg * s, e.y + py * sg * s) !== 3) { nx2 = e.x + px * sg * s; ny2 = e.y + py * sg * s; } else { nx2 = e.x; ny2 = e.y; } } }
    e.x = nx2; e.y = ny2; e.moving = 1;
    if (s > 0.3) e.hd = Math.atan2(uy, ux);
    if (Math.abs(dx) > 1 && s > 0.3) e.face = dx > 0 ? 1 : -1;
  }
  sqXpF(s) { const L = s.lvl || 1; if (L >= SQ_MAX_LVL) return 99; const a = SQ_XP[L - 1] || 0, b = SQ_XP[L]; return Math.round(clamp(((s.xp || 0) - a) / (b - a), 0, 1) * 99); }
  flank(e, t) {
    if (!t.sq || e.d.kind !== 'u' || e.d.range > 60) return 1;
    const s = this.squads.get(t.sq); if (!s) return 1;
    const dx = e.x - t.x, dy = e.y - t.y, d = Math.hypot(dx, dy) || 1, f = (dx * Math.cos(s.ang) + dy * Math.sin(s.ang)) / d;
    return f < -0.5 ? 1.3 : f < 0.25 ? 1.15 : 1;
  }
  // cavalry at full gallop tramples infantry and archers; spearmen stop the charge and wound the horses
  trample(dt) {
    for (const e of this.ents) {
      if (e.dead || e.d.kind !== 'u' || e.d.cls !== 'cav' || !e.moving || e.atk > 0 || e.ox === undefined) continue;
      if (Math.hypot(e.x - e.ox, e.y - e.oy) / dt < e.d.speed * 0.38) continue;
      this.near(e.x, e.y, e.r + 20, o => {
        if (o.dead || o.d.kind !== 'u' || !this.enemy(e.owner, o.owner) || o.d.hero || o.d.cls === 'cav' || o.d.cls === 'siege' || o.d.r > 14) return;
        if (Math.hypot(o.x - e.x, o.y - e.y) > e.r + o.r + 3 || o.trampleT > this.t) return;
        o.trampleT = this.t + 1.2;
        if (o.d.cls === 'spear') { this.damage(o, e, o.d.dmg * 2, false); this.damage(e, o, e.d.dmg * 0.3, false); return; }
        this.damage(e, o, e.d.dmg * this.mult(e, 'dmg'), false);
        if (!o.dead) this.knock(o, e.x, e.y, 20);
      });
    }
  }
  eqOf(e) { const s = e.sq ? this.squads.get(e.sq) : null; return s ? s.eq : null; }
  attack(e, t) {
    e.atk = 0.3; e.hd = Math.atan2(t.y - e.y, t.x - e.x);
    if (Math.abs(t.x - e.x) > 1) e.face = t.x > e.x ? 1 : -1;
    let dmg = e.d.dmg * this.mult(e, 'dmg') * this.rankMul(e) * this.flank(e, t);
    const pu = this.players[e.owner], eq = e.sq ? this.eqOf(e) : null, fire = e.d.proj && ((e.d.kind === 'b' && pu && pu.up.arrows) || (eq && eq.arrows));
    if (eq && eq.blades) dmg *= 1.25;
    if (fire) dmg *= 1.3;
    if (e.d.splash) {
      const tx = t.x, ty = t.y, fly = Math.max(0.7, Math.hypot(tx - e.x, ty - e.y) / 420), owner = e.owner, R = e.d.splash, tid = t.id;
      this.addFx('boulder', e.x, e.y - 14, tx, ty, 0, fly);
      this.pending.push({ at: this.t + fly, fn: () => { for (const o of this.unitsIn(tx, ty, R, o => this.enemy(owner, o.owner))) this.damage(e, o, dmg * (o.id === tid ? 1 : 0.55), false); this.addFx('boom', tx, ty, tx, ty, R, 0.6).c = 'quake'; } });
      return;
    }
    if (e.d.proj) {
      const dd = Math.hypot(t.x - e.x, t.y - e.y);
      const fly = Math.max(0.12, dd / 560);
      this.proj.push({ tid: t.id, src: e.id, sd: e.d, own: e.owner, dmg, left: fly });
      const f = this.addFx(fire ? 'farrow' : e.d.proj, e.x, e.y - (e.d.kind === 'b' ? e.r * 0.8 : 12), t.x, t.y - 8, 0, fly);
      if (fire) f.c = ARROW_FX[pu.race] || 'fire';
    } else {
      this.damage(e, t, dmg, false);
      if (e.d.cleave && t.d.kind === 'u') { let n = 0; this.near(t.x, t.y, e.d.cleave + 20, o => { if (n >= 3 || o === t || o.dead || o.d.kind !== 'u' || !this.enemy(e.owner, o.owner) || Math.hypot(o.x - t.x, o.y - t.y) > e.d.cleave + o.r) return; n++; this.damage(e, o, dmg * 0.5, false); }); }
    }
  }
  updUnit(e, dt) {
    e.ox = e.x; e.oy = e.y;
    if (e.owner === NEUTRAL && !e.tgt && e.hp < e.maxhp && this.t - (e.lastHit || -99) > 5) e.hp = Math.min(e.maxhp, e.hp + e.maxhp * 0.05 * dt);
    if (e.life > 0) { e.life -= dt; if (e.life <= 0) { this.kill(e, null); return; } }
    for (let i = 0; i < 4; i++) if (e.scd[i] > 0) e.scd[i] -= dt;
    e.cd -= dt; if (e.atk > 0) e.atk -= dt; if (e.knockT > 0) e.knockT -= dt;
    if (e.d.hero && e.hp < e.maxhp && this.t - (e.lastHit || 0) > 6) e.hp = Math.min(e.maxhp, e.hp + e.maxhp * 0.01 * dt);
    if (e.stun > 0) { e.stun -= dt; e.moving = 0; return; }
    if (e.sq) { const s = this.squads.get(e.sq); if (s) { this.updMember(e, s, dt); return; } e.sq = 0; }
    if (e.d.worker) { this.updWorker(e, dt); return; }
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
        const f = this.findEnemy(e, e.d.aggro);
        if (f && (!tgt || (tgt.d.kind === 'b' && f.d.kind === 'u') || Math.hypot(f.x - e.x, f.y - e.y) + 40 < Math.hypot(tgt.x - e.x, tgt.y - e.y))) { tgt = f; e.tgt = f.id; }
      }
      if (tgt && !o) {
        const leash = Math.hypot(e.x - e.anchor.x, e.y - e.anchor.y);
        const L = e.owner === NEUTRAL ? 260 : 420;
        if (leash > L && tgt.d.kind === 'u' && Math.hypot(tgt.x - e.anchor.x, tgt.y - e.anchor.y) > L) { tgt = null; e.tgt = 0; e.order = { t: 'move', x: e.anchor.x, y: e.anchor.y, ret: 1 }; }
      }
    }
    if (tgt) {
      const dd = Math.hypot(tgt.x - e.x, tgt.y - e.y) - tgt.r - e.r;
      if (dd <= e.d.range) { e.moving = 0; if (e.cd <= 0) { this.attack(e, tgt); e.cd = e.d.rate / this.mult(e, 'aspd'); } }
      else this.moveToward(e, tgt.x, tgt.y, dt);
      return;
    }
    if (o && (o.t === 'move' || o.t === 'amove')) {
      const wp = o.path && o.path.length ? o.path[0] : o;
      if (o.path && o.path.length > 1 && Math.hypot(wp.x - e.x, wp.y - e.y) < 14) { o.path.shift(); return; }
      const dd = Math.hypot(o.x - e.x, o.y - e.y);
      this.moveToward(e, wp.x, wp.y, dt);
      if (dd < 6) { e.order = null; e.anchor = { x: e.x, y: e.y }; e.moving = 0; }
      else {
        e.stuckT = (e.lastPx !== undefined && Math.hypot(e.x - e.lastPx, e.y - e.lastPy) < e.d.speed * dt * 0.25) ? e.stuckT + dt : Math.max(0, e.stuckT - dt);
        e.lastPx = e.x; e.lastPy = e.y;
        if (e.stuckT > 1.2 && dd < 90) { e.order = null; e.anchor = { x: e.x, y: e.y }; e.moving = 0; }
        else if (e.stuckT > 1.5) { e.stuckT = 0; e.ghostT = this.t + 2; o.path = this.findPath(e.x, e.y, o.x, o.y); }
      }
      return;
    }
    e.moving = 0;
  }
  // a soldier inside a battalion: fights around its formation slot and keeps rank while marching
  updMember(e, s, dt) {
    const slot = this.freeSlot(s, this.slotPos(s, e.slot, s.cnt || s.mem.length));
    let tgt = null;
    if (s.mode === 'atk') { tgt = this.byId.get(s.tid); if (tgt && tgt.dead) tgt = null; e.tgt = tgt ? tgt.id : 0; }
    else if (s.mode === 'move') e.tgt = 0;
    else {
      tgt = e.tgt ? this.byId.get(e.tgt) : null;
      if (tgt && tgt.dead) tgt = null;
      const hold = s.mode === 'hold';
      e.scanT -= dt * (s.eng && !tgt ? 3 : 1);
      if (e.scanT <= 0) {
        e.scanT = 0.35 + this.rand() * 0.2;
        // soldiers fight around their place in the ranks: melee reach a short way out, archers shoot from the line
        const ranged = e.d.range > 60, R = hold ? e.d.range + e.r + 4 : ranged ? e.d.range + 10 : (s.eng ? 150 : 120);
        const f = this.findEnemy(e, R);
        if (f && (!tgt || (tgt.d.kind === 'b' && f.d.kind === 'u') || Math.hypot(f.x - e.x, f.y - e.y) + 30 < Math.hypot(tgt.x - e.x, tgt.y - e.y))) tgt = f;
      }
      if (tgt) {
        if (hold) { if (Math.hypot(tgt.x - e.x, tgt.y - e.y) - tgt.r - e.r > e.d.range + 4) tgt = null; }
        else if (Math.hypot(tgt.x - slot.x, tgt.y - slot.y) - tgt.r > (e.d.range > 60 ? e.d.range + 40 : s.eng ? 170 : 140)) tgt = null;
      }
      e.tgt = tgt ? tgt.id : 0;
    }
    if (tgt) {
      const dd = Math.hypot(tgt.x - e.x, tgt.y - e.y) - tgt.r - e.r;
      if (dd <= e.d.range) { e.moving = 0; if (Math.abs(tgt.x - e.x) > 1) e.face = tgt.x > e.x ? 1 : -1; if (e.cd <= 0) { this.attack(e, tgt); e.cd = e.d.rate / this.mult(e, 'aspd') * (0.9 + this.rand() * 0.2); } }
      else this.moveToward(e, tgt.x, tgt.y, dt, 1.05);
      return;
    }
    const dd = Math.hypot(slot.x - e.x, slot.y - e.y);
    const T = s.trail;
    if (dd > 20) {
      // no net progress toward the formation for a while -> plan a real path (jitter from neighbours doesn't count as progress)
      e.mchk = (e.mchk || 0) - dt;
      if (e.mchk <= 0) {
        if (e.mdd !== undefined && dd > e.mdd - (dd > 60 ? 25 : 8)) {
          if (!(e.mpath && e.mpath.length && e.mpathT > 0)) { e.mpath = this.findPath(e.x, e.y, slot.x, slot.y); e.mpathT = 5; }
          else e.ghostT = this.t + 2; // wedged between trunks even on a real path: squeeze through the thicket
        }
        e.mdd = dd; e.mchk = dd > 60 ? 2 : 1.2;
      }
    } else { e.mdd = undefined; e.mpathT = 0; }
    if (dd > 20 && e.mpath && e.mpath.length && e.mpathT > 0) {
      // stuck: follow a proper path to the formation for a while
      e.mpathT -= dt;
      const wp = e.mpath[0];
      if (e.mpath.length > 1 && Math.hypot(wp.x - e.x, wp.y - e.y) < 14) e.mpath.shift();
      this.moveToward(e, wp.x, wp.y, dt, 1.35);
    } else if (dd > 60 && T && T.length > 1) {
      // far from the formation: walk the banner's breadcrumb trail instead of pushing into obstacles
      const base = s.tbase || 0;
      if (e.ti === undefined || e.ti < base || e.ti >= base + T.length) { let bi = 0, bd = 1e9; for (let i = 0; i < T.length; i++) { const d2 = Math.hypot(T[i].x - e.x, T[i].y - e.y); if (d2 < bd) { bd = d2; bi = i; } } e.ti = base + bi; }
      let k = e.ti - base;
      if (Math.hypot(T[k].x - e.x, T[k].y - e.y) < 22 && k < T.length - 1) { e.ti++; k++; }
      if (k >= T.length - 1 && Math.hypot(T[k].x - e.x, T[k].y - e.y) < 22) this.moveToward(e, slot.x, slot.y, dt, 1.35);
      else this.moveToward(e, T[k].x, T[k].y, dt, 1.35);
    } else if (dd > 60) {
      // far from the formation: find a way around forests, cliffs and buildings instead of pushing straight into them
      e.mpathT = (e.mpathT || 0) - dt;
      if (!e.mpath || !e.mpath.length || e.mpathT <= 0) { e.mpathT = 2.5 + this.rand(); e.mpath = this.findPath(e.x, e.y, slot.x, slot.y, 2500); }
      const wp = e.mpath[0];
      if (e.mpath.length > 1 && Math.hypot(wp.x - e.x, wp.y - e.y) < 14) e.mpath.shift();
      this.moveToward(e, wp.x, wp.y, dt, 1.35);
    } else {
      // in formation: march with the banner's velocity plus a soft pull to the slot (smooth, no stop-and-go)
      e.mpath = null;
      const vx = (s.vx || 0) + (slot.x - e.x) * 2.2, vy = (s.vy || 0) + (slot.y - e.y) * 2.2, v = Math.hypot(vx, vy);
      if (v > 4 || dd > 2.5) { const B = e.d.speed * this.mult(e, 'spd') * this.terrainMul(e.x, e.y); this.moveToward(e, e.x + vx, e.y + vy, dt, Math.min(v / Math.max(1, B), 1.35)); if (s.vx || s.vy) e.hd = turnAng(e.hd !== undefined ? e.hd : s.ang, Math.atan2(s.vy, s.vx), 8 * dt); }
      else { e.moving = 0; e.hd = s.ang; const fc = Math.cos(s.ang); if (Math.abs(fc) > 0.2) e.face = fc > 0 ? 1 : -1; }
    }
  }
  updBld(b, dt) {
    const bw = b.bw ? 1 + (Math.min(b.bw, 4) - 1) * 0.5 : 0; b.bw = 0;
    if (b.built < 1) {
      if (!bw) return; // construction pauses without builders
      const inc = dt / b.d.time * bw;
      b.built = Math.min(1, b.built + inc); b.hp = Math.min(b.maxhp, b.hp + b.maxhp * 0.9 * inc);
      if (b.built >= 1) this.note(b.owner, b.d.name + ': строительство завершено');
      return;
    }
    if (bw && b.hp < b.maxhp && b.d.sub !== 'fort' && this.t - (b.lastHit || -99) > 3) b.hp = Math.min(b.maxhp, b.hp + Math.min(b.maxhp * 0.008, 12) * bw * dt); // builders repair between assaults; the citadel cannot be patched up
    const P = this.players[b.owner], fortUp = b.d.sub === 'fort' && P ? P.up : {};
    if (b.d.shoot) {
      b.cd -= dt;
      if (b.cd <= 0) {
        const R = b.d.range * (fortUp.archers ? 1.2 : 1);
        const t = this.findEnemy(b, R, true) || this.findEnemy(b, R * 0.6, false);
        if (t) {
          this.attack(b, t); b.cd = b.d.rate;
          if (fortUp.archers) this.unitsIn(b.x, b.y, R, o => o !== t && this.enemy(b.owner, o.owner) && o.d.kind === 'u').sort((a2, b2) => Math.hypot(a2.x - b.x, a2.y - b.y) - Math.hypot(b2.x - b.x, b2.y - b.y)).slice(0, 2).forEach(o => this.attack(b, o));
        } else b.cd = 0.3;
      }
    }
    if (fortUp.catapult) {
      b.catT = (b.catT || 0) - dt;
      if (b.catT <= 0) {
        const foes = this.unitsIn(b.x, b.y, 560, o => this.enemy(b.owner, o.owner) && o.d.kind === 'u' && Math.hypot(o.x - b.x, o.y - b.y) > b.r + 40);
        if (foes.length) {
          let best = foes[0], bn = 0; for (const f of foes.slice(0, 24)) { let n = 0; for (const o of foes) if (Math.hypot(o.x - f.x, o.y - f.y) < 70) n++; if (n > bn) { bn = n; best = f; } }
          const tx = best.x, ty = best.y, owner = b.owner, src = { d: { cls: 'siege' }, owner };
          this.addFx('boulder', b.x, b.y - b.r, tx, ty, 0, 1.2); b.catT = 6;
          this.pending.push({ at: this.t + 1.2, fn: () => { for (const o of this.unitsIn(tx, ty, 75, o => this.enemy(owner, o.owner))) { this.damage(src, o, 110, true); if (o.d.kind === 'u' && !o.dead && !o.d.hero) this.knock(o, tx, ty, 18); } this.addFx('boom', tx, ty, tx, ty, 70, 0.6).c = 'quake'; } });
        } else b.catT = 1;
      }
    }
    if (fortUp.infirmary) { b.infT = (b.infT || 0) - dt; if (b.infT <= 0) { b.infT = 0.5; for (const o of this.unitsIn(b.x, b.y, 380, o => o.owner === b.owner && o.d.kind === 'u' && o.hp < o.maxhp)) this.heal(o, o.maxhp * 0.015); } }
    if (b.queue.length) {
      const q = b.queue[0]; const d = q.up ? null : DEF[q.u];
      q.t += dt;
      if (q.up) {
        if (q.t >= UPG[q.up].time) { b.queue.shift(); const p = this.players[b.owner]; p.up[q.up] = 1; if (q.up === 'walls') { const add = b.maxhp * 0.5; b.maxhp += add; b.hp += add; } this.note(b.owner, upName(p.race, q.up) + (UPG[q.up].eq ? ': снаряжение открыто — покупайте его батальонам' : ': улучшение готово!'), b.x, b.y); this.addFx('lvl', b.x, b.y, b.x, b.y, 0, 1.4); }
        return;
      }
      if (q.t >= d.time) {
        b.queue.shift();
        const p = this.players[b.owner];
        const rp = b.rally || { x: b.x + (MAP_W / 2 - b.x) * 0.12, y: b.y + (MAP_H / 2 - b.y) * 0.12 };
        const a = Math.atan2(rp.y - b.y, rp.x - b.x);
        if (d.worker) {
          const u = this.spawn(q.u, b.owner, b.x + Math.cos(a) * (b.r + 14), b.y + Math.sin(a) * (b.r + 14));
          u.order = { t: 'move', x: b.x + Math.cos(a) * (b.r + 60), y: b.y + Math.sin(a) * (b.r + 60) };
          if (!p.ai) this.note(b.owner, d.name + ' готов к работе');
        } else if (d.hero) {
          const u = this.spawn(q.u, b.owner, b.x + Math.cos(a) * (b.r + 16), b.y + Math.sin(a) * (b.r + 16));
          u.order = { t: 'amove', x: rp.x + (this.rand() - 0.5) * 50, y: rp.y + (this.rand() - 0.5) * 50 };
          const hk = q.u.split('_')[1]; const hs = p.heroes[hk]; hs.id = u.id; hs.dead = false;
          if (hs.recruited) { u.lvl = hs.lvl || 1; const f = 1 + 0.08 * (u.lvl - 1); u.maxhp = u.hp = d.hp * f; }
          u.auto = !!hs.auto; hs.recruited = true; this.note(b.owner, 'Герой ' + d.heroName + ' готов к бою!');
        } else {
          const probe = { d, mem: new Array(d.n) };
          const off = b.r + 10 + this.sqDepth(probe);
          const s = this.spawnSquad(q.u, b.owner, b.x + Math.cos(a) * off, b.y + Math.sin(a) * off, a);
          const jx = (this.rand() - 0.5) * 60, jy = (this.rand() - 0.5) * 60;
          this.sqOrder(s, rp.x + jx, rp.y + jy, a, 'amove');
          if (!p.ai) this.note(b.owner, 'Батальон готов: ' + d.name + ' ×' + d.n);
        }
      }
    }
  }
  separate() {
    const W = this.gcw;
    const pair = (a, b) => {
      if (a.dead || b.dead) return;
      const ab = a.d.kind === 'b', bb = b.d.kind === 'b';
      if (ab && bb) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = a.r + b.r - (ab || bb ? 0 : 3);
      if (Math.abs(dx) > min || Math.abs(dy) > min) return;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) return;
      let d = Math.sqrt(d2), nx, ny;
      if (d < 0.01) { const ang = (a.id * 7 + b.id * 13) % 6.28; nx = Math.cos(ang); ny = Math.sin(ang); d = 0; } else { nx = dx / d; ny = dy / d; }
      const push = min - d;
      if (ab) { b.x += nx * push; b.y += ny * push; }
      else if (bb) { a.x -= nx * push; a.y -= ny * push; }
      else {
        let wa = 0.5, wb = 0.5;
        if (a.moving && !b.moving) { wa = 0.2; wb = 0.8; } else if (b.moving && !a.moving) { wa = 0.8; wb = 0.2; }
        if (a.d.hero && !b.d.hero) { wa *= 0.5; wb = 1 - wa; } else if (b.d.hero && !a.d.hero) { wb *= 0.5; wa = 1 - wb; }
        // allies slide past each other gently; enemies hold the line
        // friends in different battalions filter through each other on the march; enemies hold the line
        const k = a.owner !== b.owner ? 0.6 : a.sq && a.sq === b.sq ? 0.7 : 0.5;
        a.x -= nx * push * k * wa; a.y -= ny * push * k * wa; b.x += nx * push * k * wb; b.y += ny * push * k * wb;
      }
    };
    // units vs buildings: few buildings, look up nearby units in the coarse grid
    for (const b of this.ents) if (b.d.kind === 'b' && !b.dead) this.near(b.x, b.y, b.r + 24, u => { if (u.d.kind === 'u') pair(b, u); });
    // units vs units on a fine grid (dense crowds stay cheap)
    const FC = 40, FW = Math.ceil(MAP_W / FC) + 1, FH = Math.ceil(MAP_H / FC) + 1;
    if (!this.fcells) { this.fcells = Array.from({ length: FW * FH }, () => []); this.fused = []; }
    const F = this.fcells;
    for (const i of this.fused) F[i].length = 0;
    this.fused.length = 0;
    for (const e of this.ents) if (e.d.kind === 'u' && !e.dead) { const i = clamp((e.y / FC) | 0, 0, FH - 1) * FW + clamp((e.x / FC) | 0, 0, FW - 1); if (!F[i].length) this.fused.push(i); F[i].push(e); }
    for (const ci of this.fused) {
      const L = F[ci];
      for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) pair(L[i], L[j]);
      const cx = ci % FW;
      for (const off of [1, FW - 1, FW, FW + 1]) { if ((off === 1 || off === FW + 1) && cx === FW - 1) continue; if (off === FW - 1 && cx === 0) continue; const nb = ci + off; if (nb >= F.length) continue; const Mm = F[nb]; if (!Mm.length) continue; for (let i = 0; i < L.length; i++) for (let j = 0; j < Mm.length; j++) pair(L[i], Mm[j]); }
    }
    const TG = this.map.tgrid, M = this.map;
    for (const e of this.ents) {
      if (e.d.kind !== 'u' || e.dead) continue;
      const gx = clamp((e.x / GCELL) | 0, 0, W - 1), gy = clamp((e.y / GCELL) | 0, 0, this.gch - 1);
      for (let yy = Math.max(0, gy - 1); yy <= Math.min(this.gch - 1, gy + 1); yy++) for (let xx = Math.max(0, gx - 1); xx <= Math.min(W - 1, gx + 1); xx++) {
        if (e.ghostT > this.t) break;
        for (const t of TG[yy * W + xx]) { const dx = e.x - t.x, dy = e.y - t.y, min = t.r * 0.85 + Math.min(e.r, 9) * 0.75; if (Math.abs(dx) > min || Math.abs(dy) > min) continue; const d = Math.hypot(dx, dy); if (d < min && d > 0.01) { e.x = t.x + dx / d * min; e.y = t.y + dy / d * min; } }
      }
      e.x = clamp(e.x, 10, MAP_W - 10); e.y = clamp(e.y, 10, MAP_H - 10);
      if (M.water(e.x, e.y) === 3 && e.ox !== undefined && M.water(e.ox, e.oy) !== 3) { if (M.water(e.x, e.oy) !== 3) e.y = e.oy; else if (M.water(e.ox, e.y) !== 3) e.x = e.ox; else { e.x = e.ox; e.y = e.oy; } }
    }
  }

  // ---- network snapshot ----
  snapshot() {
    const u = [];
    for (const e of this.ents) {
      if (e.dead) continue;
      let ex;
      if (e.d.kind === 'b') ex = Math.round(e.built * 99);
      else { const dir = ((Math.round((e.hd !== undefined ? e.hd : e.face < 0 ? Math.PI : 0) / (Math.PI / 4)) % 8) + 8) % 8; ex = (e.atk > 0 ? 1 : 0) | (e.moving ? 2 : 0) | ((dir & 1) << 2) | (e.stun > 0 ? 8 : 0) | (e.sq ? (e.leader ? 16 : 0) : (Math.min(3, e.rank) << 4)) | (Math.min(15, e.lvl) << 6) | ((dir >> 1) << 10); }
      u.push(e.id, e.d.ti, e.owner, Math.round(e.x), Math.round(e.y), Math.ceil(e.hp / e.maxhp * 99), ex, e.sq || 0);
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
    const pl = this.players.map(p => { const pi = this.popInfo(p.i); return [Math.floor(p.gold), pi.used, pi.cap, p.alive ? 1 : 0, Math.round(this.income(p) * 10), p.pts, Math.round((p.pxp - (p.plvl > 1 ? powerNeed(p.plvl - 1) : 0)) / (powerNeed(p.plvl) - (p.plvl > 1 ? powerNeed(p.plvl - 1) : 0)) * 99), p.plvl, Object.keys(p.up).reduce((m, k) => m | UP_BIT[k], 0), SPELL_ORDER.reduce((m, k, i) => m | (p.spells[k] ? 1 << i : 0), 0), ...SPELL_ORDER.map(k => Math.max(0, Math.ceil(p.scd[k] || 0)))]; });
    const op = []; for (const o of this.outposts) op.push(o.owner, Math.round(o.prog * 99), o.cap, o.contested ? 1 : 0);
    const hs = [];
    for (const p of this.players) for (const hk of Object.keys(p.heroes)) {
      const s = p.heroes[hk]; const h = s.id ? this.byId.get(s.id) : null;
      hs.push(p.i, hk === 'h1' ? 1 : 2, h ? h.id : 0, h ? h.lvl : (s.lvl || 1), h ? Math.round(h.xp / (150 * h.lvl) * 99) : 0, s.recruited ? 1 : 0, s.auto ? 1 : 0,
        ...(h ? h.scd.map(c => Math.max(0, Math.ceil(c * 10))) : [0, 0, 0, 0]));
    }
    const q = [];
    for (const e of this.ents) if (e.d.kind === 'b' && e.queue.length) { const q0 = e.queue[0], tm = q0.up ? UPG[q0.up].time : DEF[q0.u].time; q.push(e.id, e.queue.length, Math.round(q0.t / tm * 99), q0.up ? 100 + UPGRADES.findIndex(u => u.k === q0.up) : DEF[q0.u].ti); }
    const notes = this.notes.filter(n => this.t - n.t < 3 && this.players[n.p] && this.players[n.p].remote).slice(-4).map(n => [n.p, n.text, Math.round(n.t * 10), n.x, n.y]);
    const se = []; for (const s of this.squads.values()) if (s.eq || (s.lvl || 1) > 1 || s.xp || s.stance) se.push(s.id, s.eq ? Object.keys(s.eq).reduce((m, k) => m | (UP_BIT[k] || 0), 0) : 0, Math.max(0, Math.ceil(s.flagCd || 0)), this.sqXpF(s), STANCE_KEYS.indexOf(s.stance || 'norm'));
    const rl = this.relic ? [this.relic.x, this.relic.y, Math.round(this.relic.prog * 99), this.relic.cap, this.relic.contested ? 1 : 0] : null;
    const sv = this.mode === 'survival' ? [this.wave, Math.ceil(this.waveT), this.waveMax, this.ents.filter(e => !e.dead && e.d.kind === 'u' && this.players[e.owner] && this.players[e.owner].horde).length] : null;
    return { t: Math.round(this.t * 100), u, fx, pl, hs, q, op, se, rl, sv, n: notes, o: this.over };
  }
}
