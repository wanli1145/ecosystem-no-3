import type { WorldEvent } from "./events";
import { createBehaviorIntent } from "./behavior";
import {
  CHARACTER_MOTION_PROFILES,
  CHARACTER_ZONE_PREFERENCES,
  clampPositionToCabin,
  pickZonePosition
} from "./config/room";
import type { RoomZoneName } from "./config/room";
import { resolveDayPeriod, resolveWeatherVisual } from "./config/weather";
import type { LlmCallKind } from "./llm/policy";
import { restorePersistedWorldState } from "./persistence";
import type {
  BehaviorIntent,
  CharacterAction,
  CharacterChatMemory,
  CharacterFacing,
  CharacterState,
  ChatMessage,
  OwnerMode,
  PendingSocialEvent,
  RelationshipState,
  WeatherKind,
  WeatherPermissionState,
  WeatherState,
  WorldLogEntry,
  WorldState
} from "./types";

const maxLogEntries = 12;
const characterCollisionRadius = 3.4;

const characterSeed = [
  {
    id: "mika",
    name: "米卡",
    color: "#61c7b3",
    mood: "calm",
    position: { x: 18, y: 56 },
    targetPosition: { x: 18, y: 56 },
    collisionRadius: characterCollisionRadius,
    facing: "right",
    actionUntil: 0,
    movementState: "idle",
    currentAction: "idle",
    lastDialogue: "今天的生态舱很安静。"
  },
  {
    id: "nan",
    name: "南星",
    color: "#f6b756",
    mood: "bright",
    position: { x: 42, y: 42 },
    targetPosition: { x: 42, y: 42 },
    collisionRadius: characterCollisionRadius,
    facing: "right",
    actionUntil: 0,
    movementState: "acting",
    currentAction: "chat",
    lastDialogue: "我占了靠窗的位置。"
  },
  {
    id: "sui",
    name: "穗穗",
    color: "#9b8cf2",
    mood: "cozy",
    position: { x: 64, y: 60 },
    targetPosition: { x: 64, y: 60 },
    collisionRadius: characterCollisionRadius,
    facing: "left",
    actionUntil: 0,
    movementState: "acting",
    currentAction: "rest",
    lastDialogue: "慢一点也很好。"
  },
  {
    id: "lin",
    name: "林也",
    color: "#ef7d8d",
    mood: "focused",
    position: { x: 78, y: 36 },
    targetPosition: { x: 78, y: 36 },
    collisionRadius: characterCollisionRadius,
    facing: "left",
    actionUntil: 0,
    movementState: "acting",
    currentAction: "study",
    lastDialogue: "我先把桌面整理一下。"
  }
] satisfies Array<Omit<CharacterState, "energy">>;

const now = Date.now();
const initialWeatherVisual = resolveWeatherVisual({
  weather: "cloudy",
  at: now,
  reason: "生态圈初始化，根据默认天气与当前时间选择窗口贴图"
});

export const initialWorldState: WorldState = {
  uiMode: "full",
  ownerContext: {
    presence: "active",
    mode: "rest",
    lastInteractionAt: now,
    todayFocusMinutes: 0
  },
  weather: {
    kind: "cloudy",
    temperature: 24,
    city: "上海",
    updatedAt: now
  },
  weatherPermission: {
    geolocation: "unknown",
    weather: "idle"
  },
  weatherVisual: initialWeatherVisual,
  characters: characterSeed.map((character, index) => ({
    ...character,
    energy: 70 + index * 4
  })),
  relationships: createRelationships(characterSeed.map((character) => character.id)),
  eventLog: [createLogEntry("init", now, "生态圈三号初始化完成。")],
  memories: [
    {
      id: "memory-init",
      at: now,
      scope: "global",
      summary: "生态圈三号首次启动，四位角色进入桌面生态舱。",
      importance: 3
    }
  ],
  chatMemories: createInitialChatMemories(characterSeed.map((character) => character.id)),
  llmBudget: {
    mode: "normal",
    maxCallsPerHour: 8,
    callsUsedThisHour: 0,
    hourStartedAt: now,
    ambientCooldownMs: 5 * 60 * 1000,
    manualCallsUsedThisHour: 0,
    ambientCallsUsedThisHour: 0,
    summaryCallsUsedThisHour: 0
  },
  pendingSocialEvent: null
};

