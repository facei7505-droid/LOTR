// ================= MAP: terrain types, water, cliffs, roads, forests, camps, navigation (shared by engine & renderer) =================
const WCELL = 16, GCELL = 80, NC = 40;
const MAPS = new Map();
const DX8 = [1, -1, 0, 0, 1, 1, -1, -1], DY8 = [0, 0, 1, -1, 1, -1, 1, -1];
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(px - ax - dx * t, py - ay - dy * t); }
function polyDist(px, py, pts) { let m = 1e9; for (let i = 1; i < pts.length; i++) { const d = segDist(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]); if (d < m) m = d; } return m; }
function turnAng(a, b, step) { let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI; return a + clamp(d, -step, step); }

// nearest walkable nav cell around cell i
function nearestFree(M, dyn, i) {
  const NW = M.NW, cx = i % NW, cy = (i / NW) | 0;
  for (let rr = 1; rr < 14; rr++) for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
    const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= NW || y >= M.NH) continue;
    const j = y * NW + x; if (!M.nblk[j] && !(dyn && dyn[j])) return j;
  }
  return -1;
}
// A* over the nav grid (8-way, no corner cutting, per-cell terrain cost)
function astar(M, dyn, s, t, noise, maxIt) {
  const NW = M.NW, NH = M.NH, N = NW * NH;
  if (!M.ag) { M.ag = new Float32Array(N); M.af = new Int32Array(N); M.as = new Uint32Array(N); M.ac = new Uint32Array(N); M.stamp = 0; }
  const g = M.ag, from = M.af, seen = M.as, closed = M.ac, st = ++M.stamp;
  const tx = t % NW, ty = (t / NW) | 0;
  const H = i => { const dx = Math.abs(i % NW - tx), dy = Math.abs(((i / NW) | 0) - ty); return dx + dy - 0.5858 * Math.min(dx, dy); };
  const hi = [], hf = [];
  const push = (i, f) => { let k = hi.length; hi.push(i); hf.push(f); while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; hi[k] = hi[p]; hf[k] = hf[p]; k = p; } hi[k] = i; hf[k] = f; };
  const pop = () => { const top = hi[0], li = hi.pop(), lf = hf.pop(), n = hi.length; if (n) { let k = 0; for (;;) { let c = 2 * k + 1; if (c >= n) break; if (c + 1 < n && hf[c + 1] < hf[c]) c++; if (hf[c] >= lf) break; hi[k] = hi[c]; hf[k] = hf[c]; k = c; } hi[k] = li; hf[k] = lf; } return top; };
  const blk = i => M.nblk[i] || (dyn && dyn[i]);
  seen[s] = st; g[s] = 0; from[s] = -1; push(s, H(s));
  let it = 0;
  while (hi.length && it++ < (maxIt || 9000)) {
    const cur = pop(); if (closed[cur] === st) continue; closed[cur] = st;
    if (cur === t) { const path = []; let k = cur; while (k >= 0) { path.push(k); k = from[k]; } return path.reverse(); }
    const cx = cur % NW, cy = (cur / NW) | 0;
    for (let d = 0; d < 8; d++) {
      const dx = DX8[d], dy = DY8[d], nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NW || ny >= NH) continue;
      const ni = ny * NW + nx; if (closed[ni] === st || blk(ni)) continue;
      if (dx && dy && (blk(cy * NW + nx) || blk(ny * NW + cx))) continue;
      const ng = g[cur] + (dx && dy ? 1.4142 : 1) * M.ncost[ni] * (noise ? 1 + noise[ni] : 1);
      if (seen[ni] !== st || ng < g[ni]) { seen[ni] = st; g[ni] = ng; from[ni] = cur; push(ni, ng + H(ni)); }
    }
  }
  return null;
}
function chaikin(pts, n) { for (let k = 0; k < n; k++) { const out = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } out.push(pts[pts.length - 1]); pts = out; } return pts; }
function resample(pts, step) { const out = [pts[0]]; let acc = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); acc += l; if (acc >= step) { out.push(b); acc = 0; } } if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]); return out; }

