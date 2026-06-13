import type { Position } from "../types";

export type RoomZoneName = "center" | "window" | "desk" | "rug" | "plant" | "door" | "social";

export const CABIN_BOUNDS = {
  minX: 18,
  maxX: 82,
  minY: 35,
  maxY: 78
} as const;

export const ROOM_ZONES = {
  center: { x: 50, y: 56 },
  window: { x: 50, y: 39 },
  desk: { x: 70, y: 58 },
  rug: { x: 36, y: 70 },
  plant: { x: 28, y: 62 },
  door: { x: 54, y: 74 },
  social: { x: 58, y: 55 }
} satisfies Record<RoomZoneName, Position>;

export type CharacterMotionProfile = {
  minSpeed: number;
  maxSpeed: number;
  pauseMinMs: number;
  pauseMaxMs: number;
  startDelayMinMs: number;
  startDelayMaxMs: number;
  waypointChance: number;
};

export const CHARACTER_ZONE_PREFERENCES: Record<string, RoomZoneName[]> = {
  mika: ["window", "rug", "center"],
  nan: ["center", "plant", "social"],
  sui: ["desk", "window", "rug"],
  lin: ["plant", "center", "door"]
};

export const CHARACTER_MOTION_PROFILES: Record<string, CharacterMotionProfile> = {
  mika: {
    minSpeed: 0.75,
    maxSpeed: 1,
    pauseMinMs: 5200,
    pauseMaxMs: 9200,
    startDelayMinMs: 2200,
    startDelayMaxMs: 6200,
    waypointChance: 45
  },
  nan: {
    minSpeed: 1.05,
    maxSpeed: 1.35,
    pauseMinMs: 2400,
    pauseMaxMs: 5600,
    startDelayMinMs: 700,
    startDelayMaxMs: 3600,
    waypointChance: 70
  },
  sui: {
    minSpeed: 0.85,
    maxSpeed: 1.1,
    pauseMinMs: 4800,
    pauseMaxMs: 8500,
    startDelayMinMs: 2600,
    startDelayMaxMs: 7200,
    waypointChance: 55
  },
  lin: {
    minSpeed: 1.15,
    maxSpeed: 1.55,
    pauseMinMs: 4200,
    pauseMaxMs: 7600,
    startDelayMinMs: 900,
    startDelayMaxMs: 4200,
    waypointChance: 35
  }
};

export function clampPositionToCabin(position: Position): Position {
  return {
    x: clamp(position.x, CABIN_BOUNDS.minX, CABIN_BOUNDS.maxX),
    y: clamp(position.y, CABIN_BOUNDS.minY, CABIN_BOUNDS.maxY)
  };
}

export function pickZonePosition(zoneName: RoomZoneName, seed: string): Position {
  const center = ROOM_ZONES[zoneName];
  const hash = hashSeed(`${zoneName}-${seed}`);
  const offsetX = ((hash % 700) / 100 - 3.5) * zoneSpread(zoneName);
  const offsetY = (((hash >>> 8) % 500) / 100 - 2.5) * zoneSpread(zoneName);
  return clampPositionToCabin({
    x: center.x + offsetX,
    y: center.y + offsetY
  });
}

function zoneSpread(zoneName: RoomZoneName): number {
  return zoneName === "window" || zoneName === "door" ? 0.7 : 1;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
