import { buildCharacterCardPromptBlock, gentleCompanionPolicy } from "../characterCards";
import { summarizeMvuSnapshot } from "../mvu/variables";
import type { WorldState } from "../types";
import type {
  ChatPromptBundle,
  DialogueContext,
  IntentCharacter,
  LlmChatSummaryRequest,
  LlmDialogueRequest,
  LlmSocialDialogueRequest,
  SocialDialogueContext
} from "./types";

const dialogueSchema = `{
  "characterId": "mika",
  "text": "窗外的光很软，我陪你慢慢来。",
  "emotion": "calm|happy|curious|focused|sleepy|excited|cozy",
  "actionSuggestion": "idle|chat|greet_owner|talk_to_character|observe_window|look_weather|think|rest|play",
  "reason": "晴天早晨，角色根据窗外光线进行温和回应",
  "memoryCandidate": {
    "importance": 1,
    "summary": "米卡在晴天早晨用温和语气陪伴主人。"
  }
}`;

const npcSocialDialogueSchema = `{
  "socialEventId": "pending-xxx",
  "speakerId": "mika",
  "targetId": "nan",
  "text": "南星，窗边那束光好像刚好落到你旁边。",
  "emotion": "calm|happy|curious|focused|sleepy|excited|cozy",
  "actionSuggestion": "talk_to_character",
  "reason": "两个角色靠近窗边，适合轻声交流",
  "memoryCandidate": {
    "importance": 2,
    "summary": "米卡在窗边主动和南星轻声交流。"
  }
}`;

const summarySchema = `{
  "summary": "今天生态舱保持了温和的日常节奏。",
  "ownerSummary": "主人在休息和专注之间切换，整体节奏平稳。",
  "characterHighlights": [
    { "characterId": "mika", "summary": "米卡安静看向窗边。" }
  ],
  "memoryCandidate": "今天的生态舱留下了温和、连贯的生活摘要。"
}`;

const chatSummarySchema = `{
  "characterId": "mika",
  "summary": "主人今天和米卡聊到天气与休息，米卡保持温柔陪伴。"
}`;

const intentSchema =
  '{"characterId":"string","intent":"string","targetId":"string|null","action":"idle|walk|study|rest|chat|drink|snack|observe_window|look_weather|wander|greet_owner|talk_to_character|play|nap|think|react_weather|error","reason":"string","memoryCandidate":"string"}';

const socialLegacySchema =
  '{"speakerAId":"string","speakerBId":"string","turns":[{"speakerId":"string","text":"string"}],"sceneSummary":"string","memoryCandidate":"string"}';

export function buildSingleCharacterDialoguePrompt(input: LlmDialogueRequest): ChatPromptBundle {
  if (input.chatMemory) {
    return buildManualChatPrompt(input);
  }

  return {
    system: buildSystemText("你要根据角色卡、当前 WorldState 摘要、天气、时间、主人模式和最近事件，生成单个角色对主人的一句自然短对话。"),
    user: [
      buildCharacterCardPromptBlock(input.characterId),
      "【当前上下文】",
      input.worldSummary,
      input.ownerInput ? `主人输入：${input.ownerInput}` : "主人输入：无",
      "【回复要求】",
      "中文，不超过 35 个字，适合气泡显示，有角色感。",
      "不要像 AI 助手，不要解释设定，不要输出 Markdown。",
      "不要输出多余文本，只输出 JSON。",
      `输出 JSON schema：${dialogueSchema}`
    ].join("\n")
  };
}

export function buildManualChatPrompt(input: LlmDialogueRequest): ChatPromptBundle {
  const memory = input.chatMemory;
  return {
    system: buildSystemText("你要扮演角色与主人进行轻量私聊，只生成角色本次回复。"),
    user: [
      buildCharacterCardPromptBlock(input.characterId),
      "【长期记忆 largeSummary】",
      memory?.largeSummary || "暂无长期私聊记忆。",
      "【短期摘要 smallSummary】",
      memory?.smallSummary || "暂无短期私聊摘要。",
      "【最近对话 recentMessages，最多 8 条】",
      JSON.stringify((memory?.recentMessages ?? []).slice(-8), null, 2),
      "【当前 WorldState 摘要】",
      input.worldSummary,
      "【主人最新输入 ownerInput】",
      input.ownerInput || "",
      "【回复要求】",
      "中文，不超过 45 个字，像角色在小气泡里自然回复。",
      "不要 Markdown，不要解释设定，不要重复角色卡。",
      "必须遵守 Gentle Companion Policy：不责备、不内疚、不阴阳怪气、不攻击用户。",
      "只输出严格 JSON。",
      `输出 JSON schema：${dialogueSchema}`
    ].join("\n")
  };
}

