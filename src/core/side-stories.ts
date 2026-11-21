import type { GameState } from "./game";

type Commitment = { order: number; choice: 0 | 1 };

export const sideStories = [
  {
    id: "farmer",
    order: 7,
    title: "田埂上的联保书",
    prompt: "请刘农夫联络街坊",
    line: "上回你给孩子配的柄，她握得住。这回若还记得她扎第一捆麦的红线，我就去喊几位乡邻，天黑前一起给你作保。",
    previous: { order: 3, choice: 1 },
    pledge: { order: 7, choice: 1 },
  },
  {
    id: "cook",
    order: 4,
    title: "长桌上的署名",
    prompt: "请小荷准备联保书",
    line: "上回那把轻刀，我现在每天都用。晚市一散，我给愿意担保的人留张长桌。刘叔要能把人带来，名字、住处和手印，今晚就能写齐。",
    previous: { order: 1, choice: 0 },
  },
  {
    id: "hunter",
    order: 6,
    title: "渡船的后舱",
    prompt: "请猎户安排渡船",
    line: "上回你用布裹住了我闺女的泥雀。这回我给你留个后舱。要去府城交材料，天擦黑就来渡口，我带你绕过县差。",
    previous: { order: 2, choice: 0 },
  },
  {
    id: "guard",
    order: 5,
    title: "旧字的印记",
    prompt: "请秦军户帮忙带证",
    line: "这把佩刀上我爹刻的姓，劳你留住。修好后我给你写一张营中通行凭条。你若找到县衙的原收据，我肯陪你去府里说明来历。",
    pledge: { order: 5, choice: 1 },
  },
  {
    id: "traveler",
    order: 8,
    title: "两份收条",
    prompt: "请外乡客安排递状",
    line: "府城的行会常替客商收件。你照件数开收条，我给你留个递状的门路。到时我把证物送进府署，再带一张盖印的回执回来。",
    pledge: { order: 8, choice: 0 },
  },
] as const satisfies readonly {
  id: string;
  order: number;
  title: string;
  prompt: string;
  line: string;
  previous?: Commitment;
  pledge?: Commitment;
}[];

export type SideStoryId = (typeof sideStories)[number]["id"];

function fulfilled(s: GameState, commitment: Commitment) {
  const { order, choice } = commitment;
  return s.visits?.[order]?.choice === choice &&
    Boolean(s.records[order] && s.records[order].grade !== "瑕疵");
}

export function availableSideStory(s: GameState) {
  if (s.phase !== "order") return;
  const story = sideStories.find((entry) => entry.order === s.completed);
  if (story && (!("previous" in story) || fulfilled(s, story.previous))) return story;
}

export function recordSideStory(s: GameState) {
  const story = availableSideStory(s);
  if (!story) return;
  const promises = s.sideStories ??= [];
  if (!promises.includes(story.id)) promises.push(story.id);
  return story;
}

export function hasSupport(s: GameState, ...ids: SideStoryId[]) {
  return ids.every((id) => {
    const story = sideStories.find((entry) => entry.id === id)!;
    return s.sideStories?.includes(id) &&
      (!("pledge" in story) || fulfilled(s, story.pledge));
  });
}
