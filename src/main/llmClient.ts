import {
  buildCharacterSocialDialoguePrompt,
  buildDailySummaryPrompt,
  buildLargeChatSummaryPrompt,
  buildNpcSocialDialoguePrompt,
  buildSmallChatSummaryPrompt,
  buildSingleCharacterDialoguePrompt
} from "../shared/llm/prompts";
import { app, safeStorage } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  DailySummaryResult,
  DialogueContext,
  DialogueResult,
  IntentCharacter,
  IntentResult,
  LlmChatSummaryRequest,
  LlmChatSummaryResponse,
  LlmDailySummaryResponse,
  LlmConnectionTestResponse,
  LlmDialogueRequest,
  LlmDialogueResponse,
  LlmModelListResponse,
  LlmRuntimeConfigInput,
  LlmRuntimeConfigStatus,
  LlmSocialDialogueRequest,
  LlmSocialDialogueResponse,
  SocialDialogueContext,
  SocialDialogueResult
} from "../shared/llm/types";
import type { CharacterAction, CharacterMood, WorldState } from "../shared/types";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

const defaultBaseUrl = "https://api.moonshot.cn/v1";
const defaultModel = "kimi-k2";
const fallbackModelIds = ["kimi-k2", "kimi-k2.5", "kimi-latest"];
let runtimeConfig: Partial<LlmRuntimeConfigInput> = {};
let runtimeConfigLoaded = false;

type PersistedLlmConfig = {
  baseUrl?: string;
  model?: string;
  encryptedApiKey?: string;
  plainApiKey?: string;
};

function getConfig() {
  loadPersistedRuntimeConfig();
  const envApiKey =
    process.env.LLM_API_KEY ??
    process.env.TOKEN_PLAN_API_KEY ??
    process.env.MOONSHOT_API_KEY ??
    process.env.KIMI_API_KEY ??
    "";
  const apiKey = runtimeConfig.apiKey ?? envApiKey;
  const envBaseUrl =
    process.env.LLM_BASE_URL ??
    process.env.TOKEN_PLAN_BASE_URL ??
    process.env.MOONSHOT_BASE_URL ??
    process.env.KIMI_BASE_URL;
  return {
    apiKey,
    baseUrl: runtimeConfig.baseUrl ?? envBaseUrl ?? defaultBaseUrl,
    model:
      runtimeConfig.model ??
      process.env.LLM_MODEL ??
      process.env.TOKEN_PLAN_MODEL ??
      process.env.MOONSHOT_MODEL ??
      process.env.KIMI_MODEL ??
      defaultModel,
    mock:
      !apiKey ||
      process.env.LLM_MOCK === "1" ||
      process.env.LLM_MOCK === "true" ||
      process.env.TOKEN_PLAN_MOCK === "1" ||
      process.env.TOKEN_PLAN_MOCK === "true" ||
      process.env.MOONSHOT_MOCK === "1" ||
      process.env.MOONSHOT_MOCK === "true"
  };
}

export function setLlmRuntimeConfig(input: LlmRuntimeConfigInput): LlmRuntimeConfigStatus {
  loadPersistedRuntimeConfig();
  const normalizedInput = normalizeRuntimeConfigInput(input);
  const nextApiKey = normalizedInput.apiKey || runtimeConfig.apiKey;
  runtimeConfig = {
    baseUrl: normalizedInput.baseUrl || defaultBaseUrl,
    ...(nextApiKey ? { apiKey: nextApiKey } : {}),
    model:
      normalizedInput.model ||
      runtimeConfig.model ||
      process.env.LLM_MODEL ||
      process.env.TOKEN_PLAN_MODEL ||
      process.env.MOONSHOT_MODEL ||
      process.env.KIMI_MODEL ||
      defaultModel
  };
  savePersistedRuntimeConfig();
  return getLlmRuntimeConfigStatus();
}

