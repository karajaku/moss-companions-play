"use strict";
// Offline procedural Foley: short noise transients plus inharmonic metal resonances.
const GameSound = (() => {
  let context, master, noise;
  const voices = new Set();
  function unlock() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = 0.6;
        master.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.3), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (context.state === "suspended") context.resume().catch(() => {});
    } catch {}
  }
  function stop() {
    for (const voice of voices) { try { voice.stop(); } catch {} }
    voices.clear();
  }
  function voice(source, at, duration, volume, filter) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    if (filter) { source.connect(filter); filter.connect(gain); }
    else source.connect(gain);
    gain.connect(master);
    voices.add(source);
    source.onended = () => { voices.delete(source); source.disconnect(); filter?.disconnect(); gain.disconnect(); };
    source.start(at);
    source.stop(at + duration + 0.01);
  }
  function tone(hz, at, duration, volume = 0.08, type = "sine") {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    voice(osc, at, duration, volume);
  }
  function hit(at, pitch = 1, volume = 1) {
    const source = context.createBufferSource(), filter = context.createBiquadFilter();
    source.buffer = noise;
    filter.type = "highpass";
    filter.frequency.value = 1600;
    voice(source, at, 0.065, 0.24 * volume, filter);
    tone(145 * pitch, at, 0.09, 0.22 * volume, "triangle");
    for (const [hz, amp, tail] of [[830, .13, .34], [1427, .085, .44], [2351, .05, .25], [3917, .022, .16]])
      tone(hz * pitch, at, tail, amp * volume);
  }
  function coins(at, count) {
    for (let i = 0; i < count; i++) {
      const time = at + i * 0.047 + (i % 3) * 0.012;
      const hz = [2180, 2760, 3290, 2470, 3650][i % 5];
      tone(hz, time, 0.15, 0.075);
      tone(hz * 1.47, time, 0.09, 0.025);
    }
  }
  function play(kind, delay = 0) {
    unlock();
    if (!context) return;
    stop();
    try {
      const at = context.currentTime + delay;
      if (kind.startsWith("forge")) {
        if (kind === "forge-success" || kind === "forge-win") {
          hit(at, 1.15, .85);
          [587, 784, 1175, 1568].forEach((hz, i) => tone(hz, at + .12 + i * .08, .38, .055));
        } else if (kind === "forge-repeat-hold") {
          hit(at, .93, .58);
        } else if (kind === "forge-hold" || kind === "forge-info") {
          hit(at, .85, .45);
          [660, 660].forEach((hz, i) => tone(hz, at + .12 + i * .18, .16, .055));
        } else if (kind === "forge-drop" || kind === "forge-loss") {
          hit(at, .7, .75);
          [392, 294, 196].forEach((hz, i) => tone(hz, at + .1 + i * .12, .22, .08, "triangle"));
        } else if (kind === "forge-destroy") {
          hit(at, .45, 1);
          [.06, .14, .23].forEach((offset, i) => hit(at + offset, 1.8 + i * .5, .35 - i * .08));
          tone(65, at + .08, .65, .13, "triangle");
        } else hit(at);
      } else if (kind === "chest") { hit(at, 0.55, 0.35); coins(at + .035, 17); }
      else if (kind === "coins") coins(at, 8);
      else if (kind === "dice") { [0,.09,.21,.36].forEach(dt=>hit(at+dt,.22,.18)); tone(680,at+.56,.07,.025); }
      else if (["block", "parry", "counter", "mine"].includes(kind)) hit(at, kind === "parry" ? 1.35 : .8, .65);
      else if (kind === "slash") {
        const source = context.createBufferSource(), filter = context.createBiquadFilter();
        source.buffer = noise;
        filter.type = "bandpass"; filter.frequency.value = 2600; filter.Q.value = .6;
        voice(source, at, .18, .25, filter);
        tone(180, at + .045, .12, .12, "triangle");
      } else if (kind === "ascend") [392, 587, 784, 988, 1175].forEach((hz, i) => tone(hz, at + i * .09, .65, .075));
      else if (kind === "bell") [1175, 2832, 3510].forEach((hz, i) => tone(hz, at, .85, .07 / (i + 1)));
      else (kind === "loss" ? [330, 233] : kind === "win" ? [470, 705, 940] : [535])
        .forEach((hz, i) => tone(hz, at + i * .065, .2, .055, i ? "sine" : "triangle"));
    } catch { stop(); }
  }
  return { unlock, play, stop };
})();
