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
  // full-scene UI backdrops (drawn cover + dimmed behind menu panels)
  { name: 'shop_bg',   file: 'shop_bg.png',   key: false, q: 0.8,
    patch: { x: 905, y: 455, w: 60, h: 60, fromX: 835 } },
  { name: 'select_bg', file: 'select_bg.png', key: false, q: 0.8,
    patch: { x: 910, y: 458, w: 52, h: 55, fromX: 830 } },
  { name: 'trophy_bg', file: 'trophy_bg.png', key: false, q: 0.8,
    patch: { x: 908, y: 458, w: 55, h: 55, fromX: 848 } },
  // Elk Summit (env 'mountain')
  { name: 'mountain_sky',    file: 'mountain_sky.png',    key: false, q: 0.82,
    patch: { x: 895, y: 445, w: 80, h: 75, fromX: 790 } },
  { name: 'mountain_far',    file: 'mountain_far.png',    key: true,  q: 0.82 },
  { name: 'mountain_mid',    file: 'mountain_mid.png',    key: true,  q: 0.85 },
  { name: 'mountain_ground', file: 'mountain_ground.png', key: false, q: 0.85,
    patch: { x: 895, y: 440, w: 85, h: 80, fromX: 780 } },
  { name: 'mountain_front',  file: 'mountain_front.png',  key: true,  q: 0.82,
    patch: { x: 900, y: 145, w: 70, h: 70, fromX: 800 },   // post-crop coords
    cropY0: 300,     // drop the tall pine tops so the rim stays a rim
    fadeTop: 90 },   // feather the crop edge so the rim melts into the grass
];

// 3-row × 2-column six-cell grid (for smoother 6-frame walk/run sheets)
export const Q6 = [];
for (let r = 0; r < 3; r++) {
  for (let c = 0; c < 2; c++) {
    Q6.push({ x0: c * 512 + 8, x1: (c + 1) * 512 - 8, y0: r * 341 + 8, y1: (r + 1) * 341 - 6 });
  }
}

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
  { file: 'crosshair_icon.png', cells: 1, take: [0],
    names: ['crosshair'],
    box: { w: 48, h: 48 }, fill: 0.95, fit: 'h', lineErase: false },
  { file: 'muzzle_sheet.png', cells: 2, take: [0, 1],
    names: ['muzzle_0', 'muzzle_1'],
    box: { w: 56, h: 56 }, fill: 0.95, fit: 'h', lineErase: false },
);
for (const id of ['pump12', 'lever30', 'win94', 'bolt700', 'auto5']) {
  SHEETS.push({ file: `gun_${id}.png`, cells: 1, take: [0],
    names: [`gun_${id}`],
    box: { w: 96, h: 36 }, fill: 0.98, fit: 'w', lineErase: false });
}

// Elk cast. Bull sheets are 2x3 (Q6); the cow's smaller fills keep her body
// height matched to the bull's (his box height includes the rack).
const EBOX = { w: 193, h: 183 };
SHEETS.push(
  { file: 'elk_bull_walk_sheet.png', boxes: Q6,
    names: ['elk_buck_walk_0', 'elk_buck_walk_1', 'elk_buck_walk_2', 'elk_buck_walk_3', 'elk_buck_walk_4', 'elk_buck_walk_5'],
    box: EBOX, fill: 0.95, fit: 'h', lineErase: false },
  { file: 'elk_bull_run_sheet.png', boxes: Q6,
    names: ['elk_buck_run_0', 'elk_buck_run_1', 'elk_buck_run_2', 'elk_buck_run_3', 'elk_buck_run_4', 'elk_buck_run_5'],
    box: EBOX, fill: 0.95, fit: 'h', lineErase: false },
  // the graze generation glitched into a 2x3 collage — the middle-right
  // cell is the clean grazing pose
  { file: 'elk_bull_graze_sheet.png', boxes: [Q6[3]],
    names: ['elk_buck_graze'],
    box: EBOX, fill: 0.9, fit: 'w', lineErase: false },
  // death came back 2x3 with six stages; keep flinch, buckle, collapse, rest
  { file: 'elk_bull_death_sheet.png', boxes: [Q6[0], Q6[3], Q6[4], Q6[5]],
    names: ['elk_buck_death_0', 'elk_buck_death_1', 'elk_buck_death_2', 'elk_buck_death_3'],
    box: EBOX, fill: 0.95, fit: 'h', lineErase: false },
  { file: 'elk_cow_walk_sheet.png', boxes: Q6,
    names: ['elk_doe_walk_0', 'elk_doe_walk_1', 'elk_doe_walk_2', 'elk_doe_walk_3', 'elk_doe_walk_4', 'elk_doe_walk_5'],
    box: EBOX, fill: 0.6, fit: 'h', lineErase: false },
  { file: 'elk_cow_run_sheet.png', boxes: Q6,
    names: ['elk_doe_run_0', 'elk_doe_run_1', 'elk_doe_run_2', 'elk_doe_run_3', 'elk_doe_run_4', 'elk_doe_run_5'],
    box: EBOX, fill: 0.55, fit: 'h', lineErase: false },
  { file: 'elk_cow_graze.png', cells: 1, take: [0],
    names: ['elk_doe_graze'],
    box: EBOX, fill: 0.85, fit: 'w', lineErase: false },
  { file: 'elk_cow_death_sheet.png', boxes: Q,
    names: ['elk_doe_death_0', 'elk_doe_death_1', 'elk_doe_death_2', 'elk_doe_death_3'],
    box: EBOX, fill: 0.6, fit: 'h', lineErase: false },
);

