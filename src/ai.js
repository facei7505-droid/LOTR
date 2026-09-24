// ================= AI =================
class AI {
  constructor(game, pi) {
    this.g = game; this.pi = pi; this.t = 0; this.think = 0;
    this.wave = 9; this.lastAttack = 0; this.target = null;
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
      if (g.canPlace(this.pi, key, x, y)) { g.cmd(this.pi, { c: 'build', t: sub, x, y }); return true; }
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
    const farms = this.count('farm'), barr = this.count('barr'), range = this.count('range'), stable = this.count('stable'), towers = this.count('tower');
    // build order
    const wantFarms = Math.min(10, 2 + Math.floor(this.t / 40));
    if (farms < 2) this.tryBuild('farm');
    else if (barr < 1) this.tryBuild('barr');
    else if (farms < 3) this.tryBuild('farm');
    else if (range < 1) this.tryBuild('range');
    else if (pop.used >= pop.cap - 3 && farms < wantFarms) this.tryBuild('farm');
    else if (stable < 1 && this.t > 110) this.tryBuild('stable');
    else if (towers < 1 && this.t > 200 && p.gold > 700) this.tryBuild('tower');
    else if (barr < 2 && this.t > 300 && p.gold > 800) this.tryBuild('barr');
    else if (farms < wantFarms && p.gold > 500) this.tryBuild('farm');
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
    for (const b of this.mine(e => e.d.kind === 'b' && e.built >= 1 && e.d.trains && e.d.sub !== 'fort')) {
      if (b.queue.length >= 2) continue;
      const opts = b.d.trains; let u = opts[0];
      if (opts.length > 1) u = this.r() < 0.6 ? opts[0] : opts[1];
      if (saving && p.gold < 1200) continue;
      if (p.gold > DEF[u].cost + (this.t > 60 ? 150 : 0)) g.cmd(this.pi, { c: 'train', b: b.id, u });
    }
    // army control
    const army = this.mine(e => e.d.kind === 'u' && !e.d.summon);
    const fighters = army.filter(e => !e.d.hero);
    // defense: enemies near my buildings?
    let threat = null;
    for (const e of g.ents) {
      if (e.dead || e.d.kind !== 'u' || !g.enemy(this.pi, e.owner)) continue;
      if (fort && Math.hypot(e.x - fort.x, e.y - fort.y) < 650) { threat = e; break; }
    }
    if (threat) {
      const ids = army.filter(e => !e.order || e.order.t !== 'atk').map(e => e.id);
      if (ids.length) g.cmd(this.pi, { c: 'move', ids, x: threat.x, y: threat.y, a: 1 });
      return;
    }
    const idle = army.filter(e => !e.order);
    if (fighters.length >= this.wave && this.t - this.lastAttack > 20 && this.t > 150) {
      this.lastAttack = this.t; this.wave = Math.min(g.popMax - 4, this.wave + 3);
      const tgt = this.pickTarget();
      if (tgt) g.cmd(this.pi, { c: 'move', ids: army.map(e => e.id), x: tgt.x, y: tgt.y, a: 1 });
    } else if (this.t - this.lastAttack < 90 && this.lastAttack > 0) {
      // keep pushing: idle units rejoin the attack
      const tgt = this.pickTarget();
      if (tgt && idle.length) g.cmd(this.pi, { c: 'move', ids: idle.map(e => e.id), x: tgt.x, y: tgt.y, a: 1 });
    } else if (fort && idle.length) {
      // gather near base front
      let gx = fort.x + (MAP_W / 2 - fort.x) * 0.18, gy = fort.y + (MAP_H / 2 - fort.y) * 0.18;
      let bo = null, bd = 1600;
      for (const op of g.outposts) { if (op.owner >= 0 && !g.enemy(this.pi, op.owner)) continue; const d = Math.hypot(op.x - fort.x, op.y - fort.y); if (d < bd) { bd = d; bo = op; } }
      if (bo && this.t > 45) { gx = bo.x; gy = bo.y; }
      const far = idle.filter(e => Math.hypot(e.x - gx, e.y - gy) > 200);
      if (far.length) g.cmd(this.pi, { c: 'move', ids: far.map(e => e.id), x: gx, y: gy, a: 1 });
    }
  }
  usePowers() {
    const g = this.g, p = this.p; const pi = this.pi;
    const ready = k => p.pcd[k] <= 0 && p.power >= POWERS[k].cost;
    const mine = this.mine(e => e.d.kind === 'u');
    if (ready(2)) {
      for (const u of mine) {
        const foes = g.unitsIn(u.x, u.y, 260, o => g.enemy(pi, o.owner) && o.d.kind === 'u');
        if (foes.length >= 5) { const c = this.center(foes); const allies = g.unitsIn(c.x, c.y, 190, o => o.owner === pi).length; if (allies <= 2) { g.cmd(pi, { c: 'power', k: 2, x: c.x, y: c.y }); return; } }
      }
    }
    if (ready(0)) {
      for (const u of mine) { const hurt = g.unitsIn(u.x, u.y, 260, o => o.owner === pi && o.d.kind === 'u' && o.hp < o.maxhp * 0.5); if (hurt.length >= 4) { const c = this.center(hurt); g.cmd(pi, { c: 'power', k: 0, x: c.x, y: c.y }); return; } }
    }
    if (ready(1) && p.power >= 80) g.cmd(pi, { c: 'power', k: 1, x: 0, y: 0 });
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
