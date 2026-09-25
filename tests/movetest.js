// Movement smoothness: battalions march across every map through forests and past cliffs.
// Reports arrival time, stop-and-go jerk (members crawling while their banner marches) and soldiers left behind.
const fs = require('fs'), path = require('path');
const code = ['data', 'engine', 'map', 'ai', 'net'].map(f => fs.readFileSync(path.resolve(__dirname, '../src/' + f + '.js'), 'utf8')).join('\n');
const { Game, DEF, MAP_W, MAP_H } = new Function('window', code + '; return { Game, DEF, MAP_W, MAP_H };')({});
let fails = 0;
for (const mapType of ['river', 'pass', 'winter']) for (const race of ['hum', 'dwf', 'orc']) {
  const g = new Game({ seed: 5, mapType, players: [{ race, team: 0 }, { race: 'elf', team: 1 }] });
  const f = g.byId.get(g.players[0].fort);
  const sqs = ['inf', 'arch', 'cav'].map((k, i) => g.spawnSquad(race + '_' + k, 0, f.x + 200, f.y - 150 + i * 120, 0));
  const tx = MAP_W * 0.5, ty = MAP_H * 0.5;
  g.cmd(0, { c: 'move', s: sqs.map(s => s.id), x: tx, y: ty });
  let crawl = 0, samples = 0, t = 0;
  const last = new Map();
  while (t < 90) {
    g.step(0.05); t += 0.05;
    for (const s of sqs) {
      const bv = Math.hypot(s.vx || 0, s.vy || 0);
      for (const id of s.mem) { const e = g.byId.get(id); if (!e) continue; const l = last.get(id); if (l && bv > 20) { const v = Math.hypot(e.x - l.x, e.y - l.y) / 0.05; samples++; if (v < bv * 0.4) crawl++; } last.set(id, { x: e.x, y: e.y }); }
    }
    if (sqs.every(s => s.mode === 'idle')) break;
  }
  const tArr = t; for (let i = 0; i < (+process.env.W || 120); i++) g.step(0.05);
  let behind = 0, total = 0;
  for (const s of sqs) for (const id of s.mem) { const e = g.byId.get(id); if (!e) continue; total++; const p = g.freeSlot(s, g.slotPos(s, e.slot, s.cnt)), dd = Math.hypot(e.x - p.x, e.y - p.y); if (dd > 60) { behind++; if (process.env.V) console.log("   ", e.d.sub, Math.round(dd), "at", Math.round(e.x), Math.round(e.y), "blk", g.blockedAt(e.x, e.y), "w", g.map.water(e.x, e.y), "slotblk", g.blockedAt(p.x, p.y), "mpath", e.mpath ? e.mpath.length : -1, "trees", g.map.trees.filter(t => Math.hypot(t.x - e.x, t.y - e.y) < 30).length); } }
  const jerk = samples ? crawl / samples : 0;
  console.log(mapType, race, 'arrive', tArr.toFixed(1) + 's', 'crawl', (jerk * 100).toFixed(1) + '%', 'behind', behind + '/' + total);
  if (tArr >= 90 || jerk > 0.12 || behind > total * 0.1) { fails++; console.log('  FAIL'); }
}
console.log(fails ? fails + ' FAILED' : 'ALL OK');
