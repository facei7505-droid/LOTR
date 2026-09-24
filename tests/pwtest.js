const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.type()+': '+m.text()); });
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message + '\n' + e.stack));
  await p.goto('file://' + require('path').resolve(__dirname, '../index.html'));
  await p.waitForTimeout(1500);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/1menu.png' });
  await p.click('text=Битва с ИИ'); await p.waitForTimeout(300);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/2skirm.png' });
  await p.click('text=В бой!'); await p.waitForTimeout(800);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/3start.png' });
  // tap own fortress
  const pos = await p.evaluate(() => { const A = window.__AK; const f = A.game.ents.find(e => e.owner === 0 && e.d.sub === 'fort'); const s = A.R.toScreen(f.x, f.y - 20); return s; });
  await p.touchscreen.tap(pos.x, pos.y); await p.waitForTimeout(400);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/4fort.png' });
  // hire hero via panel
  await p.evaluate(() => { window.__AK.game.players[0].gold = 5000; });
  await p.waitForTimeout(300);
  const heroBtn = await p.$('#panel [data-act="hero"]');
  if (heroBtn) { const bb = await heroBtn.boundingBox(); await p.touchscreen.tap(bb.x + 10, bb.y + 10); }
  // build menu -> farm
  await p.touchscreen.tap(...await p.evaluate(()=>{const r=document.getElementById('bBuild').getBoundingClientRect();return [r.x+10,r.y+10]}));
  await p.waitForTimeout(300);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/5buildmenu.png' });
  const farmBtn = await p.$('#panel [data-arg="farm"]'); const fb = await farmBtn.boundingBox(); await p.touchscreen.tap(fb.x + 10, fb.y + 10);
  await p.waitForTimeout(200);
  const spot = await p.evaluate(() => { const A = window.__AK; const f = A.game.ents.find(e => e.owner === 0 && e.d.sub === 'fort'); for (let a=0;a<6.3;a+=0.3){ const x=f.x+Math.cos(a)*200,y=f.y+Math.sin(a)*200; if (A.game.canPlace(0,'hum_farm',x,y)) return A.R.toScreen(x,y);} return null; });
  console.log('spot', spot);
  await p.touchscreen.tap(spot.x, spot.y); await p.waitForTimeout(250);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/6ghost.png' });
  await p.touchscreen.tap(spot.x, spot.y); await p.waitForTimeout(250);
  console.log('farms', await p.evaluate(() => window.__AK.game.ents.filter(e => e.owner===0 && e.d.sub==='farm').length));
  // fast forward 40s so hero is ready
  await p.evaluate(() => { const A = window.__AK; for (let i=0;i<800;i++){ for (const e of A.game.ents){e.px=e.x;e.py=e.y} A.game.step(0.05);} });
  await p.waitForTimeout(500);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/7hero.png' });
  // select hero by portrait
  const hp = await p.$('.hp'); const hb = await hp.boundingBox(); await p.touchscreen.tap(hb.x+20, hb.y+20); await p.waitForTimeout(400);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/8herosel.png' });
  // move hero by tapping ground
  await p.touchscreen.tap(500, 200); await p.waitForTimeout(300);
  console.log('hero order', await p.evaluate(() => { const A=window.__AK; const h=A.game.ents.find(e=>e.d.hero); return h && JSON.stringify(h.order); }));
  // fast forward with AI for player 0 too, 6 minutes
  await p.evaluate(() => { const A = window.__AK; const g=A.game; const ai = new AI(g,0); for (let i=0;i<20*360;i++){ ai.step(0.05); for (const e of g.ents){e.px=e.x;e.py=e.y} g.step(0.05); if(g.over!==-1)break;} });
  await p.waitForTimeout(600);
  // center on biggest fight
  await p.evaluate(() => { const A = window.__AK; const us=A.game.ents.filter(e=>e.d.kind==='u'); let best=us[0],bc=0; for(const u of us){let c=0; for(const o of us) if(o.owner!==u.owner && Math.hypot(o.x-u.x,o.y-u.y)<250)c++; if(c>bc){bc=c;best=u}} if(best) A.R.centerOn(best.x,best.y); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/9battle.png' });
  console.log('t', await p.evaluate(() => window.__AK.game.t), 'over', await p.evaluate(() => window.__AK.game.over));
  // portrait layout
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(600);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/10portrait.png' });
  console.log('ERRORS:\n' + errs.join('\n'));
  await b.close();
})();
