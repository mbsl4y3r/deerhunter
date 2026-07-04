window.DH = window.DH || {};

DH.main = (() => {
  const params = new URLSearchParams(location.search);
  const seed = parseInt(params.get('seed'), 10) || Math.floor(Math.random() * 1e9);
  const testMode = params.get('test') === '1';
  if (params.get('nosound') === '1') DH.audio.disable();

  // Logical height is fixed at 540; logical width stretches to the device
  // aspect (capped) so wide phones get a full-bleed scene instead of bars.
  // The classic 960-wide "core" stays centered: DH.CX is screen center and
  // DH.HUDL/DH.HUDR are the core's edges, where HUD elements anchor (this
  // also keeps them clear of notches / Dynamic Islands in the overflow).
  function computeWidth() {
    const vw = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
    const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    return Math.round(DH.util.clamp((540 * vw) / vh, 960, 1200));
  }
  DH.W = 960;
  DH.CX = 480;
  DH.HUDL = 0;
  DH.HUDR = 960;

  DH.G = {
    seed,
    rng: DH.util.mulberry32(seed),          // gameplay RNG (deterministic per seed)
    vrng: DH.util.mulberry32(seed ^ 0x5f3759df), // visual-only RNG (shake) — never touches gameplay
    score: 0,
    trekIndex: 0,
    siteIndex: 0,
    completed: {},
    trekRecords: [],
    trekStartScore: 0,
    shake: { t: 0, mag: 0 },
    camX: 0,
    stateName: 'BOOT',
    testMode,
  };

  let canvas, ctx;
  let cur = null;

  function setState(name, stateParams) {
    if (cur && cur.exit) cur.exit();
    cur = DH.states[name];
    DH.G.stateName = name;
    if (cur.enter) cur.enter(stateParams);
  }

  function newRun() {
    DH.G.score = 0;
    DH.G.completed = {};
    DH.G.trekRecords = [];
    DH.G.trekStartScore = 0;
    DH.G.siteIndex = 0;
    DH.hud.syncScore();
  }

  function dispatch(type, a, b) {
    if (!cur) return;
    if (type === 'key' && (a === 'm' || a === 'M')) { DH.audio.toggleMute(); return; }
    if (type === 'key' && (a === 'f' || a === 'F')) { toggleFullscreen(); return; }
    if (type === 'click' && DH.hud.fsHit(a, b)) { toggleFullscreen(); return; }
    if (type === 'click' && cur.onClick) cur.onClick(a, b);
    else if (type === 'rclick' && cur.onRclick) cur.onRclick(a, b);
    else if (type === 'key' && cur.onKey) cur.onKey(a);
  }

  let fsFallback = false;   // set when the API rejected; next tap pops out

  function popOut() {
    // escape the embedding page (artifact chrome) into a clean tab —
    // must run inside the user gesture or the popup gets blocked
    let w = null;
    try { w = window.open(location.href, '_blank'); } catch (e) { /* blocked */ }
    if (!w) DH.hud.banner('BLOCKED — USE "ADD TO HOME SCREEN"', '#ff8a7a', 2.4);
  }

  function toggleFullscreen() {
    const doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
      return;
    }
    let framed = true;
    try { framed = window.self !== window.top; } catch (e) { /* cross-origin parent */ }
    const el = doc.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    const enabled = doc.fullscreenEnabled === true || doc.webkitFullscreenEnabled === true;
    if (fsFallback || !req || !enabled) {
      if (framed) popOut();
      else DH.hud.banner('FULLSCREEN NOT SUPPORTED HERE', '#ff8a7a', 2.0);
      return;
    }
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {
        fsFallback = true;
        DH.hud.banner(framed ? 'BLOCKED — TAP AGAIN TO POP OUT' : 'FULLSCREEN BLOCKED', '#ff8a7a', 2.2);
      });
    } catch (e) {
      fsFallback = true;
      DH.hud.banner(framed ? 'BLOCKED — TAP AGAIN TO POP OUT' : 'FULLSCREEN BLOCKED', '#ff8a7a', 2.2);
    }
  }

  function fitCanvas() {
    const vw = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
    const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    const s = Math.min(vw / DH.W, vh / 540);
    canvas.style.width = `${DH.W * s}px`;
    canvas.style.height = `${540 * s}px`;
    canvas.style.left = `${(vw - DH.W * s) / 2}px`;
    canvas.style.top = `${(vh - 540 * s) / 2}px`;
  }

  function tick(dt) {
    DH.G.shake.t = Math.max(0, DH.G.shake.t - dt);
    DH.hud.update(dt);
    if (cur && cur.update) cur.update(dt);
  }

  function render() {
    ctx.save();
    if (DH.G.shake.t > 0) {
      const k = DH.G.shake.t / 0.16;
      ctx.translate((DH.G.vrng() - 0.5) * 2 * DH.G.shake.mag * k,
                    (DH.G.vrng() - 0.5) * 2 * DH.G.shake.mag * k);
    }
    if (cur && cur.render) cur.render(ctx);
    ctx.restore();
    // crosshair-as-cursor on every screen
    DH.hud.drawCrosshair(ctx);
  }

  let last = 0;
  function loop(now) {
    const dt = Math.min((now - last) / 1000 || 0, 1 / 20);
    last = now;
    // in test mode time only advances via __DH.warp so runs are reproducible
    if (!testMode) tick(dt);
    render();
    requestAnimationFrame(loop);
  }

  DH.states = DH.states || {};
  DH.states.BOOT = {
    render(c) {
      c.fillStyle = '#0d1a12';
      c.fillRect(0, 0, DH.W, 540);
      DH.hud.label(c, 'LOADING...', DH.CX, 280, 24, '#cfe3cf', 'center');
    },
  };

  window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    // pick the logical width once per load (rotating mid-game keeps letterbox
    // until reload; backgrounds are baked at build width)
    DH.W = params.get('w') ? parseInt(params.get('w'), 10) : computeWidth();
    DH.CX = DH.W / 2;
    DH.HUDL = (DH.W - 960) / 2;
    DH.HUDR = DH.W - DH.HUDL;
    canvas.width = DH.W;
    // viewport changes (rotation, fullscreen) re-derive the logical width;
    // states with baked backgrounds rebuild via their onResize hook
    const onViewportChange = () => {
      fitCanvas();
      if (params.get('w')) return;
      const newW = computeWidth();
      if (Math.abs(newW - DH.W) < 12) return;
      DH.W = newW;
      DH.CX = newW / 2;
      DH.HUDL = (newW - 960) / 2;
      DH.HUDR = newW - DH.HUDL;
      canvas.width = newW;
      if (cur && cur.onResize) cur.onResize();
      fitCanvas();
    };
    window.addEventListener('resize', onViewportChange);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewportChange);
    document.addEventListener('fullscreenchange', onViewportChange);
    document.addEventListener('webkitfullscreenchange', onViewportChange);
    fitCanvas();
    DH.input.init(canvas);
    DH.sprites.registerAll();
    setState('BOOT');
    requestAnimationFrame(loop);
    // decode painted background layers (js/artdata.js data URIs)
    DH.artimg = {};
    const artReady = Promise.all(Object.entries(DH.artdata || {}).map(([k, uri]) =>
      new Promise((res) => {
        const img = new Image();
        img.onload = () => { DH.artimg[k] = img; res(); };
        img.onerror = () => res();
        img.src = uri;
      })));
    Promise.all([DH.assets.probeOverrides(), artReady]).then(() => {
      // artdata keys that match registered sprite names become overrides
      // (assets/*.png files, if present, win — they load into .img first)
      for (const [k, img] of Object.entries(DH.artimg)) {
        const def = DH.assets.get(k);
        if (def && !def.img) def.img = img;
      }
      if (DH.assets.overrideCount() > 0) {
        console.log(`DeerHunter: ${DH.assets.overrideCount()} sprite override(s) active`);
      }
      setState('TITLE');
    });

    if (testMode) {
      window.__DH = {
        state: () => DH.G.stateName,
        score: () => DH.G.score,
        shells: () => DH.shooting.shells,
        seed: () => DH.G.seed,
        animals: () => {
          const st = DH.states[DH.G.stateName];
          if (!st || !st._animals) return [];
          return st._animals().map((a) => {
            const v = a.vitalsPoint();
            const vel = a.velocity();
            return {
              species: a.sp || 'duck', role: a.role || 'duck', state: a.state,
              x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10,
              vx: Math.round(vel.x * 10) / 10, vy: Math.round(vel.y * 10) / 10,
              onScreen: a.onScreen(), trophy: a.trophy || 0,
            };
          });
        },
        flightTime: (x, y) => DH.shooting.flightTime(x, y),
        click: (x, y) => { DH.input.mouse.x = x; DH.input.mouse.y = y; dispatch('click', x, y); },
        rclick: () => dispatch('rclick', 0, 0),
        key: (k) => dispatch('key', k),
        warp: (sec) => {
          const steps = Math.round(sec * 60);
          for (let i = 0; i < steps; i++) tick(1 / 60);
          render();
        },
        forceSpawn: (role, trophy) => {
          const st = DH.states[DH.G.stateName];
          return st && st._forceSpawn ? !!st._forceSpawn(role, trophy) : false;
        },
        skipToState: (name, p) => setState(name, p),
        setScore: (n) => { DH.G.score = n; DH.hud.syncScore(); },
        newRun,
      };
    }
  });

  return { setState, dispatch, newRun };
})();

// expose setState at the namespace root — every state file uses DH.setState
DH.setState = (...a) => DH.main.setState(...a);
