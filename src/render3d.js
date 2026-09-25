// ================= RENDER3D: real-time WebGL battlefield on three.js =================
// Perspective camera over relief, sun with real shadows, reflective water, fog, swaying forests and grass, instanced 3D armies.
// The game itself stays 2D (x, y): here X = x, Z = y and Y is height. The 2D canvas on top keeps bars, names and HUD marks.
const HS3 = 20, EXT3 = 760, WL3 = -8; // terrain grid step, hills around the field, water surface height
function hasWebGL() { try { const c = document.createElement('canvas'); return !!(window.THREE && window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }

// ---------- procedural detail textures (greyscale atlas 4×2: stone, roof, planks, plaster, thatch, rock, grain, fine) ----------
function detailAtlas() {
  const S = 256, cv = mkCanvas(S * 4, S * 2), c = cv.getContext('2d'), N = makeNoise(77, 64), r = mkRng(5);
  const cell = (i, f) => { const ox = (i % 4) * S, oy = Math.floor(i / 4) * S, img = c.createImageData(S, S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const v = clamp(f(x, y), 0, 1) * 255, q = (y * S + x) * 4; img.data[q] = img.data[q + 1] = img.data[q + 2] = v; img.data[q + 3] = 255; } c.putImageData(img, ox, oy); };
  const n = (x, y, s) => N.fbm(x / s, y / s, 3);
  const H = (a, b) => { let h = Math.imul(a * 73856093 ^ b * 19349663, 1274126177); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };
  // coursed masonry: 6 rows, staggered joints, per-stone tone
  cell(0, (x, y) => { const rh = S / 6, row = Math.floor(y / rh), off = row % 2 ? S / 6 : 0, bw = S / 3, col = Math.floor(((x + off) % S) / bw), fy = y / rh - row, fx = ((x + off) % S) / bw - col; const e = Math.min(fy, 1 - fy, fx * 2, (1 - fx) * 2); return (0.42 + 0.22 * H(row, col) + 0.18 * n(x, y, 12)) * (e < 0.07 ? 0.45 : 1) + 0.08; });
  // roof tiles: rows of rounded tiles
  cell(1, (x, y) => { const rh = S / 6, row = Math.floor(y / rh), fy = y / rh - row, tw = S / 8, fx = (((x + (row % 2) * tw / 2) % S) / tw) % 1; const round = Math.sin(fx * Math.PI); return (0.3 + 0.35 * fy) * (0.6 + 0.4 * round) + 0.12 * n(x, y, 10) + 0.12 * H(row, Math.floor(x / tw)); });
  // vertical planks
  cell(2, (x, y) => { const pw = S / 6, k = Math.floor(x / pw), fx = x / pw - k; return (fx < 0.06 || fx > 0.96 ? 0.25 : 0.5 + 0.18 * H(k, 3)) + 0.2 * (N.fbm(x / 40, y / 3, 2) - 0.5) + 0.1 * n(x, y, 8); });
  // plaster: soft mottling
  cell(3, (x, y) => 0.52 + 0.3 * (n(x, y, 30) - 0.5) + 0.12 * (n(x, y, 5) - 0.5));
  // thatch: long vertical straws
  cell(4, (x, y) => 0.5 + 0.45 * (N.fbm(x / 1.6, y / 30, 3) - 0.5) + 0.15 * (n(x, y, 20) - 0.5));
  // rock: cracks and lumps
  cell(5, (x, y) => { const v = N.fbm(x / 26, y / 26, 4), cr = Math.abs(N.fbm(x / 18 + 9, y / 18 + 3, 3) - 0.5); return 0.35 + 0.5 * v - (cr < 0.03 ? 0.25 : 0); });
  // wood grain / bark
  cell(6, (x, y) => 0.5 + 0.4 * (N.fbm(x / 2.5, y / 45, 3) - 0.5) + 0.1 * Math.sin(x * 0.35 + n(x, y, 20) * 8));
  // fine fabric/leather/leaf noise
  cell(7, (x, y) => 0.5 + 0.35 * (N.fbm(x / 3, y / 3, 3) - 0.5) + 0.1 * (r() - 0.5));
  return cv;
}
// pattern → [atlas cell + 1, tile size in world px]
const PAT3 = { stone: [1, 40], roof: [2, 45], planks: [3, 22], plaster: [4, 40], thatch: [5, 45], rock: [6, 70], wood: [7, 22], leaf: [8, 14], mail: [8, 4], cloth: [8, 7], fur: [7, 8], leather: [8, 10], metal: [8, 26], skin: [8, 14] };

// ---------- R3 primitive lists (units: metres, buildings/trees: world px) → merged three.js geometry ----------
const G3 = {
  hash(x, y, z) { let h = Math.imul((x * 131) | 0, 374761393) + Math.imul((y * 173) | 0, 668265263) + Math.imul((z * 197) | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; },
  kindOf(m) { return m.emit ? 2 : (m.pat === 'metal' || m.pat === 'mail' || m.spec >= 0.5) ? 1 : 0; },
  polyVerts(pl) {
    const pts = [], n = pl.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
      const a = pl[i], b = pl[j], c = pl[k];
      const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
      if (Math.abs(det) < 1e-9) continue;
      const x = (a[3] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[3] * c[2] - b[2] * c[3]) + a[2] * (b[3] * c[1] - b[1] * c[3])) / det;
      const y = (a[0] * (b[3] * c[2] - b[2] * c[3]) - a[3] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[3] - b[3] * c[0])) / det;
      const z = (a[0] * (b[1] * c[3] - b[3] * c[1]) - a[1] * (b[0] * c[3] - b[3] * c[0]) + a[3] * (b[0] * c[1] - b[1] * c[0])) / det;
      let ok = true; const eps = 1e-4 * (1 + Math.abs(x) + Math.abs(y) + Math.abs(z));
      for (const q of pl) if (q[0] * x + q[1] * y + q[2] * z - q[3] > eps) { ok = false; break; }
      if (ok && !pts.some(p => Math.abs(p[0] - x) + Math.abs(p[1] - y) + Math.abs(p[2] - z) < eps * 4)) pts.push([x, y, z]);
    }
    return pts;
  },
  // one merged geometry with 3 groups: dull (0), metal (1), glowing (2)
  build(P, opt) {
    const T = THREE, perM = opt && opt.metres ? PPM : 1, seg = opt && opt.seg || 1, hi = opt && opt.hi ? 2.4 : 1;
    const G = [0, 1, 2].map(() => ({ pos: [], nrm: [], col: [], pat: [], idx: [] }));
    const lin = v => Math.pow(v, 2.2);
    const add = (g, geo, m, jit) => {
      const ps = geo.attributes.position.array, ns = geo.attributes.normal.array, base = g.pos.length / 3;
      const pd = PAT3[m.pat] || null, pc = pd ? pd[0] : 0, ps2 = pd ? perM / pd[1] : 0;
      const kind = this.kindOf(m), e = m.emit || 0;
      const c0 = lin(m.c[0]), c1 = lin(m.c[1]), c2 = lin(m.c[2]);
      for (let i = 0; i < ps.length; i += 3) {
        let x = ps[i], y = ps[i + 1], z = ps[i + 2];
        if (jit) { const h = (this.hash(x * 3, y * 3, z * 3) - 0.5) * jit; x += ns[i] * h; y += ns[i + 1] * h; z += ns[i + 2] * h; }
        g.pos.push(x, y, z); g.nrm.push(ns[i], ns[i + 1], ns[i + 2]);
        const k = kind === 2 ? 0.7 + e * 0.9 : kind === 1 ? 1 : 0.9 + 0.2 * this.hash(x * 7, y * 7, z * 7);
        g.col.push(c0 * k, c1 * k, c2 * k); g.pat.push(pc, ps2);
      }
      if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) g.idx.push(ix[i] + base); }
      else for (let i = 0; i < ps.length / 3; i++) g.idx.push(base + i);
      geo.dispose();
    };
    const mtx = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), v = new T.Vector3();
    for (const p of P) {
      const g = G[this.kindOf(p.m)];
      let geo = null, jit = 0;
      if (p.k === 0) { const s = Math.max(6 * hi, Math.min(14 * hi, Math.round(p.r * perM * 0.7 * seg * hi))) | 0; geo = new T.SphereGeometry(p.r, s, Math.max(4, s * 0.7 | 0)); geo.translate(p.x, p.y, p.z); if (p.m.pat === 'leaf') jit = p.r * 0.35; }
      else if (p.k === 1) {
        const s = Math.max(6 * hi, Math.min(16 * hi, Math.round(Math.max(p.a, p.b, p.c) * perM * 0.6 * seg * hi))) | 0;
        geo = new T.SphereGeometry(1, s, Math.max(4, s * 0.7 | 0)); geo.scale(p.a, p.b, p.c); geo.translate(p.x, p.y, p.z);
        if (p.clip) { // flatten the cut-away part onto the clipping plane
          const a = geo.attributes.position.array, nn = geo.attributes.normal.array, cl = p.clip;
          for (let i = 0; i < a.length; i += 3) { const d = cl[0] * a[i] + cl[1] * a[i + 1] + cl[2] * a[i + 2] - cl[3]; if (d > 0) { a[i] -= cl[0] * d; a[i + 1] -= cl[1] * d; a[i + 2] -= cl[2] * d; nn[i] = cl[0]; nn[i + 1] = cl[1]; nn[i + 2] = cl[2]; } }
        }
        if (p.m.pat === 'leaf') jit = Math.min(p.a, p.b, p.c) * 0.3;
      } else if (p.k === 2) {
        const ax = p.bx2 - p.ax, ay = p.by2 - p.ay, az = p.bz2 - p.az, L = Math.hypot(ax, ay, az), rs = Math.max(5 * hi, Math.min(10 * hi, Math.round(p.r * perM * 1.2 * seg * hi))) | 0;
        geo = L < 1e-6 ? new T.SphereGeometry(p.r, rs, 4) : new T.CapsuleGeometry(p.r, L, 2, rs);
        if (L >= 1e-6) { v.set(ax / L, ay / L, az / L); q.setFromUnitVectors(up, v); mtx.makeRotationFromQuaternion(q); geo.applyMatrix4(mtx); }
        geo.translate((p.ax + p.bx2) / 2, (p.ay + p.by2) / 2, (p.az + p.bz2) / 2);
      } else if (p.k === 3) {
        const pts = this.polyVerts(p.pl); if (pts.length < 4) continue;
        const pos = [], nrm = [];
        for (const pl of p.pl) {
          const on = pts.filter(pp => Math.abs(pl[0] * pp[0] + pl[1] * pp[1] + pl[2] * pp[2] - pl[3]) < 1e-3 * (1 + Math.abs(pl[3])));
          if (on.length < 3) continue;
          let cx = 0, cy = 0, cz = 0; for (const pp of on) { cx += pp[0]; cy += pp[1]; cz += pp[2]; } cx /= on.length; cy /= on.length; cz /= on.length;
          const n = new T.Vector3(pl[0], pl[1], pl[2]), t1 = new T.Vector3(on[0][0] - cx, on[0][1] - cy, on[0][2] - cz).normalize(), t2 = new T.Vector3().crossVectors(n, t1);
          on.sort((a2, b2) => Math.atan2((a2[0] - cx) * t2.x + (a2[1] - cy) * t2.y + (a2[2] - cz) * t2.z, (a2[0] - cx) * t1.x + (a2[1] - cy) * t1.y + (a2[2] - cz) * t1.z) - Math.atan2((b2[0] - cx) * t2.x + (b2[1] - cy) * t2.y + (b2[2] - cz) * t2.z, (b2[0] - cx) * t1.x + (b2[1] - cy) * t1.y + (b2[2] - cz) * t1.z));
          for (let i = 1; i < on.length - 1; i++) for (const pp of [on[0], on[i], on[i + 1]]) { pos.push(pp[0], pp[1], pp[2]); nrm.push(pl[0], pl[1], pl[2]); }
        }
        geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
      } else if (p.k === 4) {
        const s = Math.max(6 * hi, Math.min(20 * hi, Math.round(Math.max(p.r0, p.r1) * perM * 0.5 * seg * hi))) | 0;
        geo = new T.CylinderGeometry(p.r1, p.r0, p.h, s, 1, false); geo.translate(p.x, p.y + p.h / 2, p.z);
        if (p.m.pat === 'leaf') jit = Math.max(p.r0, p.r1) * 0.12;
      }
      if (geo) add(g, geo, p.m, jit);
    }
    const out = new T.BufferGeometry(), pos = [], nrm = [], col = [], pat = [], idx = [];
    let vo = 0, io = 0;
    G.forEach((g, gi) => {
      if (!g.idx.length) return;
      for (let i = 0; i < g.pos.length; i++) { pos.push(g.pos[i]); nrm.push(g.nrm[i]); col.push(g.col[i]); }
      for (const p of g.pat) pat.push(p);
      for (const i of g.idx) idx.push(i + vo);
      out.addGroup(io, g.idx.length, gi); vo += g.pos.length / 3; io += g.idx.length;
    });
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3)); out.setAttribute('patd', new T.Float32BufferAttribute(pat, 2));
    out.setIndex(vo > 65000 ? new T.Uint32BufferAttribute(idx, 1) : new T.Uint16BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  },
};

// ---------- trees as 3D volumes (world px) ----------
function treePrims(v) {
  const { MAT, frus, sph, cap } = R3, P = [], r = mkRng(v * 131 + 7);
  const conifer = v === 0 || v === 3 || v === 8 || v === 9, snowy = v === 8 || v === 9;
  if (conifer) {
    P.push(frus(0, 0, 0, 3.4, 1.6, 34, MAT('#4a3424', { pat: 'wood' })));
    const tiers = 6;
    for (let t = 0; t < tiers; t++) {
      const y = 12 + t * 12.5, w = 25 - t * 3.6, k = t / tiers;
      const col = snowy ? mix3([22, 44, 32], [52, 86, 62], k) : v === 3 ? mix3([30, 52, 30], [84, 118, 66], k) : mix3([20, 42, 28], [66, 108, 70], k);
      P.push(frus(0, y, 0, w, 0.5, 25 - t * 1.4, MAT(col.map(c => c / 255), { pat: 'leaf' })));
      if (snowy) P.push(frus(0, y + 7, 0, w * 0.78, 0.4, 16 - t, MAT('#eef2f7', { pat: 'leaf' })));
    }
  } else if (v === 10) {
    const bark = MAT('#4b4038', { pat: 'wood' });
    P.push(frus(0, 0, 0, 3.4, 1.2, 46, bark));
    const br = (x, y, z, ax, ay, az, l, w, n) => { const e = [x + ax * l, y + ay * l, z + az * l]; P.push(cap([x, y, z], e, w, bark)); if (n > 0) for (const s of [-1, 1]) br(e[0], e[1], e[2], ax * 0.7 + s * 0.4 * (r() + 0.3), ay * 0.8 + 0.3, az * 0.7 + s * 0.4 * (r() - 0.5), l * 0.68, w * 0.65, n - 1); };
    br(0, 30, 0, -0.6, 0.8, 0.2, 16, 1.4, 2); br(0, 36, 0, 0.6, 0.8, -0.2, 15, 1.4, 2); br(0, 44, 0, 0.1, 1, 0.3, 12, 1.2, 2);
  } else {
    const autumn = v === 6 || v === 7, bark = MAT(v % 3 === 1 ? '#4d3a2b' : '#6e6558', { pat: 'wood' });
    P.push(frus(0, 0, 0, 4.4, 2.4, 40, bark), cap([0, 26, 0], [-10, 42, 3], 1.8, bark), cap([0, 30, 0], [9, 46, -4], 1.8, bark));
    const base = autumn ? (v === 6 ? [[78, 34, 16], [176, 108, 44]] : [[64, 48, 18], [168, 138, 60]]) : v % 3 === 1 ? [[22, 40, 20], [72, 100, 46]] : [[30, 46, 22], [92, 112, 54]];
    for (let k = 0; k < 11; k++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * 17, y = 50 + (r() - 0.3) * 20, rad = 10 + r() * 7;
      const light = clamp(0.35 + (y - 45) / 40 + (r() - 0.5) * 0.3, 0, 1);
      P.push(sph(Math.cos(a) * d, y, Math.sin(a) * d * 0.9, rad, MAT(mix3(base[0], base[1], light).map(c => c / 255), { pat: 'leaf', ns: 0.4 })));
    }
  }
  return P;
}

