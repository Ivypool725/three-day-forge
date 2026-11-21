import { describe, it, expect } from "vitest";
import {
  newGame,
  hit,
  deliver,
  advanceReceipt,
  collect,
  choices,
  finish,
  forgeTarget,
  tuning,
} from "../src/core/game";
import { createSave } from "../src/engine/save";

describe("三日账本", () => {
  it.each([
    [2, 450, 77],
    [1, 360, 68],
    [0, 225, 23],
  ])("按每锤 %s 分验算九单", (points, earned, rep) => {
    const s = newGame();
    for (let i = 0; i < 9; i++) {
      s.phase = "strike";
      s.hits = [];
      for (let j = 0; j < 3; j++) {
        const { center, green, yellow } = forgeTarget(s);
        const pos = points === 2 ? center : points === 1 ? center + (green + yellow) / 2 : 0;
        expect(hit(s, pos)).toBe(points);
      }
      expect(s.phase).toBe("quench");
      expect(hit(s, 0.5)).toBeUndefined();
      s.phase = "inspect";
      deliver(s);
      deliver(s);
      expect(s.completed).toBe(i + 1);
      advanceReceipt(s);
    }
    expect([s.silver, s.rep, s.phase]).toEqual([earned, rep, "final"]);
    if (points === 2) expect(s.best).toBe(27);
  });
  it("高难度窗口更窄，落点换边且每局位置不同", () => {
    expect(tuning(2).green).toBeLessThan(tuning(1).green);
    expect(tuning(4).green).toBeLessThan(tuning(1).green);
    expect(tuning(8).green).toBeLessThan(tuning(5).green);
    const s = newGame(undefined, 0.37);
    expect(forgeTarget(s).center).not.toBe(forgeTarget(newGame(undefined, 0.81)).center);
    s.phase = "strike";
    for (let i = 0; i < 9; i++) {
      s.completed = i;
      s.hits = [];
      let previousSide = 0;
      for (let j = 0; j < 3; j++) {
        const { center, yellow } = forgeTarget(s);
        const side = Math.sign(center - 0.5);
        expect(side).not.toBe(0);
        expect(side).not.toBe(previousSide);
        expect(center - yellow).toBeGreaterThan(0);
        expect(center + yellow).toBeLessThan(1);
        previousSide = side;
        s.hits.push(2);
      }
    }
  });
  it("银两、口碑或任一证据跨过门槛才开放对应结局", () => {
    const s = newGame();
    s.phase = "final";
    s.silver = 299;
    s.rep = 59;
    s.clues.fill(true);
    expect(choices(s)).toEqual(["arrest"]);
    s.silver++;
    expect(choices(s)).toEqual(["pay"]);
    s.rep++;
    expect(choices(s)).toEqual(["pay", "expose"]);
    for (let i = 0; i < 3; i++) {
      s.clues[i] = false;
      expect(choices(s)).toEqual(["pay"]);
      s.clues[i] = true;
    }
    finish(s, "pay");
    finish(s, "pay");
    expect([s.silver, s.paid, s.ending]).toEqual([0, 300, "pay"]);
  });
  it("调查按时间和实际动作触发，重开清理证物", () => {
    const s = newGame();
    for (let i = 0; i < 3; i++) collect(s, i);
    expect(s.clues.some(Boolean)).toBe(false);
    s.threatSeen = true;
    s.completed = 7;
    collect(s, 2);
    expect(s.clues[2]).toBe(false);
    s.chest = true;
    for (let i = 0; i < 3; i++) collect(s, i);
    expect(s.clues.every(Boolean)).toBe(true);
    expect(newGame().clues.some(Boolean)).toBe(false);
    expect(tuning(6).period).toBeLessThan(tuning(1).period);
  });
  it("刷新后恢复锤数和已发现的证物", () => {
    const mem = new Map<string, string>();
    const save = createSave("forge", {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => {
        mem.set(k, v);
      },
    });
    const s = newGame();
    s.phase = "strike";
    delete s.forgeSeed;
    hit(s, forgeTarget(s).center);
    const target = forgeTarget(s);
    save.writeRun(s);
    expect(save.run).toEqual(s);
    expect(forgeTarget(save.run!)).toEqual(target);
    save.clearRun();
    expect(save.run).toBeNull();
  });
});
