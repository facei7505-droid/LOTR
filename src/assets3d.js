// ================= ASSETS3D: downloaded glTF models (Quaternius, CC0) =================
// Skinned characters are posed with their own animation clips and baked into the renderer's pose frames
// (idle, 12 walk phases, wind-up / strike / follow-through, death), so hundreds of soldiers stay cheap to draw.
// Static models (castles) are re-coloured with team colours and photo detail patterns.
const GLTF_LIB = 'https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js';
const GLTF_SRI = 'sha384-FassWWYNEPQsuRQm+59KIMcDetEc30bNyE9yfx16Ok8lvoowyH81LtrPmLWltJMh';
// unit type -> model file, height in metres, clips for our frames, materials painted in the team colour, weapon in hand
const ASSET_UNITS = {
  hum_h1: { file: 'king', h: 2.05, idle: 'Idle_Sword', walk: 'Walk', atk: 'Sword_Slash', death: 'Death', team: ['Blue'], hand: 'WristR', weapon: 'excalibur' },
  orc_worker: { file: 'orc', h: 1.75, idle: 'Idle', walk: 'Walk', atk: 'Weapon', death: 'Death', team: ['Belt'] },
};
const ASSET_BLDS = {
  hum_fort: { file: 'castle_fortress', team: ['Main'], span: 2.5, tall: 1.35, yaw: 0 },
};
const A3 = {
  models: new Map(), ready: false, failed: false, onReady: null,
  has(key) { return this.ready && (!!ASSET_UNITS[key] || !!ASSET_BLDS[key]) && this.models.has((ASSET_UNITS[key] || ASSET_BLDS[key]).file); },
  bytes(name) {
    if (typeof ASSET_DATA !== 'undefined' && ASSET_DATA[name]) { const s = atob(ASSET_DATA[name]), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return Promise.resolve(b.buffer); }
    return fetch('assets/' + name + '.glb').then(r => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); });
  },
  async load() {
    try {
      if (!window.THREE) throw new Error('no three');
      if (!THREE.GLTFLoader) await loadScript(GLTF_LIB, GLTF_SRI);
      const files = new Set([...Object.values(ASSET_UNITS), ...Object.values(ASSET_BLDS)].map(a => a.file));
      for (const f of files) {
        try {
          const buf = await this.bytes(f);
          const gltf = await new Promise((ok, bad) => new THREE.GLTFLoader().parse(buf, '', ok, bad));
          this.models.set(f, this.prepare(gltf));
        } catch (e) { console.warn('model', f, e); }
      }
      this.ready = this.models.size > 0;
      if (this.ready && this.onReady) this.onReady();
    } catch (e) { console.warn('glTF models unavailable', e); this.failed = true; }
  },
  // find clips, the idle-pose bounds (for scale and feet on the ground) and the hand bone
  prepare(gltf) {
    const root = gltf.scene, T = THREE, m = { root, clips: new Map(), mixer: null, skinned: false };
    for (const c of gltf.animations) m.clips.set(c.name.split('|').pop(), c);
    root.traverse(o => { if (o.isSkinnedMesh) m.skinned = true; });
    if (m.skinned) m.mixer = new T.AnimationMixer(root);
    return m;
  },
  pose(m, clipName, t) {
    if (!m.mixer) { m.root.updateMatrixWorld(true); return; }
    m.mixer.stopAllAction();
    const c = m.clips.get(clipName) || m.clips.get('Idle') || [...m.clips.values()][0];
    if (c) { const a = m.mixer.clipAction(c); a.reset(); a.play(); m.mixer.setTime(clamp(t, 0, 1) * Math.max(0.001, c.duration - 0.001)); }
    m.root.updateMatrixWorld(true);
  },
  // gather every mesh of the posed model into world-space triangles grouped like G3 (dull / metal / glow)
  collect(m, teamLin, teamNames) {
    const T = THREE, G = [0, 1, 2].map(() => ({ pos: [], col: [], pat: [], idx: [], nrm: [] })), v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
    m.root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const geo = o.geometry, P = geo.attributes.position, N = geo.attributes.normal, mats = Array.isArray(o.material) ? o.material : [o.material];
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : P.count, materialIndex: 0 }];
      nm.getNormalMatrix(o.matrixWorld);
      // posed vertices of this mesh
      const wp = new Float32Array(P.count * 3), wn = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
        v.applyMatrix4(o.matrixWorld); wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z;
        if (N) { n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); wn[i * 3] = n.x; wn[i * 3 + 1] = n.y; wn[i * 3 + 2] = n.z; }
      }
      for (const gr of groups) {
        const mat = mats[gr.materialIndex] || mats[0], name = (mat.name || '').toLowerCase();
        const team = teamNames && teamNames.some(t => name === t.toLowerCase());
        const metal = /metal|gold|steel|iron/.test(name) || mat.metalness > 0.5, glow = mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.3;
        const gi = glow ? 2 : metal ? 1 : 0, g = G[gi];
        const c = team ? teamLin : [mat.color.r, mat.color.g, mat.color.b];
        const pat = /stone/.test(name) ? PAT3.stone : /wood|plank/.test(name) ? PAT3.planks : /roof|main/.test(name) ? PAT3.roof : /skin|face|orc_main|orc_secondary/.test(name) ? PAT3.skin : /hair|fur|beard/.test(name) ? PAT3.fur : metal ? PAT3.metal : PAT3.cloth;
        const base = g.pos.length / 3, remap = new Map();
        const idxAt = k => geo.index ? geo.index.getX(k) : k;
        for (let k = gr.start; k < gr.start + gr.count; k++) {
          const vi = idxAt(k); let ni = remap.get(vi);
          if (ni === undefined) { ni = g.pos.length / 3; remap.set(vi, ni); g.pos.push(wp[vi * 3], wp[vi * 3 + 1], wp[vi * 3 + 2]); g.nrm.push(wn[vi * 3], wn[vi * 3 + 1], wn[vi * 3 + 2]); g.col.push(c[0], c[1], c[2]); g.pat.push(pat[0], 1 / pat[1]); }
          g.idx.push(ni);
        }
        void base;
      }
    });
    return G;
  },
  // G (grouped arrays) -> BufferGeometry with the transform (scale s, offset, yaw) and pattern scale per world unit
  toGeo(G, s, off, yaw, perUnit, tallK) {
    const T = THREE, out = new T.BufferGeometry(), pos = [], nrm = [], col = [], pat = [], idx = [], cy = Math.cos(yaw), sy = Math.sin(yaw);
    let vo = 0, io = 0;
    G.forEach((g, gi) => {
      if (!g.idx.length) return;
      for (let i = 0; i < g.pos.length; i += 3) {
        const x = (g.pos[i] - off[0]) * s, y = (g.pos[i + 1] - off[1]) * s * (tallK || 1), z = (g.pos[i + 2] - off[2]) * s;
        pos.push(x * cy + z * sy, y, -x * sy + z * cy);
        const nx = g.nrm[i], ny = g.nrm[i + 1] / (tallK || 1), nz = g.nrm[i + 2], l = Math.hypot(nx, ny, nz) || 1;
        nrm.push((nx * cy + nz * sy) / l, ny / l, (-nx * sy + nz * cy) / l);
        col.push(g.col[i], g.col[i + 1], g.col[i + 2]);
      }
      for (let i = 0; i < g.pat.length; i += 2) pat.push(g.pat[i], g.pat[i + 1] * perUnit);
      for (const k of g.idx) idx.push(k + vo);
      out.addGroup(io, g.idx.length, gi); vo += g.pos.length / 3; io += g.idx.length;
    });
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3)); out.setAttribute('patd', new T.Float32BufferAttribute(pat, 2));
    out.setIndex(vo > 65000 ? new T.Uint32BufferAttribute(idx, 1) : new T.Uint16BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  },
  bounds(G) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const g of G) for (let i = 0; i < g.pos.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], g.pos[i + a]); mx[a] = Math.max(mx[a], g.pos[i + a]); } return { mn, mx }; },
  teamLin(col) { const [r, g, b] = hexRgb(col); return [Math.pow(r / 255, 2.2) * 0.8, Math.pow(g / 255, 2.2) * 0.8, Math.pow(b / 255, 2.2) * 0.8]; },
  // a unit's pose frame in metres, facing +x like the procedural models (frames as in M3.build)
  unitGeo(d, col, frame) {
    const A = ASSET_UNITS[d.key], m = A && this.models.get(A.file); if (!m) return null;
    if (!m.norm) { // scale and feet-on-the-ground from the idle pose
      this.pose(m, A.idle, 0); const B = this.bounds(this.collect(m, [1, 1, 1], []));
      m.norm = { s: A.h / Math.max(1e-6, B.mx[1] - B.mn[1]), off: [(B.mn[0] + B.mx[0]) / 2, B.mn[1], (B.mn[2] + B.mx[2]) / 2] };
    }
    let clip = A.idle, t = 0;
    if (frame >= 1 && frame <= 6) { clip = A.walk; t = (frame - 1) / 6; }
    else if (frame >= 11 && frame <= 16) { clip = A.walk; t = (frame - 10.5) / 6; }
    else if (frame === 7) { clip = A.atk; t = 0.3; } else if (frame === 8) { clip = A.atk; t = 0.5; } else if (frame === 9) { clip = A.atk; t = 0.72; }
    else if (frame === 10) { clip = A.death; t = 1; }
    this.pose(m, clip, t);
    const G = this.collect(m, this.teamLin(col), A.team);
    if (A.weapon && A.hand) this.addWeapon(m, A, G);
    return this.toGeo(G, m.norm.s, m.norm.off, Math.PI / 2, PPM);
  },
  // Excalibur in the king's hand, following the wrist bone
  addWeapon(m, A, G) {
    const bone = m.root.getObjectByName(A.hand); if (!bone) return;
    if (!m.weapon) {
      const { MAT, cap, sph } = R3, bs = new THREE.Vector3().setFromMatrixScale(bone.matrixWorld).x, s = 1 / (m.norm.s * bs); // metres -> the wrist bone's own units
      const P = [cap([0, 0, -0.06 * s], [0, 0, 0.1 * s], 0.022 * s, MAT('#5b3a22', { pat: 'leather' })), cap([-0.11 * s, 0, 0.1 * s], [0.11 * s, 0, 0.1 * s], 0.018 * s, MAT('#c9a04a', { pat: 'metal', spec: 1 })), cap([0, 0, 0.12 * s], [0, 0, 1.0 * s], 0.026 * s, MAT('#dfe6ec', { pat: 'metal', spec: 1.4, shin: 70 })), sph(0, 0, -0.08 * s, 0.03 * s, MAT('#c9a04a', { pat: 'metal', spec: 1 }))];
      m.weapon = G3.build(P, {});
    }
    const W = m.weapon, pa = W.attributes.position, na = W.attributes.normal, ca = W.attributes.color, v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(bone.matrixWorld);
    for (const gr of W.groups) {
      const g = G[gr.materialIndex], base = g.pos.length / 3, remap = new Map();
      for (let k = gr.start; k < gr.start + gr.count; k++) {
        const vi = W.index.getX(k); let ni = remap.get(vi);
        if (ni === undefined) { ni = g.pos.length / 3; remap.set(vi, ni); v.fromBufferAttribute(pa, vi).applyMatrix4(bone.matrixWorld); n.fromBufferAttribute(na, vi).applyMatrix3(nm).normalize(); g.pos.push(v.x, v.y, v.z); g.nrm.push(n.x, n.y, n.z); g.col.push(ca.getX(vi), ca.getY(vi), ca.getZ(vi)); g.pat.push(PAT3.metal[0], 1 / PAT3.metal[1]); }
        g.idx.push(ni);
      }
      void base;
    }
  },
  // a building in world px: fitted to the footprint, taller like BFME, roofs in the team colour
  bldGeo(d, col) {
    const A = ASSET_BLDS[d.key], m = A && this.models.get(A.file); if (!m) return null;
    this.pose(m, null, 0);
    const G = this.collect(m, this.teamLin(col), A.team), B = this.bounds(G);
    const s = d.r * A.span / Math.max(1e-6, Math.max(B.mx[0] - B.mn[0], B.mx[2] - B.mn[2]));
    return this.toGeo(G, s, [(B.mn[0] + B.mx[0]) / 2, B.mn[1], (B.mn[2] + B.mx[2]) / 2], A.yaw || 0, 1, A.tall);
  },
};
