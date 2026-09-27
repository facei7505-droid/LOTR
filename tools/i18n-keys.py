# Extracts every Russian phrase the game can show, normalised the way src/i18n.js looks them up
# (text between tags, split on " · ", " — ", ": ", numbers → #). Writes i18n/_keys.json grouped by source file.
# usage: python tools/i18n-keys.py   (then translate the new keys in i18n/en.json)
import re, json, os

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SEP = re.compile(r"\s+[·—–]\s+|:\s+|\s+/\s+|\n")
CYR = re.compile('[А-Яа-яЁё]')
SQ = re.compile(r"'((?:[^'\\\n]|\\.)*)'")
DQ = re.compile(r'"((?:[^"\\\n]|\\.)*)"')
BQ = re.compile(r'`((?:[^`\\]|\\.)*)`')
TX = re.compile(r'>([^<>]*)<')


def norm(t):
    t = re.sub(r'<[^>]*>', '\n', t).replace('&nbsp;', ' ').replace('&amp;', '&')
    out = []
    for piece in t.split('\n'):
        for seg in SEP.split(piece):
            seg = seg.strip(" \t,.;!?()[]«»\"'+")
            if CYR.search(seg):
                out.append(re.sub(r'\d+([.,]\d+)?', '#', seg))
    return out


keys = {}
for f in ['src/data.js', 'src/main.js', 'src/engine.js', 'src/net.js', 'src/gallery.js', 'src/shell.html', 'src/gallery.html']:
    s = open(f, encoding='utf-8').read()
    lits = SQ.findall(s) + DQ.findall(s) + BQ.findall(s) + (TX.findall(s) if f.endswith('.html') else [])
    for lit in lits:
        if not CYR.search(lit):
            continue
        for k in norm(lit.replace("\\'", "'").replace('\\n', '\n')):
            keys.setdefault(k, f)
by = {}
for k, f in keys.items():
    by.setdefault(f, []).append(k)
os.makedirs('i18n', exist_ok=True)
json.dump(by, open('i18n/_keys.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(keys), 'keys,', sum(len(k) for k in keys), 'chars;', {f: len(v) for f, v in by.items()})
