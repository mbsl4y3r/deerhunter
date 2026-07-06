window.DH = window.DH || {};

// Environment painters. Static layers are generated once per site into
// offscreen canvases (seeded, so each site looks different but stable) and
// blitted with a parallax offset; only the sky animates live.
DH.background = (() => {
  let W = 960;                      // synced to DH.W in build()
  const H = 540, M = 48;            // M = parallax margin baked into layers

  function makeLayer(paint) {
    const c = document.createElement('canvas');
    c.width = W + M * 2; c.height = H;
    const g = c.getContext('2d');
    g.translate(M, 0);
    paint(g);
    return c;
  }

  function grad(ctx, x, y, w, h, stops) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    for (const [t, c] of stops) g.addColorStop(t, c);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  // wavy silhouette band from left to right, filled down to `bottom`
  function ridge(ctx, rng, yBase, amp, bumps, color, bottom) {
    ctx.beginPath();
    ctx.moveTo(-M, bottom);
    ctx.lineTo(-M, yBase + (rng() - 0.5) * amp);
    const step = (W + M * 2) / bumps;
    for (let i = 0; i <= bumps; i++) {
      const x = -M + i * step;
      const y = yBase + (rng() - 0.5) * amp;
      ctx.quadraticCurveTo(x - step / 2, yBase - rng() * amp, x, y);
    }
    ctx.lineTo(W + M, bottom);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function pine(ctx, x, y, h, color) {
    ctx.fillStyle = color;
    const w = h * 0.42;
    for (let i = 0; i < 3; i++) {
      const ty = y - h + (i * h) / 3.4;
      const tw = w * (0.45 + i * 0.3);
      ctx.beginPath();
      ctx.moveTo(x, ty);
      ctx.lineTo(x - tw / 2, ty + h / 2.6);
      ctx.lineTo(x + tw / 2, ty + h / 2.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(x - h * 0.04, y - h * 0.12, h * 0.08, h * 0.12);
  }

  function deciduous(ctx, rng, x, y, h, canopy, trunk) {
    ctx.fillStyle = trunk;
    ctx.fillRect(x - h * 0.05, y - h * 0.45, h * 0.1, h * 0.45);
    ctx.fillStyle = canopy;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x + (rng() - 0.5) * h * 0.5, y - h * (0.5 + rng() * 0.35), h * (0.2 + rng() * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function tufts(ctx, rng, y0, y1, n, colors) {
    for (let i = 0; i < n; i++) {
      const x = -M + rng() * (W + M * 2);
      const y = y0 + rng() * (y1 - y0);
      const h = 5 + rng() * 9;
      ctx.strokeStyle = colors[Math.floor(rng() * colors.length)];
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let b = -2; b <= 2; b++) {
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + b * 2, y - h * 0.6, x + b * 3.2, y - h);
      }
      ctx.stroke();
    }
  }

  const ENVS = {
    forest: (rng) => {
      const layers = [];
      layers.push({ par: 0.08, c: makeLayer((g) => {
        ridge(g, rng, 235, 55, 7, '#6f8f7c', 330);
        ridge(g, rng, 268, 40, 9, '#597a63', 330);
      })});
      layers.push({ par: 0.22, c: makeLayer((g) => {
        ridge(g, rng, 300, 18, 12, '#3f5c45', 330);
        for (let i = 0; i < 26; i++) {
          deciduous(g, rng, -M + rng() * (W + M * 2), 306 + rng() * 8, 55 + rng() * 40,
                    ['#4a6b3f', '#557a48', '#3f5c37'][Math.floor(rng() * 3)], '#4a3826');
        }
      })});
      layers.push({ par: 0.5, c: makeLayer((g) => {
        grad(g, -M, 300, W + M * 2, H - 300, [[0, '#7a9455'], [0.5, '#69824a'], [1, '#55693c']]);
        for (let i = 0; i < 14; i++) {                       // dirt patches
          g.fillStyle = 'rgba(120,95,60,0.25)';
          g.beginPath();
          g.ellipse(-M + rng() * (W + M * 2), 340 + rng() * 190, 30 + rng() * 60, 6 + rng() * 10, 0, 0, Math.PI * 2);
          g.fill();
        }
        tufts(g, rng, 330, 520, 120, ['#4f6b38', '#5d7a42', '#43552f']);
      })});
      const front = makeLayer((g) => {
        ridge(g, rng, 512, 16, 16, '#2c3d24', H);
        tufts(g, rng, 495, 535, 90, ['#243318', '#31451f']);
        for (let i = 0; i < 5; i++) {                        // bush silhouettes
          const x = -M + rng() * (W + M * 2), y = 540 - rng() * 12;
          g.fillStyle = '#22301a';
          for (let b = 0; b < 4; b++) {
            g.beginPath();
            g.arc(x + (rng() - 0.5) * 46, y - rng() * 26, 14 + rng() * 14, 0, Math.PI * 2);
            g.fill();
          }
        }
      });
      const sky = (ctx, t) => {
        grad(ctx, 0, 0, W, 330, [[0, '#8fbede'], [0.55, '#c8ddc8'], [1, '#f2e3b8']]);
        ctx.fillStyle = 'rgba(255,236,170,0.9)';
        ctx.beginPath(); ctx.arc(760, 92, 38, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,236,170,0.25)';
        ctx.beginPath(); ctx.arc(760, 92, 58, 0, Math.PI * 2); ctx.fill();
        return t;
      };
      return { sky, layers, front, cloud: 'rgba(255,255,255,0.75)' };
    },

    mountain: (rng) => {
      const layers = [];
      layers.push({ par: 0.08, c: makeLayer((g) => {
        // jagged snow-capped peaks
        for (const [yB, col, snow] of [[250, '#8fa3b8', '#e9f1f7'], [285, '#6d8299', '#dce8f0']]) {
          const n = 6;
          const step = (W + M * 2) / n;
          for (let i = 0; i < n; i++) {
            const x = -M + i * step + (rng() - 0.5) * 40;
            const pw = step * (0.9 + rng() * 0.5), ph = 95 + rng() * 85;
            g.fillStyle = col;
            g.beginPath();
            g.moveTo(x - pw / 2, yB + 60); g.lineTo(x, yB - ph); g.lineTo(x + pw / 2, yB + 60);
            g.closePath(); g.fill();
            g.fillStyle = snow;
            g.beginPath();
            g.moveTo(x, yB - ph); g.lineTo(x - pw * 0.13, yB - ph + ph * 0.3);
            g.lineTo(x, yB - ph + ph * 0.22); g.lineTo(x + pw * 0.13, yB - ph + ph * 0.3);
            g.closePath(); g.fill();
          }
        }
      })});
      layers.push({ par: 0.22, c: makeLayer((g) => {
        ridge(g, rng, 302, 14, 12, '#3c5248', 330);
        for (let i = 0; i < 34; i++) {
          pine(g, -M + rng() * (W + M * 2), 312 + rng() * 6, 42 + rng() * 34,
               ['#2e4a3a', '#3a5a45', '#274035'][Math.floor(rng() * 3)]);
        }
      })});
      layers.push({ par: 0.5, c: makeLayer((g) => {
        grad(g, -M, 300, W + M * 2, H - 300, [[0, '#9aa48f'], [0.5, '#87927e'], [1, '#6e7a68']]);
        for (let i = 0; i < 26; i++) {                       // scree rocks
          g.fillStyle = ['rgba(90,95,100,0.5)', 'rgba(120,125,128,0.5)'][Math.floor(rng() * 2)];
          g.beginPath();
          g.ellipse(-M + rng() * (W + M * 2), 340 + rng() * 190, 9 + rng() * 22, 5 + rng() * 9, rng(), 0, Math.PI * 2);
          g.fill();
        }
        for (let i = 0; i < 12; i++) {                       // snow patches
          g.fillStyle = 'rgba(235,242,246,0.6)';
          g.beginPath();
          g.ellipse(-M + rng() * (W + M * 2), 350 + rng() * 180, 26 + rng() * 50, 6 + rng() * 9, 0, 0, Math.PI * 2);
          g.fill();
        }
        tufts(g, rng, 335, 515, 60, ['#6b7a55', '#7a8a62']);
      })});
      const front = makeLayer((g) => {
        for (let i = 0; i < 7; i++) {                        // boulders
          const x = -M + rng() * (W + M * 2), y = 540 - rng() * 10;
          g.fillStyle = '#3a4045';
          g.beginPath();
          g.ellipse(x, y, 26 + rng() * 34, 18 + rng() * 20, 0, Math.PI, Math.PI * 2);
          g.fill();
          g.fillStyle = '#474e54';
          g.beginPath();
          g.ellipse(x - 8, y - 4, (26 + rng() * 20) * 0.5, 12, 0, Math.PI, Math.PI * 2);
          g.fill();
        }
        pine(g, -M + 78, 585, 130, '#1d3328');
        pine(g, W + M - 73, 590, 140, '#1d3328');
      });
      const sky = (ctx) => {
        grad(ctx, 0, 0, W, 330, [[0, '#5f89b8'], [0.6, '#a8c4d8'], [1, '#e0e8ea']]);
        ctx.fillStyle = 'rgba(255,250,225,0.85)';
        ctx.beginPath(); ctx.arc(190, 120, 30, 0, Math.PI * 2); ctx.fill();
      };
      return { sky, layers, front, cloud: 'rgba(255,255,255,0.85)' };
    },

    tundra: (rng) => {
      const layers = [];
      layers.push({ par: 0.08, c: makeLayer((g) => {
        ridge(g, rng, 285, 10, 8, '#7d8a92', 330);
        g.fillStyle = '#33413c';                              // distant spruce line
        for (let i = 0; i < 70; i++) {
          const x = -M + rng() * (W + M * 2), h = 10 + rng() * 22;
          g.beginPath();
          g.moveTo(x, 296 - h); g.lineTo(x - h * 0.22, 296); g.lineTo(x + h * 0.22, 296);
          g.closePath(); g.fill();
        }
      })});
      layers.push({ par: 0.22, c: makeLayer((g) => {
        // lake band with sky sheen
        grad(g, -M, 296, W + M * 2, 52, [[0, '#b8ccd4'], [0.5, '#9cb5c2'], [1, '#8aa5b5']]);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let i = 0; i < 16; i++) {
          g.fillRect(-M + rng() * (W + M * 2), 300 + rng() * 42, 20 + rng() * 60, 1.5);
        }
        // reed clumps at the shore
        g.strokeStyle = '#5a6b42';
        g.lineWidth = 2;
        for (let i = 0; i < 46; i++) {
          const x = -M + rng() * (W + M * 2), y = 346 + rng() * 6, h = 16 + rng() * 18;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 6, y - h); g.stroke();
          g.fillStyle = '#6b5a35';
          g.fillRect(x - 1.5 + (rng() - 0.5) * 6, y - h - 6, 3.5, 8);
        }
      })});
      layers.push({ par: 0.5, c: makeLayer((g) => {
        grad(g, -M, 344, W + M * 2, H - 344, [[0, '#c3c8b4'], [0.5, '#adb49e'], [1, '#939a86']]);
        for (let i = 0; i < 20; i++) {                        // moss / snow patches
          g.fillStyle = i % 2 ? 'rgba(238,242,240,0.65)' : 'rgba(120,130,95,0.4)';
          g.beginPath();
          g.ellipse(-M + rng() * (W + M * 2), 370 + rng() * 160, 30 + rng() * 55, 7 + rng() * 10, 0, 0, Math.PI * 2);
          g.fill();
        }
        tufts(g, rng, 360, 520, 80, ['#8a8a5f', '#9a9a70', '#767650']);
      })});
      const front = makeLayer((g) => {
        ridge(g, rng, 516, 12, 14, '#d8ddd6', H);             // snow drift
        g.strokeStyle = '#4a4038';                            // bare shrubs
        g.lineWidth = 2;
        for (let i = 0; i < 9; i++) {
          const x = -M + rng() * (W + M * 2), y = 540 - rng() * 8;
          for (let b = 0; b < 6; b++) {
            g.beginPath();
            g.moveTo(x, y);
            const a = -Math.PI / 2 + (rng() - 0.5) * 1.6, l = 18 + rng() * 22;
            g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.7,
                               x + Math.cos(a) * l, y + Math.sin(a) * l);
            g.stroke();
          }
        }
      });
      const sky = (ctx) => {
        grad(ctx, 0, 0, W, 330, [[0, '#8d95a8'], [0.55, '#c4b8b4'], [1, '#e8cbb0']]);
        ctx.fillStyle = 'rgba(255,225,200,0.8)';
        ctx.beginPath(); ctx.arc(480, 250, 34, 0, Math.PI * 2); ctx.fill();
      };
      return { sky, layers, front, cloud: 'rgba(235,235,240,0.6)' };
    },

    canyon: (rng) => {
      const layers = [];
      layers.push({ par: 0.08, c: makeLayer((g) => {
        // flat-topped mesas in evening haze
        for (const [yB, col] of [[255, '#b07a63'], [288, '#96604d']]) {
          let x = -M - 40;
          while (x < W + M) {
            const mw = 120 + rng() * 200, mh = 60 + rng() * 70, slope = 18 + rng() * 14;
            g.fillStyle = col;
            g.beginPath();
            g.moveTo(x, yB + 50);
            g.lineTo(x + slope, yB - mh);
            g.lineTo(x + mw - slope, yB - mh);
            g.lineTo(x + mw, yB + 50);
            g.closePath(); g.fill();
            x += mw + 24 + rng() * 60;
          }
        }
      })});
      layers.push({ par: 0.22, c: makeLayer((g) => {
        // canyon wall band with strata lines + rim junipers
        ridge(g, rng, 298, 16, 10, '#8a523c', 332);
        g.strokeStyle = 'rgba(60,30,20,0.25)';
        g.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          g.beginPath();
          g.moveTo(-M, 306 + i * 5 + rng() * 3);
          g.lineTo(W + M, 306 + i * 5 + rng() * 3);
          g.stroke();
        }
        for (let i = 0; i < 22; i++) {
          pine(g, -M + rng() * (W + M * 2), 306 + rng() * 6, 26 + rng() * 22,
               ['#4a5a38', '#3d4d30', '#556246'][Math.floor(rng() * 3)]);
        }
      })});
      layers.push({ par: 0.5, c: makeLayer((g) => {
        grad(g, -M, 300, W + M * 2, H - 300, [[0, '#c29066'], [0.5, '#a97a54'], [1, '#8a6244']]);
        // the creek: a winding band of cool water through the wash
        g.fillStyle = '#7fa3ab';
        g.beginPath();
        let cy0 = 352 + rng() * 14;
        g.moveTo(-M, cy0);
        for (let x = -M; x <= W + M; x += 90) {
          g.quadraticCurveTo(x + 45, cy0 + (rng() - 0.5) * 22, x + 90, cy0 + (rng() - 0.5) * 10);
        }
        g.lineTo(W + M, cy0 + 16 + rng() * 8);
        for (let x = W + M; x >= -M; x -= 90) {
          g.quadraticCurveTo(x - 45, cy0 + 20 + (rng() - 0.5) * 20, x - 90, cy0 + 15 + (rng() - 0.5) * 10);
        }
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.3)';
        for (let i = 0; i < 12; i++) {
          g.fillRect(-M + rng() * (W + M * 2), 352 + rng() * 22, 14 + rng() * 40, 1.4);
        }
        for (let i = 0; i < 20; i++) {                       // river stones + dry rocks
          g.fillStyle = ['rgba(120,90,70,0.55)', 'rgba(150,115,88,0.55)'][Math.floor(rng() * 2)];
          g.beginPath();
          g.ellipse(-M + rng() * (W + M * 2), 400 + rng() * 130, 8 + rng() * 20, 4 + rng() * 8, rng(), 0, Math.PI * 2);
          g.fill();
        }
        tufts(g, rng, 340, 520, 70, ['#8a7a4a', '#9a8a58', '#76683e']);
      })});
      const front = makeLayer((g) => {
        // dark rimrock and dry brush right at the camera
        ridge(g, rng, 514, 14, 12, '#4a3226', H);
        g.strokeStyle = '#3a2a1e';
        g.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
          const x = -M + rng() * (W + M * 2), y = 540 - rng() * 10;
          for (let b = 0; b < 5; b++) {
            g.beginPath();
            g.moveTo(x, y);
            const a = -Math.PI / 2 + (rng() - 0.5) * 1.7, l = 16 + rng() * 24;
            g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.7,
                               x + Math.cos(a) * l, y + Math.sin(a) * l);
            g.stroke();
          }
        }
        for (let i = 0; i < 4; i++) {                        // rim boulders
          const x = -M + rng() * (W + M * 2);
          g.fillStyle = '#54382a';
          g.beginPath();
          g.ellipse(x, 540, 24 + rng() * 30, 16 + rng() * 14, 0, Math.PI, Math.PI * 2);
          g.fill();
        }
      });
      const sky = (ctx) => {
        // golden-hour desert sky
        grad(ctx, 0, 0, W, 330, [[0, '#7a5a7a'], [0.45, '#c97a52'], [1, '#f2c988']]);
        ctx.fillStyle = 'rgba(255,220,160,0.9)';
        ctx.beginPath(); ctx.arc(W * 0.28, 235, 40, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,160,0.25)';
        ctx.beginPath(); ctx.arc(W * 0.28, 235, 62, 0, Math.PI * 2); ctx.fill();
      };
      return { sky, layers, front, cloud: 'rgba(255,225,200,0.45)' };
    },
  };

  // Painted-art layer placement: how source rows map onto the 540-high scene.
  // mode 'anchor' = uniform scale with the given source row pinned to dstY
  // (no squash); mode 'band' = stretch srcY0..srcY1 into dstY0..dstY1.
  const ART_LAYOUT = {
    far:    { par: 0.08, mode: 'band', srcY0: 140, srcY1: 432, dstY0: 55, dstY1: 333 },
    mid:    { par: 0.22, mode: 'tile', srcRow: 445, dstY: 340 },   // mirror-tiled half scale
    ground: { par: 0.5,  mode: 'anchor', srcRow: 0, dstY: 288 },
    frontTiles: { mountain: 3, tundra: 3 },   // per-env fringe density
  };
  // per-env band geometry where the painted layers don't match the defaults:
  // the tundra far band skips its magenta-blend gradient rows (pink residue),
  // and the mid band rides lower so the marsh lake peeks over the ground line
  const ART_LAYOUT_ENV = {
    tundra: {
      far: { par: 0.08, mode: 'band', srcY0: 232, srcY1: 400, dstY0: 105, dstY1: 295 },
      mid: { par: 0.22, mode: 'tile', srcRow: 455, dstY: 322 },
    },
  };

  // mirror every other tile so the seam edges always match; phase-shift the
  // start so the mirror seam doesn't sit at screen center. Tiles overlap by
  // a pixel — fractional positions + smoothing otherwise leave hairline gaps.
  function drawMirrorTiled(ctx, img, x0, y, tw, th, count) {
    x0 -= tw * 0.35;
    for (let i = 0; i < (count || 4); i++) {
      if (i % 2) {
        ctx.save();
        ctx.translate(x0 + (i + 0.5) * tw, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -tw / 2 - 1, y, tw + 2, th);
        ctx.restore();
      } else {
        ctx.drawImage(img, x0 + i * tw - 1, y, tw + 2, th);
      }
    }
  }

  function buildArt(env, rng) {
    const A = DH.artimg;
    const sky = A[env + '_sky'];
    const front = A[env + '_front'] || null;
    const imgs = { far: A[env + '_far'], mid: A[env + '_mid'], ground: A[env + '_ground'] };
    const def = front ? null : ENVS[env](rng);   // procedural brush only as fallback

    function drawLayer(ctx, key, camX) {
      const img = imgs[key];
      const L = (ART_LAYOUT_ENV[env] && ART_LAYOUT_ENV[env][key]) || ART_LAYOUT[key];
      const x = -M - camX * L.par;
      if (L.mode === 'tile') {
        const tw = Math.ceil((W + 2 * M) / 2);
        const s = tw / img.width;
        drawMirrorTiled(ctx, img, x, L.dstY - L.srcRow * s, tw, img.height * s);
      } else if (L.mode === 'anchor') {
        const s = (W + 2 * M) / img.width;
        ctx.drawImage(img, x, L.dstY - L.srcRow * s, img.width * s, img.height * s);
      } else {
        ctx.drawImage(img, 0, L.srcY0, img.width, L.srcY1 - L.srcY0,
                      x, L.dstY0, W + 2 * M, L.dstY1 - L.dstY0);
      }
    }

    return {
      render(ctx, camX) {
        // stretch to the full scene: painted skies vary in aspect (and some
        // get their dead top rows cropped), and a soft vertical stretch on a
        // sky gradient is invisible while an uncovered strip is not
        ctx.drawImage(sky, 0, 0, W, 540);
        drawLayer(ctx, 'far', camX);
        drawLayer(ctx, 'mid', camX);
        drawLayer(ctx, 'ground', camX);
      },
      renderFront(ctx, camX) {
        if (!front) {
          ctx.drawImage(def.front, -M - camX, 0);
          return;
        }
        // painted brush tiled small keeps the fringe a bottom rim instead
        // of swallowing the near lane; tile count is per-environment
        const tiles = (ART_LAYOUT.frontTiles && ART_LAYOUT.frontTiles[env]) || 2;
        const tw = Math.ceil((W + 2 * M) / tiles);
        const s = tw / front.width;
        drawMirrorTiled(ctx, front, -M - camX, 540 - front.height * s, tw, front.height * s, tiles + 2);
      },
    };
  }

  function hasArt(env) {
    const A = DH.artimg || {};
    return ['sky', 'far', 'mid', 'ground'].every((k) => A[env + '_' + k]);
  }

  function build(env, seed) {
    W = DH.W;                       // bake layers at the live logical width
    const rng = DH.util.mulberry32(seed);
    if (hasArt(env)) return buildArt(env, rng);
    const def = ENVS[env](rng);
    // clouds share one implementation; seeded start positions
    const clouds = [];
    for (let i = 0; i < 5; i++) {
      clouds.push({ x: rng() * W, y: 30 + rng() * 140, s: 0.6 + rng() * 0.9, v: 4 + rng() * 7 });
    }
    return {
      render(ctx, camX, t) {
        def.sky(ctx, t);
        ctx.fillStyle = def.cloud;
        for (const cl of clouds) {
          const cx = ((cl.x + t * cl.v) % (W + 200)) - 100;
          for (const [ox, oy, r] of [[0, 0, 22], [18, 6, 16], [-20, 7, 15], [4, -8, 14]]) {
            ctx.beginPath();
            ctx.arc(cx + ox * cl.s, cl.y + oy * cl.s, r * cl.s, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        for (const L of def.layers) ctx.drawImage(L.c, -M - camX * L.par, 0);
      },
      renderFront(ctx, camX) {
        ctx.drawImage(def.front, -M - camX, 0);
      },
    };
  }

  return { build };
})();
