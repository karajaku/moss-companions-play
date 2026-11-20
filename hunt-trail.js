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
  const companions = {
    tree: [32, 195], moth: [39, 150], wolf: [43, 140], boar: [35, 180], dew: [36, 172],
    golem: [34, 210], tusk: [40, 195], alpha: [47, 155], wyrm: [45, 175], elder: [36, 225],
  };
  const starters = ["tree", "moth", "wolf", "dew"];
  const dewForms = [
    { name: "이슬귀토끼", sprite: "dew1" },
    { name: "양치깃뜀토", sprite: "dew2" },
    { name: "고사리관 토끼", sprite: "dew3" },
  ];
  const levelCap = 60, xpPerLevel = 4, xpCap = (levelCap - 1) * xpPerLevel;
  const partnerLevel = xp => 1 + Math.min(levelCap - 1, Math.floor(xp / xpPerLevel));
  function dewStageAt(level) {
    if (level >= 30) return 3;
    return level >= 12 ? 2 : 1;
  }
  function availablePartners(team) {
    if (!team.started) return starters;
    const owned = Object.keys(team.xp);
    return owned.includes("dew") ? owned : [...owned, "dew"];
  }
  function partnerChoice(s, kind) {
    const team = s.companions;
    if (s.fieldcraft.trips[kind]) return { reason: "파견 중인 동료를 먼저 복귀시켜 주세요." };
    if (Object.hasOwn(team.xp, kind) || kind === "dew") return {};
    if (team.started || !starters.includes(kind)) return { reason: "아직 만난 동료가 아닙니다." };
    // The free rabbit is independent of the original interchangeable starter.
    const replace = Object.keys(team.xp).find(owned => owned !== "dew");
    if (s.fieldcraft.trips[replace]) return { reason: "시작 동료를 바꾸기 전에 파견에서 복귀시켜 주세요." };
    return { replace };
  }
  function appearance(kind, stage = 1) {
    const { name, sprite } = kind === "dew" ? dewForms[stage - 1] : enemies[kind];
    return { name, sprite };
  }
  function setPartnerXp(team, kind, xp) {
    if (kind === "dew") {
      const highestLevel = partnerLevel(Math.max(team.xp.dew ?? 0, xp));
      team.dewStage = Math.max(team.dewStage ?? 1, dewStageAt(highestLevel));
    }
    team.xp[kind] = xp;
  }
  function freshTeam(rank = 1) {
    return { active: starters[0], started: false, xp: { tree: xpPerLevel * (Math.min(levelCap, Math.max(1, rank)) - 1) } };
  }
  function partner(s, kind = s.companions.active) {
    const xp = s.companions.xp[kind] ?? 0;
    const level = partnerLevel(xp);
    const [power, vitality] = companions[kind];
    const attack = Math.round(power * (1 + .36 * (level - 1) ** 1.65));
    const hp = Math.round((vitality + 38 * (level - 1)) * (1 + .04 * s.huntLining));
    const stage = kind === "dew" ? Math.max(s.companions.dewStage ?? 1, dewStageAt(level)) : 1;
    return { kind, ...appearance(kind, stage), stage, level, attack, hp };
  }
  function defeat(s, h) {
    const team = s.companions;
    setPartnerXp(team, h.partner.kind, Math.min(xpCap, team.xp[h.partner.kind] + 2));
  }
  return { region, lineup, enemy, opponent, enter, awaitingNext, companions, starters, availablePartners, partnerChoice,
    appearance, freshTeam, levelCap, xpPerLevel, xpCap, partnerLevel, dewStageAt, setPartnerXp, partner, defeat };
})();
if (typeof module !== "undefined") module.exports = HuntTrail;
