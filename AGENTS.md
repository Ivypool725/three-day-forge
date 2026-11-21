# 给 AI 的项目说明

这是一个网页小游戏《老周的铁匠铺》，由几名学生在 3 小时内和你一起完成。用中文回复。

## 运行

| 命令 | 作用 |
|---|---|
| `npm install` | 第一次拿到项目时装依赖 |
| `npm run dev` | 开发服务器，浏览器打开 http://localhost:5173 ，改代码后页面自动刷新 |
| `npm run check` | 类型检查 + 跑 `tests/` 里的测试，**每次改完都要跑，必须全部通过** |
| `npm run shot` | 自动打开游戏、按空格走一遍流程，每个场景截图到 `shots/`，并打印文字报告（场景、画面是否为空、控制台报错） |
| `npm run pack` | 打包成一个 `release/index.html`，双击就能玩，交作品用 |

技术栈：TypeScript + Vite + **Phaser 4**（2D 游戏框架）。不用 Unity、Godot、Cocos 这类引擎。需要装新的 npm 包时，先说明用途、等用户同意；不要改 `package.json` 里已有的脚本。

**注意 Phaser 版本是 4。** 你记得的多半是 Phaser 3 的写法，大部分照样能用（场景、`this.add`、`this.tweens`、`this.time`、输入事件），但 Phaser 3 的 `setPipeline`、`postFX` / `preFX`、`BitmapMask` 在 4 里没有了，发光、模糊、遮罩这类效果改用 filters（`obj.enableFilters()`）。拿不准的 API 先查 `node_modules/phaser/types/phaser.d.ts`，或者换一种写法，不要硬猜。

## 文件分工（最重要）

游戏分三层，每层只做自己的事：

| 层 | 文件 | 规矩 |
|---|---|---|
| ① 规则（内核） | `src/core/` | 游戏状态 `GameState` 和规则函数，起步只有 `game.ts` 里的最小骨架，按你们的游戏换掉。只放纯逻辑。**不能用 `document`、`window`、Canvas、键盘、声音**。`state` 必须能转成 JSON（存档要用）。可以拆成多个文件，规矩相同 |
| ② 操作 + ③ 表现 | `src/scenes/` | 读键盘和点击、画画面、放声音。起步只有封面 `title.ts` 和空白的 `play.ts`。一个场景一个文件，写好在 `src/scenes/index.ts` 登记。**不要在这里写规则判定**，判定写进 core 再调用 |
| 数值 | `src/config.ts` | 所有可调的数字都放这里，规则和场景都从这里读，不要把数字写死在代码里 |
| 框架 | `src/engine/`、`src/main.ts`、`tools/` | 一般不要改；确实要改时先说明原因，等用户同意 |

用户说“只允许修改某个文件”时，严格遵守；需要改别的文件，先停下来说明。

**类型是组员之间的约定。** `GameState` 和你们以后加的类型都定义在 `src/core/`，几个人的代码都靠它们对接。改了类型以后跑 `npm run check`，照着报错把用到的地方一处处改好；不要用 `any`、`as any`、`@ts-ignore` 把报错压下去。

## 游戏结构

起步模板不预设玩法：封面 `title` → 空白场景 `play`，其余由你们按 `GAME_CARD.md` 设计。

- 需要几个场景就加几个，场景之间用 `this.ctx.go('名字')` 切换。
- 游戏状态放在 `this.ctx.game`（类型是 `src/core/game.ts` 的 `GameState`），规则判定写成 core 里的函数，场景只调用它们。
- 想存档就调用 `this.ctx.save.writeRun(this.ctx.game)`，封面上会出现「继续」；`this.ctx.save.recordScore(分数)` 记最高分。

## 场景怎么写

一个场景是一个继承 `BaseScene`（`src/engine/scenes.ts`）的类，用 Phaser 原生的写法。照着 `src/scenes/play.ts` 写：

```ts
export class PlayScene extends BaseScene {
  constructor() { super('play'); }            // 场景名
  create() {                                  // 进入场景时搭画面
    this.background('bg_market');
    const hero = this.art('char_apprentice_neutral', 640, 480, 200);
    this.onKey((e) => { if (e.code === 'Space') { /* 做点什么 */ } });
  }
  update(time: number, delta: number) {}      // 每帧调用，delta 单位是毫秒
}
```

