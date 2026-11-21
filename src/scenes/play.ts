import Phaser from "phaser";
import { BaseScene } from "../engine/scenes";
import { orders, evidence } from "../core/orders";
import {
  advanceReceipt,
  appraisal,
  available,
  choices,
  collect,
  deliver,
  finish,
  hit,
  money,
  newGame,
  orderIndex,
  reforge,
  tuning,
  type Ending,
  type Phase,
} from "../core/game";
import story from "../core/story.json";
import { art, button, dialog, identity, panel, popup, ui } from "./shared";
import { isWorkshopPhase, updateWorkshop, workshopMarkup } from "./workshop";
import { arrivalScene, counterScene, dialogueScene } from "./dialogue";
import { receipt, visitRecord, visits } from "../core/visits";
import { isLocalCounter, openCounterTalk } from "./counter-talk";

const constable = { portrait: "constable", name: "陈捕头" };
const nums = ["一", "二", "三"];
const actionNames: Record<Ending, string> = {
  pay: "交出三十两",
  expose: "当众拿出证据",
  arrest: "让官差进门",
};
const detail = (key: string, val: string) =>
  "<div><dt>" + key + "</dt><dd>" + val + "</dd></div>";
const group = (body: string) => '<dl class="figures">' + body + "</dl>";
const caption = (title: string, position: string) =>
  '<div class="scene-caption"><span>' +
  position +
  "</span><b>" +
  title +
  "</b></div>";
