// Turns art/src/*.png into js/artdata.js (data-URI WebP layers).
// - keys solid-magenta (#FF00FF) regions to transparency with edge despill
// - patches the generator's sparkle watermark (bottom-right) where it sits
//   over real pixels
// Uses the playwright installed in test/: node art/process.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(ROOT, 'test', 'package.json'))('playwright');

// key: chroma-key magenta; patch: rect to overwrite with pixels sampled from
// `from` (same size, same rows to keep gradients seamless); q: webp quality
const LAYERS = [
  { name: 'forest_sky',    file: 'forest_sky.png',    key: false, q: 0.82,
    patch: { x: 880, y: 445, w: 120, h: 80, fromX: 740 } },
  { name: 'forest_far',    file: 'forest_far.png',    key: true,  q: 0.82 },
  { name: 'forest_mid',    file: 'forest_mid.png',    key: true,  q: 0.85 },
  { name: 'forest_ground', file: 'forest_ground.png', key: false, q: 0.85,
    patch: { x: 880, y: 445, w: 120, h: 80, fromX: 720 } },
  { name: 'forest_front',  file: 'forest_front.png',  key: true,  q: 0.82,
    patch: { x: 908, y: 458, w: 55, h: 60, fromX: 848 } },
];

// Spritesheets: sliced into per-frame sprites sized to the game's registered
// sprite boxes (deer box = 176×171, anchor bottom-center, facing right).
// take = which cells to keep; fit 'h' scales the sheet so the tallest frame
// fills `fill` of the box height ('w' = widest frame, box width).
const SHEETS = [
  { file: 'deer_buck_walk_sheet.png', cells: 4, take: [0, 1, 2, 3],
    names: ['deer_buck_walk_0', 'deer_buck_walk_1', 'deer_buck_walk_2', 'deer_buck_walk_3'],
    box: { w: 176, h: 171 }, fill: 0.95, fit: 'h' },
  { file: 'deer_buck_run_sheet.png', cells: 4, take: [1, 3],
    names: ['deer_buck_run_0', 'deer_buck_run_1'],
    box: { w: 176, h: 171 }, fill: 0.95, fit: 'h' },
  { file: 'deer_buck_graze_sheet.png', cells: 1, take: [0],
    names: ['deer_buck_graze'],
    box: { w: 176, h: 171 }, fill: 0.92, fit: 'w' },
  // death poses sit close to the even grid, so frames get explicit x-ranges
  // plus `clears` (cell-local rects) erasing the neighbor's spill-over pixels
  { file: 'deer_buck_death_sheet.png',
    boxes: [{ x0: 5, x1: 340 }, { x0: 345, x1: 700 }, { x0: 660, x1: 1024 }],
    clears: { 1: [[310, 345, 80, 70]], 2: [[0, 125, 48, 175]] },
    names: ['deer_buck_death_0', 'deer_buck_death_1', 'deer_buck_death_2'],
    box: { w: 176, h: 171 }, fill: 0.95, fit: 'h' },
];

// 2×2 monster sheets: quadrants inset past the drawn grid lines. The
// grizzled coat is desaturated, so line erasers stay off (lineErase: false);
// grid-line remnants and watermark sparkles are handled by insets + keying.
const Q = [
  { x0: 8, x1: 504, y0: 8, y1: 504 }, { x0: 520, x1: 1016, y0: 8, y1: 504 },
  { x0: 8, x1: 504, y0: 520, y1: 1016 }, { x0: 520, x1: 1016, y0: 520, y1: 1016 },
];
const MBOX = { w: 203, h: 202 };
SHEETS.push(
  { file: 'deer_monster_walk_sheet.png', boxes: Q,
    names: ['deer_monster_walk_0', 'deer_monster_walk_1', 'deer_monster_walk_2', 'deer_monster_walk_3'],
    box: MBOX, fill: 0.95, fit: 'h', lineErase: false },
  { file: 'deer_monster_run_sheet.png', boxes: [Q[1], Q[3]],   // gathered + stretched
    names: ['deer_monster_run_0', 'deer_monster_run_1'],
    box: MBOX, fill: 0.95, fit: 'h', lineErase: false },
  { file: 'deer_monster_graze_sheet.png', boxes: [{ x0: 0, x1: 1024, y0: 0, y1: 1024 }],
    names: ['deer_monster_graze'],
    box: MBOX, fill: 0.92, fit: 'w', lineErase: false },
  { file: 'deer_monster_death_sheet.png', boxes: Q,
    names: ['deer_monster_death_0', 'deer_monster_death_1', 'deer_monster_death_2', 'deer_monster_death_3'],
    box: MBOX, fill: 0.95, fit: 'h', lineErase: false },
);

