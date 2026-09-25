// ================= DATA: races, units, buildings, heroes, skills =================
const TEAM_COLORS = ['#3d7bd6', '#d4483a', '#43a852', '#dcae2e'];
const TEAM_NAMES = ['Синие', 'Красные', 'Зелёные', 'Золотые'];
const NEUTRAL = 8; // owner id of wild camps (wolves, trolls, bandits)
TEAM_COLORS[NEUTRAL] = '#8d8472';

const RACES = {
  hum: { name: 'Королевство Камелот', short: 'Люди', skin: '#e3b894', metal: '#b8c1cb', trim: '#e7e2d3', mount: '#7a5436', stone: '#9aa1a8', roof: '#4d6275',
    desc: 'Стойкие мечники, дальнобойные лучники и тяжёлые рыцари. Сбалансированная армия.' },
  elf: { name: 'Сильваэн', short: 'Эльфы', skin: '#f2d6b8', metal: '#d9c27a', trim: '#f4f0dc', mount: '#c89a64', stone: '#e3dccb', roof: '#3f7a52',
    desc: 'Лучшие лучники мира и быстрые всадники на оленях. Хрупкие, но смертоносные.' },
  dwf: { name: 'Громгард', short: 'Гномы', skin: '#d8a27c', metal: '#8e949b', trim: '#c9953f', mount: '#4a3a33', stone: '#6f6a66', roof: '#8a3b2a',
    desc: 'Медленные и крепкие. Броня, арбалеты и боевые вепри. Долго держат удар.' },
  orc: { name: 'Орда Чёрного Клыка', short: 'Орки', skin: '#708c3f', metal: '#5b4c40', trim: '#9b2d20', mount: '#5d5b58', stone: '#5a4a3c', roof: '#3a2e25',
    desc: 'Дешёвые и быстрые отряды. Давят числом, волки рвут стрелков.' },
  und: { name: 'Легион Мёртвых', short: 'Нежить', skin: '#cfc8b0', metal: '#5c6168', trim: '#4f8a6a', mount: '#2a2830', stone: '#4c4854', roof: '#2c2a33',
    desc: 'Мертвецы не знают страха: многочисленные скелеты, костяные лучники и рыцари смерти. Медленные, но стойкие.' },
  des: { name: 'Солнечный Кемет', short: 'Кемет', skin: '#9a6a48', metal: '#c9a24a', trim: '#2f6aa3', mount: '#c8a878', stone: '#d8c298', roof: '#b0643a',
    desc: 'Воины пустыни: хопешники, меткие лучники и стремительные боевые колесницы.' },
};
const RACE_KEYS = ['hum', 'elf', 'dwf', 'orc', 'und', 'des'];

// class bonuses: attacker cls -> target cls -> multiplier
const BONUS = {
  inf:   { spear: 1.3, bld: 1.0, arch: 1.15 },
  spear: { cav: 2.3, bld: 0.7, inf: 0.85 },
  arch:  { inf: 1.2, spear: 1.25, bld: 0.3, hero: 0.8, cav: 0.8 },
  cav:   { arch: 1.7, spear: 0.6, bld: 0.6, inf: 1.1 },
  hero:  { bld: 0.8 },
  siege: { bld: 2.6, inf: 1.2, spear: 1.2, arch: 1.2 },
  tower: { cav: 0.8 },
};

// Soldiers fight in battalions (BFME-style): n soldiers per hire; cost/time are per battalion, hp/dmg per soldier.
const UNIT_BASE = {
  inf:   { n: 10, hp: 95, dmg: 8, rate: 1.0, range: 14, speed: 74, cost: 300, time: 12, pop: 1, r: 7.5, armor: 0.1, aggro: 220 },
  spear: { n: 10, hp: 85, dmg: 7, rate: 1.1, range: 20, speed: 72, cost: 320, time: 12, pop: 1, r: 7.5, armor: 0.1, aggro: 220 },
  arch:  { n: 8, hp: 55, dmg: 7.5, rate: 1.5, range: 240, speed: 72, cost: 340, time: 14, pop: 1, r: 7, armor: 0, aggro: 290, proj: 'arrow' },
  cav:   { n: 5, hp: 270, dmg: 19, rate: 1.2, range: 18, speed: 130, cost: 480, time: 18, pop: 2, r: 12, armor: 0.15, aggro: 250 },
  // builders: single workers that raise and repair buildings, never pick fights
  worker: { n: 1, hp: 170, dmg: 4, rate: 1.2, range: 12, speed: 84, cost: 100, time: 8, pop: 1, r: 8, armor: 0.05, aggro: 0, worker: true },
  // siege engine: hurls boulders at long range, splash damage, wrecks buildings
  siege: { n: 1, hp: 650, dmg: 95, rate: 5.5, range: 500, speed: 44, cost: 600, time: 25, pop: 3, r: 16, armor: 0.1, aggro: 520, splash: 65 },
};

