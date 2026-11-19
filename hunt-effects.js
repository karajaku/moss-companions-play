/* Presentation only: saved combat results are never delayed, rolled again or mutated. */
const HuntEffects=(()=>{
  let timers=[],animations=[],nodes=[],resolve=null,completion=Promise.resolve();
  function cancel(){
    timers.forEach(clearTimeout);timers=[];
    animations.forEach(a=>a.cancel());animations=[];nodes.forEach(n=>n.remove());nodes=[];
    document.querySelector('.watch-arena')?.removeAttribute('data-phase');
    document.querySelectorAll('.watch-roll').forEach(n=>n.classList.remove('rolling','waiting','chosen'));
    document.querySelectorAll('.watch-actor').forEach(n=>{delete n.dataset.attackAt;delete n.dataset.attacking;});
    document.querySelector('.watch-counter-status')?.style.removeProperty('visibility');
    if(resolve){GameSound.stop();const done=resolve;resolve=null;done();}
  }
  const later=(fn,ms)=>timers.push(setTimeout(fn,ms));
  function animate(node,frames,options){if(node&&motionEnabled())animations.push(node.animate(frames,options));}
  const names={strike:'공격',block:'방어',heavyStrike:'강공'},icons={strike:'sword',block:'shield',heavyStrike:'hammer'};
  function faceIcon(die,face){const action=DiceCombat.actions[face-1];die.innerHTML=icon(icons[action]);die.dataset.action=action;}
  function burst(actor,kind,damage){
    if(!actor||!motionEnabled())return;
    const node=document.createElement('div');node.className='hunt-burst '+kind;node.setAttribute('aria-hidden','true');
    node.innerHTML='<i class="hunt-cut"></i>'+Array.from({length:8},(_,i)=>'<i class="hunt-chip" style="--dx:'+Math.round(Math.cos(i*Math.PI/4)*68)+'px;--dy:'+Math.round(Math.sin(i*Math.PI/4)*60)+'px"></i>').join('')+
      '<b>'+(damage?'−'+fmt(damage):icon('shield'))+'</b>';
    actor.append(node);nodes.push(node);later(()=>node.remove(),700);
  }
  function reaction(actor,kind,skillName){
    if(!actor||!motionEnabled())return;
    const labels={guard:'방어!',stopped:(skillName||'돌진')+' 저지!',direct:'직격!',broken:'방어 관통!'};
    const node=document.createElement('div');node.className='watch-reaction '+kind;node.dataset.reaction=kind;node.setAttribute('role','status');
    node.innerHTML='<b>'+icon(kind==='guard'||kind==='stopped'?'shield':'chevrons-up')+labels[kind]+'</b>'+(kind==='stopped'?'<small>반격 준비</small>':'');
    actor.append(node);nodes.push(node);later(()=>node.remove(),800);
  }
  function counterBonus(arena){
    const node=document.createElement('div');node.className='watch-counter-award';node.setAttribute('role','status');
    node.innerHTML=icon('coins')+'<b>반격 보너스 +25%</b><small>승리 시 지급</small>';
    arena.append(node);nodes.push(node);later(()=>node.remove(),1100);
  }
  function play(hit,before,roll){
    cancel();const arena=document.querySelector('.watch-arena');if(!arena)return false;
    const firstCounter=(roll?roll.skill==='counter':hit.kind==='counter')&&!(before.ripostes>0);
    if(!motionEnabled()){if(firstCounter)counterBonus(arena);return false;}
    const bonusStatus=document.querySelector('.watch-counter-status');
    if(firstCounter&&bonusStatus)bonusStatus.style.visibility='hidden';
    completion=new Promise(done=>resolve=done);
    const actors={player:arena.querySelector('.player .watch-actor'),enemy:arena.querySelector('.enemy .watch-actor')};
    const meters={player:arena.querySelector('[data-side="player"]'),enemy:arena.querySelector('[data-side="enemy"]')};
    const end={player:Number(meters.player.getAttribute('aria-valuenow')),enemy:Number(meters.enemy.getAttribute('aria-valuenow'))};
    const start={player:before.hp,enemy:before.enemyHp};
    for(const side of ['player','enemy'])actors[side].removeAttribute('data-defeated');
    const actions=roll||{player:hit.kind==='block'||hit.kind==='parry'?'block':'strike',enemy:'strike'};
    for(const side of ['player','enemy'])updateHealthMeter(meters[side],start[side],start[side],false);
    const lead=roll?1600:0;
    function diceTurn(side,at){
      const host=arena.querySelector('[data-die="'+side+'"]'),die=host.querySelector('.watch-die');
      host.classList.add('waiting');host.querySelector('span').textContent='대기';die.setAttribute('aria-label','주사위 대기');
      later(()=>{
        arena.dataset.phase=side+'-roll';host.classList.remove('waiting');host.classList.add('rolling');host.querySelector('span').textContent=side==='player'?'내 주사위':'적 주사위';
        sound('dice');
        for(let i=0;i<8;i++)later(()=>faceIcon(die,1+(i*5+(side==='player'?0:3))%6),i*75);
        later(()=>{
          const face=roll[side+'Face'],action=roll[side];host.classList.remove('rolling');host.classList.add('chosen');faceIcon(die,face);
          host.querySelector('span').textContent=names[action];die.setAttribute('aria-label',names[action]+' 주사위');
          animate(die,[{transform:'scale(1.25) rotate(-8deg)'},{transform:'scale(.94)'},{transform:'scale(1)'}],{duration:230});
        },600);
      },at);
    }
    if(roll){diceTurn('player',0);diceTurn('enemy',800);}else arena.dataset.phase='reveal';
    later(()=>{arena.dataset.phase='reveal';},lead);
    function skillFlare(side,key,at){if(!key)return;later(()=>{
      const def=(side==='player'?DiceCombat.skills:DiceCombat.enemySkills)[key],banner=document.createElement('div');
      banner.className='watch-skill-flare '+key+' '+side;banner.dataset.skillSide=side;banner.innerHTML=icon(def.icon)+'<b>'+def.name+'</b>';
      // Timer callbacks may arrive late on busy devices; never overlap action callouts.
      arena.querySelectorAll('.watch-skill-flare').forEach(node=>node.remove());
      arena.append(banner);nodes.push(banner);later(()=>banner.remove(),650);
      animate(actors[side],[{filter:'brightness(1)'},{filter:'brightness(1.8) drop-shadow(0 0 14px '+(key==='counter'?'#73eac7':side==='enemy'?'#ff986d':'#ffd67a')+')',offset:.4},{filter:'brightness(1)'}],{duration:700});
    },at);}
    skillFlare('player',roll?.skill,lead+100);
    if(end.enemy>0)skillFlare('enemy',roll?.enemySkill,lead+760);
    function guard(side){
      const ward=actors[side].querySelector('.watch-ward');
      animate(ward,[{opacity:0,transform:'scale(.5)'},{opacity:1,transform:'scale(1.1)',offset:.2},{opacity:.8,transform:'scale(1)',offset:.85},{opacity:0}],{duration:1200,fill:'forwards'});
    }
    for(const side of ['player','enemy'])if(actions[side]==='block')later(()=>guard(side),lead+150);
    function strike(side,at){
      const target=side==='player'?'enemy':'player',charge=side==='enemy'&&!!roll?.enemySkill,heavy=actions[side]==='heavyStrike'||(side==='player'&&!!roll?.skill)||charge;
      if(actions[side]==='block')return;
      const dir=side==='player'?1:-1;
      const own=actors[side].getBoundingClientRect(),other=actors[target].getBoundingClientRect();
      const dx=(other.left+other.width/2-own.left-own.width/2)*.65,dy=(other.top+other.height/2-own.top-own.height/2)*.65;
      later(()=>{
        arena.dataset.phase=side+'-windup';
        actors[side].dataset.attackAt=String(performance.now());
        actors[side].dataset.attacking='true';
        const contact=`translate(${dx}px,${dy}px) rotate(${charge?0:dir*20}deg) scale(${charge?1.22:heavy?1.16:1.04})`;
        animate(actors[side],[{transform:'translate(0,0) rotate(0)',easing:'ease-in'},{transform:`translate(${-dx*.16}px,${-dy*.16}px) rotate(${-dir*(heavy?26:14)}deg)`,offset:.30,easing:'cubic-bezier(.15,.8,.2,1)'},{transform:contact,offset:.5},{transform:contact,offset:heavy?.66:.60,easing:'ease-out'},{transform:'translate(0,0) rotate(0)'}],{duration:600});
        later(()=>delete actors[side].dataset.attacking,600);
      },at);
      later(()=>{
        arena.dataset.phase=side+'-hit';
        const damage=side==='player'?hit.damage:hit.taken,guarded=actions[target]==='block',held=guarded&&end[target]>0;
        updateHealthMeter(meters[target],end[target],start[target],motionEnabled());
        if(side==='player'&&firstCounter){counterBonus(arena);bonusStatus?.style.removeProperty('visibility');}
        burst(actors[target],guarded?'guarded':charge?'charge':side==='player'&&roll?.skill==='counter'?'counter':heavy?'heavy':'slash',damage);
        const result=guarded?(held?(charge?'stopped':'guard'):'broken'):charge?'direct':null;
        if(result)reaction(actors[target],result,charge?DiceCombat.enemySkills[roll.enemySkill].name:null);
        if(held){
          const ward=actors[target].querySelector('.watch-ward');
          animate(ward,[{opacity:1,transform:'scale(1)'},{opacity:1,transform:'scale(.82,1.1)',filter:'brightness(1.5)',offset:.18},{opacity:.9,transform:'scale('+ (charge?1.3:1.15)+')',offset:.4},{opacity:0,transform:'scale(1.05)',filter:'brightness(1)'}],{duration:charge?550:400,fill:'forwards'});
          // Deflection replaces the remaining lunge at contact, keeping the original turn timing.
          animate(actors[side],[{transform:`translate(${dx}px,${dy}px) rotate(${charge?0:dir*20}deg) scale(${charge?1.22:heavy?1.16:1.04})`},{transform:`translate(${dx-dir*(charge?42:22)}px,${dy+dir*16}px) rotate(${-dir*18}deg) scale(.95)`,offset:.36},{transform:'translate(0,0) rotate(0)'}],{duration:300,easing:'ease-out'});
          if(charge)animate(document.querySelector('[data-skill="counter"]'),[{transform:'scale(1)',filter:'brightness(1)'},{transform:'scale(1.18)',filter:'brightness(1.7)',offset:.3},{transform:'scale(1)',filter:'brightness(1)'}],{duration:500});
        }
        const recoil=`translate(${dir*(held?6:charge?40:heavy?28:16)}px,${-dir*(held?3:charge?23:heavy?16:9)}px)`;
        animate(actors[target],[{transform:'translate(0,0)',filter:'brightness(1)'},{transform:recoil,filter:'brightness('+(held?1.25:1.9)+')',offset:.15},{transform:recoil,filter:'brightness(1.3)',offset:.38},{transform:'translate(0,0)',filter:'brightness(1)'}],{duration:held?300:360});
        if(heavy&&!held)animate(arena,[{transform:'translate(0,0)'},{transform:'translate(-4px,2px)'},{transform:'translate(4px,-2px)'},{transform:'translate(0,0)'}],{duration:160});
        sound(held&&charge?'parry':guarded?'block':heavy?'counter':'slash');
      },at+300);
    }
    strike('player',lead+260);
    // The existing model resolves lethal player hits before an enemy reply.
    if(end.enemy>0 && before.enemyKind!=='goblin')strike('enemy',lead+920);
    if(roll?.enemySkill==='escape')later(()=>animate(actors.enemy,[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(75%)'}],{duration:430,fill:'forwards'}),lead+940);
    later(()=>{
      arena.dataset.phase=end.enemy<=0?'victory':end.player<=0?'defeat':'recover';
      const dead=end.enemy<=0?'enemy':end.player<=0?'player':null;
      if(dead)animate(actors[dead],[{opacity:1,transform:'translateY(0)'},{opacity:.65,transform:'translateY(12px) rotate(14deg)',offset:.45},{opacity:0,transform:'translateY(36px) rotate(30deg) scale(.8)'}],{duration:430,fill:'forwards'});
    },lead+(end.enemy<=0?850:1460));
    later(()=>{
      for(const side of ['player','enemy'])updateHealthMeter(meters[side],end[side],end[side],false);
      for(const side of ['player','enemy'])if(end[side]<=0)actors[side].dataset.defeated='true';
      arena.dataset.phase=end.enemy<=0?'victory':end.player<=0?'defeat':'rest';
      if(resolve){const done=resolve;resolve=null;done();}
    },lead+(end.enemy<=0?1350:1900));
    return true;
  }
  return {play,cancel,finished:()=>completion};
})();
