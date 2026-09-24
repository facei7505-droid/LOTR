const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); const errs=[];
  p.on('pageerror', e => errs.push(e.message+e.stack));
  await p.goto('file://' + require('path').resolve(__dirname, '../index.html')); await p.waitForTimeout(800);
  await p.click('text=Битва с ИИ'); await p.click('.race[data-v="dwf"]'); await p.click('text=В бой!'); await p.waitForTimeout(400);
  await p.evaluate(() => {
    const A = window.__AK, g = A.game; const cx = 1600, cy = 1100;
    const ai = g.players[1].race;
    for (const k of ['inf','spear','arch','cav']) for (let i=0;i<4;i++){ g.spawn('dwf_'+k,0,cx-160+ (k==='arch'?-80:0)+Math.random()*40,cy-80+i*40); g.spawn(ai+'_'+k,1,cx+160+(k==='arch'?80:0)+Math.random()*40,cy-80+i*40); }
    const h1=g.spawn('dwf_h1',0,cx-120,cy); h1.lvl=7; g.players[0].heroes.h1.id=h1.id; g.players[0].heroes.h1.recruited=true;
    const h2=g.spawn('dwf_h2',0,cx-200,cy+60); h2.lvl=7; g.players[0].heroes.h2.id=h2.id; g.players[0].heroes.h2.recruited=true;
    const e1=g.spawn(ai+'_h1',1,cx+140,cy); e1.lvl=5; const e2=g.spawn(ai+'_h2',1,cx+220,cy+60); e2.lvl=5;
    for (const e of g.ents) if (e.d.kind==='u' && Math.abs(e.x-cx)<400) e.order={t:'amove',x:e.owner?cx-200:cx+200,y:cy};
    A.R.cam.z=1.6; A.R.centerOn(cx,cy);
    window.__h=[h1.id,h2.id];
  });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const A=window.__AK,g=A.game; const [a,b]=window.__h; g.cmd(0,{c:'skill',h:b,s:3,x:1650,y:1100}); g.cmd(0,{c:'skill',h:a,s:1,x:1700,y:1100}); A.UI.sel=new Set([a]); A.UI.panelSig=''; });
  await p.waitForTimeout(900);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/v1battle.png' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const A=window.__AK,g=A.game; const [a,b]=window.__h; g.cmd(0,{c:'skill',h:a,s:2,x:0,y:0}); g.cmd(0,{c:'skill',h:b,s:2,x:1680,y:1080}); });
  await p.waitForTimeout(500);
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/v2battle.png' });
  console.log(errs.join('\n')||'no errors');
  await b.close();
})();
