import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CharacterAction, CharacterChatMemory, ChatMessage, OwnerMode, UIMode, WorldState } from "../shared/types";
import { dayPeriodLabels, ownerModeLabels, uiModeLabels, weatherLabels } from "../shared/types";
import type { WorldEvent } from "../shared/events";
import type { LlmDialogueResponse, LlmRuntimeConfigStatus, LlmSocialDialogueResponse } from "../shared/llm/types";
import { canCallLlm } from "../shared/llm/policy";
import { initialWorldState, reducer } from "../shared/reducer";
import { resolveDayPeriod } from "../shared/config/weather";
import { requestBrowserWeather, requestWeatherForCity } from "./weatherClient";
import { getWeatherWindowAssetUrl } from "./weatherAssets";
import { MvuVariablePanel } from "./components/MvuVariablePanel";
import { CharacterSprite } from "./components/CharacterSprite";
import { getCharacterVisualConfig } from "../shared/config/characters";
import { useLlmScheduler } from "./hooks/useLlmScheduler";
import { useMemoryScheduler } from "./hooks/useMemoryScheduler";
import { createPersistedWorldState, isCompatiblePersistedWorldState } from "../shared/persistence";

const ownerModes: OwnerMode[] = ["focus", "rest", "chat", "do_not_disturb"];
const weatherModes = ["sunny", "cloudy", "rainy"] as const;
const movementTickIntervalMs = 1200;
const clockTickIntervalMs = 60 * 1000;
const weatherSyncIntervalMs = 30 * 60 * 1000;
const lockedWeatherCityStorageKey = "ecosystem-03.lockedWeatherCity";
const dialogueBubbleImageUrl = new URL("../../assets/ecosystem-03/ui-decor-d/dialogue-bubble-420x180.png", import.meta.url).href;
const consoleButtonImageUrl = new URL("../../assets/ecosystem-03/ui-decor-d/console-button-240x96.png", import.meta.url).href;
const chatPanelImageUrl = new URL("../../assets/ecosystem-03/ui-decor-d/chat-panel-520x720.png", import.meta.url).href;
const statusIconUrls = {
  focus: new URL("../../assets/ecosystem-03/ui-decor-d/icons/status-focus-64.png", import.meta.url).href,
  rest: new URL("../../assets/ecosystem-03/ui-decor-d/icons/status-rest-64.png", import.meta.url).href,
  chat: new URL("../../assets/ecosystem-03/ui-decor-d/icons/status-chat-64.png", import.meta.url).href,
  do_not_disturb: new URL("../../assets/ecosystem-03/ui-decor-d/icons/status-do-not-disturb-64.png", import.meta.url).href,
  weather: new URL("../../assets/ecosystem-03/ui-decor-d/icons/status-weather-64.png", import.meta.url).href,
  memory: new URL("../../assets/ecosystem-03/ui-decor-d/icons/status-memory-64.png", import.meta.url).href,
  llmSpark: new URL("../../assets/ecosystem-03/ui-decor-d/icons/status-llm-spark-64.png", import.meta.url).href
} satisfies Record<OwnerMode | "weather" | "memory" | "llmSpark", string>;

function readStoredLockedWeatherCity(): string | null {
  try {
    const value = window.localStorage.getItem(lockedWeatherCityStorageKey)?.trim();
    return value || null;
  } catch {
    return null;
  }
}

function writeStoredLockedWeatherCity(city: string | null): void {
  try {
    if (city) {
      window.localStorage.setItem(lockedWeatherCityStorageKey, city);
      return;
    }
    window.localStorage.removeItem(lockedWeatherCityStorageKey);
  } catch {
    // Local storage is a convenience only; weather sync still works without it.
  }
}