export function buildSmallChatSummaryPrompt(input: LlmChatSummaryRequest): ChatPromptBundle {
  return {
    system: buildSystemText("你要把角色与主人的最近私聊压缩成短期摘要。"),
    user: [
      buildCharacterCardPromptBlock(input.characterId),
      "【当前 smallSummary】",
      input.memory.smallSummary || "暂无。",
      "【最近完整对话，只保留最近 8 条】",
      JSON.stringify(input.memory.recentMessages.slice(-8), null, 2),
      "【回复要求】",
      "summary 约 80-150 字，温和中性，不评价用户好坏，不制造心理诊断。",
      "不要保存完整聊天全文，可以保留近期主题、角色回应方式和下一次应延续的语气。",
      "只输出严格 JSON。",
      `输出 JSON schema：${chatSummarySchema}`
    ].join("\n")
  };
}

export function buildLargeChatSummaryPrompt(input: LlmChatSummaryRequest): ChatPromptBundle {
  return {
    system: buildSystemText("你要把角色与主人的私聊记忆压缩成长期摘要。"),
    user: [
      buildCharacterCardPromptBlock(input.characterId),
      "【当前 largeSummary】",
      input.memory.largeSummary || "暂无。",
      "【最新 smallSummary】",
      input.memory.smallSummary || "暂无。",
      "【重要 memoryCandidate】",
      JSON.stringify((input.memory.memoryCandidates ?? []).slice(0, 6), null, 2),
      "【回复要求】",
      "summary 约 200-400 字，只保留长期有用的信息。",
      "不保存敏感隐私细节，不对用户做负面判断，不保存完整原话，除非非常短且重要。",
      "继续保持 Gentle Companion Policy。",
      "只输出严格 JSON。",
      `输出 JSON schema：${chatSummarySchema}`
    ].join("\n")
  };
}

export function buildCharacterSocialDialoguePrompt(input: LlmDialogueRequest): ChatPromptBundle {
  const targetId = input.targetCharacterId ?? "room";
  return {
    system: buildSystemText("你要根据两个角色的角色卡和当前世界状态，生成其中一个角色的一句社交短对话。"),
    user: [
      buildCharacterCardPromptBlock(input.characterId),
      targetId === "room" ? "目标角色：房间整体" : buildCharacterCardPromptBlock(targetId),
      "【当前上下文】",
      input.worldSummary,
      "【回复要求】",
      "中文，不超过 35 个字，像角色之间轻声说一句话。",
      "不要解释设定，不要输出 Markdown，只输出 JSON。",
      `输出 JSON schema：${dialogueSchema}`
    ].join("\n")
  };
}

export function buildNpcSocialDialoguePrompt(input: LlmSocialDialogueRequest): ChatPromptBundle {
  return {
    system: buildSystemText("你要根据两个 NPC 的角色卡、当前 WorldState 摘要和社交事件，生成 speaker 对 target 的一句自然短对话。"),
    user: [
      "【说话角色 speaker】",
      buildCharacterCardPromptBlock(input.speakerId),
      "【目标角色 target】",
      buildCharacterCardPromptBlock(input.targetId),
      "【当前 WorldState 摘要】",
      input.worldSummary,
      "【pendingSocialEvent】",
      JSON.stringify(
        {
          socialEventId: input.socialEventId,
          speakerId: input.speakerId,
          targetId: input.targetId,
          seedText: input.socialSeed ?? input.socialEventId
        },
        null,
        2
      ),
      "【回复要求】",
      "只生成 speaker 的一句中文短对话，不超过 35 个字，适合显示在 speaker 头上的气泡。",
      "不要生成多轮对话，不要像 AI 助手，不要解释设定，不要输出 Markdown。",
      "必须遵守 Gentle Companion Policy：不责备、不内疚、不阴阳怪气、不攻击用户。",
      "只输出严格 JSON。",
      `输出 JSON schema：${npcSocialDialogueSchema}`
    ].join("\n")
  };
}

