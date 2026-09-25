// Engine regression checks (node): commands, builders, spell book, heroes, camps, save/load, network snapshots.
const fs = require('fs'), path = require('path');
const code = ['data', 'engine', 'map', 'ai', 'net'].map(f => fs.readFileSync(path.resolve(__dirname, '../src/' + f + '.js'), 'utf8')).join('\n');
const E = new Function('window', code + '; return { Game, AI, DEF, SPELLS, SPELL_ORDER, UPGRADES, packSnap, unpackEnts, NEUTRAL, TIER_COST };')({});
const { Game, AI, DEF, SPELLS, SPELL_ORDER, UPGRADES, packSnap, unpackEnts, NEUTRAL } = E;
let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } };
const sane = (g, tag) => { for (const e of g.ents) if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp) || !isFinite(e.maxhp)) { ok(false, tag + ' NaN ' + e.d.key); return; } };
const step = (g, sec, ais) => { for (let i = 0; i < sec * 20; i++) { if (ais) for (const a of ais) a.step(0.05); g.step(0.05); } };
const fortOf = (g, i) => g.byId.get(g.players[i].fort);
const spotFor = (g, pi, key) => { const f = fortOf(g, pi); for (let a = 0; a < 6.3; a += 0.2) for (const rr of [180, 230, 280, 340, 400, 460]) { const x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr; if (g.canPlace(pi, key, x, y)) return [x, y]; } return null; };

