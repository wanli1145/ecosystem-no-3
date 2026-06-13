import type { CharacterAction, CharacterChatMemory, CharacterMood, CharacterState, WorldState } from "../types";

export type LlmDialogueRequest = {
  characterId: string;
  target: "owner" | "character" | "room";
  targetCharacterId?: string;
  ownerInput?: string;
  worldSummary: string;
  chatMemory?: CharacterChatMemory;
};

export type LlmDialogueResponse = {
  characterId: string;
  text: string;
  emotion: "calm" | "happy" | "curious" | "focused" | "sleepy" | "excited" | "cozy";
  actionSuggestion:
    | "idle"
    | "chat"
    | "greet_owner"
    | "talk_to_character"
    | "observe_window"
    | "look_weather"
    | "think"
    | "rest"
    | "play";
  reason: string;
  memoryCandidate?: {
    importance: number;
    summary: string;
  };
};

export type LlmSocialDialogueRequest = {
  socialEventId: string;
  speakerId: string;
  targetId: string;
  worldSummary: string;
  socialSeed?: string;
};

export type LlmSocialDialogueResponse = {
  socialEventId: string;
  speakerId: string;
  targetId: string;
  text: string;
  emotion: "calm" | "happy" | "curious" | "focused" | "sleepy" | "excited" | "cozy";
  actionSuggestion: CharacterAction;
  reason: string;
  memoryCandidate?: {
    importance: number;
    summary: string;
  };
};

export type LlmDailySummaryResponse = {
  summary: string;
  ownerSummary: string;
  characterHighlights: Array<{
    characterId: string;
    summary: string;
  }>;
  memoryCandidate: string;
};

export type LlmChatSummaryRequest = {
  characterId: string;
  memory: CharacterChatMemory;
};

export type LlmChatSummaryResponse = {
  characterId: string;
  summary: string;
};

export type LlmRuntimeConfigInput = {
  baseUrl: string;
  apiKey: string;
  model?: string;
};

export type LlmRuntimeConfigStatus = {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  source: "runtime" | "env" | "default";
};

export type LlmModelListResponse = {
  models: string[];
  selectedModel: string;
  source: "api" | "mock" | "error";
  error?: string;
};

export type LlmConnectionTestResponse = {
  ok: boolean;
  model: string;
  status?: number;
  message: string;
};

export type ChatPromptBundle = {
  system: string;
  user: string;
};

export type CharacterCard = {
  id: string;
  name: string;
  personalityTags: string[];
  speakingStyle: string;
  likes: string[];
  dislikes: string[];
  defaultTone: CharacterMood;
  defaultAction?: CharacterAction;
};

export type DialogueContext = {
  character: CharacterState & { card?: CharacterCard };
  world: WorldState;
  ownerAction?: string;
  pendingSocialEventSeed?: string | null;
};

export type SocialDialogueContext = {
  primaryCharacter: CharacterState & { card?: CharacterCard };
  secondaryCharacter: CharacterState & { card?: CharacterCard };
  world: WorldState;
  socialSeed: string;
};

export type DialogueResult = {
  speakerId: string;
  text: string;
  emotion: CharacterMood;
  suggestedAction: CharacterAction;
  memoryCandidate: string;
};

export type SocialDialogueResult = {
  speakerAId: string;
  speakerBId: string;
  turns: Array<{
    speakerId: string;
    text: string;
  }>;
  sceneSummary: string;
  memoryCandidate: string;
};

export type IntentCharacter = CharacterState & { card?: CharacterCard };

export type IntentResult = {
  characterId: string;
  intent: string;
  targetId: string | null;
  action: CharacterAction;
  reason: string;
  memoryCandidate: string;
};

export type DailySummaryResult = LlmDailySummaryResponse;
