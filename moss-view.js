"use strict";
(() => {
  const G = MossGame;
  const panel = document.querySelector("#panel"), notice = document.querySelector("#notice");
  let db, state, tab = "field", busy = false, automatic = false, timer;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("moss-companions.expedition.v1") : null;
  const portrait = kind => '<span aria-hidden="true" class="portrait ' + kind + '"></span>';
  const button = (action, label, value = "", style = "") =>
    '<button class="' + style + '" data-action="' + action + '" data-value="' + value + '">' + label + '</button>';
  function stop() {
    clearTimeout(timer);
    automatic = false;
  }
  function failed() {
    stop();
    state = null;
    panel.replaceChildren();
    notice.textContent = "탐험 기록을 열거나 저장할 수 없어요. 브라우저의 저장 공간을 확인한 뒤 다시 열어 주세요.";
    document.querySelector("#retry").hidden = false;
  }
  // A single read/write transaction also serializes actions from other tabs.
  function readOrAct(action, value, expected) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction("journey", "readwrite"), store = tx.objectStore("journey");
      const req = store.get("player");
      let next, changed = false;
      tx.onabort = () => reject(tx.error || new Error("저장 중단"));
      tx.oncomplete = () => resolve({ next, changed });
      req.onsuccess = () => {
        next = req.result === undefined ? G.fresh() : req.result;
        if (next?.version !== 1) { tx.abort(); return; }
        if (action && next.revision === expected) changed = G.perform(next, action, value);
        if (changed || req.result === undefined) store.put(next, "player");
      };
    });
  }
  function schedule() {
    clearTimeout(timer);
    if (!automatic || tab !== "field" || !state || document.hidden) return;
    timer = setTimeout(() => {
      const next = (G.habitats.indexOf(state.place) + 1) % G.habitats.length;
      if (state.battle) update("attack");
      else update("move", G.habitats[next]);
    }, 1400);
  }
  async function update(action, value) {
    if (!db || (action && busy)) return;
    if (action) busy = true;
    try {
      const prev = state;
      const { next, changed } = await readOrAct(action, value, prev?.revision);
      if (!action && state && next.revision <= state.revision) return;
      state = next;
      if ((action && !changed) || (!action && prev && prev.revision !== next.revision)) stop();
      if (changed) channel?.postMessage(next.revision);
      const paused = changed && action === "move" && automatic && !G.owned(next, next.battle.kind);
      if (paused) stop();
      if (changed && next.place === "camp") stop();
      render(changed && action === "move" ? prev.place : null);
      if (paused) notice.textContent = "미포획 생물을 만나 자동 탐험을 멈췄어요. " + next.note;
    } catch { failed(); }
    finally {
      if (action) busy = false;
      if (!busy) schedule();
    }
  }
  function map(oldPlace) {
    const pos = G.places[state.place], old = G.places[oldPlace] || pos;
    const fight = state.battle;
    const scene = fight ? '<div class="encounter-pair" aria-hidden="true"><div>' +
      portrait(G.partner(state).kind) + '</div><div>' + portrait(fight.kind) + '</div></div>' : '';
    const pins = G.habitats.map(key => {
      const p = G.places[key];
      return '<button class="pin" style="left:' + p.x + '%;top:' + p.y + '%" data-action="move" data-value="' + key +
        '" aria-label="' + p.name + ' 탐색" ' + (state.battle ? 'disabled' : '') + '><i></i>' + p.name + '</button>';
    }).join("");
    return '<div class="landscape ' + (fight ? 'encounter' : '') + (oldPlace ? ' arriving' : '') +
      '"><div class="map-label">현재 위치 · ' + pos.name + '</div>' + pins +
      '<span class="here" aria-label="현재 위치 '+pos.name+'" style="left:' + pos.x + '%;top:' + pos.y +
      '%;--dx:' + (old.x-pos.x) + 'cqw;--dy:' + (old.y-pos.y) + 'cqh">' + portrait(G.partner(state).kind) + '</span>' + scene + '</div>';
  }
  function health(hp, max) {
    return '<div class="health"><meter min="0" max="' + max + '" value="' + hp + '" aria-label="체력"></meter><small>' + hp + ' / ' + max + '</small></div>';
  }
  function fighter(kind, level, hp, max, label) {
    return '<div class="fighter">' + portrait(kind) + '<div><small>' + label + ' · Lv.' + level + '</small><b>' +
      G.species[kind].name + '</b>' + health(hp, max) + '</div></div>';
  }
  function field(oldPlace) {
    const ally = G.partner(state), b = state.battle;
    let controls;
    if (b) {
      controls = '<div class="match">' + fighter(ally.kind, ally.level, b.partnerHp, G.maxHp(ally), "내 동료") +
        fighter(b.kind, b.level, b.hp, b.maxHp, G.owned(state,b.kind) ? "야생" : "미포획") + '</div><div class="actions">' +
        button("attack", G.species[ally.kind].move) + button("catch", "포획 " + G.captureChance(b) + "%", "", "primary") + button("leave", "물러나기") + '</div>';
    } else {
      const caught = state.team.find(m => m.id === state.caught);
      controls = '<div class="companion">' + portrait(caught?.kind || ally.kind) + '<div><small>' + (caught ? '방금 포획한 동료' : '탐험 동료') +
        '</small><h2>' + G.species[caught?.kind || ally.kind].name + '</h2><span>Lv.' + (caught || ally).level + '</span></div>' +
        (caught ? button("switch", "동료로 데려가기", caught.id, "primary") : '') + '</div><p class="hint">찾고 싶은 생물의 서식지를 누르세요.</p><div class="routes">' +
        G.habitats.map(key => button("move", G.places[key].name + '<small>' + G.species[G.places[key].kind].name + '</small>', key)).join("") + '</div>';
    }
    return '<div class="section-head"><h1>이끼숲 초입</h1>' +
      button("auto", automatic ? "자동 탐험 중단" : "자동 탐험", "", automatic ? "auto on" : "auto") + '</div>' +
      map(oldPlace) + '<div class="field-card">' + controls + '</div>';
  }
  function journal() {
    const team = tab === "team";
    const keys = team ? state.team : Object.keys(G.species).map(kind => ({kind}));
    const count = team ? state.team.length + "마리" : new Set(state.team.map(m => m.kind)).size + " / 4종";
    return '<div class="section-head"><h1>' + (team ? "내 동료" : "생물 도감") + '</h1><b>' + count + '</b></div><div class="journal">' +
      keys.map(m => {
        const sp = G.species[m.kind], seen = state.seen.includes(m.kind);
        const habitat = Object.values(G.places).find(p => p.kind === m.kind)?.name || "야영지";
        const info = team ? '개체 #' + m.id + ' · Lv.' + m.level + ' · 경험치 ' + m.xp + ' / ' + G.needed(m.level) :
          habitat + ' · ' + (G.owned(state,m.kind) ? '포획 기록' : seen ? '발견 기록' : '미발견');
        return '<article class="record ' + (seen ? '' : 'unknown') + '">' + portrait(m.kind) + '<div><small>' + info + '</small><h2>' +
          (seen ? sp.name : '미지의 생물') + '</h2><span>' + (seen ? sp.move : '이 서식지를 탐색해 보세요') + '</span></div>' +
          (team ? m.id === state.active ? '<b class="tag">동행 중</b>' : state.battle ? '' : button("switch","동행",m.id) : '') + '</article>';
      }).join("") + '</div>';
  }
  function render(oldPlace) {
    panel.innerHTML = tab === "field" ? field(oldPlace) : journal();
    notice.textContent = state.note;
    for (const el of document.querySelectorAll("[data-tab]")) el.setAttribute("aria-pressed", el.dataset.tab === tab);
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.id === "retry") { location.reload(); return; }
    if (!state) return;
    if (el.dataset.tab) {
      stop(); tab = el.dataset.tab; render(); return;
    }
    if (busy) return;
    const { action, value } = el.dataset;
    if (action === "auto") {
      if (automatic) stop();
      else if (state.battle && !G.owned(state,state.battle.kind)) {
        notice.textContent = "미포획 생물을 만났어요. 포획하거나 전투를 마친 뒤 자동 탐험을 켜세요.";
        return;
      } else {
        automatic = true;
        if (!state.battle && state.place === "camp") { update("move", G.habitats[0]); return; }
      }
      render(); schedule();
    } else if (action) {
      stop(); update(action, action === "switch" ? Number(value) : value);
    }
  });
  channel?.addEventListener("message", () => update());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { stop(); if (state) render(); }
    else update();
  });
  try {
    const open = indexedDB.open("moss-companions.expedition.v1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("journey");
    open.onerror = open.onblocked = failed;
    open.onsuccess = () => {
      db = open.result;
      db.onversionchange = () => { db.close(); failed(); };
      update();
    };
  } catch { failed(); }
})();
