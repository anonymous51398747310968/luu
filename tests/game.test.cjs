const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
let server, browser, origin;
const root = path.resolve(__dirname, '..');
before(async () => {
  server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.webp') ? 'image/webp' : 'application/octet-stream'); res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
async function pageFor(viewport = { width: 390, height: 844 }) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
  await page.route('https://fonts.**/*', route => route.abort());
  await page.goto(origin + '/' + encodeURIComponent('ルゥと月のこもりうた.html'));
  await page.evaluate(() => { OPT.sound = false; }); return page;
}
test('removing an HP accessory keeps displayed and battle HP within the new maximum', async () => {
  const page = await pageFor();
  try {
    await page.evaluate(() => { newGame(); G.accOwned.push('cushion'); G.acc.lou = 'cushion'; G.hp.lou = 36; renderArea(); openMenu('party'); });
    await page.click('[data-act="eq:lou"]'); await page.click('[data-act="eqs:lou:"]');
    assert.match(await page.locator('.cb small').first().textContent(), /HP 32\/32/);
    assert.equal(await page.evaluate(() => partyUnit(G, 'lou').hp), 32);
  } finally { await page.close(); }
});
test('invalid saved state does not offer a Continue button that crashes', async () => {
  const page = await pageFor();
  try {
    for (const value of ['{}', 'null', '[]', '{"party":["unknown"],"loc":"village"}']) {
      await page.evaluate(value => { localStorage.setItem(SAVE_KEY, value); titleScreen(); }, value);
      assert.equal(await page.locator('[data-act="cont"]').count(), 0, value);
    }
    await page.evaluate(() => { newGame(); save(); titleScreen(); });
    assert.equal(await page.locator('[data-act="cont"]').count(), 1);
    await page.click('[data-act="cont"]'); assert.equal(await page.evaluate(() => mode), 'area');
  } finally { await page.close(); }
});
test('boss and action warning fit on small portrait and landscape screens', async () => {
  const page = await pageFor();
  try {
    for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 390, height: 660 }]) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => { newGame(); G.party = ['lou', 'choco', 'mashu']; startBattle(['golem'], {}, () => {}); });
      const box = await page.evaluate(() => {
        const stage = document.querySelector('#stage').getBoundingClientRect(), intent = document.querySelector('.intent').getBoundingClientRect(), foe = document.querySelector('.foe').getBoundingClientRect();
        return { stageTop: stage.top, stageBottom: stage.bottom, intentTop: intent.top, foeBottom: foe.bottom, width: document.documentElement.scrollWidth };
      });
      assert.ok(box.intentTop >= box.stageTop, JSON.stringify({ viewport, box }));
      assert.ok(box.foeBottom <= box.stageBottom, JSON.stringify({ viewport, box }));
      assert.ok(box.width <= viewport.width, 'horizontal overflow');
    }
  } finally { await page.close(); }
});
test('failed diary writes do not claim the game was saved', async () => {
  const page = await pageFor();
  try {
    await page.evaluate(() => { newGame(); renderArea(); memeMenu(renderArea); Storage.prototype.setItem = () => { throw new DOMException('Storage unavailable', 'QuotaExceededError'); }; });
    await page.click('[data-act="memesave"]');
    const text = await page.locator('#panel').textContent(); assert.doesNotMatch(text, /セーブしました/); assert.match(text, /セーブでき/);
  } finally { await page.close(); }
});
test('conversation portraits use generated images and keep their position across expressions', async () => {
  const page = await pageFor({ width: 320, height: 568 });
  try {
    await page.evaluate(() => { newGame(); runScene(['lou:n:……'], () => {}); SR.full(); });
    assert.equal(await page.locator('.por.L img').count(), 1, 'generated portrait must replace the SVG');
    const positions = [];
    for (const ex of ['n', 'h', 'c', 'a', 'o', 's']) {
      await page.evaluate(ex => placePor('lou', ex), ex);
      await page.waitForFunction(() => [...document.querySelectorAll('.por img')].every(i => i.complete && i.naturalWidth > 0));
      positions.push(await page.locator('.por.L img').boundingBox());
    }
    assert.ok(positions.every(p => JSON.stringify(p) === JSON.stringify(positions[0])), 'expression switching changed the registration');
    const stage = await page.locator('#stage').boundingBox();
    assert.ok(positions[0].y >= stage.y && positions[0].y + positions[0].height <= stage.y + stage.height);
  } finally { await page.close(); }
});
test('backgrounds and every enemy use generated artwork', async () => {
  const page = await pageFor();
  try {
    assert.equal(await page.locator('#bg img').count(), 1, 'generated title backdrop');
    const enemies = await page.evaluate(() => Object.keys(ENEMIES));
    for (const id of enemies) {
      await page.evaluate(id => { newGame(); startBattle([id], {}, () => {}); }, id);
      assert.equal(await page.locator('.fs img').count(), 1, id);
      await page.waitForFunction(() => [...document.querySelectorAll('.fs img')].every(i => i.complete && i.naturalWidth > 0));
    }
  } finally { await page.close(); }
});