export function reducer(state: WorldState, event: WorldEvent): WorldState {
  switch (event.type) {
    case "TICK":
      return applyTick(state, event.now);
    case "WORLD_STATE_RESTORED": {
      const restoredState = restorePersistedWorldState(state, event.snapshot);
      return {
        ...restoredState,
        eventLog: appendLog(
          restoredState.eventLog,
          createLogEntry("world_state_restored", event.at, "已恢复本地生态圈记忆。")
        )
      };
    }
    case "CLOCK_TICKED":
      return applyClockTick(state, event.now);
    case "UI_MODE_CHANGED":
      return {
        ...state,
        uiMode: event.mode,
        ownerContext: {
          ...state.ownerContext,
          presence: event.mode === "sleep" ? "away" : state.ownerContext.presence
        },
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("ui_mode_changed", event.at, `切换到${describeUIMode(event.mode)}。`)
        )
      };
    case "OWNER_MODE_CHANGED":
      return {
        ...state,
        ownerContext: {
          ...state.ownerContext,
          mode: event.mode,
          lastInteractionAt: event.at
        },
        characters: state.characters.map((character) => applyOwnerMode(character, event.mode)),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("owner_mode_changed", event.at, `主人模式切换为「${ownerModeText(event.mode)}」。`)
        )
      };
    case "OWNER_CARE":
      return {
        ...state,
        ownerContext: {
          ...state.ownerContext,
          lastInteractionAt: event.at
        },
        characters: state.characters.map((character) =>
          character.id === event.targetId ? applyCare(character, event.careType) : character
        ),
        memories: appendMemory(
          state.memories,
          event.at,
          "owner",
          `主人对 ${findCharacterName(state.characters, event.targetId)} 执行了 ${careLabel(event.careType)}。`
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "owner_care",
            event.at,
            `主人给 ${findCharacterName(state.characters, event.targetId)} 执行了「${careLabel(event.careType)}」。`
          )
        )
      };
    case "OWNER_TASK_ASSIGNED":
      return {
        ...state,
        ownerContext: {
          ...state.ownerContext,
          lastInteractionAt: event.at
        },
        characters: state.characters.map((character) =>
          character.id === event.targetId ? applyTask(character, event.task) : character
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "owner_task_assigned",
            event.at,
            `主人给 ${findCharacterName(state.characters, event.targetId)} 分配了「${taskLabel(event.task)}」。`
          )
        )
      };
    case "CHARACTER_DRAGGED":
      const draggedPosition = clampPositionToCabin({ x: event.x, y: event.y });
      return {
        ...state,
        characters: state.characters.map((character) =>
          character.id === event.targetId
            ? {
                ...character,
                position: draggedPosition,
                targetPosition: draggedPosition,
                movementState: "idle",
                actionUntil: event.at + 5000
              }
            : character
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("character_dragged", event.at, `${findCharacterName(state.characters, event.targetId)} 被移动到新位置。`)
        )
      };
    case "CHARACTER_NEAR":
      return {
        ...state,
        pendingSocialEvent: createPendingSocialEvent(state, event.a, event.b, event.at),
        relationships: updateRelationshipProximity(state.relationships, event.a, event.b),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "character_near",
            event.at,
            `${findCharacterName(state.characters, event.a)} 靠近了 ${findCharacterName(state.characters, event.b)}。`
          )
        )
      };
    case "WEATHER_PERMISSION_REQUESTED":
      return {
        ...state,
        weatherPermission: {
          ...state.weatherPermission,
          geolocation: state.weatherPermission.geolocation === "granted" ? "granted" : "requested",
          weather: "loading",
          lastError: undefined
        },
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("weather_permission_requested", event.at, "正在请求天气与位置权限。")
        )
      };
    case "WEATHER_PERMISSION_RESOLVED":
      return {
        ...state,
        weatherPermission: event.permission,
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "weather_permission_resolved",
            event.at,
            event.permission.weather === "ready" ? "天气与时间信息已同步。" : `天气同步未完成：${event.permission.lastError ?? "未授权"}。`
          )
        )
      };
    case "WEATHER_CHANGED":
      const weatherVisual = resolveWeatherVisual({
        weather: event.weather.kind,
        at: event.at,
        reason: `天气更新为${describeWeather(event.weather.kind)}，根据当前时间选择插图`
      });
      return {
        ...state,
        weather: event.weather,
        weatherVisual,
        characters: state.characters.map((character) => applyWeather(character, event.weather.kind)),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("weather_changed", event.at, `天气更新为${describeWeather(event.weather.kind)}。`)
        )
      };
    case "WEATHER_SYNC_REQUESTED":
      return {
        ...state,
        weatherPermission: {
          ...state.weatherPermission,
          geolocation: state.weatherPermission.geolocation === "granted" ? "granted" : "requested",
          weather: "loading",
          lastError: undefined
        },
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("weather_sync_requested", event.at, "正在同步真实天气。")
        )
      };
    case "WEATHER_SYNC_SUCCEEDED":
      return applyWeatherSyncSucceeded(state, event.weather, event.geolocation, event.at, event.message);
    case "WEATHER_SYNC_FAILED":
      return {
        ...state,
        weatherPermission: {
          geolocation: event.denied ? "denied" : state.weatherPermission.geolocation,
          weather: "error",
          lastError: event.error
        },
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("weather_sync_failed", event.at, `天气同步暂时不可用：${event.error}。`)
        )
      };
    case "WEATHER_VISUAL_DECIDED":
      return {
        ...state,
        weatherVisual: event.visual,
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "weather_visual_decided",
            event.at,
            `天气窗口切换为 ${event.visual.illustrationId}。`
          )
        )
      };
    case "CHARACTER_BEHAVIOR_INTENT_CREATED":
      return {
        ...state,
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "character_behavior_intent_created",
            event.at,
            `${findCharacterName(state.characters, event.intent.characterId)} 准备进入「${actionLabel(event.intent.action)}」。`
          )
        )
      };
    case "CHARACTER_BEHAVIOR_APPLIED":
      return {
        ...state,
        characters: state.characters.map((character) =>
          character.id === event.intent.characterId ? applyBehaviorIntent(character, event.intent) : character
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "character_behavior_applied",
            event.at,
            `${findCharacterName(state.characters, event.intent.characterId)} 开始「${actionLabel(event.intent.action)}」：${event.intent.reason}`
          )
        )
      };
    case "DIALOGUE_GENERATED":
      return {
        ...state,
        characters: state.characters.map((character) =>
          character.id === event.speakerId ? { ...character, lastDialogue: event.text } : character
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("dialogue_generated", event.at, `${findCharacterName(state.characters, event.speakerId)} 说：${event.text}`)
        )
      };
    case "SOCIAL_DIALOGUE_REQUESTED":
      return {
        ...state,
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "social_dialogue_requested",
            event.at,
            `${findCharacterName(state.characters, event.speakerId)} 和 ${findCharacterName(state.characters, event.targetId)} 准备轻声交流。`
          )
        )
      };
    case "SOCIAL_DIALOGUE_GENERATED": {
      const speakerName = findCharacterName(state.characters, event.speakerId);
      const targetName = findCharacterName(state.characters, event.targetId);
      const shouldClearPending = state.pendingSocialEvent?.id === event.socialEventId;
      const nextMemories =
        event.memoryCandidate && event.memoryCandidate.importance >= 2
          ? appendMemory(
              state.memories,
              event.at,
              "relationship",
              event.memoryCandidate.summary,
              event.memoryCandidate.importance,
              `${event.speakerId}-${event.targetId}`
            )
          : state.memories;

      return {
        ...state,
        pendingSocialEvent: shouldClearPending ? null : state.pendingSocialEvent,
        relationships: updateRelationshipProximity(state.relationships, event.speakerId, event.targetId),
        characters: state.characters.map((character) => {
          if (character.id === event.speakerId) {
            return {
              ...character,
              currentAction: event.actionSuggestion ?? "talk_to_character",
              actionReason: `和 ${targetName} 轻声交流`,
              actionUntil: event.at + socialDialogueDurationMs(event.socialEventId, event.speakerId),
              movementState: "acting",
              lastDialogue: event.text
            };
          }

          if (character.id === event.targetId) {
            return {
              ...character,
              currentAction: "chat",
              actionReason: `听 ${speakerName} 说话`,
              actionUntil: event.at + socialDialogueDurationMs(event.socialEventId, event.targetId),
              movementState: "acting"
            };
          }

          return character;
        }),
        memories: nextMemories,
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("social_dialogue_generated", event.at, `${speakerName} 对 ${targetName} 说：${event.text}`)
        )
      };
    }
    case "SOCIAL_DIALOGUE_FAILED":
      return {
        ...state,
        pendingSocialEvent: state.pendingSocialEvent?.id === event.socialEventId ? null : state.pendingSocialEvent,
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("social_dialogue_failed", event.at, "这次交流暂时没有生成，角色继续自己的小日常。")
        )
      };
    case "LLM_CALL_STARTED":
      return {
        ...state,
        llmBudget: refreshBudget(state.llmBudget, event.at),
        eventLog: appendLog(state.eventLog, createLogEntry("llm_call_started", event.at, "正在生成角色短对话。"))
      };
    case "LLM_CALL_SUCCEEDED": {
      const refreshedBudget = refreshBudget(state.llmBudget, event.at);
      return {
        ...state,
        llmBudget: incrementBudget(refreshedBudget, event.callKind, event.at),
        eventLog: appendLog(state.eventLog, createLogEntry("llm_call_succeeded", event.at, "角色短对话已生成。"))
      };
    }
    case "LLM_CALL_FAILED":
      return {
        ...state,
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("llm_call_failed", event.at, `角色短对话暂时不可用：${event.error}。`)
        )
      };
    case "CHARACTER_LLM_DIALOGUE_RECEIVED": {
      const characterName = findCharacterName(state.characters, event.characterId);
      const nextMemories =
        event.memoryCandidate && event.memoryCandidate.importance >= 2
          ? appendMemory(
              state.memories,
              event.at,
              "character",
              event.memoryCandidate.summary,
              event.memoryCandidate.importance,
              event.characterId
            )
          : state.memories;

      return {
        ...state,
        characters: state.characters.map((character) =>
          character.id === event.characterId
            ? {
                ...character,
                currentAction: event.actionSuggestion ?? character.currentAction,
                actionReason: event.actionSuggestion ? "LLM 生成短对话时建议的动作" : character.actionReason,
                actionUntil: event.actionSuggestion ? 0 : character.actionUntil,
                movementState: event.actionSuggestion ? "idle" : character.movementState,
                lastDialogue: event.text
              }
            : character
        ),
        memories: nextMemories,
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("character_llm_dialogue_received", event.at, `${characterName} 说：${event.text}`)
        )
      };
    }
    case "OWNER_CHAT_MESSAGE_SENT":
      return {
        ...state,
        ownerContext: {
          ...state.ownerContext,
          lastInteractionAt: event.at
        },
        chatMemories: appendChatMessage(state.chatMemories, {
          id: `owner-chat-${event.characterId}-${event.at}`,
          characterId: event.characterId,
          role: "owner",
          text: event.text,
          at: event.at
        }),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("owner_chat_message_sent", event.at, `主人和 ${findCharacterName(state.characters, event.characterId)} 说了一句话。`)
        )
      };
    case "CHARACTER_CHAT_MESSAGE_RECEIVED": {
      const characterName = findCharacterName(state.characters, event.characterId);
      const nextMemories =
        event.memoryCandidate && event.memoryCandidate.importance >= 2
          ? appendMemory(
              state.memories,
              event.at,
              "character",
              event.memoryCandidate.summary,
              event.memoryCandidate.importance,
              event.characterId
            )
          : state.memories;
      return {
        ...state,
        characters: state.characters.map((character) =>
          character.id === event.characterId
            ? {
                ...character,
                currentAction: event.actionSuggestion ?? character.currentAction,
                actionReason: event.actionSuggestion ? "私聊回复时建议的动作" : character.actionReason,
                actionUntil: event.actionSuggestion ? 0 : character.actionUntil,
                movementState: event.actionSuggestion ? "idle" : character.movementState,
                lastDialogue: event.text
              }
            : character
        ),
        memories: nextMemories,
        chatMemories: appendChatMessage(
          mergeMemoryCandidate(state.chatMemories, event.characterId, event.memoryCandidate, event.at),
          {
            id: `character-chat-${event.characterId}-${event.at}`,
            characterId: event.characterId,
            role: "character",
            text: event.text,
            at: event.at
          }
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("character_chat_message_received", event.at, `${characterName} 私聊回复：${event.text}`)
        )
      };
    }
    case "CHAT_SMALL_SUMMARY_CREATED":
      return {
        ...state,
        chatMemories: updateChatMemory(state.chatMemories, event.characterId, (memory) => ({
          ...memory,
          smallSummary: sanitizeSummary(event.summary),
          smallSummaryUpdatedAt: event.at,
          smallSummaryCount: (memory.smallSummaryCount ?? 0) + 1,
          recentMessages: memory.recentMessages.slice(-2)
        })),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("chat_small_summary_created", event.at, `${findCharacterName(state.characters, event.characterId)} 的短期私聊摘要已更新。`)
        )
      };
    case "CHAT_LARGE_SUMMARY_CREATED":
      return {
        ...state,
        chatMemories: updateChatMemory(state.chatMemories, event.characterId, (memory) => ({
          ...memory,
          largeSummary: sanitizeSummary(event.summary),
          largeSummaryUpdatedAt: event.at,
          smallSummaryCount: 0,
          memoryCandidates: memory.memoryCandidates?.slice(0, 3)
        })),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("chat_large_summary_created", event.at, `${findCharacterName(state.characters, event.characterId)} 的长期私聊摘要已更新。`)
        )
      };
    case "DAY_SUMMARY_CREATED":
      return {
        ...state,
        memories: appendMemory(state.memories, event.at, "global", event.summary),
        llmBudget: {
          ...state.llmBudget,
          dailySummaryCreatedAt: event.at
        },
        eventLog: appendLog(state.eventLog, createLogEntry("day_summary_created", event.at, "今日日报已生成。"))
      };
    default:
      return state;
  }
}

