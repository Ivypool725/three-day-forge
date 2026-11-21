// 存档：写进 localStorage。storage 可替换，方便测试。
import type { GameState } from '../core/game';

const VERSION = 1;
export const SAVE_SLOT_COUNT = 4;

interface SaveData {
  version: number;
  run: GameState | null;
  best: number;
}

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function createSave(key: string, storage: SaveStorage = globalThis.localStorage) {
  let activeSlot = 0;

  function slotKey(slot: number) {
    // Slot 1 uses the original key so existing saves are available immediately.
    return slot === 0 ? key : `${key}:slot:${slot + 1}`;
  }

  function read(slot = activeSlot): SaveData {
    try {
      const data = JSON.parse(storage.getItem(slotKey(slot)) ?? 'null');
      if (data?.version === VERSION) return data;
    } catch {
      // 存档损坏时当作没有存档。
    }
    return { version: VERSION, run: null, best: 0 };
  }

  function write(data: SaveData, slot = activeSlot) {
    try {
      storage.setItem(slotKey(slot), JSON.stringify(data));
      return true;
    } catch (error) {
      console.warn('存档写入失败', error);
      return false;
    }
  }

  return {
    get slots() {
      return Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) => read(slot).run);
    },
    get slotNumber() {
      return activeSlot + 1;
    },
    selectSlot(slot: number) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= SAVE_SLOT_COUNT)
        throw new RangeError('Invalid save slot');
      activeSlot = slot;
    },
    get run(): GameState | null {
      return read().run;
    },
    get best(): number {
      return read().best;
    },
    writeRun(run: GameState) {
      return write({ ...read(), run });
    },
    clearRun(slot = activeSlot) {
      if (!Number.isInteger(slot) || slot < 0 || slot >= SAVE_SLOT_COUNT) return false;
      return write({ version: VERSION, run: null, best: 0 }, slot);
    },
    recordScore(score: number) {
      const data = read();
      write({ ...data, best: Math.max(data.best, score) });
    },
  };
}

export type Save = ReturnType<typeof createSave>;
