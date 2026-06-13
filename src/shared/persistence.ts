import type {
  CharacterAction,
  CharacterChatMemory,
  CharacterMood,
  ChatMessage,
  MemoryEntry,
  OwnerContext,
  Position,
  RelationshipState,
  WeatherState,
  WorldState
} from "./types";
import { clampPositionToCabin } from "./config/room";

export const persistedWorldStateVersion = 1;

export type PersistedWorldState = {
  version: number;
  savedAt: number;
  ownerContext?: OwnerContext;
  weather?: WeatherState;
  characters?: Array<{
    id: string;
    mood: CharacterMood;
    energy: number;
    position: Position;
    targetPosition: Position;
    currentAction: CharacterAction;
    lastDialogue: string;
  }>;
  relationships?: Record<string, Record<string, RelationshipState>>;
  memories?: MemoryEntry[];
  chatMemories?: Record<string, Pick<
    CharacterChatMemory,
    | "characterId"
    | "smallSummary"
    | "largeSummary"
    | "smallSummaryUpdatedAt"
    | "largeSummaryUpdatedAt"
    | "smallSummaryCount"
    | "recentMessages"
    | "memoryCandidates"
  >>;
  llmBudget?: {
    dailySummaryCreatedAt?: number;
  };
  lastDailySummaryDate?: string;
};

export function createPersistedWorldState(world: WorldState, savedAt = Date.now()): PersistedWorldState {
  return {
    version: persistedWorldStateVersion,
    savedAt,
    ownerContext: {
      ...world.ownerContext
    },
    weather: {
      ...world.weather
    },
    characters: world.characters.map((character) => ({
      id: character.id,
      mood: character.mood,
      energy: clampNumber(character.energy, 0, 100, 70),
      position: sanitizePosition(character.position, character.position),
      targetPosition: sanitizePosition(character.targetPosition, character.position),
      currentAction: character.currentAction,
      lastDialogue: truncateText(character.lastDialogue, 120)
    })),
    relationships: cloneRelationships(world.relationships),
    memories: world.memories
      .filter((memory) => memory.importance >= 2 || memory.scope === "global")
      .slice(0, 20)
      .map((memory) => ({
        ...memory,
        summary: truncateText(memory.summary, 500)
      })),
    chatMemories: Object.fromEntries(
      Object.entries(world.chatMemories).map(([characterId, memory]) => [
        characterId,
        {
          characterId: memory.characterId,
          smallSummary: truncateText(memory.smallSummary, 500),
          largeSummary: truncateText(memory.largeSummary, 500),
          smallSummaryUpdatedAt: memory.smallSummaryUpdatedAt,
          largeSummaryUpdatedAt: memory.largeSummaryUpdatedAt,
          smallSummaryCount: memory.smallSummaryCount,
          recentMessages: memory.recentMessages.slice(-8).map(sanitizeChatMessage),
          memoryCandidates: (memory.memoryCandidates ?? []).slice(0, 6).map((candidate) => ({
            importance: clampNumber(candidate.importance, 0, 5, 1),
            summary: truncateText(candidate.summary, 500),
            at: candidate.at
          }))
        }
      ])
    ),
    llmBudget: {
      dailySummaryCreatedAt: world.llmBudget.dailySummaryCreatedAt
    },
    lastDailySummaryDate: world.llmBudget.dailySummaryCreatedAt
      ? dateKey(world.llmBudget.dailySummaryCreatedAt)
      : undefined
  };
}

export function restorePersistedWorldState(state: WorldState, persisted: PersistedWorldState): WorldState {
  if (!isCompatiblePersistedWorldState(persisted)) {
    return state;
  }

  const persistedCharacters = new Map((persisted.characters ?? []).map((character) => [character.id, character]));
  const characters = state.characters.map((character) => {
    const saved = persistedCharacters.get(character.id);
    if (!saved) {
      return character;
    }

    return {
      ...character,
      mood: saved.mood ?? character.mood,
      energy: clampNumber(saved.energy, 0, 100, character.energy),
      position: sanitizePosition(saved.position, character.position),
      targetPosition: sanitizePosition(saved.targetPosition, character.targetPosition),
      currentAction: saved.currentAction ?? character.currentAction,
      lastDialogue: truncateText(saved.lastDialogue ?? character.lastDialogue, 120),
      actionUntil: 0,
      movementState: "idle" as const
    };
  });

  return {
    ...state,
    ownerContext: persisted.ownerContext
      ? {
          ...state.ownerContext,
          ...persisted.ownerContext
        }
      : state.ownerContext,
    weather: persisted.weather
      ? {
          ...state.weather,
          ...persisted.weather
        }
      : state.weather,
    characters,
    relationships: mergeRelationships(state.relationships, persisted.relationships),
    memories: mergeMemories(persisted.memories, state.memories),
    chatMemories: mergeChatMemories(state.chatMemories, persisted.chatMemories),
    llmBudget: {
      ...state.llmBudget,
      dailySummaryCreatedAt: persisted.llmBudget?.dailySummaryCreatedAt ?? state.llmBudget.dailySummaryCreatedAt
    },
    pendingSocialEvent: null
  };
}

