import type {
  BehaviorIntent,
  CharacterAction,
  ChatMessage,
  OwnerMode,
  UIMode,
  WeatherPermissionState,
  WeatherState,
  WeatherVisualState
} from "./types";
import type { LlmCallKind } from "./llm/policy";
import type { PersistedWorldState } from "./persistence";

export type WorldEvent =
  | { type: "TICK"; now: number }
  | { type: "WORLD_STATE_RESTORED"; snapshot: PersistedWorldState; at: number }
  | { type: "CLOCK_TICKED"; now: number }
  | { type: "UI_MODE_CHANGED"; mode: UIMode; at: number }
  | { type: "OWNER_MODE_CHANGED"; mode: OwnerMode; at: number }
  | { type: "OWNER_CARE"; targetId: string; careType: "coffee" | "snack" | "pet"; at: number }
  | { type: "OWNER_TASK_ASSIGNED"; targetId: string; task: "study" | "rest" | "chat"; at: number }
  | { type: "CHARACTER_DRAGGED"; targetId: string; x: number; y: number; at: number }
  | { type: "CHARACTER_NEAR"; a: string; b: string; at: number }
  | { type: "WEATHER_PERMISSION_REQUESTED"; at: number }
  | { type: "WEATHER_PERMISSION_RESOLVED"; permission: WeatherPermissionState; at: number }
  | { type: "WEATHER_CHANGED"; weather: WeatherState; at: number }
  | { type: "WEATHER_SYNC_REQUESTED"; at: number }
  | {
      type: "WEATHER_SYNC_SUCCEEDED";
      weather: WeatherState;
      geolocation: WeatherPermissionState["geolocation"];
      message?: string;
      at: number;
    }
  | { type: "WEATHER_SYNC_FAILED"; error: string; denied?: boolean; at: number }
  | { type: "WEATHER_VISUAL_DECIDED"; visual: WeatherVisualState; at: number }
  | { type: "CHARACTER_BEHAVIOR_INTENT_CREATED"; intent: BehaviorIntent; at: number }
  | { type: "CHARACTER_BEHAVIOR_APPLIED"; intent: BehaviorIntent; at: number }
  | { type: "DIALOGUE_GENERATED"; speakerId: string; text: string; at: number }
  | { type: "SOCIAL_DIALOGUE_REQUESTED"; socialEventId: string; speakerId: string; targetId: string; at: number }
  | {
      type: "SOCIAL_DIALOGUE_GENERATED";
      socialEventId: string;
      speakerId: string;
      targetId: string;
      text: string;
      actionSuggestion?: CharacterAction;
      memoryCandidate?: {
        importance: number;
        summary: string;
      };
      at: number;
    }
  | { type: "SOCIAL_DIALOGUE_FAILED"; socialEventId: string; error: string; at: number }
  | { type: "LLM_CALL_STARTED"; callKind?: LlmCallKind; at: number }
  | { type: "LLM_CALL_SUCCEEDED"; callKind?: LlmCallKind; at: number }
  | { type: "LLM_CALL_FAILED"; error: string; at: number }
  | {
      type: "CHARACTER_LLM_DIALOGUE_RECEIVED";
      characterId: string;
      text: string;
      actionSuggestion?: CharacterAction;
      memoryCandidate?: {
        importance: number;
        summary: string;
      };
      at: number;
    }
  | {
      type: "OWNER_CHAT_MESSAGE_SENT";
      characterId: string;
      text: string;
      at: number;
    }
  | {
      type: "CHARACTER_CHAT_MESSAGE_RECEIVED";
      characterId: string;
      text: string;
      actionSuggestion?: CharacterAction;
      memoryCandidate?: {
        importance: number;
        summary: string;
      };
      at: number;
    }
  | {
      type: "CHAT_SMALL_SUMMARY_CREATED";
      characterId: string;
      summary: string;
      at: number;
    }
  | {
      type: "CHAT_LARGE_SUMMARY_CREATED";
      characterId: string;
      summary: string;
      at: number;
    }
  | { type: "DAY_SUMMARY_CREATED"; summary: string; at: number };

export type { ChatMessage };