function applyClockTick(state: WorldState, now: number): WorldState {
  const currentPeriod = resolveDayPeriod(now);
  const ownerContext = {
    ...state.ownerContext,
    todayFocusMinutes:
      state.ownerContext.mode === "focus"
        ? state.ownerContext.todayFocusMinutes + 1
        : state.ownerContext.todayFocusMinutes
  };

  if (currentPeriod === state.weatherVisual.period) {
    return {
      ...state,
      ownerContext
    };
  }

  const nextWeatherVisual = resolveWeatherVisual({
    weather: state.weather.kind,
    at: now,
    reason: "真实时间段变化，切换天气窗口贴图"
  });

  return {
    ...state,
    ownerContext,
    weatherVisual: nextWeatherVisual,
    eventLog: appendLog(
      state.eventLog,
      createLogEntry(
        "clock_period_changed",
        now,
        `时间进入${periodText(nextWeatherVisual.period)}，天气窗口切换为 ${nextWeatherVisual.illustrationId}。`
      )
    )
  };
}

function normalizeCharacterForCabin(character: CharacterState): CharacterState {
  const position = clampPositionToCabin(character.position);
  const targetPosition = clampPositionToCabin(character.targetPosition ?? character.position);
  return {
    ...character,
    position,
    targetPosition,
    waypointPosition: character.waypointPosition ? clampPositionToCabin(character.waypointPosition) : undefined,
    collisionRadius: character.collisionRadius ?? characterCollisionRadius,
    facing: character.facing ?? "right",
    actionUntil: character.actionUntil ?? 0,
    movementState: character.movementState ?? "idle"
  };
}

