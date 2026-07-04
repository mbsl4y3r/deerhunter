window.DH = window.DH || {};

// Every non-gameplay screen: title/attract, trek select, intros, results,
// final results, high-score entry and table. All layout is anchored to
// DH.CX (screen center) so wide phone canvases stay composed.
DH.screens = (() => {
  const { rr, easeOutBack, fmtScore } = DH.util;
  const L = (ctx, ...a) => DH.hud.label(ctx, ...a);

  function fill(ctx) {
    ctx.fillStyle = '#0d1a12';
    ctx.fillRect(0, 0, DH.W, 540);
  }

  function panel(ctx, x, y, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    rr(ctx, x, y, w, h, 14);
    ctx.fillStyle = '#102416';
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c9a54a';
    ctx.stroke();
    ctx.restore();
  }

  function stars(ctx, x, y, n, size) {
    ctx.font = `${size || 16}px Arial`;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd94d';
    ctx.fillText('★'.repeat(n), x, y);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillText('★'.repeat(5 - n), x + ctx.measureText('★'.repeat(n)).width, y);
  }

  // decorative antlers for the logo
  function logoAntler(ctx, x, y, flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(flip ? -1 : 1, 1);
    ctx.strokeStyle = '#e3d5ae';
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 30);
    ctx.quadraticCurveTo(-30, -10, -22, -46);
    ctx.stroke();
    ctx.lineWidth = 3.5;
    for (const [t, len] of [[0.3, 22], [0.55, 26], [0.8, 22]]) {
      const bx = -30 * (2 * t - t * t) * 0.9;
      const by = 30 - 76 * t * 0.9;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + len * 0.4, by - len * 0.7, bx + len * 0.55, by - len);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- TITLE / ATTRACT ----------
  let titleBg = null, titleAnimals = [], titleT = 0, nextWander = 0;

  DH.states = DH.states || {};
  DH.states.TITLE = {
    enter() {
      titleBg = DH.background.build('forest', DH.G.seed + 1);
      titleAnimals = [];
      titleT = 0;
      nextWander = 1;
      DH.main.newRun();
      DH.entities.clearParticles();
    },
    onResize() {
      if (titleBg) titleBg = DH.background.build('forest', DH.G.seed + 1);
    },
    update(dt) {
      titleT += dt;
      if (titleT >= nextWander) {
        nextWander = titleT + 3.5 + DH.util.rand() * 3;
        titleAnimals.push(new DH.entities.Animal({
          species: 'deer',
          role: DH.util.rand() < 0.55 ? 'buck' : 'doe',
          lane: DH.util.randInt(0, 2),
          side: DH.util.rand() < 0.5 ? 'L' : 'R',
          behavior: DH.util.rand() < 0.3 ? 'trot' : 'walk',
          trophy: DH.util.randInt(2, 5),
          pauses: DH.util.rand() < 0.4 ? [{ atX: 0.3 + DH.util.rand() * 0.4, dur: 1.5 }] : [],
        }));
      }
      for (const a of titleAnimals) a.update(dt);
      titleAnimals = titleAnimals.filter((a) => !a.gone);
    },
    render(ctx) {
      const CX = DH.CX;
      titleBg.render(ctx, 0, titleT);
      for (const a of [...titleAnimals].sort((x, y) => x.lane.depth - y.lane.depth)) a.draw(ctx);
      titleBg.renderFront(ctx, 0);
      // vignette for legibility
      const g = ctx.createLinearGradient(0, 0, 0, 300);
      g.addColorStop(0, 'rgba(8,14,10,0.75)');
      g.addColorStop(1, 'rgba(8,14,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, DH.W, 300);

      if (DH.artimg && DH.artimg.logo) {
        DH.assets.draw(ctx, 'logo', CX, 115);
        L(ctx, 'AN ARCADE HUNTING TRIBUTE', CX, 222, 15, '#cfe3cf', 'center');
      } else {
        logoAntler(ctx, CX - 195, 108, false);
        logoAntler(ctx, CX + 195, 108, true);
        L(ctx, 'DEER', CX, 105, 74, '#ffd94d', 'center');
        L(ctx, 'HUNTER', CX, 168, 54, '#f2ead0', 'center');
        L(ctx, 'AN ARCADE HUNTING TRIBUTE', CX, 196, 15, '#cfe3cf', 'center');
      }

      if (Math.floor(titleT * 1.6) % 2 === 0) {
        L(ctx, 'TAP OR CLICK TO HUNT', CX, 330, 30, '#fff', 'center');
      }
      L(ctx, 'SHOOT BUCKS ●  NEVER SHOOT DOES ●  LEAD YOUR SHOTS', CX, 508, 14, '#e8f0e8', 'center');

      const best = DH.highscores.load()[0];
      if (best) L(ctx, `TOP SCORE  ${best.initials}  ${fmtScore(best.score)}`, CX, 480, 16, '#ffd94d', 'center');
      if (DH.BUILD) L(ctx, DH.BUILD, DH.HUDR - 6, 534, 9, 'rgba(255,255,255,0.4)', 'right');
      DH.hud.drawMute(ctx);
    },
    onClick(x, y) {
      if (DH.hud.muteHit(x, y)) { DH.audio.toggleMute(); return; }
      DH.audio.play('ui');
      DH.setState('TREK_SELECT');
    },
    onKey(k) { if (k === 'Enter') DH.setState('TREK_SELECT'); },
  };

  // ---------- TREK SELECT ----------
  function cards() {
    const w = 272, h = 330, gap = 32, y = 130;
    return [-1, 0, 1].map((i) => ({ x: DH.CX + i * (w + gap) - w / 2, y, w, h }));
  }
  let previews = null;
  let selT = 0;

  DH.states.TREK_SELECT = {
    enter() {
      if (Object.keys(DH.G.completed).length >= DH.data.treks.length) {
        DH.setState('FINAL_RESULTS');
        return;
      }
      selT = 0;
      previews = previews || DH.data.treks.map((tk, i) => DH.background.build(tk.env, 777 + i));
    },
    onResize() {
      previews = DH.data.treks.map((tk, i) => DH.background.build(tk.env, 777 + i));
    },
    update(dt) { selT += dt; },
    render(ctx) {
      const CX = DH.CX;
      const bgImg = DH.artimg && DH.artimg.select_bg;
      if (bgImg) {
        const s = Math.max(DH.W / bgImg.width, 540 / bgImg.height);
        ctx.drawImage(bgImg, (DH.W - bgImg.width * s) / 2, (540 - bgImg.height * s) / 2,
                      bgImg.width * s, bgImg.height * s);
        ctx.fillStyle = 'rgba(8,12,8,0.5)';
        ctx.fillRect(0, 0, DH.W, 540);
      } else {
        fill(ctx);
      }
      const framed = DH.assets.get('card_frame').img;
      L(ctx, 'CHOOSE YOUR HUNT', CX, 62, 40, '#ffd94d', 'center');
      L(ctx, `SCORE  ${fmtScore(DH.G.score)}`, CX - 90, 92, 17, '#e8f0e8', 'center');
      L(ctx, `CASH  $${fmtScore(DH.shop.cash)}`, CX + 110, 92, 17, '#7ac96b', 'center');

      const CS = cards();
      DH.data.treks.forEach((tk, i) => {
        const c = CS[i];
        const done = DH.G.completed[tk.id] != null;
        const hov = !done && hitCard(DH.input.mouse.x, DH.input.mouse.y) === i;
        ctx.save();
        if (hov) { ctx.translate(c.x + c.w / 2, c.y + c.h / 2); ctx.scale(1.03, 1.03); ctx.translate(-c.x - c.w / 2, -c.y - c.h / 2); }
        rr(ctx, c.x, c.y, c.w, c.h, 12);
        ctx.fillStyle = '#16261a';
        ctx.fill();
        if (!framed) {
          ctx.lineWidth = hov ? 4 : 2.5;
          ctx.strokeStyle = done ? '#5a6b58' : hov ? '#ffe97a' : '#c9a54a';
          ctx.stroke();
        }

        // environment preview
        ctx.save();
        rr(ctx, c.x + 10, c.y + 10, c.w - 20, 150, 8);
        ctx.clip();
        ctx.translate(c.x + 10, c.y + 10);
        ctx.scale((c.w - 20) / DH.W, 150 / 540);
        previews[i].render(ctx, 0, selT);
        DH.assets.draw(ctx, `${tk.species}_buck_walk_0`, DH.CX + 20, 470, {
          scale: DH.data.species[tk.species].bodyScale * 1.1, dir: -1, trophy: 4,
        });
        previews[i].renderFront(ctx, 0);
        if (done) { ctx.fillStyle = 'rgba(10,14,10,0.55)'; ctx.fillRect(0, 0, DH.W, 540); }
        ctx.restore();

        L(ctx, tk.name, c.x + c.w / 2, c.y + 205, 24, done ? '#8a9a88' : '#f2ead0', 'center');
        L(ctx, `${DH.data.species[tk.species].name} — ${DH.data.species[tk.species].base} PTS BASE`,
          c.x + c.w / 2, c.y + 232, 13, '#cfe3cf', 'center');
        L(ctx, '5 SITES · 3 BUCKS EACH', c.x + c.w / 2, c.y + 254, 13, '#cfe3cf', 'center');
        if (done) {
          L(ctx, '✓ COMPLETE', c.x + c.w / 2, c.y + 292, 20, '#7ac96b', 'center');
          L(ctx, `+${fmtScore(DH.G.completed[tk.id])}`, c.x + c.w / 2, c.y + 316, 16, '#ffd94d', 'center');
        } else {
          const btn = DH.assets.get('wood_btn').img;
          if (btn) DH.assets.draw(ctx, 'wood_btn', c.x + c.w / 2, c.y + 296, { scale: hov ? 0.88 : 0.82 });
          L(ctx, hov ? '▶ START HUNT' : 'START HUNT', c.x + c.w / 2, c.y + 302, 18,
            hov ? '#ffe97a' : '#ffd94d', 'center');
        }
        // painted frame + species badge ride on top of the card edges
        if (framed) {
          DH.assets.draw(ctx, 'card_frame', c.x, c.y, {});
          if (hov) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,233,122,0.8)';
            rr(ctx, c.x + 2, c.y + 2, c.w - 4, c.h - 4, 12);
            ctx.stroke();
          }
        }
        const badge = DH.assets.get(`badge_${tk.species}`).img;
        if (badge) DH.assets.draw(ctx, `badge_${tk.species}`, c.x + 40, c.y + 40, { scale: 0.95 });
        ctx.restore();
      });
      // gun shop entrance
      const sb = shopBtn();
      if (DH.assets.get('wood_btn').img) {
        DH.assets.draw(ctx, 'wood_btn', CX, sb.y + sb.h / 2, { scale: 0.92 });
      } else {
        DH.util.rr(ctx, sb.x, sb.y, sb.w, sb.h, 10);
        ctx.fillStyle = '#2c2416';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#c9a54a';
        ctx.stroke();
      }
      L(ctx, '🛒 GUN SHOP', CX, sb.y + 27, 17, '#ffd94d', 'center');
      L(ctx, 'COMPLETE ALL THREE TREKS FOR YOUR FINAL SCORE', CX, 516, 12, '#9ab59a', 'center');
      DH.hud.drawMute(ctx);
    },
    onClick(x, y) {
      if (DH.hud.muteHit(x, y)) { DH.audio.toggleMute(); return; }
      const sb = shopBtn();
      if (x >= sb.x && x <= sb.x + sb.w && y >= sb.y && y <= sb.y + sb.h) {
        DH.audio.play('ui');
        DH.setState('SHOP');
        return;
      }
      const i = hitCard(x, y);
      if (i != null && DH.G.completed[DH.data.treks[i].id] == null) {
        DH.audio.play('ui');
        DH.G.trekIndex = i;
        DH.G.siteIndex = 0;
        DH.G.trekRecords = [];
        DH.G.trekStartScore = DH.G.score;
        DH.setState('SITE_INTRO');
      }
    },
  };

  function shopBtn() {
    return { x: DH.CX - 95, y: 468, w: 190, h: 38 };
  }

  function hitCard(x, y) {
    const CS = cards();
    for (let i = 0; i < CS.length; i++) {
      const c = CS[i];
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return i;
    }
    return null;
  }

  // ---------- SITE INTRO ----------
  const TIPS = [
    'BULLETS TAKE TIME TO FLY — LEAD MOVING TARGETS',
    'FAR TARGETS SCORE 1.5× — RUNNING BUCKS 1.5×',
    'BIGGER ANTLERS = BIGGER TROPHY = MORE POINTS',
    'GUNSHOTS SPOOK THE HERD — MAKE THE FIRST SHOT COUNT',
    'HEAD SHOTS PAY 1.5× — AIM TRUE',
    'RELOAD EARLY — TAP THE BUTTON, R-CLICK, OR SPACE',
    "SHOOT A DOE AND THE SITE'S OVER — WATCH FOR ANTLERS",
  ];
  let introT = 0;

  DH.states.SITE_INTRO = {
    enter() { introT = 0; },
    update(dt) {
      introT += dt;
      if (introT >= 1.8) DH.setState('HUNTING');
    },
    render(ctx) {
      const CX = DH.CX;
      const trek = DH.data.treks[DH.G.trekIndex];
      fill(ctx);
      const pop = easeOutBack(Math.min(1, introT * 2.4));
      ctx.save();
      ctx.translate(CX, 250);
      ctx.scale(pop, pop);
      L(ctx, trek.name, 0, -50, 30, '#cfe3cf', 'center');
      L(ctx, `SITE ${DH.G.siteIndex + 1} OF ${trek.sites.length}`, 0, 10, 52, '#ffd94d', 'center');
      ctx.restore();
      L(ctx, TIPS[(DH.G.siteIndex + DH.G.trekIndex * 5) % TIPS.length], CX, 380, 16, '#e8f0e8', 'center');
      L(ctx, 'GET READY...', CX, 440, 18, '#fff', 'center');
    },
    onClick() { DH.setState('HUNTING'); },
  };

  // ---------- SITE RESULTS ----------
  let rec = null, resT = 0;

  DH.states.SITE_RESULTS = {
    enter(r) { rec = r; resT = 0; if (!r.doeHit && r.kills.length === 3) DH.audio.play('fanfare'); },
    update(dt) {
      resT += dt;
      if (resT >= 5) advanceAfterSite();
    },
    render(ctx) {
      const CX = DH.CX;
      fill(ctx);
      panel(ctx, CX - 250, 46, 500, 448);
      L(ctx, rec.doeHit ? 'SITE OVER!' : `SITE ${rec.siteIndex + 1} RESULTS`, CX, 96, 32,
        rec.doeHit ? '#ff5a4a' : '#ffd94d', 'center');
      let y = 146;
      const spName = DH.data.species[DH.data.treks[DH.G.trekIndex].species].name;
      if (rec.kills.length === 0) {
        L(ctx, 'NO BUCKS TAKEN', CX, y + 10, 18, '#9ab59a', 'center');
        y += 44;
      }
      for (const k of rec.kills) {
        L(ctx, spName, CX - 200, y, 16, '#f2ead0');
        stars(ctx, CX - 60, y, k.trophy, 15);
        L(ctx, k.part.toUpperCase() + (k.running ? ' · RUNNING' : ''), CX + 65, y, 12, '#9ab59a');
        L(ctx, '+' + fmtScore(k.points), CX + 200, y, 16, '#ffd94d');
        y += 34;
      }
      y += 8;
      L(ctx, `SHOTS ${rec.shots} · HITS ${rec.hits} · ACCURACY ${Math.round(rec.accuracy * 100)}%`,
        CX, y, 15, '#cfe3cf', 'center');
      y += 32;
      if (rec.accBonus) { L(ctx, 'ACCURACY BONUS', CX - 180, y, 15, '#e8f0e8'); L(ctx, '+' + fmtScore(rec.accBonus), CX + 170, y, 15, '#ffd94d'); y += 28; }
      if (rec.threeBuckBonus) { L(ctx, 'THREE BUCK BONUS', CX - 180, y, 15, '#e8f0e8'); L(ctx, '+' + fmtScore(rec.threeBuckBonus), CX + 170, y, 15, '#ffd94d'); y += 28; }
      if (rec.doeHit) { L(ctx, 'DOE PENALTY', CX - 180, y, 15, '#ff5a4a'); L(ctx, fmtScore(rec.penalty), CX + 170, y, 15, '#ff5a4a'); y += 28; }
      if (rec.cash) { L(ctx, 'CASH EARNED', CX - 180, y, 15, '#7ac96b'); L(ctx, '+$' + fmtScore(rec.cash), CX + 170, y, 15, '#7ac96b'); y += 28; }
      const siteTotal = rec.kills.reduce((s, k) => s + k.points, 0) + rec.accBonus + rec.threeBuckBonus + rec.penalty;
      L(ctx, 'SITE TOTAL', CX - 180, y + 8, 18, '#f2ead0');
      L(ctx, (siteTotal >= 0 ? '+' : '') + fmtScore(siteTotal), CX + 170, y + 8, 18, siteTotal >= 0 ? '#ffd94d' : '#ff5a4a');
      L(ctx, 'TAP TO CONTINUE', CX, 470, 14, '#fff', 'center');
      DH.hud.draw(ctx, {});
    },
    onClick(x, y) {
      if (DH.hud.muteHit(x, y)) { DH.audio.toggleMute(); return; }
      advanceAfterSite();
    },
  };

  function advanceAfterSite() {
    const trek = DH.data.treks[DH.G.trekIndex];
    DH.G.siteIndex++;
    if (DH.G.siteIndex < trek.sites.length) DH.setState('SITE_INTRO');
    else DH.setState('TREK_RESULTS');
  }

  // ---------- TREK RESULTS ----------
  let trekSummary = null;

  DH.states.TREK_RESULTS = {
    enter() {
      const recs = DH.G.trekRecords;
      const bucks = recs.reduce((s, r) => s + r.kills.length, 0);
      const shots = recs.reduce((s, r) => s + r.shots, 0);
      const hits = recs.reduce((s, r) => s + r.hits, 0);
      const perfect = bucks === 15 ? DH.data.scoring.perfectTrek : 0;
      DH.G.score += perfect;
      trekSummary = { bucks, shots, hits, perfect, points: DH.G.score - DH.G.trekStartScore };
      resT = 0;
      DH.audio.play('fanfare');
    },
    update(dt) {
      resT += dt;
      if (resT >= 5) DH.setState('BONUS');
    },
    render(ctx) {
      const CX = DH.CX;
      const trek = DH.data.treks[DH.G.trekIndex];
      fill(ctx);
      panel(ctx, CX - 230, 60, 460, 420);
      L(ctx, trek.name, CX, 112, 28, '#cfe3cf', 'center');
      L(ctx, 'TREK COMPLETE!', CX, 152, 34, '#ffd94d', 'center');
      L(ctx, `BUCKS TAKEN   ${trekSummary.bucks} / 15`, CX, 220, 20, '#f2ead0', 'center');
      L(ctx, `ACCURACY   ${trekSummary.shots ? Math.round((trekSummary.hits / trekSummary.shots) * 100) : 0}%`,
        CX, 256, 20, '#f2ead0', 'center');
      if (trekSummary.perfect) L(ctx, `PERFECT TREK  +${fmtScore(trekSummary.perfect)}`, CX, 300, 20, '#7ac96b', 'center');
      L(ctx, 'TREK POINTS', CX, 360, 18, '#cfe3cf', 'center');
      L(ctx, fmtScore(trekSummary.points), CX, 398, 34, '#ffd94d', 'center');
      L(ctx, 'BONUS ROUND UP NEXT — TAP!', CX, 452, 16, '#fff', 'center');
      DH.hud.draw(ctx, {});
    },
    onClick(x, y) {
      if (DH.hud.muteHit(x, y)) { DH.audio.toggleMute(); return; }
      DH.setState('BONUS');
    },
  };

  // ---------- BONUS RESULTS ----------
  let bonusRec = null;

  DH.states.BONUS_RESULTS = {
    enter(r) { bonusRec = r; resT = 0; if (r.allBonus) DH.audio.play('fanfare'); },
    update(dt) {
      resT += dt;
      if (resT >= 4) completeTrek();
    },
    render(ctx) {
      const CX = DH.CX;
      fill(ctx);
      panel(ctx, CX - 210, 100, 420, 330);
      L(ctx, 'DUCK FLUSH', CX, 152, 30, '#ffd94d', 'center');
      L(ctx, `DUCKS  ${bonusRec.hits} / ${bonusRec.total}`, CX, 216, 22, '#f2ead0', 'center');
      L(ctx, `+${fmtScore(bonusRec.points)}`, CX, 258, 24, '#ffd94d', 'center');
      if (bonusRec.allBonus) L(ctx, `FULL FLUSH BONUS  +${fmtScore(bonusRec.allBonus)}`, CX, 300, 18, '#7ac96b', 'center');
      L(ctx, 'TAP TO CONTINUE', CX, 396, 15, '#fff', 'center');
      DH.hud.draw(ctx, {});
    },
    onClick(x, y) {
      if (DH.hud.muteHit(x, y)) { DH.audio.toggleMute(); return; }
      completeTrek();
    },
  };

  function completeTrek() {
    const trek = DH.data.treks[DH.G.trekIndex];
    DH.G.completed[trek.id] = DH.G.score - DH.G.trekStartScore;
    DH.setState('TREK_SELECT');
  }

  // ---------- FINAL RESULTS ----------
  DH.states.FINAL_RESULTS = {
    enter() { resT = 0; DH.audio.play('fanfare'); },
    update(dt) { resT += dt; },
    render(ctx) {
      const CX = DH.CX;
      fill(ctx);
      panel(ctx, CX - 250, 50, 500, 440);
      L(ctx, 'HUNT COMPLETE!', CX, 110, 38, '#ffd94d', 'center');
      let y = 170;
      for (const tk of DH.data.treks) {
        L(ctx, tk.name, CX - 180, y, 16, '#f2ead0');
        L(ctx, '+' + fmtScore(DH.G.completed[tk.id] || 0), CX + 180, y, 16, '#ffd94d', 'right');
        y += 34;
      }
      L(ctx, 'FINAL SCORE', CX, y + 34, 20, '#cfe3cf', 'center');
      L(ctx, fmtScore(DH.G.score), CX, y + 82, 46, '#ffd94d', 'center');
      L(ctx, 'TAP TO CONTINUE', CX, 460, 15, '#fff', 'center');
    },
    onClick() {
      if (DH.highscores.qualifies(DH.G.score)) DH.setState('HISCORE_ENTRY');
      else DH.setState('HISCORES');
    },
  };

  // ---------- HIGH SCORE ENTRY ----------
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let initials = [0, 0, 0], slot = 0;

  function bump(d) {
    initials[slot] = (initials[slot] + d + ALPHA.length) % ALPHA.length;
    DH.audio.play('ui');
  }

  DH.states.HISCORE_ENTRY = {
    enter() { initials = [0, 0, 0]; slot = 0; resT = 0; },
    update(dt) { resT += dt; },
    render(ctx) {
      const CX = DH.CX;
      fill(ctx);
      panel(ctx, CX - 200, 80, 400, 380);
      L(ctx, 'NEW HIGH SCORE!', CX, 136, 30, '#ffd94d', 'center');
      L(ctx, fmtScore(DH.G.score), CX, 178, 26, '#f2ead0', 'center');
      L(ctx, 'ENTER YOUR INITIALS', CX, 218, 14, '#cfe3cf', 'center');
      for (let i = 0; i < 3; i++) {
        const x = CX - 80 + i * 80;
        const active = i === slot && Math.floor(resT * 2.4) % 2 === 0;
        rr(ctx, x - 28, 240, 56, 76, 8);
        ctx.fillStyle = i === slot ? '#1e3a26' : '#152a1b';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = i === slot ? '#ffe97a' : '#c9a54a';
        ctx.stroke();
        L(ctx, ALPHA[initials[i]], x, 298, 44, active || i !== slot ? '#fff' : '#ffe97a', 'center');
        L(ctx, '▲', x, 236, 16, '#ffd94d', 'center');
        L(ctx, '▼', x, 338, 16, '#ffd94d', 'center');
      }
      rr(ctx, CX - 60, 372, 120, 44, 8);
      ctx.fillStyle = '#2c5232';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#7ac96b';
      ctx.stroke();
      L(ctx, 'OK', CX, 402, 22, '#fff', 'center');
      L(ctx, 'TAP ▲▼ / ARROWS · OK OR ENTER TO CONFIRM', CX, 442, 12, '#9ab59a', 'center');
    },
    onClick(x, y) {
      const CX = DH.CX;
      for (let i = 0; i < 3; i++) {
        const cx = CX - 80 + i * 80;
        if (x > cx - 32 && x < cx + 32) {
          if (y > 214 && y < 258) { slot = i; bump(1); return; }
          if (y > 320 && y < 356) { slot = i; bump(-1); return; }
          if (y >= 258 && y <= 320) { slot = i; DH.audio.play('ui'); return; }
        }
      }
      if (x > CX - 60 && x < CX + 60 && y > 372 && y < 416) confirmInitials();
    },
    onKey(k) {
      if (k === 'ArrowUp') bump(1);
      else if (k === 'ArrowDown') bump(-1);
      else if (k === 'ArrowLeft') slot = (slot + 2) % 3;
      else if (k === 'ArrowRight') slot = (slot + 1) % 3;
      else if (k === 'Enter') confirmInitials();
      else if (/^[a-zA-Z]$/.test(k)) {
        initials[slot] = ALPHA.indexOf(k.toUpperCase());
        slot = Math.min(2, slot + 1);
      }
    },
  };

  function confirmInitials() {
    DH.audio.play('fanfare');
    DH.highscores.add(initials.map((i) => ALPHA[i]).join(''), DH.G.score);
    DH.setState('HISCORES');
  }

  // ---------- HIGH SCORES TABLE ----------
  DH.states.HISCORES = {
    enter() { resT = 0; },
    update(dt) {
      resT += dt;
      if (resT > 12) DH.setState('TITLE');
    },
    render(ctx) {
      const CX = DH.CX;
      const bgImg = DH.artimg && DH.artimg.trophy_bg;
      if (bgImg) {
        const s = Math.max(DH.W / bgImg.width, 540 / bgImg.height);
        ctx.drawImage(bgImg, (DH.W - bgImg.width * s) / 2, (540 - bgImg.height * s) / 2,
                      bgImg.width * s, bgImg.height * s);
        ctx.fillStyle = 'rgba(8,12,8,0.5)';
        ctx.fillRect(0, 0, DH.W, 540);
      } else {
        fill(ctx);
      }
      panel(ctx, CX - 200, 40, 400, 460);
      L(ctx, 'TROPHY ROOM', CX, 92, 30, '#ffd94d', 'center');
      const list = DH.highscores.load();
      if (!list.length) L(ctx, 'NO SCORES YET — GO HUNT!', CX, 260, 16, '#9ab59a', 'center');
      list.slice(0, 10).forEach((e, i) => {
        const y = 136 + i * 32;
        L(ctx, `${i + 1}.`, CX - 160, y, 16, '#cfe3cf');
        L(ctx, e.initials, CX - 100, y, 16, '#f2ead0');
        L(ctx, fmtScore(e.score), CX + 160, y, 16, '#ffd94d', 'right');
      });
      L(ctx, 'TAP FOR TITLE', CX, 478, 14, '#fff', 'center');
    },
    onClick() { DH.setState('TITLE'); },
    onKey(k) { if (k === 'Enter' || k === 'Escape') DH.setState('TITLE'); },
  };

  return {};
})();
