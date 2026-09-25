// ================= RENDER: painterly-realistic procedural graphics =================
const SPR = new Map();
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function shade(hex, f) {
  let [r, g, b] = hexRgb(hex);
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
}
function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
function mix(h1, h2, t) { const a = hexRgb(h1), b = hexRgb(h2); return 'rgb(' + ((a[0] + (b[0] - a[0]) * t) | 0) + ',' + ((a[1] + (b[1] - a[1]) * t) | 0) + ',' + ((a[2] + (b[2] - a[2]) * t) | 0) + ')'; }
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function ell(c, x, y, rx, ry, fill, stroke, lw) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw || 1.5; c.strokeStyle = stroke; c.stroke(); } }
function rrect(c, x, y, w, h, r, fill, stroke, lw) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw || 1.5; c.strokeStyle = stroke; c.stroke(); } }
function line(c, x1, y1, x2, y2, col, lw) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.stroke(); }
function poly(c, pts, fill, stroke, lw) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw || 1.5; c.strokeStyle = stroke; c.stroke(); } }
// linear gradient helper across a horizontal span (light from the left)
function lg(c, x0, x1, base, lo, hi) { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, shade(base, hi === undefined ? 0.28 : hi)); g.addColorStop(0.45, base); g.addColorStop(1, shade(base, lo === undefined ? -0.45 : lo)); return g; }
function vg(c, y0, y1, base, lo, hi) { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, shade(base, hi === undefined ? 0.22 : hi)); g.addColorStop(1, shade(base, lo === undefined ? -0.4 : lo)); return g; }
function metal(c, x0, x1, base) { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, shade(base, -0.35)); g.addColorStop(0.3, shade(base, 0.35)); g.addColorStop(0.42, shade(base, 0.7)); g.addColorStop(0.55, base); g.addColorStop(1, shade(base, -0.55)); return g; }
const OUT = 'rgba(18,14,10,0.55)';
const EDGE = 'rgba(15,12,8,0.35)';

// ---------------- noise ----------------
function makeNoise(seed, period) {
  const r = mkRng(seed); const V = new Float32Array(256 * 256); for (let i = 0; i < V.length; i++) V[i] = r();
  const P = period || 256;
  const at = (x, y) => V[((y % P + P) % P & 255) * 256 + ((x % P + P) % P & 255)];
  const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const fbm = (x, y, o) => { let s = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += vn(x * f, y * f) * amp; n += amp; amp *= 0.5; f *= 2; } return s / n; };
  return { vn, fbm };
}

// ---------------- textures (patterns for buildings) ----------------
const TEX = {};
function texStone(base, key, big) {
  const k = 'st' + base + key; if (TEX[k]) return TEX[k];
  const W = 128, H = 128, cv = mkCanvas(W, H), c = cv.getContext('2d'); const r = mkRng(base.length * 97 + (big ? 7 : 3));
  c.fillStyle = shade(base, -0.45); c.fillRect(0, 0, W, H);
  const bh = big ? 16 : 10;
  for (let y = 0; y < H; y += bh) {
    let x = -((y / bh) % 2) * 9;
    while (x < W) { const bw = (big ? 22 : 13) + r() * (big ? 16 : 12); const t = (r() - 0.5) * 0.28;
      const g = c.createLinearGradient(0, y, 0, y + bh); g.addColorStop(0, shade(base, 0.12 + t)); g.addColorStop(1, shade(base, -0.12 + t));
      c.fillStyle = g; rrect(c, x + 1, y + 1, bw - 2, bh - 2, 2, g);
      for (const xx of [x, x + W]) { if (xx !== x && x + bw < W) continue; rrect(c, xx - W + 1, y + 1, bw - 2, bh - 2, 2, g); }
      x += bw; }
  }
  const im = c.getImageData(0, 0, W, H), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  c.putImageData(im, 0, 0);
  return TEX[k] = cv;
}
function texTiles(base) {
  const k = 'ti' + base; if (TEX[k]) return TEX[k];
  const W = 64, H = 64, cv = mkCanvas(W, H), c = cv.getContext('2d'); const r = mkRng(base.charCodeAt(2) * 31);
  c.fillStyle = shade(base, -0.5); c.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 7) for (let x = -((y / 7) % 2) * 5; x < W + 10; x += 10) {
    const t = (r() - 0.5) * 0.25; const g = c.createLinearGradient(0, y, 0, y + 8); g.addColorStop(0, shade(base, -0.25 + t)); g.addColorStop(0.7, shade(base, 0.1 + t)); g.addColorStop(1, shade(base, -0.35));
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 9, y); c.lineTo(x + 9, y + 6); c.quadraticCurveTo(x + 4.5, y + 9, x, y + 6); c.closePath(); c.fillStyle = g; c.fill();
  }
  return TEX[k] = cv;
}
function texWood(base) {
  const k = 'wd' + base; if (TEX[k]) return TEX[k];
  const W = 64, H = 64, cv = mkCanvas(W, H), c = cv.getContext('2d'); const r = mkRng(base.charCodeAt(3) * 13);
  for (let x = 0; x < W; x += 8) { const t = (r() - 0.5) * 0.3; c.fillStyle = lg(c, x, x + 8, shade(base, t), -0.3, 0.12); c.fillRect(x, 0, 8, H); line(c, x, 0, x, H, shade(base, -0.6), 1);
    for (let k2 = 0; k2 < 4; k2++) { const gx = x + 2 + r() * 4; line(c, gx, r() * H, gx + (r() - 0.5), r() * H, shade(base, -0.25), 0.6); } }
  return TEX[k] = cv;
}
function texThatch(base) {
  const k = 'th' + base; if (TEX[k]) return TEX[k];
  const W = 64, H = 64, cv = mkCanvas(W, H), c = cv.getContext('2d'); const r = mkRng(77);
  c.fillStyle = shade(base, -0.3); c.fillRect(0, 0, W, H);
  for (let i = 0; i < 700; i++) { const x = r() * W, y = r() * H; line(c, x, y, x + (r() - 0.5) * 2, y + 5 + r() * 4, shade(base, (r() - 0.5) * 0.5), 0.9); }
  return TEX[k] = cv;
}
function pat(c, tex) { return c.createPattern(tex, 'repeat'); }
// film-grain + slight desaturation: takes the "vector cartoon" edge off sprites
function grit(cv, amt, desat) {
  const c = cv.getContext('2d'); let im; try { im = c.getImageData(0, 0, cv.width, cv.height); } catch (e) { return; }
  const d = im.data, r = mkRng(cv.width * 31 + cv.height * 7), k = desat === undefined ? 0.14 : desat;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const n = (r() - 0.5) * amt, l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    d[i] = d[i] + (l - d[i]) * k + n; d[i + 1] = d[i + 1] + (l - d[i + 1]) * k + n; d[i + 2] = d[i + 2] + (l - d[i + 2]) * k + n * 0.9;
  }
  c.putImageData(im, 0, 0);
}
function silhouette(spr) {
  if (spr.sil) return spr.sil;
  const cv = mkCanvas(spr.cv.width, spr.cv.height), c = cv.getContext('2d');
  c.drawImage(spr.cv, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = '#0a0c08'; c.fillRect(0, 0, cv.width, cv.height);
  return spr.sil = cv;
}
function deadSprite(spr) {
  if (spr.dead) return spr.dead;
  const cv = mkCanvas(spr.cv.width, spr.cv.height), c = cv.getContext('2d');
  c.drawImage(spr.cv, 0, 0); c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(28,22,16,0.5)'; c.fillRect(0, 0, cv.width, cv.height);
  return spr.dead = cv;
}

// ---------------- shadows ----------------
let SHADOW = null, PUFF = {};
function puff(kind) {
  if (PUFF[kind]) return PUFF[kind];
  const cv = mkCanvas(64, 64), c = cv.getContext('2d');
  const col = { smoke: '60,56,52', dust: '160,138,100', fire: '255,150,60', white: '255,245,220' }[kind];
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(' + col + ',1)'); g.addColorStop(0.4, 'rgba(' + col + ',0.55)'); g.addColorStop(1, 'rgba(' + col + ',0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64); return PUFF[kind] = cv;
}
function shadowSprite() {
  if (SHADOW) return SHADOW;
  const cv = mkCanvas(64, 32), c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 16, 0, 32, 16, 32); g.addColorStop(0, 'rgba(10,12,6,0.55)'); g.addColorStop(0.55, 'rgba(10,12,6,0.32)'); g.addColorStop(1, 'rgba(10,12,6,0)');
  c.save(); c.scale(1, 0.5); c.fillStyle = g; c.beginPath(); c.arc(32, 32, 32, 0, 7); c.fill(); c.restore();
  return SHADOW = cv;
}