// Doe sheets: no antlers, so the body would fill the whole box at the buck's
// fill factor — smaller fills keep her body height matched to the buck's.
const DBOX = { w: 176, h: 171 };
SHEETS.push(
  { file: 'deer_doe_walk_sheet.png', boxes: Q,
    names: ['deer_doe_walk_0', 'deer_doe_walk_1', 'deer_doe_walk_2', 'deer_doe_walk_3'],
    box: DBOX, fill: 0.62, fit: 'h', lineErase: false },
  { file: 'deer_doe_run_sheet.png', boxes: [Q[1], Q[3]],
    names: ['deer_doe_run_0', 'deer_doe_run_1'],
    box: DBOX, fill: 0.55, fit: 'h', lineErase: false },
  { file: 'deer_doe_graze_sheet.png', boxes: [{ x0: 0, x1: 1024, y0: 0, y1: 1024 }],
    names: ['deer_doe_graze'],
    box: DBOX, fill: 0.88, fit: 'w', lineErase: false },
  { file: 'deer_doe_death_sheet.png', boxes: Q,
    names: ['deer_doe_death_0', 'deer_doe_death_1', 'deer_doe_death_2', 'deer_doe_death_3'],
    box: DBOX, fill: 0.62, fit: 'h', lineErase: false },
);

// Ducks, HUD ammo icons, and shop gun art. lineErase stays off everywhere:
// cartoon outlines and long horizontal gun barrels look exactly like the
// "baseline rule" the eraser hunts.
SHEETS.push(
  { file: 'duck_fly_sheet.png', boxes: Q,
    names: ['duck_0', 'duck_1', 'duck_2', 'duck_3'],
    box: { w: 64, h: 48 }, fill: 0.9, fit: 'h', lineErase: false },
  { file: 'duck_fall.png', cells: 1, take: [0],
    names: ['duck_fall'],
    box: { w: 64, h: 48 }, fill: 0.9, fit: 'h', lineErase: false },
  // the generator packed extra flyers into this one — take only the
  // feet-up corpse at the bottom
  { file: 'duck_dead_sheet.png', boxes: [{ x0: 80, x1: 930, y0: 430, y1: 900 }],
    names: ['duck_dead'],
    box: { w: 64, h: 48 }, fill: 0.95, fit: 'w', lineErase: false },
  { file: 'cartridge_icon.png', cells: 1, take: [0],
    names: ['cartridge'],
    box: { w: 10, h: 26 }, fill: 0.95, fit: 'h', lineErase: false },
  { file: 'shell_icon.png', cells: 1, take: [0],
    names: ['shell'],
    box: { w: 12, h: 24 }, fill: 0.95, fit: 'h', lineErase: false },
);
SHEETS.push(
  { file: 'logo.png', cells: 1, take: [0],
    names: ['logo'],
    box: { w: 460, h: 190 }, fill: 0.97, fit: 'w', lineErase: false },
);
for (const id of ['pump12', 'lever30', 'win94', 'bolt700', 'auto5']) {
  SHEETS.push({ file: `gun_${id}.png`, cells: 1, take: [0],
    names: [`gun_${id}`],
    box: { w: 96, h: 36 }, fill: 0.98, fit: 'w', lineErase: false });
}

const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

const out = {};
for (const L of LAYERS) {
  const b64 = readFileSync(path.join(ROOT, 'art', 'src', L.file)).toString('base64');
  out[L.name] = await page.evaluate(async ([src, cfg]) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);

    if (cfg.patch) {
      const p = cfg.patch;
      const donor = g.getImageData(p.fromX, p.y, p.w, p.h);
      g.putImageData(donor, p.x, p.y);
    }

    if (cfg.key) {
      const id = g.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gr = d[i + 1], b = d[i + 2];
        const m = Math.min(r, b) - gr;              // magenta-ness
        if (m > 55) {
          d[i + 3] = 0;
        } else if (m > 8) {
          const k = (m - 8) / 47;
          d[i + 3] = Math.round(d[i + 3] * (1 - k));
          d[i] = Math.round(r - (r - gr) * Math.min(1, k * 1.6));   // full despill at edges
          d[i + 2] = Math.round(b - (b - gr) * Math.min(1, k * 1.6));
        }
      }
      g.putImageData(id, 0, 0);
    }
    return c.toDataURL('image/webp', cfg.q);
  }, [`data:image/png;base64,${b64}`, L]);
  console.log(`${L.name}: ${Math.round(out[L.name].length / 1024)} KB`);
}

