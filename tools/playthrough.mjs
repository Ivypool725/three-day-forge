// 实际点击网页，依据屏上指针判断落锤时机。可对解压后的 file:// 入口验收。
import assert from "node:assert/strict";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const [url = "http://127.0.0.1:5287", route = "expose", mode = "desktop"] =
  process.argv.slice(2);
const movie = mode === "film",
  mobile = mode === "mobile",
  rough = route === "arrest";
const actual = route === "late" || route === "witness" ? "expose" : route;
const dir = await mkdtemp(path.join(os.tmpdir(), "qingxi-play-"));
const b = await chromium.launch({
  channel: "chrome",
  args: [
    "--enable-unsafe-swiftshader",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const ctx = await b.newContext({
  viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 720 },
  hasTouch: mobile,
  ...(movie
    ? { recordVideo: { dir, size: { width: 1280, height: 720 } } }
    : {}),
});
if (url.startsWith("file:")) await ctx.setOffline(true);
const p = await ctx.newPage();
const errors = [],
  missing = [],
  badAsset = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("response", (r) => {
  if (r.status() >= 400)
    badAsset.push(r.status() + " " + r.url().slice(0, 160));
});
const wait = (ms) => p.waitForTimeout(ms);
const choose = async (a) => {
  const target = p
    .locator('dialog[open] [data-act="' + a + '"], #ui [data-act="' + a + '"]')
    .last();
  if (mobile) await target.tap();
  else await target.click();
};
const read = () => p.evaluate(() => structuredClone(globalThis.__game.game));
const pause = async (ms) => {
  if (movie) await wait(ms);
};
const snap = async (name) => {
  if (route !== "expose" && name !== "ending") return;
  await wait(270);
  await mkdir("evidence", { recursive: true });
  await p.screenshot({
    path:
      "evidence/" +
      (mobile ? "mobile-" : "") +
      name +
      (name === "ending" ? "-" + route : "") +
      ".jpg",
    quality: 86,
  });
};
async function threeHits(index) {
  for (let j = 0; j < 3; j++) {
    await p.waitForFunction(
      ({ rough, j }) => {
        const needle = document.querySelector("#needle"),
          button = document.querySelector("[data-act=strike]");
        if (!needle || !button || globalThis.__game.game.hits.length !== j)
          return false;
        const pos = parseFloat(needle.style.left) / 100;
        const meter = needle.parentElement.style;
        const target = parseFloat(meter.getPropertyValue("--target")) / 100;
        const margin = parseFloat(meter.getPropertyValue("--green")) / 400;
        const farEdge = target < 0.5 ? pos >= 0.95 : pos <= 0.05;
        const yellow = parseFloat(meter.getPropertyValue("--yellow")) / 200;
        const yellowCenter = target + margin + yellow / 2;
        const desired = rough && j === 0 ? yellowCenter : target;
        if (rough && j > 0 ? !farEdge : Math.abs(pos - desired) > margin / 2) return false;
        button.click();
        return globalThis.__game.game.hits.length === j + 1;
      },
      { rough, j },
      { polling: "raf", timeout: 10000 },
    );
    if (index === 0 && j === 0) await snap("forge-hit");
    await wait(movie ? 390 : 185);
  }
}
async function audioStart() {
  await p.evaluate(() => {
    const sound = globalThis.__phaser.sound,
      context = sound.context;
    const dest = context.createMediaStreamDestination();
    sound.destination.connect(dest);
    const chunks = [],
      record = new MediaRecorder(dest.stream, {
        mimeType: "audio/webm;codecs=opus",
      });
    globalThis.finishRecording = new Promise((resolve) => {
      record.ondataavailable = (e) => chunks.push(e.data);
      record.onstop = async () => {
        const blob = new Blob(chunks);
        const file = new FileReader();
        file.onload = () => resolve(file.result.split(",")[1]);
        file.readAsDataURL(blob);
      };
    });
    globalThis.recorder = record;
    record.start();
  });
}
try {
  await p.goto(url);
  await p.locator("[data-act=new]").waitFor();
  await snap("title");
  if (movie) await audioStart();
  await pause(2200);
  await choose("new");
  await choose("slot-0");
  await pause(3200);
  await choose("open");
  assert.equal((await read()).silver, 0);
  for (let i = 0; i < 9; i++) {
    assert.equal(await p.locator(".dialogue-cast[data-speaker]").count(), 0);
    await choose("arrive");
    const sideOrders = route === "guarantee" ? [4, 7] : route === "appeal" ? [5, 6, 8] : [];
    if (sideOrders.includes(i)) {
      await choose("side-story");
      await choose("close");
    }
    if (route === "witness" && (i === 4 || i === 6)) {
      await choose("testimony");
      await choose("close");
    }
    assert.equal(await p.locator(".dialogue-cast").getAttribute("data-speaker"), "guest");
    if ((route === "expose" || route === "arrest") && i === 5) {
      await choose("ask");
      await choose("clue1");
      await pause(1600);
      await choose("close");
    }
    if ((route === "expose" || route === "arrest" || route === "witness" || route === "appeal") && i === 7) {
      await choose("search");
      await choose("clue2");
      await snap("receipt-proof");
      await pause(2600);
      await choose("close");
    }
    if (i === 0) await snap("order");
    await pause(i === 0 ? 2100 : i === 1 ? 1700 : 380);
    if (url.startsWith("file:")) {
      await p.locator(".counter-topics button").first().click();
      assert.ok((await read()).visits[i].turns.length);
      if (i === 0) {
        await p.locator(".counter-topics .follow-up").click();
        assert.equal((await read()).visits[i].turns.length, 2);
      }
    }
    await choose("commission");
    await choose("commission-" + (route === "guarantee" && i === 1 ? 0 : i % 2));
    await pause(i === 0 ? 950 : 220);
    await choose("heat");
    if (i === 0) {
      await snap("forge");
      await pause(1100);
    }
    await threeHits(i);
    await choose("quench");
    await pause(i === 0 ? 1000 : 230);
    await choose("deliver");
    if (i === 0) await snap("appraisal");
    const s = await read();
    assert.equal(s.completed, i + 1);
    assert.equal(s.phase, "receipt");
    await pause(i === 0 ? 2200 : 580);
    await choose("next");
    if (i === 2) {
      await pause(1400);
      await choose("arrive");
      await choose("threat");
      await choose("threat");
      await snap("ultimatum");
      await pause(2600);
      await choose("threat");
      if (route === "expose" || route === "arrest" || route === "witness") {
        await choose("search");
        await choose("clue0");
        await pause(1750);
        await choose("close");
      }
      await choose("return");
    }
    if (i === 3) {
      await pause(1100);
      await choose("arrive");
      await choose("return");
    }
    if (i === 5) {
      if (route === "expose" || route === "leave" || route === "arrest" || route === "witness" || route === "appeal") {
        await choose("search");
        await choose("chest");
        await pause(1300);
        await choose("close");
      }
      if (route === "leave") {
        await choose("escape");
        await choose("leave");
        break;
      }
      await choose("return");
    }
  }
  if (route !== "leave") {
    await choose("arrive");
    if (route === "late") {
      await choose("search");
      await choose("clue0");
      await choose("search");
      await choose("clue1");
      await choose("search");
      await choose("chest");
      await choose("clue2");
      await choose("close");
    }
    const s = await read();
    assert.equal(s.phase, "final");
    assert.equal(s.silver, rough ? 225 : 450);
    assert.equal(s.rep, rough ? 23 : 77);
    assert.deepEqual(
      s.clues,
      route === "witness" ? [true, false, true] :
      route === "appeal" ? [false, false, true] :
      actual === "expose" || route === "arrest"
        ? [true, true, true]
        : [false, false, false],
    );
    if (route === "witness") assert.deepEqual(s.testimony, [0, 1]);
    if (route === "expose") await p.locator("[data-act=pay]").waitFor();
    await snap("final");
    await pause(1900);
    await choose(actual);
  }
  const s = await read();
  assert.equal(s.ending, actual);
  assert.equal(s.paid, route === "pay" ? 300 : route === "guarantee" ? 100 : 0);
  await snap("ending");
  await pause(3500);
  if (movie) {
    const base64 = await p.evaluate(async () => {
      globalThis.recorder.stop();
      return await globalThis.finishRecording;
    });
    await writeFile(dir + "/game-audio.webm", Buffer.from(base64, "base64"));
  } else {
    await choose("restart");
    const fresh = await read();
    assert.equal(fresh.phase, "letter");
    assert.deepEqual(fresh.clues, [false, false, false]);
  }
  missing.push(...(await p.evaluate(() => globalThis.__game.missing)));
  assert.deepEqual([errors, missing, badAsset], [[], [], []]);
  const video = movie ? await p.video().path() : null;
  console.log(
    JSON.stringify({
      route,
      mode,
      silver: s.silver,
      total: s.silver + s.paid + (s.reforgeSpent ?? 0),
      rep: s.rep,
      completed: s.completed,
      best: s.best,
      clues: s.clues,
      ending: s.ending,
      errors,
      missing,
      badAsset,
      video,
      audio: movie ? dir + "/game-audio.webm" : null,
    }),
  );
} finally {
  await ctx.close();
  await b.close();
}
