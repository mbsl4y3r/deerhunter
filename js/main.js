window.DH = window.DH || {};

DH.main = (() => {
  const params = new URLSearchParams(location.search);
  const seed = parseInt(params.get('seed'), 10) || Math.floor(Math.random() * 1e9);
  const testMode = params.get('test') === '1';
  if (params.get('nosound') === '1') DH.audio.disable();

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
    if (type === 'click' && cur.onClick) cur.onClick(a, b);
    else if (type === 'rclick' && cur.onRclick) cur.onRclick(a, b);
    else if (type === 'key' && cur.onKey) cur.onKey(a);
  }

  function fitCanvas() {
    const s = Math.min(window.innerWidth / 960, window.innerHeight / 540);
    canvas.style.width = `${960 * s}px`;
    canvas.style.height = `${540 * s}px`;
    canvas.style.left = `${(window.innerWidth - 960 * s) / 2}px`;
    canvas.style.top = `${(window.innerHeight - 540 * s) / 2}px`;
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
    tick(dt);
    render();
    requestAnimationFrame(loop);
  }

  DH.states = DH.states || {};
  DH.states.BOOT = {
    render(c) {
      c.fillStyle = '#0d1a12';
      c.fillRect(0, 0, 960, 540);
      DH.hud.label(c, 'LOADING...', 480, 280, 24, '#cfe3cf', 'center');
    },
  };

  window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    window.addEventListener('resize', fitCanvas);
    fitCanvas();
    DH.input.init(canvas);
    DH.sprites.registerAll();
    setState('BOOT');
    requestAnimationFrame(loop);
    DH.assets.probeOverrides().then(() => {
      if (DH.assets.overrideCount() > 0) {
        console.log(`DeerHunter: using ${DH.assets.overrideCount()} PNG sprite override(s) from assets/`);
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
            return {
              species: a.sp || 'duck', role: a.role || 'duck', state: a.state,
              x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10,
              onScreen: a.onScreen(), trophy: a.trophy || 0,
            };
          });
        },
        click: (x, y) => { DH.input.mouse.x = x; DH.input.mouse.y = y; dispatch('click', x, y); },
        rclick: () => dispatch('rclick', 0, 0),
        key: (k) => dispatch('key', k),
        warp: (sec) => {
          const steps = Math.round(sec * 60);
          for (let i = 0; i < steps; i++) tick(1 / 60);
          render();
        },
        forceSpawn: (role) => {
          const st = DH.states[DH.G.stateName];
          return st && st._forceSpawn ? !!st._forceSpawn(role) : false;
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