function moveTowardTarget(
  character: CharacterState,
  now: number,
  others: CharacterState[]
): { character: CharacterState; arrived: boolean } {
  const finalTargetPosition = clampPositionToCabin(character.targetPosition);
  const moveTargetPosition = clampPositionToCabin(character.waypointPosition ?? finalTargetPosition);
  const distance = distanceBetween(character.position, moveTargetPosition);
  if (distance <= arrivalDistance()) {
    const settledPosition = separateFromCharacters(moveTargetPosition, character, others, "settle");
    if (character.waypointPosition) {
      return {
        character: {
          ...character,
          position: settledPosition,
          targetPosition: finalTargetPosition,
          waypointPosition: undefined,
          facing: facingToward(settledPosition, finalTargetPosition, character.facing)
        },
        arrived: false
      };
    }

    return {
      character: {
        ...character,
        position: settledPosition,
        targetPosition: settledPosition,
        waypointPosition: undefined
      },
      arrived: true
    };
  }

  const step = Math.min(movementStep(character, now), distance);
  const ratio = step / distance;
  const nextPosition = separateFromCharacters(
    clampPositionToCabin({
    x: character.position.x + (moveTargetPosition.x - character.position.x) * ratio,
    y: character.position.y + (moveTargetPosition.y - character.position.y) * ratio
    }),
    character,
    others,
    "moving"
  );

  return {
    character: {
      ...character,
      position: nextPosition,
      targetPosition: finalTargetPosition,
      facing: facingToward(character.position, moveTargetPosition, character.facing)
    },
    arrived: false
  };
}

function movementStep(character: CharacterState, now: number): number {
  const profile = motionProfile(character.id);
  const range = profile.maxSpeed - profile.minSpeed;
  const speedOffset = (hashSeed(`${character.id}-${Math.floor(now / 4800)}-speed`) % 100) / 100;
  return profile.minSpeed + range * speedOffset;
}

function motionProfile(characterId: string): (typeof CHARACTER_MOTION_PROFILES)[string] {
  return CHARACTER_MOTION_PROFILES[characterId] ?? CHARACTER_MOTION_PROFILES.mika;
}

function arrivalDistance(): number {
  return 1.1;
}

function distanceBetween(a: CharacterState["position"], b: CharacterState["position"]): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function separateFromCharacters(
  position: CharacterState["position"],
  character: CharacterState,
  others: CharacterState[],
  mode: "moving" | "settle" = "settle"
): CharacterState["position"] {
  let nextPosition = position;
  for (const other of others) {
    if (other.id === character.id) {
      continue;
    }

    const minDistance = personalSpaceDistance(character, other, mode);
    const dx = nextPosition.x - other.position.x;
    const dy = nextPosition.y - other.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance >= minDistance) {
      continue;
    }

    const angle = distance < 0.001 ? (hashSeed(`${character.id}-${other.id}`) % 360) * (Math.PI / 180) : Math.atan2(dy, dx);
    const push = (minDistance - distance) * (mode === "moving" ? 0.32 : 0.72);
    nextPosition = clampPositionToCabin({
      x: nextPosition.x + Math.cos(angle) * push,
      y: nextPosition.y + Math.sin(angle) * push
    });
  }

  return nextPosition;
}

function personalSpaceDistance(
  character: CharacterState,
  other: CharacterState,
  mode: "moving" | "settle"
): number {
  const baseDistance = character.collisionRadius + other.collisionRadius;
  if (mode === "moving") {
    return Math.max(3.8, baseDistance * 0.58);
  }
  return Math.max(5.8, baseDistance * 0.9);
}

function pickCollisionSafeZonePosition(
  zoneName: RoomZoneName,
  seed: string,
  character: CharacterState,
  others: CharacterState[]
): CharacterState["position"] {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidatePosition = pickZonePosition(zoneName, `${seed}-${attempt}`);
    if (others.every((other) => isOutsideCollision(candidatePosition, character, other))) {
      return candidatePosition;
    }
  }

  return separateFromCharacters(pickZonePosition(zoneName, `${seed}-fallback`), character, others, "settle");
}

function isOutsideCollision(
  position: CharacterState["position"],
  character: CharacterState,
  other: CharacterState
): boolean {
  const minDistance = personalSpaceDistance(character, other, "settle");
  return (
    distanceBetween(position, other.position) >= minDistance &&
    distanceBetween(position, other.targetPosition) >= minDistance
  );
}

function facingToward(
  from: CharacterState["position"],
  to: CharacterState["position"],
  fallback: CharacterFacing
): CharacterFacing {
  const dx = to.x - from.x;
  if (Math.abs(dx) < 0.2) {
    return fallback;
  }
  return dx >= 0 ? "right" : "left";
}

function movementStateForAction(action: CharacterAction): CharacterState["movementState"] {
  return action === "idle" || action === "walk" || action === "wander" ? "idle" : "acting";
}

function maxMovingForMode(mode: OwnerMode): number {
  return mode === "focus" || mode === "do_not_disturb" ? 1 : 2;
}

function actionDurationMs(action: CharacterAction, seed: string): number {
  const baseByAction: Record<CharacterAction, number> = {
    idle: 9000,
    walk: 4000,
    study: 15000,
    rest: 14000,
    chat: 11000,
    drink: 8000,
    snack: 8000,
    observe_window: 13000,
    look_weather: 12000,
    wander: 5000,
    greet_owner: 9000,
    talk_to_character: 12000,
    play: 9000,
    nap: 16000,
    think: 13000,
    react_weather: 9000,
    error: 8000
  };
  return baseByAction[action] + (hashSeed(seed) % 5000);
}

function socialDialogueDurationMs(socialEventId: string, characterId: string): number {
  return 8000 + (hashSeed(`${socialEventId}-${characterId}-social`) % 4000);
}

function restartDelayMs(characterId: string, behaviorSlot: number, index: number): number {
  const profile = motionProfile(characterId);
  return profile.startDelayMinMs + (hashSeed(`${characterId}-${behaviorSlot}-${index}-restart`) % (profile.startDelayMaxMs - profile.startDelayMinMs + 1));
}

function arrivalPauseMs(character: CharacterState, behaviorSlot: number, index: number): number {
  const profile = motionProfile(character.id);
  return profile.pauseMinMs + (hashSeed(`${character.id}-${behaviorSlot}-${index}-arrival`) % (profile.pauseMaxMs - profile.pauseMinMs + 1));
}

function deferredMoveDelayMs(character: CharacterState, behaviorSlot: number, index: number): number {
  return restartDelayMs(character.id, behaviorSlot, index) + 1800 + (hashSeed(`${character.id}-${behaviorSlot}-${index}-defer`) % 3600);
}

function movingGraceMs(character: CharacterState, behaviorSlot: number, index: number): number {
  return 9000 + (hashSeed(`${character.id}-${behaviorSlot}-${index}-move-grace`) % 5000);
}

function pickWaypointPosition(character: CharacterState, target: CharacterState["position"], seed: string): CharacterState["position"] | undefined {
  const profile = motionProfile(character.id);
  if (hashSeed(`${seed}-waypoint-roll`) % 100 >= profile.waypointChance) {
    return undefined;
  }

  const midpoint = {
    x: (character.position.x + target.x) / 2,
    y: (character.position.y + target.y) / 2
  };
  const hash = hashSeed(`${seed}-waypoint`);
  const sway = character.id === "nan" ? 4.2 : character.id === "lin" ? 2.1 : 3;
  const offsetX = ((hash % 900) / 100 - 4.5) * (sway / 4);
  const offsetY = (((hash >>> 8) % 700) / 100 - 3.5) * (sway / 4);
  return clampPositionToCabin({
    x: midpoint.x + offsetX,
    y: midpoint.y + offsetY
  });
}

