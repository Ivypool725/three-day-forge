import { appraisal, forgeTarget, money, type GameState, type Phase } from "../core/game";
import { orders } from "../core/orders";
import { art } from "./shared";
import "./workshop.css";

const steps = {
  heat: { action: "heat", hint: "点炉膛，把铁坯烧红。" },
  strike: { action: "strike", hint: "指针进绿区时点铁砧，或按空格。" },
  quench: { action: "quench", hint: "铁坯已打好，点水槽淬火。" },
  inspect: { action: "deliver", hint: "成品已出炉，递给柜台的顾客。" },
} as const;

type WorkshopPhase = keyof typeof steps;

export function isWorkshopPhase(phase: Phase): phase is WorkshopPhase {
  return Object.hasOwn(steps, phase);
}

export function workshopMarkup(index: number) {
  const o = orders[index];
  return `
    <section class="workshop" aria-label="铁匠铺工作区">
      <div class="workshop-floor">
        <button type="button" class="work-station furnace" data-act="heat">
          ${art("tool_furnace_hot", "station-art")}
          <span class="station-tag">炉膛 <b>加热</b></span>
        </button>
        <button type="button" class="work-station anvil-station" data-act="strike">
          ${art("station_anvil", "station-art")}
          ${art("station_hammer", "station-hammer")}
          <span class="station-tag">铁砧 <b>落锤</b></span>
        </button>
        <button type="button" class="work-station water" data-act="quench">
          ${art("tool_quench_bucket", "station-art")}
          <span class="station-tag">水槽 <b>淬火</b></span>
        </button>
        <button type="button" class="work-station counter" data-act="deliver">
          ${art("face_" + o.portrait, "counter-portrait")}
          <span class="station-tag">${o.name} <b>交付</b></span>
        </button>
        <div class="workshop-piece" aria-hidden="true">
          ${art("station_hot_ingot", "workshop-ingot")}
          ${art("item_" + o.icon, "workshop-finished")}
        </div>
        <div class="workshop-timing" hidden>
          <div class="meter" aria-hidden="true">
            <i></i><em></em><b id="needle"></b>
          </div>
          <div class="marks">
            <span>一锤 <b>○</b></span><span>二锤 <b>○</b></span><span>三锤 <b>○</b></span>
          </div>
          <p id="hit-note" role="status"></p>
        </div>
      </div>
      <aside class="work-order" aria-label="当前订单">
        <span class="meta">订单 ${String(index + 1).padStart(2, "0")} / ${orders.length}</span>
        <div class="work-order-item">
          ${art("item_" + o.icon, "order-icon")}
          <div><h1>${o.item}</h1><p>${o.name} · 最高 ${o.max} 两</p></div>
        </div>
        <p class="work-order-hint" role="status"></p>
        <strong class="work-order-result" hidden></strong>
      </aside>
    </section>`;
}

export function updateWorkshop(
  root: HTMLElement,
  state: GameState,
  phase: WorkshopPhase,
  index: number,
  heating: boolean,
  note: string,
) {
  root.dataset.phase = phase;
  root.toggleAttribute("data-heating", heating);

  const step = steps[phase];
  for (const control of root.querySelectorAll<HTMLButtonElement>("button[data-act]")) {
    const active = !heating && control.dataset.act === step.action;
    control.disabled = !active;
    if (active) control.setAttribute("aria-current", "step");
    else control.removeAttribute("aria-current");
  }

  const hint = heating ? "铁坯正在炉里烧红……" : step.hint;
  const hintNode = root.querySelector(".work-order-hint")!;
  if (hintNode.textContent !== hint) hintNode.textContent = hint;
  root.querySelector<HTMLElement>(".workshop-timing")!.hidden = phase !== "strike";
  if (phase === "strike") {
    const { center, green, yellow } = forgeTarget(state);
    const meter = root.querySelector<HTMLElement>(".meter")!;
    meter.style.setProperty("--target", `${center * 100}%`);
    meter.style.setProperty("--green", `${green * 200}%`);
    meter.style.setProperty("--yellow", `${yellow * 200}%`);
  }
  root.querySelector("#hit-note")!.textContent = note || "三锤定成色";
  root.querySelectorAll(".marks b").forEach((mark, index) => {
    mark.textContent = ["偏锤", "命中", "正中"][state.hits[index]] ?? "○";
  });

  const result = root.querySelector<HTMLElement>(".work-order-result")!;
  result.hidden = phase !== "inspect";
  if (!result.hidden) {
    const a = appraisal(state.hits, index);
    result.textContent = `${a.grade} · 应收 ${money(a.money)} 两`;
  }
}
