import { useEffect, useRef } from "react";
import type { WorldEvent } from "../../shared/events";
import { canCallLlm } from "../../shared/llm/policy";
import type { LlmChatSummaryResponse, LlmDailySummaryResponse } from "../../shared/llm/types";
import type { CharacterChatMemory, WorldState } from "../../shared/types";

type UseMemorySchedulerInput = {
  world: WorldState;
  dispatch: (event: WorldEvent) => void;
  hasIpcBridge: boolean;
  hasApiKey: boolean;
};

type SummaryTask =
  | { kind: "small"; characterId: string; memory: CharacterChatMemory; fingerprint: string }
  | { kind: "large"; characterId: string; memory: CharacterChatMemory; fingerprint: string }
  | { kind: "daily"; fingerprint: string };

const schedulerIntervalMs = 60 * 1000;
const smallSummaryCooldownMs = 10 * 60 * 1000;
const largeSummaryCooldownMs = 30 * 60 * 1000;
const dailySummaryCooldownMs = 60 * 60 * 1000;

export function useMemoryScheduler({ world, dispatch, hasIpcBridge, hasApiKey }: UseMemorySchedulerInput): void {
  const worldRef = useRef(world);
  const dispatchRef = useRef(dispatch);
  const hasIpcBridgeRef = useRef(hasIpcBridge);
  const hasApiKeyRef = useRef(hasApiKey);
  const summaryInFlightRef = useRef(false);
  const lastSmallSummaryAtRef = useRef<Record<string, number>>({});
  const lastLargeSummaryAtRef = useRef<Record<string, number>>({});
  const smallSummaryFingerprintRef = useRef<Record<string, string>>({});
  const largeSummaryFingerprintRef = useRef<Record<string, string>>({});
  const dailySummaryFingerprintRef = useRef("");
  const lastDailyAttemptAtRef = useRef(0);
  const observedDateKeyRef = useRef(dateKey(Date.now()));

  useEffect(() => {
    worldRef.current = world;
  }, [world]);

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  useEffect(() => {
    hasIpcBridgeRef.current = hasIpcBridge;
  }, [hasIpcBridge]);

  useEffect(() => {
    hasApiKeyRef.current = hasApiKey;
  }, [hasApiKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void runNextSummaryTask();
    }, schedulerIntervalMs);

    void runNextSummaryTask();

    return () => window.clearInterval(timer);
  }, []);

  async function runNextSummaryTask(): Promise<void> {
    if (summaryInFlightRef.current) {
      return;
    }

    const currentWorld = worldRef.current;
    const now = Date.now();
    const task = pickSummaryTask(currentWorld, now);
    if (!task) {
      return;
    }

    summaryInFlightRef.current = true;
    try {
      if (task.kind === "small") {
        await runSmallSummary(task, currentWorld, now);
      } else if (task.kind === "large") {
        await runLargeSummary(task, currentWorld, now);
      } else {
        await runDailySummary(task, currentWorld, now);
      }
    } catch {
      dispatchRef.current({ type: "LLM_CALL_FAILED", error: "自动总结暂时不可用", at: Date.now() });
    } finally {
      summaryInFlightRef.current = false;
    }
  }

  function pickSummaryTask(currentWorld: WorldState, now: number): SummaryTask | null {
    const smallTask = pickSmallSummaryTask(currentWorld, now);
    if (smallTask) {
      return smallTask;
    }

    const largeTask = pickLargeSummaryTask(currentWorld, now);
    if (largeTask) {
      return largeTask;
    }

    return pickDailySummaryTask(currentWorld, now);
  }

  function pickSmallSummaryTask(currentWorld: WorldState, now: number): SummaryTask | null {
    for (const character of currentWorld.characters) {
      const memory = currentWorld.chatMemories[character.id];
      if (!memory) {
        continue;
      }

      const fingerprint = smallSummaryFingerprint(memory);
      if (smallSummaryFingerprintRef.current[character.id] === fingerprint) {
        continue;
      }

      const lastAttemptAt = lastSmallSummaryAtRef.current[character.id] ?? 0;
      if (now - lastAttemptAt < smallSummaryCooldownMs) {
        continue;
      }

      if (
        memory.recentMessages.length >= 8 ||
        (memory.recentMessages.length >= 4 && now - (memory.smallSummaryUpdatedAt ?? 0) >= smallSummaryCooldownMs) ||
        (memory.memoryCandidates?.length ?? 0) >= 6
      ) {
        return { kind: "small", characterId: character.id, memory, fingerprint };
      }
    }

    return null;
  }

  function pickLargeSummaryTask(currentWorld: WorldState, now: number): SummaryTask | null {
    for (const character of currentWorld.characters) {
      const memory = currentWorld.chatMemories[character.id];
      if (!memory) {
        continue;
      }

      const fingerprint = largeSummaryFingerprint(memory);
      if (largeSummaryFingerprintRef.current[character.id] === fingerprint) {
        continue;
      }

      const lastAttemptAt = lastLargeSummaryAtRef.current[character.id] ?? 0;
      if (now - lastAttemptAt < largeSummaryCooldownMs) {
        continue;
      }

      const hasNewSmallSummary =
        Boolean(memory.smallSummaryUpdatedAt) &&
        (!memory.largeSummaryUpdatedAt || (memory.smallSummaryUpdatedAt ?? 0) > memory.largeSummaryUpdatedAt);
      if (
        (memory.smallSummaryCount ?? 0) >= 3 ||
        (memory.memoryCandidates?.length ?? 0) >= 4 ||
        (hasNewSmallSummary && now - (memory.largeSummaryUpdatedAt ?? 0) >= largeSummaryCooldownMs)
      ) {
        return { kind: "large", characterId: character.id, memory, fingerprint };
      }
    }

    return null;
  }

  function pickDailySummaryTask(currentWorld: WorldState, now: number): SummaryTask | null {
    const currentDateKey = dateKey(now);
    const crossedDay = observedDateKeyRef.current !== currentDateKey;
    if (crossedDay) {
      observedDateKeyRef.current = currentDateKey;
    }

    const lastDailyAt = currentWorld.llmBudget.dailySummaryCreatedAt ?? 0;
    const alreadyCreatedToday = lastDailyAt > 0 && dateKey(lastDailyAt) === currentDateKey;
    const afterDailyWindow = minutesSinceMidnight(now) >= 23 * 60 + 30;
    const shouldCreate = (crossedDay && dateKey(lastDailyAt) !== observedDateKeyRef.current) || (afterDailyWindow && !alreadyCreatedToday);
    const fingerprint = dailySummaryFingerprint(currentWorld, currentDateKey);

    if (!shouldCreate || dailySummaryFingerprintRef.current === fingerprint || now - lastDailyAttemptAtRef.current < dailySummaryCooldownMs) {
      return null;
    }

    return { kind: "daily", fingerprint };
  }

  async function runSmallSummary(task: Extract<SummaryTask, { kind: "small" }>, currentWorld: WorldState, startedAt: number): Promise<void> {
    lastSmallSummaryAtRef.current[task.characterId] = startedAt;
    const policy = canCallLlm({
      uiMode: currentWorld.uiMode,
      ownerMode: currentWorld.ownerContext.mode,
      llmBudget: currentWorld.llmBudget,
      callKind: "small_summary",
      now: startedAt,
      hasApiKey: hasApiKeyRef.current
    });

    if (policy.allowed && !policy.useMock) {
      dispatchRef.current({ type: "LLM_CALL_STARTED", callKind: "small_summary", at: startedAt });
    }

    const response =
      policy.useMock || !policy.allowed || !hasIpcBridgeRef.current || !window.ecosystem?.llm
        ? buildLocalSmallSummary(task.characterId, task.memory)
        : await window.ecosystem.llm.generateSmallChatSummary({ characterId: task.characterId, memory: task.memory });
    const finishedAt = Date.now();
    dispatchRef.current({ type: "CHAT_SMALL_SUMMARY_CREATED", characterId: response.characterId, summary: response.summary, at: finishedAt });
    if (policy.allowed) {
      dispatchRef.current({ type: "LLM_CALL_SUCCEEDED", callKind: "small_summary", at: finishedAt });
    }
    smallSummaryFingerprintRef.current[task.characterId] = task.fingerprint;
  }

  async function runLargeSummary(task: Extract<SummaryTask, { kind: "large" }>, currentWorld: WorldState, startedAt: number): Promise<void> {
    lastLargeSummaryAtRef.current[task.characterId] = startedAt;
    const policy = canCallLlm({
      uiMode: currentWorld.uiMode,
      ownerMode: currentWorld.ownerContext.mode,
      llmBudget: currentWorld.llmBudget,
      callKind: "large_summary",
      now: startedAt,
      hasApiKey: hasApiKeyRef.current
    });

    if (policy.allowed && !policy.useMock) {
      dispatchRef.current({ type: "LLM_CALL_STARTED", callKind: "large_summary", at: startedAt });
    }

    const response =
      policy.useMock || !policy.allowed || !hasIpcBridgeRef.current || !window.ecosystem?.llm
        ? buildLocalLargeSummary(task.characterId, task.memory)
        : await window.ecosystem.llm.generateLargeChatSummary({ characterId: task.characterId, memory: task.memory });
    const finishedAt = Date.now();
    dispatchRef.current({ type: "CHAT_LARGE_SUMMARY_CREATED", characterId: response.characterId, summary: response.summary, at: finishedAt });
    if (policy.allowed) {
      dispatchRef.current({ type: "LLM_CALL_SUCCEEDED", callKind: "large_summary", at: finishedAt });
    }
    largeSummaryFingerprintRef.current[task.characterId] = task.fingerprint;
  }

  async function runDailySummary(task: Extract<SummaryTask, { kind: "daily" }>, currentWorld: WorldState, startedAt: number): Promise<void> {
    lastDailyAttemptAtRef.current = startedAt;
    const policy = canCallLlm({
      uiMode: currentWorld.uiMode,
      ownerMode: currentWorld.ownerContext.mode,
      llmBudget: currentWorld.llmBudget,
      callKind: "daily_summary",
      now: startedAt,
      hasApiKey: hasApiKeyRef.current
    });

    if (policy.allowed && !policy.useMock) {
      dispatchRef.current({ type: "LLM_CALL_STARTED", callKind: "daily_summary", at: startedAt });
    }

    const response =
      policy.useMock || !policy.allowed || !hasIpcBridgeRef.current || !window.ecosystem?.llm
        ? buildLocalDailySummary(currentWorld)
        : await window.ecosystem.llm.generateDailySummary(currentWorld);
    const finishedAt = Date.now();
    dispatchRef.current({ type: "DAY_SUMMARY_CREATED", summary: response.summary, at: finishedAt });
    if (policy.allowed) {
      dispatchRef.current({ type: "LLM_CALL_SUCCEEDED", callKind: "daily_summary", at: finishedAt });
    }
    dailySummaryFingerprintRef.current = task.fingerprint;
  }
}

