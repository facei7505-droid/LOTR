// ================= MODELS: 3D figures (metres) for R3; sprites for 8 facings × 11 frames are baked lazily =================
let M3R = null;
const M3 = (() => {
  const { MAT, sph, ell, cap, frus } = R3;
  const RACE3 = M3R = {
    hum: { skin: '#b3876a', steel: '#9ca3aa', cloth: '#4e4234', leather: '#4a3222', legs: '#3e3a36', hair: '#3a2618', S: 1, B: 1, hunch: 0 },
    elf: { skin: '#cfae90', steel: '#b39a5e', cloth: '#3d4f37', leather: '#5a4630', legs: '#4a5040', hair: '#d6c48a', S: 1.06, B: 0.9, hunch: 0 },
    dwf: { skin: '#aa7a5c', steel: '#7c8288', cloth: '#5a2e22', leather: '#3e2a1e', legs: '#4a3a30', hair: '#7a3e1c', S: 0.76, B: 1.32, hunch: 0 },
    orc: { skin: '#5a6640', steel: '#4f4a44', cloth: '#3a2e26', leather: '#2e2218', legs: '#2e2822', hair: '#141210', S: 1.0, B: 1.18, hunch: 0.09 },
    und: { skin: '#d3ccb2', steel: '#56585c', cloth: '#26262c', leather: '#2e2620', legs: '#c9c2a6', hair: '#1a1a1a', S: 1.0, B: 0.8, hunch: 0.07 },
    des: { skin: '#8d5c3c', steel: '#c29a45', cloth: '#e6dcc2', leather: '#6a4a2a', legs: '#8d5c3c', hair: '#141010', S: 1.02, B: 0.95, hunch: 0 },
  };
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const teamCol = hexc => mixc(R3.hex(hexc), [0.42, 0.4, 0.38], 0.28).map(v => v * 0.86);
  const add3 = (a, b, k) => [a[0] + b[0] * (k === undefined ? 1 : k), a[1] + b[1] * (k === undefined ? 1 : k), a[2] + b[2] * (k === undefined ? 1 : k)];
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  // unit look per race and type (weapon, shield, helmet, armour)
  const LOOK = {
    hum: { inf: { w: 'sword', sh: 'kite', helm: 'kettle', arm: 'mail' }, spear: { w: 'spear', sh: 'kite', helm: 'kettle', arm: 'mail' }, arch: { w: 'bow', helm: 'hood', arm: 'leather', quiver: 1 }, cav: { w: 'spear', sh: 'kite', helm: 'great', arm: 'mail' }, worker: { w: 'hammer', helm: 'cap', arm: 'apron' } },
    elf: { inf: { w: 'sword', sh: 'leaf', helm: 'elf', arm: 'scale' }, spear: { w: 'spear', sh: 'leaf', helm: 'elf', arm: 'scale' }, arch: { w: 'bow', helm: 'none', arm: 'leather', quiver: 1 }, cav: { w: 'spear', helm: 'elf', arm: 'scale' }, worker: { w: 'hammer', helm: 'none', arm: 'apron' } },
    dwf: { inf: { w: 'axe', sh: 'round', helm: 'dwarf', arm: 'mail' }, spear: { w: 'halberd', helm: 'dwarf', arm: 'mail' }, arch: { w: 'xbow', helm: 'dwarf', arm: 'mail' }, cav: { w: 'axe', helm: 'dwarf', arm: 'mail' }, worker: { w: 'hammer', helm: 'cap', arm: 'apron' } },
    orc: { inf: { w: 'cleaver', sh: 'orc', helm: 'orc', arm: 'rags' }, spear: { w: 'spear', sh: 'orc', helm: 'orc', arm: 'rags' }, arch: { w: 'javelin', helm: 'none', arm: 'rags' }, cav: { w: 'cleaver', helm: 'orc', arm: 'rags' }, worker: { w: 'club', helm: 'none', arm: 'rags' } },
    und: { inf: { w: 'sword', sh: 'round', helm: 'skull', arm: 'mail' }, spear: { w: 'spear', sh: 'round', helm: 'kettle', arm: 'rags' }, arch: { w: 'bow', helm: 'hood', hood: '#26262c', arm: 'rags', quiver: 1 }, cav: { w: 'sword', sh: 'kite', helm: 'great', arm: 'plate', steel: '#43464b' }, worker: { w: 'club', helm: 'skull', arm: 'rags' } },
    des: { inf: { w: 'khopesh', sh: 'oval', helm: 'nemes', arm: 'linen' }, spear: { w: 'spear', sh: 'oval', helm: 'nemes', arm: 'bronze' }, arch: { w: 'bow', helm: 'band', arm: 'linen', quiver: 1 }, cav: { w: 'spear', helm: 'nemes', arm: 'bronze' }, worker: { w: 'hammer', helm: 'band', arm: 'linen' } },
  };
  const HERO3 = {
    hum_h1: { w: 'bigsword', sh: 'kite', helm: 'crown', arm: 'plate', cape: '#6d1f1f', S: 1.1, steel: '#c4cad0', gold: 1 },
    hum_h2: { w: 'banner', helm: 'none', hair: '#6b3f22', arm: 'plate', steel: '#d6dbe0', cape: '#e8e4dc', S: 1.02 },
    elf_h1: { w: 'spear', sh: 'leaf', helm: 'none', hair: '#a8442a', arm: 'scale', cape: '#2e5d3a', S: 1.08 },
    elf_h2: { w: 'bow', helm: 'none', hair: '#ece4ca', robe: '#d9d6c8', cape: '#9bb0c8', S: 1.05, quiver: 1 },
    dwf_h1: { w: 'hammer', helm: 'winged', arm: 'plate', beard: '#b04a1e', cape: '#8a1c16', S: 0.86, glow: '#9fd0ff' },
    dwf_h2: { w: 'staff', helm: 'none', hair: '#f0c060', robe: '#6e4a7a', cape: '#d9c38a', S: 0.84, orb: '#ffb86a' },
    orc_h1: { w: 'spear', sh: 'round', helm: 'crest', arm: 'bronze', skin: '#b98d6c', cape: '#7a1414', S: 1.12, human: 1 },
    orc_h2: { w: 'staff', helm: 'crown', skin: '#c9c7b4', robe: '#1e1b22', cape: '#101014', S: 1.1, orb: '#8dff9a', human: 1 },
    und_h1: { w: 'bigsword', sh: 'kite', helm: 'great', arm: 'plate', steel: '#3c3f44', cape: '#2a0d10', S: 1.12, glow: '#7dff9a' },
    und_h2: { w: 'staff', helm: 'crown', skin: '#d8d4cc', hair: '#e8e8e0', robe: '#1b2a26', cape: '#0e1614', S: 1.06, orb: '#7dffb0', human: 1, deadEyes: 1 },
    des_h1: { w: 'khopesh', helm: 'jackal', arm: 'bronze', skin: '#1f1b1a', cape: '#2a4f8a', S: 1.2, human: 1, gold: 1 },
    des_h2: { w: 'staff', helm: 'nemes', robe: '#efe6cf', cape: '#2f6aa3', S: 1.04, orb: '#ffe28a', human: 1 },
  };
  // ---------- humanoid ----------
  function human(o, pose, P) {
    const R = RACE3[o.race] || RACE3.hum, S = (o.S || 1) * R.S, B = (o.B || 1) * R.B;
    const skin = MAT(o.skin || (o.human ? '#c99a7a' : R.skin), { pat: 'skin', spec: 0.08, shin: 10 });
    const steelHex = o.steel || R.steel;
    const armour = { mail: MAT(steelHex, { pat: 'mail', spec: 0.55, shin: 26 }), plate: MAT(steelHex, { pat: 'metal', spec: 1.1, shin: 48 }), scale: MAT(steelHex, { pat: 'mail', spec: 0.8, shin: 34 }), bronze: MAT('#a67c3e', { pat: 'metal', spec: 0.9, shin: 40 }),
      leather: MAT(R.leather, { pat: 'leather', spec: 0.12, shin: 14 }), apron: MAT('#5a4028', { pat: 'leather', spec: 0.1 }), rags: MAT(R.cloth, { pat: 'cloth' }), linen: MAT('#e8dfc6', { pat: 'cloth' }) }[o.arm || 'mail'];
    const steel = MAT(steelHex, { pat: 'metal', spec: 1.0, shin: 44 }), gold = MAT('#c9a04a', { pat: 'metal', spec: 1.1, shin: 40 });
    const cloth = MAT(R.cloth, { pat: 'cloth' }), leather = MAT(R.leather, { pat: 'leather', spec: 0.1 }), legsM = MAT(R.legs, { pat: 'cloth' });
    const team = MAT(o.team, { pat: 'cloth' }), wood = MAT('#6b4a2e', { pat: 'wood', ns: 30 });
    const base = pose.seated ? (pose.seatY !== undefined ? pose.seatY : 0.78) : 0, lean = (R.hunch || 0) + (pose.atk > 0.5 ? 0.08 : 0);
    const walking = pose.walk !== undefined && pose.walk !== null;
    const ph = pose.walk || 0, swing = walking ? Math.sin(ph) * 0.5 : 0, bob = walking ? Math.abs(Math.cos(ph)) * 0.03 : 0;
    const hipY = base + 0.93 * S + bob;
    // legs
    if (!o.robe || walking) for (const side of [1, -1]) {
      const zz = 0.1 * B * side, hip = [0, hipY, zz];
      let knee, ank;
      if (pose.seated) { knee = [0.28, base + 0.62 * S, zz * 3.2]; ank = [0.12, base + 0.25 * S, zz * 3.1]; }
      else {
        const a = swing * side, bend = walking ? Math.max(0, Math.sin(ph * side + 1.3)) * 0.8 : 0.06;
        knee = add3(hip, [Math.sin(a) * 0.44 * S, -Math.cos(a) * 0.44 * S, 0]);
        ank = add3(knee, [Math.sin(a - bend) * 0.44 * S, -Math.cos(a - bend) * 0.44 * S, 0]);
      }
      P.push(cap(hip, knee, 0.075 * B, o.robe ? MAT(o.robe, { pat: 'cloth' }) : legsM), cap(knee, ank, 0.06 * B, o.arm === 'plate' ? steel : legsM));
      P.push(ell(ank[0] + 0.05, ank[1] - 0.02, ank[2], 0.12 * B, 0.055, 0.06 * B, leather));
    }
    // robe for casters
    if (o.robe) P.push(frus(0, base + 0.04, 0, 0.3 * B, 0.15 * B, 0.98 * S, MAT(o.robe, { pat: 'cloth' })));
    // torso
    const ch = [lean * 0.3, base + 1.24 * S, 0], hd = [0.02 + lean * 0.55, base + 1.645 * S, 0];
    P.push(ell(0, base + 0.99 * S, 0, 0.13 * B, 0.13 * S, 0.17 * B, o.robe ? MAT(o.robe, { pat: 'cloth' }) : cloth));
    P.push(ell(ch[0], ch[1], ch[2], 0.15 * B, 0.27 * S, 0.2 * B, o.robe ? MAT(o.robe, { pat: 'cloth' }) : armour));
    if (!o.robe && o.arm !== 'apron') P.push(ell(0.03 + lean * 0.2, base + 1.02 * S, 0, 0.165 * B, 0.36 * S, 0.19 * B, team, [-1, 0, 0, -0.02]));
    if (o.arm === 'apron') P.push(ell(0.04, base + 1.02 * S, 0, 0.16 * B, 0.34 * S, 0.18 * B, armour, [-1, 0, 0, -0.02]));
    P.push(ell(0, base + 1.0 * S, 0, 0.15 * B, 0.028 * S, 0.185 * B, leather));
    if (o.arm === 'plate' || o.arm === 'bronze') P.push(ell(ch[0] + 0.02, ch[1] + 0.03, 0, 0.16 * B, 0.2 * S, 0.21 * B, o.arm === 'bronze' ? armour : steel, [-1, 0, 0, 0.02]));
    if (o.cape) P.push(ell(-0.16 * B + lean * 0.2, base + 1.02 * S, 0, 0.05, 0.5 * S, 0.24 * B, MAT(o.cape, { pat: 'cloth' })));
    if (o.quiver) { P.push(cap([-0.16, base + 1.05 * S, -0.06], [-0.2, base + 1.5 * S, 0.06], 0.05, leather)); P.push(sph(-0.21, base + 1.55 * S, 0.07, 0.035, MAT('#e0dccf'))); }
    // shoulders, neck, head
    const light = o.arm === 'leather' || o.arm === 'rags' || o.arm === 'apron' || o.arm === 'linen';
    const pad = o.arm === 'plate' || o.arm === 'bronze' ? 0.1 : light ? 0.06 : 0.08;
    for (const side of [1, -1]) P.push(sph(ch[0] * 0.5, base + 1.42 * S, 0.2 * B * side, pad * B, o.arm === 'linen' ? skin : light ? cloth : o.arm === 'bronze' ? armour : steel));
    if (o.race === 'des' && !o.robe) P.push(ell(ch[0] + 0.02, base + 1.38 * S, 0, 0.17 * B, 0.07 * S, 0.24 * B, MAT('#c9a04a', { pat: 'metal', spec: 0.9, shin: 36 }), [0, -1, 0, -(base + 1.33 * S)])); // broad collar
    P.push(cap([hd[0] * 0.6, base + 1.46 * S, 0], [hd[0], base + 1.56 * S, 0], 0.05 * B, skin));
    const hr = 0.105 * (0.85 + 0.15 * S);
    P.push(sph(hd[0], hd[1], hd[2], hr, skin));
    const hair = MAT(o.hair || R.hair, { pat: 'fur', spec: 0.15 });
    P.push(sph(hd[0] + hr * 0.95, hd[1] - 0.012, 0, hr * 0.2, skin));
    const deadEye = (o.race === 'und' && !o.human) || o.deadEyes;
    for (const s2 of [1, -1]) P.push(sph(hd[0] + hr * 0.82, hd[1] + 0.012, s2 * hr * 0.38, hr * (deadEye ? 0.17 : 0.13), MAT(deadEye ? '#7dff9a' : o.race === 'orc' && !o.human ? '#c83a1a' : '#1a120c', { emit: deadEye ? 1.2 : o.race === 'orc' && !o.human ? 0.5 : 0 })));
    if (o.race === 'und' && !o.human) P.push(ell(hd[0] + hr * 0.75, hd[1] - hr * 0.62, 0, hr * 0.42, hr * 0.28, hr * 0.62, skin)); // bony jaw
    if (o.race === 'orc' && !o.human) for (const s2 of [1, -1]) P.push(cap([hd[0] + hr * 0.8, hd[1] - hr * 0.55, s2 * hr * 0.35], [hd[0] + hr * 0.95, hd[1] - hr * 0.2, s2 * hr * 0.4], 0.012, MAT('#e2d8c0')));
    switch (o.helm) {
      case 'kettle': P.push(ell(hd[0], hd[1] + 0.015, 0, hr * 1.12, hr * 1.02, hr * 1.12, steel, [0, -1, 0, -(hd[1] - 0.01)]), ell(hd[0], hd[1] - 0.005, 0, hr * 1.45, 0.016, hr * 1.45, steel)); break;
      case 'great': P.push(ell(hd[0], hd[1] + 0.005, 0, hr * 1.15, hr * 1.2, hr * 1.12, steel), cap([hd[0] + hr * 1.05, hd[1] + 0.01, -hr * 0.6], [hd[0] + hr * 1.05, hd[1] + 0.01, hr * 0.6], 0.012, MAT('#111'))); break;
      case 'elf': P.push(ell(hd[0] - 0.01, hd[1] + 0.03, 0, hr * 1.1, hr * 1.25, hr * 1.05, gold, [0, -1, 0, -(hd[1] - 0.02)]), cap([hd[0] - 0.02, hd[1] + hr * 1.2, 0], [hd[0] - 0.16, hd[1] + hr * 1.6, 0], 0.014, gold)); break;
      case 'dwarf': P.push(ell(hd[0], hd[1] + 0.02, 0, hr * 1.18, hr * 1.1, hr * 1.18, steel, [0, -1, 0, -(hd[1] - 0.01)]), sph(hd[0], hd[1] + hr * 1.15, 0, 0.022, steel)); break;
      case 'winged': P.push(ell(hd[0], hd[1] + 0.02, 0, hr * 1.18, hr * 1.1, hr * 1.18, steel, [0, -1, 0, -(hd[1] - 0.01)])); for (const s2 of [1, -1]) P.push(cap([hd[0] - 0.02, hd[1] + 0.05, s2 * hr], [hd[0] - 0.1, hd[1] + 0.2, s2 * hr * 1.9], 0.02, MAT('#e8e2d6'))); break;
      case 'orc': P.push(ell(hd[0], hd[1] + 0.02, 0, hr * 1.2, hr * 1.1, hr * 1.2, steel, [0, -1, 0, -(hd[1] - 0.02)])); for (const k of [-1, 0, 1]) P.push(cap([hd[0] + k * 0.04, hd[1] + hr, 0], [hd[0] + k * 0.05, hd[1] + hr + 0.09, 0], 0.012, steel)); break;
      case 'crest': P.push(ell(hd[0], hd[1] + 0.02, 0, hr * 1.18, hr * 1.12, hr * 1.18, armour, [0, -1, 0, -(hd[1] - 0.03)]), ell(hd[0] - 0.02, hd[1] + hr * 1.2, 0, hr * 1.1, hr * 0.5, 0.025, MAT('#8a1c14', { pat: 'fur' }))); break;
      case 'crown': P.push(ell(hd[0] - 0.02, hd[1], 0, hr * 1.05, hr * 1.05, hr * 1.05, hair, [1, 0, 0, hd[0] - 0.02])); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28; P.push(sph(hd[0] + Math.cos(a) * hr, hd[1] + hr * 0.75, Math.sin(a) * hr, 0.022, gold)); } break;
      case 'hood': P.push(ell(hd[0] - 0.015, hd[1] + 0.01, 0, hr * 1.25, hr * 1.2, hr * 1.25, MAT(o.hood || '#3d3a30', { pat: 'cloth' }), [1, 0, 0, hd[0] + 0.03])); break;
      case 'skull': break;
      case 'nemes': { const nm = MAT('#d9b44a', { pat: 'metal', spec: 0.5, shin: 20 }), st = MAT('#2f5f9a', { pat: 'cloth' }); P.push(ell(hd[0] - 0.01, hd[1] + 0.02, 0, hr * 1.12, hr * 1.05, hr * 1.15, nm, [0, -1, 0, -(hd[1] - 0.01)])); for (const s2 of [1, -1]) P.push(ell(hd[0] - 0.02, hd[1] - 0.1, s2 * hr * 0.95, hr * 0.5, hr * 1.25, 0.03, st)); P.push(ell(hd[0] - 0.09, hd[1] - 0.04, 0, 0.04, hr * 1.2, hr * 0.8, st)); break; }
      case 'band': P.push(ell(hd[0] - 0.02, hd[1] + 0.005, 0, hr * 1.02, hr * 1.1, hr * 1.02, hair, [1, 0, 0, hd[0] - 0.01]), ell(hd[0], hd[1] + hr * 0.35, 0, hr * 1.06, 0.018, hr * 1.06, MAT('#d9b44a', { pat: 'metal', spec: 0.8, shin: 30 }))); break;
      case 'jackal': { const fur = MAT('#15120f', { pat: 'fur', spec: 0.2 }), gl = MAT('#d9b44a', { pat: 'metal', spec: 0.9, shin: 36 }); P.push(ell(hd[0], hd[1] + 0.01, 0, hr * 1.15, hr * 1.1, hr * 1.05, fur), cap([hd[0] + hr * 0.6, hd[1] - 0.02, 0], [hd[0] + hr * 2.1, hd[1] - 0.06, 0], hr * 0.34, fur)); for (const s2 of [1, -1]) P.push(cap([hd[0] - 0.02, hd[1] + hr * 0.7, s2 * hr * 0.5], [hd[0] - 0.05, hd[1] + hr * 2.2, s2 * hr * 0.62], hr * 0.2, fur)); for (const s2 of [1, -1]) P.push(ell(hd[0] - 0.03, hd[1] - 0.12, s2 * hr * 0.9, hr * 0.45, hr * 1.1, 0.03, gl)); break; }
      case 'cap': P.push(ell(hd[0], hd[1] + 0.03, 0, hr * 1.08, hr * 0.8, hr * 1.08, MAT('#6a5238', { pat: 'cloth' }), [0, -1, 0, -(hd[1] + 0.01)])); break;
      default: P.push(ell(hd[0] - 0.03, hd[1] + 0.005, 0, hr * 1.02, hr * 1.12, hr * 1.02, hair, [1, 0, 0, hd[0] - 0.015])); if (o.race === 'elf' || o.hair) P.push(ell(hd[0] - 0.07, hd[1] - 0.1, 0, 0.05, 0.13, hr * 0.8, hair));
    }
    if (o.race === 'dwf' || o.beard) P.push(ell(hd[0] + 0.06, hd[1] - 0.09, 0, 0.07, 0.12, 0.09, MAT(o.beard || R.hair, { pat: 'fur' })));
    // arms
    const sh = side => [ch[0] * 0.5, base + 1.42 * S, 0.21 * B * side];
    const at = pose.atk || 0, w = o.w;
    const P3 = (a, b, c) => [a, base + b * S, c * B];
    let eR, hR, wd;
    if (at < 0) { eR = P3(-0.08, 1.52, -0.28); hR = P3(-0.1, 1.8, -0.2); wd = [-0.6, 0.8, 0.1]; }
    else if (at > 0.8) { eR = P3(0.3, 1.36, -0.18); hR = P3(0.56, 1.26, -0.08); wd = [0.96, -0.15, 0.1]; }
    else if (at > 0.3) { eR = P3(0.22, 1.1, -0.16); hR = P3(0.44, 0.92, -0.06); wd = [0.55, -0.83, 0.1]; }
    else { eR = P3(0.08 - swing * 0.1, 1.2, -0.25); hR = P3(0.22 - swing * 0.15, 1.08, -0.22); wd = [0.35, 0.94, 0]; }
    let eL = P3(0.12, 1.18, 0.27), hL = P3(0.26, 1.12, 0.25);
    if (!o.sh && w !== 'bow' && w !== 'banner' && w !== 'staff' && w !== 'spear' && w !== 'halberd') { eL = P3(-swing * 0.15, 1.17, 0.24); hL = P3(-swing * 0.3 + 0.03, 0.95, 0.23); }
    if (w === 'spear' || w === 'halberd' || w === 'javelin') { if (at > 0.3) { eR = P3(0.2, 1.3, -0.2); hR = P3(0.42, 1.28, -0.1); wd = [1, 0.04, 0.05]; } else if (at < 0) { eR = P3(-0.12, 1.4, -0.26); hR = P3(-0.18, 1.35, -0.2); wd = [0.9, 0.3, 0.05]; } else { wd = [0.12, 0.99, 0]; } }
    if (w === 'bow') { hL = P3(0.4, 1.36, 0.1); eL = P3(0.22, 1.36, 0.2); if (at !== 0) { hR = P3(-0.05, 1.4, 0.05); eR = P3(-0.15, 1.38, -0.18); } else { hR = P3(0.32, 1.3, 0.02); eR = P3(0.1, 1.25, -0.2); } }
    if (w === 'xbow') { hL = P3(0.42, 1.28, 0.08); eL = P3(0.22, 1.24, 0.2); hR = P3(0.2, 1.3, -0.04); eR = P3(0.02, 1.26, -0.2); }
    if (w === 'staff' || w === 'banner') { hL = P3(0.3, 1.2 + (at > 0.3 ? 0.3 : 0), 0.2); eL = P3(0.15, 1.2, 0.26); }
    const armM = o.arm === 'leather' || o.arm === 'rags' || o.arm === 'apron' || o.robe ? (o.robe ? MAT(o.robe, { pat: 'cloth' }) : cloth) : armour;
    for (const [s0, e0, h0] of [[sh(1), eL, hL], [sh(-1), eR, hR]]) { P.push(cap(s0, e0, 0.055 * B, armM), cap(e0, h0, 0.047 * B, armM), sph(h0[0], h0[1], h0[2], 0.042 * B, o.arm === 'plate' ? steel : leather)); }
    // weapons
    const W = nrm(wd), tip = k => add3(hR, W, k);
    switch (w) {
      case 'sword': case 'bigsword': { const L = w === 'bigsword' ? 1.1 : 0.82; P.push(cap(tip(0.08), tip(L), 0.02, MAT('#d6dce2', { pat: 'metal', spec: 1.4, shin: 70, emit: o.glow ? 0.25 : 0 }))); P.push(cap(add3(tip(0.07), [0, 0, 0.09]), add3(tip(0.07), [0, 0, -0.09]), 0.014, w === 'bigsword' ? gold : steel), sph(...tip(-0.06), 0.022, gold)); break; }
      case 'spear': case 'halberd': case 'javelin': { const L = w === 'javelin' ? 1.3 : 2.4; P.push(cap(tip(w === 'javelin' ? -0.4 : -0.7), tip(L - (w === 'javelin' ? 0.4 : 0.7)), 0.017, wood)); const t0 = tip(L - (w === 'javelin' ? 0.4 : 0.7)); P.push(cap(t0, add3(t0, W, 0.2), 0.03, MAT('#cfd5da', { pat: 'metal', spec: 1.3, shin: 60, emit: o.glow ? 0.25 : 0 }))); if (w === 'halberd') P.push(ell(t0[0], t0[1] - 0.06, t0[2], 0.12, 0.1, 0.02, steel)); break; }
      case 'axe': { P.push(cap(tip(-0.1), tip(0.75), 0.02, wood)); const t0 = tip(0.62), t1 = tip(0.74), off = [W[1] * 0.1, -W[0] * 0.1, 0]; P.push(cap(add3(t0, off), add3(t1, off), 0.045, MAT('#9aa1a8', { pat: 'metal', spec: 1.2, shin: 50, emit: o.glow ? 0.2 : 0 }))); break; }
      case 'khopesh': { P.push(cap(tip(-0.05), tip(0.18), 0.022, leather)); const bm = MAT('#c9a24a', { pat: 'metal', spec: 1.2, shin: 50, emit: o.glow ? 0.2 : 0 }), side = [-W[1], W[0], 0], bend = add3(tip(0.52), side, 0.14); P.push(cap(tip(0.18), tip(0.52), 0.026, bm), cap(tip(0.52), bend, 0.03, bm), cap(bend, add3(bend, W, -0.12), 0.024, bm)); break; }
      case 'cleaver': { P.push(cap(tip(-0.05), tip(0.2), 0.022, leather), cap(tip(0.22), tip(0.62), 0.05, MAT('#6d6863', { pat: 'metal', spec: 0.8, shin: 30, emit: o.glow ? 0.2 : 0 }))); break; }
      case 'hammer': { P.push(cap(tip(-0.1), tip(0.72), 0.022, wood)); const t0 = tip(0.72); P.push(ell(t0[0], t0[1], t0[2], 0.12, 0.08, 0.08, MAT('#a8afb6', { pat: 'metal', spec: 1.1, shin: 44, emit: o.glow ? 0.35 : 0 }))); break; }
      case 'club': { P.push(cap(tip(-0.05), tip(0.35), 0.035, wood), cap(tip(0.35), tip(0.85), 0.075, wood)); break; }
      case 'bow': { const c0 = hL, up = [0, 0.62 * S, 0]; const bw = MAT(o.race === 'elf' ? '#c9a55a' : '#5b3f24', { pat: 'wood', ns: 30, spec: 0.3 }); P.push(cap(add3(c0, [0.06, 0, 0]), add3(c0, up, 0.55), 0.016, bw), cap(add3(c0, [0.06, 0, 0]), add3(c0, up, -0.55), 0.016, bw)); if (at !== 0) P.push(cap(hR, add3(hL, [0.12, 0, 0]), 0.008, MAT('#d9d0bd'))); break; }
      case 'xbow': P.push(cap(hR, add3(hL, [0.2, 0, 0]), 0.03, wood), cap(add3(hL, [0.16, 0, 0.22]), add3(hL, [0.16, 0, -0.22]), 0.018, steel)); break;
      case 'staff': { const c0 = hL; P.push(cap(add3(c0, [0, -0.9, 0]), add3(c0, [0, 0.75, 0]), 0.022, wood)); P.push(sph(c0[0], c0[1] + 0.82, c0[2], 0.07, MAT(o.orb || '#9fd8ff', { emit: 1.2, spec: 1 }))); break; }
      case 'banner': { const c0 = hL; P.push(cap(add3(c0, [0, -0.9, 0]), add3(c0, [0, 1.1, 0]), 0.02, wood)); P.push(ell(c0[0] + 0.28, c0[1] + 0.85, c0[2], 0.28, 0.2, 0.012, MAT('#efe9dc', { pat: 'cloth' }))); break; }
    }
    // shields (face the camera side when the unit walks to the right)
    if (o.sh) {
      const c0 = add3(hL, [0.04, -0.02, 0.07 * B]);
      const shm = MAT(o.team, { pat: 'cloth' });
      if (o.sh === 'kite') P.push(ell(c0[0], c0[1] - 0.05, c0[2], 0.19 * B, 0.3 * S, 0.028, shm), ell(c0[0], c0[1] - 0.05, c0[2] - 0.004, 0.205 * B, 0.315 * S, 0.02, steel), cap([c0[0], c0[1] + 0.18, c0[2] + 0.028], [c0[0], c0[1] - 0.26, c0[2] + 0.028], 0.018, MAT('#e8e2d0')), cap([c0[0] - 0.12, c0[1] + 0.05, c0[2] + 0.026], [c0[0] + 0.12, c0[1] + 0.05, c0[2] + 0.026], 0.018, MAT('#e8e2d0')));
      else if (o.sh === 'leaf') P.push(ell(c0[0], c0[1], c0[2], 0.15, 0.32 * S, 0.026, shm), ell(c0[0], c0[1], c0[2] + 0.02, 0.05, 0.22 * S, 0.012, gold));
      else if (o.sh === 'oval') P.push(ell(c0[0], c0[1] - 0.02, c0[2], 0.19 * B, 0.36 * S, 0.028, shm), ell(c0[0], c0[1] - 0.02, c0[2] - 0.005, 0.205 * B, 0.375 * S, 0.02, MAT('#c29a45', { pat: 'metal', spec: 0.9, shin: 36 })), ell(c0[0], c0[1] + 0.08, c0[2] + 0.024, 0.07, 0.07, 0.012, MAT('#e8e0c8')));
      else if (o.sh === 'round') P.push(ell(c0[0], c0[1], c0[2], 0.25 * B, 0.25 * B, 0.03, shm), ell(c0[0], c0[1], c0[2] - 0.005, 0.27 * B, 0.27 * B, 0.024, MAT('#6b4a2e', { pat: 'wood', ns: 30 })), sph(c0[0], c0[1], c0[2] + 0.03, 0.055, gold));
      else P.push(ell(c0[0], c0[1], c0[2], 0.21 * B, 0.27 * S, 0.028, MAT('#5a4331', { pat: 'planks', bw: 0.08, bh: 1 })), ell(c0[0], c0[1] + 0.02, c0[2] + 0.02, 0.2 * B, 0.07, 0.012, shm));
    }
    return P;
  }
  // ---------- quadrupeds: horse, deer, boar, warg/wolf ----------
  function beast(kind, pose, P, coatHex, team) {
    const g = pose.walk !== undefined && pose.walk !== null, ph = pose.walk || 0;
    const coat = MAT(coatHex, { pat: kind === 'warg' || kind === 'wolf' || kind === 'boar' ? 'fur' : 'leather', spec: kind === 'horse' || kind === 'deer' ? 0.25 : 0.05, shin: 16 });
    const dark = MAT('#1d1712'), mane = MAT(kind === 'deer' ? '#7a5a3a' : '#1f1611', { pat: 'fur' });
    const nightmare = kind === 'nightmare'; if (nightmare) kind = 'horse';
    const D = { horse: { L: 0.78, H: 1.3, R: 0.33, Z: 0.28, leg: 1.1, neck: 1 }, deer: { L: 0.7, H: 1.3, R: 0.27, Z: 0.22, leg: 1.12, neck: 1.05 }, boar: { L: 0.62, H: 0.8, R: 0.36, Z: 0.32, leg: 0.55, neck: 0 }, warg: { L: 0.72, H: 0.95, R: 0.28, Z: 0.24, leg: 0.8, neck: 0.5 }, wolf: { L: 0.55, H: 0.7, R: 0.2, Z: 0.17, leg: 0.6, neck: 0.4 } }[kind];
    const bob = g ? Math.abs(Math.sin(ph)) * 0.05 : 0, y0 = D.H + bob;
    P.push(ell(0, y0, 0, D.L, D.R, D.Z, coat), ell(D.L * 0.62, y0 - 0.02, 0, D.R * 0.9, D.R * 0.95, D.Z * 1.02, coat), ell(-D.L * 0.62, y0 + 0.02, 0, D.R * 0.95, D.R * 0.95, D.Z * 1.05, coat));
    // legs with a gallop cycle
    const legs = [[D.L * 0.62, D.Z * 0.55, 0], [D.L * 0.62, -D.Z * 0.55, 0.5], [-D.L * 0.62, D.Z * 0.55, 2.2], [-D.L * 0.62, -D.Z * 0.55, 2.7]];
    for (const [lx, lz, off] of legs) {
      const a = g ? Math.sin(ph + off) * 0.6 : 0, top = [lx, y0 - D.R * 0.5, lz], knee = add3(top, [Math.sin(a) * D.leg * 0.5, -Math.cos(a) * D.leg * 0.5, 0]);
      const b2 = a - (g ? Math.max(0, Math.cos(ph + off)) * 0.9 : 0), hoof = add3(knee, [Math.sin(b2) * D.leg * 0.5, -Math.cos(b2) * D.leg * 0.5, 0]);
      P.push(cap(top, knee, D.R * 0.36, coat), cap(knee, hoof, D.R * 0.19, coat), sph(hoof[0], hoof[1] + 0.03, hoof[2], D.R * 0.21, dark));
    }
    if (kind === 'boar') {
      P.push(ell(D.L * 1.05, y0 - 0.05, 0, 0.3, 0.24, 0.22, coat), ell(D.L * 1.35, y0 - 0.12, 0, 0.1, 0.09, 0.09, MAT('#4a3a33')));
      for (const s2 of [1, -1]) P.push(cap([D.L * 1.3, y0 - 0.16, s2 * 0.1], [D.L * 1.42, y0, s2 * 0.14], 0.022, MAT('#efe6d2', { spec: 0.4 })));
      P.push(ell(0, y0 + D.R * 0.85, 0, D.L * 0.8, 0.08, 0.07, mane));
    } else {
      const nb = [D.L * 0.75, y0 + 0.1, 0], nt = [D.L * (0.95 + 0.35 * D.neck), y0 + 0.45 * D.neck + 0.12, 0];
      P.push(cap(nb, nt, D.R * 0.48, coat));
      const hdL = kind === 'horse' ? 0.3 : kind === 'deer' ? 0.24 : 0.28;
      P.push(cap(nt, add3(nt, [hdL, kind === 'horse' || kind === 'deer' ? -0.2 : -0.04, 0]), D.R * (kind === 'horse' ? 0.32 : 0.36), coat));
      if (kind !== 'deer') P.push(cap(add3(nb, [0, D.R * 0.4, 0]), add3(nt, [0, D.R * 0.4, 0]), 0.05, mane));
      for (const s2 of [1, -1]) P.push(cap(add3(nt, [0.02, 0.08, s2 * 0.06]), add3(nt, [-0.02, 0.2, s2 * 0.08]), 0.025, coat));
      if (kind === 'deer') for (const s2 of [1, -1]) { const b0 = add3(nt, [0, 0.12, s2 * 0.06]); P.push(cap(b0, add3(b0, [-0.12, 0.42, s2 * 0.14]), 0.018, MAT('#e9dcc0')), cap(add3(b0, [-0.06, 0.24, s2 * 0.08]), add3(b0, [0.1, 0.36, s2 * 0.14]), 0.014, MAT('#e9dcc0'))); }
      for (const s2 of nightmare ? [1, -1] : [1]) P.push(sph(nt[0] + hdL * 0.6, nt[1] + 0.04, 0.07 * s2, nightmare ? 0.026 : 0.018, MAT(nightmare ? '#7dff9a' : kind === 'warg' ? '#e6c33a' : '#120d0a', { emit: nightmare ? 1.3 : kind === 'warg' ? 0.6 : 0 })));
      P.push(cap([-D.L * 0.95, y0 + 0.1, 0], [-D.L * 1.3, y0 - (kind === 'horse' ? 0.45 : 0.1), 0], kind === 'horse' ? 0.07 : 0.06, kind === 'horse' ? mane : coat));
    }
    // saddle cloth in team colour
    if (team) P.push(ell(0.02, y0 + 0.02, 0, D.L * 0.55, D.R * 1.05, D.Z * 1.12, MAT(team, { pat: 'cloth' }), [0, 1, 0, y0 + D.R * 0.7]));
    return y0 + D.R;
  }
  function treant(pose, P) {
    const bark = MAT('#5b4330', { pat: 'wood', ns: 20 }), leaf = MAT('#4a7a3a', { pat: 'leaf' });
    const ph = pose.walk || 0, g = pose.walk !== undefined && pose.walk !== null;
    for (const s2 of [1, -1]) P.push(cap([0, 1.0, s2 * 0.2], [g ? Math.sin(ph * s2) * 0.3 : 0, 0.05, s2 * 0.25], 0.14, bark));
    P.push(frus(0, 0.8, 0, 0.32, 0.22, 1.7, bark));
    for (const s2 of [1, -1]) P.push(cap([0, 2.1, s2 * 0.25], [0.3 + (pose.atk > 0.5 ? 0.5 : 0), 1.5 + (pose.atk > 0.5 ? 0.4 : 0), s2 * 0.7], 0.08, bark));
    const r = mkRng(5); for (let k = 0; k < 14; k++) { const a = r() * 6.28, rr = r() * 0.5; P.push(sph(Math.cos(a) * rr, 2.6 + r() * 0.5, Math.sin(a) * rr, 0.28 + r() * 0.15, leaf)); }
    for (const s2 of [1, -1]) P.push(sph(0.24, 2.0, s2 * 0.09, 0.04, MAT('#b8ff7a', { emit: 1.4 })));
  }
  // move the primitives P[from..] by (dx, dy, dz)
  function shiftP(P, from, dx, dy, dz) {
    for (let i = from; i < P.length; i++) {
      const p = P[i];
      if (p.k === 0 || p.k === 1 || p.k === 4) { p.x += dx; p.y += dy; p.z += dz; if (p.clip) p.clip = [p.clip[0], p.clip[1], p.clip[2], p.clip[3] + p.clip[0] * dx + p.clip[1] * dy + p.clip[2] * dz]; }
      else if (p.k === 2) { p.ax += dx; p.ay += dy; p.az += dz; p.bx2 += dx; p.by2 += dy; p.bz2 += dz; }
      else if (p.k === 3) p.pl = p.pl.map(q => [q[0], q[1], q[2], q[3] + q[0] * dx + q[1] * dy + q[2] * dz]);
      p.bx += dx; p.by += dy; p.bz += dz;
    }
  }
  // siege catapult: chassis on four wheels, A-frame, throwing arm with counterweight; the arm swings on the attack frames
  function catapult(race, pose, P, team) {
    const wood = MAT(race === 'und' ? '#cdc4aa' : race === 'des' ? '#9a6a3a' : race === 'elf' ? '#8a6a42' : '#6b4a2e', { pat: 'wood', ns: 30 }), iron = MAT('#4a4d52', { pat: 'metal', spec: 0.8, shin: 40 }), tm = MAT(team, { pat: 'cloth' });
    const spin = pose.walk || 0;
    for (const s2 of [1, -1]) {
      P.push(cap([-1.1, 0.5, s2 * 0.5], [1.1, 0.5, s2 * 0.5], 0.08, wood));
      for (const wx of [-0.75, 0.75]) { P.push(ell(wx, 0.42, s2 * 0.66, 0.42, 0.42, 0.05, wood), sph(wx, 0.42, s2 * 0.7, 0.07, iron)); for (let k = 0; k < 2; k++) { const a = spin + k * 1.571; P.push(cap([wx + Math.cos(a) * 0.38, 0.42 + Math.sin(a) * 0.38, s2 * 0.66], [wx - Math.cos(a) * 0.38, 0.42 - Math.sin(a) * 0.38, s2 * 0.66], 0.025, wood)); } }
      P.push(cap([0.35, 0.5, s2 * 0.5], [0.05, 1.45, s2 * 0.32], 0.06, wood), cap([-0.35, 0.5, s2 * 0.5], [0.05, 1.45, s2 * 0.32], 0.06, wood));
    }
    for (const x of [-0.9, 0, 0.9]) P.push(cap([x, 0.5, -0.5], [x, 0.5, 0.5], 0.06, wood));
    P.push(cap([0.05, 1.45, -0.36], [0.05, 1.45, 0.36], 0.05, iron));
    const at = pose.atk || 0, ang = at > 0.8 ? 1.25 : at > 0.3 ? 0.7 : at < 0 ? 3.55 : 3.4, dx = Math.cos(ang), dy = Math.sin(ang), pv = [0.05, 1.45, 0];
    const tip = [pv[0] + dx * 1.75, pv[1] + dy * 1.75, 0]; P.push(cap(pv, tip, 0.065, wood), sph(tip[0], tip[1], 0, 0.18, wood));
    if (at <= 0.3) P.push(sph(tip[0], tip[1] + 0.12, 0, 0.15, MAT('#8a847a', { pat: 'rock' })));
    const cw = [pv[0] - dx * 0.5, pv[1] - dy * 0.5, 0]; P.push(R3.box(cw[0], cw[1], cw[2], 0.22, 0.22, 0.28, iron));
    P.push(cap([-1.05, 0.5, 0], [-1.05, 1.75, 0], 0.03, wood), ell(-1.18, 1.62, 0, 0.16, 0.12, 0.012, tm));
  }
  // desert war chariot: a horse in front, a two-wheeled car and a standing warrior
  function chariot(L, pose, P, team) {
    const n0 = P.length; beast('horse', pose, P, '#c8a878', team); shiftP(P, n0, 0.95, 0, 0);
    const wood = MAT('#8a5a30', { pat: 'wood', ns: 30 }), bronze = MAT('#c29a45', { pat: 'metal', spec: 0.9, shin: 36 }), tm = MAT(team, { pat: 'cloth' });
    const spin = pose.walk || 0;
    for (const s2 of [1, -1]) { P.push(ell(-0.55, 0.46, s2 * 0.5, 0.46, 0.46, 0.035, wood), sph(-0.55, 0.46, s2 * 0.53, 0.06, bronze)); for (let k = 0; k < 3; k++) { const a = spin + k * 1.047; P.push(cap([-0.55 + Math.cos(a) * 0.42, 0.46 + Math.sin(a) * 0.42, s2 * 0.5], [-0.55 - Math.cos(a) * 0.42, 0.46 - Math.sin(a) * 0.42, s2 * 0.5], 0.018, wood)); } }
    P.push(R3.box(-0.55, 0.62, 0, 0.36, 0.06, 0.42, wood), R3.box(-0.28, 0.9, 0, 0.05, 0.28, 0.42, tm), R3.box(-0.55, 0.84, 0.42, 0.3, 0.22, 0.03, bronze), R3.box(-0.55, 0.84, -0.42, 0.3, 0.22, 0.03, bronze));
    P.push(cap([-0.3, 0.62, 0], [0.75, 1.15, 0], 0.035, wood));
    const n1 = P.length; human(L, { atk: pose.atk }, P); shiftP(P, n1, -0.6, 0.66, 0);
  }
  // ---------- build a model for a unit type ----------
  function build(d, colorHex, frame, up) {
    const pose = frame >= 1 && frame <= 6 ? { walk: (frame - 1) / 6 * Math.PI * 2, atk: 0 } : frame >= 11 && frame <= 16 ? { walk: (frame - 10.5) / 6 * Math.PI * 2, atk: 0 } : frame === 7 ? { atk: -0.45 } : frame === 8 ? { atk: 1 } : frame === 9 ? { atk: 0.55 } : { atk: 0 };
    const P = [], team = teamCol(colorHex);
    if (d.sub === 'treant') treant(pose, P);
    else if (d.sub === 'wolf') beast('wolf', pose, P, '#6f675b', null);
    else if (d.sub === 'troll') { human({ race: 'orc', team: [0.3, 0.26, 0.2], skin: '#7b8270', arm: 'rags', w: 'club', helm: 'none', hair: '#2a2a22', S: 1.95, B: 1.7 }, pose, P); }
    else if (d.sub === 'bandit') human({ race: 'hum', team: [0.3, 0.26, 0.2], arm: 'leather', w: 'sword', helm: 'hood', hood: '#3d352b', cape: '#3a3128' }, pose, P);
    else if (d.sub === 'ghoul') human({ race: 'hum', team: [0.25, 0.3, 0.34], skin: '#b9c4c8', arm: 'mail', steel: '#5a6168', w: 'sword', helm: 'none', hair: '#2a2a2a' }, pose, P);
    else if (d.hero) human(Object.assign({ race: d.race, team }, HERO3[d.key]), pose, P);
    else {
      const L = Object.assign({ race: d.race, team }, LOOK[d.race][d.sub] || {});
      if (up & 2 && L.arm !== 'leather' && L.arm !== 'apron') { L.arm = 'plate'; L.steel = '#c3cad1'; }
      if (up & 1) L.glow = 1;
      if (d.sub === 'siege') catapult(d.race, pose, P, team);
      else if (d.sub === 'cav' && d.race === 'des') chariot(L, pose, P, team);
      else if (d.sub === 'cav') {
        const kind = { hum: 'horse', elf: 'deer', dwf: 'boar', orc: 'warg', und: 'nightmare' }[d.race], coat = { hum: '#4a3020', elf: '#9a6c40', dwf: '#3b2e28', orc: '#5e5a54', und: '#1d1b20' }[d.race];
        const top = beast(kind, pose, P, coat, d.race === 'hum' || d.race === 'elf' || d.race === 'und' ? team : null);
        human(L, { seated: 1, seatY: top - 0.9 * (L.S || 1) * M3R[d.race].S, atk: pose.atk }, P);
      } else human(L, pose, P);
    }
    if (frame === 10) fall(P);
    return P;
  }
  // lying pose for the fallen: rotate the whole figure backwards onto the ground
  function fall(P) {
    const rot = (x, y) => [-y, x];
    for (const p of P) {
      if (p.k === 0) { [p.x, p.y] = rot(p.x, p.y); p.y += 0.12; }
      else if (p.k === 1) { [p.x, p.y] = rot(p.x, p.y); p.y += 0.12; [p.a, p.b] = [p.b, p.a]; if (p.clip) { const [nx, ny] = rot(p.clip[0], p.clip[1]); p.clip = [nx, ny, p.clip[2], p.clip[3] + ny * 0.12]; } }
      else if (p.k === 2) { [p.ax, p.ay] = rot(p.ax, p.ay); [p.bx2, p.by2] = rot(p.bx2, p.by2); p.ay += 0.12; p.by2 += 0.12; }
      else if (p.k === 4) { const cx = -(p.y + p.h / 2), a = p.h / 2, b = Math.max(p.r0, p.r1); Object.assign(p, { k: 1, x: cx, y: 0.12 + b * 0.5, z: p.z, a, b: b * 0.6, c: b, clip: null }); }
      if (p.k === 0) { p.bx = p.x; p.by = p.y; } else if (p.k === 1) { p.bx = p.x; p.by = p.y; p.br = Math.max(p.a, p.b, p.c); p.br2 = p.br * p.br; } else if (p.k === 2) { p.bx = (p.ax + p.bx2) / 2; p.by = (p.ay + p.by2) / 2; }
    }
  }
  return { build, RACE3 };
})();

