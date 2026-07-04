window.DH = window.DH || {};

// Mouse/keyboard input, converted to logical 960×540 coordinates.
DH.input = (() => {
  const mouse = { x: 480, y: 270, inside: false };
  let canvas = null;

  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: DH.util.clamp(((e.clientX - r.left) / r.width) * 960, 0, 960),
      y: DH.util.clamp(((e.clientY - r.top) / r.height) * 540, 0, 540),
    };
  }

  function init(cv) {
    canvas = cv;
    canvas.addEventListener('mousemove', (e) => {
      const p = toLogical(e);
      mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
    });
    canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
    canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      DH.audio.unlock();
      const p = toLogical(e);
      mouse.x = p.x; mouse.y = p.y;
      if (e.button === 2) DH.main.dispatch('rclick', p.x, p.y);
      else DH.main.dispatch('click', p.x, p.y);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      DH.audio.unlock();
      if (e.key === ' ') e.preventDefault();
      DH.main.dispatch('key', e.key);
    });
  }

  return { init, mouse };
})();
