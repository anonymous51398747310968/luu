// Mechanical sprite slicing, registration and WebP packaging; illustrations
// and expression changes are made by the image-generation tool.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(process.argv[2] || path.join(root, 'assets/source-manifest.json'), 'utf8'));
const manifest = { version: 1, characters: {}, icons: {}, enemies: {}, backgrounds: {}, sources: [] };
const out = path.join(root, 'assets');
for (const dir of ['characters', 'icons', 'enemies', 'backgrounds', 'reference']) fs.mkdirSync(path.join(out, dir), { recursive: true });

async function alphaBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, right = 0, top = info.height, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 16) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (left > right || top > bottom) throw new Error('Empty generated sprite');
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

(async () => {
  for (const group of config.groups) {
    const source = fs.readFileSync(path.resolve(root, group.source));
    const meta = await sharp(source).metadata();
    const reference = `assets/reference/${group.id}.webp`;
    const refBuffer = await sharp(source).webp({ lossless: true }).toBuffer();
    fs.writeFileSync(path.join(root, reference), refBuffer);
    manifest.sources.push({ id: group.id, file: reference, sha256: crypto.createHash('sha256').update(refBuffer).digest('hex'), kind: group.kind, columns: group.columns, rows: group.rows, cells: group.cells, ...(group.rowCuts ? { rowCuts: group.rowCuts } : {}), ...(group.columnCuts ? { columnCuts: group.columnCuts } : {}), ...(group.face ? { face: group.face } : {}) });
    const cells = [];
    for (const cell of group.cells) {
      const col = cell.index % group.columns, row = Math.floor(cell.index / group.columns);
      const xs = group.columnCuts || Array.from({ length: group.columns + 1 }, (_, i) => Math.round(meta.width * i / group.columns));
      const ys = group.rowCuts || Array.from({ length: group.rows + 1 }, (_, i) => Math.round(meta.height * i / group.rows));
      const region = cell.region || { left: xs[col], top: ys[row], width: xs[col + 1] - xs[col], height: ys[row + 1] - ys[row] };
      const buffer = await sharp(source).extract(region).png().toBuffer();
      cells.push({ ...cell, buffer, bounds: group.kind === 'backgrounds' ? null : await alphaBounds(buffer) });
    }
    // A single registration scale per character preserves size across expressions.
    const scales = {};
    for (const cell of cells) if (cell.bounds) {
      const { width, height } = cell.bounds;
      const fit = group.kind === 'characters' ? Math.min(344 / width, 440 / height) : Math.min(468 / width, 456 / height);
      scales[cell.id] = Math.min(scales[cell.id] ?? Infinity, fit);
    }
    for (const cell of cells) {
      let image, file;
      if (group.kind === 'backgrounds') {
        file = `assets/backgrounds/${cell.id}.webp`;
        image = sharp(cell.buffer).webp({ quality: 88 });
        manifest.backgrounds[cell.id] = file;
      } else {
        const scale = cell.scale || scales[cell.id], w = group.kind === 'characters' ? 384 : 512, h = group.kind === 'characters' ? 480 : 512;
        const registered = await sharp(cell.buffer).extract(cell.bounds).resize(Math.round(cell.bounds.width * scale), Math.round(cell.bounds.height * scale)).png().toBuffer();
        const rm = await sharp(registered).metadata();
        const canvas = await sharp({ create: { width: w, height: h, channels: 4, background: '#00000000' } }).composite([{ input: registered, left: Math.round((w - rm.width) / 2), top: h - 20 - rm.height }]).png().toBuffer();
        const expression = cell.expression || 'n';
        file = `assets/${group.kind}/${cell.id}${group.kind === 'characters' ? '-' + expression : ''}.webp`;
        image = sharp(canvas).webp({ quality: 86, alphaQuality: 100 });
        if (group.kind === 'characters') {
          (manifest.characters[cell.id] ||= {})[expression] = file;
          const face = cell.face || group.face || { left: 42, top: 20, width: 300, height: 254 };
          const icon = `assets/icons/${cell.id}-${expression}.webp`;
          await sharp(canvas).extract(face).resize(96, 96, { fit: 'cover' }).webp({ quality: 88, alphaQuality: 100 }).toFile(path.join(root, icon));
          (manifest.icons[cell.id] ||= {})[expression] = icon;
        } else manifest.enemies[cell.id] = file;
      }
      await image.toFile(path.join(root, file));
    }
  }
  for (const [id, aliases] of Object.entries(config.aliases || {})) for (const [ex, from] of Object.entries(aliases)) {
    if (!manifest.characters[id]?.[from]) throw new Error(`Missing alias source ${id}:${from}`);
    manifest.characters[id][ex] = manifest.characters[id][from]; manifest.icons[id][ex] = manifest.icons[id][from];
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ characters: Object.keys(manifest.characters).length, enemies: Object.keys(manifest.enemies).length, backgrounds: Object.keys(manifest.backgrounds).length }));
})().catch(error => { console.error(error); process.exitCode = 1; });
