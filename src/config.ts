export const CONFIG = {
  view: { width: 1280, height: 720 },
  shop: { left: 21, start: 31, guest: 71, talkDistance: 17, speed: 55 },
  workshop: {
    heatAnimationMs: 420,
    sound: {
      heat: { id: "sfx_furnace_ignite", startMs: 250, durationMs: 740, fadeInMs: 35, fadeOutMs: 320, volume: 0.36 },
      quench: { id: "sfx_quench", startMs: 0, durationMs: 1100, fadeInMs: 25, fadeOutMs: 700, volume: 0.5 },
    },
  },
  forge: {
    tutorialGreen: 0.2,
    baseGreen: 0.173,
    difficultyStep: 0.022,
    dayStep: 0.012,
    yellowMargin: 0.14,
    minimumOffset: 0.065,
    edgeMargin: 0.02,
    sweepPeriod: 1800,
    dayPeriodStep: 210,
    tutorialExtraPeriod: 260,
    reforgeCost: 5,
  },
  saveKey: "qingxi-forge-run-v1",
  game: { startRep: 50, demand: 300, witnessRep: 60 },
};
export type Config = typeof CONFIG;
