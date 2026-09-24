// ================= DATA: races, units, buildings, heroes, skills =================
const TEAM_COLORS = ['#3d7bd6', '#d4483a', '#43a852', '#dcae2e'];
const TEAM_NAMES = ['Синие', 'Красные', 'Зелёные', 'Золотые'];

const RACES = {
  hum: { name: 'Королевство Камелот', short: 'Люди', skin: '#e3b894', metal: '#b8c1cb', trim: '#e7e2d3', mount: '#7a5436', stone: '#9aa1a8', roof: '#4d6275',
    desc: 'Стойкие мечники, дальнобойные лучники и тяжёлые рыцари. Сбалансированная армия.' },
  elf: { name: 'Сильваэн', short: 'Эльфы', skin: '#f2d6b8', metal: '#d9c27a', trim: '#f4f0dc', mount: '#c89a64', stone: '#e3dccb', roof: '#3f7a52',
    desc: 'Лучшие лучники мира и быстрые всадники на оленях. Хрупкие, но смертоносные.' },
  dwf: { name: 'Громгард', short: 'Гномы', skin: '#d8a27c', metal: '#8e949b', trim: '#c9953f', mount: '#4a3a33', stone: '#6f6a66', roof: '#8a3b2a',
    desc: 'Медленные и крепкие. Броня, арбалеты и боевые вепри. Долго держат удар.' },
  orc: { name: 'Орда Чёрного Клыка', short: 'Орки', skin: '#708c3f', metal: '#5b4c40', trim: '#9b2d20', mount: '#5d5b58', stone: '#5a4a3c', roof: '#3a2e25',
    desc: 'Дешёвые и быстрые отряды. Давят числом, волки рвут стрелков.' },
};
const RACE_KEYS = ['hum', 'elf', 'dwf', 'orc'];

// class bonuses: attacker cls -> target cls -> multiplier
const BONUS = {
  inf:   { spear: 1.3, bld: 1.0, arch: 1.15 },
  spear: { cav: 2.3, bld: 0.7, inf: 0.85 },
  arch:  { inf: 1.2, spear: 1.25, bld: 0.3, hero: 0.8, cav: 0.8 },
  cav:   { arch: 1.7, spear: 0.6, bld: 0.6, inf: 1.1 },
  hero:  { bld: 0.8 },
  siege: { bld: 2.6 },
  tower: { cav: 0.8 },
};

const UNIT_BASE = {
  inf:   { hp: 230, dmg: 18, rate: 1.0, range: 20, speed: 70, cost: 100, time: 7, pop: 1, r: 11, armor: 0.1, aggro: 230 },
  spear: { hp: 210, dmg: 15, rate: 1.1, range: 26, speed: 68, cost: 120, time: 7, pop: 1, r: 11, armor: 0.1, aggro: 230 },
  arch:  { hp: 135, dmg: 14, rate: 1.4, range: 230, speed: 68, cost: 130, time: 8, pop: 1, r: 10, armor: 0, aggro: 290, proj: 'arrow' },
  cav:   { hp: 440, dmg: 30, rate: 1.2, range: 24, speed: 125, cost: 230, time: 11, pop: 2, r: 15, armor: 0.15, aggro: 260 },
};