for (const race of ['hum', 'elf', 'dwf', 'orc', 'und', 'des']) for (const mapType of ['river', 'pass', 'winter']) {
  const tag = race + '/' + mapType;
  const g = new Game({ seed: 7, mapType, players: [{ race, team: 0 }, { race: race === 'orc' ? 'hum' : 'orc', team: 1 }] });
  const p = g.players[0]; p.gold = 1e6;
  const workers = g.ents.filter(e => e.owner === 0 && e.d.worker);
  ok(workers.length === 2, tag + ' starts with 2 builders');
  // every building can be placed and finished by builders
  for (const sub of ['farm', 'barr', 'range', 'stable', 'forge', 'tower']) {
    const key = race + '_' + sub, sp = spotFor(g, 0, key);
    ok(!!sp, tag + ' no spot for ' + sub); if (!sp) continue;
    g.cmd(0, { c: 'build', t: sub, x: sp[0], y: sp[1], ids: workers.map(w => w.id) });
    step(g, DEF[key].time / 1.5 + 25);
    const b = g.ents.find(e => e.owner === 0 && e.d.sub === sub);
    ok(b && b.built >= 1, tag + ' ' + sub + ' finished (' + (b ? b.built.toFixed(2) : 'none') + ')');
  }
  // training every unit, the builder and heroes
  const barr = g.ents.find(e => e.owner === 0 && e.d.sub === 'barr'), fort = fortOf(g, 0);
  for (const sub of ['inf', 'spear']) g.cmd(0, { c: 'train', b: barr.id, u: race + '_' + sub });
  g.cmd(0, { c: 'train', b: g.ents.find(e => e.owner === 0 && e.d.sub === 'range').id, u: race + '_arch' });
  g.cmd(0, { c: 'train', b: g.ents.find(e => e.owner === 0 && e.d.sub === 'stable').id, u: race + '_cav' });
  g.cmd(0, { c: 'train', b: fort.id, u: race + '_worker' });
  g.cmd(0, { c: 'hero', b: fort.id, h: 'h1' });
  step(g, 45);
  ok(g.squads.size >= 4, tag + ' battalions trained (' + g.squads.size + ')');
  ok(g.ents.filter(e => e.owner === 0 && e.d.worker).length === 3, tag + ' third builder trained');
  const hero = g.byId.get(p.heroes.h1.id); ok(!!hero, tag + ' hero hired');
  // forge upgrades
  const forge = g.ents.find(e => e.owner === 0 && e.d.forge);
  for (const U of UPGRADES) { g.cmd(0, { c: 'research', b: forge.id, k: U.k }); step(g, U.time + 1); }
  ok(Object.keys(p.up).length === 4, tag + ' all upgrades researched');
  // spell book: learn everything and cast each power
  p.pts = 50;
  for (const k of SPELL_ORDER) g.cmd(0, { c: 'learn', k });
  ok(SPELL_ORDER.every(k => p.spells[k]), tag + ' learned all spells');
  const ef = fortOf(g, 1); ef.hp = ef.maxhp = 1e7;
  for (const k of SPELL_ORDER) { g.cmd(0, { c: 'power', k, x: ef.x + 200, y: ef.y }); step(g, 0.5); ok(p.scd[k] > 0, tag + ' cast ' + k); }
  step(g, 5); sane(g, tag + ' after spells');
  // hero skills + smart cast
  if (hero && !hero.dead) { hero.lvl = 6; for (let s = 0; s < 4; s++) { g.cmd(0, { c: 'autoskill', h: hero.id, s }); g.cmd(0, { c: 'skill', h: hero.id, s, x: hero.x + 100, y: hero.y }); step(g, 0.3); } }
  // damage + repair (not the citadel)
  const farm = g.ents.find(e => e.owner === 0 && e.d.sub === 'farm'); farm.hp = farm.maxhp * 0.5;
  g.cmd(0, { c: 'work', t: farm.id, ids: g.ents.filter(e => e.owner === 0 && e.d.worker).map(w => w.id) });
  step(g, 30); ok(farm.hp > farm.maxhp * 0.6, tag + ' builders repair a farm');
  fort.hp = fort.maxhp * 0.5; step(g, 20); ok(fort.hp <= fort.maxhp * 0.5 + 1, tag + ' citadel is not repaired');
  // refill a worn battalion
  const sq = [...g.squads.values()].find(q => q.owner === 0 && q.mem.length > 3);
  g.popMax = 999; for (let k = 0; k < 10; k++) g.spawn(race + '_farm', 0, 60 + k * 70, 2540);
  if (sq) { g.sqMembers(sq).slice(0, 3).forEach(m => g.kill(m, null)); step(g, 0.2); const n0 = sq.mem.length; g.cmd(0, { c: 'refill', s: [sq.id] }); step(g, 0.2); ok(sq.mem.length > n0, tag + ' refill (pop ' + JSON.stringify(g.popInfo(0)) + ')'); }
  // hero dies and is revived at half price
  if (hero && !hero.dead) { g.kill(hero, null); step(g, 0.2); const gold0 = p.gold; g.cmd(0, { c: 'hero', b: fort.id, h: 'h1' }); ok(Math.round(gold0 - p.gold) === Math.round(DEF[race + '_h1'].cost * 0.5), tag + ' revive costs half (paid ' + Math.round(gold0 - p.gold) + ', hs ' + JSON.stringify(p.heroes.h1) + ', q ' + JSON.stringify(fort.queue.map(q => q.u)) + ', fort ' + (fort.dead ? 'dead' : 'ok') + ')'); step(g, 22); ok(!!g.byId.get(p.heroes.h1.id), tag + ' hero revived'); }
  // save / load mid-game, then keep running
  const S = JSON.parse(JSON.stringify(g.serialize()));
  const g2 = Game.load(S); step(g2, 20); sane(g2, tag + ' after load');
  ok(g2.ents.length > 10 && g2.players[0].spells.ult, tag + ' save keeps state');
  // network snapshot round trip keeps squads and facing
  const sn = packSnap(g2), list = unpackEnts(sn.u);
  ok(list.length === g2.ents.length, tag + ' snapshot has every entity');
  ok(list.filter(u => u.sq).length === g2.ents.filter(e => e.sq).length, tag + ' snapshot keeps battalions');
  ok(JSON.stringify(sn).length < 3500 || g2.ents.length > 150, tag + ' snapshot size ' + JSON.stringify(sn).length);
  // neutral camps: kill a camp, get the treasure
  const camp = g2.camps.find(c => c.alive);
  if (camp) { const gold0 = g2.players[0].gold; for (const id of camp.ids) { const e = g2.byId.get(id); if (e) g2.kill(e, g2.byId.get(g2.players[0].fort)); } step(g2, 1); ok(!camp.alive && g2.players[0].gold >= gold0 + 399, tag + ' camp treasure'); }
  sane(g2, tag + ' end');
}
// builders: a site without builders does not progress
{
  const g = new Game({ seed: 3, players: [{ race: 'hum', team: 0 }, { race: 'orc', team: 1 }] });
  g.players[0].gold = 5000;
  const sp = spotFor(g, 0, 'hum_farm');
  g.cmd(0, { c: 'build', t: 'farm', x: sp[0], y: sp[1] });
  const site = g.ents.find(e => e.owner === 0 && e.d.sub === 'farm');
  for (const w of g.ents.filter(e => e.owner === 0 && e.d.worker)) g.kill(w, null);
  step(g, 30); ok(site.built < 0.2, 'construction waits without builders (' + site.built.toFixed(2) + ')');
  const before = g.ents.length; g.cmd(0, { c: 'build', t: 'barr', x: sp[0] + 200, y: sp[1] }); ok(g.ents.length === before, 'no build order without builders');
}
// full AI games finish in reasonable time on every map
for (const mapType of ['river', 'pass', 'winter']) {
  const g = new Game({ seed: 11, mapType, players: [{ race: 'hum', team: 0, ai: true }, { race: 'orc', team: 1, ai: true }] });
  const ais = g.players.map(q => new AI(g, q.i)); const t0 = Date.now();
  while (g.over === -1 && g.t < 1500) step(g, 5, ais);
  console.log('AI game', mapType, 'winner', g.over, 't', Math.round(g.t), 'ms', Date.now() - t0);
  sane(g, 'ai ' + mapType);
}
console.log(fails ? fails + ' FAILED' : 'ALL OK');