function isImportantBehavior(action: CharacterAction): boolean {
  return (
    action === "observe_window" ||
    action === "look_weather" ||
    action === "rest" ||
    action === "nap" ||
    action === "talk_to_character" ||
    action === "greet_owner" ||
    action === "play" ||
    action === "study"
  );
}

function zoneForAction(action: CharacterAction, weather: WeatherKind, ownerMode: OwnerMode): RoomZoneName {
  switch (action) {
    case "observe_window":
    case "look_weather":
    case "react_weather":
      return "window";
    case "study":
    case "think":
      return "desk";
    case "rest":
    case "nap":
      return "rug";
    case "talk_to_character":
    case "chat":
    case "greet_owner":
      return "social";
    case "play":
    case "wander":
    case "walk":
      return weather === "sunny" ? "plant" : "center";
    case "drink":
    case "snack":
      return "desk";
    case "idle":
      return ownerMode === "do_not_disturb" ? "window" : "center";
    case "error":
      return "center";
  }
}

function zoneForCharacterAction(
  characterId: string,
  action: CharacterAction,
  weather: WeatherKind,
  ownerMode: OwnerMode,
  seed: string
): RoomZoneName {
  const actionZone = zoneForAction(action, weather, ownerMode);
  if (
    action === "observe_window" ||
    action === "look_weather" ||
    action === "react_weather" ||
    action === "talk_to_character" ||
    action === "greet_owner" ||
    action === "chat"
  ) {
    return actionZone;
  }

  const preferences = CHARACTER_ZONE_PREFERENCES[characterId] ?? CHARACTER_ZONE_PREFERENCES.mika;
  const roll = hashSeed(seed) % 100;
  if (roll < 68) {
    return preferences[hashSeed(`${seed}-preferred`) % preferences.length];
  }

  return actionZone;
}

function applyWeatherSyncSucceeded(
  state: WorldState,
  weather: WeatherState,
  geolocation: WeatherPermissionState["geolocation"],
  at: number,
  message?: string
): WorldState {
  const syncedWeather = {
    ...weather,
    updatedAt: at
  };
  const weatherVisual = resolveWeatherVisual({
    weather: syncedWeather.kind,
    at,
    reason: `真实天气同步为${describeWeather(syncedWeather.kind)}，根据当前时间选择插图`
  });

  return {
    ...state,
    weather: syncedWeather,
    weatherPermission: {
      geolocation,
      weather: "ready",
      lastError: undefined
    },
    weatherVisual,
    eventLog: appendLog(
      state.eventLog,
      createLogEntry(
        "weather_sync_succeeded",
        at,
        message ?? `真实天气已同步为${describeWeather(syncedWeather.kind)}。`
      )
    )
  };
}

function applyTick(state: WorldState, now: number): WorldState {
  const behaviorSlot = Math.floor(now / 22000);
  const behaviorUpdates: Array<{ character: CharacterState; action: CharacterAction; changed: boolean }> = [];
  const currentPeriod = resolveDayPeriod(now);
  const isNight = currentPeriod === "evening";
  const normalizedCharacters = state.characters.map(normalizeCharacterForCabin);
  const characters: CharacterState[] = [];
  let movingCapacityUsed = normalizedCharacters.filter((character) => character.movementState === "moving").length;
  const maxMovingCount = maxMovingForMode(state.ownerContext.mode);
  normalizedCharacters.forEach((rawCharacter, index) => {
    const character = normalizeCharacterForCabin(rawCharacter);
    const others = [
      ...characters,
      ...normalizedCharacters.slice(index + 1)
    ];
    const update = updateCharacterForTick(
      character,
      state,
      behaviorSlot,
      index,
      isNight,
      now,
      others,
      character.movementState === "moving" || movingCapacityUsed < maxMovingCount
    );
    if (update.startedMoving) {
      movingCapacityUsed += 1;
    }
    if (update.changed) {
      behaviorUpdates.push({ character, action: update.character.currentAction, changed: true });
    }
    characters.push(update.character);
  });

  const changedUpdates = behaviorUpdates.filter((update) => update.changed);
  const nextWeatherVisual =
    currentPeriod === state.weatherVisual.period
      ? state.weatherVisual
      : resolveWeatherVisual({
          weather: state.weather.kind,
          at: now,
          reason: "时间段变化，切换天气窗口贴图"
        });
  const behaviorLog =
    changedUpdates.length > 0
      ? appendLog(
          state.eventLog,
          createLogEntry(
            "daily_behavior_changed",
            now,
            changedUpdates
              .map((update) => `${update.character.name}：${actionLabel(update.action)}`)
              .join("，")
          )
        )
      : state.eventLog;
  const eventLog =
    nextWeatherVisual === state.weatherVisual
      ? behaviorLog
      : appendLog(
          behaviorLog,
          createLogEntry(
            "weather_visual_time_changed",
            now,
            `时间进入${periodText(nextWeatherVisual.period)}，天气窗口切换为 ${nextWeatherVisual.illustrationId}。`
          )
        );

  return {
    ...state,
    ownerContext: {
      ...state.ownerContext,
      todayFocusMinutes: state.ownerContext.todayFocusMinutes
    },
    weatherVisual: nextWeatherVisual,
    characters,
    eventLog,
    llmBudget: refreshBudget(state.llmBudget, now)
  };
}

