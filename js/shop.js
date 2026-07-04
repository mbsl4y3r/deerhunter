window.DH = window.DH || {};

// Gun shop: persistent wallet (cash from kills), buyable guns and parts.
// Equipped-gun stats feed DH.shooting via the getters below.
DH.shop = (() => {
  const KEY = 'dh.shop';

  function defaults() {
    return { cash: 0, owned: ['pump12'], equipped: 'pump12', upgrades: [] };
  }

  let S = (() => {
    try {
      const raw = localStorage.getItem(KEY);
      const s = raw ? JSON.parse(raw) : null;
      if (s && s.owned && s.equipped) return Object.assign(defaults(), s);
    } catch (e) { /* fall through */ }
    return defaults();
  })();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
  }

  const gunById = (id) => DH.data.guns.find((g) => g.id === id);
  const gun = () => gunById(S.equipped) || DH.data.guns[0];
  const has = (id) => S.upgrades.includes(id);

  function earn(points) {
    const c = Math.round(points / 5);
    if (c > 0) { S.cash += c; save(); }
    return c;
  }

  function buy(id) {
    const g = gunById(id);
    if (!g || S.owned.includes(id) || S.cash < g.price) return false;
    S.cash -= g.price;
    S.owned.push(id);
    S.equipped = id;
    save();
    return true;
  }

  function equip(id) {
    if (!S.owned.includes(id)) return false;
    S.equipped = id;
    save();
    return true;
  }

  function buyUpgrade(id) {
    const u = DH.data.upgrades.find((x) => x.id === id);
    if (!u || has(id) || S.cash < u.price) return false;
    S.cash -= u.price;
    S.upgrades.push(id);
    save();
    return true;
  }

  const api = {
    earn, buy, equip, buyUpgrade,
    get cash() { return S.cash; },
    get equipped() { return S.equipped; },
    owns: (id) => S.owned.includes(id),
    hasUpgrade: has,
    gun,
    capacity: () => gun().shells + (has('mag') ? 1 : 0),
    reloadTime: () => gun().reload * (has('slick') ? 0.65 : 1),
    cooldown: () => gun().cooldown * (has('trigger') ? 0.6 : 1),
    bulletSpeed: () => gun().bullet * (has('barrel') ? 1.25 : 1),
    scoreMult: () => gun().scoreMult || 1,
    ammo: () => gun().ammo,
    _reset: () => { S = defaults(); save(); },
  };

  // ---------- simple side-view gun painter ----------
  function drawGun(ctx, style, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.lineCap = 'round';
    // stock
    ctx.fillStyle = '#6b4a2c';
    ctx.beginPath();
    ctx.moveTo(-46, -3);
    ctx.lineTo(-30, -5);
    ctx.lineTo(-26, 5);
    ctx.lineTo(-40, 9);
    ctx.closePath();
    ctx.fill();
    // receiver
    ctx.fillStyle = '#33393e';
    ctx.fillRect(-30, -5, 22, 9);
    // barrel
    ctx.strokeStyle = '#454d54';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.lineTo(style === 'bolt' ? 52 : 44, -2);
    ctx.stroke();
    if (style === 'pump' || style === 'auto') {
      ctx.fillStyle = '#5d4025';
      ctx.fillRect(4, 1, 16, 5);                       // foregrip / pump slide
      if (style === 'auto') { ctx.fillStyle = '#2b3136'; ctx.fillRect(-16, 4, 8, 9); } // mag box
    }
    if (style === 'lever') {
      ctx.strokeStyle = '#2b3136';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(-16, 8, 6, -0.4, Math.PI + 0.4);         // lever loop
      ctx.stroke();
      ctx.fillStyle = '#5d4025';
      ctx.fillRect(2, 1, 14, 4);
    }
    if (style === 'bolt') {
      ctx.fillStyle = '#2b3136';
      ctx.fillRect(-6, -9, 26, 4);                     // scope
      ctx.beginPath(); ctx.arc(-8, -7, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(22, -7, 3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#33393e';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-6, 8); ctx.stroke(); // bolt handle
    }
    ctx.restore();
  }

  // ---------- SHOP screen ----------
  const rows = [];   // rebuilt each render for hit-testing
  let flashMsg = null, flashT = 0, shopT = 0;
  const L = (ctx, ...a) => DH.hud.label(ctx, ...a);

  function flash(msg, ok) {
    flashMsg = { msg, ok };
    flashT = 1.4;
    DH.audio.play(ok ? 'ui' : 'dryfire');
  }

  DH.states = DH.states || {};
  DH.states.SHOP = {
    enter() { shopT = 0; flashMsg = null; },
    update(dt) {
      shopT += dt;
      flashT = Math.max(0, flashT - dt);
    },
    render(ctx) {
      const CX = DH.CX;
      ctx.fillStyle = '#14100c';
      ctx.fillRect(0, 0, DH.W, 540);
      // plank backdrop
      ctx.fillStyle = '#241a10';
      for (let i = 0; i < 6; i++) ctx.fillRect(0, i * 90, DH.W, 86);
      L(ctx, 'BUCK & BARREL', CX, 52, 38, '#ffd94d', 'center');
      L(ctx, 'GUNSMITH & OUTFITTER', CX, 76, 14, '#cfa96b', 'center');
      L(ctx, `CASH  $${DH.util.fmtScore(DH.shop.cash)}`, CX + 355, 52, 20, '#7ac96b', 'right');

      rows.length = 0;
      // guns column
      L(ctx, 'GUNS', CX - 355, 112, 16, '#f2ead0');
      DH.data.guns.forEach((g, i) => {
        const r = { x: CX - 365, y: 124 + i * 62, w: 445, h: 56, kind: 'gun', id: g.id };
        rows.push(r);
        const owned = api.owns(g.id);
        const equipped = DH.shop.equipped === g.id;
        const afford = DH.shop.cash >= g.price;
        DH.util.rr(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.fillStyle = equipped ? '#20351f' : '#1c1710';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = equipped ? '#7ac96b' : owned ? '#c9a54a' : afford ? '#8a7a55' : '#4a4238';
        ctx.stroke();
        drawGun(ctx, g.style, r.x + 52, r.y + 28, 0.9);
        L(ctx, g.name, r.x + 108, r.y + 22, 15, owned ? '#f2ead0' : afford ? '#e8dcc0' : '#8a8070');
        L(ctx, g.desc, r.x + 108, r.y + 38, 10, '#9a8f78');
        L(ctx, `CAP ${g.shells} · VEL ${g.bullet} · ROF ${Math.round(1 / g.cooldown)}/s`,
          r.x + 108, r.y + 50, 9, '#7a7260');
        L(ctx, equipped ? 'EQUIPPED' : owned ? 'EQUIP' : `$${DH.util.fmtScore(g.price)}`,
          r.x + r.w - 12, r.y + 34, 14, equipped ? '#7ac96b' : owned ? '#ffd94d' : afford ? '#7ac96b' : '#8a5a4a', 'right');
      });

      // upgrades column
      L(ctx, 'GUN PARTS (FIT ALL GUNS)', CX + 95, 112, 16, '#f2ead0');
      DH.data.upgrades.forEach((u, i) => {
        const r = { x: CX + 90, y: 124 + i * 62, w: 275, h: 56, kind: 'upg', id: u.id };
        rows.push(r);
        const owned = api.hasUpgrade(u.id);
        const afford = DH.shop.cash >= u.price;
        DH.util.rr(ctx, r.x, r.y, r.w, r.h, 8);
        ctx.fillStyle = owned ? '#20351f' : '#1c1710';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = owned ? '#7ac96b' : afford ? '#8a7a55' : '#4a4238';
        ctx.stroke();
        L(ctx, u.name, r.x + 14, r.y + 24, 14, owned ? '#f2ead0' : afford ? '#e8dcc0' : '#8a8070');
        L(ctx, u.desc, r.x + 14, r.y + 42, 10, '#9a8f78');
        L(ctx, owned ? 'INSTALLED' : `$${DH.util.fmtScore(u.price)}`,
          r.x + r.w - 12, r.y + 34, 13, owned ? '#7ac96b' : afford ? '#7ac96b' : '#8a5a4a', 'right');
      });
      L(ctx, 'EARN CASH WITH EVERY KILL — $1 PER 5 POINTS', CX + 95, 400, 11, '#9a8f78');

      // back button
      const back = { x: CX - 80, y: 470, w: 160, h: 44, kind: 'back' };
      rows.push(back);
      DH.util.rr(ctx, back.x, back.y, back.w, back.h, 10);
      ctx.fillStyle = '#2c5232';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#7ac96b';
      ctx.stroke();
      L(ctx, '← BACK', CX, 499, 18, '#fff', 'center');

      if (flashMsg && flashT > 0) {
        ctx.globalAlpha = Math.min(1, flashT * 2);
        L(ctx, flashMsg.msg, CX, 448, 16, flashMsg.ok ? '#7ac96b' : '#ff8a7a', 'center');
        ctx.globalAlpha = 1;
      }
      DH.hud.drawMute(ctx);
    },
    onClick(x, y) {
      if (DH.hud.muteHit(x, y)) { DH.audio.toggleMute(); return; }
      for (const r of rows) {
        if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) continue;
        if (r.kind === 'back') { DH.audio.play('ui'); DH.setState('TREK_SELECT'); return; }
        if (r.kind === 'gun') {
          if (DH.shop.equipped === r.id) return;
          if (api.owns(r.id)) { equip(r.id); flash('EQUIPPED', true); }
          else if (buy(r.id)) flash('SOLD! NICE IRON.', true);
          else flash('NOT ENOUGH CASH — GO HUNT!', false);
          return;
        }
        if (r.kind === 'upg') {
          if (api.hasUpgrade(r.id)) return;
          if (buyUpgrade(r.id)) flash('INSTALLED!', true);
          else flash('NOT ENOUGH CASH — GO HUNT!', false);
          return;
        }
      }
    },
    onKey(k) { if (k === 'Escape') DH.setState('TREK_SELECT'); },
  };

  return api;
})();
