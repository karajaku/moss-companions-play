const el = (id) => document.getElementById(id);
const icon = (n) => {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
  (ICONS[n] || "") +
  "</svg>";
};
const fmt = (n) => Math.floor(n).toLocaleString("ko-KR");
const brief = (n) =>
  n >= 1e12 ? (n / 1e12).toFixed(1) + "조" : n >= 1e8 ? (n / 1e8).toFixed(1) + "억" : fmt(n);
const pct = (n) => Number(n.toFixed(2)) + "%";
const btn = (action, label, arg = "", cls = "action", disabled = false) =>
  '<button class="' +
  cls +
  '" data-act="' +
  action +
  '" data-arg="' +
  arg +
  '" ' +
  (disabled ? "disabled" : "") +
  ">" +
  label +
  "</button>";
const openBtn = (id, label, cls = "action") =>
  '<button class="' + cls + '" data-open="' + id + '">' + label + "</button>";
const go = (id, label, cls = "mini") =>
  '<button class="' + cls + '" data-go="' + id + '">' + label + "</button>";
const card = (title, content, artwork = "") =>
  '<section class="card' + (artwork ? ' illustrated-card card-' + artwork : '') + '"><h3>' +
  (artwork ? icon(artwork) : "") + title + "</h3>" + content + "</section>";
const desc = (text) => '<p class="desc">' + text + "</p>";
function companionPortrait(kind) {
  const sprite = Game.trail.enemy(1, kind).sprite;
  return '<span class="companion-art art-' + sprite + '" aria-hidden="true"></span>';
}