export function getLlmRuntimeConfigStatus(): LlmRuntimeConfigStatus {
  loadPersistedRuntimeConfig();
  const envBaseUrl =
    process.env.LLM_BASE_URL ??
    process.env.TOKEN_PLAN_BASE_URL ??
    process.env.MOONSHOT_BASE_URL ??
    process.env.KIMI_BASE_URL;
  const envApiKey =
    process.env.LLM_API_KEY ??
    process.env.TOKEN_PLAN_API_KEY ??
    process.env.MOONSHOT_API_KEY ??
    process.env.KIMI_API_KEY ??
    "";
  const config = getConfig();
  return {
    baseUrl: config.baseUrl,
    model: config.model,
    hasApiKey: Boolean(runtimeConfig.apiKey ?? envApiKey),
    source: runtimeConfig.baseUrl || runtimeConfig.apiKey ? "runtime" : envBaseUrl || envApiKey ? "env" : "default"
  };
}

function loadPersistedRuntimeConfig(): void {
  if (runtimeConfigLoaded || !app.isReady()) {
    return;
  }

  runtimeConfigLoaded = true;
  const filePath = getPersistedConfigPath();
  if (!existsSync(filePath)) {
    return;
  }

  try {
    const persisted = JSON.parse(readFileSync(filePath, "utf8")) as PersistedLlmConfig;
    const apiKey = readPersistedApiKey(persisted);
    runtimeConfig = {
      ...runtimeConfig,
      ...(persisted.baseUrl ? { baseUrl: normalizeBaseUrl(persisted.baseUrl) } : {}),
      ...(persisted.model ? { model: persisted.model } : {}),
      ...(apiKey ? { apiKey } : {})
    };
  } catch (error) {
    console.warn("[ecosystem llm] failed to load persisted config", error);
  }
}

function savePersistedRuntimeConfig(): void {
  if (!app.isReady()) {
    return;
  }

  const persisted: PersistedLlmConfig = {
    baseUrl: runtimeConfig.baseUrl,
    model: runtimeConfig.model
  };

  if (runtimeConfig.apiKey) {
    if (safeStorage.isEncryptionAvailable()) {
      persisted.encryptedApiKey = safeStorage.encryptString(runtimeConfig.apiKey).toString("base64");
    } else {
      persisted.plainApiKey = runtimeConfig.apiKey;
    }
  }

  try {
    writeFileSync(getPersistedConfigPath(), JSON.stringify(persisted, null, 2), "utf8");
  } catch (error) {
    console.warn("[ecosystem llm] failed to save persisted config", error);
  }
}

function readPersistedApiKey(persisted: PersistedLlmConfig): string {
  if (persisted.encryptedApiKey && safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(persisted.encryptedApiKey, "base64"));
    } catch (error) {
      console.warn("[ecosystem llm] failed to decrypt persisted api key", error);
    }
  }
  return persisted.plainApiKey ?? "";
}

function getPersistedConfigPath(): string {
  return join(app.getPath("userData"), "llm-config.json");
}

