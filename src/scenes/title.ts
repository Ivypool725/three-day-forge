import { BaseScene } from '../engine/scenes';
import { newGame } from '../core/game';
import { ui,button,identity } from './shared';
import '../style.css';
export class TitleScene extends BaseScene {
  constructor(){super('title');}
  create(){
    this.background('bg_dawn');
    ui.className='title-screen';
    const run=this.ctx.save.run;
    const resume=run && run.phase!=='end';
    ui.innerHTML='<header>'+identity()+'<span class="meta">大晟 · 景和二十三年</span></header><section class="cover"><div class="cover-kicker">青 溪 县 志　 /　手 艺 卷</div><h1>三日之约</h1><div class="cover-sub">老周的铁匠铺</div><p>师傅留了封信。<br>今天起，你独自看三天铺子。</p><div class="actions">'+button(resume?'resume':'new',resume?'继续看店　→':'推门开铺　→')+(resume?button('new','重新开局','quiet'):'')+'</div></section><footer>青溪县 · 城西街口</footer>';
    ui.onclick=e=>{
      const action=(e.target as HTMLElement).closest('button')?.dataset.act;
      if(!action)return;
      this.ctx.game=action==='resume' && run?run:newGame();
      this.ctx.save.writeRun(this.ctx.game);this.music('bgm_main',.34);this.ctx.go('play');
    };
    this.events.once('shutdown',()=>{ui.onclick=null;});
  }
}
