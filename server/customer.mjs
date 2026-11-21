import { consultation, deliveryPrompt, suggestionPrompt, validOrder, validChoice } from "./visits.mjs";
import { orders } from "../src/core/orders.ts";
import { questionKey, repeatsQuestion } from "../src/core/visits.ts";

export function buildPrompt(index, grade) {
  const order = orders[index];
  return [
    {
      role: "system",
      content:
        "你扮演古代小县城的普通顾客。只谈眼前这件器物怎样用于你的日常，一人称一句口语，6至35个汉字。品质瑕疵要有委婉不满，合格是够用，精良要具体赞赏。不要编造人物、价钱、数字、剧情或对话标签。",
    },
    {
      role: "user",
      content: JSON.stringify({
        顾客: order.name,
        第几天: Math.floor(index / 3) + 1,
        订单: order.item,
        用途: order.use,
        交付品质: grade,
      }),
    },
  ];
}

const consultationLimit = 36;
const blockedStory = /孙承安|替罪|贿赂|主簿|三副|私造军器/;

function validLine(line, asking, fitted) {
  return typeof line === "string" && line.length >= (asking ? 3 : 5) &&
    Array.from(line).length <= (asking ? consultationLimit : 45) &&
    !/[<>\r\n]/.test(line) && !blockedStory.test(line) &&
    (asking || fitted || !/\d|银两|老周|师傅|预付|捕头|证据|账本|甲胄|跑路|官府|军器/.test(line));
}

const clean = text => text?.trim().replace(/^[“「]|[”」]$/g, "");

function shortConsultation(text, complete = false) {
  const chars = Array.from(clean(text));
  const end = chars.findIndex((char, i) => i < consultationLimit &&
    ((i >= 2 && /[。！？!?；;]/.test(char)) || (i >= 22 && /[，、,]/.test(char))));
  if (end >= 0) {
    const ending = /[。！？!?]/.test(chars[end]) ? chars[end] : "。";
    return chars.slice(0, end).join("") + ending;
  }
  if (chars.length >= consultationLimit) return chars.slice(0, consultationLimit - 1).join("") + "…";
  if (complete) return chars.join("");
}

function isCustomerQuestion(line) {
  if (/^(?:小师傅|掌柜的)[，,：:\s]/.test(line) ||
      /(?:给我|替我|帮我)(?:打|锻|造|修|配)|我(?:想要|想买|要)[一两这那][把件柄]/.test(line)) return true;
  const pickup = /(?:什么时候|几时|何时|哪天|几天)(?:我)?(?:能|可以|可|才能)(?:过来|来)?(?:取|领|拿)/;
  if (!pickup.test(line)) return false;
  return /我[^，。！？?]{0,5}(?:什么时候|几时|何时|哪天|几天)/.test(line) ||
    !/(?:您|你|谁|贵客|家里人)[^，。！？?]{0,8}(?:什么时候|几时|何时|哪天|几天)/.test(line);
}

function suggestionLines(raw, input) {
  if (typeof raw !== "string") return [];
  let data;
  try { data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/gi, "")); }
  catch { return []; }
  if (!Array.isArray(data)) return [];
  const seen = [...(input.guides ?? []), ...input.history.map(turn => turn.question)];
  const openingClauses = orders[input.index].line.split(/[，。！？；、,!.?]/u)
    .filter(clause => questionKey(clause).length >= 5);
  const questions = [];
  for (const value of data) {
    if (typeof value !== "string") continue;
    const line = value.trim();
    const repeated = seen.some(known => repeatsQuestion(line, known));
    const copiedOpening = openingClauses.some(clause => questionKey(line).includes(questionKey(clause)));
    if (line.length < 4 || line.length > 24 || !/[？?]$/.test(line) || !questionKey(line) ||
        /[<>\p{Cc}]/u.test(line) || blockedStory.test(line) || repeated ||
        /[?？].+/.test(line) || copiedOpening || isCustomerQuestion(line)) continue;
    questions.push(line);
    seen.push(line);
    if (questions.length === 2) break;
  }
  return questions;
}

async function* eventData(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let end = buffer.indexOf("\n");
    while (end >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
      end = buffer.indexOf("\n");
    }
  }
}

