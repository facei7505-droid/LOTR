// ================= ICONS: painted medallion pictures for the command ring, spells and equipment =================
// Every picture is drawn once with canvas gradients (metal, wood, fire, cloth) on a round backdrop and cached as a data URL.
const PIC = (() => {
  const S = 96, cache = new Map();
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; };
  // ---- backdrop: a painted sky/ember disc with a soft vignette ----
  function bg(c, top, bot, lightX, lightY) {
    const g = c.createRadialGradient(lightX || 40, lightY || 30, 4, 50, 55, 62); g.addColorStop(0, top); g.addColorStop(1, bot);
    c.fillStyle = g; c.beginPath(); c.arc(50, 50, 50, 0, 7); c.fill();
    c.save(); c.globalAlpha = 0.07; for (let i = 0; i < 26; i++) { const a = i * 2.39, r = 10 + (i * 37 % 38); c.fillStyle = i % 2 ? '#fff' : '#000'; c.beginPath(); c.ellipse(50 + Math.cos(a) * r, 50 + Math.sin(a) * r, 9 + i % 7, 4 + i % 4, a, 0, 7); c.fill(); } c.restore();
  }
  function vignette(c) {
    const g = c.createRadialGradient(50, 50, 30, 50, 50, 51); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.6)');
    c.fillStyle = g; c.beginPath(); c.arc(50, 50, 50, 0, 7); c.fill();
  }
  function glow(c, x, y, r, col, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(col, a === undefined ? 0.85 : a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
  function sparks(c, x, y, r, col, n) { c.fillStyle = col; for (let i = 0; i < n; i++) { const a = i * 2.4 + 0.3, d = r * (0.3 + (i * 0.37 % 0.7)); c.globalAlpha = 0.5 + (i % 3) * 0.2; c.beginPath(); c.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 0.8 + (i % 3) * 0.5, 0, 7); c.fill(); } c.globalAlpha = 1; }
  const lin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s)); return g; };
  const steel = c => lin(c, -5, 0, 5, 0, ['#5d646c', '#f4f7fa', '#9aa3ac', '#3e454c']);
  const goldG = (c, w) => lin(c, -w, 0, w, 0, ['#7a5418', '#ffe08a', '#c79a3a', '#6a4812']);
  function outline(c, w) { c.lineWidth = w || 1.6; c.strokeStyle = 'rgba(15,10,5,.85)'; c.stroke(); }
  // ---- props ----
  function sword(c, x, y, ang, len, gl) {
    c.save(); c.translate(x, y); c.rotate(ang);
    if (gl) { c.save(); c.shadowColor = gl; c.shadowBlur = 14; }
    c.beginPath(); c.moveTo(-4.2, 0); c.lineTo(-4.2, -len * 0.82); c.lineTo(0, -len); c.lineTo(4.2, -len * 0.82); c.lineTo(4.2, 0); c.closePath();
    c.fillStyle = gl ? lin(c, -5, 0, 5, 0, ['#8a949c', '#ffffff', rgba(gl, 1), '#59616a']) : steel(c); c.fill(); outline(c, 1.2);
    if (gl) c.restore();
    c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, -3); c.lineTo(0, -len * 0.86); c.stroke();
    c.fillStyle = goldG(c, 12); c.beginPath(); c.moveTo(-13, 0); c.quadraticCurveTo(0, -4, 13, 0); c.lineTo(13, 3.2); c.quadraticCurveTo(0, 0.5, -13, 3.2); c.closePath(); c.fill(); outline(c, 1.1);
    c.fillStyle = lin(c, -3, 0, 3, 0, ['#3a2210', '#8a5a30', '#3a2210']); c.fillRect(-2.6, 3, 5.2, 13); c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 0.7; for (let k = 5; k < 16; k += 2.5) { c.beginPath(); c.moveTo(-2.6, k); c.lineTo(2.6, k + 1.4); c.stroke(); }
    c.fillStyle = goldG(c, 4); c.beginPath(); c.arc(0, 18.5, 3.8, 0, 7); c.fill(); outline(c, 1);
    c.restore();
  }
  function shieldPath(c, x, y, s) { c.beginPath(); c.moveTo(x - 17 * s, y - 20 * s); c.lineTo(x + 17 * s, y - 20 * s); c.bezierCurveTo(x + 18 * s, y + 4 * s, x + 12 * s, y + 16 * s, x, y + 24 * s); c.bezierCurveTo(x - 12 * s, y + 16 * s, x - 18 * s, y + 4 * s, x - 17 * s, y - 20 * s); c.closePath(); }
  function shield(c, x, y, s, col, emblem) {
    shieldPath(c, x, y, s); c.fillStyle = lin(c, x - 18 * s, y - 20 * s, x + 18 * s, y + 20 * s, [shade(col, 0.35), col, shade(col, -0.45)]); c.fill();
    c.lineWidth = 3.4 * s; c.strokeStyle = lin(c, x - 18 * s, 0, x + 18 * s, 0, ['#6a4812', '#ffe08a', '#8a6420']); c.stroke(); outline(c, 1.2);
    if (emblem === 'cross') { c.fillStyle = 'rgba(255,240,200,.85)'; c.fillRect(x - 2.6 * s, y - 15 * s, 5.2 * s, 30 * s); c.fillRect(x - 11 * s, y - 6 * s, 22 * s, 5.2 * s); }
    else { c.fillStyle = goldG(c, 5); c.beginPath(); c.arc(x, y - 1 * s, 5.5 * s, 0, 7); c.fill(); outline(c, 1); }
    c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(x - 7 * s, y - 10 * s, 5 * s, 9 * s, 0.3, 0, 7); c.fill();
  }
  function cuirass(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.beginPath(); c.moveTo(-22, -22); c.quadraticCurveTo(-12, -16, -8, -24); c.quadraticCurveTo(0, -18, 8, -24); c.quadraticCurveTo(12, -16, 22, -22); c.lineTo(20, -6); c.quadraticCurveTo(15, 4, 17, 20); c.quadraticCurveTo(0, 28, -17, 20); c.quadraticCurveTo(-15, 4, -20, -6); c.closePath();
    c.fillStyle = lin(c, -22, -20, 22, 20, ['#eef2f6', '#a4adb6', '#5c646c', '#2f353b']); c.fill(); outline(c, 1.6);
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, -18); c.quadraticCurveTo(2, 2, 0, 24); c.stroke();
    c.strokeStyle = 'rgba(20,20,20,.45)'; c.beginPath(); c.moveTo(-15, 8); c.quadraticCurveTo(0, 14, 15, 8); c.stroke(); c.beginPath(); c.moveTo(-15, 15); c.quadraticCurveTo(0, 21, 15, 15); c.stroke();
    c.fillStyle = goldG(c, 20); for (const [px, py] of [[-16, -16], [16, -16], [-14, 18], [14, 18]]) { c.beginPath(); c.arc(px, py, 1.8, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.ellipse(-9, -6, 5, 11, 0.2, 0, 7); c.fill();
    c.restore();
  }
  function flame(c, x, y, r, col) {
    glow(c, x, y, r * 2.2, col, 0.7);
    c.save(); c.translate(x, y);
    for (const [k, fc] of [[1, shade(col, -0.2)], [0.7, col], [0.42, '#fff6c8']]) { c.fillStyle = fc; c.beginPath(); c.moveTo(-r * k, 0); c.quadraticCurveTo(-r * k, -r * 1.3 * k, 0, -r * 2.2 * k); c.quadraticCurveTo(r * 0.3 * k, -r * 1.2 * k, r * k, -r * 1.5 * k); c.quadraticCurveTo(r * 1.1 * k, -r * 0.2 * k, 0, r * 0.6 * k); c.quadraticCurveTo(-r * 0.9 * k, r * 0.4 * k, -r * k, 0); c.fill(); }
    c.restore();
  }
  function arrow(c, x0, y0, x1, y1, fx) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0);
    c.save(); c.translate(x0, y0); c.rotate(a);
    c.strokeStyle = lin(c, 0, -1, 0, 1, ['#caa070', '#6b4a2e']); c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, 0); c.lineTo(L - 8, 0); c.stroke();
    c.fillStyle = '#e8e2d2'; for (const s of [1, -1]) { c.beginPath(); c.moveTo(0, 0); c.lineTo(9, 0); c.lineTo(3, 5 * s); c.lineTo(-3, 5 * s); c.closePath(); c.fill(); }
    if (fx) { c.save(); c.translate(L - 4, 0); c.rotate(-a - Math.PI / 2 + 0.25); flame(c, 0, 0, 7, fx); c.restore(); }
    c.fillStyle = fx ? lin(c, L - 9, -4, L, 4, ['#fff', rgba(fx, 1)]) : steel(c); c.beginPath(); c.moveTo(L, 0); c.lineTo(L - 10, -4.5); c.lineTo(L - 8, 0); c.lineTo(L - 10, 4.5); c.closePath(); c.fill(); outline(c, 0.9);
    c.restore();
  }
  function bow(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.strokeStyle = lin(c, -4, -28, 4, 28, ['#3a2210', '#b07a44', '#3a2210']); c.lineWidth = 4.2; c.beginPath(); c.moveTo(-2, -30); c.quadraticCurveTo(18, 0, -2, 30); c.stroke();
    c.strokeStyle = '#efe6cc'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-2, -30); c.lineTo(-2, 30); c.stroke();
    c.restore();
  }
  function banner(c, x, y, col, s, rays) {
    c.save(); c.translate(x, y); c.scale(s || 1, s || 1);
    if (rays) { c.save(); c.globalAlpha = 0.5; for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); c.fillStyle = '#ffe9a0'; c.beginPath(); c.moveTo(0, -5); c.lineTo(40, -2); c.lineTo(40, 2); c.closePath(); c.fill(); } c.restore(); glow(c, 6, -8, 30, '#ffd86a', 0.5); }
    c.fillStyle = lin(c, -2, 0, 2, 0, ['#3a2210', '#9a6a3a', '#3a2210']); c.fillRect(-19, -34, 3.4, 70);
    c.fillStyle = goldG(c, 4); c.beginPath(); c.moveTo(-17.3, -42); c.lineTo(-14, -34); c.lineTo(-20.6, -34); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-16, -30); c.bezierCurveTo(0, -36, 8, -24, 24, -30); c.lineTo(22, 6); c.lineTo(14, 0); c.lineTo(6, 8); c.bezierCurveTo(-4, 2, -10, 8, -16, 4); c.closePath();
    c.fillStyle = lin(c, -16, -30, 24, 8, [shade(col, 0.3), col, shade(col, -0.5)]); c.fill(); outline(c, 1.2);
    c.strokeStyle = goldG(c, 20); c.lineWidth = 1.6; c.beginPath(); c.moveTo(-16, -27); c.bezierCurveTo(0, -33, 8, -21, 23, -27); c.stroke();
    c.fillStyle = goldG(c, 6); c.beginPath(); c.moveTo(3, -22); c.lineTo(7, -13); c.lineTo(3, -4); c.lineTo(-1, -13); c.closePath(); c.fill(); outline(c, 0.8);
    c.restore();
  }
  function bricks(c, x, y, w, h, bw, bh, tone) {
    for (let r = 0, yy = y; yy < y + h; r++, yy += bh) for (let xx = x - (r % 2) * bw / 2; xx < x + w; xx += bw) {
      const x0 = Math.max(x, xx), x1 = Math.min(x + w, xx + bw); if (x1 <= x0) continue; const k = ((r * 7 + Math.round(xx) * 3) % 5) / 5;
      c.fillStyle = lin(c, x0, yy, x0, yy + bh, [shade(tone, 0.25 - k * 0.2), shade(tone, -0.25 - k * 0.2)]); c.fillRect(x0 + 0.6, yy + 0.6, x1 - x0 - 1.2, Math.min(bh, y + h - yy) - 1.2);
    }
  }
  function wall(c) {
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(10, 76, 80, 6);
    bricks(c, 12, 42, 76, 36, 13, 8, '#a8a090');
    for (let i = 0; i < 5; i++) bricks(c, 12 + i * 16, 30, 10, 12, 10, 6, '#b5ad9d');
    c.fillStyle = '#20180f'; c.beginPath(); c.moveTo(42, 78); c.lineTo(42, 60); c.quadraticCurveTo(50, 50, 58, 60); c.lineTo(58, 78); c.fill();
    c.fillStyle = lin(c, 42, 60, 58, 78, ['#6b4a2e', '#3a2616']); c.beginPath(); c.moveTo(44, 78); c.lineTo(44, 61); c.quadraticCurveTo(50, 53, 56, 61); c.lineTo(56, 78); c.fill();
    c.strokeStyle = '#1d140a'; c.lineWidth = 1; for (let k = 47; k < 56; k += 3) { c.beginPath(); c.moveTo(k, 57); c.lineTo(k, 78); c.stroke(); }
  }
  function tower(c, x, y, s, roof) {
    c.save(); c.translate(x, y); c.scale(s, s);
    bricks(c, -12, -20, 24, 50, 8, 6, '#a8a090');
    for (let i = 0; i < 3; i++) bricks(c, -14 + i * 10, -28, 7, 8, 7, 4, '#b5ad9d');
    c.fillStyle = '#1a120a'; c.fillRect(-2.5, -10, 5, 9);
    if (roof) { c.fillStyle = lin(c, -16, 0, 16, 0, [shade(roof, 0.2), roof, shade(roof, -0.5)]); c.beginPath(); c.moveTo(-16, -28); c.lineTo(0, -52); c.lineTo(16, -28); c.closePath(); c.fill(); outline(c, 1); }
    c.restore();
  }
  function catapultPic(c) {
    const wood = (x0, y0, x1, y1, w) => { c.strokeStyle = lin(c, x0, y0, x1, y1, ['#9a6a3a', '#4a3018']); c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
    wood(18, 80, 78, 80, 6); wood(30, 80, 48, 46, 5); wood(66, 80, 48, 46, 5); wood(22, 58, 70, 30, 4.5);
    c.fillStyle = '#4a3018'; c.fillRect(64, 26, 12, 12); outline(c, 1);
    c.fillStyle = goldG(c, 4); c.beginPath(); c.arc(48, 46, 3.4, 0, 7); c.fill();
    for (const [wx, wy] of [[26, 80], [70, 80]]) { c.fillStyle = '#3a2616'; c.beginPath(); c.arc(wx, wy, 8, 0, 7); c.fill(); c.strokeStyle = '#8a6a3a'; c.lineWidth = 1.5; c.stroke(); }
    c.strokeStyle = 'rgba(255,170,60,.55)'; c.lineWidth = 5; c.beginPath(); c.moveTo(24, 50); c.quadraticCurveTo(22, 30, 36, 18); c.stroke();
    flame(c, 38, 18, 5, '#ff8a3a'); c.fillStyle = '#6a625a'; c.beginPath(); c.arc(38, 17, 5.5, 0, 7); c.fill(); outline(c, 1);
  }
  function chest(c) {
    glow(c, 50, 42, 34, '#ffd86a', 0.8);
    c.fillStyle = lin(c, 20, 50, 80, 82, ['#8a5a30', '#4a2c14']); c.fillRect(20, 50, 60, 30); outline(c, 1.4);
    c.fillStyle = lin(c, 20, 30, 80, 50, ['#6b4222', '#3a2210']); c.beginPath(); c.moveTo(22, 50); c.lineTo(26, 28); c.lineTo(74, 28); c.lineTo(78, 50); c.closePath(); c.fill(); outline(c, 1.2);
    for (const bx of [28, 72]) { c.fillStyle = goldG(c, 30); c.fillRect(bx - 3, 50, 6, 30); }
    c.fillStyle = goldG(c, 30); c.fillRect(20, 60, 60, 4); c.fillRect(45, 56, 10, 12); c.fillStyle = '#2a1a0a'; c.fillRect(49, 60, 2, 5);
    for (let i = 0; i < 16; i++) { const cx = 28 + (i * 13 % 44), cy = 48 - (i % 4) * 3 - (i > 8 ? 4 : 0); c.fillStyle = lin(c, cx - 5, cy, cx + 5, cy, ['#8a6012', '#ffe890', '#b88a2a']); c.beginPath(); c.ellipse(cx, cy, 5.5, 2.6, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(90,60,10,.8)'; c.lineWidth = 0.7; c.stroke(); }
    sparks(c, 50, 36, 26, '#fff4c0', 10);
  }
  function coins(c) {
    glow(c, 50, 52, 36, '#ffd86a', 0.7);
    for (let i = 0; i < 22; i++) { const row = Math.floor(i / 6), cx = 26 + (i % 6) * 9.5 + row * 4.5, cy = 76 - row * 8 - (i % 2); if (cx > 78) continue; c.fillStyle = lin(c, cx - 6, cy, cx + 6, cy, ['#8a6012', '#ffe890', '#b88a2a']); c.beginPath(); c.ellipse(cx, cy, 7, 3.2, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(90,60,10,.9)'; c.lineWidth = 0.8; c.stroke(); }
    c.fillStyle = lin(c, 38, 26, 62, 50, ['#ffe890', '#c49a30', '#7a5418']); c.beginPath(); c.arc(50, 38, 13, 0, 7); c.fill(); outline(c, 1.2);
    c.fillStyle = 'rgba(120,80,10,.8)'; c.font = 'bold 15px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('♛', 50, 39);
    sparks(c, 50, 40, 30, '#fff', 8);
  }
  function flask(c, x, y, s, liq, cross) {
    c.save(); c.translate(x, y); c.scale(s, s);
    glow(c, 0, 8, 30, liq, 0.55);
    c.beginPath(); c.moveTo(-5, -26); c.lineTo(-5, -12); c.bezierCurveTo(-22, -6, -22, 24, 0, 26); c.bezierCurveTo(22, 24, 22, -6, 5, -12); c.lineTo(5, -26); c.closePath();
    c.fillStyle = 'rgba(210,230,240,.25)'; c.fill();
    c.save(); c.clip(); c.fillStyle = lin(c, 0, -4, 0, 26, [shade(liq, 0.4), liq, shade(liq, -0.5)]); c.fillRect(-24, -2, 48, 30); c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(-8 + i * 4, 12 - i * 3, 1.3, 0, 7); c.fill(); } c.restore();
    outline(c, 1.4); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.4; c.beginPath(); c.arc(0, 8, 14, 3.5, 4.4); c.stroke();
    c.fillStyle = lin(c, -6, 0, 6, 0, ['#5a3a1a', '#a07040', '#5a3a1a']); c.fillRect(-6, -32, 12, 8); outline(c, 1);
    if (cross) { c.fillStyle = '#fff'; c.fillRect(-2.5, 3, 5, 15); c.fillRect(-7.5, 8, 15, 5); }
    c.restore();
  }
  function hammer(c, x, y, ang, s) {
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
    c.fillStyle = lin(c, -2.5, 0, 2.5, 0, ['#3a2210', '#9a6a3a', '#3a2210']); c.fillRect(-2.5, -8, 5, 40); outline(c, 1);
    c.fillStyle = lin(c, 0, -20, 0, -4, ['#e8ecef', '#8a939b', '#3e454c']); c.beginPath(); c.moveTo(-14, -20); c.lineTo(14, -20); c.lineTo(16, -6); c.lineTo(-16, -6); c.closePath(); c.fill(); outline(c, 1.2);
    c.restore();
  }
  function anvil(c, x, y) {
    c.fillStyle = lin(c, x, y - 10, x, y + 16, ['#7a828a', '#30363c']);
    c.beginPath(); c.moveTo(x - 26, y - 10); c.lineTo(x + 20, y - 10); c.quadraticCurveTo(x + 30, y - 10, x + 34, y - 4); c.lineTo(x + 14, y); c.lineTo(x + 8, y + 6); c.lineTo(x + 14, y + 16); c.lineTo(x - 18, y + 16); c.lineTo(x - 12, y + 6); c.lineTo(x - 18, y); c.lineTo(x - 26, y - 4); c.closePath(); c.fill(); outline(c, 1.4);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x - 24, y - 10, 42, 2);
  }
  function helmet(c, x, y, s, plume) {
    c.save(); c.translate(x, y); c.scale(s, s);
    if (plume) { c.fillStyle = lin(c, 0, -30, 0, -10, [shade(plume, 0.3), plume]); c.beginPath(); c.moveTo(-3, -16); c.quadraticCurveTo(-6, -34, 14, -30); c.quadraticCurveTo(6, -24, 4, -14); c.closePath(); c.fill(); }
    c.beginPath(); c.moveTo(-15, 14); c.lineTo(-15, -4); c.quadraticCurveTo(-15, -20, 0, -20); c.quadraticCurveTo(15, -20, 15, -4); c.lineTo(15, 14); c.lineTo(5, 16); c.lineTo(4, 4); c.lineTo(-4, 4); c.lineTo(-5, 16); c.closePath();
    c.fillStyle = lin(c, -15, -20, 15, 16, ['#f0f3f6', '#98a1aa', '#3e454c']); c.fill(); outline(c, 1.4);
    c.fillStyle = '#120c06'; c.fillRect(-11, -4, 8, 3.4); c.fillRect(3, -4, 8, 3.4);
    c.fillStyle = goldG(c, 15); c.fillRect(-1.5, -20, 3, 22);
    c.restore();
  }
  function book(c, glowCol) {
    glow(c, 50, 44, 34, glowCol, 0.7);
    c.fillStyle = '#4a2410'; c.beginPath(); c.moveTo(14, 70); c.lineTo(50, 76); c.lineTo(86, 70); c.lineTo(86, 36); c.lineTo(50, 42); c.lineTo(14, 36); c.closePath(); c.fill(); outline(c, 1.4);
    for (const s of [-1, 1]) { c.fillStyle = lin(c, 50, 30, 50 + s * 34, 70, ['#fff6de', '#d8c8a0']); c.beginPath(); c.moveTo(50, 40); c.quadraticCurveTo(50 + s * 18, 30, 50 + s * 33, 34); c.lineTo(50 + s * 33, 66); c.quadraticCurveTo(50 + s * 18, 62, 50, 72); c.closePath(); c.fill(); outline(c, 1); }
    c.strokeStyle = rgba(glowCol, 0.9); c.lineWidth = 1.2; c.shadowColor = glowCol; c.shadowBlur = 6;
    for (let r = 0; r < 4; r++) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(50 + s * 8, 46 + r * 6); c.lineTo(50 + s * 27, 44 + r * 6); c.stroke(); }
    c.shadowBlur = 0; sparks(c, 50, 30, 20, '#fff', 8);
  }
  function skull(c, x, y, s, eye) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = lin(c, -16, -18, 16, 18, ['#f4ecd8', '#b8ae96', '#6a624e']);
    c.beginPath(); c.arc(0, -4, 16, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(10, 10); c.lineTo(8, 17); c.lineTo(-8, 17); c.lineTo(-10, 10); c.closePath(); c.fill(); outline(c, 1.4);
    c.fillStyle = '#140c08'; for (const s2 of [-1, 1]) { c.beginPath(); c.ellipse(s2 * 6.5, -2, 5, 5.5, 0, 0, 7); c.fill(); }
    if (eye) for (const s2 of [-1, 1]) glow(c, s2 * 6.5, -2, 6, eye, 1);
    c.beginPath(); c.moveTo(0, 5); c.lineTo(-2.5, 10); c.lineTo(2.5, 10); c.closePath(); c.fill();
    c.strokeStyle = '#140c08'; c.lineWidth = 1; for (let k = -6; k <= 6; k += 3) { c.beginPath(); c.moveTo(k, 13); c.lineTo(k, 17); c.stroke(); }
    c.restore();
  }
  function sunburst(c, x, y, r, col) {
    glow(c, x, y, r * 1.8, col, 0.9);
    c.save(); c.translate(x, y); c.fillStyle = rgba(col, 0.9);
    for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.beginPath(); c.moveTo(-2.5, r * 0.4); c.lineTo(0, r * (i % 2 ? 1.1 : 1.5)); c.lineTo(2.5, r * 0.4); c.closePath(); c.fill(); }
    c.fillStyle = '#fffbe8'; c.beginPath(); c.arc(0, 0, r * 0.45, 0, 7); c.fill();
    c.restore();
  }
  function boot(c, x, y, s) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = lin(c, -12, -20, 18, 20, ['#a07040', '#5a3a1a', '#2a1a0a']);
    c.beginPath(); c.moveTo(-10, -24); c.lineTo(6, -24); c.lineTo(6, 4); c.quadraticCurveTo(22, 6, 22, 16); c.lineTo(-12, 16); c.closePath(); c.fill(); outline(c, 1.4);
    c.fillStyle = goldG(c, 10); c.fillRect(-11, -24, 18, 4); c.fillRect(-12, 12, 34, 4);
    c.restore();
  }
  function wing(c, x, y, s, flip) {
    c.save(); c.translate(x, y); c.scale(flip ? -s : s, s);
    for (let i = 0; i < 5; i++) { c.fillStyle = lin(c, 0, 0, 24, -10, ['#ffffff', '#cfd8e4']); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(10, -18 + i * 5, 26 - i * 2, -16 + i * 7); c.quadraticCurveTo(12, -6 + i * 4, 0, 4); c.closePath(); c.fill(); c.strokeStyle = 'rgba(80,90,110,.6)'; c.lineWidth = 0.8; c.stroke(); }
    c.restore();
  }
  function speed(c, x, y, len, n, col) { c.strokeStyle = col || 'rgba(255,255,255,.55)'; c.lineCap = 'round'; for (let i = 0; i < n; i++) { c.lineWidth = 2 - i * 0.3; c.beginPath(); c.moveTo(x, y + i * 7); c.lineTo(x - len + i * 5, y + i * 7); c.stroke(); } }
  function ring(c, x, y, r, col, w) { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.ellipse(x, y, r, r * 0.38, 0, 0, 7); c.stroke(); }
  function horn(c) {
    c.save(); c.translate(50, 54);
    c.beginPath(); c.moveTo(-28, 10); c.quadraticCurveTo(-8, 18, 18, -6); c.lineTo(28, -20); c.quadraticCurveTo(34, -2, 20, 6); c.quadraticCurveTo(-4, 26, -28, 16); c.closePath();
    c.fillStyle = lin(c, -28, 10, 30, -20, ['#f0e2c0', '#b89a64', '#6a5030']); c.fill(); outline(c, 1.4);
    c.fillStyle = goldG(c, 30); for (const t of [-14, 2]) { c.beginPath(); c.ellipse(t, 10 - (t + 14) * 0.5, 2.4, 8, -0.6, 0, 7); c.fill(); }
    c.restore();
    c.strokeStyle = 'rgba(255,230,160,.7)'; c.lineWidth = 2; for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(80, 30, i * 6, 2.3, 3.9); c.stroke(); }
  }
  function portal(c, col) {
    glow(c, 50, 58, 36, col, 0.8);
    c.save(); c.translate(50, 58);
    for (let i = 0; i < 5; i++) { c.strokeStyle = rgba(col, 0.9 - i * 0.14); c.lineWidth = 3.2 - i * 0.4; c.beginPath(); c.ellipse(0, 0, 30 - i * 5, 11 - i * 1.8, 0, i * 0.8, i * 0.8 + 4.6); c.stroke(); }
    c.restore();
    c.fillStyle = 'rgba(20,14,10,.9)'; c.beginPath(); c.moveTo(38, 60); c.lineTo(40, 30); c.quadraticCurveTo(50, 18, 60, 30); c.lineTo(62, 60); c.closePath(); c.fill();
    for (const s2 of [-1, 1]) glow(c, 50 + s2 * 4, 34, 3, col, 1);
  }
  function tree(c) {
    c.fillStyle = lin(c, 44, 50, 56, 84, ['#6b4a2e', '#2e1e10']); c.beginPath(); c.moveTo(44, 84); c.quadraticCurveTo(46, 60, 42, 46); c.lineTo(58, 46); c.quadraticCurveTo(54, 60, 58, 84); c.closePath(); c.fill(); outline(c, 1.2);
    for (const [x, y, r] of [[50, 30, 18], [34, 42, 13], [66, 42, 13], [42, 24, 11], [60, 24, 11]]) { c.fillStyle = lin(c, x - r, y - r, x + r, y + r, ['#b8e67a', '#4e8a2e', '#1e4012']); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
    for (const s2 of [-1, 1]) glow(c, 50 + s2 * 4, 62, 3, '#c8ff8a', 1);
  }
  function crossX(c, col) { c.strokeStyle = col; c.lineCap = 'round'; c.lineWidth = 9; c.beginPath(); c.moveTo(30, 30); c.lineTo(70, 70); c.moveTo(70, 30); c.lineTo(30, 70); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(31, 29); c.lineTo(69, 67); c.stroke(); }
  function check(c) { c.strokeStyle = '#8ae06a'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 10; c.beginPath(); c.moveTo(28, 52); c.lineTo(44, 68); c.lineTo(74, 32); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(30, 50); c.lineTo(44, 64); c.lineTo(72, 31); c.stroke(); }
  function curvedArrow(c, col, back) {
    c.save(); if (back) { c.translate(100, 0); c.scale(-1, 1); }
    c.strokeStyle = col; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.arc(50, 56, 22, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.fillStyle = col; c.beginPath(); c.moveTo(80, 44); c.lineTo(64, 58); c.lineTo(62, 38); c.closePath(); c.fill();
    c.restore();
  }
  function house(c, scaffold) {
    c.fillStyle = lin(c, 28, 50, 72, 82, ['#d8c8a0', '#8a7a58']); c.fillRect(28, 50, 44, 32); outline(c, 1.2);
    c.fillStyle = lin(c, 20, 30, 80, 52, ['#b0503a', '#5a2418']); c.beginPath(); c.moveTo(20, 52); c.lineTo(50, 26); c.lineTo(80, 52); c.closePath(); c.fill(); outline(c, 1.2);
    c.fillStyle = '#3a2616'; c.fillRect(44, 64, 12, 18);
    if (scaffold) { c.strokeStyle = '#c89a5a'; c.lineWidth = 2.4; for (const x of [22, 78]) { c.beginPath(); c.moveTo(x, 84); c.lineTo(x, 36); c.stroke(); } for (const y of [48, 66]) { c.beginPath(); c.moveTo(20, y); c.lineTo(80, y); c.stroke(); } }
  }
  function mapPin(c, col) {
    c.fillStyle = '#d8c89a'; c.beginPath(); c.moveTo(16, 70); c.lineTo(36, 62); c.lineTo(62, 70); c.lineTo(84, 62); c.lineTo(84, 84); c.lineTo(62, 92); c.lineTo(36, 84); c.lineTo(16, 92); c.closePath(); c.fill(); outline(c, 1);
    c.strokeStyle = 'rgba(140,40,20,.8)'; c.setLineDash([3, 3]); c.lineWidth = 1.6; c.beginPath(); c.moveTo(24, 84); c.quadraticCurveTo(40, 70, 52, 76); c.stroke(); c.setLineDash([]);
    banner(c, 60, 50, col, 0.8);
  }
  // ---- the pictures ----
  const DRAW = {
    blades: (c, o) => { bg(c, '#5a4a30', '#140e08'); const g = FX_COLORS[ARROW_FX[o.race] || 'fire']; sword(c, 50, 60, -0.62, 50, g); sword(c, 50, 60, 0.62, 50, g); sparks(c, 50, 30, 26, '#fff', 9); },
    armor: (c, o) => { bg(c, '#4a5566', '#0e1218'); cuirass(c, 50, 52, 1.35); sparks(c, 38, 36, 12, '#fff', 4); },
    arrows: (c, o) => { const fx = FX_COLORS[ARROW_FX[o.race] || 'fire']; bg(c, '#4a2a1a', '#0e0806'); glow(c, 70, 28, 30, fx, 0.55); arrow(c, 14, 80, 80, 24, fx); arrow(c, 8, 60, 66, 14, fx); arrow(c, 30, 90, 90, 42, fx); sparks(c, 72, 26, 22, '#fff', 8); },
    banner: (c, o) => { bg(c, '#50603a', '#10140a'); banner(c, 50, 54, o.col || '#b03a2e', 1.15); },
    walls: c => { bg(c, '#6a8aa8', '#1a2430', 50, 20); wall(c); },
    archers: c => { bg(c, '#7a8aa0', '#1a1e28', 60, 20); tower(c, 38, 60, 1.05, '#4a5a8a'); arrow(c, 52, 42, 90, 20); arrow(c, 52, 52, 92, 40); bow(c, 72, 66, 0.55); },
    catapult: c => { bg(c, '#c08a5a', '#2a1a0c', 30, 20); catapultPic(c); },
    treasury: c => { bg(c, '#5a3a18', '#120a04'); chest(c); },
    infirmary: c => { bg(c, '#3a5a4a', '#0a1410'); flask(c, 50, 54, 1.25, '#e0443a', true); },
    attack: c => { bg(c, '#7a2a1a', '#140604'); sword(c, 50, 60, -0.62, 50, '#ff6a3a'); sword(c, 50, 60, 0.62, 50, '#ff6a3a'); },
    march: c => { bg(c, '#5a5a3a', '#12120a'); boot(c, 46, 54, 1.25); speed(c, 30, 40, 22, 4); },
    hold: c => { bg(c, '#4a5566', '#0e1218'); c.strokeStyle = lin(c, 0, 10, 0, 90, ['#caa070', '#4a3018']); c.lineWidth = 4; c.beginPath(); c.moveTo(70, 90); c.lineTo(70, 12); c.stroke(); c.fillStyle = steel(c); c.beginPath(); c.moveTo(70, 4); c.lineTo(75, 16); c.lineTo(65, 16); c.closePath(); c.fill(); shield(c, 46, 52, 1.2, '#2a4a8a', 'cross'); },
    retreat: c => { bg(c, '#5a5a6a', '#10101a'); tower(c, 64, 60, 0.9, '#6a3a2a'); curvedArrow(c, '#e8d8a8', true); },
    norm: c => { bg(c, '#5a4a30', '#140e08'); shield(c, 38, 54, 0.95, '#6a3a2a'); sword(c, 64, 66, 0.35, 44); },
    charge: c => { bg(c, '#8a3a1a', '#180804'); c.save(); c.translate(50, 50); c.rotate(-0.5); c.fillStyle = lin(c, 0, -2, 0, 2, ['#caa070', '#4a3018']); c.fillRect(-40, -2.5, 72, 5); c.fillStyle = steel(c); c.beginPath(); c.moveTo(44, 0); c.lineTo(30, -6); c.lineTo(30, 6); c.closePath(); c.fill(); outline(c, 1); c.restore(); speed(c, 44, 64, 30, 4, 'rgba(255,200,140,.6)'); glow(c, 76, 30, 12, '#ffb060', 0.8); },
    shieldwall: c => { bg(c, '#4a5566', '#0e1218'); for (let i = 0; i < 3; i++) shield(c, 26 + i * 24, 56 - (i % 2) * 4, 0.82, ['#2a4a8a', '#6a2a2a', '#2a4a8a'][i], 'cross'); },
    flag: (c, o) => { bg(c, '#7a6030', '#1a1206'); banner(c, 50, 54, o.col || '#b03a2e', 1.05, true); },
    refill: (c, o) => { bg(c, '#3a5a3a', '#0a140a'); helmet(c, 32, 58, 0.8); helmet(c, 58, 54, 0.95, o.col); c.fillStyle = '#7ae06a'; c.strokeStyle = '#123a0e'; c.lineWidth = 2; c.fillRect(70, 18, 8, 26); c.fillRect(61, 27, 26, 8); c.strokeRect(70, 18, 8, 26); c.strokeRect(61, 27, 26, 8); },
    cancel: c => { bg(c, '#5a2a22', '#120604'); crossX(c, '#e05a4a'); },
    undo: c => { bg(c, '#5a4a30', '#140e08'); curvedArrow(c, '#e8d8a8', true); },
    place: c => { bg(c, '#3a5a2a', '#0a1406'); check(c); },
    rally: (c, o) => { bg(c, '#5a6a4a', '#10140a'); mapPin(c, o.col || '#b03a2e'); },
    repair: c => { bg(c, '#5a4030', '#120a06'); anvil(c, 46, 70); hammer(c, 58, 40, 0.7, 0.9); sparks(c, 44, 58, 16, '#ffd06a', 12); glow(c, 44, 60, 10, '#ffb040', 0.9); },
    build: c => { bg(c, '#6a8aa8', '#1a2430', 50, 20); house(c, true); hammer(c, 76, 70, -0.5, 0.5); },
    worker: c => { bg(c, '#5a4a30', '#140e08'); hammer(c, 50, 58, -0.4, 1); curvedArrow(c, 'rgba(232,216,168,.85)'); },
    army: (c, o) => { bg(c, '#6a3a2a', '#140806'); helmet(c, 28, 62, 0.7); helmet(c, 72, 62, 0.7); helmet(c, 50, 52, 0.95, o.col); },
    builders: c => { bg(c, '#5a4a30', '#140e08'); hammer(c, 40, 56, -0.6, 0.9); c.save(); c.translate(60, 54); c.rotate(0.6); c.fillStyle = steel(c); c.fillRect(-4, -30, 12, 40); c.fillStyle = '#6b4a2e'; c.fillRect(-5, 10, 14, 14); c.restore(); },
    recruit: (c, o) => { bg(c, '#7a6030', '#1a1206'); banner(c, 36, 52, o.col || '#b03a2e', 0.85); helmet(c, 66, 62, 0.8, o.col); },
    box: (c, o) => { bg(c, '#4a5a4a', '#0a100a'); helmet(c, 36, 58, 0.62); helmet(c, 62, 58, 0.62, o.col); c.strokeStyle = '#e8f0c8'; c.lineWidth = 2.4; c.setLineDash([6, 4]); c.strokeRect(18, 28, 64, 50); c.setLineDash([]); c.fillStyle = '#e8f0c8'; for (const [x, y] of [[18, 28], [82, 28], [18, 78], [82, 78]]) c.fillRect(x - 3, y - 3, 6, 6); },
    desel: c => { bg(c, '#3a3a3a', '#0a0a0a'); crossX(c, '#b0a890'); },
    auto: c => { bg(c, '#2a3a5a', '#060a14'); glow(c, 50, 50, 30, '#7fc8ff', 0.6); for (const b of [0, 1]) { c.save(); if (b) { c.translate(100, 100); c.rotate(Math.PI); } curvedArrow(c, '#bfe3ff'); c.restore(); } },
    manual: c => { bg(c, '#5a3a2a', '#100806'); glow(c, 50, 50, 26, '#ff9a5a', 0.5); c.strokeStyle = '#ffe0b0'; c.lineWidth = 3; c.beginPath(); c.arc(50, 50, 22, 0, 7); c.stroke(); c.beginPath(); c.arc(50, 50, 10, 0, 7); c.stroke(); c.lineWidth = 3.4; for (const [a, b, x, y] of [[50, 16, 50, 34], [50, 66, 50, 84], [16, 50, 34, 50], [66, 50, 84, 50]]) { c.beginPath(); c.moveTo(a, b); c.lineTo(x, y); c.stroke(); } c.fillStyle = '#ff5a3a'; c.beginPath(); c.arc(50, 50, 3.5, 0, 7); c.fill(); },
    book: c => { bg(c, '#3a2a5a', '#0a0614'); book(c, '#b08aff'); },
    // hero skills (tinted by the hero's element)
    sk_aura: (c, o) => { bg(c, shade(o.fx, -0.55), '#0a0806'); sunburst(c, 50, 50, 20, o.fx); },
    sk_dash: (c, o) => { bg(c, shade(o.fx, -0.6), '#0a0806'); speed(c, 56, 38, 36, 4, rgba(o.fx, 0.8)); sword(c, 62, 58, 1.1, 46, o.fx); },
    sk_aoe: (c, o) => { bg(c, shade(o.fx, -0.6), '#0a0806'); glow(c, 50, 62, 34, o.fx, 0.8); for (let i = 0; i < 3; i++) ring(c, 50, 64, 14 + i * 11, rgba(o.fx, 0.9 - i * 0.25), 3.4 - i); hammer(c, 50, 38, 0.2, 0.8); },
    sk_strike: (c, o) => { bg(c, shade(o.fx, -0.6), '#0a0806'); glow(c, 50, 40, 26, o.fx, 0.7); sword(c, 50, 66, 0, 56, o.fx); sparks(c, 50, 30, 20, '#fff', 8); },
    sk_heal: (c, o) => { bg(c, '#3a5a3a', '#0a140a'); glow(c, 50, 44, 34, '#fff1b0', 0.8); flask(c, 50, 56, 1.05, '#7ae06a', true); },
    sk_buff: (c, o) => { bg(c, shade(o.fx, -0.55), '#0a0806'); banner(c, 50, 56, o.col || '#b03a2e', 0.95, true); },
    sk_debuff: (c, o) => { bg(c, '#3a2a4a', '#08040c'); glow(c, 50, 50, 34, '#a36bff', 0.6); skull(c, 50, 52, 1.3, '#b08aff'); },
    sk_summon: (c, o) => { bg(c, shade(o.fx, -0.6), '#060806'); if (o.race === 'elf') tree(c); else portal(c, o.fx); },
    sk_volley: (c, o) => { bg(c, shade(o.fx, -0.6), '#0a0806'); for (let i = 0; i < 5; i++) arrow(c, 14 + i * 14, 8 + (i % 2) * 8, 24 + i * 14, 70 + (i % 2) * 8, o.fx); ring(c, 50, 80, 30, rgba(o.fx, 0.7), 2.5); },
    // powers of the spellbook
    sp_heal: c => { bg(c, '#3a5a3a', '#0a140a'); glow(c, 50, 44, 36, '#fff1b0', 0.9); c.fillStyle = '#fffbe0'; c.fillRect(44, 22, 12, 44); c.fillRect(30, 36, 40, 12); sparks(c, 50, 44, 30, '#fff', 12); },
    sp_gold: c => { bg(c, '#5a3a18', '#120a04'); coins(c); },
    sp_haste: c => { bg(c, '#3a5a7a', '#081018'); wing(c, 36, 46, 1, true); boot(c, 52, 56, 1.05); speed(c, 30, 70, 20, 3); },
    sp_reinf: (c, o) => { bg(c, '#6a3a2a', '#140806'); banner(c, 70, 52, o.col || '#b03a2e', 0.6); helmet(c, 24, 66, 0.62); helmet(c, 44, 60, 0.75, o.col); helmet(c, 62, 70, 0.62); },
    sp_rally: c => { bg(c, '#7a5a2a', '#180e04'); horn(c); },
    sp_curse: c => { bg(c, '#3a2a4a', '#08040c'); glow(c, 50, 50, 36, '#6aff9a', 0.4); skull(c, 50, 52, 1.35, '#8dffb0'); },
    sp_meteor: c => { bg(c, '#3a1a2a', '#0a0408', 70, 20); c.strokeStyle = 'rgba(255,140,60,.5)'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath(); c.moveTo(86, 10); c.lineTo(52, 50); c.stroke(); flame(c, 50, 56, 11, '#ff8a3a'); c.fillStyle = lin(c, 40, 50, 60, 70, ['#8a7a6a', '#3a2a22']); c.beginPath(); c.arc(48, 58, 11, 0, 7); c.fill(); outline(c, 1.2); glow(c, 48, 82, 20, '#ff6a2a', 0.8); },
    sp_summon: (c, o) => { bg(c, '#2a3a2a', '#060806'); if (o.race === 'elf') tree(c); else portal(c, o.race === 'und' ? '#8dffb0' : o.race === 'orc' ? '#ff6a3a' : '#bfe3ff'); },
    sp_ult: (c, o) => { bg(c, '#5a4a2a', '#0e0a04'); sunburst(c, 50, 50, 24, o.fx || '#ffd86a'); sparks(c, 50, 50, 40, '#fff', 14); },
  };
  function get(key, o) {
    o = o || {};
    const ck = key + '|' + (o.col || '') + '|' + (o.race || '') + '|' + (o.fx || '');
    if (cache.has(ck)) return cache.get(ck);
    let url = '';
    try {
      const cv = mkCanvas(S, S), c = cv.getContext('2d'); c.scale(S / 100, S / 100);
      c.save(); c.beginPath(); c.arc(50, 50, 50, 0, 7); c.clip();
      (DRAW[key] || DRAW.desel)(c, Object.assign({ fx: '#ffd27a' }, o)); c.lineCap = 'butt'; c.lineJoin = 'miter'; c.shadowBlur = 0; c.globalAlpha = 1;
      vignette(c); c.restore();
      url = cv.toDataURL();
    } catch (e) {}
    cache.set(ck, url); return url;
  }
  return { get, has: k => !!DRAW[k] };
})();
