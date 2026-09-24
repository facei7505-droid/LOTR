const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + require('path').resolve(__dirname, '../index.html')); await p.waitForTimeout(500);
  await p.evaluate(() => {
    document.body.innerHTML = '<canvas id="s" width="1300" height="900" style="background:#5d7440"></canvas>';
    const c = document.getElementById('s').getContext('2d'); c.fillStyle = '#5b7040'; c.fillRect(0, 0, 1300, 900);
    let y = 150;
    for (const rk of RACE_KEYS) { let x = 40;
      for (const k of ['inf', 'spear', 'arch', 'cav', 'h1', 'h2']) { const d = DEF[rk + '_' + k]; for (const fr of [0, 3]) { const s = unitSprite(d, TEAM_COLORS[RACE_KEYS.indexOf(rk)], fr); c.drawImage(s.cv, x - s.ox * 1.6, y - s.oy * 1.6, s.w * 1.6, s.h * 1.6); x += 100; } }
      y += 190; }
  });
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/sheet.png' });
  await p.evaluate(() => {
    const c = document.getElementById('s').getContext('2d'); c.fillStyle = '#5b7040'; c.fillRect(0, 0, 1300, 900);
    let x = 20, y = 280;
    for (const rk of RACE_KEYS) { for (const k of ['fort', 'farm', 'barr', 'tower']) { const d = DEF[rk + '_' + k]; const s = bldSprite(d, TEAM_COLORS[RACE_KEYS.indexOf(rk)]); const sc = k === 'fort' ? 0.9 : 1.2; c.drawImage(s.cv, x, y - s.h * sc, s.w * sc, s.h * sc); x += s.w * sc + 5; } if (x > 900) { x = 20; y += 290; } }
    for (let v = 0; v < 6; v++) { const s = treeSprite(v); c.drawImage(s.cv, 900 + (v % 3) * 120, 300 + Math.floor(v / 3) * 150 - s.h, s.w * 1.3, s.h * 1.3); }
  });
  await p.screenshot({ path: require('path').resolve(__dirname, '../shots') + '/sheet2.png' });
  await b.close();
})();
