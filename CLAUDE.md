# Deer Hunter — project notes

Arcade-style rail-shooter hunting game (think coin-op hunting cabinets). Vanilla JS + Canvas, no build
step, no runtime dependencies. See README.md for gameplay and structure.

## Workflow rules

- After every gameplay/visual change: rebuild the single-file bundle and
  republish the artifact, then **post the artifact link in the reply** so the
  user can test on their phone. Artifact URL (keep redeploying to this one):
  https://claude.ai/code/artifact/265e280f-47e6-484e-b49b-ddfba839dab7
  Bundle = `<title>` + viewport metas + `<style>` + `<canvas>` + rotate div +
  all `js/*.js` files (incl. generated artdata.js) inlined as script tags in
  index.html order.
- Painted art pipeline: drop Nano Banana output into `art/src/` and run
  `node art/process.mjs` (chroma-keys magenta, patches watermarks, slices
  spritesheets to the registry boxes, writes js/artdata.js). Layer placement
  tuning lives in ART_LAYOUT in js/background.js.
- Run `cd test && node run-tests.mjs` before pushing (Playwright headless via
  executablePath /opt/pw-browsers/chromium; playwright is installed in test/).

## Design decisions (user-confirmed)

- **No wind mechanic by default.** Don't add wind drift unless asked.
- Bullets are projectiles with travel time (lead your target); spook rolls
  happen at impact, not at trigger pull.
- Family-friendly kills: puff + cartoon tumble, no gore.
- Mobile: tap = aim+shoot, on-screen RELOAD button, landscape-fill canvas
  (logical width stretches to device aspect, capped 960–1200; HUD anchors to
  the centered 960 core via DH.HUDL/DH.HUDR).
- All art procedural behind DH.assets PNG-override registry (assets/README.md
  documents sprite names); art must never affect hitboxes.
- All tuning lives in js/data.js. Gameplay randomness only through DH.G.rng
  (seeded via ?seed=N); visual-only jitter uses DH.G.vrng.
