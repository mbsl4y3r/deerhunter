// Deer Hunter end-to-end suite. Runs headless Chromium against both file://
// (double-click support) and http://. Usage: node run-tests.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8931;
const SHOTS = path.join(ROOT, 'test', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

const EXE = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const results = [];
let browser, server;

function ok(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: cond ? '' : String(detail || '') });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  — ' + detail}`);
}

async function newPage(url) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    // asset PNG probes 404 by design; anything else is a real error
    if (m.type() === 'error' && !m.text().includes('Failed to load resource')) {
      page.errors.push('console: ' + m.text());
    }
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__DH && window.__DH.state() !== 'BOOT', null, { timeout: 5000 });
  return page;
}

const D = (page, fn, ...args) =>
  page.evaluate(([f, a]) => window.__DH[f](...a), [fn, args]);

// Bullets travel, so aim ahead of the target: predict its position after the
// bullet's flight time and shoot there. Returns the flight time to warp past.
async function leadClick(page, tgt) {
  return page.evaluate(([x, y, vx, vy]) => {
    const t0 = window.__DH.flightTime(x, y);
    const ax = x + vx * t0, ay = y + vy * t0;
    const t = window.__DH.flightTime(ax, ay);
    window.__DH.click(ax, ay);
    return t;
  }, [tgt.x, tgt.y, tgt.vx || 0, tgt.vy || 0]);
}

// lead a shot at the target's HEAD hitbox
async function page_headshot(page, tgt) {
  return page.evaluate(([hx, hy, vx, vy]) => {
    const t0 = window.__DH.flightTime(hx, hy);
    const ax = hx + vx * t0, ay = hy + vy * t0;
    const t = window.__DH.flightTime(ax, ay);
    window.__DH.click(ax, ay);
    return t;
  }, [tgt.hx, tgt.hy, tgt.vx || 0, tgt.vy || 0]);
}

// scripted player: clears the current HUNTING site by shooting every buck
async function playSite(page) {
  let guard = 0;
  while (guard++ < 400) {
    const st = await D(page, 'state');
    if (st !== 'HUNTING') return st;
    const { buck, shells } = await page.evaluate(() => ({
      buck: window.__DH.animals().find((a) => a.role === 'buck' && a.onScreen &&
        ['cross', 'graze', 'flee'].includes(a.state)),
      shells: window.__DH.shells(),
    }));
    if (buck) {
      if (shells === 0) { await D(page, 'rclick'); await D(page, 'warp', 0.6); }
      const t = await leadClick(page, buck);
      await D(page, 'warp', t + 0.15);
    } else {
      await D(page, 'warp', 0.5);
    }
  }
  return 'STUCK';
}

// works across all three minigames: ducks/bottles are led in flight,
// alley critters are stationary pop-ups; skunks report shootable=false
async function playBonus(page) {
  let guard = 0;
  while (guard++ < 300) {
    const st = await D(page, 'state');
    if (st !== 'BONUS') return st;
    const { tgt, shells } = await page.evaluate(() => ({
      tgt: window.__DH.animals().find((a) => a.shootable && a.onScreen &&
        ['fly', 'up'].includes(a.state)),
      shells: window.__DH.shells(),
    }));
    if (tgt) {
      if (shells === 0) { await D(page, 'rclick'); await D(page, 'warp', 0.6); }
      const t = await leadClick(page, tgt);
      await D(page, 'warp', t + 0.12);
    } else {
      await D(page, 'warp', 0.4);
    }
  }
  return 'STUCK';
}

async function clickCard(page, i) {
  const c = await D(page, 'cardAt', i);
  await D(page, 'click', c.x, c.y);
}

async function canvasHasContent(page) {
  return page.evaluate(() => {
    const c = document.getElementById('game');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, 960, 540).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4801 * 4) colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
    return colors.size;
  });
}