// race tweaks: [name, overrides]
const UNITS_BY_RACE = {
  hum: {
    inf:   ['Мечники', {}],
    spear: ['Копейщики', {}],
    arch:  ['Лучники', {}],
    cav:   ['Рыцари', { hp: 290, armor: 0.2 }],
    worker: ['Строитель', {}],
    siege: ['Катапульта', {}],
  },
  elf: {
    inf:   ['Стражи рощи', { hp: 85, dmg: 9, speed: 80 }],
    spear: ['Копья рассвета', { hp: 80, speed: 78 }],
    arch:  ['Лунные лучники', { range: 290, dmg: 8.5, cost: 370, hp: 50 }],
    cav:   ['Всадники на оленях', { hp: 235, speed: 150, dmg: 17 }],
    worker: ['Эльфийский мастер', { speed: 92 }],
    siege: ['Баллиста рощи', {}],
  },
  dwf: {
    inf:   ['Секироносцы', { n: 8, hp: 140, dmg: 10, speed: 62, armor: 0.25, cost: 330 }],
    spear: ['Алебардисты', { n: 8, hp: 125, speed: 60, armor: 0.2, cost: 340 }],
    arch:  ['Арбалетчики', { range: 220, dmg: 12, rate: 2.0, hp: 70, speed: 60, armor: 0.1, proj: 'bolt' }],
    cav:   ['Боевые вепри', { hp: 330, speed: 108, dmg: 20, armor: 0.25, cost: 500 }],
    worker: ['Гном-каменщик', { hp: 230, speed: 72, armor: 0.15 }],
    siege: ['Камнемёт гномов', {}],
  },
  orc: {
    inf:   ['Громилы', { n: 12, hp: 80, dmg: 7, cost: 260, time: 9, speed: 78 }],
    spear: ['Пикинёры', { n: 12, hp: 75, cost: 280, time: 9 }],
    arch:  ['Метатели копий', { range: 200, dmg: 9.5, rate: 1.5, cost: 300, proj: 'javelin' }],
    cav:   ['Волчьи наездники', { n: 6, hp: 210, speed: 155, dmg: 16, cost: 440 }],
    worker: ['Орк-невольник', { cost: 80, hp: 150 }],
    siege: ['Осадный камнемёт', {}],
  },
  und: {
    inf:   ['Скелеты-воины', { n: 12, hp: 88, dmg: 8, speed: 70, armor: 0.2, cost: 290 }],
    spear: ['Могильные копейщики', { n: 12, hp: 82, speed: 68, armor: 0.15, cost: 300 }],
    arch:  ['Костяные лучники', { n: 9, range: 250, dmg: 8, hp: 52, cost: 330 }],
    cav:   ['Рыцари смерти', { hp: 300, dmg: 21, speed: 118, armor: 0.25, cost: 520 }],
    worker: ['Гуль-могильщик', { hp: 190, speed: 78 }],
    siege: ['Костяная катапульта', {}],
  },
  des: {
    inf:   ['Хопешники', { hp: 90, dmg: 9, speed: 80, cost: 310 }],
    spear: ['Стража Нила', { hp: 95, armor: 0.15, cost: 330 }],
    arch:  ['Лучники Сета', { range: 260, dmg: 8, rate: 1.4, cost: 350 }],
    cav:   ['Боевые колесницы', { n: 4, hp: 340, dmg: 22, speed: 140, armor: 0.2, cost: 520, r: 14 }],
    worker: ['Каменотёс', {}],
    siege: ['Осадная катапульта', {}],
  },
};

const BLD_BASE = {
  fort:   { name: 'Цитадель', hp: 12000, r: 64, cost: 0, time: 1, shoot: true, range: 330, dmg: 30, rate: 1.1, proj: 'arrow', trains: ['hero', 'worker'] },
  farm:   { name: 'Ферма', hp: 750, r: 32, cost: 200, time: 14, income: 2 },
  barr:   { name: 'Казармы', hp: 1800, r: 42, cost: 300, time: 18, trains: ['inf', 'spear'] },
  range:  { name: 'Стрельбище', hp: 1200, r: 38, cost: 350, time: 18, trains: ['arch'] },
  stable: { name: 'Конюшня', hp: 1800, r: 44, cost: 450, time: 22, trains: ['cav'] },
  forge:  { name: 'Кузница', hp: 1400, r: 36, cost: 400, time: 22, forge: true, trains: ['siege'] },
  tower:  { name: 'Башня', hp: 1600, r: 22, cost: 400, time: 20, shoot: true, range: 300, dmg: 22, rate: 1.2, proj: 'arrow' },
  // fortress walls (BFME2): laid out as a line of segments; long walls get a gate that lets friends through
  wall:   { name: 'Стена', hp: 1400, r: 16, cost: 35, time: 5, wall: true, armor: 0.45 },
  gate:   { name: 'Ворота', hp: 2400, r: 22, cost: 120, time: 12, wall: true, gate: true, armor: 0.4 },
};
const BLD_NAMES = {
  hum: { farm: 'Ферма', stable: 'Конюшня', tower: 'Сторожевая башня', forge: 'Кузница' },
  elf: { farm: 'Лунный сад', stable: 'Олений двор', tower: 'Древо-страж', barr: 'Зал клинков', forge: 'Мастерская рун' },
  dwf: { farm: 'Шахта', stable: 'Загон вепрей', tower: 'Бастион', barr: 'Кузня-казарма', range: 'Арбалетная', forge: 'Великий горн' },
  orc: { farm: 'Бойня', stable: 'Волчье логово', tower: 'Вышка', barr: 'Яма бойцов', range: 'Стрельбище', fort: 'Крепость', forge: 'Плавильня' },
  und: { fort: 'Некрополь', farm: 'Склеп', barr: 'Костяной зал', range: 'Башня плакальщиц', stable: 'Конюшня мёртвых', tower: 'Шпиль ужаса', forge: 'Кузня душ' },
  des: { fort: 'Дворец фараона', farm: 'Поля Нила', barr: 'Казармы хопешей', range: 'Двор лучников', stable: 'Колесничий двор', tower: 'Обелиск', forge: 'Мастерская бронзы' },
};
const BUILD_ORDER = ['farm', 'barr', 'range', 'stable', 'forge', 'tower'];