test('original story and choices are preserved; every used portrait expression exists', async () => {
  const page = await pageFor();
  try {
    const { canonical, uses } = await page.evaluate(() => {
      const uses = [];
      function canon(v) {
        if (typeof v === 'string') {
          const m = v.match(/^([a-z_]+):([a-z]?):/); if (m) uses.push([m[1] === 'q' ? 'knight' : m[1], m[2] || 'n']);
          return v.replace(/^([a-z_]+):[a-z]?:/, '$1::');
        }
        if (Array.isArray(v)) return v.filter(c => !c?.por).map(canon);
        if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, canon(x)]));
        return v;
      }
      return { canonical: JSON.stringify(canon(SC)), uses };
    });
    const hash = require('node:crypto').createHash('sha256').update(canonical).digest('hex');
    assert.equal(hash, require('./story-baseline.json').sha256, 'narrative or choice behavior changed');
    const art = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
    for (const [id, ex] of uses) assert.ok(art.characters[id]?.[ex], `missing ${id}:${ex}`);
    for (const kind of ['characters', 'icons', 'enemies', 'backgrounds']) {
      const files = kind === 'characters' || kind === 'icons' ? Object.values(art[kind]).flatMap(Object.values) : Object.values(art[kind]);
      for (const file of files) assert.ok(fs.statSync(path.join(root, file)).size > 0, file);
    }
  } finally { await page.close(); }
});

test('native and expanded dungeon saves remain resumable; broken queue entries are rejected', async () => {
  const page = await pageFor();
  try {
    const result = await page.evaluate(() => {
      newGame(); const results = [];
      for (const [id, d] of Object.entries(DUNGEONS)) {
        G.cur = id; G.dunProg[id] = { q: JSON.parse(JSON.stringify(d.steps)), i: 0 };
        results.push([id, validSave(G)]);
        const branch = G.dunProg[id].q.find(s => s.t === 'branch');
        if (branch) { G.dunProg[id].q.push(...branch.a.steps, ...branch.b.steps); results.push([id + ':expanded', validSave(G)]); }
      }
      save(); results.push(['reload', !!loadSave()]);
      G.dunProg.castle.q.push({ t: 'scene', s: 'not-a-scene' }); results.push(['bad', validSave(G)]);
      return results;
    });
    for (const [id, valid] of result) assert.equal(valid, id !== 'bad', id);
  } finally { await page.close(); }
});

test('all four battle actions fit the smallest supported portrait screen', async () => {
  const page = await pageFor({ width: 320, height: 568 });
  try {
    await page.evaluate(() => { newGame(); G.party = ['lou', 'choco', 'mashu']; startBattle(['golem'], {}, () => {}); });
    for (const lateGame of [false, true]) {
      if (lateGame) await page.evaluate(() => { G.bonus = { hp: 16, atk: 1, def: 1, sp: 1 }; G.flags.toast = true; G.flags.voice = true; G.accOwned = ['bell']; G.acc.choco = 'bell'; startBattle(['hollow2'], { final: true }, () => {}); });
      for (const action of ['atk', 'skill', 'guard', 'item']) {
        const rect = await page.locator(`[data-act="c:${action}"]`).boundingBox();
        assert.ok(rect.y >= 0 && rect.y + rect.height <= 568, `${action} requires scrolling (lateGame=${lateGame}): ${JSON.stringify(rect)}`);
        assert.ok(rect.height >= 44, 'touch target is too short');
      }
    }
  } finally { await page.close(); }
});

