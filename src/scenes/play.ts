// 空白场景：封面点「开始」后来到这里。换成你们自己的玩法，需要几个场景就加几个，在 index.ts 登记。
import { BaseScene } from '../engine/scenes';

export class PlayScene extends BaseScene {
  constructor() {
    super('play');
  }

  create() {
    this.cameras.main.setBackgroundColor('#23201d');
    this.label(640, 320, '你们的游戏从这里开始', { size: 44, weight: 700, align: 'center', color: '#eee' });
    this.label(640, 384, '把这个场景换成你们自己的玩法，需要几个场景就加几个', { align: 'center', color: '#aaa' });
    this.button({ x: 640, y: 600, label: '回到封面（Esc）', key: 'Escape', style: 'secondary', onClick: () => this.ctx.go('title') });
  }
}
