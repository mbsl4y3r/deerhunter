window.DH = window.DH || {};

// Sprite registry. Every sprite in the game renders through DH.assets.draw().
// Each entry has a procedural draw function; at boot we probe assets/<name>.png
// and, if it loads, the PNG replaces the procedural art. Hitboxes live in
// entity space, so swapping art never changes gameplay.
DH.assets = (() => {
  const registry = {};   // name -> { w, h, anchorX, anchorY, draw, img|null }

  // w/h: logical size of the sprite box at scale 1.
  // anchor: fraction of that box placed at the draw position (feet = y 1.0).
  function register(name, def) {
    registry[name] = Object.assign({ anchorX: 0.5, anchorY: 1.0, img: null }, def);
  }

  // Probe assets/<name>.png for every registered sprite. On file:// the
  // error events fire immediately; cap the whole pass at 1.5 s regardless.
  function probeOverrides() {
    const names = Object.keys(registry);
    return new Promise((resolve) => {
      let pending = names.length;
      if (!pending) return resolve();
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      setTimeout(finish, 1500);
      names.forEach((name) => {
        const img = new Image();
        img.onload = () => { registry[name].img = img; if (--pending === 0) finish(); };
        img.onerror = () => { if (--pending === 0) finish(); };
        img.src = 'assets/' + name + '.png';
      });
    });
  }

  function overrideCount() {
    return Object.values(registry).filter((r) => r.img).length;
  }

  // opts: { scale=1, dir=1 (+x faces right), rot=0 (radians), alpha=1 }
  function draw(ctx, name, x, y, opts) {
    const def = registry[name];
    if (!def) return;
    const o = opts || {};
    const scale = o.scale == null ? 1 : o.scale;
    const dir = o.dir == null ? 1 : o.dir;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.scale(scale * dir, scale);
    if (def.img) {
      ctx.drawImage(def.img, -def.w * def.anchorX, -def.h * def.anchorY, def.w, def.h);
    } else {
      def.draw(ctx, o);
    }
    ctx.restore();
  }

  function names() { return Object.keys(registry); }
  function get(name) { return registry[name]; }

  return { register, probeOverrides, overrideCount, draw, names, get };
})();