// race tweaks: [name, overrides]
const UNITS_BY_RACE = {
  hum: {
    inf:   ['Мечник', {}],
    spear: ['Копейщик', {}],
    arch:  ['Лучник', {}],
    cav:   ['Рыцарь', { hp: 470, armor: 0.2 }],
  },
  elf: {
    inf:   ['Страж рощи', { hp: 205, dmg: 20, speed: 76 }],
    spear: ['Копьё рассвета', { hp: 195, speed: 74 }],
    arch:  ['Лунный лучник', { range: 285, dmg: 16, cost: 145, hp: 125 }],
    cav:   ['Всадник на олене', { hp: 380, speed: 145, dmg: 27 }],
  },
  dwf: {
    inf:   ['Секироносец', { hp: 290, dmg: 20, speed: 58, armor: 0.25, cost: 115 }],
    spear: ['Алебардист', { hp: 260, speed: 56, armor: 0.2, cost: 130 }],
    arch:  ['Арбалетчик', { range: 215, dmg: 24, rate: 2.0, hp: 160, speed: 56, armor: 0.1, proj: 'bolt' }],
    cav:   ['Боевой вепрь', { hp: 520, speed: 105, dmg: 32, armor: 0.25, cost: 250 }],
  },
  orc: {
    inf:   ['Громила', { hp: 205, dmg: 17, cost: 80, time: 5.5, speed: 74 }],
    spear: ['Пикинёр', { hp: 190, cost: 90, time: 5.5 }],
    arch:  ['Метатель копий', { range: 195, dmg: 18, rate: 1.5, cost: 105, proj: 'javelin' }],
    cav:   ['Волчий наездник', { hp: 350, speed: 150, dmg: 26, cost: 200 }],
  },
};

const BLD_BASE = {
  fort:   { name: 'Цитадель', hp: 12000, r: 64, cost: 0, time: 1, shoot: true, range: 330, dmg: 30, rate: 1.1, proj: 'arrow', trains: ['hero'] },
  farm:   { name: 'Ферма', hp: 750, r: 32, cost: 200, time: 14, income: 2 },
  barr:   { name: 'Казармы', hp: 1500, r: 42, cost: 300, time: 18, trains: ['inf', 'spear'] },
  range:  { name: 'Стрельбище', hp: 1200, r: 38, cost: 350, time: 18, trains: ['arch'] },
  stable: { name: 'Конюшня', hp: 1500, r: 44, cost: 450, time: 22, trains: ['cav'] },
  tower:  { name: 'Башня', hp: 1400, r: 22, cost: 400, time: 20, shoot: true, range: 300, dmg: 20, rate: 1.2, proj: 'arrow' },
};
const BLD_NAMES = {
  hum: { farm: 'Ферма', stable: 'Конюшня', tower: 'Сторожевая башня' },
  elf: { farm: 'Лунный сад', stable: 'Олений двор', tower: 'Древо-страж', barr: 'Зал клинков' },
  dwf: { farm: 'Шахта', stable: 'Загон вепрей', tower: 'Бастион', barr: 'Кузня-казарма', range: 'Арбалетная' },
  orc: { farm: 'Бойня', stable: 'Волчье логово', tower: 'Вышка', barr: 'Яма бойцов', range: 'Стрельбище', fort: 'Крепость' },
};
const BUILD_ORDER = ['farm', 'barr', 'range', 'stable', 'tower'];