// ---------- sprite cache + background baking queue ----------
const PPM = 20; // world px per metre
const SPR3 = new Map(), Q3 = [];
let q3Busy = new Set();
function unit3Key(d, col, frame, dir, up) { return d.key + col + '|' + frame + '|' + dir + '|' + (d.hero || d.creep || d.summon || d.worker ? 0 : (up | 0) & 3); }
const K3 = 2.5; // sprite pixels per world px
function bakeUnit3(d, col, frame, dir, up) {
  const P = M3.build(d, col, frame, up | 0);
  const big = d.sub === 'cav' || d.sub === 'troll' || d.sub === 'treant' ? 1.7 : 1, Wm = 5 * big, Hm = 4 * big;
  const W = Math.ceil(Wm * PPM * K3), H = Math.ceil(Hm * PPM * K3), ox = W / 2, oy = H - 0.8 * PPM * K3;
  const cv = R3.render(P, { yaw: dir * Math.PI / 4, ppu: PPM * K3, w: W, h: H, ox, oy, ss: 1, ao: d.sub === 'cav' ? 2.4 : 1.7 });
  const bb = cv.bb || [ox - 1, oy - 1, ox + 1, oy + 1];
  const cw = Math.max(1, Math.ceil(bb[2] - bb[0])), ch = Math.max(1, Math.ceil(bb[3] - bb[1]));
  const out = mkCanvas(cw, ch); out.getContext('2d').drawImage(cv, bb[0], bb[1], cw, ch, 0, 0, cw, ch);
  cv.width = 0;
  return { cv: out, w: cw / K3, h: ch / K3, ox: (ox - bb[0]) / K3, oy: (oy - bb[1]) / K3 };
}
// portrait: the figure turned three-quarters toward the viewer, tightly framed
function icon3(d, col) {
  const P = M3.build(d, col, 0, 0), big = d.sub === 'cav' || d.sub === 'troll' || d.sub === 'treant';
  return R3.render(P, { yaw: Math.PI * 0.3, ppu: big ? 30 : 52, w: 128, h: 128, ox: big ? 58 : 64, oy: big ? 122 : 124, ss: 2, ao: 1.7 });
}
function unit3(d, col, frame, dir, up, sync) {
  const key = unit3Key(d, col, frame, dir, up);
  const s = SPR3.get(key); if (s) return s;
  if (sync) { const b = bakeUnit3(d, col, frame, dir, up); SPR3.set(key, b); return b; }
  if (!q3Busy.has(key)) { q3Busy.add(key); Q3.push({ key, d, col, frame, dir, up }); }
  return null;
}
function pumpUnit3(budgetMs) {
  const t0 = performance.now();
  while (Q3.length && performance.now() - t0 < budgetMs) {
    const j = Q3.shift(); q3Busy.delete(j.key);
    if (!SPR3.has(j.key)) SPR3.set(j.key, bakeUnit3(j.d, j.col, j.frame, j.dir, j.up));
  }
}