function buildLocalSmallSummary(characterId: string, memory: CharacterChatMemory): LlmChatSummaryResponse {
  const recentText = memory.recentMessages
    .slice(-6)
    .map((message) => `${message.role === "owner" ? "主人" : "角色"}：${message.text}`)
    .join("；")
    .slice(0, 90);
  return {
    characterId,
    summary:
      recentText.length > 0
        ? `最近私聊围绕「${recentText}」展开。角色保持温和、短句、低打扰的回应方式，后续可自然延续当前主题。`
        : "最近私聊内容较少，角色保持温和、短句、低打扰的陪伴方式。"
  };
}

function buildLocalLargeSummary(characterId: string, memory: CharacterChatMemory): LlmChatSummaryResponse {
  const candidate = memory.memoryCandidates?.[0]?.summary;
  return {
    characterId,
    summary:
      memory.largeSummary ||
      `角色与主人形成了轻量、温和、低打扰的私聊关系。${candidate ? `可长期保留的线索是：${candidate}` : "长期记忆优先保留互动偏好、角色语气和稳定陪伴方式，不保存完整原话。"}`
  };
}

function buildLocalDailySummary(world: WorldState): LlmDailySummaryResponse {
  return {
    summary: `今天生态圈在${world.weather.city}的${world.weather.kind}天气里保持了温和节奏，主人当前处于${world.ownerContext.mode}模式，角色们继续各自的小日常。`,
    ownerSummary: `主人今天累计专注 ${world.ownerContext.todayFocusMinutes} 分钟，整体互动保持平稳。`,
    characterHighlights: world.characters.slice(0, 4).map((character) => ({
      characterId: character.id,
      summary: `${character.name} 主要处于 ${character.currentAction} 状态。`
    })),
    memoryCandidate: "今天生态圈留下了温和、连贯的生活摘要。"
  };
}

function smallSummaryFingerprint(memory: CharacterChatMemory): string {
  const lastMessage = memory.recentMessages[memory.recentMessages.length - 1];
  return [
    memory.recentMessages.length,
    lastMessage?.id ?? "none",
    memory.memoryCandidates?.length ?? 0,
    memory.smallSummaryUpdatedAt ?? 0
  ].join(":");
}

function largeSummaryFingerprint(memory: CharacterChatMemory): string {
  return [
    memory.smallSummaryUpdatedAt ?? 0,
    memory.smallSummaryCount ?? 0,
    memory.memoryCandidates?.length ?? 0,
    memory.largeSummaryUpdatedAt ?? 0
  ].join(":");
}

function dailySummaryFingerprint(world: WorldState, currentDateKey: string): string {
  return [
    currentDateKey,
    world.eventLog[0]?.id ?? "none",
    world.memories[0]?.id ?? "none",
    world.ownerContext.mode,
    world.weather.kind
  ].join(":");
}

function dateKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function minutesSinceMidnight(at: number): number {
  const date = new Date(at);
  return date.getHours() * 60 + date.getMinutes();
}
