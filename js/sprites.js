window.DH = window.DH || {};

// Procedural animal painters. All paint in animal-local units: origin at the
// ground beneath the body center, +x = facing direction, -y = up. Scale and
// facing flips are applied by DH.assets.draw, so painters stay unit-scale.
DH.sprites = (() => {
  function ell(ctx, cx, cy, rx, ry, color, rot) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function seg(ctx, x1, y1, x2, y2, w, color) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // One leg: hip -> knee -> hoof as a thick polyline. swing is the angle from
  // vertical (radians, + = forward). kneeBend > 0 folds the lower segment.
  function leg(ctx, hx, hy, len, w, swing, kneeBend, coat, hoof, lift) {
    const L1 = len * 0.55, L2 = len * 0.52;
    const kx = hx + Math.sin(swing) * L1;
    const ky = hy + Math.cos(swing) * L1 - (lift || 0) * 0.4;
    const a2 = swing - kneeBend;
    const fx = kx + Math.sin(a2) * L2;
    const fy = ky + Math.cos(a2) * L2 - (lift || 0);
    seg(ctx, hx, hy, kx, ky, w, coat);
    seg(ctx, kx, ky, fx, fy, w * 0.75, coat);
    ell(ctx, fx, fy, w * 0.55, w * 0.45, hoof);
    return { fx, fy };
  }

  function antlersBranched(ctx, hx, hy, trophy, color, tall) {
    const beam = (tall ? 26 : 20) + trophy * (tall ? 6 : 4.5);
    const tines = 2 + trophy;
    for (const side of [{ o: -3, s: 0.85, c: shade(color, -18) }, { o: 2, s: 1, c: color }]) {
      ctx.save();
      ctx.translate(hx + side.o, hy);
      ctx.scale(side.s, side.s);
      ctx.lineCap = 'round';
      ctx.strokeStyle = side.c;
      // main beam sweeps up and back
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-beam * 0.55, -beam * 0.5, -beam * 0.55, -beam);
      ctx.stroke();
      // tines fork upward along the beam
      ctx.lineWidth = 2.2;
      for (let i = 1; i <= tines; i++) {
        const t = i / (tines + 1);
        const bx = -beam * 0.55 * (2 * t - t * t);          // point on the quad curve (approx)
        const by = -beam * (t * t * 0.5 + t * 0.5) * 0.95;
        const tl = beam * (0.28 + 0.1 * Math.sin(i * 2.1));
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + tl * 0.35, by - tl * 0.6, bx + tl * 0.5, by - tl);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function antlersPalmate(ctx, hx, hy, trophy, color) {
    const size = 16 + trophy * 4;
    for (const side of [{ o: -4, s: 0.85, c: shade(color, -18) }, { o: 3, s: 1, c: color }]) {
      ctx.save();
      ctx.translate(hx + side.o, hy);
      ctx.scale(side.s, side.s);
      // stem
      seg(ctx, 0, 0, -6, -10, 4, side.c);
      // palm: broad fan
      ell(ctx, -10, -14 - size * 0.35, size, size * 0.55, side.c, -0.5);
      // finger tines off the palm edge
      ctx.strokeStyle = side.c;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3 + Math.floor(trophy / 2); i++) {
        const a = -2.4 + i * 0.42;
        const px = -10 + Math.cos(a) * size * 0.95;
        const py = -14 - size * 0.35 + Math.sin(a) * size * 0.52;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = DH.util.clamp((n >> 16) + amt, 0, 255);
    const g = DH.util.clamp(((n >> 8) & 255) + amt, 0, 255);
    const b = DH.util.clamp((n & 255) + amt, 0, 255);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  // o: { role:'buck'|'doe', gait:'walk'|'run'|'graze', phase:0..1, trophy:1..5 }
  function quadruped(ctx, spKey, o) {
    const sp = DH.data.species[spKey];
    const p = Object.assign({}, sp.p, o.role === 'doe' ? sp.doeP : null);
    const bC = -p.shoulderH - p.bodyH * 0.45;            // body center y
    const hipY = bC + p.bodyH * 0.28;
    const frontX = p.bodyLen * 0.30, backX = -p.bodyLen * 0.30;
    const gait = o.gait || 'walk';
    const ph = (o.phase || 0) * Math.PI * 2;

    // leg swings: walk = 4-beat, run = front/back pairs bounding
    let amp, offs, bend, lift;
    if (gait === 'run') {
      amp = 0.85; bend = 0.5;
      offs = [0, 0.45, Math.PI, Math.PI + 0.45];
      lift = 4;
    } else if (gait === 'graze') {
      amp = 0; bend = 0.12; offs = [0, 0, 0, 0]; lift = 0;
    } else {
      amp = 0.38; bend = 0.35;
      offs = [0, Math.PI, Math.PI * 0.5, Math.PI * 1.5];
      lift = 0;
    }
    const legDark = shade(p.coat, -22);

    // far-side legs first (darker)
    leg(ctx, frontX - 3, hipY, p.legLen, p.legW, amp * Math.sin(ph + offs[1]),
        bend * (1 + Math.sin(ph + offs[1])), legDark, p.hoof, lift * Math.max(0, Math.sin(ph + offs[1])));
    leg(ctx, backX + 3, hipY, p.legLen, p.legW, amp * Math.sin(ph + offs[3]),
        -bend * (1 + Math.sin(ph + offs[3])) * 0.8, legDark, p.hoof, lift * Math.max(0, Math.sin(ph + offs[3])));

    // body: hindquarter + chest + connecting mass
    const bob = gait === 'graze' ? 0 : Math.sin(ph * 2) * (gait === 'run' ? 2.5 : 1.2);
    ctx.save();
    ctx.translate(0, bob);
    ell(ctx, backX * 0.85, bC - p.hump * 0.3, p.bodyLen * 0.30, p.bodyH * 0.52, p.coatDark);
    ell(ctx, 0, bC, p.bodyLen * 0.34, p.bodyH * 0.48, p.coat);
    ell(ctx, frontX * 0.75, bC + 1, p.bodyLen * 0.30, p.bodyH * 0.5, p.coat);
    if (p.hump) ell(ctx, frontX * 0.35, bC - p.bodyH * 0.42, p.bodyLen * 0.22, p.bodyH * 0.3, p.coatDark);
    // belly
    ell(ctx, -p.bodyLen * 0.04, bC + p.bodyH * 0.3, p.bodyLen * 0.28, p.bodyH * 0.2, p.belly);
    // tail
    ell(ctx, backX - p.bodyLen * 0.12, bC - p.bodyH * 0.22, p.tail * 0.6, p.tail, p.belly, 0.5);

    // neck + head
    const grazing = gait === 'graze';
    const neckA = grazing ? 0.95 : -0.9;                 // angle from horizontal (+ = down)
    const nx0 = frontX * 0.95, ny0 = bC - p.bodyH * 0.18;
    const nx1 = nx0 + Math.cos(neckA) * (grazing ? p.neckLen * 1.15 : p.neckLen * 0.55);
    const ny1 = ny0 + Math.sin(neckA) * (grazing ? p.neckLen * 1.15 : -1) * (grazing ? 1 : 0) -
                (grazing ? 0 : p.neckLen);
    seg(ctx, nx0, ny0, nx1, ny1, p.neckW, p.coat);
    // head
    const hA = grazing ? 1.1 : 0.25;                     // snout tilt
    ell(ctx, nx1, ny1, p.headLen * 0.42, p.headH * 0.55, p.headC, hA * 0.4);
    // snout
    const sx = nx1 + Math.cos(hA) * p.headLen * 0.62;
    const sy = ny1 + Math.sin(hA) * p.headLen * 0.62 + p.snoutDrop * 0.3;
    seg(ctx, nx1, ny1, sx, sy, p.headH * 0.6, p.headC);
    ell(ctx, sx + 2, sy, 2.6, 2.2, '#241a12');           // nose
    // ear
    ell(ctx, nx1 - p.headLen * 0.28, ny1 - p.headH * 0.62, p.earLen * 0.32, p.earLen * 0.55, p.headC, -0.5);
    // eye
    ell(ctx, nx1 + p.headLen * 0.1, ny1 - p.headH * 0.12, 1.8, 1.8, '#181008');
    // dewlap bell (moose)
    if (p.bell) seg(ctx, nx1 - 2, ny1 + p.headH * 0.5, nx1 - 4, ny1 + p.headH * 0.5 + 12, 5, p.coatDark);

    // antlers
    if (o.role !== 'doe') {
      const tr = o.trophy || 3;
      if (sp.antlerStyle === 'palmate') antlersPalmate(ctx, nx1 - 2, ny1 - p.headH * 0.4, tr, p.antler);
      else antlersBranched(ctx, nx1 - 2, ny1 - p.headH * 0.4, tr, p.antler, sp.antlerStyle === 'branched-tall');
    }
    ctx.restore();

    // near-side legs
    leg(ctx, frontX + 3, hipY + bob, p.legLen, p.legW, amp * Math.sin(ph + offs[0]),
        bend * (1 + Math.sin(ph + offs[0])), p.coat, p.hoof, lift * Math.max(0, Math.sin(ph + offs[0])));
    leg(ctx, backX - 3, hipY + bob, p.legLen, p.legW, amp * Math.sin(ph + offs[2]),
        -bend * (1 + Math.sin(ph + offs[2])) * 0.8, p.coat, p.hoof, lift * Math.max(0, Math.sin(ph + offs[2])));
  }

  // Mallard drake, origin at body center (ducks fly, no ground anchor).
  function duck(ctx, o) {
    const flapUp = o.frame === 0;
    ell(ctx, 0, 0, 20, 11, '#6b4f33');                    // body
    ell(ctx, -16, -2, 8, 5, '#e8e4d8', 0.3);              // tail
    // wing
    ctx.fillStyle = '#543d26';
    ctx.beginPath();
    if (flapUp) { ctx.moveTo(-2, -2); ctx.lineTo(-14, -22); ctx.lineTo(6, -6); }
    else { ctx.moveTo(-2, -2); ctx.lineTo(-16, 14); ctx.lineTo(6, 4); }
    ctx.closePath();
    ctx.fill();
    seg(ctx, 12, -4, 18, -10, 6, '#2e6b46');              // neck
    ell(ctx, 20, -12, 6.5, 5.5, '#2e6b46');               // head
    seg(ctx, 25, -12, 31, -11, 3.5, '#d9a83c');           // bill
    ell(ctx, 21.5, -13.5, 1.4, 1.4, '#181008');           // eye
    ell(ctx, 12, -2, 3.5, 6, '#e8e4d8', 0.4);             // neck ring hint
  }

  function crosshair(ctx) {
    ctx.strokeStyle = '#ff4d3a';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(dx * 9, dy * 9); ctx.lineTo(dx * 22, dy * 22);
    }
    ctx.stroke();
    ctx.fillStyle = '#ff4d3a';
    ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, Math.PI * 2); ctx.fill();
  }

  function shellIcon(ctx) {
    DH.util.rr(ctx, -5, -16, 10, 22, 3);
    ctx.fillStyle = '#c8402e'; ctx.fill();
    ctx.fillStyle = '#d9a83c';
    ctx.fillRect(-5, 0, 10, 6);
    ell(ctx, 0, 3, 2.2, 2.2, '#8a6a20');
  }

  function cartridgeIcon(ctx) {
    // brass case
    DH.util.rr(ctx, -4, -6, 8, 17, 1.5);
    ctx.fillStyle = '#c9a54a';
    ctx.fill();
    // rim
    ctx.fillStyle = '#a8853a';
    ctx.fillRect(-5, 9, 10, 3);
    // copper bullet
    ctx.fillStyle = '#b06a3a';
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.quadraticCurveTo(-4, -13, 0, -14);
    ctx.quadraticCurveTo(4, -13, 4, -6);
    ctx.closePath();
    ctx.fill();
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-2.5, -4, 1.6, 12);
  }

  function muzzleFlash(ctx, o) {
    const big = o.frame === 0;
    const r = big ? 26 : 15;
    ctx.fillStyle = 'rgba(255,240,180,0.95)';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rad = i % 2 ? r : r * 0.45;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
  }

  // Register every sprite name (PNG-overridable). Called once at boot.
  function registerAll() {
    const A = DH.assets;
    for (const spKey of ['deer', 'elk', 'moose']) {
      const p = DH.data.species[spKey].p;
      const w = p.bodyLen * 2.1;
      const h = p.shoulderH + p.bodyH + p.neckLen + 55;
      // 'monster' is a sprite skin for trophy-5 bucks (procedurally it's just
      // a max-antler buck; painted art can give it a dedicated look)
      for (const role of ['buck', 'doe', 'monster']) {
        // monsters get a bigger sprite box so the painted rack + body read larger
        const bw = role === 'monster' ? Math.round(w * 1.15) : w;
        const bh = role === 'monster' ? Math.round(h * 1.18) : h;
        const paintRole = role === 'monster' ? 'buck' : role;
        // up to 6 frames per cycle (painted 2x3 sheets); procedural art
        // repeats its 4 walk / 2 run poses for the extra slots
        for (let f = 0; f < 6; f++) {
          A.register(`${spKey}_${role}_walk_${f}`, {
            w: bw, h: bh, draw: (ctx, o) => quadruped(ctx, spKey, { role: paintRole, gait: 'walk', phase: (f % 4) / 4, trophy: o.trophy }),
          });
          A.register(`${spKey}_${role}_run_${f}`, {
            w: bw, h: bh, draw: (ctx, o) => quadruped(ctx, spKey, { role: paintRole, gait: 'run', phase: (f % 2) / 2, trophy: o.trophy }),
          });
        }
        A.register(`${spKey}_${role}_graze`, {
          w: bw, h: bh, draw: (ctx, o) => quadruped(ctx, spKey, { role: paintRole, gait: 'graze', phase: 0, trophy: o.trophy }),
        });
        // death collapse frames: procedural fallback is the run pose (the
        // tumble animation); with PNG overrides the collapse plays in place
        for (let f = 0; f < 4; f++) {
          A.register(`${spKey}_${role}_death_${f}`, {
            w: bw, h: bh, draw: (ctx, o) => quadruped(ctx, spKey, { role: paintRole, gait: 'run', phase: 0.5, trophy: o.trophy }),
          });
        }
      }
    }
    for (let f = 0; f < 4; f++) {
      A.register(`duck_${f}`, { w: 64, h: 48, anchorY: 0.5, draw: (ctx) => duck(ctx, { frame: f % 2 }) });
    }
    A.register('duck_fall', { w: 64, h: 48, anchorY: 0.5, draw: (ctx) => duck(ctx, { frame: 1 }) });
    A.register('duck_dead', { w: 64, h: 48, anchorY: 0.5, draw: (ctx) => duck(ctx, { frame: 1 }) });
    for (let f = 0; f < 2; f++) {
      A.register(`muzzle_${f}`, { w: 56, h: 56, anchorY: 0.5, draw: (ctx) => muzzleFlash(ctx, { frame: f }) });
    }
    for (const g of DH.data.guns) {
      A.register(`gun_${g.id}`, {
        w: 96, h: 36, anchorY: 0.5,
        draw: (ctx) => DH.shop.drawGunIcon(ctx, g.style),
      });
    }
    A.register('crosshair', { w: 48, h: 48, anchorY: 0.5, draw: crosshair });
    // painted title sign (drawn only when override art exists)
    A.register('logo', { w: 460, h: 190, anchorY: 0.5, draw: () => {} });
    // trek-select dressing (art-only, no procedural fallback)
    A.register('card_frame', { w: 272, h: 330, anchorX: 0, anchorY: 0, draw: () => {} });
    A.register('wood_btn', { w: 220, h: 52, anchorY: 0.5, draw: () => {} });
    for (const sp of ['deer', 'elk', 'moose']) {
      A.register(`badge_${sp}`, { w: 84, h: 84, anchorY: 0.5, draw: () => {} });
    }
    A.register('shell', { w: 12, h: 24, anchorY: 0.5, draw: shellIcon });
    A.register('cartridge', { w: 10, h: 26, anchorY: 0.5, draw: cartridgeIcon });
  }

  return { registerAll, quadruped, shade };
})();