export class PlayScene extends BaseScene {
  private bg!: Phaser.GameObjects.Image;
  private started = 0;
  private threatPage = 0;
  private note = "";
  private workshop: HTMLElement | null = null;
  private heating = false;
  private clock!: HTMLElement | null;
  private cursor = 0;
  private until = 0;
  private muted = false;
  private request?: AbortController;
  private closeCounterTalk?: () => void;
  private enteredVisit = "";
  private questioning = false;
  constructor() {
    super("play");
  }
  private get run() {
    return this.ctx.game;
  }
  create() {
    this.bg = this.background("bg_forge_clear");
    this.muted = this.sound.mute;
    this.started = performance.now();
    this.threatPage = 0;
    this.note = "";
    this.workshop = null;
    this.heating = false;
    this.until = 0;
    this.enteredVisit = "";
    this.questioning = false;
    const click = (e: Event) => {
      const target = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "button[data-act]",
      );
      if (target && !target.disabled) this.act(target.dataset.act!);
    };
    this.onKey((e) => {
      if (dialog.open || document.activeElement instanceof HTMLInputElement) return;
      if (e.code !== "Space") return;
      const focused = document.activeElement;
      if (this.run.phase === "strike") {
        if (focused instanceof HTMLButtonElement && focused.dataset.act !== "strike")
          return;
        e.preventDefault();
        this.act("strike");
      } else if (focused === document.body) {
        e.preventDefault();
        ui.querySelector<HTMLButtonElement>(
          this.workshop
            ? ".workshop [aria-current=step]"
            : ".sheet .primary, .dialogue-box .primary, .shop-dialogue .primary",
        )?.click();
      }
    });
    ui.addEventListener("click", click);
    dialog.addEventListener("click", click);
    this.events.once("shutdown", () => {
      this.closeCounterTalk?.();
      this.request?.abort();
      ui.removeEventListener("click", click);
      dialog.removeEventListener("click", click);
      if (dialog.open) dialog.close();
    });
    this.draw();
  }
  private day() {
    const s = this.run;
    if (s.phase === "end" && s.ending === "leave") return 1;
    if (s.phase === "night" || s.phase === "threat")
      return s.completed === 3 ? 0 : 1;
    return Math.floor(orderIndex(s) / 3);
  }
  private store() {
    this.ctx.save.writeRun(this.run);
  }
  private goto(phase: Phase) {
    this.run.phase = phase;
    this.store();
    this.draw();
  }
  private soundscape() {
    const phase = this.run.phase,
      day = this.day();
    if (day === 2 && !["threat", "reminder", "final", "end"].includes(phase))
      this.music("bgm_embers", 0.44);
    else if (["threat", "reminder", "final", "end", "night"].includes(phase))
      this.music();
    else this.music(day === 1 ? "bgm_dusk" : "bgm_main", 0.32);
  }
  private playWorkshopSound(action: "heat" | "quench") {
    if (this.muted) return;
    const { id, startMs, durationMs, fadeInMs, fadeOutMs, volume } =
      this.ctx.config.workshop.sound[action];
    if (!this.cache.audio.exists(id)) {
      this.sfx("sfx_hiss", { volume });
      return;
    }

    const sound = this.sound.add(id);
    sound.addMarker({ name: action, start: startMs / 1000, duration: durationMs / 1000 });
    if (!sound.play(action, { volume: 0 })) {
      sound.destroy();
      return;
    }

    const fade = this.tweens.chain({
      targets: sound,
      tweens: [
        { volume, duration: fadeInMs },
        { volume: 0, delay: durationMs - fadeInMs - fadeOutMs, duration: fadeOutMs },
      ],
    });
    const cleanup = () => {
      this.events.off("shutdown", cleanup);
      fade.stop();
      sound.destroy();
    };
    sound.once(Phaser.Sound.Events.COMPLETE, cleanup);
    this.events.once("shutdown", cleanup);
  }
  private pendingVisit() {
    const { phase, completed } = this.run;
    let visit = "";
    if (phase === "order") visit = `order-${completed}`;
    else if (phase === "threat" || phase === "reminder" || phase === "final") visit = phase;
    return visit === this.enteredVisit ? "" : visit;
  }
  private draw() {
    this.closeCounterTalk?.();
    this.closeCounterTalk = undefined;
    const s = this.run,
      i = orderIndex(s),
      o = orders[i],
      p = s.phase,
      day = this.day();
    const conversation = p === "order" || p === "receipt" || p === "threat" || p === "reminder" || p === "final";
    const { width, height } = this.ctx.config.view;
    const goal = s.threatSeen
      ? "第三日黄昏前筹银　" + money(s.silver) + " / 30 两"
      : "独立看店，等师傅查账";
    const hdr =
      "<header>" +
      identity() +
      '<div class="hud"><span>第' +
      nums[day] +
      '日</span><span>银两 <b data-stat="silver">' +
      money(s.silver) +
      "</b></span><span>口碑 <b>" +
      s.rep +
      "</b></span>" +
      button("audio", this.muted ? "启音" : "静音", "mini") +
      button("journal", "手记", "mini") +
      (p !== "end" ? button("save-menu", "存档", "mini") : "") +
      "</div></header>";

    if (isWorkshopPhase(p)) {
      if (!this.workshop) {
        this.bg.setTexture("bg_forge_clear").setDisplaySize(width, height);
        this.soundscape();
        ui.className = "play day" + day;
        ui.innerHTML = hdr + workshopMarkup(i) + "<footer>" + goal + "</footer>";
        this.workshop = ui.querySelector(".workshop")!;
      }
      updateWorkshop(this.workshop, s, p, i, this.heating, this.note);
      this.clock = p === "strike" ? this.workshop.querySelector("#needle") : null;
      if (this.clock) this.update();
      ui.querySelector('[data-stat="silver"]')!.textContent = money(s.silver);
      ui.querySelector("footer")!.textContent = goal;
      return;
    }

    this.request?.abort();
    this.workshop = null;
    this.clock = null;
    const night = ["threat", "reminder", "final"].includes(p);
    const hasDialogue = conversation && !this.pendingVisit();
    const bg = hasDialogue ? "bg_forge_blur" : "bg_forge_clear";
    this.bg.setTexture(bg).setDisplaySize(width, height);
    this.soundscape();
    ui.className =
      "play day" +
      day +
      (conversation ? " conversation" : "") +
      (night ? " ominous" : "") +
      (p === "end" ? " ending" : "");
    let body = "";
    if (this.pendingVisit()) {
      body = p === "order"
        ? arrivalScene("有客上门", visits[i].entrance, "上前交谈　→")
        : arrivalScene("门外有动静", p === "threat" ? "门外传来三声叩响。" : "门外有人等你过去。", "上前看看　→");
    } else if (p === "letter") {
      body =
        caption("青溪县", "大晟 · 景和二十三年") +
        panel(
          "柜上 · 师傅手书",
          "给徒弟的一封信",
          story.letter,
          button("open", "收好信，开门迎客　→"),
          '<div class="sign">老周　手启</div>',
        );
    } else if (p === "order") {
      const catchup = s.threatSeen
        ? button(
            "search",
            this.run.completed === 7 ? "看看后院的箱底" : "查看铺里",
            "quiet",
          )
        : "";
      if (this.questioning) {
        body = dialogueScene(
          o, "guest",
          "“少的是营里的甲。寻常铺子打一把刀不稀奇，私接这些可要坐牢。账上还写着东西在库里，可修甲用的部件已经不见了。我在你们铺子旁捡着一片，你自己看。”",
          button("clue1", "接过甲片，看清戳印") + button("back-to-order", "回到订单", "quiet"),
        );
      } else {
        body = counterScene(
          o,
          "“" + o.line + "”",
          button("commission", "接下这单", "primary") +
            (i === 5 ? button("ask", "追问营里的事", "quiet") : "") + catchup,
        );
      }
    } else if (p === "receipt") {
      body = dialogueScene(
        o,
        "guest",
        '<span id="voice"></span>',
        button(
          "next",
          s.completed === 9
            ? "合上账本　→"
            : s.completed % 3 === 0
              ? "收拾柜台　→"
              : "记下这单　→",
        ),
      );
    } else if (p === "threat" || p === "reminder" || p === "final") {
      if (p === "threat") {
        const isLast = this.threatPage === story.threat.length - 1;
        body = dialogueScene(
            constable, this.threatPage === 1 ? "apprentice" : "guest",
            story.threat[this.threatPage],
            button("threat", ["回应　→", "接过公文　→", "记下期限　→"][this.threatPage]),
            isLast
              ? '<div class="newgoal"><s>获得师傅认可</s><strong>第三日黄昏前　筹银三十两</strong></div>'
              : "",
          );
      } else if (p === "reminder")
        body = dialogueScene(
            constable, "guest",
            story.reminder,
            button("return", "等他走远，回到柜台　→"),
          );
      else
        body = dialogueScene(
            constable, "guest",
            story.final,
            choices(s)
              .map((e) =>
                button(
                  e,
                  actionNames[e],
                  e === "expose" ? "secondary" : "primary",
                ),
              )
              .join("") + button("search", "最后看看铺子", "quiet"),
            group(
              detail("手中银两", money(s.silver) + " / 30") +
                detail("已取证物", s.clues.filter(Boolean).length + " / 3") +
                detail("街坊口碑", s.rep + " / 60"),
            ),
          );
    } else if (p === "night") {
      const first = s.completed === 3;
      body =
        button(
          first ? "clue0" : "chest",
          first ? "柜脚　散落的纸页　↗" : "箱盖　生锈的铜扣　↗",
          "hotspot",
        ) +
        caption("打烊以后", "城西 · " + (first ? "柜台" : "后院")) +
        panel(
          "第" + nums[day] + "日 · 夜",
          "" + (first ? "柜脚有张散页" : "后院的旧木箱"),
          first
            ? "门闩落下，一张揉皱的纸从柜台底下滑了出来。离他再来还有两日。"
            : "明天黄昏，官差就要来。信里那句“不要乱动”，你已经看了三遍。",
          button("search", first ? "弯腰看一看" : "去后院看看") +
            button("return", "熄灯，明早开铺", "quiet") +
            (!first && s.chest
              ? button("escape", "趁夜离开青溪", "quiet")
              : ""),
        );
    } else if (p === "end") {
      const ending = story.endings[s.ending!];
      body =
        caption(ending[0], "青溪县志 · 卷末") +
        panel(
          "终章　 /　经营结算",
          ending[0],
          ending[1] + "<br><em>" + ending[2] + "</em>",
          button("restart", "再开一次炉　↺") +
            button("cover", "回到封面", "quiet"),
          group(
            detail("总收入", money(s.silver + s.paid + (s.reforgeSpent ?? 0)) + " 两") +
              (s.reforgeSpent ? detail("返工耗银", money(s.reforgeSpent) + " 两") : "") +
              detail("实际支付", money(s.paid) + " 两") +
              detail("交付", s.completed + " / 9") +
              detail("连中", s.best + " 锤") +
              detail("口碑", String(s.rep)) +
              detail("证物", s.clues.filter(Boolean).length + " / 3"),
          ),
        );
    }
    ui.innerHTML =
      hdr +
      '<div class="stage-body">' +
      body +
      "</div><footer>" +
      (p === "end"
        ? "三日之约 · 卷终"
        : p === "letter"
          ? "城西 · 清晨"
          : goal) +
      "</footer>";
    const talk = ui.querySelector<HTMLElement>(".shop-dialogue--conversation");
    if (talk) this.closeCounterTalk = openCounterTalk(talk, s, i, () => this.store());
    if (p === "receipt") void this.reply(i);
  }
  update() {
    if (dialog.open) return;
    if (!this.clock) return;
    const period = tuning(this.run.completed).period;
    const phase = ((performance.now() - this.started) % period) / period;
    this.cursor = 1 - Math.abs(phase * 2 - 1);
    this.clock.style.left = String(this.cursor * 100) + "%";
  }
  private async reply(i: number) {
    const grade = appraisal(this.run.hits, i).grade;
    const voice = ui.querySelector("#voice")!;
    const choice = visitRecord(this.run, i).choice;
    voice.textContent =
      "“" +
      (choice !== undefined ? receipt(i, choice, grade) : story.voices[i][grade === "瑕疵" ? 0 : grade === "合格" ? 1 : 2]) +
      "”";
    if (isLocalCounter()) return;
    if (choice === undefined && (i === 5 || i === 8)) return;
    const controller = new AbortController();
    this.request = controller;
    const timer = setTimeout(() => controller.abort(), 3750);
    try {
      const res = await fetch("/api/customer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index: i, grade, choice }),
        signal: controller.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (
        voice.isConnected &&
        data.source === "model" &&
        typeof data.line === "string"
      ) {
        voice.textContent = "“" + data.line + "”";
      }
    } catch {
      /* 本地台词已显示，交付无需等待网络。 */
    } finally {
      clearTimeout(timer);
    }
  }
  private journal() {
    const s = this.run;
    const entries = (s.records ?? [])
      .map(
        (r, i) =>
          "<tr><td>" +
          orders[i].name +
          " · " +
          orders[i].item +
          "</td><td>" +
          r.grade +
          "</td><td>" +
          money(r.money) +
          " 两</td></tr>",
      )
      .join("");
    const ledger = entries
      ? "<h3>已交付的订单</h3><table><thead><tr><th>买主与器物</th><th>成色</th><th>入账</th></tr></thead><tbody>" +
        entries +
        "</tbody></table>"
      : "";
    popup(
      "铺中手记",
      "<p>师傅留下的信</p><blockquote>" +
        story.letter +
        "</blockquote>" +
        (s.threatSeen
          ? "<h3>第三日黄昏前，筹银三十两</h3><p>手中 " +
            money(s.silver) +
            " 两。陈捕头还要看你怎么答。</p><h3>已收下的证物</h3>" +
            (s.clues.some(Boolean)
              ? evidence
                  .filter((_, i) => s.clues[i])
                  .map((e) => "<p><b>" + e.name + "</b><br>" + e.text + "</p>")
                  .join("")
              : "<p>还没有收下证物。</p>")
          : "") +
        ledger + '<section class="visit-notes" aria-label="柜台往来"></section>',
    );
    const notes = dialog.querySelector(".visit-notes")!;
    for (let i = 0; i <= Math.min(s.completed, orders.length - 1); i++) {
      const entry = visitRecord(s, i);
      if (!entry.turns.length && entry.choice === undefined) continue;
      const page = document.createElement("details");
      const title = document.createElement("summary");
      title.textContent = orders[i].name + " · " + visits[i].title;
      page.append(title);
      if (entry.choice !== undefined) {
        const decision = document.createElement("p");
        decision.textContent = "柜台约定　" + visits[i].options[entry.choice].label;
        page.append(decision);
      }
      for (const turn of entry.turns) {
        const excerpt = document.createElement("blockquote");
        excerpt.textContent = "你：" + turn.question + "　" + orders[i].name + "：“" + turn.answer + "”";
        page.append(excerpt);
      }
      notes.append(page);
    }
  }
  private search() {
    const s = this.run;
    const box = s.completed >= 6;
    const options = evidence
      .map((e, i) =>
        available(s, i)
          ? button(
              "clue" + i,
              e.object + (s.clues[i] ? "　✓" : ""),
              "investigate",
            )
          : "",
      )
      .join("");
    popup(
      "铺里走一走",
      "<p>灯还亮着。你想仔细看哪一处？</p>",
      options +
        (box
          ? button(
              "chest",
              s.chest ? "再看木箱内层" : "掀开后院木箱",
              "investigate",
            )
          : ""),
    );
  }
  private act(a: string) {
    const s = this.run,
      p = s.phase;
    if (a === "arrive") {
      const visit = this.pendingVisit();
      if (visit) {
        this.enteredVisit = visit;
        this.draw();
        ui.querySelector<HTMLButtonElement>(".dialogue-box .primary, .counter-history")?.focus({ preventScroll: true });
      }
      return;
    }
    if (a === "close") {
      dialog.close();
      return;
    }
    if (a === "audio") {
      this.muted = !this.muted;
      this.sound.mute = this.muted;
      const toggle = ui.querySelector("[data-act=audio]");
      if (toggle) toggle.textContent = this.muted ? "启音" : "静音";
      return;
    }
    if (a === "save-menu" && p !== "end") {
      popup(
        "存档",
        '<p role="status">进度保存在当前浏览器。下次在标题页选择同一个存档格继续。</p>',
        button("save-progress", "立即保存") +
          button("save-and-title", "保存并返回标题", "quiet"),
      );
      return;
    }
    if ((a === "save-progress" || a === "save-and-title") && p !== "end") {
      const saved = this.ctx.save.writeRun(s);
      if (saved && a === "save-and-title") {
        dialog.close();
        this.ctx.go("title");
      } else {
        const status = dialog.querySelector('[role="status"]');
        if (status) {
          status.textContent = saved
            ? `进度已保存到存档 ${this.ctx.save.slotNumber}。`
            : "保存失败，请检查浏览器是否允许本地存储。";
        }
      }
      return;
    }
    if (a === "journal") {
      this.journal();
      return;
    }
    if (a === "search" && s.threatSeen) {
      this.search();
      return;
    }
    if (a.startsWith("clue")) {
      const id = Number(a.slice(4));
      if (!available(s, id)) return;
      this.questioning = false;
      collect(s, id);
      this.store();
      this.sfx("sfx_tick");
      this.draw();
      popup(
        evidence[id].name,
        '<div class="exhibit">' +
          art(
            ["item_order_slip", "item_scrap", "item_order_slip"][id],
            "exhibit-art",
          ) +
          "<p>" +
          evidence[id].text +
          "</p></div>" +
          (s.clues.every(Boolean)
            ? "<blockquote>" + story.deduction + "</blockquote>"
            : ""),
        button("search", "继续查看", "quiet"),
      );
      return;
    }
    if (a === "chest" && s.completed >= 6) {
      s.chest = true;
      this.store();
      this.draw();
      popup(
        "生锈的铜扣",
        '<div class="exhibit">' +
          art("item_chest", "exhibit-art") +
          "<p>" +
          story.chest +
          "</p></div>",
        available(s, 2) ? button("clue2", evidence[2].object) : "",
      );
      return;
    }
    if (a === "ask" && p === "order" && s.completed === 5) {
      this.questioning = true;
      this.draw();
      return;
    }
    if (a === "back-to-order" && this.questioning) {
      this.questioning = false;
      this.draw();
      return;
    }
    if (a === "escape" && p === "night" && s.chest) {
      popup(
        "要在今夜离开吗？",
        "<p>从后门去渡口。余下三单留在这里，这次看店就此结束。</p>",
        button("leave", "带上碎银，去渡口"),
      );
      return;
    }
    if (a === "leave" && p === "night" && s.chest) {
      dialog.close();
      s.ending = "leave";
      this.goto("end");
      return;
    }
    if (a === "open" && p === "letter") {
      this.goto("order");
      return;
    }
    if (p === "order" && !this.pendingVisit() && !this.questioning && a === "commission") {
      const visit = visits[s.completed];
      const order = orders[s.completed];
      popup(
        "接下这单",
        '<p class="commission-summary">' + order.name + ' · ' + order.item +
          ' · 最高 ' + order.max + ' 两</p><p>这单怎么做？选定后开始加热。</p>',
        visit.options.map((option, n) => button("commission-" + n, option.label)).join(""),
      );
      return;
    }
    if (p === "order" && !this.pendingVisit() && !this.questioning && (a === "commission-0" || a === "commission-1")) {
      dialog.close();
      visitRecord(s, s.completed).choice = a === "commission-0" ? 0 : 1;
      this.note = "";
      s.hits = [];
      this.goto("heat");
      return;
    }
    if (a === "heat" && p === "heat" && !this.heating) {
      this.heating = true;
      this.draw();
      const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 0
        : this.ctx.config.workshop.heatAnimationMs;
      this.time.delayedCall(duration, () => {
        this.heating = false;
        this.started = performance.now();
        this.goto("strike");
      });
      this.playWorkshopSound("heat");
      return;
    }
    if (a === "strike" && p === "strike") {
      if (performance.now() < this.until) return;
      this.until = performance.now() + 180;
      const v = hit(s, this.cursor);
      if (v === undefined) return;
      this.note = [
        "偏锤 · 再稳一点",
        "命中 · 一声脆响",
        "正中 · " + s.streak + " 连击",
      ][v];
      this.sfx(["sfx_miss", "sfx_hammer_light", "sfx_hammer_heavy"][v]);
      this.fx("strike", v === 0 ? "fx_crack" : "fx_spark");
      this.store();
      this.draw();
      return;
    }
    if (a === "reforge" && p === "broken") {
      reforge(s);
      this.note = "";
      this.store();
      this.draw();
      return;
    }
    if (a === "quench" && p === "quench") {
      this.goto("inspect");
      this.fx("quench", "fx_steam");
      this.playWorkshopSound("quench");
      return;
    }
    if (a === "deliver" && p === "inspect") {
      deliver(s);
      this.sfx("sfx_coin");
      this.store();
      this.draw();
      return;
    }
    if (a === "next" && p === "receipt") {
      advanceReceipt(s);
      this.store();
      this.draw();
      if (s.phase === "threat") {
        this.sfx("sfx_knock");
        this.shake();
      }
      return;
    }
    if (a === "threat" && p === "threat") {
      if (this.threatPage < story.threat.length - 1) {
        this.threatPage++;
        if (this.threatPage === story.threat.length - 1) {
          this.sfx("sfx_scrap");
          this.shake();
        }
        this.draw();
      } else {
        s.threatSeen = true;
        this.goto("night");
      }
      return;
    }
    if (a === "return" && (p === "reminder" || p === "night")) {
      this.goto("order");
      return;
    }
    if (p === "final" && ["pay", "arrest", "expose"].includes(a)) {
      finish(s, a as Ending);
      this.store();
      this.draw();
      return;
    }
    if (a === "restart" && p === "end") {
      this.ctx.game = newGame(this.ctx.config, Math.random());
      this.threatPage = 0;
      this.note = "";
      this.enteredVisit = "";
      this.questioning = false;
      this.goto("letter");
      return;
    }
    if (a === "cover" && p === "end") {
      this.ctx.go("title");
    }
  }
  private shake() {
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      this.cameras.main.shake(230, 0.003);
  }
  private fx(station: "strike" | "quench", id: string) {
    const fixture = this.workshop?.querySelector(`[data-act="${station}"]`);
    if (!fixture) return;
    fixture.classList.remove("impact");
    fixture.getBoundingClientRect();
    fixture.classList.add("impact");
    fixture.insertAdjacentHTML("beforeend", art(id, "flare"));
    const flash = fixture.lastElementChild;
    this.time.delayedCall(650, () => {
      if (flash === fixture.lastElementChild) fixture.classList.remove("impact");
      flash?.remove();
    });
  }
}
