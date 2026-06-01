export type UIMode = "mini" | "full" | "sleep";

export type OwnerMode = "focus" | "rest" | "chat" | "do_not_disturb";

export type OwnerPresence = "active" | "away" | "returned";

export type WeatherKind = "sunny" | "rainy" | "cloudy" | "hot" | "cold";

export type CharacterMood = "calm" | "bright" | "cozy" | "focused";

export type CharacterAction = "idle" | "study" | "rest" | "chat" | "walk" | "drink" | "snack";

export type Position = {
  x: number;
  y: number;
};

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

export type CharacterState = {
  id: string;
  name: string;
  color: string;
  mood: CharacterMood;
  energy: number;
  position: Position;
  currentAction: CharacterAction;
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

export type LLMBudgetState = {
  mode: "quiet" | "normal" | "active";
  maxCallsPerHour: number;
  callsUsedThisHour: number;
  hourStartedAt: number;
};

export type WorldState = {
  uiMode: UIMode;
  ownerContext: OwnerContext;
  weather: WeatherState;
  characters: CharacterState[];
  relationships: Record<string, Record<string, RelationshipState>>;
  eventLog: WorldLogEntry[];
  memories: MemoryEntry[];
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
