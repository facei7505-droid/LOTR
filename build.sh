#!/bin/bash
# Сборка игры из src/ в один файл: index.html (самостоятельная версия) и dist/artifact.html (для публикации на claude.ai)
set -e
cd "$(dirname "$0")"
# downloaded glTF models (assets/*.glb) are embedded so the game also works from a local file
ASSETS="const ASSET_DATA = {};"
for f in assets/*.glb; do [ -f "$f" ] && ASSETS="$ASSETS ASSET_DATA['$(basename "$f" .glb)'] = '$(base64 -w0 "$f")';"; done
JS=$(cat src/data.js src/engine.js src/map.js src/ai.js src/net.js src/audio.js src/r3d.js src/models.js src/buildings3d.js src/render.js src/icons.js src/render3d.js src/assets3d.js src/main.js)
JS="$ASSETS
$JS"
mkdir -p dist
{ cat src/shell.html; echo '<script>'; echo '"use strict";'; echo "$JS"; echo '</script>'; } > dist/artifact.html
{ echo '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no"><meta name="theme-color" content="#1d211a"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">'; sed 's#</style>#</style></head><body>#' src/shell.html; echo '<script>'; echo '"use strict";'; echo "$JS"; echo '</script></body></html>'; } > index.html
wc -c index.html dist/artifact.html
