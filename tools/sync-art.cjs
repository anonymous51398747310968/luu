const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'ルゥと月のこもりうた.html');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
const { characters, icons, enemies, backgrounds } = manifest;
const html = fs.readFileSync(file, 'utf8');
if (!/^const ART = .*;$/m.test(html)) throw new Error('ART manifest marker missing');
fs.writeFileSync(file, html.replace(/^const ART = .*;$/m, 'const ART = ' + JSON.stringify({ characters, icons, enemies, backgrounds }) + ';'));
