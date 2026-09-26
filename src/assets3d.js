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
  models: new Map(), missing: new Set(), ready: false, failed: false, onReady: null, baseMats: null, patch: null, texMats: new Map(),
  files() { return typeof ASSET_LIST !== 'undefined' ? ASSET_LIST : typeof ASSET_DATA !== 'undefined' ? Object.keys(ASSET_DATA) : []; },
  // generated models name themselves after the unit / building they replace
  autoRegister() {
    const F = this.files();
    for (const f of F) {
      const d = typeof DEF !== 'undefined' && DEF[f]; if (!d || (ASSET_UNITS[f] || ASSET_BLDS[f] || {}).file === f) continue; // a file named after the unit wins over an older stand-in
      if (d.kind === 'b') ASSET_BLDS[f] = { file: f, team: [], recolor: 1, span: d.wall ? 1.1 : 2.3, tall: 1, yaw: 0 };
      else ASSET_UNITS[f] = { file: f, h: d.hero ? ASSET_H.hero : ASSET_H[d.sub] || 1.85, recolor: 1, sub: d.sub, weaponLeft: (d.sub === 'arch' && d.race !== 'dwf' && d.race !== 'orc') || f === 'elf_h2' }; // bows are held in the left hand
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
  // models are loaded per people: only the races in the battle (plus wild creatures), so a hundred files never load at once
  load() { return this.need(null); },
  need(races) { this.q = (this.q || Promise.resolve()).then(() => this.needNow(races)); return this.q; },
  async needNow(races) {
    try {
      if (!window.THREE) throw new Error('no three');
      if (!this.registered) { this.autoRegister(); this.registered = true; }
      const want = k => !races || races.some(r => k.startsWith(r + '_')) || !/^(hum|elf|dwf|orc|und|des)_/.test(k);
      const files = new Set();
      for (const [k, a] of [...Object.entries(ASSET_UNITS), ...Object.entries(ASSET_BLDS)]) { if (!want(k)) continue; files.add(a.file); for (const f of Object.values(a.clipFiles || {})) files.add(f); if (a.propR) files.add(a.propR); if (a.propL) files.add(a.propL); }
      for (const f of [...files]) if (this.models.has(f) || this.missing.has(f)) files.delete(f);
      if (!files.size) return;
      if (!THREE.GLTFLoader) await loadScript(GLTF_LIB, GLTF_SRI);
      for (const f of files) {
        try {
          const buf = await this.bytes(f);
          const gltf = await new Promise((ok, bad) => new THREE.GLTFLoader().parse(buf, '', ok, bad));
          this.models.set(f, this.prepare(gltf));
        } catch (e) { this.missing.add(f); console.warn('model', f, e); }
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
    if (!m.skinned && A.rig !== false && this.humanoid(d)) return this.rigGeo(d, col, frame, A, m); // generated statue -> our own skeleton
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
    const hand = side === 'R' && A.weaponLeft ? 'L' : side;
    const P = this.models.get(side === 'R' ? A.propR : A.propL), bone = this.handBone(m, hand, hand === 'R' ? A.handR : A.handL); if (!P || !bone) return;
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
  // ---------- automatic skeleton for generated humanoids that come without one ----------
  // The model (standing in A-pose) gets 16 bones placed by body proportions and measured arm tips / legs;
  // every vertex is bound to its nearest bones. Each pose frame copies the joints of the procedural soldier
  // (formation stance with weapon ready, 12 walk phases, wind-up / strike / follow-through), reached by two-bone IK,
  // and the procedural weapon and shield are moved into the new hands.
  humanoid(d) { return d.kind === 'u' && d.sub !== 'cav' && d.sub !== 'siege' && d.sub !== 'wolf'; },
  rigBase(m, A, col) {
    const T = THREE, key = col + '|' + (m.flip ? 1 : 0);
    m.rigGeo = m.rigGeo || new Map();
    let b = m.rigGeo.get(key); if (b) return b;
    this.pose(m, null, 0);
    const G = this.collect(m, this.teamLin(col), A.team);
    const geo = this.withMats(this.toGeo(G, m.norm.s, m.norm.off, m.flip ? -Math.PI / 2 : Math.PI / 2, PPM, 1), G, col, A.recolor);
    b = { geo, G }; m.rigGeo.set(key, b); return b;
  },
  rigSetup(m, A, col) {
    if (m.rig) return m.rig;
    let base = this.rigBase(m, A, col).geo, P = base.attributes.position.array;
    let H = 0; for (let i = 1; i < P.length; i += 3) H = Math.max(H, P[i]);
    const band = (y0, y1, f) => { for (let i = 0; i < P.length; i += 3) { const y = P[i + 1]; if (y >= y0 * H && y <= y1 * H) f(P[i], y, P[i + 2]); } };
    // facing: the toes stick out in front of the ankles; generated models may face either way
    let tx = 0, tn = 0, ax = 0, an = 0;
    band(0, 0.035, x => { tx += x; tn++; }); band(0.08, 0.14, x => { ax += x; an++; });
    if (tn && an && tx / tn < ax / an - 0.004 * H && !m.flip) { m.flip = true; base = this.rigBase(m, A, col).geo; P = base.attributes.position.array; }
    const rs = m.flip ? -1 : 1; // lateral side of the right hand (glTF characters face +z with the right hand at -x)
    // centre line and legs
    let cx = 0, cn = 0; band(0.4, 0.9, (x, y, z) => { if (Math.abs(z) < 0.08 * H) { cx += x; cn++; } }); cx = cn ? cx / cn : 0;
    const leg = { 1: [0, 0, 0], '-1': [0, 0, 0] };
    band(0.12, 0.35, (x, y, z) => { const s = z >= 0 ? 1 : -1, L = leg[s]; L[0] += x; L[1] += z; L[2]++; });
    const legZ = s => { const L = leg[s]; return L[2] ? clamp(L[1] / L[2], -0.11 * H, 0.11 * H) : s * 0.055 * H; }, legX = s => leg[s][2] ? leg[s][0] / leg[s][2] : cx;
    // arm tips: the points furthest to each side between the hips and the shoulders
    const tip = { 1: null, '-1': null };
    band(0.3, 0.88, (x, y, z) => { const s = z >= 0 ? 1 : -1; if (!tip[s] || Math.abs(z) > Math.abs(tip[s][2])) tip[s] = [x, y, z]; });
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const J = {}, sy = 0.815 * H, hy = 0.52 * H;
    J.pelvis = V(cx, hy, 0); J.chest = V(cx, 0.72 * H, 0); J.neck = V(cx, 0.845 * H, 0); J.top = V(cx, H, 0);
    for (const s of [1, -1]) {
      const n = s === rs ? 'R' : 'L', t = tip[s] || [cx, 0.55 * H, s * 0.35 * H];
      const S = V(cx, sy, s * 0.105 * H), T0 = V(t[0], t[1], t[2]), len = T0.distanceTo(S), W = S.clone().lerp(T0, Math.max(0.5, 1 - 0.1 * H / Math.max(len, 1e-3)));
      J['sh' + n] = S; J['el' + n] = S.clone().lerp(W, 0.5); J['wr' + n] = W; J['tip' + n] = T0;
      const lz = legZ(s), lx = legX(s);
      J['hip' + n] = V(lx, hy - 0.02 * H, lz); J['kn' + n] = V(lx, 0.28 * H, lz); J['an' + n] = V(lx, 0.055 * H, lz); J['to' + n] = V(lx + 0.12 * H, 0.01 * H, lz);
    }
    // bones: [name, head, tail, radius (share of height), side]
    const B = [['pelvis', J.pelvis, J.pelvis.clone().setY(0.44 * H), 0.12], ['spine', J.pelvis, J.chest, 0.13], ['chest', J.chest, J.neck, 0.13], ['head', J.neck, J.top, 0.08]];
    for (const n of ['R', 'L']) B.push(['ua' + n, J['sh' + n], J['el' + n], 0.05, n], ['fa' + n, J['el' + n], J['wr' + n], 0.045, n], ['ha' + n, J['wr' + n], J['tip' + n], 0.04, n], ['th' + n, J['hip' + n], J['kn' + n], 0.07, n], ['sn' + n, J['kn' + n], J['an' + n], 0.055, n], ['ft' + n, J['an' + n], J['to' + n], 0.05, n]);
    // skin weights: inverse distance to the bone segments (in bone radii), four strongest kept; legs never take the other side
    const nv = P.length / 3, W4 = new Float32Array(nv * 4), I4 = new Uint8Array(nv * 4), p = V(0, 0, 0), ab = V(0, 0, 0), ap = V(0, 0, 0);
    const segD = (a, b) => { ab.subVectors(b, a); ap.subVectors(p, a); const t = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1); return ap.sub(ab.multiplyScalar(t)).length(); };
    const w = new Float32Array(B.length);
    for (let i = 0; i < nv; i++) {
      p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); const side = (p.z - 0) * rs >= 0 ? 'R' : 'L';
      for (let b = 0; b < B.length; b++) {
        const [nm, a, t, r, bs] = B[b];
        if (bs && /^(th|sn|ft)/.test(nm) && bs !== side && Math.abs(p.z) > 0.015 * H) { w[b] = 0; continue; }
        if (bs && /^(ua|fa|ha)/.test(nm) && bs !== side) { w[b] = 0; continue; }
        const nd = segD(a, t) / (r * H); w[b] = 1 / (nd * nd * nd * nd + 1e-4);
      }
      const ord = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 4); let sum = 0; for (const b of ord) sum += w[b];
      ord.forEach((b, k) => { I4[i * 4 + k] = b; W4[i * 4 + k] = w[b] / sum; });
    }
    m.rig = { H, J, B, W4, I4, rs };
    return m.rig;
  },
  // where the procedural soldier holds its joints in this frame, mapped onto the generated body
  rigPose(R, PJ, PJ0) {
    const T = THREE, { J, H, rs } = R, V = a => new T.Vector3(a[0], a[1], -rs * a[2]); // procedural right hand is at -z
    const k = H / PJ0.top, q = new Map(), o = new Map(), qn = (a, b) => new T.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
    const dy = (PJ.hip[1] - PJ0.hip[1]) * k;
    const pelvis2 = J.pelvis.clone().setY(J.pelvis.y + dy);
    const spRest = V(PJ0.hd).sub(V(PJ0.hip)), spNow = V(PJ.hd).sub(V(PJ.hip)), qs = qn(spRest, spNow);
    const tr = (pt) => pt.clone().sub(J.pelvis).applyQuaternion(qs).add(pelvis2);
    o.set('pelvis', [J.pelvis, pelvis2]); q.set('pelvis', new T.Quaternion());
    for (const b of ['spine', 'chest', 'head']) q.set(b, qs);
    o.set('spine', [J.pelvis, pelvis2]); o.set('chest', [J.pelvis, pelvis2]); o.set('head', [J.pelvis, pelvis2]);
    // two-bone IK towards a target, bending like the procedural elbow / knee
    const ik = (A, Bj, C, target, pole) => {
      const L1 = A.distanceTo(Bj), L2 = Bj.distanceTo(C), d = clamp(A.distanceTo(target), Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
      const dir = target.clone().sub(A).normalize(), a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const pl = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))); if (pl.lengthSq() < 1e-8) pl.set(0, 0, 1); pl.normalize();
      const mid = A.clone().add(dir.clone().multiplyScalar(a)).add(pl.multiplyScalar(h)), end = A.clone().add(dir.multiplyScalar(d));
      return [mid, end];
    };
    for (const n of ['R', 'L']) {
      const pn = n; // procedural names use the same letters
      const S0 = J['sh' + n], E0 = J['el' + n], W0 = J['wr' + n], S1 = tr(S0);
      const pS = V(PJ['sh' + pn]), pE = V(PJ['e' + pn]), pH = V(PJ['h' + pn]), pS0 = V(PJ0['sh' + pn]), pH0 = V(PJ0['h' + pn]), pE0 = V(PJ0['e' + pn]);
      const kA = (S0.distanceTo(E0) + E0.distanceTo(W0)) / Math.max(1e-4, pS0.distanceTo(pE0) + pE0.distanceTo(pH0));
      const target = S1.clone().add(pH.clone().sub(pS).multiplyScalar(kA)), [E1, W1] = ik(S1, E0, W0, target, pE.clone().sub(pS));
      const qu = qn(E0.clone().sub(S0), E1.clone().sub(S1)), qf = qn(W0.clone().sub(E0), W1.clone().sub(E1));
      q.set('ua' + n, qu); o.set('ua' + n, [S0, S1]); q.set('fa' + n, qf); o.set('fa' + n, [E0, E1]); q.set('ha' + n, qf); o.set('ha' + n, [W0, W1]);
      R['hand' + n] = W1; R['handDir' + n] = W1.clone().sub(E1).normalize();
      const side = n === 'R' ? -1 : 1, H0 = J['hip' + n], K0 = J['kn' + n], A0 = J['an' + n], H1 = H0.clone().setY(H0.y + dy);
      const pHp = V(PJ['hip' + side]), pK = V(PJ['knee' + side]), pA = V(PJ['ank' + side]), pHp0 = V(PJ0['hip' + side]), pK0 = V(PJ0['knee' + side]), pA0 = V(PJ0['ank' + side]);
      const kL = (H0.distanceTo(K0) + K0.distanceTo(A0)) / Math.max(1e-4, pHp0.distanceTo(pK0) + pK0.distanceTo(pA0));
      const lt = H1.clone().add(pA.clone().sub(pHp).multiplyScalar(kL)), [K1, A1] = ik(H1, K0, A0, lt, pK.clone().sub(pHp).add(new T.Vector3(0.3, 0, 0)));
      q.set('th' + n, qn(K0.clone().sub(H0), K1.clone().sub(H1))); o.set('th' + n, [H0, H1]);
      q.set('sn' + n, qn(A0.clone().sub(K0), A1.clone().sub(K1))); o.set('sn' + n, [K0, K1]);
      q.set('ft' + n, new T.Quaternion()); o.set('ft' + n, [A0, A1]);
    }
    return { q, o, k };
  },
  // move primitives (procedural weapons) by x -> O + k * M (x - A), M mirroring z when mz = -1
  xformPrims(list, A, O, k, mz) {
    const f = (x, y, z) => [O.x + k * (x - A.x), O.y + k * (y - A.y), O.z + k * mz * (z - A.z)];
    const plane = pl => { const n = [pl[0], pl[1], pl[2] * mz]; return [n[0], n[1], n[2], k * (pl[3] - (pl[0] * A.x + pl[1] * A.y + pl[2] * A.z)) + n[0] * O.x + n[1] * O.y + n[2] * O.z]; };
    return list.map(p0 => {
      const p = Object.assign({}, p0);
      if (p.k === 0 || p.k === 1 || p.k === 4) { [p.x, p.y, p.z] = f(p.x, p.y, p.z); }
      if (p.k === 0) p.r *= k;
      if (p.k === 1) { p.a *= k; p.b *= k; p.c *= k; if (p.clip) p.clip = plane(p.clip); }
      if (p.k === 2) { [p.ax, p.ay, p.az] = f(p.ax, p.ay, p.az); [p.bx2, p.by2, p.bz2] = f(p.bx2, p.by2, p.bz2); p.r *= k; }
      if (p.k === 3) p.pl = p.pl.map(plane);
      if (p.k === 4) { p.r0 *= k; p.r1 *= k; p.h *= k; }
      [p.bx, p.by, p.bz] = f(p.bx, p.by, p.bz); p.br *= k; p.br2 = p.br * p.br;
      return p;
    });
  },
  rigGeo(d, col, frame, A, m) {
    const T = THREE, R = this.rigSetup(m, A, col), base = this.rigBase(m, A, col), bg = base.geo;
    const f = frame === 10 ? 0 : frame;
    const PP = M3.build(d, col, f, A.up || 0), PJ = PP.J, PJ0 = (m.rigP0 || (m.rigP0 = M3.build(d, col, 0, 0).J));
    if (!PJ || !PJ0) return bg;
    const pose = this.rigPose(R, PJ, PJ0), names = R.B.map(b => b[0]);
    const qs = names.map(n => pose.q.get(n)), os = names.map(n => pose.o.get(n));
    const P0 = bg.attributes.position.array, N0 = bg.attributes.normal.array, nv = P0.length / 3;
    const P1 = new Float32Array(P0.length), N1 = new Float32Array(N0.length), v = new T.Vector3(), acc = new T.Vector3(), nacc = new T.Vector3(), n = new T.Vector3();
    for (let i = 0; i < nv; i++) {
      acc.set(0, 0, 0); nacc.set(0, 0, 0);
      for (let j = 0; j < 4; j++) {
        const w = R.W4[i * 4 + j]; if (w < 1e-4) continue; const b = R.I4[i * 4 + j], [a0, a1] = os[b];
        v.set(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]).sub(a0).applyQuaternion(qs[b]).add(a1); acc.addScaledVector(v, w);
        n.set(N0[i * 3], N0[i * 3 + 1], N0[i * 3 + 2]).applyQuaternion(qs[b]); nacc.addScaledVector(n, w);
      }
      nacc.normalize(); P1[i * 3] = acc.x; P1[i * 3 + 1] = acc.y; P1[i * 3 + 2] = acc.z; N1[i * 3] = nacc.x; N1[i * 3 + 1] = nacc.y; N1[i * 3 + 2] = nacc.z;
    }
    let geo = new T.BufferGeometry(); // (clone() would deep-copy userData with its materials)
    for (const [nm, at] of Object.entries(bg.attributes)) geo.setAttribute(nm, nm === 'position' ? new T.BufferAttribute(P1, 3) : nm === 'normal' ? new T.BufferAttribute(N1, 3) : at);
    geo.setIndex(bg.index); for (const g of bg.groups) geo.addGroup(g.start, g.count, g.materialIndex); geo.userData.mats = bg.userData.mats;
    // the procedural weapon (right hand, or the bow / staff in the left) and shield follow the new hands
    if (PP.wIdx !== undefined) {
      const k = pose.k * (A.propScale || 1), mz = -R.rs, V = a => new T.Vector3(a[0], a[1], a[2]);
      const pR = V(PJ.hR), pL = V(PJ.hL), wR = R.handR, wL = R.handL, list = PP.slice(PP.wIdx);
      const nearL = p => { const c = p.k === 2 ? [(p.ax + p.bx2) / 2, (p.ay + p.by2) / 2, (p.az + p.bz2) / 2] : [p.bx, p.by, p.bz]; return Math.hypot(c[0] - pL.x, c[1] - pL.y, c[2] - pL.z) < Math.hypot(c[0] - pR.x, c[1] - pR.y, c[2] - pR.z); };
      const left = [], right = []; list.forEach((p, i) => ((PP.wIdx + i >= PP.sIdx || nearL(p)) ? left : right).push(p));
      const prims = this.xformPrims(right, pR, wR, k, mz).concat(this.xformPrims(left, pL, wL, k, mz));
      if (prims.length) geo = this.mergeGeo(geo, G3.build(prims, { metres: true, hi: true }));
    }
    if (frame === 10) { // fallen: lying on the back
      const pa = geo.attributes.position.array, na = geo.attributes.normal.array, c = Math.cos(-1.5), s = Math.sin(-1.5);
      for (let i = 0; i < pa.length; i += 3) { const x = pa[i], y = pa[i + 1]; pa[i] = x * c - y * s; pa[i + 1] = x * s + y * c + 0.1; const nx = na[i], ny = na[i + 1]; na[i] = nx * c - ny * s; na[i + 1] = nx * s + ny * c; }
    }
    geo.computeBoundingSphere();
    return geo;
  },
  // append a G3 geometry (groups 0-2, no UVs) to a posed model geometry
  mergeGeo(a, b) {
    const T = THREE, na = a.attributes.position.count, nb = b.attributes.position.count, out = new T.BufferGeometry();
    for (const [name, size] of [['position', 3], ['normal', 3], ['color', 3], ['patd', 2], ['uv', 2]]) {
      if (!a.attributes[name] && !b.attributes[name]) continue;
      const arr = new Float32Array((na + nb) * size), A0 = a.attributes[name], B0 = b.attributes[name];
      if (A0) arr.set(A0.array.subarray(0, na * size), 0); else if (name === 'color') arr.fill(1, 0, na * size);
      if (B0) arr.set(B0.array.subarray(0, nb * size), na * size);
      out.setAttribute(name, new T.BufferAttribute(arr, size));
    }
    const ia = a.index.array, ib = b.index.array, idx = new Uint32Array(ia.length + ib.length); idx.set(ia, 0); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + na;
    out.setIndex(new T.BufferAttribute(idx, 1));
    for (const g of a.groups) out.addGroup(g.start, g.count, g.materialIndex);
    for (const g of b.groups) out.addGroup(ia.length + g.start, g.count, g.materialIndex);
    out.userData.mats = a.userData.mats;
    return out;
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
