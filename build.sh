#!/bin/bash
# Сборка игры из src/ в один файл: index.html (самостоятельная версия) и dist/artifact.html (для публикации на claude.ai)
set -e
cd "$(dirname "$0")"
# new generated models are shrunk to their budget first (npm i once; see tools/optimize-models.mjs)
[ -d node_modules/@gltf-transform ] && node tools/optimize-models.mjs
# the claude.ai copy carries the smallest models inside (it cannot fetch files); the website copy (index.html, gallery.html)
# only lists them and fetches each people's models from assets/ in parallel, so the menu opens at once
ASSETS="const ASSET_DATA = {}; const ASSET_LIST = [];"
LIST="const ASSET_DATA = {}; const ASSET_LIST = [];"
EMB=0
for f in $(ls -Sr assets/*.glb 2>/dev/null); do n=$(basename "$f" .glb); ASSETS="$ASSETS ASSET_LIST.push('$n');"; LIST="$LIST ASSET_LIST.push('$n');"; sz=$(stat -c%s "$f"); if [ $((EMB + sz)) -le 6291456 ]; then EMB=$((EMB + sz)); ASSETS="$ASSETS ASSET_DATA['$n'] = '$(base64 -w0 "$f")';"; fi; done
CODE=$(cat src/data.js src/engine.js src/map.js src/ai.js src/net.js src/audio.js src/r3d.js src/models.js src/buildings3d.js src/render.js src/icons.js src/props3d.js src/render3d.js src/assets3d.js src/main.js)
JS="$ASSETS
$CODE"
mkdir -p dist
{ cat src/shell.html; echo '<script>'; echo '"use strict";'; echo "$JS"; echo '</script>'; } > dist/artifact.html
JS="$LIST
$CODE"
{ echo '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><meta name="theme-color" content="#1d211a"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" type="image/png" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/apple-180.png"><script>if ("serviceWorker" in navigator && location.protocol !== "file:") addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));</script>'; sed 's#</style>#</style></head><body>#' src/shell.html; echo '<script>'; echo '"use strict";'; echo "$JS"; echo '</script></body></html>'; } > index.html
# model gallery: every hero, soldier and building on a turntable
GJS=$(cat src/data.js src/engine.js src/map.js src/net.js src/r3d.js src/models.js src/buildings3d.js src/render.js src/render3d.js src/assets3d.js src/gallery.js)
{ echo '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#12140f">'; sed 's#</style>#</style></head><body>#' src/gallery.html; echo '<script>'; echo '"use strict";'; echo "$LIST"; echo "$GJS"; echo '</script></body></html>'; } > gallery.html
# syntax check of both bundles: a broken build never reaches the site
for f in index.html gallery.html; do node -e "const s=require('fs').readFileSync('$f','utf8');const i=s.lastIndexOf('<script>'),j=s.lastIndexOf('</script>');require('fs').writeFileSync('.check.js',s.slice(i+8,j))" && node --check .check.js || { echo "SYNTAX ERROR in $f"; rm -f .check.js; exit 1; }; done; rm -f .check.js
wc -c index.html dist/artifact.html gallery.html
