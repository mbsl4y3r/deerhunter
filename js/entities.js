window.DH = window.DH || {};

DH.entities = (() => {
  const { lerp, clamp } = DH.util;

  const GAIT_RATE = { walk: 1.7, trot: 2.7, run: 3.6 };

  class Animal {
    // cfg: { species, role, lane (index), side 'L'|'R', behavior, trophy, pauses }
    constructor(cfg) {
      this.sp = cfg.species;
      this.def = DH.data.species[this.sp];
      this.role = cfg.role;
      this.laneIdx = cfg.lane;
      this.lane = DH.data.LANES[cfg.lane];
      this.behavior = cfg.behavior || 'walk';
      this.trophy = cfg.trophy || 3;
      this.pauses = (cfg.pauses || []).map((p) => ({ atX: p.atX * DH.W, dur: p.dur, done: false }));
      this.scale = lerp(0.35, 1.0, this.lane.depth) * this.def.bodyScale;
      this.dir = cfg.side === 'L' ? 1 : -1;
      const margin = this.def.p.bodyLen * 1.3 * this.scale + 30;
      this.x = cfg.side === 'L' ? -margin : DH.W + margin;
      this.exitMargin = margin;
      this.state = 'cross';           // cross | graze | flee | dying | dead
      this.legPhase = DH.util.rand();
      this.stateT = 0;
      this.alpha = 1;
      // dying physics
      this.dyY = 0; this.dyVx = 0; this.dyVy = 0; this.rot = 0; this.rotV = 0;
      this.escaped = false;
    }

    get alive() { return this.state === 'cross' || this.state === 'graze' || this.state === 'flee'; }
    get gone() { return this.state === 'dead' || this.escaped; }

    speed() {
      if (this.state === 'flee') return this.def.runSpeed * 1.15;
      if (this.behavior === 'run') return this.def.runSpeed;
      if (this.behavior === 'trot') return this.def.walkSpeed * 1.9;
      return this.def.walkSpeed;
    }

    gait() {
      if (this.state === 'graze') return 'graze';
      if (this.state === 'flee' || this.behavior === 'run') return 'run';
      return 'walk';
    }

    update(dt) {
      this.stateT += dt;
      if (this.state === 'cross' || this.state === 'flee') {
        this.x += this.dir * this.speed() * this.scale * dt;
        this.legPhase += GAIT_RATE[this.state === 'flee' ? 'run' : this.behavior] * dt;
        if (this.state === 'cross') {
          for (const p of this.pauses) {
            if (!p.done && ((this.dir > 0 && this.x >= p.atX) || (this.dir < 0 && this.x <= p.atX))) {
              p.done = true;
              this.state = 'graze';
              this.stateT = 0;
              this.grazeDur = p.dur;
              break;
            }
          }
        }
        if (this.x < -this.exitMargin - 5 || this.x > DH.W + this.exitMargin + 5) {
          this.escaped = true;
        }
      } else if (this.state === 'graze') {
        if (this.stateT >= this.grazeDur) { this.state = 'cross'; this.stateT = 0; }
      } else if (this.state === 'dying') {
        this.dyVy += 900 * dt;
        this.x += this.dyVx * dt;
        this.dyY += this.dyVy * dt;
        this.rot += this.rotV * dt;
        if (this.dyY >= 0 && this.stateT > 0.25) {
          this.dyY = 0;
          if (Math.abs(this.dyVy) > 60) {
            this.dyVy = -this.dyVy * 0.3;                    // one soft bounce
            spawnDust(this.x, this.lane.y, this.scale);
            this.rotV *= 0.4;
          } else { this.dyVy = 0; this.rotV = 0; }
        }
        if (this.stateT > 0.9) {
          this.alpha = Math.max(0, 1 - (this.stateT - 0.9) / 0.35);
          if (this.alpha === 0) this.state = 'dead';
        }
      }
    }

    // Any gunshot may spook live animals into fleeing.
    spook() {
      if (!this.alive || this.state === 'flee') return;
      if (DH.util.rand() < this.def.spookChance) {
        this.state = 'flee';
        this.stateT = 0;
        this.dir = this.x > DH.CX ? 1 : -1;
      }
    }

    // current screen-space velocity (used by the test bot to lead shots)
    velocity() {
      if (this.state === 'cross' || this.state === 'flee') {
        return { x: this.dir * this.speed() * this.scale, y: 0 };
      }
      return { x: 0, y: 0 };
    }

    kill() {
      this.state = 'dying';
      this.stateT = 0;
      this.dyVx = this.dir * 30;
      this.dyVy = -170;
      this.dyY = -0.01;
      this.rotV = (this.dir > 0 ? -1 : 1) * (2.2 + DH.util.rand() * 1.2);
    }

    frameName() {
      const g = this.gait();
      if (g === 'graze') return `${this.sp}_${this.role}_graze`;
      if (g === 'run') return `${this.sp}_${this.role}_run_${Math.floor(this.legPhase * 2) % 2}`;
      return `${this.sp}_${this.role}_walk_${Math.floor(this.legPhase * 4) % 4}`;
    }

    draw(ctx) {
      const name = this.state === 'dying' || this.state === 'dead'
        ? `${this.sp}_${this.role}_run_1` : this.frameName();
      DH.assets.draw(ctx, name, this.x, this.lane.y + this.dyY, {
        scale: this.scale, dir: this.dir, rot: this.rot * (this.dir > 0 ? 1 : -1),
        alpha: this.alpha, trophy: this.trophy,
      });
    }

    // point-in-ellipse against species hitboxes; returns best part or null
    hitTest(px, py) {
      if (!this.alive) return null;
      let best = null;
      for (const hb of this.def.hitboxes) {
        const ex = this.x + hb.cx * this.scale * this.dir;
        const ey = this.lane.y + hb.cy * this.scale;
        const dx = (px - ex) / (hb.rx * this.scale);
        const dy = (py - ey) / (hb.ry * this.scale);
        if (dx * dx + dy * dy <= 1) {
          const mult = DH.data.scoring.partMult[hb.part];
          if (!best || mult > best.mult) best = { part: hb.part, mult };
        }
      }
      return best;
    }

    vitalsPoint() {
      const hb = this.def.hitboxes.find((h) => h.part === 'vitals') || this.def.hitboxes[0];
      return { x: this.x + hb.cx * this.scale * this.dir, y: this.lane.y + hb.cy * this.scale };
    }

    onScreen() {
      const half = this.def.p.bodyLen * 0.7 * this.scale;
      return this.x > half * 0.2 && this.x < DH.W - half * 0.2;
    }
  }

  // Bonus-round duck: flies across in a rising, wobbling line.
  class Duck {
    constructor(cfg) {                 // { side, speed, y }
      this.def = DH.data.species.duck;
      this.dir = cfg.side === 'L' ? 1 : -1;
      this.x = cfg.side === 'L' ? -50 : DH.W + 50;
      this.y = cfg.y;
      this.speed = cfg.speed;
      this.vy = -(28 + DH.util.rand() * 30);
      this.wob = DH.util.rand() * Math.PI * 2;
      this.flap = DH.util.rand();
      this.state = 'fly';              // fly | dying | dead
      this.stateT = 0;
      this.rot = 0;
      this.escaped = false;
    }

    get alive() { return this.state === 'fly'; }
    get gone() { return this.state === 'dead' || this.escaped; }

    update(dt) {
      this.stateT += dt;
      if (this.state === 'fly') {
        this.flap += dt * 9;
        this.x += this.dir * this.speed * dt;
        this.y += this.vy * dt + Math.sin(this.stateT * 5 + this.wob) * 26 * dt;
        if (this.y < 55) this.vy = Math.abs(this.vy) * 0.4;
        if (this.x < -70 || this.x > DH.W + 70) this.escaped = true;
      } else if (this.state === 'dying') {
        this.y += (this.stateT * 780) * dt;
        this.x += this.dir * 26 * dt;
        this.rot += this.dir * 7 * dt;
        if (this.y > 400) { this.state = 'dead'; spawnDust(this.x, this.y, 0.7); }
      }
    }

    kill() { this.state = 'dying'; this.stateT = 0; }

    draw(ctx) {
      const name = this.state === 'fly' ? `duck_${Math.floor(this.flap) % 2}` : 'duck_1';
      DH.assets.draw(ctx, name, this.x, this.y, { dir: this.dir, rot: this.rot });
    }

    hitTest(px, py) {
      if (!this.alive) return null;
      const hb = this.def.hitboxes[0];
      const dx = (px - this.x) / hb.rx, dy = (py - this.y) / hb.ry;
      return dx * dx + dy * dy <= 1 ? { part: 'body', mult: 1 } : null;
    }

    vitalsPoint() { return { x: this.x, y: this.y }; }
    onScreen() { return this.x > 30 && this.x < DH.W - 30; }

    velocity() {
      if (this.state !== 'fly') return { x: 0, y: 0 };
      return { x: this.dir * this.speed, y: this.vy };
    }
  }

  // ---- particles & popups ----
  let particles = [];

  function spawnPuff(x, y, scale) {
    for (let i = 0; i < 12; i++) {
      const a = DH.util.rand() * Math.PI * 2;
      const sp = 40 + DH.util.rand() * 90;
      particles.push({
        type: 'puff', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
        r: (4 + DH.util.rand() * 6) * (scale || 1), t: 0, life: 0.4 + DH.util.rand() * 0.2,
      });
    }
  }

  function spawnDust(x, y, scale) {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * (0.25 + DH.util.rand() * 0.5);
      const sp = 20 + DH.util.rand() * 50;
      particles.push({
        type: 'dust', x, y, vx: Math.cos(a) * sp * 1.6, vy: Math.sin(a) * sp,
        r: (3 + DH.util.rand() * 5) * (scale || 1), t: 0, life: 0.5,
      });
    }
  }

  function spawnFeathers(x, y) {
    for (let i = 0; i < 8; i++) {
      particles.push({
        type: 'feather', x, y,
        vx: (DH.util.rand() - 0.5) * 130, vy: -20 - DH.util.rand() * 60,
        r: 2.5 + DH.util.rand() * 2.5, t: 0, life: 0.9 + DH.util.rand() * 0.5,
      });
    }
  }

  function spawnPopup(x, y, text, color) {
    particles.push({ type: 'popup', x: clamp(x, 70, DH.W - 70), y: clamp(y, 60, 500), text, color, t: 0, life: 1.1 });
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.t += dt;
      if (p.type === 'popup') continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'feather') p.vy += 60 * dt;
      else p.vy -= 20 * dt;
    }
    particles = particles.filter((p) => p.t < p.life);
  }

  function drawParticles(ctx) {
    for (const p of particles) {
      const k = 1 - p.t / p.life;
      if (p.type === 'popup') {
        const rise = DH.util.easeOutCubic(p.t / p.life) * 44;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 2);
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(20,20,20,0.85)';
        ctx.strokeText(p.text, p.x, p.y - rise);
        ctx.fillStyle = p.color || '#ffd94d';
        ctx.fillText(p.text, p.x, p.y - rise);
        ctx.restore();
      } else {
        ctx.globalAlpha = k * (p.type === 'dust' ? 0.5 : 0.85);
        ctx.fillStyle = p.type === 'dust' ? '#b8a888' : p.type === 'feather' ? '#e8e4d8' : '#f2f2ee';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.6 + 0.6 * (p.t / p.life)), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  function clearParticles() { particles = []; }

  return { Animal, Duck, spawnPuff, spawnDust, spawnFeathers, spawnPopup,
           updateParticles, drawParticles, clearParticles };
})();
