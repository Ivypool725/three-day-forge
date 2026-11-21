// 游戏状态和规则：只放纯逻辑，不碰画面、键盘、声音，所以能直接写测试。
// 下面只是最小的骨架，按你们的游戏换掉。state 必须能转成 JSON，存档要用。
import type { Config } from '../config';

export interface GameState {
  score: number;
}

export function newGame(config: Config): GameState {
  return { score: config.game.startScore };
}

/** 示例规则：加分，不会扣到负数。换成你们自己的规则，或者加新的函数。 */
export function addScore(state: GameState, points: number) {
  state.score = Math.max(0, state.score + points);
}