function updateCharacterForTick(
  character: CharacterState,
  state: WorldState,
  behaviorSlot: number,
  index: number,
  isNight: boolean,
  now: number,
  others: CharacterState[],
  canStartMoving: boolean
): { character: CharacterState; changed: boolean; startedMoving: boolean } {
  const moveResult = moveTowardTarget(character, now, others);
  if (!moveResult.arrived) {
    return {
      character: {
        ...moveResult.character,
        movementState: "moving"
      },
      changed: false,
      startedMoving: false
    };
  }

  const arrivedCharacter = {
    ...moveResult.character,
    position: moveResult.character.position
  };

  if (character.movementState === "moving") {
    return {
      character: {
        ...arrivedCharacter,
        movementState: "arriving",
        actionUntil: now + arrivalPauseMs(arrivedCharacter, behaviorSlot, index)
      },
      changed: isImportantBehavior(arrivedCharacter.currentAction),
      startedMoving: false
    };
  }

  if (arrivedCharacter.actionUntil > now) {
    return {
      character: {
        ...arrivedCharacter,
        movementState:
          arrivedCharacter.movementState === "arriving" || arrivedCharacter.movementState === "pausing"
            ? arrivedCharacter.movementState
            : movementStateForAction(arrivedCharacter.currentAction)
      },
      changed: false,
      startedMoving: false
    };
  }

  if (arrivedCharacter.actionUntil <= 0) {
    return {
      character: {
        ...arrivedCharacter,
        movementState: "pausing",
        actionUntil: now + restartDelayMs(arrivedCharacter.id, behaviorSlot, index)
      },
      changed: false,
      startedMoving: false
    };
  }

  const intent = chooseDailyBehaviorIntent(arrivedCharacter, state, behaviorSlot, index, isNight);
  const zoneName = zoneForCharacterAction(
    arrivedCharacter.id,
    intent.action,
    state.weather.kind,
    state.ownerContext.mode,
    `${arrivedCharacter.id}-${behaviorSlot}-${index}-zone`
  );
  const targetPosition = pickCollisionSafeZonePosition(
    zoneName,
    `${arrivedCharacter.id}-${behaviorSlot}-${index}-${intent.action}`,
    arrivedCharacter,
    others
  );
  const distance = distanceBetween(arrivedCharacter.position, targetPosition);
  const shouldMove = distance > arrivalDistance();
  if (shouldMove && !canStartMoving) {
    return {
      character: {
        ...arrivedCharacter,
        movementState: "pausing",
        actionUntil: now + deferredMoveDelayMs(arrivedCharacter, behaviorSlot, index),
        lastDialogue: intent.dialogue ?? arrivedCharacter.lastDialogue
      },
      changed: false,
      startedMoving: false
    };
  }

  const changed =
    arrivedCharacter.currentAction !== intent.action ||
    arrivedCharacter.actionReason !== intent.reason ||
    distance > 8;

  return {
    character: {
      ...arrivedCharacter,
      energy: nextEnergyForTick(arrivedCharacter, state.ownerContext.mode, intent.action),
      targetPosition,
      waypointPosition: shouldMove
        ? pickWaypointPosition(arrivedCharacter, targetPosition, `${arrivedCharacter.id}-${behaviorSlot}-${index}-${intent.action}`)
        : undefined,
      facing: facingToward(arrivedCharacter.position, targetPosition, arrivedCharacter.facing),
      currentAction: intent.action,
      actionReason: intent.reason,
      lastDialogue: intent.dialogue ?? arrivedCharacter.lastDialogue,
      movementState: shouldMove ? "moving" : movementStateForAction(intent.action),
      actionUntil: shouldMove
        ? now + movingGraceMs(arrivedCharacter, behaviorSlot, index)
        : now + actionDurationMs(intent.action, `${arrivedCharacter.id}-${behaviorSlot}-${index}`)
    },
    changed: changed && isImportantBehavior(intent.action),
    startedMoving: shouldMove
  };
}

function chooseDailyBehaviorIntent(
  character: CharacterState,
  state: WorldState,
  behaviorSlot: number,
  index: number,
  isNight: boolean
): BehaviorIntent {
  const candidates: BehaviorCandidate[] = [];

  if (character.energy <= 24) {
    candidates.push(
      candidate("rest", 8, "能量较低，进入休息", "mvu", "我先慢慢恢复一下。"),
      candidate("nap", 5, "能量较低，适合小睡一会儿", "mvu", "我想安静眯一会儿。")
    );
  } else {
    candidates.push(...ownerModeCandidates(state.ownerContext.mode));
    candidates.push(...weatherCandidates(state.weather.kind));

    if (isNight) {
      candidates.push(
        candidate("nap", 4, "夜间，角色自然进入小睡", "mvu", "夜里适合安静休息。"),
        candidate("rest", 3, "夜间，角色把节奏放慢", "mvu", "我把动作放轻一点。")
      );
    }

    if (character.energy >= 82) {
      candidates.push(
        candidate("wander", 4, "能量充足，轻松走动一下", "mvu", "我在舱里走一小圈。"),
        candidate("play", 3, "能量充足，做一点轻快活动", "mvu", "活动一下也不错。")
      );
    }
  }

  if (state.pendingSocialEvent?.involvedCharacterIds.includes(character.id)) {
    candidates.push(
      candidate("talk_to_character", 6, "附近有同伴，进行轻松交流", "mvu", "我去和同伴轻声聊两句。")
    );
  }

  candidates.push(candidate(character.currentAction, 3, character.actionReason ?? "延续当前节奏", "mvu", character.lastDialogue));

  const picked = pickWeightedCandidate(candidates, `${character.id}-${behaviorSlot}-${index}`);
  return createBehaviorIntent({
    characterId: character.id,
    action: picked.action,
    dialogue: picked.dialogue,
    reason: picked.reason,
    source: picked.source
  });
}

type BehaviorCandidate = {
  action: CharacterAction;
  weight: number;
  reason: string;
  source: BehaviorIntent["source"];
  dialogue: string;
};

function candidate(
  action: CharacterAction,
  weight: number,
  reason: string,
  source: BehaviorIntent["source"],
  dialogue: string
): BehaviorCandidate {
  return { action, weight, reason, source, dialogue };
}

function ownerModeCandidates(mode: OwnerMode): BehaviorCandidate[] {
  switch (mode) {
    case "focus":
      return [
        candidate("study", 6, "主人处于专注模式，安静陪伴学习", "owner", "我在旁边安静整理思路。"),
        candidate("think", 4, "主人处于专注模式，角色也进入思考", "owner", "我把小想法排排队。"),
        candidate("observe_window", 3, "主人处于专注模式，角色安静看向窗边", "owner", "我看看窗边，不打扰你。")
      ];
    case "rest":
      return [
        candidate("rest", 4, "主人切换到休息模式", "owner", "我们把节奏放慢一点。"),
        candidate("play", 4, "休息模式下做一点轻快活动", "owner", "我轻轻活动一下。"),
        candidate("chat", 3, "休息模式下可以轻松说话", "owner", "我在这边，轻轻聊也可以。"),
        candidate("greet_owner", 3, "休息模式下温和打招呼", "owner", "我过来打个招呼。"),
        candidate("wander", 2, "休息模式下轻松走动", "owner", "我慢慢走走。")
      ];
    case "chat":
      return [
        candidate("greet_owner", 5, "聊天模式下主动打招呼", "owner", "我在这里，刚好可以聊聊。"),
        candidate("chat", 5, "主人处于聊天模式", "owner", "我想听听你今天的小事。"),
        candidate("talk_to_character", 2, "聊天模式下和同伴轻松交流", "owner", "我也去问问大家的近况。")
      ];
    case "do_not_disturb":
      return [
        candidate("idle", 5, "勿扰模式下保持安静", "owner", "我会安静待着。"),
        candidate("rest", 4, "勿扰模式下安静等待", "owner", "我安静待一会儿。"),
        candidate("study", 3, "勿扰模式下自己做点整理", "owner", "我自己整理一点东西。"),
        candidate("observe_window", 4, "勿扰模式下安静观察窗外", "owner", "我看看窗外的光。")
      ];
  }
}

