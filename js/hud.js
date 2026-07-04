window.DH = window.DH || {};

// On-canvas HUD: score, shells, site pips, buck tags, banners, crosshair.
DH.hud = (() => {
  let bannerState = null;      // { text, color, t, dur }
  let shownScore = 0;
  let kick = 0;

  function banner(text, color, dur) {
    bannerState = { text, color: color || '#ffd94d', t: 0, dur: dur || 1.2 };
  }

  function crosshairKick() { kick = 1; }

  function update(dt) {
    if (bannerState) {
      bannerState.t += dt;
      if (bannerState.t > bannerState.dur) bannerState = null;
    }
    kick = Math.max(0, kick - dt * 9);
    // score counts up toward the real value
    const target = DH.G.score;
    const diff = target - shownScore;
    if (Math.abs(diff) < 1) shownScore = target;
    else shownScore += diff * Math.min(1, dt * 8);
  }

  function syncScore() { shownScore = DH.G.score; }

  function label(ctx, text, x, y, size, color, align, stroke) {
    ctx.font = `bold ${size}px Arial`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    if (stroke !== false) {
      ctx.lineWidth = Math.max(3, size * 0.16);
      ctx.lineJoin = 'round';                 // avoid miter spikes on M/K/W glyphs
      ctx.strokeStyle = 'rgba(15,20,15,0.85)';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  // opts: { trekName, siteIndex, siteCount, bucks: ['killed'|'escaped'|'pending'] }
  function draw(ctx, opts) {
    const o = opts || {};
    // score
    label(ctx, 'SCORE', DH.HUDL + 20, 30, 15, '#cfe3cf');
    label(ctx, DH.util.fmtScore(shownScore), DH.HUDL + 20, 62, 30, '#ffd94d');

    // trek + site pips
    if (o.trekName) {
      label(ctx, o.trekName, DH.CX, 30, 16, '#e8f0e8', 'center');
      const n = o.siteCount || 5;
      const w = 18;
      for (let i = 0; i < n; i++) {
        const x = DH.CX - ((n - 1) * w) / 2 + i * w;
        ctx.beginPath();
        ctx.arc(x, 44, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = i < o.siteIndex ? '#ffd94d' : i === o.siteIndex ? '#fff' : 'rgba(255,255,255,0.25)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(15,20,15,0.7)';
        ctx.stroke();
      }
    }

    // buck tags
    if (o.bucks) {
      o.bucks.forEach((st, i) => {
        const x = DH.HUDR - 55 - i * 30;
        ctx.save();
        ctx.globalAlpha = st === 'pending' ? 0.35 : 1;
        DH.util.rr(ctx, x - 12, 16, 24, 30, 4);
        ctx.fillStyle = st === 'killed' ? '#3f7a3f' : st === 'escaped' ? '#7a3f3f' : 'rgba(20,28,20,0.55)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        label(ctx, st === 'killed' ? '✓' : st === 'escaped' ? '✗' : '?', x, 38, 17, '#fff', 'center', false);
        ctx.restore();
      });
    }

    // shells + reload button (only on shooting screens)
    if (o.shells) {
      for (let i = 0; i < DH.data.shells; i++) {
        const loaded = i < DH.shooting.shells;
        ctx.save();
        ctx.globalAlpha = loaded ? 1 : 0.28;
        DH.assets.draw(ctx, 'shell', DH.HUDR - 80 + i * 24, 512, { scale: 1.15 });
        ctx.restore();
      }
      drawReloadButton(ctx);
    }

    // banner
    if (bannerState) {
      const b = bannerState;
      const pop = DH.util.easeOutBack(Math.min(1, b.t * 5));
      const fade = b.t > b.dur - 0.25 ? (b.dur - b.t) / 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(DH.CX, 448);
      ctx.scale(pop, pop);
      label(ctx, b.text, 0, 0, 40, b.color, 'center');
      ctx.restore();
    }

    // mute icon
    drawMute(ctx);
  }

  // big tap target, bottom-left (mobile has no right-click)
  const RELOAD_BTN = { w: 168, h: 52 };

  function reloadRect() {
    return { x: DH.HUDL + 16, y: 540 - RELOAD_BTN.h - 14, w: RELOAD_BTN.w, h: RELOAD_BTN.h };
  }

  function drawReloadButton(ctx) {
    const r = reloadRect();
    const reloading = DH.shooting.reloading;
    const full = DH.shooting.shells >= DH.data.shells;
    const urgent = DH.shooting.shells === 0 && !reloading;
    ctx.save();
    ctx.globalAlpha = full && !reloading ? 0.45 : 0.92;
    DH.util.rr(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = urgent && Math.floor(performanceNowSec() * 3) % 2 === 0
      ? '#7a2c20' : 'rgba(14,24,16,0.8)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = urgent ? '#ff5a4a' : '#c9a54a';
    ctx.stroke();
    label(ctx, reloading ? 'PUMPING...' : '⟳ RELOAD', r.x + r.w / 2, r.y + 34, 20,
          reloading ? '#ffd94d' : urgent ? '#ff8a7a' : '#f2ead0', 'center');
    ctx.restore();
    if (!reloading && (DH.shooting.lowShellT > 2 || urgent)) {
      label(ctx, 'TAP · R-CLICK · SPACE', r.x + r.w / 2, r.y - 8, 11, 'rgba(255,255,255,0.8)', 'center');
    }
  }

  // wall-clock only drives the urgent-blink phase (cosmetic, not gameplay)
  function performanceNowSec() { return performance.now() / 1000; }

  function reloadHit(x, y) {
    const r = reloadRect();
    return x >= r.x - 8 && x <= r.x + r.w + 12 && y >= r.y - 10 && y <= 540;
  }

  function drawMute(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.translate(DH.HUDR - 22, 76);
    ctx.fillStyle = '#e8f0e8';
    ctx.beginPath();
    ctx.moveTo(-8, -4); ctx.lineTo(-3, -4); ctx.lineTo(3, -9); ctx.lineTo(3, 9); ctx.lineTo(-3, 4); ctx.lineTo(-8, 4);
    ctx.closePath(); ctx.fill();
    if (DH.audio.muted) {
      ctx.strokeStyle = '#ff4d3a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(13, 7); ctx.stroke();
    } else {
      ctx.strokeStyle = '#e8f0e8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(4, 0, 7, -0.8, 0.8); ctx.stroke();
    }
    ctx.restore();
  }

  function muteHit(x, y) { return x > DH.HUDR - 44 && x < DH.HUDR + 8 && y > 56 && y < 96; }

  function drawCrosshair(ctx) {
    if (!DH.input.mouse.inside && !DH.G.testMode) return;
    const k = 1 + kick * 0.45;
    DH.assets.draw(ctx, 'crosshair', DH.input.mouse.x, DH.input.mouse.y, { scale: k });
  }

  return { draw, banner, update, drawCrosshair, crosshairKick, syncScore, label,
           muteHit, drawMute, reloadHit };
})();
