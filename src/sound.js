// Sound effects, made in the browser with the Web Audio API: no audio files to load or license.
// Bubbly and toy-like, to match the look. Holds no game rules; src/ui.js says what to play.
//
// Browsers only allow sound after the player taps something, so the audio starts on the first
// tap (Start, or any button). On iPhones the "ambient" audio session follows the silent switch
// and mixes with music that's already playing. The Sound setting is kept per device.
(function (W) {
  const ST = (W.ST = W.ST || {});
  const KEY = 'alphaboom.sound';
  const AC = W.AudioContext || W.webkitAudioContext;

  let on = true;
  try { on = W.localStorage.getItem(KEY) !== 'off'; } catch {}

  let ctx = null;
  let out = null; // master gain, through a compressor so big chains don't clip
  let noise = null; // one second of white noise, for whooshes and thuds
  const lastPlayed = {};

  function start() {
    if (!AC) return null;
    if (!ctx) {
      try {
        if (W.navigator.audioSession) W.navigator.audioSession.type = 'ambient';
      } catch {}
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      out = ctx.createGain();
      out.gain.value = 0.55;
      out.connect(comp);
      comp.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // The first tap anywhere starts the audio (a browser rule).
  const unlock = () => { if (on) start(); };
  W.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  W.addEventListener('keydown', unlock, { capture: true });

  // One note: a wave that slides from f0 to f1 over `dur` seconds, with a quick attack.
  function tone(f0, f1, dur, { type = 'sine', vol = 0.3, at = 0, attack = 0.006 } = {}) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.85);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Filtered noise whose filter slides from f0 to f1: whooshes and thumps.
  function hiss(f0, f1, dur, { vol = 0.25, at = 0, q = 0.8, type = 'lowpass' } = {}) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // A major-pentatonic scale from C5, so any run of steps sounds happy.
  const STEPS = [0, 2, 4, 7, 9];
  const note = (step) => 523.25 * Math.pow(2, (STEPS[step % 5] + 12 * Math.floor(step / 5)) / 12);

  const SOUNDS = {
    move() { tone(1150, 1000, 0.035, { type: 'triangle', vol: 0.06 }); },
    rotate() { tone(520, 980, 0.08, { type: 'triangle', vol: 0.12 }); },
    // A piece locking in: a soft thump.
    land() {
      tone(170, 70, 0.14, { vol: 0.32 });
      hiss(900, 200, 0.09, { vol: 0.08 });
    },
    // A word popping: a bubbly bloop, higher for longer words; `at` staggers several words.
    word({ letters = 3, at = 0 } = {}) {
      const f = 330 * Math.pow(2, Math.min(9, letters - 3) * 2 / 12);
      tone(f, f * 2.4, 0.16, { vol: 0.32, at });
      tone(f * 2, f * 3.2, 0.1, { type: 'triangle', vol: 0.08, at: at + 0.02 });
      tone(f * 3, f * 3, 0.22, { type: 'sine', vol: 0.06, at: at + 0.09 });
    },
    // Each wave of a chain climbs a step: wave 2, 3, 4… sound like a rising scale.
    chain({ wave = 2 } = {}) {
      const base = (wave - 2) * 2;
      [0, 1, 2].forEach((k, i) => tone(note(base + k + 2), note(base + k + 2), 0.16, { type: 'triangle', vol: 0.16, at: i * 0.07 }));
      tone(note(base + 7), note(base + 7), 0.3, { vol: 0.08, at: 0.2 });
    },
    // A full row clearing without a word: a dull, falling whoosh, plainly less fun than a word.
    row() {
      hiss(1400, 180, 0.42, { vol: 0.22 });
      tone(220, 140, 0.25, { type: 'triangle', vol: 0.06 });
    },
    levelUp() {
      [0, 2, 3, 5].forEach((s, i) => tone(note(s), note(s), 0.18, { type: 'triangle', vol: 0.16, at: i * 0.1 }));
      tone(note(5) * 2, note(5) * 2, 0.4, { vol: 0.08, at: 0.4 });
    },
    gameOver() {
      [4, 2, 0].forEach((s, i) => tone(note(s) / 2, note(s) / 2 * 0.97, 0.32, { type: 'triangle', vol: 0.18, at: i * 0.22 }));
      tone(130, 90, 0.7, { vol: 0.16, at: 0.66 });
    },
    // Taps on screen buttons (Start, Next, Post…).
    tap() { tone(700, 900, 0.05, { type: 'triangle', vol: 0.08 }); },
    // A posted score, or another small win outside the board.
    cheer() {
      [0, 2, 4].forEach((s, i) => tone(note(s + 5), note(s + 5), 0.14, { type: 'triangle', vol: 0.12, at: i * 0.06 }));
    },
  };

  // Plays a sound, unless sound is off. Rapid repeats (auto-repeat moves) are thinned out.
  function play(name, opts) {
    if (!on || !SOUNDS[name] || !start() || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (name === 'move' && now - (lastPlayed.move || 0) < 0.04) return;
    lastPlayed[name] = now;
    try { SOUNDS[name](opts); } catch {}
  }

  const listeners = [];
  ST.sound = {
    supported: !!AC,
    play,
    get on() { return on; },
    set(value) {
      on = !!value;
      try { W.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch {}
      if (on) { start(); play('tap'); } else if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
      listeners.forEach((fn) => fn(on));
    },
    onChange(fn) { listeners.push(fn); },
  };
})(window);
