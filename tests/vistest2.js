const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs=[];
  p.on('pageerror', e => errs.push(e.message+e.stack));
  await p.goto('file://' + require('path').resolve(__dirname, '../index.html')); await p.waitForTimeout(800);
  await p.click('text=Битва с ИИ'); await p.click('.race[data-v="elf"]'); await p.click('text=В бой!'); await p.waitForTimeout(2500);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/w0tip.png' });
  await p.evaluate(() => { const A = window.__AK, g = A.game; const op = g.outposts[3];
    for (let i=0;i<6;i++) g.spawn('elf_inf',0,op.x-40+i*15,op.y+20);
    for (let i=0;i<7;i++) g.spawn(g.players[1].race+'_inf',1,op.x+260+i*12,op.y-20);
    g.players[0].power = 150; A.R.cam.z=1; A.R.centerOn(op.x+80, op.y); });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/w1outpost.png' });
  // open powers via button
  const bp = await (await p.$('#bPow')).boundingBox(); await p.touchscreen.tap(bp.x+10,bp.y+10); await p.waitForTimeout(300);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/w2powers.png' });
  const mb = await (await p.$('#panel [data-act="usepower"][data-arg="2"]')).boundingBox(); await p.touchscreen.tap(mb.x+10, mb.y+10); await p.waitForTimeout(200);
  const tgt = await p.evaluate(() => { const A=window.__AK,g=A.game; const es=g.ents.filter(e=>e.owner===1&&e.d.sub==='inf'&&Math.hypot(e.x-720,e.y-1100)<600); let x=0,y=0; for(const e of es){x+=e.x;y+=e.y} return A.R.toScreen(x/es.length,y/es.length); });
  console.log('tgt', JSON.stringify(tgt), await p.evaluate(()=>JSON.stringify(window.__AK.UI.cmode))); await p.touchscreen.tap(tgt.x, tgt.y); await p.waitForTimeout(1000); console.log('after', await p.evaluate(()=>JSON.stringify(window.__AK.UI.cmode)));
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/w3meteor.png' });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/w4boom.png' });
  console.log('power', await p.evaluate(()=>window.__AK.game.players[0].power), 'outpost', await p.evaluate(()=>JSON.stringify(window.__AK.game.outposts[3])));
  // camera bottom clamp: scroll to bottom-right
  await p.evaluate(() => { const A=window.__AK; A.R.cam.z=0.8; A.R.cam.y=99999; A.R.cam.x=99999; A.R.clampCam(); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/w5corner.png' });
  console.log(errs.join('\n')||'no errors');
  await b.close();
})();
