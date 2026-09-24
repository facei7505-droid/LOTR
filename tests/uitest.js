const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message + e.stack));
  const tap = async sel => { const el = await p.$(sel); if (!el) throw new Error('no ' + sel); const bb = await el.boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.waitForTimeout(250); };
  const E = f => p.evaluate(f);
  await p.goto('file://' + require('path').resolve(__dirname, '../index.html')); await p.waitForTimeout(800);
  await p.click('text=Битва с ИИ'); await p.click('.race[data-v="hum"]'); await p.click('text=1 на 1'); await p.click('text=В бой!'); await p.waitForTimeout(600);
  await E(() => { const A = window.__AK, g = A.game; g.players[0].gold = 9000; const f = g.byId.get(g.players[0].fort); g.spawn('hum_barr', 0, f.x + 200, f.y + 40); g.spawn('hum_range', 0, f.x + 60, f.y + 200); g.spawn('hum_stable', 0, f.x + 230, f.y + 190); document.getElementById('toasts').innerHTML = ''; });
  await tap('#bRec'); await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/u1recruit.png' });
  for (const u of ['hum_inf', 'hum_inf', 'hum_arch', 'hum_cav']) await tap('#panel [data-arg="' + u + '"]');
  await tap('#panel [data-act="hero2"][data-arg="h1"]');
  await E(() => { const A = window.__AK, g = A.game; for (let i = 0; i < 20 * 25; i++) { for (const e of g.ents) { e.px = e.x; e.py = e.y; } g.step(0.05); } });
  await p.waitForTimeout(400);
  console.log('units', await E(() => window.__AK.game.ents.filter(e => e.owner === 0 && e.d.kind === 'u').map(e => e.d.sub).join(',')));
  await tap('#quick [data-q="all"]');
  console.log('sel all', await E(() => window.__AK.UI.sel.size));
  // save group 1 via long press
  const g1 = await (await p.$('#quick [data-g="0"]')).boundingBox();
  await p.touchscreen.tap; await p.mouse.move(0,0);
  await p.dispatchEvent('#quick [data-g="0"]', 'pointerdown', { pointerId: 5, isPrimary: true });
  await p.waitForTimeout(600);
  await p.dispatchEvent('#quick [data-g="0"]', 'pointerup', { pointerId: 5 });
  console.log('group0', await E(() => window.__AK.UI.groups[0].length));
  await tap('#quick [data-q="arch"]');
  console.log('sel arch', await E(() => window.__AK.UI.sel.size));
  await p.dispatchEvent('#quick [data-g="0"]', 'pointerdown', { pointerId: 6 }); await p.dispatchEvent('#quick [data-g="0"]', 'pointerup', { pointerId: 6 });
  console.log('recall group', await E(() => window.__AK.UI.sel.size));
  // hero via portrait
  console.log('heroes html', await E(() => document.getElementById('heroes').hidden + ' ' + document.getElementById('heroes').innerHTML.slice(0, 200)));
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/u1b.png' });
  await tap('.hp[data-hk="h1"]'); await p.waitForTimeout(300);
  await E(() => { const A = window.__AK, g = A.game; const h = g.ents.find(e => e.d.hero); h.lvl = 6; const f = g.byId.get(g.players[0].fort); A.R.centerOn(h.x + 100, h.y); for (let i = 0; i < 6; i++) g.spawn(g.players[1].race + '_inf', 1, h.x + 260 + i * 10, h.y + (i % 3) * 20); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/u2hero.png' });
  await tap('#skillbar [data-sk="1"]');
  console.log('cmode', await E(() => JSON.stringify(window.__AK.UI.cmode)));
  const tgt = await E(() => { const A = window.__AK, g = A.game; const es = g.ents.filter(e => e.owner === 1 && e.d.sub === 'inf'); const h = g.ents.find(e => e.d.hero); const e = es.sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0]; return A.R.toScreen(e.x, e.y); });
  await p.touchscreen.tap(tgt.x, tgt.y); await p.waitForTimeout(500);
  console.log('hero cd after dash', await E(() => window.__AK.game.ents.find(e => e.d.hero).scd.map(Math.round)));
  await tap('#skillbar .autob');
  console.log('auto', await E(() => window.__AK.game.players[0].heroes.h1.auto));
  // attack enemy by tapping it with army selected
  await tap('#quick [data-q="all"]');
  const en = await E(() => { const A = window.__AK, g = A.game; const e = g.ents.find(e => e.owner === 1 && e.d.kind === 'u'); return e ? A.R.toScreen(e.x, e.y - 15) : null; });
  if (en) { await p.touchscreen.tap(en.x, en.y); await p.waitForTimeout(200); }
  console.log('targetMark', await E(() => JSON.stringify(window.__AK.UI.targetMark)));
  await E(() => { const A = window.__AK, g = A.game; for (let i = 0; i < 20; i++) { for (const e of g.ents) { e.px = e.x; e.py = e.y; } g.step(0.05); } });
  await p.waitForTimeout(300);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/u3fight.png' });
  // hold & retreat
  await tap('#panel [data-act="hold"]');
  console.log('hold', await E(() => window.__AK.game.ents.filter(e => e.owner === 0 && e.order && e.order.t === 'hold').length));
  await tap('#panel [data-act="retreat"]');
  console.log('retreat moving', await E(() => window.__AK.game.ents.filter(e => e.owner === 0 && e.order && e.order.t === 'move').length));
  // portrait
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
  await tap('.hp[data-hk="h1"]'); await p.waitForTimeout(300);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/u4portrait.png' });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