test('battle target selection, guard, revival, retry and saved continuation work with image art', async () => {
  const page = await pageFor();
  try {
    await page.evaluate(() => { newGame(); G.party = ['lou', 'choco', 'mashu']; G.items.drop = 1; startBattle(['gumin', 'matango'], {}, () => {}); BT.B.party.find(p => p.id === 'mashu').hp = 0; beginInput(); });
    await page.click('[data-act="c:atk"]'); await page.click('#panel [data-act="tgt:e0"]');
    assert.equal(await page.evaluate(() => BT.cmds.lou.t), 'e0');
    await page.click('[data-act="c:prev"]');
    await page.click('[data-act="c:item"]'); await page.click('[data-act="it:drop"]');
    assert.equal(await page.evaluate(() => BT.cmds.lou.id), 'drop');
    assert.equal(await page.evaluate(() => BT.cmds.lou.t), 'mashu');
    await page.click('[data-act="c:guard"]');
    await page.evaluate(() => { while (BT?.busy) skipExec(); });
    assert.equal(await page.evaluate(() => G.items.drop), 0);
    assert.ok(await page.evaluate(() => BT.B.party.find(p => p.id === 'mashu').hp > 0));
    await page.evaluate(() => { BT.B.over = 'lose'; finishBattle(); });
    await page.click('[data-act="retry"]');
    assert.equal(await page.evaluate(() => mode), 'battle');
    assert.equal(await page.evaluate(() => G.items.drop), 1, 'retry did not restore the battle snapshot');
    await page.evaluate(() => { newGame(); G.cur = 'forest'; G.dunProg.forest = { q: JSON.parse(JSON.stringify(DUNGEONS.forest.steps)), i: 2 }; save(); titleScreen(); });
    await page.click('[data-act="cont"]');
    assert.equal(await page.evaluate(() => mode), 'dungeon');
    assert.equal(await page.evaluate(() => curP().i), 2);
  } finally { await page.close(); }
});

test('title loading is bounded and reference sheets are never requested by the game', async () => {
  const page = await browser.newPage(); const files = [];
  page.on('request', r => { if (r.url().includes('/assets/')) files.push(decodeURIComponent(new URL(r.url()).pathname.slice(1))); });
  try {
    await page.route('https://fonts.**/*', r => r.abort());
    await page.goto(origin + '/' + encodeURIComponent('ルゥと月のこもりうた.html'));
    await page.waitForFunction(() => document.querySelector('#bg img')?.complete);
    assert.deepEqual(files, ['assets/backgrounds/title.webp']);
    assert.ok(fs.statSync(path.join(root, files[0])).size < 250000, 'startup backdrop too heavy');
    assert.ok(files.every(f => !f.includes('/reference/')));
  } finally { await page.close(); }
});

test('all five dungeons reach the ending and produce a resumable clear save', async () => {
  const page = await pageFor(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    const result = await require('./playthrough.cjs')(page);
    assert.deepEqual(result, { cleared: true, saved: true, voice: true, toast: true });
    assert.deepEqual(errors, []);
    await page.evaluate(() => titleScreen()); await page.click('[data-act="cont"]');
    assert.equal(await page.evaluate(() => mode), 'end');
  } finally { await page.close(); }
});

test('registered full-body sprites keep clear transparent borders', async () => {
  const sharp = require('sharp');
  const art = JSON.parse(fs.readFileSync(path.join(root, 'assets/manifest.json'), 'utf8'));
  for (const [kind, files] of [['characters', [...new Set(Object.values(art.characters).flatMap(Object.values))]], ['enemies', Object.values(art.enemies)]]) {
    for (const file of files) {
      const { data, info } = await sharp(path.join(root, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      assert.deepEqual([info.width, info.height], kind === 'characters' ? [384, 480] : [512, 512], file);
      for (let x = 0; x < info.width; x++) {
        assert.equal(data[x * 4 + 3], 0, file + ' top border');
        assert.equal(data[((info.height - 1) * info.width + x) * 4 + 3], 0, file + ' bottom border');
      }
      for (let y = 0; y < info.height; y++) {
        assert.equal(data[(y * info.width) * 4 + 3], 0, file + ' left border');
        assert.equal(data[(y * info.width + info.width - 1) * 4 + 3], 0, file + ' right border');
      }
    }
  }
});
