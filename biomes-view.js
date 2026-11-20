(() => {
  "use strict";
  const { regions, families } = BiomeCatalog;
  const get = id => document.getElementById(id);
  const picker = get("region-picker");
  const list = get("family-list");
  const dialog = get("family-detail");
  const phases = ["기본형", "중간형", "최종형"];

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function portrait(form) {
    const image = element("img");
    image.src = form.image;
    image.alt = "";
    image.decoding = "async";
    return image;
  }

  function showFamily(family, region, opener) {
    let actionId = "idle";
    let currentForm;
    get("detail-region").textContent = region.name;
    get("detail-name").textContent = family.forms[0].name + " 계보";
    get("habitat").textContent = "발견 장소 · " + family.habitat;
    get("trait").textContent = family.trait;
    const evolution = get("evolution");
    const buttons = family.forms.map((form, index) => {
      const button = element("button");
      button.type = "button";
      button.append(element("small", phases[index]), portrait(form), element("strong", form.name));
      button.addEventListener("click", () => selectPhase(index));
      return button;
    });

    function selectPhase(index) {
      const form = family.forms[index];
      const previousForm = currentForm;
      currentForm = form;
      buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
      const behavior = get("behavior");
      behavior.hidden = !form.actions?.length;
      dialog.classList.toggle("has-actions", !behavior.hidden);
      if (!behavior.hidden) {
        behavior.style.setProperty("--preview-scene", 'url("' + region.image + '")');
        get("form-story").textContent = form.story;
        const actions = get("actions");
        const scene = behavior.querySelector(".behavior-scene");
        function clearTransition() {
          scene.querySelector(".previous-form")?.remove();
          scene.classList.remove("is-changing");
        }
        function selectAction(action) {
          clearTransition();
          actionId = action.id;
          for (const button of actions.children) {
            button.setAttribute("aria-pressed", String(button.value === actionId));
          }
          const pose = get("pose-window");
          pose.dataset.action = action.id;
          pose.setAttribute("aria-label", form.name + " · " + action.name);
          const strip = element("img");
          strip.src = action.image;
          strip.alt = "";
          strip.style.width = (action.frames * 100) + "%";
          pose.replaceChildren(strip);
          const moveName = get("move-name");
          moveName.hidden = action.id !== "battle";
          moveName.textContent = moveName.hidden ? "" : form.skills[form.skills.length - 1].name;
        }
        actions.replaceChildren(...form.actions.map(action => {
          const button = element("button", action.name);
          button.type = "button";
          button.value = action.id;
          button.addEventListener("click", () => selectAction(action));
          return button;
        }));
        selectAction(form.actions.find(action => action.id === actionId) || form.actions[0]);
        if (previousForm && previousForm !== form && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const before = portrait(previousForm);
          before.className = "previous-form";
          before.addEventListener("animationend", clearTransition, { once: true });
          scene.append(before);
          scene.classList.add("is-changing");
        }
      } else {
        get("pose-window").replaceChildren();
      }
      get("skill-heading").textContent = form.name + "의 스킬";
      const rows = form.skills.map(skill => {
        const row = element("div");
        row.append(element("dt", skill.name), element("dd", skill.effect));
        return row;
      });
      get("skills").replaceChildren(...rows);
    }

    evolution.replaceChildren(...buttons);
    selectPhase(0);
    opener.focus({ preventScroll: true });
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  function showRegion(region) {
    picker.value = region.id;
    get("region-image").src = region.image;
    get("region-name").textContent = region.name;
    get("region-description").textContent = region.description;
    const nativeFamilies = families.filter(family => family.region === region.id);
    get("family-count").textContent = nativeFamilies.length + "계보";
    const cards = nativeFamilies.map(family => {
      const form = family.forms[0];
      const card = element("button");
      card.type = "button";
      card.dataset.family = family.id;
      card.setAttribute("aria-haspopup", "dialog");
      card.setAttribute("aria-label", form.name + " 진화 계보");
      card.append(portrait(form), element("strong", form.name));
      card.addEventListener("click", () => showFamily(family, region, card));
      return card;
    });
    list.replaceChildren(...cards);
  }

  regions.forEach(region => picker.add(new Option(region.name, region.id)));
  picker.addEventListener("change", () => showRegion(regions.find(region => region.id === picker.value)));
  function openLinkedFamily() {
    const family = families.find(item => item.id === location.hash.slice(1));
    if (!family) return;
    if (dialog.open) dialog.close();
    showRegion(regions.find(region => region.id === family.region));
    list.querySelector('[data-family="' + family.id + '"]').click();
  }
  dialog.addEventListener("close", () => {
    if (!dialog.open && families.some(item => item.id === location.hash.slice(1))) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  });
  window.addEventListener("hashchange", openLinkedFamily);
  showRegion(regions[0]);
  openLinkedFamily();
})();
