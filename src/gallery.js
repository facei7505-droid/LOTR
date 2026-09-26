// ================= GALLERY: every hero, soldier and building of the six peoples on a turntable =================
// Uses the game's own model builders (M3 / B3 / glTF assets) and materials, so what you see here is what marches on the map.
(() => {
  const $ = id => document.getElementById(id);
  if (!window.THREE || !hasWebGL()) { const e = $('err'); e.hidden = false; e.textContent = 'Для галереи нужен WebGL и доступ к cdn.jsdelivr.net.'; return; }
  const T = THREE, cv = $('view');
  const gl = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); gl.outputColorSpace = T.SRGBColorSpace; gl.toneMapping = T.ACESFilmicToneMapping; gl.toneMappingExposure = 1.05;
  gl.shadowMap.enabled = true; gl.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene(), cam = new T.PerspectiveCamera(32, 1, 1, 6000);
  // studio sky for reflections: warm key from the upper left, cool sky above, dark earth below
  const env = new T.Scene(), skyM = new T.ShaderMaterial({ side: T.BackSide, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ vec3 d = normalize(vP); float h = d.y; vec3 c = mix(vec3(0.12,0.1,0.08), vec3(0.55,0.62,0.74), smoothstep(-0.25, 0.9, h)); c += vec3(3.2,2.7,2.1) * pow(max(0.0, dot(d, normalize(vec3(-0.6,0.65,0.45)))), 18.0); c += vec3(0.6,0.75,1.1) * pow(max(0.0, dot(d, normalize(vec3(0.7,0.3,-0.6)))), 8.0); gl_FragColor = vec4(c, 1.0); }' });
  env.add(new T.Mesh(new T.SphereGeometry(10, 48, 24), skyM));
  const pm = new T.PMREMGenerator(gl); scene.environment = pm.fromScene(env, 0.03).texture;
  // backdrop: a dim vignette
  const bgc = mkCanvas(512, 512), bx = bgc.getContext('2d'), bgG = bx.createRadialGradient(256, 220, 20, 256, 256, 380);
  bgG.addColorStop(0, '#3a3a30'); bgG.addColorStop(0.55, '#1c1e17'); bgG.addColorStop(1, '#0b0c09'); bx.fillStyle = bgG; bx.fillRect(0, 0, 512, 512);
  const bgT = new T.CanvasTexture(bgc); bgT.colorSpace = T.SRGBColorSpace; scene.background = bgT;
  // lights: key, rim, fill
  const hemi = new T.HemisphereLight(0xcfd8e8, 0x3a3024, 0.55); scene.add(hemi);
  const key = new T.DirectionalLight(0xffe2bc, 2.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6; scene.add(key, key.target);
  const rim = new T.DirectionalLight(0x9cc0ff, 1.5); scene.add(rim);
  const fill = new T.DirectionalLight(0xffd0a0, 0.35); scene.add(fill);
  // the game's own unit materials (photo detail patterns included) through a stand-in renderer
  const ctx = Object.create(Renderer3D.prototype);
  ctx.uTime = { value: 0 }; ctx.atlas = new T.CanvasTexture(detailAtlas()); ctx.atlas.wrapS = ctx.atlas.wrapT = T.ClampToEdgeWrapping; ctx.atlas.colorSpace = T.NoColorSpace;
  ctx.fogU = { tex: { value: null }, on: { value: 0 }, map: { value: new T.Vector2(MAP_W, MAP_H) } }; ctx.geos = new Map();
  const MATS = ctx.makeMats3(); try { ctx.loadAtlasPhotos(); } catch (e) {}
  A3.baseMats = MATS.unit;
  const wire = new T.MeshBasicMaterial({ color: 0xe8c890, wireframe: true, transparent: true, opacity: 0.35 });
  // floor + stone pedestal
  const flc = mkCanvas(256, 256), fx = flc.getContext('2d'), fg = fx.createRadialGradient(128, 128, 0, 128, 128, 128);
  fg.addColorStop(0, 'rgba(70,64,52,1)'); fg.addColorStop(0.6, 'rgba(34,32,26,.9)'); fg.addColorStop(1, 'rgba(12,12,10,0)'); fx.fillStyle = fg; fx.fillRect(0, 0, 256, 256);
  const flT = new T.CanvasTexture(flc); flT.colorSpace = T.SRGBColorSpace;
  const floor = new T.Mesh(new T.CircleGeometry(1, 64), new T.MeshStandardMaterial({ map: flT, color: 0x2c2a26, transparent: true, roughness: 1, envMapIntensity: 0.15, depthWrite: false })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const { MAT, frus } = R3;
  const pedGeo = G3.build([frus(0, -0.16, 0, 1, 0.94, 0.16, MAT('#77705f', { pat: 'rock' })), frus(0, -0.22, 0, 1.06, 1.04, 0.06, MAT('#5a5448', { pat: 'rock' }))], { seg: 40, hi: true });
  const ped = new T.Mesh(pedGeo, MATS.unit); ped.receiveShadow = true; ped.castShadow = true; scene.add(ped);
  let model = null;

  // ---- catalogue ----
  const ORDER_U = ['worker', 'inf', 'spear', 'arch', 'cav', 'siege'], ORDER_B = ['fort', 'farm', 'barr', 'range', 'stable', 'forge', 'tower', 'wall', 'gate'];
  const TABS = RACE_KEYS.map(rk => ({ k: rk, name: RACES[rk].short || RACES[rk].name })).concat([{ k: 'wild', name: 'Дикие и призванные' }]);
  const CATS = [{ k: 'heroes', name: 'Герои' }, { k: 'units', name: 'Войска' }, { k: 'blds', name: 'Здания' }];
  function list(race, cat) {
    if (race === 'wild') return Object.keys(CREEPS).concat(Object.keys(SUMMONS)).map(k => DEF[k]).filter(Boolean);
    if (cat === 'heroes') return ['h1', 'h2'].map(h => DEF[race + '_' + h]).filter(Boolean);
    if (cat === 'units') return ORDER_U.map(u => DEF[race + '_' + u]).filter(Boolean);
    return ORDER_B.map(b => DEF[race + '_' + b]).filter(Boolean);
  }
  const S = { race: 'hum', cat: 'heroes', d: null, col: TEAM_COLORS[0], up: 0, anim: 'idle', spin: true, wire: false, hi: true };
  M3.setDetail(true);
  const h0 = decodeURIComponent(location.hash.slice(1)); if (DEF[h0]) { const d = DEF[h0]; S.race = d.creep || d.summon ? 'wild' : d.race; S.cat = d.hero ? 'heroes' : d.kind === 'b' ? 'blds' : 'units'; S.d = d; }

  // ---- thumbnails (baked lazily with the portrait ray-caster) ----
  const thumbs = new Map(), thumbQ = [];
  function thumb(d) {
    const k = d.key + S.col; if (thumbs.has(k)) return thumbs.get(k);
    thumbs.set(k, ''); thumbQ.push([d, S.col, k]); return '';
  }
  function pumpThumbs() {
    const t0 = performance.now();
    while (thumbQ.length && performance.now() - t0 < 30) {
      const [d, col, k] = thumbQ.shift(); let url = '';
      try {
        if (d.kind === 'b') { const spr = bld3(d, col, true), c = mkCanvas(96, 96), x = c.getContext('2d'), s = Math.min(92 / spr.w, 92 / spr.h); x.drawImage(spr.cv, 48 - spr.w * s / 2, 94 - spr.h * s, spr.w * s, spr.h * s); url = c.toDataURL(); }
        else url = icon3(d, col).toDataURL();
      } catch (e) {}
      thumbs.set(k, url); const img = document.querySelector('.th[data-k="' + d.key + '"] img'); if (img && url) img.src = url;
    }
  }

  // ---- geometry per frame ----
  const geoCache = new Map();
  function geoFor(d, frame) {
    const k = d.key + S.col + '|' + frame + '|' + S.up + '|' + S.hi; let g = geoCache.get(k); if (g) return g;
    if (d.kind === 'b') g = ctx.bldGeo(d, S.col);
    else g = (A3.has(d.key) && A3.unitGeo(d, S.col, frame)) || G3.build(M3.build(d, S.col, frame, S.up), { metres: true, hi: S.hi });
    geoCache.set(k, g); return g;
  }
  const SEQ = { idle: [0], walk: [1, 11, 2, 12, 3, 13, 4, 14, 5, 15, 6, 16], atk: [0, 7, 7, 8, 9, 9, 0, 0], death: [0, 10] }, FPS = { idle: 1, walk: 11, atk: 7, death: 2 };
  let animT = 0, frameNow = -1, fit = { r: 40, cy: 20 };
  function setModel() {
    const d = S.d; if (!d) return;
    const seq = d.kind === 'b' ? [0] : SEQ[S.anim], f = seq[Math.floor(animT * FPS[S.anim]) % seq.length], stop = S.anim === 'death' && animT * FPS.death >= 1 ? 10 : f;
    if (stop === frameNow && model) return; frameNow = stop;
    const g = geoFor(d, stop);
    const mm = S.wire ? wire : g.userData.mats || MATS.unit;
    if (!model) { model = new T.Mesh(g, mm); model.castShadow = true; model.receiveShadow = true; scene.add(model); }
    else { model.geometry = g; model.material = mm; }
  }
  function frameModel() {
    const d = S.d; animT = 0; frameNow = -1; setModel();
    const g = geoFor(d, 0); g.computeBoundingBox(); const bb = g.boundingBox, sz = new T.Vector3(); bb.getSize(sz);
    const r = Math.max(sz.x, sz.z) * 0.5, hgt = Math.max(bb.max.y, 1);
    fit = { r: Math.max(r, hgt * 0.5), cy: hgt * 0.45, top: hgt };
    const pr = d.kind === 'b' ? r * 1.1 : Math.max(r * 1.3, hgt * 0.42); ped.scale.set(pr, d.kind === 'b' ? pr * 0.25 : pr * 0.35, pr); ped.position.y = 0;
    floor.scale.setScalar(pr * 7); floor.position.y = -0.24 * ped.scale.y;
    if (d.kind === 'b') { ped.visible = false; floor.position.y = -14; } else ped.visible = true;
    orbit.dist = Math.max(fit.r, fit.top * 0.62) / Math.tan(cam.fov * Math.PI / 360) * 1.4; orbit.min = orbit.dist * 0.35; orbit.max = orbit.dist * 3;
    const L = Math.max(fit.r, fit.top) * 2.2; key.position.set(-L * 0.9, L * 1.1, L * 0.8); key.target.position.set(0, fit.cy, 0);
    const sc = key.shadow.camera; sc.left = sc.bottom = -L * 0.8; sc.right = sc.top = L * 0.8; sc.near = L * 0.2; sc.far = L * 4; sc.updateProjectionMatrix();
    rim.position.set(L, L * 0.6, -L); fill.position.set(L * 0.8, L * 0.2, L);
    info(); location.replace('#' + d.key);
  }

  // ---- orbit camera: drag to turn, wheel / pinch to zoom ----
  const orbit = { yaw: 0.55, pitch: 0.22, dist: 150, min: 40, max: 600 };
  const ptr = new Map(); let pinch0 = 0, lastTouch = 0;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId, [e.clientX, e.clientY]); lastTouch = performance.now(); if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  cv.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p) return;
    if (ptr.size === 1) { orbit.yaw -= (e.clientX - p[0]) * 0.008; orbit.pitch = clamp(orbit.pitch + (e.clientY - p[1]) * 0.006, -0.15, 1.3); lastTouch = performance.now(); }
    p[0] = e.clientX; p[1] = e.clientY;
    if (ptr.size === 2) { const [a, b] = [...ptr.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0) orbit.dist = clamp(orbit.dist * pinch0 / dd, orbit.min, orbit.max); pinch0 = dd; }
  });
  const up = e => { ptr.delete(e.pointerId); pinch0 = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.001), orbit.min, orbit.max); }, { passive: false });

  // ---- UI ----
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function bars() {
    $('races').innerHTML = '<a id="home" href="index.html">← В игру</a>' + TABS.map(t => '<button class="chip' + (S.race === t.k ? ' on' : '') + '" data-race="' + t.k + '">' + esc(t.name) + '</button>').join('');
    $('cats').innerHTML = S.race === 'wild' ? '' : CATS.map(c => '<button class="chip' + (S.cat === c.k ? ' on' : '') + '" data-cat="' + c.k + '">' + c.name + '</button>').join('');
    const L = list(S.race, S.cat); if (!S.d || !L.includes(S.d)) S.d = L[0];
    $('strip').innerHTML = L.map(d => '<button class="th' + (d === S.d ? ' on' : '') + '" data-k="' + d.key + '"><img alt="" src="' + (thumb(d) || 'data:image/gif;base64,R0lGODlhAQABAAAAACw=') + '"><span>' + esc(d.hero ? d.heroName || d.name : d.name) + '</span></button>').join('');
    ctlBar(); frameModel();
  }
  function ctlBar() {
    const d = S.d, isU = d && d.kind !== 'b';
    $('anim').hidden = !isU;
    $('anim').innerHTML = [['idle', 'Стойка'], ['walk', 'Шаг'], ['atk', 'Удар'], ['death', 'Гибель']].map(([k, n]) => '<button data-anim="' + k + '" class="' + (S.anim === k ? 'on' : '') + '">' + n + '</button>').join('');
    const canUp = isU && !d.hero && !d.worker && !d.creep && !d.summon && d.sub !== 'siege';
    $('ups').hidden = !canUp;
    $('ups').innerHTML = '<button data-up="1" class="' + (S.up & 1 ? 'on' : '') + '">Кованые клинки</button><button data-up="2" class="' + (S.up & 2 ? 'on' : '') + '">Тяжёлая броня</button>';
    $('cols').innerHTML = TEAM_COLORS.slice(0, 6).map(c => '<button class="sw' + (S.col === c ? ' on' : '') + '" data-col="' + c + '" style="background:' + c + '" aria-label="Цвет ' + c + '"></button>').join('');
    $('view3').innerHTML = '<button data-v="spin" class="' + (S.spin ? 'on' : '') + '">Вращение</button><button data-v="wire" class="' + (S.wire ? 'on' : '') + '">Каркас</button><button data-v="hi" class="' + (S.hi ? 'on' : '') + '">Детали</button>';
  }
  function info() {
    const d = S.d, g = geoFor(d, 0), tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const race = RACES[d.race] ? RACES[d.race].name : '';
    let st = '';
    if (d.kind === 'b') st = '<div><span>Прочность</span> <b>' + d.hp + '</b></div><div><span>Броня</span> <b>' + Math.round((d.armor || 0) * 100) + '%</b></div><div><span>Цена</span> <b>' + (d.cost || '—') + '</b></div>';
    else st = '<div><span>Здоровье</span> <b>' + d.hp + '</b></div><div><span>Урон</span> <b>' + d.dmg + '</b></div><div><span>Броня</span> <b>' + Math.round((d.armor || 0) * 100) + '%</b></div>' +
      '<div><span>Скорость</span> <b>' + d.speed + '</b></div><div><span>Дальность</span> <b>' + d.range + '</b></div><div><span>' + (d.n > 1 ? 'Отряд' : 'Цена') + '</span> <b>' + (d.n > 1 ? '×' + d.n : d.cost || '—') + '</b></div>';
    const trains = d.trains ? '<div class="sub">Нанимает: ' + d.trains.map(k => k === 'hero' ? 'героев' : DEF[k] ? DEF[k].name : k).join(', ') + '</div>' : '';
    $('info').innerHTML = '<h1>' + esc(d.hero ? d.heroName || d.name : d.name) + '</h1><div class="sub">' + esc((d.hero ? d.name + ' · ' : '') + race) + '</div><div class="st">' + st + '</div>' + trains +
      '<div class="tech">' + (A3.has(d.key) ? 'glTF-модель · ' : 'процедурная модель · ') + Math.round(tris).toLocaleString('ru') + ' треугольников</div>';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const ds = b.dataset;
    if (ds.race) { S.race = ds.race; if (S.race !== 'wild') A3.need([S.race]); if (S.race === 'wild') S.cat = 'wild'; else if (S.cat === 'wild') S.cat = 'heroes'; S.d = null; bars(); }
    else if (ds.cat) { S.cat = ds.cat; S.d = null; bars(); }
    else if (ds.k) { S.d = DEF[ds.k]; document.querySelectorAll('.th').forEach(t => t.classList.toggle('on', t.dataset.k === ds.k)); ctlBar(); frameModel(); }
    else if (ds.anim) { S.anim = ds.anim; animT = 0; frameNow = -1; ctlBar(); }
    else if (ds.up) { S.up ^= +ds.up; frameNow = -1; ctlBar(); info(); }
    else if (ds.col) { S.col = ds.col; frameNow = -1; bars(); }
    else if (ds.v === 'spin') { S.spin = !S.spin; ctlBar(); }
    else if (ds.v === 'hi') { S.hi = !S.hi; M3.setDetail(S.hi); geoCache.clear(); thumbs.clear(); frameNow = -1; bars(); }
    else if (ds.v === 'wire') { S.wire = !S.wire; frameNow = -1; ctlBar(); }
  });
  window.addEventListener('keydown', e => {
    const L = list(S.race, S.cat), i = L.indexOf(S.d);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { S.d = L[(i + (e.key === 'ArrowRight' ? 1 : L.length - 1)) % L.length]; document.querySelectorAll('.th').forEach(t => t.classList.toggle('on', t.dataset.k === S.d.key)); ctlBar(); frameModel(); }
  });

  // ---- loop ----
  function resize() { const w = window.innerWidth, h = window.innerHeight; gl.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  window.addEventListener('resize', resize); resize();
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    ctx.uTime.value += dt; animT += dt;
    if (S.spin && performance.now() - lastTouch > 2500) orbit.yaw += dt * 0.35;
    setModel();
    const cy = fit.cy, cp = Math.cos(orbit.pitch);
    cam.position.set(Math.sin(orbit.yaw) * cp * orbit.dist, cy + Math.sin(orbit.pitch) * orbit.dist, Math.cos(orbit.yaw) * cp * orbit.dist); cam.lookAt(0, cy, 0);
    cam.near = orbit.dist * 0.05; cam.far = orbit.dist * 20; cam.updateProjectionMatrix();
    pumpThumbs(); gl.render(scene, cam); requestAnimationFrame(loop);
  }
  A3.onReady = () => { geoCache.clear(); frameNow = -1; if (S.d) frameModel(); };
  A3.need([S.race]);
  bars(); requestAnimationFrame(loop);
})();