// ---------- upgrades (BFME2-style) ----------
// equipment: unlocked once in the barracks/range (at: building), then bought for each battalion (eq: price per battalion)
// citadel: researched in the citadel, works at once
const UPGRADES = [
  { k: 'blades', at: 'barr', forge: 1, cost: 450, time: 35, eq: 130, cls: ['inf', 'spear', 'cav'], glyph: '⚔', desc: 'Батальон пехоты, копейщиков или конницы: +25% урона' },
  { k: 'armor', at: 'barr', forge: 1, cost: 500, time: 40, eq: 150, cls: ['inf', 'spear', 'arch', 'cav'], glyph: '⛨', desc: 'Батальон: +20% брони, бойцы в латах' },
  { k: 'arrows', at: 'range', forge: 1, cost: 400, time: 30, eq: 110, cls: ['arch'], glyph: '➹', desc: 'Стрелки: +30% урона, горящие стрелы. Башни и цитадель получают их сразу' },
  { k: 'banner', at: 'barr', cost: 350, time: 30, eq: 90, cls: ['inf', 'spear', 'arch', 'cav'], glyph: '⚑', desc: 'Знаменосец: батальон вне боя лечится и восполняет павших' },
  { k: 'walls', at: 'fort', cost: 700, time: 40, glyph: '▦', desc: 'Цитадель: +50% прочности и +15% брони' },
  { k: 'archers', at: 'fort', cost: 600, time: 35, glyph: '➶', desc: 'Цитадель стреляет сразу по трём целям, дальность +20%' },
  { k: 'catapult', at: 'fort', cost: 900, time: 50, glyph: '☄', desc: 'Требушет на стене мечет камни в скопления врагов' },
  { k: 'treasury', at: 'fort', cost: 500, time: 30, glyph: '⛃', desc: '+3 золота в секунду' },
  { k: 'infirmary', at: 'fort', cost: 450, time: 30, glyph: '✚', desc: 'Ваши воины рядом с цитаделью быстро лечатся' },
];
const FORT_UP_NAMES = { walls: 'Каменные стены', archers: 'Лучники на стенах', catapult: 'Требушет', treasury: 'Казна', infirmary: 'Лазарет' };
// battalion levels 1..10: experience needed to leave level L; every level +4% damage and health; a leader appears at LEADER_LVL
const SQ_XP = [0, 5, 12, 21, 32, 45, 60, 78, 98, 120];
const SQ_MAX_LVL = 10, LEADER_LVL = 3, FLAG_CD = 60;
// battalion stances (BFME-style formations)
const STANCES = {
  norm: { name: 'Обычный строй', g: '⚔', desc: 'Сбалансированный строй' },
  charge: { name: 'Натиск', g: '➤', dmg: 0.2, spd: 0.1, armor: -0.15, desc: '+20% урона, +10% скорости, −15% брони' },
  wall: { name: 'Стена щитов', g: '⛨', dmg: -0.1, spd: -0.3, armor: 0.2, desc: '+20% брони, −10% урона, −30% скорости' },
};
const STANCE_KEYS = ['norm', 'charge', 'wall'];
// hero artifacts (Warcraft III-style): found in camp treasures and relics, up to 3 per hero, kept through death
const ARTIFACTS = [
  { k: 'ring', name: 'Кольцо ярости', g: '◉', s: 'dmg', v: 0.2, desc: '+20% урона' },
  { k: 'mail', name: 'Мифриловая кольчуга', g: '⛨', s: 'armor', v: 0.15, desc: '+15% брони' },
  { k: 'boots', name: 'Сапоги странника', g: '➶', s: 'spd', v: 0.2, desc: '+20% скорости' },
  { k: 'feather', name: 'Перо феникса', g: '✧', s: 'aspd', v: 0.2, desc: '+20% скорости атаки' },
  { k: 'amulet', name: 'Амулет жизни', g: '✚', s: 'regen', v: 0.02, desc: 'лечит 2% здоровья в секунду' },
  { k: 'crown', name: 'Корона мудреца', g: '♛', s: 'cdr', v: 0.25, desc: 'навыки перезаряжаются на 25% быстрее' },
];
const ART = {}; ARTIFACTS.forEach((a, i) => { a.i = i; ART[a.k] = a; });
const upName = (race, k) => ((UPGRADE_NAMES[race] || {})[k]) || FORT_UP_NAMES[k] || k;
const UPGRADE_NAMES = {
  hum: { blades: 'Кованые клинки', armor: 'Тяжёлая броня', arrows: 'Огненные стрелы', banner: 'Знамёна полков' },
  elf: { blades: 'Клинки из мифрила', armor: 'Эльфийские латы', arrows: 'Серебряные стрелы', banner: 'Штандарты рощи' },
  dwf: { blades: 'Руны на секирах', armor: 'Гномья сталь', arrows: 'Разрывные болты', banner: 'Боевые горны' },
  orc: { blades: 'Зазубренные клинки', armor: 'Чёрные доспехи', arrows: 'Горящие копья', banner: 'Тотемы орды' },
  und: { blades: 'Проклятые клинки', armor: 'Могильная броня', arrows: 'Ядовитые стрелы', banner: 'Знамёна мёртвых' },
  des: { blades: 'Бронзовые хопеши', armor: 'Чешуйчатые доспехи', arrows: 'Стрелы Сета', banner: 'Штандарты Ра' },
};
const UP_BIT = { blades: 1, armor: 2, arrows: 4, banner: 8, walls: 16, archers: 32, catapult: 64, treasury: 128, infirmary: 256 };
const UPG = {}; for (const u of UPGRADES) UPG[u.k] = u;

