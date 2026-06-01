import type {
  CharacterAction,
  CharacterMood,
  CharacterState,
  WorldState
} from "../types";

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

export type DailySummaryResult = {
  summary: string;
  ownerSummary: string;
  characterHighlights: Array<{
    characterId: string;
    summary: string;
  }>;
  memoryCandidate: string;
};

export type ChatPromptBundle = {
  system: string;
  user: string;
};