async function main() {
  server = spawn('python3', ['-m', 'http.server', String(PORT), '-d', ROOT, '--bind', '127.0.0.1'], { stdio: 'ignore' });
  browser = await chromium.launch({ headless: true, executablePath: EXE });
  for (let i = 0; i < 40; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/index.html`); break; }
    catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  const HTTP = `http://127.0.0.1:${PORT}/index.html?test=1&seed=42&nosound=1`;
  const FILE = `file://${ROOT}/index.html?test=1&seed=42&nosound=1`;

  // 1 — boots from file:// (double-click support) with no errors
  {
    const p = await newPage(FILE);
    await D(p, 'warp', 1);
    ok('boots via file:// to TITLE', (await D(p, 'state')) === 'TITLE');
    ok('no page errors on file://', p.errors.length === 0, p.errors.join(' | '));
    await p.screenshot({ path: `${SHOTS}/01-title.png` });
    await p.close();
  }

  // 2 — menu flow into hunting
  {
    const p = await newPage(HTTP);
    await D(p, 'click', 480, 300);
    ok('title click → TREK_SELECT', (await D(p, 'state')) === 'TREK_SELECT');
    await p.screenshot({ path: `${SHOTS}/02-trek-select.png` });
    await clickCard(p, 0);
    ok('trek card → SITE_INTRO', (await D(p, 'state')) === 'SITE_INTRO');
    await D(p, 'warp', 2);
    ok('intro auto-advances → HUNTING', (await D(p, 'state')) === 'HUNTING');
    ok('starts with 3 shells', (await D(p, 'shells')) === 3);
    await D(p, 'warp', 3.5);
    await p.screenshot({ path: `${SHOTS}/03-hunting-forest.png` });
    ok('forest scene renders content', (await canvasHasContent(p)) > 5);

    // 3 — kill a buck (bullets travel: the shot must be led and take time)
    const buck = (await D(p, 'animals')).find((a) => a.role === 'buck' && a.onScreen);
    ok('a buck is on screen', !!buck);
    const scorePreKill = await D(p, 'score');
    const flight = await leadClick(p, buck);
    ok('shell consumed at trigger pull', (await D(p, 'shells')) === 2);
    ok('no score before the bullet lands', (await D(p, 'score')) === scorePreKill);
    await D(p, 'warp', flight + 0.1);
    const killed = (await D(p, 'animals')).find((a) => a.role === 'buck');
    ok('led shot drops the buck at impact', killed && killed.state === 'dying', JSON.stringify(killed));
    ok('kill scores points', (await D(p, 'score')) > scorePreKill);
    await D(p, 'warp', 0.15);
    await p.screenshot({ path: `${SHOTS}/04-kill.png` });

    // 4 — empty gun + both reload paths
    await D(p, 'warp', 0.2); await D(p, 'click', 100, 80);
    await D(p, 'warp', 0.2); await D(p, 'click', 100, 80);
    ok('gun empties after 3 shots', (await D(p, 'shells')) === 0);
    const scoreBefore = await D(p, 'score');
    await D(p, 'warp', 0.2); await D(p, 'click', 100, 80);
    ok('dry fire keeps score & shells', (await D(p, 'shells')) === 0 && (await D(p, 'score')) === scoreBefore);
    await D(p, 'rclick'); await D(p, 'warp', 0.6);
    ok('right-click reloads to 3', (await D(p, 'shells')) === 3);
    await D(p, 'warp', 0.2); await D(p, 'click', 100, 80);
    await D(p, 'key', ' '); await D(p, 'warp', 0.6);
    ok('space also reloads', (await D(p, 'shells')) === 3);
    // on-screen reload button (the mobile path)
    await D(p, 'warp', 0.2); await D(p, 'click', 100, 80);
    ok('spent a shell for the button test', (await D(p, 'shells')) === 2);
    await D(p, 'click', 100, 505);            // tap the RELOAD button
    ok('tap on reload button does not fire', (await D(p, 'shells')) === 2);
    await D(p, 'warp', 0.6);
    ok('reload button refills shells', (await D(p, 'shells')) === 3);

    // 4b — headshots land on the painted head and pay 1.5×
    await D(p, 'forceSpawn', 'buck', 3);
    await D(p, 'warp', 2.6);
    // the forced buck: trophy 3, walking (slow vx) in the mid lane (vitals
    // y ≈ 330) — any buck matching that scores exactly the asserted 975
    const hsBuck = (await D(p, 'animals')).filter((a) => a.role === 'buck' &&
      a.trophy === 3 && Math.abs(a.vx) < 60 && a.y > 300 && a.y < 370 &&
      ['cross', 'graze'].includes(a.state)).pop();
    const hsScore = await D(p, 'score');
    const hsFlight = await page_headshot(p, hsBuck);
    await D(p, 'warp', hsFlight + 0.1);
    // deer 400 × mid-lane 1.25 × walk 1.0 × head 1.5 × trophy-3 1.3 = 975
    ok('headshot pays the 1.5× head multiplier', (await D(p, 'score')) === hsScore + 975,
       `delta=${(await D(p, 'score')) - hsScore}`);

    // 5 — doe penalty ends the site
    await D(p, 'forceSpawn', 'doe');
    await D(p, 'warp', 1.5);
    const doe = (await D(p, 'animals')).find((a) => a.role === 'doe');
    const s0 = await D(p, 'score');
    const doeFlight = await leadClick(p, doe);
    await D(p, 'warp', doeFlight + 0.1);
    ok('doe hit costs 1000', (await D(p, 'score')) === s0 - 1000);
    await D(p, 'warp', 2);
    ok('doe hit ends the site', (await D(p, 'state')) === 'SITE_RESULTS');
    await p.screenshot({ path: `${SHOTS}/05-site-over.png` });
    await p.close();
  }

  // 5b — wide-canvas mode (phone landscape): layout fills and stays composed
  {
    const p = await newPage(HTTP + '&w=1176');
    await D(p, 'warp', 1);
    ok('wide canvas boots to TITLE', (await D(p, 'state')) === 'TITLE');
    await D(p, 'click', 588, 300);
    ok('wide canvas: title → TREK_SELECT', (await D(p, 'state')) === 'TREK_SELECT');
    await clickCard(p, 0);                    // forest card, recentered for w=1176
    await D(p, 'warp', 2);
    ok('wide canvas: card click starts hunt', (await D(p, 'state')) === 'HUNTING');
    await D(p, 'warp', 3.5);
    ok('wide scene renders content', (await canvasHasContent(p)) > 5);
    ok('no page errors in wide mode', p.errors.length === 0, p.errors.join(' | '));
    await p.setViewportSize({ width: 1176, height: 540 });
    await p.screenshot({ path: `${SHOTS}/11-wide-landscape.png` });
    await p.close();
  }

  // 6 — full game: every trek + rotating bonus games to FINAL_RESULTS
  {
    const p = await newPage(HTTP);
    await p.evaluate(() => localStorage.clear());
    const trekCount = await p.evaluate(() => window.DH.data.treks.length);
    await D(p, 'click', 480, 300);
    let trekN = 0, guard = 0, reportShot = false;
    const envShot = { 1: '06-hunting-mountain.png', 2: '07-hunting-tundra.png', 3: '12-hunting-canyon.png' };
    const bonusShot = { 1: '13-bonus-bottles.png', 2: '14-bonus-critters.png' };
    while (guard++ < 140) {
      const st = await D(p, 'state');
      if (st === 'TREK_SELECT') { await clickCard(p, trekN); continue; }
      if (st === 'SITE_INTRO') { await D(p, 'warp', 2); continue; }
      if (st === 'HUNTING') {
        if (envShot[trekN]) { await D(p, 'warp', 3); await p.screenshot({ path: `${SHOTS}/${envShot[trekN]}` }); delete envShot[trekN]; }
        await playSite(p);
        continue;
      }
      if (st === 'SITE_RESULTS' || st === 'TREK_RESULTS') {
        if (st === 'SITE_RESULTS' && !reportShot) {
          reportShot = true;
          await D(p, 'warp', 0.5);
          await p.screenshot({ path: `${SHOTS}/15-shot-report.png` });
        }
        await D(p, 'click', 480, 300);
        continue;
      }
      if (st === 'BONUS') {
        if (trekN === 0) { await D(p, 'warp', 4); await p.screenshot({ path: `${SHOTS}/08-bonus-ducks.png` }); }
        if (bonusShot[trekN]) { await D(p, 'warp', 4); await p.screenshot({ path: `${SHOTS}/${bonusShot[trekN]}` }); delete bonusShot[trekN]; }
        await playBonus(p);
        continue;
      }
      if (st === 'BONUS_RESULTS') { trekN++; await D(p, 'click', 480, 300); continue; }
      if (st === 'FINAL_RESULTS') break;
      await D(p, 'warp', 0.5);
    }
    ok(`completes all ${trekCount} treks → FINAL_RESULTS`, (await D(p, 'state')) === 'FINAL_RESULTS');
    ok('played every trek', trekN === trekCount, `trekN=${trekN}`);
    const finalScore = await D(p, 'score');
    ok('final score is substantial', finalScore > 20000, `score=${finalScore}`);
    await p.screenshot({ path: `${SHOTS}/09-final-results.png` });
    ok('no page errors across full game', p.errors.length === 0, p.errors.join(' | '));

    // high-score entry (names run up to 4 letters now)
    await D(p, 'click', 480, 300);
    ok('qualifying score → HISCORE_ENTRY', (await D(p, 'state')) === 'HISCORE_ENTRY');
    for (const k of ['D', 'H', 'X', 'L']) await D(p, 'key', k);
    await D(p, 'key', 'Enter');
    ok('initials confirm → HISCORES', (await D(p, 'state')) === 'HISCORES');
    const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('dh.highscores') || '[]'));
    ok('4-letter name persisted to localStorage', stored.length === 1 && stored[0].initials === 'DHXL' && stored[0].score === finalScore,
       JSON.stringify(stored));
    await p.screenshot({ path: `${SHOTS}/10-hiscores.png` });
    // survives reload
    await p.reload();
    await p.waitForFunction(() => window.__DH && window.__DH.state() === 'TITLE');
    const stored2 = await p.evaluate(() => JSON.parse(localStorage.getItem('dh.highscores') || '[]'));
    ok('high score survives reload', stored2.length === 1 && stored2[0].initials === 'DHXL');
    await p.close();
  }

  // 6b — bonus minigames head-on: bottles smash for points, skunks cost you
  {
    const p = await newPage(HTTP);
    await p.evaluate(() => { window.DH.G.trekIndex = 1; window.__DH.skipToState('BONUS'); });
    await D(p, 'warp', 3.5);
    const bottle = (await D(p, 'animals')).find((a) => a.shootable && a.state === 'fly' && a.onScreen);
    ok('bottle blitz lobs bottles', !!bottle, JSON.stringify(await D(p, 'animals')));
    const bScore = await D(p, 'score');
    const bt = await leadClick(p, bottle);
    await D(p, 'warp', bt + 0.1);
    ok('smashed bottle pays 200', (await D(p, 'score')) === bScore + 200,
       `delta=${(await D(p, 'score')) - bScore}`);

    await p.evaluate(() => { window.DH.G.trekIndex = 2; window.__DH.skipToState('BONUS'); });
    let racc = null, guard = 0;
    while (!racc && guard++ < 40) {
      await D(p, 'warp', 0.4);
      racc = (await D(p, 'animals')).find((a) => a.shootable && a.state === 'up');
    }
    ok('critter alley pops raccoons', !!racc);
    const rScore = await D(p, 'score');
    await D(p, 'click', racc.x, racc.y);
    await D(p, 'warp', 1.0);
    ok('raccoon pays 300', (await D(p, 'score')) === rScore + 300,
       `delta=${(await D(p, 'score')) - rScore}`);
    // a skunk eventually pops and is flagged unshootable for bots
    let skunk = null; guard = 0;
    while (!skunk && guard++ < 60) {
      await D(p, 'warp', 0.4);
      skunk = (await D(p, 'animals')).find((a) => !a.shootable && a.state === 'up');
    }
    ok('skunks pop flagged as no-shoot', !!skunk);
    const sScore = await D(p, 'score');
    await D(p, 'rclick'); await D(p, 'warp', 0.7);
    await D(p, 'click', skunk.x, skunk.y);
    await D(p, 'warp', 1.0);
    ok('shooting a skunk costs 500', (await D(p, 'score')) === sScore - 500,
       `delta=${(await D(p, 'score')) - sScore}`);
    ok('no page errors in minigames', p.errors.length === 0, p.errors.join(' | '));
    await p.close();
  }

  // 6c — scoped rifle: hold to scope (no shot), release fires; pause menu
  {
    const p = await newPage(HTTP + '&rich=1');
    await p.evaluate(() => { window.DH.shop.buy('scope98'); });
    ok('rich mode buys the Marksman 98', await p.evaluate(() => window.DH.shop.equipped === 'scope98'));
    await D(p, 'click', 480, 300);
    await clickCard(p, 0);
    await D(p, 'warp', 2);
    await D(p, 'warp', 6);
    const buck = (await D(p, 'animals')).find((a) => a.role === 'buck' && a.onScreen);
    await D(p, 'press', buck.x, buck.y);
    await D(p, 'warp', 0.3);
    ok('held press scopes without firing', (await D(p, 'shells')) === 3);
    const s0 = await D(p, 'score');
    const tgt = (await D(p, 'animals')).find((a) => a.role === 'buck' && a.onScreen);
    const t = await p.evaluate(([x, y, vx]) => {
      const t0 = window.__DH.flightTime(x, y);
      window.__DH.release(x + vx * t0, y);
      return t0;
    }, [tgt.x, tgt.y, tgt.vx]);
    await D(p, 'warp', t + 0.15);
    ok('release fires the scoped shot', (await D(p, 'shells')) === 2);
    ok('scoped kill pays the 1.25× gun bonus', (await D(p, 'score')) > s0, `score=${await D(p, 'score')}`);
    // pause menu → END TREK bails to trek results
    await D(p, 'click', 938, 156);
    await D(p, 'warp', 0.1);
    const frozen = await D(p, 'score');
    await D(p, 'warp', 1.5);
    ok('pause freezes the site', (await D(p, 'score')) === frozen && (await D(p, 'state')) === 'HUNTING');
    await D(p, 'click', 480, 312);           // END TREK EARLY
    ok('END TREK bails to trek results', (await D(p, 'state')) === 'TREK_RESULTS');
    ok('no page errors in scope/pause test', p.errors.length === 0, p.errors.join(' | '));
    await p.evaluate(() => window.DH.shop._reset());
    await p.close();
  }

  // 7 — gun shop: open, buy, equip, capacity applies, persists
  {
    const p = await newPage(HTTP);
    await p.evaluate(() => window.DH.shop._reset());
    await D(p, 'click', 480, 300);
    await D(p, 'click', 480, 487);                       // GUN SHOP button
    ok('shop opens from trek select', (await D(p, 'state')) === 'SHOP');
    const r = await p.evaluate(() => {
      window.DH.shop.earn(100000);                       // $20,000
      return {
        bought: window.DH.shop.buy('lever30'),
        upg: window.DH.shop.buyUpgrade('slick'),
        equipped: window.DH.shop.equipped,
        cash: window.DH.shop.cash,
      };
    });
    ok('buys gun + upgrade with kill cash', r.bought && r.upg && r.equipped === 'lever30',
       JSON.stringify(r));
    await D(p, 'skipToState', 'TREK_SELECT');
    await D(p, 'click', 176, 290);
    await D(p, 'warp', 2);
    ok('lever rifle hunts with 4 rounds', (await D(p, 'shells')) === 4);
    await p.reload();
    await p.waitForFunction(() => window.__DH && window.__DH.state() === 'TITLE');
    ok('shop purchases persist across reload',
       (await p.evaluate(() => window.DH.shop.equipped)) === 'lever30');
    await p.evaluate(() => window.DH.shop._reset());
    await p.close();
  }

  // 8 — determinism: same seed ⇒ identical world
  {
    const snap = async () => {
      const p = await newPage(HTTP);
      await D(p, 'click', 480, 300);
      await D(p, 'click', 176, 290);
      await D(p, 'warp', 2);
      await D(p, 'warp', 8);
      const s = JSON.stringify(await D(p, 'animals'));
      await p.close();
      return s;
    };
    const [a, b2] = [await snap(), await snap()];
    ok('same seed produces identical animals', a === b2, `${a} vs ${b2}`);
  }

  await browser.close();
  server.kill();
  const fails = results.filter((r) => !r.pass);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  if (browser) browser.close();
  if (server) server.kill();
  process.exit(1);
});