async function forwardReply(response, res) {
  const output = payload => res.write(JSON.stringify(payload) + "\n");
  res.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  let line = "", reply, sent = 0, completed = false;
  for await (const data of eventData(response.body)) {
    if (data === "[DONE]") { completed = true; break; }
    const payload = JSON.parse(data);
    if (payload.error) { completed = false; break; }
    const choice = payload.choices?.[0];
    if (typeof choice?.delta?.content === "string") {
      line += choice.delta.content;
      reply = shortConsultation(line);
      if (reply !== undefined) break;
      const text = Array.from(line.trimStart().replace(/^[“「]/, ""));
      if (/[<>\r\n]/.test(line.trim()) || blockedStory.test(line)) {
        completed = false;
        break;
      }
      // 留出跨分片的禁用词、自然断点和尾引号，避免先显示后撤回。
      const ready = Math.max(0, text.length - 4);
      if (ready > sent) {
        output({ delta: text.slice(sent, ready).join("") });
        sent = ready;
      }
    }
    if (choice?.finish_reason) {
      completed = choice.finish_reason === "stop";
      break;
    }
  }
  if (completed && reply === undefined) reply = shortConsultation(line, true);
  if (res.destroyed) return;
  output(validLine(reply, true, false) ? { line: reply } : { error: "unavailable" });
  res.end();
}

export function customerApi(key, transport = fetch) {
  return async (req, res, next) => {
    const path = req.url?.split("?")[0];
    const asking = path === "/api/customer/ask";
    const status = path === "/api/customer/status";
    const predicting = path === "/api/customer/suggestions";
    const streaming = asking && req.headers.accept === "application/x-ndjson";
    if (!status && !asking && !predicting && path !== "/api/customer") return next();
    const send = (status, obj) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(obj));
    };
    if (status) {
      if (req.method !== "GET") return send(405, { available: false });
      return send(200, { available: Boolean(key) });
    }
    if (req.method !== "POST") return send(405, { source: "local" });
    const disconnect = new AbortController();
    const cancel = () => disconnect.abort();
    if (streaming || predicting) res.once("close", cancel);
    try {
      if (
        req.headers.origin &&
        new URL(req.headers.origin).host !== req.headers.host
      )
        return send(403, { source: "local" });
      let body = "";
      for await (const part of req) {
        body += part;
        if (body.length > (asking || predicting ? 8192 : 512)) return send(413, { source: "local" });
      }
      let input;
      try {
        input = JSON.parse(body);
      } catch {
        return send(400, { source: "local" });
      }
      const { index, grade } = input ?? {};
      const legacyBlade = index === 1 ? { thin: 0, thick: 1 }[input?.blade] : undefined;
      const choice = input?.choice ?? legacyBlade;
      const fitted = validChoice(choice);
      let messages;
      if (predicting) {
        messages = suggestionPrompt(input ?? {});
        if (!messages) return send(400, { suggestions: [] });
      } else if (asking) {
        messages = consultation(input ?? {});
        if (!messages) return send(400, { source: "local" });
      } else if (
        !validOrder(index) || (choice != null && !fitted) ||
        (!fitted && (index === 5 || index === 8)) ||
        !["精良", "合格", "瑕疵"].includes(grade)
      )
        return send(400, { source: "local" });
      if (!key) return send(200, predicting ? { suggestions: [] } : { source: "local" });
      const response = await transport(
        "https://kspmas.ksyun.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + key,
          },
          body: JSON.stringify({
            model: "mimo-v2.6-flash",
            messages: messages ?? (fitted ? deliveryPrompt(index, choice, grade) : buildPrompt(index, grade)),
            temperature: 0.75,
            max_tokens: predicting ? 120 : asking ? 80 : 128,
            thinking: { type: "disabled" },
            ...(streaming ? { stream: true } : {}),
          }),
          signal: AbortSignal.any([AbortSignal.timeout(streaming ? 20000 : asking || predicting ? 12000 : 3400), disconnect.signal]),
        },
      );
      if (!response.ok) return send(200, predicting ? { suggestions: [] } : { source: "local" });
      if (streaming && response.body && response.headers.get("content-type")?.includes("text/event-stream")) {
        await forwardReply(response, res);
        return;
      }
      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content;
      if (predicting) return send(200, { suggestions: suggestionLines(raw, input) });
      const line = typeof raw === "string"
        ? (asking ? shortConsultation(raw, true) : clean(raw)) : undefined;
      if (!validLine(line, asking, fitted)) return send(200, { source: "local" });
      send(200, { source: "model", line });
    } catch {
      if (res.destroyed) return;
      if (res.headersSent) res.end(JSON.stringify({ error: "unavailable" }) + "\n");
      else send(200, predicting ? { suggestions: [] } : { source: "local" });
    } finally {
      if (streaming || predicting) res.off("close", cancel);
    }
  };
}