// photo-scanned ground materials (Poly Haven, CC0): [asset, colour map name, tile size in world px]
const PH_URL = 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/';
const PBR_SETS = {
  meadow: [['rocky_terrain_02', 'diff', 420], ['dirt_aerial_02', 'diff', 360], ['lichen_rock', 'diff', 150]],
  highland: [['grass_path_3', 'diff', 110], ['rocks_ground_02', 'col', 120], ['lichen_rock', 'diff', 150]],
  snow: [['snow_02', 'diff', 170], ['aerial_mud_1', 'diff', 170], ['lichen_rock', 'diff', 150]],
};
class Renderer3D extends Renderer {
  // quality: 0 low (phones), 1 medium, 2 high, 3 ultra
  constructor(cv, glcv, quality) {
    super(cv);
    const T = THREE;
    this.is3D = true; this.glcv = glcv;
    const phone = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || Math.min(screen.width, screen.height) < 700;
    this.q = quality === undefined || quality < 0 ? (phone ? 0 : 2) : quality;
    this.low = this.q === 0;
    M3.setDetail(this.q >= 3); // ultra: armour lames, knee cops and faces on every soldier
    const gl = this.gl = new T.WebGLRenderer({ canvas: glcv, antialias: this.q >= 2, powerPreference: 'high-performance' });
    gl.outputColorSpace = T.SRGBColorSpace; gl.toneMapping = T.ACESFilmicToneMapping; gl.toneMappingExposure = 1.0;
    gl.shadowMap.enabled = true; gl.shadowMap.type = T.PCFSoftShadowMap;
    this.scene = new T.Scene();
    this.camera = new T.PerspectiveCamera(36, 1, 30, 30000);
    this.sun = new T.DirectionalLight(0xfff1dc, 3.0); this.sun.castShadow = true;
    const ms = [1024, 2048, 2048, 4096][this.q]; this.sun.shadow.mapSize.set(ms, ms); this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 1.2;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new T.HemisphereLight(0xcfe0ff, 0x4a4030, 1.1); this.scene.add(this.hemi);
    this.scene.fog = new T.Fog(0xb8c4c8, 2000, 9000);
    this.uTime = { value: 0 }; this.uCloud = { value: 0.2 };
    this.atlas = new T.CanvasTexture(detailAtlas()); this.atlas.wrapS = this.atlas.wrapT = T.ClampToEdgeWrapping; this.atlas.colorSpace = T.NoColorSpace;
    this.fogU = { tex: { value: null }, on: { value: 0 }, map: { value: new T.Vector2(MAP_W, MAP_H) } };
    this.m3 = this.makeMats3();
    this.units = new Map(); this.geoQ = []; this.geoBusy = new Set(); this.geos = new Map();
    this.bldMesh = new Map();
    this.lightPool = []; for (let i = 0; i < (this.low ? 2 : 6); i++) { const L = new T.PointLight(0xffa050, 0, 300, 1.6); this.lightPool.push(L); this.scene.add(L); }
    this.gq = []; // ground marks queued for the next frame
    this.ray = new T.Raycaster(); this.v3 = new T.Vector3(); this.v2 = new T.Vector2();
    this.yawT = 0; this.tgtH = 0;
    this.parts3 = [];
    this.makeParticles(); this.makeGround(); this.makeBlobs();
    const dummy = new T.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); dummy.needsUpdate = true;
    this.pbrU = { tGC: { value: dummy }, tGN: { value: dummy }, tDC: { value: dummy }, tDN: { value: dummy }, tRC: { value: dummy }, tRN: { value: dummy }, uPBR: { value: 0 }, uTile: { value: new T.Vector3(300, 300, 500) }, uAvg: { value: new T.Color(0.1, 0.12, 0.06) } };
    this.texCache = new Map(); this.pbrTarget = 0;
    this.loadAtlasPhotos();
    A3.onReady = () => this.refreshAssets(); A3.load();
    this.postOn = this.q >= 1;
  }
  // photo-scanned surfaces (Poly Haven, CC0) replace the procedural detail cells: masonry, roof tiles, planks, plaster, reed thatch, rock, bark
  loadAtlasPhotos() {
    const cv = this.atlas.image, c = cv.getContext('2d'), S = cv.width / 4;
    const list = [[0, 'medieval_blocks_05'], [1, 'grey_roof_tiles'], [2, 'brown_planks_05'], [3, 'plaster_grey_04'], [4, 'reed_roof_04'], [5, 'lichen_rock'], [6, 'bark_brown_02']];
    for (const [cell, a] of list) {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => {
        const t = mkCanvas(S, S), tc = t.getContext('2d'); tc.drawImage(img, 0, 0, S, S);
        const d = tc.getImageData(0, 0, S, S), px = d.data; let sum = 0, sq = 0, n = S * S;
        for (let i = 0; i < px.length; i += 4) { const l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255; sum += l; sq += l * l; }
        const mean = sum / n, sd = Math.sqrt(Math.max(1e-6, sq / n - mean * mean)), k = 0.27 / sd;
        for (let i = 0; i < px.length; i += 4) { const l = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255, v = clamp(0.5 + (l - mean) * k, 0.05, 0.95) * 255; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; }
        c.putImageData(d, (cell % 4) * S, Math.floor(cell / 4) * S); this.atlas.needsUpdate = true;
      };
      img.src = PH_URL + a + '/' + a + '_diff_1k.jpg';
    }
  }
  // load the biome's photo materials in the background; the procedural ground stays until they arrive
  loadPBR(biome) {
    const set = PBR_SETS[biome] || PBR_SETS.meadow, U = this.pbrU, T = THREE, loader = new T.TextureLoader(); loader.setCrossOrigin('anonymous');
    this.pbrTarget = 0; U.uPBR.value = 0; U.uTile.value.set(set[0][2], set[1][2], set[2][2]);
    const want = set.flatMap(([a, c]) => [[a, c, true], [a, 'nor_gl', false]]), keys = ['tGC', 'tGN', 'tDC', 'tDN', 'tRC', 'tRN'];
    let done = 0, failed = false; const my = this.pbrGen = (this.pbrGen || 0) + 1;
    want.forEach(([a, kind, col], i) => {
      const url = PH_URL + a + '/' + a + '_' + kind + '_1k.jpg';
      const use = tex => { if (my !== this.pbrGen) return; U[keys[i]].value = tex; if (++done === want.length && !failed) this.pbrTarget = 1; };
      const hit = this.texCache.get(url); if (hit) { use(hit); return; }
      loader.load(url, tex => { tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.colorSpace = col ? T.SRGBColorSpace : T.NoColorSpace; tex.anisotropy = Math.min(8, this.gl.capabilities.getMaxAnisotropy()); this.texCache.set(url, tex); use(tex); }, undefined, () => { failed = true; });
    });
  }
  // ---- shared materials: dull, metal, glowing (+ triplanar detail from the atlas) ----
  patchDetail(m, extra) {
    const atlas = this.atlas, uTime = this.uTime;
    m.onBeforeCompile = sh => {
      sh.uniforms.tAtlas = { value: atlas }; sh.uniforms.uTime = uTime;
      sh.vertexShader = 'attribute vec2 patd;\nvarying vec2 vPatd;\nvarying vec3 vOPos;\nvarying vec3 vONrm;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPatd = patd; vOPos = position; vONrm = normal;\n' + (extra || ''));
      sh.fragmentShader = 'uniform sampler2D tAtlas;\nvarying vec2 vPatd;\nvarying vec3 vOPos;\nvarying vec3 vONrm;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (vPatd.x > 0.5) {
        vec3 bw = pow(abs(normalize(vONrm)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
        vec3 p = vOPos * vPatd.y; float cell = vPatd.x - 1.0;
        vec2 co = vec2(mod(cell, 4.0) * 0.25, floor(cell / 4.0) * 0.5), sz = vec2(0.25, 0.5) * 0.94, pad = vec2(0.25, 0.5) * 0.03;
        float d = texture2D(tAtlas, co + pad + fract(p.zy) * sz).r * bw.x + texture2D(tAtlas, co + pad + fract(p.xz) * sz).r * bw.y + texture2D(tAtlas, co + pad + fract(p.xy) * sz).r * bw.z;
        diffuseColor.rgb *= 0.5 + d;
      }`);
    };
    m.customProgramCacheKey = () => 'ak' + (extra ? extra.length : 0);
    return m;
  }
  // fog of war on a material: unexplored land is near black, explored but unseen land is dimmed
  fogPatch(mat) {
    if (!mat || mat.__fog) return mat; mat.__fog = 1;
    const prev = mat.onBeforeCompile, U = this.fogU, pk = mat.customProgramCacheKey;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(mat, sh, r);
      sh.uniforms.tFogW = U.tex; sh.uniforms.uFogOn = U.on; sh.uniforms.uFogMap = U.map;
      sh.vertexShader = 'varying vec2 vFogUV;\nuniform vec2 uFogMap;\n' + sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n{ vec4 fw = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nfw = instanceMatrix * fw;\n#endif\nfw = modelMatrix * fw; vFogUV = fw.xz / uFogMap; }');
      sh.fragmentShader = 'varying vec2 vFogUV;\nuniform sampler2D tFogW;\nuniform float uFogOn;\n' + sh.fragmentShader.replace('#include <fog_fragment>', 'if (uFogOn > 0.5) { vec2 fv = texture2D(tFogW, vFogUV).rg; gl_FragColor.rgb *= mix(0.1, mix(0.45, 1.0, fv.r), fv.g); }\n#include <fog_fragment>');
    };
    mat.customProgramCacheKey = () => (pk ? pk.call(mat) : '') + '|fog';
    mat.needsUpdate = true;
    return mat;
  }
  fogAt(x, y) { const F = this.fogF; if (!this.fogU.on.value || !F) return 1; const i = clamp((y / 40) | 0, 0, F.H - 1) * F.W + clamp((x / 40) | 0, 0, F.W - 1); return F.vis[i] ? 1 : F.exp[i] ? 0.4 : 0.06; }
  setFog(F) {
    const T = THREE;
    if (!F || !F.active) { this.fogU.on.value = 0; return; }
    if (!this.fogTex || this.fogTex.image.width !== F.W) { const d = new Uint8Array(F.W * F.H * 4); this.fogTex = new T.DataTexture(d, F.W, F.H, T.RGBAFormat); this.fogTex.magFilter = this.fogTex.minFilter = T.LinearFilter; this.fogU.tex.value = this.fogTex; }
    const d = this.fogTex.image.data; for (let i = 0; i < F.W * F.H; i++) { d[i * 4] = F.vis[i] ? 255 : 0; d[i * 4 + 1] = F.exp[i] ? 255 : 0; d[i * 4 + 3] = 255; }
    this.fogTex.needsUpdate = true; this.fogU.on.value = 1; this.fogF = F;
  }
  makeMats3() {
    const T = THREE;
    const dull = this.patchDetail(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, envMapIntensity: 0.45 }));
    const metal = this.patchDetail(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.65, envMapIntensity: 0.75 }));
    const glow = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const wind = 'float sw = sin(uTime * 1.3 + instanceMatrix[3].x * 0.021 + instanceMatrix[3].z * 0.017) * max(0.0, position.y - 18.0) * 0.012; transformed.x += sw; transformed.z += sw * 0.6;';
    const treeD = this.patchDetail(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.4 }), wind);
    const ghost = new T.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false });
    for (const m of [dull, metal, glow, treeD]) this.fogPatch(m);
    return { unit: [dull, metal, glow], tree: [treeD, metal, glow], ghost: [ghost, ghost, ghost] };
  }
  // ---- world ----
  setWorld(seed, type) {
    super.setWorld(seed, type);
    if (this.built3 === this.worldKey) return;
    this.built3 = this.worldKey;
    if (this.world) { this.scene.remove(this.world); this.world.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    for (const m of this.bldMesh.values()) this.scene.remove(m.mesh); this.bldMesh.clear();
    this.world = new THREE.Group(); this.scene.add(this.world); this.mist = null;
    this.buildHeights(); this.buildTerrain3(); this.buildWater3(); this.buildTrees3(); this.buildProps3(); this.buildGrass3(); this.buildSky3(); this.buildLife3();
    this.corpses = []; this.decals = []; this.parts3 = [];
  }
  hRaw(x, y) {
    const M = this.map, xc = clamp(x, 0, MAP_W), yc = clamp(y, 0, MAP_H), N = this.hN, N2 = this.hN2;
    const w = M.wdAt(xc, yc), c2 = M.clAt(xc, yc);
    let flat = clamp((w - 30) / 140, 0, 1);
    for (const s of START_POS) flat = Math.min(flat, clamp((Math.hypot(xc - s[0], yc - s[1]) - 300) / 260, 0, 1));
    for (const o of M.outposts) flat = Math.min(flat, clamp((Math.hypot(xc - o[0], yc - o[1]) - 120) / 160, 0, 1));
    for (const o of M.camps) flat = Math.min(flat, clamp((Math.hypot(xc - o[0], yc - o[1]) - 110) / 140, 0, 1));
    let h = (N.fbm(xc / 240, yc / 240, 5) - 0.5) * 110 * flat;
    if (c2 < 0) { const inner = Math.min(1, -c2 / 60), ridge = 1 - Math.abs(2 * N2.fbm(xc / 36, yc / 36, 3) - 1); h += (Math.pow(Math.min(1, -c2 / 170), 0.75) * 1.3 + ridge * inner * 0.45) * 120; }
    else if (c2 < 25) h += (25 - c2) / 25 * 5;
    if (w < 40) h -= (40 - Math.max(w, 0)) * 0.2;
    if (w < 0) h -= Math.min(-w * 1.4, 36);
    const out = Math.max(-x, x - MAP_W, -y, y - MAP_H, 0);
    if (out > 0) h += Math.pow(Math.min(1, out / EXT3), 1.4) * (160 + 140 * N2.fbm(x / 300, y / 300, 3)) + (N.fbm(x / 90, y / 90, 3) - 0.5) * 30 * Math.min(1, out / 200);
    return h;
  }
  buildHeights() {
    this.hN = makeNoise(this.seed * 3 + 11); this.hN2 = makeNoise(this.seed * 5 + 29);
    const GW = Math.ceil((MAP_W + EXT3 * 2) / HS3) + 1, GH = Math.ceil((MAP_H + EXT3 * 2) / HS3) + 1, H = new Float32Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) H[j * GW + i] = this.hRaw(i * HS3 - EXT3, j * HS3 - EXT3);
    this.HG = { GW, GH, H };
  }
  gz(x, y) {
    const { GW, GH, H } = this.HG, gx = clamp((x + EXT3) / HS3, 0, GW - 1.001), gy = clamp((y + EXT3) / HS3, 0, GH - 1.001), i = gx | 0, j = gy | 0, fx = gx - i, fy = gy - j, k = j * GW + i;
    return H[k] * (1 - fx) * (1 - fy) + H[k + 1] * fx * (1 - fy) + H[k + GW] * (1 - fx) * fy + H[k + GW + 1] * fx * fy;
  }
  // where a unit stands: riverbed when wading, deck on bridges, ice on frozen lakes
  heightAt(x, y) {
    if (!this.HG) return 0;
    const h = this.gz(x, y);
    if (x >= 0 && y >= 0 && x <= MAP_W && y <= MAP_H) { const w = this.map.water(x, y); if (w === 2) return Math.max(h, WL3 + 9); if (w === 4) return Math.max(h, WL3 + 0.5); if (w === 1) return Math.max(h, WL3 - 11); }
    return h;
  }
  buildTerrain3() {
    const T = THREE, { GW, GH, H } = this.HG, M = this.map;
    const pos = new Float32Array(GW * GH * 3), uv = new Float32Array(GW * GH * 2);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const k = j * GW + i, x = i * HS3 - EXT3, y = j * HS3 - EXT3; pos[k * 3] = x; pos[k * 3 + 1] = H[k]; pos[k * 3 + 2] = y; uv[k * 2] = x / MAP_W; uv[k * 2 + 1] = y / MAP_H; }
    const idx = new Uint32Array((GW - 1) * (GH - 1) * 6); let o = 0;
    for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) { const a = j * GW + i, b = a + 1, c = a + GW, d = c + 1; idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d; }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.setIndex(new T.BufferAttribute(idx, 1)); geo.computeVertexNormals();
    const tr = this.terrain, colT = new T.CanvasTexture(tr.cv); colT.colorSpace = T.SRGBColorSpace; colT.anisotropy = this.gl.capabilities.getMaxAnisotropy(); colT.flipY = false; colT.wrapS = colT.wrapT = T.MirroredRepeatWrapping;
    // packed material masks: r grass, g dirt, b rock, a water
    const mw = tr.masks.grass.width, mh = tr.masks.grass.height, pk = mkCanvas(mw, mh), pc = pk.getContext('2d'), img = pc.createImageData(mw, mh);
    const md = ['grass', 'dirt', 'rock', 'water'].map(k => tr.masks[k].getContext('2d').getImageData(0, 0, mw, mh).data);
    for (let i = 0; i < mw * mh; i++) for (let c = 0; c < 4; c++) img.data[i * 4 + c] = md[c][i * 4 + 3];
    void pc; this.maskData = img.data; this.maskW = mw; this.maskH = mh;
    const mskT = new T.DataTexture(new Uint8Array(img.data.buffer.slice(0)), mw, mh, T.RGBAFormat); mskT.magFilter = T.LinearFilter; mskT.minFilter = T.LinearMipmapLinearFilter; mskT.generateMipmaps = true; mskT.wrapS = mskT.wrapT = T.MirroredRepeatWrapping; mskT.needsUpdate = true;
    const det = k => { const t = new T.CanvasTexture(detailTex(k)); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.NoColorSpace; t.anisotropy = 8; return t; };
    const b = M.biome, dG = det(b === 'snow' ? 'snow' : b === 'highland' ? 'dry' : 'grass'), dD = det('dirt'), dR = det('rock');
    this.trampleT3 = new T.CanvasTexture(this.trample); this.trampleT3.flipY = false;
    const cl = new T.CanvasTexture(this.clouds); cl.wrapS = cl.wrapT = T.RepeatWrapping;
    const P = PAL[b], edge = new T.Color().setRGB(...mix3(P.G1, P.G2, 0.45).map(v => Math.pow(v / 255, 2.2)));
    const mat = new T.MeshStandardMaterial({ map: colT, roughness: 0.94, metalness: 0, envMapIntensity: 0.35 });
    const uTime = this.uTime, uCloud = this.uCloud;
    // average colour of the painted map: photo textures are tinted by the map's large-scale hues, roads and hillshade
    { const tc = this.terrain.cv.getContext('2d').getImageData(0, 0, this.terrain.cv.width, this.terrain.cv.height).data; let r = 0, g = 0, bb = 0, n = 0; for (let i = 0; i < tc.length; i += 4 * 97) { r += Math.pow(tc[i] / 255, 2.2); g += Math.pow(tc[i + 1] / 255, 2.2); bb += Math.pow(tc[i + 2] / 255, 2.2); n++; } this.pbrU.uAvg.value.setRGB(r / n, g / n, bb / n); }
    this.loadPBR(b);
    const U = this.pbrU;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, { tMask: { value: mskT }, tDG: { value: dG }, tDD: { value: dD }, tDR: { value: dR }, tTr: { value: this.trampleT3 }, tCl: { value: cl }, uTime, uCloud, uEdge: { value: edge }, uMap: { value: new T.Vector2(MAP_W, MAP_H) }, uSnow: { value: b === 'snow' ? 1 : 0 } }, U);
      sh.vertexShader = 'varying vec3 vWP;\nvarying vec3 vWN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = 'varying vec3 vWP;\nvarying vec3 vWN;\nuniform sampler2D tMask, tDG, tDD, tDR, tTr, tCl, tGC, tGN, tDC, tDN, tRC, tRN;\nuniform float uTime, uCloud, uSnow, uPBR;\nuniform vec3 uEdge, uTile, uAvg;\nuniform vec2 uMap;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec2 muv = clamp(vWP.xz / uMap, 0.0, 1.0);
        vec4 mk = texture2D(tMask, vWP.xz / uMap);
        vec3 an = abs(vWN); an /= (an.x + an.y + an.z);
        vec2 wuv = vWP.xz / 170.0;
        float g = texture2D(tDG, wuv).r, dd = texture2D(tDD, wuv * 1.2).r, rr = texture2D(tDR, vWP.zy / 110.0).r * an.x + texture2D(tDR, vWP.xz / 130.0).r * an.y + texture2D(tDR, vWP.xy / 110.0).r * an.z;
        float tot = mk.r + mk.g + mk.b + 0.001;
        float det = (g * mk.r + dd * mk.g + rr * mk.b) / tot;
        float dA = clamp(tot, 0.0, 1.0) * (1.0 - mk.a) * 0.85;
        vec3 cmap = diffuseColor.rgb;
        vec3 procC = cmap * mix(vec3(1.0), vec3(det * 2.0), dA * (1.0 - 0.35 * mk.b / tot));
        procC *= 1.0 - 0.38 * clamp(mk.b * 1.4 - 0.2, 0.0, 1.0) * (1.0 - uSnow * 0.5);
        procC *= 0.9 + texture2D(tDG, vWP.xz / 23.0).r * 0.2;
        vec3 akPert = vec3(0.0); float akRough = 0.94;
        if (uPBR > 0.001) {
          float mac = texture2D(tCl, vWP.xz / 1100.0).a;
          vec2 r2 = vec2(vWP.x * 0.8 + vWP.z * 0.6, -vWP.x * 0.6 + vWP.z * 0.8);
          vec2 g1 = vWP.xz / uTile.x, g2 = r2 / (uTile.x * 2.6), d1 = vWP.xz / uTile.y, d2 = r2 / (uTile.y * 2.3);
          float mg = 0.25 + 0.5 * mac;
          vec3 gC = mix(texture2D(tGC, g1).rgb, texture2D(tGC, g2).rgb, mg), gN = mix(texture2D(tGN, g1).rgb, texture2D(tGN, g2).rgb, mg);
          vec3 dC = mix(texture2D(tDC, d1).rgb, texture2D(tDC, d2).rgb, mg), dN = mix(texture2D(tDN, d1).rgb, texture2D(tDN, d2).rgb, mg);
          vec2 rx = vWP.zy / uTile.z, ry = vWP.xz / uTile.z, rz = vWP.xy / uTile.z;
          vec3 rC = texture2D(tRC, rx).rgb * an.x + texture2D(tRC, ry).rgb * an.y + texture2D(tRC, rz).rgb * an.z, rN = texture2D(tRN, ry).rgb;
          float slope = 1.0 - clamp((vWN.y - 0.62) * 3.0, 0.0, 1.0);
          float wg = mk.r * (0.55 + dot(gC, vec3(0.6))), wd = (mk.g + mk.a * 0.7) * (0.55 + dot(dC, vec3(0.6))), wr = (mk.b + slope * 1.5) * (0.55 + dot(rC, vec3(0.6)));
          wg = pow(wg, 3.0); wd = pow(wd, 3.0); wr = pow(wr, 3.0);
          float ws = wg + wd + wr + 1e-4; wg /= ws; wd /= ws; wr /= ws;
          vec3 pc = gC * wg + dC * wd + rC * wr;
          // keep the painted map's hues: roads, forest floor, hillshade, biome tint
          vec3 tint = clamp(cmap / max(uAvg, vec3(0.02)), vec3(0.5), vec3(1.8));
          pc *= mix(vec3(1.0), vec3(dot(tint, vec3(0.333))), 0.45) * mix(vec3(1.0), tint / max(dot(tint, vec3(0.333)), 0.05), 0.18);
          diffuseColor.rgb = mix(procC, pc, uPBR);
          vec3 nn = (gN * wg + dN * wd + rN * wr) * 2.0 - 1.0;
          akPert = vec3(nn.x, 0.0, -nn.y) * 0.9;
          akRough = mix(0.97, 0.86, wr) - uSnow * wg * 0.3;
        } else diffuseColor.rgb = procC;
        vec4 tr = texture2D(tTr, muv);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.12, 0.08), clamp(tr.a * 1.6, 0.0, 0.55) * (1.0 - uSnow * 0.4));
        float outD = max(max(-vWP.x, vWP.x - uMap.x), max(-vWP.z, vWP.z - uMap.y));
        float slope2 = 1.0 - clamp((vWN.y - 0.55) * 3.0, 0.0, 1.0);
        vec3 outer = mix(uEdge * (0.7 + det * 0.6), vec3(0.23, 0.22, 0.21) * (0.6 + rr * 0.8), clamp(slope2 + (vWP.y - 120.0) / 200.0, 0.0, 1.0));
        if (uSnow > 0.5) outer = mix(outer, vec3(0.86, 0.89, 0.93), clamp((vWP.y - 60.0) / 120.0, 0.0, 0.85));
        diffuseColor.rgb = mix(diffuseColor.rgb, uPBR > 0.001 ? mix(outer, diffuseColor.rgb, 0.5) : outer, smoothstep(60.0, 520.0, outD));
        float cloud = texture2D(tCl, vWP.xz / 1400.0 + vec2(uTime * 0.01, uTime * 0.005)).a;
        diffuseColor.rgb *= 1.0 - cloud * uCloud;`).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n        roughnessFactor = mix(roughnessFactor, akRough, uPBR);').replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (uPBR > 0.001) { vec3 akW = normalize(vWN + akPert * uPBR); normal = normalize((viewMatrix * vec4(akW, 0.0)).xyz); }`);
    };
    this.fogPatch(mat);
    const mesh = new T.Mesh(geo, mat); mesh.receiveShadow = true; this.world.add(mesh); this.terrMesh = mesh;
  }
  buildWater3() {
    const T = THREE, M = this.map, S = 40, GW = Math.ceil(MAP_W / S) + 1, GH = Math.ceil(MAP_H / S) + 1;
    let any = false; const pos = [], col = [], idx = [];
    const snow = M.biome === 'snow';
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const x = i * S, y = j * S, d = WL3 - this.gz(x, y);
      if (d > 0) any = true;
      const a = clamp(d / 3, 0, 1), t = clamp(d / 22, 0, 1);
      pos.push(x, WL3, y);
      if (snow) col.push(0.62, 0.74, 0.84, clamp(d / 3, 0, 1) * 0.96);
      else col.push(0.05 + (0.012 - 0.05) * t, 0.12 + (0.05 - 0.12) * t, 0.12 + (0.075 - 0.12) * t, a * (0.72 + 0.24 * t));
    }
    if (!any) return;
    for (let j = 0; j < GH - 1; j++) for (let i = 0; i < GW - 1; i++) { const a = j * GW + i, b = a + 1, c = a + GW, d = c + 1; idx.push(a, c, b, b, c, d); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(col, 4)); geo.setIndex(idx);
    const n = new T.Vector3(0, 1, 0); const nr = []; for (let i = 0; i < pos.length / 3; i++) nr.push(0, 1, 0); geo.setAttribute('normal', new T.Float32BufferAttribute(nr, 3)); void n;
    const uvs = []; for (let i = 0; i < pos.length; i += 3) uvs.push(pos[i] / 420, pos[i + 2] / 420); geo.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    // tileable ripple normals from value noise
    const W = 256, cv = mkCanvas(W, W), c = cv.getContext('2d'), img = c.createImageData(W, W), N = makeNoise(91, 32);
    const hh = (x, y) => N.fbm(x / 8, y / 8, 4);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const dx = hh(x + 1, y) - hh(x - 1, y), dy = hh(x, y + 1) - hh(x, y - 1), q = (y * W + x) * 4; const nx = -dx * 6, ny = -dy * 6, l = Math.hypot(nx, ny, 1); img.data[q] = (nx / l * 0.5 + 0.5) * 255; img.data[q + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[q + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[q + 3] = 255; }
    c.putImageData(img, 0, 0);
    const nt = new T.CanvasTexture(cv); nt.wrapS = nt.wrapT = T.RepeatWrapping; nt.colorSpace = T.NoColorSpace;
    const mat = new T.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: snow ? 0.3 : 0.1, metalness: snow ? 0 : 0.05, normalMap: nt, normalScale: new T.Vector2(snow ? 0.12 : 0.28, snow ? 0.12 : 0.28), envMapIntensity: snow ? 0.5 : 0.85, depthWrite: false });
    if (!snow) {
      const uTime = this.uTime;
      mat.onBeforeCompile = sh => { sh.uniforms.uTime = uTime; sh.fragmentShader = 'uniform float uTime;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          float shore = 1.0 - smoothstep(0.04, 0.22, vColor.a);
          float fn = texture2D(normalMap, vNormalMapUv * 4.0 + vec2(uTime * 0.035, -uTime * 0.021)).r * 0.6 + texture2D(normalMap, vNormalMapUv * 9.0 - vec2(uTime * 0.02, uTime * 0.03)).g * 0.4;
          float foam = shore * smoothstep(0.5, 0.68, fn) * step(0.01, vColor.a);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.8, 0.79), foam * 0.5);
          diffuseColor.a = max(diffuseColor.a, foam * 0.45);`).replace('#include <normal_fragment_maps>', `vec3 mapN = texture2D(normalMap, vNormalMapUv + vec2(uTime * 0.018, uTime * 0.011)).xyz * 2.0 - 1.0;
          vec3 mapN2 = texture2D(normalMap, vNormalMapUv * 1.7 - vec2(uTime * 0.013, -uTime * 0.02)).xyz * 2.0 - 1.0;
          mapN = normalize(vec3((mapN.xy + mapN2.xy) * normalScale, mapN.z * mapN2.z));
          normal = normalize(tbn * mapN);`); };
    }
    this.fogPatch(mat);
    const mesh = new T.Mesh(geo, mat); mesh.receiveShadow = true; mesh.renderOrder = 2; this.world.add(mesh); this.water3 = mesh;
    this.buildMist3();
  }
  buildMist3() {
    const T = THREE, r = mkRng(this.seed * 5 + 3), n = this.low ? 14 : 38;
    if (!this.mistTex) { const S = 128, cv = mkCanvas(S, S), c = cv.getContext('2d'), N = makeNoise(17, 32), img = c.createImageData(S, S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = (x - S / 2) / (S / 2), dy = (y - S / 2) / (S / 2), rr = Math.sqrt(dx * dx + dy * dy), a = clamp(1 - rr, 0, 1) ** 1.6 * (0.55 + 0.45 * N.fbm(x / 14, y / 14, 3)), q = (y * S + x) * 4; img.data[q] = img.data[q + 1] = img.data[q + 2] = 235; img.data[q + 3] = a * 255; } c.putImageData(img, 0, 0); this.mistTex = new T.CanvasTexture(cv); }
    this.mist = [];
    for (let k = 0, tries = 0; k < n && tries < 2000; tries++) {
      const x = r() * MAP_W, y = r() * MAP_H, h = this.gz(x, y);
      if (h > WL3 + 6 && r() > 0.12) continue;
      const m = new T.Sprite(new T.SpriteMaterial({ map: this.mistTex, transparent: true, depthWrite: false, opacity: 0, fog: true, color: 0xe8ecec }));
      const w = 260 + r() * 320; m.scale.set(w, w * 0.35, 1); m.position.set(x, Math.max(h, WL3) + 14 + r() * 16, y); m.userData = { v: 4 + r() * 8, a: 0.6 + r() * 0.4 }; m.renderOrder = 8;
      this.world.add(m); this.mist.push(m); k++;
    }
  }
  buildSky3() {
    const T = THREE, b = this.map.biome;
    const top = b === 'snow' ? [0.52, 0.6, 0.72] : [0.36, 0.52, 0.78], hor = b === 'snow' ? [0.86, 0.88, 0.9] : [0.84, 0.82, 0.74], gnd = [0.32, 0.3, 0.26];
    const sky = new T.Scene();
    const m = new T.ShaderMaterial({ side: T.BackSide, uniforms: { a: { value: new T.Vector3(...top) }, h: { value: new T.Vector3(...hor) }, g: { value: new T.Vector3(...gnd) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 a,h,g; varying vec3 vP; void main(){ float y = normalize(vP).y; vec3 c = y > 0.0 ? mix(h, a, pow(y, 0.6)) : mix(h, g, pow(-y, 0.4)); vec3 s = normalize(vec3(-0.55, 0.62, -0.55)); c += vec3(1.0,0.9,0.7) * pow(max(dot(normalize(vP), s), 0.0), 60.0) * 3.0; gl_FragColor = vec4(c, 1.0); }' });
    sky.add(new T.Mesh(new T.SphereGeometry(100, 32, 16), m));
    const pm = new T.PMREMGenerator(this.gl);
    if (this.envRT) this.envRT.dispose();
    this.envRT = pm.fromScene(sky, 0.02); pm.dispose();
    this.scene.environment = this.envRT.texture;
    this.skyHor = new T.Color().setRGB(...hor);
    if (!this.skyDome) {
      const sm = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, depthTest: false, fog: false,
        uniforms: { uZen: { value: new T.Color() }, uHor: { value: new T.Color() }, uSun: { value: new T.Vector3(-0.5, 0.78, -0.38).normalize() }, uSunCol: { value: new T.Color(1, 0.9, 0.7) }, uTime: this.uTime, uCov: { value: 0.4 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uZen, uHor, uSun, uSunCol; uniform float uTime, uCov; varying vec3 vP;
          float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
          float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += vn(p) * a; p *= 2.03; a *= 0.5; } return s; }
          void main() {
            vec3 d = normalize(vP); float y = d.y;
            vec3 c = mix(uHor, uZen, pow(clamp(y, 0.0, 1.0), 0.5));
            float sd = max(dot(d, uSun), 0.0);
            c += uSunCol * (pow(sd, 900.0) * 8.0 + pow(sd, 10.0) * 0.28);
            if (y > 0.0) {
              vec2 uv = d.xz / (y + 0.12) * 0.6 + vec2(uTime * 0.006, uTime * 0.002);
              float n = fbm(uv * 2.2), cl = smoothstep(0.62 - uCov * 0.3, 0.95, n) * smoothstep(0.0, 0.2, y);
              vec3 cc = mix(uHor * 1.05, vec3(1.0, 0.97, 0.93), 0.55) * (0.62 + 0.55 * pow(sd, 3.0) + 0.25 * (1.0 - n));
              c = mix(c, cc, cl * 0.9);
            }
            gl_FragColor = vec4(c, 1.0);
          }` });
      this.skyDome = new T.Mesh(new T.SphereGeometry(1, 40, 20), sm); this.skyDome.frustumCulled = false; this.skyDome.renderOrder = -1000; this.scene.add(this.skyDome);
    }
  }
  buildTrees3() {
    const T = THREE, M = this.map, CH = 700, cw = Math.ceil(MAP_W / CH), byKey = new Map();
    this.treeChunks = [];
    for (const t of M.trees) {
      const k = t.v + ':' + (Math.floor(t.x / CH) + Math.floor(t.y / CH) * cw);
      let L = byKey.get(k); if (!L) { L = { v: t.v, list: [], cx: Math.floor(t.x / CH), cy: Math.floor(t.y / CH) }; byKey.set(k, L); } L.list.push(t);
    }
    const geoV = new Map(), m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), p = new T.Vector3(), yax = new T.Vector3(0, 1, 0);
    for (const L of byKey.values()) {
      let geo = geoV.get(L.v); if (!geo) { geo = G3.build(treePrims(L.v), { seg: 0.9 }); geoV.set(L.v, geo); }
      const mesh = new T.InstancedMesh(geo, this.m3.tree, L.list.length);
      L.list.forEach((t, i) => { const r = G3.hash(t.x, t.y, 3); q.setFromAxisAngle(yax, r * 6.28); const sc = t.s * 1.08; s.set(sc, sc * (0.9 + 0.25 * G3.hash(t.y, t.x, 1)), sc); p.set(t.x, this.gz(t.x, t.y) - 2, t.y); m4.compose(p, q, s); mesh.setMatrixAt(i, m4); });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
      const box = new T.Box3(new T.Vector3(L.cx * CH - 60, -60, L.cy * CH - 60), new T.Vector3((L.cx + 1) * CH + 60, 260, (L.cy + 1) * CH + 60));
      this.treeChunks.push({ mesh, box }); this.world.add(mesh);
    }
  }
  buildProps3() {
    const T = THREE, M = this.map, { MAT, box, frus, sph, cap, ell } = R3, m4 = new T.Matrix4(), q = new T.Quaternion(), yax = new T.Vector3(0, 1, 0), sc = new T.Vector3(), pp = new T.Vector3();
    // rocks and boulders
    const rocks = this.decor.filter(o => o.k === 'r');
    if (rocks.length) {
      const g = new T.IcosahedronGeometry(1, 2), a = g.attributes.position.array, cols = [];
      for (let i = 0; i < a.length; i += 3) { const n = 0.75 + 0.5 * G3.hash(a[i] * 5, a[i + 1] * 5, a[i + 2] * 5); a[i] *= n; a[i + 1] *= n * 0.7; a[i + 2] *= n; const k = 0.8 + 0.3 * G3.hash(a[i] * 9, a[i + 1] * 9, a[i + 2] * 9); cols.push(0.18 * k, 0.175 * k, 0.16 * k); }
      g.computeVertexNormals(); g.setAttribute('color', new T.Float32BufferAttribute(cols, 3)); const pd = []; for (let i = 0; i < a.length / 3; i++) pd.push(6, 1 / 3); g.setAttribute('patd', new T.Float32BufferAttribute(pd, 2));
      const mesh = new T.InstancedMesh(g, this.m3.unit[0], rocks.length);
      rocks.forEach((o, i) => { const s0 = (o.v >= 2 ? 26 : 11) * o.s; q.setFromAxisAngle(yax, G3.hash(o.x, o.y, 5) * 6.28); sc.set(s0, s0, s0 * (0.8 + 0.4 * G3.hash(o.y, o.x, 2))); pp.set(o.x, this.gz(o.x, o.y) + s0 * 0.25, o.y); m4.compose(pp, q, sc); mesh.setMatrixAt(i, m4); });
      mesh.castShadow = true; mesh.receiveShadow = true; this.world.add(mesh);
    }
    const P = [];
    const stone = MAT('#a39b8d', { pat: 'stone' }), wood = MAT('#5a4330', { pat: 'wood' }), dark = MAT('#2a2420');
    // ruined pillars on the river island
    for (const o of this.decor.filter(o => o.k === 'p')) { const h0 = this.gz(o.x, o.y), hh = o.broken ? 26 : 50; P.push(frus(o.x, h0 - 2, o.y, 7.5, 6.8, hh, stone)); if (!o.broken) P.push(box(o.x, h0 + hh + 2.5, o.y, 10, 2.5, 10, stone)); }
    // bridges: deck, parapets and piers
    for (const b of M.bridges) {
      const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1), yaw = Math.atan2(b.y2 - b.y1, b.x2 - b.x1), cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2, deck = WL3 + 9;
      P.push(box(cx, deck - 3, cy, len / 2 + 10, 3, 24, MAT('#8f887c', { pat: 'stone' }), -yaw));
      for (const sd of [-1, 1]) P.push(box(cx - Math.sin(yaw) * sd * 23, deck + 3, cy + Math.cos(yaw) * sd * 23, len / 2 + 8, 3.5, 2.2, stone, -yaw));
      const n = Math.max(2, Math.round(len / 60));
      for (let k = 1; k < n; k++) { const t = k / n - 0.5, x = cx + Math.cos(yaw) * len * t, y = cy + Math.sin(yaw) * len * t; P.push(box(x, WL3 - 12, y, 6, 15, 22, stone, -yaw)); }
    }
    // camps: tents, logs, fire pits
    for (const o of this.decor.filter(o => o.k === 'camp')) {
      const h0 = this.gz(o.x, o.y + 40), tent = MAT(o.kind === 'troll' ? '#4a4038' : o.kind === 'wolf' ? '#5a5046' : '#7a5a3a', { pat: 'cloth' });
      if (o.kind === 'wolf') { P.push(ell(o.x - 20, h0, o.y + 10, 34, 22, 26, MAT('#6f685e', { pat: 'rock' })), ell(o.x - 24, h0 + 2, o.y + 26, 12, 12, 4, dark)); }
      else { for (const [dx, dy, s] of [[-34, 10, 1], [26, 0, 0.85]]) { P.push(frus(o.x + dx, h0, o.y + dy, 17 * s, 1, 26 * s, tent), cap([o.x + dx, h0, o.y + dy], [o.x + dx, h0 + 30 * s, o.y + dy], 0.8, wood)); } }
      for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; P.push(sph(o.x + Math.cos(a) * 9, h0 + 1, o.y + 40 + Math.sin(a) * 9, 3, MAT('#6d665c', { pat: 'rock' }))); }
      P.push(cap([o.x - 8, h0 + 2, o.y + 44], [o.x + 8, h0 + 2, o.y + 38], 2, wood), cap([o.x - 6, h0 + 2, o.y + 34], [o.x + 7, h0 + 2, o.y + 44], 2, wood));
    }
    // outposts: stone circles
    for (const [x, y] of M.outposts) { const h0 = this.gz(x, y); P.push(frus(x, h0 - 3, y, 34, 32, 5, stone)); for (let k = 0; k < 10; k++) { const a = k / 10 * 6.28; P.push(box(x + Math.cos(a) * 44, h0 + 7, y + Math.sin(a) * 44, 4, 8 + 5 * G3.hash(x, k, 1), 3, stone, -a)); } P.push(cap([x, h0, y], [x, h0 + 70, y], 1.6, wood)); }
    if (P.length) { const mesh = new T.Mesh(G3.build(P, { seg: 1 }), this.m3.unit); mesh.castShadow = true; mesh.receiveShadow = true; this.world.add(mesh); }
    // outpost and camp flags (colour follows the owner)
    this.opFlags = M.outposts.map(([x, y]) => { const m = new T.Mesh(new T.PlaneGeometry(30, 18, 6, 1).translate(15, 0, 0), new T.MeshStandardMaterial({ color: 0xd8d0bc, side: T.DoubleSide, roughness: 0.9 })); m.position.set(x + 1, this.gz(x, y) + 60, y); m.castShadow = true; this.world.add(m); return m; });
    this.chests = M.camps.map(([x, y]) => { const g = G3.build([box(0, 5, 0, 9, 5, 6, MAT('#6b4a2e', { pat: 'planks' })), box(0, 11, 0, 9.5, 1.5, 6.5, MAT('#c9a04a', { pat: 'metal', spec: 1 })), sph(0, 14, 0, 4, MAT('#ffd46a', { emit: 1 }))], { seg: 1 }); const m = new T.Mesh(g, this.m3.unit); m.position.set(x + 26, this.gz(x, y) , y + 10); m.castShadow = true; this.world.add(m); return m; });
  }
  buildGrass3() {
    const T = THREE, M = this.map, snow = M.biome === 'snow', high = M.biome === 'highland';
    const n = snow ? 0 : [8000, 18000, 34000, 60000][this.q]; if (!n) return;
    // one tuft: 7 bent blades with dark roots and sunlit tips
    const pos = [], col = [], r = mkRng(3);
    for (let b = 0; b < 7; b++) { const a = r() * 6.28, d = r() * 4, x = Math.cos(a) * d, z = Math.sin(a) * d, h = 4 + r() * 5, w = 1.6, lean = (r() - 0.5) * 5, la = r() * 6.28, px = Math.cos(la + 1.57) * w, pz = Math.sin(la + 1.57) * w, tx = x + Math.cos(la) * lean, tz = z + Math.sin(la) * lean;
      pos.push(x - px, 0, z - pz, x + px, 0, z + pz, tx, h, tz, x + px, 0, z + pz, x - px, 0, z - pz, tx, h, tz); for (let k = 0; k < 2; k++) col.push(0.72, 0.72, 0.72, 0.72, 0.72, 0.72, 1.12, 1.12, 1.12); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); const nr = []; for (let i = 0; i < pos.length / 3; i++) nr.push(0, 1, 0); g.setAttribute('normal', new T.Float32BufferAttribute(nr, 3));
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.4 });
    const uTime = this.uTime;
    mat.onBeforeCompile = sh => { sh.uniforms.uTime = uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat sw = sin(uTime * 2.1 + instanceMatrix[3].x * 0.05 + instanceMatrix[3].z * 0.03) * position.y * 0.16; transformed.x += sw; transformed.z += sw * 0.5;'); };
    mat.customProgramCacheKey = () => 'grass';
    this.fogPatch(mat);
    const mesh = new T.InstancedMesh(g, mat, n), m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), pp = new T.Vector3(), yax = new T.Vector3(0, 1, 0), c = new T.Color();
    const tc = this.terrain.cv.getContext('2d').getImageData(0, 0, this.terrain.cv.width, this.terrain.cv.height), TW = this.terrain.cv.width, tsc = this.terrain.sc;
    let k = 0, tries = 0;
    while (k < n && tries < n * 8) {
      tries++;
      const x = r() * MAP_W, y = r() * MAP_H, mi = (Math.floor(y / MAP_H * this.maskH) * this.maskW + Math.floor(x / MAP_W * this.maskW)) * 4;
      if (this.maskData[mi] < 150 || this.maskData[mi + 3] > 20 || M.water(x, y)) continue;
      const ci = (Math.floor(y * tsc) * TW + Math.floor(x * tsc)) * 4;
      c.setRGB(Math.pow(tc.data[ci] / 255, 2.2) * 1.45, Math.pow(tc.data[ci + 1] / 255, 2.2) * 1.55, Math.pow(tc.data[ci + 2] / 255, 2.2) * 1.2);
      if (high) c.lerp(new T.Color(0.4, 0.34, 0.2), 0.2);
      const s = 0.7 + r() * 0.7; q.setFromAxisAngle(yax, r() * 6.28); sc.set(s, s * (0.8 + r() * 0.5), s); pp.set(x, this.gz(x, y) - 0.5, y); m4.compose(pp, q, sc);
      mesh.setMatrixAt(k, m4); mesh.setColorAt(k, c); k++;
    }
    mesh.count = k; mesh.receiveShadow = true; mesh.frustumCulled = false; this.world.add(mesh);
  }
  // ---- camera: the 2D cam (top-left corner + zoom) drives a perspective rig looking at the view centre ----
  resize() {
    super.resize();
    this.gl.setPixelRatio([1, 1, Math.min(window.devicePixelRatio || 1, 1.5), Math.min(window.devicePixelRatio || 1, 2)][this.q]);
    this.gl.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
  }
  clampCam() {
    const cam = this.cam; cam.z = clamp(cam.z, 0.42, this.maxZ);
    if (!this.w) return;
    const hw = this.w / 2 / cam.z, hh = (this.h - (this.padB || 0)) / 2 / cam.z;
    const tx = clamp(cam.x + hw, Math.min(MAP_W / 2, hw * 0.7), Math.max(MAP_W / 2, MAP_W - hw * 0.7)), ty = clamp(cam.y + hh, Math.min(MAP_H / 2, hh * 0.35), Math.max(MAP_H / 2, MAP_H - hh * 0.8));
    cam.x = tx - hw; cam.y = ty - hh;
  }
  get maxZ() { return 3.2; }
  pitch() { const z = this.cam.z; return (57 - 17 * clamp((z - 1) / 1.2, 0, 1) - 21 * clamp((z - 2.2) / 1.0, 0, 1)) * Math.PI / 180; }
  placeCamera() {
    const cam = this.cam, C = this.camera, z = cam.z, tx = cam.x + this.w / 2 / z, ty = cam.y + (this.h - (this.padB || 0)) / 2 / z;
    const th = this.HG ? this.heightAt(tx, ty) : 0; this.tgtH += (Math.max(th, WL3) - this.tgtH) * 0.15;
    const D = this.h / (2 * z * Math.tan(C.fov * Math.PI / 360)), p = this.pitch();
    let sx = 0, sy = 0; if (this.shake > 0) { sx = (Math.random() - 0.5) * this.shake * 12; sy = (Math.random() - 0.5) * this.shake * 12; this.shake = Math.max(0, this.shake - 0.05); }
    C.position.set(tx + sx, this.tgtH + D * Math.sin(p) + sy, ty + D * Math.cos(p));
    C.lookAt(tx + sx, this.tgtH, ty);
    C.near = Math.max(20, D * 0.2); C.far = D * 4 + 3000;
    C.setViewOffset(this.w, this.h, 0, (this.padB || 0) / 2, this.w, this.h);
    C.updateProjectionMatrix(); C.updateMatrixWorld();
    this.D = D; this.tx = tx; this.ty = ty;
  }
  toScreen(x, y, up) { if (!this.HG) return super.toScreen(x, y); const v = this.v3.set(x, this.heightAt(x, y) + (up || 0), y).project(this.camera); return { x: (v.x + 1) / 2 * this.w, y: (1 - v.y) / 2 * this.h, z: v.z }; }
  proj(x, y, up) { return this.toScreen(x, y, up); }
  pxAt(x, y) { const a = this.toScreen(x, y, 0), b = this.toScreen(x + 10, y, 0); return Math.hypot(b.x - a.x, b.y - a.y) / 10; }
  toWorld(sx, sy) {
    if (!this.HG) return super.toWorld(sx, sy);
    this.v2.set(sx / this.w * 2 - 1, -(sy / this.h * 2 - 1)); this.ray.setFromCamera(this.v2, this.camera);
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (d.y > -0.02) return { x: clamp(o.x + d.x * 5000, 0, MAP_W), y: clamp(o.z + d.z * 5000, 0, MAP_H) };
    let h = this.tgtH, x = 0, y = 0;
    for (let i = 0; i < 5; i++) { const t = (h - o.y) / d.y; x = o.x + d.x * t; y = o.z + d.z * t; h = this.heightAt(x, y); }
    return { x, y };
  }
  zoomAt(sx, sy, z) { const a = this.toWorld(sx, sy); this.cam.z = z; this.clampCam(); this.placeCamera(); for (let k = 0; k < 2; k++) { const b = this.toWorld(sx, sy); this.cam.x += a.x - b.x; this.cam.y += a.y - b.y; this.clampCam(); this.placeCamera(); } }
  panBy(x0, y0, x1, y1) { const a = this.toWorld(x0, y0), b = this.toWorld(x1, y1); this.cam.x += a.x - b.x; this.cam.y += a.y - b.y; this.clampCam(); }
  viewQuad() { const hb = this.h - (this.padB || 0); return [this.toWorld(0, 0), this.toWorld(this.w, 0), this.toWorld(this.w, hb), this.toWorld(0, hb)]; }
  // ---- ground marks (selection, rings, pings): terrain-hugging ribbons rebuilt every frame ----
  makeBlobs() {
    const T = THREE, S = 64, cv = mkCanvas(S, S), c = cv.getContext('2d'), gr = c.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.32)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(0, 0, S, S);
    const tex = new T.CanvasTexture(cv), geo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.blobs = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }), 3000);
    this.blobs.frustumCulled = false; this.blobs.renderOrder = 3; this.blobs.count = 0; this.scene.add(this.blobs); this.blobN = 0;
    { const cv2 = mkCanvas(S, S), c2 = cv2.getContext('2d'), g2 = c2.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g2.addColorStop(0, 'rgba(70,6,4,0.75)'); g2.addColorStop(0.6, 'rgba(60,5,3,0.5)'); g2.addColorStop(1, 'rgba(50,4,2,0)'); c2.fillStyle = g2; c2.fillRect(0, 0, S, S);
      this.pools = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ map: new T.CanvasTexture(cv2), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 1200); this.pools.frustumCulled = false; this.pools.renderOrder = 3; this.pools.count = 0; this.scene.add(this.pools); this.poolN = 0; }
  }
  pool(x, y, h, r) { if (!this.pools || this.poolN >= 1200) return; const m = this._pm2 || (this._pm2 = new THREE.Matrix4()); m.makeScale(r, 1, r * 0.8); m.setPosition(x, h + 0.9, y); this.pools.setMatrixAt(this.poolN++, m); }
  blob(x, y, h, r) { if (!this.blobs || this.blobN >= 3000) return; const m = this._bm || (this._bm = new THREE.Matrix4()); m.makeScale(r, 1, r * 0.9); m.setPosition(x, h + 0.8, y); this.blobs.setMatrixAt(this.blobN++, m); }
  makeGround() {
    const T = THREE, g = new T.BufferGeometry();
    this.gPos = new Float32Array(60000 * 3); this.gCol = new Float32Array(60000 * 4);
    g.setAttribute('position', new T.BufferAttribute(this.gPos, 3).setUsage(T.DynamicDrawUsage)); g.setAttribute('color', new T.BufferAttribute(this.gCol, 4).setUsage(T.DynamicDrawUsage));
    const m = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, side: T.DoubleSide });
    this.gMesh = new T.Mesh(g, m); this.gMesh.frustumCulled = false; this.gMesh.renderOrder = 5; this.scene.add(this.gMesh); this.gN = 0;
  }
  gVert(x, y, h, c, a) { if (this.gN >= 60000) return; const i = this.gN++; this.gPos[i * 3] = x; this.gPos[i * 3 + 1] = h; this.gPos[i * 3 + 2] = y; this.gCol[i * 4] = c[0]; this.gCol[i * 4 + 1] = c[1]; this.gCol[i * 4 + 2] = c[2]; this.gCol[i * 4 + 3] = a; }
  col3(hex) { const k = this._cc || (this._cc = new Map()); let c = k.get(hex); if (!c) { const [r, g, b] = hexRgb(hex); c = [Math.pow(r / 255, 2.2), Math.pow(g / 255, 2.2), Math.pow(b / 255, 2.2)]; k.set(hex, c); } return c; }
  gPath(pts, closed, hex, a, w, flatH) {
    const c = this.col3(hex), n = pts.length, lift = 1.4;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p = pts[i], q = pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1, ox = -dy / l * w / 2, oy = dx / l * w / 2;
      const hp = flatH !== undefined ? flatH : this.heightAt(p[0], p[1]) + lift, hq = flatH !== undefined ? flatH : this.heightAt(q[0], q[1]) + lift;
      this.gVert(p[0] - ox, p[1] - oy, hp, c, a); this.gVert(p[0] + ox, p[1] + oy, hp, c, a); this.gVert(q[0] + ox, q[1] + oy, hq, c, a);
      this.gVert(p[0] - ox, p[1] - oy, hp, c, a); this.gVert(q[0] + ox, q[1] + oy, hq, c, a); this.gVert(q[0] - ox, q[1] - oy, hq, c, a);
    }
  }
  circ(x, y, r, a0, a1) { const n = Math.max(24, Math.min(72, Math.round(r / 2.5))), out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } return out; }
  // public API shared with the 2D renderer (main.js draws its marks through these)
  beginOverlay() {} endOverlay() {}
  gRing(x, y, r, hex, a, w) { this.gq.push(['ring', x, y, r, hex, a === undefined ? 0.9 : a, w || 2.2]); }
  gDisc(x, y, r, hex, a) { this.gq.push(['disc', x, y, r, hex, a === undefined ? 0.15 : a]); }
  gLine(x1, y1, x2, y2, hex, a, w) { this.gq.push(['line', x1, y1, x2, y2, hex, a === undefined ? 0.8 : a, w || 2]); }
  gArc(x, y, r, a0, a1, hex, a, w) { this.gq.push(['arc', x, y, r, a0, a1, hex, a, w]); }
  gFlush(list) {
    for (const g of list) {
      if (g[0] === 'ring') this.gPath(this.circ(g[1], g[2], g[3], 0, Math.PI * 2).slice(0, -1), true, g[4], g[5], g[6] * Math.max(1, 1 / this.cam.z), g[3] < 45 ? this.heightAt(g[1], g[2]) + 1.4 : undefined);
      else if (g[0] === 'arc') this.gPath(this.circ(g[1], g[2], g[3], g[4], g[5]), false, g[6], g[7], g[8] * Math.max(1, 1 / this.cam.z));
      else if (g[0] === 'line') { const L = Math.hypot(g[3] - g[1], g[4] - g[2]), n = Math.max(1, Math.round(L / 30)), pts = []; for (let i = 0; i <= n; i++) pts.push([g[1] + (g[3] - g[1]) * i / n, g[2] + (g[4] - g[2]) * i / n]); this.gPath(pts, false, g[5], g[6], g[7] * Math.max(1, 1 / this.cam.z)); }
      else if (g[0] === 'disc') { const c = this.col3(g[4]), pts = this.circ(g[1], g[2], g[3], 0, Math.PI * 2), h0 = this.heightAt(g[1], g[2]) + 1.2, flat = g[3] < 45, hs = pts.map(q => flat ? h0 : this.heightAt(q[0], q[1]) + 1.2); for (let i = 0; i < pts.length - 1; i++) { this.gVert(g[1], g[2], h0, c, g[5]); this.gVert(pts[i][0], pts[i][1], hs[i], c, g[5] * 0.7); this.gVert(pts[i + 1][0], pts[i + 1][1], hs[i + 1], c, g[5] * 0.7); } }
      else if (g[0] === 'hull') this.gPath(g[1], true, g[2], g[3], g[4] * Math.max(1, 1 / this.cam.z));
    }
  }
  // ---- particles: two point clouds (alpha blended smoke/dust/blood, additive fire/magic) ----
  makeParticles() {
    const T = THREE, N = 4000;
    const mk = add => {
      const g = new T.BufferGeometry(), pos = new Float32Array(N * 3), col = new Float32Array(N * 4), sz = new Float32Array(N);
      g.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage)); g.setAttribute('color', new T.BufferAttribute(col, 4).setUsage(T.DynamicDrawUsage)); g.setAttribute('size', new T.BufferAttribute(sz, 1).setUsage(T.DynamicDrawUsage));
      const m = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: add ? T.AdditiveBlending : T.NormalBlending, uniforms: { uS: { value: 1 } },
        vertexShader: 'attribute vec4 color; attribute float size; varying vec4 vC; uniform float uS; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uS / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard; float a = pow(1.0 - r, 1.6); gl_FragColor = vec4(vC.rgb, vC.a * a); }' });
      const p = new T.Points(g, m); p.frustumCulled = false; p.renderOrder = add ? 7 : 6; this.scene.add(p); return { p, pos, col, sz, g };
    };
    this.pN = mk(false); this.pA = mk(true);
  }
  emit3(p) { if (this.parts3.length < 3800) this.parts3.push(p); }
  // the 2D base class emits particles in "screen-world" space (y already lifted): translate the common kinds
  emit(p) { const gh = this.heightAt(p.x, p.y); this.emit3({ x: p.x, y: p.y, h: gh + 4, vx: p.vx, vy: 0, vh: -p.vy, life: p.life, t: 0, k: p.k, s: p.s, col: p.col }); }
  stepParticles(dt) {
    const A = this.pA, N = this.pN; let na = 0, nn = 0;
    this.parts3 = this.parts3.filter(p => (p.t += dt) < p.life);
    for (const p of this.parts3) {
      p.x += p.vx * dt; p.y += (p.vy || 0) * dt; p.h += p.vh * dt; const a = p.t / p.life;
      let add = false, r = 1, g = 1, b = 1, al = 1, s = p.s;
      switch (p.k) {
        case 'smoke': r = g = b = 0.12; b = 0.11; al = 0.5 * (1 - a) * Math.min(1, p.t * 4); s = p.s * (2 + a * 3.5); p.vh *= 0.99; break;
        case 'dust': r = 0.42; g = 0.35; b = 0.24; al = 0.45 * (1 - a); s = p.s * (2 + a * 2.5); break;
        case 'blood': p.vh -= 260 * dt; r = 0.35; g = 0.02; b = 0.02; al = 0.9 * (1 - a); s = p.s * 2; if (p.h < this.heightAt(p.x, p.y)) p.life = 0; break;
        case 'splash': r = g = b = 0.85; al = 0.5 * (1 - a); s = p.s * (1 + a * 2); break;
        case 'snowp': r = g = b = 1; al = 0.8; break;
        default: add = true; {
          if (p.k === 'magic' && p.col) { const c = p.col.split(',').map(v => +v / 255); r = c[0]; g = c[1]; b = c[2]; }
          else if (a < 0.3) { r = 1; g = 0.85; b = 0.55; } else if (a < 0.6) { r = 1; g = 0.5; b = 0.18; } else { r = 0.7; g = 0.18; b = 0.05; }
          al = 0.9 * (1 - a); s = p.s * (p.k === 'fire' ? 3.2 : 2) * (1 - a * 0.4);
        }
      }
      const T2 = add ? A : N, i = add ? na++ : nn++; if (i >= 4000) continue;
      T2.pos[i * 3] = p.x; T2.pos[i * 3 + 1] = p.h; T2.pos[i * 3 + 2] = p.y; T2.col[i * 4] = r; T2.col[i * 4 + 1] = g; T2.col[i * 4 + 2] = b; T2.col[i * 4 + 3] = al; T2.sz[i] = s;
    }
    for (const [T2, n] of [[A, na], [N, nn]]) { T2.g.setDrawRange(0, n); for (const k of ['position', 'color', 'size']) T2.g.attributes[k].needsUpdate = true; T2.p.material.uniforms.uS.value = this.h * this.gl.getPixelRatio() / (2 * Math.tan(this.camera.fov * Math.PI / 360)); }
  }
  // ---- dynamic lights (explosions, magic, torches at night) ----
  addLight(x, y, r, a, warm) { if (this.lights.length < 600) this.lights.push(x, y, r, a, warm ? 1 : 0); }
  applyLights(env) {
    const Ls = this.lights, cand = [];
    for (let i = 0; i < Ls.length; i += 5) { const d = Math.hypot(Ls[i] - this.tx, Ls[i + 1] - this.ty); const w = Ls[i + 3] * Ls[i + 2] / (200 + d); cand.push([w, i]); }
    cand.sort((a, b) => b[0] - a[0]);
    const night = clamp((1 - env.light) * 2, 0, 1);
    this.lightPool.forEach((L, k) => {
      const c = cand[k]; if (!c) { L.intensity = 0; return; }
      const i = c[1], x = Ls[i], y = Ls[i + 1], r = Ls[i + 2], a = Ls[i + 3], warm = Ls[i + 4];
      L.position.set(x, this.heightAt(x, y) + 26, y); L.distance = r * 2.6; L.color.setHex(warm ? 0xff9a4a : 0x9fc8ff);
      L.intensity = a * r * r * 0.35 * (0.05 + night * night);
    });
  }
  // ---- units, corpses and buildings ----
  geoFor(d, col, frame, up) {
    const key = unit3Key(d, col, frame, 0, up);
    let g = this.geos.get(key); if (g) return g;
    if (!this.geoBusy.has(key)) { this.geoBusy.add(key); this.geoQ.push({ key, d, col, frame, up }); }
    return null;
  }
  pumpGeos(ms) { const t0 = performance.now(); while (this.geoQ.length && performance.now() - t0 < ms) { const j = this.geoQ.shift(); this.geoBusy.delete(j.key); if (j.bld) { this.bldGeo(j.d, j.col); continue; } if (!this.geos.has(j.key)) this.geos.set(j.key, (A3.has(j.d.key) && A3.unitGeo(j.d, j.col, j.frame)) || G3.build(M3.build(j.d, j.col, j.frame, j.up | 0), { metres: true })); } return this.geoQ.length; }
  // downloaded glTF models arrived: drop the procedural stand-ins so they rebuild from the models
  refreshAssets() {
    const keys = [...Object.keys(ASSET_UNITS), ...Object.keys(ASSET_BLDS)], hit = k => keys.some(a => k.startsWith(a) || k.startsWith('b' + a));
    for (const k of [...this.geos.keys()]) if (hit(k)) this.geos.delete(k);
    for (const [k, u] of this.units) if (hit(k)) { this.scene.remove(u.mesh); u.mesh.dispose(); this.units.delete(k); }
    for (const [id, bm] of this.bldMesh) if (ASSET_BLDS[bm.e.d.key]) { this.scene.remove(bm.mesh); this.bldMesh.delete(id); }
  }
  prewarm(units, blds) { for (const [d, col] of blds || []) if (d) this.geoQ.push({ key: 'b' + d.key + col, bld: 1, d, col }); for (const [d, col] of units) if (d) for (const f of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) this.geoFor(d, col, f, 0); }
  inst(key, geo, mats) {
    let u = this.units.get(key);
    if (!u || u.cap < u.n + 1) {
      const cap = u ? u.cap * 2 : 32, mesh = new THREE.InstancedMesh(geo, mats || this.m3.unit, cap);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (u) { mesh.instanceMatrix.array.set(u.mesh.instanceMatrix.array.subarray(0, u.n * 16)); this.scene.remove(u.mesh); u.mesh.dispose(); }
      this.scene.add(mesh); u = { mesh, cap, n: u ? u.n : 0 }; this.units.set(key, u);
    }
    return u;
  }
  put(key, geo, x, h, y, yaw, s, tilt, mats) {
    const u = this.inst(key, geo, mats), m = this._m || (this._m = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), e = this._e || (this._e = new THREE.Euler(0, 0, 0, 'YXZ'));
    e.set(tilt ? tilt[0] : 0, yaw, tilt ? tilt[1] : 0); q.setFromEuler(e);
    m.compose(this.v3.set(x, h, y), q, (this._s || (this._s = new THREE.Vector3())).set(s, s, s));
    m.toArray(u.mesh.instanceMatrix.array, u.n * 16); u.n++;
  }
  bldGeo(d, col) {
    const key = d.key + col; let g = this.geos.get('b' + key); if (g) return g;
    if (A3.has(d.key)) { g = A3.bldGeo(d, col); if (g) { this.geos.set('b' + key, g); return g; } }
    const P = B3.build(d, col); const { MAT, box } = R3;
    if (d.wall) P.push(box(0, -14, 0, d.gate ? 29 : 21, 14.5, d.gate ? 9 : 7, MAT('#5c564c', { pat: 'rock' })));
    else P.push(box(0, -14, 0, d.r * 0.98, 14.5, d.r * 0.78, MAT('#5c564c', { pat: 'rock' })));
    g = G3.build(P, { seg: 1 }); this.geos.set('b' + key, g); return g;
  }
  flagTex(race, col) {
    const key = 'fl' + race + col; let t = this.geos.get(key); if (t) return t;
    const cv = mkCanvas(64, 64), c = cv.getContext('2d'); c.scale(4, 4);
    const f = 1, fx = 0, top = 0;
    c.beginPath();
    if (race === 'elf') { c.moveTo(fx, top + 1); c.quadraticCurveTo(fx + f * 9, top + 2, fx + f * 16, top + 6); c.quadraticCurveTo(fx + f * 9, top + 8, fx, top + 12); }
    else if (race === 'orc') { c.moveTo(fx, top + 1); c.lineTo(fx + 13, top + 2); c.lineTo(fx + 12, top + 8); c.lineTo(fx + 14, top + 15); c.lineTo(fx + 9, top + 12); c.lineTo(fx + 5, top + 16); c.lineTo(fx, top + 13); }
    else if (race === 'und') { c.moveTo(fx, top + 1); c.lineTo(fx + 14, top + 1); c.lineTo(fx + 14, top + 13); c.lineTo(fx + 11, top + 16); c.lineTo(fx + 8, top + 12); c.lineTo(fx + 5, top + 16); c.lineTo(fx + 2, top + 12); c.lineTo(fx, top + 15); }
    else { c.moveTo(fx, top + 1); c.lineTo(fx + 14, top + 1); c.lineTo(fx + 14, top + (race === 'dwf' ? 14 : 16)); if (race === 'hum' || race === 'des') c.lineTo(fx + 7, top + 12.5); c.lineTo(fx, top + (race === 'dwf' ? 14 : 16)); }
    c.closePath(); c.fillStyle = race === 'orc' ? '#4a3527' : race === 'und' ? '#1d1c22' : col; c.fill();
    if (race === 'orc' || race === 'und') { c.save(); c.clip(); c.fillStyle = col; c.fillRect(0, 3, 16, 4); c.restore(); }
    c.lineWidth = 0.8; c.strokeStyle = race === 'hum' || race === 'dwf' || race === 'des' ? '#d8b85a' : race === 'und' ? '#6fbf94' : 'rgba(0,0,0,0.4)'; c.stroke();
    const ex = 7, ey = 7;
    c.fillStyle = c.strokeStyle = race === 'und' ? '#9fe8c0' : '#f1ece0'; c.lineWidth = 1.3;
    if (race === 'hum') { c.beginPath(); c.moveTo(ex, ey - 4); c.lineTo(ex, ey + 4); c.moveTo(ex - 3, ey - 1); c.lineTo(ex + 3, ey - 1); c.stroke(); }
    else if (race === 'des') { c.beginPath(); c.arc(ex, ey - 1, 2.6, 0, 7); c.fillStyle = '#f0c850'; c.fill(); }
    else if (race === 'und') { c.beginPath(); c.arc(ex, ey - 1, 2.4, 0, 7); c.fill(); c.fillStyle = '#1d1c22'; c.fillRect(ex - 1.6, ey - 1.6, 1.2, 1.2); c.fillRect(ex + 0.4, ey - 1.6, 1.2, 1.2); }
    else if (race === 'dwf') { c.fillStyle = '#e0c068'; c.fillRect(ex - 3, ey - 3, 6, 3); c.fillRect(ex - 0.5, ey, 1, 4); }
    else if (race === 'elf') { c.fillStyle = '#f0dc8a'; c.beginPath(); c.ellipse(ex - 1, ey - 1, 2, 1.3, 0, 0, 7); c.fill(); }
    t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; this.geos.set(key, t); return t;
  }
  flagMats(race, col) {
    const key = 'fm' + race + col; let m = this.geos.get(key); if (m) return m;
    m = new THREE.MeshStandardMaterial({ map: this.flagTex(race, col), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
    const uTime = this.uTime;
    m.onBeforeCompile = sh => { sh.uniforms.uTime = uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.z += sin(uTime * 4.0 + position.x * 0.35 + instanceMatrix[3].x * 0.1) * position.x * 0.12;'); };
    m.customProgramCacheKey = () => 'flag';
    this.fogPatch(m);
    this.geos.set(key, m); return m;
  }
  // ---- main draw ----
  draw(S) {
    const T = THREE, now = S.time, c = this.c, dpr = this.dpr;
    const rdt = clamp(now - this.lastT, 0, 0.1); this.lastT = now; this.frameN++;
    const env = this.env = envAt(this.map, this.seed, S.gameT !== undefined ? S.gameT : now);
    this.uTime.value = now; this.lights = [];
    if (this.pbrU.uPBR.value !== this.pbrTarget) this.pbrU.uPBR.value = clamp(this.pbrU.uPBR.value + (this.pbrTarget ? 1 : -1) * rdt * 1.2, 0, 1);
    this.pumpGeos(this.frameN < 60 ? 24 : 8);
    this.placeCamera();
    // sun, sky light, fog and exposure follow the time of day and the weather
    const wa = env.weather === 'clear' || env.weather === 'snow' ? 0 : env.wAmt, L = env.light, tint = env.tint;
    const sunCol = new T.Color(1, 0.95, 0.86); if (tint) sunCol.lerp(new T.Color(tint[0] / 255, tint[1] / 255 * 0.85, tint[2] / 255 * 0.7), tint[3] * 1.4);
    if (L < 0.75) sunCol.lerp(new T.Color(0.55, 0.65, 1), (0.75 - L) * 2.4);
    this.sun.color.copy(sunCol); this.sun.intensity = (0.35 + 1.9 * (L - 0.5) * 2) * (1 - 0.6 * wa) + 0.3;
    this.hemi.intensity = (0.22 + 0.33 * L) * (1 - 0.25 * wa) + this.flash * 3; this.hemi.color.setRGB(0.75 + 0.1 * L, 0.82 + 0.05 * L, 1);
    const sd = this.v3.set(-0.5, 0.78, -0.38).normalize();
    this.sun.position.set(this.tx + sd.x * 2600, this.tgtH + sd.y * 2600, this.ty + sd.z * 2600); this.sun.target.position.set(this.tx, this.tgtH, this.ty); this.sun.target.updateMatrixWorld();
    const ext = clamp(Math.max(this.w, this.h) / this.cam.z * 0.85, 500, 2800), sc = this.sun.shadow.camera;
    if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 100; sc.far = 6000; sc.updateProjectionMatrix(); }
    const fogC = this.skyHor.clone().multiplyScalar(0.55 + 0.45 * L); if (env.weather === 'fog') fogC.lerp(new T.Color(0.78, 0.8, 0.82), wa); if (env.weather === 'rain') fogC.multiplyScalar(1 - 0.35 * wa);
    this.scene.fog.color.copy(fogC); this.scene.background = fogC;
    if (this.skyDome) {
      const su = this.skyDome.material.uniforms, zen = this.map.biome === 'snow' ? new T.Color(0.3, 0.4, 0.58) : new T.Color(0.2, 0.38, 0.72);
      zen.multiplyScalar(0.25 + 0.75 * L); if (env.weather === 'rain' || env.weather === 'fog') zen.lerp(fogC, wa * 0.8);
      su.uZen.value.copy(zen); su.uHor.value.copy(fogC); su.uSunCol.value.copy(sunCol).multiplyScalar(L > 0.6 ? 1 : 0.25); su.uCov.value = env.weather === 'clear' ? 0.35 : 0.85;
      this.skyDome.position.copy(this.camera.position); this.skyDome.scale.setScalar(this.camera.far * 0.9);
    }
    if (this.mist) { const mistA = Math.min(0.3, 0.04 + 0.14 * clamp((1 - L) * 2, 0, 1) + (env.weather === 'fog' ? 0.14 * wa : 0) + (env.p > 0.94 || env.p < 0.1 ? 0.08 : 0)); for (const m of this.mist) { m.position.x += m.userData.v * rdt; if (m.position.x > MAP_W + 300) m.position.x = -300; m.material.opacity = mistA * m.userData.a * this.fogAt(m.position.x, m.position.z); } }
    // weather fog thickens the distance only: the ground under the camera (and your base) stays readable
    const fogK = env.weather === 'fog' ? 1 - 0.4 * wa : env.weather === 'rain' ? 1 - 0.2 * wa : 1;
    this.scene.fog.near = this.D * (0.75 + 0.2 * fogK); this.scene.fog.far = Math.max(this.D * 2.2, (this.D * 2.8 + 1200) * fogK);
    this.gl.toneMappingExposure = (0.55 + 0.35 * L) * (1 - 0.15 * wa) + this.flash * 0.6;
    this.uCloud.value = (this.map.biome === 'snow' ? 0.12 : 0.26) * L * (env.weather === 'clear' ? 1 : 0.5);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - rdt * 4);
    // trample paths worn by the armies
    this.trampleT -= rdt;
    if (this.trampleT <= 0) { this.trampleT = 0.5; const tc = this.trample.getContext('2d'); tc.fillStyle = 'rgba(58,44,28,0.06)'; for (const e of S.ents) if (e.moving && e.d.kind === 'u') tc.fillRect(e.rx / 8 - 0.5, e.ry / 8 - 0.5, e.d.sub === 'cav' || e.d.sub === 'troll' ? 2 : 1, 1); this.trampleT3.needsUpdate = true; }
    // visibility of forest chunks
    const fr = this._fr || (this._fr = new T.Frustum()); fr.setFromProjectionMatrix((this._pm || (this._pm = new T.Matrix4())).multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    for (const ch of this.treeChunks) ch.mesh.visible = fr.intersectsBox(ch.box);
    // screen-space cull for entities
    const W = this.w, H = this.h, onScr = (x, y, m) => { const s = this.toScreen(x, y, 10); return s.z < 1 && s.x > -m && s.y > -m * 1.6 && s.x < W + m && s.y < H + m; };
    for (const u of this.units.values()) u.n = 0;
    this.blobN = 0; this.poolN = 0;
    // battalions
    const SQ = new Map();
    for (const e of S.ents) {
      if (!e.sq || e.d.kind !== 'u') continue;
      let q = SQ.get(e.sq); if (!q) { q = { mem: [], b: e, hp: 0, mx: 0, d: e.d, owner: e.owner, sel: false, rank: e.rank || 0 }; SQ.set(e.sq, q); }
      q.mem.push(e); q.hp += e.hp; q.mx += e.maxhp; if ((e.slot !== undefined ? e.slot - q.b.slot : e.id - q.b.id) < 0) q.b = e; if (S.sel.has(e.id)) q.sel = true;
    }
    this.SQ = SQ;
    const campAlive = this.map.camps.map(() => false);
    for (const e of S.ents) if (e.owner === NEUTRAL) this.map.camps.forEach((cp, i) => { if (!campAlive[i] && Math.abs(e.rx - cp[0]) < 320 && Math.abs(e.ry - cp[1]) < 320) campAlive[i] = true; });
    this.campAlive = campAlive; this.chests.forEach((m, i) => { m.visible = campAlive[i]; });
    const G = [];
    // selection hulls around battalions
    for (const q of SQ.values()) if (q.sel) { const col = S.me === q.owner ? '#8fd3ff' : '#ff6a5a', pts = q.mem.map(m => [m.rx, m.ry]); let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length; let h = convexHull(pts); if (h.length < 3) G.push(['ring', cx, cy, q.d.r * 2 + 8, col, 0.9, 2.2]); else { const pad = q.d.r + 8; h = h.map(p => { const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy) || 1; return [p[0] + dx / d * pad, p[1] + dy / d * pad]; }); const sm = []; for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; sm.push(a, [(a[0] * 3 + b[0]) / 4, (a[1] * 3 + b[1]) / 4], [(a[0] + b[0] * 3) / 4, (a[1] + b[1] * 3) / 4]); } G.push(['hull', sm, col, 0.9, 2.4]); } }
    const flagsByKey = new Map();
    for (const e of S.ents) {
      if (!onScr(e.rx, e.ry, e.d.kind === 'b' ? 260 : 80)) { if (e.d.kind === 'b') { const bm = this.bldMesh.get(e.id); if (bm) bm.mesh.visible = false; } continue; }
      const col = TEAM_COLORS[e.owner] || '#888', sel = S.sel.has(e.id), gh = this.heightAt(e.rx, e.ry);
      if (e.d.kind === 'b') {
        let bm = this.bldMesh.get(e.id);
        if (!bm) { const mesh = new T.Mesh(this.bldGeo(e.d, col), this.m3.unit); mesh.castShadow = true; mesh.receiveShadow = true; mesh.rotation.y = -0.35; this.scene.add(mesh); bm = { mesh, e }; this.bldMesh.set(e.id, bm); }
        bm.seen = this.frameN; bm.mesh.visible = true;
        const bh = this.gz(e.rx, e.ry); bm.mesh.position.set(e.rx, bh, e.ry); if (e.d.wall) bm.mesh.rotation.y = -(e.ang || 0); bm.mesh.scale.set(1, e.built < 1 ? 0.06 + 0.94 * e.built : 1, 1);
        if (e.built < 1) { if (Math.random() < 0.2) this.emit3({ x: e.rx + (Math.random() - 0.5) * e.r, y: e.ry + (Math.random() - 0.5) * e.r * 0.6, h: bh + 4, vx: (Math.random() - 0.5) * 10, vy: 0, vh: 10, life: 1, t: 0, k: 'dust', s: 5 }); G.push(['ring', e.rx, e.ry, e.r * 1.05, '#c9a66a', 0.5, 1.6]); }
        else { this.addLight(e.rx, e.ry, e.r * (e.d.sub === 'fort' ? 3.2 : 2.2), 0.85 * clamp((1 - env.light) * 2, 0, 1), true); if (e.d.forge && Math.random() < 0.35) this.emit3({ x: e.rx + 10, y: e.ry - 10, h: bh + e.r * 2.2, vx: 4, vy: 0, vh: 24, life: 2.6, t: 0, k: 'smoke', s: 4.5 }); }
        if (e.hp < e.maxhp * 0.6 && e.built >= 1) { const sev = 1 - e.hp / e.maxhp; if (Math.random() < 0.7 * sev) this.emit3({ x: e.rx + (Math.random() - 0.5) * e.r, y: e.ry + (Math.random() - 0.5) * e.r * 0.6, h: bh + e.r * (0.8 + Math.random()), vx: 4 + Math.random() * 6, vy: 0, vh: 22 + Math.random() * 10, life: 2.6, t: 0, k: 'smoke', s: 6 + e.r * 0.12 }); if (e.hp < e.maxhp * 0.35 && Math.random() < 0.6) { this.emit3({ x: e.rx + (Math.random() - 0.5) * e.r, y: e.ry + (Math.random() - 0.5) * e.r * 0.5, h: bh + e.r * (0.5 + Math.random() * 0.8), vx: 0, vy: 0, vh: 30, life: 0.7, t: 0, k: 'fire', s: 5 + Math.random() * 4 }); this.addLight(e.rx, e.ry, e.r * 2.5, 0.9, true); } }
        if (sel) { G.push(['ring', e.rx, e.ry, e.r * 1.15, S.me === e.owner ? '#8fd3ff' : '#ff5a4a', 0.95, 2.4]); if (e.rally && e.owner === S.me) { G.push(['line', e.rx, e.ry, e.rally.x, e.rally.y, '#f3d774', 0.6, 1.6], ['ring', e.rally.x, e.rally.y, 10, TEAM_COLORS[e.owner], 0.9, 2.5]); } }
        continue;
      }
      // unit: pose frame as in the 2D renderer
      let frame = 0;
      if (e.atkT > 0) frame = e.atkT > 0.2 ? 8 : e.atkT > 0.1 ? 9 : 0;
      else if (e.moving) { const st = ((now * (e.d.sub === 'cav' || e.d.sub === 'wolf' ? 18 : 15) + e.id * 0.37) | 0) % 12; frame = st & 1 ? 11 + (st >> 1) : 1 + (st >> 1); }
      else if (e.tgt && e.cd > 0 && e.cd < 0.28) frame = 7;
      const up3 = e.eqv | 0, uk = upLook(e.d, up3);
      let geo = this.geoFor(e.d, col, frame, uk), fk = frame;
      if (!geo) { geo = this.geoFor(e.d, col, 0, uk); fk = 0; }
      if (!geo) continue;
      // facing: smooth turn toward the heading
      let hd = e.hd;
      if (hd === undefined) { if (e._px !== undefined) { const dx = e.rx - e._px, dy = e.ry - e._py; if (dx * dx + dy * dy > 0.04) e._hd = Math.atan2(dy, dx); } e._px = e.rx; e._py = e.ry; hd = e._hd !== undefined ? e._hd : e.face < 0 ? Math.PI : 0; }
      e._yaw = e._yaw === undefined ? hd : turnAng(e._yaw, hd, rdt * 9);
      if (e.lhp !== undefined && e.hp < e.lhp - 0.5) { e.hitT = now; if (Math.random() < 0.5 && e.d.sub !== 'treant') for (let k = 0; k < 2; k++) this.emit3({ x: e.rx, y: e.ry, h: gh + 18, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, vh: 30 + Math.random() * 30, life: 0.5, t: 0, k: 'blood', s: 1.4 }); }
      e.lhp = e.hp;
      const bob = e.moving ? Math.abs(Math.sin(now * 10 + e.id)) * 0.8 : 0;
      const tilt = e.stunned ? [Math.sin(now * 10) * 0.08, Math.cos(now * 9) * 0.08] : e.hitT && now - e.hitT < 0.12 ? [0.08, 0] : null;
      this.put(unit3Key(e.d, col, fk, 0, uk), geo, e.rx, gh + bob, e.ry, -e._yaw, PPM * (e.leader ? 1.2 : 1), tilt);
      this.blob(e.rx, e.ry, gh, e.r * (e.d.cls === 'cav' || e.d.cls === 'siege' ? 3.4 : 2.4));
      if (e.leader) G.push(['ring', e.rx, e.ry, e.r * 1.35, '#ffd46a', 0.75, 1.6]);
      if (this.map.water(e.rx, e.ry) === 1) { const ph = (now * 1.8 + e.id * 0.37) % 1; if (e.id % 3 === 0) G.push(['ring', e.rx, e.ry, e.r * (1.1 + ph * 0.9), '#e1f0f0', 0.5 * (1 - ph), 1.2]); if (e.moving && Math.random() < 0.06) this.emit3({ x: e.rx, y: e.ry, h: WL3 + 1, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, vh: 20, life: 0.4, t: 0, k: 'splash', s: 2 }); }
      if (e.d.worker && e.atkT > 0.22 && Math.random() < 0.5) for (let k = 0; k < 3; k++) this.emit3({ x: e.rx + Math.cos(e._yaw) * 10, y: e.ry + Math.sin(e._yaw) * 10, h: gh + 10, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, vh: 30 + Math.random() * 40, life: 0.35, t: 0, k: 'spark', s: 1.2 });
      if (e.moving && (e.d.sub === 'cav' || e.d.sub === 'troll') && Math.random() < 0.2) this.emit3({ x: e.rx, y: e.ry, h: gh + 3, vx: 0, vy: 0, vh: 6, life: 0.9, t: 0, k: 'dust', s: 4 });
      if (e.stunned) for (let k = 0; k < 3; k++) { const a = now * 5 + k * 2.1; if (Math.random() < 0.3) this.emit3({ x: e.rx + Math.cos(a) * 8, y: e.ry + Math.sin(a) * 8, h: gh + 44, vx: 0, vy: 0, vh: 0, life: 0.2, t: 0, k: 'magic', col: '255,232,106', s: 1.6 }); }
      if (e.buffGlow) G.push(['disc', e.rx, e.ry, e.r * 1.3, '#ffc85a', 0.14]);
      if ((up3 & 1) && (e.moving || e.atkT > 0) && Math.random() < (e.atkT > 0 ? 0.25 : 0.03)) { const bc = { elf: '190,225,255', orc: '255,90,60', und: '120,255,160', des: '255,210,110', dwf: '150,200,255' }[e.d.race] || '255,230,170'; this.emit3({ x: e.rx + Math.cos(e._yaw) * 9, y: e.ry + Math.sin(e._yaw) * 9, h: gh + 20 + Math.random() * 10, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, vh: 10 + Math.random() * 20, life: 0.35, t: 0, k: 'magic', col: bc, s: 1.6 }); }
      if (e.d.hero && HERO_FX[e.d.key]) this.heroAura(e, gh, now, G);
      if (e.d.hero) this.addLight(e.rx, e.ry, 90, 0.55 * clamp((1 - env.light) * 2, 0.15, 1), false);
      if (!e.sq) { if (sel) G.push(['ring', e.rx, e.ry, e.r * 1.5, S.me === e.owner ? '#8fd3ff' : '#ff5a4a', 0.95, 2]); else if (e.d.hero) G.push(['ring', e.rx, e.ry, e.r * 1.35, col, 0.75, 1.6]); }
      // battalion standard
      const q = e.sq ? SQ.get(e.sq) : null;
      if (q && q.b === e && e.d.n > 1) {
        const race = RACES[e.d.race] ? e.d.race : 'hum', fk2 = race + col; let L2 = flagsByKey.get(fk2); if (!L2) { L2 = []; flagsByKey.set(fk2, L2); }
        const ph = e.d.sub === 'cav' ? 64 : 50, big = (up3 | 0) & 8 ? 1.25 : 1, bx = e.rx - Math.cos(e._yaw) * 4, by = e.ry - Math.sin(e._yaw) * 4;
        L2.push([bx, gh + ph, by, big, race, col]);
        this.put('pole', this.poleGeo(), bx, gh, by, 0, 1, null, this.m3.unit);
        if (env.night > 0.15) { this.emit3({ x: bx + 6, y: by, h: gh + 36, vx: 0, vy: 0, vh: 14, life: 0.25, t: 0, k: 'fire', s: 2.5 }); this.addLight(bx + 6, by, 110, 0.85, true); }
      }
    }
    // flags: one instanced batch per race and colour
    for (const [k, list] of flagsByKey) { const race = list[0][4], col = list[0][5]; for (const f of list) this.put('flag' + k, this.flagGeo(), f[0], f[1] - 16 * f[3], f[2], 0, f[3], null, this.flagMats(race, col)); }
    // corpses: the fallen lie where they died, then sink away
    if (this.corpses.length && this.frameN % 60 === 0) this.corpses = this.corpses.filter(k => now - k.t < 50);
    for (const k of this.corpses) {
      const age = now - k.t; if (age > 50 || age < 0 || !onScr(k.x, k.y, 60)) continue;
      const col = TEAM_COLORS[k.owner] || '#888', uk = upLook(k.d, k.up), g0 = this.heightAt(k.x, k.y);
      const fall = clamp(age / 0.45, 0, 1), sink = age > 38 ? (age - 38) / 12 * 14 : 0;
      if (fall < 1) { const g = this.geoFor(k.d, col, 0, uk); if (g) this.put(unit3Key(k.d, col, 0, 0, uk), g, k.x, g0 - sink, k.y, -k.yaw, PPM, [0, -fall * fall * 1.5]); }
      else { const g = this.geoFor(k.d, col, 10, uk) || this.geoFor(k.d, col, 0, uk); if (g) this.put(unit3Key(k.d, col, this.geos.has(unit3Key(k.d, col, 10, 0, uk)) ? 10 : 0, 0, uk), g, k.x, g0 - sink, k.y, -k.yaw, PPM, this.geos.has(unit3Key(k.d, col, 10, 0, uk)) ? null : [0, -1.5]); }
      if (k.blood && age < 40) this.pool(k.x - Math.cos(k.yaw) * 10, k.y - Math.sin(k.yaw) * 10, g0, Math.min(1, age / 2.5) * (k.d.r + 3) * 2.2);
    }
    // buildings that are gone
    if (this.bldMesh.size) { const live = new Set(); for (const e of S.ents) if (e.d.kind === 'b' && !e.dead) live.add(e); for (const [id, bm] of this.bldMesh) if (!live.has(bm.e)) { this.scene.remove(bm.mesh); this.bldMesh.delete(id); } }
    // outposts
    if (S.outposts) S.outposts.forEach((op, i) => {
      const oc = op.owner >= 0 ? TEAM_COLORS[op.owner] : '#d8d0bc'; const fl = this.opFlags[i]; if (fl) { fl.material.color.set(oc); fl.rotation.y = Math.sin(now * 1.5 + i) * 0.25; }
      G.push(['ring', op.x, op.y, 130, oc, op.owner >= 0 ? 0.55 : 0.3, 1.8]);
      if ((op.prog > 0 && op.prog < 1) || (op.owner >= 0 && op.prog < 1)) G.push(['arc', op.x, op.y, 52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * op.prog, op.cap >= 0 && op.owner < 0 ? TEAM_COLORS[op.cap] : oc, 0.95, 4]);
      this.addLight(op.x, op.y, 90, 0.5 * clamp((1 - env.light) * 2, 0, 1), true);
    });
    // ancient relic: golden standing stone with a pillar of light
    if (S.relic) {
      const R = S.relic, h0 = this.gz(R.x, R.y), pc = R.cap >= 0 ? TEAM_COLORS[R.cap] : '#ffd46a';
      let g = this.geos.get('relic'); if (!g) { const { MAT, box, frus, sph } = R3, gold = MAT('#d9b44a', { pat: 'metal', spec: 1 }), st = MAT('#8f887c', { pat: 'stone' }); g = G3.build([frus(0, -4, 0, 30, 26, 6, st), box(0, 26, 0, 7, 26, 5, gold), frus(0, 52, 0, 7, 0, 12, gold), sph(0, 40, 5.5, 3.5, MAT('#fff2b0', { emit: 1.5 }))], { seg: 1 }); this.geos.set('relic', g); }
      this.put('relic', g, R.x, h0, R.y, Math.sin(now * 0.4) * 0.3, 1, null);
      G.push(['ring', R.x, R.y, 110, '#ffd46a', 0.55, 2], ['disc', R.x, R.y, 110, '#ffd46a', 0.05]);
      if (R.prog > 0) G.push(['arc', R.x, R.y, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * R.prog, pc, 0.95, 4]);
      if (Math.random() < 0.7) this.emit3({ x: R.x + (Math.random() - 0.5) * 14, y: R.y + (Math.random() - 0.5) * 14, h: h0 + 20, vx: 0, vy: 0, vh: 80, life: 1.4, t: 0, k: 'magic', col: '255,215,120', s: 3 });
      this.addLight(R.x, R.y, 160, 1.2, true);
    }
    // camp fires
    this.map.camps.forEach(cp => { const fx = cp[0], fy = cp[1], h0 = this.heightAt(fx, fy); if (Math.random() < 0.6) this.emit3({ x: fx + (Math.random() - 0.5) * 6, y: fy + (Math.random() - 0.5) * 6, h: h0 + 4, vx: 0, vy: 0, vh: 26, life: 0.6, t: 0, k: 'fire', s: 4 + Math.random() * 3 }); if (Math.random() < 0.2) this.emit3({ x: fx, y: fy, h: h0 + 14, vx: (Math.random() - 0.5) * 6, vy: 0, vh: 24, life: 2, t: 0, k: 'smoke', s: 4 }); this.addLight(fx, fy, 150, 0.9, true); });
    // placement ghost
    if (this.ghostMesh) this.ghostMesh.visible = false;
    if (S.ghost) {
      const g = S.ghost, geo = this.bldGeo(g.d, TEAM_COLORS[S.me] || '#888');
      if (!this.ghostMesh) { this.ghostMesh = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.5, depthWrite: false })); this.scene.add(this.ghostMesh); }
      this.ghostMesh.geometry = geo; this.ghostMesh.visible = true; this.ghostMesh.position.set(g.x, this.gz(g.x, g.y), g.y); this.ghostMesh.rotation.y = -0.35;
      this.ghostMesh.material.emissive.set(g.ok ? 0x103a14 : 0x5a1010);
      G.push(['disc', g.x, g.y, g.d.r * 1.15, g.ok ? '#5adc6e' : '#e63c32', 0.25], ['ring', g.x, g.y, g.d.r * 1.15, g.ok ? '#6fe08a' : '#ff5a4a', 0.9, 2]);
    }
    this.fx3(S.fx, now, G);
    this.stepLife(rdt, now, S, env);
    // rain and snow
    this.weather3(env, rdt, now);
    this.stepParticles(rdt);
    this.applyLights(env);
    for (const u of this.units.values()) { u.mesh.count = u.n; u.mesh.instanceMatrix.needsUpdate = true; u.mesh.visible = u.n > 0; }
    if (this.blobs) { this.blobs.count = this.blobN; this.blobs.instanceMatrix.needsUpdate = true; this.pools.count = this.poolN; this.pools.instanceMatrix.needsUpdate = true; }
    // ground marks: this frame's + those queued by main.js
    this.gN = 0; this.gFlush(G); this.gFlush(this.gq); this.gq = [];
    const gg = this.gMesh.geometry; gg.setDrawRange(0, this.gN); gg.attributes.position.needsUpdate = true; gg.attributes.color.needsUpdate = true;
    if (this.postOn && this.w > 8 && this.h > 8) { try { this.renderPost(env); this.postErr = 0; } catch (err) { this.gl.setRenderTarget(null); this.gl.render(this.scene, this.camera); if (++this.postErr > 3) { this.postOn = false; console.warn('post-processing disabled', err); } } } else this.gl.render(this.scene, this.camera);
    // 2D overlay: bars and names
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawBars(S, SQ);
    if (this.flash > 0) { c.fillStyle = 'rgba(230,236,255,' + (this.flash * 0.25).toFixed(3) + ')'; c.fillRect(0, 0, this.w, this.h); }
    if (!this.vign) { const g = c.createRadialGradient(this.w / 2, this.h * 0.45, Math.min(this.w, this.h) * 0.4, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.8); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,10,6,0.4)'); this.vign = [g]; }
    c.fillStyle = this.vign[0]; c.fillRect(0, 0, this.w, this.h);
  }
  initPost() {
    const T = THREE, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const M = (fs, u) => new T.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: u, depthTest: false, depthWrite: false });
    const P = this.post = { scene: new T.Scene(), cam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad: new T.Mesh(g), w: 0, h: 0 };
    P.quad.frustumCulled = false; P.scene.add(P.quad);
    P.bright = M('uniform sampler2D t; uniform float thr; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(thr, thr + 0.9, l), 1.0); }', { t: { value: null }, thr: { value: 1.0 } });
    P.copy = M('uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.0); }', { t: { value: null } });
    P.blur = M('uniform sampler2D t; uniform vec2 d; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227; c += (texture2D(t, vUv + d * 1.385).rgb + texture2D(t, vUv - d * 1.385).rgb) * 0.316; c += (texture2D(t, vUv + d * 3.231).rgb + texture2D(t, vUv - d * 3.231).rgb) * 0.070; gl_FragColor = vec4(c, 1.0); }', { t: { value: null }, d: { value: new T.Vector2() } });
    P.final = M(`uniform sampler2D tS, tB, tD; uniform float uExp, uBloom, uVig, uDof, uWarm, uFocusY, uSat; varying vec2 vUv;
      vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
      vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      void main() {
        vec3 c = texture2D(tS, vUv).rgb;
        float k = smoothstep(0.55, 1.0, abs(vUv.y - uFocusY) * 1.9) * uDof;
        c = mix(c, texture2D(tD, vUv).rgb, k);
        c += texture2D(tB, vUv).rgb * uBloom;
        c = aces(c * uExp * 0.62);
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        c = mix(c, c * vec3(1.07, 1.0, 0.88), smoothstep(0.3, 0.95, l) * uWarm);
        c = mix(c, c * vec3(0.88, 0.97, 1.1), (1.0 - smoothstep(0.02, 0.35, l)) * uWarm);
        c = max(mix(vec3(l), c, uSat), 0.0);
        c = toSRGB(c);
        c = clamp((c - 0.5) * 1.06 + 0.5, 0.0, 1.0);
        vec2 q = vUv - 0.5; c *= 1.0 - uVig * pow(dot(q, q) * 2.2, 1.4);
        gl_FragColor = vec4(c, 1.0);
      }`, { tS: { value: null }, tB: { value: null }, tD: { value: null }, uExp: { value: 1 }, uBloom: { value: 0.45 }, uVig: { value: 0.55 }, uDof: { value: 0.8 }, uWarm: { value: 0.6 }, uFocusY: { value: 0.45 }, uSat: { value: 1.08 } });
  }
  sizePost() {
    const T = THREE, P = this.post, sz = this.gl.getDrawingBufferSize(new T.Vector2()), w = sz.x, h = sz.y;
    if (P.w === w && P.h === h) return; P.w = w; P.h = h;
    for (const k of ['rt', 'h1', 'q1', 'q2', 'd1', 'd2']) if (P[k]) P[k].dispose();
    const RT = (a, b, ms) => new T.WebGLRenderTarget(Math.max(1, a), Math.max(1, b), { type: T.HalfFloatType, depthBuffer: !!ms, samples: ms && this.gl.capabilities.isWebGL2 ? [0, 0, 2, 4][this.q] : 0 });
    P.rt = RT(w, h, true); P.h1 = RT(w >> 1, h >> 1); P.q1 = RT(w >> 2, h >> 2); P.q2 = RT(w >> 2, h >> 2); P.d1 = RT(w >> 2, h >> 2); P.d2 = RT(w >> 2, h >> 2);
  }
  pass(mat, target, u) { const P = this.post; for (const k in u) mat.uniforms[k].value = u[k]; P.quad.material = mat; this.gl.setRenderTarget(target); this.gl.render(P.scene, P.cam); }
  renderPost(env) {
    if (!this.post) this.initPost();
    this.sizePost();
    const P = this.post, gl = this.gl, qw = 1 / Math.max(1, P.w >> 2), qh = 1 / Math.max(1, P.h >> 2);
    gl.setRenderTarget(P.rt); gl.render(this.scene, this.camera);
    // bloom: bright parts, blurred twice at quarter resolution
    this.pass(P.bright, P.h1, { t: P.rt.texture, thr: 0.95 });
    this.pass(P.blur, P.q1, { t: P.h1.texture, d: new THREE.Vector2(qw, 0) }); this.pass(P.blur, P.q2, { t: P.q1.texture, d: new THREE.Vector2(0, qh) });
    this.pass(P.blur, P.q1, { t: P.q2.texture, d: new THREE.Vector2(qw * 2.5, 0) }); this.pass(P.blur, P.q2, { t: P.q1.texture, d: new THREE.Vector2(0, qh * 2.5) });
    // soft copy of the scene for the tilt-shift edges
    this.pass(P.copy, P.d1, { t: P.rt.texture }); this.pass(P.blur, P.d2, { t: P.d1.texture, d: new THREE.Vector2(qw * 1.5, 0) }); this.pass(P.blur, P.d1, { t: P.d2.texture, d: new THREE.Vector2(0, qh * 1.5) });
    const night = clamp((1 - env.light) * 2, 0, 1);
    this.pass(P.final, null, { tS: P.rt.texture, tB: P.q2.texture, tD: P.d1.texture, uExp: gl.toneMappingExposure * 1.55, uBloom: 0.3 + 0.35 * night, uVig: 0.45, uDof: clamp(0.15 + (this.cam.z - 0.8) * 0.3, 0.1, 0.45), uWarm: 0.32 - 0.2 * night, uFocusY: 0.5 + (this.padB || 0) / this.h * 0.25, uSat: this.map.biome === 'snow' ? 0.95 : 1.02 });
  }
  poleGeo() { let g = this.geos.get('pole'); if (!g) { g = G3.build([R3.cap([0, 0, 0], [0, 58, 0], 0.9, R3.MAT('#3b2c1f', { pat: 'wood' })), R3.sph(0, 59, 0, 1.6, R3.MAT('#d4a73c', { pat: 'metal', spec: 1 }))], { seg: 1 }); this.geos.set('pole', g); } return g; }
  flagGeo() { let g = this.geos.get('flagG'); if (!g) { g = new THREE.PlaneGeometry(16, 16, 8, 1).translate(8, 8, 0); this.geos.set('flagG', g); } return g; }
  // each hero's signature aura: golden motes, orbiting light, crackling lightning, swirling sand, dripping souls
  heroAura(e, gh, now, G) {
    const [col, style, warm] = HERO_FX[e.d.key], hx = '#' + col.split(',').map(v => (+v).toString(16).padStart(2, '0')).join(''), r = e.r;
    G.push(['ring', e.rx, e.ry, r * 1.6 + Math.sin(now * 3 + e.id) * 1.5, hx, 0.35, 1.4]);
    this.addLight(e.rx, e.ry, 80, 0.7, !!warm);
    const R = Math.random;
    if (style === 'rise' && R() < 0.5) this.emit3({ x: e.rx + (R() - 0.5) * r * 2, y: e.ry + (R() - 0.5) * r * 2, h: gh + 4, vx: 0, vy: 0, vh: 30 + R() * 20, life: 0.9, t: 0, k: 'magic', col, s: 1.8 });
    if (style === 'orbit') for (let k = 0; k < 2; k++) { const a = now * 2.6 + k * Math.PI + e.id; this.emit3({ x: e.rx + Math.cos(a) * r * 1.5, y: e.ry + Math.sin(a) * r * 1.5, h: gh + 24 + Math.sin(now * 3 + k) * 8, vx: 0, vy: 0, vh: 3, life: 0.4, t: 0, k: 'magic', col, s: 2.2 }); }
    if (style === 'crackle' && R() < 0.22) { const a = R() * 6.28, rr = r * (0.6 + R()); for (let k = 0; k < 4; k++) this.emit3({ x: e.rx + Math.cos(a) * rr + (R() - 0.5) * 6, y: e.ry + Math.sin(a) * rr + (R() - 0.5) * 6, h: gh + 12 + k * 7 + R() * 5, vx: 0, vy: 0, vh: 0, life: 0.12, t: 0, k: 'magic', col, s: 2.4 }); }
    if (style === 'swirl' && R() < 0.6) { const a = now * 4 + R() * 0.6, rr = r * (1.1 + R() * 0.6); this.emit3({ x: e.rx + Math.cos(a) * rr, y: e.ry + Math.sin(a) * rr, h: gh + 3 + R() * 14, vx: -Math.sin(a) * 40, vy: Math.cos(a) * 40, vh: 8, life: 0.6, t: 0, k: warm ? 'dust' : 'magic', col, s: 2.4 }); }
    if (style === 'drip' && R() < 0.35) this.emit3({ x: e.rx + (R() - 0.5) * r * 1.6, y: e.ry + (R() - 0.5) * r * 1.6, h: gh + 30, vx: 0, vy: 0, vh: -18, life: 0.9, t: 0, k: 'magic', col, s: 2 });
  }
  // living world: flocks of birds circling over the field, deer grazing at forest edges (they bolt from armies)
  buildLife3() {
    const T = THREE, r = mkRng(this.seed * 7 + 5), M = this.map;
    const wing = up => { const g = new T.BufferGeometry(), y = up ? 3 : -2; g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, -3, y, -7, 2, 0, 0, 0, 0, 0, 2, 0, 0, -3, y, 7], 3)); g.computeVertexNormals(); return g; };
    const bm = new T.MeshBasicMaterial({ color: 0x1c1a18, side: T.DoubleSide });
    this.birdsA = new T.InstancedMesh(wing(true), bm, 60); this.birdsB = new T.InstancedMesh(wing(false), bm, 60);
    for (const b of [this.birdsA, this.birdsB]) { b.frustumCulled = false; b.count = 0; this.world.add(b); }
    this.flocks = []; for (let k = 0; k < (this.low ? 2 : 4); k++) this.flocks.push({ x: 400 + r() * (MAP_W - 800), y: 300 + r() * (MAP_H - 600), R: 120 + r() * 160, h: 190 + r() * 90, sp: (0.25 + r() * 0.2) * (r() < 0.5 ? -1 : 1), n: 5 + (r() * 6 | 0), ph: r() * 6.28 });
    // deer herds near the forests
    this.deer = []; if (M.biome === 'highland' && r() < 0.5) return;
    const coat = M.biome === 'snow' ? '#8a7a68' : '#9a6c40';
    this.deerGeo = [0, 1, 2, 3, 4, 5, 6].map(f => G3.build(M3.animal('deer', f, coat), { metres: true }));
    for (let h = 0; h < 4; h++) {
      const t = M.trees[(r() * M.trees.length) | 0]; if (!t) break;
      for (let k = 0; k < 3 + (r() * 3 | 0); k++) { const x = clamp(t.x + (r() - 0.5) * 160, 60, MAP_W - 60), y = clamp(t.y + (r() - 0.5) * 160, 60, MAP_H - 60); if (M.water(x, y) || this.gz(x, y) > 60) continue; this.deer.push({ x, y, hx: x, hy: y, yaw: r() * 6.28, tx: x, ty: y, wait: r() * 5, flee: 0, ph: r() }); }
    }
  }
  stepLife(dt, now, S, env) {
    if (!this.flocks) return;
    const m = this._lm || (this._lm = new THREE.Matrix4()), q = this._lq || (this._lq = new THREE.Quaternion()), e = this._le || (this._le = new THREE.Euler()), s = this._ls || (this._ls = new THREE.Vector3(1, 1, 1)), p = this._lp || (this._lp = new THREE.Vector3());
    let na = 0, nb = 0; const night = env.light < 0.6;
    if (!night) for (const f of this.flocks) {
      f.ph += f.sp * dt; f.x += Math.cos(now * 0.05 + f.R) * 6 * dt; f.y += Math.sin(now * 0.04 + f.R) * 6 * dt;
      for (let k = 0; k < f.n; k++) {
        const a = f.ph + k * 0.45, rr = f.R + Math.sin(k * 1.7) * 30, x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr, h = f.h + Math.sin(now + k) * 12;
        e.set(0.2 * Math.sign(f.sp), -(a + Math.PI / 2 * Math.sign(f.sp)), 0); q.setFromEuler(e); p.set(x, h, y); m.compose(p, q, s);
        const up = Math.sin(now * 9 + k * 1.3) > 0; if (up && na < 60) this.birdsA.setMatrixAt(na++, m); else if (nb < 60) this.birdsB.setMatrixAt(nb++, m);
      }
    }
    this.birdsA.count = na; this.birdsB.count = nb; this.birdsA.instanceMatrix.needsUpdate = true; this.birdsB.instanceMatrix.needsUpdate = true;
    for (const d of this.deer) {
      // flee from nearby soldiers, otherwise graze and amble around home
      let fx = 0, fy = 0; if ((this.frameN + d.ph * 10 | 0) % 10 === 0) { for (const u of S.ents) if (u.d.kind === 'u' && Math.abs(u.rx - d.x) < 150 && Math.abs(u.ry - d.y) < 150) { fx += d.x - u.rx; fy += d.y - u.ry; } if (fx || fy) { const l = Math.hypot(fx, fy); d.tx = clamp(d.x + fx / l * 260, 40, MAP_W - 40); d.ty = clamp(d.y + fy / l * 260, 40, MAP_H - 40); d.flee = 3; } }
      d.flee -= dt; d.wait -= dt;
      const dx = d.tx - d.x, dy = d.ty - d.y, dd = Math.hypot(dx, dy), sp = d.flee > 0 ? 110 : 18;
      let fr = 0;
      if (dd > 3) { const st = Math.min(dd, sp * dt); d.x += dx / dd * st; d.y += dy / dd * st; d.yaw = turnAng(d.yaw, Math.atan2(dy, dx), dt * 5); fr = 1 + (((now * (d.flee > 0 ? 12 : 5) + d.ph * 6) | 0) % 6); }
      else if (d.wait <= 0) { d.wait = 4 + Math.random() * 8; d.tx = clamp(d.hx + (Math.random() - 0.5) * 180, 40, MAP_W - 40); d.ty = clamp(d.hy + (Math.random() - 0.5) * 180, 40, MAP_H - 40); if (this.map.water(d.tx, d.ty)) { d.tx = d.x; d.ty = d.y; } }
      const sc = this.toScreen(d.x, d.y, 10); if (sc.z > 1 || sc.x < -80 || sc.x > this.w + 80 || sc.y < -80 || sc.y > this.h + 80) continue;
      this.put('deer' + fr, this.deerGeo[fr], d.x, this.gz(d.x, d.y), d.y, -d.yaw, PPM * 0.85, null);
    }
  }
  addCorpse(e, now, up) {
    if (e.d.kind === 'b' || e.d.sub === 'siege') {
      const h0 = this.gz(e.rx, e.ry);
      for (let k = 0; k < 22; k++) this.emit3({ x: e.rx + (Math.random() - 0.5) * e.r * 1.4, y: e.ry + (Math.random() - 0.5) * e.r, h: h0 + Math.random() * e.r, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, vh: 20 + Math.random() * 20, life: 2 + Math.random() * 2, t: 0, k: 'smoke', s: 8 + e.r * 0.15 });
      for (let k = 0; k < 20; k++) this.emit3({ x: e.rx, y: e.ry, h: h0 + e.r * 0.5, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140, vh: 40 + Math.random() * 80, life: 0.6, t: 0, k: 'fire', s: 3 + Math.random() * 3 });
      return;
    }
    if (this.corpses.length > 380) this.corpses.shift();
    const col = TEAM_COLORS[e.owner] || '#888', uk = upLook(e.d, up); this.geoFor(e.d, col, 10, uk);
    this.corpses.push({ d: e.d, owner: e.owner, x: e.rx, y: e.ry, yaw: e._yaw !== undefined ? e._yaw : (e.hd || 0), t: now, up: up | 0, blood: e.d.sub !== 'treant' && e.d.sub !== 'ghoul' });
  }
  // ---- projectiles, spells and explosions in 3D ----
  fx3(fxs, now, G) {
    const arrowGeo = this.geos.get('arrow') || (this.geos.set('arrow', G3.build([R3.cap([-12, 0, 0], [0, 0, 0], 0.45, R3.MAT('#8a6a44')), R3.cap([0, 0, 0], [3, 0, 0], 0.9, R3.MAT('#b8bec4', { pat: 'metal', spec: 1 })), R3.ell(-11, 0, 0, 2.4, 1.6, 0.2, R3.MAT('#e8e2d2'))], { seg: 1 })), this.geos.get('arrow'));
    for (const f of fxs) {
      const a = (now - f.t0) / f.dur; if (a < 0 || a > 1.4) continue;
      const col = FX_COLORS[f.c] || null;
      switch (f.k) {
        case 'arrow': case 'bolt': case 'javelin': case 'farrow': {
          const acol = { star: '210,235,255', poison: '140,255,120', sun: '255,220,110', rune: '140,200,255' }[f.c] || '255,150,50';
          if (a > 1) { if (!f.hitDone) { f.hitDone = 1; const h = this.heightAt(f.x2, f.y2), sp = f.k === 'farrow'; for (let k = 0; k < (sp ? 7 : 3); k++) this.emit3({ x: f.x2, y: f.y2, h: h + 6, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, vh: Math.random() * 40, life: sp ? 0.5 : 0.3, t: 0, k: sp ? 'magic' : 'dust', col: acol, s: sp ? 2.2 : 1.6 }); if (sp && (f.c === 'fire' || f.c === 'sun' || !f.c)) for (let k = 0; k < 3; k++) this.emit3({ x: f.x2 + (Math.random() - 0.5) * 8, y: f.y2 + (Math.random() - 0.5) * 8, h: h + 2, vx: 0, vy: 0, vh: 16, life: 0.9 + Math.random() * 0.6, t: 0, k: 'fire', s: 2.5 }); if (sp && f.c === 'poison') this.emit3({ x: f.x2, y: f.y2, h: h + 4, vx: 0, vy: 0, vh: 6, life: 1.6, t: 0, k: 'magic', col: '90,200,80', s: 6 }); } break; }
          // f.y / f.y2 carry the old screen lift (-12 / -8); restore true ground points + height
          const x0 = f.x, y0 = f.y + 12, x1 = f.x2, y1 = f.y2 + 8, dist = Math.hypot(x1 - x0, y1 - y0), arc = Math.min(90, dist * 0.22);
          const h0 = this.heightAt(x0, y0) + 22, h1 = this.heightAt(x1, y1) + 14;
          const P = t => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, h0 + (h1 - h0) * t + Math.sin(t * Math.PI) * arc];
          const p = P(a), pb = P(Math.max(0, a - 0.04)), yaw = -Math.atan2(p[1] - pb[1], p[0] - pb[0]), pitch = Math.atan2(p[2] - pb[2], Math.hypot(p[0] - pb[0], p[1] - pb[1]));
          if (f.k === 'farrow') { for (let k = 0; k < 2; k++) this.emit3({ x: p[0] + (Math.random() - 0.5) * 3, y: p[1] + (Math.random() - 0.5) * 3, h: p[2], vx: 0, vy: 0, vh: 4, life: 0.35, t: 0, k: 'magic', col: acol, s: 3.2 }); this.addLight(p[0], p[1], 50, 0.6, f.c === 'fire' || f.c === 'sun' || !f.c); }
          this.put('arrow', arrowGeo, p[0], p[2], p[1], yaw, f.k === 'javelin' ? 1.4 : f.k === 'bolt' ? 0.75 : 1, [0, pitch]);
          break;
        }
        case 'holy': case 'leaf': case 'rune': case 'shadow': case 'fireball': case 'hammer': {
          if (a > 1) break;
          const x = f.x + (f.x2 - f.x) * a, y = f.y + (f.y2 - f.y) * a + (f.big ? 0 : 12), h = (f.big ? (1 - a) * 700 : 26 + Math.sin(a * Math.PI) * 20) + this.heightAt(x, y);
          const cc = { holy: '255,240,180', leaf: '160,255,130', rune: '255,180,90', shadow: '185,140,255', fireball: '255,140,60', hammer: '170,200,255' }[f.k];
          const RR = f.big ? 22 : f.k === 'fireball' ? 9 : 6;
          this.emit3({ x, y, h, vx: 0, vy: 0, vh: 0, life: 0.06, t: 0, k: 'magic', col: '255,255,255', s: RR * 0.8 });
          for (let k = 0; k < (f.big ? 4 : 2); k++) this.emit3({ x: x + (Math.random() - 0.5) * RR, y: y + (Math.random() - 0.5) * RR, h: h + (Math.random() - 0.5) * RR, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, vh: (Math.random() - 0.5) * 20, life: 0.45, t: 0, k: f.k === 'fireball' ? 'fire' : 'magic', col: cc, s: RR * 0.6 });
          this.addLight(x, y, RR * 7, 0.9, f.k === 'fireball' || f.k === 'rune');
          break;
        }
        case 'boulder': { if (a > 1) break; const g = this.geos.get('boulder') || (this.geos.set('boulder', G3.build([R3.sph(0, 0, 0, 6, R3.MAT('#8a847a', { pat: 'rock' }))], { seg: 1 })), this.geos.get('boulder')); const x = f.x + (f.x2 - f.x) * a, y = f.y + (f.y2 - f.y) * a, h = this.heightAt(f.x, f.y) * (1 - a) + this.heightAt(f.x2, f.y2) * a + 60 * (1 - a) + Math.sin(a * Math.PI) * 220; this.put('boulder', g, x, h, y, a * 9, 1, [a * 7, 0]); if (Math.random() < 0.5) this.emit3({ x, y, h, vx: 0, vy: 0, vh: 0, life: 0.5, t: 0, k: 'dust', s: 3 }); break; }
        case 'star': { if (a > 1) break; const x = f.x + (f.x2 - f.x) * a, y = f.y + (f.y2 - f.y) * a + 30 * a, h = this.heightAt(x, y) + (1 - a) * 300; this.emit3({ x, y, h, vx: 0, vy: 0, vh: 0, life: 0.2, t: 0, k: 'magic', col: '190,227,255', s: 3.5 }); this.addLight(x, y, 50, 0.7, false); break; }
        case 'boom': {
          const cc = col || '#ffd27a', r = f.p * (0.35 + 0.65 * Math.min(1, a * 1.6)), h0 = this.heightAt(f.x, f.y);
          if (!f.pDone) {
            f.pDone = 1;
            const n = Math.min(60, 14 + f.p / 4), [cr, cg, cb] = hexRgb(cc.startsWith('#') ? cc : '#ffd27a');
            for (let k = 0; k < n; k++) { const an = Math.random() * 6.28, sp = 40 + Math.random() * f.p * 1.3; this.emit3({ x: f.x, y: f.y, h: h0 + 8, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, vh: 30 + Math.random() * 90, life: 0.4 + Math.random() * 0.5, t: 0, k: f.c && f.c !== 'fire' ? 'magic' : 'fire', col: cr + ',' + cg + ',' + cb, s: 2 + Math.random() * 3 }); }
            for (let k = 0; k < 7; k++) this.emit3({ x: f.x + (Math.random() - 0.5) * f.p, y: f.y + (Math.random() - 0.5) * f.p, h: h0 + 6, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, vh: 18, life: 1.8, t: 0, k: f.c === 'quake' ? 'dust' : 'smoke', s: 7 });
          }
          if (a < 1) { this.addLight(f.x, f.y, f.p * 1.8, 1 - a, true); G.push(['ring', f.x, f.y, r, cc.startsWith('#') ? cc : '#ffd27a', 0.9 * (1 - a), 3.5], ['disc', f.x, f.y, r * 0.9, cc.startsWith('#') ? cc : '#ffd27a', 0.22 * (1 - a)]); }
          break;
        }
        case 'heal': case 'buff': case 'debuff': case 'summon': case 'lvl': {
          const cc = { heal: '120,255,160', buff: '255,215,110', debuff: '190,120,255', summon: '150,255,130', lvl: '255,225,120' }[f.k], hx = '#' + cc.split(',').map(v => (+v).toString(16).padStart(2, '0')).join('');
          const h0 = this.heightAt(f.x, f.y);
          if (f.k === 'lvl') { if (a < 1) for (let k = 0; k < 3; k++) this.emit3({ x: f.x + (Math.random() - 0.5) * 20, y: f.y + (Math.random() - 0.5) * 20, h: h0 + Math.random() * 20, vx: 0, vy: 0, vh: 90, life: 0.9, t: 0, k: 'magic', col: cc, s: 3 }); }
          else if (a < 1) G.push(['ring', f.x, f.y, f.p * (0.5 + a * 0.5), hx, 0.8 * (1 - a), 2.6], ['disc', f.x, f.y, f.p * (0.5 + a * 0.5), hx, 0.12 * (1 - a)]);
          if (a < 1) this.addLight(f.x, f.y, (f.p || 40) * 1.4, 0.6 * (1 - a), false);
          if (Math.random() < 0.8) { const an = Math.random() * 6.28, rr = Math.random() * (f.p || 20) * 0.8; this.emit3({ x: f.x + Math.cos(an) * rr, y: f.y + Math.sin(an) * rr, h: h0 + 4, vx: 0, vy: 0, vh: 34, life: 0.9, t: 0, k: 'magic', col: cc, s: 2.4 }); }
          break;
        }
        case 'dash': { if (!f.pDone) { f.pDone = 1; for (let k = 0; k < 12; k++) { const x = f.x + (f.x2 - f.x) * k / 12, y = f.y + (f.y2 - f.y) * k / 12; this.emit3({ x, y, h: this.heightAt(x, y) + 4, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, vh: 10, life: 0.9, t: 0, k: 'dust', s: 6 }); } } if (a < 1) { const x = f.x + (f.x2 - f.x) * a, y = f.y + (f.y2 - f.y) * a; this.emit3({ x, y, h: this.heightAt(x, y) + 16, vx: 0, vy: 0, vh: 0, life: 0.3, t: 0, k: 'magic', col: '255,230,190', s: 5 }); } break; }
        case 'mark': if (a >= 0 && a <= 1) G.push(['disc', f.x, f.y, f.p, '#ff5a28', 0.1 + 0.18 * a], ['ring', f.x, f.y, f.p, '#ffbe5a', 0.85, 2.4], ['ring', f.x, f.y, f.p * a, '#ffdc96', 0.6, 1.8]); break;
      }
    }
  }
  weather3(env, dt, now) {
    const T = THREE, want = env.weather === 'rain' ? Math.round((this.low ? 700 : 2200) * env.wAmt) : env.weather === 'snow' ? Math.round((this.low ? 500 : 1500) * env.wAmt) : 0, snow = env.weather === 'snow';
    if (!this.wx) {
      const N = 2200, g = new T.BufferGeometry(), pos = new Float32Array(N * 6); g.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
      const lines = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xc8d4e4, transparent: true, opacity: 0.45, depthWrite: false })); lines.frustumCulled = false; this.scene.add(lines);
      const pg = new T.BufferGeometry(), pp = new Float32Array(N * 3); pg.setAttribute('position', new T.BufferAttribute(pp, 3).setUsage(T.DynamicDrawUsage));
      const pts = new T.Points(pg, new T.PointsMaterial({ color: 0xf5f8fc, size: 3.2, transparent: true, opacity: 0.9, depthWrite: false })); pts.frustumCulled = false; this.scene.add(pts);
      this.wx = { lines, pts, pos, pp, drops: [] };
    }
    const W = this.wx, R = Math.max(this.w, this.h) / this.cam.z * 0.8;
    while (W.drops.length < want) W.drops.push({ x: this.tx + (Math.random() - 0.5) * R * 2, y: this.ty + (Math.random() - 0.5) * R * 2, h: this.tgtH + Math.random() * 700, v: 0.7 + Math.random() * 0.6, ph: Math.random() * 6.28 });
    if (W.drops.length > want) W.drops.length = want;
    let n = 0;
    for (const d of W.drops) {
      if (snow) { d.h -= d.v * 60 * dt; d.x += (Math.sin(now * 1.3 + d.ph) * 20 + 12) * dt; } else { d.h -= d.v * 1200 * dt; d.x += d.v * 180 * dt; }
      if (d.h < this.heightAt(d.x, d.y) || Math.abs(d.x - this.tx) > R || Math.abs(d.y - this.ty) > R) { d.x = this.tx + (Math.random() - 0.5) * R * 2; d.y = this.ty + (Math.random() - 0.5) * R * 2; d.h = this.tgtH + 300 + Math.random() * 500; if (!snow && Math.random() < 0.15) this.emit3({ x: d.x, y: d.y, h: this.heightAt(d.x, d.y) + 1, vx: 0, vy: 0, vh: 12, life: 0.3, t: 0, k: 'splash', s: 1.6 }); }
      if (snow) { W.pp[n * 3] = d.x; W.pp[n * 3 + 1] = d.h; W.pp[n * 3 + 2] = d.y; }
      else { const o = n * 6; W.pos[o] = d.x; W.pos[o + 1] = d.h; W.pos[o + 2] = d.y; W.pos[o + 3] = d.x - d.v * 7; W.pos[o + 4] = d.h + d.v * 34; W.pos[o + 5] = d.y; }
      n++;
    }
    W.lines.visible = !snow && n > 0; W.pts.visible = snow && n > 0;
    W.lines.geometry.setDrawRange(0, snow ? 0 : n * 2); W.pts.geometry.setDrawRange(0, snow ? n : 0);
    W.lines.geometry.attributes.position.needsUpdate = true; W.pts.geometry.attributes.position.needsUpdate = true;
    if (!snow && env.wAmt > 0.75 && env.weather === 'rain' && Math.random() < dt * 0.05) { this.flash = 1; if (this.onThunder) setTimeout(this.onThunder, 300 + Math.random() * 1200); }
  }
  // ---- bars, names and ranks on the 2D overlay ----
  drawBars(S, SQ) {
    const c = this.c;
    for (const q of SQ.values()) {
      const b = q.b, n = q.d.n || q.mem.length, full = q.mem.length >= n, f = clamp(q.hp / Math.max(1, q.mx) * q.mem.length / n, 0, 1);
      if (q.sel) for (const m of q.mem) { const s = this.toScreen(m.rx, m.ry, m.d.sub === 'cav' || m.d.sub === 'wolf' ? 50 : 42); if (s.z > 1 || s.x < -20 || s.x > this.w + 20 || s.y < -20 || s.y > this.h + 20) continue; c.fillStyle = 'rgba(8,8,6,0.7)'; c.fillRect(s.x - 7, s.y - 0.5, 14, 3); c.fillStyle = m.hp / m.maxhp > 0.5 ? '#6fd66a' : m.hp / m.maxhp > 0.25 ? '#e0b640' : '#d9432f'; c.fillRect(s.x - 6.5, s.y, 13 * clamp(m.hp / m.maxhp, 0, 1), 2); }
      if (!(q.sel || !full || q.hp < q.mx - 1)) continue;
      const s = this.toScreen(b.rx, b.ry, q.d.sub === 'cav' ? 80 : 66); if (s.z > 1 || s.x < -60 || s.x > this.w + 60 || s.y < -30 || s.y > this.h + 30) continue;
      const w = 38, x = s.x, y = s.y;
      c.fillStyle = 'rgba(8,8,6,0.72)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
      c.fillStyle = f > 0.5 ? mix(TEAM_COLORS[q.owner] || '#888', '#7fe07a', 0.55) : f > 0.25 ? '#e0b640' : '#d9432f'; c.fillRect(x - w / 2, y, w * f, 4);
      for (let k = 1; k < n; k++) { c.fillStyle = 'rgba(8,8,6,0.55)'; c.fillRect(x - w / 2 + w * k / n - 0.3, y, 0.6, 4); }
      if (q.sel || !full) { c.font = '600 10px "Fira Sans Condensed", sans-serif'; c.textAlign = 'center'; c.lineWidth = 2.5; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.fillStyle = full ? '#f3ead2' : '#ffcf7a'; const t = q.mem.length + '/' + n; c.strokeText(t, x + w / 2 + 10, y + 5); c.fillText(t, x + w / 2 + 10, y + 5); }
      if (q.rank) lvlBadge(c, x - w / 2 - 9, y + 2, q.rank + 1);
    }
    for (const e of S.ents) {
      if (e.sq) continue;
      const dmg = e.hp < e.maxhp - 0.5;
      if (!(dmg || S.sel.has(e.id) || e.d.hero || (e.d.kind === 'b' && e.built < 1))) continue;
      const up = e.d.kind === 'b' ? e.r * (e.d.sub === 'fort' ? 2.6 : 1.9) : e.d.hero ? 62 : e.d.sub === 'troll' ? 80 : e.d.sub === 'cav' ? 64 : e.d.summon ? 72 : 48;
      const s = this.toScreen(e.rx, e.ry, up); if (s.z > 1 || s.x < -60 || s.x > this.w + 60 || s.y < -30 || s.y > this.h + 30) continue;
      const w = e.d.kind === 'b' ? clamp(e.r * 1.4 * this.cam.z, 36, 110) : e.d.hero ? 40 : e.d.sub === 'troll' ? 32 : 22, f = clamp(e.hp / e.maxhp, 0, 1), x = s.x, y = s.y;
      c.fillStyle = 'rgba(8,8,6,0.7)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
      c.fillStyle = TEAM_COLORS[e.owner] === undefined ? '#ccc' : (f > 0.5 ? mix(TEAM_COLORS[e.owner], '#7fe07a', 0.55) : f > 0.25 ? '#e0b640' : '#d9432f'); c.fillRect(x - w / 2, y, w * f, 4);
      if (e.d.kind === 'b' && e.built < 1) { c.fillStyle = '#9fd0ff'; c.fillRect(x - w / 2, y + 5, w * e.built, 2); }
      if (e.d.hero) { c.font = '600 12px "Fira Sans Condensed", sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.fillStyle = '#f3ead2'; const t = e.d.heroName + ' · ' + e.lvl + (e.items && e.items.length ? '  ' + e.items.map(k => ART[k].g).join('') : ''); c.strokeText(t, x, y - 5); c.fillText(t, x, y - 5); }
      else if (e.rank) { c.fillStyle = '#e6c25a'; for (let k = 0; k < e.rank; k++) { c.beginPath(); c.arc(x - (e.rank - 1) * 3.5 + k * 7, y - 5, 2, 0, 7); c.fill(); } }
    }
  }
}