- 画面坐标固定 1280 × 720，图片默认以中心定位。
- `BaseScene` 提供的方法：`this.art(id, x, y, 宽)` 放图、`this.background(id)` 铺满背景、`this.label(x, y, 文字)` 写字、`this.button({...})` 加按钮、`this.onKey(e => ...)` 听按键、`this.sfx(id)` 放音效、`this.music(id)` 放背景音乐。
- **按键用 `this.onKey`，不要用 `this.input.keyboard.on`**：后者切场景时会把同一次按键再发给新场景，按一下空格会连跳两步。点击用 Phaser 自己的 `obj.setInteractive()` 加 `obj.on('pointerdown', ...)`。
- 动画用 `this.tweens.add`，延时用 `this.time.delayedCall`，不要用 `setTimeout` / `setInterval`：场景切走时它们不会自动停。
- 场景每次进入都会重新跑 `create()`，场景类里的字段要在 `create()` 开头重置。
- 用 Container 做可点击的组合时，点击区域以容器坐标为中心，里面的东西要相对中心摆（参考 `src/engine/ui.ts` 的 `addButton`）。
- 当前游戏状态在 `this.ctx.game`，配置在 `this.ctx.config`，切场景用 `this.ctx.go('名字')`。浏览器控制台里可以用 `__game` 查看。

## 素材

可用素材见 **`assets/ASSETS.md`**，写画面之前先读它。

- 纹理 key 就是素材 ID：`this.art('item_sword', x, y, 宽)` 或 `this.add.image(x, y, 'item_sword')`；声音 `this.sfx('sfx_hammer_heavy')`。不要写文件路径，不要自己 `this.load.image`，不要在代码里 `import` 图片，素材已经在启动时按 `assets/manifest.json` 全部加载好了。
- 文件缺失时会显示灰色占位块或播合成音，不算 bug，不要为此改代码。
- 需要的素材不在列表里：先用 `this.add.rectangle`、`this.add.circle` 或文字代替，告诉用户缺什么，不要停下来等素材。

## 换身份：请你用某个身份看游戏

用户说「请你用某某身份……」，或者用 `/role-newbie`、`/role-critic`、`/role-numbers` 时（斜杠命令只在 Claude Code 里有，别的工具直接说「请你用新手身份看游戏」即可），读 `prompts/roles.md` 里对应的一节，照它做。

- 用某个身份看游戏时，**只出意见，不修改、不新建任何文件**，哪怕你觉得问题很明显。改不改由用户决定。
- 文件还是占位内容时，直接说「还是占位，没有可评的」，不要编。
- 用户说「回到程序员」或开始让你改代码，你就回到平时的工作方式。

## 工作方式

1. **一次只做一件小事。** 用户的要求很大时（比如“把游戏做完”），先列出 3–5 个小步骤，请用户确认后从第一步开始。
2. 每次改完：
   - 跑 `npm run check`，必须全部通过；
   - 改了画面的，再跑 `npm run shot`，读它打印的报告：有报错先修；报告说「画面几乎是纯色」说明什么都没画出来。能看图片的话，打开 `shots/` 里对应的截图看一眼；
   - 用一两句话告诉用户**改了哪些文件**，以及**打开浏览器后该怎么操作、应该看到什么**，请用户亲手玩一遍。
3. 改了 `src/core/` 的规则，就在 `tests/` 里补对应的测试（vitest，文件名 `*.test.ts`）。测试直接 import core 的函数，不碰画面。
4. 用户说“写个机器人”时：在 `tests/` 里写一个用固定策略自动玩完整局的测试（只调用 core 的函数），比较不同策略的得分，比如“乱按”应该明显比“打得准”差。
5. 手感（快慢、轻重、难度）你判断不了，只能给初值。把这些数放进 `config.ts`，告诉用户该调哪个。
6. 浏览器控制台报错时，用户会把报错贴给你。先找原因再改，不要靠加 `try/catch` 把错误藏起来。
7. 同一个问题改了两次还没好，停下来，说明你的判断，建议用户用 git 回到上一个能玩的版本。
