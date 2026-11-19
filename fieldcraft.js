"use strict";
const Fieldcraft = (() => {
  const trail = typeof module !== "undefined" ? require("./hunt-trail.js") : HuntTrail;
  const sites = {
    vine: { name: "덩굴 숲", material: "질긴 덩굴", types: ["풀", "벌레"] },
    resin: { name: "수액 숲", material: "끈끈한 수액", types: ["불꽃", "용"] },
    stone: { name: "수정 굴", material: "빛수정", types: ["땅", "바위"] },
  };
  const types = { tree:"풀", moth:"벌레", wolf:"불꽃", boar:"땅", golem:"바위",
    tusk:"땅", alpha:"불꽃", wyrm:"용", elder:"풀" };
  const tools = {
    woven: { name:"덩굴 그물", grade:"일반", bonus:0, cost:{vine:2, resin:2} },
    reinforced: { name:"강화 그물", grade:"고급", bonus:20, cost:{vine:4, resin:4, stone:2} },
    prism: { name:"수정 그물", grade:"특급", bonus:40, cost:{vine:6, resin:4, stone:6} },
  };
  const cycle = 60000, handYield = 2;
  function fresh() {
    return { materials:{vine:0,resin:0,stone:0}, tools:{woven:0,reinforced:0,prism:0}, trips:{}, auto:"manual" };
  }
  const rate = (kind, site) => sites[site].types.includes(types[kind]) ? 4 : 2;
  const yieldAt = (kind, trip, now) => Math.floor(Math.max(0, now - trip.start) / cycle) * rate(kind, trip.site);
  const sufficient = (bag, tool) => Object.entries(tools[tool].cost).every(([key,n]) => bag.materials[key] >= n);
  const chance = (hunt, tool) => (trail.enemy(hunt.rank,hunt.enemyKind).elite ? 25 : 50) + tools[tool].bonus;
  function pending(s) {
    const fight = s.hunt || s.lastHunt;
    return fight?.capturePending ? fight : null;
  }
  function offer(s,h) {
    if (h.trailVersion && !h.captureUsed && Object.hasOwn(types,h.enemyKind) && !Object.hasOwn(s.companions.xp,h.enemyKind))
      h.capturePending = true;
  }
  function perform(s, action, arg, random) {
    const bag = s.fieldcraft, team = s.companions, now = s.hunting.observedAt;
    const good = message => ({ok:true,message,kind:"win"});
    const fail = message => ({ok:false,message});
    switch (action) {
      case "gatherMaterial": {
        if (!Object.hasOwn(sites,arg)) return fail("채집터를 선택하세요.");
        if (!Number.isSafeInteger(bag.materials[arg]+handYield)) return fail("재료 보관 한도에 도달했습니다.");
        bag.materials[arg] += handYield;
        return good(sites[arg].material + " +" + handYield);
      }
      case "craftNet": {
        if (!Object.hasOwn(tools,arg) || !sufficient(bag,arg)) return fail("제작 재료가 부족합니다.");
        if (!Number.isSafeInteger(bag.tools[arg]+1)) return fail("그물 보관 한도에 도달했습니다.");
        for (const [key,n] of Object.entries(tools[arg].cost)) bag.materials[key] -= n;
        bag.tools[arg]++;
        return good(tools[arg].name + " 1개 제작");
      }
      case "dispatchGatherer": {
        const { kind,site } = arg || {};
        if (!Object.hasOwn(sites,site) || !Object.hasOwn(team.xp,kind) || bag.trips[kind] || kind === s.hunt?.partner?.kind)
          return fail("채집에 보낼 수 있는 동료를 선택하세요.");
        bag.trips[kind] = {site,start:now};
        return good(trail.enemy(1,kind).name + " · " + sites[site].name + " 파견");
      }
      case "recallGatherer": {
        const trip = bag.trips[arg?.kind];
        if (!trip || trip.start !== arg.start || trip.site !== arg.site) return fail("이미 종료된 파견입니다.");
        const count = yieldAt(arg.kind, trip, now);
        if (!Number.isSafeInteger(bag.materials[trip.site]+count)) return fail("재료 보관 한도에 도달했습니다.");
        bag.materials[trip.site] += count;
        delete bag.trips[arg.kind];
        return good("동료 복귀 · " + sites[trip.site].material + " +" + count);
      }
      case "setAutoNet":
        if (!["manual","pass"].includes(arg) && !Object.hasOwn(tools,arg)) return fail("포획 방식을 선택하세요.");
        bag.auto = arg;
        return good("자동 토벌 포획 설정을 저장했습니다.");
      case "resolveCapture": {
        const h = pending(s), tool = arg?.tool;
        if (!h || h.id !== arg?.id || h.wave !== arg.wave) return fail("이미 끝난 포획 기회입니다.");
        if (tool === "pass") {
          delete h.capturePending;
          return good("야생 생물을 보내 주었습니다.");
        }
        if (!Object.hasOwn(tools,tool) || !bag.tools[tool]) return fail("선택한 포획 도구가 없습니다.");
        delete h.capturePending;
        h.captureUsed = true;
        bag.tools[tool]--;
        const name = trail.enemy(h.rank,h.enemyKind).name;
        if (random() * 100 >= chance(h,tool)) return {ok:true,kind:"info",message:name + " 포획 실패 · 그물을 빠져나갔습니다."};
        team.xp[h.enemyKind] = (h.partner.level - 1) * 4;
        h.recruited.push(h.enemyKind);
        return good(name + " 포획 성공! 다음 토벌에 출전할 수 있습니다.");
      }
    }
  }
  function valid(bag, team, hunt) {
    const record = v => v && typeof v === "object" && !Array.isArray(v);
    const counts = (values, catalog) => record(values) && Object.keys(catalog).every(k =>
      Number.isSafeInteger(values[k]) && values[k] >= 0);
    return record(bag) && counts(bag.materials,sites) && counts(bag.tools,tools) &&
      (["manual","pass"].includes(bag.auto) || Object.hasOwn(tools,bag.auto)) && record(bag.trips) &&
      Object.entries(bag.trips).every(([k,v]) => Object.hasOwn(team.xp,k) && k !== hunt?.partner?.kind &&
        record(v) && Object.hasOwn(sites,v.site) && Number.isSafeInteger(v.start));
  }
  return { sites, types, tools, cycle, handYield, fresh, rate, yieldAt, sufficient, chance, offer, pending, perform, valid };
})();
if (typeof module !== "undefined") module.exports = Fieldcraft;
