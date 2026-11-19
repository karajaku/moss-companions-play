function healthMeter(side, name, hp, max) {
  const scale = "scaleX(" + hp / max + ")";
  return '<div class="hp-meter" data-side="' + side + '" role="meter" aria-label="' + name +
    ' HP" aria-valuemin="0" aria-valuemax="' + max + '" aria-valuenow="' + hp + '">' +
    '<div class="hp-name">' + icon(side === "player" ? "shield" : "sword") + name +
    '<b class="hp-loss" aria-hidden="true"></b></div>' +
    '<div class="hp-track"><i class="hp-trail" style="transform:' + scale + '"></i>' +
    '<i class="hp-fill" style="transform:' + scale + '"></i></div>' +
    '<div class="hp-count"><small>HP</small> <strong>' + fmt(hp) + '</strong> / ' + fmt(max) + '</div></div>';
}

function updateHealthMeter(meter, hp, before, motion) {
  const max = Number(meter.getAttribute("aria-valuemax"));
  meter.setAttribute("aria-valuenow", hp);
  meter.querySelector(".hp-count strong").textContent = fmt(hp);
  const fill = meter.querySelector(".hp-fill"), trail = meter.querySelector(".hp-trail");
  const end = "scaleX(" + hp / max + ")";
  fill.style.transform = trail.style.transform = end;
  const lost = before - hp;
  if (lost <= 0) return;
  const badge = meter.querySelector(".hp-loss");
  badge.textContent = "−" + fmt(lost);
  if (!motion) return;
  const start = "scaleX(" + before / max + ")";
  for (const node of [fill, trail, badge]) for (const animation of node.getAnimations()) animation.cancel();
  fill.animate([{ transform: start }, { transform: end }], { duration: 140, easing: "ease-out" });
  trail.animate([{ transform: start, offset: 0 }, { transform: start, offset: 0.35 }, { transform: end }],
    { duration: 640, easing: "ease-out" });
  badge.animate([{ opacity: 1 }, { opacity: 1, offset: 0.72 }, { opacity: 0 }],
    { duration: 960, fill: "forwards" });
}
