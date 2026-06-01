import type { OwnerMode, UIMode, WeatherState } from "./types";

export type WorldEvent =
  | { type: "TICK"; now: number }
  | { type: "UI_MODE_CHANGED"; mode: UIMode; at: number }
  | { type: "OWNER_MODE_CHANGED"; mode: OwnerMode; at: number }
  | { type: "OWNER_CARE"; targetId: string; careType: "coffee" | "snack" | "pet"; at: number }
  | { type: "OWNER_TASK_ASSIGNED"; targetId: string; task: "study" | "rest" | "chat"; at: number }
  | { type: "CHARACTER_DRAGGED"; targetId: string; x: number; y: number; at: number }
  | { type: "CHARACTER_NEAR"; a: string; b: string; at: number }
  | { type: "WEATHER_CHANGED"; weather: WeatherState; at: number }
  | { type: "DIALOGUE_GENERATED"; speakerId: string; text: string; at: number }
  | { type: "DAY_SUMMARY_CREATED"; summary: string; at: number };
