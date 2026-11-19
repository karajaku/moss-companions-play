"use strict";
const MossGame = (() => {
  const trail = typeof module !== "undefined" ? require("./hunt-trail.js") : HuntTrail;
  const species = {
    tree: { move: "뿌리 감기", power: 5, vitality: 22 },
    moth: { move: "달가루 흩날리기", power: 4, vitality: 18 },
    boar: { move: "이끼 돌진", power: 6, vitality: 21 },
    wolf: { move: "잿불 송곳니", power: 7, vitality: 19 },
  };
  for (const key of Object.keys(species)) species[key].name = trail.enemy(1, key).name;
  const places = {
    camp: { name: "야영지", x: 17, y: 70 },
    grass: { name: "달빛 풀숲", kind: "moth", x: 26, y: 34 },
    path: { name: "발자국 흙길", kind: "boar", x: 53, y: 63 },
    ruins: { name: "바람 유적", kind: "wolf", x: 79, y: 27 },
  };
  const habitats = Object.keys(places).filter(key => places[key].kind);
  function fresh() {
    return { version: 1, revision: 0, place: "camp", active: 1,
      team: [{ id: 1, kind: "tree", level: 1, xp: 0 }], seen: ["tree"],
      battle: null, caught: null, note: "지도에서 발자국을 따라가 보세요." };
  }
  const partner = s => s.team.find(member => member.id === s.active);
  const needed = level => 4 + 2 * level;
  const maxHp = member => species[member.kind].vitality + 2 * member.level;
  const owned = (s, kind) => s.team.some(member => member.kind === kind);
  const captureChance = b => b.hp <= b.maxHp / 2 ? 100 : Math.round(20 + 100 * (1 - b.hp / b.maxHp));
  function gain(member, xp) {
    member.xp += xp;
    if (member.xp < needed(member.level)) return "";
    member.xp -= needed(member.level);
    member.level++;
    return " · 동료 Lv." + member.level + " 달성!";
  }
  function react(s) {
    const b = s.battle;
    const hit = species[b.kind].power - 1 + b.level;
    b.partnerHp = Math.max(0, b.partnerHp - hit);
    if (b.partnerHp) {
      s.note += " · 상대의 " + species[b.kind].move + " (−" + hit + " HP)";
    } else {
      s.place = "camp";
      s.battle = null;
      s.note = "동료가 지쳐 야영지로 돌아왔어요. 휴식을 마치고 다시 출발할 수 있어요.";
    }
  }
  // The caller commits the altered copy and its revision together.
  function perform(s, action, value, random = Math.random) {
    const ally = partner(s), b = s.battle;
    if (action === "move" && !b && habitats.includes(value)) {
      const roll = random(), index = habitats.indexOf(value);
      const habitat = habitats[(index + (roll < .75 ? 0 : roll < .9 ? 1 : 2)) % habitats.length];
      const kind = places[habitat].kind, level = Math.min(5, ally.level);
      const hp = maxHp({ kind, level });
      s.place = value;
      s.battle = { kind, level, hp, maxHp: hp, partnerHp: maxHp(ally) };
      if (!s.seen.includes(kind)) s.seen.push(kind);
      s.caught = null;
      s.note = species[kind].name + " 발견! 체력을 절반까지 낮추면 확실히 포획할 수 있어요.";
    } else if (action === "attack" && b) {
      const hit = species[ally.kind].power + ally.level * 2;
      b.hp = Math.max(0, b.hp - hit);
      s.note = species[ally.kind].move + " · " + hit + " 피해";
      if (b.hp) react(s);
      else {
        s.battle = null;
        s.note = species[b.kind].name + "에게 승리! 경험치 +4" + gain(ally, 4);
      }
    } else if (action === "catch" && b) {
      if (random() * 100 < captureChance(b)) {
        const id = s.team[s.team.length - 1].id + 1;
        s.team.push({ id, kind: b.kind, level: b.level, xp: 0 });
        s.caught = id;
        s.battle = null;
        s.note = species[b.kind].name + " 포획! 경험치 +2" + gain(ally, 2);
      } else {
        s.note = "포획을 벗어났어요";
        react(s);
      }
    } else if (action === "switch" && !b && s.team.some(member => member.id === value) && s.active !== value) {
      s.active = value;
      s.caught = null;
      s.note = species[partner(s).kind].name + "와 함께 출발합니다.";
    } else if (action === "leave" && b) {
      s.battle = null;
      s.note = "야생 생물과 거리를 벌렸어요. 다음 탐험지를 골라 주세요.";
    } else return false;
    s.revision++;
    return true;
  }
  return { species, places, habitats, fresh, partner, needed, maxHp, owned, captureChance, perform };
})();
if (typeof module !== "undefined") module.exports = MossGame;
