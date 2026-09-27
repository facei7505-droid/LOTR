// ================= I18N: English layer over the Russian interface =================
// The game is written in Russian; when English is chosen every piece of text that reaches the page is looked up in
// I18N_EN (i18n/en-*.json, merged by build.sh). Numbers are matched as '#', and composite lines ("Люди · Речная долина · 0:00",
// "Лимит армии 12/30") are split on separators and number tails, so one entry covers every value. Canvas text goes through L().
const I18N = {
  lang: 'ru', cache: new Map(), miss: new Set(), // phrases with no translation yet (read them in the console: [...I18N.miss])
  init() {
    let l = null; try { l = JSON.parse(localStorage.getItem('ak_lang')); } catch (e) {}
    if (l !== 'ru' && l !== 'en') l = /^ru|^uk|^be|^kk/i.test(navigator.language || 'ru') ? 'ru' : 'en';
    this.lang = l; document.documentElement.lang = l;
  },
  set(l) { try { localStorage.setItem('ak_lang', JSON.stringify(l)); } catch (e) {} location.reload(); },
};
const I18N_CYR = /[А-Яа-яЁё]/, I18N_NUM = /\d+(?:[.,]\d+)?/g, I18N_SEPS = [/(\s+[·—–]\s+|\s+\/\s+)/, /(:\s+|;\s+)/, /(\.\s+)/, /(,\s+)/]; // coarse to fine
// one phrase, numbers taken out and put back in order
function i18nWord(s) {
  if (!I18N_CYR.test(s) || typeof I18N_EN === 'undefined') return s;
  const nums = s.match(I18N_NUM) || [], key = s.replace(I18N_NUM, '#');
  let t = I18N_EN[key];
  if (t === undefined) { const k2 = key.replace(/[.!?…]+$/, ''); if (k2 !== key && I18N_EN[k2] !== undefined) t = I18N_EN[k2] + key.slice(k2.length); }
  if (t === undefined) return null;
  let i = 0; return t.replace(/#/g, () => nums[i++] !== undefined ? nums[i - 1] : '#');
}
function i18nText(s) {
  if (!s || !I18N_CYR.test(s)) return s;
  const hit = I18N.cache.get(s); if (hit !== undefined) return hit;
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim();
  let out = i18nWord(core);
  if (out === null) {
    // wrapping symbols and punctuation, then separators, then a number tail or head
    const m = core.match(/^([«"(\[✦⚔⚜🎲✔★+\-−•]*\s*)(.*?)([»")\]!?.…:;,✔★]*)$/);
    if (m && (m[1] || m[3]) && m[2]) { const w = i18nText(m[2]); if (w !== m[2]) out = m[1] + w + m[3]; }
    for (const sep of I18N_SEPS) { // split on the coarsest separator present; each piece is tried whole first
      if (out !== null || !sep.test(core)) continue;
      const parts = core.split(sep), tr = parts.map((p, k) => k % 2 ? p : i18nText(p));
      if (tr.some((p, k) => p !== parts[k])) out = tr.join('');
    }
    if (out === null) { const m2 = core.match(/^(.*?[А-Яа-яЁё.])(\s*[\d#][\d\s/%:.,×+\-−]*)$/); if (m2) { const w = i18nWord(m2[1].trim()); if (w !== null) out = w + m2[2]; } }
    if (out === null) { const m3 = core.match(/^([\d\s/%:.,×+\-−]+)(.*)$/); if (m3 && m3[2]) { const w = i18nText(m3[2]); if (w !== m3[2]) out = m3[1] + w; } }
    if (out === null) { out = core; if (I18N.miss.size < 400) I18N.miss.add(core); }
  }
  const r = lead + out + tail; if (I18N.cache.size > 5000) I18N.cache.clear(); I18N.cache.set(s, r); return r;
}
function L(s) { return I18N.lang === 'en' ? i18nText(s) : s; }
// translate a DOM subtree in place: text nodes and the attributes people read
const skip0 = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
function i18nNode(root) {
  if (I18N.lang !== 'en' || !root) return;
  const doText = n => { const v = n.nodeValue; if (v && I18N_CYR.test(v)) { const t = i18nText(v); if (t !== v) n.nodeValue = t; } };
  const doEl = el => { for (const a of ['title', 'aria-label', 'placeholder', 'alt']) { const v = el.getAttribute && el.getAttribute(a); if (v && I18N_CYR.test(v)) el.setAttribute(a, i18nText(v)); } if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit') && I18N_CYR.test(el.value)) el.value = i18nText(el.value); };
  if (root.nodeType === 3) { if (!(root.parentNode && skip0[root.parentNode.tagName])) doText(root); return; }
  if (root.nodeType !== 1) return;
  if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE' || root.isContentEditable) return;
  doEl(root);
  const skip = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => n.nodeType === 1 && skip[n.tagName] ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  for (let n = w.nextNode(); n; n = w.nextNode()) { if (n.nodeType === 3) doText(n); else doEl(n); }
}
function i18nStart() {
  I18N.init();
  if (I18N.lang !== 'en') return;
  document.title = i18nText(document.title);
  i18nNode(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') { const t = m.target; if (t.parentNode && t.parentNode.tagName !== 'TEXTAREA' && !(t.parentNode.tagName === 'INPUT')) i18nNode(t); }
      else if (m.type === 'attributes') { if (m.target.nodeType === 1 && ['title', 'aria-label', 'placeholder'].includes(m.attributeName)) { const v = m.target.getAttribute(m.attributeName); if (v && I18N_CYR.test(v)) m.target.setAttribute(m.attributeName, i18nText(v)); } }
      else for (const n of m.addedNodes) i18nNode(n);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder'] });
}

i18nStart();
