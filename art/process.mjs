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
    const ch = img.naturalHeight;
    const ranges = cfg.boxes
      ? cfg.boxes.map((b) => [b.x0, b.x1 - b.x0])
      : cfg.take.map((idx) => {
          const cw = Math.floor(img.naturalWidth / cfg.cells);
          return [idx * cw, cw];
        });

    // key + clean each selected cell, collect bboxes
    const cells = ranges.map(([sx, cw], fi) => {
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const g = c.getContext('2d');
      g.drawImage(img, sx, 0, cw, ch, 0, 0, cw, ch);
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
        if (mx - mn < 32 && mx > 110 && mx < 240) { d[i + 3] = 0; continue; }
        // neutralize magenta ambient cast (rosy antlers): pull pink toward tan
        if (d[i + 3] > 0 && r > gr + 20 && b >= gr) {
          d[i + 2] = Math.round(gr + (b - gr) * 0.25);
          d[i] = Math.round(r - (r - gr) * 0.2);
        }
      }
      // a drawn baseline rule is a thin row where near-black spans most of
      // the cell — clear those pixels row-wise (hoof blobs never span that)
      for (let y = 0; y < ch; y++) {
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