for (const S of SHEETS) {
  const b64 = readFileSync(path.join(ROOT, 'art', 'src', S.file)).toString('base64');
  const frames = await page.evaluate(async ([src, cfg]) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const ranges = cfg.boxes
      ? cfg.boxes.map((b) => [b.x0, b.x1 - b.x0, b.y0 || 0, (b.y1 || img.naturalHeight) - (b.y0 || 0)])
      : cfg.take.map((idx) => {
          const cw = Math.floor(img.naturalWidth / cfg.cells);
          return [idx * cw, cw, 0, img.naturalHeight];
        });

    // key + clean each selected cell, collect bboxes
    const cells = ranges.map(([sx, cw, sy, ch], fi) => {
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const g = c.getContext('2d');
      g.drawImage(img, sx, sy, cw, ch, 0, 0, cw, ch);
      for (const [rx, ry, rw, rh] of (cfg.clears && cfg.clears[fi]) || []) {
        g.clearRect(rx, ry, rw, rh);
      }
      const id = g.getImageData(0, 0, cw, ch);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gr = d[i + 1], b = d[i + 2];
        const m = Math.min(r, b) - gr;
        if (m > 55) { d[i + 3] = 0; continue; }
        if (m > 8) {
          const k = (m - 8) / 47;
          d[i + 3] = Math.round(d[i + 3] * (1 - k));
          d[i] = Math.round(r - (r - gr) * Math.min(1, k * 1.6));
          d[i + 2] = Math.round(b - (b - gr) * Math.min(1, k * 1.6));
        }
        // erase light-gray baseline strokes
        const mx = Math.max(r, gr, b), mn = Math.min(r, gr, b);
        if (cfg.lineErase !== false && mx - mn < 32 && mx > 110 && mx < 240) { d[i + 3] = 0; continue; }
        // neutralize magenta ambient cast (rosy antlers): pull pink toward tan
        if (d[i + 3] > 0 && r > gr + 20 && b >= gr) {
          d[i + 2] = Math.round(gr + (b - gr) * 0.25);
          d[i] = Math.round(r - (r - gr) * 0.2);
        }
      }
      // a drawn baseline rule is a thin row where near-black spans most of
      // the cell — clear those pixels row-wise (hoof blobs never span that)
      for (let y = 0; cfg.lineErase !== false && y < ch; y++) {
        let dark = 0;
        for (let x = 0; x < cw; x++) {
          const j = (y * cw + x) * 4;
          if (d[j + 3] > 20 && Math.max(d[j], d[j + 1], d[j + 2]) < 75) dark++;
        }
        if (dark > cw * 0.3) {
          for (let x = 0; x < cw; x++) {
            const j = (y * cw + x) * 4;
            if (d[j + 3] > 20 && Math.max(d[j], d[j + 1], d[j + 2]) < 75) d[j + 3] = 0;
          }
        }
      }
      // despeckle: drop connected components under 200px (stray slivers of
      // neighboring poses that crossed the cut column)
      {
        const seen = new Uint8Array(cw * ch);
        const stack = [];
        for (let p0 = 0; p0 < cw * ch; p0++) {
          if (seen[p0] || d[p0 * 4 + 3] <= 20) continue;
          const comp = [];
          stack.push(p0); seen[p0] = 1;
          while (stack.length) {
            const q = stack.pop();
            comp.push(q);
            const qx = q % cw, qy = (q / cw) | 0;
            for (const [nx, ny] of [[qx - 1, qy], [qx + 1, qy], [qx, qy - 1], [qx, qy + 1]]) {
              if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
              const n = ny * cw + nx;
              if (!seen[n] && d[n * 4 + 3] > 20) { seen[n] = 1; stack.push(n); }
            }
          }
          if (comp.length < 200) for (const q of comp) d[q * 4 + 3] = 0;
        }
      }
      g.putImageData(id, 0, 0);
      let x0 = cw, x1 = 0, y0 = ch, y1 = 0;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          if (d[(y * cw + x) * 4 + 3] > 20) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      return { c, x0, x1, y0, y1 };
    });

    // one scale + one baseline for the whole sheet so frames don't pulse
    const maxH = Math.max(...cells.map((c) => c.y1 - c.y0 + 1));
    const maxW = Math.max(...cells.map((c) => c.x1 - c.x0 + 1));
    let s = cfg.fit === 'w' ? (cfg.box.w * cfg.fill) / maxW : (cfg.box.h * cfg.fill) / maxH;
    s = Math.min(s, (cfg.box.w * 0.98) / maxW, (cfg.box.h * 0.98) / maxH);
    const feetRow = Math.max(...cells.map((c) => c.y1));

    return cells.map((cell) => {
      const oc = document.createElement('canvas');
      oc.width = cfg.box.w; oc.height = cfg.box.h;
      const og = oc.getContext('2d');
      og.imageSmoothingQuality = 'high';
      const cx = (cell.x0 + cell.x1) / 2;
      og.translate(cfg.box.w / 2 - cx * s, cfg.box.h - feetRow * s);
      og.scale(s, s);
      og.drawImage(cell.c, 0, 0);
      return oc.toDataURL('image/webp', 0.9);
    });
  }, [`data:image/png;base64,${b64}`, S]);
  frames.forEach((uri, i) => {
    out[S.names[i]] = uri;
    console.log(`${S.names[i]}: ${Math.round(uri.length / 1024)} KB`);
  });
}
await browser.close();

let js = 'window.DH = window.DH || {};\n\n';
js += '// Generated by art/process.mjs from art/src/*.png — do not hand-edit.\n';
js += '// Painted background layers (WebP data URIs), keyed and watermark-patched.\n';
js += 'DH.artdata = {\n';
for (const [k, v] of Object.entries(out)) js += `  ${k}:\n    '${v}',\n`;
js += '};\n';
writeFileSync(path.join(ROOT, 'js', 'artdata.js'), js);
console.log('wrote js/artdata.js', Math.round(js.length / 1024), 'KB total');
