import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
import { BACKGROUNDS } from './asset-map.mjs';

// No browser, storage, authoring edits, or deletion. Run --snapshot before building.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(root, process.env.ASSET_AUDIT_DIST || 'tmp/asset-audit-v040');
const out = path.resolve(root, process.env.ASSET_AUDIT_OUT || 'tmp/asset-audit-v040-evidence');
const exclusions = JSON.parse(fs.readFileSync(path.join(root, 'scripts/delivery-exclusions.json'), 'utf8'));
const excluded = name => exclusions.some(entry => entry.endsWith('/') ? name.startsWith(entry) : name === entry);
const blur = exclusions.filter(name => name.endsWith('_blur.webp'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(directory, entry.name);
  return entry.isDirectory() ? files(full) : [full];
});
const sourceSnapshot = () => Object.fromEntries(blur.flatMap(name => {
  const id = path.basename(name).replace('_blur.webp', '');
  const original = BACKGROUNDS.find(background => background.id === id);
  assert.ok(original, `Authoring mapping exists: ${id}`);
  return [`public/${name}`, `assets/background/${original.file}`];
}).map(name => {
  const bytes = fs.readFileSync(path.join(root, name));
  return [name, { bytes: bytes.length, sha256: hash(bytes) }];
}));
fs.mkdirSync(out, { recursive: true });
const snapshotFile = path.join(out, 'sources-before-build.json');
if (process.argv.includes('--snapshot')) {
  fs.writeFileSync(snapshotFile, JSON.stringify(sourceSnapshot(), null, 2));
  console.log(`PASS preserved-source baseline: ${Object.keys(sourceSnapshot()).length} paths`);
  process.exit(0);
}

assert.equal(blur.length, 12);
const preserved = sourceSnapshot();
assert.deepEqual(preserved, JSON.parse(fs.readFileSync(snapshotFile, 'utf8')), 'All public blur and mapped authoring originals remain byte-identical');
assert.equal(blur.reduce((total, name) => total + preserved[`public/${name}`].bytes, 0), 112622);
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'classroom-manifest.json'), 'utf8'));
const byUrl = new Map(manifest.assets.map(asset => [asset.url, asset]));
assert.equal(byUrl.size, manifest.assets.length, 'Manifest has no duplicates');
for (const entry of exclusions) assert.equal(fs.existsSync(path.resolve(dist, entry)), false, `Excluded deployment path: ${entry}`);
for (const asset of manifest.assets) {
  assert.equal(excluded(asset.url.replace(/^\.\//, '')), false, `Excluded manifest entry: ${asset.url}`);
  const bytes = fs.readFileSync(path.join(dist, asset.url));
  assert.equal(bytes.length, asset.bytes, `Manifest size: ${asset.url}`);
  assert.equal(hash(bytes), asset.revision, `Manifest SHA: ${asset.url}`);
}
const publicFiles = files(path.join(root, 'public')).map(full => path.relative(path.join(root, 'public'), full).replaceAll('\\', '/'));
const deliveredPublic = publicFiles.filter(name => !excluded(name));
for (const name of deliveredPublic) assert.ok(byUrl.has(`./${name}`), `Every retained public asset belongs to offline preparation: ${name}`);
assert.equal(manifest.assets.length, deliveredPublic.length + manifest.assets.filter(asset => !publicFiles.includes(asset.url.slice(2))).length);

const runtimeFiles = [...files(path.join(root, 'src')), path.join(root, 'index.html'), ...files(path.join(root, 'public'))]
  .filter(full => /\.(ts|js|css|html|json)$/.test(full));
const referenceFiles = [], backgrounds = new Set(), directPaths = new Set();
for (const full of runtimeFiles) {
  const source = fs.readFileSync(full, 'utf8');
  const name = path.relative(root, full).replaceAll('\\', '/');
  for (const candidate of blur) assert.equal(source.includes(path.basename(candidate).replace('.webp', '')), false, `Excluded background has no runtime literal: ${name}`);
  // A future dynamic blur suffix must be manually reviewed instead of silently excluded.
  for (const line of source.split(/\r?\n/)) {
    if (line.includes('_blur')) {
      assert.ok(line.includes('bg_main_gate_blur.webp'), `Review new dynamic/literal blur reference in ${name}`);
      referenceFiles.push(name);
    }
  }
  for (const match of source.matchAll(/\bbg_[a-z_]+\b/g)) backgrounds.add(match[0]);
  for (const match of source.matchAll(/['"(]((?:\.\/|\/)?(?:assets|fonts|icons)\/[a-zA-Z0-9_/.-]+\.(?:webp|png|jpe?g|svg|json|woff2|ogg|mp3|mp4))(?=['"?)])/g)) directPaths.add(match[1].replace(/^(?:\.\/|\/)/, ''));
}
for (const background of backgrounds) directPaths.add(`assets/backgrounds/${background}.webp`);
for (const name of directPaths) assert.ok(byUrl.has(`./${name}`), `Referenced public path is delivered and offline-listed: ${name}`);
assert.ok(byUrl.has('./assets/backgrounds/bg_main_gate_blur.webp'), 'Referenced main-gate blur retained');
const generatedText = files(dist).filter(full => /\.(js|css|html|webmanifest)$/.test(full));
for (const full of generatedText) {
  const source = fs.readFileSync(full, 'utf8');
  for (const candidate of blur) assert.equal(source.includes(path.basename(candidate)), false, `Excluded URL absent from built static/SW text: ${full}`);
}

const server = await preview({ root, configFile: path.join(root, 'vite.config.ts'), build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0, open: false } });
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
const http = [];
try {
  for (const name of blur) {
    const response = await fetch(`${origin}/${name}`, { headers: { accept: 'image/webp' } });
    assert.equal(response.status, 404, `Excluded image HTTP 404: ${name}`);
    http.push({ path: name, status: response.status });
  }
  const response = await fetch(`${origin}/assets/backgrounds/bg_main_gate_blur.webp`);
  assert.equal(response.status, 200);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), byUrl.get('./assets/backgrounds/bg_main_gate_blur.webp').revision);
  http.push({ path: 'assets/backgrounds/bg_main_gate_blur.webp', status: response.status });
} finally { await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())); }
const report = { date: new Date().toISOString(), dist: path.relative(root, dist), manifestVersion: manifest.version,
  offlineAssetCount: manifest.assets.length, offlineBytes: manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0),
  removedBlurCount: blur.length, removedBlurBytes: 112622, preservedSources: preserved,
  retainedBlurReferences: [...new Set(referenceFiles)], checkedBackgroundIds: [...backgrounds].sort(),
  checkedDirectPublicReferences: [...directPaths].sort(), checkedGeneratedTextFiles: generatedText.length,
  http, browserUsed: false,
  limits: 'This verifies manifest completeness/SHA and generated static/HTTP availability. It does not repeat a browser download-and-disconnect journey. Arbitrary future computed paths require source review; an added _blur reference fails this guard.' };
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(report, null, 2));
console.log(`PASS unused blur delivery: 12 files / 112622 B excluded, ${manifest.assets.length} offline assets verified, sources unchanged, 12 HTTP 404 + retained blur HTTP 200`);
