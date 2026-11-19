/* Session-only spectator controller. Durable operations use act() and the save lock. */
const HuntWatch=(()=>{
  let active=false,generation=0,timer=null,busy=false,reward=null,reason='',outcome=null;
  let mode = 'progress', fixedRank = 1, replayRank = 0, saveGeneration = null;
  const names={strike:'공격',block:'방어',heavyStrike:'강공'};
  const icons={strike:'sword',block:'shield',heavyStrike:'hammer'};
  const allowed=()=>ready&&!storageError&&!document.hidden&&huntPage();
  const live = token => token === generation && active && allowed() && state._save?.generation === saveGeneration;
  const pending=()=>!state.hunt&&state.chests.find(c=>c.id===state.lastHunt?.chestId&&c.source==='forest');
  const nextRank = () => mode === 'repeat' ? fixedRank : state.huntBest >= 60 ? replayRank : state.huntBest + 1;
  function validRank(rank) {
    if (!Number.isInteger(rank) || rank < 1 || rank > 60 || rank !== nextRank()) return false;
    return mode === 'repeat' || state.huntBest >= 60 ? rank <= state.huntBest : rank === state.huntBest + 1;
  }
  const spending = w => '무료 '+fmt(w.free)+' 먼저 · 소진 시 구매 '+fmt(w.purchased)+' 사용';
  function selector(s, held) {
    const motion = motionEnabled() ? '' : '<div class="watch-motion-hint"><button class="mini" data-motion-policy="full"><small>' +
      (reducedMotion.matches && !prefs.motionOverride ? '기기 설정으로 정지' : '연출 꺼짐') + '</small>연출 켜기</button></div>';
    if (active) return motion;
    const team = s.companions, choicesForTeam = team.started ? Object.keys(team.xp) : Game.trail.starters;
    const partnerSelect = '<label class="partner-pick">' + (s.hunt ? '다음 출전' : team.started ? '출전 동료' : '시작 동료') +
      '<select aria-label="출전 동료 선택" data-partner>' + choicesForTeam.map(kind => {
        const level = Game.trail.partnerLevel(team.xp[kind] ?? team.xp[team.active]);
        const away = s.fieldcraft.trips[kind];
        return '<option value="' + kind + '"' + (team.active === kind ? ' selected' : '') + (away ? ' disabled' : '') + '>' +
          Game.trail.enemy(1,kind).name + ' · ' + (away ? '채집 중' : 'Lv.' + level) + '</option>';
      }).join('') + '</select></label>';
    const chooseRank = mode === 'repeat' || s.huntBest >= 60;
    const choices = chooseRank ? Array.from({length: Math.min(60, s.huntBest)}, (_, i) => {
      const n = i + 1;
      return '<option value="' + n + '"' + (nextRank() === n ? ' selected' : '') + '>' +
        n + '단계 · 섬유 ' + Game.forestYield(n) + '</option>';
    }).join('') : '';
    const modeSelect = s.huntBest ? '<select class="watch-mode" aria-label="사냥 방식">' +
      '<option value="progress">' + (s.huntBest >= 60 ? '1회 재도전' : '다음 단계 진행') + '</option>' +
      '<option value="repeat"' + (mode === 'repeat' ? ' selected' : '') + '>완료 구역 반복</option></select>' : '';
    const rankSelect = chooseRank ? '<select class="trail-replay" aria-label="완료한 스테이지 선택">' +
      (mode === 'progress' ? '<option value="0">재도전 단계 선택</option>' : '') + choices + '</select>' : '';
    const target = mode === 'repeat' ? fixedRank + '단계 반복' : s.huntBest >= 60 ? '1회 재도전' : '다음 단계 진행';
    return '<div class="watch-plan">' + partnerSelect + modeSelect + rankSelect + motion + '<small>' +
      (held ? held.rank + '단계 정산 후 ' + target + ' · ' : '') +
      '<span data-watch-spending>'+spending(Game.huntingStatus(s))+'</span>' +
      '</small></div>';
  }
  function ticketInfo(w){
    const empty=w.free+w.purchased===0,seconds=Math.ceil((w.remaining||0)/1000);
    const countdown=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
    const text=(w.purchased?'무료 ':'사냥권 ')+fmt(w.free)+' / '+Game.hunting.cap+
      (w.purchased?' · 구매 '+fmt(w.purchased):empty?' · 충전 '+countdown:'');
    return {text,empty,width:Math.min(100,Math.max(0,w.free/Game.hunting.cap*100))};
  }
  function ticketBar(w){const t=ticketInfo(w);return '<span class="watch-ticket-bar" data-empty="'+t.empty+'"><span class="watch-ticket-fill" aria-hidden="true" style="width:'+t.width+'%"></span><span class="watch-ticket-text">'+t.text+'</span></span>';}
  function stop(why='',paint=true) {active=false;generation++;clearTimeout(timer);timer=null;reason=why;if(paint&&state)render();}
  function restoreReceipt() {
    mode = 'progress'; fixedRank = 1; replayRank = 0;
    reward = null;
    outcome = null;
    if (huntPage() && !state.hunt &&
        state.lastChest?.source === 'forest' && state.lastChest.id === state.lastHunt?.chestId &&
        (!state.lastHunt.partner || state.lastHunt.partner.kind === state.companions.active))
      reward = {...state.lastChest};
  }
  function stageOutcome(before){
    if(state.hunt)outcome=null;
    else if(before&&state.lastHunt?.id===before.id)outcome=state.lastHunt.health;
  }
  function die(face,action,side) {
    return '<div class="watch-roll" data-die="'+side+'"><div class="watch-die" data-action="'+(action||'')+'" role="img" aria-label="'+(face?names[action]+' 주사위':'주사위 대기')+'">'+icon(icons[action]||'sword')+'</div><span>'+(face?names[action]:'대기')+'</span></div>';
  }
  function skills(h){
    if(!h||h.diceVersion!==1)return '';
    return '<div class="watch-skills" aria-label="자동 전투 스킬">'+Object.entries(DiceCombat.skills).map(([key,def])=>{
      const s=DiceCombat.skillStatus(h,key);
      // Cooldowns tick at the next turn's start; one remaining turn can already fire on its attack face.
      const next=DiceCombat.skillStatus({...h,skillCooldowns:{...h.skillCooldowns,[key]:Math.max(0,s.cooldown-1)}},key);
      const locked=key==='heavyStrike'&&h.rank<2,ready=!locked&&next.ready;
      const status=locked?'잠김':ready?'준비 완료':s.cooldown>1?s.cooldown+'턴':'조건 대기';
      const condition=locked?'2스테이지 해금':ready?'공격 주사위에 자동':key==='counter'?(h.counter?'반격 준비 완료':'적 스킬 방어 필요'):'기세 '+(h.momentum??1)+' / 2';
      const filled=locked?0:s.cooldown>1?Math.max(0,def.cooldown-s.cooldown):def.cooldown;
      const label=def.name+' · '+status+' · '+condition;
      return '<span class="watch-skill" data-skill="'+key+'" data-ready="'+ready+'" data-state="'+(locked?'locked':ready?'ready':s.cooldown>1?'cooldown':'condition')+'" title="'+label+'" aria-label="'+label+'"><span class="watch-skill-heading">'+icon(def.icon)+'<b>'+def.name+'</b><em>'+status+'</em></span><span class="watch-skill-condition">'+condition+'</span><span class="watch-skill-clock" aria-hidden="true">'+Array.from({length:def.cooldown},(_,i)=>'<i'+(i<filled?' class="filled"':'')+'></i>').join('')+'</span></span>';
    }).join('')+'</div>';
  }
  function enemySkill(h){
    if(!h?.enemySkillState)return '';
    const s=h.enemySkillState,def=DiceCombat.enemySkills[s.key || 'charge'],ready=s.cooldown<=1;
    const status=s.key==='escape'?(h.waveTurn>=2?'이번 턴':'2턴째 도주'):ready?'다음 공격':s.cooldown+'턴';
    return '<span class="watch-enemy-skill" data-ready="'+ready+'" title="'+def.hint+'" aria-label="적 '+def.name+' · '+status+'"><span>'+icon(def.icon)+'<b>'+def.name+'</b><em>'+status+'</em></span><span class="watch-skill-clock" aria-hidden="true">'+Array.from({length:s.interval},(_,i)=>'<i'+(i<(ready?s.interval:s.interval-s.cooldown)?' class="filled"':'')+'></i>').join('')+'</span></span>';
  }
  function encounterHint(h, result, enemy, rank, pack) {
    if (Game.trail.awaitingNext(h)) {
      let event = enemy.name + ' 격파';
      if (enemy.kind === 'goblin') event = h.goblinCaught ? '돈주머니 획득' : '황금 고블린이 달아났습니다';
      return event + ' · 다음은 ' + Game.trail.enemy(rank, pack[h.wave + 1]).name;
    }
    if (h?.enemyKind === 'goblin') return '두 턴 안에 잡으면 상자에 기본 골드 +50%';
    if (h && enemy.skill) return DiceCombat.enemySkills[enemy.skill].hint;
    if (!h && !result) return pack.map(kind => Game.trail.enemy(rank,kind).name).join(' → ');
    return '';
  }
  function view(s) {
    const h=s.hunt;
    const result = !h && (reward || pending() || reason.startsWith('패배') || outcome) ? s.lastHunt : null;
    const rank=h?.rank || result?.rank || nextRank() || 60;
    const encounter = h || result;
    const pack = Game.trail.lineup(rank,encounter?.bonusEncounter);
    const trail = !encounter || encounter.trailVersion === 1;
    const wave = encounter?.wave ?? 0;
    const enemy = encounter ? Game.huntEnemy(encounter) : Game.trail.enemy(rank,pack[0]);
    const st=Game.trail.partner(s),roll=encounter?.lastDice;
    const useDice=h?h.diceVersion===1:true;
    const deployed = encounter?.partner;
    const ally = deployed ? Game.trail.enemy(1,deployed.kind) : st;
    const sprite = ally.sprite;
    const allyLabel = ally.name + ' Lv.' + (deployed?.level || st.level);
    const resultHealth=!h?(outcome||((reward||pending()||reason.startsWith('패배'))?s.lastHunt?.health:null)):null;
    const hp=h?.hp??resultHealth?.hp??st.hp,max=h?.maxHp??resultHealth?.maxHp??st.hp,enemyHp=h?.enemyHp??resultHealth?.enemyHp??Game.trail.opponent(rank,enemy.kind).hp;
    const total=h?.enemyMax??resultHealth?.enemyMax??enemyHp;
    const fighter=(side,label,asset,width,current,maxHp)=>'<div class="watch-fighter '+side+'"'+(side==='enemy'&&enemy.elite?' data-elite="true"':'')+' data-action="'+(roll?.[side==='player'?'player':'enemy']||'')+'">'+healthMeter(side,label,current,maxHp)+
      '<div class="watch-actor'+(asset==='moth'?' airborne':'')+'"'+(current<=0?' data-defeated="true"':'')+'>'+(['wolf','moth','tree','goblin'].includes(asset)?
        '<img class="trail-creature" src="assets/hunt/'+asset+'.webp" alt="">':'<canvas width="'+width+'" height="144" data-sprite="'+asset+'" aria-hidden="true"></canvas>')+'<div class="watch-ward" aria-hidden="true">'+icon('shield')+'</div></div>'+
      (useDice?die(roll?.[side==='player'?'playerFace':'enemyFace'],roll?.[side==='player'?'player':'enemy'],side):'')+
      (side==='enemy'?enemySkill(h):'')+'</div>';
    const w=Game.huntingStatus(s),empty=!w.free&&!w.purchased&&!h&&!pending();
    const held = h || pending(), finished = !held && !validRank(nextRank());
    const label = active ? '사냥 중단' : finished ? '모든 스테이지 완료' :
      held ? (mode === 'repeat' ? '반복 재개' : s.huntBest >= 60 ? '재도전 재개' : '진행 재개') :
      empty ? '사냥권 충전 보기' : mode === 'repeat' ? '반복 시작' : s.huntBest >= 60 ? '1회 재도전' : '사냥';
    const area=Game.trail.region(rank);
    const joined = encounter?.recruited || [];
    const offer = Game.fieldcraft.pending(s);
    const away = !h && !pending() && s.fieldcraft.trips[s.companions.active];
    const hint = encounterHint(h,result,enemy,rank,pack);
    let detail = hint;
    if (!encounter && !s.companions.started) detail = '첫 동료를 고르고 사냥을 시작하세요.';
    else if (!encounter) detail = st.name + ' · 공격 ' + fmt(st.attack) + (st.level < 60 ? ' · 경험치 ' + s.companions.xp[st.kind] % 4 + '/4' : ' · 최고 레벨');
    if ((!h || Game.trail.awaitingNext(h)) && joined.length) detail = '새 동료 · ' + joined.map(kind => Game.trail.enemy(rank,kind).name).join(', ');
    if (result?.partner && result.chestId) detail += (detail ? ' / ' : '') + ally.name + ' Lv.' + Game.trail.partner(s,deployed.kind).level;
    if (encounter?.captureUsed && !joined.length && (!h || Game.trail.awaitingNext(h))) detail = '포획 실패 · 그물을 빠져나갔습니다.';
    return '<section class="watch-view'+(offer?' capture-ready':'')+'"><div class="watch-stage">STAGE <b>'+rank+'</b> <span class="trail-region">'+(trail?area.name:enemy.habitat)+'</span>'+(trail?'<span class="trail-wave">'+(enemy.elite?'우두머리 · ':'')+'조우 '+(wave+1)+' / '+pack.length+'</span>':'')+(h?.ripostes>0?'<span class="watch-counter-status">승리 시 반격 +25%</span>':'')+'</div>'+
      '<div class="scene watch-arena combat-hud"'+(trail?' data-region="'+area.id+'"':'')+'>'+fighter('player',allyLabel,sprite,144,hp,max)+fighter('enemy',enemy.name,enemy.sprite||'boar',144,enemyHp,total)+'</div>'+
      (offer ? FieldcraftView.capture(s,offer) : '<div class="watch-reward" role="status">'+(detail?'<div class="trail-detail">'+detail+'</div>':'')+skills(h)+(reward?'<div class="watch-receipt"><div class="watch-receipt-head"><b>'+reward.rank+'단계 클리어</b><strong>'+icon('coins')+' +'+fmt(reward.gold)+' G</strong>'+
        (!active && reward.fiber ? '<button class="action lining-link" data-go="forest/gather">'+icon('shield')+'안감 제작</button>' : '')+'</div><div class="watch-loot">'+
        (reward.fiber ? '<span>'+icon('trees')+'숲결 섬유 +'+reward.fiber+'</span>' : '')+
        (reward.goblinGold?'<span>'+icon('coins')+'고블린 +'+fmt(reward.goblinGold)+' G 포함</span>':'')+
        (reward.counter>0?'<span class="watch-counter-reward">반격 +'+fmt(reward.counter)+' G 포함</span>':'')+
        [[reward.shards,'sparkles','별의 파편'],[reward.scrolls,'scroll-text','주문서'],...[0,1,2].map(i=>[reward.charms[i],['trees','hammer','star'][i],Game.blessings[i]])].filter(([n])=>n).map(([n,ic,title])=>'<span aria-label="'+title+' '+n+'개" title="'+title+'">'+icon(ic)+' +'+n+'</span>').join('')+'</div></div>':reason&&!(h&&reason==='일시 중단')?'<b>'+reason+'</b>':'')+'</div>'+
      selector(s, held)+(away ? go('forest/gather','출전 동료 채집 중 · 복귀하기','action') : '<button class="primary watch-start" '+(empty&&!active?'data-open="huntWallet"':'data-watch="toggle"')+(finished?' disabled':'')+'><span class="watch-start-label">'+icon(active?'shield':'sword')+label+'</span>'+ticketBar(w)+'</button>'))+
      '</section>';
  };
  function beforeRender(){if(active&&!allowed())stop('',false);}
  function refreshWallet() {
    if(!allowed())return;
    const button=document.querySelector('.watch-start'),w=Game.huntingStatus(state);
    if(!button)return;
    const cost = document.querySelector('[data-watch-spending]');
    if(cost && cost.textContent !== spending(w))cost.textContent=spending(w);
    if(!active&&!state.hunt&&!pending()&&validRank(nextRank())&&(button.dataset.open==='huntWallet') !== (!w.free&&!w.purchased)){render();return;}
    // Update only the meter: a whole-screen render would cancel the current attack.
    const bar=button.querySelector('.watch-ticket-bar');if(!bar)return;
    const t=ticketInfo(w),label=bar.querySelector('.watch-ticket-text');
    if(label.textContent!==t.text)label.textContent=t.text;
    bar.dataset.empty=String(t.empty);bar.querySelector('.watch-ticket-fill').style.width=t.width+'%';
  }
  function arm(delay=400) {
    if(!active||busy||timer)return;
    const token=generation;timer=setTimeout(()=>{timer=null;step(token).catch(()=>stop('저장 상태를 확인해 주세요'));},delay);
  }
  async function step(token) {
    if(token!==generation||!active)return;
    if(!live(token)){stop('일시 중단');return;}
    busy=true;
    try {
      const h=state.hunt;
      const offer=Game.fieldcraft.pending(state);
      if(offer) {
        const tool=state.fieldcraft.auto;
        if(tool==='manual' || (tool!=='pass' && !state.fieldcraft.tools[tool])) { stop('포획 선택'); return; }
        await act(null,'',undefined,undefined,()=>live(token) && state.fieldcraft.auto===tool ?
          {action:'resolveCapture',arg:{id:offer.id,wave:offer.wave,tool}}:null);
      } else if(Game.trail.awaitingNext(h)) {
        const id=h.id,wave=h.wave;
        await act(null,'',undefined,undefined,()=>live(token)&&state.hunt?.id===id&&state.hunt.wave===wave?
          {action:'huntAdvance',arg:{id,wave}}:null);
        if(storageError)stop('저장 상태를 확인해 주세요');
      } else if(h) {
        const id=h.id,turn=h.turn,wave=h.wave;
        await act(null,'',undefined,()=>live(token)&&state.hunt?.id===id&&state.hunt.turn===turn&&state.hunt.wave===wave?
          'strike':null);
        if(storageError){stop('저장 상태를 확인해 주세요');return;}
        await HuntEffects.finished();
        if(token!==generation)return;
        if(!state.hunt&&!state.lastHunt?.chestId){stop('패배 · 이전 구역에서 동료를 키워 보세요');return;}
      } else {
        const chest=pending();
        if(chest) {
          await act(null,'',undefined,undefined,()=>live(token)&&pending()?.id===chest.id?{action:'openChest',arg:chest.id}:null);
          if(storageError){stop('저장 상태를 확인해 주세요');return;}
          if(token!==generation)return;
          if(pending()?.id===chest.id || state.lastChest?.id!==chest.id){stop('보물을 수령할 수 없습니다');return;}
          reward={...state.lastChest};
          if(mode==='progress'&&state.huntBest>=60){replayRank=0;stop('모든 스테이지 완료');return;}
          render();
        } else {
          if(!validRank(nextRank())){stop('모든 스테이지 완료');return;}
          const w=Game.huntingStatus(state);
          if(!w.free&&!w.purchased){stop('사냥권을 모두 사용했습니다');return;}
          const rank=nextRank(),serial=state.hunting.serial,wallet=state.hunting.id, selectedMode=mode;
          reward=null;outcome=null;reason='';
          await act(null,'',undefined,undefined,()=>live(token)&&!state.hunt&&!pending()&&
            mode===selectedMode&&validRank(rank)&&state.hunting.id===wallet&&state.hunting.serial===serial&&
            (state.hunting.free>0||state.hunting.purchased>0)?
            {action:'huntStart',arg:{rank,request:serial+1,combat:"trail-v1"}}:null);
          if(storageError){stop('저장 상태를 확인해 주세요');return;}
          if(token===generation&&!state.hunt){stop('사냥을 시작할 수 없습니다');return;}
        }
      }
    } finally {busy=false;if(token===generation&&active)arm(reward&&!state.hunt?1800:500);else if(active)arm();}
  }
  document.addEventListener('change',event=>{
    if(active || !allowed())return;
    if(event.target.matches('[data-partner]')) {
      reward=null;outcome=null;reason='';
      act('choosePartner',event.target.value);
      return;
    } else if(event.target.matches('.watch-mode')) {
      mode = event.target.value === 'repeat' && state.huntBest ? 'repeat' : 'progress';
    } else if(event.target.matches('.trail-replay')) {
      const n=Number(event.target.value);
      if(!Number.isInteger(n)||n<0||n>state.huntBest)return;
      if(mode==='repeat')fixedRank=n||1;else replayRank=n;
    } else return;
    generation++;reward=null;outcome=null;reason='';render();
  });
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-watch]');if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();if(!allowed())return;
    if(active){stop('일시 중단');return;}
    // Capturing this click bypasses the general UI handler; unlock sound here too.
    if(!state.hunt&&!pending()&&!validRank(nextRank()))return;
    if(prefs.sound)GameSound.unlock();GameMusic.unlock();
    saveGeneration = state._save?.generation;
    active=true;reason='';reward=null;outcome=null;generation++;render();arm(100);
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('일시 중단');});
  window.addEventListener('pagehide',()=>stop('',false));
  window.addEventListener('hashchange',()=>{if(!huntPage()){stop('',false);reward=null;outcome=null;}});
  return {view, stop, beforeRender, refreshWallet, restoreReceipt, stageOutcome, get active(){return active;}};
})();
