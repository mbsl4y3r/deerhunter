# 🦌 Deer Hunter

A classic arcade-style rail-shooter hunting game — pure vanilla
JavaScript + HTML5 Canvas. No build step, no dependencies, no downloaded
assets: every sprite, background, and sound effect is generated in code.

## Play

Double-click `index.html` — that's it. Or serve it:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## How to play

- **Aim** with the mouse, **click** to shoot. On phones, **tap** to shoot
  (play in landscape — the game fills the screen).
- **Bullets take time to fly** — lead moving targets, Oregon Trail style.
- **Reload** with the on-screen **⟳ RELOAD** button, **right-click**, or
  **Space** (3 shells per pump).
- Shoot the **bucks** (antlers!). **Never shoot the does** — a doe ends the
  site immediately and costs 1,000 points.
- **M** or the speaker icon toggles sound.

### Structure

- **3 treks**: Whitetail Ridge (forest), Elk Summit (mountain), Moose Marsh
  (tundra) — 5 sites each, 3 bucks per site.
- **Scoring**: base points × distance (far lanes pay 1.5×) × speed (running
  1.5×) × shot placement (head 1.5×, vitals 1.25×) × trophy rating (bigger
  antlers pay more).
- **Bonuses**: per-site accuracy bonus, three-buck bonus, perfect-trek bonus
  (all 15 bucks), and a **Duck Flush** bonus round after each trek.
- **High scores** are kept in your browser (localStorage), arcade-style
  3-letter initials.

## Custom art (optional)

All art is procedural, but every sprite can be overridden with a PNG: drop
files into the `assets/` folder using the names documented in
[`assets/README.md`](assets/README.md) and the game picks them up on next
load — gameplay and hitboxes are unaffected. CC0 packs (e.g. kenney.nl) work
nicely.

## Development

- Logical resolution is 960×540; everything scales to the window.
- All tuning (species, spawn tables, scoring) lives in `js/data.js`.
- Deterministic runs: `index.html?seed=42`.
- Test hooks: `index.html?test=1&seed=42&nosound=1` exposes `window.__DH`
  (state/score/shells getters, synthetic clicks, time warp).

### End-to-end tests

```sh
cd test
npm install          # playwright only, for the test harness
node run-tests.mjs   # headless suite + screenshots into test/screenshots/
```
