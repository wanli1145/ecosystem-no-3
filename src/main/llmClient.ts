import { buildDailySummaryPrompt, buildDialoguePrompt, buildIntentPrompt } from "../shared/llm/prompts";
import { buildSocialDialoguePrompt } from "../shared/llm/prompts";
import type {
  DailySummaryResult,
  DialogueContext,
  DialogueResult,
  IntentCharacter,
  IntentResult,
  SocialDialogueContext,
  SocialDialogueResult
} from "../shared/llm/types";
import type { WorldState } from "../shared/types";

type MoonshotMessage = {
  role: "system" | "user";
  content: string;
};

type MoonshotChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const defaultBaseUrl = "https://token-plan-cn.xiaomimimo.com/v1";

function getConfig() {
  const apiKey =
    process.env.TOKEN_PLAN_API_KEY ??
    process.env.MOONSHOT_API_KEY ??
    process.env.KIMI_API_KEY ??
    "";
  return {
    apiKey,
    baseUrl: process.env.TOKEN_PLAN_BASE_URL ?? process.env.MOONSHOT_BASE_URL ?? defaultBaseUrl,
    model: process.env.TOKEN_PLAN_MODEL ?? process.env.MOONSHOT_MODEL ?? "kimi-k2.5",
    mock:
      !apiKey ||
      process.env.TOKEN_PLAN_MOCK === "1" ||
      process.env.TOKEN_PLAN_MOCK === "true" ||
      process.env.MOONSHOT_MOCK === "1" ||
      process.env.MOONSHOT_MOCK === "true"
  };
}

export async function generateDialogue(context: DialogueContext): Promise<DialogueResult> {
  const prompt = buildDialoguePrompt(context);
  const fallback = buildMockDialogue(context);
  return requestJson<DialogueResult>(prompt, fallback);
}

export async function generateIntent(character: IntentCharacter, world: WorldState): Promise<IntentResult> {
  const prompt = buildIntentPrompt(character, world);
  const fallback = buildMockIntent(character, world);
  return requestJson<IntentResult>(prompt, fallback);
}

export async function generateSocialDialogue(context: SocialDialogueContext): Promise<SocialDialogueResult> {
  const prompt = buildSocialDialoguePrompt(context);
  const fallback = buildMockSocialDialogue(context);
  return requestJson<SocialDialogueResult>(prompt, fallback);
}

export async function generateDailySummary(world: WorldState): Promise<DailySummaryResult> {
  const prompt = buildDailySummaryPrompt(world);
  const fallback = buildMockDailySummary(world);
  return requestJson<DailySummaryResult>(prompt, fallback);
}

async function requestJson<T>(prompt: { system: string; user: string }, fallback: T): Promise<T> {
  const config = getConfig();
  if (config.mock) {
    return fallback;
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user }
        ] satisfies MoonshotMessage[],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 500,
        thinking: { type: "disabled" }
      })
    });

    if (!response.ok) {
      throw new MoonshotClientError(`Moonshot API request failed with ${response.status}`, response.status);
    }

    const payload = (await response.json()) as MoonshotChatResponse;
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJson<T>(content);
    if (!parsed) {
      throw new MoonshotClientError("Moonshot response was not valid JSON");
    }
    return parsed;
  } catch (error) {
    if (isMoonshotClientError(error)) {
      throw error;
    }
    return fallback;
  }
}

function safeParseJson<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    const match = input.match(/\{[\s\S]*\}$/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

function buildMockDialogue(context: DialogueContext): DialogueResult {
  const character = context.character;
  return {
    speakerId: character.id,
    text: context.pendingSocialEventSeed ?? `${character.name}轻轻点点头，继续自己的节奏。`,
    emotion: character.mood,
    suggestedAction: character.currentAction,
    memoryCandidate: `${character.name} 在当前场景下保持了自然、温和的回应。`
  };
}

function buildMockIntent(character: IntentCharacter, world: WorldState): IntentResult {
  const targetId = world.pendingSocialEvent?.involvedCharacterIds.find((id) => id !== character.id) ?? null;
  const action = character.currentAction === "study" ? "study" : "idle";
  return {
    characterId: character.id,
    intent: targetId ? `和 ${targetId} 轻松交流一下` : "继续自己的小日常",
    targetId,
    action,
    reason: "基于当前世界状态和角色性格，选择一个自然、低打扰的行为。",
    memoryCandidate: `${character.name} 在当前时刻形成了一个轻量行动意图。`
  };
}

function buildMockDailySummary(world: WorldState): DailySummaryResult {
  return {
    summary: `今天的生态圈在 ${world.weather.city} 的${world.weather.kind}天气中保持了温和的日常节奏。`,
    ownerSummary: `主人当前处于${world.ownerContext.mode}模式，今天累计专注 ${world.ownerContext.todayFocusMinutes} 分钟。`,
    characterHighlights: world.characters.slice(0, 4).map((character) => ({
      characterId: character.id,
      summary: `${character.name} 今天主要在做 ${character.currentAction}。`
    })),
    memoryCandidate: "今天的生态圈留下了温和、连贯的生活摘要。"
  };
}

function buildMockSocialDialogue(context: SocialDialogueContext): SocialDialogueResult {
  return {
    speakerAId: context.primaryCharacter.id,
    speakerBId: context.secondaryCharacter.id,
    turns: [
      {
        speakerId: context.primaryCharacter.id,
        text: "我刚好想到一件小事。"
      },
      {
        speakerId: context.secondaryCharacter.id,
        text: "嗯，你慢慢说。"
      }
    ],
    sceneSummary: context.socialSeed,
    memoryCandidate: "两位角色进行了一段轻松、自然的短对话。"
  };
}

class MoonshotClientError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "MoonshotClientError";
    this.status = status;
  }
}

function isMoonshotClientError(error: unknown): error is MoonshotClientError {
  return error instanceof Error && error.name === "MoonshotClientError";
}
