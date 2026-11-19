"use strict";
const FieldcraftView = (() => {
  const rules = Game.fieldcraft;
  let selectedSite = "vine";
  const nameOf = kind => Game.trail.enemy(1,kind).name;
  const options = (catalog, selected) => Object.entries(catalog).map(([key,label]) =>
    '<option value="'+key+'"'+(key === selected ? ' selected' : '')+'>'+label+'</option>').join('');
  function capture(s,h) {
    const bag = s.fieldcraft;
    const choice = (tool,label,disabled=false) => '<button class="action" data-act="resolveCapture" data-arg="'+tool+
      '" data-entry="'+encodeURIComponent(h.id)+'" data-wave="'+h.wave+'"'+(disabled?' disabled':'')+'>'+label+'</button>';
    return '<section class="net-choice" aria-label="포획 선택"><strong>'+nameOf(h.enemyKind)+' 포획 기회</strong><small>토벌당 한 번 · 시도하면 그물 1개 소모</small>' +
      '<div class="net-grades">'+Object.entries(rules.tools).map(([key,tool]) => choice(key,
        '<b>'+tool.name+'</b><span>'+rules.chance(h,key)+'% · '+bag.tools[key]+'개</span>',!bag.tools[key])).join('')+'</div>'+
      '<div class="net-links">'+go('forest/gather','채집·제작')+choice('pass','보내주기')+'</div></section>';
  }
  function workshop(s) {
    const bag = s.fieldcraft, site = rules.sites[selectedSite];
    const sites = Object.entries(rules.sites).map(([key,p]) => '<button class="action" data-act="gatherMaterial" data-arg="'+key+'"><b>'+p.name+
      '</b><span>'+p.material+' +'+rules.handYield+'</span><small>보유 '+fmt(bag.materials[key])+'</small></button>').join('');
    const recipes = Object.entries(rules.tools).map(([key,tool]) => {
      const cost = Object.entries(tool.cost).map(([mat,n]) => rules.sites[mat].material+' '+bag.materials[mat]+'/'+n).join(' · ');
      return '<div class="net-row"><div><b>'+tool.grade+' · '+tool.name+'</b><small>포획률 +'+tool.bonus+'%p · 보유 '+bag.tools[key]+'개</small><small>'+cost+'</small></div>'+
        btn('craftNet','1개 제작',key,'action',!rules.sufficient(bag,key))+'</div>';
    }).join('');
    const workers = Object.keys(s.companions.xp).map(kind => {
      const trip=bag.trips[kind], fighting=s.hunt?.partner?.kind===kind;
      const where=trip?.site || selectedSite;
      const identity='<b>'+nameOf(kind)+'</b><small>'+rules.types[kind]+' 타입 · '+rules.rate(kind,where)+'개/분</small>';
      if (trip) return '<div class="net-row"><div>'+identity+'<small data-trip="'+kind+'">'+tripStatus(s,kind)+'</small></div>'+
        '<button class="action" data-act="recallGatherer" data-arg="'+kind+'" data-start="'+trip.start+'" data-site="'+trip.site+'">수령·복귀</button></div>';
      return '<div class="net-row"><div>'+identity+'</div>'+btn('dispatchGatherer',fighting?'토벌 중':'파견',kind,'action',fighting)+'</div>';
    }).join('');
    const labels = Object.fromEntries(Object.entries(rules.sites).map(([k,p])=>[k,p.name]));
    const modes = {manual:'직접 선택',pass:'모두 보내주기'};
    for (const [key,tool] of Object.entries(rules.tools)) modes[key]=tool.name+' 자동 사용';
    return '<div class="field-workshop">'+(rules.pending(s)?go('forest','포획 대기로 돌아가기','action'):'')+
      card('직접 채집','<div class="net-grades">'+sites+'</div>')+
      card('포획 도구 제작',recipes+'<label class="net-setting">자동 토벌 포획<select id="autoNet">'+options(modes,bag.auto)+'</select></label>')+
      card('동료 자동 채집','<label class="net-setting">채집터<select id="gatherSite">'+options(labels,selectedSite)+'</select></label>'+
        desc(site.material+' · '+site.types.join('·')+' 타입은 수확 2배. 접속을 종료해도 1분마다 쌓이며 복귀할 때 받습니다.')+workers)+'</div>';
  }
  function tripStatus(s,kind) {
    const trip=s.fieldcraft.trips[kind], now=Math.max(Date.now(),s.hunting.observedAt);
    const seconds=Math.ceil((rules.cycle-Math.max(0,now-trip.start)%rules.cycle)/1000);
    return rules.sites[trip.site].material+' '+fmt(rules.yieldAt(kind,trip,now))+'개 · 다음 수확 '+seconds+'초';
  }
  function refreshTrips(s) {
    for (const node of document.querySelectorAll('[data-trip]')) {
      if (s.fieldcraft.trips[node.dataset.trip]) node.textContent=tripStatus(s,node.dataset.trip);
    }
  }
  document.addEventListener('change',e=>{
    if (e.target.id==='gatherSite') { selectedSite=e.target.value; render(); }
    if (e.target.id==='autoNet') act('setAutoNet',e.target.value);
  });
  return {workshop,capture,refreshTrips};
})();
