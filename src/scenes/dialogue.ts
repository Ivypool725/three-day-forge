import { art, button } from "./shared";

type Guest = { portrait: string; name: string };

function dialogueCast(guest: Guest, speaker: "guest" | "apprentice") {
  return `
    <div class="dialogue-cast" data-speaker="${speaker}">
      ${art("face_apprentice", "dialogue-portrait dialogue-apprentice", "学徒")}
      ${art("face_" + guest.portrait, "dialogue-portrait dialogue-guest", guest.name)}
    </div>`;
}

export function arrivalScene(title: string, line: string, action: string) {
  return `
    <div class="dialogue-cast"></div>
    <section class="dialogue-box" aria-labelledby="arrival-title">
      <div class="dialogue-copy">
        <h2 id="arrival-title" class="dialogue-speaker">${title}</h2>
        <p class="dialogue-line">${line}</p>
      </div>
      <div class="actions">${button("arrive", action)}</div>
    </section>`;
}

export function dialogueScene(
  guest: Guest,
  speaker: "guest" | "apprentice",
  line: string,
  actions: string,
  details = "",
) {
  const name = speaker === "apprentice" ? "学徒" : guest.name;
  return `
    ${dialogueCast(guest, speaker)}
    <section class="dialogue-box" aria-labelledby="dialogue-speaker">
      <div class="dialogue-copy" aria-live="polite">
        <h2 id="dialogue-speaker" class="dialogue-speaker">${name}</h2>
        <p class="dialogue-line">${line}</p>
      </div>
      ${details}
      <div class="actions">${actions}</div>
    </section>`;
}

export function counterScene(guest: Guest, line: string, actions: string) {
  return `
    ${dialogueCast(guest, "guest")}
    <section class="shop-dialogue shop-dialogue--conversation" aria-labelledby="counter-guest">
      <div class="counter-voice">
        <div class="counter-heading">
          <h2 id="counter-guest" class="shop-speaker">${guest.name}</h2>
          <button type="button" class="counter-history" aria-haspopup="dialog">对话记录</button>
        </div>
        <div class="counter-speech" tabindex="-1">
          <p class="counter-last-question" hidden></p>
          <p class="shop-line" aria-live="polite">${line}</p>
        </div>
        <p class="counter-status" role="status"></p>
      </div>
      <div class="counter-desk">
        <div class="counter-talk"></div>
        <div class="actions counter-order-actions">${actions}</div>
      </div>
    </section>`;
}
