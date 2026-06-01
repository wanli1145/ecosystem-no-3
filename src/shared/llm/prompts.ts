import type {
  CharacterCard,
  ChatPromptBundle,
  DialogueContext,
  IntentCharacter,
  SocialDialogueContext
} from "./types";
import type { WorldState } from "../types";

const gentlePolicy = [
  "你是生态圈三号中的角色生成助手。",
  "必须保持温和、轻松、正向的语气。",
  "不要责备用户，不要制造内疚，不要阴阳怪气。",
  "输出必须是严格 JSON，不要输出额外说明。",
  "句子尽量短，适合桌面气泡显示。"
].join(" ");

const singleDialogueSchema =
  '{"speakerId":"string","text":"string","emotion":"calm|bright|cozy|focused","suggestedAction":"idle|study|rest|chat|walk|drink|snack","memoryCandidate":"string"}';

const socialDialogueSchema =
  '{"speakerAId":"string","speakerBId":"string","turns":[{"speakerId":"string","text":"string"}],"sceneSummary":"string","memoryCandidate":"string"}';

const intentSchema =
  '{"characterId":"string","intent":"string","targetId":"string|null","action":"idle|study|rest|chat|walk|drink|snack","reason":"string","memoryCandidate":"string"}';

const summarySchema =
  '{"summary":"string","ownerSummary":"string","characterHighlights":[{"characterId":"string","summary":"string"}],"memoryCandidate":"string"}';

export function buildDialoguePrompt(context: DialogueContext): ChatPromptBundle {
  const card = normalizeCard(context.character.card, context.character.id, context.character.name);
  return {
    system: [
      gentlePolicy,
      "你要根据角色卡、当前世界状态和主人上下文，生成角色对主人的一句简短回应。",
      `输出 JSON 结构：${singleDialogueSchema}`
    ].join(" "),
    user: buildDialogueUserText(card, context)
  };
}

export function buildSocialDialoguePrompt(context: SocialDialogueContext): ChatPromptBundle {
  const primaryCard = normalizeCard(
    context.primaryCharacter.card,
    context.primaryCharacter.id,
    context.primaryCharacter.name
  );
  const secondaryCard = normalizeCard(
    context.secondaryCharacter.card,
    context.secondaryCharacter.id,
    context.secondaryCharacter.name
  );

  return {
    system: [
      gentlePolicy,
      "你要根据两个角色的角色卡、当前世界状态和社交种子，生成一段短小自然的双人对话。",
      "对话应当轻松、克制、像桌面气泡里会出现的话。",
      `输出 JSON 结构：${socialDialogueSchema}`
    ].join(" "),
    user: [
      `角色 A 卡：${JSON.stringify(primaryCard)}`,
      `角色 B 卡：${JSON.stringify(secondaryCard)}`,
      `当前世界：${summarizeWorld(context.world)}`,
      `社交种子：${context.socialSeed}`,
      "请输出 2 到 4 轮短对话，不要太长，不要跑题，不要加入负面陪伴内容。"
    ].join("\n")
  };
}

export function buildIntentPrompt(character: IntentCharacter, world: WorldState): ChatPromptBundle {
  const card = normalizeCard(character.card, character.id, character.name);
  return {
    system: [
      gentlePolicy,
      "你要根据角色卡和当前世界状态，为角色生成接下来一小段生活意图。",
      `输出 JSON 结构：${intentSchema}`
    ].join(" "),
    user: buildWorldUserText(card, world, `为 ${character.name} 生成一个当前最自然的行动意图。`)
  };
}

export function buildDailySummaryPrompt(world: WorldState): ChatPromptBundle {
  return {
    system: [
      gentlePolicy,
      "你要把一天的生态圈事件压缩成温和、简洁、适合日终回顾的总结。",
      `输出 JSON 结构：${summarySchema}`
    ].join(" "),
    user: buildWorldUserText(null, world, "为今天生成一段日终总结和记忆压缩。")
  };
}

function buildDialogueUserText(card: CharacterCard, context: DialogueContext): string {
  const worldText = summarizeWorld(context.world);
  const ownerText = context.ownerAction ? `\n主人动作：${context.ownerAction}` : "";
  const pendingText = context.pendingSocialEventSeed ? `\n待处理社交种子：${context.pendingSocialEventSeed}` : "";
  return [
    `角色卡：${JSON.stringify(card)}`,
    `当前世界：${worldText}`,
    ownerText,
    pendingText,
    "请输出符合角色性格的一句短回复。"
  ]
    .filter(Boolean)
    .join("\n");
}

function buildWorldUserText(
  card: CharacterCard | null,
  world: WorldState,
  instruction: string
): string {
  const lines = [
    card ? `角色卡：${JSON.stringify(card)}` : null,
    `当前世界：${summarizeWorld(world)}`,
    instruction
  ].filter(Boolean);
  return lines.join("\n");
}

function summarizeWorld(world: WorldState): string {
  const weather = world.weather;
  const owner = world.ownerContext;
  const recentLogs = world.eventLog.slice(0, 4).map((entry) => `${entry.type}:${entry.text}`).join(" | ");
  const pending = world.pendingSocialEvent ? world.pendingSocialEvent.seedText : "none";
  return JSON.stringify(
    {
      uiMode: world.uiMode,
      owner: {
        presence: owner.presence,
        mode: owner.mode,
        lastInteractionAt: owner.lastInteractionAt,
        todayFocusMinutes: owner.todayFocusMinutes
      },
      weather: {
        kind: weather.kind,
        temperature: weather.temperature,
        city: weather.city
      },
      characters: world.characters.map((character) => ({
        id: character.id,
        name: character.name,
        mood: character.mood,
        energy: character.energy,
        currentAction: character.currentAction,
        lastDialogue: character.lastDialogue
      })),
      relationshipsPreview: summarizeRelationships(world),
      pendingSocialEvent: pending,
      recentLogs
    },
    null,
    2
  );
}

function summarizeRelationships(world: WorldState): Array<{
  from: string;
  to: string;
  closeness: number;
  familiarity: number;
}> {
  const pairs: Array<{ from: string; to: string; closeness: number; familiarity: number }> = [];
  for (const [from, targets] of Object.entries(world.relationships)) {
    for (const [to, relation] of Object.entries(targets)) {
      if (from === to) {
        continue;
      }
      pairs.push({
        from,
        to,
        closeness: relation.closeness,
        familiarity: relation.familiarity
      });
    }
  }
  return pairs.slice(0, 6);
}

function normalizeCard(card: CharacterCard | undefined, id: string, name: string): CharacterCard {
  return (
    card ?? {
      id,
      name,
      personalityTags: ["温和", "自然"],
      speakingStyle: "短句、轻松、自然",
      likes: [],
      dislikes: [],
      defaultTone: "calm",
      defaultAction: "idle"
    }
  );
}
