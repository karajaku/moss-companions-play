"use strict";
(() => {
  const G = MossGame;
  const panel = document.querySelector("#panel"), notice = document.querySelector("#notice");
  let db, state, tab = "field", busy = false, automatic = false, timer;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("moss-companions.expedition.v1") : null;
  const detail = document.querySelector("#detail");
  for (const slot of document.querySelectorAll("[data-icon]")) slot.innerHTML = icon(slot.dataset.icon);
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
    if (detail.open) detail.close();
    document.querySelector("#collection").replaceChildren();
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
  function habitatMap() {
    return G.habitats.map(key => {
      const p = G.places[key];
      return '<button class="pin" style="left:' + p.x + '%;top:' + p.y + '%" data-action="move" data-value="' + key +
        '" aria-label="' + p.name + ' 탐색 · ' + G.species[p.kind].name + '">' + portrait(p.kind) + '<b>' + p.name +
        '</b><small>' + G.species[p.kind].name + '</small></button>';
    }).join("");
  }
  function fighter(kind, level, hp, max, label) {
    return '<div class="fighter"><small>' + label + ' · Lv.' + level + '</small><strong>' + G.species[kind].name +
      '</strong><meter min="0" max="' + max + '" value="' + hp + '" aria-label="' + label + ' 체력"></meter><span>' +
      hp + ' / ' + max + '</span></div>';
  }
  function field(oldPlace) {
    const ally = G.partner(state), b = state.battle;
    const caught = state.team.find(m => m.id === state.caught);
    const auto = button("auto", icon("refresh-cw") + (automatic ? "자동 중단" : "자동 탐험"), "", b || caught ? "side" : "primary");
    const heading = '<div class="section-head"><div><small>' + (b ? "야생 조우" : "이끼숲 탐험") + '</small><h1>' +
      G.places[state.place].name + '</h1></div>' + (b ? auto : "") + '</div>';
    if (b) {
      const actors = '<div class="encounter-pair' + (oldPlace ? ' arriving' : '') + '" aria-hidden="true">' +
        portrait(ally.kind) + portrait(b.kind) + '</div>';
      const stats = '<div class="match">' + fighter(ally.kind, ally.level, b.partnerHp, G.maxHp(ally), "내 동료") +
        fighter(b.kind, b.level, b.hp, b.maxHp, G.owned(state, b.kind) ? "야생" : "미포획") + '</div>';
      return heading + actors + stats + '<div class="actions">' +
        button("attack", icon("swords") + G.species[ally.kind].move, "", "side") +
        button("catch", icon("target") + '포획<small>' + G.captureChance(b) + '%</small>', "", "primary") +
        button("leave", icon("arrow-left") + "물러나기", "", "side") + '</div>';
    }
    const member = caught || ally;
    const scene = '<div class="landscape"><div class="pins">' + habitatMap() + '</div><div class="companion">' +
      portrait(member.kind) + '<small>' + (caught ? '방금 포획' : '탐험 동료') + ' · Lv.' + member.level +
      '</small><strong>' + G.species[member.kind].name + '</strong></div></div>';
    return heading + scene + '<div class="actions">' + auto + (caught ?
      button("switch", icon("heart") + "동행하기", caught.id, "primary") : "") + '</div>';
  }
  function habitatName(kind) {
    return Object.values(G.places).find(place => place.kind === kind)?.name || "야영지";
  }
  function discovery(kind) {
    if (G.owned(state, kind)) return "포획";
    return state.seen.includes(kind) ? "발견" : "미발견";
  }
  function journal() {
    const team = tab === "team";
    const members = team ? state.team : Object.keys(G.species).map(kind => ({kind}));
    return '<div class="section-head"><h1>' + (team ? "내 동료" : "생물 도감") + '</h1></div><div class="journal">' +
      members.map(m => {
        const known = state.seen.includes(m.kind);
        const status = team ? 'Lv.' + m.level + (m.id === state.active ? ' · 동행 중' : '') : discovery(m.kind);
        const name = known ? G.species[m.kind].name : "미지의 생물";
        return '<button class="record' + (known ? '' : ' unknown') + '" data-entry="' + (team ? m.id : m.kind) +
          '"><small>' + status + '</small>' + portrait(m.kind) + '<strong>' + name + '</strong><span>' +
          (team ? '#' + m.id : habitatName(m.kind)) + '</span></button>';
      }).join("") + '</div>';
  }
  function renderDetail(key) {
    const team = tab === "team", m = team ? state.team.find(member => String(member.id) === key) : {kind: key};
    if (!m || !G.species[m.kind]) return;
    const known = state.seen.includes(m.kind), sp = G.species[m.kind];
    let stats, action = "";
    if (team) {
      stats = '개체 #' + m.id + ' · Lv.' + m.level + '<br>경험치 ' + m.xp + ' / ' + G.needed(m.level);
      if (state.active === m.id) action = '<p>동행 중</p>';
      else if (!state.battle) action = button("switch", "동행하기", m.id, "select-member");
      else action = '<p>전투를 마치면 동행할 수 있어요.</p>';
    } else {
      stats = habitatName(m.kind) + ' · ' + discovery(m.kind);
    }
    document.querySelector("#entry").innerHTML = '<div class="specimen' + (known ? '' : ' unknown') + '">' + portrait(m.kind) +
      '</div><h2 id="detail-name">' + (known ? sp.name : "미지의 생물") + '</h2><p>' + stats + '</p><p>' +
      (known ? sp.move : "이 서식지를 탐색해 보세요.") + '</p>' + action;
    detail.dataset.key = key;
    if (!detail.open) detail.showModal();
  }
  function render(oldPlace) {
    const focused = panel.contains(document.activeElement) ? document.activeElement.dataset : null;
    document.body.dataset.tab = tab;
    document.body.dataset.place = state.place;
    panel.innerHTML = tab === "field" ? field(oldPlace) : journal();
    const speciesCount = new Set(state.team.map(member => member.kind)).size;
    document.querySelector("#collection").innerHTML = '<span aria-label="동료 ' + state.team.length + '마리">' + icon("heart") +
      ' ' + state.team.length + '</span><span aria-label="포획한 종 ' + speciesCount + '종">' + icon("book-open") + ' ' +
      speciesCount + '/' + Object.keys(G.species).length + '</span>';
    notice.textContent = tab === "field" && state.revision > 0 ? state.note : "";
    for (const el of document.querySelectorAll("[data-tab]")) el.setAttribute("aria-pressed", el.dataset.tab === tab);
    if (detail.open) renderDetail(detail.dataset.key);
    else if (focused) {
      const controls = Array.from(panel.querySelectorAll("button"));
      const replacement = controls.find(el => focused.entry ? el.dataset.entry === focused.entry :
        el.dataset.action === focused.action && el.dataset.value === focused.value);
      (replacement || panel.querySelector(".actions .primary"))?.focus({ preventScroll: true });
    }
  }
  document.addEventListener("click", e => {
    const el = e.target.closest("button");
    if (!el) return;
    if (el.id === "retry") { location.reload(); return; }
    if (!state) return;
    if (el.dataset.entry) {
      renderDetail(el.dataset.entry);
      return;
    }
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
      if (detail.open) detail.close();
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
