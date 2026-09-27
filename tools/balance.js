// Balance check: AI plays AI with no graphics — every pair of peoples, both sides, two seeds, maps in rotation.
// usage: node tools/balance.js [minutes per game, default 25] [seeds per side, default 2]
// prints each game and then the win rate of every people, the number of draws and the average length
const fs = require('fs'), vm = require('vm'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const LIM = (+process.argv[2] || 25) * 60, SEEDS = +process.argv[3] || 2, TICK = 0.05;
const ctx = { console, Math, performance: { now: () => Date.now() } }; vm.createContext(ctx);
vm.runInContext(['data.js', 'engine.js', 'map.js', 'ai.js'].map(src).join('\n') + '\n;this.Game = Game; this.AI = AI; this.RACE_KEYS = RACE_KEYS; this.MAP_TYPES = MAP_TYPES;', ctx);
const R = ctx.RACE_KEYS, maps = ctx.MAP_TYPES.map(m => m.k), wins = {}, games = {}, len = [];
let n = 0, draws = 0;
for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
  const map = maps[n++ % maps.length];
  for (const sw of [0, 1]) for (let s = 0; s < SEEDS; s++) {
    const [A, B] = sw ? [b, a] : [a, b];
    const g = new ctx.Game({ seed: (s + 1) * 1067 + n, players: [{ race: R[A], team: 0, ai: true, diff: 1 }, { race: R[B], team: 1, ai: true, diff: 1 }], mapType: map });
    const ais = [new ctx.AI(g, 0), new ctx.AI(g, 1)];
    let k = 0, t = 0;
    for (; t < LIM && g.over < 0; k++, t = k * TICK) { for (const x of ais) x.step(TICK); for (const e of g.ents) { e.px = e.x; e.py = e.y; } g.step(TICK); }
    for (const r of [R[A], R[B]]) games[r] = (games[r] || 0) + 1;
    const w = g.over < 0 ? null : R[[A, B][g.over]];
    if (w) { wins[w] = (wins[w] || 0) + 1; len.push(t / 60); } else draws++;
    console.log(`${R[A]}-${R[B]} | ${map} | ${w || 'draw'} | ${Math.round(t / 60)} min`);
  }
}
console.log('\n' + R.map(r => `${r} ${Math.round((wins[r] || 0) / games[r] * 100)}%`).join('  ') + `\ndraws ${draws}, average game ${(len.reduce((x, y) => x + y, 0) / Math.max(1, len.length)).toFixed(1)} min`);