function weatherCandidates(kind: WeatherKind): BehaviorCandidate[] {
  switch (kind) {
    case "sunny":
      return [
        candidate("look_weather", 3, "晴天，角色想看看窗外", "weather", "今天的光很舒服。"),
        candidate("wander", 3, "晴天，角色想去植物附近走走", "weather", "我去植物那边看看。"),
        candidate("play", 3, "晴天带来轻快心情", "weather", "感觉可以轻轻活动一下。")
      ];
    case "rainy":
      return [
        candidate("observe_window", 4, "雨天，角色安静看向窗外", "weather", "雨声让舱里更安静。"),
        candidate("rest", 3, "雨天适合放慢节奏", "weather", "下雨天，慢一点刚好。")
      ];
    case "cloudy":
      return [
        candidate("study", 2, "阴天适合安静整理", "weather", "我慢慢整理一下。"),
        candidate("think", 3, "阴天适合温和思考", "weather", "我慢慢想一会儿。"),
        candidate("idle", 2, "阴天节奏平稳，安静待着", "weather", "阴天也有阴天的节奏。")
      ];
    case "hot":
      return [
        candidate("rest", 3, "天气偏热，角色放慢节奏", "weather", "有点热，我先慢下来。"),
        candidate("drink", 2, "天气偏热，角色想补充水分", "weather", "我喝点水。")
      ];
    case "cold":
      return [
        candidate("nap", 3, "天气转冷，角色想待得暖和一点", "weather", "我想窝一会儿。"),
        candidate("react_weather", 2, "天气转冷，角色留意气温变化", "weather", "降温了，舱里要暖一点。")
      ];
  }
}