// ================= SOLDIERS =================
const RACE_LOOK = {
  hum: { skin: '#d7a47f', steel: '#9ea6ad', cloth: '#6b5a44', leather: '#5b3f28', hair: '#4a3222', h: 1, w: 1 },
  elf: { skin: '#e8c4a2', steel: '#c8ad62', cloth: '#4b5d45', leather: '#6a5236', hair: '#e2d3a0', h: 1.07, w: 0.9 },
  dwf: { skin: '#c98f6b', steel: '#7f858b', cloth: '#6a3a2a', leather: '#4a3326', hair: '#8e4a22', h: 0.8, w: 1.2 },
  orc: { skin: '#5f6b45', steel: '#4d4a47', cloth: '#3b2f28', leather: '#3a2a1f', hair: '#1c1a17', h: 1, w: 1.12 },
};
function legPath(c, hx, hy, ang, len, col, w) {
  const kx = hx + Math.sin(ang) * len * 0.5, ky = hy + Math.cos(ang) * len * 0.5;
  const fx = kx + Math.sin(ang * 0.4) * len * 0.5, fy = ky + Math.cos(ang * 0.4) * len * 0.5;
  line(c, hx, hy, kx, ky, col, w); line(c, kx, ky, fx, fy, col, w * 0.9);
  return [fx, fy];
}
function drawShield(c, race, color, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const L = RACE_LOOK[race];
  if (race === 'hum') { // kite shield
    c.beginPath(); c.moveTo(-6, -9); c.quadraticCurveTo(0, -11, 6, -9); c.lineTo(5, 2); c.quadraticCurveTo(2, 9, 0, 13); c.quadraticCurveTo(-2, 9, -5, 2); c.closePath();
    c.fillStyle = lg(c, -6, 6, color, -0.45, 0.25); c.fill(); c.lineWidth = 1.3; c.strokeStyle = metal(c, -6, 6, '#b8bec4'); c.stroke();
    line(c, 0, -8, 0, 10, 'rgba(240,235,220,0.85)', 1.6); line(c, -4, -3, 4, -3, 'rgba(240,235,220,0.85)', 1.6);
  } else if (race === 'elf') {
    c.beginPath(); c.moveTo(0, -13); c.quadraticCurveTo(7, -4, 4, 8); c.quadraticCurveTo(0, 14, -4, 8); c.quadraticCurveTo(-7, -4, 0, -13); c.closePath();
    c.fillStyle = lg(c, -6, 6, color, -0.4, 0.3); c.fill(); c.lineWidth = 1.4; c.strokeStyle = metal(c, -6, 6, L.steel); c.stroke();
    c.beginPath(); c.moveTo(0, -8); c.quadraticCurveTo(3, 0, 0, 8); c.quadraticCurveTo(-3, 0, 0, -8); c.fillStyle = 'rgba(240,225,160,0.55)'; c.fill();
  } else if (race === 'dwf') {
    ell(c, 0, 0, 8, 8.5, lg(c, -8, 8, color, -0.45, 0.25)); c.lineWidth = 2; c.strokeStyle = metal(c, -8, 8, '#8d9399'); c.stroke();
    ell(c, 0, 0, 2.6, 2.6, metal(c, -3, 3, '#c9a24a'));
    for (let a = 0; a < 6.28; a += 0.8) ell(c, Math.cos(a) * 6.6, Math.sin(a) * 7, 0.7, 0.7, '#d8d0c0');
  } else {
    poly(c, [-6, -9, 6, -10, 7, 9, -5, 10], lg(c, -6, 7, '#5a4331', -0.45, 0.15));
    for (let k = -3; k <= 5; k += 4) line(c, k, -9.5, k + 0.5, 9.5, 'rgba(20,14,8,0.6)', 0.8);
    poly(c, [-4, -4, 4, -5, 5, 3, -3, 4], rgba(color, 0.75));
    line(c, -6, -2, 7, -3, '#3a3632', 1.4); line(c, -5, 6, 7, 5, '#3a3632', 1.4);
  }
  c.restore();
}
function drawHelmHead(c, race, x, y, L, opt) {
  // hair behind
  if (race === 'elf' && !opt.hood) { c.beginPath(); c.moveTo(x - 3.5, y - 2); c.quadraticCurveTo(x - 6, y + 6, x - 4.5, y + 11); c.lineTo(x - 1.5, y + 4); c.closePath(); c.fillStyle = vg(c, y - 3, y + 11, opt.hair || L.hair, -0.35, 0.2); c.fill(); }
  if (opt.hood) { c.beginPath(); c.arc(x - 0.3, y - 0.2, 4.9, Math.PI * 0.85, Math.PI * 2.15); c.lineTo(x + 3, y + 4); c.lineTo(x - 5, y + 5); c.closePath(); c.fillStyle = lg(c, x - 5, x + 5, opt.hood, -0.45, 0.2); c.fill(); }
  // face
  ell(c, x + 0.6, y + 0.3, 3.4, 3.8, lg(c, x - 3, x + 4, opt.skin || L.skin, -0.35, 0.2));
  ell(c, x + 2.3, y - 0.4, 0.45, 0.45, '#1b140f');
  if (opt.hood) return;
  if (race === 'hum' && !opt.bare) { c.beginPath(); c.arc(x, y - 0.8, 4.1, Math.PI * 1.02, Math.PI * 2.02); c.lineTo(x + 4, y + 0.6); c.lineTo(x - 4.2, y + 0.6); c.closePath(); c.fillStyle = metal(c, x - 4, x + 4, L.steel); c.fill(); line(c, x + 2.2, y - 1, x + 2.2, y + 2.4, shade(L.steel, -0.2), 1.1); }
  if (race === 'elf' && !opt.bare) { c.beginPath(); c.moveTo(x - 4, y); c.quadraticCurveTo(x - 3.5, y - 6, x + 0.5, y - 8.5); c.quadraticCurveTo(x + 4.5, y - 5, x + 4, y - 0.5); c.closePath(); c.fillStyle = metal(c, x - 4, x + 4, L.steel); c.fill(); line(c, x - 3, y - 4, x - 7, y - 6, shade(L.steel, 0.2), 1); }
  if (race === 'dwf') {
    c.beginPath(); c.moveTo(x - 2, y + 1.5); c.quadraticCurveTo(x - 4, y + 6, x - 1, y + 11); c.quadraticCurveTo(x + 2, y + 9, x + 4, y + 2); c.closePath(); c.fillStyle = vg(c, y, y + 11, opt.beard || L.hair, -0.35, 0.15); c.fill();
    if (!opt.bare) { c.beginPath(); c.arc(x, y - 0.8, 4.3, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = metal(c, x - 4, x + 4, L.steel); c.fill(); line(c, x - 4.3, y - 0.6, x + 4.3, y - 0.6, '#b08a3e', 1.2); }
  }
  if (race === 'orc') {
    ell(c, x + 2.6, y + 1.8, 0.6, 1.1, '#e2d8c0');
    if (!opt.bare) { c.beginPath(); c.moveTo(x - 4.4, y + 0.5); c.lineTo(x - 4, y - 3.5); c.lineTo(x - 1, y - 5); c.lineTo(x + 3.5, y - 3.8); c.lineTo(x + 4.2, y + 0); c.closePath(); c.fillStyle = metal(c, x - 4, x + 4, L.steel); c.fill(); line(c, x - 1, y - 5, x - 2, y - 9, '#5e5a55', 1.2); line(c, x + 1.8, y - 4.4, x + 2.5, y - 8, '#5e5a55', 1.2); }
  }
  if (opt.crown) { poly(c, [x - 3.6, y - 3.5, x - 3.6, y - 6.5, x - 1.8, y - 5, x, y - 7.2, x + 1.8, y - 5, x + 3.6, y - 6.5, x + 3.6, y - 3.5], metal(c, x - 4, x + 4, '#d4a73c')); }
  if (opt.winged) { poly(c, [x - 3, y - 3, x - 8, y - 9, x - 5, y - 3.5], '#e8e2d6'); poly(c, [x + 2, y - 3.5, x + 5, y - 10, x + 5, y - 3], '#e8e2d6'); }
  if (opt.crest) { c.beginPath(); c.moveTo(x - 4.5, y - 3); c.quadraticCurveTo(x, y - 11, x + 4.5, y - 4); c.quadraticCurveTo(x, y - 7, x - 4.5, y - 3); c.fillStyle = vg(c, y - 11, y - 3, '#a8261e', -0.4, 0.2); c.fill(); }
  if (opt.circlet) line(c, x - 3.4, y - 2.4, x + 3.6, y - 2.6, '#e0e6f0', 1.1);
}
function drawWeapon(c, kind, x, y, ang, L, glow) {
  c.save(); c.translate(x, y); c.rotate(ang);
  if (kind === 'sword' || kind === 'bigsword') { const len = kind === 'bigsword' ? 25 : 17; poly(c, [-1.1, 0, 1.1, 0, 0.7, -len, 0, -len - 2.5, -0.7, -len], metal(c, -1.2, 1.2, '#c8ced4')); line(c, -3.2, 0, 3.2, 0, kind === 'bigsword' ? '#d0a441' : '#6f6a60', 1.6); line(c, 0, 0, 0, 4, '#4a3020', 1.8); if (glow) { c.globalCompositeOperation = 'lighter'; line(c, 0, -2, 0, -len, 'rgba(160,200,255,0.35)', 3); c.globalCompositeOperation = 'source-over'; } }
  else if (kind === 'axe') { line(c, 0, 5, 0, -20, vg(c, -20, 5, '#7a5634'), 1.8); c.beginPath(); c.moveTo(0, -19); c.quadraticCurveTo(8, -22, 8.5, -13); c.quadraticCurveTo(6, -14, 0, -13); c.closePath(); c.fillStyle = metal(c, 0, 9, '#9aa1a8'); c.fill(); }
  else if (kind === 'cleaver') { line(c, 0, 4, 0, -6, '#3a2a1f', 2); poly(c, [-1.5, -6, 3.5, -7, 5, -21, -1, -20], metal(c, -2, 5, '#6d6863')); }
  else if (kind === 'spear' || kind === 'halberd') { line(c, 0, 12, 0, -34, vg(c, -34, 12, '#8a6440', -0.3, 0.15), 1.5); poly(c, [-1.4, -33, 0, -41, 1.4, -33, 0, -31], metal(c, -1.5, 1.5, '#cfd5da')); if (kind === 'halberd') { c.beginPath(); c.moveTo(0, -31); c.quadraticCurveTo(7, -33, 6.5, -24); c.lineTo(0, -26); c.closePath(); c.fillStyle = metal(c, 0, 7, '#9aa1a8'); c.fill(); } }
  else if (kind === 'hammer') { line(c, 0, 5, 0, -22, vg(c, -22, 5, '#6b4a2e'), 2.2); rrect(c, -6, -28, 12, 8, 1.5, metal(c, -6, 6, '#a8afb6')); line(c, -5, -24, 5, -24, '#c9a24a', 1); if (glow) { c.globalCompositeOperation = 'lighter'; ell(c, 0, -24, 9, 7, 'rgba(140,190,255,0.28)'); c.globalCompositeOperation = 'source-over'; } }
  else if (kind === 'staff') { line(c, 0, 14, 0, -28, vg(c, -28, 14, '#6b4a2e'), 1.7); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(0, -30, 0, 0, -30, 7); g.addColorStop(0, '#fff'); g.addColorStop(0.3, glow || '#9fd8ff'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, -30, 7, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; }
  else if (kind === 'banner') { line(c, 0, 14, 0, -34, vg(c, -34, 14, '#6b4a2e'), 1.6); c.beginPath(); c.moveTo(0.5, -33); c.quadraticCurveTo(8, -31, 14, -32); c.lineTo(13, -20); c.quadraticCurveTo(7, -19, 0.5, -21); c.closePath(); c.fillStyle = vg(c, -33, -20, '#f1ece0', -0.3, 0.1); c.fill(); ell(c, 7, -27, 1.6, 2, '#c9a24a'); }
  if (glow && (kind === 'axe' || kind === 'cleaver' || kind === 'spear' || kind === 'halberd')) { c.globalCompositeOperation = 'lighter'; line(c, 0.6, kind === 'spear' || kind === 'halberd' ? -31 : -12, 0.6, kind === 'spear' || kind === 'halberd' ? -40 : -20, 'rgba(255,225,170,0.55)', 1.6); c.globalCompositeOperation = 'source-over'; }
  if (kind === 'club') { c.beginPath(); c.moveTo(-1, 4); c.lineTo(1, 4); c.lineTo(2.6, -18); c.quadraticCurveTo(0, -22, -2.6, -18); c.closePath(); c.fillStyle = lg(c, -3, 3, '#5a3d24'); c.fill(); for (let k = 0; k < 3; k++) line(c, 1.8, -8 - k * 4, 4, -9 - k * 4, '#bbb', 0.8); }
  c.restore();
}
function drawBow(c, x, y, draw, L, race) {
  c.save(); c.translate(x, y);
  const pull = draw ? 6 : 0;
  c.beginPath(); c.moveTo(0, -13); c.quadraticCurveTo(5, -7, 4, 0); c.quadraticCurveTo(5, 7, 0, 13); c.lineWidth = 1.8; c.strokeStyle = race === 'elf' ? metal(c, 0, 5, '#c9a55a') : vg(c, -13, 13, '#6b4a2a'); c.stroke();
  c.beginPath(); c.moveTo(0, -13); c.lineTo(-pull, 0); c.lineTo(0, 13); c.lineWidth = 0.6; c.strokeStyle = 'rgba(235,230,215,0.9)'; c.stroke();
  if (draw) { line(c, -pull, 0, 12, 0, '#d9d0bd', 0.9); poly(c, [12, -1, 15, 0, 12, 1], '#aab0b6'); }
  c.restore();
}
function drawXbow(c, x, y, L) { c.save(); c.translate(x, y); line(c, -4, 0, 10, 0, vg(c, -2, 2, '#5b3f28'), 2.4); c.beginPath(); c.moveTo(8, -6); c.quadraticCurveTo(11, 0, 8, 6); c.lineWidth = 1.6; c.strokeStyle = metal(c, 7, 11, '#8a9096'); c.stroke(); line(c, 8, -6, 3, 0, '#ddd', 0.5); line(c, 8, 6, 3, 0, '#ddd', 0.5); c.restore(); }

// Draw a foot soldier. pose: {walk: -1..1 phase, atk: 0..1}
function drawSoldier(c, race, color, cfg, pose) {
  const L = RACE_LOOK[race] || RACE_LOOK.hum;
  const H = 38 * L.h * (cfg.scale || 1), W = L.w * (cfg.scale || 1);
  c.save(); c.scale(W, H / 38);
  const walk = pose.walk || 0, atk = pose.atk || 0;
  const hipY = -16, shY = -29, headY = -33.5;
  const legCol = cfg.legs || (race === 'dwf' ? '#7d8186' : race === 'orc' ? '#4a3a2c' : shade(L.leather, 0.15)), bootCol = shade(L.leather, -0.35);
  // cape (behind)
  if (cfg.cape) { c.beginPath(); c.moveTo(-2.5, shY + 1); c.quadraticCurveTo(-9 - walk * 2, -14, -10 - walk * 3, -1.5); c.lineTo(-2, -3); c.closePath(); c.fillStyle = lg(c, -10, 0, shade(cfg.cape, -0.15), -0.5, 0.1); c.fill(); }
  // quiver on back
  if (cfg.quiver) { c.save(); c.translate(-4, -24); c.rotate(-0.35); rrect(c, -1.8, -8, 3.6, 13, 1.2, lg(c, -2, 2, L.leather)); for (let k = 0; k < 3; k++) line(c, -1 + k, -8, -1.4 + k, -11, '#e6e0d0', 0.8); c.restore(); }
  // back leg
  const bl = legPath(c, -1.6, hipY, -walk * 0.45, 16, shade(legCol, -0.25), 4.6); ell(c, bl[0] + 1, bl[1] - 0.6, 2.4, 1.3, shade(bootCol, -0.2));
  // weapon arm behind body for spear/archers
  const armAng = cfg.weapon === 'spear' || cfg.weapon === 'halberd' ? -0.2 + atk * 1.0 : -0.9 + atk * 2.1;
  if (cfg.weapon && cfg.weapon !== 'bow' && cfg.weapon !== 'xbow' && cfg.weapon !== 'javelin') {
    const hx = 3.2 + Math.cos(-0.6 + atk * 0.9) * 6, hy = shY + 3 + Math.sin(0.4 + atk * 0.6) * 5;
    line(c, 3.5, shY + 1.5, hx, hy, shade(cfg.sleeve || L.cloth, -0.1), 3.6);
    drawWeapon(c, cfg.weapon, hx, hy, (cfg.weapon === 'spear' || cfg.weapon === 'halberd') ? 0.25 + atk * 1.05 : armAng + 0.9, L, cfg.glow);
  }
  // torso
  c.beginPath(); c.moveTo(-6, shY); c.quadraticCurveTo(0, shY - 2.4, 6, shY); c.lineTo(4.8, hipY + 1.5); c.lineTo(-4.8, hipY + 1.5); c.closePath();
  c.fillStyle = cfg.robe ? lg(c, -5, 5, cfg.robe, -0.5, 0.2) : metal(c, -5, 5, cfg.armor || L.steel); c.fill();
  if (!cfg.robe && cfg.mail !== false) { c.save(); c.clip(); c.fillStyle = 'rgba(0,0,0,0.12)'; for (let yy = shY; yy < hipY + 2; yy += 1.6) for (let xx = -5 + ((yy * 10 | 0) % 2) * 0.8; xx < 5; xx += 1.6) c.fillRect(xx, yy, 0.8, 0.8); c.restore(); }
  if (cfg.plate) { c.beginPath(); c.moveTo(-5, shY + 0.5); c.quadraticCurveTo(0, shY - 1.8, 5, shY + 0.5); c.lineTo(3.9, shY + 7.5); c.quadraticCurveTo(0, shY + 9.5, -3.9, shY + 7.5); c.closePath(); c.fillStyle = metal(c, -5, 5, cfg.armor || '#cfd6dc'); c.fill(); line(c, 0, shY, 0, shY + 8.5, 'rgba(255,255,255,0.35)', 0.6); }
  // tabard / sash in team color
  if (cfg.tabard !== false) { c.beginPath(); c.moveTo(-3.2, shY + 1); c.lineTo(3.2, shY + 1); c.lineTo(3.6, hipY + 5); c.lineTo(0, hipY + 7); c.lineTo(-3.6, hipY + 5); c.closePath(); c.fillStyle = lg(c, -3, 3, color, -0.45, 0.2); c.fill(); }
  if (cfg.robe) { c.beginPath(); c.moveTo(-3.9, hipY + 1); c.lineTo(3.9, hipY + 1); c.lineTo(5 + walk, -1); c.lineTo(-5 + walk, -1); c.closePath(); c.fillStyle = lg(c, -5, 5, cfg.robe, -0.5, 0.15); c.fill(); line(c, -2.5, shY + 2, 2.5, hipY + 1, rgba(color, 0.9), 1.6); }
  line(c, -4.9, hipY + 1.5, 4.9, hipY + 1.5, shade(L.leather, -0.2), 1.8);
  // front leg
  if (!cfg.robe) { const fl = legPath(c, 1.6, hipY, walk * 0.45, 16, legCol, 4.8); ell(c, fl[0] + 1.2, fl[1] - 0.6, 2.5, 1.4, bootCol); }
  // head
  c.save(); c.translate(0.4, headY); c.scale(1.15, 1.15); drawHelmHead(c, race, 0, 0, L, cfg); c.restore();
  // shoulders
  const pk = cfg.plate ? 1.3 : 1;
  ell(c, -4.4, shY + 1, 3 * pk, 2.5 * pk, metal(c, -7, -1, cfg.armor || L.steel)); ell(c, 4.4, shY + 1, 2.6 * pk, 2.2 * pk, metal(c, 2, 7, cfg.armor || L.steel));
  // shield (front)
  if (cfg.shield) drawShield(c, race, color, -3.2 + atk * 1.5, -21, cfg.shieldScale || 0.9);
  // ranged weapons in front
  if (cfg.weapon === 'bow') { line(c, 1, shY + 2, 7, -24, shade(L.cloth, -0.1), 2.4); drawBow(c, 8, -24, atk > 0.1, L, race); }
  if (cfg.weapon === 'xbow') { line(c, 1, shY + 2, 5, -23, shade(L.cloth, -0.1), 2.4); drawXbow(c, 3, -23, L); }
  if (cfg.weapon === 'javelin') { const a = -0.3 - atk * 1.2; line(c, 1, shY + 2, 3 + Math.cos(a) * 4, -26 + Math.sin(a) * 5, shade(L.cloth, -0.1), 2.4); c.save(); c.translate(4, -28 - atk * 4); c.rotate(0.9 - atk * 0.6); line(c, 0, 10, 0, -18, '#7a5634', 1.3); poly(c, [-1, -18, 0, -22, 1, -18], '#9aa0a6'); c.restore(); }
  c.restore();
}
function drawMount(c, race, color, pose, bodyCol) {
  const walk = pose.walk || 0;
  const body = bodyCol || { hum: '#5b3b25', elf: '#a8794a', dwf: '#3b2e28', orc: '#6a6660' }[race];
  const legs = (xs, len, w) => { xs.forEach((lx, i) => { const ph = (i % 2 ? 1 : -1) * walk * 0.5; const kx = lx + Math.sin(ph) * 5, ky = -len * 0.55; line(c, lx, -len, kx, ky, lg(c, lx - 2, lx + 2, body, -0.5, 0.1), w); line(c, kx, ky, kx + Math.sin(ph) * 2, 0, shade(body, -0.35), w * 0.8); ell(c, kx + Math.sin(ph) * 2 + 0.5, -0.5, w * 0.6, 1, '#1d1712'); }); };
  if (race === 'dwf') { // boar
    legs([-9, 9], 8, 3); legs([-6, 11], 8, 3);
    c.beginPath(); c.moveTo(-15, -11); c.quadraticCurveTo(-14, -24, 0, -24); c.quadraticCurveTo(12, -25, 16, -16); c.quadraticCurveTo(21, -12, 20, -8); c.quadraticCurveTo(8, -5, -12, -6); c.closePath(); c.fillStyle = vg(c, -25, -5, body, -0.5, 0.15); c.fill();
    for (let k = -12; k < 12; k += 2) line(c, k, -23 + Math.abs(k) * 0.05, k - 1, -26, shade(body, -0.4), 0.9);
    c.beginPath(); c.moveTo(19, -10); c.quadraticCurveTo(24, -12, 23, -16); c.strokeStyle = '#efe6d2'; c.lineWidth = 1.4; c.stroke(); ell(c, 21, -9, 2.2, 1.6, '#4a3a33');
    poly(c, [-6, -24, 6, -24, 7, -15, -7, -15], rgba(color, 0.9));
    return -22;
  }
  if (race === 'orc') { // warg
    legs([-11, 10], 12, 2.6); legs([-8, 13], 12, 2.6);
    c.beginPath(); c.moveTo(-16, -14); c.quadraticCurveTo(-8, -23, 4, -21); c.quadraticCurveTo(12, -22, 17, -24); c.lineTo(26, -20); c.lineTo(25, -17); c.lineTo(17, -16); c.quadraticCurveTo(8, -10, -12, -11); c.closePath(); c.fillStyle = vg(c, -26, -10, body, -0.55, 0.15); c.fill();
    poly(c, [16, -23, 18, -29, 20, -23], shade(body, -0.2)); ell(c, 21, -21, 0.7, 0.7, '#e6c33a');
    c.beginPath(); c.moveTo(-15, -14); c.quadraticCurveTo(-24, -18, -22, -8); c.lineWidth = 3; c.strokeStyle = shade(body, -0.2); c.stroke();
    for (let k = -12; k < 14; k += 2.2) line(c, k, -21, k - 1.2, -24, shade(body, -0.35), 0.8);
    if (color) poly(c, [-6, -22, 5, -21, 6, -15, -6, -15], rgba(color, 0.85));
    return -21;
  }
  // horse / deer
  const deer = race === 'elf';
  legs([-11, 11], deer ? 17 : 16, deer ? 2 : 2.8); legs([-8, 14], deer ? 17 : 16, deer ? 2 : 2.8);
  c.beginPath(); c.moveTo(-15, -18); c.quadraticCurveTo(-14, -27, -4, -27); c.quadraticCurveTo(8, -28, 13, -26); c.quadraticCurveTo(15, -32, 20, -40); c.quadraticCurveTo(23, -42, 27, -37); c.lineTo(28, -34); c.quadraticCurveTo(24, -33, 21, -31); c.quadraticCurveTo(18, -25, 15, -18); c.quadraticCurveTo(0, -14, -15, -18); c.closePath();
  c.fillStyle = vg(c, -42, -14, body, -0.5, 0.18); c.fill();
  ell(c, 24, -38, 0.7, 0.7, '#120d0a');
  if (!deer) { c.beginPath(); c.moveTo(13, -28); c.quadraticCurveTo(15, -36, 20, -41); c.lineWidth = 2; c.strokeStyle = '#1f1611'; c.stroke(); c.beginPath(); c.moveTo(-15, -22); c.quadraticCurveTo(-21, -18, -20, -8); c.lineWidth = 2.6; c.strokeStyle = '#1f1611'; c.stroke(); }
  else { line(c, 21, -40, 18, -50, '#e9dcc0', 1.1); line(c, 19, -46, 15, -49, '#e9dcc0', 0.9); line(c, 22, -40, 25, -50, '#e9dcc0', 1.1); line(c, 24, -46, 28, -48, '#e9dcc0', 0.9); ell(c, 2, -24, 1, 1, 'rgba(255,255,255,0.5)'); ell(c, -4, -22, 1, 1, 'rgba(255,255,255,0.5)'); }
  // caparison
  if (race === 'hum') { c.beginPath(); c.moveTo(-14, -26); c.lineTo(12, -27); c.lineTo(14, -14); c.quadraticCurveTo(0, -11, -14, -14); c.closePath(); c.fillStyle = vg(c, -27, -12, color, -0.45, 0.15); c.fill(); line(c, -14, -14, 14, -14, '#d8c47a', 1); rrect(c, 17, -42, 8, 5, 1.5, metal(c, 17, 25, '#9ea6ad')); }
  else poly(c, [-6, -27, 5, -27, 6, -19, -6, -19], rgba(color, 0.85));
  return -26;
}

const UNIT_CFG = {
  hum: { worker: { weapon: 'hammer', armor: '#8a7355', mail: false, bare: true, hair: '#5a3a22', tabard: false }, inf: { weapon: 'sword', shield: true }, spear: { weapon: 'spear', shield: true, shieldScale: 0.75 }, arch: { weapon: 'bow', quiver: true, armor: '#7a6a55', mail: false }, cav: { weapon: 'spear' } },
  elf: { worker: { weapon: 'hammer', armor: '#6d7a52', mail: false, bare: true, tabard: false }, inf: { weapon: 'sword', shield: true }, spear: { weapon: 'spear', shield: true, shieldScale: 0.75 }, arch: { weapon: 'bow', quiver: true, armor: '#5d6b4c', mail: false, bare: true }, cav: { weapon: 'spear', bare: true } },
  dwf: { worker: { weapon: 'hammer', armor: '#7a5a3a', mail: false, tabard: false }, inf: { weapon: 'axe', shield: true }, spear: { weapon: 'halberd' }, arch: { weapon: 'xbow' }, cav: { weapon: 'axe' } },
  orc: { worker: { weapon: 'club', armor: '#4a3e33', mail: false, bare: true, tabard: false }, inf: { weapon: 'cleaver', shield: true }, spear: { weapon: 'spear', shield: true, shieldScale: 0.75 }, arch: { weapon: 'javelin', mail: false, armor: '#4a3e33' }, cav: { weapon: 'cleaver' } },
};
const HERO_CFG = {
  hum_h1: { weapon: 'bigsword', shield: true, crown: true, cape: '#6d1f1f', armor: '#b4bcc4', glow: true, scale: 1.1 },
  hum_h2: { weapon: 'banner', bare: true, hair: '#6b3f22', armor: '#dfe3e8', cape: '#e8e4dc', scale: 1.02, tabard: true },
  elf_h1: { weapon: 'spear', shield: true, bare: true, hair: '#b0482a', armor: '#8a7a50', cape: '#2e5d3a', scale: 1.08 },
  elf_h2: { weapon: 'bow', quiver: true, bare: true, circlet: true, hair: '#e9e1c8', robe: '#d9d6c8', cape: '#9bb0c8', scale: 1.05 },
  dwf_h1: { weapon: 'hammer', winged: true, beard: '#b04a1e', armor: '#8d949b', cape: '#8a1c16', glow: true, scale: 1.18 },
  dwf_h2: { weapon: 'staff', glowCol: '#ffb86a', bare: true, hood: null, hair: '#f0c060', robe: '#7e5a8a', cape: '#d9c38a', scale: 1.02, beard: null },
  orc_h1: { weapon: 'spear', shield: true, crest: true, armor: '#b08a4a', skin: '#b98d6c', cape: '#7a1414', scale: 1.15 },
  orc_h2: { weapon: 'staff', glowCol: '#8dff9a', crown: true, bare: true, skin: '#c9c7b4', robe: '#1e1b22', cape: '#101014', scale: 1.1, tabard: false },
};
const FRAMES = 10; // 0 idle, 1-6 walk cycle, 7 wind-up, 8 strike, 9 follow-through
function framePose(i) { return i >= 1 && i <= 6 ? { walk: Math.sin((i - 1) / 6 * Math.PI * 2), atk: 0 } : i === 7 ? { walk: 0, atk: -0.45 } : i === 8 ? { walk: 0, atk: 1 } : i === 9 ? { walk: 0, atk: 0.55 } : { walk: 0, atk: 0 }; }
// upgrade bits that change how a soldier looks (forged blades, heavy armour)
function upLook(d, up) { return d.hero || d.creep || d.summon || d.worker ? 0 : (up | 0) & 3; }
const RACE2D = { und: 'orc', des: 'hum' };
const alias2D = d => RACE2D[d.race] && !d.creep && !d.summon ? (DEF[RACE2D[d.race] + d.key.slice(3)] || d) : d;
function unitSprite(d, color, frame, lo, up) {
  frame = frame | 0; d = alias2D(d);
  const uk = upLook(d, up);
  const key = d.key + color + frame + (lo ? 'L' : '') + uk;
  if (SPR.has(key)) return SPR.get(key);
  const S = lo ? 1.3 : 2.4, W = 72, H = 82;
  const cv = mkCanvas(W * S, H * S), c = cv.getContext('2d');
  c.scale(S, S); c.translate(W / 2 - 2, H - 6); c.lineJoin = 'round'; c.lineCap = 'round';
  const pose = framePose(frame);
  const race = d.race;
  if (d.creep) {
    if (d.sub === 'wolf') { c.save(); c.scale(0.95, 0.95); drawMount(c, 'orc', null, pose, '#6f675b'); c.restore(); }
    else if (d.sub === 'troll') { c.save(); c.scale(1.8, 1.8); drawSoldier(c, 'orc', '#5a4a3a', { weapon: 'club', skin: '#7b8270', armor: '#5a4d3d', mail: false, tabard: false, bare: true, legs: '#5b5347', sleeve: '#6f7462' }, pose); c.restore(); }
    else drawSoldier(c, 'hum', '#5a4a3a', { weapon: 'sword', hood: '#3d352b', armor: '#6a5a46', mail: false, tabard: false, cape: '#3a3128' }, pose);
  } else if (d.summon) {
    if (d.sub === 'treant') {
      c.scale(1.25, 1.25);
      const bark = '#5b4330';
      line(c, -4, 0, -3 + pose.walk * 2, -12, lg(c, -7, 0, bark), 5); line(c, 4, 0, 3 - pose.walk * 2, -12, lg(c, 0, 7, bark), 5);
      c.beginPath(); c.moveTo(-8, -10); c.quadraticCurveTo(-10, -26, -5, -38); c.lineTo(6, -38); c.quadraticCurveTo(10, -26, 8, -10); c.closePath(); c.fillStyle = lg(c, -9, 9, bark, -0.55, 0.2); c.fill();
      for (let k = -6; k < 7; k += 3) line(c, k, -12, k + 1, -36, 'rgba(20,14,8,0.35)', 0.8);
      line(c, -6, -30, -15 - pose.atk * 3, -40 + pose.atk * 10, lg(c, -15, -6, bark), 3.2); line(c, 6, -30, 15, -42, lg(c, 6, 15, bark), 3.2);
      const r = mkRng(5); for (let k = 0; k < 40; k++) { const a = r() * 6.28, rr = r() * 14; ell(c, Math.cos(a) * rr * 1.2, -44 + Math.sin(a) * rr * 0.7, 3 + r() * 3, 2.5 + r() * 2.5, mix('#2f5a2a', '#7aa84e', clamp(0.3 + (-Math.sin(a) * rr / 14) * 0.5 + r() * 0.3, 0, 1))); }
      c.globalCompositeOperation = 'lighter'; ell(c, -2, -32, 1.3, 1, '#b8ff7a'); ell(c, 3, -32, 1.3, 1, '#b8ff7a'); c.globalCompositeOperation = 'source-over';
    } else {
      c.globalAlpha = 0.92;
      drawSoldier(c, 'hum', '#3b4a5a', { weapon: 'sword', skin: '#b9c4c8', armor: '#5a6168', tabard: false, bare: true }, pose);
      c.globalCompositeOperation = 'lighter'; ell(c, 2.9, -34, 0.8, 0.6, '#7fe0ff'); c.globalCompositeOperation = 'source-over';
    }
  } else if (d.hero) {
    const cfg = Object.assign({ weapon: 'sword' }, HERO_CFG[d.key]);
    drawSoldier(c, race, color, cfg, pose);
  } else {
    const cfg = Object.assign({}, UNIT_CFG[race][d.sub]);
    if (uk & 2) { cfg.plate = true; cfg.armor = '#c3cad1'; }
    if (uk & 1) cfg.glow = true;
    if (d.sub === 'cav') {
      const top = drawMount(c, race, color, pose);
      c.save(); c.translate(-1, top + 13); c.scale(0.86, 0.86);
      drawSoldier(c, race, color, Object.assign(cfg, { shield: race === 'hum', shieldScale: 0.7 }), { walk: 0, atk: pose.atk });
      c.restore();
    } else drawSoldier(c, race, color, cfg, pose);
  }
  if (d.hero && HERO_CFG[d.key] && HERO_CFG[d.key].weapon === 'staff') {
    const gc = HERO_CFG[d.key].glowCol; if (gc) { c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(9, -48, 0, 9, -48, 8); g.addColorStop(0, rgba(gc, 0.8)); g.addColorStop(1, rgba(gc, 0)); c.fillStyle = g; c.beginPath(); c.arc(9, -48, 8, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; }
  }
  if (!lo) grit(cv, 16);
  const spr = { cv, w: W, h: H, ox: W / 2 - 2, oy: H - 6 };
  SPR.set(key, spr);
  return spr;
}

// ================= BUILDINGS =================
const RACE_ARCH = {
  hum: { stone: '#9a968c', roof: '#4c5866', wood: '#6b4c32', trim: '#d9d2c0', roofTex: 'tiles' },
  elf: { stone: '#d8d3c6', roof: '#4d7d64', wood: '#8a6a44', trim: '#d4b25a', roofTex: 'tiles' },
  dwf: { stone: '#6c6660', roof: '#7a3a2a', wood: '#4d3526', trim: '#c9953f', roofTex: 'tiles' },
  orc: { stone: '#4a423b', roof: '#3a2e25', wood: '#4f3a28', trim: '#8f2a1c', roofTex: 'thatch' },
};
const DX = 0.55, DY = -0.42;
function bldSprite(d, color) {
  d = alias2D(d);
  const key = d.key + color;
  if (SPR.has(key)) return SPR.get(key);
  const S = 2, r = d.r;
  const W = r * 3.3, H = r * 3.9;
  const cv = mkCanvas(W * S, H * S), c = cv.getContext('2d');
  const ox = W * 0.46, oy = H - r * 0.7;
  c.scale(S, S); c.translate(ox, oy); c.lineJoin = 'round';
  const A = RACE_ARCH[d.race], race = d.race;
  const stoneP = pat(c, texStone(A.stone, race, d.sub === 'fort'));
  const roofP = pat(c, A.roofTex === 'thatch' ? texThatch(A.roof) : texTiles(A.roof));
  const woodP = pat(c, texWood(A.wood));
  const shadeFace = (pts, a) => { poly(c, pts, 'rgba(10,8,6,' + a + ')'); };
  const litFace = (pts, x0, x1) => { const g = c.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(255,240,210,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0.12)'); poly(c, pts, g); };
  // box: x0 (left), w, h, depth, base y
  const box = (x0, w, h, dep, by, P, top) => {
    const fx = [x0, by, x0 + w, by, x0 + w, by - h, x0, by - h];
    const sx = [x0 + w, by, x0 + w + dep * DX, by + dep * DY, x0 + w + dep * DX, by + dep * DY - h, x0 + w, by - h];
    poly(c, sx, P || stoneP); shadeFace(sx, 0.38);
    poly(c, fx, P || stoneP); litFace(fx, x0, x0 + w);
    if (top) { const tp = [x0, by - h, x0 + w, by - h, x0 + w + dep * DX, by + dep * DY - h, x0 + dep * DX, by + dep * DY - h]; poly(c, tp, top); shadeFace(tp, 0.08); }
    line(c, x0, by, x0 + w, by, 'rgba(0,0,0,0.35)', 1.2);
  };
  const crenel = (x0, w, y, dep) => { for (let x = x0; x < x0 + w - 3; x += 6) { poly(c, [x, y, x + 3.5, y, x + 3.5, y - 4, x, y - 4], stoneP); shadeFace([x + 2.5, y, x + 3.5, y, x + 3.5, y - 4, x + 2.5, y - 4], 0.3); } };
  const gable = (x0, w, y, dep, rise, oh) => {
    const rl = [x0 + dep / 2 * DX, y + dep / 2 * DY - rise], rr = [x0 + w + dep / 2 * DX, y + dep / 2 * DY - rise];
    const tri = [x0 + w, y, x0 + w + dep * DX, y + dep * DY, rr[0], rr[1]];
    poly(c, tri, stoneP); shadeFace(tri, 0.3);
    const plane = [x0 - oh, y + 1.5, x0 + w + oh, y + 1.5, rr[0] + oh * 0.5, rr[1], rl[0] - oh * 0.5, rl[1]];
    poly(c, plane, roofP);
    const g = c.createLinearGradient(0, rl[1], 0, y); g.addColorStop(0, 'rgba(255,235,200,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); poly(c, plane, g);
    line(c, rl[0] - oh * 0.5, rl[1], rr[0] + oh * 0.5, rr[1], shade(A.roof, -0.5), 1.4);
  };
  const cyl = (x, by, rr, h, roof, P) => {
    rrect(c, x - rr, by - h, rr * 2, h, 0, P || stoneP);
    const g = c.createLinearGradient(x - rr, 0, x + rr, 0); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.3, 'rgba(255,240,210,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = g; c.fillRect(x - rr, by - h, rr * 2, h);
    ell(c, x, by, rr, rr * 0.35, null, 'rgba(0,0,0,0.3)', 1);
    if (roof === 'cone' || roof === 'spire') {
      const ht = roof === 'spire' ? rr * 3.4 : rr * 1.8;
      c.beginPath(); c.moveTo(x - rr - 2, by - h); c.quadraticCurveTo(x, by - h + rr * 0.45, x + rr + 2, by - h); c.lineTo(x, by - h - ht); c.closePath(); c.fillStyle = roofP; c.fill();
      const g2 = c.createLinearGradient(x - rr, 0, x + rr, 0); g2.addColorStop(0, 'rgba(255,235,200,0.2)'); g2.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = g2; c.fill();
    } else if (roof === 'flat') {
      ell(c, x, by - h, rr, rr * 0.35, shade(A.stone, -0.3));
      for (let a = Math.PI * 0.95; a <= Math.PI * 2.05; a += 0.5) { const cx = x + Math.cos(a) * rr * 0.92, cy = by - h + Math.sin(a) * rr * 0.32; rrect(c, cx - 1.8, cy - 4, 3.6, 4, 0.5, stoneP); }
      for (let a = 0.1; a < Math.PI; a += 0.5) { const cx = x + Math.cos(a) * rr * 0.92, cy = by - h + Math.sin(a) * rr * 0.32; rrect(c, cx - 1.8, cy - 4, 3.6, 4, 0.5, stoneP); shadeFace([cx - 1.8, cy, cx + 1.8, cy, cx + 1.8, cy - 4, cx - 1.8, cy - 4], 0.15); }
    }
  };
  const windowA = (x, y, w, h, lit) => { c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath(); c.fillStyle = lit ? '#e7a64b' : '#1b1511'; c.fill(); if (lit) { c.globalCompositeOperation = 'lighter'; ell(c, x + w / 2, y + h / 2, w * 1.4, h, 'rgba(255,170,70,0.18)'); c.globalCompositeOperation = 'source-over'; } };
  const door = (x, y, w, h) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h + w / 2); c.arc(x + w / 2, y - h + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y); c.closePath(); c.fillStyle = woodP; c.fill(); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = shade(A.stone, -0.4); c.stroke(); };
  const banner = (x, y, len) => {
    line(c, x, y, x, y - len, '#3a2c20', 1.4); ell(c, x, y - len, 1.2, 1.2, '#c9a24a');
    c.beginPath(); c.moveTo(x + 0.5, y - len + 2); c.quadraticCurveTo(x + 8, y - len + 0, x + 15, y - len + 3); c.lineTo(x + 14, y - len + 11); c.quadraticCurveTo(x + 7, y - len + 9, x + 0.5, y - len + 12); c.closePath();
    c.fillStyle = vg(c, y - len, y - len + 12, color, -0.45, 0.25); c.fill();
  };
  const hang = (x, y, w, h) => { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w, y + h); c.lineTo(x + w / 2, y + h - 3); c.lineTo(x, y + h); c.closePath(); c.fillStyle = lg(c, x, x + w, color, -0.45, 0.2); c.fill(); line(c, x - 1, y, x + w + 1, y, '#3a2c20', 1.2); ell(c, x + w / 2, y + h * 0.45, w * 0.22, w * 0.22, 'rgba(240,230,200,0.6)'); };
  const brazier = (x, y) => { line(c, x - 2, y, x, y - 7, '#2a2522', 1.2); line(c, x + 2, y, x, y - 7, '#2a2522', 1.2); ell(c, x, y - 7, 3, 1.2, '#2a2522'); c.globalCompositeOperation = 'lighter'; ell(c, x, y - 10, 2.4, 3.6, 'rgba(255,150,50,0.9)'); ell(c, x, y - 10, 6, 7, 'rgba(255,120,40,0.25)'); c.globalCompositeOperation = 'source-over'; };
  switch (d.sub) {
    case 'fort': {
      if (race === 'hum') {
        box(-r * 0.4, r * 0.8, r * 1.35, r * 0.55, -r * 0.42); gable(-r * 0.4, r * 0.8, -r * 0.42 - r * 1.35, r * 0.55, r * 0.5, 3);
        windowA(-r * 0.2, -r * 1.35, 5, 8, true); windowA(r * 0.12, -r * 1.35, 5, 8, false);
        box(-r * 0.95, r * 1.9, r * 0.62, r * 0.25, 0); crenel(-r * 0.95, r * 1.9, -r * 0.62, 0);
        door(-r * 0.14, 0, r * 0.28, r * 0.42);
        cyl(-r * 0.95, 4, r * 0.26, r * 1.02, 'cone'); cyl(r * 0.95, 4, r * 0.26, r * 1.02, 'cone');
        windowA(-r * 0.99, -r * 0.7, 3.5, 6, true); windowA(r * 0.91, -r * 0.7, 3.5, 6, false);
        hang(-r * 0.62, -r * 0.55, 8, 16); hang(r * 0.5, -r * 0.55, 8, 16);
        banner(-r * 0.95, -r * 1.02 - r * 0.47 + 4, 16); banner(r * 0.95, -r * 1.02 - r * 0.47 + 4, 16); banner(r * 0.12, -r * 2.3, 18);
      } else if (race === 'elf') {
        box(-r * 0.45, r * 0.9, r * 1.1, r * 0.5, -r * 0.35);
        c.beginPath(); c.moveTo(-r * 0.5, -r * 1.45); c.quadraticCurveTo(r * 0.05, -r * 2.3, r * 0.6, -r * 1.45); c.lineTo(r * 0.5 + r * 0.25, -r * 1.65); c.closePath(); c.fillStyle = roofP; c.fill(); const g = c.createLinearGradient(0, -r * 2.2, 0, -r * 1.45); g.addColorStop(0, 'rgba(255,245,210,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); c.fillStyle = g; c.fill();
        windowA(-r * 0.15, -r * 1.1, 6, 12, true);
        box(-r * 0.9, r * 1.8, r * 0.42, r * 0.2, 0, null, shade(A.stone, -0.1)); line(c, -r * 0.9, -r * 0.42, r * 0.9, -r * 0.42, A.trim, 1.5);
        door(-r * 0.13, 0, r * 0.26, r * 0.36);
        cyl(-r * 0.9, 4, r * 0.16, r * 1.5, 'spire'); cyl(r * 0.9, 4, r * 0.16, r * 1.5, 'spire'); cyl(r * 0.55, -r * 0.5, r * 0.12, r * 1.6, 'spire');
        banner(-r * 0.9, -r * 2.05, 14); banner(r * 0.9, -r * 2.05, 14);
      } else if (race === 'dwf') {
        c.beginPath(); c.moveTo(-r * 1.25, 0); c.lineTo(-r * 0.9, -r * 1.2); c.lineTo(-r * 0.3, -r * 1.75); c.lineTo(r * 0.35, -r * 1.55); c.lineTo(r * 0.95, -r * 1.9); c.lineTo(r * 1.35, -r * 0.8); c.lineTo(r * 1.4, 0); c.closePath();
        c.fillStyle = pat(c, texStone('#5d5853', 'mt', true)); c.fill(); const gm = c.createLinearGradient(-r, 0, r * 1.4, 0); gm.addColorStop(0, 'rgba(255,240,210,0.12)'); gm.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = gm; c.fill();
        box(-r * 0.6, r * 1.2, r * 0.95, r * 0.2, 0, null, shade(A.stone, -0.2));
        c.beginPath(); c.moveTo(-r * 0.25, 0); c.lineTo(-r * 0.25, -r * 0.5); c.lineTo(0, -r * 0.7); c.lineTo(r * 0.25, -r * 0.5); c.lineTo(r * 0.25, 0); c.closePath(); c.fillStyle = '#1a1411'; c.fill(); c.lineWidth = 2; c.strokeStyle = metal(c, -r * 0.25, r * 0.25, '#c9953f'); c.stroke();
        for (let k = 0; k < 5; k++) line(c, -r * 0.5 + k * r * 0.25, -r * 0.82, -r * 0.45 + k * r * 0.25, -r * 0.72, A.trim, 1.2);
        box(-r * 1.05, r * 0.4, r * 0.85, r * 0.3, 6); crenel(-r * 1.05, r * 0.4, 6 - r * 0.85, 0);
        box(r * 0.7, r * 0.4, r * 0.85, r * 0.3, 6); crenel(r * 0.7, r * 0.4, 6 - r * 0.85, 0);
        brazier(-r * 0.35, 2); brazier(r * 0.35, 2); hang(-r * 0.12, -r * 0.95, 8, 15);
        banner(-r * 0.85, 6 - r * 0.85 - 3, 14); banner(r * 0.9, 6 - r * 0.85 - 3, 14);
      } else {
        const blackP = pat(c, texStone('#34302d', 'orcb', true));
        box(-r * 0.35, r * 0.7, r * 1.7, r * 0.45, -r * 0.35, blackP);
        poly(c, [-r * 0.42, -r * 2.05, -r * 0.35, -r * 2.5, -r * 0.2, -r * 2.05], '#3a3632'); poly(c, [r * 0.28, -r * 2.05, r * 0.4, -r * 2.55, r * 0.45, -r * 2.05], '#3a3632');
        c.globalCompositeOperation = 'lighter'; ell(c, 0, -r * 1.6, 4, 7, 'rgba(255,90,30,0.9)'); ell(c, 0, -r * 1.6, 12, 16, 'rgba(255,70,20,0.25)'); c.globalCompositeOperation = 'source-over';
        const logs = []; for (let k = -1.15; k <= 1.2; k += 0.13) logs.push(k);
        for (const k of logs) { const x = k * r, h = r * (0.75 + Math.abs(Math.sin(k * 7)) * 0.2), by = Math.abs(k) * r * 0.12;
          c.beginPath(); c.moveTo(x - 4, by); c.lineTo(x - 4, by - h); c.lineTo(x, by - h - 7); c.lineTo(x + 4, by - h); c.lineTo(x + 4, by); c.closePath(); c.fillStyle = lg(c, x - 4, x + 4, '#5a4330', -0.55, 0.15); c.fill(); }
        door(-r * 0.15, 0, r * 0.3, r * 0.5); brazier(-r * 0.35, 3); brazier(r * 0.35, 3);
        hang(-r * 0.8, -r * 0.6, 9, 18); hang(r * 0.6, -r * 0.6, 9, 18); banner(0, -r * 2.5, 18);
      }
      break;
    }
    case 'farm': {
      if (race === 'hum' || race === 'orc') {
        if (race === 'hum') { c.save(); c.beginPath(); c.moveTo(-r * 1.2, r * 0.25); c.lineTo(r * 0.25, r * 0.25); c.lineTo(r * 0.25 + r * 0.9 * DX, r * 0.25 + r * 0.9 * DY - 6); c.lineTo(-r * 1.2 + r * 0.9 * DX, r * 0.25 + r * 0.9 * DY - 6); c.closePath(); c.fillStyle = '#8b7a3c'; c.fill(); c.clip();
          const rr2 = mkRng(9); for (let k = 0; k < 260; k++) { const x = -r * 1.2 + rr2() * r * 1.9, y = r * 0.3 - rr2() * r * 0.75; line(c, x, y, x + 0.6, y - 4, rr2() < 0.5 ? '#d7b852' : '#b99a3a', 0.8); } c.restore(); }
        else { for (let k = 0; k < 4; k++) { const x = -r * 1 + k * 9; line(c, x, 2, x, -20, '#4a3524', 1.5); line(c, x, -16, x + 5, -16, '#4a3524', 1); } poly(c, [-r * 1.05, -18, -r * 0.7, -18, -r * 0.72, -8, -r * 1.03, -8], '#7a5a3e'); ell(c, -r * 0.6, 4, 8, 3, '#d8cfbf'); ell(c, -r * 0.5, 2, 4, 1.8, '#e6dfd0'); }
        box(-r * 0.1, r * 0.75, r * 0.6, r * 0.55, 0, race === 'hum' ? pat(c, texWood('#8a6a48')) : woodP);
        gable(-r * 0.1, r * 0.75, -r * 0.6, r * 0.55, r * 0.45, 3);
        door(r * 0.15, 0, 7, 11); windowA(r * 0.42, -r * 0.4, 4, 5, race === 'hum');
        banner(r * 0.72, -r * 0.2, 16);
      } else if (race === 'elf') {
        for (let k = 0; k < 3; k++) { const y = r * 0.2 - k * 9; ell(c, -r * 0.45 + k * 4, y, r * 0.6, 5, '#34512e'); const rr2 = mkRng(k + 3); for (let j = 0; j < 12; j++) { c.globalCompositeOperation = 'lighter'; ell(c, -r * 0.95 + k * 4 + rr2() * r * 1.1, y - 1 + (rr2() - 0.5) * 5, 1.6, 1.6, 'rgba(190,240,255,0.8)'); c.globalCompositeOperation = 'source-over'; } }
        cyl(r * 0.55, 0, r * 0.3, r * 0.55, 'spire'); line(c, r * 0.3, -r * 0.55, r * 0.8, -r * 0.55, A.trim, 1.2); banner(r * 0.55, -r * 1.55, 12);
      } else {
        c.beginPath(); c.moveTo(-r * 1.2, 2); c.quadraticCurveTo(-r * 0.9, -r * 1.3, 0, -r * 1.45); c.quadraticCurveTo(r * 1.0, -r * 1.3, r * 1.25, 2); c.closePath(); c.fillStyle = pat(c, texStone('#5d5853', 'mt', true)); c.fill(); const gm = c.createLinearGradient(-r, 0, r, 0); gm.addColorStop(0, 'rgba(255,240,210,0.12)'); gm.addColorStop(1, 'rgba(0,0,0,0.45)'); c.fillStyle = gm; c.fill();
        c.beginPath(); c.moveTo(-r * 0.35, 2); c.lineTo(-r * 0.35, -r * 0.55); c.lineTo(r * 0.35, -r * 0.55); c.lineTo(r * 0.35, 2); c.closePath(); c.fillStyle = '#120e0b'; c.fill();
        line(c, -r * 0.4, 2, -r * 0.4, -r * 0.6, '#5a3f28', 3); line(c, r * 0.4, 2, r * 0.4, -r * 0.6, '#5a3f28', 3); line(c, -r * 0.45, -r * 0.6, r * 0.45, -r * 0.6, '#5a3f28', 3);
        line(c, -r * 0.1, 2, -r * 0.1, r * 0.4, '#666', 1); line(c, r * 0.1, 2, r * 0.1, r * 0.4, '#666', 1);
        rrect(c, r * 0.5, -6, 12, 7, 1, woodP); ell(c, r * 0.5 + 6, -7, 5, 2, '#d4a73c');
        c.globalCompositeOperation = 'lighter'; ell(c, 0, -r * 0.2, 6, 5, 'rgba(255,160,60,0.35)'); c.globalCompositeOperation = 'source-over';
        banner(-r * 0.7, -r * 0.3, 14);
      }
      break;
    }
    case 'barr': case 'range': case 'stable': {
      const P = race === 'orc' ? woodP : stoneP;
      box(-r * 0.95, r * 1.7, r * 0.72, r * 0.62, 0, P);
      if (race === 'dwf') { const tp = [-r * 0.95, -r * 0.72, r * 0.75, -r * 0.72, r * 0.75 + r * 0.62 * DX, -r * 0.72 + r * 0.62 * DY, -r * 0.95 + r * 0.62 * DX, -r * 0.72 + r * 0.62 * DY]; poly(c, tp, shade(A.stone, -0.25)); crenel(-r * 0.95, r * 1.7, -r * 0.72, 0); }
      else gable(-r * 0.95, r * 1.7, -r * 0.72, r * 0.62, r * (race === 'elf' ? 0.7 : 0.55), 4);
      door(-r * 0.15, 0, r * 0.32, r * 0.5);
      windowA(-r * 0.7, -r * 0.55, 4, 7, true); windowA(r * 0.4, -r * 0.55, 4, 7, false);
      if (d.sub === 'barr') { for (let k = 0; k < 3; k++) { const x = r * 0.95 + 6 + k * 5; line(c, x, 4, x + 1, -16, '#6b4a2e', 1.2); poly(c, [x, -16, x + 1.3, -21, x + 2, -16], '#b8c0c8'); } line(c, r * 0.95 + 4, -6, r * 0.95 + 18, -6, '#4a3524', 1.5); }
      if (d.sub === 'range') { for (let k = 0; k < 2; k++) { const x = -r * 1.25 + k * 14, y = 4 + k * 2; line(c, x, y, x, y - 12, '#5a3f28', 1.2); ell(c, x, y - 15, 5, 5.5, '#e2d7bd'); ell(c, x, y - 15, 3.3, 3.6, '#b53a2a'); ell(c, x, y - 15, 1.4, 1.5, '#e2d7bd'); } }
      if (d.sub === 'stable') { for (let k = 0; k < 4; k++) line(c, r * 0.95 + 4 + k * 6, 6, r * 0.95 + 4 + k * 6, -5, '#6b4a2e', 1.4); line(c, r * 0.95 + 3, -3, r * 0.95 + 24, -3, '#6b4a2e', 1.4); ell(c, -r * 1.2, 2, 7, 4, '#c9a646'); ell(c, -r * 1.15, -1, 5, 3, '#d8b85a'); }
      hang(-r * 0.5, -r * 0.62, 7, 13); banner(r * 0.35, -r * 1.35, 14);
      break;
    }
    case 'forge': {
      const P = race === 'orc' ? woodP : stoneP;
      box(r * 0.2, r * 0.3, r * 1.55, r * 0.22, -r * 0.25, stoneP);
      box(-r * 0.9, r * 1.35, r * 0.72, r * 0.6, 0, P);
      if (race === 'dwf') { const tp = [-r * 0.9, -r * 0.72, r * 0.45, -r * 0.72, r * 0.45 + r * 0.6 * DX, -r * 0.72 + r * 0.6 * DY, -r * 0.9 + r * 0.6 * DX, -r * 0.72 + r * 0.6 * DY]; poly(c, tp, shade(A.stone, -0.25)); crenel(-r * 0.9, r * 1.35, -r * 0.72, 0); }
      else gable(-r * 0.9, r * 1.35, -r * 0.72, r * 0.6, r * 0.45, 3);
      c.beginPath(); c.moveTo(-r * 0.45, 0); c.lineTo(-r * 0.45, -r * 0.34); c.arc(-r * 0.25, -r * 0.34, r * 0.2, Math.PI, 0); c.lineTo(-r * 0.05, 0); c.closePath(); c.fillStyle = '#2a1508'; c.fill();
      c.globalCompositeOperation = 'lighter'; ell(c, -r * 0.25, -r * 0.2, r * 0.16, r * 0.2, 'rgba(255,130,40,0.9)'); ell(c, -r * 0.25, -r * 0.2, r * 0.5, r * 0.45, 'rgba(255,110,30,0.22)'); c.globalCompositeOperation = 'source-over';
      poly(c, [r * 0.55, 2, r * 0.95, 2, r * 0.9, -4, r * 1.05, -8, r * 0.45, -8, r * 0.6, -4], metal(c, r * 0.45, r * 1.05, '#4a4d52'));
      line(c, r * 0.7, -9, r * 0.9, -16, '#5a3f28', 1.4); rrect(c, r * 0.84, -19, 6, 3, 0.8, '#8a9096');
      rrect(c, -r * 1.25, -10, 9, 12, 2, woodP); line(c, -r * 1.25, -6, -r * 1.25 + 9, -6, '#2f2a26', 1);
      banner(r * 0.2, -r * 1.35, 12);
      break;
    }
    case 'tower': {
      if (race === 'hum') { cyl(0, 0, r * 0.72, r * 2.3, 'cone'); windowA(-3, -r * 1.7, 5, 8, true); windowA(-3, -r * 0.9, 5, 8, false); banner(0, -r * 2.3 - r * 1.3, 14); }
      else if (race === 'elf') { cyl(0, 0, r * 0.5, r * 2.9, 'spire'); line(c, -r * 0.5, -r * 2.2, r * 0.5, -r * 2.2, A.trim, 1.5); windowA(-2.5, -r * 1.9, 5, 9, true); banner(0, -r * 2.9 - r * 1.7, 12); }
      else if (race === 'dwf') { box(-r * 0.75, r * 1.5, r * 1.9, r * 0.8, 0, null, shade(A.stone, -0.25)); crenel(-r * 0.75, r * 1.5, -r * 1.9, 0); windowA(-3, -r * 1.3, 6, 6, true); brazier(r * 0.2, -r * 1.9 + 2); banner(-r * 0.5, -r * 1.9 - 3, 13); }
      else { for (const x of [-r * 0.6, r * 0.6]) line(c, x, 0, x * 0.7, -r * 2.1, '#4a3524', 3); line(c, -r * 0.6, -r * 0.8, r * 0.6, -r * 1.4, '#4a3524', 2); line(c, r * 0.6, -r * 0.8, -r * 0.6, -r * 1.4, '#4a3524', 2);
        box(-r * 0.7, r * 1.4, r * 0.7, r * 0.8, -r * 2.0, woodP); gable(-r * 0.7, r * 1.4, -r * 2.7, r * 0.8, r * 0.6, 3); brazier(0, -r * 2.0); banner(r * 0.5, -r * 3.4, 12); }
      break;
    }
  }
  grit(cv, 12, 0.1);
  const spr = { cv, w: W, h: H, ox, oy };
  SPR.set(key, spr);
  return spr;
}

// ================= NATURE =================
function treeSprite(v) {
  const key = 'tree' + v; if (SPR.has(key)) return SPR.get(key);
  const S = 2, W = 90, H = 120;
  const cv = mkCanvas(W * S, H * S), c = cv.getContext('2d'); c.scale(S, S); c.translate(W / 2, H - 8);
  const r = mkRng(v * 131 + 7);
  const conifer = v === 0 || v === 3 || v === 8 || v === 9, snowy = v === 8 || v === 9;
  if (conifer) {
    line(c, 0, 0, 0, -30, lg(c, -3, 3, '#4a3424'), 4.5);
    const tiers = 6, dark = snowy ? '#10241a' : '#12281c', lite = snowy ? '#3e6348' : v === 3 ? '#5e7f48' : '#4e7a4a';
    for (let t = 0; t < tiers; t++) {
      const y = -14 - t * 13, w = 26 - t * 3.6;
      for (let k = 0; k < 80; k++) {
        const fx = (r() * 2 - 1), x = fx * w, yy = y - r() * 14 + Math.abs(fx) * 6;
        const light = clamp(0.45 - fx * 0.35 + (t / tiers) * 0.25 + (r() - 0.5) * 0.3, 0, 1);
        line(c, x * 0.3, yy - 8, x, yy, mix(dark, lite, light), 1.8);
      }
      if (snowy) for (let k = 0; k < 26; k++) { const fx = r() * 2 - 1, x = fx * w * 0.9, yy = y - 9 - r() * 5 + Math.abs(fx) * 5; line(c, x * 0.4, yy - 3, x, yy, mix('#c9d4de', '#ffffff', clamp(0.6 - fx * 0.4, 0, 1)), 1.6); }
    }
  } else if (v === 10) {
    const trunk = '#4b4038';
    c.beginPath(); c.moveTo(-3, 0); c.quadraticCurveTo(-2, -24, -1.2, -44); c.lineTo(1.2, -44); c.quadraticCurveTo(2, -24, 3, 0); c.closePath(); c.fillStyle = lg(c, -4, 4, trunk, -0.5, 0.2); c.fill();
    const br = (x, y, a, l, w, n) => { const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; line(c, x, y, x2, y2, trunk, w); if (n > 0) { br(x2, y2, a - 0.45 - r() * 0.3, l * 0.68, w * 0.65, n - 1); br(x2, y2, a + 0.4 + r() * 0.3, l * 0.66, w * 0.65, n - 1); } };
    br(0, -30, -Math.PI / 2 - 0.5, 16, 2, 3); br(0, -36, -Math.PI / 2 + 0.45, 15, 2, 3); br(0, -44, -Math.PI / 2, 12, 1.6, 3);
    for (let k = 0; k < 16; k++) { const x = (r() - 0.5) * 40, y = -40 - r() * 30; line(c, x - 2, y, x + 2, y, 'rgba(236,240,246,0.8)', 1.2); }
  } else {
    const autumn = v === 6 || v === 7;
    const trunk = v % 3 === 1 ? '#4d3a2b' : '#6e6558';
    c.beginPath(); c.moveTo(-3.5, 0); c.quadraticCurveTo(-2, -20, -1.5, -34); c.lineTo(1.5, -34); c.quadraticCurveTo(2, -20, 3.5, 0); c.closePath(); c.fillStyle = lg(c, -4, 4, trunk, -0.5, 0.2); c.fill();
    line(c, -1, -26, -9, -40, lg(c, -9, -1, trunk), 2); line(c, 1, -30, 9, -44, lg(c, 1, 9, trunk), 2);
    const base = autumn ? (v === 6 ? ['#5a2410', '#e0913a'] : ['#4a3510', '#d8b44a']) : v % 3 === 1 ? ['#1d3a1c', '#6e9a45'] : ['#27401f', '#8aa650'];
    const cx = 0, cy = -56, rx = 30, ry = 26;
    const blobs = [];
    for (let k = 0; k < 170; k++) { const a = r() * 6.283, d = Math.sqrt(r()); blobs.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, rr: 2.5 + r() * 4.5 }); }
    blobs.sort((a, b) => a.y - b.y);
    ell(c, cx, cy + 3, rx * 0.95, ry * 0.9, base[0]);
    for (const b of blobs) {
      const light = clamp(0.5 - (b.x - cx) / rx * 0.3 - (b.y - cy) / ry * 0.35 + (r() - 0.5) * 0.25, 0, 1);
      ell(c, b.x, b.y, b.rr, b.rr * 0.85, mix(base[0], base[1], light));
    }
    for (let k = 0; k < 30; k++) { const a = r() * 6.283, d = r(); ell(c, cx - 8 + Math.cos(a) * rx * 0.5 * d, cy - 10 + Math.sin(a) * ry * 0.4 * d, 1.6, 1.3, rgba(autumn ? '#ffd890' : '#c8d88a', 0.35)); }
  }
  grit(cv, 14, 0.08);
  const spr = { cv, w: W, h: H, ox: W / 2, oy: H - 8 }; SPR.set(key, spr); return spr;
}
function rockSprite(v) {
  const key = 'rock' + v; if (SPR.has(key)) return SPR.get(key);
  const S = 2, W = v >= 2 ? 96 : 50, H = v >= 2 ? 64 : 38;
  const cv = mkCanvas(W * S, H * S), c = cv.getContext('2d'); c.scale(S, S); c.translate(W / 2, H - 6);
  const col = v % 2 ? '#7d766c' : '#6e7174';
  if (v >= 2) c.scale(1.9, 1.6);
  poly(c, [-17, 0, -14, -12, -5, -20, 7, -18, 16, -7, 14, 1], lg(c, -17, 16, col, -0.5, 0.25));
  poly(c, [-10, -12, -5, -19, 6, -16, 1, -10], rgba('#ffffff', 0.12));
  line(c, -3, -14, 2, -4, 'rgba(0,0,0,0.3)', 0.8);
  ell(c, -10, -3, 5, 2.2, rgba('#5f7a3a', 0.7)); ell(c, 8, -1, 4, 1.8, rgba('#5f7a3a', 0.6));
  grit(cv, 18, 0);
  const spr = { cv, w: W, h: H, ox: W / 2, oy: H - 6 }; SPR.set(key, spr); return spr;
}
function tuftSprite(v) {
  const key = 'tuft' + v; if (SPR.has(key)) return SPR.get(key);
  const S = 2, W = 20, H = 16, cv = mkCanvas(W * S, H * S), c = cv.getContext('2d'); c.scale(S, S); c.translate(W / 2, H - 2);
  const r = mkRng(v * 17 + 3);
  if (v < 4) { for (let k = 0; k < 14; k++) { const x = (r() - 0.5) * 10; line(c, x, 0, x + (r() - 0.5) * 6, -5 - r() * 8, mix('#2e4a1c', '#8ea456', r()), 0.9); } }
  else if (v < 6) { ell(c, 0, -1, 3.5, 2.2, lg(c, -3, 3, '#8a847a')); ell(c, 4, 0, 2, 1.3, lg(c, 2, 6, '#7a756c')); }
  else if (v < 8) { for (let k = 0; k < 8; k++) { const x = (r() - 0.5) * 10; line(c, x, 0, x, -4 - r() * 4, '#4c6a2e', 0.7); ell(c, x, -5 - r() * 4, 1, 1, v === 6 ? '#e8e2f2' : '#e2c14a'); } }
  else if (v === 8) { for (let k = 0; k < 11; k++) { const x = (r() - 0.5) * 11, h = 7 + r() * 7; line(c, x, 0, x + (r() - 0.5) * 3, -h, mix('#4a5a2a', '#9aa060', r()), 0.9); if (r() < 0.35) ell(c, x, -h + 1.5, 0.9, 2.2, '#5a3d24'); } }
  else { for (let k = 0; k < 10; k++) { const x = (r() - 0.5) * 10; line(c, x, 0, x + (r() - 0.5) * 5, -4 - r() * 7, mix('#6e5a3a', '#c2a870', r()), 0.8); } }
  const spr = { cv, w: W, h: H, ox: W / 2, oy: H - 2 }; SPR.set(key, spr); return spr;
}

// ================= TERRAIN =================
const PAL = {
  meadow:   { G1: [54, 70, 36], G2: [104, 118, 60], DRY: [146, 136, 88], ROCK: [118, 114, 106], FOR: [34, 48, 26], DIRT: [118, 98, 68], DIRT2: [90, 74, 52], MUD: [98, 86, 62], SAND: [150, 138, 104], SHAL: [88, 108, 90], DEEP: [30, 54, 64], WETG: [48, 66, 34] },
  highland: { G1: [68, 74, 42], G2: [120, 118, 72], DRY: [156, 142, 100], ROCK: [128, 122, 112], FOR: [40, 48, 28], DIRT: [124, 106, 78], DIRT2: [96, 82, 60], MUD: [100, 90, 70], SAND: [148, 138, 108], SHAL: [88, 108, 96], DEEP: [34, 58, 66], WETG: [58, 70, 40] },
  snow:     { G1: [196, 205, 216], G2: [238, 241, 246], DRY: [214, 218, 224], ROCK: [104, 102, 106], FOR: [168, 176, 188], DIRT: [170, 164, 156], DIRT2: [146, 140, 134], MUD: [160, 162, 168], SAND: [196, 200, 206], SHAL: [196, 218, 230], DEEP: [132, 168, 192], WETG: [196, 204, 214] },
};
function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
// low-res colour map (lighting, biomes, roads, water) + material masks used to lay detail textures on top
function buildTerrain(M) {
  const seed = M.seed, P = PAL[M.biome], snow = M.biome === 'snow';
  const sc = 0.5, W = Math.round(MAP_W * sc), H = Math.round(MAP_H * sc);
  const mask = mkCanvas(W, H), m = mask.getContext('2d');
  m.lineCap = 'round'; m.lineJoin = 'round';
  for (const [w, a] of [[34, 0.16], [25, 0.3], [17, 0.45], [11, 0.62]]) { m.strokeStyle = 'rgba(255,0,0,' + a + ')'; m.lineWidth = w; for (const rd of M.roads) { m.beginPath(); rd.forEach((p, i) => i ? m.lineTo(p[0] * sc, p[1] * sc) : m.moveTo(p[0] * sc, p[1] * sc)); m.stroke(); } }
  m.globalCompositeOperation = 'lighter';
  const blob = (x, y, R, col) => { const g = m.createRadialGradient(x * sc, y * sc, 0, x * sc, y * sc, R); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); m.fillStyle = g; m.beginPath(); m.arc(x * sc, y * sc, R, 0, 7); m.fill(); };
  for (const s of START_POS) blob(s[0], s[1], 150, 'rgba(0,255,0,0.55)');
  for (const o of M.outposts) blob(o[0], o[1], 70, 'rgba(0,255,0,0.5)');
  for (const o of M.camps) blob(o[0], o[1], 55, 'rgba(0,255,0,0.45)');
  for (const t of M.trees) blob(t.x, t.y, 24, 'rgba(0,0,255,0.28)');
  m.globalCompositeOperation = 'source-over';
  const md = m.getImageData(0, 0, W, H).data;
  const N = makeNoise(seed * 3 + 11), N2 = makeNoise(seed * 5 + 29);
  const Q = 4, GW = Math.ceil(W / Q) + 2, GH = Math.ceil(H / Q) + 2;
  const hg = new Float32Array(GW * GH), mg = new Float32Array(GW * GH), wg = new Float32Array(GW * GH), cg = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { const i = y * GW + x, wx = x * Q / sc, wy = y * Q / sc; hg[i] = N.fbm(x * Q / 120, y * Q / 120, 5); mg[i] = N2.fbm(x * Q / 80, y * Q / 80, 4); wg[i] = M.wdAt(wx, wy); cg[i] = M.clAt(wx, wy); }
  const bil = (A, x, y) => { const gx = x / Q, gy = y / Q, xi = gx | 0, yi = gy | 0, fx = gx - xi, fy = gy - yi, i = yi * GW + xi; return A[i] * (1 - fx) * (1 - fy) + A[i + 1] * fx * (1 - fy) + A[i + GW] * (1 - fx) * fy + A[i + GW + 1] * fx * fy; };
  const hgt = new Float32Array(W * H), wat = new Float32Array(W * H), clf = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, w = bil(wg, x, y), c2 = bil(cg, x, y);
    wat[i] = w; clf[i] = c2;
    let mtn = 0;
    if (c2 < 0) { const inner = Math.min(1, -c2 / 60), ridge = 1 - Math.abs(2 * N2.fbm(x / 18, y / 18, 3) - 1); mtn = Math.pow(Math.min(1, -c2 / 170), 0.75) * 1.3 + ridge * inner * 0.45; }
    else if (c2 < 25) mtn = (25 - c2) / 25 * 0.04;
    hgt[i] = bil(hg, x, y) - (w < 40 ? (40 - w) * 0.003 : 0) + mtn;
  }
  const QW = Math.ceil(W / 2), QH = Math.ceil(H / 2);
  const mk = () => { const cv = mkCanvas(QW, QH); return { cv, img: cv.getContext('2d').createImageData(QW, QH) }; };
  const MG = mk(), MD = mk(), MR = mk(), MW = mk();
  const cv = mkCanvas(W, H), c = cv.getContext('2d');
  const img = c.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, p = i * 4;
    const fine = N2.vn(x / 3.1, y / 3.1), fine2 = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997 / 997;
    const w = wat[i], c2 = clf[i];
    let R_, Gc, B, mW = 0, mR = 0, mD = 0, wr = 0, wg2 = 0, wb = 0;
    if (w < 2) {
      const t = clamp(-w / 34, 0, 1), rip = N.vn(x / 2.2 + y / 7, y / 1.4) - 0.5;
      const refl = 1 + rip * (snow ? 0.06 : 0.14) + (N2.fbm(x / 40, y / 25, 2) - 0.5) * 0.2;
      wr = (P.SHAL[0] + (P.DEEP[0] - P.SHAL[0]) * t) * refl; wg2 = (P.SHAL[1] + (P.DEEP[1] - P.SHAL[1]) * t) * refl; wb = (P.SHAL[2] + (P.DEEP[2] - P.SHAL[2]) * t) * refl * 1.04;
      mW = clamp(-w / 3 + 0.5, 0, 1);
    }
    if (w < -2) { d[p] = wr; d[p + 1] = wg2; d[p + 2] = wb; d[p + 3] = 255; }
    else {
      const hx = hgt[i + (x < W - 1 ? 1 : 0)] - hgt[i - (x > 0 ? 1 : 0)], hy = hgt[i + (y < H - 1 ? W : 0)] - hgt[i - (y > 0 ? W : 0)];
      let light = clamp(1 + (-hx * 0.8 - hy * 0.6) * (c2 < 20 ? 22 : 16), 0.4, 1.65);
      if (c2 > -4 && x > 14 && y > 9 && clf[i - 9 * W - 14] < -14) light *= 0.66; // mountains cast shadow to the lower right
      const moist = bil(mg, x, y);
      R_ = P.G1[0] + (P.G2[0] - P.G1[0]) * moist; Gc = P.G1[1] + (P.G2[1] - P.G1[1]) * moist; B = P.G1[2] + (P.G2[2] - P.G1[2]) * moist;
      const dry = clamp((0.42 - moist) * 4, 0, 1) * 0.4; R_ += (P.DRY[0] - R_) * dry; Gc += (P.DRY[1] - Gc) * dry; B += (P.DRY[2] - B) * dry;
      const hi = hgt[i] > 0.63 && c2 > 0 ? clamp((hgt[i] - 0.63) * 6, 0, 1) * (0.6 + fine * 0.4) : 0;
      const cliff = clamp((8 - c2) / 16, 0, 1);
      mR = Math.max(hi, cliff);
      if (mR > 0) { const k = mR * (0.85 + fine * 0.15), rk = cliff > 0.5 ? 0.82 + fine * 0.3 : 1; R_ += (P.ROCK[0] * rk - R_) * k; Gc += (P.ROCK[1] * rk - Gc) * k; B += (P.ROCK[2] * rk - B) * k; if (snow && c2 < -40) { const sk = clamp((-c2 - 40) / 50, 0, 0.85) * (0.6 + fine * 0.4); R_ += (236 - R_) * sk; Gc += (240 - Gc) * sk; B += (246 - B) * sk; } }
      if (md[p + 2]) { const fo = clamp(md[p + 2] / 255 * 1.3, 0, 1) * (0.75 + fine * 0.25); R_ += (P.FOR[0] - R_) * fo; Gc += (P.FOR[1] - Gc) * fo; B += (P.FOR[2] - B) * fo; }
      if (w < 34) { const k = (1 - w / 34) * 0.7; R_ += (P.WETG[0] - R_) * k; Gc += (P.WETG[1] - Gc) * k; B += (P.WETG[2] - B) * k; }
      if (w < 12) { const k = 1 - w / 12, bank = k > 0.55 ? P.MUD : P.SAND; const kk = Math.min(1, k * 1.2) * (0.7 + fine2 * 0.3); R_ += (bank[0] - R_) * kk; Gc += (bank[1] - Gc) * kk; B += (bank[2] - B) * kk; mD = Math.max(mD, kk); }
      const road = md[p] / 255, clear = md[p + 1] / 255;
      if (road > 0.01 || clear > 0.01) {
        const dirtAmt = clamp(road * 1.5 + (N.vn(x / 6, y / 6) - 0.5) * 0.6 * road, 0, 1), trample = clamp(clear * 0.75 + (N.vn(x / 9, y / 9) - 0.5) * 0.45 * clear, 0, 0.55);
        const t = Math.max(dirtAmt, trample), dm0 = P.DIRT[0] + (P.DIRT2[0] - P.DIRT[0]) * fine, dm1 = P.DIRT[1] + (P.DIRT2[1] - P.DIRT[1]) * fine, dm2 = P.DIRT[2] + (P.DIRT2[2] - P.DIRT[2]) * fine;
        R_ += (dm0 - R_) * t; Gc += (dm1 - Gc) * t; B += (dm2 - B) * t; mD = Math.max(mD, t * 1.3);
      }
      mD = Math.max(mD, dry * 0.8);
      const k = light * (0.88 + fine * 0.18 + (fine2 - 0.5) * 0.08);
      d[p] = R_ * k; d[p + 1] = Gc * k; d[p + 2] = B * k; d[p + 3] = 255;
      if (w < 2) { const t = clamp((2 - w) / 4, 0, 1); d[p] += (wr - d[p]) * t; d[p + 1] += (wg2 - d[p + 1]) * t; d[p + 2] += (wb - d[p + 2]) * t; }
    }
    if (!(x & 1) && !(y & 1)) {
      const q = ((y >> 1) * QW + (x >> 1)) * 4, g = clamp(1 - Math.max(mW, mR, mD), 0, 1);
      MG.img.data[q + 3] = g * 255; MD.img.data[q + 3] = clamp(mD, 0, 1) * (1 - mW) * (1 - mR) * 255; MR.img.data[q + 3] = mR * (1 - mW) * 255; MW.img.data[q + 3] = mW * 255;
    }
  }
  c.putImageData(img, 0, 0);
  for (const T of [MG, MD, MR, MW]) T.cv.getContext('2d').putImageData(T.img, 0, 0);
  if (!snow) {
    c.save(); c.globalAlpha = 0.2; c.strokeStyle = '#e8efe6'; c.lineWidth = 0.8;
    for (let y = 2; y < H - 2; y += 2) for (let x = 2; x < W - 2; x += 2) { const w = wat[y * W + x]; if (w < 0 && w > -3.5 && ((x * 7 + y * 13) % 5 < 2)) { c.beginPath(); c.moveTo(x - 1.5, y); c.lineTo(x + 1.5, y); c.stroke(); } }
    c.restore();
  }
  c.lineCap = 'round';
  for (const rd of M.roads) for (const off of [-4, 4]) { c.beginPath(); let pen = false; rd.forEach((pp, i) => { const q = rd[Math.min(i + 1, rd.length - 1)], pr = rd[Math.max(i - 1, 0)]; const ang = Math.atan2(q[1] - pr[1], q[0] - pr[0]) + Math.PI / 2; const X = pp[0] * sc + Math.cos(ang) * off, Y = pp[1] * sc + Math.sin(ang) * off; if (M.wdAt(pp[0], pp[1]) < 14) { pen = false; return; } pen ? c.lineTo(X, Y) : c.moveTo(X, Y); pen = true; }); c.strokeStyle = snow ? 'rgba(90,80,70,0.25)' : 'rgba(50,38,24,0.22)'; c.lineWidth = 1.6; c.stroke(); }
  if (M.river) {
    const r = mkRng(seed * 11 + 5);
    c.save(); c.translate(M.C[0] * sc, M.C[1] * sc); c.scale(1, 0.62);
    for (let ring = 0; ring < 5; ring++) for (let a = 0; a < 6.28; a += 0.32 - ring * 0.03) { const rr = 18 + ring * 11; if (r() < 0.25) continue; c.fillStyle = 'rgba(' + (150 + r() * 30 | 0) + ',' + (144 + r() * 25 | 0) + ',' + (128 + r() * 20 | 0) + ',0.45)'; c.fillRect(Math.cos(a) * rr - 4, Math.sin(a) * rr - 3, 8, 6); }
    c.restore();
  }
  return { cv, sc, masks: { grass: MG.cv, dirt: MD.cv, rock: MR.cv, water: MW.cv }, msc: sc / 2 };
}
// tileable greyscale detail textures (blended with 'overlay' over the colour map)
function detailTex(kind) {
  const k = 'dt' + kind; if (TEX[k]) return TEX[k];
  const S = 256, cv = mkCanvas(S, S), c = cv.getContext('2d');
  const sd = { grass: 11, dirt: 23, rock: 37, water: 41, snow: 53, ice: 67, dry: 71 }[kind] || 5;
  const N = makeNoise(sd, 32), r = mkRng(sd * 97);
  const img = c.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const f1 = N.fbm(x / 16, y / 16, 3), f2 = N.vn(x / 4, y / 4), f3 = N.vn(x / 2, y / 2);
    let v = 128;
    if (kind === 'grass' || kind === 'dry') v = 128 + (f1 - 0.5) * 60 + (f3 - 0.5) * 46 + (r() - 0.5) * 26;
    else if (kind === 'dirt') v = 128 + (f1 - 0.5) * 70 + (f2 - 0.5) * 42 + (r() - 0.5) * 34;
    else if (kind === 'rock') { const cr = Math.abs(N.fbm(x / 8 + 7, y / 8 + 3, 3) - 0.5); v = 128 + (f1 - 0.5) * 90 + (f2 - 0.5) * 50 - (cr < 0.02 ? 70 : 0) + (r() - 0.5) * 22; }
    else if (kind === 'water') v = 128 + (N.vn(x / 3, y / 12) - 0.5) * 50 + (f1 - 0.5) * 30;
    else if (kind === 'snow') v = 140 + (f1 - 0.5) * 38 + (f2 - 0.5) * 16 + (r() < 0.006 ? 90 : 0);
    else if (kind === 'ice') { const cr = Math.abs(N.fbm(x / 10, y / 10, 3) - 0.5); v = 140 + (f1 - 0.5) * 40 + (cr < 0.012 ? 70 : 0) + (N.vn(x / 2, y / 20) - 0.5) * 20; }
    const p = (y * S + x) * 4; d[p] = d[p + 1] = d[p + 2] = clamp(v, 0, 255); d[p + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const wrapDraw = (x, y, pad, f) => { f(0, 0); if (x < pad) f(S, 0); if (x > S - pad) f(-S, 0); if (y < pad) f(0, S); if (y > S - pad) f(0, -S); };
  if (kind === 'grass' || kind === 'dry') {
    for (let i = 0; i < 5600; i++) {
      const x = r() * S, y = r() * S, l = 2.5 + r() * 5, a = -Math.PI / 2 + (r() - 0.5) * 1.1, v = (r() < 0.55 ? 40 + r() * 40 : 170 + r() * 60) | 0;
      const col = 'rgba(' + v + ',' + v + ',' + v + ',0.42)';
      wrapDraw(x, y, 8, (ox, oy) => line(c, x + ox, y + oy, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l, col, 0.7));
    }
  } else if (kind === 'dirt') {
    for (let i = 0; i < 520; i++) { const x = r() * S, y = r() * S, rr = 0.6 + r() * 1.8; wrapDraw(x, y, 4, (ox, oy) => { ell(c, x + ox, y + oy + rr * 0.4, rr, rr * 0.7, 'rgba(40,40,40,0.45)'); ell(c, x + ox, y + oy, rr * 0.85, rr * 0.6, 'rgba(215,215,215,0.5)'); }); }
  } else if (kind === 'rock') {
    for (let i = 0; i < 70; i++) { let x = r() * S, y = r() * S; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 18; y += (r() - 0.3) * 12; c.lineTo(x, y); } c.strokeStyle = 'rgba(30,30,30,0.35)'; c.lineWidth = 0.8; c.stroke(); }
  }
  return TEX[k] = cv;
}
function buildClouds(light) {
  const S = 256, cv = mkCanvas(S, S), c = cv.getContext('2d'); const N = makeNoise(light ? 777 : 321, 16);
  const img = c.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = N.fbm(x / 16, y / 16, 4); const a = clamp((v - (light ? 0.35 : 0.5)) * (light ? 1.8 : 3.2), 0, 1); const p = (y * S + x) * 4; d[p] = light ? 214 : 20; d[p + 1] = light ? 220 : 26; d[p + 2] = light ? 226 : 34; d[p + 3] = a * 255; }
  c.putImageData(img, 0, 0); return cv;
}
function buildDecor(M) {
  const r = mkRng(M.seed * 13 + 1), out = [], ground = [];
  for (const t of M.trees) out.push({ k: 't', v: t.v, x: t.x, y: t.y, s: t.s });
  const clear = (x, y, pad) => {
    pad = pad || 0;
    for (const s of START_POS) if (Math.hypot(x - s[0], y - s[1]) < 600 - pad) return false;
    for (const [ox, oy] of M.outposts) if (Math.hypot(x - ox, y - oy) < 200 - pad) return false;
    for (const [ox, oy] of M.camps) if (Math.hypot(x - ox, y - oy) < 140) return false;
    if (M.wdAt(x, y) < 18 - pad * 0.1 || M.clAt(x, y) < 6) return false;
    for (const rd of M.roads) if (polyDist(x, y, rd) < 40 - pad * 0.2) return false;
    return true;
  };
  for (let i = 0; i < 60; i++) { const x = r() * MAP_W, y = r() * MAP_H; if (clear(x, y)) out.push({ k: 'r', v: (r() * 2) | 0, x, y, s: 0.6 + r() * 0.9 }); }
  // boulders strewn around cliffs
  let nb = 0; for (let i = 0; i < 4000 && nb < 170; i++) { const x = r() * MAP_W, y = r() * MAP_H, c2 = M.clAt(x, y); if (c2 > -70 && c2 < 16 && r() < 0.5) { out.push({ k: 'r', v: 2 + ((r() * 2) | 0), x, y, s: 0.5 + r() * 0.8 }); nb++; } }
  if (M.river) for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; out.push({ k: 'p', x: M.C[0] + Math.cos(a) * 118, y: M.C[1] + Math.sin(a) * 80, s: 1, broken: i % 3 === 1 }); }
  M.camps.forEach((c, i) => out.push({ k: 'camp', i, kind: c[2], x: c[0], y: c[1] - 40 }));
  if (M.river) for (let i = 0; i < 520; i++) { const y = r() * MAP_H, x = M.rx(y) + (r() < 0.5 ? -1 : 1) * (M.RW - 6 + r() * 16); const w = M.wdAt(x, y); if (w > -10 && w < 6 && M.water(x, y) !== 2) ground.push({ v: 8, x, y, s: 0.6 + r() * 0.5 }); }
  const tuftV = () => M.biome === 'snow' ? 9 : M.biome === 'highland' ? (r() < 0.5 ? 9 : (r() * 4) | 0) : r() < 0.72 ? (r() * 4) | 0 : r() < 0.6 ? 4 + ((r() * 2) | 0) : 6 + ((r() * 2) | 0);
  for (let i = 0; i < 3600; i++) { const x = r() * MAP_W, y = r() * MAP_H; if (clear(x, y, 120)) ground.push({ v: tuftV(), x, y, s: 0.5 + r() * 0.4 }); }
  const water = [];
  if (M.river) for (let i = 0; i < 12000 && water.length < 1400; i++) { const x = r() * MAP_W, y = r() * MAP_H; if (M.wdAt(x, y) < -8) water.push({ x, y, ph: r() * 6.28, l: 3 + r() * 6 }); }
  return { out, ground, water };
}
function craterSprite(v) {
  const key = 'crater' + v; if (SPR.has(key)) return SPR.get(key);
  const W = 128, H = 80, cv = mkCanvas(W, H), c = cv.getContext('2d'), r = mkRng(v * 53 + 9);
  c.translate(W / 2, H / 2);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 56); g.addColorStop(0, 'rgba(18,12,8,0.85)'); g.addColorStop(0.45, 'rgba(40,28,18,0.7)'); g.addColorStop(0.75, 'rgba(90,70,48,0.35)'); g.addColorStop(1, 'rgba(90,70,48,0)');
  c.save(); c.scale(1, 0.6); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 60, 0, 7); c.fill(); c.restore();
  for (let k = 0; k < 40; k++) { const a = r() * 6.28, d = 30 + r() * 30; ell(c, Math.cos(a) * d, Math.sin(a) * d * 0.6, 1.2 + r() * 2.4, 0.9 + r() * 1.5, r() < 0.5 ? 'rgba(60,44,30,0.8)' : 'rgba(120,98,70,0.7)'); }
  const spr = { cv, w: W, h: H }; SPR.set(key, spr); return spr;
}
function rubbleSprite(v) {
  const key = 'rubble' + v; if (SPR.has(key)) return SPR.get(key);
  const W = 160, H = 110, cv = mkCanvas(W, H), c = cv.getContext('2d'), r = mkRng(v * 71 + 3);
  c.translate(W / 2, H / 2);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 74); g.addColorStop(0, 'rgba(20,16,12,0.8)'); g.addColorStop(1, 'rgba(20,16,12,0)');
  c.save(); c.scale(1, 0.62); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 76, 0, 7); c.fill(); c.restore();
  for (let k = 0; k < 7; k++) { const a = r() * 6.28, d = r() * 40; c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d * 0.6); c.rotate(r() * 3); rrect(c, -16, -2.5, 32, 5, 1.5, '#241a12'); c.restore(); }
  for (let k = 0; k < 60; k++) { const a = r() * 6.28, d = Math.sqrt(r()) * 56, x = Math.cos(a) * d, y = Math.sin(a) * d * 0.6, s = 2 + r() * 6; poly(c, [x - s, y, x - s * 0.4, y - s * 0.7, x + s * 0.6, y - s * 0.5, x + s, y + s * 0.2, x, y + s * 0.4], lg(c, x - s, x + s, r() < 0.5 ? '#8a8378' : '#6d665c', -0.45, 0.2)); }
  grit(cv, 14, 0);
  const spr = { cv, w: W, h: H }; SPR.set(key, spr); return spr;
}
function campSprite(kind) {
  const key = 'camp' + kind; if (SPR.has(key)) return SPR.get(key);
  const W = 180, H = 120, S = 2, cv = mkCanvas(W * S, H * S), c = cv.getContext('2d'); c.scale(S, S); c.translate(W / 2, H - 30);
  const r = mkRng(kind.length * 17);
  const tent = (x, y, w, h, col) => { poly(c, [x - w / 2, y, x, y - h, x + w / 2, y], lg(c, x - w / 2, x + w / 2, col, -0.5, 0.2)); poly(c, [x - w * 0.12, y, x, y - h * 0.55, x + w * 0.12, y], '#1d150e'); line(c, x, y - h, x, y - h - 6, '#4a3524', 1.2); line(c, x - w / 2, y, x - w / 2 - 6, y + 3, '#4a3524', 0.8); line(c, x + w / 2, y, x + w / 2 + 6, y + 3, '#4a3524', 0.8); };
  const rock = (x, y, s, col) => poly(c, [x - s, y, x - s * 0.7, y - s * 0.8, x, y - s, x + s * 0.8, y - s * 0.6, x + s, y], lg(c, x - s, x + s, col || '#7a746a', -0.5, 0.25));
  const bones = (x, y) => { for (let k = 0; k < 6; k++) { const a = r() * 3.14, l = 4 + r() * 5, bx = x + (r() - 0.5) * 30, by = y + (r() - 0.5) * 10; line(c, bx, by, bx + Math.cos(a) * l, by + Math.sin(a) * l * 0.5, '#d8d0bc', 1.4); } ell(c, x + 8, y - 2, 3.5, 3, '#d8d0bc'); ell(c, x + 7, y - 2.5, 0.8, 0.8, '#2a2420'); ell(c, x + 9.5, y - 2.5, 0.8, 0.8, '#2a2420'); };
  if (kind === 'bandits') { tent(-44, 0, 40, 34, '#6b5a44'); tent(40, -6, 36, 30, '#5a4f40'); for (let k = 0; k < 3; k++) line(c, -10 + k * 5, 4, -10 + k * 5 + 2, -18, '#5a3f28', 1.2); line(c, -12, -12, 4, -12, '#5a3f28', 1.2); rrect(c, 58, 6, 12, 9, 2, lg(c, 58, 70, '#6b4a2e')); }
  else if (kind === 'wolves') { rock(-50, 6, 22); rock(-30, -4, 16, '#6f6a62'); rock(44, 2, 20); rock(58, 10, 12, '#8a8378'); c.beginPath(); c.ellipse(-40, 0, 14, 9, 0, Math.PI, 0); c.fillStyle = '#16120e'; c.fill(); bones(20, 16); bones(-10, 20); }
  else { rock(-54, 8, 34, '#5f5a52'); rock(-20, -6, 28, '#6a655c'); rock(30, -2, 30, '#5f5a52'); rock(62, 10, 20); c.beginPath(); c.ellipse(-6, 0, 22, 18, 0, Math.PI, 0); c.fillStyle = '#120e0b'; c.fill(); bones(-30, 20); bones(30, 18); line(c, 50, 14, 70, -20, '#5a3d24', 3); }
  grit(cv, 14, 0.05);
  const spr = { cv, w: W, h: H, ox: W / 2, oy: H - 30 }; SPR.set(key, spr); return spr;
}
function chestSprite() {
  if (SPR.has('chest')) return SPR.get('chest');
  const W = 24, H = 20, S = 3, cv = mkCanvas(W * S, H * S), c = cv.getContext('2d'); c.scale(S, S); c.translate(W / 2, H - 3);
  rrect(c, -8, -8, 16, 8, 1, lg(c, -8, 8, '#7a4f28', -0.5, 0.2)); c.beginPath(); c.moveTo(-8, -8); c.quadraticCurveTo(0, -15, 8, -8); c.closePath(); c.fillStyle = lg(c, -8, 8, '#8a5a30', -0.5, 0.25); c.fill();
  for (const x of [-5, 5]) line(c, x, -12, x, 0, '#d4a73c', 1.4); line(c, -8, -8, 8, -8, '#d4a73c', 1.2); rrect(c, -1.5, -9, 3, 3.5, 0.5, '#e8c85a');
  const spr = { cv, w: W, h: H, ox: W / 2, oy: H - 3 }; SPR.set('chest', spr); return spr;
}
// facing as one of 8 directions (0 = east, 2 = south/toward the viewer)
function dirOf(e) {
  let a = e.hd;
  if (a === undefined) { if (e._px !== undefined) { const dx = e.rx - e._px, dy = e.ry - e._py; if (dx * dx + dy * dy > 0.04) e._hd = Math.atan2(dy, dx); } e._px = e.rx; e._py = e.ry; a = e._hd !== undefined ? e._hd : e.face < 0 ? Math.PI : 0; }
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
}
function unitScale(d) { return d.hero ? 1.12 : d.sub === 'treant' ? 1.05 : d.sub === 'troll' ? 1 : 0.8; }
function convexHull(pts) {
  if (pts.length < 3) return pts.slice();
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  up.pop(); lo.pop(); return lo.concat(up);
}
// time of day (10-minute cycle) and weather (changes every ~2 minutes, biome-dependent)
function envAt(M, seed, t) {
  const p = (t / 600 + 0.04) % 1;
  let light = 1, tint = null;
  if (p < 0.08) { const k = p / 0.08; light = 0.5 + k * 0.5; tint = [255, 160, 120, (1 - k) * 0.35]; }
  else if (p < 0.55) light = 1;
  else if (p < 0.66) { const k = (p - 0.55) / 0.11; light = 1 - k * 0.5; tint = [255, 130, 70, Math.sin(k * Math.PI) * 0.4]; }
  else if (p < 0.94) light = 0.5;
  else { const k = (p - 0.94) / 0.06; light = 0.5; tint = [255, 150, 130, k * 0.2]; }
  const SEG = 110, seg = Math.floor(t / SEG);
  const wOf = s => {
    if (s === 0) return M.biome === 'snow' ? 'snow' : 'clear';
    const q = mkRng((seed * 977 + s * 131 + 7) >>> 0)();
    const tbl = { meadow: [['clear', 0.5], ['rain', 0.3], ['fog', 0.2]], highland: [['clear', 0.45], ['fog', 0.35], ['rain', 0.2]], snow: [['snow', 0.6], ['clear', 0.25], ['fog', 0.15]] }[M.biome];
    let acc = 0; for (const [k, pr] of tbl) { acc += pr; if (q < acc) return k; } return 'clear';
  };
  const ph = t - seg * SEG;
  return { p, light, tint, weather: wOf(seg), wAmt: clamp(Math.min(ph / 14, (SEG - ph) / 14), 0, 1), night: 1 - light };
}

