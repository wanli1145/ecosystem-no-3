import { useEffect, useRef } from "react";
import type { WorldEvent } from "../../shared/events";
import { canCallLlm } from "../../shared/llm/policy";
import type { LlmDialogueResponse } from "../../shared/llm/types";
import type { CharacterAction, CharacterState, OwnerMode, UIMode, WeatherKind, WorldState } from "../../shared/types";

type UseLlmSchedulerInput = {
  world: WorldState;
  dispatch: (event: WorldEvent) => void;
  hasIpcBridge: boolean;
  hasApiKey: boolean;
  buildWorldSummary: (world: WorldState, characterId: string) => string;
  onAutoBubble: (characterId: string, durationMs: number) => void;
};

type AmbientDelayRange = {
  minMs: number;
  maxMs: number;
};

const schedulerIntervalMs = 5000;

export function useLlmScheduler({
  world,
  dispatch,
  hasIpcBridge,
  hasApiKey,
  buildWorldSummary,
  onAutoBubble
}: UseLlmSchedulerInput): void {
  const worldRef = useRef(world);
  const hasIpcBridgeRef = useRef(hasIpcBridge);
  const hasApiKeyRef = useRef(hasApiKey);
  const dispatchRef = useRef(dispatch);
  const buildWorldSummaryRef = useRef(buildWorldSummary);
  const onAutoBubbleRef = useRef(onAutoBubble);
  const ambientInFlightRef = useRef(false);
  const lastAmbientCallAtRef = useRef(Date.now());
  const nextAmbientDelayMsRef = useRef(pickAmbientDelayMs(world.uiMode, world.ownerContext.mode, "init"));
  const lastSpeakerIdRef = useRef<string | null>(null);
  const rotationIndexRef = useRef(0);
  const skippedPolicyAtRef = useRef(0);

  useEffect(() => {
    worldRef.current = world;
  }, [world]);

  useEffect(() => {
    hasIpcBridgeRef.current = hasIpcBridge;
  }, [hasIpcBridge]);

  useEffect(() => {
    hasApiKeyRef.current = hasApiKey;
  }, [hasApiKey]);

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  useEffect(() => {
    buildWorldSummaryRef.current = buildWorldSummary;
  }, [buildWorldSummary]);

  useEffect(() => {
    onAutoBubbleRef.current = onAutoBubble;
  }, [onAutoBubble]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void maybeGenerateAmbientDialogue();
    }, schedulerIntervalMs);

    return () => window.clearInterval(timer);
  }, []);

  async function maybeGenerateAmbientDialogue(): Promise<void> {
    const currentWorld = worldRef.current;
    const now = Date.now();

    if (
      ambientInFlightRef.current ||
      currentWorld.uiMode === "sleep" ||
      currentWorld.ownerContext.mode === "do_not_disturb" ||
      currentWorld.pendingSocialEvent
    ) {
      return;
    }

    if (now - lastAmbientCallAtRef.current < nextAmbientDelayMsRef.current) {
      return;
    }

    const policy = canCallLlm({
      uiMode: currentWorld.uiMode,
      ownerMode: currentWorld.ownerContext.mode,
      llmBudget: currentWorld.llmBudget,
      callKind: "ambient_dialogue",
      now,
      lastLlmCallAt: currentWorld.llmBudget.lastCallAt,
      hasApiKey: hasApiKeyRef.current
    });

    if (!policy.allowed && !policy.useMock) {
      if (now - skippedPolicyAtRef.current > 30 * 1000) {
        skippedPolicyAtRef.current = now;
      }
      lastAmbientCallAtRef.current = now;
      nextAmbientDelayMsRef.current = pickAmbientDelayMs(currentWorld.uiMode, currentWorld.ownerContext.mode, `${now}-skip`);
      return;
    }

    const character = pickAmbientCharacter(currentWorld, lastSpeakerIdRef.current, rotationIndexRef.current);
    if (!character) {
      return;
    }

    ambientInFlightRef.current = true;
    dispatchRef.current({ type: "LLM_CALL_STARTED", callKind: "ambient_dialogue", at: now });

    try {
      const response =
        policy.useMock || !hasIpcBridgeRef.current || !window.ecosystem?.llm
          ? buildLocalAmbientDialogue(character, currentWorld)
          : await window.ecosystem.llm.generateCharacterDialogue({
              characterId: character.id,
              target: "room",
              worldSummary: buildWorldSummaryRef.current(currentWorld, character.id)
            });
      const finishedAt = Date.now();
      const characterId = response.characterId || character.id;

      dispatchRef.current({
        type: "CHARACTER_LLM_DIALOGUE_RECEIVED",
        characterId,
        text: response.text || "我先安静待一会儿。",
        actionSuggestion: toCharacterAction(response.actionSuggestion),
        memoryCandidate: response.memoryCandidate,
        at: finishedAt
      });
      if (policy.allowed) {
        dispatchRef.current({ type: "LLM_CALL_SUCCEEDED", callKind: "ambient_dialogue", at: finishedAt });
      }
      onAutoBubbleRef.current(characterId, 8000 + (hashSeed(`${characterId}-${finishedAt}-bubble`) % 4000));
      lastSpeakerIdRef.current = characterId;
      rotationIndexRef.current += 1;
      lastAmbientCallAtRef.current = finishedAt;
      nextAmbientDelayMsRef.current = pickAmbientDelayMs(currentWorld.uiMode, currentWorld.ownerContext.mode, `${characterId}-${finishedAt}`);
    } catch {
      const failedAt = Date.now();
      dispatchRef.current({ type: "LLM_CALL_FAILED", error: "自动冒泡台词生成失败", at: failedAt });
      lastAmbientCallAtRef.current = failedAt;
      nextAmbientDelayMsRef.current = pickAmbientDelayMs(currentWorld.uiMode, currentWorld.ownerContext.mode, `${failedAt}-failed`);
    } finally {
      ambientInFlightRef.current = false;
    }
  }
}

