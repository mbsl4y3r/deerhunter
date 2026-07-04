window.DH = window.DH || {};

// The HUNTING state: one site of one trek.
DH.hunt = (() => {
  let bg = null;
  let animals = [];
  let spawnQueue = [];
  let t = 0;
  let site = null, trek = null;
  let stats = null;
  let endT = null;            // countdown to SITE_RESULTS once the site is decided
  let doeFlash = 0;
  let siteToken = 0;          // stale-bullet guard: impacts from a previous site are ignored

  function spawn(cfg) {
    const a = new DH.entities.Animal({
      species: trek.species,
      role: cfg.role,
      lane: cfg.lane,
      side: cfg.side,
      behavior: cfg.behavior,
      trophy: cfg.trophy ? DH.util.randInt(cfg.trophy[0], cfg.trophy[1]) : 3,
      pauses: cfg.pauses,
    });
    a.spawnCfg = cfg;
    animals.push(a);
    return a;
  }

  function buckStates() {
    // status per buck spawn entry, in spawn order (for HUD tags + results)
    return spawnQueue.filter((s) => s.role === 'buck').map((s) => {
      if (!s.animal) return 'pending';
      if (s.animal.state === 'dying' || s.animal.state === 'dead') return 'killed';
      if (s.animal.escaped) return 'escaped';
      return 'pending';
    });
  }

  function killPoints(a, part, mult) {
    const sc = DH.data.scoring;
    const speedMult = a.state === 'flee' || a.behavior === 'run' ? sc.runMult
      : a.behavior === 'trot' ? sc.trotMult : 1;
    const pts = a.def.base * sc.distMult[a.laneIdx] * speedMult * mult *
      (1 + sc.trophyStep * (a.trophy - 1));
    return Math.round(pts / 5) * 5;
  }

  function finishSite() {
    const sc = DH.data.scoring;
    const acc = stats.shots > 0 ? stats.hits / stats.shots : 0;
    const rec = {
      trekName: trek.name,
      siteIndex: DH.G.siteIndex,
      kills: stats.kills,
      shots: stats.shots,
      hits: stats.hits,
      accuracy: acc,
      accBonus: !stats.doeHit && stats.shots > 0 ? Math.round(sc.accuracyBonusMax * acc) : 0,
      threeBuckBonus: stats.kills.length === 3 ? sc.threeBuckBonus : 0,
      doeHit: stats.doeHit,
      penalty: stats.doeHit ? sc.doePenalty : 0,
    };
    DH.G.score += rec.accBonus + rec.threeBuckBonus;
    DH.G.trekRecords.push(rec);
    DH.setState('SITE_RESULTS', rec);
  }

  // a bullet has landed at (x, y)
  function impact(x, y) {
    const res = DH.shooting.resolveImpact(x, y, animals.filter((a) => a.alive));
    if (!res) {
      if (y > 290) DH.entities.spawnDust(x, y, 0.7);   // dirt kick on the ground
      return;
    }
    stats.hits++;
    const a = res.hit;
    DH.entities.spawnPuff(x, y, a.scale);
    if (a.role === 'buck') {
      const pts = killPoints(a, res.part, res.mult);
      DH.G.score += pts;
      stats.kills.push({ species: a.sp, trophy: a.trophy, part: res.part, points: pts,
                         running: a.state === 'flee' || a.behavior === 'run' });
      a.kill();
      DH.audio.play('thud');
      DH.entities.spawnPopup(x, y - 30, '+' + DH.util.fmtScore(pts),
                             res.part === 'head' ? '#ffe97a' : '#ffd94d');
      if (res.part === 'head') DH.hud.banner('TROPHY SHOT!', '#ffe97a', 1.0);
      else if (a.trophy >= 5) DH.hud.banner('MONSTER BUCK!', '#ffd94d', 1.0);
    } else {
      // shot a doe: penalty, site over
      stats.doeHit = true;
      DH.G.score += DH.data.scoring.doePenalty;
      a.kill();
      doeFlash = 1;
      DH.audio.play('buzzer');
      DH.entities.spawnPopup(x, y - 30, DH.util.fmtScore(DH.data.scoring.doePenalty), '#ff5a4a');
      DH.hud.banner("DON'T SHOOT THE DOES!", '#ff5a4a', 1.6);
    }
  }

  DH.states = DH.states || {};
  DH.states.HUNTING = {
    enter() {
      siteToken++;
      trek = DH.data.treks[DH.G.trekIndex];
      site = trek.sites[DH.G.siteIndex];
      bg = DH.background.build(trek.env, DH.G.seed + DH.G.trekIndex * 100 + DH.G.siteIndex * 7);
      animals = [];
      spawnQueue = site.spawns.map((s) => Object.assign({ spawned: false, animal: null }, s));
      t = 0;
      endT = null;
      doeFlash = 0;
      stats = { shots: 0, hits: 0, kills: [], doeHit: false };
      DH.shooting.reset();
      DH.entities.clearParticles();
      DH.audio.startAmbient(trek.env);
    },

    exit() { DH.audio.stopAmbient(); },

    update(dt) {
      t += dt;
      for (const s of spawnQueue) {
        if (!s.spawned && t >= s.t && !stats.doeHit) {
          s.spawned = true;
          s.animal = spawn(s);
        }
      }
      for (const a of animals) a.update(dt);
      // spawnQueue keeps references for scoring; the live list only draws/updates
      animals = animals.filter((a) => a.state !== 'dead' && !a.escaped);
      DH.entities.updateParticles(dt);
      DH.shooting.update(dt);
      doeFlash = Math.max(0, doeFlash - dt * 1.6);

      // camera pans slightly with the mouse
      const targetCam = ((DH.input.mouse.x - DH.CX) / DH.CX) * 30;
      DH.G.camX += (targetCam - DH.G.camX) * Math.min(1, dt * 5);

      if (endT != null) {
        endT -= dt;
        if (endT <= 0) finishSite();
        return;
      }
      // site decided?
      if (stats.doeHit) {
        endT = 1.4;
      } else if (t >= site.duration) {
        for (const s of spawnQueue) {
          if (s.role === 'buck' && s.animal && s.animal.alive) s.animal.escaped = true;
          if (s.role === 'buck' && !s.spawned) s.spawned = true;   // never showed: counts as gone
        }
        endT = 0.6;
      } else {
        const bucks = spawnQueue.filter((s) => s.role === 'buck');
        const allDone = bucks.every((s) => s.spawned && (!s.animal || s.animal.gone ||
          s.animal.state === 'dying'));
        if (allDone && bucks.every((s) => s.animal)) endT = 1.2;
      }
    },

    onClick(x, y) {
      if (DH.hud.muteHit(x, y)) { DH.audio.toggleMute(); return; }
      if (DH.hud.reloadHit(x, y)) { DH.shooting.reload(); return; }
      if (stats.doeHit) return;                    // site over, ignore
      const token = siteToken;
      const res = DH.shooting.tryFire(x, y, (ix, iy) => {
        if (token !== siteToken || DH.G.stateName !== 'HUNTING' || stats.doeHit) return;
        impact(ix, iy);
      });
      if (res.fired) stats.shots++;
    },

    onRclick() { DH.shooting.reload(); },

    onKey(k) {
      if (k === ' ') DH.shooting.reload();
      if (k === 'm' || k === 'M') DH.audio.toggleMute();
    },

    render(ctx) {
      bg.render(ctx, DH.G.camX, t);
      const sorted = [...animals].sort((a, b) => a.lane.depth - b.lane.depth);
      for (const a of sorted) a.draw(ctx);
      DH.entities.drawParticles(ctx);
      bg.renderFront(ctx, DH.G.camX);
      DH.shooting.drawShots(ctx);
      if (doeFlash > 0) {
        ctx.fillStyle = `rgba(200,30,20,${0.35 * doeFlash})`;
        ctx.fillRect(0, 0, DH.W, 540);
      }
      DH.hud.draw(ctx, {
        shells: true,
        trekName: trek.name,
        siteIndex: DH.G.siteIndex,
        siteCount: trek.sites.length,
        bucks: buckStates(),
      });
    },

    // ---- test hooks ----
    _animals() { return animals; },
    _forceSpawn(role) {
      return spawn({ role, lane: 1, side: 'L', behavior: 'walk', trophy: [3, 3], t: 0 });
    },
    _time() { return t; },
  };

  return {};
})();
