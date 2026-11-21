import { BaseScene } from '../engine/scenes';
import { orders,evidence } from '../core/orders';
import { advanceReceipt,appraisal,available,choices,collect,deliver,finish,hit,money,newGame,orderIndex,tuning,type Ending,type Phase } from '../core/game';
import story from '../core/story.json';
import { art,button,dialog,identity,panel,popup,ui } from './shared';

const nums=['一','二','三'];
const actionNames:Record<Ending,string>={pay:'交出三十两',expose:'当众拿出证据',arrest:'让官差进门'};
const forgePhases:Phase[]=['heat','strike','quench','inspect'];
const detail=(key:string,val:string)=>'<div><dt>'+key+'</dt><dd>'+val+'</dd></div>';
const group=(body:string)=>'<dl class="figures">'+body+'</dl>';
const caption=(title:string,position:string)=>'<div class="scene-caption"><span>'+position+'</span><b>'+title+'</b></div>';
export class PlayScene extends BaseScene {
  private bg!:Phaser.GameObjects.Image;
  private started=0;
  private threatPage=0;
  private note='';
  private clock!:HTMLElement|null;
  private cursor=0;
  private until=0;
  private request?:AbortController;
  constructor(){super('play');}
  private get run(){return this.ctx.game;}
  create(){
    this.bg=this.background('bg_dawn');
    this.started=performance.now();this.threatPage=0;this.note='';this.until=0;
    const click=(e:Event)=>{const target=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');if(target && !target.disabled)this.act(target.dataset.act!);};
    const space=(e:KeyboardEvent)=>{if(e.code==='Space' && !dialog.open && this.run.phase==='strike'){e.preventDefault();if(!e.repeat)this.act('strike');}};
    ui.addEventListener('click',click);dialog.addEventListener('click',click);window.addEventListener('keydown',space);
    this.events.once('shutdown',()=>{this.request?.abort();ui.removeEventListener('click',click);dialog.removeEventListener('click',click);window.removeEventListener('keydown',space);if(dialog.open)dialog.close();});
    this.draw();
  }
  private day(){
    const s=this.run;
    if(s.phase==='night'||s.phase==='threat')return s.completed===3?0:1;
    return Math.floor(orderIndex(s)/3);
  }
  private store(){this.ctx.save.writeRun(this.run);}
  private goto(phase:Phase){this.run.phase=phase;this.store();this.draw();}
  private soundscape(){
    const phase=this.run.phase, day=this.day();
    if(day===2 && !['threat','reminder','final','end'].includes(phase))this.music('bgm_embers',.44);
    else if(['threat','reminder','final','end','night'].includes(phase))this.music();
    else this.music(day===1?'bgm_dusk':'bgm_main',.32);
  }
  private draw(){
    this.request?.abort(); this.clock=null;
    const s=this.run,i=orderIndex(s),o=orders[i],p=s.phase,day=this.day();
    const forge=forgePhases.includes(p),night=['threat','reminder','final'].includes(p);
    let bg=forge?'bg_dawn':night?'bg_street_night':p==='night'?'bg_backyard':p==='letter'?'bg_dawn':'bg_shop';
    if(p==='end')bg=s.ending==='expose'?'bg_dawn':s.ending==='leave'?'bg_street_night':'bg_backyard';
    this.bg.setTexture(bg).setDisplaySize(1280,720);
    this.soundscape();
    ui.className='play day'+day+(forge?' forging':'')+(night?' ominous':'')+(p==='end'?' ending':'');
    const goal=s.threatSeen?'第三日黄昏前筹银　'+money(s.silver)+' / 30 两':'独立看店，等师傅查账';
    const hdr='<header>'+identity()+'<div class="hud"><span>第'+nums[day]+'日</span><span>银两 <b>'+money(s.silver)+'</b></span><span>口碑 <b>'+s.rep+'</b></span>'+button('journal','手记','mini')+'</div></header>';
    let body='';
    const figure=(id:string,name:string,where:string)=>'<div class="character">'+art(id,'person')+'</div>'+caption(name,where);
    const npc=(mood='neutral')=>figure('char_'+o.portrait+'_'+mood,o.name,'青溪 · 来客');
    const ticket='订单 '+String(i+1).padStart(2,'0')+' / 09';
    const job=group(detail('器型',o.item+' × 1')+detail('最高酬银',o.max+' 两'));
    if(p==='letter'){
      body=caption('青溪县','大晟 · 景和二十三年')+panel('柜上 · 师傅手书','给徒弟的一封信',story.letter,button('open','收好信，开门迎客　→'),'<div class="sign">老周　手启</div>');
    }else if(p==='order'){
      const catchup=s.threatSeen?button('search',this.run.completed===7?'看看后院的箱底':'查看铺里','quiet'):'';
      body=npc()+panel(ticket+'　｜　'+o.use,o.item+'委托','“'+o.line+'”',button('accept','接下这单　→')+(i===5?button('ask','追问营里的事','quiet'):'')+catchup,job);
    }else if(forge){
      const step=p==='heat'?0:p==='strike'?1:p==='quench'?2:3;
      const tools=['tool_furnace_hot','item_'+o.icon,'tool_quench_bucket','item_'+o.icon];
      const headers=['添炭起炉','看准，再落锤','趁热入水','开件验货'];
      const hints=['把铁料送入炉膛，等它烧红。','等指针进入中央亮区再落锤。','三锤已定。将铁件放入水槽，听它冷下来的声音。','顾客等在柜前。交付后，本单酬银和口碑一并记账。'];
      const steps='<div class="steps">'+['加热','锻打','淬火','验货'].map((n,j)=>'<span class="'+(j===step?'active':j<step?'done':'')+'">'+(j<step?'✓ ':String(j+1).padStart(2,'0')+' ')+n+'</span>').join('')+'</div>';
      const t=tuning(i);
      const marks='<div class="marks">'+[0,1,2].map(j=>'<span>'+nums[j]+'锤 <b>'+(['偏锤','命中','正中'][s.hits[j]]??'○')+'</b></span>').join('')+'</div>';
      const meter=p==='strike'?'<div class="meter" style="--yellow:'+t.yellow*200+'%;--green:'+t.green*200+'%"><i></i><em></em><b id="needle"></b></div>'+marks:'';
      const feedback=p==='inspect'?group(detail('成色',appraisal(s.hits,i).grade)+detail('应收',money(appraisal(s.hits,i).money)+' 两')):'';
      const actions=[['heat','点炉加热'],['strike','落锤　↧'],['quench','入水淬火'],['deliver','交给'+o.name+'　→']][step];
      body='<div class="workpiece" id="piece">'+art(tools[step],'work-art')+'</div>'+caption(o.item,'砧上 · '+ticket)+panel(ticket+'　｜　'+o.name,headers[step],hints[step],button(actions[0],actions[1])+(p==='strike'?'<small>空格 / 点按</small>':''),steps+meter+feedback+'<div id="hit-note" aria-live="polite">'+(p==='strike'||p==='quench'?this.note:'')+'</div>');
    }else if(p==='receipt'){
      const a=appraisal(s.hits,i);
      body=npc(a.grade==='瑕疵'?'sad':'happy')+panel(ticket+'　｜　收讫',o.item+' · '+a.grade,'<span id="voice"></span><small id="voice-source"></small>',button('next',s.completed===9?'合上账本　→':s.completed%3===0?'收拾柜台　→':'记下这单　→'),group(detail('入账','+'+money(a.money)+' 两')+detail('口碑',(a.rep>0?'+':'')+a.rep)));
    }else if(p==='threat'||p==='reminder'||p==='final'){
      const speaker=figure('char_guard_neutral','陈捕头','青溪县衙 · 来访');
      if(p==='threat'){
        const scene=story.threat[this.threatPage];
        body=speaker+panel('第一日 · 黄昏',scene[0],scene[1],button('threat',this.threatPage?'记下期限　→':'接过公文　→'),this.threatPage?'<div class="newgoal"><s>获得师傅认可</s><strong>第三日黄昏前　筹银三十两</strong></div>':'');
      }else if(p==='reminder')body=speaker+panel('第二日 · 上午','门槛上的靴印',story.reminder,button('return','等他走远，回到柜台　→'));
      else body=speaker+panel('第三日 · 黄昏','门外有人等账',story.final,choices(s).map(e=>button(e,actionNames[e],e==='expose'?'secondary':'primary')).join('')+button('search','最后看看铺子','quiet'),group(detail('手中银两',money(s.silver)+' / 30')+detail('已取证物',s.clues.filter(Boolean).length+' / 3')+detail('街坊口碑',s.rep+' / 60')));
    }else if(p==='night'){
      const first=s.completed===3;
      body=caption('打烊以后','城西 · '+(first?'柜台':'后院'))+panel('第'+nums[day]+'日 · 夜',''+(first?'柜脚有张散页':'后院的旧木箱'),first?'门闩落下，一张揉皱的纸从柜台底下滑了出来。离他再来还有两日。':'明天黄昏，官差就要来。信里那句“不要乱动”，你已经看了三遍。',button('search',first?'弯腰看一看':'去后院看看')+button('return','熄灯，明早开铺','quiet')+(!first && s.chest?button('escape','趁夜离开青溪','quiet'):''));
    }else if(p==='end'){
      const ending=story.endings[s.ending!];
      body=caption(ending[0],'青溪县志 · 卷末')+panel('终章　 /　经营结算',ending[0],ending[1]+'<br><em>'+ending[2]+'</em>',button('restart','再开一次炉　↺')+button('cover','回到封面','quiet'),group(detail('总收入',money(s.silver+s.paid)+' 两')+detail('实际支付',money(s.paid)+' 两')+detail('交付',s.completed+' / 9')+detail('连中',s.best+' 锤')+detail('口碑',String(s.rep))+detail('证物',s.clues.filter(Boolean).length+' / 3')));
    }
    ui.innerHTML=hdr+'<div class="stage-body">'+body+'</div><footer>'+ (p==='end'?'三日之约 · 卷终':p==='letter'?'城西 · 清晨':goal)+'</footer>';
    this.clock=ui.querySelector('#needle');
    if(this.clock)this.update();
    if(p==='receipt')void this.reply(i);
  }
  update(){
    if(!this.clock || dialog.open)return;
    const period=tuning(this.run.completed).period;
    const phase=((performance.now()-this.started)%period)/period;
    this.cursor=1-Math.abs(phase*2-1);
    this.clock.style.left=String(this.cursor*100)+'%';
  }
  private async reply(i:number){
    const grade=appraisal(this.run.hits,i).grade;
    const voice=ui.querySelector('#voice')!,source=ui.querySelector('#voice-source')!;
    voice.textContent='“'+story.voices[i][grade==='瑕疵'?0:grade==='合格'?1:2]+'”';
    const ordinary=i!==5 && i!==8;
    source.textContent=ordinary?'顾客回应 · 本地台词':'顾客回应';
    if(!ordinary || !/^https?:$/.test(location.protocol))return;
    const controller=new AbortController(); this.request=controller;
    const timer=setTimeout(()=>controller.abort(),3750);
    try{
      const res=await fetch('/api/customer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({index:i,grade}),signal:controller.signal});
      if(!res.ok)return;
      const data=await res.json();
      if(voice.isConnected && data.source==='model' && typeof data.line==='string'){
        voice.textContent='“'+data.line+'”';source.textContent='顾客回应 · AI 即兴';
      }
    }catch{/* 本地台词已显示，交付无需等待网络。 */}finally{clearTimeout(timer);}
  }
  private journal(){
    const s=this.run;
    popup('铺中手记','<p>师傅留下的信</p><blockquote>'+story.letter+'</blockquote>'+(s.threatSeen?'<h3>第三日黄昏前，筹银三十两</h3><p>手中 '+money(s.silver)+' 两。陈捕头还要看你怎么答。</p><h3>已收下的证物</h3>'+(s.clues.some(Boolean)?evidence.filter((_,i)=>s.clues[i]).map(e=>'<p><b>'+e.name+'</b><br>'+e.text+'</p>').join(''):'<p>还没有收下证物。</p>'):''));
  }
  private search(){
    const s=this.run;
    const box=s.completed>=6;
    const options=evidence.map((e,i)=>available(s,i)?button('clue'+i,e.object+(s.clues[i]?'　✓':''),'investigate'):'').join('');
    popup('铺里走一走','<p>灯还亮着。你想仔细看哪一处？</p>',options+(box?button('chest',s.chest?'再看木箱内层':'掀开后院木箱','investigate'):''));
  }
  private act(a:string){
    const s=this.run,p=s.phase;
    if(a==='close'){dialog.close();return;}
    if(a==='journal'){this.journal();return;}
    if(a==='search' && s.threatSeen){this.search();return;}
    if(a.startsWith('clue')){
      const id=Number(a.slice(4));if(!available(s,id))return;
      collect(s,id);this.store();this.sfx('sfx_tick');this.draw();
      popup(evidence[id].name,'<div class="exhibit">'+art(['item_order_slip','item_scrap','item_order_slip'][id],'exhibit-art')+'<p>'+evidence[id].text+'</p></div>'+(s.clues.every(Boolean)?'<blockquote>'+story.deduction+'</blockquote>':''),button('search','继续查看','quiet'));return;
    }
    if(a==='chest' && s.completed>=6){
      s.chest=true;this.store();this.draw();popup('生锈的铜扣','<div class="exhibit">'+art('item_chest','exhibit-art')+'<p>'+story.chest+'</p></div>',available(s,2)?button('clue2',evidence[2].object):'');return;
    }
    if(a==='ask' && p==='order' && s.completed===5){
      popup('秦军户压低了声音','<p>“少的是营里的甲。寻常铺子打一把刀不稀奇，私接这些可要坐牢。我在你们铺子旁捡着一片，你自己看。”</p>',button('clue1','接过甲片，看清戳印'));return;
    }
    if(a==='escape' && p==='night' && s.chest){popup('要在今夜离开吗？','<p>从后门去渡口。余下三单留在这里，这次看店就此结束。</p>',button('leave','带上碎银，去渡口'));return;}
    if(a==='leave' && p==='night' && s.chest){dialog.close();s.ending='leave';this.goto('end');return;}
    if(a==='open' && p==='letter'){this.goto('order');return;}
    if(a==='accept' && p==='order'){this.note='';s.hits=[];this.goto('heat');return;}
    if(a==='heat' && p==='heat'){this.sfx('sfx_hiss',{volume:.55});this.started=performance.now();this.goto('strike');return;}
    if(a==='strike' && p==='strike'){
      if(performance.now()<this.until)return;
      this.until=performance.now()+180;
      const v=hit(s,this.cursor);if(v===undefined)return;
      this.note=['偏锤 · 再稳一点','命中 · 一声脆响','正中 · '+s.streak+' 连击'][v];
      this.sfx(['sfx_miss','sfx_hammer_light','sfx_hammer_heavy'][v]);
      this.store();this.draw();this.fx(v===0?'fx_crack':'fx_spark');return;
    }
    if(a==='quench' && p==='quench'){this.sfx('sfx_hiss');this.goto('inspect');this.fx('fx_steam');return;}
    if(a==='deliver' && p==='inspect'){deliver(s);this.sfx('sfx_coin');this.store();this.draw();return;}
    if(a==='next' && p==='receipt'){advanceReceipt(s);this.store();this.draw();if(s.phase==='threat'){this.sfx('sfx_knock');this.shake();}return;}
    if(a==='threat' && p==='threat'){if(!this.threatPage){this.threatPage=1;this.sfx('sfx_scrap');this.shake();this.draw();}else{s.threatSeen=true;this.goto('night');}return;}
    if(a==='return' && (p==='reminder'||p==='night')){this.goto('order');return;}
    if(p==='final' && ['pay','arrest','expose'].includes(a)){finish(s,a as Ending);this.store();this.draw();return;}
    if(a==='restart' && p==='end'){this.ctx.game=newGame();this.threatPage=0;this.note='';this.goto('letter');return;}
    if(a==='cover' && p==='end'){this.ctx.save.clearRun();this.ctx.go('title');}
  }
  private shake(){if(!matchMedia('(prefers-reduced-motion: reduce)').matches)this.cameras.main.shake(230,.003);}
  private fx(id:string){
    const piece=ui.querySelector('#piece');if(!piece)return;
    piece.classList.add('impact');piece.insertAdjacentHTML('beforeend',art(id,'flare'));
    this.time.delayedCall(650,()=>piece.querySelector('.flare')?.remove());
  }
}
