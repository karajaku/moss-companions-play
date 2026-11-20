"use strict";
const TrainingView = (() => {
  const outcomes = {
    success: ["성공", "훈련 성공"],
    hold: ["유지", "레벨 유지"],
    drop: ["하락", "한 단계 하락"],
    reset: ["실패", "훈련 실패"]
  };
  let selected = "", last = null;
  let press = null, consumed = false;
  function target(s) {
    return Object.hasOwn(s.companions.xp, selected) ? selected : s.companions.active;
  }
  function roster(s) {
    return '<div class="training-roster">' + Object.keys(s.companions.xp).map(kind => {
      const partner = Game.trail.partner(s,kind);
      return '<button data-trainee="' + kind + '" aria-pressed="' + (target(s) === kind) + '">' +
        companionPortrait(partner.sprite) + '<span><b>' + partner.name + '</b><small>Lv.' + partner.level + ' · ' + Game.fieldcraft.types[kind] +
        ' 타입</small></span>' + (target(s) === kind ? icon("check") : '') + '</button>';
    }).join('') + '</div>';
  }
  function select(kind) {
    cancelPress();
    selected = kind;
    last = null;
  }
  function odds(status) {
    if (status.level === Game.trail.levelCap) return '';
    const entries = Object.entries(status.chances);
    const bar = entries.map(([key,chance]) => '<i class="chance-' + key + '" style="width:' + chance + '%"></i>').join('');
    const legend = entries.map(([key,chance]) => '<span><i class="chance-' + key + '"></i>' + outcomes[key][0] +
      ' <b>' + pct(chance) + '</b></span>').join('');
    return '<div class="training-odds"><strong>Lv.' + status.level + ' → Lv.' + (status.level+1) + '</strong>' +
      '<div class="training-meter" aria-hidden="true">' + bar + '</div><div class="training-legend">' + legend + '</div>' +
      (status.chances.reset ? '<p class="training-risk">훈련 실패 시 이 동료는 Lv.1로 돌아갑니다.</p>' : '') + '</div>';
  }
  function view(s) {
    const kind = target(s), status = Game.training.status(s,kind), partner = Game.trail.partner(s,kind);
    const result = last?.kind === kind ? '<div class="training-result" data-outcome="' + last.outcome + '">' +
      '<b>' + outcomes[last.outcome][1] + '</b><span>Lv.' + last.from + ' → Lv.' + last.to + '</span></div>' : '';
    const price = status.level === Game.trail.levelCap ? '최고 레벨' : status.cost ? fmt(status.cost) + ' G' : '무료';
    return '<section class="training-view"><div class="scene-heading"><h2>동료 훈련소</h2></div>' +
      '<div class="training-floor">' + result +
      '<div class="training-pad" aria-hidden="true"></div><div class="watch-actor trainee">' + combatSprite(partner.sprite) + '</div></div>' +
      '<div class="training-desk"><div class="trainee-info"><div><small>' + Game.fieldcraft.types[kind] + ' 타입 · Lv.' + status.level +
      '</small><h3>' + partner.name + '</h3></div><button data-open="trainees">' + icon("refresh-cw") + '동료 선택</button></div>' +
      odds(status) + (status.reason ? '<p class="training-reason">' + status.reason + '</p>' : '') + '</div>' +
      '<div class="scene-controls"><button class="main-action" data-act="trainCompanion" data-arg="' + kind +
      '" data-generation="' + encodeURIComponent(s._save.generation) + '" data-revision="' + s._save.revision + '"' + (status.reason ? ' disabled' : '') +
      '>' + icon("target") + '<b>훈련</b><small>' + price + '</small></button><small class="press-hint">꾹 눌러 연속 훈련</small></div></section>';
  }
  function remember(receipt) {
    last = receipt;
    if (receipt.outcome === "reset" || receipt.outcome === "success") cancelPress();
  }
  function play(receipt) {
    const actor = document.querySelector('.training-view .trainee');
    if (!actor) return;
    sound("forge-" + (receipt.outcome === "reset" ? "destroy" : receipt.outcome));
    if (!motionEnabled()) return;
    actor.dataset.attackAt = String(performance.now());
    actor.parentElement.dataset.drill = receipt.outcome;
    drawFrames(performance.now());
  }
  function request(button) {
    const d = button.dataset;
    return {kind:d.arg,generation:decodeURIComponent(d.generation),revision:Number(d.revision)};
  }
  function cancelPress() {
    clearTimeout(press?.timer);
    press = null;
  }
  function leave() {
    cancelPress();
    last = null;
  }
  const trainButton = '[data-act="trainCompanion"]';
  document.addEventListener("pointerdown", event => {
    cancelPress();
    consumed = false;
    const button = event.target.closest(trainButton + ':enabled');
    if (!button || !event.isPrimary || event.button !== 0 || !ready || storageError) return;
    if (prefs.sound) GameSound.unlock();
    const session = press = {id:event.pointerId,kind:button.dataset.arg,rect:button.getBoundingClientRect()};
    const currentButton = () => {
      if (session !== press || document.hidden || storageError || panel.open || pageRoute() !== "forest/training") return null;
      const current = document.querySelector(trainButton + ':enabled');
      return current?.dataset.arg === session.kind ? current : null;
    };
    async function attempt() {
      const current = currentButton();
      if (!current) { if (session === press) cancelPress(); return; }
      const arg = request(current);
      await act("trainCompanion",arg,undefined,() => currentButton() === current ? "trainCompanion" : null);
      if (currentButton() && state._save.revision === arg.revision + 1) session.timer = setTimeout(attempt,920);
      else if (press === session) cancelPress();
    }
    session.timer = setTimeout(() => {
      if (!currentButton()) return;
      consumed = true;
      el("screen").setPointerCapture(session.id);
      attempt();
    },420);
  });
  document.addEventListener("pointermove", event => {
    if (event.pointerId !== press?.id) return;
    const {left,right,top,bottom} = press.rect;
    if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) cancelPress();
  });
  for (const type of ["pointerup","pointercancel","lostpointercapture"]) {
    document.addEventListener(type,event => {
      if (event.pointerId === press?.id && (type !== "lostpointercapture" || event.target === el("screen"))) cancelPress();
    });
  }
  document.addEventListener("click",event => {
    if (consumed && event.detail && (event.target === el("screen") || event.target.closest(trainButton))) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  },true);
  document.addEventListener("contextmenu",event => { if (press || event.target.closest(trainButton)) event.preventDefault(); });
  document.addEventListener("keydown",cancelPress);
  document.addEventListener("visibilitychange",cancelPress);
  window.addEventListener("blur",cancelPress);
  window.addEventListener("pagehide",cancelPress);
  return {view,roster,select,remember,play,request,leave};
})();
