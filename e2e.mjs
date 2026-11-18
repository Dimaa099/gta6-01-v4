// PALMA HEAT — end-to-end test (Playwright, headless Chromium).
// Serves this repo with a tiny static server, boots the game, and checks:
//   1. the page loads with zero console errors
//   2. the WebGL canvas exists and renders non-blank pixels
//   3. the start screen is visible; clicking Start runs the game
//   4. the player moves with WASD
//   5. the minimap canvas actually draws
//   6. the enter-car flow works (via the window.__palma debug handle)
//   7. forcing wanted >= 2 spawns a police car
//   8. captures the 4 entry screenshots into screenshots/ as JPG
// Run: npm run test:e2e   (needs `npm install` once for playwright-core)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('.', import.meta.url));
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.md': 'text/markdown', '.ts': 'text/plain',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (url.pathname === '/') path = join(root, 'game', 'index.html');
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const base = 'http://127.0.0.1:' + port;

function findChromium() {
  const candidates = [
    join(homedir(), 'workspace/tools/chrome-headless-shell-linux64/chrome-headless-shell'),
    join(homedir(), '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell'),
    join(homedir(), '.cache/ms-playwright/chromium-1255/chrome-linux/chrome'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return undefined; // let playwright-core use its default resolution
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || '' });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? ' — ' + detail : ''));
}

let browser;
try {
  browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  await page.goto(base + '/game/index.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => window.__palma && window.__palma.version, null, { timeout: 15000 });
  await page.waitForTimeout(1200);

  check('page loads with zero console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  const glInfo = await page.evaluate(() => {
    const c = document.getElementById('gl');
    const dataUrl = c.toDataURL('image/png');
    return { exists: !!c, width: c.width, height: c.height, dataLen: dataUrl.length };
  });
  check('WebGL canvas exists', glInfo.exists && glInfo.width > 100, glInfo.width + 'x' + glInfo.height);
  check('WebGL canvas renders non-blank pixels', glInfo.dataLen > 20000, 'png data ' + glInfo.dataLen + ' chars');

  const startVisible = await page.evaluate(() =>
    !document.getElementById('start-screen').classList.contains('hidden'));
  check('start screen visible', startVisible);
  await page.screenshot({ path: join(root, 'screenshots', '1-start.jpg'), type: 'jpeg', quality: 72 });

  await page.click('#start-btn');
  await page.waitForTimeout(700);
  const modeAfterStart = await page.evaluate(() => window.__palma.state.mode);
  check('click Start -> game running', modeAfterStart === 'playing', 'mode=' + modeAfterStart);

  // WASD movement (hold W)
  const before = await page.evaluate(() => window.__palma.state.playerPos);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2600);
  await page.keyboard.up('KeyW');
  const after = await page.evaluate(() => window.__palma.state.playerPos);
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  check('player moves with WASD', moved > 1.0, 'moved ' + moved.toFixed(2) + ' m');

  // minimap draws
  const mm = await page.evaluate(() => {
    const c = document.getElementById('minimap');
    const g = c.getContext('2d');
    const img = g.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < img.length; i += 4 * 37) {
      colors.add(img[i] + ',' + img[i + 1] + ',' + img[i + 2]);
    }
    return colors.size;
  });
  check('minimap canvas draws', mm > 5, mm + ' distinct sampled colours');

  // enter-car flow
  const carPos = await page.evaluate(() => window.__palma.nearestCarPos());
  check('a car exists to enter', !!carPos, carPos ? ('at ' + carPos.x.toFixed(0) + ',' + carPos.z.toFixed(0)) : 'none');
  const entered = await page.evaluate(() => window.__palma.enterCar());
  await page.waitForTimeout(300);
  const inCar = await page.evaluate(() => window.__palma.state.inCar);
  check('enter-car flow works', entered && inCar);

  // drive shot: speed up + wanted for a chase frame
  await page.evaluate(() => {
    window.__palma.setWanted(2);
    if (window.__palma.player.inCar) window.__palma.player.inCar.speed = 13;
  });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1100);
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: join(root, 'screenshots', '2-drive.jpg'), type: 'jpeg', quality: 72 });

  // police spawn assertion
  let policeCount = 0;
  for (let i = 0; i < 14; i++) {
    policeCount = await page.evaluate(() => window.__palma.state.policeCount);
    if (policeCount >= 1) break;
    await page.waitForTimeout(500);
  }
  check('wanted >= 2 spawns police', policeCount >= 1, 'policeCount=' + policeCount);

  // mission shot: on foot near the glowing pickup marker
  await page.evaluate(() => {
    window.__palma.exitCar();
    window.__palma.setWanted(0);
    window.__palma.startMission();
    const m = window.__palma.missions;
    if (m.pickup) window.__palma.teleport(m.pickup.x - 13, m.pickup.z - 13);
  });
  await page.waitForTimeout(900);
  const missionState = await page.evaluate(() => window.__palma.state.missionState);
  check('mission chain starts', missionState === 'pickup', 'state=' + missionState);
  await page.screenshot({ path: join(root, 'screenshots', '3-mission.jpg'), type: 'jpeg', quality: 72 });

  // vista shot from the promenade
  await page.evaluate(() => window.__palma.teleport(-30, 177));
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(root, 'screenshots', '4-vista.jpg'), type: 'jpeg', quality: 72 });

  check('no console errors during gameplay', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (err) {
  check('e2e run completes', false, String(err && err.message || err));
} finally {
  if (browser) await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
process.exit(failed.length ? 1 : 0);
