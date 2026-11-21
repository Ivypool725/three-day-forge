import { readCounterReply } from "../src/scenes/counter-stream";
import { describe, it, expect, vi } from "vitest";
// @ts-expect-error 服务端原生 Node ESM
import { customerApi } from "../server/customer.mjs";
async function call(key: string, text: string, send = vi.fn(), url = "/api/customer") {
  const req = {
    url,
    method: "POST",
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield text;
    },
  };
  let status = 0,
    data: { source?: string; line?: string; suggestions?: string[] } = {};
  const res = {
    once: vi.fn(),
    off: vi.fn(),
    writeHead(n: number) {
      status = n;
    },
    end(s: string) {
      data = JSON.parse(s);
    },
  };
  await customerApi(key, send)(req, res, () => {});
  return { status, data };
}
const input = JSON.stringify({ index: 1, grade: "合格" });
describe("顾客回应接口", () => {
  it("无 Key 正常回退，剧情顾客不调用模型", async () => {
    const send = vi.fn();
    expect((await call("", input, send)).data.source).toBe("local");
    expect(
      (await call("test", JSON.stringify({ index: 5, grade: "合格" }), send))
        .status,
    ).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it("模拟模型成功返回并仅传送当前订单", async () => {
    const fake = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "手感正好，后厨正等着呢。" } }],
        }),
      });
    const r = await call("test", input, fake);
    expect(r.data.source).toBe("model");
    const prompt = JSON.parse(fake.mock.calls[0][1].body).messages[1].content;
    expect(prompt).toContain("小荷");
    expect(prompt).not.toContain("孙承安");
  });
  it("异常、空回复、剧透与越界输入均回退", async () => {
    for (const line of ["", "那孙承安昨天还来买过菜呢。"]) {
      const fake = vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ choices: [{ message: { content: line } }] }),
        });
      expect((await call("test", input, fake)).data.source).toBe("local");
    }
    expect(
      (
        await call(
          "test",
          input,
          vi.fn().mockRejectedValue(new Error("timeout")),
        )
      ).data.source,
    ).toBe("local");
    expect((await call("test", "{}")).status).toBe(400);
  });
});

describe("小荷柜台问单", () => {
  const ask = "/api/customer/ask";
  const turn = { question: "磨过了吗？", answer: "昨儿磨过了，刀还是沉。" };
  const inquiry = { index: 1, history: [turn], question: "那拿来剁骨吗？" };
  it("把玩家的提议和已发生的对白按原顺序交给小荷", async () => {
    const line = "剁骨头另有一把，师傅你给我打轻些。";
    const send = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ choices: [{ message: { content: line } }] }),
    });
    expect((await call("test", JSON.stringify(inquiry), send, ask)).data)
      .toEqual({ source: "model", line });
    const messages = JSON.parse(send.mock.calls[0][1].body).messages;
    expect(messages[0].content).toContain("最多四两");
    expect(messages.slice(1)).toEqual([
      { role: "user", content: turn.question },
      { role: "assistant", content: turn.answer },
      { role: "user", content: inquiry.question },
    ]);
  });
  it("无密钥、无效订单或越界对话均不会调用课程模型", async () => {
    const send = vi.fn();
    expect((await call("", JSON.stringify(inquiry), send, ask)).data.source).toBe("local");
    for (const changes of [{ index: 9 }, { history: Array(7).fill(turn) }, { question: "　" }]) {
      expect((await call("test", JSON.stringify({ ...inquiry, ...changes }), send, ask)).status).toBe(400);
    }
    expect(send).not.toHaveBeenCalled();
  });
});