// ---------- heroes & skills ----------
// skill types: aura(passive) | dash | aoe | strike | heal | buff | debuff | summon | volley
const HEROES = {
  hum: [
    { key: 'h1', name: 'Король Артур', title: 'Владыка Камелота', hp: 1450, dmg: 46, rate: 1.1, range: 24, speed: 92, cost: 900, armor: 0.25, r: 15, style: 'warrior',
      skills: [
        { name: 'Знамя Камелота', type: 'aura', lvl: 1, radius: 260, stat: 'dmg', v: 0.2, desc: 'Пассивно: союзники рядом наносят +20% урона.' },
        { name: 'Рыцарский натиск', type: 'dash', lvl: 2, range: 360, radius: 90, dmg: 130, stun: 0.8, cd: 12, desc: 'Рывок к точке, урон и оглушение врагов.' },
        { name: 'Круглый стол', type: 'buff', lvl: 4, radius: 300, dur: 9, cd: 26, buffs: [['dmg', 0.3], ['spd', 0.25]], desc: 'Союзники: +30% урона и +25% скорости.' },
        { name: 'Экскалибур', type: 'strike', lvl: 6, radius: 140, dmg: 420, cd: 45, desc: 'Сокрушительный удар по всем врагам вокруг.' },
      ] },
    { key: 'h2', name: "Жанна д'Арк", title: 'Орлеанская дева', hp: 950, dmg: 30, rate: 1.3, range: 230, speed: 84, cost: 850, armor: 0.1, r: 13, style: 'caster', proj: 'holy',
      skills: [
        { name: 'Святое знамя', type: 'heal', lvl: 1, range: 400, radius: 200, heal: 220, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Божий свет', type: 'aoe', lvl: 2, range: 380, radius: 75, dmg: 190, cd: 9, fx: 'holy', desc: 'Удар светом по области.' },
        { name: 'Голоса святых', type: 'buff', lvl: 4, radius: 280, dur: 10, cd: 30, buffs: [['armor', 0.35]], desc: 'Союзники получают +35% брони.' },
        { name: 'Освобождение Орлеана', type: 'aoe', lvl: 6, range: 420, radius: 220, dmg: 360, stun: 2, delay: 1.1, cd: 60, fx: 'holy', desc: 'Столп солнца: огромный урон и оглушение.' },
      ] },
  ],
  elf: [
    { key: 'h1', name: 'Кухулин', title: 'Пёс Ольстера', hp: 1250, dmg: 50, rate: 0.8, range: 24, speed: 108, cost: 900, armor: 0.15, r: 14, style: 'warrior',
      skills: [
        { name: 'Ярость Ольстера', type: 'aura', lvl: 1, radius: 240, stat: 'aspd', v: 0.2, desc: 'Пассивно: союзники рядом атакуют на 20% быстрее.' },
        { name: 'Прыжок лосося', type: 'dash', lvl: 2, range: 380, radius: 80, dmg: 140, stun: 0.5, cd: 10, desc: 'Прыжок к точке с уроном по области.' },
        { name: 'Боевое безумие', type: 'strike', lvl: 4, radius: 125, dmg: 270, cd: 18, desc: 'Круговой удар клинками.' },
        { name: 'Га Болг', type: 'volley', lvl: 6, range: 450, radius: 190, count: 14, dmg: 70, cd: 45, fx: 'star', desc: 'Копьё Га Болг разлетается шипами по области.' },
      ] },
    { key: 'h2', name: 'Артемида', title: 'Богиня охоты', hp: 980, dmg: 32, rate: 1.3, range: 250, speed: 88, cost: 850, armor: 0.1, r: 13, style: 'caster', proj: 'leaf',
      skills: [
        { name: 'Лунный свет', type: 'heal', lvl: 1, range: 400, radius: 200, heal: 230, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Сети охотницы', type: 'aoe', lvl: 2, range: 380, radius: 110, dmg: 60, stun: 3, cd: 16, fx: 'roots', desc: 'Корни держат врагов 3 секунды.' },
        { name: 'Духи леса', type: 'summon', lvl: 4, unit: 'treant', count: 2, dur: 40, cd: 50, desc: 'Призывает двух духов леса (ломают здания).' },
        { name: 'Серебряные стрелы', type: 'aoe', lvl: 6, range: 420, radius: 190, dmg: 330, delay: 0.9, cd: 55, fx: 'nature', desc: 'Земля взрывается шипами.' },
      ] },
  ],
  dwf: [
    { key: 'h1', name: 'Тор', title: 'Бог грома', hp: 1750, dmg: 50, rate: 1.2, range: 24, speed: 78, cost: 900, armor: 0.3, r: 15, style: 'warrior',
      skills: [
        { name: 'Сила Асгарда', type: 'aura', lvl: 1, radius: 230, stat: 'armor', v: 0.15, desc: 'Пассивно: союзники рядом получают +15% брони.' },
        { name: 'Мьёльнир', type: 'aoe', lvl: 2, range: 330, radius: 65, dmg: 170, stun: 2, cd: 12, fx: 'hammer', proj: 'hammer', desc: 'Метает молот: урон и оглушение 2 с.' },
        { name: 'Удар грома', type: 'strike', lvl: 4, radius: 175, dmg: 190, stun: 1.5, cd: 22, desc: 'Удар о землю: урон и оглушение вокруг.' },
        { name: 'Ярость асов', type: 'buff', lvl: 6, radius: 260, dur: 12, cd: 50, buffs: [['dmg', 0.5], ['aspd', 0.3]], desc: 'Союзники: +50% урона и +30% скорости атаки.' },
      ] },
    { key: 'h2', name: 'Фрейя', title: 'Владычица сейда', hp: 1050, dmg: 30, rate: 1.3, range: 220, speed: 76, cost: 850, armor: 0.15, r: 13, style: 'caster', proj: 'rune',
      skills: [
        { name: 'Слёзы Фрейи', type: 'heal', lvl: 1, range: 380, radius: 200, heal: 220, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Щит валькирий', type: 'buff', lvl: 2, radius: 280, dur: 10, cd: 25, buffs: [['armor', 0.4]], desc: 'Союзники получают +40% брони.' },
        { name: 'Огненная руна', type: 'aoe', lvl: 4, range: 380, radius: 90, dmg: 230, cd: 12, fx: 'fire', desc: 'Взрыв огненной руны.' },
        { name: 'Рагнарёк', type: 'aoe', lvl: 6, range: 420, radius: 200, dmg: 380, stun: 2, delay: 1, cd: 60, fx: 'quake', desc: 'Земля раскалывается под врагами.' },
      ] },
  ],
  orc: [
    { key: 'h1', name: 'Арес', title: 'Бог войны', hp: 1550, dmg: 48, rate: 1.1, range: 24, speed: 92, cost: 850, armor: 0.2, r: 15, style: 'warrior',
      skills: [
        { name: 'Жажда битвы', type: 'aura', lvl: 1, radius: 260, stat: 'dmg', v: 0.2, desc: 'Пассивно: союзники рядом наносят +20% урона.' },
        { name: 'Колесница Ареса', type: 'dash', lvl: 2, range: 380, radius: 90, dmg: 130, stun: 0.8, cd: 12, desc: 'Рывок к точке, урон и оглушение.' },
        { name: 'Фобос и Деймос', type: 'debuff', lvl: 4, radius: 240, dur: 8, cd: 25, buffs: [['dmg', -0.4], ['spd', -0.35]], desc: 'Враги вокруг: −40% урона, −35% скорости.' },
        { name: 'Кровавая жатва', type: 'strike', lvl: 6, radius: 145, dmg: 400, cd: 45, desc: 'Кровавая бойня вокруг вождя.' },
      ] },
    { key: 'h2', name: 'Кощей', title: 'Бессмертный', hp: 920, dmg: 32, rate: 1.3, range: 230, speed: 86, cost: 800, armor: 0.1, r: 13, style: 'caster', proj: 'shadow',
      skills: [
        { name: 'Мёртвая вода', type: 'heal', lvl: 1, range: 380, radius: 190, heal: 210, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Колдовской огонь', type: 'aoe', lvl: 2, range: 400, radius: 75, dmg: 180, cd: 8, fx: 'fire', proj: 'fireball', desc: 'Огненный шар по области.' },
        { name: 'Навье войско', type: 'summon', lvl: 4, unit: 'ghoul', count: 3, dur: 35, cd: 45, desc: 'Поднимает трёх мертвецов из земли.' },
        { name: 'Чёрная буря', type: 'volley', lvl: 6, range: 450, radius: 190, count: 14, dmg: 65, cd: 50, fx: 'shadow', desc: 'Тёмные молнии бьют по области.' },
      ] },
  ],
};
const SUMMONS = {
  treant: { name: 'Дух леса', cls: 'siege', hp: 650, dmg: 38, rate: 1.4, range: 26, speed: 60, r: 17, armor: 0.2, aggro: 240 },
  ghoul:  { name: 'Навий воин', cls: 'inf', hp: 230, dmg: 18, rate: 1.0, range: 20, speed: 96, r: 11, armor: 0, aggro: 250 },
};

// ---------- build flat type table (index used over the network) ----------
const TYPES = [];
const DEF = {};
function addType(d) { d.ti = TYPES.length; TYPES.push(d); DEF[d.key] = d; return d; }
for (const rk of RACE_KEYS) {
  for (const cls of ['inf', 'spear', 'arch', 'cav']) {
    const [name, ov] = UNITS_BY_RACE[rk][cls];
    addType(Object.assign({ key: rk + '_' + cls, race: rk, kind: 'u', cls, name, sub: cls }, UNIT_BASE[cls], ov));
  }
  for (const bk of Object.keys(BLD_BASE)) {
    const b = BLD_BASE[bk];
    const nm = (BLD_NAMES[rk] && BLD_NAMES[rk][bk]) || b.name;
    addType(Object.assign({ key: rk + '_' + bk, race: rk, kind: 'b', cls: 'bld', sub: bk, armor: 0.2 }, b, { name: nm,
      trains: b.trains ? b.trains.map(t => t === 'hero' ? 'hero' : rk + '_' + t) : null }));
  }
  for (const h of HEROES[rk]) {
    addType(Object.assign({ race: rk, kind: 'u', cls: 'hero', sub: 'hero', pop: 0, time: 20, aggro: 260 }, h,
      { key: rk + '_' + h.key, hero: true, heroName: h.name, name: h.name + ', ' + h.title }));
  }
}
for (const sk of Object.keys(SUMMONS)) addType(Object.assign({ key: sk, race: sk === 'treant' ? 'elf' : 'orc', kind: 'u', sub: sk, summon: true, pop: 0, cost: 60 }, SUMMONS[sk]));

const SKILL_GLYPH = { aura: '✺', dash: '➶', aoe: '✹', strike: '⚔', heal: '✚', buff: '▲', debuff: '▼', summon: '♣', volley: '☄' };
const FX_KINDS = ['arrow', 'bolt', 'javelin', 'holy', 'leaf', 'rune', 'shadow', 'hammer', 'fireball', 'boom', 'heal', 'buff', 'debuff', 'dash', 'mark', 'summon', 'star', 'lvl'];
const FX_IDX = {}; FX_KINDS.forEach((k, i) => FX_IDX[k] = i);
const FX_COLORS = { holy: '#fff1b0', fire: '#ff8a3a', nature: '#8fdc5a', roots: '#6aa84f', quake: '#c28b52', hammer: '#cfd8e0', shadow: '#a36bff', star: '#bfe3ff', def: '#ffd27a' };

// ---------- outposts & race powers ----------
const OUTPOSTS = [[1600, 1100], [1600, 330], [1600, 1870], [720, 1100], [2480, 1100]];
const POWERS = [
  { k: 'heal', cost: 30, cd: 40, target: true, radius: 260, heal: 350, glyph: '✚' },
  { k: 'reinf', cost: 50, cd: 90, target: false, count: 4, glyph: '⚑' },
  { k: 'meteor', cost: 90, cd: 120, target: true, radius: 190, dmg: 420, delay: 1.6, glyph: '☄' },
];
const POWER_NAMES = {
  hum: [['Святой Грааль', 'Лечит всех ваших воинов в области'], ['Зов Камелота', '4 воина прибывают к цитадели'], ['Гнев небес', 'Огненный удар с неба по области']],
  elf: [['Роса Авалона', 'Лечит всех ваших воинов в области'], ['Дикая охота', '4 воина прибывают к цитадели'], ['Звёздный дождь', 'Небесный удар по области']],
  dwf: [['Мёд поэзии', 'Лечит всех ваших воинов в области'], ['Эйнхерии', '4 воина прибывают к цитадели'], ['Гнев Асгарда', 'Молния с небес по области']],
  orc: [['Кровавый пир', 'Лечит всех ваших воинов в области'], ['Орда встаёт', '4 воина прибывают к цитадели'], ['Огонь Тартара', 'Пламя из-под земли по области']],
};
