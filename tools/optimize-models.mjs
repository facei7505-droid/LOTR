// Сжатие сгенерированных моделей (Tripo3D / Meshy) под бюджет игры: `npm run models`
// Новые или заменённые файлы в assets/ оригиналом уходят в assets/src/ (не в git), на их место пишется облегчённая версия:
// сетка упрощается до бюджета по типу модели, текстуры уменьшаются и переводятся в WebP, Draco/meshopt снимаются
// (загрузчик игры их не читает), из файлов анимаций (_idle/_walk/_attack/_death) выбрасываются меши и текстуры.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, prune, simplify, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const args = process.argv.slice(2), dirArg = args.indexOf('--dir');
const DIR = path.resolve(dirArg >= 0 ? args[dirArg + 1] : 'assets'), SRC = path.join(DIR, 'src'), MANIFEST = path.join(DIR, 'optimized.json');
const FORCE = args.includes('--force');
// triangles and texture size per kind of model (see the prompts page)
function budget(name) {
  if (/_(idle|walk|attack|atk|death)$/.test(name)) return { clip: true };
  if (/_(weapon|shield)$/.test(name)) return { tris: 2000, tex: 512 };
  if (/_h[12]$/.test(name)) return { tris: 20000, tex: 2048 };
  if (/_fort$/.test(name)) return { tris: 30000, tex: 2048 };
  if (/_wall$/.test(name)) return { tris: 6000, tex: 1024 };
  if (/_gate$/.test(name)) return { tris: 12000, tex: 1024 };
  if (/_(cav|siege)$/.test(name)) return { tris: 15000, tex: 2048 };
  if (/_(farm|barr|range|stable|forge|tower)$/.test(name)) return { tris: 20000, tex: 1024 };
  return { tris: 8000, tex: 1024 }; // soldiers, workers, wild creatures
}
function triangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    if (p.getMode() !== 4) continue;
    const idx = p.getIndices(), pos = p.getAttribute('POSITION');
    n += (idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3;
  }
  return Math.round(n);
}
const hash = file => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
const kb = b => (b / 1024).toFixed(0) + ' КБ';

await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder,
});
let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (e) {}
fs.mkdirSync(SRC, { recursive: true });
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.glb'));
let done = 0;
for (const f of files) {
  const name = f.slice(0, -4), file = path.join(DIR, f), st = fs.statSync(file), mark = hash(file);
  if (!FORCE && manifest[name] === mark) continue; // already ours
  const B = budget(name), before = st.size;
  const orig = path.join(SRC, f);
  if (!(FORCE && fs.existsSync(orig))) fs.copyFileSync(file, orig); // keep the original out of git
  try {
    const doc = await io.read(orig), t0 = triangles(doc);
    if (B.clip) { // an animation-only file: bones and clips are all the game needs
      for (const m of doc.getRoot().listMeshes()) m.dispose();
      for (const m of doc.getRoot().listMaterials()) m.dispose();
      for (const t of doc.getRoot().listTextures()) t.dispose();
      await doc.transform(resample(), prune());
    } else {
      const steps = [dedup(), weld()];
      if (t0 > B.tris) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: B.tris / t0, error: 0.04, lockBorder: false }));
      steps.push(resample(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [B.tex, B.tex], quality: 86 }));
      await doc.transform(...steps);
    }
    for (const ext of doc.getRoot().listExtensionsUsed()) if (/draco|meshopt/i.test(ext.extensionName)) ext.dispose();
    await io.write(file, doc);
    const after = fs.statSync(file), t1 = triangles(doc);
    manifest[name] = hash(file); done++;
    console.log(name.padEnd(22), B.clip ? 'анимация'.padEnd(22) : (t0 + ' → ' + t1 + ' треуг.').padEnd(22), kb(before) + ' → ' + kb(after.size));
  } catch (e) { console.error(name, 'не удалось сжать:', e.message); }
}
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
console.log(done ? 'Готово: ' + done + ' файл(ов).' : 'Новых моделей нет.');
