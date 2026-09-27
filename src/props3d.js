// ================= PROPS3D: real 3D props for the command icons =================
// Every icon is a small still life (swords, plate, shields, fire arrows, banners, anvils, tomes…) built from lit
// primitives, rendered by the game's WebGL renderer and laid on a dark steel medallion with a coloured backlight.
const PROP3 = (() => {
  const { MAT, sph, ell, cap, box, frus } = R3;
  const steel = (c, k) => MAT(c || '#c9d0d6', { pat: 'metal', spec: 1.3, shin: 70, ...(k || {}) });
  const gold = () => MAT('#d8b05a', { pat: 'metal', spec: 1.2, shin: 60 });
  const wood = c => MAT(c || '#6b4a2e', { pat: 'wood', ns: 8 });
  const leather = c => MAT(c || '#4a3020', { pat: 'leather' });
  const cloth = c => MAT(c, { pat: 'cloth' });
  const glow = c => MAT(c, { emit: 1.6 });
  // ---- pieces (upright, base at y = 0, roughly 60 units tall) ----
  function sword(o) {
    const g = o && o.glow, blade = g ? MAT(g, { pat: 'metal', spec: 1.4, shin: 80, emit: 0.55 }) : steel('#dfe5ea');
    return [ell(0, 36, 0, 2.6, 26, 0.7, blade), ell(0, 36, 0, 0.5, 24, 0.9, steel('#8f979e')), cap([-9, 10, 0], [9, 10, 0], 1.3, gold()), cap([0, -1, 0], [0, 9, 0], 1.25, leather('#3a2414')), sph(0, -2.2, 0, 2.1, gold())];
  }
  function spear() { return [cap([0, -10, 0], [0, 50, 0], 0.9, wood()), ell(0, 56, 0, 2.2, 7, 0.7, steel()), cap([-2.4, 49, 0], [2.4, 49, 0], 0.7, steel())]; }
  function kite(col, emb) {
    const P = [ell(0, 26, 0, 17, 24, 2.4, cloth(col || '#1f4fbf'), [0, -1, 0, -2]), ell(0, 26, -0.6, 18.4, 25.4, 2.2, steel('#9aa2a8'), [0, -1, 0, -2.6]), sph(0, 28, 2.4, 3.2, steel())];
    P.push(ell(0, 5, 0, 7, 8, 2.3, cloth(col || '#1f4fbf')));
    if (emb === 'cross') P.push(box(0, 28, 2.2, 1.8, 14, 0.4, cloth('#f2efe6')), box(0, 32, 2.2, 10, 1.8, 0.4, cloth('#f2efe6')));
    return P;
  }
  function round(col) { return [ell(0, 24, 0, 20, 20, 2.2, wood('#5a3d24')), ell(0, 24, 0.9, 16, 16, 1.6, cloth(col || '#1f4fbf')), sph(0, 24, 2.2, 4.4, steel()), ell(0, 24, -0.3, 21, 21, 1.6, steel('#7f878d'))]; }
  function cuirass() {
    const s = steel('#8e979f');
    return [ell(0, 26, 0, 16, 20, 9, s, [0, -1, 0, -8]), ell(0, 13, 0, 14, 7, 8.4, steel('#6f777e')), ell(0, 30, 8.4, 1.1, 14, 1.2, steel('#d7dde2')), ell(0, 20, 8.6, 12, 0.8, 1.2, gold()), ell(0, 24, 8.8, 12.5, 0.8, 1.2, steel('#50575d')),
      ell(-15, 40, 0, 7, 4.5, 8, s), ell(15, 40, 0, 7, 4.5, 8, s), ell(-15, 36, 0, 6.2, 3.5, 7.2, steel('#9aa2a8')), ell(15, 36, 0, 6.2, 3.5, 7.2, steel('#9aa2a8')),
      ell(0, 44, 0, 7, 2.4, 6, steel('#8f979e')), cap([-13, 12, 5], [13, 12, 5], 1.4, leather('#5a3a20')), box(0, 12, 6.4, 2.4, 2, 0.8, gold())];
  }
  function helm(plume) {
    const s = steel('#9aa3ab'), P = [ell(0, 16, 0, 11, 13, 11, s, [0, -1, 0, -6]), ell(0, 7, 0, 11.6, 3, 11.6, steel('#9aa2a8')), box(0, 12, 10.6, 5, 1.1, 0.8, MAT('#0b0b0c')), cap([0, 3, 11], [0, 16, 11], 1.3, steel('#eef2f5'))];
    if (plume) P.push(ell(0, 29, -2, 2.2, 7, 7, cloth(plume)));
    return P;
  }
  function arrow(fire) {
    const P = [cap([0, 0, 0], [0, 48, 0], 0.55, wood('#a47a4a')), ell(0, 51, 0, 1.6, 4, 0.5, steel()), ell(1.6, 3, 0, 1.6, 4.5, 0.2, cloth('#efe8d8')), ell(-1.6, 3, 0, 1.6, 4.5, 0.2, cloth('#efe8d8'))];
    if (fire) P.push(sph(0, 50, 0, 3.4, glow(fire)), sph(0.8, 53.5, 0.4, 2.3, glow('#ffe2a0')), sph(-0.6, 56, 0, 1.5, glow(fire)));
    return P;
  }
  function bow() { const P = []; let prev = [0, 0, 0]; for (let k = 1; k <= 10; k++) { const t = k / 10, p = [Math.sin(t * Math.PI) * 9, t * 60, 0]; P.push(cap(prev, p, 1.3 - Math.abs(t - 0.5) * 0.9, wood('#7a5230'))); prev = p; } P.push(cap([0, 0, 0], [0, 60, 0], 0.25, cloth('#eee6d0')), cap([7.5, 26, 0], [7.5, 34, 0], 1.6, leather())); return P; }
  function banner(col, emb) {
    const P = [cap([0, -12, 0], [0, 62, 0], 1.1, wood()), sph(0, 63, 0, 2, gold()), cap([0, 58, 0], [22, 58, 0], 0.8, wood())];
    for (let k = 0; k < 6; k++) { const x = 2 + k * 3.6, w = Math.sin(k * 0.9) * 1.6; P.push(box(x, 44, w, 1.9, 13 + (k > 3 ? -k : 0), 0.35, cloth(col || '#1f4fbf'))); }
    P.push(box(11, 57.5, 0.6, 11, 1.1, 0.5, gold()));
    if (emb) P.push(box(11, 47, 1.3, 1.1, 6, 0.3, cloth('#f2efe6')), box(11, 49, 1.3, 4, 1.1, 0.3, cloth('#f2efe6')));
    return P;
  }
  function hammer() { return [cap([0, -4, 0], [0, 36, 0], 1.3, wood('#6b4a2e')), box(0, 38, 0, 8, 3.6, 3.6, steel('#8f979e')), cap([0, -2, 0], [0, 10, 0], 1.5, leather())]; }
  function anvil() { const s = steel('#5d646b'); return [box(0, 14, 0, 16, 3.4, 5, s), box(0, 8, 0, 6, 4, 4, s), box(0, 2, 0, 11, 2, 6, s), cap([16, 14.5, 0], [24, 13, 0], 2.4, s)]; }
  function chest() {
    const P = [box(0, 8, 0, 16, 8, 10, wood('#6b4424')), box(0, 17, -4, 16, 1.2, 10, wood('#553418')), box(-12, 8, 0, 1.2, 8.2, 10.2, gold()), box(12, 8, 0, 1.2, 8.2, 10.2, gold()), box(0, 10, 10.2, 3, 3, 0.8, gold())];
    for (let k = 0; k < 16; k++) { const a = k * 2.4, r = 3 + (k % 5) * 2.4; P.push(ell(Math.cos(a) * r, 16.5 + (k % 3) * 1.4, Math.sin(a) * r * 0.6 + 2, 2.8, 0.6, 2.8, gold())); }
    P.push(sph(4, 19, 3, 2, glow('#fff1b0')));
    return P;
  }
  function coins() { const P = []; for (let s = 0; s < 3; s++) for (let k = 0; k < 7 - s * 2; k++) P.push(ell(-12 + s * 11 + (k % 2) * 0.6, 1 + k * 1.4, (s - 1) * 4, 4.2, 0.7, 4.2, gold())); P.push(ell(4, 12, 6, 5, 5, 0.9, gold())); return P; }
  function flask(liq) { return [sph(0, 12, 0, 11, MAT(liq, { spec: 1.6, shin: 110, emit: 0.35 })), sph(-4, 16, 7, 2.2, glow('#ffffff')), cap([0, 20, 0], [0, 30, 0], 3, MAT('#cfe3ea', { spec: 1.2, shin: 90 })), ell(0, 22, 0, 4.4, 1, 4.4, gold()), cap([0, 30, 0], [0, 34, 0], 3.4, wood('#8a6a44'))]; }
  function tome(runes) { return [box(0, 3, 0, 18, 1.4, 13, leather('#4a1e18')), box(-9, 5, 0, 8.6, 1.2, 12, MAT('#efe4c4')), box(9, 5, 0, 8.6, 1.2, 12, MAT('#efe4c4')), box(-9, 6.3, 0, 6, 0.2, 8, glow(runes)), box(9, 6.3, 0, 6, 0.2, 8, glow(runes)), sph(0, 14, 0, 3, glow(runes))]; }
  function skull(eye) { const b = MAT('#e8dcc0', { spec: 0.3, shin: 20 }); return [sph(0, 22, 0, 12, b), ell(0, 11, 3, 8, 6, 8, b), sph(-4.5, 22, 10, 3, MAT('#120c0a')), sph(4.5, 22, 10, 3, MAT('#120c0a')), sph(-4.5, 22, 11, 1.7, glow(eye)), sph(4.5, 22, 11, 1.7, glow(eye))]; }
  function horn() { const P = []; let prev = [-18, 10, 0]; for (let k = 1; k <= 8; k++) { const t = k / 8, p = [-18 + t * 34, 10 + Math.sin(t * 2.6) * 14, 0]; P.push(cap(prev, p, 1.6 + t * 5, MAT(k % 2 ? '#8a6a44' : '#a47e52', { pat: 'wood', spec: 0.5, shin: 30 }))); prev = p; } P.push(cap([-8, 17, 0], [-6, 19, 0], 3.6, gold()), cap([6, 22, 0], [8, 22, 0], 5.8, gold())); return P; }
  function orb(c) { return [sph(0, 24, 0, 9, glow(c)), sph(0, 24, 0, 12, MAT(c, { emit: 0.25, spec: 1, shin: 60 }))]; }
  function meteor() { const P = [sph(0, 20, 0, 10, MAT('#4a3f36', { pat: 'rock' }))]; for (let k = 0; k < 7; k++) P.push(sph(8 + k * 3.4, 26 + k * 3, -2, 7 - k * 0.8, glow(k < 3 ? '#ffe0a0' : '#ff6a2a'))); return P; }
  function boot() { const l = leather('#5a3a20'); return [ell(0, 16, 0, 5.4, 14, 5.4, l), ell(5, 3, 0, 11, 4, 5.6, l), ell(0, 29, 0, 6.4, 2, 6.4, gold())]; }
  function tree() { const P = [cap([0, 0, 0], [0, 26, 0], 3, wood('#5a3d24'))]; for (const [x, y, z, r] of [[0, 34, 0, 11], [-9, 27, 3, 8], [9, 28, -2, 8], [0, 40, -4, 7]]) P.push(sph(x, y, z, r, MAT('#4f8a34', { pat: 'leaf' }))); P.push(sph(-2, 18, 3, 1.3, glow('#c8ff8a')), sph(2, 18, 3, 1.3, glow('#c8ff8a'))); return P; }
  function sun(c) { const P = [sph(0, 26, 0, 8, glow('#fff6d0'))]; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; P.push(cap([Math.cos(a) * 9, 26 + Math.sin(a) * 9, 0], [Math.cos(a) * (k % 2 ? 18 : 23), 26 + Math.sin(a) * (k % 2 ? 18 : 23), 0], 1.2, glow(c))); } return P; }
  // ---- the icons: parts with a placement, a camera and a mood ----
  // part = [prims, rotZ (deg), x, y, rotY (deg)]; view: el = camera height angle; bg = backlight colour
  const RED = '#c0392b', BLUE = '#3b6bd6', GOLD = '#d9a441', GREEN = '#58a94a', PURPLE = '#8e5bd6', STEEL = '#9aa7b4';
  const ICONS = {
    blades: o => ({ parts: [[sword({ glow: o.fx }), -38, -8, 0], [sword({ glow: o.fx }), 38, 8, 0]], bg: RED }),
    armor: () => ({ parts: [[cuirass(), 0, 0, 0, -18]], bg: STEEL }),
    arrows: o => ({ parts: [[arrow(o.fx), -30, -10, 0], [arrow(o.fx), -30, 2, -4], [arrow(o.fx), -30, 14, -8]], bg: '#e0662a' }),
    banner: o => ({ parts: [[banner(o.col, true), 0, 0, 0, -20]], bg: GOLD }),
    attack: () => ({ parts: [[sword({ glow: '#ffb070' }), -38, -8, 0], [sword({ glow: '#ffb070' }), 38, 8, 0]], bg: RED }),
    march: () => ({ parts: [[boot(), -10, 0, 0, 30]], bg: GOLD }),
    hold: o => ({ parts: [[spear(), 12, 14, 0], [kite(o.col, 'cross'), 0, -4, 4, -15]], bg: BLUE }),
    retreat: o => ({ parts: [[horn(), 0, 0, 0, 0]], bg: STEEL }),
    norm: o => ({ parts: [[kite(o.col, 'cross'), 0, -8, 0, -12], [sword(), 25, 14, 4]], bg: STEEL }),
    charge: () => ({ parts: [[spear(), -62, 0, 0], [helm('#c0392b'), 0, 12, -8, -25]], bg: RED }),
    shieldwall: o => ({ parts: [[kite(o.col, 'cross'), 0, -18, 0, -10], [kite(o.col, 'cross'), 0, 0, 2, -10], [kite(o.col, 'cross'), 0, 18, 0, -10]], bg: BLUE }),
    flag: o => ({ parts: [[banner(o.col, true), 0, 0, 0, -20]], bg: GOLD, rays: true }),
    refill: o => ({ parts: [[helm(o.col), 0, -10, -2, -20], [helm(), 0, 12, 2, -20]], bg: GREEN }),
    rally: o => ({ parts: [[banner(o.col, false), 0, 0, 0, -20]], bg: GREEN }),
    repair: () => ({ parts: [[anvil(), 0, 0, -6, -25], [hammer(), 35, 6, 6]], bg: '#e0662a', sparks: true }),
    worker: () => ({ parts: [[hammer(), 30, 0, 0]], bg: GOLD }),
    army: o => ({ parts: [[helm(), 0, -16, -4, -20], [helm(o.col), 0, 0, 2, -20], [helm(), 0, 16, -4, -20]], bg: RED }),
    builders: () => ({ parts: [[hammer(), 32, -6, 0], [hammer(), -32, 6, 0]], bg: GOLD }),
    recruit: o => ({ parts: [[banner(o.col, true), 0, -8, 0, -20], [helm(o.col), 0, 14, -6, -20]], bg: GOLD }),
    treasury: () => ({ parts: [[chest(), 0, 0, 0, -25]], bg: GOLD }),
    infirmary: () => ({ parts: [[flask('#e0443a'), 0, 0, 0]], bg: GREEN }),
    book: () => ({ parts: [[tome('#b08aff'), 0, 0, 0, -20]], bg: PURPLE, el: 38 }),
    sk_aura: o => ({ parts: [[sun(o.fx), 0, 0, 0]], bg: o.fx }),
    sk_dash: o => ({ parts: [[sword({ glow: o.fx }), -70, 0, 0]], bg: o.fx, streaks: true }),
    sk_aoe: o => ({ parts: [[hammer(), -20, 0, 0]], bg: o.fx, ring: true }),
    sk_strike: o => ({ parts: [[sword({ glow: o.fx }), -20, 0, 0]], bg: o.fx }),
    sk_heal: () => ({ parts: [[flask('#6fe07a'), 0, 0, 0]], bg: GREEN }),
    sk_buff: o => ({ parts: [[banner(o.col, true), 0, 0, 0, -20]], bg: o.fx, rays: true }),
    sk_debuff: () => ({ parts: [[skull('#b08aff'), 0, 0, 0, -15]], bg: PURPLE }),
    sk_summon: o => ({ parts: [[o.race === 'elf' ? tree() : orb(o.fx), 0, 0, 0]], bg: o.fx }),
    sk_volley: o => ({ parts: [[arrow(o.fx), 160, -12, 30], [arrow(o.fx), 160, 0, 36], [arrow(o.fx), 160, 12, 30]], bg: o.fx }),
    sp_heal: () => ({ parts: [[flask('#fff1b0'), 0, 0, 0]], bg: GOLD, rays: true }),
    sp_gold: () => ({ parts: [[coins(), 0, 0, 0, -20]], bg: GOLD }),
    sp_haste: () => ({ parts: [[boot(), -10, 0, 0, 30]], bg: BLUE, streaks: true }),
    sp_reinf: o => ({ parts: [[helm(), 0, -16, -4, -20], [helm(o.col), 0, 0, 2, -20], [helm(), 0, 16, -4, -20]], bg: GOLD }),
    sp_rally: () => ({ parts: [[horn(), 0, 0, 0, 0]], bg: GOLD }),
    sp_curse: () => ({ parts: [[skull('#8dffb0'), 0, 0, 0, -15]], bg: '#2f8a5a' }),
    sp_meteor: () => ({ parts: [[meteor(), 0, 0, 0, 20]], bg: '#c0392b' }),
    sp_summon: o => ({ parts: [[o.race === 'elf' ? tree() : orb('#8dffb0'), 0, 0, 0]], bg: '#2f8a5a' }),
    sp_ult: o => ({ parts: [[sun(o.fx || '#ffd86a'), 0, 0, 0]], bg: '#d9a441', rays: true }),
  };
  return { has: k => !!ICONS[k], spec: (k, o) => ICONS[k] ? ICONS[k](o || {}) : null };
})();
