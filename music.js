"use strict";
// Pre-rendered original scores: no synthesis work on the gameplay/render thread.
const GameMusic = (() => {
  const titles = {forest:"이끼숲의 숨결", battle:"엄니와 칼날"};
  let context, master, active, retiring, request, pending = "", desired = "forest";
  let enabled = true, hidden = false, volume = .35, generation = 0;
  const cache = new Map();
  function dispose(voice) {
    if (!voice) return;
    try { voice.source.stop(); } catch {}
    voice.source.disconnect(); voice.gain.disconnect();
  }
  function stop() {
    generation++;
    request?.abort(); request = null; pending = "";
    dispose(active); dispose(retiring); active = retiring = null;
  }
  function fade(voice, target, seconds) {
    const param = voice.gain.gain, now = context.currentTime;
    // cancelAndHold also handles a second navigation during the incoming fade.
    if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
    else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
    param.linearRampToValueAtTime(target, now + seconds);
  }
  async function play() {
    if (!context || !enabled || hidden || !volume || active?.id === desired || pending === desired) return;
    const id = desired, ticket = ++generation;
    request?.abort();
    const controller = new AbortController(); request = controller; pending = id;
    try {
      let buffer = cache.get(id);
      if (!buffer) {
        const response = await fetch("assets/music/" + id + ".wav", { signal: controller.signal });
        if (!response.ok) throw new Error("Music unavailable");
        buffer = await context.decodeAudioData(await response.arrayBuffer());
      }
      if (ticket !== generation || hidden || !enabled) return;
      cache.delete(id); cache.set(id, buffer);
      while (cache.size > 3) cache.delete(cache.keys().next().value);
      dispose(retiring); retiring = active;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; source.loop = true;
      gain.gain.value = 0; source.connect(gain); gain.connect(master);
      active = { id, source, gain };
      source.start(); fade(active, 1, 1.2);
      if (retiring) {
        const outgoing = retiring;
        fade(outgoing, 0, 1.2);
        outgoing.source.onended = () => {
          outgoing.source.disconnect(); outgoing.gain.disconnect();
          if (retiring === outgoing) retiring = null;
        };
        outgoing.source.stop(context.currentTime + 1.25);
      }
    } catch {
      // Offline/missing audio must never prevent gameplay. Retry on the next gesture.
    } finally {
      if (ticket === generation) { pending = ""; request = null; }
    }
  }
  function unlock() {
    if (!enabled || hidden || !volume) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!context) {
        context = new Audio(); master = context.createGain();
        master.gain.value = volume * .65; master.connect(context.destination);
      }
      if (context.state !== "running") context.resume().catch(() => {});
      play();
    } catch {}
  }
  function update(id, options = {}) {
    desired = titles[id] ? id : "forest";
    enabled = options.enabled !== false; hidden = !!options.hidden;
    volume = Number.isFinite(options.volume) ? Math.max(0, Math.min(1, options.volume)) : .35;
    if (!enabled || hidden || !volume) {
      stop();
      if (context?.state === "running") context.suspend().catch(() => {});
      return;
    }
    // Cancel stale loading even if navigation returns to the currently playing cue.
    if (pending && pending !== desired) { generation++; request?.abort(); request = null; pending = ""; }
    if (context) {
      master.gain.setTargetAtTime(volume * .65, context.currentTime, .08);
      if (context.state === "suspended" || context.state === "interrupted") context.resume().catch(() => {});
      play();
    }
  }
  return { update, unlock, stop, titles };
})();
