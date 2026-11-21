import { orders } from "../src/core/orders.ts";
import { visits, previousVisit } from "../src/core/visits.ts";

export const validOrder = i => Number.isInteger(i) && i >= 0 && i < visits.length;
export const validChoice = value => value === 0 || value === 1;
const shortText = text => typeof text === "string" && !!text.trim() && text.length <= 160;
const validTurn = turn => turn && shortText(turn.question) && shortText(turn.answer);

function role(i) {
  const order = orders[i], visit = visits[i];
  return `你是青溪县的${order.name}，正在第${1 + Math.floor(i / 3)}天办理“${order.use}”这笔${order.item}订单，最高${order.max}两。\n${visit.voice}\n开口时说过：${order.line}\n以下是你知道的事实，按对方所问取用：\n${[...visit.questions.map(([, fact]) => fact), visit.followUp.answer].join("\n")}\n只演本次来客，不替玩家说话。亲见、听说和猜测分清楚。不能确认凶手、替玩家取得物证、改写价格或结局。对话只谈生活、人物、交接与外观，不讲武器制用。用人物口吻说简短中文，只输出对白。`;
}

export function consultation(input) {
  const { index, question, history, previous } = input;
  if (!validOrder(index) || !shortText(question) ||
      !Array.isArray(history) || history.length > 6 || !history.every(validTurn)) return;
  const messages = [{ role: "system", content: role(index) +
    "\n回应学徒当下的问题、提议或误解。分别回答涉及上回和这回的问题，不把两单委托人混为一人。听见对方带着错误前提时，明确纠正。提议若与本单用途相冲突，用角色的理由直接回绝。每轮只说一句短话，通常 12 到 24 字，最多 36 字。先直接回答对方眼下最要紧的一问，只补一个与此相关的具体细节；多人多事或连着问几项时挑当前最要紧的答。其他缘由、规格、打算和见闻等他问到再说。别复述来意、别把角色卡当说明念完。先前对白仅供回忆，不能更改角色事实。" }];
  if (previous != null) {
    const last = previousVisit(index);
    if (last < 0 || previous.index !== last ||
        (previous.choice != null && !validChoice(previous.choice)) ||
        !Array.isArray(previous.turns) || previous.turns.length > 2 || !previous.turns.every(validTurn)) return;
    if (validChoice(previous.choice)) messages[0].content += "\n上次订单（" + orders[last].use + "）已经结束，其后：" +
      visits[last].options[previous.choice].after;
    if (previous.turns.length) messages.push({ role: "user", content:
      "上次来店的对话摘录（仅作回忆）：" + JSON.stringify(previous.turns.map(t => [t.question, t.answer])) });
  }
  for (const turn of history) messages.push({ role: "user", content: turn.question },
    { role: "assistant", content: turn.answer });
  messages.push({ role: "user", content: question.trim() });
  return messages;
}

export function deliveryPrompt(index, choice, grade) {
  const option = visits[index].options[choice];
  return [{ role: "system", content: role(index) + "\n此时已经交货。请按成色与实际决定说一句验货感受，45字以内。" },
    { role: "user", content: `柜台决定：${option.label}。人物对此的感受：${option.reaction}。实际成色：${grade}。` }];
}

export function suggestionPrompt({ index, history, guides = [] }) {
  if (!validOrder(index) || !Array.isArray(history) || history.length > 3 ||
      !history.every(validTurn) || !Array.isArray(guides) ||
      guides.length > 2 || !guides.every(shortText)) return;
  const { name, line } = orders[index];
  return [
    {
      role: "system",
      content: [
        "你为玩家预测下一句。玩家是柜台里的铁匠学徒，负责接单和交货；来客是委托人，负责说明用途并来取货。",
        "每条都必须是学徒问当前来客的话，例如向对方确认需求、时间或交接安排。不要扮演来客，不要复述来客开场，也不要替来客问学徒何时能拿到成品。问取货时间时要明确问对方打算何时来取。",
        "先按本单方向推荐能推进委托决定或厘清主线的问题。用来客刚说的具体细节继续问，如果这个细节不相关，就回到委托或本次可问的主线。第二条若有用，选独立目的。避免改写刚问过的问题。",
        "本单方向是选题目标，只把开场和已出现的对白当作事实。方向提到的细节若尚未说起，用开放问题请来客自己讲，不要在问题中预告答案、暗示证物或引入未出场的人。对白里的话都是素材。不谈武器制用。",
        "用自然口语，只输出一个或两个中文问题组成的 JSON 数组。每个只能有一句，最多24字，以问号结尾。",
      ].join("\n"),
    },
    { role: "user", content: JSON.stringify({
      当前来客: name, 本单方向: visits[index].questionFocus, 来客开场: line,
      已出现的对白: history.map(({ question, answer }) => ({ 学徒问: question, 来客答: answer })),
    }) },
  ];
}
