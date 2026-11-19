"use strict";
const HuntTrail = (() => {
  const enemies = {
    boar:     { name: "이끼등 멧돼지", sprite: "boar", skill: "charge", first: 2, interval: 3, power: 3 },
    wolf:     { name: "불갈기 늑대", sprite: "wolf", skill: "fang", first: 2, interval: 2, power: 2 },
    moth:     { name: "달가루 나방", sprite: "moth", skill: "dust", first: 1, interval: 3, power: 2 },
    golem:    { name: "결정 골렘", sprite: "golem", skill: "crush", first: 3, interval: 4, power: 3 },
    tree:     { name: "뿌리 파수꾼", sprite: "tree", skill: "bind", first: 2, interval: 3, power: 2 },
    tusk:     { name: "황금엄니 우두머리", sprite: "boar", skill: "charge", first: 2, interval: 4, power: 4 },
    alpha:    { name: "잿불 무리어미", sprite: "wolf", skill: "fang", first: 1, interval: 2, power: 3 },
    wyrm:     { name: "안개 비늘용", sprite: "dragon", skill: "breath", first: 2, interval: 3, power: 3 },
    elder:    { name: "천년 고목왕", sprite: "tree", skill: "bind", first: 1, interval: 3, power: 3 },
    goblin:   { name: "황금 고블린", sprite: "goblin", skill: "escape", first: 2, interval: 2, power: 2 },
  };
  const regions = [
    { id: "moss", name: "이끼숲 초입", pack: ["boar", "moth", "wolf"], boss: "tusk" },
    { id: "maple", name: "붉은 낙엽길", pack: ["wolf", "boar", "tree"], boss: "alpha" },
    { id: "gorge", name: "안개 바위골", pack: ["golem", "moth", "wolf"], boss: "wyrm" },
    { id: "heart", name: "고목의 심장", pack: ["tree", "golem", "moth"], boss: "elder" },
  ];
  const region = rank => regions[Math.floor((rank - 1) / 5) % regions.length];
  function lineup(rank, bonus = false) {
    const area = region(rank), index = ((rank - 1) % 5 + Math.floor((rank - 1) / 20)) % area.pack.length;
    const pack = [area.pack[index], area.pack[(index + 1) % area.pack.length]];
    if (bonus) pack.splice(1, 0, "goblin");
    if (rank % 5 === 0) pack.push(area.boss);
    return pack;
  }
  function enemy(rank, kind) {
    const area = region(rank);
    return { ...enemies[kind], kind, habitat: area.name, elite: kind === area.boss };
  }
  function opponent(rank, kind) {
    const base = 90 + Math.round(36 * (rank - 1) ** 1.65);
    const bossStage = rank % 5 === 0;
    const share = kind === "goblin" ? .14 : bossStage && kind !== region(rank).boss ? .25 : .5;
    return { hp: Math.max(1, Math.round(base * share)), attack: kind === "goblin" ? 0 : 20 + 9 * rank };
  }
  function enter(h, wave) {
    h.wave = wave;
    h.waveTurn = 1;
    h.enemyKind = lineup(h.rank, h.bonusEncounter)[wave];
    const def = enemies[h.enemyKind], stats = opponent(h.rank, h.enemyKind);
    h.enemyMax = h.enemyHp = stats.hp;
    h.enemyAttack = stats.attack;
    h.enemySkillState = { key: def.skill, cooldown: def.first, interval: def.interval, power: def.power };
    h.last = def.name + " 출현";
    delete h.lastDice;
  }
  function awaitingNext(h) {
    return h?.trailVersion === 1 && (h.enemyHp === 0 || h.lastDice?.enemySkill === "escape");
  }
  // Species share their name and artwork with their wild encounter.
  const companions = {
    tree: [32, 195], moth: [39, 150], wolf: [43, 140], boar: [35, 180],
    golem: [34, 210], tusk: [40, 195], alpha: [47, 155], wyrm: [45, 175], elder: [36, 225],
  };
  const starters = ["tree", "moth", "wolf"];
  const partnerLevel = xp => 1 + Math.min(59, Math.floor(xp / 4));
  function freshTeam(rank = 1) {
    return { active: starters[0], started: false, xp: { tree: 4 * (Math.min(60, Math.max(1, rank)) - 1) } };
  }
  function partner(s, kind = s.companions.active) {
    const xp = s.companions.xp[kind];
    const level = partnerLevel(xp);
    const [power, vitality] = companions[kind];
    const attack = Math.round(power * (1 + .36 * (level - 1) ** 1.65));
    const hp = Math.round((vitality + 38 * (level - 1)) * (1 + .04 * s.huntLining));
    return { kind, name: enemies[kind].name, sprite: enemies[kind].sprite, level, attack, hp };
  }
  function defeat(s, h) {
    const team = s.companions;
    team.xp[h.partner.kind] = Math.min(236, team.xp[h.partner.kind] + 2);
  }
  return { region, lineup, enemy, opponent, enter, awaitingNext, companions, starters, freshTeam, partnerLevel, partner, defeat };
})();
if (typeof module !== "undefined") module.exports = HuntTrail;
