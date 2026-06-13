export type UIMode = "mini" | "full" | "sleep";

export type OwnerMode = "focus" | "rest" | "chat" | "do_not_disturb";

export type OwnerPresence = "active" | "away" | "returned";

export type WeatherKind = "sunny" | "rainy" | "cloudy" | "hot" | "cold";

export type WeatherVisualKind = "sunny" | "rainy" | "cloudy";

export type DayPeriod = "morning" | "noon" | "evening";

export type CharacterMood = "calm" | "bright" | "cozy" | "focused";

export type CharacterAction =
  | "idle"
  | "walk"
  | "study"
  | "rest"
  | "chat"
  | "drink"
  | "snack"
  | "observe_window"
  | "look_weather"
  | "wander"
  | "greet_owner"
  | "talk_to_character"
  | "play"
  | "nap"
  | "think"
  | "react_weather"
  | "error";

export type CharacterAnimationState =
  | "idle"
  | "running-right"
  | "running-left"
  | "waving"
  | "jumping"
  | "failed"
  | "waiting"
  | "running"
  | "review";

export type BehaviorIntent = {
  characterId: string;
  action: CharacterAction;
  animationState: CharacterAnimationState;
  dialogue?: string;
  reason: string;
  source: "mvu" | "llm" | "weather" | "owner";
};

export type Position = {
  x: number;
  y: number;
};

export type CharacterFacing = "left" | "right";

export type CharacterMovementState = "idle" | "moving" | "acting" | "pausing" | "turning" | "arriving";

export type OwnerContext = {
  presence: OwnerPresence;
  mode: OwnerMode;
  lastInteractionAt: number;
  todayFocusMinutes: number;
};

export type WeatherState = {
  kind: WeatherKind;
  temperature: number;
  city: string;
  updatedAt: number;
};

export type WeatherPermissionState = {
  geolocation: "unknown" | "requested" | "granted" | "denied";
  weather: "idle" | "loading" | "ready" | "error";
  lastError?: string;
};

export type WeatherVisualState = {
  weather: WeatherVisualKind;
  period: DayPeriod;
  illustrationId: string;
  assetPath: string;
  reason: string;
  updatedAt: number;
  applyToRoom: boolean;
};

export type CharacterState = {
  id: string;
  name: string;
  color: string;
  mood: CharacterMood;
  energy: number;
  position: Position;
  targetPosition: Position;
  waypointPosition?: Position;
  collisionRadius: number;
  facing: CharacterFacing;
  actionUntil: number;
  movementState: CharacterMovementState;
  currentAction: CharacterAction;
  actionReason?: string;
  lastDialogue: string;
};

export type RelationshipState = {
  closeness: number;
  familiarity: number;
};

export type WorldLogEntry = {
  id: string;
  at: number;
  type: string;
  text: string;
};

export type MemoryEntry = {
  id: string;
  at: number;
  scope: "global" | "character" | "relationship" | "owner";
  targetId?: string;
  summary: string;
  importance: number;
};

export type PendingSocialEvent = {
  id: string;
  kind: "pair_chat" | "greeting" | "shared_activity";
  involvedCharacterIds: string[];
  seedText: string;
  createdAt: number;
};

export type ChatMessage = {
  id: string;
  characterId: string;
  role: "owner" | "character";
  text: string;
  at: number;
};

export type CharacterChatMemory = {
  characterId: string;
  recentMessages: ChatMessage[];
  smallSummary: string;
  largeSummary: string;
  smallSummaryUpdatedAt?: number;
  largeSummaryUpdatedAt?: number;
  smallSummaryCount?: number;
  memoryCandidates?: Array<{
    importance: number;
    summary: string;
    at: number;
  }>;
};

export type LLMBudgetState = {
  mode: "quiet" | "normal" | "active";
  maxCallsPerHour: number;
  callsUsedThisHour: number;
  hourStartedAt: number;
  lastCallAt?: number;
  ambientCooldownMs?: number;
  manualCallsUsedThisHour?: number;
  ambientCallsUsedThisHour?: number;
  summaryCallsUsedThisHour?: number;
  dailySummaryCreatedAt?: number;
};

export type WorldState = {
  uiMode: UIMode;
  ownerContext: OwnerContext;
  weather: WeatherState;
  weatherPermission: WeatherPermissionState;
  weatherVisual: WeatherVisualState;
  characters: CharacterState[];
  relationships: Record<string, Record<string, RelationshipState>>;
  eventLog: WorldLogEntry[];
  memories: MemoryEntry[];
  chatMemories: Record<string, CharacterChatMemory>;
  llmBudget: LLMBudgetState;
  pendingSocialEvent: PendingSocialEvent | null;
};

export const ownerModeLabels: Record<OwnerMode, string> = {
  focus: "专注",
  rest: "休息",
  chat: "陪聊",
  do_not_disturb: "勿扰"
};

export const uiModeLabels: Record<UIMode, string> = {
  mini: "观察窗",
  full: "生态舱",
  sleep: "休眠舱"
};

export const weatherLabels: Record<WeatherKind, string> = {
  sunny: "晴天",
  rainy: "雨天",
  cloudy: "阴天",
  hot: "高温",
  cold: "降温"
};

export const dayPeriodLabels: Record<DayPeriod, string> = {
  morning: "早晨",
  noon: "中午",
  evening: "夜晚"
};
