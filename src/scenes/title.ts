import { BaseScene } from "../engine/scenes";
import { newGame } from "../core/game";
import { ui, button, dialog } from "./shared";
import "../style.css";

type Mode = "new" | "continue";

export class TitleScene extends BaseScene {
  constructor() {
    super("title");
  }

  create() {
    this.background("bg_forge_blur");
    ui.className = "title-screen title-home";
    const save = this.ctx.save;
    let mode: Mode | null = null;
    let deleting: number | null = null;

    const render = () => {
      const header = '<h1>三日之约</h1><p class="title-home-subtitle">老周的铁匠铺</p>';
      if (!mode) {
        ui.innerHTML = `<section class="title-home-panel">${header}<div class="title-home-actions">
          ${button("new", "新游戏", "primary title-home-button")}
          ${button("continue", "继续游戏", "quiet title-home-button")}
        </div></section>`;
        return;
      }

      const slots = save.slots;
      const cards = slots.map((run, slot) => {
        const enabled = mode === "new" ? !run : Boolean(run);
        const description = !run ? "空档"
          : run.phase === "end" ? "已结局"
          : `已交付 ${Number(run.completed)} / 9 单`;
        return `<div class="save-slot">
          <button type="button" class="save-slot-open" data-act="slot-${slot}" ${enabled ? "" : "disabled"}>
            存档 ${slot + 1}<small>${description}</small>
          </button>
          ${run ? `<button type="button" class="save-slot-delete" data-act="delete-${slot}" aria-label="删除存档 ${slot + 1}">删除</button>` : ""}
        </div>`;
      }).join("");

      const hint = mode === "new" && slots.every(Boolean) ? "存档已满。删除一格后可以开新局。"
        : mode === "continue" && slots.every((run) => !run) ? "还没有存档，可以返回后选择新游戏。" : "";
      ui.innerHTML = `<section class="title-home-panel title-save-panel">
        <h1>${mode === "new" ? "新游戏" : "继续游戏"}</h1>
        <div class="save-slots">${cards}</div>
        <p class="save-slot-status" role="status">${hint}</p>
        ${button("back", "返回封面", "quiet title-home-button")}
      </section>`;
    };

    const click = (e: Event) => {
      const action = (e.target as HTMLElement).closest("button")?.dataset.act;
      if (!action) return;
      if (action === "new" || action === "continue" || action === "back") {
        mode = action === "back" ? null : action;
        render();
        ui.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
        return;
      }
      if (action.startsWith("delete-")) {
        const slot = Number(action.slice(7));
        if (!save.slots[slot]) return;
        deleting = slot;
        dialog.innerHTML = `<h2 id="folio-title">删除存档 ${slot + 1}？</h2>
          <p>这一格的游戏进度将被清除。</p><div class="actions">
          ${button("cancel-delete", "取消", "quiet")}
          ${button("confirm-delete", "确认删除")}</div>`;
        dialog.showModal();
        dialog.querySelector<HTMLButtonElement>('[data-act="cancel-delete"]')?.focus();
        return;
      }
      if (action === "cancel-delete" || action === "confirm-delete") {
        const slot = deleting;
        deleting = null;
        dialog.close();
        if (action === "confirm-delete" && slot !== null) {
          if (save.clearRun(slot)) {
            render();
            ui.querySelector<HTMLButtonElement>('[data-act="back"]')?.focus();
          } else {
            ui.querySelector(".save-slot-status")!.textContent = "删除失败，请检查浏览器的本地存储设置。";
          }
        }
        return;
      }
      if (!mode || !action.startsWith("slot-")) return;
      const slot = Number(action.slice(5));
      const run = save.slots[slot];
      if (mode === "new" ? run : !run) return;
      save.selectSlot(slot);
      this.ctx.game = run ?? newGame(this.ctx.config, Math.random());
      save.writeRun(this.ctx.game);
      this.music("bgm_main", 0.34);
      this.ctx.go("play");
    };

    render();
    ui.addEventListener("click", click);
    dialog.addEventListener("click", click);
    this.onKey((e) => {
      if (e.code === "Space" && !e.repeat && !dialog.open && document.activeElement === document.body) {
        e.preventDefault();
        ui.querySelector<HTMLButtonElement>(".primary, .save-slot-open:not([disabled])")?.click();
      }
    });
    this.events.once("shutdown", () => {
      ui.removeEventListener("click", click);
      dialog.removeEventListener("click", click);
      if (dialog.open) dialog.close();
    });
  }
}
