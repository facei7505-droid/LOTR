#!/bin/bash
# Сборка игры из src/ в один файл: index.html (самостоятельная версия) и dist/artifact.html (для публикации на claude.ai)
set -e
cd "$(dirname "$0")"
# downloaded glTF models (assets/*.glb) are embedded so the game also works from a local file
# the smallest models are embedded up to 6 MB in total (the game then works from a local file); the rest load from assets/ over http
ASSETS="const ASSET_DATA = {}; const ASSET_LIST = [];"
EMB=0
for f in $(ls -Sr assets/*.glb 2>/dev/null); do n=$(basename "$f" .glb); ASSETS="$ASSETS ASSET_LIST.push('$n');"; sz=$(stat -c%s "$f"); if [ $((EMB + sz)) -le 6291456 ]; then EMB=$((EMB + sz)); ASSETS="$ASSETS ASSET_DATA['$n'] = '$(base64 -w0 "$f")';"; fi; done
JS=$(cat src/data.js src/engine.js src/map.js src/ai.js src/net.js src/audio.js src/r3d.js src/models.js src/buildings3d.js src/render.js src/icons.js src/render3d.js src/assets3d.js src/main.js)
JS="$ASSETS
$JS"
mkdir -p dist
{ cat src/shell.html; echo '<script>'; echo '"use strict";'; echo "$JS"; echo '</script>'; } > dist/artifact.html
{ echo '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><meta name="theme-color" content="#1d211a"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">'; sed 's#</style>#</style></head><body>#' src/shell.html; echo '<script>'; echo '"use strict";'; echo "$JS"; echo '</script></body></html>'; } > index.html
# model gallery: every hero, soldier and building on a turntable
GJS=$(cat src/data.js src/engine.js src/map.js src/net.js src/r3d.js src/models.js src/buildings3d.js src/render.js src/render3d.js src/assets3d.js src/gallery.js)
{ echo '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#12140f">'; sed 's#</style>#</style></head><body>#' src/gallery.html; echo '<script>'; echo '"use strict";'; echo "$ASSETS"; echo "$GJS"; echo '</script></body></html>'; } > gallery.html
wc -c index.html dist/artifact.html gallery.html
