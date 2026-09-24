const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8765', '--directory', require('path').resolve(__dirname, '..')], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript({ path: require('path').resolve(__dirname, 'fakeroom.js') });
  const errs = [];
  const mk = async (name) => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ' PAGEERR ' + e.message + ' ' + e.stack)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to load')) errs.push(name + ' ' + m.text()); }); await p.goto('http://localhost:8765/index.html'); await p.waitForTimeout(1200); return p; };
  const host = await mk('host'), guest = await mk('guest');
  await host.click('text=Онлайн с друзьями'); await host.waitForTimeout(300);
  await host.fill('#nick', 'Айасель');
  await host.click('text=Создать игру'); await host.waitForTimeout(500);
  await guest.click('text=Онлайн с друзьями'); await guest.waitForTimeout(500);
  await guest.fill('#nick', 'Друг');
  await guest.click('.race[data-v="orc"]'); await guest.waitForTimeout(300);
  await guest.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/n1guestlist.png' });
  await guest.click('text=Войти'); await guest.waitForTimeout(800);
  await host.click('text=+ Добавить ИИ'); await host.waitForTimeout(300);
  await host.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/n2hostlobby.png' });
  await guest.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/n3guestlobby.png' });
  // set AI team so it's 2v2? keep default teams: host 0, guest 1, AI 0
  await host.click('text=Начать битву'); await host.waitForTimeout(1500);
  console.log('guest mode', await guest.evaluate(() => window.__AK.mode), 'host mode', await host.evaluate(() => window.__AK.mode));
  console.log('guest me', await guest.evaluate(() => window.__AK.V.me), 'ents', await guest.evaluate(() => window.__AK.V.ents.length));
  // guest selects army and moves
  await guest.evaluate(() => { const A = window.__AK; const ids = A.V.ents.filter(e => e.owner === A.V.me && e.d.kind === 'u').map(e => e.id); A.V.send({ c: 'move', ids, x: 1600, y: 1100, a: 1 }); A.V.send({ c: 'train', b: A.V.ents.find(e=>e.owner===A.V.me&&e.d.sub==='fort').id, u: 'x' }); });
  // guest builds a farm through UI flow
  await guest.evaluate(() => { const A = window.__AK; const f = A.V.ents.find(e => e.owner === A.V.me && e.d.sub === 'fort'); for (let a = 0; a < 6.3; a += 0.3) { const x = f.x + Math.cos(a) * 200, y = f.y + Math.sin(a) * 200; if (A.V.canPlace('orc_farm', x, y)) { A.V.send({ c: 'build', t: 'farm', x, y }); break; } } A.V.send({ c: 'hero', b: f.id, h: 'h1' }); });
  await guest.waitForTimeout(2500);
  const hs = await host.evaluate(() => { const g = window.__AK.game; return { farms: g.ents.filter(e => e.owner === 1 && e.d.sub === 'farm').length, moving: g.ents.filter(e => e.owner === 1 && e.order).length, gold: Math.floor(g.players[1].gold), fortQ: g.byId.get(g.players[1].fort).queue.length }; });
  console.log('host sees guest actions', JSON.stringify(hs));
  await guest.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/n4guestgame.png' });
  // fast forward host to battle and check guest view keeps up
  await host.evaluate(() => { const A = window.__AK; const g = A.game; g.players[1].gold += 3000; });
  await guest.waitForTimeout(800);
  await guest.evaluate(() => { const A = window.__AK; const f = A.V.ents.find(e => e.owner === A.V.me && e.d.sub === 'fort'); A.V.send({ c: 'hero', b: f.id, h: 'h2' }); });
  await host.evaluate(() => { const A = window.__AK; const g = A.game; const ai = new AI(g, 1); const ai0 = new AI(g, 0); for (let i = 0; i < 20 * 200; i++) { ai.step(0.05); ai0.step(0.05); for (const e of g.ents) { e.px = e.x; e.py = e.y; } g.step(0.05); } });
  await guest.waitForTimeout(1500);
  await guest.evaluate(() => { const A = window.__AK; const us = A.V.ents.filter(e => e.d.kind === 'u'); let best = us[0], bc = 0; for (const u of us) { let c = 0; for (const o of us) if (o.owner !== u.owner && Math.hypot(o.x - u.x, o.y - u.y) < 250) c++; if (c > bc) { bc = c; best = u; } } if (best) A.R.centerOn(best.x, best.y); });
  await guest.waitForTimeout(600);
  await guest.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/n5guestbattle.png' });
  await host.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/n6hostbattle.png' });
  console.log('guest outposts', await guest.evaluate(() => JSON.stringify(window.__AK.V.outposts.map(o=>o.owner))), 'host outposts', await host.evaluate(() => JSON.stringify(window.__AK.game.outposts.map(o=>o.owner))), 'guest power', await guest.evaluate(() => JSON.stringify(window.__AK.V.player(1))));
  await guest.evaluate(() => { const A = window.__AK; const ids = A.V.ents.filter(e => e.owner === A.V.me && e.d.kind === 'u').map(e => e.id); A.V.send({ c: 'hold', ids }); A.V.send({ c: 'auto', hk: 'h1', on: true }); });
  await guest.waitForTimeout(800);
  console.log('net hold', await host.evaluate(() => window.__AK.game.ents.filter(e => e.owner === 1 && e.order && e.order.t === 'hold').length), 'net auto', await host.evaluate(() => window.__AK.game.players[1].heroes.h1.auto), 'guest sees auto', await guest.evaluate(() => JSON.stringify(window.__AK.V.heroes(1).map(h => [h.hk, h.auto, h.lvl]))));
  console.log('maxPresence host', await host.evaluate(() => window.__maxPresence), 'guest', await guest.evaluate(() => window.__maxPresence));
  console.log('host ents', await host.evaluate(() => window.__AK.game.ents.length), 'guest ents', await guest.evaluate(() => window.__AK.V.ents.length), 'over', await host.evaluate(() => window.__AK.game.over));
  // guest leaves -> AI takeover
  await guest.evaluate(() => window.dispatchEvent(new Event('beforeunload'))); await guest.close(); await host.waitForTimeout(800);
  console.log('after guest left: p1 ai', await host.evaluate(() => window.__AK.game.players[1].ai));
  console.log('ERRORS:\n' + errs.join('\n'));
  await b.close(); srv.kill();
})();