// ================= RENDERER =================
const TILE = 256, TSC = 1.5;
class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.c = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, z: 1 };
    this.corpses = []; this.decals = []; this.parts = []; this.lights = []; this.drops = [];
    this.dpr = 1; this.shake = 0; this.lastT = 0; this.flash = 0; this.frameN = 0;
    this.clouds = buildClouds(false); this.fog = buildClouds(true); this.tiles = new Map();
  }
  setWorld(seed, type) {
    const key = seed + ':' + (type || 'river');
    if (this.worldKey === key && this.terrain) return;
    this.worldKey = key; this.seed = seed; this.map = makeMap(seed, type);
    const dd = buildDecor(this.map); this.terrain = buildTerrain(this.map);
    this.decor = dd.out; this.ground = dd.ground; this.waterPts = dd.water; this.decor.sort((a, b) => a.y - b.y);
    for (const t of this.tiles.values()) t.cv.width = 0;
    this.tiles.clear(); this.mats = null; this.corpses = []; this.decals = []; this.parts = [];
    this.trample = mkCanvas(Math.ceil(MAP_W / 8), Math.ceil(MAP_H / 8)); this.trampleT = 0;
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); this.dpr = dpr;
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.vign = null; this.drops = [];
    this.clampCam();
  }
  clampCam() {
    const cam = this.cam; const minZ = Math.max(this.w / MAP_W, this.h / MAP_H, 0.3) * 0.85;
    cam.z = clamp(cam.z, minZ, 2.2);
    const vw = this.w / cam.z, vh = this.h / cam.z;
    const pb = (this.padB || 0) / cam.z, pt = (this.padT || 0) / cam.z;
    cam.x = clamp(cam.x, -30, Math.max(-30, MAP_W - vw + 30)); cam.y = clamp(cam.y, -20 - pt, Math.max(-20 - pt, MAP_H - vh + 10 + pb));
  }
  centerOn(x, y) { this.cam.x = x - this.w / 2 / this.cam.z; this.cam.y = y - (this.h - (this.padB || 0)) / 2 / this.cam.z; this.clampCam(); }
  toWorld(sx, sy) { return { x: this.cam.x + sx / this.cam.z, y: this.cam.y + sy / this.cam.z }; }
  toScreen(x, y) { return { x: (x - this.cam.x) * this.cam.z, y: (y - this.cam.y) * this.cam.z }; }
  proj(x, y, up) { return { x: (x - this.cam.x) * this.cam.z, y: (y - (up || 0) - this.cam.y) * this.cam.z }; }
  pxAt() { return this.cam.z; }
  zoomAt(sx, sy, z) { const w = this.toWorld(sx, sy); this.cam.z = z; this.clampCam(); this.cam.x = w.x - sx / this.cam.z; this.cam.y = w.y - sy / this.cam.z; this.clampCam(); }
  panBy(x0, y0, x1, y1) { this.cam.x -= (x1 - x0) / this.cam.z; this.cam.y -= (y1 - y0) / this.cam.z; this.clampCam(); }
  // ground marks drawn by main.js (the 3D renderer lays the same marks onto the terrain)
  beginOverlay() { const cam = this.cam, d = this.dpr; this.c.setTransform(cam.z * d, 0, 0, cam.z * d, -cam.x * cam.z * d, -cam.y * cam.z * d); }
  endOverlay() { this.c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
  gRing(x, y, r, hex, a, w) { ell(this.c, x, y, r, r * 0.55, null, rgba(hex, a === undefined ? 0.9 : a), w || 2); }
  gDisc(x, y, r, hex, a) { ell(this.c, x, y, r, r * 0.55, rgba(hex, a === undefined ? 0.15 : a)); }
  gLine(x1, y1, x2, y2, hex, a, w) { line(this.c, x1, y1, x2, y2 * 1, rgba(hex, a === undefined ? 0.8 : a), w || 2); }
  emit(p) { if (this.parts.length < 700) this.parts.push(p); }
  addLight(x, y, r, a, warm) { if (this.lights.length < 600) this.lights.push(x, y, r, a, warm ? 1 : 0); }
  addDecal(k, x, y, r, now) { this.decals.push({ k, x, y, r, t: now, v: (Math.random() * 4) | 0 }); if (this.decals.length > 240) this.decals.shift(); }
  addCorpse(e, now, up) {
    if (e.d.kind === 'b') {
      this.addDecal('rubble', e.rx, e.ry, e.r, now);
      for (let k = 0; k < 16; k++) this.emit({ x: e.rx + (Math.random() - 0.5) * e.r * 1.4, y: e.ry - Math.random() * e.r, vx: (Math.random() - 0.5) * 20, vy: -20 - Math.random() * 20, life: 2 + Math.random() * 2, t: 0, k: 'smoke', s: 8 + e.r * 0.15 });
      return;
    }
    if (this.corpses.length > 380) this.corpses.shift();
    const dir = dirOf(e); unit3(e.d, TEAM_COLORS[e.owner] || '#888', 10, dir, up);
    this.corpses.push({ d: e.d, owner: e.owner, x: e.rx, y: e.ry, face: e.face || 1, dir, t: now, up: up | 0, blood: e.d.sub !== 'treant' && e.d.sub !== 'ghoul' });
  }
  // ---- ground: baked detail tiles over a low-res colour map ----
  makeMats() {
    const b = this.map.biome, T = this.terrain.masks;
    if (!this.tmp) this.tmp = mkCanvas(Math.ceil((TILE + 2) * TSC), Math.ceil((TILE + 2) * TSC));
    const t = this.tmp.getContext('2d');
    const M = [
      { mask: T.grass, tex: detailTex(b === 'snow' ? 'snow' : b === 'highland' ? 'dry' : 'grass'), blend: 'overlay', a: b === 'snow' ? 0.55 : 0.8 },
      { mask: T.dirt, tex: detailTex('dirt'), blend: 'overlay', a: 0.8 },
      { mask: T.rock, tex: detailTex('rock'), blend: 'overlay', a: 0.95 },
      { mask: T.water, tex: detailTex(b === 'snow' ? 'ice' : 'water'), blend: 'soft-light', a: 0.7 },
    ];
    for (const m of M) m.pat = t.createPattern(m.tex, 'repeat');
    return M;
  }
  bakeTile(tx, ty) {
    const mats = this.mats || (this.mats = this.makeMats());
    const W = TILE + 2, P = Math.ceil(W * TSC), x0 = tx * TILE, y0 = ty * TILE, tr = this.terrain;
    const cv = mkCanvas(P, P), c = cv.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.drawImage(tr.cv, x0 * tr.sc, y0 * tr.sc, W * tr.sc, W * tr.sc, 0, 0, P, P);
    const t = this.tmp.getContext('2d');
    for (const m of mats) {
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'copy'; t.globalAlpha = 1;
      t.setTransform(TSC, 0, 0, TSC, -x0 * TSC, -y0 * TSC); t.fillStyle = m.pat; t.fillRect(x0, y0, W, W);
      t.setTransform(1, 0, 0, 1, 0, 0); t.globalCompositeOperation = 'destination-in';
      t.drawImage(m.mask, x0 * tr.msc, y0 * tr.msc, W * tr.msc, W * tr.msc, 0, 0, P, P);
      c.globalCompositeOperation = m.blend; c.globalAlpha = m.a; c.drawImage(this.tmp, 0, 0);
    }
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
    // static tree shadows are baked into the ground
    c.setTransform(TSC, 0, 0, TSC, -x0 * TSC, -y0 * TSC);
    for (const tr2 of this.map.trees) if (tr2.x > x0 - 110 && tr2.x < x0 + W + 40 && tr2.y > y0 - 40 && tr2.y < y0 + W + 110) {
      const spr = treeSprite(tr2.v); c.save(); c.globalAlpha = 0.28; c.translate(tr2.x, tr2.y); c.transform(1, 0, -0.62, 0.06, 0, 0);
      c.drawImage(silhouette(spr), -spr.ox * tr2.s, -spr.oy * tr2.s, spr.w * tr2.s, spr.h * tr2.s); c.restore();
    }
    this.tiles.set(ty * 1000 + tx, { cv, used: this.frameN });
  }
  drawGround(vx0, vy0, vx1, vy1) {
    const c = this.c, tr = this.terrain;
    const tx0 = Math.max(0, Math.floor(vx0 / TILE)), ty0 = Math.max(0, Math.floor(vy0 / TILE)), tx1 = Math.min(Math.ceil(MAP_W / TILE) - 1, Math.floor(vx1 / TILE)), ty1 = Math.min(Math.ceil(MAP_H / TILE) - 1, Math.floor(vy1 / TILE));
    let budget = this.bakeBudget || 2;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      let t = this.tiles.get(ty * 1000 + tx);
      if (!t && budget > 0) { this.bakeTile(tx, ty); budget--; t = this.tiles.get(ty * 1000 + tx); }
      if (t) { t.used = this.frameN; c.drawImage(t.cv, tx * TILE, ty * TILE, TILE + 2, TILE + 2); }
      else c.drawImage(tr.cv, tx * TILE * tr.sc, ty * TILE * tr.sc, TILE * tr.sc, TILE * tr.sc, tx * TILE, ty * TILE, TILE, TILE);
    }
    if (this.tiles.size > 70) {
      const old = [...this.tiles.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, this.tiles.size - 60);
      for (const [k, t] of old) { t.cv.width = 0; this.tiles.delete(k); }
    }
  }
  drawBridge(b) {
    const c = this.c, len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), W = 46;
    if (!this.stoneP) this.stoneP = c.createPattern(texStone('#8f887c', 'br', true), 'repeat');
    c.save(); c.translate(b.x1, b.y1); c.rotate(b.ang);
    c.fillStyle = 'rgba(10,20,22,0.35)'; c.fillRect(6, -W / 2 + 10, len - 12, W);
    for (let x = 22; x < len - 18; x += 34) ell(c, x, W / 2 + 2, 11, 5, 'rgba(12,18,20,0.55)');
    c.fillStyle = this.stoneP; c.fillRect(0, -W / 2, len, W);
    const g = c.createLinearGradient(0, -W / 2, 0, W / 2); g.addColorStop(0, 'rgba(255,240,210,0.16)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    c.fillStyle = g; c.fillRect(0, -W / 2, len, W);
    c.fillStyle = 'rgba(90,72,50,0.35)'; c.fillRect(0, -W / 2 + 9, len, W - 18);
    for (const side of [-1, 1]) { const y = side * (W / 2 - 3); rrect(c, -4, y - 3.5, len + 8, 7, 2, lg(c, 0, 0, '#a39b8d', -0.4, 0.2)); line(c, -4, y + 3.5 * side, len + 4, y + 3.5 * side, 'rgba(0,0,0,0.3)', 1.2); for (let x = 0; x <= len; x += Math.max(24, len / Math.round(len / 30))) rrect(c, x - 4, y - 5, 8, 10, 2, '#b3ab9c'); }
    c.restore();
  }
  castShadow(spr, x, y, s, a) {
    const c = this.c; c.save(); c.globalAlpha = a; c.translate(x, y); c.transform(1, 0, -0.62, 0.06, 0, 0);
    c.drawImage(silhouette(spr), -spr.ox * s, -spr.oy * s, spr.w * s, spr.h * s); c.restore();
  }

  draw(S) {
    const c = this.c, cam = this.cam, dpr = this.dpr;
    const now = S.time;
    const rdt = clamp(now - this.lastT, 0, 0.1); this.lastT = now; this.frameN++;
    const env = this.env = envAt(this.map, this.seed, S.gameT !== undefined ? S.gameT : now);
    this.lights = [];
    if (!pumpBld3(this.frameN < 90 ? 30 : 10)) pumpUnit3(this.frameN < 90 ? 16 : 7);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#1d2216'; c.fillRect(0, 0, this.cv.width, this.cv.height);
    let shx = 0, shy = 0;
    if (this.shake > 0) { shx = (Math.random() - 0.5) * this.shake * 10; shy = (Math.random() - 0.5) * this.shake * 10; this.shake = Math.max(0, this.shake - 0.05); }
    c.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, (-cam.x * cam.z + shx) * dpr, (-cam.y * cam.z + shy) * dpr);
    c.imageSmoothingEnabled = true;
    const vx0 = cam.x - 90, vy0 = cam.y - 60, vx1 = cam.x + this.w / cam.z + 90, vy1 = cam.y + this.h / cam.z + 160;
    const inView = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
    this.drawGround(vx0, vy0, vx1, vy1);
    // armies wear paths into the ground
    this.trampleT -= rdt;
    if (this.trampleT <= 0) { this.trampleT = 0.5; const tc = this.trample.getContext('2d'); tc.fillStyle = this.map.biome === 'snow' ? 'rgba(112,104,96,0.08)' : 'rgba(58,44,28,0.06)'; for (const e of S.ents) if (e.moving && e.d.kind === 'u') tc.fillRect(e.rx / 8 - 0.5, e.ry / 8 - 0.5, e.d.sub === 'cav' || e.d.sub === 'troll' ? 2 : 1, 1); }
    c.drawImage(this.trample, 0, 0, MAP_W, MAP_H);
    // water glints drifting downstream
    if (this.waterPts.length) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
      const gl = env.light * (env.weather === 'rain' ? 1 - 0.5 * env.wAmt : 1);
      for (const w of this.waterPts) {
        if (!inView(w.x, w.y)) continue;
        const a = Math.sin(now * 1.6 + w.ph); if (a < 0.35) continue;
        const dy = ((now * 9 + w.ph * 20) % 30) - 15;
        c.strokeStyle = 'rgba(210,235,240,' + ((a - 0.35) * 0.28 * gl).toFixed(3) + ')'; c.lineWidth = 1.1;
        c.beginPath(); c.moveTo(w.x - w.l, w.y + dy); c.lineTo(w.x + w.l, w.y + dy); c.stroke();
      }
      c.restore();
    }
    for (const b of this.map.bridges) if (inView((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2) || inView(b.x1, b.y1) || inView(b.x2, b.y2)) this.drawBridge(b);
    // decals: craters, rubble
    this.decals = this.decals.filter(k => now - k.t < 150);
    for (const k of this.decals) {
      if (!inView(k.x, k.y)) continue;
      c.globalAlpha = now - k.t < 110 ? 1 : Math.max(0, 1 - (now - k.t - 110) / 40);
      const spr = k.k === 'crater' ? craterSprite(k.v) : rubbleSprite(k.v), sc = k.k === 'crater' ? k.r / 56 : k.r / 44;
      c.drawImage(spr.cv, k.x - spr.w / 2 * sc, k.y - spr.h / 2 * sc, spr.w * sc, spr.h * sc);
    }
    c.globalAlpha = 1;
    // fallen soldiers
    if (this.corpses.length && this.frameN % 60 === 0) this.corpses = this.corpses.filter(k => now - k.t < 50);
    for (const k of this.corpses) {
      if (!inView(k.x, k.y)) continue;
      const age = now - k.t; if (age > 50 || age < 0) continue;
      const sc = unitScale(k.d), spr = unitSprite(k.d, TEAM_COLORS[k.owner] || '#888', 0, cam.z * dpr * sc < 1.3, k.up);
      if (k.blood) { const br = Math.min(1, age / 2.5) * (k.d.r + 3); ell(c, k.x - k.face * 9, k.y - 1, br * 1.4, br * 0.5, 'rgba(62,10,8,0.5)'); }
      const fall = clamp(age / 0.4, 0, 1), col3 = TEAM_COLORS[k.owner] || '#888';
      const lying = fall >= 1 ? SPR3.get(unit3Key(k.d, col3, 10, k.dir, k.up)) : null, st3 = SPR3.get(unit3Key(k.d, col3, 0, k.dir, k.up));
      if (lying) { c.globalAlpha = age > 38 ? Math.max(0, 1 - (age - 38) / 12) : 1; c.drawImage(deadSprite(lying), k.x - lying.ox, k.y - lying.oy, lying.w, lying.h); c.globalAlpha = 1; continue; }
      if (st3) { c.save(); c.globalAlpha = age > 38 ? Math.max(0, 1 - (age - 38) / 12) : 1; c.translate(k.x, k.y + fall * 2); c.rotate(-k.face * fall * fall * 1.45); c.drawImage(fall >= 1 ? deadSprite(st3) : st3.cv, -st3.ox, -st3.oy, st3.w, st3.h); c.restore(); continue; }
      c.save(); c.globalAlpha = age > 38 ? Math.max(0, 1 - (age - 38) / 12) : 1;
      c.translate(k.x, k.y + fall * 2); c.rotate(-k.face * fall * fall * 1.45); if (k.face < 0) c.scale(-1, 1);
      c.drawImage(fall >= 1 ? deadSprite(spr) : spr.cv, -spr.ox * sc, -spr.oy * sc, spr.w * sc, spr.h * sc);
      c.restore();
    }
    // ground clutter
    for (const g of this.ground) { if (!inView(g.x, g.y)) continue; const s = tuftSprite(g.v); c.drawImage(s.cv, g.x - s.ox * g.s, g.y - s.oy * g.s, s.w * g.s, s.h * g.s); }
    // outposts
    if (S.outposts) for (const op of S.outposts) {
      if (!inView(op.x, op.y)) continue;
      const oc = op.owner >= 0 ? TEAM_COLORS[op.owner] : '#d8d0bc';
      ell(c, op.x, op.y, 130, 72, op.owner >= 0 ? rgba(oc, 0.1) : 'rgba(216,208,188,0.05)'); c.setLineDash([8, 10]); ell(c, op.x, op.y, 130, 72, null, op.owner >= 0 ? rgba(oc, 0.6) : 'rgba(230,220,190,0.35)', 1.6); c.setLineDash([]);
      c.drawImage(shadowSprite(), op.x - 40, op.y - 16, 80, 34);
      ell(c, op.x, op.y, 34, 18, lg(c, op.x - 34, op.x + 34, '#8f887b')); ell(c, op.x, op.y - 4, 30, 15, lg(c, op.x - 30, op.x + 30, '#b2aa9a', -0.3, 0.15));
      for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; line(c, op.x, op.y - 4, op.x + Math.cos(a) * 29, op.y - 4 + Math.sin(a) * 14, 'rgba(60,55,48,0.3)', 0.8); }
      line(c, op.x, op.y - 6, op.x, op.y - 64, lg(c, op.x - 2, op.x + 2, '#5a4330'), 2.6);
      const wave = Math.sin(now * 3 + op.x) * 2.5;
      c.beginPath(); c.moveTo(op.x + 1, op.y - 63); c.quadraticCurveTo(op.x + 14, op.y - 66 + wave, op.x + 28, op.y - 60 + wave); c.lineTo(op.x + 27, op.y - 47 + wave); c.quadraticCurveTo(op.x + 14, op.y - 52 - wave, op.x + 1, op.y - 48); c.closePath(); c.fillStyle = vg(c, op.y - 64, op.y - 47, oc, -0.4, 0.2); c.fill();
      if ((op.prog > 0 && op.prog < 1) || (op.owner >= 0 && op.prog < 1)) {
        const pc = op.cap >= 0 && op.owner < 0 ? TEAM_COLORS[op.cap] : oc;
        c.beginPath(); c.ellipse(op.x, op.y, 50, 27, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * op.prog); c.strokeStyle = pc; c.lineWidth = 4; c.stroke();
      }
      if (op.contested) { c.font = '700 16px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#ffdd55'; c.fillText('⚔', op.x, op.y - 72); }
      this.addLight(op.x, op.y - 30, 90, 0.5, true);
    }
    // battalions: banner bearer, total health, selection
    const SQ = new Map();
    for (const e of S.ents) {
      if (!e.sq || e.d.kind !== 'u') continue;
      let q = SQ.get(e.sq);
      if (!q) { q = { mem: [], b: e, hp: 0, mx: 0, d: e.d, owner: e.owner, sel: false, rank: e.rank || 0 }; SQ.set(e.sq, q); }
      q.mem.push(e); q.hp += e.hp; q.mx += e.maxhp;
      if ((e.slot !== undefined ? e.slot - q.b.slot : e.id - q.b.id) < 0) q.b = e;
      if (S.sel.has(e.id)) q.sel = true;
    }
    this.SQ = SQ;
    // camps: is the treasure still guarded?
    const campAlive = this.map.camps.map(() => false);
    for (const e of S.ents) if (e.owner === NEUTRAL) this.map.camps.forEach((cp, i) => { if (!campAlive[i] && Math.abs(e.rx - cp[0]) < 320 && Math.abs(e.ry - cp[1]) < 320) campAlive[i] = true; });
    this.campAlive = campAlive;
    // cast shadows (sun from the upper left), fading at night and under clouds
    const shA = 0.3 * (0.35 + 0.65 * env.light) * (env.weather === 'clear' || env.weather === 'snow' ? 1 : 1 - 0.6 * env.wAmt);
    for (const e of S.ents) if (e.d.kind === 'b' && inView(e.rx, e.ry) && e.built >= 0.5) this.castShadow(bld3(e.d, TEAM_COLORS[e.owner]) || bldSprite(e.d, TEAM_COLORS[e.owner]), e.rx, e.ry, 1, shA * 0.9);
    // selection hulls, unit shadows, rally points
    for (const q of SQ.values()) if (q.sel && inView(q.b.rx, q.b.ry)) this.drawHull(q, S.me === q.owner ? '#8fd3ff' : '#ff6a5a');
    for (const e of S.ents) {
      if (!inView(e.rx, e.ry)) continue;
      const sel = S.sel.has(e.id);
      if (e.d.kind === 'u') {
        const sw = e.r * (e.d.sub === 'cav' || e.d.sub === 'wolf' ? 3.2 : 2.3);
        c.drawImage(shadowSprite(), e.rx - sw / 2 + 4, e.ry - sw * 0.2, sw, sw * 0.5);
        if (!e.sq) {
          if (sel) { const col = S.me === e.owner ? '#8fd3ff' : '#ff5a4a'; ell(c, e.rx, e.ry, e.r * 1.4, e.r * 0.62, rgba(col, 0.15), col, 1.6 / cam.z + 0.6); }
          else if (e.d.hero) ell(c, e.rx, e.ry, e.r * 1.3, e.r * 0.56, null, rgba(TEAM_COLORS[e.owner], 0.8), 1.5);
        }
      } else if (sel) { const col = S.me === e.owner ? '#8fd3ff' : '#ff5a4a'; ell(c, e.rx, e.ry, e.r * 1.25, e.r * 0.62, rgba(col, 0.1), col, 2); }
      if (sel && e.rally && e.owner === S.me) { c.setLineDash([6, 6]); line(c, e.rx, e.ry, e.rally.x, e.rally.y, 'rgba(243,215,116,0.6)', 1.5); c.setLineDash([]); line(c, e.rally.x, e.rally.y, e.rally.x, e.rally.y - 24, '#3b2f25', 2); poly(c, [e.rally.x, e.rally.y - 24, e.rally.x + 13, e.rally.y - 20, e.rally.x, e.rally.y - 15], TEAM_COLORS[e.owner]); }
    }
    for (const f of S.fx) if (f.k === 'mark') { const a = (now - f.t0) / f.dur; if (a >= 0 && a <= 1) { ell(c, f.x, f.y, f.p, f.p * 0.55, 'rgba(255,90,40,' + (0.1 + 0.18 * a) + ')', 'rgba(255,190,90,0.85)', 2); ell(c, f.x, f.y, f.p * a, f.p * 0.55 * a, null, 'rgba(255,220,150,0.6)', 1.5); } }
    // depth sorted world
    const list = [];
    for (const e of S.ents) if (inView(e.rx, e.ry)) list.push(e);
    for (const d of this.decor) if (inView(d.x, d.y)) list.push(d);
    list.sort((a, b) => (a.ry !== undefined ? a.ry : a.y) - (b.ry !== undefined ? b.ry : b.y));
    for (const o of list) { if (o.k) this.drawDecor(o, now); else this.drawEnt(o, now, rdt, S); }
    if (S.ghost) {
      const g = S.ghost, spr = bld3(g.d, TEAM_COLORS[S.me]) || bldSprite(g.d, TEAM_COLORS[S.me]);
      ell(c, g.x, g.y, g.d.r * 1.15, g.d.r * 0.58, g.ok ? 'rgba(90,220,110,0.25)' : 'rgba(230,60,50,0.3)', g.ok ? '#6fe08a' : '#ff5a4a', 2);
      c.globalAlpha = 0.65; c.drawImage(spr.cv, g.x - spr.ox, g.y - spr.oy, spr.w, spr.h); c.globalAlpha = 1;
    }
    this.drawFx(S.fx, now);
    this.drawParts(rdt);
    // cloud shadows and drifting fog banks
    const T = 1400, off = (now * 14) % T;
    c.save(); c.globalAlpha = (this.map.biome === 'snow' ? 0.07 : 0.16) * env.light;
    for (let tx = Math.floor((vx0 + off) / T) - 1; tx <= Math.floor((vx1 + off) / T); tx++) for (let ty = Math.floor((vy0 + off * 0.5) / T) - 1; ty <= Math.floor((vy1 + off * 0.5) / T); ty++) c.drawImage(this.clouds, tx * T - off, ty * T - off * 0.5, T, T);
    c.restore();
    if (env.weather === 'fog' && env.wAmt > 0) {
      c.save(); c.globalAlpha = 0.5 * env.wAmt * (0.4 + 0.6 * env.light);
      for (const [TT, sp] of [[900, 10], [1300, -6]]) { const o = (now * sp) % TT; for (let tx = Math.floor((vx0 - o) / TT) - 1; tx <= Math.floor((vx1 - o) / TT) + 1; tx++) for (let ty = Math.floor(vy0 / TT) - 1; ty <= Math.floor(vy1 / TT) + 1; ty++) c.drawImage(this.fog, tx * TT + o, ty * TT, TT, TT); }
      c.restore();
    }
    // bars & names
    for (const q of SQ.values()) {
      const b = q.b; if (!inView(b.rx, b.ry)) continue;
      const n = q.d.n || q.mem.length, full = q.mem.length >= n, f = clamp(q.hp / Math.max(1, q.mx) * q.mem.length / n, 0, 1);
      if (q.sel) for (const m of q.mem) { const hy = m.ry - (m.d.sub === 'cav' || m.d.sub === 'wolf' ? 40 : m.d.sub === 'troll' ? 72 : 32); c.fillStyle = 'rgba(8,8,6,0.7)'; c.fillRect(m.rx - 6, hy - 0.5, 12, 2.6); c.fillStyle = m.hp / m.maxhp > 0.5 ? '#6fd66a' : m.hp / m.maxhp > 0.25 ? '#e0b640' : '#d9432f'; c.fillRect(m.rx - 5.5, hy, 11 * clamp(m.hp / m.maxhp, 0, 1), 1.6); }
      if (!(q.sel || !full || q.hp < q.mx - 1)) continue;
      const w = 34, y = b.ry - (q.d.sub === 'cav' ? 64 : 58);
      c.fillStyle = 'rgba(8,8,6,0.72)'; c.fillRect(b.rx - w / 2 - 1, y - 1, w + 2, 5);
      c.fillStyle = f > 0.5 ? mix(TEAM_COLORS[q.owner] || '#888', '#7fe07a', 0.55) : f > 0.25 ? '#e0b640' : '#d9432f'; c.fillRect(b.rx - w / 2, y, w * f, 3);
      for (let k = 1; k < n; k++) { c.fillStyle = 'rgba(8,8,6,0.55)'; c.fillRect(b.rx - w / 2 + w * k / n - 0.3, y, 0.6, 3); }
      if (q.sel || !full) { c.font = '600 9px "Fira Sans Condensed", sans-serif'; c.textAlign = 'center'; c.lineWidth = 2.5; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.fillStyle = full ? '#f3ead2' : '#ffcf7a'; const t = q.mem.length + '/' + n; c.strokeText(t, b.rx + w / 2 + 9, y + 4); c.fillText(t, b.rx + w / 2 + 9, y + 4); }
      if (q.rank) { c.fillStyle = '#e6c25a'; for (let k = 0; k < q.rank; k++) { c.beginPath(); c.arc(b.rx - (q.rank - 1) * 3 + k * 6, y - 4, 1.8, 0, 7); c.fill(); } }
    }
    for (const e of S.ents) {
      if (!inView(e.rx, e.ry) || e.sq) continue;
      const dmg = e.hp < e.maxhp - 0.5;
      if (!(dmg || S.sel.has(e.id) || e.d.hero || (e.d.kind === 'b' && e.built < 1))) continue;
      const w = e.d.kind === 'b' ? e.r * 1.5 : e.d.hero ? 36 : e.d.sub === 'troll' ? 30 : 20;
      const y = e.d.kind === 'b' ? e.ry - (bld3(e.d, TEAM_COLORS[e.owner]) || bldSprite(e.d, TEAM_COLORS[e.owner])).oy + 6 : e.ry - (e.d.hero ? 60 : e.d.sub === 'troll' ? 78 : e.d.sub === 'cav' ? 62 : e.d.summon ? 70 : 46);
      const f = clamp(e.hp / e.maxhp, 0, 1);
      c.fillStyle = 'rgba(8,8,6,0.7)'; c.fillRect(e.rx - w / 2 - 1, y - 1, w + 2, 5);
      c.fillStyle = TEAM_COLORS[e.owner] === undefined ? '#ccc' : (f > 0.5 ? mix(TEAM_COLORS[e.owner], '#7fe07a', 0.55) : f > 0.25 ? '#e0b640' : '#d9432f'); c.fillRect(e.rx - w / 2, y, w * f, 3);
      if (e.d.kind === 'b' && e.built < 1) { c.fillStyle = '#9fd0ff'; c.fillRect(e.rx - w / 2, y + 4, w * e.built, 2); }
      if (e.d.hero) { c.font = '600 11px "Fira Sans Condensed", sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.fillStyle = '#f3ead2'; const t = e.d.heroName + ' · ' + e.lvl; c.strokeText(t, e.rx, y - 4); c.fillText(t, e.rx, y - 4); }
      else if (e.rank) { c.fillStyle = '#e6c25a'; for (let k = 0; k < e.rank; k++) { c.beginPath(); c.arc(e.rx - (e.rank - 1) * 3 + k * 6, y - 4, 1.8, 0, 7); c.fill(); } }
    }
    this.drawSky(S, now, rdt, vx0, vy0, vx1, vy1);
  }
  // screen-space: time of day, darkness with light sources, rain/snow, lightning, grading
  drawSky(S, now, rdt, vx0, vy0, vx1, vy1) {
    const c = this.c, env = this.env, cam = this.cam, dpr = this.dpr, W = this.cv.width, H = this.cv.height, wa = env.wAmt;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (env.tint) { c.globalCompositeOperation = 'soft-light'; c.fillStyle = 'rgba(' + env.tint[0] + ',' + env.tint[1] + ',' + env.tint[2] + ',' + env.tint[3].toFixed(3) + ')'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over'; }
    if (env.weather === 'rain' && wa > 0) { c.fillStyle = 'rgba(28,38,50,' + (0.24 * wa).toFixed(3) + ')'; c.fillRect(0, 0, W, H); }
    if (env.weather === 'fog' && wa > 0) { c.fillStyle = 'rgba(196,202,208,' + (0.2 * wa).toFixed(3) + ')'; c.fillRect(0, 0, W, H); }
    const dark = (1 - env.light) * 1.1 + (env.weather === 'rain' ? 0.06 * wa : 0);
    if (dark > 0.02) {
      const LW = Math.ceil(this.w / 2), LH = Math.ceil(this.h / 2);
      if (!this.lightCv || this.lightCv.width !== LW || this.lightCv.height !== LH) this.lightCv = mkCanvas(LW, LH);
      const L = this.lightCv, lc = L.getContext('2d');
      lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, LW, LH);
      lc.fillStyle = 'rgba(10,16,40,' + Math.min(0.68, dark).toFixed(3) + ')'; lc.fillRect(0, 0, LW, LH);
      lc.globalCompositeOperation = 'destination-out';
      const z = cam.z / 2, Ls = this.lights;
      for (let i = 0; i < Ls.length; i += 5) {
        const sx = (Ls[i] - cam.x) * z, sy = (Ls[i + 1] - cam.y) * z, rr = Ls[i + 2] * z;
        if (sx < -rr || sy < -rr || sx > LW + rr || sy > LH + rr) continue;
        const g = lc.createRadialGradient(sx, sy, 0, sx, sy, rr); g.addColorStop(0, 'rgba(0,0,0,' + Ls[i + 3] + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
        lc.fillStyle = g; lc.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
      }
      c.drawImage(L, 0, 0, W, H);
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < Ls.length; i += 5) {
        if (!Ls[i + 4]) continue;
        const sx = (Ls[i] - cam.x) * cam.z * dpr, sy = (Ls[i + 1] - cam.y) * cam.z * dpr, rr = Ls[i + 2] * cam.z * dpr * 0.7;
        if (sx < -rr || sy < -rr || sx > W + rr || sy > H + rr) continue;
        const g = c.createRadialGradient(sx, sy, 0, sx, sy, rr); g.addColorStop(0, 'rgba(255,150,60,' + (0.16 * Math.min(1, dark) * Ls[i + 3]).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,120,40,0)');
        c.fillStyle = g; c.fillRect(sx - rr, sy - rr, rr * 2, rr * 2);
      }
      c.globalCompositeOperation = 'source-over';
    }
    // precipitation (screen space)
    const want = env.weather === 'rain' ? Math.round(300 * wa) : env.weather === 'snow' ? Math.round(220 * wa) : 0;
    const snow = env.weather === 'snow';
    while (this.drops.length < want) this.drops.push({ x: Math.random() * W, y: Math.random() * H, v: 0.7 + Math.random() * 0.6, ph: Math.random() * 6.28 });
    if (this.drops.length > want) this.drops.length = want;
    if (this.drops.length) {
      c.lineCap = 'round';
      if (!snow) { c.strokeStyle = 'rgba(200,212,228,0.32)'; c.lineWidth = 1 * dpr; c.beginPath(); }
      for (const d of this.drops) {
        if (snow) { d.y += d.v * 40 * dpr * rdt; d.x += Math.sin(now * 1.3 + d.ph) * 14 * dpr * rdt + 8 * dpr * rdt; }
        else { d.y += d.v * 900 * dpr * rdt; d.x += d.v * 160 * dpr * rdt; }
        if (d.y > H) { d.y -= H + 20; d.x = Math.random() * W; } if (d.x > W) d.x -= W;
        if (snow) { c.fillStyle = 'rgba(245,248,252,' + (0.55 + d.v * 0.3).toFixed(2) + ')'; c.beginPath(); c.arc(d.x, d.y, (1 + d.v) * dpr, 0, 7); c.fill(); }
        else { c.moveTo(d.x, d.y); c.lineTo(d.x - d.v * 7 * dpr, d.y - d.v * 30 * dpr); }
      }
      if (!snow) c.stroke();
      if (!snow && wa > 0.3) for (let k = 0; k < 3; k++) { const x = vx0 + Math.random() * (vx1 - vx0), y = vy0 + Math.random() * (vy1 - vy0); this.emit({ x, y, vx: 0, vy: 0, life: 0.35, t: 0, k: 'splash', s: 3 + Math.random() * 3 }); }
      if (!snow && wa > 0.75 && Math.random() < rdt * 0.05) { this.flash = 1; if (this.onThunder) setTimeout(this.onThunder, 300 + Math.random() * 1200); }
    }
    if (this.flash > 0) { c.fillStyle = 'rgba(230,236,255,' + (this.flash * 0.45).toFixed(3) + ')'; c.fillRect(0, 0, W, H); this.flash = Math.max(0, this.flash - rdt * 4); }
    // grade + vignette
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.vign) { const g = c.createRadialGradient(this.w / 2, this.h * 0.45, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,10,6,0.55)'); const g2 = c.createLinearGradient(0, 0, 0, this.h); g2.addColorStop(0, 'rgba(255,214,150,0.07)'); g2.addColorStop(1, 'rgba(20,30,50,0.10)'); this.vign = [g, g2]; }
    c.fillStyle = this.vign[1]; c.fillRect(0, 0, this.w, this.h);
    c.fillStyle = this.vign[0]; c.fillRect(0, 0, this.w, this.h);
  }
  drawHull(q, col) {
    const c = this.c, pts = q.mem.map(m => [m.rx, m.ry]);
    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
    let h = convexHull(pts);
    if (h.length < 3) { const R = q.d.r * 2 + 6; ell(c, cx, cy, R * 1.2, R * 0.7, rgba(col, 0.1), col, 1.6); return; }
    const pad = q.d.r + 7;
    h = h.map(p => { const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1; return [p[0] + dx / d * pad, p[1] + dy / d * pad * 0.8 + 2]; });
    c.beginPath();
    const n = h.length, mid = i => [(h[i][0] + h[(i + 1) % n][0]) / 2, (h[i][1] + h[(i + 1) % n][1]) / 2];
    let m0 = mid(n - 1); c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const m1 = mid(i); c.quadraticCurveTo(h[i][0], h[i][1], m1[0], m1[1]); }
    c.closePath(); c.fillStyle = rgba(col, 0.08); c.fill(); c.lineWidth = 2; c.strokeStyle = rgba(col, 0.9); c.stroke();
    c.lineWidth = 5; c.strokeStyle = rgba(col, 0.18); c.stroke();
  }
  drawDecor(o, now) {
    const c = this.c;
    if (o.k === 't') { const s = treeSprite(o.v); const sway = Math.sin(now * 0.8 + o.x * 0.01) * 0.6; c.drawImage(s.cv, o.x - s.ox * o.s + sway, o.y - s.oy * o.s, s.w * o.s, s.h * o.s); }
    else if (o.k === 'r') { const s = rockSprite(o.v); c.drawImage(s.cv, o.x - s.ox * o.s, o.y - s.oy * o.s, s.w * o.s, s.h * o.s); }
    else if (o.k === 'p') { const h = o.broken ? 22 : 46; c.drawImage(shadowSprite(), o.x - 12, o.y - 6, 34, 12); rrect(c, o.x - 7, o.y - h, 14, h, 1, lg(c, o.x - 7, o.x + 7, '#b3ab9c', -0.45, 0.2)); for (let k = -5; k <= 5; k += 3.4) line(c, o.x + k, o.y - h + 2, o.x + k, o.y - 2, 'rgba(0,0,0,0.12)', 0.8); if (!o.broken) rrect(c, o.x - 10, o.y - h - 5, 20, 6, 1, lg(c, o.x - 10, o.x + 10, '#a39b8d', -0.45, 0.2)); else poly(c, [o.x - 7, o.y - h, o.x - 2, o.y - h - 5, o.x + 3, o.y - h + 1, o.x + 7, o.y - h - 2, o.x + 7, o.y - h + 3, o.x - 7, o.y - h + 3], '#a39b8d'); }
    else if (o.k === 'camp') {
      const s = campSprite(o.kind), fx = o.x, fy = o.y + 40;
      c.drawImage(s.cv, o.x - s.ox, o.y - s.oy, s.w, s.h);
      // fire pit
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; ell(c, fx + Math.cos(a) * 9, fy + Math.sin(a) * 4.5, 2.6, 1.8, '#6d665c'); }
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) { const fl = 0.7 + Math.sin(now * 13 + k * 2) * 0.3; c.drawImage(puff(k ? 'fire' : 'white'), fx - 6 * fl + (k - 1) * 3, fy - 16 * fl - 2, 12 * fl, 18 * fl); }
      c.restore();
      if (Math.random() < 0.3) this.emit({ x: fx + (Math.random() - 0.5) * 6, y: fy - 10, vx: (Math.random() - 0.5) * 6, vy: -24, life: 1.6, t: 0, k: 'smoke', s: 4 });
      this.addLight(fx, fy - 6, 150, 0.9, true);
      if (this.campAlive && this.campAlive[o.i]) { const ch = chestSprite(), gx = fx + 26, gy = fy + 10; c.drawImage(ch.cv, gx - ch.ox, gy - ch.oy, ch.w, ch.h); c.save(); c.globalCompositeOperation = 'lighter'; ell(c, gx, gy - 8, 6 + Math.sin(now * 3) * 1.5, 4, 'rgba(255,210,90,0.35)'); c.restore(); }
    }
  }
  drawEnt(e, now, rdt, S) {
    const c = this.c, col = TEAM_COLORS[e.owner] || '#888', env = this.env;
    if (e.d.kind === 'b') {
      const s = bld3(e.d, col) || bldSprite(e.d, col);
      if (e.built < 1) {
        c.save(); c.beginPath(); c.rect(e.rx - s.ox, e.ry - s.oy * (0.2 + 0.8 * e.built) - 4, s.w, s.h); c.clip();
        c.drawImage(s.cv, e.rx - s.ox, e.ry - s.oy, s.w, s.h); c.restore();
        c.strokeStyle = '#8a6a44'; c.lineWidth = 1.6;
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(e.rx + k * e.r * 0.7, e.ry + 2); c.lineTo(e.rx + k * e.r * 0.7, e.ry - e.r * 1.5); c.stroke(); }
        for (let y = 0; y < 3; y++) line(c, e.rx - e.r * 0.8, e.ry - e.r * 0.45 * (y + 1), e.rx + e.r * 0.8, e.ry - e.r * 0.45 * (y + 1), '#8a6a44', 1.4);
        if (Math.random() < 0.15) this.emit({ x: e.rx + (Math.random() - 0.5) * e.r, y: e.ry - 4, vx: (Math.random() - 0.5) * 10, vy: -12, life: 1, t: 0, k: 'dust', s: 5 });
        return;
      }
      c.drawImage(s.cv, e.rx - s.ox, e.ry - s.oy, s.w, s.h);
      this.addLight(e.rx, e.ry - e.r * 0.4, e.r * (e.d.sub === 'fort' ? 3.2 : 2.2), 0.85, true);
      if (e.d.forge && Math.random() < 0.35) this.emit({ x: e.rx + e.r * 0.36 + (Math.random() - 0.5) * 4, y: e.ry - e.r * 1.78, vx: 4 + Math.random() * 5, vy: -20 - Math.random() * 8, life: 2.6, t: 0, k: 'smoke', s: 4.5 });
      if (e.hp < e.maxhp * 0.6) {
        const sev = 1 - e.hp / e.maxhp;
        if (Math.random() < 0.35 * sev * 2) this.emit({ x: e.rx + (Math.random() - 0.5) * e.r * 1.2, y: e.ry - e.r * (0.6 + Math.random() * 0.6), vx: 4 + Math.random() * 6, vy: -18 - Math.random() * 10, life: 2.4, t: 0, k: 'smoke', s: 6 + e.r * 0.12 });
        if (e.hp < e.maxhp * 0.35 && Math.random() < 0.6) { this.emit({ x: e.rx + (Math.random() - 0.5) * e.r, y: e.ry - e.r * (0.4 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 6, vy: -26 - Math.random() * 14, life: 0.7, t: 0, k: 'fire', s: 4 + Math.random() * 4 }); this.addLight(e.rx, e.ry - e.r * 0.6, e.r * 2.5, 0.9, true); }
      }
      return;
    }
    const sc = unitScale(e.d);
    let frame = 0;
    if (e.atkT > 0) frame = e.atkT > 0.2 ? 8 : e.atkT > 0.1 ? 9 : 0;
    else if (e.moving) frame = 1 + (((now * (e.d.sub === 'cav' || e.d.sub === 'wolf' ? 9 : 7.5) + e.id * 0.37) | 0) % 6);
    else if (e.tgt && e.cd > 0 && e.cd < 0.28) frame = 7;
    const s = unitSprite(e.d, col, frame, this.cam.z * this.dpr * sc < 1.3, S.ups ? S.ups[e.owner] : 0);
    if (e.lhp !== undefined && e.hp < e.lhp - 0.5) { e.hitT = now; if (Math.random() < 0.5 && e.d.sub !== 'treant') for (let k = 0; k < 2; k++) this.emit({ x: e.rx + (Math.random() - 0.5) * 6, y: e.ry - 13 * sc, vx: (Math.random() - 0.5) * 50, vy: -25 - Math.random() * 30, life: 0.4, t: 0, k: 'blood', s: 1.3 }); }
    e.lhp = e.hp;
    const jolt = e.hitT && now - e.hitT < 0.12 ? (Math.random() - 0.5) * 2.2 : 0;
    const bob = e.moving ? Math.abs(Math.sin(now * 10 + e.id)) * 1.2 : 0;
    const lean = e.atkT > 0 ? Math.sin(clamp(e.atkT / 0.3, 0, 1) * Math.PI) * 3 : 0;
    const breathe = e.moving || e.atkT > 0 ? 1 : 1 + Math.sin(now * 2.2 + e.id) * 0.014;
    const wet = this.map.water(e.rx, e.ry) === 1;
    // 3D-baked figure facing one of 8 directions; the flat 2D sprite is only a stand-in while it bakes
    const dir = dirOf(e), up3 = S.ups ? S.ups[e.owner] : 0;
    let s3 = unit3(e.d, col, frame, dir, up3);
    if (!s3 && frame) s3 = SPR3.get(unit3Key(e.d, col, 0, dir, up3)) || null;
    for (let k2 = 1; k2 <= 4 && !s3; k2++) s3 = SPR3.get(unit3Key(e.d, col, 0, (dir + k2) % 8, up3)) || SPR3.get(unit3Key(e.d, col, 0, (dir + 8 - k2) % 8, up3)) || null;
    c.save();
    if (s3) {
      c.translate(e.rx + jolt, e.ry - bob * 0.4);
      if (e.stunned) c.rotate(Math.sin(now * 10) * 0.07);
      if (wet) { c.beginPath(); c.rect(-80, -200, 160, 200 - (e.d.sub === 'cav' ? 7 : 5)); c.clip(); }
      c.scale(1, breathe);
      c.drawImage(s3.cv, -s3.ox, -s3.oy, s3.w, s3.h);
    } else {
      c.translate(e.rx + lean * e.face + jolt, e.ry - bob);
      if (e.face < 0) c.scale(-1, 1);
      if (e.stunned) c.rotate(Math.sin(now * 10) * 0.07);
      if (wet) { c.beginPath(); c.rect(-60, -140, 120, 140 - (e.d.sub === 'cav' ? 7 : 5)); c.clip(); }
      c.scale(1, breathe);
      c.drawImage(s.cv, -s.ox * sc, -s.oy * sc, s.w * sc, s.h * sc);
    }
    c.restore();
    if (wet) {
      const ph = (now * 1.8 + e.id * 0.37) % 1;
      ell(c, e.rx, e.ry - 4, e.r * (1.1 + ph * 0.9), e.r * (0.4 + ph * 0.3), null, 'rgba(225,240,240,' + (0.55 * (1 - ph)).toFixed(2) + ')', 1);
      if (e.moving && Math.random() < 0.08) this.emit({ x: e.rx + (Math.random() - 0.5) * 8, y: e.ry - 4, vx: (Math.random() - 0.5) * 20, vy: -18, life: 0.35, t: 0, k: 'magic', col: '220,235,240', s: 1.6 });
    }
    if (e.d.worker && e.atkT > 0.22 && Math.random() < 0.5) for (let k = 0; k < 3; k++) this.emit({ x: e.rx + e.face * 10, y: e.ry - 8, vx: (Math.random() - 0.5) * 60 + e.face * 20, vy: -30 - Math.random() * 40, life: 0.35, t: 0, k: 'spark', s: 1.2 });
    if (e.moving && (e.d.sub === 'cav' || e.d.sub === 'troll') && Math.random() < 0.2) this.emit({ x: e.rx - e.face * 10, y: e.ry - 2, vx: -e.face * 8, vy: -6, life: 0.8, t: 0, k: 'dust', s: 4 });
    if (e.stunned) for (let k = 0; k < 3; k++) { const a = now * 5 + k * 2.1; ell(c, e.rx + Math.cos(a) * 8, e.ry - 44 * sc + Math.sin(a) * 2.5, 1.8, 1.8, '#ffe86a'); }
    if (e.buffGlow) { c.save(); c.globalCompositeOperation = 'lighter'; ell(c, e.rx, e.ry - 2, e.r * 1.3, e.r * 0.55, 'rgba(255,200,90,0.16)'); c.restore(); }
    if (e.d.hero) this.addLight(e.rx, e.ry - 20, 90, 0.55, false);
    const q = e.sq && this.SQ ? this.SQ.get(e.sq) : null;
    if (q && q.b === e) this.drawBanner(e, col, now, sc, S.ups ? S.ups[e.owner] : 0);
  }
  // battalion standard carried above the formation (torch-lit at night)
  drawBanner(e, col, now, sc, up) {
    const c = this.c, race = e.d.race, x = e.rx - 5 * e.face, top = e.ry - (e.d.sub === 'cav' ? 70 : 52) * (sc / 0.82), wv = Math.sin(now * 3.2 + e.id) * 2.2;
    const big = (up | 0) & 8 ? 1.25 : 1;
    line(c, x, e.ry - 14, x, top, '#3b2c1f', 1.5);
    const f = e.face < 0 ? -1 : 1, fx = x - f * 1;
    c.save(); c.translate(fx, top); c.scale(big, big); c.translate(-fx, -top);
    c.beginPath();
    if (race === 'elf') { c.moveTo(fx, top + 1); c.quadraticCurveTo(fx - f * 9, top + 2 + wv, fx - f * 20, top + 6 + wv); c.quadraticCurveTo(fx - f * 9, top + 8 + wv * 0.5, fx, top + 12); }
    else if (race === 'orc') { c.moveTo(fx, top + 1); c.lineTo(fx - f * 13, top + 2 + wv * 0.6); c.lineTo(fx - f * 12, top + 8 + wv); c.lineTo(fx - f * 14, top + 15 + wv); c.lineTo(fx - f * 9, top + 12 + wv); c.lineTo(fx - f * 5, top + 16 + wv * 0.5); c.lineTo(fx, top + 13); }
    else { c.moveTo(fx, top + 1); c.quadraticCurveTo(fx - f * 7, top + wv * 0.5, fx - f * 14, top + 1 + wv); c.lineTo(fx - f * 14, top + (race === 'dwf' ? 14 : 17) + wv); if (race === 'hum') c.lineTo(fx - f * 7, top + 14 + wv); c.lineTo(fx, top + (race === 'dwf' ? 14 : 17)); }
    c.closePath();
    c.fillStyle = race === 'orc' ? '#4a3527' : vg(c, top, top + 17, col, -0.45, 0.2); c.fill();
    if (race === 'orc') { c.save(); c.clip(); c.fillStyle = rgba(col, 0.85); c.fillRect(fx - f * 16 - 2, top + 3 + wv * 0.8, 20, 5); c.restore(); }
    c.lineWidth = big > 1 ? 1.4 : 0.8; c.strokeStyle = big > 1 ? '#e8c65a' : race === 'hum' || race === 'dwf' ? '#d8b85a' : 'rgba(0,0,0,0.4)'; c.stroke();
    const ex = fx - f * 7, ey = top + 7 + wv * 0.7;
    if (race === 'hum') { line(c, ex, ey - 4, ex, ey + 4, '#f1ece0', 1.3); line(c, ex - 3, ey - 1, ex + 3, ey - 1, '#f1ece0', 1.3); }
    else if (race === 'dwf') { rrect(c, ex - 3, ey - 3, 6, 3, 0.5, '#e0c068'); line(c, ex, ey, ex, ey + 4, '#e0c068', 1.1); }
    else if (race === 'elf') ell(c, fx - f * 6, top + 6 + wv * 0.6, 2, 1.3, '#f0dc8a');
    c.restore();
    ell(c, x, top - 1, 1.4, 1.4, race === 'orc' ? '#d8d0bc' : '#d4a73c');
    if (this.env && this.env.night > 0.15) {
      const tx = x + f * 9, ty = e.ry - 34;
      line(c, tx, ty + 10, tx, ty, '#3b2c1f', 1.2);
      c.save(); c.globalCompositeOperation = 'lighter'; const fl = 0.8 + Math.sin(now * 14 + e.id) * 0.2; c.drawImage(puff('fire'), tx - 4 * fl, ty - 10 * fl, 8 * fl, 12 * fl); c.restore();
      this.addLight(tx, ty, 110, 0.85, true);
    }
  }
  drawParts(dt) {
    const c = this.c;
    this.parts = this.parts.filter(p => (p.t += dt) < p.life);
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; const a = p.t / p.life;
      if (p.k === 'smoke') { const r2 = p.s * (1.2 + a * 2.2); c.globalAlpha = 0.45 * (1 - a) * Math.min(1, p.t * 4); c.drawImage(puff('smoke'), p.x - r2, p.y - r2, r2 * 2, r2 * 2); c.globalAlpha = 1; }
      else if (p.k === 'dust') { const r2 = p.s * (1.2 + a * 1.6); c.globalAlpha = 0.45 * (1 - a); c.drawImage(puff('dust'), p.x - r2, p.y - r2 * 0.6, r2 * 2, r2 * 1.2); c.globalAlpha = 1; }
      else if (p.k === 'blood') { p.vy += 160 * dt; ell(c, p.x, p.y, p.s, p.s * 0.8, 'rgba(120,14,10,' + (0.9 * (1 - a)).toFixed(2) + ')'); }
      else if (p.k === 'splash') { ell(c, p.x, p.y, p.s * (0.4 + a), p.s * 0.4 * (0.4 + a), null, 'rgba(210,222,235,' + (0.5 * (1 - a)).toFixed(2) + ')', 0.8); }
      else if (p.k === 'fire' || p.k === 'spark' || p.k === 'magic') {
        c.save(); c.globalCompositeOperation = 'lighter';
        const col = p.k === 'magic' ? p.col : a < 0.3 ? '255,230,160' : a < 0.6 ? '255,150,60' : '200,60,20';
        const r2 = p.s * (1 - a * 0.5) * 1.6;
        if (p.k === 'fire') { c.globalAlpha = 0.9 * (1 - a); c.drawImage(puff(a < 0.4 ? 'white' : 'fire'), p.x - r2, p.y - r2 * 1.3, r2 * 2, r2 * 2.6); c.globalAlpha = 1; }
        else ell(c, p.x, p.y, r2 * 0.6, r2 * 0.6, 'rgba(' + col + ',' + (0.8 * (1 - a)) + ')');
        c.restore();
      }
    }
  }
  drawFx(fxs, now) {
    const c = this.c;
    for (const f of fxs) {
      const a = (now - f.t0) / f.dur;
      if (a < 0 || a > 1.4) continue;
      const col = FX_COLORS[f.c] || null;
      switch (f.k) {
        case 'arrow': case 'bolt': case 'javelin': case 'farrow': {
          if (a > 1) { if (!f.hitDone) { f.hitDone = 1; for (let k = 0; k < 3; k++) this.emit({ x: f.x2, y: f.y2, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, life: 0.3, t: 0, k: f.k === 'farrow' ? 'spark' : 'dust', s: 1.6 }); } break; }
          const arc = Math.min(70, Math.hypot(f.x2 - f.x, f.y2 - f.y) * 0.2);
          const P = t => [f.x + (f.x2 - f.x) * t, f.y + (f.y2 - f.y) * t - Math.sin(t * Math.PI) * arc];
          const [x, y] = P(a), [x0, y0] = P(Math.max(0, a - 0.05));
          const ang = Math.atan2(y - y0, x - x0);
          if (f.k === 'farrow') {
            const silver = f.c === 'star', tc = silver ? '210,235,255' : '255,150,50';
            c.save(); c.globalCompositeOperation = 'lighter';
            const [xt, yt] = P(Math.max(0, a - 0.14));
            const g = c.createLinearGradient(xt, yt, x, y); g.addColorStop(0, 'rgba(' + tc + ',0)'); g.addColorStop(1, 'rgba(' + tc + ',0.8)');
            c.strokeStyle = g; c.lineWidth = 2.2; c.beginPath(); c.moveTo(xt, yt); c.lineTo(x, y); c.stroke();
            ell(c, x, y, 3, 3, 'rgba(' + tc + ',0.9)'); c.restore();
            this.addLight(x, y, 40, 0.5, !silver);
            break;
          }
          c.save(); c.translate(x, y); c.rotate(ang);
          const len = f.k === 'javelin' ? 16 : f.k === 'bolt' ? 8 : 12;
          line(c, -len, 0, 0, 0, f.k === 'javelin' ? '#6b4a2a' : '#8a6a44', f.k === 'arrow' ? 1 : 1.5);
          poly(c, [0, -1.3, 3, 0, 0, 1.3], '#b8bec4');
          if (f.k !== 'javelin') { poly(c, [-len, 0, -len - 3, -2, -len + 2, 0], '#e8e2d2'); poly(c, [-len, 0, -len - 3, 2, -len + 2, 0], '#d8cfbd'); }
          c.restore();
          break;
        }
        case 'holy': case 'leaf': case 'rune': case 'shadow': case 'fireball': case 'hammer': {
          if (a > 1) break;
          const x = f.x + (f.x2 - f.x) * a, y = f.y + (f.y2 - f.y) * a - Math.sin(a * Math.PI) * 20;
          const cc = { holy: '255,240,180', leaf: '160,255,130', rune: '255,180,90', shadow: '185,140,255', fireball: '255,140,60', hammer: '170,200,255' }[f.k];
          const RR = f.big ? 30 : f.k === 'fireball' ? 12 : 8;
          c.save(); c.globalCompositeOperation = 'lighter';
          const g = c.createRadialGradient(x, y, 0, x, y, RR); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.3, 'rgba(' + cc + ',0.85)'); g.addColorStop(1, 'rgba(' + cc + ',0)');
          c.fillStyle = g; c.beginPath(); c.arc(x, y, RR, 0, 7); c.fill(); c.restore();
          this.addLight(x, y, RR * 6, 0.9, f.k === 'fireball' || f.k === 'rune');
          if (Math.random() < 0.8) this.emit({ x, y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.4, t: 0, k: f.k === 'fireball' ? 'fire' : 'magic', col: cc, s: RR * 0.4 });
          if (f.k === 'hammer') { c.save(); c.translate(x, y); c.rotate(now * 18); rrect(c, -6, -3.5, 12, 7, 1.5, metal(c, -6, 6, '#a8afb6')); c.restore(); }
          break;
        }
        case 'star': {
          if (a > 1) break;
          const x = f.x + (f.x2 - f.x) * a, y = f.y + (f.y2 - f.y) * a;
          const cc = col || '#bfe3ff';
          c.save(); c.globalCompositeOperation = 'lighter'; line(c, x - (f.x2 - f.x) * 0.18, y - (f.y2 - f.y) * 0.18, x, y, rgba(cc.startsWith('#') ? cc : '#bfe3ff', 0.7), 3); ell(c, x, y, 3.5, 3.5, '#fff'); c.restore();
          this.addLight(x, y, 50, 0.7, false);
          break;
        }
        case 'boom': {
          const cc = col || '#ffd27a'; const r = f.p * (0.35 + 0.65 * Math.min(1, a * 1.6));
          if (!f.pDone) {
            f.pDone = 1;
            if (f.p >= 40) this.addDecal('crater', f.x, f.y, clamp(f.p * 0.5, 18, 95), now);
            const n = Math.min(40, 10 + f.p / 5); for (let k = 0; k < n; k++) { const an = Math.random() * 6.28, sp = 40 + Math.random() * f.p * 1.2; this.emit({ x: f.x, y: f.y - 6, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * 0.5 - 20, life: 0.4 + Math.random() * 0.4, t: 0, k: 'fire', s: 1.5 + Math.random() * 2.5 }); }
            for (let k = 0; k < 5; k++) this.emit({ x: f.x + (Math.random() - 0.5) * f.p, y: f.y + (Math.random() - 0.5) * f.p * 0.5, vx: (Math.random() - 0.5) * 10, vy: -15, life: 1.6, t: 0, k: 'smoke', s: 6 });
          }
          if (a < 1) this.addLight(f.x, f.y, f.p * 1.8, 1 - a, true);
          c.save(); c.globalAlpha = Math.max(0, 1 - a);
          ell(c, f.x, f.y, r, r * 0.55, null, cc, 3);
          c.globalCompositeOperation = 'lighter';
          ell(c, f.x, f.y, r * 0.85, r * 0.47, rgba(cc.startsWith('#') ? cc : '#ffd27a', 0.25));
          if (a < 0.35) { const g = c.createRadialGradient(f.x, f.y - 10, 0, f.x, f.y - 10, f.p * 0.8); g.addColorStop(0, 'rgba(255,250,220,0.9)'); g.addColorStop(1, 'rgba(255,180,90,0)'); c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y - 10, f.p * 0.8, 0, 7); c.fill(); }
          c.restore();
          break;
        }
        case 'heal': case 'buff': case 'debuff': case 'summon': case 'lvl': {
          const cc = { heal: '120,255,160', buff: '255,215,110', debuff: '190,120,255', summon: '150,255,130', lvl: '255,225,120' }[f.k];
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.max(0, 1 - a);
          if (f.k === 'lvl') { const g = c.createLinearGradient(f.x, f.y - 100, f.x, f.y); g.addColorStop(0, 'rgba(' + cc + ',0)'); g.addColorStop(1, 'rgba(' + cc + ',0.6)'); c.fillStyle = g; c.fillRect(f.x - 14, f.y - 100, 28, 100); }
          else ell(c, f.x, f.y, f.p * (0.5 + a * 0.5), f.p * 0.55 * (0.5 + a * 0.5), 'rgba(' + cc + ',0.12)', 'rgba(' + cc + ',0.7)', 2.5);
          c.restore();
          if (a < 1) this.addLight(f.x, f.y, (f.p || 40) * 1.4, 0.6 * (1 - a), false);
          if (Math.random() < 0.7) { const an = Math.random() * 6.28, rr = Math.random() * (f.p || 20) * 0.8; this.emit({ x: f.x + Math.cos(an) * rr, y: f.y + Math.sin(an) * rr * 0.5, vx: 0, vy: -30, life: 0.8, t: 0, k: 'magic', col: cc, s: 2.4 }); }
          break;
        }
        case 'dash': {
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.max(0, 1 - a); line(c, f.x, f.y - 15, f.x2, f.y2 - 15, 'rgba(255,230,190,0.5)', 9); line(c, f.x, f.y - 15, f.x2, f.y2 - 15, 'rgba(255,255,255,0.8)', 2); c.restore();
          if (!f.pDone) { f.pDone = 1; for (let k = 0; k < 10; k++) this.emit({ x: f.x + (f.x2 - f.x) * k / 10, y: f.y + (f.y2 - f.y) * k / 10, vx: (Math.random() - 0.5) * 20, vy: -8, life: 0.8, t: 0, k: 'dust', s: 6 }); }
          break;
        }
      }
    }
  }
  // round, parchment-framed minimap (BFME style); the map is inset so every base stays inside the circle
  miniXf(W) { const R = W / 2, s = 2 * R * 0.93 / MAP_W; return { s, ox: R - MAP_W * s / 2, oy: R - MAP_H * s / 2 }; }
  miniToWorld(fx, fy, W) { const X = this.miniXf(W); return { x: clamp((fx * W - X.ox) / X.s, 0, MAP_W), y: clamp((fy * W - X.oy) / X.s, 0, MAP_H) }; }
  drawMini(mc, S) {
    const c = mc.getContext('2d'), W = mc.width, R = W / 2, X = this.miniXf(W);
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, W);
    c.save(); c.beginPath(); c.arc(R, R, R - 1, 0, 7); c.clip();
    const g = c.createRadialGradient(R, R, R * 0.2, R, R, R); g.addColorStop(0, '#c9b286'); g.addColorStop(1, '#7d6440'); c.fillStyle = g; c.fillRect(0, 0, W, W);
    c.drawImage(this.terrain.cv, X.ox, X.oy, MAP_W * X.s, MAP_H * X.s);
    c.fillStyle = 'rgba(140,105,50,0.16)'; c.fillRect(X.ox, X.oy, MAP_W * X.s, MAP_H * X.s);
    const P = (x, y) => [X.ox + x * X.s, X.oy + y * X.s];
    this.map.camps.forEach((cp, i) => { if (this.campAlive && !this.campAlive[i]) return; const [x, y] = P(cp[0], cp[1]); c.beginPath(); c.arc(x, y, 3.2, 0, 7); c.fillStyle = '#3a3128'; c.fill(); c.strokeStyle = '#d8cfb8'; c.lineWidth = 1; c.stroke(); });
    for (const e of S.ents) {
      if (e.owner === NEUTRAL) continue;
      c.fillStyle = TEAM_COLORS[e.owner] || '#aaa'; const [x, y] = P(e.rx, e.ry);
      if (e.d.kind === 'b') { const s = Math.max(4, e.r * X.s * 2); c.fillRect(x - s / 2, y - s / 2, s, s); c.strokeStyle = '#000'; c.lineWidth = 0.8; c.strokeRect(x - s / 2, y - s / 2, s, s); }
      else { const s = e.d.hero ? 5 : 2.6; c.fillRect(x - s / 2, y - s / 2, s, s); }
    }
    if (S.outposts) for (const op of S.outposts) { const [x, y] = P(op.x, op.y); c.beginPath(); c.arc(x, y, 4.5, 0, 7); c.fillStyle = op.owner >= 0 ? TEAM_COLORS[op.owner] : '#e8e0cc'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); }
    if (S.alerts) { const t = performance.now() / 1000; for (const al of S.alerts) { const a = (t - al.t) / 3; if (a > 1) continue; const [x, y] = P(al.x, al.y); c.beginPath(); c.arc(x, y, 4 + a * 14, 0, 7); c.strokeStyle = 'rgba(255,70,50,' + (1 - a) + ')'; c.lineWidth = 2; c.stroke(); } }
    const cam = this.cam, [cx, cy] = P(cam.x, cam.y);
    c.strokeStyle = '#fff'; c.lineWidth = 1.4;
    if (this.viewQuad) { const q = this.viewQuad(); c.beginPath(); q.forEach((w, i) => { const [x, y] = P(clamp(w.x, -200, MAP_W + 200), clamp(w.y, -200, MAP_H + 200)); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.closePath(); c.stroke(); }
    else c.strokeRect(cx, cy, this.w / cam.z * X.s, (this.h - (this.padB || 0)) / cam.z * X.s);
    const sh = c.createRadialGradient(R, R, R * 0.72, R, R, R); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(20,12,4,0.55)'); c.fillStyle = sh; c.fillRect(0, 0, W, W);
    c.restore();
  }
}
