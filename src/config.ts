// 所有可调的数值都放这里，规则和场景都从这里读。加字段时直接加，类型会自动跟着变。
export const CONFIG = {
  view: { width: 1280, height: 720 },
  saveKey: 'laozhou-starter-v1',
  game: {
    startScore: 0,
  },
};

export type Config = typeof CONFIG;
