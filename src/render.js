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
  else if (kind === 'club') { c.beginPath(); c.moveTo(-1, 4); c.lineTo(1, 4); c.lineTo(2.6, -18); c.quadraticCurveTo(0, -22, -2.6, -18); c.closePath(); c.fillStyle = lg(c, -3, 3, '#5a3d24'); c.fill(); for (let k = 0; k < 3; k++) line(c, 1.8, -8 - k * 4, 4, -9 - k * 4, '#bbb', 0.8); }
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
  // tabard / sash in team color
  if (cfg.tabard !== false) { c.beginPath(); c.moveTo(-3.2, shY + 1); c.lineTo(3.2, shY + 1); c.lineTo(3.6, hipY + 5); c.lineTo(0, hipY + 7); c.lineTo(-3.6, hipY + 5); c.closePath(); c.fillStyle = lg(c, -3, 3, color, -0.45, 0.2); c.fill(); }
  if (cfg.robe) { c.beginPath(); c.moveTo(-3.9, hipY + 1); c.lineTo(3.9, hipY + 1); c.lineTo(5 + walk, -1); c.lineTo(-5 + walk, -1); c.closePath(); c.fillStyle = lg(c, -5, 5, cfg.robe, -0.5, 0.15); c.fill(); line(c, -2.5, shY + 2, 2.5, hipY + 1, rgba(color, 0.9), 1.6); }
  line(c, -4.9, hipY + 1.5, 4.9, hipY + 1.5, shade(L.leather, -0.2), 1.8);
  // front leg
  if (!cfg.robe) { const fl = legPath(c, 1.6, hipY, walk * 0.45, 16, legCol, 4.8); ell(c, fl[0] + 1.2, fl[1] - 0.6, 2.5, 1.4, bootCol); }
  // head
  c.save(); c.translate(0.4, headY); c.scale(1.15, 1.15); drawHelmHead(c, race, 0, 0, L, cfg); c.restore();
  // shoulders
  ell(c, -4.4, shY + 1, 3, 2.5, metal(c, -7, -1, cfg.armor || L.steel)); ell(c, 4.4, shY + 1, 2.6, 2.2, metal(c, 2, 7, cfg.armor || L.steel));
  // shield (front)
  if (cfg.shield) drawShield(c, race, color, -3.2 + atk * 1.5, -21, cfg.shieldScale || 0.9);
  // ranged weapons in front
  if (cfg.weapon === 'bow') { line(c, 1, shY + 2, 7, -24, shade(L.cloth, -0.1), 2.4); drawBow(c, 8, -24, atk > 0.1, L, race); }
  if (cfg.weapon === 'xbow') { line(c, 1, shY + 2, 5, -23, shade(L.cloth, -0.1), 2.4); drawXbow(c, 3, -23, L); }
  if (cfg.weapon === 'javelin') { const a = -0.3 - atk * 1.2; line(c, 1, shY + 2, 3 + Math.cos(a) * 4, -26 + Math.sin(a) * 5, shade(L.cloth, -0.1), 2.4); c.save(); c.translate(4, -28 - atk * 4); c.rotate(0.9 - atk * 0.6); line(c, 0, 10, 0, -18, '#7a5634', 1.3); poly(c, [-1, -18, 0, -22, 1, -18], '#9aa0a6'); c.restore(); }
  c.restore();
}
function drawMount(c, race, color, pose) {
  const walk = pose.walk || 0;
  const body = { hum: '#5b3b25', elf: '#a8794a', dwf: '#3b2e28', orc: '#6a6660' }[race];
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
    poly(c, [-6, -22, 5, -21, 6, -15, -6, -15], rgba(color, 0.85));
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
  hum: { inf: { weapon: 'sword', shield: true }, spear: { weapon: 'spear', shield: true, shieldScale: 0.75 }, arch: { weapon: 'bow', quiver: true, armor: '#7a6a55', mail: false }, cav: { weapon: 'spear' } },
  elf: { inf: { weapon: 'sword', shield: true }, spear: { weapon: 'spear', shield: true, shieldScale: 0.75 }, arch: { weapon: 'bow', quiver: true, armor: '#5d6b4c', mail: false, bare: true }, cav: { weapon: 'spear', bare: true } },
  dwf: { inf: { weapon: 'axe', shield: true }, spear: { weapon: 'halberd' }, arch: { weapon: 'xbow' }, cav: { weapon: 'axe' } },
  orc: { inf: { weapon: 'cleaver', shield: true }, spear: { weapon: 'spear', shield: true, shieldScale: 0.75 }, arch: { weapon: 'javelin', mail: false, armor: '#4a3e33' }, cav: { weapon: 'cleaver' } },
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
const FRAMES = 4; // 0 idle, 1-2 walk, 3 attack
function unitSprite(d, color, frame) {
  frame = frame | 0;
  const key = d.key + color + frame;
  if (SPR.has(key)) return SPR.get(key);
  const S = 3, W = 72, H = 82;
  const cv = mkCanvas(W * S, H * S), c = cv.getContext('2d');
  c.scale(S, S); c.translate(W / 2 - 2, H - 6); c.lineJoin = 'round'; c.lineCap = 'round';
  const pose = { walk: frame === 1 ? 1 : frame === 2 ? -1 : 0, atk: frame === 3 ? 1 : 0 };
  const race = d.race;
  if (d.summon) {
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
    if (cfg.weapon === 'staff') { /* orb glow color */ }
  } else if (d.sub === 'cav') {
    const top = drawMount(c, race, color, pose);
    c.save(); c.translate(-1, top + 13); c.scale(0.86, 0.86);
    const cfg = Object.assign({}, UNIT_CFG[race].cav); drawSoldier(c, race, color, Object.assign(cfg, { shield: race === 'hum', shieldScale: 0.7 }), { walk: 0, atk: pose.atk });
    c.restore();
  } else {
    drawSoldier(c, race, color, UNIT_CFG[race][d.sub], pose);
  }
  if (d.hero && HERO_CFG[d.key] && HERO_CFG[d.key].weapon === 'staff') {
    // recolor orb glow by hero
    const gc = HERO_CFG[d.key].glowCol; if (gc) { c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(9, -48, 0, 9, -48, 8); g.addColorStop(0, rgba(gc, 0.8)); g.addColorStop(1, rgba(gc, 0)); c.fillStyle = g; c.beginPath(); c.arc(9, -48, 8, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; }
  }
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
    case 'tower': {
      if (race === 'hum') { cyl(0, 0, r * 0.72, r * 2.3, 'cone'); windowA(-3, -r * 1.7, 5, 8, true); windowA(-3, -r * 0.9, 5, 8, false); banner(0, -r * 2.3 - r * 1.3, 14); }
      else if (race === 'elf') { cyl(0, 0, r * 0.5, r * 2.9, 'spire'); line(c, -r * 0.5, -r * 2.2, r * 0.5, -r * 2.2, A.trim, 1.5); windowA(-2.5, -r * 1.9, 5, 9, true); banner(0, -r * 2.9 - r * 1.7, 12); }
      else if (race === 'dwf') { box(-r * 0.75, r * 1.5, r * 1.9, r * 0.8, 0, null, shade(A.stone, -0.25)); crenel(-r * 0.75, r * 1.5, -r * 1.9, 0); windowA(-3, -r * 1.3, 6, 6, true); brazier(r * 0.2, -r * 1.9 + 2); banner(-r * 0.5, -r * 1.9 - 3, 13); }
      else { for (const x of [-r * 0.6, r * 0.6]) line(c, x, 0, x * 0.7, -r * 2.1, '#4a3524', 3); line(c, -r * 0.6, -r * 0.8, r * 0.6, -r * 1.4, '#4a3524', 2); line(c, r * 0.6, -r * 0.8, -r * 0.6, -r * 1.4, '#4a3524', 2);
        box(-r * 0.7, r * 1.4, r * 0.7, r * 0.8, -r * 2.0, woodP); gable(-r * 0.7, r * 1.4, -r * 2.7, r * 0.8, r * 0.6, 3); brazier(0, -r * 2.0); banner(r * 0.5, -r * 3.4, 12); }
      break;
    }
  }
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
  const conifer = v % 3 === 0;
  if (conifer) {
    line(c, 0, 0, 0, -30, lg(c, -3, 3, '#4a3424'), 4.5);
    const tiers = 6;
    for (let t = 0; t < tiers; t++) {
      const y = -14 - t * 13, w = 26 - t * 3.6;
      for (let k = 0; k < 70; k++) {
        const fx = (r() * 2 - 1), x = fx * w, yy = y - r() * 14 + Math.abs(fx) * 6;
        const light = clamp(0.45 - fx * 0.35 + (t / tiers) * 0.25 + (r() - 0.5) * 0.3, 0, 1);
        line(c, x * 0.3, yy - 8, x, yy, mix('#12281c', '#4e7a4a', light), 1.8);
      }
    }
  } else {
    const trunk = v % 3 === 1 ? '#4d3a2b' : '#6e6558';
    c.beginPath(); c.moveTo(-3.5, 0); c.quadraticCurveTo(-2, -20, -1.5, -34); c.lineTo(1.5, -34); c.quadraticCurveTo(2, -20, 3.5, 0); c.closePath(); c.fillStyle = lg(c, -4, 4, trunk, -0.5, 0.2); c.fill();
    line(c, -1, -26, -9, -40, lg(c, -9, -1, trunk), 2); line(c, 1, -30, 9, -44, lg(c, 1, 9, trunk), 2);
    const base = v % 3 === 1 ? ['#1d3a1c', '#6e9a45'] : ['#27401f', '#8aa650'];
    const cx = 0, cy = -56, rx = 30, ry = 26;
    const blobs = [];
    for (let k = 0; k < 150; k++) { const a = r() * 6.283, d = Math.sqrt(r()); blobs.push({ x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, rr: 3 + r() * 5 }); }
    blobs.sort((a, b) => a.y - b.y);
    // dark back mass
    ell(c, cx, cy + 3, rx * 0.95, ry * 0.9, base[0]);
    for (const b of blobs) {
      const light = clamp(0.5 - (b.x - cx) / rx * 0.3 - (b.y - cy) / ry * 0.35 + (r() - 0.5) * 0.25, 0, 1);
      ell(c, b.x, b.y, b.rr, b.rr * 0.85, mix(base[0], base[1], light));
    }
    for (let k = 0; k < 30; k++) { const a = r() * 6.283, d = r(); ell(c, cx - 8 + Math.cos(a) * rx * 0.5 * d, cy - 10 + Math.sin(a) * ry * 0.4 * d, 1.6, 1.3, rgba('#c8d88a', 0.35)); }
  }
  const spr = { cv, w: W, h: H, ox: W / 2, oy: H - 8 }; SPR.set(key, spr); return spr;
}
function rockSprite(v) {
  const key = 'rock' + v; if (SPR.has(key)) return SPR.get(key);
  const S = 2, W = 50, H = 38;
  const cv = mkCanvas(W * S, H * S), c = cv.getContext('2d'); c.scale(S, S); c.translate(W / 2, H - 6);
  const col = v ? '#7d766c' : '#6e7174';
  poly(c, [-17, 0, -14, -12, -5, -20, 7, -18, 16, -7, 14, 1], lg(c, -17, 16, col, -0.5, 0.25));
  poly(c, [-10, -12, -5, -19, 6, -16, 1, -10], rgba('#ffffff', 0.12));
  line(c, -3, -14, 2, -4, 'rgba(0,0,0,0.3)', 0.8);
  ell(c, -10, -3, 5, 2.2, rgba('#5f7a3a', 0.7)); ell(c, 8, -1, 4, 1.8, rgba('#5f7a3a', 0.6));
  const spr = { cv, w: W, h: H, ox: W / 2, oy: H - 6 }; SPR.set(key, spr); return spr;
}
function tuftSprite(v) {
  const key = 'tuft' + v; if (SPR.has(key)) return SPR.get(key);
  const S = 2, W = 20, H = 16, cv = mkCanvas(W * S, H * S), c = cv.getContext('2d'); c.scale(S, S); c.translate(W / 2, H - 2);
  const r = mkRng(v * 17 + 3);
  if (v < 4) { for (let k = 0; k < 14; k++) { const x = (r() - 0.5) * 10; line(c, x, 0, x + (r() - 0.5) * 6, -5 - r() * 8, mix('#2e4a1c', '#8ea456', r()), 0.9); } }
  else if (v < 6) { ell(c, 0, -1, 3.5, 2.2, lg(c, -3, 3, '#8a847a')); ell(c, 4, 0, 2, 1.3, lg(c, 2, 6, '#7a756c')); }
  else { for (let k = 0; k < 8; k++) { const x = (r() - 0.5) * 10; line(c, x, 0, x, -4 - r() * 4, '#4c6a2e', 0.7); ell(c, x, -5 - r() * 4, 1, 1, v === 6 ? '#e8e2f2' : '#e2c14a'); } }
  const spr = { cv, w: W, h: H, ox: W / 2, oy: H - 2 }; SPR.set(key, spr); return spr;
}

// ================= TERRAIN =================
function sampleQuad(ax, ay, mx, my, bx, by, n) { const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push([(1 - t) * (1 - t) * ax + 2 * (1 - t) * t * mx + t * t * bx, (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * my + t * t * by]); } return pts; }
function buildTerrain(seed) {
  const sc = 0.5, W = MAP_W * sc, H = MAP_H * sc;
  const r = mkRng(seed * 7 + 3);
  // road & clearing mask
  const mask = mkCanvas(W, H), m = mask.getContext('2d');
  const roads = [];
  const C = [MAP_W / 2, MAP_H / 2];
  const addRoad = (a, b) => roads.push(sampleQuad(a[0], a[1], (a[0] + b[0]) / 2 + (r() - 0.5) * 500, (a[1] + b[1]) / 2 + (r() - 0.5) * 300, b[0], b[1], 40));
  for (const s of START_POS) addRoad(s, C);
  addRoad(START_POS[0], START_POS[2]); addRoad(START_POS[1], START_POS[3]);
  addRoad(OUTPOSTS[3], START_POS[0]); addRoad(OUTPOSTS[4], START_POS[1]);
  m.lineCap = 'round'; m.lineJoin = 'round';
  for (const [w, a] of [[30, 0.16], [22, 0.3], [15, 0.45], [10, 0.6]]) { m.strokeStyle = 'rgba(255,0,0,' + a + ')'; m.lineWidth = w; for (const rd of roads) { m.beginPath(); rd.forEach((p, i) => i ? m.lineTo(p[0] * sc, p[1] * sc) : m.moveTo(p[0] * sc, p[1] * sc)); m.stroke(); } }
  for (const s of [...START_POS, ...OUTPOSTS]) { const big = START_POS.includes(s); const g = m.createRadialGradient(s[0] * sc, s[1] * sc, 0, s[0] * sc, s[1] * sc, (big ? 115 : 60)); g.addColorStop(0, 'rgba(0,255,0,0.5)'); g.addColorStop(1, 'rgba(0,255,0,0)'); m.fillStyle = g; m.globalCompositeOperation = 'lighter'; m.beginPath(); m.arc(s[0] * sc, s[1] * sc, big ? 115 : 60, 0, 7); m.fill(); m.globalCompositeOperation = 'source-over'; }
  const md = m.getImageData(0, 0, W, H).data;
  const N = makeNoise(seed * 3 + 11), N2 = makeNoise(seed * 5 + 29);
  // height field
  const Q = 4, GW = Math.ceil(W / Q) + 2, GH = Math.ceil(H / Q) + 2;
  const hg = new Float32Array(GW * GH), mg = new Float32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { hg[y * GW + x] = N.fbm(x * Q / 110, y * Q / 110, 5); mg[y * GW + x] = N2.fbm(x * Q / 70, y * Q / 70, 4); }
  const bil = (A, x, y) => { const gx = x / Q, gy = y / Q, xi = gx | 0, yi = gy | 0, fx = gx - xi, fy = gy - yi, i = yi * GW + xi; return A[i] * (1 - fx) * (1 - fy) + A[i + 1] * fx * (1 - fy) + A[i + GW] * (1 - fx) * fy + A[i + GW + 1] * fx * fy; };
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) hgt[y * W + x] = bil(hg, x, y);
  const cv = mkCanvas(W, H), c = cv.getContext('2d');
  const img = c.createImageData(W, H), d = img.data;
  const G1 = [52, 76, 32], G2 = [98, 122, 52], DRY = [132, 128, 72], DIRT = [112, 92, 62], DIRT2 = [86, 70, 48], ROCK = [110, 106, 98];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, p = i * 4;
    const hx = hgt[i + (x < W - 1 ? 1 : 0)] - hgt[i - (x > 0 ? 1 : 0)], hy = hgt[i + (y < H - 1 ? W : 0)] - hgt[i - (y > 0 ? W : 0)];
    const light = 1 + (-hx * 0.8 - hy * 0.6) * 14;
    const moist = bil(mg, x, y);
    const fine = N2.vn(x / 3.1, y / 3.1);
    let R_ = G1[0] + (G2[0] - G1[0]) * moist, Gc = G1[1] + (G2[1] - G1[1]) * moist, B = G1[2] + (G2[2] - G1[2]) * moist;
    const dry = clamp((0.4 - moist) * 4, 0, 1) * 0.35; R_ += (DRY[0] - R_) * dry; Gc += (DRY[1] - Gc) * dry; B += (DRY[2] - B) * dry;
    const hi = clamp((hgt[i] - 0.62) * 6, 0, 1); R_ += (ROCK[0] - R_) * hi; Gc += (ROCK[1] - Gc) * hi; B += (ROCK[2] - B) * hi;
    const road = md[p] / 255, clear = md[p + 1] / 255;
    const dirtAmt = clamp(road * 1.5 + (N.vn(x / 6, y / 6) - 0.5) * 0.6 * road, 0, 1), trample = clamp(clear * 0.7 + (N.vn(x / 9, y / 9) - 0.5) * 0.4 * clear, 0, 0.5);
    const dm = mix3(DIRT, DIRT2, fine);
    const t = Math.max(dirtAmt, trample);
    R_ += (dm[0] - R_) * t; Gc += (dm[1] - Gc) * t; B += (dm[2] - B) * t;
    const k = light * (0.9 + fine * 0.2);
    d[p] = R_ * k; d[p + 1] = Gc * k; d[p + 2] = B * k; d[p + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  // wheel ruts on roads
  c.lineCap = 'round';
  for (const rd of roads) for (const off of [-4, 4]) { c.beginPath(); rd.forEach((pp, i) => { const q = rd[Math.min(i + 1, rd.length - 1)], pr = rd[Math.max(i - 1, 0)]; const ang = Math.atan2(q[1] - pr[1], q[0] - pr[0]) + Math.PI / 2; const X = pp[0] * sc + Math.cos(ang) * off, Y = pp[1] * sc + Math.sin(ang) * off; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.strokeStyle = 'rgba(50,38,24,0.22)'; c.lineWidth = 1.6; c.stroke(); }
  // central ruin paving
  c.save(); c.translate(C[0] * sc, C[1] * sc); c.scale(1, 0.62);
  for (let ring = 0; ring < 5; ring++) for (let a = 0; a < 6.28; a += 0.32 - ring * 0.03) { const rr = 18 + ring * 13; if (r() < 0.25) continue; c.fillStyle = 'rgba(' + (150 + r() * 30 | 0) + ',' + (144 + r() * 25 | 0) + ',' + (128 + r() * 20 | 0) + ',0.4)'; c.fillRect(Math.cos(a) * rr - 4, Math.sin(a) * rr - 3, 8, 6); }
  c.restore();
  return { cv, sc };
}
function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildDetail() {
  const S = 256, cv = mkCanvas(S, S), c = cv.getContext('2d');
  const N = makeNoise(99, 32);
  const img = c.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = 128 + (N.fbm(x / 8, y / 8, 2) - 0.5) * 60 + (Math.random() - 0.5) * 26; const p = (y * S + x) * 4; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255; }
  c.putImageData(img, 0, 0);
  const r = mkRng(4);
  for (let k = 0; k < 2600; k++) { const x = r() * S, y = r() * S, l = 3 + r() * 5, a = -Math.PI / 2 + (r() - 0.5) * 0.9; const v = r() < 0.5 ? 70 : 200; for (const dx of [0, -S, S]) for (const dy of [0, -S, S]) line(c, x + dx, y + dy, x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l, 'rgba(' + v + ',' + v + ',' + v + ',0.35)', 0.8); }
  return cv;
}
function buildClouds() {
  const S = 256, cv = mkCanvas(S, S), c = cv.getContext('2d'); const N = makeNoise(321, 16);
  const img = c.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = N.fbm(x / 16, y / 16, 4); const a = clamp((v - 0.5) * 3.2, 0, 1); const p = (y * S + x) * 4; d[p] = 20; d[p + 1] = 26; d[p + 2] = 34; d[p + 3] = a * 255; }
  c.putImageData(img, 0, 0); return cv;
}
function buildDecor(seed) {
  const r = mkRng(seed * 13 + 1); const out = [], ground = [];
  const clear = (x, y, pad) => {
    for (const s of START_POS) if (Math.hypot(x - s[0], y - s[1]) < 620 - (pad || 0)) return false;
    if (Math.hypot(x - MAP_W / 2, y - MAP_H / 2) < 260) return false;
    for (const [ox, oy] of OUTPOSTS) if (Math.hypot(x - ox, y - oy) < 200 - (pad || 0)) return false;
    for (const s of START_POS) { const dx = MAP_W / 2 - s[0], dy = MAP_H / 2 - s[1]; const t = clamp(((x - s[0]) * dx + (y - s[1]) * dy) / (dx * dx + dy * dy), 0, 1); if (Math.hypot(x - (s[0] + dx * t), y - (s[1] + dy * t)) < 190 - (pad || 0)) return false; }
    return true;
  };
  for (let k = 0; k < 30; k++) {
    let cx, cy, tries = 0;
    do { cx = r() * MAP_W; cy = r() * MAP_H; tries++; } while (!clear(cx, cy) && tries < 40);
    if (tries >= 40) continue;
    const n = 6 + (r() * 14 | 0), v = (r() * 6) | 0;
    for (let i = 0; i < n; i++) { const x = cx + (r() - 0.5) * 280, y = cy + (r() - 0.5) * 190; if (x > 20 && y > 40 && x < MAP_W - 20 && y < MAP_H - 10 && clear(x, y)) out.push({ k: 't', v: r() < 0.7 ? v : (r() * 6) | 0, x, y, s: 0.75 + r() * 0.45 }); }
  }
  for (let i = 0; i < 110; i++) { const x = r() * MAP_W, y = 40 + r() * (MAP_H - 40); if ((x < 130 || x > MAP_W - 130 || y < 130 || y > MAP_H - 130) && clear(x, y)) out.push({ k: 't', v: (r() * 6) | 0, x, y, s: 0.8 + r() * 0.4 }); }
  for (let i = 0; i < 45; i++) { const x = r() * MAP_W, y = r() * MAP_H; if (clear(x, y)) out.push({ k: 'r', v: (r() * 2) | 0, x, y, s: 0.6 + r() * 0.8 }); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; out.push({ k: 'p', x: MAP_W / 2 + Math.cos(a) * 150, y: MAP_H / 2 + Math.sin(a) * 100, s: 1, broken: i % 3 === 1 }); }
  for (let i = 0; i < 2600; i++) { const x = r() * MAP_W, y = r() * MAP_H; if (clear(x, y, 120)) ground.push({ v: r() < 0.72 ? (r() * 4) | 0 : r() < 0.6 ? 4 + ((r() * 2) | 0) : 6 + ((r() * 2) | 0), x, y, s: 0.5 + r() * 0.4 }); }
  return { out, ground };
}

// ================= RENDERER =================
class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.c = canvas.getContext('2d');
    this.cam = { x: 0, y: 0, z: 1 };
    this.corpses = []; this.parts = []; this.dpr = 1; this.shake = 0; this.lastT = 0;
    this.detail = buildDetail(); this.clouds = buildClouds();
  }
  setWorld(seed) { if (this.seed === seed && this.terrain) return; this.seed = seed; this.terrain = buildTerrain(seed); const dd = buildDecor(seed); this.decor = dd.out; this.ground = dd.ground; this.decor.sort((a, b) => a.y - b.y); this.detailPat = null; }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); this.dpr = dpr;
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.vign = null;
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
  emit(p) { if (this.parts.length < 500) this.parts.push(p); }

  draw(S) {
    const c = this.c, cam = this.cam, dpr = this.dpr;
    const now = S.time;
    const rdt = clamp(now - this.lastT, 0, 0.1); this.lastT = now;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#26301d'; c.fillRect(0, 0, this.cv.width, this.cv.height);
    let shx = 0, shy = 0;
    if (this.shake > 0) { shx = (Math.random() - 0.5) * this.shake * 10; shy = (Math.random() - 0.5) * this.shake * 10; this.shake = Math.max(0, this.shake - 0.05); }
    c.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, (-cam.x * cam.z + shx) * dpr, (-cam.y * cam.z + shy) * dpr);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.terrain.cv, 0, 0, MAP_W, MAP_H);
    const vx0 = cam.x - 90, vy0 = cam.y - 60, vx1 = cam.x + this.w / cam.z + 90, vy1 = cam.y + this.h / cam.z + 160;
    const inView = (x, y) => x > vx0 && x < vx1 && y > vy0 && y < vy1;
    // fine grass detail (overlay)
    if (!this.detailPat) this.detailPat = c.createPattern(this.detail, 'repeat');
    c.save(); c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.55; c.fillStyle = this.detailPat;
    c.fillRect(Math.max(0, vx0), Math.max(0, vy0), Math.min(MAP_W, vx1) - Math.max(0, vx0), Math.min(MAP_H, vy1) - Math.max(0, vy0)); c.restore();
    // ground clutter
    for (const g of this.ground) { if (!inView(g.x, g.y)) continue; const s = tuftSprite(g.v); c.drawImage(s.cv, g.x - s.ox * g.s, g.y - s.oy * g.s, s.w * g.s, s.h * g.s); }
    // corpses / scorch
    this.corpses = this.corpses.filter(k => now - k.t < 10);
    for (const k of this.corpses) { if (!inView(k.x, k.y)) continue; const a = Math.max(0, 1 - (now - k.t) / 10); c.globalAlpha = 0.55 * a; ell(c, k.x, k.y - 1, k.r * (k.b ? 1.3 : 1.2), k.r * (k.b ? 0.7 : 0.45), k.b ? '#231d18' : '#3a1a14'); if (!k.b) { c.globalAlpha = 0.8 * a; line(c, k.x - k.r * 0.7, k.y - 2, k.x + k.r * 0.7, k.y - 4, '#8a8f95', 1.2); } }
    c.globalAlpha = 1;
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
    }
    // selection rings / rally / attack marks
    for (const e of S.ents) {
      if (!inView(e.rx, e.ry)) continue;
      const sel = S.sel.has(e.id);
      if (e.d.kind === 'u') {
        const sw = e.r * (e.d.sub === 'cav' ? 3.2 : 2.3);
        c.drawImage(shadowSprite(), e.rx - sw / 2 + 3, e.ry - sw * 0.22, sw, sw * 0.5);
        if (sel) { const col = S.me === e.owner ? '#f3d774' : '#ff5a4a'; ell(c, e.rx, e.ry, e.r * 1.35, e.r * 0.6, rgba(col, 0.15), col, 1.6 / cam.z + 0.6); }
        else if (e.d.hero) ell(c, e.rx, e.ry, e.r * 1.3, e.r * 0.56, null, rgba(TEAM_COLORS[e.owner], 0.8), 1.5);
      } else {
        const sp = bldSprite(e.d, TEAM_COLORS[e.owner]);
        c.drawImage(shadowSprite(), e.rx - e.r * 1.3 + 12, e.ry - e.r * 0.55, e.r * 2.9, e.r * 1.2);
        void sp;
        if (sel) { const col = S.me === e.owner ? '#f3d774' : '#ff5a4a'; ell(c, e.rx, e.ry, e.r * 1.25, e.r * 0.62, rgba(col, 0.1), col, 2); }
      }
      if (sel && e.rally && e.owner === S.me) { c.setLineDash([6, 6]); line(c, e.rx, e.ry, e.rally.x, e.rally.y, 'rgba(243,215,116,0.6)', 1.5); c.setLineDash([]); line(c, e.rally.x, e.rally.y, e.rally.x, e.rally.y - 24, '#3b2f25', 2); poly(c, [e.rally.x, e.rally.y - 24, e.rally.x + 13, e.rally.y - 20, e.rally.x, e.rally.y - 15], TEAM_COLORS[e.owner]); }
    }
    for (const f of S.fx) if (f.k === 'mark') { const a = (now - f.t0) / f.dur; if (a >= 0 && a <= 1) { ell(c, f.x, f.y, f.p, f.p * 0.55, 'rgba(255,90,40,' + (0.1 + 0.18 * a) + ')', 'rgba(255,190,90,0.85)', 2); ell(c, f.x, f.y, f.p * a, f.p * 0.55 * a, null, 'rgba(255,220,150,0.6)', 1.5); } }
    // depth sorted
    const list = [];
    for (const e of S.ents) if (inView(e.rx, e.ry)) list.push(e);
    for (const d of this.decor) if (inView(d.x, d.y)) list.push(d);
    list.sort((a, b) => (a.ry !== undefined ? a.ry : a.y) - (b.ry !== undefined ? b.ry : b.y));
    for (const o of list) { if (o.k) this.drawDecor(o, now); else this.drawEnt(o, now, rdt); }
    if (S.ghost) {
      const g = S.ghost, spr = bldSprite(g.d, TEAM_COLORS[S.me]);
      ell(c, g.x, g.y, g.d.r * 1.15, g.d.r * 0.58, g.ok ? 'rgba(90,220,110,0.25)' : 'rgba(230,60,50,0.3)', g.ok ? '#6fe08a' : '#ff5a4a', 2);
      c.globalAlpha = 0.65; c.drawImage(spr.cv, g.x - spr.ox, g.y - spr.oy, spr.w, spr.h); c.globalAlpha = 1;
    }
    this.drawFx(S.fx, now);
    this.drawParts(rdt);
    // cloud shadows
    const T = 1400, off = (now * 14) % T;
    c.save(); c.globalAlpha = 0.28;
    for (let tx = Math.floor((vx0 + off) / T) - 1; tx <= Math.floor((vx1 + off) / T); tx++) for (let ty = Math.floor((vy0 + off * 0.5) / T) - 1; ty <= Math.floor((vy1 + off * 0.5) / T); ty++) c.drawImage(this.clouds, tx * T - off, ty * T - off * 0.5, T, T);
    c.restore();
    // bars & names
    for (const e of S.ents) {
      if (!inView(e.rx, e.ry)) continue;
      const dmg = e.hp < e.maxhp - 0.5;
      if (!(dmg || S.sel.has(e.id) || e.d.hero || (e.d.kind === 'b' && e.built < 1))) continue;
      const w = e.d.kind === 'b' ? e.r * 1.5 : e.d.hero ? 36 : 20;
      const y = e.d.kind === 'b' ? e.ry - bldSprite(e.d, TEAM_COLORS[e.owner]).oy + 6 : e.ry - (e.d.hero ? 60 : e.d.sub === 'cav' ? 62 : e.d.summon ? 70 : 46);
      const f = clamp(e.hp / e.maxhp, 0, 1);
      c.fillStyle = 'rgba(8,8,6,0.7)'; c.fillRect(e.rx - w / 2 - 1, y - 1, w + 2, 5);
      c.fillStyle = TEAM_COLORS[e.owner] === undefined ? '#ccc' : (f > 0.5 ? mix(TEAM_COLORS[e.owner], '#7fe07a', 0.55) : f > 0.25 ? '#e0b640' : '#d9432f'); c.fillRect(e.rx - w / 2, y, w * f, 3);
      if (e.d.kind === 'b' && e.built < 1) { c.fillStyle = '#9fd0ff'; c.fillRect(e.rx - w / 2, y + 4, w * e.built, 2); }
      if (e.d.hero) { c.font = '600 11px "Fira Sans Condensed", sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.fillStyle = '#f3ead2'; const t = e.d.heroName + ' · ' + e.lvl; c.strokeText(t, e.rx, y - 4); c.fillText(t, e.rx, y - 4); }
      else if (e.rank) { c.fillStyle = '#e6c25a'; for (let k = 0; k < e.rank; k++) { c.beginPath(); c.arc(e.rx - (e.rank - 1) * 3 + k * 6, y - 4, 1.8, 0, 7); c.fill(); } }
    }
    // screen-space grade + vignette
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.vign) { const g = c.createRadialGradient(this.w / 2, this.h * 0.45, Math.min(this.w, this.h) * 0.35, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,10,6,0.5)'); const g2 = c.createLinearGradient(0, 0, 0, this.h); g2.addColorStop(0, 'rgba(255,214,150,0.07)'); g2.addColorStop(1, 'rgba(20,30,50,0.10)'); this.vign = [g, g2]; }
    c.fillStyle = this.vign[1]; c.fillRect(0, 0, this.w, this.h);
    c.fillStyle = this.vign[0]; c.fillRect(0, 0, this.w, this.h);
  }
  drawDecor(o, now) {
    const c = this.c;
    if (o.k === 't') { const s = treeSprite(o.v); const sw = 40 * o.s; c.drawImage(shadowSprite(), o.x - sw / 2 + 10, o.y - sw * 0.2, sw * 1.3, sw * 0.5); const sway = Math.sin(now * 0.8 + o.x * 0.01) * 0.6; c.drawImage(s.cv, o.x - s.ox * o.s + sway, o.y - s.oy * o.s, s.w * o.s, s.h * o.s); }
    else if (o.k === 'r') { const s = rockSprite(o.v); c.drawImage(s.cv, o.x - s.ox * o.s, o.y - s.oy * o.s, s.w * o.s, s.h * o.s); }
    else if (o.k === 'p') { const h = o.broken ? 22 : 46; c.drawImage(shadowSprite(), o.x - 12, o.y - 6, 34, 12); rrect(c, o.x - 7, o.y - h, 14, h, 1, lg(c, o.x - 7, o.x + 7, '#b3ab9c', -0.45, 0.2)); for (let k = -5; k <= 5; k += 3.4) line(c, o.x + k, o.y - h + 2, o.x + k, o.y - 2, 'rgba(0,0,0,0.12)', 0.8); if (!o.broken) rrect(c, o.x - 10, o.y - h - 5, 20, 6, 1, lg(c, o.x - 10, o.x + 10, '#a39b8d', -0.45, 0.2)); else poly(c, [o.x - 7, o.y - h, o.x - 2, o.y - h - 5, o.x + 3, o.y - h + 1, o.x + 7, o.y - h - 2, o.x + 7, o.y - h + 3, o.x - 7, o.y - h + 3], '#a39b8d'); }
  }
  drawEnt(e, now, rdt) {
    const c = this.c; const col = TEAM_COLORS[e.owner] || '#888';
    if (e.d.kind === 'b') {
      const s = bldSprite(e.d, col);
      if (e.built < 1) {
        c.save(); c.beginPath(); c.rect(e.rx - s.ox, e.ry - s.oy * (0.2 + 0.8 * e.built) - 4, s.w, s.h); c.clip();
        c.drawImage(s.cv, e.rx - s.ox, e.ry - s.oy, s.w, s.h); c.restore();
        c.strokeStyle = '#8a6a44'; c.lineWidth = 1.6;
        for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(e.rx + k * e.r * 0.7, e.ry + 2); c.lineTo(e.rx + k * e.r * 0.7, e.ry - e.r * 1.5); c.stroke(); }
        for (let y = 0; y < 3; y++) line(c, e.rx - e.r * 0.8, e.ry - e.r * 0.45 * (y + 1), e.rx + e.r * 0.8, e.ry - e.r * 0.45 * (y + 1), '#8a6a44', 1.4);
        if (Math.random() < 0.15) this.emit({ x: e.rx + (Math.random() - 0.5) * e.r, y: e.ry - 4, vx: (Math.random() - 0.5) * 10, vy: -12, life: 1, t: 0, k: 'dust', s: 5 });
      } else c.drawImage(s.cv, e.rx - s.ox, e.ry - s.oy, s.w, s.h);
      if (e.hp < e.maxhp * 0.6 && e.built >= 1) {
        const sev = 1 - e.hp / e.maxhp;
        if (Math.random() < 0.35 * sev * 2) this.emit({ x: e.rx + (Math.random() - 0.5) * e.r * 1.2, y: e.ry - e.r * (0.6 + Math.random() * 0.6), vx: 4 + Math.random() * 6, vy: -18 - Math.random() * 10, life: 2.4, t: 0, k: 'smoke', s: 6 + e.r * 0.12 });
        if (e.hp < e.maxhp * 0.35 && Math.random() < 0.6) this.emit({ x: e.rx + (Math.random() - 0.5) * e.r, y: e.ry - e.r * (0.4 + Math.random() * 0.6), vx: (Math.random() - 0.5) * 6, vy: -26 - Math.random() * 14, life: 0.7, t: 0, k: 'fire', s: 4 + Math.random() * 4 });
      }
      return;
    }
    let frame = 0;
    if (e.atkT > 0) frame = 3;
    else if (e.moving) frame = ((now * (e.d.sub === 'cav' ? 7 : 5) + e.id * 0.37) % 2) < 1 ? 1 : 2;
    const s = unitSprite(e.d, col, frame);
    const bob = e.moving ? Math.abs(Math.sin(now * 10 + e.id)) * 1.2 : 0;
    const lean = e.atkT > 0 ? Math.sin(clamp(e.atkT / 0.3, 0, 1) * Math.PI) * 3 : 0;
    const sc = e.d.hero ? 1.12 : e.d.summon ? 1.05 : 1.0;
    c.save();
    c.translate(e.rx + lean * e.face, e.ry - bob);
    if (e.face < 0) c.scale(-1, 1);
    if (e.stunned) c.rotate(Math.sin(now * 10) * 0.07);
    c.drawImage(s.cv, -s.ox * sc, -s.oy * sc, s.w * sc, s.h * sc);
    c.restore();
    if (e.moving && e.d.sub === 'cav' && Math.random() < 0.25) this.emit({ x: e.rx - e.face * 10, y: e.ry - 2, vx: -e.face * 8, vy: -6, life: 0.8, t: 0, k: 'dust', s: 4 });
    if (e.stunned) for (let k = 0; k < 3; k++) { const a = now * 5 + k * 2.1; ell(c, e.rx + Math.cos(a) * 8, e.ry - 44 + Math.sin(a) * 2.5, 1.8, 1.8, '#ffe86a'); }
    if (e.buffGlow) { c.save(); c.globalCompositeOperation = 'lighter'; ell(c, e.rx, e.ry - 2, e.r * 1.3, e.r * 0.55, 'rgba(255,200,90,0.16)'); c.restore(); }
  }
  drawParts(dt) {
    const c = this.c;
    this.parts = this.parts.filter(p => (p.t += dt) < p.life);
    for (const p of this.parts) {
      p.x += p.vx * dt; p.y += p.vy * dt; const a = p.t / p.life;
      if (p.k === 'smoke') { const r2 = p.s * (1.2 + a * 2.2); c.globalAlpha = 0.45 * (1 - a) * Math.min(1, p.t * 4); c.drawImage(puff('smoke'), p.x - r2, p.y - r2, r2 * 2, r2 * 2); c.globalAlpha = 1; }
      else if (p.k === 'dust') { const r2 = p.s * (1.2 + a * 1.6); c.globalAlpha = 0.45 * (1 - a); c.drawImage(puff('dust'), p.x - r2, p.y - r2 * 0.6, r2 * 2, r2 * 1.2); c.globalAlpha = 1; }
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
        case 'arrow': case 'bolt': case 'javelin': {
          if (a > 1) { if (!f.hitDone) { f.hitDone = 1; for (let k = 0; k < 3; k++) this.emit({ x: f.x2, y: f.y2, vx: (Math.random() - 0.5) * 40, vy: -Math.random() * 30, life: 0.3, t: 0, k: 'dust', s: 1.6 }); } break; }
          const arc = Math.min(70, Math.hypot(f.x2 - f.x, f.y2 - f.y) * 0.2);
          const P = t => [f.x + (f.x2 - f.x) * t, f.y + (f.y2 - f.y) * t - Math.sin(t * Math.PI) * arc];
          const [x, y] = P(a), [x0, y0] = P(Math.max(0, a - 0.05));
          const ang = Math.atan2(y - y0, x - x0);
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
          if (Math.random() < 0.8) this.emit({ x, y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life: 0.4, t: 0, k: f.k === 'fireball' ? 'fire' : 'magic', col: cc, s: RR * 0.4 });
          if (f.k === 'hammer') { c.save(); c.translate(x, y); c.rotate(now * 18); rrect(c, -6, -3.5, 12, 7, 1.5, metal(c, -6, 6, '#a8afb6')); c.restore(); }
          break;
        }
        case 'star': {
          if (a > 1) break;
          const x = f.x + (f.x2 - f.x) * a, y = f.y + (f.y2 - f.y) * a;
          const cc = col || '#bfe3ff';
          c.save(); c.globalCompositeOperation = 'lighter'; line(c, x - (f.x2 - f.x) * 0.18, y - (f.y2 - f.y) * 0.18, x, y, rgba(cc.startsWith('#') ? cc : '#bfe3ff', 0.7), 3); ell(c, x, y, 3.5, 3.5, '#fff'); c.restore();
          break;
        }
        case 'boom': {
          const cc = col || '#ffd27a'; const r = f.p * (0.35 + 0.65 * Math.min(1, a * 1.6));
          if (!f.pDone) { f.pDone = 1; const n = Math.min(40, 10 + f.p / 5); for (let k = 0; k < n; k++) { const an = Math.random() * 6.28, sp = 40 + Math.random() * f.p * 1.2; this.emit({ x: f.x, y: f.y - 6, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp * 0.5 - 20, life: 0.4 + Math.random() * 0.4, t: 0, k: 'fire', s: 1.5 + Math.random() * 2.5 }); } for (let k = 0; k < 5; k++) this.emit({ x: f.x + (Math.random() - 0.5) * f.p, y: f.y + (Math.random() - 0.5) * f.p * 0.5, vx: (Math.random() - 0.5) * 10, vy: -15, life: 1.6, t: 0, k: 'smoke', s: 6 }); }
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
          else { ell(c, f.x, f.y, f.p * (0.5 + a * 0.5), f.p * 0.55 * (0.5 + a * 0.5), 'rgba(' + cc + ',0.12)', 'rgba(' + cc + ',0.7)', 2.5); }
          c.restore();
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
  drawMini(mc, S) {
    const c = mc.getContext('2d'); const W = mc.width, H = mc.height;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.terrain.cv, 0, 0, W, H);
    const sx = W / MAP_W, sy = H / MAP_H;
    for (const d of this.decor) if (d.k === 't') { c.fillStyle = 'rgba(20,40,20,0.55)'; c.fillRect(d.x * sx - 1, d.y * sy - 1, 2.4, 2.4); }
    for (const e of S.ents) {
      c.fillStyle = TEAM_COLORS[e.owner] || '#aaa';
      if (e.d.kind === 'b') { const s = Math.max(4, e.r * sx * 2); c.fillRect(e.rx * sx - s / 2, e.ry * sy - s / 2, s, s); c.strokeStyle = '#000'; c.lineWidth = 0.8; c.strokeRect(e.rx * sx - s / 2, e.ry * sy - s / 2, s, s); }
      else { const s = e.d.hero ? 5 : 3; c.fillRect(e.rx * sx - s / 2, e.ry * sy - s / 2, s, s); }
    }
    if (S.outposts) for (const op of S.outposts) { c.beginPath(); c.arc(op.x * sx, op.y * sy, 5, 0, 7); c.fillStyle = op.owner >= 0 ? TEAM_COLORS[op.owner] : '#e8e0cc'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); }
    if (S.alerts) { const t = performance.now() / 1000; for (const al of S.alerts) { const a = (t - al.t) / 3; if (a > 1) continue; c.beginPath(); c.arc(al.x * sx, al.y * sy, 4 + a * 14, 0, 7); c.strokeStyle = 'rgba(255,70,50,' + (1 - a) + ')'; c.lineWidth = 2; c.stroke(); } }
    const cam = this.cam;
    c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.strokeRect(cam.x * sx, cam.y * sy, this.w / cam.z * sx, (this.h - (this.padB || 0)) / cam.z * sy);
  }
}
