// ================= BUILDINGS 3D: fortresses, halls and towers assembled from lit volumes (units = world px) =================
const B3 = (() => {
  const { MAT, box, gable, frus, cap, ell, sph } = R3;
  const ARCH = {
    hum: { stone: '#9a968c', roof: '#44505e', wood: '#5e4430', trim: '#d9d2c0', plaster: '#d6c8aa', roofK: 'tiles', spire: 1 },
    elf: { stone: '#d6d0c2', roof: '#436f58', wood: '#8a6a44', trim: '#d4b25a', plaster: '#e2dccb', roofK: 'tiles', spire: 1.45 },
    dwf: { stone: '#6e6862', roof: '#7a3a2a', wood: '#4d3526', trim: '#c9953f', plaster: '#8a8278', roofK: 'flat', spire: 0 },
    orc: { stone: '#4a433c', roof: '#4a3a28', wood: '#4f3a28', trim: '#8f2a1c', plaster: '#5a4a3a', roofK: 'thatch', spire: 0 },
    und: { stone: '#57535f', roof: '#2e2c36', wood: '#3a3230', trim: '#6fbf94', plaster: '#6a6674', roofK: 'tiles', spire: 1.9 },
    des: { stone: '#d9c69c', roof: '#b8743e', wood: '#8a6a44', trim: '#2f6aa3', plaster: '#e2d3ac', roofK: 'flat', spire: 0 },
  };
  function build(d, colorHex) {
    const A = ARCH[d.race], r = d.r, P = [], race = d.race;
    const team = MAT(R3.hex(colorHex).map(v => v * 0.85), { pat: 'cloth', ns: 0.5 });
    const stone = MAT(A.stone, { pat: 'stone', bw: 7, bh: 4, ns: 0.35 });
    const stoneDark = MAT(A.stone, { pat: 'stone', bw: 9, bh: 5, ns: 0.35 });
    const roof = A.roofK === 'thatch' ? MAT(A.roof, { pat: 'thatch', ns: 0.5 }) : MAT(A.roof, { pat: 'roof', bw: 4.5, bh: 3, spec: 0.14, shin: 20, ns: 0.3, end: R3.hex(race === 'hum' ? A.plaster : A.stone).map(v => v * 0.9) });
    const wood = MAT(A.wood, { pat: 'planks', bw: 3.5, ns: 0.3 });
    const plaster = MAT(A.plaster, { pat: 'plaster', bw: 13, bh: 11, ns: 0.3 });
    const dark = MAT('#15100b'), lit = MAT(race === 'und' ? '#7dffb0' : '#ffb458', { emit: 1.1 }), gold = MAT(race === 'des' ? '#d9b44a' : A.trim, { pat: 'metal', spec: 0.9, shin: 36, ns: 0.3 });
    // square pyramid (base half-size b, height h) and an obelisk for the desert kingdom
    const pyramid = (cx, cz, b, h, m, y0) => { y0 = y0 || 0; P.push(R3.poly([[0, -1, 0, -y0], [h, b, 0, h * (cx + b) + b * y0], [-h, b, 0, -h * (cx - b) + b * y0], [0, b, h, h * (cz + b) + b * y0], [0, b, -h, -h * (cz - b) + b * y0]], cx, y0 + h / 3, cz, Math.hypot(b, h), m)); };
    const obelisk = (cx, cz, w, h, m) => { P.push(box(cx, h / 2, cz, w, h / 2, w, m)); P.push(R3.poly([[0, -1, 0, -h], [w * 3, w, 0, w * 3 * (cx + w) + w * h], [-w * 3, w, 0, -w * 3 * (cx - w) + w * h], [0, w, w * 3, w * 3 * (cz + w) + w * h], [0, w, -w * 3, -w * 3 * (cz - w) + w * h]], cx, h + w, cz, w * 2, gold)); };
    const rock = MAT('#6f685e', { pat: 'rock', ns: 0.12 });
    const wall = (cx, cz, hx, hz, h, m, y0) => P.push(box(cx, (y0 || 0) + h / 2, cz, hx, h / 2, hz, m));
    const crenels = (cx, cz, hx, hz, y, m) => { // teeth along the wall top (long axis)
      const alongX = hx >= hz, L = alongX ? hx : hz, n = Math.max(2, Math.floor(L / 4));
      for (let k = 0; k <= n; k++) { const t = -L + (2 * L) * k / n; if (k % 2) continue; P.push(alongX ? box(cx + t, y + 2, cz, 1.8, 2, hz + 0.5, m) : box(cx, y + 2, cz + t, hx + 0.5, 2, 1.8, m)); }
    };
    const tower = (cx, cz, rad, h, m) => {
      P.push(frus(cx, 0, cz, rad * 1.08, rad, h, m || stone));
      if (A.roofK === 'flat' || race === 'orc') { P.push(frus(cx, h, cz, rad * 1.18, rad * 1.18, 3, m || stone)); for (let k = 0; k < 8; k += 2) { const a = k / 8 * 6.28; P.push(box(cx + Math.cos(a) * rad, h + 5, cz + Math.sin(a) * rad, 2, 2.5, 2, m || stone)); } }
      else P.push(frus(cx, h, cz, rad * 1.3, 0, rad * 2 * A.spire + 6, roof));
      P.push(box(cx, h * 0.62, cz + rad * 0.98, 1.4, 3, 0.6, h > 40 ? lit : dark));
    };
    const flag = (x, y, z, len) => { P.push(cap([x, y, z], [x, y + len, z], 0.6, wood)); P.push(ell(x + 5, y + len - 3.5, z, 5, 3.2, 0.4, team)); };
    const door = (cx, cz, w, h) => P.push(box(cx, h / 2, cz, w / 2, h / 2, 0.8, dark));
    const win = (cx, y, cz, on) => P.push(box(cx, y, cz, 1.3, 2, 0.6, on ? lit : dark));
    const house = (cx, cz, hx, hz, h, m, rh, alongZ) => {
      wall(cx, cz, hx, hz, h, m);
      if (A.roofK === 'flat') { P.push(box(cx, h + 1, cz, hx + 1.5, 1, hz + 1.5, stoneDark)); crenels(cx, cz + hz, hx, 0.8, h + 2, stoneDark); crenels(cx - hx, cz, 0.8, hz, h + 2, stoneDark); }
      else P.push(gable(cx, h, cz, hx + 2.5, hz + 2.5, rh, roof, alongZ));
    };
    switch (d.sub) {
      case 'fort': {
        if (race === 'dwf') {
          // hall carved into a mountain spur
          P.push(ell(-6, 0, -22, r * 0.95, r * 1.05, r * 0.62, rock), ell(r * 0.5, 0, -28, r * 0.62, r * 0.85, r * 0.5, rock), ell(-r * 0.62, 0, -10, r * 0.5, r * 0.62, r * 0.45, rock), ell(r * 0.2, r * 0.7, -30, r * 0.4, r * 0.5, r * 0.35, rock), ell(-r * 0.3, r * 0.55, -26, r * 0.35, r * 0.45, r * 0.3, rock));
          wall(0, 14, r * 0.5, 10, r * 0.72, stone); P.push(box(0, r * 0.72 + 2, 14, r * 0.54, 2, 11, stoneDark)); crenels(0, 24.5, r * 0.5, 0.8, r * 0.72 + 4, stoneDark);
          P.push(box(0, 13, 24.6, 9, 13, 0.8, dark), box(0, 27, 24.9, 10, 1.4, 0.6, gold));
          for (const sx of [-1, 1]) { wall(sx * r * 0.7, 18, 11, 11, r * 0.95, stone); crenels(sx * r * 0.7, 29, 11, 0.8, r * 0.95, stone); win(sx * r * 0.7, r * 0.6, 29.5, true); flag(sx * r * 0.7, r * 0.95 + 4, 18, 18); }
          for (const sx of [-1, 1]) { P.push(frus(sx * 14, 0, 30, 2.2, 2, 8, dark)); P.push(sph(sx * 14, 11, 30, 3, lit)); }
          break;
        }
        if (race === 'des') {
          // palace court before a great pyramid, flanked by obelisks
          pyramid(0, -r * 0.35, r * 0.62, r * 0.95, MAT(A.stone, { pat: 'stone', bw: 9, bh: 5, ns: 0.35 }));
          pyramid(0, -r * 0.35, r * 0.62 * 0.165, r * 0.95 * 0.165, gold, r * 0.95 * 0.838); // gilded capstone
          wall(0, r * 0.32, r * 0.78, 14, 30, stone); P.push(box(0, 31, r * 0.32, r * 0.82, 2, 16, stoneDark));
          for (const sx of [-1, 1]) { wall(sx * r * 0.72, r * 0.32, 12, 16, 40, stone); P.push(box(sx * r * 0.72, 41, r * 0.32, 13, 1.6, 17, stoneDark)); obelisk(sx * r * 0.42, r * 0.66, 3, 46, stone); flag(sx * r * 0.72, 42, r * 0.32, 16); }
          for (let k = -2; k <= 2; k++) P.push(frus(k * 11, 0, r * 0.32 + 15.5, 2.6, 2.3, 26, MAT(A.plaster, { pat: 'plaster', bw: 13, bh: 11, ns: 0.3 })));
          P.push(box(0, 12, r * 0.32 + 14.5, 7, 12, 0.8, dark), box(0, 26, r * 0.32 + 15, 26, 2, 1.2, MAT(A.trim, { pat: 'cloth' })));
          break;
        }
        const W = r * 0.92, Dz = r * 0.52, wh = A.roofK === 'flat' ? 30 : 34;
        const wm = race === 'orc' ? stoneDark : stone;
        wall(0, Dz, W, 5, wh, wm); wall(0, -Dz - 4, W, 5, wh, wm); wall(-W, -2, 5, Dz + 2, wh, wm); wall(W, -2, 5, Dz + 2, wh, wm);
        crenels(0, Dz, W, 5, wh, wm); crenels(-W, -2, 5, Dz, wh, wm); crenels(W, -2, 5, Dz, wh, wm);
        P.push(box(0, 12, Dz + 5.2, 8, 12, 0.8, dark)); P.push(box(0, 25, Dz + 5.4, 9.5, 1.2, 0.5, gold));
        const tr = race === 'elf' || race === 'und' ? 10 : 13, th = race === 'elf' ? 64 : race === 'und' ? 72 : 50;
        for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { tower(sx * W, sz > 0 ? Dz : -Dz - 4, tr, th, wm); if (sz > 0) flag(sx * W, th + (A.roofK === 'flat' || race === 'orc' ? 8 : tr * 2 * A.spire + 6), sz > 0 ? Dz : -Dz, 14); }
        // keep
        const kh = race === 'elf' ? 88 : race === 'und' ? 82 : 70;
        house(0, -10, 24, 18, kh, wm, 22, false);
        for (const x of [-12, 0, 12]) win(x, kh * 0.72, 8.6, x === 0);
        win(-12, kh * 0.4, 8.6, true); win(12, kh * 0.4, 8.6, false);
        if (race === 'elf' || race === 'und') { tower(0, -10, 8, kh + (race === 'und' ? 40 : 26), stone); flag(0, kh + (race === 'und' ? 40 : 26) + 8 * 2 * A.spire + 6, -10, 16); }
        else flag(0, kh + 22, -10, 16);
        if (race === 'orc') { for (let k = -8; k <= 8; k++) { const x = k * 7; P.push(cap([x, 0, Dz + 10], [x, wh * 0.9 + (k % 2) * 4, Dz + 10], 2.8, wood), cap([x, wh * 0.9 + (k % 2) * 4, Dz + 10], [x, wh + 8 + (k % 2) * 4, Dz + 10], 1, wood)); } P.push(sph(-12, 30, Dz + 13, 3, lit), sph(12, 30, Dz + 13, 3, lit)); }
        break;
      }
      case 'farm': {
        if (race === 'dwf') { P.push(ell(0, 0, -6, r * 1.15, r * 0.9, r * 0.8, rock)); P.push(box(0, 9, 18, 8, 9, 3, stone), box(0, 8, 21.2, 5.5, 8, 0.8, dark), box(0, 17.5, 21.5, 7, 1, 0.8, wood)); P.push(box(18, 4, 20, 6, 3, 4, wood), sph(18, 8, 20, 4, gold)); flag(-18, 22, 8, 12); break; }
        const crop = MAT(race === 'orc' ? '#6a4a3a' : race === 'elf' ? '#5a8a5a' : '#b89a44', { pat: race === 'orc' ? 'leather' : 'thatch', ns: 0.8 });
        P.push(box(-r * 0.4, 0.8, r * 0.3, r * 0.62, 0.8, r * 0.48, crop));
        for (let k = -4; k <= 4; k++) P.push(cap([-r * 0.4 + k * 5, 0, r * 0.3 + r * 0.5], [-r * 0.4 + k * 5, 5, r * 0.3 + r * 0.5], 0.5, wood));
        house(r * 0.35, -r * 0.2, 13, 11, 18, race === 'hum' ? plaster : race === 'orc' ? wood : stone, 12, true);
        door(r * 0.35, -r * 0.2 + 11.4, 5, 9); win(r * 0.35 + 7, 12, -r * 0.2 + 11.4, true);
        if (race === 'elf') { tower(r * 0.1, -r * 0.55, 7, 30, stone); }
        flag(r * 0.8, 10, -r * 0.2, 12);
        break;
      }
      case 'barr': case 'range': case 'stable': case 'forge': {
        const hx = d.sub === 'forge' ? 20 : r * 0.78, hz = d.sub === 'forge' ? 15 : r * 0.42, h = d.sub === 'stable' ? 22 : 26;
        const m = race === 'orc' ? wood : race === 'hum' && d.sub !== 'forge' ? plaster : stone;
        if (d.sub === 'forge') { wall(10, -10, 5, 5, 50, stoneDark); P.push(box(10, 51, -10, 6, 1.2, 6, stoneDark)); }
        house(0, 0, hx, hz, h, m, 14, false);
        wall(0, 0, hx + 0.5, hz + 0.5, 5, stoneDark);
        door(-hx * 0.15, hz + 0.6, 8, 13);
        for (const x of [-hx * 0.6, hx * 0.45]) win(x, h * 0.6, hz + 0.6, x < 0);
        if (d.sub === 'barr') for (let k = 0; k < 4; k++) { const x = hx + 6 + k * 4; P.push(cap([x, 0, 8], [x, 20, 8], 0.5, wood), cap([x, 20, 8], [x, 24, 8], 0.7, MAT('#cfd5da', { pat: 'metal', spec: 1, shin: 50, ns: 0.3 }))); }
        if (d.sub === 'range') for (let k = 0; k < 2; k++) { const x = -hx - 8 + k * 14, z = hz + 10; P.push(cap([x, 0, z], [x, 10, z], 0.6, wood), ell(x, 14, z, 5, 5, 0.8, MAT('#e2d7bd')), ell(x, 14, z + 0.3, 3.2, 3.2, 0.7, MAT('#a8352a')), ell(x, 14, z + 0.6, 1.3, 1.3, 0.6, MAT('#e2d7bd'))); }
        if (d.sub === 'stable') { for (let k = 0; k < 5; k++) P.push(cap([hx + 4 + k * 5, 0, hz + 6], [hx + 4 + k * 5, 9, hz + 6], 0.7, wood)); P.push(cap([hx + 3, 7, hz + 6], [hx + 25, 7, hz + 6], 0.6, wood)); for (const [x, z] of [[-hx - 7, 10], [-hx - 2, 16]]) P.push(frus(x, 0, z, 5, 5, 6, MAT('#c9a646', { pat: 'thatch', ns: 0.8 }))); }
        if (d.sub === 'forge') { P.push(box(-hx * 0.15, 6, hz + 0.9, 4.5, 5, 0.6, lit)); P.push(box(hx + 7, 3, 6, 4, 3, 2.5, MAT('#3a3c40', { pat: 'metal', spec: 0.6, shin: 30, ns: 0.3 })), box(hx + 7, 6.5, 6, 5.5, 0.9, 2, MAT('#4a4d52', { pat: 'metal', spec: 0.8, shin: 40, ns: 0.3 }))); }
        flag(hx * 0.5, h + 12, -hz * 0.3, 12);
        break;
      }
      case 'wall': {
        if (race === 'orc') { for (let k = -4; k <= 4; k++) { const x = k * 4.6; P.push(cap([x, 0, 0], [x, 26 + (k % 2) * 3, 0], 2.4, wood), cap([x, 26 + (k % 2) * 3, 0], [x, 31 + (k % 2) * 3, 0], 0.9, wood)); } P.push(box(0, 14, -1.5, 20, 1.2, 1.2, wood)); break; }
        wall(0, 0, 20, 5.5, 24, stone); P.push(box(0, 25, 0, 20.5, 1.3, 6.5, stoneDark)); crenels(0, 5.5, 20, 0.9, 26, stoneDark); crenels(0, -5.5, 20, 0.9, 26, stoneDark);
        if (race === 'des') P.push(box(0, 27.5, 0, 20.2, 0.6, 6.8, gold));
        break;
      }
      case 'gate': {
        for (const sx of [-1, 1]) { tower(sx * 20, 0, 9, 38, stone); }
        wall(0, 0, 12, 5, 34, stone, 22); P.push(box(0, 11, 5.3, 11, 11, 0.8, MAT('#4a3424', { pat: 'planks', bw: 3, ns: 0.3 })), box(0, 11, -5.3, 11, 11, 0.8, MAT('#4a3424', { pat: 'planks', bw: 3, ns: 0.3 })));
        for (const z of [5.9, -5.9]) for (const x of [-7, 0, 7]) P.push(box(x, 11, z, 0.5, 11, 0.3, MAT('#3a3c40', { pat: 'metal', spec: 0.7, shin: 30 })));
        P.push(box(0, 36, 0, 13, 2, 6, stoneDark)); crenels(0, 6, 12, 0.8, 37, stoneDark); flag(0, 38, 0, 12);
        break;
      }
      case 'tower': {
        if (race === 'des') { obelisk(0, 0, 7, 78, stone); P.push(box(0, 2, 0, 12, 2, 12, stoneDark)); P.push(sph(0, 70, 7.3, 2.2, lit)); flag(9, 10, 9, 14); break; }
        if (race === 'orc') { for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) P.push(cap([x * 1.3, 0, z * 1.3], [x, 46, z], 1.4, wood)); P.push(box(0, 48, 0, 11, 2, 11, wood)); for (const [x, z] of [[-10, 0], [10, 0]]) P.push(box(x, 53, z, 0.8, 4, 10, wood)); P.push(gable(0, 60, 0, 12, 12, 10, roof)); P.push(sph(0, 52, 0, 2.5, lit)); flag(9, 66, 0, 10); break; }
        if (A.roofK === 'flat') { wall(0, 0, 13, 13, 62, stone); P.push(box(0, 63, 0, 14.5, 1.5, 14.5, stoneDark)); crenels(0, 13.5, 13, 0.8, 64, stoneDark); crenels(-13.5, 0, 0.8, 13, 64, stoneDark); crenels(13.5, 0, 0.8, 13, 64, stoneDark); win(0, 40, 13.6, true); flag(-9, 68, -9, 14); break; }
        const rad = race === 'elf' || race === 'und' ? 10 : 14, h = race === 'elf' ? 86 : race === 'und' ? 92 : 70;
        tower(0, 0, rad, h, stone); win(0, h * 0.38, rad * 0.98, false); flag(0, h + rad * 2 * A.spire + 6, 0, 14);
        break;
      }
    }
    // BFME proportions: buildings tower over the soldiers without growing their footprint
    const vs = d.sub === 'fort' ? 1.5 : d.sub === 'tower' ? 1.2 : d.wall ? 1.15 : 1.3;
    for (const p of P) {
      if (p.k === 0) { Object.assign(p, { k: 1, a: p.r, b: p.r * vs, c: p.r, clip: null }); p.y *= vs; }
      else if (p.k === 1) { p.y *= vs; p.b *= vs; if (p.clip) { const n = [p.clip[0], p.clip[1] / vs, p.clip[2]], l = Math.hypot(n[0], n[1], n[2]); p.clip = [n[0] / l, n[1] / l, n[2] / l, p.clip[3] / l]; } }
      else if (p.k === 2) { p.ay *= vs; p.by2 *= vs; }
      else if (p.k === 3) p.pl = p.pl.map(q => { const n = [q[0], q[1] / vs, q[2]], l = Math.hypot(n[0], n[1], n[2]); return [n[0] / l, n[1] / l, n[2] / l, q[3] / l]; });
      else if (p.k === 4) { p.y *= vs; p.h *= vs; }
      p.by *= vs; p.br *= vs; p.br2 = p.br * p.br;
    }
    return P;
  }
  return { build };
})();
const SPRB = new Map(), QB = [], qbBusy = new Set();
function bakeBld3(d, col) {
  const P = B3.build(d, col), r = d.r, K = 1.7;
  const W = Math.ceil(r * 4.2 * K), H = Math.ceil(r * 4.6 * K), ox = W / 2, oy = H - r * 1.1 * K;
  const cv = R3.render(P, { yaw: 0.52, ppu: K, w: W, h: H, ox, oy, ss: 1, ao: r * 1.2, casterMin: 3 });
  const bb = cv.bb || [ox - 1, oy - 1, ox + 1, oy + 1];
  const cw = Math.max(1, Math.ceil(bb[2] - bb[0])), ch = Math.max(1, Math.ceil(bb[3] - bb[1]));
  const out = mkCanvas(cw, ch); out.getContext('2d').drawImage(cv, bb[0], bb[1], cw, ch, 0, 0, cw, ch); cv.width = 0;
  grit(out, 8, 0.05);
  return { cv: out, w: cw / K, h: ch / K, ox: (ox - bb[0]) / K, oy: (oy - bb[1]) / K };
}
function bld3(d, col, sync) {
  const key = d.key + col; const s = SPRB.get(key); if (s) return s;
  if (sync) { const b = bakeBld3(d, col); SPRB.set(key, b); return b; }
  if (!qbBusy.has(key)) { qbBusy.add(key); QB.push({ key, d, col }); }
  return null;
}
function pumpBld3(budgetMs) {
  const t0 = performance.now();
  while (QB.length && performance.now() - t0 < budgetMs) { const j = QB.shift(); qbBusy.delete(j.key); if (!SPRB.has(j.key)) SPRB.set(j.key, bakeBld3(j.d, j.col)); }
  return QB.length;
}
