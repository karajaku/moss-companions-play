"use strict";
const Game = (() => {
  const dice = typeof module !== "undefined" ? require("./dice-combat.js") : DiceCombat;
  const trail = typeof module !== "undefined" ? require("./hunt-trail.js") : HuntTrail;
  const fieldcraft = typeof module !== "undefined" ? require("./fieldcraft.js") : Fieldcraft;
  const day = (t) => new Date(t + 32400000).toISOString().slice(0, 10);
  const hunting = { initial: 30, cap: 30, interval: 600000, daily: 10 };
  function freshHunting(t) {
    return { version: 1, id: globalThis.crypto.randomUUID(), free: hunting.initial, purchased: 0,
      rechargeAt: null, observedAt: t, daily: "", serial: 0, lastStart: null };
  }
  // Local trial only: device time and restored snapshots are not server authority.
  function settleHunting(s, t = Date.now()) {
    if (!s.hunting) {
      s.hunting = freshHunting(t);
      s.hunting.daily = s.day || "";
    }
    const w = s.hunting;
    t = Math.max(t, w.observedAt);
    w.observedAt = t;
    if (w.free >= hunting.cap) w.rechargeAt = null;
    else {
      w.rechargeAt ??= t;
      const count = Math.floor(Math.max(0, t - w.rechargeAt) / hunting.interval);
      w.free = Math.min(hunting.cap, w.free + count);
      w.rechargeAt = w.free >= hunting.cap ? null : w.rechargeAt + count * hunting.interval;
    }
    if (s.hunt && !s.hunt.id) {
      s.hunt.id = "legacy-" + w.id;
      s.hunt.ticketSource = null; // Never charge a battle that predates migration.
    }
    return w;
  }
  function huntingStatus(s, t = Date.now()) {
    const copy = { hunting: { ...s.hunting }, hunt: null };
    const w = settleHunting(copy, t);
    return { ...w, remaining: w.rechargeAt === null ? null :
      Math.max(0, w.rechargeAt + hunting.interval - w.observedAt) };
  }
  const liningCosts = Object.freeze([3, 12, 30, 75, 180]);
  const forestYield = rank => rank >= 16 ? 3 : rank >= 6 ? 2 : 1;
  function huntHealth({ number, hp, maxHp, enemyHp, enemyMax }) {
    return { number, hp, maxHp, enemyHp, enemyMax };
  }
  const huntEnemy = h => trail.enemy(h.rank,h.enemyKind);
  const blessings = ["정령의 가호","숲의 가호","별의 가호"];
  function fresh(t = Date.now()) {
    return {version:2,created:t,hunting:freshHunting(t),companions:trail.freshTeam(),fieldcraft:fieldcraft.fresh(),
      hunt:null,lastHunt:null,huntBest:0,huntLining:0,forestFiber:0,chests:[],lastChest:null,chestSerial:0,
      gold:0,shards:0,scrolls:0,charms:[0,0,0]};
  }
  function awardChest(s, source, rank, base, counter, int) {
    const roll = int(1, 100);
    const tier = roll <= 70 ? 0 : roll <= 95 ? 1 : 2;
    const percent = tier === 0 ? int(0, 10) : tier === 1 ? int(12, 25) : int(30, 50);
    const extra = Math.round((base + counter) * percent / 100);
    const shards = Number(rank % 3 === 0) + (tier === 2 ? int(2, 4) : tier);
    const charms = [0, 0, 0];
    if (tier === 2) charms[int(0, 2)]++;
    s.chestSerial = (s.chestSerial || 0) + 1;
    const chest = { id: s.created + "-" + s.chestSerial, source, rank, tier, base, counter, extra,
      gold: base + counter + extra, shards, charms, scrolls: 0 };
    (s.chests ||= []).push(chest);
    return chest;
  }
  function perform(s,act,arg,t=Date.now(),random=Math.random) {
    settleHunting(s,t);
    const fail = message => ({ok:false,message});
    const success = (message,kind="info") => ({ok:true,message,kind});
    const int = (a,b) => a+Math.floor(random()*(b-a+1));
    switch(act) {
      case "daily":
        if (s.hunting.daily===day(t)) return fail("오늘의 사냥권을 이미 받았습니다.");
        s.hunting.daily=day(t);
        s.hunting.free+=hunting.daily;
        if (s.hunting.free>=hunting.cap) s.hunting.rechargeAt=null;
        return success("출석 · 무료 사냥권 +10");
      case "gatherMaterial": case "craftNet": case "dispatchGatherer": case "recallGatherer":
      case "setAutoNet": case "resolveCapture":
        return fieldcraft.perform(s, act, arg, random);
      case "craftHuntLining": {
        if (!s._save || arg?.generation !== s._save.generation || arg.revision !== s._save.revision ||
            arg.expectedLevel !== s.huntLining) return fail("제작 상태가 바뀌었습니다. 현재 단계를 확인하세요.");
        const cost = liningCosts[s.huntLining];
        if (!cost || s.forestFiber < cost) return fail(cost ? "숲결 섬유가 부족합니다." : "안감이 완성되었습니다.");
        s.forestFiber -= cost;
        s.huntLining++;
        return success("숲 방호 안감 " + s.huntLining + "단계 완성", "win");
      }
      case "openChest": {
        const index = (s.chests || []).findIndex((c) => c.id === arg);
        if (index < 0) return fail("이미 열었거나 보관함에 없는 상자입니다.");
        const c = s.chests[index];
        if (s.lastHunt?.capturePending && s.lastHunt.chestId === c.id) return fail("먼저 포획하거나 보내 주세요.");
        if (c.materialRule === 1) {
          const balance = s.forestFiber + c.fiber;
          if (!Number.isSafeInteger(balance)) return fail("섬유 보관 한도에 도달했습니다. 보물은 보관함에 남습니다.");
          s.forestFiber = balance;
        }
        s.chests.splice(index, 1);
        s.gold += c.gold;
        s.shards += c.shards;
        s.scrolls += c.scrolls;
        c.charms.forEach((amount, i) => { s.charms[i] += amount; });
        s.lastChest = c;
        return success("보물상자 개봉 · " + c.gold.toLocaleString() + " G", "win");
      }
      case "choosePartner": {
        const team = s.companions;
        if (s.fieldcraft.trips[arg]) return fail("파견 중인 동료를 먼저 복귀시켜 주세요.");
        if (!Object.hasOwn(team.xp, arg)) {
          if (s.fieldcraft.trips[team.active]) return fail("시작 동료를 바꾸기 전에 파견에서 복귀시켜 주세요.");
          if (team.started || !trail.starters.includes(arg)) return fail("아직 만난 동료가 아닙니다.");
          team.xp = { [arg]: team.xp[team.active] };
        }
        team.active = arg;
        return success(trail.partner(s).name + (s.hunt ? " · 다음 토벌에 출전합니다." : " · 출전 준비 완료"));
      }
      case "huntStart": {
        const w = s.hunting;
        const request = typeof arg === "object" && arg !== null ? arg.request : w.serial + 1;
        if (!Number.isSafeInteger(request) || request < 1) return fail("사냥 시작 요청이 올바르지 않습니다.");
        if (request <= w.serial) {
          if (request === w.lastStart?.request)
            return { ok: true, message: s.hunt?.id === w.lastStart.id ? "진행 중이던 전투입니다." : "이미 처리한 사냥 시작입니다.", receipt: { ...w.lastStart } };
          return fail("이미 처리한 이전 사냥 요청입니다.");
        }
        if (request !== w.serial + 1) return fail("최신 사냥 상태를 다시 확인하세요.");
        if (s.hunt) return fail("이미 교전 중입니다.");
        if (fieldcraft.pending(s)) return fail("이전 토벌의 포획을 마쳐 주세요.");
        const rank = Number(typeof arg === "object" && arg !== null ? arg.rank : arg);
        if (!Number.isInteger(rank) || rank < 1 || rank > Math.min(60, s.huntBest + 1))
          return fail("먼저 이전 지역을 토벌하세요.");
        if (w.free + w.purchased < 1) return fail("사냥권이 부족합니다. 10분 충전·오늘의 출석을 확인하세요.");
        const partner = trail.partner(s);
        if (partner && s.fieldcraft.trips[partner.kind]) return fail("출전 동료가 채집 중입니다. 복귀시키거나 다른 동료를 선택하세요.");
        const source = w.free > 0 ? "free" : "purchased";
        w[source]--;
        if (w.free < hunting.cap && w.rechargeAt === null) w.rechargeAt = w.observedAt;
        w.serial = request;
        w.lastStart = { request, id: w.id + "-" + request, rank, source };
        s.companions.started = true;
        s.hunt = {id:w.lastStart.id,request,ticketSource:source,number:request,rank,
          partner:{kind:partner.kind,level:partner.level},recruited:[],turn:1,hp:partner.hp,
          maxHp:partner.hp,attack:partner.attack,guardReduction:0,counter:false,momentum:1,ripostes:0,
          diceVersion:1,skillVersion:2,skillCooldowns:{heavyStrike:0,counter:0},trailVersion:1,
          materialRule:1,bonusEncounter:random()<.15,goblinCaught:false};
        trail.enter(s.hunt,0);
        return { ...success(huntEnemy(s.hunt).habitat + " " + rank + "구역 사냥 시작 · 사냥권 1개 사용"), receipt: { ...w.lastStart } };
      }
      case "huntAdvance": {
        const h = s.hunt;
        if (h?.capturePending) return fail("먼저 포획하거나 보내 주세요.");
        if (!trail.awaitingNext(h) || arg?.id !== h.id || arg.wave !== h.wave ||
            h.wave + 1 >= trail.lineup(h.rank, h.bonusEncounter).length) return fail("이어질 조우가 없습니다.");
        trail.enter(h, h.wave + 1);
        return { ok: true, message: h.last, kind: "info" };
      }
      case "flee":
        if (s.hunt?.capturePending) return fail("먼저 포획하거나 보내 주세요.");
        if (!s.hunt) return fail("교전 중인 적이 없습니다.");
        s.hunt = null;
        return success("숲길에서 안전하게 퇴각했습니다. 사용한 사냥권은 반환되지 않습니다.");
      case "strike":
      case "heavyStrike":
      case "block": {
        const h = s.hunt;
        if (!h) return fail("먼저 사냥을 시작하세요.");
        if (trail.awaitingNext(h)) return fail("다음 적을 기다리고 있습니다.");
        const roll=dice.turn(h,dice.face(random),dice.face(random));
        h.lastDice=roll;
        h.skillCooldowns=roll.skillCooldowns;
        h.enemySkillState=roll.enemySkillState;
        h.momentum=roll.momentum;
        const {damage,taken}=roll;
        const impact={kind:roll.player==="block"?"block":roll.skill==="counter"?"counter":"slash",damage,taken:0};
        if (roll.skill==="counter") h.ripostes++;
        h.enemyHp = Math.max(0, h.enemyHp - damage);
        const trailResult = h.trailVersion ? {trailVersion:1, wave:h.wave, bonusEncounter:h.bonusEncounter} : {};
        if (h.partner) Object.assign(trailResult, { partner: h.partner, recruited: h.recruited });
        if (h.captureUsed) trailResult.captureUsed = true;
        if (!h.enemyHp) {
          if (h.partner) {
            trail.defeat(s, h);
            fieldcraft.offer(s, h);
            if (h.capturePending) trailResult.capturePending = true;
          }
          if (h.trailVersion && h.wave + 1 < trail.lineup(h.rank, h.bonusEncounter).length) {
            if (h.enemyKind === "goblin") h.goblinCaught = true;
            h.counter = roll.counter;
            h.turn++;
            return { ok:true, message:"", kind:"info", impact };
          }
          const base = 800 * h.rank * h.rank;
          const bonus = h.ripostes ? base / 4 : 0;
          const chest = awardChest(s, "forest", h.rank, base, bonus, int);
          if (h.materialRule === 1) {
            Object.assign(chest, { materialRule: 1, entryId: h.id, fiber: forestYield(h.rank) });
          }
          if (h.goblinCaught) {
            chest.goblinGold = base / 2;
            chest.gold += chest.goblinGold;
          }
          s.lastHunt = {
            ...trailResult,
            id: h.id, ticketSource: h.ticketSource,
            ...(roll ? {diceVersion:1, lastDice:roll} : {}),
            health: huntHealth(h),
            rank: h.rank,
            enemyKind: huntEnemy(h).kind,
            turns: h.turn,
            damageTaken: h.maxHp - h.hp,
            ripostes: h.ripostes || 0,
            chestId: chest.id,
            reward: chest.gold,
            bonus,
          };
          s.huntBest = Math.max(s.huntBest, h.rank);
          s.hunt=null;
          return {...success("토벌 성공 · 보물상자 발견","win"),impact};
        }
        impact.taken = Math.min(taken, h.hp);
        h.hp = Math.max(0, h.hp - taken);
        if (roll && (h.waveTurn ?? h.turn) >= 40) h.hp = 0;
        h.counter = roll.counter;
        if (!h.hp) {
          s.lastHunt = {
            ...trailResult,
            id: h.id, ticketSource: h.ticketSource,
            ...(roll ? {diceVersion:1, lastDice:roll} : {}),
            health: huntHealth(h),
            rank: h.rank,
            enemyKind: huntEnemy(h).kind,
            turns: h.turn,
            damageTaken: h.maxHp,
            ripostes: h.ripostes || 0,
            reward: 0,
            bonus: 0,
          };
          s.hunt = null;
          return { ...success("사냥 실패 · 동료와 함께 야영지로 돌아왔습니다.", "loss"), impact };
        }
        h.turn++;
        if (h.trailVersion) h.waveTurn++;
        h.last="주사위 전투";
        return {ok:true,message:"",kind:"info",impact};
      }
      default: return fail("알 수 없는 행동입니다.");
    }
  }
  return {fresh,perform,trail,fieldcraft,huntEnemy,liningCosts,forestYield,hunting,huntingStatus,settleHunting,blessings};
})();
if (typeof module !== "undefined") module.exports=Game;