export function buildDailySummaryPrompt(world: WorldState): ChatPromptBundle {
  return {
    system: buildSystemText("你要把一天的生态圈事件压缩成温和、简洁、适合日终回顾的总结。"),
    user: [
      "【当前 WorldState 摘要】",
      summarizeWorld(world),
      "【最近事件 eventLog】",
      JSON.stringify(world.eventLog.slice(0, 12), null, 2),
      "【已有 memories，只用于提炼，不要逐字复述】",
      JSON.stringify(world.memories.slice(0, 12), null, 2),
      "【角色当前状态】",
      JSON.stringify(
        world.characters.map((character) => ({
          id: character.id,
          name: character.name,
          mood: character.mood,
          energy: character.energy,
          currentAction: character.currentAction,
          lastDialogue: character.lastDialogue
        })),
        null,
        2
      ),
      "【主人上下文】",
      JSON.stringify(world.ownerContext, null, 2),
      "【回复要求】",
      "中文，简洁，保留天气、时间段、主人模式变化、角色行为和最近事件。",
      "总结主人上下文时保持温和中性，不评价用户，不制造内疚。",
      "不要保存完整聊天全文，不要复述敏感隐私细节。",
      "只输出 JSON。",
      `输出 JSON schema：${summarySchema}`
    ].join("\n")
  };
}

export function buildDialoguePrompt(context: DialogueContext): ChatPromptBundle {
  return buildSingleCharacterDialoguePrompt({
    characterId: context.character.id,
    target: "owner",
    ownerInput: context.ownerAction,
    worldSummary: summarizeWorld(context.world)
  });
}

export function buildSocialDialoguePrompt(context: SocialDialogueContext): ChatPromptBundle {
  return {
    system: buildSystemText("你要根据两个角色的角色卡、当前世界状态和社交种子，生成一段短小自然的双人对话。"),
    user: [
      buildCharacterCardPromptBlock(context.primaryCharacter.id),
      buildCharacterCardPromptBlock(context.secondaryCharacter.id),
      "【当前 WorldState 摘要】",
      summarizeWorld(context.world),
      `社交种子：${context.socialSeed}`,
      "请输出 2 到 4 轮短对话，不要太长，不要跑题。",
      `输出 JSON 结构：${socialLegacySchema}`
    ].join("\n")
  };
}

export function buildIntentPrompt(character: IntentCharacter, world: WorldState): ChatPromptBundle {
  return {
    system: buildSystemText("你要根据角色卡和当前世界状态，为角色生成接下来一小段生活意图。"),
    user: [
      buildCharacterCardPromptBlock(character.id),
      "【当前 WorldState 摘要】",
      summarizeWorld(world),
      `为 ${character.name} 生成一个当前最自然的行动意图。`,
      `输出 JSON 结构：${intentSchema}`
    ].join("\n")
  };
}

function buildSystemText(task: string): string {
  return [
    "你是生态圈三号中的角色语言生成器。",
    task,
    "所有输出必须是严格 JSON。",
    "Gentle Companion Policy：",
    gentleCompanionPolicy.join(" "),
    "禁止责备、制造内疚、阴阳怪气、攻击性表达和命令式压迫。"
  ].join(" ");
}

function summarizeWorld(world: WorldState): string {
  const recentLogs = world.eventLog
    .slice(0, 6)
    .map((entry) => `${new Date(entry.at).toLocaleTimeString("zh-CN", { hour12: false })} ${entry.type}: ${entry.text}`)
    .join(" | ");

  return JSON.stringify(
    {
      weather: {
        kind: world.weather.kind,
        temperature: world.weather.temperature,
        city: world.weather.city
      },
      time: {
        period: world.weatherVisual.period,
        updatedAt: world.weather.updatedAt
      },
      owner: {
        mode: world.ownerContext.mode,
        presence: world.ownerContext.presence,
        todayFocusMinutes: world.ownerContext.todayFocusMinutes
      },
      characters: world.characters.map((character) => ({
        id: character.id,
        name: character.name,
        mood: character.mood,
        energy: character.energy,
        currentAction: character.currentAction,
        lastDialogue: character.lastDialogue
      })),
      eventLog: recentLogs || "暂无最近事件",
      pendingSocialEvent: world.pendingSocialEvent?.seedText ?? "none",
      memories: world.memories.slice(0, 6).map((memory) => ({
        scope: memory.scope,
        targetId: memory.targetId,
        summary: memory.summary,
        importance: memory.importance
      })),
      llmBudget: world.llmBudget,
      mvuVariables: summarizeMvuSnapshot(world)
    },
    null,
    2
  );
}
