import { actionAnimationStateMap } from "../behavior";
import type { CharacterAction, CharacterAnimationState, CharacterState } from "../types";
import mikaPet from "../../../assets/chars/mika/pet.json";
import mikaSpritesheetUrl from "../../../assets/chars/mika/spritesheet.webp";
import nanPet from "../../../assets/chars/nan/pet.json";
import nanSpritesheetUrl from "../../../assets/chars/nan/spritesheet.webp";
import linPet from "../../../assets/chars/lin/pet.json";
import linSpritesheetUrl from "../../../assets/chars/lin/spritesheet.webp";
import suiPet from "../../../assets/chars/sui/pet.json";
import suiSpritesheetUrl from "../../../assets/chars/sui/spritesheet.webp";

export type CharacterSpriteState = CharacterAnimationState;

export type CharacterVisualConfig = {
  id: string;
  name: string;
  style: string;
  spritePath: string;
  spriteUrl: string;
  defaultState: CharacterSpriteState;
  spriteColumns: number;
  spriteRows: number;
  states: Record<CharacterSpriteState, { row: number; frames: number; durationMs: number }>;
  actionStateMap: Record<CharacterAction, CharacterSpriteState>;
};

const mikaPetAsset = mikaPet as {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

const suiPetAsset = suiPet as {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

const nanPetAsset = nanPet as {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

const linPetAsset = linPet as {
  id: string;
  displayName: string;
  description: string;
  spritesheetPath: string;
};

const commonActionStateMap = actionAnimationStateMap satisfies Record<CharacterAction, CharacterSpriteState>;

export const characterConfigs = {
  [mikaPetAsset.id]: {
    id: mikaPetAsset.id,
    name: mikaPetAsset.displayName,
    style: "soft pixel / retro-modern hybrid",
    spritePath: "assets/chars/mika/spritesheet.webp",
    spriteUrl: mikaSpritesheetUrl,
    defaultState: "idle",
    spriteColumns: 8,
    spriteRows: 9,
    states: {
      idle: { row: 0, frames: 6, durationMs: 1200 },
      "running-right": { row: 1, frames: 8, durationMs: 900 },
      "running-left": { row: 2, frames: 8, durationMs: 900 },
      waving: { row: 3, frames: 4, durationMs: 900 },
      jumping: { row: 4, frames: 5, durationMs: 1000 },
      failed: { row: 5, frames: 8, durationMs: 1300 },
      waiting: { row: 6, frames: 6, durationMs: 1400 },
      running: { row: 7, frames: 6, durationMs: 1100 },
      review: { row: 8, frames: 6, durationMs: 1200 }
    },
    actionStateMap: commonActionStateMap
  },
  [suiPetAsset.id]: {
    id: suiPetAsset.id,
    name: suiPetAsset.displayName,
    style: "soft pixel / retro-modern hybrid",
    spritePath: "assets/chars/sui/spritesheet.webp",
    spriteUrl: suiSpritesheetUrl,
    defaultState: "idle",
    spriteColumns: 8,
    spriteRows: 9,
    states: {
      idle: { row: 0, frames: 6, durationMs: 1200 },
      "running-right": { row: 1, frames: 8, durationMs: 900 },
      "running-left": { row: 2, frames: 8, durationMs: 900 },
      waving: { row: 3, frames: 4, durationMs: 900 },
      jumping: { row: 4, frames: 5, durationMs: 1000 },
      failed: { row: 5, frames: 8, durationMs: 1300 },
      waiting: { row: 6, frames: 6, durationMs: 1400 },
      running: { row: 7, frames: 6, durationMs: 1100 },
      review: { row: 8, frames: 6, durationMs: 1200 }
    },
    actionStateMap: commonActionStateMap
  },
  [nanPetAsset.id]: {
    id: nanPetAsset.id,
    name: nanPetAsset.displayName,
    style: "soft pixel / retro-modern hybrid",
    spritePath: "assets/chars/nan/spritesheet.webp",
    spriteUrl: nanSpritesheetUrl,
    defaultState: "idle",
    spriteColumns: 8,
    spriteRows: 9,
    states: {
      idle: { row: 0, frames: 6, durationMs: 1200 },
      "running-right": { row: 1, frames: 8, durationMs: 900 },
      "running-left": { row: 2, frames: 8, durationMs: 900 },
      waving: { row: 3, frames: 4, durationMs: 900 },
      jumping: { row: 4, frames: 5, durationMs: 1000 },
      failed: { row: 5, frames: 8, durationMs: 1300 },
      waiting: { row: 6, frames: 6, durationMs: 1400 },
      running: { row: 7, frames: 6, durationMs: 1100 },
      review: { row: 8, frames: 6, durationMs: 1200 }
    },
    actionStateMap: commonActionStateMap
  },
  [linPetAsset.id]: {
    id: linPetAsset.id,
    name: linPetAsset.displayName,
    style: "soft pixel / retro-modern hybrid",
    spritePath: "assets/chars/lin/spritesheet.webp",
    spriteUrl: linSpritesheetUrl,
    defaultState: "idle",
    spriteColumns: 8,
    spriteRows: 9,
    states: {
      idle: { row: 0, frames: 6, durationMs: 1200 },
      "running-right": { row: 1, frames: 8, durationMs: 900 },
      "running-left": { row: 2, frames: 8, durationMs: 900 },
      waving: { row: 3, frames: 4, durationMs: 900 },
      jumping: { row: 4, frames: 5, durationMs: 1000 },
      failed: { row: 5, frames: 8, durationMs: 1300 },
      waiting: { row: 6, frames: 6, durationMs: 1400 },
      running: { row: 7, frames: 6, durationMs: 1100 },
      review: { row: 8, frames: 6, durationMs: 1200 }
    },
    actionStateMap: commonActionStateMap
  }
} satisfies Record<string, CharacterVisualConfig>;

export function getCharacterVisualConfig(characterId: string): CharacterVisualConfig | null {
  return characterConfigs[characterId] ?? null;
}

export function resolveCharacterSpriteState(
  character: Pick<CharacterState, "id" | "currentAction"> &
    Partial<Pick<CharacterState, "facing" | "movementState">>
): CharacterSpriteState | null {
  const config = getCharacterVisualConfig(character.id);
  if (!config) {
    return null;
  }

  if (character.movementState === "moving") {
    return character.facing === "left" ? "running-left" : "running-right";
  }

  return config.actionStateMap[character.currentAction] ?? config.defaultState;
}