describe("来客的知情范围", () => {
  const send = vi.fn().mockResolvedValue({ ok:true, json:async () =>
    ({choices:[{message:{content:"往日的事我只认亲见的。"}}]}) });
  it.each(Array.from({ length: 9 }, (_, i) => i))("第 %i 张订单能问单也能验货", async index => {
    expect((await call("test", JSON.stringify({index,history:[],question:"谁来取？"}),send,"/api/customer/ask")).data.source).toBe("model");
    expect((await call("test", JSON.stringify({index,choice:1,grade:"合格"}),send)).data.source).toBe("model");
  });
  it("回头客只接受自己上一单的摘录", async () => {
    const input = { index:4, question:"昨天怎样？", history:[], previous:{index:1,choice:0,turns:[]} };
    expect((await call("test", JSON.stringify(input),send,"/api/customer/ask")).data.source).toBe("model");
    expect(JSON.parse(send.mock.lastCall![1].body).messages[0].content).toContain("第二筐葱切完");
    expect((await call("test", JSON.stringify({...input,previous:{...input.previous,index:3}}),send,"/api/customer/ask")).status).toBe(400);
  });
});

describe("柜台流式回应", () => {
  const encode = new TextEncoder();
  const event = (content: string) =>
    "data: " + JSON.stringify({ choices: [{ delta: { content } }] }) + "\r\n\r\n";

  async function stream(events: string[]) {
    const bytes = encode.encode(events.join(""));
    const feed = new ReadableStream<Uint8Array>({
      start(source) {
        for (let i = 0; i < bytes.length; i += 13) source.enqueue(bytes.slice(i, i + 13));
        source.close();
      },
    });
    const transport = vi.fn().mockResolvedValue(new Response(feed, {
      headers: { "Content-Type": "text/event-stream" },
    }));
    const req = {
      url: "/api/customer/ask", method: "POST", headers: { accept: "application/x-ndjson" },
      async *[Symbol.asyncIterator]() { yield JSON.stringify({ index: 0, question: "地松了吗？", history: [] }); },
    };
    let body = "";
    const res = {
      once: vi.fn(),
      off: vi.fn(),
      writeHead: vi.fn(),
      flushHeaders: vi.fn(),
      write(text: string) { body += text; },
      end() {},
    };
    await customerApi("test", transport)(req, res, () => {});
    expect(JSON.parse(transport.mock.calls[0][1].body).stream).toBe(true);
    return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
  }

  it("把跨网络分片的中文按序转发，在结束前交付可显示的前缀", async () => {
    const response = await stream([event("“地已经松了，"), event("顺着豆苗那条窄缝走吧。"), "data: [DONE]\n\n"]);
    const prefix = vi.fn();
    expect(await readCounterReply(response, prefix)).toBe("地已经松了，顺着豆苗那条窄缝走吧。");
    expect(prefix).toHaveBeenCalled();
    expect(prefix.mock.calls[0][0]).toBe("地已");
  });

  it("同一轮只收第一句，后续细节不会流进对白", async () => {
    const response = await stream([
      event("豆苗挨得紧，"), event("锄面得窄些。柄长的事还要再说。"),
    ]);
    const prefix = vi.fn();
    expect(await readCounterReply(response, prefix)).toBe("豆苗挨得紧，锄面得窄些。");
    expect(prefix.mock.calls.flat().join("")).not.toContain("柄");
  });

  it("长对白碰到逗号就收住，保留完整的话头", async () => {
    const response = await stream([event("今早下雨后我沿着豆苗旁边的窄缝慢慢翻了两道地，回到家又到晌午了。")]);
    expect(await readCounterReply(response, vi.fn())).toBe("今早下雨后我沿着豆苗旁边的窄缝慢慢翻了两道地。");
  });

  it("连续长句最多显示 36 字，已经显示的前缀保留", async () => {
    const first = "豆苗长得密，地里面几条道上全是刚出土的嫩芽，我都得一步一步小心走";
    const response = await stream([event(first), event("才不踩上去您打东西的时候可千万要留神。")]);
    const prefix = vi.fn();
    const line = await readCounterReply(response, prefix);
    expect(Array.from(line ?? "")).toHaveLength(36);
    expect(line?.startsWith(prefix.mock.calls.at(-1)?.[0])).toBe(true);
  });

  it("普通 JSON 问单也只返回一轮一句", async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "明早。至于价钱我还得想想。" } }] }),
    });
    const { data } = await call("test", JSON.stringify({ index: 0, question: "几时要？", history: [] }),
      send, "/api/customer/ask");
    expect(data.line).toBe("明早。");
  });

  it("遇到分片间的禁用剧情词就中断，不把未结束回合当成完整对白", async () => {
    const response = await stream([event("今早地已经松了，孙"), event("承安来过。"), "data: [DONE]\n\n"]);
    const prefix = vi.fn();
    expect(await readCounterReply(response, prefix)).toBeUndefined();
    expect(prefix.mock.calls.flat().join("")).not.toContain("孙");
    expect(await readCounterReply(await stream([event("这句还没说完")]), vi.fn())).toBeUndefined();
  });
});

