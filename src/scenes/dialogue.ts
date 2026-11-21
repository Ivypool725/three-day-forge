import { art, button } from "./shared";

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
  guest: { portrait: string; name: string },
  speaker: "guest" | "apprentice",
  line: string,
  actions: string,
  details = "",
) {
  const name = speaker === "apprentice" ? "学徒" : guest.name;
  return `
    <div class="dialogue-cast" data-speaker="${speaker}">
      ${art("face_apprentice", "dialogue-portrait dialogue-apprentice", "学徒")}
      ${art("face_" + guest.portrait, "dialogue-portrait dialogue-guest", guest.name)}
    </div>
    <section class="dialogue-box" aria-labelledby="dialogue-speaker">
      <div class="dialogue-copy" aria-live="polite">
        <h2 id="dialogue-speaker" class="dialogue-speaker">${name}</h2>
        <p class="dialogue-line">${line}</p>
      </div>
      ${details}
      <div class="actions">${actions}</div>
    </section>`;
}