// ---------- maps ----------
const MAP_TYPES = [
  { k: 'river', name: 'Речная долина', desc: 'Река с мостами и остров в центре' },
  { k: 'pass', name: 'Горный перевал', desc: 'Скалы и узкие проходы между ними' },
  { k: 'winter', name: 'Снежные холмы', desc: 'Замёрзшие озёра и хвойные леса' },
];

// ---------- heroes & skills ----------
// skill types: aura(passive) | dash | aoe | strike | heal | buff | debuff | summon | volley
const HEROES = {
  hum: [
    { key: 'h1', name: 'Король Артур', title: 'Владыка Камелота', hp: 2320, dmg: 46, rate: 1.1, range: 24, speed: 92, cost: 900, armor: 0.25, r: 15, style: 'warrior', cleave: 45,
      skills: [
        { name: 'Знамя Камелота', type: 'aura', lvl: 1, radius: 260, stat: 'dmg', v: 0.2, desc: 'Пассивно: союзники рядом наносят +20% урона.' },
        { name: 'Рыцарский натиск', type: 'dash', lvl: 2, range: 360, radius: 90, dmg: 130, stun: 0.8, cd: 12, desc: 'Рывок к точке, урон и оглушение врагов.' },
        { name: 'Круглый стол', type: 'buff', lvl: 4, radius: 300, dur: 9, cd: 26, buffs: [['dmg', 0.3], ['spd', 0.25]], desc: 'Союзники: +30% урона и +25% скорости.' },
        { name: 'Экскалибур', type: 'strike', lvl: 6, radius: 140, dmg: 420, cd: 45, desc: 'Сокрушительный удар по всем врагам вокруг.' },
      ] },
    { key: 'h2', name: "Жанна д'Арк", title: 'Орлеанская дева', hp: 1520, dmg: 30, rate: 1.3, range: 230, speed: 84, cost: 850, armor: 0.1, r: 13, style: 'caster', proj: 'holy',
      skills: [
        { name: 'Святое знамя', type: 'heal', lvl: 1, range: 400, radius: 200, heal: 220, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Божий свет', type: 'aoe', lvl: 2, range: 380, radius: 75, dmg: 190, cd: 9, fx: 'holy', desc: 'Удар светом по области.' },
        { name: 'Голоса святых', type: 'buff', lvl: 4, radius: 280, dur: 10, cd: 30, buffs: [['armor', 0.35]], desc: 'Союзники получают +35% брони.' },
        { name: 'Освобождение Орлеана', type: 'aoe', lvl: 6, range: 420, radius: 220, dmg: 360, stun: 2, delay: 1.1, cd: 60, fx: 'holy', desc: 'Столп солнца: огромный урон и оглушение.' },
      ] },
  ],
  elf: [
    { key: 'h1', name: 'Кухулин', title: 'Пёс Ольстера', hp: 2000, dmg: 50, rate: 0.8, range: 24, speed: 108, cost: 900, armor: 0.15, r: 14, style: 'warrior', cleave: 45,
      skills: [
        { name: 'Ярость Ольстера', type: 'aura', lvl: 1, radius: 240, stat: 'aspd', v: 0.2, desc: 'Пассивно: союзники рядом атакуют на 20% быстрее.' },
        { name: 'Прыжок лосося', type: 'dash', lvl: 2, range: 380, radius: 80, dmg: 140, stun: 0.5, cd: 10, desc: 'Прыжок к точке с уроном по области.' },
        { name: 'Боевое безумие', type: 'strike', lvl: 4, radius: 125, dmg: 270, cd: 18, desc: 'Круговой удар клинками.' },
        { name: 'Га Болг', type: 'volley', lvl: 6, range: 450, radius: 190, count: 14, dmg: 70, cd: 45, fx: 'star', desc: 'Копьё Га Болг разлетается шипами по области.' },
      ] },
    { key: 'h2', name: 'Артемида', title: 'Богиня охоты', hp: 1570, dmg: 32, rate: 1.3, range: 250, speed: 88, cost: 850, armor: 0.1, r: 13, style: 'caster', proj: 'leaf',
      skills: [
        { name: 'Лунный свет', type: 'heal', lvl: 1, range: 400, radius: 200, heal: 230, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Сети охотницы', type: 'aoe', lvl: 2, range: 380, radius: 110, dmg: 60, stun: 3, cd: 16, fx: 'roots', desc: 'Корни держат врагов 3 секунды.' },
        { name: 'Духи леса', type: 'summon', lvl: 4, unit: 'treant', count: 2, dur: 40, cd: 50, desc: 'Призывает двух духов леса (ломают здания).' },
        { name: 'Серебряные стрелы', type: 'aoe', lvl: 6, range: 420, radius: 190, dmg: 330, delay: 0.9, cd: 55, fx: 'nature', desc: 'Земля взрывается шипами.' },
      ] },
  ],
  dwf: [
    { key: 'h1', name: 'Тор', title: 'Бог грома', hp: 2800, dmg: 50, rate: 1.2, range: 24, speed: 78, cost: 900, armor: 0.3, r: 15, style: 'warrior', cleave: 45,
      skills: [
        { name: 'Сила Асгарда', type: 'aura', lvl: 1, radius: 230, stat: 'armor', v: 0.15, desc: 'Пассивно: союзники рядом получают +15% брони.' },
        { name: 'Мьёльнир', type: 'aoe', lvl: 2, range: 330, radius: 65, dmg: 170, stun: 2, cd: 12, fx: 'hammer', proj: 'hammer', desc: 'Метает молот: урон и оглушение 2 с.' },
        { name: 'Удар грома', type: 'strike', lvl: 4, radius: 175, dmg: 190, stun: 1.5, cd: 22, desc: 'Удар о землю: урон и оглушение вокруг.' },
        { name: 'Ярость асов', type: 'buff', lvl: 6, radius: 260, dur: 12, cd: 50, buffs: [['dmg', 0.5], ['aspd', 0.3]], desc: 'Союзники: +50% урона и +30% скорости атаки.' },
      ] },
    { key: 'h2', name: 'Фрейя', title: 'Владычица сейда', hp: 1680, dmg: 30, rate: 1.3, range: 220, speed: 76, cost: 850, armor: 0.15, r: 13, style: 'caster', proj: 'rune',
      skills: [
        { name: 'Слёзы Фрейи', type: 'heal', lvl: 1, range: 380, radius: 200, heal: 220, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Щит валькирий', type: 'buff', lvl: 2, radius: 280, dur: 10, cd: 25, buffs: [['armor', 0.4]], desc: 'Союзники получают +40% брони.' },
        { name: 'Огненная руна', type: 'aoe', lvl: 4, range: 380, radius: 90, dmg: 230, cd: 12, fx: 'fire', desc: 'Взрыв огненной руны.' },
        { name: 'Рагнарёк', type: 'aoe', lvl: 6, range: 420, radius: 200, dmg: 380, stun: 2, delay: 1, cd: 60, fx: 'quake', desc: 'Земля раскалывается под врагами.' },
      ] },
  ],
  orc: [
    { key: 'h1', name: 'Арес', title: 'Бог войны', hp: 2480, dmg: 48, rate: 1.1, range: 24, speed: 92, cost: 850, armor: 0.2, r: 15, style: 'warrior', cleave: 45,
      skills: [
        { name: 'Жажда битвы', type: 'aura', lvl: 1, radius: 260, stat: 'dmg', v: 0.2, desc: 'Пассивно: союзники рядом наносят +20% урона.' },
        { name: 'Колесница Ареса', type: 'dash', lvl: 2, range: 380, radius: 90, dmg: 130, stun: 0.8, cd: 12, desc: 'Рывок к точке, урон и оглушение.' },
        { name: 'Фобос и Деймос', type: 'debuff', lvl: 4, radius: 240, dur: 8, cd: 25, buffs: [['dmg', -0.4], ['spd', -0.35]], desc: 'Враги вокруг: −40% урона, −35% скорости.' },
        { name: 'Кровавая жатва', type: 'strike', lvl: 6, radius: 145, dmg: 400, cd: 45, desc: 'Кровавая бойня вокруг вождя.' },
      ] },
    { key: 'h2', name: 'Кощей', title: 'Бессмертный', hp: 1470, dmg: 32, rate: 1.3, range: 230, speed: 86, cost: 800, armor: 0.1, r: 13, style: 'caster', proj: 'shadow',
      skills: [
        { name: 'Мёртвая вода', type: 'heal', lvl: 1, range: 380, radius: 190, heal: 210, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Колдовской огонь', type: 'aoe', lvl: 2, range: 400, radius: 75, dmg: 180, cd: 8, fx: 'fire', proj: 'fireball', desc: 'Огненный шар по области.' },
        { name: 'Навье войско', type: 'summon', lvl: 4, unit: 'ghoul', squad: true, dur: 35, cd: 45, desc: 'Поднимает из земли батальон мертвецов.' },
        { name: 'Чёрная буря', type: 'volley', lvl: 6, range: 450, radius: 190, count: 14, dmg: 65, cd: 50, fx: 'shadow', desc: 'Тёмные молнии бьют по области.' },
      ] },
  ],
  und: [
    { key: 'h1', name: 'Мордред', title: 'Рыцарь-предатель', hp: 2400, dmg: 47, rate: 1.1, range: 24, speed: 88, cost: 900, armor: 0.25, r: 15, style: 'warrior', cleave: 45,
      skills: [
        { name: 'Тень предательства', type: 'aura', lvl: 1, radius: 250, stat: 'aspd', v: 0.2, desc: 'Пассивно: союзники рядом атакуют на 20% быстрее.' },
        { name: 'Кровавый рывок', type: 'dash', lvl: 2, range: 360, radius: 90, dmg: 140, stun: 0.6, cd: 12, desc: 'Рывок к точке: урон и оглушение врагов.' },
        { name: 'Ужас Камланна', type: 'debuff', lvl: 4, radius: 250, dur: 8, cd: 25, buffs: [['dmg', -0.35], ['spd', -0.3]], desc: 'Враги вокруг: −35% урона, −30% скорости.' },
        { name: 'Кларент', type: 'strike', lvl: 6, radius: 150, dmg: 410, cd: 45, desc: 'Проклятый меч рассекает всех врагов вокруг.' },
      ] },
    { key: 'h2', name: 'Хель', title: 'Владычица Хельхейма', hp: 1500, dmg: 31, rate: 1.3, range: 230, speed: 84, cost: 850, armor: 0.1, r: 13, style: 'caster', proj: 'shadow',
      skills: [
        { name: 'Дыхание Нифльхейма', type: 'heal', lvl: 1, range: 380, radius: 190, heal: 210, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Ледяная хватка', type: 'aoe', lvl: 2, range: 380, radius: 110, dmg: 70, stun: 2.5, cd: 16, fx: 'shadow', desc: 'Сковывает врагов в области на 2,5 секунды.' },
        { name: 'Мёртвые встают', type: 'summon', lvl: 4, unit: 'ghoul', squad: true, dur: 35, cd: 45, desc: 'Поднимает из земли батальон мертвецов.' },
        { name: 'Жатва душ', type: 'volley', lvl: 6, range: 450, radius: 190, count: 16, dmg: 62, cd: 50, fx: 'shadow', desc: 'Призрачные клинки обрушиваются на область.' },
      ] },
  ],
  des: [
    { key: 'h1', name: 'Анубис', title: 'Страж Дуата', hp: 2350, dmg: 48, rate: 1.0, range: 26, speed: 96, cost: 900, armor: 0.2, r: 15, style: 'warrior', cleave: 45,
      skills: [
        { name: 'Весы Маат', type: 'aura', lvl: 1, radius: 250, stat: 'dmg', v: 0.2, desc: 'Пассивно: союзники рядом наносят +20% урона.' },
        { name: 'Прыжок шакала', type: 'dash', lvl: 2, range: 400, radius: 85, dmg: 130, stun: 0.8, cd: 11, desc: 'Прыжок к точке: урон и оглушение.' },
        { name: 'Суд мёртвых', type: 'strike', lvl: 4, radius: 130, dmg: 260, stun: 1, cd: 18, desc: 'Удар хопешем по всем врагам вокруг.' },
        { name: 'Песчаная буря', type: 'aoe', lvl: 6, range: 420, radius: 210, dmg: 360, stun: 1.5, delay: 1, cd: 55, fx: 'quake', desc: 'Буря пустыни обрушивается на врагов.' },
      ] },
    { key: 'h2', name: 'Исида', title: 'Великая чародейка', hp: 1540, dmg: 31, rate: 1.3, range: 240, speed: 86, cost: 850, armor: 0.1, r: 13, style: 'caster', proj: 'holy',
      skills: [
        { name: 'Крылья Исиды', type: 'heal', lvl: 1, range: 400, radius: 210, heal: 230, cd: 11, desc: 'Лечит союзников в области.' },
        { name: 'Благословение Ра', type: 'buff', lvl: 2, radius: 280, dur: 10, cd: 26, buffs: [['dmg', 0.25], ['armor', 0.2]], desc: 'Союзники: +25% урона и +20% брони.' },
        { name: 'Солнечный диск', type: 'aoe', lvl: 4, range: 380, radius: 90, dmg: 220, cd: 12, fx: 'holy', desc: 'Луч солнца сжигает врагов в области.' },
        { name: 'Око Ра', type: 'volley', lvl: 6, range: 450, radius: 190, count: 15, dmg: 70, cd: 50, fx: 'star', desc: 'Огненные лучи бьют по всей области.' },
      ] },
  ],
};
const SUMMONS = {
  treant: { name: 'Дух леса', cls: 'siege', hp: 900, dmg: 42, rate: 1.4, range: 26, speed: 62, r: 17, armor: 0.2, aggro: 240 },
  ghoul:  { name: 'Навьи воины', cls: 'inf', n: 8, hp: 70, dmg: 7, rate: 1.0, range: 14, speed: 92, r: 7.5, armor: 0, aggro: 250 },
};

// ---------- build flat type table (index used over the network) ----------
const TYPES = [];
const DEF = {};
function addType(d) { d.ti = TYPES.length; TYPES.push(d); DEF[d.key] = d; return d; }
for (const rk of RACE_KEYS) {
  for (const cls of ['inf', 'spear', 'arch', 'cav', 'worker', 'siege']) {
    const [name, ov] = UNITS_BY_RACE[rk][cls];
    addType(Object.assign({ key: rk + '_' + cls, race: rk, kind: 'u', cls: cls === 'worker' ? 'inf' : cls, name, sub: cls }, UNIT_BASE[cls], ov));
  }
  for (const bk of Object.keys(BLD_BASE)) {
    const b = BLD_BASE[bk];
    const nm = (BLD_NAMES[rk] && BLD_NAMES[rk][bk]) || b.name;
    addType(Object.assign({ key: rk + '_' + bk, race: rk, kind: 'b', cls: 'bld', sub: bk, armor: 0.2, n: 1 }, b, { name: nm,
      trains: b.trains ? b.trains.map(t => t === 'hero' ? 'hero' : rk + '_' + t) : null }));
  }
  for (const h of HEROES[rk]) {
    addType(Object.assign({ race: rk, kind: 'u', cls: 'hero', sub: 'hero', pop: 0, n: 1, time: 20, aggro: 260 }, h,
      { key: rk + '_' + h.key, hero: true, heroName: h.name, name: h.name + ', ' + h.title }));
  }
}
// wild camps
const CREEPS = {
  wolf:   { name: 'Стая волков', cls: 'cav', n: 6, hp: 110, dmg: 9, rate: 1.0, range: 12, speed: 120, r: 9, armor: 0, aggro: 210, cost: 240 },
  troll:  { name: 'Пещерный тролль', cls: 'siege', hp: 1700, dmg: 55, rate: 1.7, range: 22, speed: 62, r: 19, armor: 0.2, aggro: 210, cost: 500, cleave: 34 },
  bandit: { name: 'Разбойники', cls: 'inf', n: 8, hp: 85, dmg: 8, rate: 1.0, range: 14, speed: 72, r: 7.5, armor: 0.05, aggro: 210, cost: 280 },
};
for (const sk of Object.keys(SUMMONS)) addType(Object.assign({ key: sk, race: sk === 'treant' ? 'elf' : 'orc', kind: 'u', sub: sk, summon: true, pop: 0, n: 1, cost: 60 }, SUMMONS[sk]));

for (const ck of Object.keys(CREEPS)) addType(Object.assign({ key: ck, race: ck === 'bandit' ? 'hum' : 'orc', kind: 'u', sub: ck, creep: true, pop: 0, n: 1 }, CREEPS[ck]));

const SKILL_GLYPH = { aura: '✺', dash: '➶', aoe: '✹', strike: '⚔', heal: '✚', buff: '▲', debuff: '▼', summon: '♣', volley: '☄' };
const FX_KINDS = ['arrow', 'bolt', 'javelin', 'holy', 'leaf', 'rune', 'shadow', 'hammer', 'fireball', 'boom', 'heal', 'buff', 'debuff', 'dash', 'mark', 'summon', 'star', 'lvl', 'farrow', 'boulder'];
const FX_IDX = {}; FX_KINDS.forEach((k, i) => FX_IDX[k] = i);
const FX_COLORS = { holy: '#fff1b0', fire: '#ff8a3a', nature: '#8fdc5a', roots: '#6aa84f', quake: '#c28b52', hammer: '#cfd8e0', shadow: '#a36bff', star: '#bfe3ff', def: '#ffd27a', poison: '#8dff7a', sun: '#ffd86a', rune: '#7fc8ff' };
// upgraded arrows look different for every people: fire, star-silver, runes, poison, sunfire
const ARROW_FX = { hum: 'fire', elf: 'star', dwf: 'rune', orc: 'fire', und: 'poison', des: 'sun' };
// signature auras of the heroes: colour (r,g,b), style (rise | orbit | crackle | swirl | drip), light colour
const HERO_FX = {
  hum_h1: ['255,215,110', 'rise', 1], hum_h2: ['255,245,190', 'orbit', 1], elf_h1: ['255,90,60', 'crackle', 1], elf_h2: ['200,225,255', 'orbit', 0],
  dwf_h1: ['150,200,255', 'crackle', 0], dwf_h2: ['255,170,90', 'orbit', 1], orc_h1: ['255,80,50', 'rise', 1], orc_h2: ['140,255,150', 'swirl', 0],
  und_h1: ['110,255,160', 'drip', 0], und_h2: ['170,230,255', 'swirl', 0], des_h1: ['240,200,120', 'swirl', 1], des_h2: ['255,225,140', 'orbit', 1],
};

// ---------- spell book: powers bought with points earned in battle (BFME2-style tree) ----------
const SPELLS = {
  heal:   { tier: 1, cd: 60, target: true, radius: 260, heal: 380, glyph: '✚' },
  gold:   { tier: 1, cd: 150, target: false, gold: 500, glyph: '⛃' },
  haste:  { tier: 1, cd: 90, target: false, dur: 20, glyph: '➹' },
  reinf:  { tier: 2, cd: 120, target: false, count: 2, glyph: '⚑' },
  rally:  { tier: 2, cd: 90, target: true, radius: 300, dur: 25, glyph: '▲' },
  curse:  { tier: 2, cd: 100, target: true, radius: 260, dur: 15, glyph: '▼' },
  meteor: { tier: 3, cd: 120, target: true, radius: 200, dmg: 380, delay: 1.6, glyph: '☄' },
  summon: { tier: 3, cd: 150, target: true, dur: 60, glyph: '♣' },
  ult:    { tier: 4, cd: 240, target: true, radius: 280, glyph: '✺' },
};
const SPELL_ORDER = ['heal', 'gold', 'haste', 'reinf', 'rally', 'curse', 'meteor', 'summon', 'ult'];
const SPELL_REQ = { reinf: ['heal', 'haste'], rally: ['haste', 'gold'], curse: ['heal', 'gold'], meteor: ['rally', 'curse'], summon: ['reinf', 'rally'], ult: ['meteor', 'summon'] }; // any one of these
const TIER_COST = [0, 1, 2, 3, 5];
const SPELL_NAMES = {
  hum: { heal: ['Святой Грааль', 'Лечит ваших воинов в области'], gold: ['Дань Камелота', '+500 золота в казну'], haste: ['Боевой рог', 'Вся армия получает +30% скорости на 20 с'],
    reinf: ['Зов Камелота', 'Два батальона прибывают к цитадели'], rally: ['Клятва рыцарей', 'Союзники в области: +30% урона и +20% брони на 25 с'], curse: ['Божий суд', 'Враги в области: −35% урона и скорости на 15 с'],
    meteor: ['Гнев небес', 'Огненный удар с неба по области'], summon: ['Паладины', 'Батальон святых рыцарей сражается 60 с'], ult: ['Экскалибур с небес', 'Гигантский меч сокрушает всё в огромной области'] },
  elf: { heal: ['Роса Авалона', 'Лечит ваших воинов в области'], gold: ['Дары фей', '+500 золота в казну'], haste: ['Ветер Сильваэна', 'Вся армия получает +30% скорости на 20 с'],
    reinf: ['Дикая охота', 'Два батальона прибывают к цитадели'], rally: ['Песнь рощи', 'Союзники в области: +30% урона и +20% брони на 25 с'], curse: ['Сонные чары', 'Враги в области: −35% урона и скорости на 15 с'],
    meteor: ['Звёздный дождь', 'Небесный удар по области'], summon: ['Духи леса', 'Два древесных духа сражаются 60 с'], ult: ['Пробуждение леса', 'Пять древних энтов встают из земли и лечат союзников'] },
  dwf: { heal: ['Мёд поэзии', 'Лечит ваших воинов в области'], gold: ['Жила мифрила', '+500 золота в казну'], haste: ['Зов горна', 'Вся армия получает +30% скорости на 20 с'],
    reinf: ['Эйнхерии', 'Два батальона прибывают к цитадели'], rally: ['Клятва предков', 'Союзники в области: +30% урона и +20% брони на 25 с'], curse: ['Руна страха', 'Враги в области: −35% урона и скорости на 15 с'],
    meteor: ['Гнев Асгарда', 'Молния с небес по области'], summon: ['Стражи Валгаллы', 'Два батальона героев-ветеранов сражаются 60 с'], ult: ['Буря Тора', 'Град молний бьёт по огромной области'] },
  orc: { heal: ['Кровавый пир', 'Лечит ваших воинов в области'], gold: ['Грабёж', '+500 золота в казну'], haste: ['Барабаны войны', 'Вся армия получает +30% скорости на 20 с'],
    reinf: ['Орда встаёт', 'Два батальона прибывают к цитадели'], rally: ['Боевой клич', 'Союзники в области: +30% урона и +20% брони на 25 с'], curse: ['Проклятие шамана', 'Враги в области: −35% урона и скорости на 15 с'],
    meteor: ['Огонь Тартара', 'Пламя из-под земли по области'], summon: ['Пещерные тролли', 'Два тролля сражаются 60 с'], ult: ['Огненный змей', 'Дракон выжигает полосу через поле боя'] },
  und: { heal: ['Чаша крови', 'Лечит ваших воинов в области'], gold: ['Могильное золото', '+500 золота в казну'], haste: ['Вой банши', 'Вся армия получает +30% скорости на 20 с'],
    reinf: ['Зов из могил', 'Два батальона прибывают к цитадели'], rally: ['Клятва мертвецов', 'Союзники в области: +30% урона и +20% брони на 25 с'], curse: ['Мор', 'Враги в области: −35% урона и скорости на 15 с'],
    meteor: ['Падающая звезда Хель', 'Удар мёртвого огня по области'], summon: ['Восставшие', 'Два батальона мертвецов сражаются 60 с'], ult: ['Армия Хельхейма', 'Враги в области цепенеют от ужаса, из земли встают три батальона мертвецов'] },
  des: { heal: ['Воды Нила', 'Лечит ваших воинов в области'], gold: ['Сокровища гробниц', '+500 золота в казну'], haste: ['Ветер пустыни', 'Вся армия получает +30% скорости на 20 с'],
    reinf: ['Легионы фараона', 'Два батальона прибывают к цитадели'], rally: ['Гимн Ра', 'Союзники в области: +30% урона и +20% брони на 25 с'], curse: ['Проклятие гробниц', 'Враги в области: −35% урона и скорости на 15 с'],
    meteor: ['Гнев Ра', 'Солнечное пламя с неба по области'], summon: ['Колесницы Ра', 'Отряд боевых колесниц сражается 60 с'], ult: ['Кара Сета', 'Песчаная буря волнами накрывает огромную область и замедляет врагов'] },
};
// power points: level n is reached at 25n + 5n² experience (first point at the start)
const powerLevelAt = xp => { let n = 0; while (25 * (n + 1) + 5 * (n + 1) * (n + 1) <= xp) n++; return n + 1; };
const powerNeed = lvl => 25 * lvl + 5 * lvl * lvl;