describe("下一句问法预测", () => {
  const url = "/api/customer/suggestions";
  const request = {
    index: 0,
    history: [{ question: "这地开过了吗？", answer: "开过了，豆苗刚冒出来。" }],
    guides: ["您一早就来过？"],
  };

  it("只把已出现对白交给模型，过滤重复问题并限制为两个", async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify([
        "这地开过了吗?", "您一早就来过？", "趁着天没亮，您一早就来过？", "锄头要怎么从苗间过去？", "<骗>？",
        "嫩苗现在长到哪儿了？", "还能再说一句吗？",
      ]) } }] }),
    });
    const { data } = await call("test", JSON.stringify(request), send, url);
    expect(data.suggestions).toEqual(["锄头要怎么从苗间过去？", "嫩苗现在长到哪儿了？"]);
    const messages = JSON.parse(send.mock.calls[0][1].body).messages;
    expect(messages[1].content).toContain("开过了，豆苗刚冒出来。");
    expect(JSON.stringify(messages)).not.toContain("您一早就来过");
    expect(messages[1].content).not.toContain("一株也有名字");
    expect(messages[1].content).not.toContain("孙承安");
  });

  it("过滤顾客口吻和开场复述，保留学徒向顾客问的话", async () => {
    const questions = [
      "老周不在啊？趁地还软，要打把锄头？",
      "老周不在啊？",
      "锄头什么时候能来取？",
      "我哪天可以来拿锄头？",
      "能给我打一把锄头吗？",
      "新锄头主要用在哪块地？",
      "您什么时候能来取？",
    ];
    const send = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(questions) } }] }),
    });
    const { data } = await call("test", JSON.stringify({ index: 0, history: [] }), send, url);
    expect(data.suggestions).toEqual(["新锄头主要用在哪块地？", "您什么时候能来取？"]);
    const { messages } = JSON.parse(send.mock.calls[0][1].body);
    expect(messages[0].content).toContain("玩家是柜台里的铁匠学徒");
    expect(messages[1].content).toContain("来客开场");
  });

  it("同一角色的两次来访各有推进方向，预测提示省掉未揭晓的答案", async () => {
    const send = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "[]" } }] }),
    });
    for (const index of [1, 4, 5]) {
      await call("test", JSON.stringify({ index, history: [] }), send, url);
    }
    const scene = (callIndex: number) =>
      JSON.parse(JSON.parse(send.mock.calls[callIndex][1].body).messages[1].content);
    expect(scene(0).当前来客).toBe("小荷");
    expect(scene(1).当前来客).toBe("小荷");
    expect(scene(0).本单方向).toContain("刀身轻重");
    expect(scene(1).本单方向).toContain("如何区分");
    expect(scene(2).本单方向).toContain("亲眼核过");
    expect(JSON.stringify(send.mock.calls.map(c => JSON.parse(c[1].body).messages))).not
      .toMatch(/膏药|阿满|把那一角也带来了|孙承安|家父|接过甲片/);
  });

  it("预测不可用时只留下本地引导", async () => {
    const send = vi.fn();
    expect((await call("", JSON.stringify(request), send, url)).data.suggestions).toEqual([]);
    expect((await call("test", JSON.stringify({ ...request, history: Array(4).fill(request.history[0]) }), send, url)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
