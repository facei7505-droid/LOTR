// ================= R3D: tiny software ray-caster — units and buildings are built from lit 3D primitives and baked into sprites =================
// Camera: orthographic, ~40° above the ground (like BFME). Sun from the upper left/back, matching the ground shadows.
const R3 = (() => {
  const PHI = 0.72, SP = Math.sin(PHI), CP = Math.cos(PHI);
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const LW = nrm([-0.75, 0.72, 0.14]), VW = [0, SP, CP], HW = nrm([LW[0] + VW[0], LW[1] + VW[1], LW[2] + VW[2]]);
  const hash = (x, y, z) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y, z) => { const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); const l = (a, b, t) => a + (b - a) * t; return l(l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v), l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w); };
  const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  // ---- materials ----
  const MAT = (col, o) => Object.assign({ c: typeof col === 'string' ? hex(col) : col, spec: 0.05, shin: 12, pat: null, ns: 12, bw: 1, bh: 1 }, o || {});
  // ---- primitive constructors (object space, metres or world units) ----
  const bound = p => { p.br2 = p.br * p.br; return p; };
  const sph = (x, y, z, r, m) => bound({ k: 0, x, y, z, r, m, bx: x, by: y, bz: z, br: r });
  const ell = (x, y, z, a, b, c, m, clip) => bound({ k: 1, x, y, z, a, b, c, m, clip: clip || null, bx: x, by: y, bz: z, br: Math.max(a, b, c) });
  const cap = (a, b, r, m) => bound({ k: 2, ax: a[0], ay: a[1], az: a[2], bx2: b[0], by2: b[1], bz2: b[2], r, m, bx: (a[0] + b[0]) / 2, by: (a[1] + b[1]) / 2, bz: (a[2] + b[2]) / 2, br: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + r });
  // convex polyhedron from planes [nx,ny,nz,d] (inside: n·p <= d) + bounding sphere
  const poly = (planes, cx, cy, cz, br, m) => bound({ k: 3, pl: planes.map(q => { const l = Math.hypot(q[0], q[1], q[2]); return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; }), m, bx: cx, by: cy, bz: cz, br });
  const box = (cx, cy, cz, hx, hy, hz, m, yaw) => {
    const c = Math.cos(yaw || 0), s = Math.sin(yaw || 0), ax = [c, 0, s], az = [-s, 0, c];
    const pl = [[ax[0], 0, ax[2], hx + ax[0] * cx + ax[2] * cz], [-ax[0], 0, -ax[2], hx - ax[0] * cx - ax[2] * cz], [0, 1, 0, cy + hy], [0, -1, 0, -(cy - hy)], [az[0], 0, az[2], hz + az[0] * cx + az[2] * cz], [-az[0], 0, -az[2], hz - az[0] * cx - az[2] * cz]];
    return poly(pl, cx, cy, cz, Math.hypot(hx, hy, hz), m);
  };
  // gable roof: ridge along x (or z if alongZ), eaves at y0, ridge at y0+h
  const gable = (cx, y0, cz, hx, hz, h, m, alongZ) => {
    if (alongZ) return poly([[0, 0, 1, cz + hz], [0, 0, -1, -(cz - hz)], [0, -1, 0, -y0], [h, hx, 0, h * cx + hx * (y0 + h)], [-h, hx, 0, -h * cx + hx * (y0 + h)]], cx, y0 + h / 2, cz, Math.hypot(hx, h, hz), m);
    return poly([[1, 0, 0, cx + hx], [-1, 0, 0, -(cx - hx)], [0, -1, 0, -y0], [0, hz, h, h * cz + hz * (y0 + h)], [0, hz, -h, -h * cz + hz * (y0 + h)]], cx, y0 + h / 2, cz, Math.hypot(hx, h, hz), m);
  };
  // vertical frustum (cylinder r0=r1, cone r1=0), base centre at y
  const frus = (x, y, z, r0, r1, h, m) => bound({ k: 4, x, y, z, r0, r1, h, m, bx: x, by: y + h / 2, bz: z, br: Math.hypot(Math.max(r0, r1), h / 2) });
  // ---- intersection (scalar, allocation-free) ----
  let HT = 0, NX = 0, NY = 0, NZ = 0;
  function hit(p, ox, oy, oz, dx, dy, dz, tmax) {
    switch (p.k) {
      case 0: { const lx = ox - p.x, ly = oy - p.y, lz = oz - p.z, b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - p.r * p.r, h = b * b - c; if (h < 0) return false; const t = -b - Math.sqrt(h); if (t <= 0 || t >= tmax) return false; HT = t; NX = (lx + dx * t) / p.r; NY = (ly + dy * t) / p.r; NZ = (lz + dz * t) / p.r; return true; }
      case 1: {
        const lx = (ox - p.x) / p.a, ly = (oy - p.y) / p.b, lz = (oz - p.z) / p.c, ex = dx / p.a, ey = dy / p.b, ez = dz / p.c;
        const a = ex * ex + ey * ey + ez * ez, b = lx * ex + ly * ey + lz * ez, c = lx * lx + ly * ly + lz * lz - 1, h = b * b - a * c; if (h < 0) return false;
        const sq = Math.sqrt(h);
        for (let k = 0; k < 2; k++) {
          const t = k ? (-b + sq) / a : (-b - sq) / a; if (t <= 0 || t >= tmax) continue;
          const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
          if (p.clip && p.clip[0] * px + p.clip[1] * py + p.clip[2] * pz > p.clip[3]) continue;
          let nx = (px - p.x) / (p.a * p.a), ny = (py - p.y) / (p.b * p.b), nz = (pz - p.z) / (p.c * p.c); const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
          if (k) { nx = -nx; ny = -ny; nz = -nz; }
          HT = t; NX = nx; NY = ny; NZ = nz; return true;
        }
        return false;
      }
      case 2: {
        const bax = p.bx2 - p.ax, bay = p.by2 - p.ay, baz = p.bz2 - p.az, oax = ox - p.ax, oay = oy - p.ay, oaz = oz - p.az;
        const baba = bax * bax + bay * bay + baz * baz, bard = bax * dx + bay * dy + baz * dz, baoa = bax * oax + bay * oay + baz * oaz, rdoa = dx * oax + dy * oay + dz * oaz, oaoa = oax * oax + oay * oay + oaz * oaz;
        const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - p.r * p.r * baba, h = B * B - A * C;
        if (h < 0) return false;
        let t = (-B - Math.sqrt(h)) / A; const y = baoa + t * bard;
        if (!(y > 0 && y < baba)) { const cx = y <= 0 ? oax : ox - p.bx2, cy = y <= 0 ? oay : oy - p.by2, cz = y <= 0 ? oaz : oz - p.bz2, b2 = dx * cx + dy * cy + dz * cz, c2 = cx * cx + cy * cy + cz * cz - p.r * p.r, h2 = b2 * b2 - c2; if (h2 <= 0) return false; t = -b2 - Math.sqrt(h2); }
        if (t <= 0 || t >= tmax) return false;
        const px = ox + dx * t - p.ax, py = oy + dy * t - p.ay, pz = oz + dz * t - p.az, hh = clamp((px * bax + py * bay + pz * baz) / baba, 0, 1);
        HT = t; NX = (px - bax * hh) / p.r; NY = (py - bay * hh) / p.r; NZ = (pz - baz * hh) / p.r; return true;
      }
      case 3: {
        let tn = -1e9, tf = 1e9, nx = 0, ny = 0, nz = 0;
        for (const q of p.pl) {
          const den = q[0] * dx + q[1] * dy + q[2] * dz, dist = q[3] - (q[0] * ox + q[1] * oy + q[2] * oz);
          if (Math.abs(den) < 1e-9) { if (dist < 0) return false; continue; }
          const t = dist / den;
          if (den < 0) { if (t > tn) { tn = t; nx = q[0]; ny = q[1]; nz = q[2]; } } else if (t < tf) tf = t;
          if (tn > tf) return false;
        }
        if (tn <= 0 || tn >= tmax) return false;
        HT = tn; NX = nx; NY = ny; NZ = nz; return true;
      }
      case 4: {
        const k = (p.r1 - p.r0) / p.h, X = ox - p.x, Y = oy - p.y, Z = oz - p.z;
        const a = dx * dx + dz * dz - k * k * dy * dy, rY = p.r0 + k * Y, b = X * dx + Z * dz - k * rY * dy, c = X * X + Z * Z - rY * rY;
        let best = 1e9, bn = 0;
        const h = b * b - a * c;
        if (h >= 0 && Math.abs(a) > 1e-9) { const sq = Math.sqrt(h); for (const t of [(-b - sq) / a, (-b + sq) / a]) { if (t <= 0 || t >= tmax || t >= best) continue; const yy = Y + dy * t; if (yy < 0 || yy > p.h || p.r0 + k * yy < 0) continue; best = t; bn = 1; } }
        if (p.r1 > 0 && dy < 0) { const t = (p.h - Y) / dy; if (t > 0 && t < tmax && t < best) { const xx = X + dx * t, zz = Z + dz * t; if (xx * xx + zz * zz <= p.r1 * p.r1) { best = t; bn = 2; } } }
        if (!bn) return false;
        HT = best;
        if (bn === 2) { NX = 0; NY = 1; NZ = 0; }
        else { const xx = X + dx * best, yy = Y + dy * best, zz = Z + dz * best, rr = p.r0 + k * yy; let nx = xx, ny = -k * rr, nz = zz; const l = Math.hypot(nx, ny, nz) || 1; NX = nx / l; NY = ny / l; NZ = nz / l; }
        return true;
      }
    }
    return false;
  }
  const near = (p, ox, oy, oz, dx, dy, dz) => { const cx = p.bx - ox, cy = p.by - oy, cz = p.bz - oz, t = cx * dx + cy * dy + cz * dz; return cx * cx + cy * cy + cz * cz - t * t <= p.br2; };
  // ---- procedural surface patterns ----
  function pattern(m, px, py, pz, nx, ny, nz, out) {
    let k = 1;
    const n1 = vnoise(px * m.ns, py * m.ns, pz * m.ns);
    switch (m.pat) {
      case 'mail': k = 0.78 + 0.34 * Math.abs(Math.sin(px * 90 + Math.sin(py * 90) * 1.5) * Math.sin(py * 95)); break;
      case 'cloth': k = 0.86 + 0.26 * n1 + 0.06 * Math.sin((py + pz) * 140); break;
      case 'leather': k = 0.8 + 0.34 * n1; break;
      case 'fur': k = 0.72 + 0.5 * vnoise(px * 60, py * 20, pz * 60); break;
      case 'skin': k = 0.93 + 0.12 * n1; break;
      case 'metal': k = 0.88 + 0.2 * n1; break;
      case 'wood': k = 0.75 + 0.2 * Math.sin(py * 3 + n1 * 6) * 0.5 + 0.3 * vnoise(px * 2, py * 40, pz * 2); break;
      case 'leaf': k = 0.7 + 0.6 * vnoise(px * 9, py * 9, pz * 9); break;
      case 'stone': {
        // coursed masonry on whichever face we are on
        const hz = Math.abs(nx) > Math.abs(nz) ? pz : px, row = Math.floor(py / m.bh), off = row % 2 ? m.bw * 0.5 : 0, col = Math.floor((hz + off) / m.bw);
        const fy = py / m.bh - row, fx = (hz + off) / m.bw - col, edge = Math.min(fy, 1 - fy, fx * 1.6, (1 - fx) * 1.6);
        k = (0.8 + 0.3 * hash(row, col, 7)) * (edge < 0.08 ? 0.55 : 1) * (0.9 + 0.2 * n1);
        if (ny > 0.7) k = 0.85 + 0.25 * n1;
        break;
      }
      case 'plaster': {
        const hz = Math.abs(nx) > Math.abs(nz) ? pz : px, beam = Math.abs(((hz / m.bw) % 1 + 1) % 1 - 0.5) > 0.46 || Math.abs(((py / m.bh) % 1 + 1) % 1 - 0.5) > 0.45;
        if (beam && ny < 0.5) { out[0] = 0.28; out[1] = 0.19; out[2] = 0.12; return 0.9 + 0.2 * n1; }
        k = 0.88 + 0.18 * n1; break;
      }
      case 'roof': {
        if (Math.abs(ny) < 0.15 && m.end) { out[0] = m.end[0]; out[1] = m.end[1]; out[2] = m.end[2]; return 0.82 + 0.2 * n1; }
        const along = Math.abs(nx) > Math.abs(nz) ? pz : px, row = Math.floor(py / m.bh), fy = py / m.bh - row, fx = ((along / m.bw + (row % 2) * 0.5) % 1 + 1) % 1;
        k = (0.72 + 0.35 * fy) * (Math.abs(fx - 0.5) > 0.44 ? 0.7 : 1) * (0.85 + 0.25 * hash(row, Math.floor(along / m.bw + (row % 2) * 0.5), 3)); break;
      }
      case 'rock': { const st = Math.sin(py * m.ns * 2.2 + vnoise(px * m.ns * 0.5, py * m.ns * 0.5, pz * m.ns * 0.5) * 5); k = 0.55 + 0.45 * vnoise(px * m.ns * 1.8, py * m.ns * 1.8, pz * m.ns * 1.8) + 0.1 * st; if (ny > 0.55) { out[0] = out[0] * 0.8 + 0.08; out[1] = out[1] * 0.85 + 0.1; out[2] = out[2] * 0.7 + 0.04; } break; }
      case 'thatch': k = 0.7 + 0.5 * vnoise(px * 0.6, py * 6, pz * 0.6) * (0.8 + 0.2 * vnoise(px * 5, py * 0.4, pz * 5)); break;
      case 'planks': { const hz = Math.abs(nx) > Math.abs(nz) ? pz : px, f = ((hz / m.bw) % 1 + 1) % 1; k = (f < 0.06 ? 0.5 : 0.85 + 0.25 * hash(Math.floor(hz / m.bw), 1, 1)) * (0.85 + 0.3 * vnoise(hz * 0.8, py * 0.08, 1)); break; }
      default: k = 0.94 + 0.12 * n1;
    }
    return k;
  }
  // ---- render a primitive list to a sprite ----
  // opt: yaw (radians, model faces +x at 0), ppu (pixels per model unit), w, h (px), ox, oy (px position of model origin), ss (supersample), ao (height scale for ambient occlusion)
  function render(prims, opt) {
    const ss = opt.ss || 1, W = Math.ceil(opt.w * ss), H = Math.ceil(opt.h * ss), ppu = opt.ppu * ss, ox0 = opt.ox * ss, oy0 = opt.oy * ss;
    const cy = Math.cos(opt.yaw || 0), sy = Math.sin(opt.yaw || 0);
    const rot = v => [v[0] * cy + v[2] * sy, v[1], -v[0] * sy + v[2] * cy];
    const L = rot(LW), Hh = rot(HW), Vv = rot(VW), D = rot([0, -SP, -CP]);
    const dx = D[0], dy = D[1], dz = D[2];
    const aoH = opt.ao || 1.6, emitAll = opt.emit || 0, FAR = opt.far || aoH * 60;
    const cv = mkCanvas(W, H), c = cv.getContext('2d'), img = c.createImageData(W, H), d = img.data;
    const col = [0, 0, 0];
    // only trace the screen rectangle the model can cover
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (const p of prims) {
      const wx = p.bx * cy - p.bz * sy, wz = p.bx * sy + p.bz * cy, su = wx, sv = p.by * CP - wz * SP, r = p.br * ppu + 2;
      const px = ox0 + su * ppu, py = oy0 - sv * ppu;
      x0 = Math.min(x0, px - r); x1 = Math.max(x1, px + r); y0 = Math.min(y0, py - r); y1 = Math.max(y1, py + r);
    }
    x0 = Math.max(0, Math.floor(x0)); x1 = Math.min(W - 1, Math.ceil(x1)); y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
    // screen rectangles per primitive -> per-row candidate lists; big parts cast the self-shadows
    const rects = prims.map(p => { const wx = p.bx * cy - p.bz * sy, wz = p.bx * sy + p.bz * cy, px = ox0 + wx * ppu, py = oy0 - (p.by * CP - wz * SP) * ppu, r = p.br * ppu + 1.5; return [px - r, px + r, py - r, py + r]; });
    const casters = prims.filter(p => p.br > (opt.casterMin || 0.09));
    const row = []; let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
    for (let py = y0; py <= y1; py++) {
      row.length = 0; for (let i = 0; i < prims.length; i++) { const r = rects[i]; if (py >= r[2] && py <= r[3]) row.push(i); }
      if (!row.length) continue;
      for (let px = x0; px <= x1; px++) {
      const su = (px + 0.5 - ox0) / ppu, sv = (oy0 - py - 0.5) / ppu;
      const wx = su, wy = sv * CP + FAR * SP, wz = -sv * SP + FAR * CP;
      const ox = wx * cy + wz * sy, oy = wy, oz = -wx * sy + wz * cy;
      let best = 1e9, bp = null, bnx = 0, bny = 0, bnz = 0;
      for (let j = 0; j < row.length; j++) { const i = row[j], r = rects[i]; if (px < r[0] || px > r[1]) continue; const p = prims[i]; if (!near(p, ox, oy, oz, dx, dy, dz)) continue; if (hit(p, ox, oy, oz, dx, dy, dz, best)) { best = HT; bp = p; bnx = NX; bny = NY; bnz = NZ; } }
      if (!bp) continue;
      const hx = ox + dx * best, hy = oy + dy * best, hz = oz + dz * best, m = bp.m;
      col[0] = m.c[0]; col[1] = m.c[1]; col[2] = m.c[2];
      const k = m.pat ? pattern(m, hx, hy, hz, bnx, bny, bnz, col) : 1;
      const ndl = bnx * L[0] + bny * L[1] + bnz * L[2];
      let sh = 1;
      if (ndl > 0 && !opt.noShadow) {
        const sx = hx + bnx * 0.004 * aoH, syy = hy + bny * 0.004 * aoH, sz = hz + bnz * 0.004 * aoH;
        for (let i = 0; i < casters.length; i++) { const p = casters[i]; if (p === bp && p.k !== 3 && p.k !== 1) continue; if (!near(p, sx, syy, sz, L[0], L[1], L[2])) continue; if (hit(p, sx, syy, sz, L[0], L[1], L[2], 1e9)) { sh = 0.32; break; } }
      }
      const ao = 0.66 + 0.34 * clamp(hy / aoH, 0, 1);
      const amb = (0.3 + 0.2 * (bny * 0.5 + 0.5)) * ao;
      const dif = Math.max(0, ndl) * 0.95 * sh;
      const nh = Math.max(0, bnx * Hh[0] + bny * Hh[1] + bnz * Hh[2]);
      const spec = m.spec * Math.pow(nh, m.shin) * sh;
      const rim = Math.pow(1 - Math.max(0, bnx * Vv[0] + bny * Vv[1] + bnz * Vv[2]), 3) * 0.1;
      const e = m.emit || emitAll;
      const q = (py * W + px) * 4;
      d[q] = Math.min(255, (col[0] * k * (amb * 0.92 + dif * 1.0 + rim + e) + spec * 1.0) * 255);
      d[q + 1] = Math.min(255, (col[1] * k * (amb * 0.95 + dif * 0.94 + rim + e) + spec * 0.96) * 255);
      d[q + 2] = Math.min(255, (col[2] * k * (amb * 1.05 + dif * 0.84 + rim + e) + spec * 0.9) * 255);
      d[q + 3] = 255;
      if (px < bx0) bx0 = px; if (px > bx1) bx1 = px; if (py < by0) by0 = py; if (py > by1) by1 = py;
    } }
    c.putImageData(img, 0, 0);
    cv.bb = bx1 < 0 ? null : [bx0 / ss, by0 / ss, (bx1 + 1) / ss, (by1 + 1) / ss];
    if (ss === 1) return cv;
    const out = mkCanvas(opt.w, opt.h), oc = out.getContext('2d'); oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
    oc.drawImage(cv, 0, 0, opt.w, opt.h); out.bb = cv.bb; return out;
  }
  return { MAT, sph, ell, cap, box, gable, frus, poly, render, hex, SP, CP };
})();
