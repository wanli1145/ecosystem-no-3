/**
 * 渲染进程 LLM 服务
 * 通过 preload bridge 调用 main 进程的 OpenAI 兼容 API
 */
import { getCharacterProfile } from "../../shared/config/characters";
import { getDiverseResponse } from "../data/responses";
import type { ChatMessage } from "../components/ChatHistory";
import type { MemoryEntry } from "../../shared/types";

/* ── 简单限流 ── */
let lastCallAt = 0;
const MIN_INTERVAL_MS = 3000;

function canCallLLM(): boolean {
  return Date.now() - lastCallAt >= MIN_INTERVAL_MS;
}

function cleanOutput(text: string): string {
  return text.replace(/^[「「【"':：\s]+|[」」】"':：\s]+$/g, "").trim();
}

/* ── 单角色回复 ── */
export async function chatWithCharacter(
  characterId: string,
  userAction: "coffee" | "snack" | "pet" | "study" | "rest" | "chat"
): Promise<string> {
  const profile = getCharacterProfile(characterId);
  if (!profile || !canCallLLM()) {
    return getDiverseResponse(userAction);
  }

  const actionLabel: Record<string, string> = {
    coffee: "递了一杯咖啡",
    snack: "递了一份零食",
    pet: "温柔地摸了摸头",
    study: "安排你去学习",
    rest: "安排你去休息",
    chat: "想和你聊聊天"
  };

  const systemPrompt = [
    `你是${profile.name}，${profile.personalityTags.join("、")}的角色。`,
    `说话风格：${profile.speakingStyle}。`,
    `语气：${profile.defaultTone}。`,
    `用简短温暖的中文回复主人，不超过30字。`,
    `只输出回复内容，不要加引号或角色名。`
  ].join("\n");

  const userMessage = `主人${actionLabel[userAction] || "和你互动了"}，你会怎么回应？`;

  lastCallAt = Date.now();
  if (!window.ecosystem?.callLLM) return getDiverseResponse(userAction);
  const result = await window.ecosystem.callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    { temperature: 0.8, maxTokens: 100 }
  );

  if (result.ok && result.text) {
    // 清理 LLM 输出（去掉可能的引号、角色名前缀）
    return result.text.replace(/^[「「【"':：\s]+|[」」】"':：\s]+$/g, "").trim() || getDiverseResponse(userAction);
  }

  return getDiverseResponse(userAction);
}

/* ── 双角色对话 ── */
export interface ChatTurn {
  speakerId: string;
  text: string;
}

export async function chatBetweenCharacters(
  charAId: string,
  charBId: string
): Promise<ChatTurn[]> {
  const profileA = getCharacterProfile(charAId);
  const profileB = getCharacterProfile(charBId);
  if (!profileA || !profileB || !canCallLLM()) return [];

  const systemPrompt = [
    `你是两个角色的对话编剧。请写一段简短的日常对话。`,
    `角色A：${profileA.name}，性格${profileA.personalityTags.join("、")}，说话风格：${profileA.speakingStyle}。`,
    `角色B：${profileB.name}，性格${profileB.personalityTags.join("、")}，说话风格：${profileB.speakingStyle}。`,
    `要求：`,
    `- 2-3轮对话，每句不超过20字`,
    `- 体现各自性格差异`,
    `- 输出 JSON 数组格式：[{"speaker":"${profileA.name}","text":"..."},{"speaker":"${profileB.name}","text":"..."}]`,
    `- 只输出 JSON，不要其他内容`
  ].join("\n");

  const topics = [
    "今天天气真好",
    "你觉得主人今天心情怎么样",
    "最近有什么有趣的事吗",
    "你最喜欢做什么",
    "要不要一起玩"
  ];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  lastCallAt = Date.now();
  if (!window.ecosystem?.callLLM) return [];
  const result = await window.ecosystem.callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `以"${topic}"为话题开始对话。` }
    ],
    { temperature: 0.9, maxTokens: 200 }
  );

  if (result.ok && result.text) {
    try {
      // 尝试解析 JSON，处理可能被 markdown 包裹的情况
      const jsonStr = result.text.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
      const arr = JSON.parse(jsonStr) as Array<{ speaker: string; text: string }>;
      return arr.map((turn) => ({
        speakerId: turn.speaker === profileA.name ? charAId : charBId,
        text: turn.text.replace(/^[「「【"':：\s]+|[」」】"':：\s]+$/g, "").trim()
      })).filter((t) => t.text.length > 0);
    } catch {
      // JSON 解析失败，返回空
      return [];
    }
  }

  return [];
}

/* ── 带上下文的对话（聊天面板用） ── */
export async function chatWithCharacterWithContext(
  characterId: string,
  userText: string,
  chatHistory: ChatMessage[],
  memories: MemoryEntry[]
): Promise<string> {
  const profile = getCharacterProfile(characterId);
  if (!profile || !canCallLLM()) return "";

  // 构建对话历史上下文（最近 10 条）
  const recentHistory = chatHistory
    .filter((m) => m.speakerId === characterId || m.isUser)
    .slice(-10)
    .map((m) => `${m.isUser ? "主人" : profile.name}：${m.text}`)
    .join("\n");

  // 构建记忆上下文（最近 5 条 owner 记忆）
  const recentMemories = memories
    .filter((m) => m.scope === "owner" || m.scope === "global")
    .slice(0, 5)
    .map((m) => m.summary)
    .join("\n");

  const systemPrompt = [
    `你是${profile.name}，${profile.personalityTags.join("、")}的角色。`,
    `说话风格：${profile.speakingStyle}。`,
    `语气：${profile.defaultTone}。`,
    recentMemories ? `你记得关于主人的事情：\n${recentMemories}` : "",
    `用简短温暖的中文回复主人，每次不超过40字。`,
    `保持角色一致性，体现你的性格特点。`,
    `只输出回复内容，不要加引号或角色名。`
  ].filter(Boolean).join("\n");

  const messages = [{ role: "system", content: systemPrompt }];
  if (recentHistory) {
    // 注入历史对话作为上下文
    messages.push({ role: "user", content: `以下是之前的对话记录：\n${recentHistory}` });
    messages.push({ role: "assistant", content: "我记住了之前的对话。" });
  }
  messages.push({ role: "user", content: userText });

  lastCallAt = Date.now();
  if (!window.ecosystem?.callLLM) return "";
  const result = await window.ecosystem.callLLM(messages, { temperature: 0.8, maxTokens: 150 });

  if (result.ok && result.text) {
    return cleanOutput(result.text);
  }
  return "";
}

/* ── 记忆提取 ── */
export async function extractMemory(
  characterId: string,
  userText: string
): Promise<{ key: string; value: string } | null> {
  if (!canCallLLM()) return null;

  const systemPrompt = [
    `你是一个记忆提取器。判断用户的发言中是否包含值得记住的信息。`,
    `值得记住的：名字、昵称、喜好、习惯、重要事件、个人经历。`,
    `不值得记住的：普通问候、闲聊、没有具体信息的对话。`,
    `如果有值得记住的信息，输出 JSON：{"key":"类别","value":"具体内容"}`,
    `类别可以是：名字、喜好、习惯、事件、其他。`,
    `如果没有值得记住的信息，只输出：null`,
    `只输出 JSON 或 null，不要其他内容。`
  ].join("\n");

  lastCallAt = Date.now();
  if (!window.ecosystem?.callLLM) return null;
  const result = await window.ecosystem.callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ],
    { temperature: 0.3, maxTokens: 80 }
  );

  if (result.ok && result.text) {
    const text = result.text.trim();
    if (text === "null" || !text.startsWith("{")) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}

/* ── 自主行为生成 ── */
export type TimeOfDay = "morning" | "forenoon" | "noon" | "afternoon" | "evening" | "night" | "late_night";

export function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 10) return "morning";
  if (hour >= 10 && hour < 12) return "forenoon";
  if (hour >= 12 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 20) return "evening";
  if (hour >= 20 && hour < 24) return "night";
  return "late_night";
}

