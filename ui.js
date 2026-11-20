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
function pageRoute() {
  if (location.hash === "#forest/training") return "forest/training";
  if (location.hash === "#forest/gather") return "forest/gather";
  return "forest";
}
const huntPage = () => pageRoute() === "forest";
let ready = false, storageError = null, state = null;
let queue = Promise.resolve();
function sound(kind, delay=0) {
  if (prefs.sound && !document.hidden) GameSound.play(kind,delay);
}
function syncMusic() {
  GameMusic.update(state?.hunt && huntPage() ? "battle" : "forest",{enabled:prefs.music,hidden:document.hidden});
}
const panel = el("scenePanel");
let panelName = "";
let panelTrigger = "";
let noticeTimer;
let scenePlayback = null;
for (const glyph of document.querySelectorAll("[data-icon]")) glyph.innerHTML = icon(glyph.dataset.icon);

function report(message, alreadyVisible = false) {
  clearTimeout(noticeTimer);
  const notice = el(panel.open ? "panelNotice" : "notice");
  notice.toggleAttribute("data-announcement",alreadyVisible);
  notice.textContent = message;
  noticeTimer = setTimeout(() => {
    el("notice").textContent = "";
    el("panelNotice").textContent = "";
  }, 4000);
}
function paintPanel() {
  const content = el("panelContent");
  const active = content.contains(document.activeElement) ? document.activeElement : null;
  const focus = active?.id ? "#" + active.id : active?.dataset.act ?
    '[data-act="' + active.dataset.act + '"][data-arg="' + (active.dataset.arg || '') + '"]' :
    active?.matches("[data-partner]") ? "[data-partner]" :
    active?.matches(".watch-mode") ? ".watch-mode" : active?.matches(".trail-replay") ? ".trail-replay" : "";
  const position = panel.scrollTop;
  if (panelName === "settings" || panelName === "huntWallet") {
    const w = Game.huntingStatus(state);
    el("panelTitle").textContent = "사냥권·설정";
    content.innerHTML = card("사냥권", '<p class="desc" id="walletBalance">' + walletText(w) + '</p>' +
      desc("무료 사냥권부터 사용하며 10분마다 1개 충전됩니다.") + btn("daily","오늘의 사냥권 받기"),"ticket") +
      card("연출과 소리", [["motion","전투 연출"],["music","배경 음악"],["sound","효과음"]].map(([key,label]) =>
        '<label class="setting-line">' + label + '<input type="checkbox" id="' + key + '"' +
        ((key === "motion" ? motionEnabled() : prefs[key]) ? " checked" : "") + '></label>').join(""),"settings");
  } else if (panelName === "huntPlan") {
    el("panelTitle").textContent = "사냥 준비";
    content.innerHTML = HuntWatch.plan(state);
  } else if (panelName === "tools") {
    el("panelTitle").textContent = "야영지 제작";
    content.innerHTML = FieldcraftView.recipes(state) + liningView();
  } else if (panelName === "workers") {
    el("panelTitle").textContent = "동료 파견";
    content.innerHTML = FieldcraftView.workers(state);
  } else if (panelName === "trainees") {
    el("panelTitle").textContent = "훈련할 동료";
    content.innerHTML = TrainingView.roster(state);
  }
  if (focus) content.querySelector(focus)?.focus({preventScroll:true});
  panel.scrollTop = position;
}
function walletText(w) {
  return "무료 " + fmt(w.free) + "개 · 구매 " + fmt(w.purchased) + "개";
}
function openPanel(name) {
  if (HuntWatch.active && (name === "huntPlan" || name === "tools")) HuntWatch.stop("일시 중단");
  panelName = panelTrigger = name;
  paintPanel();
  el("panelNotice").textContent = "";
  panel.showModal();
  panel.scrollTop = 0;
}
panel.addEventListener("close", () => {
  document.querySelector('[data-open="' + panelTrigger + '"]')?.focus({preventScroll:true});
  panelName = panelTrigger = "";
});
function render() {
  if (!state) return;
  if (scenePlayback && huntPage() && !document.hidden && !storageError && scenePlayback.motion === motionEnabled()) {
    if (panel.open) paintPanel();
    const toggle = document.querySelector("[data-watch]");
    if (toggle && !HuntWatch.active) {
      toggle.disabled = true;
      toggle.querySelector("b").textContent = "일시 중단";
    }
    return;
  }
  scenePlayback = null;
  CaptureEffects.cancel();
  HuntEffects.cancel();
  HuntWatch.beforeRender();
  document.body.dataset.motion = motionEnabled() ? "on" : "off";
  const route = pageRoute(), hunt = route === "forest", training = route === "forest/training";
  const refocusTrain = training && document.activeElement?.dataset.act === "trainCompanion";
  el("screen").className = hunt ? "hunt" : training ? "training" : "gather";
  el("screen").innerHTML = hunt ? HuntWatch.view(state) : training ? TrainingView.view(state) : FieldcraftView.workshop(state);
  if (refocusTrain) document.querySelector('[data-act="trainCompanion"]:enabled')?.focus({preventScroll:true});
  const scene = hunt ? document.querySelector(".watch-arena").dataset.region || "moss" : training ? "training" : "camp";
  document.body.style.setProperty("--scene", 'url("assets/' + (hunt ? "hunt/" : "field/") + scene + '.webp")');
  for (const link of document.querySelectorAll("#pageNav button")) {
    if (link.dataset.go === route) link.setAttribute("aria-current","page");
    else link.removeAttribute("aria-current");
  }
  el("gold").textContent = fmt(state.gold) + " G";
  const wallet = Game.huntingStatus(state);
  el("ticketCount").textContent = fmt(wallet.free + wallet.purchased);
  if (panel.open) paintPanel();
  syncMusic();
  drawFrames(performance.now());
}
function liningView() {
  const cost = Game.liningCosts[state.huntLining];
  return card("숲 방호 안감",desc("안감 "+state.huntLining+"단계 · 숲결 섬유 "+fmt(state.forestFiber)+"개") +
    btn("craftHuntLining",cost ? "섬유 "+cost+"개로 보강" : "최고 단계","","action",!cost || state.forestFiber<cost), "shield");
}
function locked(fn) {
  queue = queue.then(() => exclusive(fn)).catch(error => {
    storageError = error;
    HuntWatch.stop("",false);
    if (panel.open) panel.close();
    el("saveError").hidden = false;
    try { el("recover").hidden = !["corrupt","missing"].includes(error.code) || !store.backup(); } catch {}
    console.error(error);
  });
  return queue;
}
function presentTurn(before,result) {
  const arena = document.querySelector(".watch-arena");
  if (!huntPage() || document.hidden || !arena) return null;
  let effect;
  if (result.capture) {
    const target = arena.querySelector(".enemy .watch-actor");
    target.removeAttribute("data-defeated");
    effect = CaptureEffects.play({arena,target,source:arena.querySelector(".player .watch-actor"),
      grade:result.capture.tool,success:result.capture.caught,motion:motionEnabled()});
  } else if (before && result.impact) {
    const final = state.hunt || state.lastHunt;
    if (HuntEffects.play(result.impact,before,final.lastDice,final.health || final)) effect = HuntEffects.finished();
  }
  if (!effect) return null;
  const session = scenePlayback = {motion:motionEnabled()};
  for (const button of document.querySelectorAll(".scene-controls button:not([data-watch]), [data-act='resolveCapture']")) button.disabled = true;
  session.finished = effect.catch(error => { console.error(error); }).then(() => {
    if (scenePlayback !== session) return;
    scenePlayback = null;
    render();
    if (result.capture || !HuntWatch.active) report(result.message);
  });
  return session.finished;
}
function act(action,arg="",pressedAt,turnGuard,repeatGuard) {
  let presentation;
  return locked(() => {
    if (!ready || storageError) return;
    store.check();
    if (turnGuard) { action = turnGuard(); if (!action) return; }
    if (repeatGuard) {
      const request = repeatGuard();
      if (!request) return;
      ({action,arg} = request);
    }
    if (scenePlayback && ["resolveCapture","huntStart","huntAdvance","strike","openChest"].includes(action)) return;
    const before = state.hunt;
    const candidate = structuredClone(state);
    const result = Game.perform(candidate,action,arg);
    if (result.ok) {
      state = store.commit(candidate);
      if (result.training) TrainingView.remember(result.training);
      HuntWatch.stageOutcome(before);
      presentation = presentTurn(before,result);
      if (!presentation) render();
      if (result.training) TrainingView.play(result.training);
    }
    if (!presentation && (!HuntWatch.active || !result.ok)) report(result.message,!!result.training);
  }).then(() => presentation);
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
  if (button.id === "closePanel") { panel.close(); return; }
  if (!ready || storageError) return;
  if (prefs.sound) GameSound.unlock();
  GameMusic.unlock();
  const d = button.dataset;
  if (d.trainee) {
    TrainingView.select(d.trainee);
    panel.close();
    render();
    return;
  }
  if (d.go) { location.hash = d.go; return; }
  if (d.motionPolicy) { changePref("motion",true); return; }
  if (d.open) { openPanel(d.open); return; }
  if (!d.act) return;
  let arg = d.arg;
  if (d.act === "trainCompanion") arg = TrainingView.request(button);
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
window.addEventListener("hashchange",() => {
  TrainingView.leave();
  if (panel.open) panel.close();
  el("notice").textContent = "";
  render();
});
document.addEventListener("visibilitychange",syncMusic);
reducedMotion.addEventListener("change",render);
setInterval(() => {
  if (!ready || storageError || document.hidden) return;
  const wallet = Game.huntingStatus(state);
  el("ticketCount").textContent = fmt(wallet.free + wallet.purchased);
  const balance = el("walletBalance");
  if (balance) balance.textContent = walletText(wallet);
  HuntWatch.refreshWallet();
  FieldcraftView.refreshTrips(state);
},1000);
const sheets = new Map();
const woodlandSprites = new Set(["tree","moth","wolf","goblin"]);
function combatSprite(name) {
  const woodland = woodlandSprites.has(name);
  const size = woodland ? 224 : 144;
  return '<canvas class="' + (woodland ? 'trail-creature' : '') + '" width="' + size + '" height="' + size +
    '" data-sprite="' + name + '" aria-hidden="true"></canvas>';
}
function drawFrames(now) {
  for (const canvas of document.querySelectorAll("canvas[data-sprite]")) {
    const name = canvas.dataset.sprite;
    let sheet = sheets.get(name);
    if (!sheet) {
      sheet = new Image();
      sheet.src = woodlandSprites.has(name) ? "assets/hunt/" + name + "-sheet.webp" : "assets/" + name + "-sheet.png";
      sheets.set(name,sheet);
      sheet.onload = () => drawFrames(performance.now());
    }
    if (!sheet.naturalWidth) continue;
    const start = Number(canvas.closest(".watch-actor").dataset.attackAt);
    const attacking = now >= start && now - start < 360;
    const frame = !motionEnabled() ? 0 : attacking ? 4 + Math.floor((now-start)/90) : Math.floor(now/180)%4;
    if (canvas.dataset.frame === String(frame)) continue;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const size = sheet.naturalHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(sheet,frame*size,0,size,size,0,0,canvas.width,canvas.height);
    canvas.dataset.frame = String(frame);
  }
}
setInterval(() => {
  if (ready && !document.hidden && pageRoute() !== "forest/gather" && motionEnabled()) drawFrames(performance.now());
},90);
locked(() => {
  const saved = store.load();
  initialize(!saved || store.needsMigration ? store.commit(saved || Game.fresh()) : saved);
});
