"use client";
// Web Audio API synthesizer for the Legendary Card Reveal sequence:
// - 0.00s..1.15s: rising energy charge & accelerating crystalline sparkle ticks
// - 1.15s: sub-bass shockwave impact + filtered burst whoosh
// - 1.18s..2.75s: rarity-tuned triumphant fanfare chord & celestial chime arpeggio
// Zero external audio assets needed; fails gracefully if audio is blocked/unavailable.

export type RevealRarity = "rare" | "epic" | "gold" | "legendary";

type AudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

function makeContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as AudioWindow;
  const Ctor = w.AudioContext || w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

const FANFARE_CHORDS: Record<RevealRarity, { root: number[]; shimmer: number[] }> = {
  rare: {
    // C major 9 sapphire chord
    root: [261.63, 329.63, 392.0, 493.88, 587.33],
    shimmer: [523.25, 659.25, 783.99, 1046.5, 1318.5],
  },
  epic: {
    // F major 7 / D minor 9 amethyst swell
    root: [293.66, 349.23, 440.0, 523.25, 659.25],
    shimmer: [587.33, 698.46, 880.0, 1046.5, 1396.91],
  },
  gold: {
    // G major electric radiant chord
    root: [196.0, 293.66, 392.0, 493.88, 587.33, 739.99],
    shimmer: [783.99, 987.77, 1174.66, 1567.98, 1975.53],
  },
  legendary: {
    // Celestial Bb Lydian / C major 13 grand reveal fanfare
    root: [233.08, 349.23, 440.0, 523.25, 659.25, 783.99],
    shimmer: [587.33, 783.99, 932.33, 1174.66, 1567.98, 2093.0],
  },
};

export function playLegendaryRevealSound(rarity: RevealRarity): () => void {
  const ctx = makeContext();
  if (!ctx) return () => {};

  let stopped = false;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.24, ctx.currentTime);
  master.connect(ctx.destination);

  const now = ctx.currentTime + 0.02;
  const burstAt = now + 1.15;

  // 1) Charge riser (0s -> 1.15s)
  const riserOsc = ctx.createOscillator();
  const riserFilter = ctx.createBiquadFilter();
  const riserGain = ctx.createGain();
  riserOsc.type = "sawtooth";
  riserOsc.frequency.setValueAtTime(62, now);
  riserOsc.frequency.exponentialRampToValueAtTime(210, burstAt);
  riserFilter.type = "lowpass";
  riserFilter.frequency.setValueAtTime(180, now);
  riserFilter.frequency.exponentialRampToValueAtTime(1900, burstAt);
  riserGain.gain.setValueAtTime(0.0001, now);
  riserGain.gain.exponentialRampToValueAtTime(0.18, now + 0.95);
  riserGain.gain.exponentialRampToValueAtTime(0.0001, burstAt + 0.04);
  riserOsc.connect(riserFilter).connect(riserGain).connect(master);
  riserOsc.start(now);
  riserOsc.stop(burstAt + 0.06);

  // Accelerating charge sparkle ticks
  const tickTimes = [0.12, 0.34, 0.54, 0.72, 0.87, 0.99, 1.08];
  tickTimes.forEach((offset, idx) => {
    const t = now + offset;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    const freq = 580 + idx * 175;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.09);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.08 + idx * 0.015, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.12);
  });

  // 2) Sub-bass burst impact at 1.15s
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(150, burstAt);
  sub.frequency.exponentialRampToValueAtTime(36, burstAt + 0.48);
  subGain.gain.setValueAtTime(0.5, burstAt);
  subGain.gain.exponentialRampToValueAtTime(0.0001, burstAt + 0.52);
  sub.connect(subGain).connect(master);
  sub.start(burstAt);
  sub.stop(burstAt + 0.55);

  // Filtered noise burst shockwave
  try {
    const sampleRate = ctx.sampleRate || 44100;
    const noiseLen = Math.floor(sampleRate * 0.65);
    const buffer = ctx.createBuffer(1, noiseLen, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.22));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.Q.setValueAtTime(1.2, burstAt);
    noiseFilter.frequency.setValueAtTime(2200, burstAt);
    noiseFilter.frequency.exponentialRampToValueAtTime(260, burstAt + 0.6);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.32, burstAt);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, burstAt + 0.62);
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start(burstAt);
  } catch {
    // ignore noise generation issues
  }

  // 3) Majestic rarity fanfare chord + celestial bell shimmer
  const chord = FANFARE_CHORDS[rarity];
  chord.root.forEach((freq, i) => {
    const t = burstAt + 0.03 + i * 0.025;
    const oscA = ctx.createOscillator();
    const oscB = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    oscA.type = "triangle";
    oscB.type = "sine";
    oscA.frequency.setValueAtTime(freq, t);
    oscB.frequency.setValueAtTime(freq * 1.004, t);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11 / Math.max(1, chord.root.length * 0.45), t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.55);
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(g).connect(master);
    oscA.start(t);
    oscB.start(t);
    oscA.stop(t + 1.6);
    oscB.stop(t + 1.6);
  });

  chord.shimmer.forEach((freq, idx) => {
    const t = burstAt + 0.2 + idx * 0.075;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.018);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.76);
  });

  const closeTimer = window.setTimeout(() => {
    if (!stopped) {
      stopped = true;
      void ctx.close().catch(() => {});
    }
  }, 3400);

  return () => {
    window.clearTimeout(closeTimer);
    if (!stopped) {
      stopped = true;
      try {
        master.gain.setValueAtTime(0.0001, ctx.currentTime);
      } catch {}
      void ctx.close().catch(() => {});
    }
  };
}

export function playRevealPoseTapSound(): void {
  const ctx = makeContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  const now = ctx.currentTime + 0.01;
  [880, 1318.5].forEach((freq, idx) => {
    const t = now + idx * 0.05;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.08, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.26);
  });
  window.setTimeout(() => {
    void ctx.close().catch(() => {});
  }, 450);
}