function pickWeightedCandidate(candidates: BehaviorCandidate[], seed: string): BehaviorCandidate {
  const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
  const roll = hashSeed(seed) % totalWeight;
  let cursor = 0;

  for (const item of candidates) {
    cursor += item.weight;
    if (roll < cursor) {
      return item;
    }
  }

  return candidates[0];
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextEnergyForTick(character: CharacterState, mode: OwnerMode, action: CharacterAction): number {
  const modeDelta = mode === "focus" ? -1 : mode === "rest" ? 2 : 1;
  const actionDelta = action === "play" || action === "wander" || action === "walk" ? -2 : action === "rest" || action === "nap" ? 3 : 0;
  return clamp(character.energy + modeDelta + actionDelta, 0, 100);
}

function applyBehaviorIntent(character: CharacterState, intent: BehaviorIntent): CharacterState {
  return {
    ...character,
    currentAction: intent.action,
    actionReason: intent.reason,
    actionUntil: 0,
    movementState: "idle",
    lastDialogue: intent.dialogue ?? character.lastDialogue
  };
}

function appendLog(log: WorldLogEntry[], entry: WorldLogEntry): WorldLogEntry[] {
  return [entry, ...log].slice(0, maxLogEntries);
}

function createLogEntry(type: string, at: number, text: string): WorldLogEntry {
  return {
    id: `${type}-${at}-${text.length}`,
    type,
    at,
    text
  };
}

function appendMemory(
  memories: WorldState["memories"],
  at: number,
  scope: "global" | "character" | "relationship" | "owner",
  summary: string,
  importance = 2,
  targetId?: string
): WorldState["memories"] {
  return [
    {
      id: `memory-${at}-${memories.length}`,
      at,
      scope,
      targetId,
      summary,
      importance
    },
    ...memories
  ].slice(0, 20);
}

function createInitialChatMemories(ids: string[]): WorldState["chatMemories"] {
  return Object.fromEntries(ids.map((id) => [id, createEmptyChatMemory(id)]));
}

function createEmptyChatMemory(characterId: string): CharacterChatMemory {
  return {
    characterId,
    recentMessages: [],
    smallSummary: "",
    largeSummary: "",
    smallSummaryCount: 0,
    memoryCandidates: []
  };
}

function appendChatMessage(memories: WorldState["chatMemories"], message: ChatMessage): WorldState["chatMemories"] {
  return updateChatMemory(memories, message.characterId, (memory) => ({
    ...memory,
    recentMessages: [...memory.recentMessages, message].slice(-8)
  }));
}

function updateChatMemory(
  memories: WorldState["chatMemories"],
  characterId: string,
  updater: (memory: CharacterChatMemory) => CharacterChatMemory
): WorldState["chatMemories"] {
  const current = memories[characterId] ?? createEmptyChatMemory(characterId);
  return {
    ...memories,
    [characterId]: updater(current)
  };
}

function mergeMemoryCandidate(
  memories: WorldState["chatMemories"],
  characterId: string,
  memoryCandidate: { importance: number; summary: string } | undefined,
  at: number
): WorldState["chatMemories"] {
  if (!memoryCandidate || memoryCandidate.importance < 2 || !memoryCandidate.summary.trim()) {
    return memories;
  }

  return updateChatMemory(memories, characterId, (memory) => ({
    ...memory,
    memoryCandidates: [
      {
        importance: memoryCandidate.importance,
        summary: sanitizeSummary(memoryCandidate.summary),
        at
      },
      ...(memory.memoryCandidates ?? [])
    ].slice(0, 6)
  }));
}

function sanitizeSummary(summary: string): string {
  return summary.replace(/\s+/g, " ").trim().slice(0, 500);
}

function createPendingSocialEvent(
  state: WorldState,
  a: string,
  b: string,
  at: number
): PendingSocialEvent {
  const aName = findCharacterName(state.characters, a);
  const bName = findCharacterName(state.characters, b);
  return {
    id: `pending-${at}-${a}-${b}`,
    kind: "pair_chat",
    involvedCharacterIds: [a, b],
    seedText: `${aName} 靠近了 ${bName}，可能会开始一段轻松对话。`,
    createdAt: at
  };
}

function applyOwnerMode(character: CharacterState, mode: OwnerMode): CharacterState {
  const actionByMode: Record<OwnerMode, CharacterState["currentAction"]> = {
    focus: "study",
    rest: "rest",
    chat: "chat",
    do_not_disturb: "idle"
  };

  const dialogueByMode: Record<OwnerMode, string> = {
    focus: `${character.name}进入安静陪伴状态。`,
    rest: `${character.name}把节奏放慢了一点。`,
    chat: `${character.name}准备好聊两句。`,
    do_not_disturb: `${character.name}安静地继续自己的小日常。`
  };

  return {
    ...character,
    currentAction: actionByMode[mode],
    actionReason: `主人切换到${ownerModeText(mode)}模式`,
    actionUntil: 0,
    movementState: "idle",
    lastDialogue: dialogueByMode[mode]
  };
}

function applyCare(character: CharacterState, careType: "coffee" | "snack" | "pet"): CharacterState {
  const deltaByCare: Record<typeof careType, number> = {
    coffee: 10,
    snack: 6,
    pet: 4
  };

  const dialogueByCare: Record<typeof careType, string> = {
    coffee: "谢谢，今天的节奏刚刚好。",
    snack: "这个小点心很合时宜。",
    pet: "嗯，这样就很安心。"
  };

  return {
    ...character,
    energy: clamp(character.energy + deltaByCare[careType], 0, 100),
    mood: character.mood === "focused" ? "calm" : character.mood,
    currentAction: careType === "snack" ? "snack" : careType === "coffee" ? "drink" : "greet_owner",
    actionReason: `主人给了${careLabel(careType)}`,
    actionUntil: 0,
    movementState: "idle",
    lastDialogue: dialogueByCare[careType]
  };
}

function applyTask(character: CharacterState, task: "study" | "rest" | "chat"): CharacterState {
  const actionByTask: Record<typeof task, CharacterState["currentAction"]> = {
    study: "study",
    rest: "rest",
    chat: "chat"
  };

  return {
    ...character,
    currentAction: actionByTask[task],
    actionReason: `主人分配了${taskLabel(task)}任务`,
    actionUntil: 0,
    movementState: "idle",
    lastDialogue: `收到，我先去${taskLabel(task)}。`
  };
}

function applyWeather(character: CharacterState, kind: WeatherKind): CharacterState {
  const moodByWeather: Record<WeatherKind, CharacterState["mood"]> = {
    sunny: "bright",
    rainy: "cozy",
    cloudy: "calm",
    hot: "focused",
    cold: "cozy"
  };

  const dialogueByWeather: Record<WeatherKind, string> = {
    sunny: "今天看起来很适合晒一会儿太阳。",
    rainy: "下雨天，房间里刚好安静一点。",
    cloudy: "阴天也有阴天的节奏。",
    hot: "有点热，先把节奏放慢。",
    cold: "降温了，想找个舒服的位置待着。"
  };

  return {
    ...character,
    mood: moodByWeather[kind],
    currentAction: weatherAction(kind),
    actionReason: `天气更新为${describeWeather(kind)}`,
    actionUntil: 0,
    movementState: "idle",
    lastDialogue: dialogueByWeather[kind]
  };
}

function refreshBudget(budget: WorldState["llmBudget"], now: number): WorldState["llmBudget"] {
  const oneHour = 60 * 60 * 1000;
  if (now - budget.hourStartedAt >= oneHour) {
    return {
      ...budget,
      callsUsedThisHour: 0,
      manualCallsUsedThisHour: 0,
      ambientCallsUsedThisHour: 0,
      summaryCallsUsedThisHour: 0,
      hourStartedAt: now
    };
  }
  return budget;
}

function incrementBudget(
  budget: WorldState["llmBudget"],
  callKind: LlmCallKind | undefined,
  at: number
): WorldState["llmBudget"] {
  const nextCallsUsed = Math.min(budget.callsUsedThisHour + 1, budget.maxCallsPerHour);
  const isManual = callKind === "manual_chat";
  const isAmbient = callKind === "ambient_dialogue";
  const isSummary = callKind === "small_summary" || callKind === "large_summary" || callKind === "daily_summary";

  return {
    ...budget,
    callsUsedThisHour: nextCallsUsed,
    lastCallAt: at,
    manualCallsUsedThisHour: isManual ? (budget.manualCallsUsedThisHour ?? 0) + 1 : budget.manualCallsUsedThisHour,
    ambientCallsUsedThisHour: isAmbient ? (budget.ambientCallsUsedThisHour ?? 0) + 1 : budget.ambientCallsUsedThisHour,
    summaryCallsUsedThisHour: isSummary ? (budget.summaryCallsUsedThisHour ?? 0) + 1 : budget.summaryCallsUsedThisHour,
    dailySummaryCreatedAt: callKind === "daily_summary" ? at : budget.dailySummaryCreatedAt
  };
}

function createRelationships(ids: string[]): WorldState["relationships"] {
  return Object.fromEntries(
    ids.map((sourceId) => [
      sourceId,
      Object.fromEntries(
        ids.map((targetId) => [
          targetId,
          {
            closeness: sourceId === targetId ? 100 : 50,
            familiarity: sourceId === targetId ? 100 : 40
          } satisfies RelationshipState
        ])
      )
    ])
  );
}

function updateRelationshipProximity(
  relationships: WorldState["relationships"],
  a: string,
  b: string
): WorldState["relationships"] {
  const next = cloneRelationships(relationships);
  for (const [from, to] of [
    [a, b],
    [b, a]
  ] as const) {
    next[from][to] = {
      closeness: clamp(next[from][to].closeness + 2, 0, 100),
      familiarity: clamp(next[from][to].familiarity + 3, 0, 100)
    };
  }
  return next;
}

function cloneRelationships(
  relationships: WorldState["relationships"]
): WorldState["relationships"] {
  return Object.fromEntries(
    Object.entries(relationships).map(([sourceId, targets]) => [
      sourceId,
      Object.fromEntries(
        Object.entries(targets).map(([targetId, value]) => [
          targetId,
          {
            closeness: value.closeness,
            familiarity: value.familiarity
          }
        ])
      )
    ])
  );
}

function findCharacterName(characters: CharacterState[], id: string): string {
  return characters.find((character) => character.id === id)?.name ?? id;
}

function describeUIMode(mode: WorldState["uiMode"]): string {
  switch (mode) {
    case "mini":
      return "观察窗";
    case "full":
      return "生态舱";
    case "sleep":
      return "休眠舱";
  }
}

function describeWeather(kind: WeatherKind): string {
  switch (kind) {
    case "sunny":
      return "晴天";
    case "rainy":
      return "雨天";
    case "cloudy":
      return "阴天";
    case "hot":
      return "高温";
    case "cold":
      return "降温";
  }
}

function weatherAction(kind: WeatherKind): CharacterAction {
  switch (kind) {
    case "sunny":
      return "look_weather";
    case "rainy":
      return "observe_window";
    case "cloudy":
      return "think";
    case "hot":
      return "drink";
    case "cold":
      return "react_weather";
  }
}

function careLabel(careType: "coffee" | "snack" | "pet"): string {
  switch (careType) {
    case "coffee":
      return "咖啡";
    case "snack":
      return "零食";
    case "pet":
      return "摸摸";
  }
}

function taskLabel(task: "study" | "rest" | "chat"): string {
  switch (task) {
    case "study":
      return "学习";
    case "rest":
      return "休息";
    case "chat":
      return "聊天";
  }
}

function ownerModeText(mode: OwnerMode): string {
  switch (mode) {
    case "focus":
      return "专注";
    case "rest":
      return "休息";
    case "chat":
      return "陪聊";
    case "do_not_disturb":
      return "勿扰";
  }
}

function periodText(period: WorldState["weatherVisual"]["period"]): string {
  switch (period) {
    case "morning":
      return "早晨";
    case "noon":
      return "中午";
    case "evening":
      return "夜晚";
  }
}

function actionLabel(action: CharacterAction): string {
  switch (action) {
    case "idle":
      return "待机";
    case "walk":
      return "散步";
    case "study":
      return "学习";
    case "rest":
      return "休息";
    case "chat":
      return "聊天";
    case "drink":
      return "喝水";
    case "snack":
      return "吃点心";
    case "observe_window":
      return "看窗外";
    case "look_weather":
      return "看天气";
    case "wander":
      return "闲逛";
    case "greet_owner":
      return "打招呼";
    case "talk_to_character":
      return "和同伴说话";
    case "play":
      return "玩耍";
    case "nap":
      return "小睡";
    case "think":
      return "思考";
    case "react_weather":
      return "回应天气";
    case "error":
      return "异常";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
