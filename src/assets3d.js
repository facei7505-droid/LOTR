// ================= ASSETS3D: downloaded or generated glTF models =================
// Skinned characters are posed with their own animation clips and baked into the renderer's pose frames
// (idle, 12 walk phases, wind-up / strike / follow-through, death), so hundreds of soldiers stay cheap to draw.
// Two kinds of models are understood:
//  - flat-coloured ones (Quaternius, CC0): materials become vertex colours with photo detail patterns;
//  - textured ones (Tripo3D / Meshy): PBR textures are kept, the royal-blue cloth is repainted in each team's colour.
// A model saved as assets/<unit or building key>.glb (e.g. hum_inf.glb, hum_barr.glb) replaces the procedural one by itself;
// hum_inf_walk.glb / _idle / _attack / _death add clips, hum_inf_weapon.glb / _shield go into the right / left hand.
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
// per-model fine tuning once a generated file arrives (height, turn, grip of the props): key -> fields merged into the entry
const ASSET_TUNE = {};
const ASSET_H = { worker: 1.75, inf: 1.85, spear: 1.85, arch: 1.8, cav: 2.7, siege: 2.8, hero: 1.95, troll: 3.4, wolf: 1.0, treant: 3.6, ghoul: 1.8, bandit: 1.8 };
const PROP_LEN = { weapon: 1.0, shield: 0.85 }, PROP_LEN_SUB = { spear: 2.6, cav: 2.9, arch: 1.4 };
const A3 = {
  models: new Map(), ready: false, failed: false, onReady: null, baseMats: null, patch: null, texMats: new Map(),
  files() { return typeof ASSET_LIST !== 'undefined' ? ASSET_LIST : typeof ASSET_DATA !== 'undefined' ? Object.keys(ASSET_DATA) : []; },
  // generated models name themselves after the unit / building they replace
  autoRegister() {
    const F = this.files();
    for (const f of F) {
      const d = typeof DEF !== 'undefined' && DEF[f]; if (!d || ASSET_UNITS[f] || ASSET_BLDS[f]) continue;
      if (d.kind === 'b') ASSET_BLDS[f] = { file: f, team: [], recolor: 1, span: d.wall ? 1.1 : 2.3, tall: 1, yaw: 0 };
      else ASSET_UNITS[f] = { file: f, h: d.hero ? ASSET_H.hero : ASSET_H[d.sub] || 1.85, recolor: 1, sub: d.sub };
    }
    for (const f of F) {
      let m = /^(.+)_(idle|walk|attack|atk|death)$/.exec(f); if (m && ASSET_UNITS[m[1]]) { const A = ASSET_UNITS[m[1]]; (A.clipFiles || (A.clipFiles = {}))[m[2] === 'attack' ? 'atk' : m[2]] = f; continue; }
      m = /^(.+)_(weapon|shield)$/.exec(f); if (m && ASSET_UNITS[m[1]]) ASSET_UNITS[m[1]][m[2] === 'weapon' ? 'propR' : 'propL'] = f;
    }
    for (const k of Object.keys(ASSET_TUNE)) { const A = ASSET_UNITS[k] || ASSET_BLDS[k]; if (A) Object.assign(A, ASSET_TUNE[k]); }
  },
  has(key) { return this.ready && (!!ASSET_UNITS[key] || !!ASSET_BLDS[key]) && this.models.has((ASSET_UNITS[key] || ASSET_BLDS[key]).file); },
  bytes(name) {
    if (typeof ASSET_DATA !== 'undefined' && ASSET_DATA[name]) { const s = atob(ASSET_DATA[name]), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return Promise.resolve(b.buffer); }
    return fetch('assets/' + name + '.glb').then(r => { if (!r.ok) throw new Error(name); return r.arrayBuffer(); });
  },
  async load() {
    try {
      if (!window.THREE) throw new Error('no three');
      this.autoRegister();
      if (!THREE.GLTFLoader) await loadScript(GLTF_LIB, GLTF_SRI);
      const files = new Set();
      for (const a of [...Object.values(ASSET_UNITS), ...Object.values(ASSET_BLDS)]) { files.add(a.file); for (const f of Object.values(a.clipFiles || {})) files.add(f); if (a.propR) files.add(a.propR); if (a.propL) files.add(a.propL); }
      for (const f of files) {
        try {
          const buf = await this.bytes(f);
          const gltf = await new Promise((ok, bad) => new THREE.GLTFLoader().parse(buf, '', ok, bad));
          this.models.set(f, this.prepare(gltf));
        } catch (e) { console.warn('model', f, e); }
      }
      // clips from separate files join the model they were made for (same skeleton, same bone names)
      for (const A of Object.values(ASSET_UNITS)) {
        const m = this.models.get(A.file); if (!m || !A.clipFiles) continue;
        for (const [role, f] of Object.entries(A.clipFiles)) { const cm = this.models.get(f); const c = cm && [...cm.clips.values()][0]; if (c) m.roles.set(role, c); }
      }
      this.ready = this.models.size > 0;
      if (this.ready && this.onReady) this.onReady();
    } catch (e) { console.warn('glTF models unavailable', e); this.failed = true; }
  },
  // find clips, the idle-pose bounds (for scale and feet on the ground) and the hand bone
  prepare(gltf) {
    const root = gltf.scene, T = THREE, m = { root, clips: new Map(), roles: new Map(), mixer: null, skinned: false };
    for (const c of gltf.animations) m.clips.set(c.name.split('|').pop(), c);
    root.traverse(o => { if (o.isSkinnedMesh) m.skinned = true; });
    if (m.skinned) m.mixer = new T.AnimationMixer(root);
    return m;
  },
  // the clip for one of our roles: named in the entry, from a separate file, or guessed from the clip names
  clip(m, A, role) {
    if (A && A[role] && m.clips.has(A[role])) return m.clips.get(A[role]);
    if (m.roles.has(role)) return m.roles.get(role);
    const re = { idle: /idle|stand|breath|wait|rest/i, walk: /walk|march|run|jog|move/i, atk: /attack|slash|strike|swing|stab|thrust|shoot|punch|hammer|chop|work|combo|hit/i, death: /death|die|dying|dead|fall/i }[role];
    let c = null; for (const [n, cl] of m.clips) if (re.test(n)) { c = cl; break; }
    m.roles.set(role, c); return c;
  },
  pose(m, clip, t) {
    if (!m.mixer) { m.root.updateMatrixWorld(true); return; }
    m.mixer.stopAllAction();
    const c = typeof clip === 'string' ? m.clips.get(clip) || m.clips.get('Idle') || [...m.clips.values()][0] : clip;
    if (c) { const a = m.mixer.clipAction(c); a.reset(); a.play(); m.mixer.setTime(clamp(t, 0, 1) * Math.max(0.001, c.duration - 0.001)); }
    else m.root.traverse(o => { if (o.isSkinnedMesh && o.skeleton) o.skeleton.pose(); }); // no clip: the bind pose
    m.root.updateMatrixWorld(true);
  },
  // gather every mesh of the posed model into world-space triangles grouped like G3 (dull / metal / glow);
  // textured materials keep their UVs in extra groups (G.tex); `pre` places a prop in its bearer's hand
  collect(m, teamLin, teamNames, into, pre) {
    const T = THREE, G = into || Object.assign([0, 1, 2].map(() => ({ pos: [], col: [], pat: [], idx: [], nrm: [] })), { tex: new Map() });
    const v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3(), mw = new T.Matrix4();
    m.root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      const geo = o.geometry, P = geo.attributes.position, N = geo.attributes.normal, UV = geo.attributes.uv, mats = Array.isArray(o.material) ? o.material : [o.material];
      const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : P.count, materialIndex: 0 }];
      mw.copy(o.matrixWorld); if (pre) mw.premultiply(pre);
      nm.getNormalMatrix(mw);
      // posed vertices of this mesh
      const wp = new Float32Array(P.count * 3), wn = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i);
        if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
        v.applyMatrix4(mw); wp[i * 3] = v.x; wp[i * 3 + 1] = v.y; wp[i * 3 + 2] = v.z;
        if (N) { n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); wn[i * 3] = n.x; wn[i * 3 + 1] = n.y; wn[i * 3 + 2] = n.z; }
      }
      const idxAt = k => geo.index ? geo.index.getX(k) : k;
      for (const gr of groups) {
        const mat = mats[gr.materialIndex] || mats[0], name = (mat.name || '').toLowerCase();
        if (mat.map && UV) { // textured: its own group, UVs kept
          let g = G.tex.get(mat.uuid); if (!g) { g = { mat, pos: [], nrm: [], uv: [], idx: [] }; G.tex.set(mat.uuid, g); }
          const remap = new Map();
          for (let k = gr.start; k < gr.start + gr.count; k++) {
            const vi = idxAt(k); let ni = remap.get(vi);
            if (ni === undefined) { ni = g.pos.length / 3; remap.set(vi, ni); g.pos.push(wp[vi * 3], wp[vi * 3 + 1], wp[vi * 3 + 2]); g.nrm.push(wn[vi * 3], wn[vi * 3 + 1], wn[vi * 3 + 2]); g.uv.push(UV.getX(vi), UV.getY(vi)); }
            g.idx.push(ni);
          }
          continue;
        }
        const team = teamNames && teamNames.some(t => name === t.toLowerCase());
        const metal = /metal|gold|steel|iron/.test(name) || mat.metalness > 0.5, glow = mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.3;
        const gi = glow ? 2 : metal ? 1 : 0, g = G[gi];
        const c = team ? teamLin : [mat.color.r, mat.color.g, mat.color.b];
        const pat = /stone/.test(name) ? PAT3.stone : /wood|plank/.test(name) ? PAT3.planks : /roof|main/.test(name) ? PAT3.roof : /skin|face|orc_main|orc_secondary/.test(name) ? PAT3.skin : /hair|fur|beard/.test(name) ? PAT3.fur : metal ? PAT3.metal : PAT3.cloth;
        const remap = new Map();
        for (let k = gr.start; k < gr.start + gr.count; k++) {
          const vi = idxAt(k); let ni = remap.get(vi);
          if (ni === undefined) { ni = g.pos.length / 3; remap.set(vi, ni); g.pos.push(wp[vi * 3], wp[vi * 3 + 1], wp[vi * 3 + 2]); g.nrm.push(wn[vi * 3], wn[vi * 3 + 1], wn[vi * 3 + 2]); g.col.push(c[0], c[1], c[2]); g.pat.push(pat[0], 1 / pat[1]); }
          g.idx.push(ni);
        }
      }
    });
    return G;
  },
  // G (grouped arrays) -> BufferGeometry with the transform (scale s, offset, yaw) and pattern scale per world unit;
  // xf leans the whole figure forward (lean, radians) and lifts it (dy, output units) for models without clips
  toGeo(G, s, off, yaw, perUnit, tallK, xf) {
    const T = THREE, out = new T.BufferGeometry(), pos = [], nrm = [], col = [], pat = [], uv = [], idx = [], cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cl = Math.cos(xf ? xf.lean || 0 : 0), sl = Math.sin(xf ? xf.lean || 0 : 0), dy = xf ? xf.dy || 0 : 0;
    let vo = 0, io = 0;
    const vert = (px, py, pz, nx, ny, nz) => {
      let x = (px - off[0]) * s, y = (py - off[1]) * s * (tallK || 1), z = (pz - off[2]) * s;
      let X = x * cy + z * sy, Z = -x * sy + z * cy; x = X * cl + y * sl; y = -X * sl + y * cl + dy; pos.push(x, y, Z);
      ny /= tallK || 1; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      X = nx * cy + nz * sy; Z = -nx * sy + nz * cy; nrm.push(X * cl + ny * sl, -X * sl + ny * cl, Z);
    };
    G.forEach((g, gi) => {
      if (!g.idx.length) return;
      for (let i = 0; i < g.pos.length; i += 3) { vert(g.pos[i], g.pos[i + 1], g.pos[i + 2], g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]); col.push(g.col[i], g.col[i + 1], g.col[i + 2]); uv.push(0, 0); }
      for (let i = 0; i < g.pat.length; i += 2) pat.push(g.pat[i], g.pat[i + 1] * perUnit);
      for (const k of g.idx) idx.push(k + vo);
      out.addGroup(io, g.idx.length, gi); vo += g.pos.length / 3; io += g.idx.length;
    });
    let ti = 3;
    for (const g of (G.tex || new Map()).values()) {
      if (!g.idx.length) { ti++; continue; }
      for (let i = 0; i < g.pos.length; i += 3) { vert(g.pos[i], g.pos[i + 1], g.pos[i + 2], g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]); col.push(1, 1, 1); pat.push(0, 0); }
      for (let i = 0; i < g.uv.length; i++) uv.push(g.uv[i]);
      for (const k of g.idx) idx.push(k + vo);
      out.addGroup(io, g.idx.length, ti++); vo += g.pos.length / 3; io += g.idx.length;
    }
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3)); out.setAttribute('patd', new T.Float32BufferAttribute(pat, 2));
    if (G.tex && G.tex.size) out.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    out.setIndex(vo > 65000 ? new T.Uint32BufferAttribute(idx, 1) : new T.Uint16BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  },
  // materials for the textured groups (after the three G3 materials); the team's cloth is repainted per colour
  withMats(geo, G, col, recolor) {
    if (!G.tex || !G.tex.size) return geo;
    const base = this.baseMats || [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    geo.userData.mats = base.concat([...G.tex.values()].map(g => this.texMat(g.mat, col, recolor)));
    return geo;
  },
  texMat(src, col, recolor) {
    const key = src.uuid + '|' + (recolor ? col : ''); let m = this.texMats.get(key); if (m) return m;
    m = new THREE.MeshStandardMaterial({ map: recolor ? this.recolorTex(src.map, col) : src.map, normalMap: src.normalMap || null, roughnessMap: src.roughnessMap || null, metalnessMap: src.metalnessMap || null,
      roughness: src.roughness !== undefined ? src.roughness : 0.8, metalness: src.metalness !== undefined ? src.metalness : 0, emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0), emissiveMap: src.emissiveMap || null,
      emissiveIntensity: src.emissiveIntensity || 1, side: src.side, alphaTest: src.alphaTest || 0, transparent: !!src.transparent, envMapIntensity: 0.7 });
    if (src.normalScale) m.normalScale.copy(src.normalScale);
    if (this.patch) this.patch(m);
    this.texMats.set(key, m); return m;
  },
  // royal-blue cloth (hue 195–255°) takes the team's hue; shading and the rest of the texture stay as painted
  recolorTex(tex, col) {
    try {
      const [tr, tg, tb] = hexRgb(col), th = rgbHsv(tr, tg, tb);
      if (th[0] >= 195 && th[0] <= 255) return tex;
      const img = tex.image, W = Math.min(1024, img.width), H = Math.min(1024, img.height), cv = mkCanvas(W, H), c = cv.getContext('2d');
      c.drawImage(img, 0, 0, W, H); const d = c.getImageData(0, 0, W, H), p = d.data;
      const sk = clamp(th[1] / 0.75, 0.2, 1.3), vk = clamp(th[2] / 0.8, 0.55, 1.25);
      for (let i = 0; i < p.length; i += 4) {
        const [h, s, v] = rgbHsv(p[i], p[i + 1], p[i + 2]); if (h < 195 || h > 255 || s < 0.3 || v < 0.1) continue;
        const [r, g, b] = hsvRgb(th[0], Math.min(1, s * sk), Math.min(1, v * vk)); p[i] = r; p[i + 1] = g; p[i + 2] = b;
      }
      c.putImageData(d, 0, 0);
      const t = new THREE.CanvasTexture(cv); t.flipY = tex.flipY; t.colorSpace = tex.colorSpace || THREE.SRGBColorSpace; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT; t.anisotropy = 4; t.needsUpdate = true;
      return t;
    } catch (e) { return tex; }
  },
  bounds(G) { const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const g of [...G, ...(G.tex ? G.tex.values() : [])]) for (let i = 0; i < g.pos.length; i += 3) for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], g.pos[i + a]); mx[a] = Math.max(mx[a], g.pos[i + a]); } return { mn, mx }; },
  teamLin(col) { const [r, g, b] = hexRgb(col); return [Math.pow(r / 255, 2.2) * 0.8, Math.pow(g / 255, 2.2) * 0.8, Math.pow(b / 255, 2.2) * 0.8]; },
  // a unit's pose frame in metres, facing +x like the procedural models (frames as in M3.build)
  unitGeo(d, col, frame) {
    const A = ASSET_UNITS[d.key], m = A && this.models.get(A.file); if (!m) return null;
    const idle = this.clip(m, A, 'idle');
    if (!m.norm) { // scale and feet-on-the-ground from the idle pose
      this.pose(m, idle, 0); const B = this.bounds(this.collect(m, [1, 1, 1], []));
      m.norm = { s: A.h / Math.max(1e-6, B.mx[1] - B.mn[1]), off: [(B.mn[0] + B.mx[0]) / 2, B.mn[1], (B.mn[2] + B.mx[2]) / 2] };
    }
    let role = 'idle', t = 0, ph = -1;
    if (frame >= 1 && frame <= 6) { role = 'walk'; t = (frame - 1) / 6; } else if (frame >= 11 && frame <= 16) { role = 'walk'; t = (frame - 10.5) / 6; }
    else if (frame >= 7 && frame <= 9) { role = 'atk'; t = [0.3, 0.5, 0.72][frame - 7]; } else if (frame === 10) { role = 'death'; t = 1; }
    const c = this.clip(m, A, role);
    // no clip for this role: a gentle bob for walking, a lunge for the strike, lying down for death
    let xf = null;
    if (!c && role === 'walk') { ph = t * Math.PI * 2; xf = { dy: Math.abs(Math.sin(ph)) * 0.06 * A.h, lean: 0.05 }; }
    else if (!c && role === 'atk') xf = { lean: [0.06, 0.16, 0.1][frame - 7] };
    else if (!c && role === 'death') xf = { lean: 1.45, dy: 0.12 * A.h };
    this.pose(m, c || idle, c ? t : 0);
    const G = this.collect(m, this.teamLin(col), A.team);
    if (A.weapon && A.hand) this.addWeapon(m, A, G);
    if (A.propR) this.addProp(m, A, G, 'R', col);
    if (A.propL) this.addProp(m, A, G, 'L', col);
    return this.withMats(this.toGeo(G, m.norm.s, m.norm.off, A.yaw !== undefined ? A.yaw : Math.PI / 2, PPM, 1, xf), G, col, A.recolor);
  },
  // the hand bone of a rig: the entry names it, or it is found by the usual rig names (Mixamo, Meshy, Tripo, Blender)
  handBone(m, side, name) {
    if (name) { const b = m.root.getObjectByName(name); if (b) return b; }
    const re = side === 'R' ? /(right.?hand|hand.?r|r.?hand|wrist.?r|hand_?r)$/i : /(left.?hand|hand.?l|l.?hand|wrist.?l|hand_?l)$/i;
    let bone = null; m.root.traverse(o => { if (!bone && o.isBone && re.test(o.name.replace(/[:.]/g, '_')) && !/thumb|index|middle|ring|pinky|finger/i.test(o.name)) bone = o; });
    return bone;
  },
  // a generated weapon or shield in the hand: its longest side follows the bone's +Z (tune with propRot / propGrip / propLen)
  addProp(m, A, G, side, col) {
    const P = this.models.get(side === 'R' ? A.propR : A.propL), bone = this.handBone(m, side, side === 'R' ? A.handR : A.handL); if (!P || !bone) return;
    const T = THREE;
    if (!P.fit) {
      this.pose(P, null, 0); const B = this.bounds(this.collect(P, [1, 1, 1], [])), ext = [0, 1, 2].map(a => B.mx[a] - B.mn[a]), ax = ext.indexOf(Math.max(...ext));
      const grip = side === 'R' ? (A.propGrip !== undefined ? A.propGrip : 0.12) : 0.5, c = [0, 1, 2].map(a => a === ax ? B.mn[a] + ext[a] * grip : (B.mn[a] + B.mx[a]) / 2);
      P.fit = { ax, len: ext[ax], c };
    }
    const bs = new T.Vector3().setFromMatrixScale(bone.matrixWorld).x;
    const len = side === 'R' ? A.propLen || PROP_LEN_SUB[A.sub] || PROP_LEN.weapon : A.shieldLen || PROP_LEN.shield;
    const k = len / P.fit.len / (m.norm.s * bs);
    const toZ = new T.Quaternion().setFromUnitVectors(new T.Vector3(P.fit.ax === 0 ? 1 : 0, P.fit.ax === 1 ? 1 : 0, P.fit.ax === 2 ? 1 : 0), new T.Vector3(0, 0, 1));
    const r = (side === 'R' ? A.propRot : A.shieldRot) || [0, 0, 0], user = new T.Quaternion().setFromEuler(new T.Euler(r[0] * Math.PI / 180, r[1] * Math.PI / 180, r[2] * Math.PI / 180));
    const M = new T.Matrix4().makeTranslation(-P.fit.c[0], -P.fit.c[1], -P.fit.c[2]);
    M.premultiply(new T.Matrix4().makeRotationFromQuaternion(user.multiply(toZ))).premultiply(new T.Matrix4().makeScale(k, k, k)).premultiply(bone.matrixWorld);
    this.pose(P, null, 0); this.collect(P, this.teamLin(col), [], G, M);
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
      const g = G[gr.materialIndex], remap = new Map();
      for (let k = gr.start; k < gr.start + gr.count; k++) {
        const vi = W.index.getX(k); let ni = remap.get(vi);
        if (ni === undefined) { ni = g.pos.length / 3; remap.set(vi, ni); v.fromBufferAttribute(pa, vi).applyMatrix4(bone.matrixWorld); n.fromBufferAttribute(na, vi).applyMatrix3(nm).normalize(); g.pos.push(v.x, v.y, v.z); g.nrm.push(n.x, n.y, n.z); g.col.push(ca.getX(vi), ca.getY(vi), ca.getZ(vi)); g.pat.push(PAT3.metal[0], 1 / PAT3.metal[1]); }
        g.idx.push(ni);
      }
    }
  },
  // a building in world px: fitted to the footprint, taller like BFME, roofs in the team colour
  bldGeo(d, col) {
    const A = ASSET_BLDS[d.key], m = A && this.models.get(A.file); if (!m) return null;
    this.pose(m, null, 0);
    const G = this.collect(m, this.teamLin(col), A.team), B = this.bounds(G);
    const s = d.r * A.span / Math.max(1e-6, Math.max(B.mx[0] - B.mn[0], B.mx[2] - B.mn[2]));
    return this.withMats(this.toGeo(G, s, [(B.mn[0] + B.mx[0]) / 2, B.mn[1], (B.mn[2] + B.mx[2]) / 2], A.yaw || 0, 1, A.tall), G, col, A.recolor);
  },
};
function rgbHsv(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return [h, mx ? d / mx : 0, mx]; }
function hsvRgb(h, s, v) { const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return [(r + m) * 255 | 0, (g + m) * 255 | 0, (b + m) * 255 | 0]; }
