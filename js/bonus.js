window.DH = window.DH || {};

// "Duck Flush" bonus round, played after each trek.
DH.bonus = (() => {
  let bg = null;
  let ducks = [];
  let queue = [];
  let t = 0;
  let stats = null;
  let endT = null;
  let introT = 0;
  let roundToken = 0;

  function impact(x, y) {
    const res = DH.shooting.resolveImpact(x, y, ducks.filter((d) => d.alive));
    if (!res) return;
    const pts = DH.data.scoring.duckPoints;
    stats.hits++;
    stats.points += pts;
    DH.G.score += pts;
    DH.shop.earn(pts);
    res.hit.kill();
    DH.entities.spawnFeathers(x, y);
    DH.entities.spawnPopup(x, y - 24, '+' + pts, '#ffd94d');
    DH.audio.play('quack');
  }

  function finish() {
    const sc = DH.data.scoring;
    const rec = {
      hits: stats.hits, total: stats.total,
      points: stats.points,
      allBonus: stats.hits === stats.total ? sc.allDucksBonus : 0,
    };
    DH.G.score += rec.allBonus;
    DH.setState('BONUS_RESULTS', rec);
  }

  DH.states = DH.states || {};
  DH.states.BONUS = {
    enter() {
      roundToken++;
      const trek = DH.data.treks[DH.G.trekIndex];
      bg = DH.background.build(trek.env, DH.G.seed + 5000 + DH.G.trekIndex);
      ducks = [];
      queue = [];
      t = 0;
      endT = null;
      introT = 2.0;
      let total = 0;
      for (const w of DH.data.bonus.waves) {
        for (let i = 0; i < w.count; i++) {
          queue.push({
            t: w.t + i * 0.55,
            side: (i + (w.count % 2)) % 2 ? 'R' : 'L',
            speed: w.speed,
            spawned: false,
          });
          total++;
        }
      }
      stats = { hits: 0, total, points: 0 };
      DH.shooting.reset();
      DH.entities.clearParticles();
    },

    onResize() {
      if (bg) bg = DH.background.build(DH.data.treks[DH.G.trekIndex].env, DH.G.seed + 5000 + DH.G.trekIndex);
    },

    update(dt) {
      t += dt;
      introT = Math.max(0, introT - dt);
      for (const q of queue) {
        if (!q.spawned && t >= q.t + 1.2) {          // small delay past the intro
          q.spawned = true;
          const d = new DH.entities.Duck({ side: q.side, speed: q.speed, y: 300 + DH.util.rand() * 90 });
          d._q = q;
          q.duck = d;
          ducks.push(d);
        }
      }
      for (const d of ducks) d.update(dt);
      ducks = ducks.filter((d) => !d.gone);
      DH.entities.updateParticles(dt);
      DH.shooting.update(dt);
      const targetCam = ((DH.input.mouse.x - DH.CX) / DH.CX) * 30;
      DH.G.camX += (targetCam - DH.G.camX) * Math.min(1, dt * 5);

      if (endT != null) {
        endT -= dt;
        if (endT <= 0) finish();
        return;
      }
      const allResolved = queue.every((q) => q.spawned && (!q.duck || !q.duck.alive));
      if (t >= DH.data.bonus.duration || allResolved) endT = 1.0;
    },

    onClick(x, y) {
      if (DH.hud.muteHit(x, y)) { DH.audio.toggleMute(); return; }
      if (DH.hud.reloadHit(x, y)) { DH.shooting.reload(); return; }
      const token = roundToken;
      DH.shooting.tryFire(x, y, (ix, iy) => {
        if (token !== roundToken || DH.G.stateName !== 'BONUS') return;
        impact(ix, iy);
      });
    },

    onRclick() { DH.shooting.reload(); },
    onKey(k) { if (k === ' ') DH.shooting.reload(); },

    render(ctx) {
      bg.render(ctx, DH.G.camX, t);
      for (const d of ducks) d.draw(ctx);
      DH.entities.drawParticles(ctx);
      bg.renderFront(ctx, DH.G.camX);
      DH.shooting.drawShots(ctx);
      DH.hud.draw(ctx, { shells: true });
      DH.hud.label(ctx, `BONUS — ${DH.data.bonus.name}`, DH.CX, 30, 18, '#ffd94d', 'center');
      DH.hud.label(ctx, `DUCKS ${stats.hits}/${stats.total}`, DH.CX, 52, 14, '#e8f0e8', 'center');
      if (introT > 0) {
        ctx.fillStyle = `rgba(10,16,12,${Math.min(0.55, introT)})`;
        ctx.fillRect(0, 0, DH.W, 540);
        const pop = DH.util.easeOutBack(Math.min(1, (2 - introT) * 2));
        ctx.save();
        ctx.translate(DH.CX, 250);
        ctx.scale(pop, pop);
        DH.hud.label(ctx, 'BONUS ROUND', 0, -20, 46, '#ffd94d', 'center');
        DH.hud.label(ctx, DH.data.bonus.name + ' — SHOOT EVERY DUCK!', 0, 24, 20, '#fff', 'center');
        ctx.restore();
      }
    },

    _animals() { return ducks; },
  };

  return {};
})();
