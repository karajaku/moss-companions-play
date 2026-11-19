"use strict";
const store = SaveStore.create(() => localStorage);
const exclusive = SaveStore.createLock({
  get locks() { return navigator.locks; },
  get indexedDB() { return window.indexedDB; }
});
const preferenceKey = "moss-companions.preferences.v1";
const prefs = {music:true, sound:true, motion:true, motionOverride:false};
try { Object.assign(prefs,JSON.parse(localStorage.getItem(preferenceKey))); } catch {}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const motionEnabled = () => prefs.motion && (!reducedMotion.matches || prefs.motionOverride);
const huntPage = () => location.hash !== "#forest/gather";
let ready = false, storageError = null, state = null;
let queue = Promise.resolve();
function sound(kind, delay=0) {
  if (prefs.sound && !document.hidden) GameSound.play(kind,delay);
}
function syncMusic() {
  GameMusic.update(state?.hunt && huntPage() ? "battle" : "forest",{enabled:prefs.music,hidden:document.hidden});
}
function render() {
  if (!state) return;
  HuntEffects.cancel();
  HuntWatch.beforeRender();
  document.body.dataset.motion = motionEnabled() ? "on" : "off";
  const hunt = huntPage();
  el("screen").className = hunt ? "hunt" : "gather";
  el("screen").innerHTML = hunt ? HuntWatch.view(state) : FieldcraftView.workshop(state) + liningView();
  for (const link of document.querySelectorAll("#pageNav button")) {
    if ((link.dataset.go === "forest") === hunt) link.setAttribute("aria-current","page");
    else link.removeAttribute("aria-current");
  }
  el("gold").textContent = fmt(state.gold) + " G";
  el("wallet").textContent = "보유 사냥권 " + fmt(Game.huntingStatus(state).free) + "개 · 10분마다 1개 충전";
  for (const key of ["music","sound","motion"]) el(key).checked = key === "motion" ? motionEnabled() : prefs[key];
  syncMusic();
  drawFrames(performance.now());
}
function liningView() {
  const cost = Game.liningCosts[state.huntLining];
  return card("숲 방호 안감",desc("안감 "+state.huntLining+"단계 · 숲결 섬유 "+fmt(state.forestFiber)+"개") +
    btn("craftHuntLining",cost ? "섬유 "+cost+"개로 보강" : "최고 단계","","action",!cost || state.forestFiber<cost));
}
function locked(fn) {
  queue = queue.then(() => exclusive(fn)).catch(error => {
    storageError = error;
    HuntWatch.stop("",false);
    el("saveError").hidden = false;
    try { el("recover").hidden = !["corrupt","missing"].includes(error.code) || !store.backup(); } catch {}
    console.error(error);
  });
  return queue;
}
function act(action,arg="",pressedAt,turnGuard,repeatGuard) {
  return locked(() => {
    if (!ready || storageError) return;
    store.check();
    if (turnGuard) { action = turnGuard(); if (!action) return; }
    if (repeatGuard) {
      const request = repeatGuard();
      if (!request) return;
      ({action,arg} = request);
    }
    const before = state.hunt;
    const candidate = structuredClone(state);
    const result = Game.perform(candidate,action,arg);
    if (result.ok) {
      state = store.commit(candidate);
      HuntWatch.stageOutcome(before);
      render();
      if (before && result.impact) HuntEffects.play(result.impact,before,(state.hunt || state.lastHunt)?.lastDice);
    }
    if (!HuntWatch.active || !result.ok) el("notice").textContent = result.message;
  });
}
function initialize(saved) {
  state = saved;
  ready = true;
  storageError = null;
  el("saveError").hidden = true;
  HuntWatch.restoreReceipt();
  render();
}
function changePref(key,value) {
  prefs[key] = value;
  if (key === "motion") prefs.motionOverride = value;
  try { localStorage.setItem(preferenceKey,JSON.stringify(prefs)); } catch {}
  render();
}
document.addEventListener("click",event => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.id === "reload") { location.reload(); return; }
  if (button.id === "recover") { locked(() => initialize(store.recover())); return; }
  if (!ready || storageError) return;
  if (prefs.sound) GameSound.unlock();
  GameMusic.unlock();
  const d = button.dataset;
  if (d.go) { location.hash = d.go; return; }
  if (d.motionPolicy) { changePref("motion",true); return; }
  if (d.open === "huntWallet") { el("settings").open = true; el("wallet").scrollIntoView(); return; }
  if (!d.act) return;
  let arg = d.arg;
  if (d.act === "dispatchGatherer") arg = {kind:d.arg,site:el("gatherSite").value};
  if (d.act === "recallGatherer") arg = {kind:d.arg,start:Number(d.start),site:d.site};
  if (d.act === "resolveCapture") arg = {id:decodeURIComponent(d.entry),wave:Number(d.wave),tool:d.arg};
  if (d.act === "craftHuntLining") arg = {generation:state._save.generation,revision:state._save.revision,expectedLevel:state.huntLining};
  act(d.act,arg);
});
document.addEventListener("change",event => {
  if (["sound","music","motion"].includes(event.target.id)) {
    changePref(event.target.id,event.target.checked);
    if (prefs.music) GameMusic.unlock();
  }
});
window.addEventListener("hashchange",() => { el("notice").textContent = ""; render(); });
document.addEventListener("visibilitychange",syncMusic);
reducedMotion.addEventListener("change",render);
setInterval(() => {
  if (!ready || storageError || document.hidden) return;
  HuntWatch.refreshWallet();
  FieldcraftView.refreshTrips(state);
},1000);
const sheets = new Map();
function drawFrames(now) {
  for (const canvas of document.querySelectorAll("canvas[data-sprite]")) {
    const name = canvas.dataset.sprite;
    let sheet = sheets.get(name);
    if (!sheet) {
      sheet = new Image(); sheet.src = "assets/" + name + "-sheet.png"; sheets.set(name,sheet);
      sheet.onload = () => drawFrames(performance.now());
    }
    if (!sheet.naturalWidth) continue;
    const start = Number(canvas.closest(".watch-actor").dataset.attackAt);
    const attacking = now >= start && now - start < 360 && name === "boar";
    const frame = !motionEnabled() ? 0 : attacking ? 4 + Math.floor((now-start)/90) : Math.floor(now/180)%4;
    if (canvas.dataset.frame === String(frame)) continue;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,144,144);
    ctx.drawImage(sheet,frame*144,0,144,144,0,0,144,144);
    canvas.dataset.frame = String(frame);
  }
}
setInterval(() => { if (ready && !document.hidden && huntPage() && motionEnabled()) drawFrames(performance.now()); },90);
locked(() => initialize(store.load() || store.commit(Game.fresh())));
