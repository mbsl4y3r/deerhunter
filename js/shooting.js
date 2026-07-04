window.DH = window.DH || {};

// Shells, reload, firing, and shot feedback shared by hunt + bonus rounds.
DH.shooting = (() => {
  const S = {
    shells: DH.data.shells,
    reloading: false,
    reloadT: 0,
    cooldown: 0,
    flash: null,          // { x, y, t }
    lowShellT: 0,         // time spent below full shells (drives the reload hint)
  };

  function reset() {
    S.shells = DH.data.shells;
    S.reloading = false;
    S.reloadT = 0;
    S.cooldown = 0;
    S.flash = null;
    S.lowShellT = 0;
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
    S.lowShellT = S.shells < DH.data.shells && !S.reloading ? S.lowShellT + dt : 0;
  }

  function reload() {
    if (S.reloading || S.shells >= DH.data.shells) return false;
    S.reloading = true;
    S.reloadT = DH.data.reloadTime;
    DH.audio.play('pump');
    return true;
  }

  // Fire at (x,y) against a list of targets (nearest lane wins on overlap).
  // Returns { fired, hit: target|null, part, mult }.
  function tryFire(x, y, targets) {
    if (S.reloading || S.cooldown > 0) return { fired: false };
    if (S.shells <= 0) {
      DH.audio.play('dryfire');
      DH.hud.banner('RELOAD!', '#ff4d3a', 0.7);
      return { fired: false, empty: true };
    }
    S.shells--;
    S.cooldown = DH.data.fireCooldown;
    S.flash = { x, y, t: 0 };
    DH.G.shake = { t: 0.16, mag: 6 };
    DH.audio.play('shot');
    DH.hud.crosshairKick();

    // near targets occlude far ones
    const sorted = [...targets].sort((a, b) => (b.lane ? b.lane.depth : 1) - (a.lane ? a.lane.depth : 1));
    for (const tgt of sorted) {
      const hit = tgt.hitTest && tgt.hitTest(x, y);
      if (hit) {
        for (const other of targets) if (other !== tgt && other.spook) other.spook();
        return { fired: true, hit: tgt, part: hit.part, mult: hit.mult };
      }
    }
    for (const other of targets) if (other.spook) other.spook();
    return { fired: true, hit: null };
  }

  function drawFlash(ctx) {
    if (!S.flash) return;
    const f = Math.floor(S.flash.t / 0.045) % 2;
    DH.assets.draw(ctx, `muzzle_${f}`, S.flash.x, S.flash.y, { rot: S.flash.t * 20 });
  }

  return { reset, update, reload, tryFire, drawFlash,
           get shells() { return S.shells; },
           get reloading() { return S.reloading; },
           get lowShellT() { return S.lowShellT; } };
})();
