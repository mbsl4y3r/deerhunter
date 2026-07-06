window.DH = window.DH || {};

// Mouse/keyboard input, converted to logical 960×540 coordinates.
DH.input = (() => {
  const mouse = { x: 480, y: 270, inside: false };
  let canvas = null;

  function toLogical(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    return {
      x: DH.util.clamp(((clientX - r.left) / r.width) * DH.W, 0, DH.W),
      y: DH.util.clamp(((clientY - r.top) / r.height) * 540, 0, 540),
    };
  }

  function init(cv) {
    canvas = cv;
    canvas.addEventListener('mousemove', (e) => {
      const p = toLogical(e.clientX, e.clientY);
      mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
    });
    canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      DH.audio.unlock();
      const p = toLogical(e.clientX, e.clientY);
      mouse.x = p.x; mouse.y = p.y;
      if (e.button === 2) { DH.main.dispatch('rclick', p.x, p.y); return; }
      // states with an onPress handler (scoped hunting) take over the
      // press/drag/release cycle; everyone else gets the classic click
      if (!DH.main.dispatch('press', p.x, p.y)) DH.main.dispatch('click', p.x, p.y);
    });
    canvas.addEventListener('mouseup', (e) => {
      const p = toLogical(e.clientX, e.clientY);
      mouse.x = p.x; mouse.y = p.y;
      if (e.button !== 2) DH.main.dispatch('release', p.x, p.y);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch: a tap aims and shoots in one motion; dragging moves the crosshair
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      DH.audio.unlock();
      const t = e.changedTouches[0];
      const p = toLogical(t.clientX, t.clientY);
      mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
      if (!DH.main.dispatch('press', p.x, p.y)) DH.main.dispatch('click', p.x, p.y);
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const p = toLogical(t.clientX, t.clientY);
      mouse.x = p.x; mouse.y = p.y;
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const p = toLogical(t.clientX, t.clientY);
      mouse.x = p.x; mouse.y = p.y;
      DH.main.dispatch('release', p.x, p.y);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      DH.audio.unlock();
      if (e.key === ' ') e.preventDefault();
      DH.main.dispatch('key', e.key);
    });
  }

  return { init, mouse };
})();