export function App(): React.JSX.Element {
  const [world, dispatchBase] = useReducer(reducer, initialWorldState);
  const [lockedWeatherCity, setLockedWeatherCity] = useState<string | null>(() => readStoredLockedWeatherCity());
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [visibleBubbleCharacterId, setVisibleBubbleCharacterId] = useState<string | null>(null);
  const [chatCharacterId, setChatCharacterId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatStatus, setChatStatus] = useState<"idle" | "loading" | "summary" | "budget" | "error">("idle");
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isLlmConfigOpen, setIsLlmConfigOpen] = useState(false);
  const [isMvuPanelOpen, setIsMvuPanelOpen] = useState(false);
  const [isWorldStateOpen, setIsWorldStateOpen] = useState(false);
  const [isEventLogOpen, setIsEventLogOpen] = useState(false);
  const [isWeatherSyncing, setIsWeatherSyncing] = useState(false);
  const [manualWeatherCity, setManualWeatherCity] = useState(() => lockedWeatherCity ?? "南京");
  const [manualWeatherCityMessage, setManualWeatherCityMessage] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [llmStatus, setLlmStatus] = useState<"idle" | "loading" | "budget" | "error">("idle");
  const [llmConfigStatus, setLlmConfigStatus] = useState<LlmRuntimeConfigStatus | null>(null);
  const [llmBaseUrl, setLlmBaseUrl] = useState("https://api.moonshot.cn/v1");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("kimi-k2");
  const [llmModels, setLlmModels] = useState<string[]>(["kimi-k2"]);
  const [llmConfigSaved, setLlmConfigSaved] = useState(false);
  const [llmModelsStatus, setLlmModelsStatus] = useState<"idle" | "loading" | "ready" | "error" | "mock">("idle");
  const [llmModelsMessage, setLlmModelsMessage] = useState("");
  const [llmConnectionStatus, setLlmConnectionStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [llmConnectionMessage, setLlmConnectionMessage] = useState("");
  const autoWeatherSyncBlockedRef = useRef(false);
  const weatherSyncInFlightRef = useRef(false);
  const recentNearPairAtRef = useRef<Record<string, number>>({});
  const socialDialogueInFlightRef = useRef(false);
  const handledSocialEventIdsRef = useRef<Set<string>>(new Set());
  const autoBubbleTimerRef = useRef<number | null>(null);
  const persistenceLoadedRef = useRef(false);
  const latestPersistedSnapshotRef = useRef("");
  const lastSavedSnapshotRef = useRef("");
  const saveWorldStateTimerRef = useRef<number | null>(null);
  const saveWorldStateInFlightRef = useRef(false);
  const lastWorldStateSaveAtRef = useRef(0);
  const hasIpcBridge = Boolean(window.ecosystem?.llm);
  const isMini = world.uiMode === "mini";
  const weatherWindowUrl = world.weatherVisual.applyToRoom
    ? getWeatherWindowAssetUrl(world.weatherVisual.assetPath)
    : null;
  const currentDayPeriod = resolveDayPeriod(currentTime);

  const showTemporaryBubble = useCallback((characterId: string, durationMs: number): void => {
    if (autoBubbleTimerRef.current !== null) {
      window.clearTimeout(autoBubbleTimerRef.current);
    }

    setVisibleBubbleCharacterId(characterId);
    autoBubbleTimerRef.current = window.setTimeout(() => {
      setVisibleBubbleCharacterId((current) => (current === characterId ? null : current));
      autoBubbleTimerRef.current = null;
    }, durationMs);
  }, []);

  const performWeatherSync = useCallback(async (options?: { automatic?: boolean; city?: string | null }): Promise<void> => {
    if (options?.automatic && autoWeatherSyncBlockedRef.current) {
      return;
    }
    if (weatherSyncInFlightRef.current) {
      return;
    }

    weatherSyncInFlightRef.current = true;
    setIsWeatherSyncing(true);
    const startedAt = Date.now();
    dispatchBase({ type: "CLOCK_TICKED", now: startedAt });
    dispatchBase({ type: "WEATHER_SYNC_REQUESTED", at: startedAt });

    try {
      const city = options && "city" in options ? options.city : lockedWeatherCity;
      const result = city ? await requestWeatherForCity(city, startedAt) : await requestBrowserWeather(startedAt);
      const finishedAt = Date.now();
      if (result.ok) {
        autoWeatherSyncBlockedRef.current = false;
        if (city) {
          setLockedWeatherCity(result.weather.city);
          setManualWeatherCity(result.weather.city);
          setManualWeatherCityMessage(`已锁定 ${result.weather.city}`);
          writeStoredLockedWeatherCity(result.weather.city);
        }
        dispatchBase({
          type: "WEATHER_SYNC_SUCCEEDED",
          weather: result.weather,
          geolocation: result.geolocation,
          message: result.message,
          at: finishedAt
        });
        return;
      }

      if (result.denied) {
        autoWeatherSyncBlockedRef.current = true;
      }
      dispatchBase({
        type: "WEATHER_SYNC_FAILED",
        error: result.error,
        denied: result.denied,
        at: finishedAt
      });
    } finally {
      weatherSyncInFlightRef.current = false;
      setIsWeatherSyncing(false);
    }
  }, [lockedWeatherCity]);

  useEffect(() => {
    function tickClock(): void {
      const now = Date.now();
      setCurrentTime(now);
      dispatchBase({ type: "CLOCK_TICKED", now });
    }

    tickClock();
    dispatchBase({ type: "TICK", now: Date.now() });
    const movementTimer = window.setInterval(() => {
      dispatchBase({ type: "TICK", now: Date.now() });
    }, movementTickIntervalMs);

    const clockTimer = window.setInterval(() => {
      tickClock();
    }, clockTickIntervalMs);

    void performWeatherSync({ automatic: true });
    const weatherTimer = window.setInterval(() => {
      void performWeatherSync({ automatic: true });
    }, weatherSyncIntervalMs);

    return () => {
      window.clearInterval(movementTimer);
      window.clearInterval(clockTimer);
      window.clearInterval(weatherTimer);
    };
  }, [performWeatherSync]);

  useEffect(() => {
    if (!hasIpcBridge) {
      setLlmConfigStatus({
        baseUrl: llmBaseUrl,
        model: "kimi-k2",
        hasApiKey: false,
        source: "default"
      });
      setLlmConnectionStatus("error");
      setLlmConnectionMessage("当前不是 Electron IPC 页面。请关闭这个窗口，在终端运行 npm run start 或 npm run dev 后再测试连接。");
      return;
    }

    window.ecosystem.llm.getRuntimeConfigStatus().then((status) => {
      setLlmConfigStatus(status);
      setLlmBaseUrl(status.baseUrl);
      setLlmModel(status.model);
      setLlmModels((current) => (current.includes(status.model) ? current : [status.model, ...current]));
    }).catch(() => {
      setLlmConfigStatus(null);
    });
  }, [hasIpcBridge]);

  useEffect(() => {
    return () => {
      if (autoBubbleTimerRef.current !== null) {
        window.clearTimeout(autoBubbleTimerRef.current);
      }
      if (saveWorldStateTimerRef.current !== null) {
        window.clearTimeout(saveWorldStateTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreWorldState(): Promise<void> {
      if (!window.ecosystem?.persistence) {
        persistenceLoadedRef.current = true;
        return;
      }

      try {
        const snapshot = await window.ecosystem.persistence.loadWorldState();
        if (!cancelled && snapshot && isCompatiblePersistedWorldState(snapshot)) {
          lastSavedSnapshotRef.current = JSON.stringify({ ...snapshot, savedAt: 0 });
          dispatchBase({ type: "WORLD_STATE_RESTORED", snapshot, at: Date.now() });
        }
      } catch (error) {
        console.warn("Failed to restore world state", error);
      } finally {
        if (!cancelled) {
          persistenceLoadedRef.current = true;
        }
      }
    }

    void restoreWorldState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    latestPersistedSnapshotRef.current = JSON.stringify(createPersistedWorldState(world, 0));

    if (!persistenceLoadedRef.current || !window.ecosystem?.persistence) {
      return;
    }

    if (latestPersistedSnapshotRef.current === lastSavedSnapshotRef.current || saveWorldStateTimerRef.current !== null) {
      return;
    }

    const elapsedSinceLastSave = Date.now() - lastWorldStateSaveAtRef.current;
    const delayMs = Math.max(4000, 15000 - elapsedSinceLastSave);
    saveWorldStateTimerRef.current = window.setTimeout(() => {
      saveWorldStateTimerRef.current = null;
      void saveLatestWorldStateSnapshot();
    }, delayMs);
  }, [world]);

  useEffect(() => {
    function saveBeforeUnload(): void {
      if (latestPersistedSnapshotRef.current && latestPersistedSnapshotRef.current !== lastSavedSnapshotRef.current) {
        void saveLatestWorldStateSnapshot();
      }
    }

    window.addEventListener("beforeunload", saveBeforeUnload);
    return () => window.removeEventListener("beforeunload", saveBeforeUnload);
  }, []);

  async function saveLatestWorldStateSnapshot(): Promise<void> {
    if (saveWorldStateInFlightRef.current || !window.ecosystem?.persistence) {
      return;
    }

    const serializedSnapshot = latestPersistedSnapshotRef.current;
    if (!serializedSnapshot || serializedSnapshot === lastSavedSnapshotRef.current) {
      return;
    }

    saveWorldStateInFlightRef.current = true;
    try {
      const snapshot = JSON.parse(serializedSnapshot);
      snapshot.savedAt = Date.now();
      const result = await window.ecosystem.persistence.saveWorldState(snapshot);
      if (result.ok) {
        lastSavedSnapshotRef.current = serializedSnapshot;
        lastWorldStateSaveAtRef.current = Date.now();
      } else {
        console.warn("Failed to save world state", result.error);
      }
    } catch (error) {
      console.warn("Failed to save world state", error);
    } finally {
      saveWorldStateInFlightRef.current = false;
    }
  }

  useLlmScheduler({
    world,
    dispatch: dispatchBase,
    hasIpcBridge,
    hasApiKey: Boolean(llmConfigStatus?.hasApiKey),
    buildWorldSummary,
    onAutoBubble: showTemporaryBubble
  });

  useMemoryScheduler({
    world,
    dispatch: dispatchBase,
    hasIpcBridge,
    hasApiKey: Boolean(llmConfigStatus?.hasApiKey)
  });

  useEffect(() => {
    if (world.pendingSocialEvent || world.uiMode === "sleep" || world.ownerContext.mode === "do_not_disturb") {
      return;
    }

    const now = Date.now();
    const nearCooldownMs = 45 * 1000;
    for (let firstIndex = 0; firstIndex < world.characters.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < world.characters.length; secondIndex += 1) {
        const first = world.characters[firstIndex];
        const second = world.characters[secondIndex];
        const pairKey = createPairKey(first.id, second.id);
        const lastNearAt = recentNearPairAtRef.current[pairKey] ?? 0;
        if (now - lastNearAt < nearCooldownMs) {
          continue;
        }

        if (distanceBetweenPositions(first.position, second.position) <= 13) {
          recentNearPairAtRef.current[pairKey] = now;
          dispatchBase({ type: "CHARACTER_NEAR", a: first.id, b: second.id, at: now });
          return;
        }
      }
    }
  }, [world.characters, world.ownerContext.mode, world.pendingSocialEvent, world.uiMode]);

  useEffect(() => {
    const socialEvent = world.pendingSocialEvent;
    if (!socialEvent || socialDialogueInFlightRef.current || handledSocialEventIdsRef.current.has(socialEvent.id)) {
      return;
    }

    if (world.uiMode === "sleep") {
      return;
    }

    if (world.ownerContext.mode === "do_not_disturb") {
      handledSocialEventIdsRef.current.add(socialEvent.id);
      dispatchBase({
        type: "SOCIAL_DIALOGUE_FAILED",
        socialEventId: socialEvent.id,
        error: "低打扰模式下跳过 NPC 自动互聊",
        at: Date.now()
      });
      return;
    }

    const [speakerId, targetId] = socialEvent.involvedCharacterIds;
    if (!speakerId || !targetId) {
      dispatchBase({ type: "SOCIAL_DIALOGUE_FAILED", socialEventId: socialEvent.id, error: "缺少参与角色", at: Date.now() });
      return;
    }
    const currentSocialEvent = socialEvent;

    async function generateSocialDialogue(): Promise<void> {
      const startedAt = Date.now();
      const policy = canCallLlm({
        uiMode: world.uiMode,
        ownerMode: world.ownerContext.mode,
        llmBudget: world.llmBudget,
        callKind: "ambient_dialogue",
        now: startedAt,
        lastLlmCallAt: world.llmBudget.lastCallAt,
        hasApiKey: Boolean(llmConfigStatus?.hasApiKey)
      });

      if (!policy.allowed && !policy.useMock) {
        handledSocialEventIdsRef.current.add(currentSocialEvent.id);
        dispatchBase({
          type: "SOCIAL_DIALOGUE_FAILED",
          socialEventId: currentSocialEvent.id,
          error: policy.reason,
          at: startedAt
        });
        return;
      }

      socialDialogueInFlightRef.current = true;
      handledSocialEventIdsRef.current.add(currentSocialEvent.id);
      dispatchBase({
        type: "SOCIAL_DIALOGUE_REQUESTED",
        socialEventId: currentSocialEvent.id,
        speakerId,
        targetId,
        at: startedAt
      });
      if (policy.allowed && !policy.useMock) {
        dispatchBase({ type: "LLM_CALL_STARTED", callKind: "ambient_dialogue", at: startedAt });
      }

      try {
        const response =
          policy.useMock || !window.ecosystem?.llm
            ? buildLocalSocialDialogue(speakerId, targetId)
            : await window.ecosystem.llm.generateNpcSocialDialogue({
                socialEventId: currentSocialEvent.id,
                speakerId,
                targetId,
                worldSummary: buildWorldSummary(world, speakerId),
                socialSeed: currentSocialEvent.seedText
              });
        const finishedAt = Date.now();
        dispatchBase({
          type: "SOCIAL_DIALOGUE_GENERATED",
          socialEventId: currentSocialEvent.id,
          speakerId: response.speakerId,
          targetId: response.targetId,
          text: response.text || "我刚好想到一件小事。",
          actionSuggestion: toCharacterAction(response.actionSuggestion),
          memoryCandidate: response.memoryCandidate,
          at: finishedAt
        });
        if (policy.allowed) {
          dispatchBase({ type: "LLM_CALL_SUCCEEDED", callKind: "ambient_dialogue", at: finishedAt });
        }
        showTemporaryBubble(response.speakerId, 8000 + (finishedAt % 4000));
      } catch {
        const failedAt = Date.now();
        dispatchBase({ type: "LLM_CALL_FAILED", error: "角色互聊生成失败", at: failedAt });
        dispatchBase({
          type: "SOCIAL_DIALOGUE_FAILED",
          socialEventId: currentSocialEvent.id,
          error: "NPC 自动互聊生成失败",
          at: failedAt
        });
      } finally {
        socialDialogueInFlightRef.current = false;
      }
    }

    void generateSocialDialogue();
  }, [llmConfigStatus?.hasApiKey, showTemporaryBubble, world]);

  function dispatch(event: WorldEvent): void {
    dispatchBase(event);
  }

  function changeUIMode(mode: UIMode): void {
    dispatch({ type: "UI_MODE_CHANGED", mode, at: Date.now() });
    window.ecosystem?.setUIMode(mode).catch((error) => {
      console.error("Failed to resize window", error);
    });
  }

  function changeOwnerMode(mode: OwnerMode): void {
    dispatch({ type: "OWNER_MODE_CHANGED", mode, at: Date.now() });
  }

  async function syncWeatherAndTime(): Promise<void> {
    await performWeatherSync();
  }

  async function relocateAndSyncWeather(): Promise<void> {
    autoWeatherSyncBlockedRef.current = false;
    setLockedWeatherCity(null);
    writeStoredLockedWeatherCity(null);
    setManualWeatherCityMessage("已清除锁定城市，重新尝试定位。");
    await performWeatherSync({ city: null });
  }

  async function lockWeatherCity(): Promise<void> {
    const city = manualWeatherCity.trim();
    if (!city) {
      setManualWeatherCityMessage("请输入城市名。");
      return;
    }

    autoWeatherSyncBlockedRef.current = false;
    setManualWeatherCityMessage(`正在锁定 ${city}...`);
    await performWeatherSync({ city });
  }

  function clearLockedWeatherCity(): void {
    setLockedWeatherCity(null);
    writeStoredLockedWeatherCity(null);
    setManualWeatherCityMessage("已清除锁定城市。");
  }

  async function saveLlmConfig(): Promise<void> {
    const normalizedConfig = normalizeLlmConfigFields(llmBaseUrl, llmApiKey, llmModel);
    setLlmBaseUrl(normalizedConfig.baseUrl);
    setLlmApiKey(normalizedConfig.apiKey);
    setLlmModel(normalizedConfig.model);
    setLlmConnectionStatus("idle");
    setLlmConnectionMessage("配置已保存，请点击“测试连接”确认。");

    if (!hasIpcBridge) {
      setLlmConfigStatus({
        baseUrl: normalizedConfig.baseUrl,
        model: normalizedConfig.model,
        hasApiKey: Boolean(normalizedConfig.apiKey),
        source: normalizedConfig.apiKey || normalizedConfig.baseUrl ? "runtime" : "default"
      });
      setLlmConfigSaved(true);
      window.setTimeout(() => setLlmConfigSaved(false), 1800);
      return;
    }

    const status = await window.ecosystem.llm.setRuntimeConfig({
      baseUrl: normalizedConfig.baseUrl,
      apiKey: normalizedConfig.apiKey,
      model: normalizedConfig.model
    });
    setLlmConfigStatus(status);
    setLlmModel(status.model);
    setLlmModels((current) => (current.includes(status.model) ? current : [status.model, ...current]));
    setLlmConfigSaved(true);
    window.setTimeout(() => setLlmConfigSaved(false), 1800);
  }

  async function pullLlmModels(): Promise<void> {
    setLlmModelsStatus("loading");
    setLlmModelsMessage("");
    const normalizedConfig = normalizeLlmConfigFields(llmBaseUrl, llmApiKey, llmModel);
    setLlmBaseUrl(normalizedConfig.baseUrl);
    setLlmApiKey(normalizedConfig.apiKey);
    setLlmModel(normalizedConfig.model);

    if (!hasIpcBridge) {
      const fallbackModels = uniqueList([normalizedConfig.model, "kimi-k2", "kimi-k2.5", "kimi-latest"]);
      setLlmModels(fallbackModels);
      setLlmModel(fallbackModels[0]);
      setLlmModelsStatus("mock");
      setLlmModelsMessage("当前没有可用 IPC 桥接，已使用本地模型列表。");
      return;
    }

    try {
      const result = await window.ecosystem.llm.listModels({
        baseUrl: normalizedConfig.baseUrl,
        apiKey: normalizedConfig.apiKey,
        model: normalizedConfig.model
      });
      setLlmModels(result.models.length > 0 ? result.models : [result.selectedModel]);
      setLlmModel(result.selectedModel);
      setLlmConfigStatus((current) =>
        current
          ? {
              ...current,
              model: result.selectedModel,
              baseUrl: normalizedConfig.baseUrl,
              hasApiKey: Boolean(normalizedConfig.apiKey) || current.hasApiKey
            }
          : current
      );
      setLlmModelsStatus(result.source === "api" ? "ready" : result.source);
      setLlmModelsMessage(result.error ?? (result.source === "api" ? "模型列表已更新。" : "已使用本地模型列表。"));
    } catch {
      setLlmModelsStatus("error");
      setLlmModelsMessage("模型列表拉取失败；Mimo 可能不开放 /models，可手动填写模型名后保存。");
    }
  }

  async function testLlmConnection(): Promise<void> {
    setLlmConnectionStatus("loading");
    setLlmConnectionMessage("");
    const normalizedConfig = normalizeLlmConfigFields(llmBaseUrl, llmApiKey, llmModel);
    setLlmBaseUrl(normalizedConfig.baseUrl);
    setLlmApiKey(normalizedConfig.apiKey);
    setLlmModel(normalizedConfig.model);

    if (!hasIpcBridge) {
      setLlmConnectionStatus("error");
      setLlmConnectionMessage("当前不是 Electron IPC 页面。请关闭这个窗口，在终端运行 npm run start 或 npm run dev 后再测试连接。");
      return;
    }

    try {
      const result = await window.ecosystem.llm.testConnection(normalizedConfig);
      setLlmConnectionStatus(result.ok ? "ready" : "error");
      setLlmConnectionMessage(result.message);
      if (result.model) {
        setLlmModels((current) => (current.includes(result.model) ? current : [result.model, ...current]));
        setLlmModel(result.model);
      }
    } catch {
      setLlmConnectionStatus("error");
      setLlmConnectionMessage("连接测试失败，请重启应用后再试。");
    }
  }

  async function testCharacterLlmDialogue(): Promise<void> {
    if (llmStatus === "loading") {
      return;
    }

    const at = Date.now();
    const refreshedBudget = refreshLlmBudget(world, at);
    const characterId = selectedCharacterId ?? world.characters[0]?.id ?? "mika";
    const localDialogue = buildLocalLlmDialogue(characterId, undefined, at);

    if (refreshedBudget.callsUsedThisHour >= refreshedBudget.maxCallsPerHour) {
      setLlmStatus("budget");
      dispatch({
        type: "CHARACTER_LLM_DIALOGUE_RECEIVED",
        characterId: localDialogue.characterId,
        text: localDialogue.text,
        actionSuggestion: toCharacterAction(localDialogue.actionSuggestion),
        memoryCandidate: {
          importance: 1,
          summary: "预算不足时，角色使用了温和的本地 fallback。"
        },
        at
      });
      return;
    }

    setLlmStatus("loading");
    dispatch({ type: "LLM_CALL_STARTED", at });

    try {
      const response = window.ecosystem?.llm
          ? await window.ecosystem.llm.generateCharacterDialogue({
              characterId,
              target: "owner",
              worldSummary: buildWorldSummary(world, characterId)
            })
          : localDialogue;
      const finishedAt = Date.now();
      dispatch({
        type: "CHARACTER_LLM_DIALOGUE_RECEIVED",
        characterId: response.characterId,
        text: response.text || "我先整理一下想法。",
        actionSuggestion: toCharacterAction(response.actionSuggestion),
        memoryCandidate: response.memoryCandidate,
        at: finishedAt
      });
      dispatch({ type: "LLM_CALL_SUCCEEDED", callKind: "ambient_dialogue", at: finishedAt });
      setSelectedCharacterId(response.characterId);
      setLlmStatus("idle");
    } catch {
      const failedAt = Date.now();
      const fallback = buildLocalLlmDialogue(characterId, undefined, failedAt);
      dispatch({ type: "LLM_CALL_FAILED", error: "生成失败，已使用本地短句", at: failedAt });
      dispatch({
        type: "CHARACTER_LLM_DIALOGUE_RECEIVED",
        characterId: fallback.characterId,
        text: fallback.text,
        actionSuggestion: toCharacterAction(fallback.actionSuggestion),
        memoryCandidate: {
          importance: 1,
          summary: "renderer 调用失败时，角色使用了温和的本地 fallback。"
        },
        at: failedAt
      });
      setSelectedCharacterId(characterId);
      setLlmStatus("error");
    }
  }

  async function sendChatMessage(): Promise<void> {
    const text = chatInput.trim();
    const characterId = chatCharacterId ?? selectedCharacterId;
    if (!text || !characterId || chatStatus === "loading" || chatStatus === "summary") {
      return;
    }

    const at = Date.now();
    const policy = canCallLlm({
      uiMode: world.uiMode,
      ownerMode: world.ownerContext.mode,
      llmBudget: world.llmBudget,
      callKind: "manual_chat",
      now: at,
      lastLlmCallAt: world.llmBudget.lastCallAt,
      hasApiKey: Boolean(llmConfigStatus?.hasApiKey)
    });
    const ownerMessage: ChatMessage = {
      id: `owner-chat-${characterId}-${at}`,
      characterId,
      role: "owner",
      text,
      at
    };
    const memoryForPrompt = appendLocalChatMessage(getChatMemory(world, characterId), ownerMessage);

    dispatch({ type: "OWNER_CHAT_MESSAGE_SENT", characterId, text, at });
    setChatInput("");
    setSelectedCharacterId(characterId);
    setChatCharacterId(characterId);

    if (!policy.allowed && !policy.useMock) {
      setChatStatus("budget");
      return;
    }

    setChatStatus(policy.allowed ? "loading" : "budget");
    if (policy.allowed && !policy.useMock) {
      dispatch({ type: "LLM_CALL_STARTED", callKind: "manual_chat", at });
    }

    try {
      const response =
        policy.useMock || !window.ecosystem?.llm
          ? buildLocalLlmDialogue(characterId, text, at)
          : await window.ecosystem.llm.generateCharacterDialogue({
              characterId,
              target: "owner",
              ownerInput: text,
              worldSummary: buildWorldSummary(world, characterId),
              chatMemory: memoryForPrompt
            });
      const finishedAt = Date.now();
      dispatch({
        type: "CHARACTER_CHAT_MESSAGE_RECEIVED",
        characterId: response.characterId,
        text: response.text || "我在这里，慢慢说就好。",
        actionSuggestion: toCharacterAction(response.actionSuggestion),
        memoryCandidate: response.memoryCandidate,
        at: finishedAt
      });
      if (policy.allowed) {
        dispatch({ type: "LLM_CALL_SUCCEEDED", callKind: "manual_chat", at: finishedAt });
      }

      const nextMemory = appendLocalChatMessage(memoryForPrompt, {
        id: `character-chat-${response.characterId}-${finishedAt}`,
        characterId: response.characterId,
        role: "character",
        text: response.text || "我在这里，慢慢说就好。",
        at: finishedAt
      });
      if (shouldCreateSmallSummary(nextMemory, finishedAt)) {
        await createSmallSummary(response.characterId, nextMemory);
      }
      setChatStatus("idle");
    } catch {
      const failedAt = Date.now();
      const fallback = buildLocalLlmDialogue(characterId, text, failedAt);
      dispatch({ type: "LLM_CALL_FAILED", error: "私聊生成失败，已使用本地回复", at: failedAt });
      dispatch({
        type: "CHARACTER_CHAT_MESSAGE_RECEIVED",
        characterId: fallback.characterId,
        text: fallback.text,
        actionSuggestion: toCharacterAction(fallback.actionSuggestion),
        memoryCandidate: fallback.memoryCandidate,
        at: failedAt
      });
      setChatStatus("error");
    }
  }

  async function createSmallSummary(characterId: string, memory = getChatMemory(world, characterId)): Promise<void> {
    const at = Date.now();
    const policy = canCallLlm({
      uiMode: world.uiMode,
      ownerMode: world.ownerContext.mode,
      llmBudget: world.llmBudget,
      callKind: "small_summary",
      now: at,
      hasApiKey: Boolean(llmConfigStatus?.hasApiKey)
    });
    setChatStatus("summary");
    const response =
      policy.useMock || !policy.allowed || !window.ecosystem?.llm
        ? buildLocalSmallSummary(characterId, memory)
        : await window.ecosystem.llm.generateSmallChatSummary({ characterId, memory });
    const finishedAt = Date.now();
    dispatch({ type: "CHAT_SMALL_SUMMARY_CREATED", characterId: response.characterId, summary: response.summary, at: finishedAt });
    if (policy.allowed) {
      dispatch({ type: "LLM_CALL_SUCCEEDED", callKind: "small_summary", at: finishedAt });
    }
    if ((memory.smallSummaryCount ?? 0) + 1 >= 3) {
      await createLargeSummary(response.characterId, {
        ...memory,
        smallSummary: response.summary,
        smallSummaryCount: (memory.smallSummaryCount ?? 0) + 1,
        recentMessages: memory.recentMessages.slice(-2)
      });
    }
    setChatStatus("idle");
  }

  async function createLargeSummary(characterId: string, memory = getChatMemory(world, characterId)): Promise<void> {
    const at = Date.now();
    const policy = canCallLlm({
      uiMode: world.uiMode,
      ownerMode: world.ownerContext.mode,
      llmBudget: world.llmBudget,
      callKind: "large_summary",
      now: at,
      hasApiKey: Boolean(llmConfigStatus?.hasApiKey)
    });
    const response =
      policy.useMock || !policy.allowed || !window.ecosystem?.llm
        ? buildLocalLargeSummary(characterId, memory)
        : await window.ecosystem.llm.generateLargeChatSummary({ characterId, memory });
    const finishedAt = Date.now();
    dispatch({ type: "CHAT_LARGE_SUMMARY_CREATED", characterId: response.characterId, summary: response.summary, at: finishedAt });
    if (policy.allowed) {
      dispatch({ type: "LLM_CALL_SUCCEEDED", callKind: "large_summary", at: finishedAt });
    }
  }

  function previewWeather(kind: (typeof weatherModes)[number]): void {
    const at = Date.now();
    dispatch({
      type: "WEATHER_CHANGED",
      weather: {
        ...world.weather,
        kind,
        updatedAt: at
      },
      at
    });
  }

  const chatCharacter = chatCharacterId ? world.characters.find((character) => character.id === chatCharacterId) : null;
  const chatMemory = chatCharacter ? getChatMemory(world, chatCharacter.id) : null;
  const chatMessages = chatMemory?.recentMessages.slice(-6) ?? [];
  const dailySummaryCreatedToday = world.llmBudget.dailySummaryCreatedAt
    ? new Date(world.llmBudget.dailySummaryCreatedAt).toDateString() === new Date(currentTime).toDateString()
    : false;
  const llmStatusSummary =
    llmConnectionStatus === "error"
      ? hasIpcBridge
        ? "连接未就绪"
        : "当前未连接 Electron IPC"
      : connectionStatusLabel(llmConnectionStatus);
  const llmModelSummary = llmConnectionStatus === "error" && !hasIpcBridge ? "在 Electron 窗口中测试即可" : `当前模型：${llmModel}`;

  return (
    <main
      className={`app-shell ${isMini ? "is-mini" : "is-full"}`}
      style={{
        ["--dialogue-bubble-image" as string]: `url(${dialogueBubbleImageUrl})`,
        ["--console-button-image" as string]: `url(${consoleButtonImageUrl})`,
        ["--chat-panel-image" as string]: `url(${chatPanelImageUrl})`
      }}
    >
      <button
        aria-label="控制台"
        aria-expanded={isConsoleOpen}
        className="console-toggle"
        onClick={() => setIsConsoleOpen((current) => !current)}
      >
        <span>控制台</span>
      </button>

      <section className="content-grid" aria-label="生态舱主视图">
        <section className="room-panel" aria-label="生态舱区域">
          <div
            className="room-stage"
            onClick={() => {
              setSelectedCharacterId(null);
              setVisibleBubbleCharacterId(null);
            }}
            style={{
              ["--weather-window-image" as string]: weatherWindowUrl ? `url(${weatherWindowUrl})` : undefined
            }}
          >
            {weatherWindowUrl && <div className="weather-window" aria-hidden="true" />}
            {world.characters.map((character) => {
              const visualConfig = getCharacterVisualConfig(character.id);
              const shouldShowBubble = selectedCharacterId === character.id || visibleBubbleCharacterId === character.id;

              return (
                <article
                  aria-label={`查看 ${visualConfig?.name ?? character.name} 的对话`}
                  className={`character ${selectedCharacterId === character.id ? "is-selected" : ""}`}
                  key={character.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setVisibleBubbleCharacterId(null);
                    setSelectedCharacterId((current) => (current === character.id ? null : character.id));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedCharacterId((current) => (current === character.id ? null : character.id));
                    }
                  }}
                  role="button"
                  style={{
                    left: `${character.position.x}%`,
                    top: `${character.position.y}%`,
                    ["--character-color" as string]: character.color
                  }}
                  tabIndex={0}
                >
                  <CharacterSprite character={character} isMini={isMini} />
                  {shouldShowBubble && (
                    <div className="dialogue-bubble" aria-live="polite">
                      <strong>{visualConfig?.name ?? character.name}</strong>
                      <p>{character.lastDialogue}</p>
                      <button
                        className="bubble-chat-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setChatCharacterId(character.id);
                        }}
                        type="button"
                      >
                        和 TA 说话
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {chatCharacter && chatMemory && (
          <section className="chat-panel" aria-label={`${chatCharacter.name} 私聊`}>
            <div className="chat-panel-head">
              <div>
                <span>私聊</span>
                <h2>{chatCharacter.name}</h2>
              </div>
              <button className="console-close" onClick={() => setChatCharacterId(null)} aria-label="关闭私聊">
                ×
              </button>
            </div>
            <div className="chat-messages" aria-live="polite">
              {chatMessages.length === 0 ? (
                <p className="chat-empty">还没有私聊记录。</p>
              ) : (
                chatMessages.map((message) => (
                  <div className={`chat-message is-${message.role}`} key={message.id}>
                    <span>{message.role === "owner" ? "主人" : chatCharacter.name}</span>
                    <p>{message.text}</p>
                  </div>
                ))
              )}
            </div>
            <form
              className="chat-form"
              onSubmit={(event) => {
                event.preventDefault();
                void sendChatMessage();
              }}
            >
              <input
                aria-label={`和 ${chatCharacter.name} 说话`}
                disabled={chatStatus === "loading" || chatStatus === "summary"}
                maxLength={160}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={world.ownerContext.mode === "do_not_disturb" ? "低打扰模式，TA 会轻声回应" : "说点什么..."}
                value={chatInput}
              />
              <button
                className="mode-toggle"
                disabled={!chatInput.trim() || chatStatus === "loading" || chatStatus === "summary"}
                type="submit"
              >
                {chatStatus === "loading" ? "发送中" : chatStatus === "summary" ? "整理中" : "发送"}
              </button>
            </form>
            {chatStatus === "budget" && <p className="console-hint">本次使用本地 mock 回复。</p>}
            {chatStatus === "error" && <p className="console-hint">私聊暂时不可用，已使用本地回复。</p>}
          </section>
        )}

        {isConsoleOpen && (
          <aside className="side-panel" aria-label="生态舱控制台">
            <div className="console-head">
              <div>
                <h1>生态圈三号</h1>
                <div className="console-status-chips" aria-label="控制台状态">
                  <span>{uiModeLabels[world.uiMode]}</span>
                  <span>{ownerModeLabels[world.ownerContext.mode]}</span>
                  <span>{world.weather.city}</span>
                </div>
              </div>
              <button className="console-close" onClick={() => setIsConsoleOpen(false)} aria-label="关闭控制台">
                ×
              </button>
            </div>

            <section className="console-section">
              <h2>常用控制</h2>
              <div className="console-workbench-actions">
                <button className="mode-toggle console-primary-action" onClick={() => changeUIMode(isMini ? "full" : "mini")} type="button">
                  {isMini ? "展开生态舱" : "缩小观察窗"}
                </button>
                <div className="console-tool-row">
                  <button className="console-tool-button" disabled={isWeatherSyncing} onClick={() => void syncWeatherAndTime()} type="button">
                    {isWeatherSyncing ? "同步中" : "同步天气"}
                  </button>
                  <button className="console-tool-button" disabled={isWeatherSyncing} onClick={() => void relocateAndSyncWeather()} type="button">
                    {isWeatherSyncing ? "定位中" : "重新定位"}
                  </button>
                </div>
              </div>
              <div className="console-quick-row">
                <button
                  className="console-soft-button"
                  disabled={!selectedCharacterId}
                  onClick={() => {
                    if (selectedCharacterId) {
                      setChatCharacterId(selectedCharacterId);
                    }
                  }}
                  type="button"
                >
                  和 TA 说话
                </button>
                <button
                  className="console-soft-button"
                  disabled={!hasIpcBridge || llmStatus === "loading"}
                  onClick={() => void testCharacterLlmDialogue()}
                  type="button"
                >
                  {llmStatus === "loading" ? "生成中..." : "测试角色 LLM 台词"}
                </button>
              </div>
              {llmStatus === "budget" && <p className="console-hint">本小时 LLM 预算已用完，已使用本地短句。</p>}
              {llmStatus === "error" && <p className="console-hint">生成暂时不可用，已使用本地短句。</p>}
            </section>

            <section className="console-section">
              <h2 className="section-title-with-icon">
                <img alt="" aria-hidden="true" src={statusIconUrls[world.ownerContext.mode]} />
                <span>主人模式</span>
              </h2>
              <div className="owner-mode-grid is-segmented">
                {ownerModes.map((mode) => (
                  <button
                    className={world.ownerContext.mode === mode ? "active" : ""}
                    key={mode}
                    onClick={() => changeOwnerMode(mode)}
                    type="button"
                  >
                    <img alt="" aria-hidden="true" src={statusIconUrls[mode]} />
                    {ownerModeLabels[mode]}
                  </button>
                ))}
              </div>
            </section>

            <section className="console-section">
              <h2 className="section-title-with-icon">
                <img alt="" aria-hidden="true" src={statusIconUrls.weather} />
                <span>天气预览</span>
              </h2>
              <div className="weather-preview-grid">
                {weatherModes.map((mode) => (
                  <button
                    className={world.weatherVisual.weather === mode ? "active" : ""}
                    key={mode}
                    onClick={() => previewWeather(mode)}
                    type="button"
                  >
                    {weatherLabels[mode]}
                  </button>
                ))}
              </div>
              <form
                className="weather-city-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void lockWeatherCity();
                }}
              >
                <input
                  aria-label="锁定天气城市"
                  disabled={isWeatherSyncing}
                  maxLength={32}
                  onChange={(event) => setManualWeatherCity(event.target.value)}
                  placeholder="输入城市，例如南京"
                  value={manualWeatherCity}
                />
                <button className="mode-toggle" disabled={isWeatherSyncing || !manualWeatherCity.trim()} type="submit">
                  锁定
                </button>
                <button className="mode-toggle" disabled={isWeatherSyncing || !lockedWeatherCity} type="button" onClick={clearLockedWeatherCity}>
                  清除
                </button>
              </form>
              <p className="console-hint">
                当前：{world.weather.city}
                {lockedWeatherCity ? ` / 已锁定 ${lockedWeatherCity}` : manualWeatherCityMessage ? ` / ${manualWeatherCityMessage}` : ""}
              </p>
            </section>

            <section className="console-section">
              <h2 className="section-title-with-icon">
                <img alt="" aria-hidden="true" src={statusIconUrls.llmSpark} />
                <span>LLM 接入</span>
              </h2>
              <div className="llm-summary-row">
                <div className={`llm-connection-card is-${llmConnectionStatus}`}>
                  <strong>{llmStatusSummary}</strong>
                  <span>{llmModelSummary}</span>
                </div>
                <button className="console-disclosure-button" onClick={() => setIsLlmConfigOpen((current) => !current)} type="button">
                  {isLlmConfigOpen ? "收起配置" : "展开配置"}
                </button>
              </div>
              {isLlmConfigOpen && (
                <div className="llm-config-form">
                  <label>
                    <span>API URL</span>
                    <input
                      autoComplete="off"
                      onChange={(event) => setLlmBaseUrl(event.target.value)}
                      placeholder="https://api.moonshot.cn/v1"
                      spellCheck={false}
                      type="url"
                      value={llmBaseUrl}
                    />
                  </label>
                  <label>
                    <span>API Key</span>
                    <input
                      autoComplete="off"
                      onChange={(event) => setLlmApiKey(event.target.value)}
                      placeholder={llmConfigStatus?.hasApiKey ? "已配置，可重新填写覆盖" : "未填写时使用 mock 模式"}
                      spellCheck={false}
                      type="password"
                      value={llmApiKey}
                    />
                  </label>
                  <label>
                    <span>模型</span>
                    <select
                      onChange={(event) => setLlmModel(event.target.value)}
                      value={llmModel}
                    >
                      {llmModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>手动模型名</span>
                    <input
                      autoComplete="off"
                      onChange={(event) => {
                        const nextModel = event.target.value;
                        setLlmModel(nextModel);
                        const normalizedModel = nextModel.trim();
                        if (normalizedModel) {
                          setLlmModels((current) => (current.includes(normalizedModel) ? current : [normalizedModel, ...current]));
                        }
                      }}
                      placeholder="例如 kimi-k2.5"
                      spellCheck={false}
                      type="text"
                      value={llmModel}
                    />
                  </label>
                  <div className="llm-config-actions">
                    <button
                      className="mode-toggle"
                      disabled={!hasIpcBridge || llmModelsStatus === "loading"}
                      onClick={() => void pullLlmModels()}
                      type="button"
                    >
                      {llmModelsStatus === "loading" ? "拉取中..." : "拉取模型"}
                    </button>
                    <button className="mode-toggle" onClick={() => void saveLlmConfig()} type="button">
                      保存配置
                    </button>
                    <button
                      className="mode-toggle"
                      disabled={!hasIpcBridge || llmConnectionStatus === "loading"}
                      onClick={() => void testLlmConnection()}
                      type="button"
                    >
                      {llmConnectionStatus === "loading" ? "测试中..." : "测试连接"}
                    </button>
                  </div>
                  <p className="console-hint">
                    {llmConfigSaved
                      ? "已保存到本机，下次打开会自动恢复。"
                      : `状态：${llmConfigStatus?.hasApiKey ? "已配置 key" : "mock 模式"} / ${llmConfigStatus?.source ?? "default"} / ${llmModel}`}
                  </p>
                  {llmModelsMessage && <p className="console-hint">{llmModelsMessage}</p>}
                  {llmConnectionMessage && <p className="console-hint">{llmConnectionMessage}</p>}
                </div>
              )}
            </section>

            <section className="console-section">
              <h2 className="section-title-with-icon">
                <img alt="" aria-hidden="true" src={statusIconUrls.memory} />
                <span>记忆 / 总结</span>
              </h2>
              <div className="memory-summary-grid">
                <div className="console-stat">
                  <span>LLM 调用</span>
                  <strong>{world.llmBudget.callsUsedThisHour}/{world.llmBudget.maxCallsPerHour}</strong>
                </div>
                <div className="console-stat">
                  <span>今日日报</span>
                  <strong>{dailySummaryCreatedToday ? "已生成" : "未生成"}</strong>
                </div>
                <button
                  className="console-soft-button"
                  disabled={!selectedCharacterId || chatStatus === "summary"}
                  onClick={() => selectedCharacterId && void createSmallSummary(selectedCharacterId)}
                  type="button"
                >
                  小总结
                </button>
                <button
                  className="console-soft-button"
                  disabled={!selectedCharacterId || chatStatus === "summary"}
                  onClick={() => selectedCharacterId && void createLargeSummary(selectedCharacterId)}
                  type="button"
                >
                  大总结
                </button>
              </div>
            </section>

            <section className="console-section console-debug-section">
              <h2>调试信息</h2>
              <div className="debug-toggle-grid">
                <button className="console-disclosure-button" onClick={() => setIsMvuPanelOpen((current) => !current)} type="button">
                  {isMvuPanelOpen ? "收起 MVU" : "展开 MVU"}
                </button>
                <button className="console-disclosure-button" onClick={() => setIsWorldStateOpen((current) => !current)} type="button">
                  {isWorldStateOpen ? "收起 WorldState" : "展开 WorldState"}
                </button>
                <button className="console-disclosure-button" onClick={() => setIsEventLogOpen((current) => !current)} type="button">
                  {isEventLogOpen ? "收起日志" : "展开日志"}
                </button>
              </div>

              {isMvuPanelOpen && (
                <div className="decor-section-shell">
                  <img alt="" aria-hidden="true" className="decor-section-icon" src={statusIconUrls.memory} />
                  <MvuVariablePanel world={world} />
                </div>
              )}

              {isWorldStateOpen && (
                <section className="debug-subsection">
                  <h3>WorldState</h3>
                  <dl className="state-list">
                    <div>
                      <dt>uiMode</dt>
                      <dd>{world.uiMode}</dd>
                    </div>
                    <div>
                      <dt>weather</dt>
                      <dd>{weatherLabels[world.weather.kind]}</dd>
                    </div>
                    <div>
                      <dt>temperature</dt>
                      <dd>{world.weather.temperature}°C</dd>
                    </div>
                    <div>
                      <dt>city</dt>
                      <dd>{world.weather.city}</dd>
                    </div>
                    <div>
                      <dt>geo</dt>
                      <dd>{world.weatherPermission.geolocation}</dd>
                    </div>
                    <div>
                      <dt>local.time</dt>
                      <dd>{new Date(currentTime).toLocaleTimeString("zh-CN", { hour12: false })}</dd>
                    </div>
                    <div>
                      <dt>clock.period</dt>
                      <dd>
                        {currentDayPeriod} / {dayPeriodLabels[currentDayPeriod]}
                      </dd>
                    </div>
                    <div>
                      <dt>visual.period</dt>
                      <dd>
                        {world.weatherVisual.period} / {dayPeriodLabels[world.weatherVisual.period]}
                      </dd>
                    </div>
                    <div>
                      <dt>visual.id</dt>
                      <dd>{world.weatherVisual.illustrationId}</dd>
                    </div>
                    <div>
                      <dt>sync.error</dt>
                      <dd>{world.weatherPermission.lastError ?? "none"}</dd>
                    </div>
                    <div>
                      <dt>owner.mode</dt>
                      <dd>{world.ownerContext.mode}</dd>
                    </div>
                    <div>
                      <dt>presence</dt>
                      <dd>{world.ownerContext.presence}</dd>
                    </div>
                    <div>
                      <dt>focus.min</dt>
                      <dd>{world.ownerContext.todayFocusMinutes}</dd>
                    </div>
                    <div>
                      <dt>characters</dt>
                      <dd>{world.characters.length}</dd>
                    </div>
                    <div>
                      <dt>llm.mode</dt>
                      <dd>{world.llmBudget.mode}</dd>
                    </div>
                    <div>
                      <dt>llm.calls</dt>
                      <dd>
                        {world.llmBudget.callsUsedThisHour}/{world.llmBudget.maxCallsPerHour}
                      </dd>
                    </div>
                    <div>
                      <dt>pending</dt>
                      <dd>{world.pendingSocialEvent ? world.pendingSocialEvent.kind : "none"}</dd>
                    </div>
                  </dl>
                </section>
              )}

              {isEventLogOpen && (
                <section className="debug-subsection">
                  <h3>事件日志</h3>
                  <ol className="event-log">
                    {world.eventLog.map((entry) => (
                      <li key={entry.id}>
                        <time>{new Date(entry.at).toLocaleTimeString("zh-CN", { hour12: false })}</time>
                        <span>{entry.text}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </section>
          </aside>
        )}
      </section>
    </main>
  );
}

function buildWorldSummary(world: WorldState, characterId: string): string {
  const character = world.characters.find((item) => item.id === characterId);
  return JSON.stringify(
    {
      weather: {
        kind: world.weather.kind,
        label: weatherLabels[world.weather.kind],
        temperature: world.weather.temperature,
        city: world.weather.city
      },
      time: {
        period: world.weatherVisual.period,
        label: dayPeriodLabels[world.weatherVisual.period],
        updatedAt: world.weather.updatedAt
      },
      owner: {
        mode: world.ownerContext.mode,
        label: ownerModeLabels[world.ownerContext.mode],
        presence: world.ownerContext.presence,
        todayFocusMinutes: world.ownerContext.todayFocusMinutes
      },
      selectedCharacter: character
        ? {
            id: character.id,
            name: character.name,
            mood: character.mood,
            energy: character.energy,
            currentAction: character.currentAction,
            lastDialogue: character.lastDialogue
          }
        : null,
      characters: world.characters.map((item) => ({
        id: item.id,
        name: item.name,
        currentAction: item.currentAction,
        lastDialogue: item.lastDialogue
      })),
      recentEvents: world.eventLog.slice(0, 6).map((entry) => ({
        type: entry.type,
        text: entry.text,
        at: entry.at
      })),
      pendingSocialEvent: world.pendingSocialEvent
        ? {
            id: world.pendingSocialEvent.id,
            kind: world.pendingSocialEvent.kind,
            involvedCharacterIds: world.pendingSocialEvent.involvedCharacterIds,
            seedText: world.pendingSocialEvent.seedText
          }
        : null,
      chatMemory: {
        largeSummary: world.chatMemories[characterId]?.largeSummary ?? "",
        smallSummary: world.chatMemories[characterId]?.smallSummary ?? "",
        recentMessages: world.chatMemories[characterId]?.recentMessages.slice(-8) ?? []
      },
      gentlePolicy: "不责备、不制造内疚、不阴阳怪气、不攻击、不使用压迫式句式。"
    },
    null,
    2
  );
}

function getChatMemory(world: WorldState, characterId: string): CharacterChatMemory {
  return (
    world.chatMemories[characterId] ?? {
      characterId,
      recentMessages: [],
      smallSummary: "",
      largeSummary: "",
      smallSummaryCount: 0,
      memoryCandidates: []
    }
  );
}

function appendLocalChatMessage(memory: CharacterChatMemory, message: ChatMessage): CharacterChatMemory {
  const nextCandidates = memory.memoryCandidates?.slice(0, 6) ?? [];
  return {
    ...memory,
    recentMessages: [...memory.recentMessages, message].slice(-8),
    memoryCandidates: nextCandidates
  };
}

function shouldCreateSmallSummary(memory: CharacterChatMemory, now: number): boolean {
  if (memory.recentMessages.length >= 8) {
    return true;
  }
  if (!memory.smallSummaryUpdatedAt) {
    return memory.recentMessages.length >= 4;
  }
  return memory.recentMessages.length > 2 && now - memory.smallSummaryUpdatedAt >= 10 * 60 * 1000;
}

function refreshLlmBudget(world: WorldState, now: number): WorldState["llmBudget"] {
  if (now - world.llmBudget.hourStartedAt >= 60 * 60 * 1000) {
    return {
      ...world.llmBudget,
      callsUsedThisHour: 0,
      hourStartedAt: now
    };
  }
  return world.llmBudget;
}

function normalizeLlmConfigFields(
  baseUrlInput: string,
  apiKeyInput: string,
  modelInput: string
): { baseUrl: string; apiKey: string; model: string } {
  const trimmedBaseUrl = baseUrlInput.trim();
  const commaIndex = trimmedBaseUrl.indexOf(",");
  const splitBaseUrl = commaIndex >= 0 ? trimmedBaseUrl.slice(0, commaIndex).trim() : trimmedBaseUrl;
  const splitApiKey = commaIndex >= 0 ? trimmedBaseUrl.slice(commaIndex + 1).trim() : "";

  return {
    baseUrl: splitBaseUrl
      .replace(/\/$/, "")
      .replace(/\/chat\/completions$/, "")
      .replace(/\/models$/, ""),
    apiKey: apiKeyInput.trim() || splitApiKey,
    model: modelInput.trim() || "kimi-k2.5"
  };
}

function buildLocalLlmDialogue(characterId: string, ownerInput?: string, seedAt = Date.now()): LlmDialogueResponse {
  const normalizedInput = ownerInput?.trim();
  const fallbackLinesByCharacter: Record<string, string[]> = {
    mika: [
      "我听到了，先陪你慢慢整理一下。",
      "这句话我记下啦，我们轻轻往前走。",
      "别急，我在旁边陪你把节奏放慢。"
    ],
    nan: [
      "收到！我先举个小旗子陪你一下。",
      "嘿，我听见啦，我们先从一点点开始！",
      "我在这边点头，事情可以慢慢来。"
    ],
    sui: [
      "哼，我听见了。先别急着给自己压力。",
      "知道了知道了，我会帮你盯着一点。",
      "这事先放桌上，我们慢慢看。"
    ],
    lin: [
      "咕，我接住这句话了，先啄一小口！",
      "嘿嘿，这个信息我先叼起来。",
      "我懂一点点了，像小纸条飞过来。"
    ]
  };
  const ambientLinesByCharacter: Record<string, string[]> = {
    mika: ["窗外的光很软，我陪你慢慢来。", "我在窗边待着，有事轻轻叫我。", "今天适合一点点整理。"],
    nan: ["我在靠窗这边，发现一点好天气。", "我绕了一小圈，舱里状态不错！", "我先挥挥翅膀，给这里加点亮度。"],
    sui: ["慢一点也很好，我陪你歇会儿。", "哼，舱里还算安静。", "我先观察一下，不吵你。"],
    lin: ["先做一点点，也算往前了。", "我刚刚想到一个小小怪点。", "咕，窗边有一块很好看的光。"]
  };
  const lines = normalizedInput ? fallbackLinesByCharacter[characterId] : ambientLinesByCharacter[characterId];
  const fallbackLines = normalizedInput ? fallbackLinesByCharacter.mika : ambientLinesByCharacter.mika;
  const pickedLines = lines ?? fallbackLines;
  const inputHint = normalizedInput ? `「${normalizedInput.slice(0, 18)}」` : "";
  const picked = pickedLines[hashText(`${characterId}-${normalizedInput ?? "ambient"}-${seedAt}`) % pickedLines.length];

  return {
    characterId,
    text: normalizedInput && characterId === "mika" ? picked.replace("这句话", inputHint || "这句话") : picked,
    emotion: characterId === "nan" ? "happy" : characterId === "lin" ? "focused" : "calm",
    actionSuggestion: "observe_window",
    reason: "LLM 暂不可用或预算走 mock 时，使用随输入变化的本地短句。",
    memoryCandidate: {
      importance: 1,
      summary: "角色使用了本地温和 fallback 短句。"
    }
  };
}

function hashText(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildLocalSocialDialogue(characterId: string, targetId: string): LlmSocialDialogueResponse {
  const textByCharacter: Record<string, string> = {
    mika: "我在这边，刚好可以陪你看一会儿。",
    nan: "嘿，过来过来，我发现一个小亮点！",
    sui: "我路过这边，想和你慢慢待一会儿。",
    lin: "我刚刚想到一个很怪但有趣的点！"
  };

  return {
    socialEventId: `local-${characterId}-${targetId}`,
    speakerId: characterId,
    targetId,
    text: textByCharacter[characterId] ?? "我刚好想到一件小事。",
    emotion: characterId === "nan" || characterId === "lin" ? "curious" : "calm",
    actionSuggestion: "talk_to_character",
    reason: `本地 fallback：${characterId} 和 ${targetId} 进行轻量互聊。`,
    memoryCandidate: {
      importance: 1,
      summary: "两个角色进行了一次轻量、温和的自动互聊。"
    }
  };
}

function buildLocalSmallSummary(characterId: string, memory: CharacterChatMemory): { characterId: string; summary: string } {
  const recentText = memory.recentMessages
    .slice(-6)
    .map((message) => `${message.role === "owner" ? "主人" : "角色"}：${message.text}`)
    .join("；")
    .slice(0, 90);
  return {
    characterId,
    summary:
      recentText.length > 0
        ? `最近私聊主要围绕「${recentText}」展开。角色保持温和、短句、低打扰的陪伴方式，后续可自然延续当前主题。`
        : "最近私聊内容较少，角色保持温和、短句、低打扰的陪伴方式。"
  };
}

function buildLocalLargeSummary(characterId: string, memory: CharacterChatMemory): { characterId: string; summary: string } {
  const candidate = memory.memoryCandidates?.[0]?.summary;
  return {
    characterId,
    summary:
      memory.largeSummary ||
      `角色与主人维持轻量、温和、低打扰的私聊关系。${candidate ? `长期可保留的信息是：${candidate}` : "长期记忆优先保留互动偏好、角色语气和稳定陪伴方式，不保存完整聊天全文或敏感细节。"}`
  };
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function connectionStatusLabel(status: "idle" | "loading" | "ready" | "error"): string {
  switch (status) {
    case "idle":
      return "未测试";
    case "loading":
      return "测试中";
    case "ready":
      return "连接成功";
    case "error":
      return "连接失败";
  }
}

function toCharacterAction(action: string | undefined): CharacterAction | undefined {
  if (
    action === "idle" ||
    action === "chat" ||
    action === "greet_owner" ||
    action === "talk_to_character" ||
    action === "observe_window" ||
    action === "look_weather" ||
    action === "think" ||
    action === "rest" ||
    action === "play"
  ) {
    return action;
  }
  return undefined;
}

function createPairKey(a: string, b: string): string {
  return [a, b].sort().join("-");
}

function distanceBetweenPositions(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}