export async function listLlmModels(input?: LlmRuntimeConfigInput): Promise<LlmModelListResponse> {
  if (input) {
    setLlmRuntimeConfig(input);
  }

  const config = getConfig();
  const fallbackModels = uniqueModels([config.model, defaultModel, ...fallbackModelIds]);
  if (!config.apiKey) {
    return {
      models: fallbackModels,
      selectedModel: config.model,
      source: "mock",
      error: "未填写 API Key，使用本地默认模型列表。"
    };
  }

  try {
    for (const url of buildModelEndpointCandidates(config.baseUrl)) {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${config.apiKey}`
        }
      });

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as unknown;
      const models = extractModelIds(payload);
      if (models.length > 0) {
        const nextModels = uniqueModels([config.model, ...models]);
        return {
          models: nextModels,
          selectedModel: nextModels.includes(config.model) ? config.model : nextModels[0],
          source: "api"
        };
      }
    }

    return {
      models: fallbackModels,
      selectedModel: config.model,
      source: "error",
      error: "这个网关没有返回标准模型列表，可手动填写模型名后保存。"
    };
  } catch {
    return {
      models: fallbackModels,
      selectedModel: config.model,
      source: "error",
      error: "模型列表拉取失败，已保留默认模型。"
    };
  }
}

export async function testLlmConnection(input?: LlmRuntimeConfigInput): Promise<LlmConnectionTestResponse> {
  if (input) {
    setLlmRuntimeConfig(input);
  }

  const config = getConfig();
  if (!config.apiKey) {
    return {
      ok: false,
      model: config.model,
      message: "未填写 API Key，当前会使用 mock 模式。"
    };
  }

  try {
    const response = await fetch(buildChatCompletionsEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: "只输出 JSON。" },
          { role: "user", content: '请回复 {"ok":true}' }
        ] satisfies ChatMessage[],
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 32
      })
    });

    if (!response.ok) {
      return {
        ok: false,
        model: config.model,
        status: response.status,
        message: `连接失败：HTTP ${response.status}。请检查 URL、Key 或模型名。`
      };
    }

    return {
      ok: true,
      model: config.model,
      status: response.status,
      message: "连接成功，当前模型可以用于角色台词。"
    };
  } catch {
    return {
      ok: false,
      model: config.model,
      message: "连接失败。请确认 URL 是 /v1 结尾，并检查网络或网关状态。"
    };
  }
}

export async function generateCharacterDialogue(request: LlmDialogueRequest): Promise<LlmDialogueResponse> {
  const prompt = buildSingleCharacterDialoguePrompt(request);
  const fallback = buildMockCharacterDialogue(request);
  return requestJson(prompt, fallback, normalizeDialogueResponse(request, fallback));
}

export async function generateSmallChatSummary(request: LlmChatSummaryRequest): Promise<LlmChatSummaryResponse> {
  const prompt = buildSmallChatSummaryPrompt(request);
  const fallback = buildMockSmallChatSummary(request);
  return requestJson(prompt, fallback, normalizeChatSummaryResponse(request, fallback));
}

export async function generateLargeChatSummary(request: LlmChatSummaryRequest): Promise<LlmChatSummaryResponse> {
  const prompt = buildLargeChatSummaryPrompt(request);
  const fallback = buildMockLargeChatSummary(request);
  return requestJson(prompt, fallback, normalizeChatSummaryResponse(request, fallback));
}

export async function generateCharacterSocialDialogue(request: LlmDialogueRequest): Promise<LlmDialogueResponse> {
  const prompt = buildCharacterSocialDialoguePrompt(request);
  const fallback = buildMockCharacterDialogue({
    ...request,
    target: "character"
  });
  return requestJson(prompt, fallback, normalizeDialogueResponse(request, fallback));
}

export async function generateNpcSocialDialogue(request: LlmSocialDialogueRequest): Promise<LlmSocialDialogueResponse> {
  const prompt = buildNpcSocialDialoguePrompt(request);
  const fallback = buildMockNpcSocialDialogue(request);
  return requestJson(prompt, fallback, normalizeNpcSocialDialogueResponse(request, fallback));
}

export async function generateDailySummary(world: WorldState): Promise<LlmDailySummaryResponse> {
  const prompt = buildDailySummaryPrompt(world);
  const fallback = buildMockDailySummary(world);
  return requestJson(prompt, fallback, normalizeDailySummaryResponse(world, fallback));
}

export async function generateDialogue(context: DialogueContext): Promise<DialogueResult> {
  const response = await generateCharacterDialogue({
    characterId: context.character.id,
    target: "owner",
    ownerInput: context.ownerAction,
    worldSummary: context.world ? JSON.stringify(context.world) : ""
  });

  return {
    speakerId: response.characterId,
    text: response.text,
    emotion: toLegacyMood(response.emotion),
    suggestedAction: response.actionSuggestion,
    memoryCandidate: response.memoryCandidate?.summary ?? response.reason
  };
}

export async function generateIntent(character: IntentCharacter, world: WorldState): Promise<IntentResult> {
  return buildMockIntent(character, world);
}

export async function generateSocialDialogue(context: SocialDialogueContext): Promise<SocialDialogueResult> {
  return buildMockSocialDialogue(context);
}

async function requestJson<T>(
  prompt: { system: string; user: string },
  fallback: T,
  normalize: (value: unknown) => T | null
): Promise<T> {
  const config = getConfig();
  if (config.mock) {
    return fallback;
  }

  try {
    const response = await fetch(buildChatCompletionsEndpoint(config.baseUrl), {
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
        ] satisfies ChatMessage[],
        response_format: { type: "json_object" },
        temperature: 0.45,
        max_tokens: 600
      })
    });

    if (!response.ok) {
      return fallback;
    }

    const payload = (await response.json()) as ChatResponse;
    const content = payload.choices?.[0]?.message?.content ?? "";
    const parsed = safeParseJson(content);
    return normalize(parsed) ?? fallback;
  } catch {
    return fallback;
  }
}

function safeParseJson(input: string): unknown | null {
  try {
    return JSON.parse(input);
  } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function extractModelIds(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    return [];
  }

  return payload.data
    .filter(isRecord)
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

function buildModelEndpointCandidates(baseUrl: string): string[] {
  const normalized = normalizeBaseUrl(baseUrl);
  const withoutChatCompletions = normalized.replace(/\/chat\/completions$/, "");
  const withoutModels = withoutChatCompletions.replace(/\/models$/, "");
  const candidates = [
    `${withoutModels}/models`,
    withoutModels.endsWith("/v1") ? `${withoutModels}/models` : `${withoutModels}/v1/models`
  ];
  return uniqueModels(candidates);
}

function normalizeRuntimeConfigInput(input: LlmRuntimeConfigInput): LlmRuntimeConfigInput {
  const parsed = splitCombinedUrlAndKey(input.baseUrl);
  return {
    baseUrl: normalizeBaseUrl(parsed.baseUrl),
    apiKey: input.apiKey.trim() || parsed.apiKey,
    model: input.model?.trim()
  };
}

function splitCombinedUrlAndKey(value: string): { baseUrl: string; apiKey: string } {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(",");
  if (commaIndex < 0) {
    return { baseUrl: trimmed, apiKey: "" };
  }

  return {
    baseUrl: trimmed.slice(0, commaIndex).trim(),
    apiKey: trimmed.slice(commaIndex + 1).trim()
  };
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/$/, "")
    .replace(/\/chat\/completions$/, "")
    .replace(/\/models$/, "");
}

function buildChatCompletionsEndpoint(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

function uniqueModels(models: string[]): string[] {
  return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function normalizeDialogueResponse(request: LlmDialogueRequest, fallback: LlmDialogueResponse) {
  return (value: unknown): LlmDialogueResponse | null => {
    if (!isRecord(value)) {
      return null;
    }

    const action = isDialogueAction(value.actionSuggestion) ? value.actionSuggestion : fallback.actionSuggestion;
    const emotion = isDialogueEmotion(value.emotion) ? value.emotion : fallback.emotion;
    const text = typeof value.text === "string" && value.text.trim() ? value.text.trim().slice(0, 60) : fallback.text;
    const memoryCandidate = isRecord(value.memoryCandidate)
      ? {
          importance: toNumber(value.memoryCandidate.importance, 1),
          summary:
            typeof value.memoryCandidate.summary === "string" && value.memoryCandidate.summary.trim()
              ? value.memoryCandidate.summary.trim()
              : fallback.memoryCandidate?.summary ?? "角色生成了一句温和短对话。"
        }
      : fallback.memoryCandidate;

    return {
      characterId: typeof value.characterId === "string" ? value.characterId : request.characterId,
      text,
      emotion,
      actionSuggestion: action,
      reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : fallback.reason,
      memoryCandidate
    };
  };
}

function normalizeDailySummaryResponse(world: WorldState, fallback: LlmDailySummaryResponse) {
  return (value: unknown): LlmDailySummaryResponse | null => {
    if (!isRecord(value)) {
      return null;
    }

    return {
      summary: typeof value.summary === "string" && value.summary.trim() ? value.summary.trim() : fallback.summary,
      ownerSummary:
        typeof value.ownerSummary === "string" && value.ownerSummary.trim()
          ? value.ownerSummary.trim()
          : fallback.ownerSummary,
      characterHighlights: Array.isArray(value.characterHighlights)
        ? value.characterHighlights
            .filter(isRecord)
            .map((item) => ({
              characterId: typeof item.characterId === "string" ? item.characterId : world.characters[0]?.id ?? "mika",
              summary: typeof item.summary === "string" ? item.summary : "今天保持了温和的日常节奏。"
            }))
            .slice(0, 4)
        : fallback.characterHighlights,
      memoryCandidate:
        typeof value.memoryCandidate === "string" && value.memoryCandidate.trim()
          ? value.memoryCandidate.trim()
          : fallback.memoryCandidate
    };
  };
}

function normalizeChatSummaryResponse(request: LlmChatSummaryRequest, fallback: LlmChatSummaryResponse) {
  return (value: unknown): LlmChatSummaryResponse | null => {
    if (!isRecord(value)) {
      return null;
    }

    return {
      characterId: typeof value.characterId === "string" ? value.characterId : request.characterId,
      summary: typeof value.summary === "string" && value.summary.trim() ? value.summary.trim().slice(0, 500) : fallback.summary
    };
  };
}

function normalizeNpcSocialDialogueResponse(
  request: LlmSocialDialogueRequest,
  fallback: LlmSocialDialogueResponse
) {
  return (value: unknown): LlmSocialDialogueResponse | null => {
    if (!isRecord(value)) {
      return null;
    }

    const text = typeof value.text === "string" && value.text.trim() ? value.text.trim().slice(0, 60) : fallback.text;
    const memoryCandidate = isRecord(value.memoryCandidate)
      ? {
          importance: toNumber(value.memoryCandidate.importance, 1),
          summary:
            typeof value.memoryCandidate.summary === "string" && value.memoryCandidate.summary.trim()
              ? value.memoryCandidate.summary.trim()
              : fallback.memoryCandidate?.summary ?? "两位角色进行了一次温和短交流。"
        }
      : fallback.memoryCandidate;

    return {
      socialEventId: typeof value.socialEventId === "string" ? value.socialEventId : request.socialEventId,
      speakerId: typeof value.speakerId === "string" ? value.speakerId : request.speakerId,
      targetId: typeof value.targetId === "string" ? value.targetId : request.targetId,
      text,
      emotion: isDialogueEmotion(value.emotion) ? value.emotion : fallback.emotion,
      actionSuggestion: isCharacterAction(value.actionSuggestion) ? value.actionSuggestion : fallback.actionSuggestion,
      reason: typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : fallback.reason,
      memoryCandidate
    };
  };
}

function buildMockCharacterDialogue(request: LlmDialogueRequest): LlmDialogueResponse {
  const fallbackByCharacter: Record<string, string> = {
    mika: "窗外的光很软，我陪你慢慢来。",
    nan: "我在靠窗这边，发现一点好天气。",
    sui: "慢一点也很好，我陪你歇会儿。",
    lin: "先做一点点，也算往前了。"
  };

  return {
    characterId: request.characterId,
    text: fallbackByCharacter[request.characterId] ?? "我先整理一下想法。",
    emotion: request.characterId === "nan" ? "happy" : request.characterId === "lin" ? "focused" : "calm",
    actionSuggestion: request.target === "character" ? "talk_to_character" : "observe_window",
    reason: "mock 模式或 LLM 不可用时返回安全短对话。",
    memoryCandidate: {
      importance: 1,
      summary: "角色用温和语气生成了一句短对话。"
    }
  };
}

function buildMockNpcSocialDialogue(request: LlmSocialDialogueRequest): LlmSocialDialogueResponse {
  const fallbackBySpeaker: Record<string, string> = {
    mika: "我刚才看到一点很安静的光。",
    nan: "你看，窗边那片颜色变亮了。",
    sui: "我们就在这儿慢慢待一会儿吧。",
    lin: "我整理到一半，忽然想听听你的想法。"
  };

  return {
    socialEventId: request.socialEventId,
    speakerId: request.speakerId,
    targetId: request.targetId,
    text: fallbackBySpeaker[request.speakerId] ?? "我刚好想到一件小事。",
    emotion: request.speakerId === "nan" ? "happy" : request.speakerId === "lin" ? "focused" : "calm",
    actionSuggestion: "talk_to_character",
    reason: request.socialSeed ?? "mock 模式下，两个角色靠近后进行温和短交流。",
    memoryCandidate: {
      importance: 2,
      summary: "两个角色靠近时进行了一句温和的日常短交流。"
    }
  };
}

function buildMockIntent(character: IntentCharacter, world: WorldState): IntentResult {
  const targetId = world.pendingSocialEvent?.involvedCharacterIds.find((id) => id !== character.id) ?? null;
  const action: CharacterAction = targetId ? "talk_to_character" : character.currentAction;
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

function buildMockSmallChatSummary(request: LlmChatSummaryRequest): LlmChatSummaryResponse {
  const recentTopic = request.memory.recentMessages
    .slice(-4)
    .map((message) => message.text)
    .join("；")
    .slice(0, 80);
  return {
    characterId: request.characterId,
    summary:
      recentTopic.length > 0
        ? `最近的私聊围绕「${recentTopic}」展开，角色保持温和、短句、低打扰的陪伴方式，下一次可自然延续当前话题。`
        : "最近暂无明确私聊主题，角色保持温和、短句、低打扰的陪伴方式。"
  };
}

function buildMockLargeChatSummary(request: LlmChatSummaryRequest): LlmChatSummaryResponse {
  const candidate = request.memory.memoryCandidates?.[0]?.summary;
  return {
    characterId: request.characterId,
    summary:
      request.memory.largeSummary ||
      `角色与主人形成了轻量、温和、低打扰的私聊关系。${candidate ? `可记住的长期线索是：${candidate}` : "长期记忆应优先保留互动偏好、角色语气和稳定陪伴方式，不保存完整原话或敏感细节。"}`
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isDialogueAction(value: unknown): value is LlmDialogueResponse["actionSuggestion"] {
  return (
    value === "idle" ||
    value === "chat" ||
    value === "greet_owner" ||
    value === "talk_to_character" ||
    value === "observe_window" ||
    value === "look_weather" ||
    value === "think" ||
    value === "rest" ||
    value === "play"
  );
}

function isCharacterAction(value: unknown): value is CharacterAction {
  return (
    value === "idle" ||
    value === "walk" ||
    value === "study" ||
    value === "rest" ||
    value === "chat" ||
    value === "drink" ||
    value === "snack" ||
    value === "observe_window" ||
    value === "look_weather" ||
    value === "wander" ||
    value === "greet_owner" ||
    value === "talk_to_character" ||
    value === "play" ||
    value === "nap" ||
    value === "think" ||
    value === "react_weather" ||
    value === "error"
  );
}

function isDialogueEmotion(value: unknown): value is LlmDialogueResponse["emotion"] {
  return (
    value === "calm" ||
    value === "happy" ||
    value === "curious" ||
    value === "focused" ||
    value === "sleepy" ||
    value === "excited" ||
    value === "cozy"
  );
}

function toLegacyMood(emotion: LlmDialogueResponse["emotion"]): CharacterMood {
  if (emotion === "happy" || emotion === "excited" || emotion === "curious") {
    return "bright";
  }
  if (emotion === "focused") {
    return "focused";
  }
  if (emotion === "sleepy" || emotion === "cozy") {
    return "cozy";
  }
  return "calm";
}
