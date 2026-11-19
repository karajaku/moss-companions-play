/* Pure D6 rules shared by the production combat resolver and tests. */
const DiceCombat=(()=>{
  const actions=['strike','strike','strike','block','block','heavyStrike'];
  const skills={heavyStrike:{name:'강공',icon:'hammer',cooldown:3,power:2},counter:{name:'반격',icon:'sword',cooldown:2,power:2.5}};
  const enemySkills = {
    charge: {name:'돌진',icon:'chevrons-up',hint:'힘을 모아 강하게 들이받습니다.'},
    fang: {name:'추격 송곳니',icon:'sword',hint:'내 체력이 절반 이하면 피해가 1.5배가 됩니다.'},
    dust: {name:'꿈가루',icon:'sparkles',hint:'방어하지 않으면 기세 1칸을 잃습니다.'},
    crush: {name:'수정 분쇄',icon:'hammer',hint:'방어해도 피해의 절반이 통과합니다.'},
    bind: {name:'뿌리 감옥',icon:'leaf',hint:'방어하지 않으면 강공 재사용이 1턴 지연됩니다.'},
    breath: {name:'안개 숨결',icon:'sparkles',hint:'내 주사위가 강공이면 숨결 피해가 1.5배가 됩니다.'},
    escape: {name:'줄행랑',icon:'coins',hint:'두 번째 턴이 끝날 때 달아납니다.'},
  };
  function skillStatus(h,key){
    const cooldown=Math.max(0,h.skillCooldowns?.[key]||0);
    const condition=key==='counter'?!!h.counter:(h.rank>=2&&(h.momentum??1)>=2);
    return {cooldown,condition,ready:cooldown===0&&condition};
  }
  const face=rng=>Math.max(1,Math.min(6,1+Math.floor(rng()*6)));
  function turn(h,playerFace,enemyFace) {
    if(![playerFace,enemyFace].every(n=>Number.isInteger(n)&&n>=1&&n<=6)) throw Error('Invalid D6');
    const player=actions[playerFace-1],enemy=actions[enemyFace-1];
    const enabled=h.skillVersion===1 || h.skillVersion===2,cooldowns={heavyStrike:0,counter:0};
    if(enabled)for(const key of Object.keys(skills))cooldowns[key]=Math.max(0,(h.skillCooldowns?.[key]||0)-1);
    const start={...h,skillCooldowns:cooldowns};
    const skill=enabled&&player!=='block'?['counter','heavyStrike'].find(key=>skillStatus(start,key).ready)||null:null;
    const enemySkillState=enabled&&h.enemySkillState?{...h.enemySkillState,cooldown:Math.max(0,h.enemySkillState.cooldown-1)}:null;
    const charge=enemySkillState&&enemySkillState.cooldown===0&&enemy!=='block';
    const power=action=>action==='block'?0:action==='heavyStrike'?1.7:1;
    const mitigation=action=>action==='block'?.25:1;
    const armor=h.enemyKind==='stone'&&player==='strike'&&skill!=='heavyStrike'?.8:1;
    const damage=Math.min(h.enemyHp,Math.round(h.attack*(skill?skills[skill].power:power(player))*mitigation(enemy)*armor));
    // Retain the game's player-first lethal priority; two defensive faces do no damage.
    const key = enemySkillState?.key || 'charge';
    const fires = key === 'escape' ? h.waveTurn >= 2 : charge;
    const enemySkill = fires && damage < h.enemyHp ? key : null;
    const amplified = (enemySkill === 'fang' && h.hp <= h.maxHp / 2) || (enemySkill === 'breath' && player === 'heavyStrike');
    const guard = enemySkill === 'crush' && player === 'block' ? .5 : mitigation(player);
    const taken=damage>=h.enemyHp?0:Math.min(h.hp,Math.round(h.enemyAttack*(enemySkill?enemySkillState.power:power(enemy))*guard*(amplified?1.5:1)*(player==='block'?1-(h.guardReduction||0)/100:1)*(skill==='heavyStrike'?1.5:1)));
    if(skill)cooldowns[skill]=skills[skill].cooldown;
    if(enemySkill)enemySkillState.cooldown=enemySkillState.interval;
    const guarded = player === 'block' && !!enemySkill && enemySkill !== 'escape';
    let momentum = skill === 'heavyStrike' ? 0 : Math.min(2, (h.momentum ?? 1) + Number(player !== 'block' || guarded));
    if (player !== 'block' && enemySkill === 'dust') momentum = Math.max(0, momentum - 1);
    // A cooldown of one expires at the next turn's start. Two defers a ready skill by one turn.
    if (player !== 'block' && enemySkill === 'bind') cooldowns.heavyStrike = Math.max(2, cooldowns.heavyStrike + 1);
    return {playerFace,enemyFace,player,enemy,damage,taken,...(enabled?{skill,enemySkill,enemySkillState,skillCooldowns:cooldowns,counter:skill==='counter'?false:!!h.counter||guarded,momentum}: {})};
  }
  return {actions,skills,enemySkills,skillStatus,face,turn};
})();
if(typeof module!=='undefined') module.exports=DiceCombat;
