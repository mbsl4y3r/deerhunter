window.DH = window.DH || {};

// Shells, reload, and firing shared by hunt + bonus rounds. Shots are
// projectiles: the bullet flies from the gun (bottom-center) to the aim
// point, so moving targets must be led — hits resolve at impact time.
DH.shooting = (() => {
  const S = {
    shells: DH.data.shells,
    reloading: false,
    reloadT: 0,
    cooldown: 0,
    flash: null,          // muzzle flash at the gun { t }
    lowShellT: 0,         // time spent below full shells (drives the reload hint)
    bullets: [],          // { x0, y0, tx, ty, t, dur, onImpact }
  };

  function gun() { return { x: DH.CX, y: 556 }; }

  function flightTime(x, y) {
    const g = gun();
    return Math.hypot(x - g.x, y - g.y) / DH.data.bulletSpeed;
  }

  function reset() {
    S.shells = DH.data.shells;
    S.reloading = false;
    S.reloadT = 0;
    S.cooldown = 0;
    S.flash = null;
    S.lowShellT = 0;
    S.bullets = [];
  }

  function update(dt) {
    S.cooldown = Math.max(0, S.cooldown - dt);
    if (S.reloading) {
      S.reloadT -= dt;
      if (S.reloadT <= 0) {
        S.reloading = false;
        S.shells = DH.data.shells;
      }
    }
    if (S.flash) {
      S.flash.t += dt;
      if (S.flash.t > 0.09) S.flash = null;
    }
    for (const b of S.bullets) {
      b.t += dt;
      if (b.t >= b.dur) b.onImpact(b.tx, b.ty);
    }
    S.bullets = S.bullets.filter((b) => b.t < b.dur);
    S.lowShellT = S.shells < DH.data.shells && !S.reloading ? S.lowShellT + dt : 0;
  }

  function reload() {
    if (S.reloading || S.shells >= DH.data.shells) return false;
    S.reloading = true;
    S.reloadT = DH.data.reloadTime;
    DH.audio.play('pump');
    return true;
  }

  // Fire toward (x,y); onImpact(x,y) runs when the bullet lands.
  // Returns { fired, empty? }.
  function tryFire(x, y, onImpact) {
    if (S.reloading || S.cooldown > 0) return { fired: false };
    if (S.shells <= 0) {
      DH.audio.play('dryfire');
      DH.hud.banner('RELOAD!', '#ff4d3a', 0.7);
      return { fired: false, empty: true };
    }
    S.shells--;
    S.cooldown = DH.data.fireCooldown;
    S.flash = { t: 0 };
    const g = gun();
    S.bullets.push({ x0: g.x, y0: g.y - 14, tx: x, ty: y, t: 0,
                     dur: Math.max(0.05, flightTime(x, y)), onImpact });
    DH.G.shake = { t: 0.16, mag: 6 };
    DH.audio.play('shot');
    DH.hud.crosshairKick();
    return { fired: true };
  }

  // Resolve a landed bullet against targets (nearest lane occludes).
  // Returns { hit, part, mult } or null; spooks survivors either way.
  function resolveImpact(x, y, targets) {
    const sorted = [...targets].sort((a, b) => (b.lane ? b.lane.depth : 1) - (a.lane ? a.lane.depth : 1));
    let result = null;
    for (const tgt of sorted) {
      const hit = tgt.hitTest && tgt.hitTest(x, y);
      if (hit) { result = { hit: tgt, part: hit.part, mult: hit.mult }; break; }
    }
    for (const other of targets) {
      if (other.spook && (!result || other !== result.hit)) other.spook();
    }
    return result;
  }

  function drawShots(ctx) {
    // tracer streaks
    for (const b of S.bullets) {
      const k = b.t / b.dur;
      const x = DH.util.lerp(b.x0, b.tx, k);
      const y = DH.util.lerp(b.y0, b.ty, k);
      const tail = Math.max(0, k - 0.09);
      const px = DH.util.lerp(b.x0, b.tx, tail);
      const py = DH.util.lerp(b.y0, b.ty, tail);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,238,170,0.85)';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = '#fff6d8';
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (S.flash) {
      const g = gun();
      const f = Math.floor(S.flash.t / 0.045) % 2;
      DH.assets.draw(ctx, `muzzle_${f}`, g.x, g.y - 18, { rot: S.flash.t * 20, scale: 1.2 });
    }
  }

  return { reset, update, reload, tryFire, resolveImpact, drawShots, flightTime,
           get shells() { return S.shells; },
           get reloading() { return S.reloading; },
           get lowShellT() { return S.lowShellT; } };
})();
