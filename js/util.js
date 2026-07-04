window.DH = window.DH || {};

DH.util = (() => {
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Deterministic PRNG so ?seed=N runs are reproducible.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function rand() { return DH.G.rng(); }
  function randRange(a, b) { return a + rand() * (b - a); }
  function randInt(a, b) { return Math.floor(randRange(a, b + 1)); }
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }

  function easeOutCubic(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) {
    t = clamp(t, 0, 1);
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  }
  function easeInOut(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  // Rounded rectangle path helper (used all over the UI).
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fmtScore(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  return { clamp, lerp, mulberry32, rand, randRange, randInt, pick,
           easeOutCubic, easeOutBack, easeInOut, rr, fmtScore };
})();
