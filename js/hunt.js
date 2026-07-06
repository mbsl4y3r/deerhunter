window.DH = window.DH || {};

// The HUNTING state: one site of one trek.
DH.hunt = (() => {
  let bg = null;
  let animals = [];
  let spawnQueue = [];
  let critters = [];
  let critterQueue = [];
  let t = 0;
  let site = null, trek = null;
  let stats = null;
  let endT = null;            // countdown to SITE_RESULTS once the site is decided
  let doeFlash = 0;
  let siteToken = 0;          // stale-bullet guard: impacts from a previous site are ignored
  let paused = false;
  let scoping = false;        // Marksman 98: held press = scoped aim + slow time

  // pause-menu buttons (drawn + hit-tested from the same rects)
  function pauseButtons() {
    const CX = DH.CX;
    return [
      { id: 'resume', label: '▶ RESUME', y: 218 },
      { id: 'endTrek', label: 'END TREK EARLY', y: 288 },
      { id: 'title', label: 'MAIN MENU', y: 358 },
    ].map((b) => ({ x: CX - 130, w: 260, h: 48, ...b }));
  }

  function endScope() {
    if (!scoping) return;
    scoping = false;
    DH.G.scopeView = false;
    DH.G.timeScale = 1;
  }

  // full-view zoom about the aim point + scope glass vignette
  function drawScope(ctx) {
    const ax = DH.input.mouse.x, ay = DH.input.mouse.y;
    const R = 165;
    ctx.save();
    // darkness outside the lens
    ctx.beginPath();
    ctx.rect(0, 0, DH.W, 540);
    ctx.arc(ax, ay, R, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(6,8,6,0.82)';
    ctx.fill('evenodd');
    // rim + glass tint
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#101410';
    ctx.beginPath(); ctx.arc(ax, ay, R + 4, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(180,200,180,0.5)';
    ctx.beginPath(); ctx.arc(ax, ay, R - 3, 0, Math.PI * 2); ctx.stroke();
    // fine reticle: hairlines + mil dots (PNG override: 'scope_ring')
    const ring = DH.assets.get('scope_ring');
    if (ring && ring.img) {
      DH.assets.draw(ctx, 'scope_ring', ax, ay, { scale: (R * 2 + 24) / ring.w });
    } else {
      ctx.strokeStyle = 'rgba(20,24,20,0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(ax - R + 6, ay); ctx.lineTo(ax + R - 6, ay);
      ctx.moveTo(ax, ay - R + 6); ctx.lineTo(ax, ay + R - 6);
      ctx.stroke();
      ctx.fillStyle = 'rgba(20,24,20,0.9)';
      for (const d of [-60, -30, 30, 60]) {
        ctx.fillRect(ax + d - 1.5, ay - 5, 3, 10);
        ctx.fillRect(ax - 5, ay + d - 1.5, 10, 3);
      }
      ctx.fillStyle = '#c8402e';
      ctx.beginPath(); ctx.arc(ax, ay, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // seeded per site: bird flocks drift by, and the odd squirrel, rabbit or
  // skunk wanders through the foreground (classic small-game targets)
  function buildCritterSchedule() {
    const rng = DH.G.rng;
    const q = [];
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const roll = rng();
      const type = roll < 0.4 ? 'bird' : roll < 0.62 ? 'squirrel' : roll < 0.82 ? 'rabbit' : 'skunk';
      q.push({
        t: 2 + rng() * Math.max(6, site.duration - 9),
        type,
        side: rng() < 0.5 ? 'L' : 'R',
        count: type === 'bird' ? 3 + Math.floor(rng() * 3) : 1,
        spawned: false,
      });
    }
    return q;
  }

  function spawnCritters(ev) {
    const rng = DH.G.rng;
    for (let i = 0; i < ev.count; i++) {
      critters.push(new DH.entities.Critter({
        type: ev.type,
        side: ev.side,
        y: ev.type === 'bird' ? 60 + rng() * 110 + i * 12 : 462 + rng() * 34,
      }));
      if (ev.type === 'bird') critters[critters.length - 1].x -= i * (34 + rng() * 20) * (ev.side === 'L' ? 1 : -1);
    }
  }

  // small-game hit: points for squirrels/rabbits, a smelly penalty for skunks
  function critterImpact(x, y) {
    for (const c of critters) {
      const hit = c.hitTest(x, y);
      if (!hit) continue;
      c.kill();
      DH.entities.spawnPuff(x, y, 0.5);
      if (c.type === 'skunk') {
        const pen = DH.data.scoring.skunkPenalty;
        DH.G.score += pen;
        stats.critterPts += pen;
        DH.entities.spawnStink(c.x, c.y);
        DH.entities.spawnPopup(x, y - 24, DH.util.fmtScore(pen), '#9dbf4e');
        DH.hud.banner('P.U.! NOT THE SKUNK!', '#9dbf4e', 1.4);
        DH.audio.play('buzzer');
      } else {
        const pts = DH.data.scoring.critterPoints[c.type] || 250;
        DH.G.score += pts;
        stats.critterPts += pts;
        const cash = DH.shop.earn(pts);
        stats.cash += cash;
        DH.entities.spawnPopup(x, y - 24, '+' + pts + ' CRITTER!', '#8fd3ff');
        DH.audio.play('thud');
      }
      return true;
    }
    return false;
  }

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
      if (s.animal.down) return 'killed';
      if (s.animal.escaped) return 'escaped';
      return 'pending';
    });
  }

  function killPoints(a, part, mult) {
    const sc = DH.data.scoring;
    const speedMult = a.state === 'flee' || a.behavior === 'run' ? sc.runMult
      : a.behavior === 'trot' ? sc.trotMult : 1;
    const pts = a.def.base * sc.distMult[a.laneIdx] * speedMult * mult *
      (1 + sc.trophyStep * (a.trophy - 1)) * DH.shop.scoreMult();
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
      cash: stats.cash,
      critterPts: stats.critterPts,
      streak: stats.bestStreak,
      species: trek.species,
    };
    DH.G.score += rec.accBonus + rec.threeBuckBonus;
    DH.G.trekRecords.push(rec);
    DH.setState('SITE_RESULTS', rec);
  }

  // a bullet has landed at (x, y)
  function impact(x, y) {
    const res = DH.shooting.resolveImpact(x, y, animals.filter((a) => a.alive));
    if (!res) {
      if (critterImpact(x, y)) { stats.hits++; return; }    // critters don't touch the streak
      stats.streak = 0;
      if (y > 290) DH.entities.spawnDust(x, y, 0.7);        // dirt kick on the ground
      else if (y > 130) DH.entities.spawnLeaves(x, y);      // rustle the canopy
      return;
    }
    stats.hits++;
    const a = res.hit;
    DH.entities.spawnPuff(x, y, a.scale);
    if (a.role === 'buck') {
      const pts = killPoints(a, res.part, res.mult);
      DH.G.score += pts;
      const cash = DH.shop.earn(pts);
      stats.cash += cash;
      stats.streak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
      stats.kills.push({ species: a.sp, trophy: a.trophy, part: res.part, points: pts,
                         running: a.state === 'flee' || a.behavior === 'run' });
      a.kill();
      DH.audio.play('thud');
      DH.entities.spawnPopup(x, y - 30, '+' + DH.util.fmtScore(pts),
                             res.part === 'head' ? '#ffe97a' : '#ffd94d');
      DH.entities.spawnPopup(x, y + 6, '+$' + DH.util.fmtScore(cash), '#7ac96b');
      if (a.trophy >= 5) {
        DH.hud.banner(a.def.monsterBanner || 'MONSTER BUCK!', '#ffd94d', 1.2);
        DH.G.timeScale = 0.3;                       // savor the trophy
      } else if (res.part === 'head') {
        DH.hud.banner('TROPHY SHOT!', '#ffe97a', 1.0);
      }
    } else {
      // shot a doe: penalty, site over
      stats.streak = 0;
      stats.doeHit = true;
      DH.G.score += DH.data.scoring.doePenalty;
      a.kill();
      doeFlash = 1;
      DH.audio.play('buzzer');
      DH.entities.spawnPopup(x, y - 30, DH.util.fmtScore(DH.data.scoring.doePenalty), '#ff5a4a');
      DH.hud.banner(a.def.doeWarn || "DON'T SHOOT THE DOES!", '#ff5a4a', 1.6);
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
      critters = [];
      critterQueue = buildCritterSchedule();
      t = 0;
      endT = null;
      doeFlash = 0;
      paused = false;
      scoping = false;
      stats = { shots: 0, hits: 0, kills: [], doeHit: false, cash: 0, critterPts: 0,
                streak: 0, bestStreak: 0 };
      DH.shooting.reset();
      DH.entities.clearParticles();
      DH.audio.startAmbient(trek.env);
    },

    exit() { DH.audio.stopAmbient(); endScope(); },

    onResize() {
      if (trek) bg = DH.background.build(trek.env, DH.G.seed + DH.G.trekIndex * 100 + DH.G.siteIndex * 7);
    },

    update(dt) {
      if (paused) return;                      // world freezes under the menu
      if (scoping) DH.G.timeScale = DH.shop.slowmo();   // held vs the loop's ease-back
      t += dt;
      for (const s of spawnQueue) {
        if (!s.spawned && t >= s.t && !stats.doeHit) {
          s.spawned = true;
          s.animal = spawn(s);
        }
      }
      for (const s of critterQueue) {
        if (!s.spawned && t >= s.t) { s.spawned = true; spawnCritters(s); }
      }
      for (const a of animals) a.update(dt);
      for (const c of critters) c.update(dt);
      critters = critters.filter((c) => !c.gone);
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
        const allDone = bucks.every((s) => s.spawned && (!s.animal || s.animal.gone || s.animal.down));
        if (allDone && bucks.every((s) => s.animal)) endT = 1.2;
      }
    },

    onClick(x, y) {
      if (paused) { this._pauseClick(x, y); return; }
      if (DH.hud.menuHit(x, y)) { paused = true; endScope(); DH.audio.play('ui'); return; }
      if (DH.hud.muteHit(x, y)) { DH.audio.toggleMute(); return; }
      if (DH.hud.reloadHit(x, y)) { DH.shooting.reload(); return; }
      if (stats.doeHit) return;                    // site over, ignore
      this._fire(x, y);
    },

    // press/drag/release cycle — only the scoped rifle takes it over
    onPress(x, y) {
      if (paused || !DH.shop.scoped() || stats.doeHit ||
          DH.hud.menuHit(x, y) || DH.hud.muteHit(x, y) || DH.hud.reloadHit(x, y)) {
        this.onClick(x, y);
        return;
      }
      if (DH.shooting.shells <= 0 || DH.shooting.reloading) { this._fire(x, y); return; }
      scoping = true;
      DH.G.scopeView = true;
    },

    onRelease(x, y) {
      if (!scoping) return;
      endScope();
      this._fire(x, y);
    },

    _fire(x, y) {
      const token = siteToken;
      const res = DH.shooting.tryFire(x, y, (ix, iy) => {
        if (token !== siteToken || DH.G.stateName !== 'HUNTING' || stats.doeHit) return;
        impact(ix, iy);
      });
      if (res.fired) {
        stats.shots++;
        for (const c of critters) c.scatter();   // gunfire clears the sky
      }
    },

    _pauseClick(x, y) {
      for (const b of pauseButtons()) {
        if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
        DH.audio.play('ui');
        if (b.id === 'resume') { paused = false; }
        else if (b.id === 'endTrek') { paused = false; DH.setState('TREK_RESULTS'); }
        else if (b.id === 'title') { paused = false; DH.setState('TITLE'); }
        return;
      }
    },

    onRclick() { if (!paused) DH.shooting.reload(); },

    onKey(k) {
      if (k === 'Escape') { paused = !paused; if (paused) endScope(); return; }
      if (paused) return;
      if (k === ' ') DH.shooting.reload();
      if (k === 'm' || k === 'M') DH.audio.toggleMute();
    },

    render(ctx) {
      if (scoping) {
        // whole view magnifies about the aim point; firing coords are
        // untouched (the zoom is render-only, the world doesn't move)
        const z = DH.shop.zoom();
        const ax = DH.input.mouse.x, ay = DH.input.mouse.y;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.scale(z, z);
        ctx.translate(-ax, -ay);
      }
      bg.render(ctx, DH.G.camX, t);
      for (const c of critters) if (c.type === 'bird') c.draw(ctx);      // sky traffic
      const sorted = [...animals].sort((a, b) => a.lane.depth - b.lane.depth);
      for (const a of sorted) a.draw(ctx);
      for (const c of critters) if (c.type !== 'bird') c.draw(ctx);      // foreground critters
      DH.entities.drawParticles(ctx);
      bg.renderFront(ctx, DH.G.camX);
      DH.shooting.drawShots(ctx);
      if (scoping) ctx.restore();
      // the trek marches from dawn to dusk across its five sites
      const tint = [
        'rgba(255,170,110,0.10)',      // site 1 — first light
        null,                          // site 2 — morning
        null,                          // site 3 — midday
        'rgba(255,150,60,0.14)',       // site 4 — golden hour
        'rgba(70,60,140,0.22)',        // site 5 — dusk
      ][DH.G.siteIndex];
      if (tint) {
        ctx.fillStyle = tint;
        ctx.fillRect(0, 0, DH.W, 540);
      }
      if (doeFlash > 0) {
        ctx.fillStyle = `rgba(200,30,20,${0.35 * doeFlash})`;
        ctx.fillRect(0, 0, DH.W, 540);
      }
      if (scoping) drawScope(ctx);
      DH.hud.draw(ctx, {
        shells: true,
        trekName: trek.name,
        siteIndex: DH.G.siteIndex,
        siteCount: trek.sites.length,
        bucks: buckStates(),
        menu: true,
      });
      if (DH.shop.scoped() && !scoping && t < 6 && DH.G.siteIndex === 0) {
        DH.hud.label(ctx, 'HOLD TO SCOPE — RELEASE TO FIRE', DH.CX, 486, 14, '#8fd3ff', 'center');
      }
      if (paused) {
        ctx.fillStyle = 'rgba(6,10,7,0.72)';
        ctx.fillRect(0, 0, DH.W, 540);
        DH.hud.label(ctx, 'PAUSED', DH.CX, 160, 42, '#ffd94d', 'center');
        for (const b of pauseButtons()) {
          DH.assets.draw(ctx, 'wood_btn', b.x + b.w / 2, b.y + b.h / 2, { scale: 1.18 });
          DH.hud.label(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 + 7, 19,
            b.id === 'resume' ? '#ffe97a' : '#f2ead0', 'center');
        }
        DH.hud.label(ctx, 'END TREK KEEPS YOUR SITES SO FAR · MAIN MENU ABANDONS THE RUN',
          DH.CX, 448, 12, '#9ab59a', 'center');
      }
    },

    // ---- test hooks ----
    _animals() { return animals; },
    _forceSpawn(role, trophy) {
      return spawn({ role, lane: 1, side: 'L', behavior: 'walk', trophy: [trophy || 3, trophy || 3], t: 0 });
    },
    _time() { return t; },
  };

  return {};
})();