function makeMap(seed, type) {
  type = MAP_TYPES.some(m => m.k === type) ? type : 'river';
  const key = seed + ':' + type; if (MAPS.has(key)) return MAPS.get(key);
  const r = mkRng(seed * 7 + 3 + { river: 0, pass: 101, winter: 202 }[type]);
  const C = [MAP_W / 2, MAP_H / 2], ISL = 150, RW = 44;
  // point-symmetric blobs (fair for opposite corners): [x, y, radius, phase, flipped]
  const blobs = list => { const out = []; for (const [fx, fy, rad] of list) { const ph = r() * 6.28; out.push([fx * MAP_W, fy * MAP_H, rad, ph, 0], [(1 - fx) * MAP_W, (1 - fy) * MAP_H, rad, ph, 1]); } return out; };
  const blobD = (b, x, y) => { const dx = x - b[0], dy = y - b[1]; let a = Math.atan2(dy, dx); if (b[4]) a += Math.PI; return Math.hypot(dx, dy) - b[2] * (1 + 0.22 * Math.sin(3 * a + b[3]) + 0.1 * Math.sin(7 * a + b[3] * 1.7)); };
  let rx = null, river = null, lakes = [], cliffs = [];
  if (type === 'river') {
    const A = 300, A2 = (r() - 0.5) * 120;
    rx = y => { const u = (y - MAP_H / 2) / MAP_H; return MAP_W / 2 + A * Math.sin(2 * Math.PI * u) + A2 * Math.sin(4 * Math.PI * u); };
    river = []; for (let y = -80; y <= MAP_H + 80; y += 40) river.push([rx(y), y]);
  } else if (type === 'pass') cliffs = blobs([[0.33, 0.33, 205], [0.33, 0.67, 175], [0.5, 0.04, 175]]);
  else { lakes = blobs([[0.33, 0.27, 150], [0.23, 0.66, 115]]); cliffs = blobs([[0.5, 0.07, 150]]); }
  // signed distances to water (wd) and cliffs (cl) on a fine grid; wat: 0 land, 1 water, 2 bridge, 3 cliff, 4 ice
  const GW = Math.ceil(MAP_W / WCELL) + 1, GH = Math.ceil(MAP_H / WCELL) + 1;
  const wd = new Float32Array(GW * GH), cl = new Float32Array(GW * GH), wat = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const px = x * WCELL, py = y * WCELL, i = y * GW + x;
    let v = 999, c2 = 999;
    if (rx) {
      const dh = Math.abs(px - rx(py));
      v = (dh < 520 ? polyDist(px, py, river) : dh * 0.85) - RW;
      const dc = Math.hypot(px - C[0], py - C[1]);
      v = Math.min(v, Math.abs(dc - (ISL + RW * 0.95)) - RW * 0.75);
      if (dc < ISL) v = Math.max(v, ISL - dc + 2);
    }
    for (const b of lakes) v = Math.min(v, blobD(b, px, py));
    for (const b of cliffs) c2 = Math.min(c2, blobD(b, px, py));
    wd[i] = v; cl[i] = c2; wat[i] = c2 < 0 ? 3 : v < 0 ? (lakes.length ? 4 : 1) : 0;
  }
  const bil = A => (x, y) => { const gx = clamp(x / WCELL, 0, GW - 1.001), gy = clamp(y / WCELL, 0, GH - 1.001), xi = gx | 0, yi = gy | 0, fx = gx - xi, fy = gy - yi, i = yi * GW + xi; return A[i] * (1 - fx) * (1 - fy) + A[i + 1] * fx * (1 - fy) + A[i + GW] * (1 - fx) * fy + A[i + GW + 1] * fx * fy; };
  const wdAt = bil(wd), clAt = bil(cl);
  const clearOf = (x, y, pad) => x > pad && y > pad && x < MAP_W - pad && y < MAP_H - pad && wdAt(x, y) > pad && clAt(x, y) > pad;
  const nudge = (x, y, pad) => { if (clearOf(x, y, pad)) return [x, y]; for (let rr = 20; rr < 700; rr += 20) for (let a = 0; a < 6.28; a += 0.3) { const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; if (clearOf(px, py, pad)) return [px, py]; } return [x, y]; };
  const mirror = p => [MAP_W - p[0], MAP_H - p[1]];
  // outposts: centre + mirrored pairs
  const outposts = [nudge(C[0], C[1], 60)];
  const opPairs = type === 'river' ? [[0.2, 0.5], [(rx(MAP_H * 0.2) + 260) / MAP_W, 0.2], [0.64, 0.2]] : [[0.2, 0.5], [0.5, 0.2], [0.66, 0.2]];
  for (const [fx, fy] of opPairs) { const p = nudge(fx * MAP_W, fy * MAP_H, 120); outposts.push(p, mirror(p)); }
  // wild camps: mirrored pairs
  const camps = [];
  const campKinds = [seed % 2 ? 'wolves' : 'bandits', 'troll'];
  [[0.08, 0.62], [0.42, 0.06]].forEach(([fx, fy], k) => { const p = nudge(fx * MAP_W, fy * MAP_H, 150); camps.push([p[0], p[1], campKinds[k]], [...mirror(p), campKinds[k]]); });
  const M = { seed, type, biome: { river: 'meadow', pass: 'highland', winter: 'snow' }[type], river, rx, RW, ISL, C, outposts, camps, roads: [], bridges: [], trees: [],
    wd, cl, wat, GW, GH, wdAt, clAt,
    water(x, y) { const gx = Math.round(clamp(x, 0, MAP_W) / WCELL), gy = Math.round(clamp(y, 0, MAP_H) / WCELL); return wat[gy * GW + gx]; },
  };
  // navigation grid: cliffs block, water is slow
  const NW = Math.ceil(MAP_W / NC), NH = Math.ceil(MAP_H / NC);
  const nblk = new Uint8Array(NW * NH), ncost = new Float32Array(NW * NH);
  for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) {
    const cx = (x + 0.5) * NC, cy = (y + 0.5) * NC, i = y * NW + x;
    let cmin = clAt(cx, cy); for (const [ox, oy] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) cmin = Math.min(cmin, clAt(cx + ox, cy + oy));
    nblk[i] = cmin < 2 ? 1 : 0;
    const w = M.water(cx, cy); ncost[i] = w === 1 ? 2.6 : w === 4 ? 1.25 : 1;
  }
  Object.assign(M, { NW, NH, nblk, ncost });
  const cellOf = (x, y) => clamp(Math.floor(y / NC), 0, NH - 1) * NW + clamp(Math.floor(x / NC), 0, NW - 1);
  const center = i => [(i % NW + 0.5) * NC, (Math.floor(i / NW) + 0.5) * NC];
  // roads follow walkable ground (A* with a little noise for natural bends), then get smoothed
  const noise = new Float32Array(NW * NH); for (let i = 0; i < noise.length; i++) noise[i] = r() * 0.9 + (M.water((i % NW + 0.5) * NC, (Math.floor(i / NW) + 0.5) * NC) === 1 ? 3 : 0);
  const road = (a, b) => {
    let s = cellOf(a[0], a[1]), t = cellOf(b[0], b[1]);
    if (nblk[s]) s = nearestFree(M, null, s); if (nblk[t]) t = nearestFree(M, null, t);
    const cells = s >= 0 && t >= 0 ? astar(M, null, s, t, noise) : null; if (!cells) return;
    let pts = cells.filter((c, k) => k % 3 === 0 || k === cells.length - 1).map(center); pts[0] = a; pts[pts.length - 1] = b;
    M.roads.push(resample(chaikin(pts, 3), 30));
  };
  for (const s of START_POS) road(s, C);
  road(START_POS[0], START_POS[2]); road(START_POS[3], START_POS[1]);
  road(START_POS[0], START_POS[3]); road(START_POS[2], START_POS[1]);
  // bridges where roads cross running water
  for (const rd of M.roads) {
    let inW = false, s0 = null, prev = rd[0];
    for (let k = 1; k < rd.length; k++) {
      const a = rd[k - 1], b = rd[k], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 6);
      for (let j = 1; j <= n; j++) {
        const p = [a[0] + (b[0] - a[0]) * j / n, a[1] + (b[1] - a[1]) * j / n], w = rx && wdAt(p[0], p[1]) < 6;
        if (w && !inW) { s0 = prev; inW = true; }
        if (!w && inW) { const ang = Math.atan2(p[1] - s0[1], p[0] - s0[0]); M.bridges.push({ x1: s0[0] - Math.cos(ang) * 18, y1: s0[1] - Math.sin(ang) * 18, x2: p[0] + Math.cos(ang) * 18, y2: p[1] + Math.sin(ang) * 18, ang }); inW = false; }
        prev = p;
      }
    }
  }
  for (const b of M.bridges) {
    const x0 = Math.floor(Math.min(b.x1, b.x2) / WCELL) - 3, x1 = Math.ceil(Math.max(b.x1, b.x2) / WCELL) + 3, y0 = Math.floor(Math.min(b.y1, b.y2) / WCELL) - 3, y1 = Math.ceil(Math.max(b.y1, b.y2) / WCELL) + 3;
    for (let y = Math.max(0, y0); y <= Math.min(GH - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(GW - 1, x1); x++) { const i = y * GW + x; if (wat[i] === 1 && segDist(x * WCELL, y * WCELL, b.x1, b.y1, b.x2, b.y2) < 24) wat[i] = 2; }
    for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) { const cx = (x + 0.5) * NC, cy = (y + 0.5) * NC; if (segDist(cx, cy, b.x1, b.y1, b.x2, b.y2) < 22) ncost[y * NW + x] = 1; }
  }
  // forests (engine-side: trees block movement and paths go around them)
  const onRoad = (x, y, w) => { for (const rd of M.roads) if (polyDist(x, y, rd) < w) return true; return false; };
  const okTree = (x, y, pad) => {
    pad = pad || 0;
    if (x < 20 || y < 40 || x > MAP_W - 20 || y > MAP_H - 10) return false;
    for (const s of START_POS) if (Math.hypot(x - s[0], y - s[1]) < 640 - pad) return false;
    for (const [ox, oy] of outposts) if (Math.hypot(x - ox, y - oy) < 220 - pad) return false;
    for (const [ox, oy] of camps) if (Math.hypot(x - ox, y - oy) < 170) return false;
    if (wdAt(x, y) < 24 || clAt(x, y) < 12) return false;
    return !onRoad(x, y, 56 - pad * 0.3);
  };
  const pickV = () => { const q = r(); if (M.biome === 'snow') return q < 0.85 ? 8 + ((r() * 2) | 0) : 10; if (M.biome === 'highland') return q < 0.6 ? (q < 0.3 ? 0 : 3) : q < 0.85 ? 2 : 6; return q < 0.15 ? (q < 0.08 ? 0 : 3) : q < 0.4 ? 6 + ((r() * 2) | 0) : [1, 2, 4, 5][(r() * 4) | 0]; };
  const nClusters = { meadow: 34, highland: 26, snow: 40 }[M.biome];
  for (let k = 0; k < nClusters; k++) {
    let cx, cy, tries = 0;
    do { cx = r() * MAP_W; cy = r() * MAP_H; tries++; } while (!okTree(cx, cy) && tries < 40);
    if (tries >= 40) continue;
    const n = 14 + (r() * 20 | 0), v = pickV(), R = 90 + r() * 80;
    for (let i = 0; i < n; i++) { const a = r() * 6.283, dd = Math.sqrt(r()) * R, x = cx + Math.cos(a) * dd * 1.3, y = cy + Math.sin(a) * dd * 0.85; if (okTree(x, y)) M.trees.push({ x, y, v: r() < 0.7 ? v : pickV(), s: 0.8 + r() * 0.5 }); }
  }
  for (let i = 0; i < 160; i++) { const x = r() * MAP_W, y = 40 + r() * (MAP_H - 40); if ((x < 140 || x > MAP_W - 140 || y < 140 || y > MAP_H - 140) && okTree(x, y)) M.trees.push({ x, y, v: pickV(), s: 0.85 + r() * 0.45 }); }
  if (rx) for (let i = 0; i < 70; i++) { const y = r() * MAP_H, x = rx(y) + (r() < 0.5 ? -1 : 1) * (RW + 40 + r() * 70); if (okTree(x, y, 60)) M.trees.push({ x, y, v: pickV(), s: 0.75 + r() * 0.4 }); }
  for (const b of cliffs) for (let i = 0; i < 18; i++) { const a = r() * 6.28, x = b[0] + Math.cos(a) * b[2] * (1.25 + r() * 0.35), y = b[1] + Math.sin(a) * b[2] * (1.25 + r() * 0.35); if (okTree(x, y)) M.trees.push({ x, y, v: pickV(), s: 0.75 + r() * 0.4 }); }
  M.trees.sort((a, b) => a.y - b.y);
  const cnt = new Uint8Array(NW * NH);
  for (const t of M.trees) {
    t.r = 7 * t.s;
    const i = cellOf(t.x, t.y); cnt[i]++;
    const [cx, cy] = center(i); if (Math.abs(t.x - cx) < 13 && Math.abs(t.y - cy) < 13) nblk[i] = 1;
  }
  for (let i = 0; i < cnt.length; i++) if (cnt[i] >= 2) nblk[i] = 1;
  // tree colliders bucketed like the engine's spatial grid
  const gcw = Math.ceil(MAP_W / GCELL) + 2, gch = Math.ceil(MAP_H / GCELL) + 2;
  M.tgrid = Array.from({ length: gcw * gch }, () => []);
  for (const t of M.trees) M.tgrid[clamp((t.y / GCELL) | 0, 0, gch - 1) * gcw + clamp((t.x / GCELL) | 0, 0, gcw - 1)].push(t);
  MAPS.set(key, M);
  return M;
}
