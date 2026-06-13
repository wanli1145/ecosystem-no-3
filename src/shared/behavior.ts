import type { BehaviorIntent, CharacterAction, CharacterAnimationState } from "./types";

export const actionAnimationStateMap = {
  idle: "idle",
  walk: "idle",
  wander: "idle",
  study: "review",
  think: "review",
  rest: "waiting",
  nap: "waiting",
  chat: "waving",
  greet_owner: "waving",
  talk_to_character: "waving",
  drink: "jumping",
  snack: "jumping",
  play: "jumping",
  observe_window: "review",
  look_weather: "review",
  react_weather: "review",
  error: "failed"
} satisfies Record<CharacterAction, CharacterAnimationState>;

export function createBehaviorIntent(input: {
  characterId: string;
  action: CharacterAction;
  dialogue?: string;
  reason: string;
  source: BehaviorIntent["source"];
}): BehaviorIntent {
  return {
    ...input,
    animationState: actionAnimationStateMap[input.action]
  };
}
