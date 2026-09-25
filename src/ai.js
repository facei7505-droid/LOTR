// ================= AI =================
class AI {
  constructor(game, pi) {
    this.g = game; this.pi = pi; this.t = 0; this.think = 0;
    this.wave = 30; this.lastAttack = 0; this.target = null;
    this.r = mkRng(game.seed * 31 + pi * 977);
  }
  get p() { return this.g.players[this.pi]; }
  mine(pred) { return this.g.ents.filter(e => !e.dead && e.owner === this.pi && pred(e)); }
  count(sub) { return this.mine(e => e.d.sub === sub).length; }
  tryBuild(sub) {
    const g = this.g, p = this.p, key = p.race + '_' + sub, d = DEF[key];
    if (p.gold < d.cost) return false;
    const f = g.byId.get(p.fort); if (!f) return false;
    const toC = Math.atan2(MAP_H / 2 - f.y, MAP_W / 2 - f.x);
    for (let k = 0; k < 30; k++) {
      let a, rr;
      if (sub === 'tower') { a = toC + (this.r() - 0.5) * 1.4; rr = 250 + this.r() * 180; }
      else if (sub === 'farm') { a = toC + Math.PI + (this.r() - 0.5) * 3.2; rr = 150 + this.r() * 330; }
      else { a = toC + (this.r() - 0.5) * 2.4; rr = 160 + this.r() * 250; }
      const x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr;
      if (g.canPlace(this.pi, key, x, y)) {
        const ws = this.mine(e => e.d.worker && (!e.order || e.order.t !== 'build'));
        if (!ws.length) return false;
        ws.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
        g.cmd(this.pi, { c: 'build', t: sub, x, y, ids: [ws[0].id] }); return true;
      }
    }
    return false;
  }
  step(dt) {
    const g = this.g, p = this.p;
    if (!p.alive || g.over !== -1) return;
    this.t += dt;
    this.think -= dt;
    this.heroMicro();
    if (this.think > 0) return;
    this.think = [1.6, 1.1, 0.8][p.diff] || 1.1;
    this.usePowers();
    const pop = g.popInfo(this.pi);
    const farms = this.count('farm'), barr = this.count('barr'), range = this.count('range'), stable = this.count('stable'), towers = this.count('tower'), forge = this.count('forge');
    // build order
    const wantFarms = Math.min(10, 2 + Math.floor(this.t / 40));
    if (farms < 2) this.tryBuild('farm');
    else if (barr < 1) this.tryBuild('barr');
    else if (farms < 3) this.tryBuild('farm');
    else if (range < 1) this.tryBuild('range');
    else if (pop.used >= pop.cap - 12 && farms < wantFarms) this.tryBuild('farm');
    else if (stable < 1 && this.t > 110) this.tryBuild('stable');
    else if (forge < 1 && this.t > 180 && p.gold > 650) this.tryBuild('forge');
    else if (towers < 1 && this.t > 200 && p.gold > 700) this.tryBuild('tower');
    else if (barr < 2 && this.t > 300 && p.gold > 800) this.tryBuild('barr');
    else if (farms < wantFarms && p.gold > 500) this.tryBuild('farm');
    // builders: keep a small crew, and let idle ones help finish construction
    const fortB = g.byId.get(p.fort), workers = this.mine(e => e.d.worker);
    const wantW = this.t > 200 ? 3 : 2;
    if (fortB && workers.length < wantW && !fortB.queue.some(q => q.u && q.u.endsWith('_worker')) && p.gold >= DEF[p.race + '_worker'].cost) g.cmd(this.pi, { c: 'train', b: fortB.id, u: p.race + '_worker' });
    for (const w of workers) if (!w.order) { const site = this.mine(e => e.d.kind === 'b' && e.built < 1)[0]; if (site) g.cmd(this.pi, { c: 'work', t: site.id, ids: [w.id] }); }
    // upgrades: equipment in barracks/range (needs a forge), citadel improvements
    const hasForge = this.mine(e => e.d.forge && e.built >= 1).length > 0;
    for (const U of UPGRADES) {
      if (p.up[U.k] || (U.forge && !hasForge) || p.gold < U.cost + (U.at === 'fort' ? 500 : 350) || this.t < (U.at === 'fort' ? 240 : 150)) continue;
      const b = this.mine(e => e.d.sub === U.at && e.built >= 1 && !e.queue.length)[0];
      if (b && !this.mine(e => e.d.kind === 'b' && e.queue.some(q => q.up === U.k)).length) { g.cmd(this.pi, { c: 'research', b: b.id, k: U.k }); break; }
    }
    // battalion leaders raise the standard when their men fall
    for (const s of g.squads.values()) if (s.owner === this.pi && s.eng && !(s.flagCd > 0) && s.mem.length < s.d.n * 0.6 && (s.lvl || 1) >= LEADER_LVL) { g.cmd(this.pi, { c: 'flag', s: [s.id] }); break; }
    // buy equipment for full, battle-ready battalions
    if (this.t > (this.eqT || 0) && p.gold > 450) {
      this.eqT = this.t + 4;
      for (const s of g.squads.values()) {
        if (s.owner !== this.pi || s.d.summon || s.mem.length < s.d.n * 0.6) continue;
        const U = UPGRADES.find(u => u.eq && p.up[u.k] && u.cls.includes(s.d.cls) && !(s.eq && s.eq[u.k]) && p.gold > u.eq + 350);
        if (U) { g.cmd(this.pi, { c: 'equip', s: [s.id], k: U.k }); break; }
      }
    }
    // heroes
    const fort = g.byId.get(p.fort);
    let saving = false;
    if (fort && this.t > 75) for (const hk of ['h1', 'h2']) {
      const hs = p.heroes[hk]; if (hs.id || fort.queue.some(q => q.hero && q.u.endsWith(hk))) continue;
      if (hk === 'h2' && this.t < 200) continue;
      const cost = hs.recruited ? DEF[p.race + '_' + hk].cost * 0.5 : DEF[p.race + '_' + hk].cost;
      if (p.gold >= cost) g.cmd(this.pi, { c: 'hero', b: fort.id, h: hk }); else saving = true;
    }
    // train
    const fgB = this.mine(e => e.d.forge && e.built >= 1)[0];
    if (fgB && !fgB.queue.length && this.t > 330 && this.mine(e => e.d.sub === 'siege').length < 2 && p.gold > DEF[p.race + '_siege'].cost + 400) g.cmd(this.pi, { c: 'train', b: fgB.id, u: p.race + '_siege' });
    for (const b of this.mine(e => e.d.kind === 'b' && e.built >= 1 && e.d.trains && e.d.sub !== 'fort' && !e.d.forge)) {
      if (b.queue.length >= 2) continue;
      const opts = b.d.trains; let u = opts[0];
      if (opts.length > 1) u = this.r() < 0.6 ? opts[0] : opts[1];
      if (saving && p.gold < 1200 && g.popInfo(this.pi).used >= 20) continue;
      if (p.gold > DEF[u].cost + (this.t > 60 ? 150 : 0)) g.cmd(this.pi, { c: 'train', b: b.id, u });
    }
    // army control: battalions (squads) + heroes
    const sqs = [...g.squads.values()].filter(q => q.owner === this.pi && q.mem.length && !q.d.summon);
    const heroes = this.mine(e => e.d.hero);
    const soldiers = sqs.reduce((n, q) => n + q.mem.length, 0);
    // battalions already marching to (about) the same spot keep their formation and path
    const order = (list, hs, x, y) => { list = list.filter(q => !(q.mode === 'amove' && Math.hypot(q.tx - x, q.ty - y) < 320)); hs = hs.filter(h => !(h.order && h.order.t === 'amove' && Math.hypot(h.order.x - x, h.order.y - y) < 320)); if (list.length || hs.length) g.cmd(this.pi, { c: 'move', s: list.map(q => q.id), ids: hs.map(h => h.id), x, y, a: 1 }); };
    // top up worn-out battalions near home
    if (p.gold > 500 && this.t - (this.lastRefill || 0) > 6) {
      const worn = sqs.filter(q => q.mode === 'idle' && !q.eng && q.mem.length < q.d.n * 0.6 && fort && Math.hypot(q.x - fort.x, q.y - fort.y) < 900);
      if (worn.length) { this.lastRefill = this.t; g.cmd(this.pi, { c: 'refill', s: worn.map(q => q.id) }); }
    }
    // defense: enemies near my base?
    let threat = null;
    if (fort) g.near(fort.x, fort.y, 700, e => { if (!threat && !e.dead && e.d.kind === 'u' && g.enemy(this.pi, e.owner) && Math.hypot(e.x - fort.x, e.y - fort.y) < 700) threat = e; });
    if (threat) {
      order(sqs.filter(q => q.mode !== 'atk' && !q.eng), heroes.filter(h => !h.order || h.order.t !== 'atk'), threat.x, threat.y);
      return;
    }
    const idleSq = sqs.filter(q => q.mode === 'idle' && !q.eng), idleH = heroes.filter(h => !h.order && !h.tgt);
    const rl = g.relic;
    if (rl && soldiers >= 12 && this.relicGo !== rl.t0 && (this.lastAttack <= 0 || this.t - this.lastAttack > 90)) { this.relicGo = rl.t0; const near = sqs.filter(q => !q.eng).sort((a, b) => Math.hypot(a.x - rl.x, a.y - rl.y) - Math.hypot(b.x - rl.x, b.y - rl.y)).slice(0, Math.min(3, Math.ceil(sqs.length * 0.4))); order(near, [], rl.x, rl.y); }
    if (((soldiers >= this.wave && this.t - this.lastAttack > 20) || (soldiers >= 40 && this.t - this.lastAttack > 150) || (soldiers >= 24 && this.t - this.lastAttack > 240)) && this.t > 150) {
      this.lastAttack = this.t; this.wave = Math.min(g.popMax * 0.55, this.wave + 10);
      const tgt = this.pickTarget();
      if (tgt) order(sqs, heroes, tgt.x, tgt.y);
    } else if (this.t - this.lastAttack < 90 && this.lastAttack > 0) {
      // keep pushing: idle battalions rejoin the attack
      const tgt = this.pickTarget();
      if (tgt) order(idleSq, idleH, tgt.x, tgt.y);
    } else if (fort && (idleSq.length || idleH.length)) {
      // gather near base front or hold the nearest free outpost
      let gx = fort.x + (MAP_W / 2 - fort.x) * 0.18, gy = fort.y + (MAP_H / 2 - fort.y) * 0.18;
      let bo = null, bd = 1800;
      for (const op of g.outposts) { if (op.owner >= 0 && !g.enemy(this.pi, op.owner)) continue; const d = Math.hypot(op.x - fort.x, op.y - fort.y); if (d < bd) { bd = d; bo = op; } }
      if (bo && this.t > 45) { gx = bo.x; gy = bo.y; }
      // strong enough: clear a nearby wild camp for its treasure
      const camp = soldiers >= 24 && this.t > 90 && this.t - (this.campT || -999) > 150 ? g.camps.find(c => c.alive && Math.hypot(c.x - fort.x, c.y - fort.y) < 1500) : null;
      if (camp) { gx = camp.x; gy = camp.y; this.campT = this.t; }
      const far = idleSq.filter(q => Math.hypot(q.x - gx, q.y - gy) > 260), farH = idleH.filter(h => Math.hypot(h.x - gx, h.y - gy) > 260);
      order(far, farH, gx, gy);
    }
  }
  usePowers() {
    const g = this.g, p = this.p, pi = this.pi;
    // spend power points in the book
    const pref = ['meteor', 'reinf', 'heal', 'rally', 'ult', 'summon', 'gold', 'curse', 'haste'];
    for (const k of pref) { const S = SPELLS[k], req = SPELL_REQ[k]; if (!p.spells[k] && p.pts >= TIER_COST[S.tier] && (!req || req.some(r => p.spells[r]))) { g.cmd(pi, { c: 'learn', k }); break; } }
    const ready = k => p.spells[k] && !(p.scd[k] > 0);
    const mine = this.mine(e => e.d.kind === 'u' && !e.d.worker);
    const engaged = [...g.squads.values()].find(q => q.owner === pi && q.eng);
    if (ready('gold')) { g.cmd(pi, { c: 'power', k: 'gold' }); return; }
    for (const k of ['ult', 'meteor', 'curse']) {
      if (!ready(k)) continue;
      for (const u of mine) {
        const foes = g.unitsIn(u.x, u.y, 280, o => g.enemy(pi, o.owner) && o.d.kind === 'u');
        if (foes.length >= (k === 'curse' ? 8 : 10)) { const c = this.center(foes); const allies = g.unitsIn(c.x, c.y, SPELLS[k].radius || 200, o => o.owner === pi).length; if (k === 'curse' || allies <= 4) { g.cmd(pi, { c: 'power', k, x: c.x, y: c.y }); return; } }
      }
    }
    if (ready('heal')) for (const u of mine) { const hurt = g.unitsIn(u.x, u.y, 260, o => o.owner === pi && o.d.kind === 'u' && o.hp < o.maxhp * 0.5); if (hurt.length >= 8) { const c = this.center(hurt); g.cmd(pi, { c: 'power', k: 'heal', x: c.x, y: c.y }); return; } }
    if (engaged) {
      const m = g.sqMembers(engaged); const c = m.length ? this.center(m) : engaged;
      if (ready('rally')) { g.cmd(pi, { c: 'power', k: 'rally', x: c.x, y: c.y }); return; }
      if (ready('summon')) { g.cmd(pi, { c: 'power', k: 'summon', x: c.x, y: c.y }); return; }
      if (ready('haste')) { g.cmd(pi, { c: 'power', k: 'haste' }); return; }
    }
    if (ready('reinf')) { const pop = g.popInfo(pi); if (pop.used + 20 <= pop.cap) g.cmd(pi, { c: 'power', k: 'reinf' }); }
  }
  pickTarget() {
    const g = this.g; const f = g.byId.get(this.p.fort); if (!f) return null;
    let best = null, bd = 1e9;
    for (const e of g.ents) {
      if (e.dead || e.d.kind !== 'b' || !g.enemy(this.pi, e.owner)) continue;
      const d = Math.hypot(e.x - f.x, e.y - f.y) + (e.d.sub === 'fort' ? -200 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  heroMicro() {
    const g = this.g;
    for (const h of g.ents) {
      if (h.dead || !h.d.hero || h.owner !== this.pi || h.stun > 0) continue;
      if (h.order && h.order.t === 'cast') continue;
      // retreat if low
      const fort = g.byId.get(this.p.fort);
      if (h.hp < h.maxhp * 0.25 && fort && (!h.order || !h.order.ret)) { h.order = { t: 'move', x: fort.x, y: fort.y + 90, ret: 1 }; h.tgt = 0; continue; }
      g.autoCastHero(h);
    }
  }
  center(list) { let x = 0, y = 0; for (const o of list) { x += o.x; y += o.y; } return { x: x / list.length, y: y / list.length }; }
}
