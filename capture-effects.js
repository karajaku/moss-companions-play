"use strict";
// Both games supply an already committed outcome. This layer only animates it.
const CaptureEffects = (() => {
  let flight = null;
  function cancel() {
    if (!flight) return;
    const current = flight;
    flight = null;
    for (const animation of current.animations) animation.cancel();
    current.layer.remove();
    delete current.arena.dataset.capturePhase;

  }
  async function play({arena, source, target, grade, success, motion = true}) {
    cancel();
    if (!arena?.isConnected || !source?.isConnected || !target?.isConnected || document.hidden) return false;
    const layer = document.createElement("div");
    layer.className = "core-flight";
    layer.innerHTML = '<div class="core-projectile"><span class="core-shell"></span></div><div class="core-lock"><i></i><i></i><i></i></div><span class="core-status" role="status"></span>';
    layer.dataset.grade = ["woven","reinforced","prism"].includes(grade) ? grade : "woven";
    arena.append(layer);
    const bounds = layer.getBoundingClientRect();
    const from = source.getBoundingClientRect(), to = target.getBoundingClientRect();
    const point = (r,x,y) => ({left:(r.left+r.width*x-bounds.left)/bounds.width*100+'%',
      top:(r.top+r.height*y-bounds.top)/bounds.height*100+'%'});
    if (!bounds.width || !bounds.height) { layer.remove(); return false; }
    const start = point(from,.56,.44), end = point(to,.5,.50);
    const middle = {left:(parseFloat(start.left)+parseFloat(end.left))/2+'%',
      top:Math.min(parseFloat(start.top),parseFloat(end.top))-Math.min(18,7200/bounds.height)+'%'};
    const projectile = layer.querySelector(".core-projectile"), lock = layer.querySelector(".core-lock");
    const status = layer.querySelector(".core-status");
    Object.assign(projectile.style,end);
    Object.assign(lock.style,end);
    Object.assign(status.style,end);
    const current = flight = {arena,layer,animations:[]};
    const phase = (key,label) => { arena.dataset.capturePhase = key; status.textContent = label; };
    function animate(node,frames,duration,easing = "ease-in-out") {
      const animation = node.animate(frames,{duration,easing,fill:"both"});
      current.animations.push(animation);
      return animation.finished;
    }
    try {
      if (!motion) {
        phase("lock","잠금 확인");
        await animate(projectile,[{opacity:1},{opacity:1}],220);
        return flight === current;
      }
      phase("launch","코어 발사");
      await animate(projectile,[{...start,transform:"translate(-50%,-50%) scale(.55) rotate(-100deg)"},
        {...middle,offset:.48,transform:"translate(-50%,-50%) scale(1.04) rotate(6deg)"},
        {...end,transform:"translate(-50%,-50%) scale(.88) rotate(72deg)"}],600);
      phase("contain","수납 중");
      await Promise.all([
        animate(target,[{scale:"1",filter:"brightness(1)"},{offset:.35,scale:"1.05",filter:"brightness(2.2)"},
          {scale:".04",opacity:0,filter:"brightness(3)"}],360),
        animate(lock,[{scale:"2.1",opacity:0},{offset:.25,opacity:1},{scale:".58",opacity:.9}],360)
      ]);
      phase("lock","잠금 확인");
      await animate(projectile,[{rotate:"0deg"},{rotate:"-21deg",offset:.16},{rotate:"16deg",offset:.32},
        {rotate:"0deg",offset:.47},{rotate:"-14deg",offset:.68},{rotate:"10deg",offset:.82},{rotate:"0deg"}],800);
      if (success) {
        phase("caught","봉인 완료");
        await animate(lock,[{scale:".7",opacity:1},{scale:"1.45",opacity:.85},{scale:"1.7",opacity:0}],510);
      } else {
        phase("escape","잠금 해제");
        await Promise.all([
          animate(target,[{scale:".05",opacity:0},{offset:.65,scale:"1.08",opacity:1},{scale:"1",opacity:1}],480),
          animate(projectile,[{opacity:1,scale:"1"},{opacity:0,scale:".65",translate:"0 24px"}],480)
        ]);
      }
      return flight === current;
    } catch (error) {
      if (flight !== current || error.name === "AbortError") return false;
      throw error;
    } finally {
      if (flight === current) cancel();
    }
  }
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancel(); });
  window.addEventListener("pagehide", cancel);
  return {play,cancel,get active(){return !!flight;}};
})();