function pickAmbientCharacter(world: WorldState, lastSpeakerId: string | null, rotationIndex: number): CharacterState | null {
  const characters = rotate(world.characters, rotationIndex).filter((character) => character.id !== lastSpeakerId);
  const pool = characters.length > 0 ? characters : world.characters;
  const weatherCharacter = pool.find((character) => character.currentAction === "look_weather" || character.currentAction === "observe_window");
  const activeCharacter = pool.find((character) => character.currentAction !== "idle");
  const quietCharacter = [...pool].sort((a, b) => dialogueFreshnessScore(a) - dialogueFreshnessScore(b))[0];

  if (world.ownerContext.mode === "chat") {
    return pool.find((character) => character.currentAction === "chat" || character.currentAction === "talk_to_character") ?? activeCharacter ?? quietCharacter ?? null;
  }

  if (weatherCharacter) {
    return weatherCharacter;
  }

  return activeCharacter ?? quietCharacter ?? null;
}

function pickAmbientDelayMs(uiMode: UIMode, ownerMode: OwnerMode, seed: string): number {
  const range = ambientDelayRange(uiMode, ownerMode);
  return range.minMs + (hashSeed(`${uiMode}-${ownerMode}-${seed}`) % (range.maxMs - range.minMs + 1));
}

function ambientDelayRange(uiMode: UIMode, ownerMode: OwnerMode): AmbientDelayRange {
  if (uiMode === "sleep" || ownerMode === "do_not_disturb") {
    return { minMs: Number.MAX_SAFE_INTEGER / 2, maxMs: Number.MAX_SAFE_INTEGER / 2 };
  }

  if (uiMode === "mini") {
    return { minMs: 3 * 60 * 1000, maxMs: 5 * 60 * 1000 };
  }

  if (ownerMode === "focus") {
    return { minMs: 2 * 60 * 1000, maxMs: 4 * 60 * 1000 };
  }

  if (ownerMode === "chat") {
    return { minMs: 45 * 1000, maxMs: 75 * 1000 };
  }

  return { minMs: 45 * 1000, maxMs: 90 * 1000 };
}

function buildLocalAmbientDialogue(character: CharacterState, world: WorldState): LlmDialogueResponse {
  const text = localAmbientText(character.id, world.weather.kind);
  return {
    characterId: character.id,
    text,
    emotion: character.mood === "bright" ? "happy" : character.mood === "focused" ? "focused" : character.mood === "cozy" ? "cozy" : "calm",
    actionSuggestion: ambientActionSuggestion(character.currentAction),
    reason: "无 API Key 或 IPC 不可用时，使用本地 mock 自动冒泡短句。",
    memoryCandidate: {
      importance: 1,
      summary: `${character.name} 自动冒泡了一句温和的日常短句。`
    }
  };
}

function ambientActionSuggestion(action: CharacterAction): LlmDialogueResponse["actionSuggestion"] {
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
  return "think";
}

function localAmbientText(characterId: string, weather: WeatherKind): string {
  const weatherLine =
    weather === "sunny"
      ? "窗边的光很舒服。"
      : weather === "rainy"
        ? "雨声让舱里安静下来。"
        : weather === "cloudy"
          ? "今天适合慢慢整理。"
          : "我把节奏放轻一点。";
  const textByCharacter: Record<string, string> = {
    mika: `我在这里，${weatherLine}`,
    nan: `我发现了一个小变化，${weatherLine}`,
    sui: `慢慢来就好，${weatherLine}`,
    lin: `我先记下这个想法，${weatherLine}`
  };
  return textByCharacter[characterId] ?? `我先安静待一会儿，${weatherLine}`;
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) {
    return [];
  }
  const start = offset % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function dialogueFreshnessScore(character: CharacterState): number {
  return character.lastDialogue.length + (character.currentAction === "idle" ? 20 : 0);
}

function toCharacterAction(action: string | undefined): CharacterAction | undefined {
  if (
    action === "idle" ||
    action === "walk" ||
    action === "study" ||
    action === "rest" ||
    action === "chat" ||
    action === "drink" ||
    action === "snack" ||
    action === "observe_window" ||
    action === "look_weather" ||
    action === "wander" ||
    action === "greet_owner" ||
    action === "talk_to_character" ||
    action === "play" ||
    action === "nap" ||
    action === "think" ||
    action === "react_weather" ||
    action === "error"
  ) {
    return action;
  }
  return undefined;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