export function isCompatiblePersistedWorldState(value: unknown): value is PersistedWorldState {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    (value as { version?: unknown }).version === persistedWorldStateVersion
  );
}

function mergeMemories(saved: MemoryEntry[] | undefined, fallback: MemoryEntry[]): MemoryEntry[] {
  if (!Array.isArray(saved)) {
    return fallback;
  }

  return saved
    .filter((memory) => typeof memory.id === "string" && typeof memory.summary === "string")
    .slice(0, 20)
    .map((memory) => ({
      ...memory,
      summary: truncateText(memory.summary, 500),
      importance: clampNumber(memory.importance, 0, 5, 1)
    }));
}

function mergeChatMemories(
  fallback: WorldState["chatMemories"],
  saved: PersistedWorldState["chatMemories"]
): WorldState["chatMemories"] {
  if (!saved) {
    return fallback;
  }

  return Object.fromEntries(
    Object.entries(fallback).map(([characterId, memory]) => {
      const savedMemory = saved[characterId];
      if (!savedMemory) {
        return [characterId, memory];
      }

      return [
        characterId,
        {
          ...memory,
          smallSummary: truncateText(savedMemory.smallSummary ?? "", 500),
          largeSummary: truncateText(savedMemory.largeSummary ?? "", 500),
          smallSummaryUpdatedAt: savedMemory.smallSummaryUpdatedAt,
          largeSummaryUpdatedAt: savedMemory.largeSummaryUpdatedAt,
          smallSummaryCount: savedMemory.smallSummaryCount ?? 0,
          recentMessages: (savedMemory.recentMessages ?? []).slice(-8).map(sanitizeChatMessage),
          memoryCandidates: (savedMemory.memoryCandidates ?? []).slice(0, 6).map((candidate) => ({
            importance: clampNumber(candidate.importance, 0, 5, 1),
            summary: truncateText(candidate.summary, 500),
            at: candidate.at
          }))
        }
      ];
    })
  );
}

function mergeRelationships(
  fallback: WorldState["relationships"],
  saved: PersistedWorldState["relationships"]
): WorldState["relationships"] {
  if (!saved) {
    return fallback;
  }

  return Object.fromEntries(
    Object.entries(fallback).map(([sourceId, targets]) => [
      sourceId,
      Object.fromEntries(
        Object.entries(targets).map(([targetId, relationship]) => {
          const savedRelationship = saved[sourceId]?.[targetId];
          return [
            targetId,
            savedRelationship
              ? {
                  closeness: clampNumber(savedRelationship.closeness, 0, 100, relationship.closeness),
                  familiarity: clampNumber(savedRelationship.familiarity, 0, 100, relationship.familiarity)
                }
              : relationship
          ];
        })
      )
    ])
  );
}

function cloneRelationships(
  relationships: WorldState["relationships"]
): WorldState["relationships"] {
  return Object.fromEntries(
    Object.entries(relationships).map(([sourceId, targets]) => [
      sourceId,
      Object.fromEntries(
        Object.entries(targets).map(([targetId, relationship]) => [
          targetId,
          {
            closeness: clampNumber(relationship.closeness, 0, 100, 50),
            familiarity: clampNumber(relationship.familiarity, 0, 100, 40)
          }
        ])
      )
    ])
  );
}

function sanitizeChatMessage(message: ChatMessage): ChatMessage {
  return {
    id: message.id,
    characterId: message.characterId,
    role: message.role,
    text: truncateText(message.text, 500),
    at: message.at
  };
}

function isPosition(value: unknown): value is Position {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isFinite((value as Position).x) &&
    Number.isFinite((value as Position).y)
  );
}

function sanitizePosition(value: unknown, fallback: Position): Position {
  return clampPositionToCabin(isPosition(value) ? value : fallback);
}

function truncateText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function dateKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
