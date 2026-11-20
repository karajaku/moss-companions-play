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
      buttons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
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
  showRegion(regions[0]);
})();
