window.DH = window.DH || {};

// Bonus minigames, played after each trek. The game rotates with the trek:
// Duck Flush (shoot the flock), Bottle Blitz (smash lobbed moonshine jugs),
// Critter Alley (pop-up raccoons — but never the skunks).
DH.bonus = (() => {
  let bg = null;
  let game = null;            // active entry from DH.data.bonusGames
  let targets = [];
  let queue = [];
  let t = 0;
  let stats = null;
  let endT = null;
  let introT = 0;
  let roundToken = 0;

  // ---- Bottle Blitz target: a stoneware jug lobbed up across the sky ----
  class Bottle {
    constructor(cfg) {         // { x, vx, vy }
      this.x = cfg.x;
      this.y = 560;
      this.vx = cfg.vx;
      this.vy = cfg.vy;
      this.rot = DH.util.rand() * Math.PI;
      this.rotV = (DH.util.rand() - 0.5) * 7;
      this.state = 'fly';      // fly | dead
      this.escaped = false;
    }

    get alive() { return this.state === 'fly'; }
    get gone() { return this.state === 'dead' || this.escaped; }

    update(dt) {
      if (this.state !== 'fly') return;
      this.vy += 340 * dt;                       // gentle lob, generous hang time
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.rotV * dt;
      if (this.y > 570 || this.x < -60 || this.x > DH.W + 60) this.escaped = true;
    }

    kill() { this.state = 'dead'; }

    hitTest(px, py) {
      if (!this.alive) return null;
      const dx = (px - this.x) / 24, dy = (py - this.y) / 30;   // thumb-friendly
      return dx * dx + dy * dy <= 1 ? { part: 'bottle', mult: 1 } : null;
    }

    draw(ctx) {
      DH.assets.draw(ctx, 'bottle_jug', this.x, this.y + 25, { rot: this.rot, scale: 1.15 });
    }

    vitalsPoint() { return { x: this.x, y: this.y }; }
    onScreen() { return this.y < 520 && this.x > 40 && this.x < DH.W - 40; }
    velocity() { return this.alive ? { x: this.vx, y: this.vy } : { x: 0, y: 0 }; }
  }

  // ---- Critter Alley target: pops up from a grass mound, then ducks back ----
  class PopCritter {
    constructor(cfg) {         // { x, y, kind: 'raccoon'|'skunk', upTime, scale }
      this.x = cfg.x;
      this.y = cfg.y;
      this.kind = cfg.kind;
      this.upTime = cfg.upTime;
      this.scaleBase = cfg.scale;
      this.state = 'rising';   // rising | up | hiding | dead | done
      this.stateT = 0;
      this.escaped = false;
      this.shootable = this.kind === 'raccoon';   // the test bot must spare skunks
    }

    get alive() { return this.state === 'rising' || this.state === 'up'; }
    get gone() { return this.state === 'done' || this.state === 'dead'; }

    pop() { return this.state === 'rising' ? Math.min(1, this.stateT / 0.18)
      : this.state === 'hiding' ? Math.max(0, 1 - this.stateT / 0.15)
      : this.state === 'up' ? 1 : 1; }

    update(dt) {
      this.stateT += dt;
      if (this.state === 'rising' && this.stateT >= 0.18) { this.state = 'up'; this.stateT = 0; }
      else if (this.state === 'up' && this.stateT >= this.upTime) { this.state = 'hiding'; this.stateT = 0; }
      else if (this.state === 'hiding' && this.stateT >= 0.15) { this.state = 'done'; }
      else if (this.state === 'dead' && this.stateT > 0.5) { this.state = 'done'; }
    }

    kill() { this.state = 'dead'; this.stateT = 0; }

    hitTest(px, py) {
      if (!this.alive) return null;
      const s = this.scaleBase * this.pop();
      const dx = (px - this.x) / (26 * s), dy = (py - (this.y - 30 * s)) / (32 * s);
      return dx * dx + dy * dy <= 1 ? { part: this.kind, mult: 1 } : null;
    }

    draw(ctx) {
      const k = this.state === 'dead' ? Math.max(0, 1 - this.stateT * 2.4) : this.pop();
      if (k <= 0) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(1, k);                            // rises out of the mound
      DH.assets.draw(ctx, this.kind === 'raccoon' ? 'raccoon_pop' : 'skunk_pop', 0, 0,
        { scale: this.scaleBase, alpha: this.state === 'dead' ? k : 1 });
      ctx.restore();
    }

    vitalsPoint() { return { x: this.x, y: this.y - 30 * this.scaleBase }; }
    onScreen() { return this.state === 'up'; }
    velocity() { return { x: 0, y: 0 }; }
  }

  // grass mounds the alley critters hide behind
  function mounds() {
    const CX = DH.CX;
    return [
      { x: CX - 300, y: 395, s: 0.95 }, { x: CX, y: 385, s: 0.9 }, { x: CX + 300, y: 395, s: 0.95 },
      { x: CX - 180, y: 470, s: 1.15 }, { x: CX + 180, y: 470, s: 1.15 },
      { x: CX + (DH.W > 1040 ? 420 : 60), y: 452, s: 1.05 },
    ];
  }

  function impact(x, y) {
    const live = targets.filter((d) => d.alive);
    // nearest-first manual resolve (pop critters + bottles are simple shapes)
    for (const d of live) {
      const hit = d.hitTest(x, y);
      if (!hit) continue;
      if (game.id === 'critters' && hit.part === 'skunk') {
        stats.skunked++;
        DH.G.score += game.skunkPenalty;
        stats.points += game.skunkPenalty;
        d.kill();
        DH.entities.spawnStink(d.x, d.y - 20);
        DH.entities.spawnPopup(x, y - 24, DH.util.fmtScore(game.skunkPenalty), '#9dbf4e');
        DH.hud.banner('P.U.! NOT THE SKUNKS!', '#9dbf4e', 1.2);
        DH.audio.play('buzzer');
        return;
      }
      stats.hits++;
      stats.points += game.points;
      DH.G.score += game.points;
      DH.shop.earn(game.points);
      d.kill();
      if (game.id === 'ducks') { DH.entities.spawnFeathers(x, y); DH.audio.play('quack'); }
      else if (game.id === 'bottles') { DH.entities.spawnGlass(d.x, d.y); DH.audio.play('thud'); }
      else { DH.entities.spawnPuff(x, y, 0.6); DH.audio.play('thud'); }
      DH.entities.spawnPopup(x, y - 24, '+' + game.points, '#ffd94d');
      return;
    }
    // clean miss: dirt kick low, nothing high
    if (y > 380) DH.entities.spawnDust(x, y, 0.6);
  }

  function finish() {
    const rec = {
      name: game.name,
      label: game.label,
      hits: stats.hits, total: stats.total,
      points: stats.points,
      allBonus: stats.hits === stats.total && !stats.skunked ? game.allBonus : 0,
      skunked: stats.skunked,
    };
    DH.G.score += rec.allBonus;
    DH.setState('BONUS_RESULTS', rec);
  }

  function buildQueue() {
    queue = [];
    let total = 0;
    if (game.id === 'ducks') {
      for (const w of game.waves) {
        for (let i = 0; i < w.count; i++) {
          queue.push({ t: w.t + i * 0.55, spawned: false, make: () => new DH.entities.Duck({
            side: (i + (w.count % 2)) % 2 ? 'R' : 'L', speed: w.speed, y: 300 + DH.util.rand() * 90,
          })});
          total++;
        }
      }
    } else if (game.id === 'bottles') {
      for (const w of game.waves) {
        for (let i = 0; i < w.count; i++) {
          queue.push({ t: w.t + i * 0.7, spawned: false, make: () => {
            const fromL = DH.util.rand() < 0.5;
            const x = fromL ? 80 + DH.util.rand() * 160 : DH.W - 80 - DH.util.rand() * 160;
            return new Bottle({
              x,
              vx: (fromL ? 1 : -1) * (40 + DH.util.rand() * 110),
              vy: -(w.lob * 0.82 + DH.util.rand() * w.lob * 0.22),
            });
          }});
          total++;
        }
      }
    } else {                                          // critter alley
      const MS = mounds();
      const slots = [];
      for (let i = 0; i < game.raccoons; i++) slots.push('raccoon');
      for (let i = 0; i < game.skunks; i++) slots.push('skunk');
      // seeded shuffle
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(DH.util.rand() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      let lastMound = -1;
      slots.forEach((kind, i) => {
        let m = Math.floor(DH.util.rand() * MS.length);
        if (m === lastMound) m = (m + 1) % MS.length;
        lastMound = m;
        queue.push({ t: 1.2 + i * ((game.duration - 4) / slots.length), spawned: false, make: () => new PopCritter({
          x: MS[m].x + (DH.util.rand() - 0.5) * 30, y: MS[m].y, kind, upTime: game.upTime, scale: MS[m].s,
        })});
        if (kind === 'raccoon') total++;
      });
    }
    stats = { hits: 0, total, points: 0, skunked: 0 };
  }

  DH.states = DH.states || {};
  DH.states.BONUS = {
    enter() {
      roundToken++;
      game = DH.data.bonusGames[DH.G.trekIndex % DH.data.bonusGames.length];
      const trek = DH.data.treks[DH.G.trekIndex];
      bg = DH.background.build(trek.env, DH.G.seed + 5000 + DH.G.trekIndex);
      targets = [];
      t = 0;
      endT = null;
      introT = 2.0;
      buildQueue();
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
          q.target = q.make();
          targets.push(q.target);
        }
      }
      for (const d of targets) d.update(dt);
      targets = targets.filter((d) => !d.gone);
      DH.entities.updateParticles(dt);
      DH.shooting.update(dt);
      const targetCam = ((DH.input.mouse.x - DH.CX) / DH.CX) * 30;
      DH.G.camX += (targetCam - DH.G.camX) * Math.min(1, dt * 5);

      if (endT != null) {
        endT -= dt;
        if (endT <= 0) finish();
        return;
      }
      const allResolved = queue.every((q) => q.spawned && (!q.target || !q.target.alive));
      if (t >= game.duration || allResolved) endT = 1.0;
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
      if (game.id === 'critters') {
        // grass mounds the critters pop from
        for (const m of mounds()) {
          ctx.fillStyle = '#3d5230';
          ctx.beginPath();
          ctx.ellipse(m.x - DH.G.camX * 0.0, m.y, 52 * m.s, 16 * m.s, 0, Math.PI, Math.PI * 2);
          ctx.fill();
        }
      }
      // draw targets before the mound rims so hiders sink behind them
      for (const d of targets) d.draw(ctx);
      if (game.id === 'critters') {
        for (const m of mounds()) {
          ctx.fillStyle = '#2c3d24';
          ctx.beginPath();
          ctx.ellipse(m.x, m.y + 4, 55 * m.s, 12 * m.s, 0, Math.PI, Math.PI * 2);
          ctx.fill();
        }
      }
      DH.entities.drawParticles(ctx);
      bg.renderFront(ctx, DH.G.camX);
      DH.shooting.drawShots(ctx);
      DH.hud.draw(ctx, { shells: true });
      DH.hud.label(ctx, `BONUS — ${game.name}`, DH.CX, 30, 18, '#ffd94d', 'center');
      DH.hud.label(ctx, `${game.label} ${stats.hits}/${stats.total}`, DH.CX, 52, 14, '#e8f0e8', 'center');
      if (introT > 0) {
        ctx.fillStyle = `rgba(10,16,12,${Math.min(0.55, introT)})`;
        ctx.fillRect(0, 0, DH.W, 540);
        const pop = DH.util.easeOutBack(Math.min(1, (2 - introT) * 2));
        ctx.save();
        ctx.translate(DH.CX, 250);
        ctx.scale(pop, pop);
        DH.hud.label(ctx, 'BONUS ROUND', 0, -20, 46, '#ffd94d', 'center');
        DH.hud.label(ctx, `${game.name} — ${game.intro}`, 0, 24, 20, '#fff', 'center');
        ctx.restore();
      }
    },

    _animals() { return targets; },
  };

  return {};
})();