// Trek-select dressing. The frame stretches non-uniformly to its box
// (stretch: true) — it's border decor, the distortion is invisible on wood
// beams. Its sparkle watermark sits over the bottom-right antler ornament,
// so it gets inpainted (desparkle) instead of donor-patched. The badge
// sparkles land on pure magenta and vanish in the chroma key.
SHEETS.push(
  { file: 'card_frame.png', boxes: [{ x0: 0, x1: 687, y0: 0, y1: 1024 }],
    names: ['card_frame'], box: { w: 468, h: 555 }, stretch: true,
    lineErase: false, desparkle: [554, 896, 622, 960] },
  { file: 'badge_deer.png', boxes: [{ x0: 0, x1: 1024, y0: 0, y1: 1024 }],
    names: ['badge_deer'], box: { w: 168, h: 168 }, fill: 0.98, fit: 'h', lineErase: false },
  { file: 'badge_elk.png', boxes: [{ x0: 0, x1: 1024, y0: 0, y1: 1024 }],
    names: ['badge_elk'], box: { w: 168, h: 168 }, fill: 0.98, fit: 'h', lineErase: false },
  { file: 'badge_moose.png', boxes: [{ x0: 0, x1: 1024, y0: 0, y1: 1024 }],
    names: ['badge_moose'], box: { w: 168, h: 168 }, fill: 0.98, fit: 'h', lineErase: false },
);

const browser = await chromium.launch({ headless: true, executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage();

const out = {};
for (const L of LAYERS) {
  const b64 = readFileSync(path.join(ROOT, 'art', 'src', L.file)).toString('base64');
  out[L.name] = await page.evaluate(async ([src, cfg]) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const cropY0 = cfg.cropY0 || 0;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight - cropY0;
    const g = c.getContext('2d');
    g.drawImage(img, 0, -cropY0);

    if (cfg.patch) {
      const p = cfg.patch;
      const donor = g.getImageData(p.fromX, p.y, p.w, p.h);
      g.putImageData(donor, p.x, p.y);
    }

    if (cfg.key) {
      const id = g.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      // feather the top rows to transparent (hides hard crop edges)
      if (cfg.fadeTop) {
        for (let y = 0; y < cfg.fadeTop; y++) {
          const a = y / cfg.fadeTop;
          for (let x = 0; x < c.width; x++) {
            d[(y * c.width + x) * 4 + 3] = Math.round(d[(y * c.width + x) * 4 + 3] * a * a);
          }
        }
      }
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
      // inpaint the generator's gray sparkle watermark where it overlaps
      // real art: flag low-saturation bright pixels inside the given rect,
      // dilate to catch the soft edge, then refill each column by lerping
      // between the untouched colors above and below the flagged run
      if (cfg.desparkle) {
        const [rx0, ry0, rx1, ry1] = cfg.desparkle;
        const flag = new Uint8Array(cw * ch);
        for (let y = ry0; y <= ry1; y++) {
          for (let x = rx0; x <= rx1; x++) {
            const j = (y * cw + x) * 4;
            const mx = Math.max(d[j], d[j + 1], d[j + 2]);
            const mn = Math.min(d[j], d[j + 1], d[j + 2]);
            // gray core, or brightened low-sat blend where it crosses the
            // beige antler ornament
            if (d[j + 3] > 20 && ((mx - mn < 30 && mx > 120) || (mx - mn < 52 && mx > 148))) flag[y * cw + x] = 1;
          }
        }
        for (let it = 0; it < 2; it++) {
          const f2 = flag.slice();
          for (let y = ry0; y <= ry1; y++) {
            for (let x = rx0; x <= rx1; x++) {
              if (!f2[y * cw + x] &&
                  (f2[y * cw + x - 1] || f2[y * cw + x + 1] || f2[(y - 1) * cw + x] || f2[(y + 1) * cw + x])) {
                flag[y * cw + x] = 1;
              }
            }
          }
        }
        for (let x = rx0; x <= rx1; x++) {
          let y = ry0;
          while (y <= ry1) {
            if (!flag[y * cw + x]) { y++; continue; }
            let ye = y;
            while (ye <= ry1 && flag[ye * cw + x]) ye++;
            const ja = ((y - 1) * cw + x) * 4, jb = (ye * cw + x) * 4;
            for (let yy = y; yy < ye; yy++) {
              const t = (yy - y + 1) / (ye - y + 1);
              const j = (yy * cw + x) * 4;
              for (let k = 0; k < 3; k++) d[j + k] = Math.round(d[ja + k] * (1 - t) + d[jb + k] * t);
            }
            y = ye;
          }
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
      if (cfg.stretch) {   // non-uniform: trimmed bbox fills the box exactly
        const sw = cfg.box.w / (cell.x1 - cell.x0 + 1);
        const sh = cfg.box.h / (cell.y1 - cell.y0 + 1);
        og.translate(-cell.x0 * sw, -cell.y0 * sh);
        og.scale(sw, sh);
        og.drawImage(cell.c, 0, 0);
        return oc.toDataURL('image/webp', 0.9);
      }
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