export const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: "早晨",
  forenoon: "上午",
  noon: "午间",
  afternoon: "下午",
  evening: "傍晚",
  night: "夜间",
  late_night: "深夜"
};

export async function proactiveAction(
  characterId: string,
  timeOfDay: TimeOfDay,
  lastInteractionAgo: number
): Promise<string> {
  const profile = getCharacterProfile(characterId);
  if (!profile || !canCallLLM()) return "";

  const idleHint = lastInteractionAgo > 30 * 60 * 1000
    ? "主人已经很久没出现了，你可以关心一下。"
    : "";

  const systemPrompt = [
    `你是${profile.name}，${profile.personalityTags.join("、")}的角色。`,
    `说话风格：${profile.speakingStyle}。`,
    `语气：${profile.defaultTone}。`,
    `现在是${TIME_LABELS[timeOfDay]}。`,
    idleHint,
    `用简短温暖的中文主动和主人说一句话，不超过25字。`,
    `只输出内容，不要加引号或角色名。`
  ].filter(Boolean).join("\n");

  lastCallAt = Date.now();
  if (!window.ecosystem?.callLLM) return "";
  const result = await window.ecosystem.callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `作为${profile.name}，在${TIME_LABELS[timeOfDay]}主动和主人打招呼。` }
    ],
    { temperature: 0.9, maxTokens: 60 }
  );

  if (result.ok && result.text) {
    return cleanOutput(result.text);
  }
  return "";
}
