import { visits, previousVisit, repeatsQuestion, visitRecord, type Exchange } from "../core/visits";
import { orders } from "../core/orders";
import type { GameState } from "../core/game";
import { readCounterReply } from "./counter-stream";
import { dialog, popup } from "./shared";

let preferLocal = false;
const http = () => /^https?:$/.test(location.protocol);

export function isLocalCounter() {
  return !http() || !navigator.onLine || preferLocal;
}

export function openCounterTalk(root: HTMLElement, state: GameState, index: number, save: () => void) {
  const { name, line } = orders[index];
  const turns = visitRecord(state, index).turns;
  const previousIndex = previousVisit(index);
  const note = previousIndex >= 0 ? visitRecord(state, previousIndex) : undefined;
  const previous = note ? { index: previousIndex, choice: note.choice, turns: note.turns.slice(-2) } : undefined;
  const { questions, followUp } = visits[index];
  const talk = root.querySelector<HTMLElement>(".counter-talk")!;
  const cast = root.parentElement?.querySelector<HTMLElement>(".dialogue-cast");
  const speech = root.querySelector<HTMLElement>(".counter-speech")!;
  const quote = root.querySelector<HTMLElement>(".shop-line")!;
  const lastQuestion = root.querySelector<HTMLElement>(".counter-last-question")!;
  const status = root.querySelector<HTMLElement>(".counter-status")!;
  const lifetime = new AbortController();
  let pending: AbortController | undefined;
  let prediction: AbortController | undefined;
  let mode: Exchange["source"] = "local";

  function displayQuestion(question?: string) {
    lastQuestion.hidden = !question;
    lastQuestion.textContent = question ? "你问　" + question : "";
  }

  function paintStage(stage: "waiting" | "streaming" | "settled", text: string) {
    if (root.dataset.reply !== stage) {
      root.dataset.reply = stage;
      if (cast) cast.dataset.speaker = stage === "waiting" ? "apprentice" : "guest";
      quote.setAttribute("aria-live", stage === "streaming" ? "off" : "polite");
    }
    quote.textContent = text;
  }

  function showTurn(turn?: Exchange) {
    displayQuestion(turn?.question);
    paintStage("settled", "“" + (turn?.answer ?? line) + "”");
    status.textContent = "";
    speech.scrollTop = 0;
  }

  function settle(turn: Exchange) {
    turns.push(turn);
    if (turns.length > 12) turns.shift();
    save();
    showTurn(turn);
    renderSuggestions();
  }

  function addSuggestedQuestion(list: HTMLElement, question: string, source: "guide" | "model") {
    const choice = document.createElement("button");
    choice.type = "button";
    choice.textContent = question;
    choice.dataset.questionSource = source;
    choice.title = source === "guide" ? "固定引导" : "AI 根据对白推荐";
    choice.onclick = () => {
      const input = talk.querySelector<HTMLInputElement>("input");
      if (!input) return;
      input.value = question;
      input.dispatchEvent(new Event("input"));
      input.focus({ preventScroll: true });
    };
    list.append(choice);
  }

  function showPredictionState(list: HTMLElement, text: string, retry?: () => void) {
    const status = document.createElement("p");
    status.className = "counter-prediction-state";
    status.setAttribute("role", "status");
    status.textContent = text;
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "重新推荐";
      button.onclick = retry;
      status.append(button);
    }
    list.replaceChildren(status);
  }

  async function predictQuestions(list: HTMLElement, guide: string) {
    const request = new AbortController();
    prediction = request;
    showPredictionState(list, "正在更新建议…");
    let suggestions: string[] = [];
    try {
      const response = await fetch("/api/customer/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, history: turns.slice(-3) }),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(12500)]),
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.suggestions)) {
          suggestions = data.suggestions.filter((item: unknown) =>
            typeof item === "string" && !repeatsQuestion(item, guide)).slice(0, 2);
        }
      }
    } catch {
      // 保持输入可用，并在本轮语境内提供重试。
    }
    if (request.signal.aborted || prediction !== request || !list.isConnected) return;
    prediction = undefined;
    if (!suggestions.length) {
      showPredictionState(list, "暂未生成建议", () => void predictQuestions(list, guide));
      return;
    }
    const focused = list.contains(document.activeElement);
    list.replaceChildren();
    for (const question of suggestions) addSuggestedQuestion(list, question, "model");
    if (focused) list.querySelector("button")?.focus({ preventScroll: true });
  }

  function renderSuggestions() {
    prediction?.abort();
    const sameMode = turns.filter(turn => turn.source === mode);
    const unanswered = (question: string) => !sameMode.some(turn => turn.question === question);
    const suggestions = questions.map(([question, answer]) => ({ question, answer }));
    if (note?.choice !== undefined) {
      const answer = visits[previousIndex].options[note.choice].after;
      suggestions.unshift({ question: "上回那件用着怎样？", answer });
    }
    const canFollow = sameMode.some(turn => followUp.heard.test(turn.answer)) && unanswered(followUp.question);
    if (mode === "model") {
      const guide = canFollow ? followUp.question :
        suggestions.find(item => unanswered(item.question))?.question ?? "这单还有什么要先说定的？";
      const guideList = talk.querySelector<HTMLElement>(".counter-guides")!;
      guideList.replaceChildren();
      addSuggestedQuestion(guideList, guide, "guide");
      void predictQuestions(talk.querySelector(".counter-predictions")!, guide);
      return;
    }
    const list = talk.querySelector<HTMLElement>(".counter-local-topics")!;
    list.replaceChildren();
    if (canFollow) suggestions.unshift(followUp);
    for (const suggestion of suggestions) {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.textContent = suggestion.question;
      choice.classList.toggle("follow-up", suggestion === followUp);
      choice.onclick = () => {
        const focusIndex = Array.from(list.children).indexOf(choice);
        settle({ ...suggestion, source: "local" });
        list.querySelectorAll<HTMLButtonElement>("button")[focusIndex]?.focus({ preventScroll: true });
      };
      list.append(choice);
    }
  }

  root.querySelector<HTMLButtonElement>(".counter-history")!.onclick = () => {
    popup(name + " · 对话记录", '<div class="counter-transcript"></div>');
    const transcript = dialog.querySelector<HTMLElement>(".counter-transcript")!;
    const opening = document.createElement("p");
    opening.textContent = "“" + line + "”";
    transcript.append(opening);
    for (const turn of turns) {
      const section = document.createElement("section");
      for (const [speaker, text] of [["你", turn.question], [name, turn.answer]]) {
        const heading = document.createElement("h3");
        const message = document.createElement("p");
        heading.textContent = speaker;
        message.textContent = text;
        section.append(heading, message);
      }
      transcript.append(section);
    }
    const heading = dialog.querySelector<HTMLElement>("h2")!;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    dialog.scrollTop = 0;
  };

  function renderMode(next: Exchange["source"]) {
    mode = next;
    showTurn(turns.filter(turn => turn.source === mode).at(-1));
    talk.innerHTML = mode === "model"
      ? `<div class="counter-suggestions">
          <div class="counter-predictions" aria-label="AI 推荐问法" role="group"></div>
          <div class="counter-guides" aria-label="固定引导" role="group"></div>
        </div>
        <form class="counter-question">
          <input id="counter-input" aria-label="问${name}" maxlength="160" autocomplete="off" placeholder="想和来客问点什么？">
          <button type="submit" disabled>发送</button>
        </form>
        <button class="counter-mode" type="button" hidden>改用离线对白</button>`
      : `<div class="counter-offline-heading"><span>离线对白</span>${http() ? '<button class="counter-mode" type="button">重连 AI</button>' : ""}</div>
        <div class="counter-topics counter-local-topics" aria-label="离线对白选项"></div>`;

    renderSuggestions();
    const switchMode = talk.querySelector<HTMLButtonElement>(".counter-mode");
    if (switchMode) switchMode.onclick = () => {
      preferLocal = mode === "model";
      if (preferLocal) {
        renderMode("local");
        talk.querySelector<HTMLButtonElement>(".counter-topics button")?.focus({ preventScroll: true });
      } else void detectMode();
    };
    if (mode === "local") return;

    const form = talk.querySelector<HTMLFormElement>("form")!;
    const input = form.querySelector("input")!;
    const send = form.querySelector("button")!;
    const refreshSend = () => {
      send.disabled = !pending && !input.value.trim();
      send.textContent = pending ? "停止" : "发送";
      send.type = pending ? "button" : "submit";
      send.classList.toggle("stopping", !!pending);
    };
    input.oninput = refreshSend;
    send.onclick = event => {
      if (!pending) return;
      event.preventDefault();
      pending.abort();
    };
    form.onsubmit = async event => {
      event.preventDefault();
      if (pending) return;
      const question = input.value.trim();
      if (!question) return;
      prediction?.abort();
      showPredictionState(talk.querySelector(".counter-predictions")!, "顾客答完后更新建议");
      const request = new AbortController();
      pending = request;
      const timer = window.setTimeout(() => request.abort("timeout"), 21500);
      input.value = "";
      refreshSend();
      switchMode!.hidden = true;
      displayQuestion(question);
      paintStage("waiting", name + "在想怎么答");
      speech.scrollTop = 0;
      status.textContent = "";
      let answer: string | undefined;
      let frame = 0, draft = "";
      try {
        const response = await fetch("/api/customer/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          body: JSON.stringify({ index, question, history: turns.slice(-6), previous }),
          signal: request.signal,
        });
        answer = await readCounterReply(response, text => {
          draft = text;
          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            if (request.signal.aborted || lifetime.signal.aborted) return;
            const followTail = speech.scrollHeight - speech.scrollTop - speech.clientHeight < 18;
            paintStage("streaming", "“" + draft);
            if (followTail) speech.scrollTop = speech.scrollHeight;
          });
        });
      } catch {
        // 让失败与离线对白有各自清楚的出口。
      } finally {
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        pending = undefined;
        if (!lifetime.signal.aborted && form.isConnected) refreshSend();
      }
      if (lifetime.signal.aborted || !form.isConnected) return;
      if (answer && !request.signal.aborted) {
        settle({ question, answer, source: "model" });
      } else {
        const stopped = request.signal.aborted && request.signal.reason !== "timeout";
        paintStage("settled", draft ? "“" + draft + "……”" : stopped ? "这句先停下了。" : name + "暂时没接上话。");
        status.textContent = stopped ? "已停止，可重新发送" : "可重试，或改用离线对白";
        if (!input.value.trim()) input.value = question;
        refreshSend();
        switchMode!.hidden = stopped;
        renderSuggestions();
      }
    };
  }

  async function detectMode() {
    talk.textContent = "正在连接柜台对话…";
    try {
      const response = await fetch("/api/customer/status", {
        signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(1600)]),
      });
      const available = response.ok && (await response.json()).available === true;
      if (!lifetime.signal.aborted) renderMode(available ? "model" : "local");
    } catch {
      if (!lifetime.signal.aborted) renderMode("local");
    }
  }

  window.addEventListener("offline", () => {
    pending?.abort();
    renderMode("local");
  }, { signal: lifetime.signal });
  if (isLocalCounter()) renderMode("local");
  else void detectMode();
  return () => {
    lifetime.abort();
    prediction?.abort();
    pending?.abort();
  };
}
