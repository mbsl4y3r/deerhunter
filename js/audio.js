window.DH = window.DH || {};

// All sound is synthesized with the Web Audio API — no audio files.
DH.audio = (() => {
  let ac = null;
  let master = null;
  let muted = false;
  let disabled = false;
  let ambientTimer = null;

  try { muted = localStorage.getItem('dh.muted') === '1'; } catch (e) { /* ignore */ }

  function unlock() {
    if (disabled) return;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { disabled = true; return; }
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
  }

  function noiseBuffer(dur) {
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function env(gainNode, t0, peak, dur) {
    gainNode.gain.setValueAtTime(0.0001, t0);
    gainNode.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  const SFX = {
    shot() {
      const t0 = ac.currentTime;
      // noise crack through a falling lowpass
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(0.3);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3200, t0);
      lp.frequency.exponentialRampToValueAtTime(320, t0 + 0.22);
      const g = ac.createGain();
      env(g, t0, 0.9, 0.28);
      src.connect(lp).connect(g).connect(master);
      src.start(t0);
      // low thump
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(110, t0);
      o.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
      const g2 = ac.createGain();
      env(g2, t0, 0.7, 0.14);
      o.connect(g2).connect(master);
      o.start(t0); o.stop(t0 + 0.16);
    },
    pump() {
      for (const dt of [0, 0.11]) {
        const t0 = ac.currentTime + dt;
        const src = ac.createBufferSource();
        src.buffer = noiseBuffer(0.05);
        const bp = ac.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = dt ? 900 : 1400;
        bp.Q.value = 2;
        const g = ac.createGain();
        env(g, t0, 0.45, 0.05);
        src.connect(bp).connect(g).connect(master);
        src.start(t0);
      }
    },
    dryfire() {
      const t0 = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(0.03);
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 4;
      const g = ac.createGain();
      env(g, t0, 0.25, 0.03);
      src.connect(bp).connect(g).connect(master);
      src.start(t0);
    },
    thud() {
      const t0 = ac.currentTime;
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(170, t0);
      o.frequency.exponentialRampToValueAtTime(55, t0 + 0.16);
      const g = ac.createGain();
      env(g, t0, 0.55, 0.2);
      o.connect(g).connect(master);
      o.start(t0); o.stop(t0 + 0.22);
    },
    buzzer() {
      const t0 = ac.currentTime;
      for (const f of [110, 116]) {
        const o = ac.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.18, t0);
        g.gain.setValueAtTime(0.18, t0 + 0.42);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.55);
        o.connect(g).connect(master);
        o.start(t0); o.stop(t0 + 0.55);
      }
    },
    quack() {
      const t0 = ac.currentTime;
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(320, t0);
      o.frequency.exponentialRampToValueAtTime(180, t0 + 0.12);
      const am = ac.createOscillator();
      am.frequency.value = 28;
      const amg = ac.createGain();
      amg.gain.value = 0.5;
      const g = ac.createGain();
      env(g, t0, 0.3, 0.14);
      am.connect(amg).connect(g.gain);
      o.connect(g).connect(master);
      o.start(t0); o.stop(t0 + 0.16);
      am.start(t0); am.stop(t0 + 0.16);
    },
    ui() {
      const t0 = ac.currentTime;
      const o = ac.createOscillator();
      o.frequency.value = 760;
      const g = ac.createGain();
      env(g, t0, 0.2, 0.07);
      o.connect(g).connect(master);
      o.start(t0); o.stop(t0 + 0.09);
    },
    fanfare() {
      const t0 = ac.currentTime;
      [523, 659, 784, 1047].forEach((f, i) => {
        const o = ac.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const g = ac.createGain();
        env(g, t0 + i * 0.09, 0.3, 0.4);
        o.connect(g).connect(master);
        o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 0.45);
      });
    },
    chirp() {
      const t0 = ac.currentTime;
      const o = ac.createOscillator();
      const f = 2200 + Math.random() * 1600;
      o.frequency.setValueAtTime(f, t0);
      o.frequency.exponentialRampToValueAtTime(f * 1.4, t0 + 0.05);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t0 + 0.1);
      const g = ac.createGain();
      env(g, t0, 0.06, 0.12);
      o.connect(g).connect(master);
      o.start(t0); o.stop(t0 + 0.14);
    },
    wind() {
      const t0 = ac.currentTime;
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(2.4);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 1.0);
      g.gain.linearRampToValueAtTime(0.0001, t0 + 2.3);
      src.connect(lp).connect(g).connect(master);
      src.start(t0);
    },
  };

  function play(name) {
    if (disabled || muted || !ac || !SFX[name]) return;
    try { SFX[name](); } catch (e) { /* audio hiccups must never break the game */ }
  }

  function startAmbient(env) {
    stopAmbient();
    if (disabled) return;
    ambientTimer = setInterval(() => {
      if (muted || !ac) return;
      play(env === 'forest' ? 'chirp' : Math.random() < 0.4 ? 'chirp' : 'wind');
    }, 2600);
  }

  function stopAmbient() {
    if (ambientTimer) { clearInterval(ambientTimer); ambientTimer = null; }
  }

  function toggleMute() {
    muted = !muted;
    if (master) master.gain.value = muted ? 0 : 0.8;
    try { localStorage.setItem('dh.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  }

  function disable() { disabled = true; }

  return { unlock, play, startAmbient, stopAmbient, toggleMute, disable,
           get muted() { return muted; } };
})();
