import type { WorldEvent } from "./events";
import type {
  CharacterState,
  OwnerMode,
  PendingSocialEvent,
  RelationshipState,
  WeatherKind,
  WorldLogEntry,
  WorldState
} from "./types";

const maxLogEntries = 12;

const characterSeed = [
  {
    id: "mika",
    name: "米卡",
    color: "#61c7b3",
    mood: "calm",
    position: { x: 18, y: 56 },
    currentAction: "idle",
    lastDialogue: "今天的生态舱很安静。"
  },
  {
    id: "nan",
    name: "南星",
    color: "#f6b756",
    mood: "bright",
    position: { x: 42, y: 42 },
    currentAction: "chat",
    lastDialogue: "我占了靠窗的位置。"
  },
  {
    id: "sui",
    name: "穗穗",
    color: "#9b8cf2",
    mood: "cozy",
    position: { x: 64, y: 60 },
    currentAction: "rest",
    lastDialogue: "慢一点也很好。"
  },
  {
    id: "lin",
    name: "林也",
    color: "#ef7d8d",
    mood: "focused",
    position: { x: 78, y: 36 },
    currentAction: "study",
    lastDialogue: "我先把桌面整理一下。"
  }
] satisfies Array<Omit<CharacterState, "energy">>;

const now = Date.now();

export const initialWorldState: WorldState = {
  uiMode: "full",
  ownerContext: {
    presence: "active",
    mode: "rest",
    lastInteractionAt: now,
    todayFocusMinutes: 0
  },
  weather: {
    kind: "cloudy",
    temperature: 24,
    city: "上海",
    updatedAt: now
  },
  characters: characterSeed.map((character, index) => ({
    ...character,
    energy: 70 + index * 4
  })),
  relationships: createRelationships(characterSeed.map((character) => character.id)),
  eventLog: [createLogEntry("init", now, "生态圈三号初始化完成。")],
  memories: [
    {
      id: "memory-init",
      at: now,
      scope: "global",
      summary: "生态圈三号首次启动，四位角色进入桌面生态舱。",
      importance: 3
    }
  ],
  llmBudget: {
    mode: "normal",
    maxCallsPerHour: 8,
    callsUsedThisHour: 0,
    hourStartedAt: now
  },
  pendingSocialEvent: null
};

export function reducer(state: WorldState, event: WorldEvent): WorldState {
  switch (event.type) {
    case "TICK":
      return applyTick(state, event.now);
    case "UI_MODE_CHANGED":
      return {
        ...state,
        uiMode: event.mode,
        ownerContext: {
          ...state.ownerContext,
          presence: event.mode === "sleep" ? "away" : state.ownerContext.presence
        },
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("ui_mode_changed", event.at, `切换到${describeUIMode(event.mode)}。`)
        )
      };
    case "OWNER_MODE_CHANGED":
      return {
        ...state,
        ownerContext: {
          ...state.ownerContext,
          mode: event.mode,
          lastInteractionAt: event.at
        },
        characters: state.characters.map((character) => applyOwnerMode(character, event.mode)),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("owner_mode_changed", event.at, `主人模式切换为「${ownerModeText(event.mode)}」。`)
        )
      };
    case "OWNER_CARE":
      return {
        ...state,
        ownerContext: {
          ...state.ownerContext,
          lastInteractionAt: event.at
        },
        characters: state.characters.map((character) =>
          character.id === event.targetId ? applyCare(character, event.careType) : character
        ),
        memories: appendMemory(
          state.memories,
          event.at,
          "owner",
          `主人对 ${findCharacterName(state.characters, event.targetId)} 执行了 ${careLabel(event.careType)}。`
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "owner_care",
            event.at,
            `主人给 ${findCharacterName(state.characters, event.targetId)} 执行了「${careLabel(event.careType)}」。`
          )
        )
      };
    case "OWNER_TASK_ASSIGNED":
      return {
        ...state,
        ownerContext: {
          ...state.ownerContext,
          lastInteractionAt: event.at
        },
        characters: state.characters.map((character) =>
          character.id === event.targetId ? applyTask(character, event.task) : character
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "owner_task_assigned",
            event.at,
            `主人给 ${findCharacterName(state.characters, event.targetId)} 分配了「${taskLabel(event.task)}」。`
          )
        )
      };
    case "CHARACTER_DRAGGED":
      return {
        ...state,
        characters: state.characters.map((character) =>
          character.id === event.targetId ? { ...character, position: { x: event.x, y: event.y } } : character
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("character_dragged", event.at, `${findCharacterName(state.characters, event.targetId)} 被移动到新位置。`)
        )
      };
    case "CHARACTER_NEAR":
      return {
        ...state,
        pendingSocialEvent: createPendingSocialEvent(state, event.a, event.b, event.at),
        relationships: updateRelationshipProximity(state.relationships, event.a, event.b),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry(
            "character_near",
            event.at,
            `${findCharacterName(state.characters, event.a)} 靠近了 ${findCharacterName(state.characters, event.b)}。`
          )
        )
      };
    case "WEATHER_CHANGED":
      return {
        ...state,
        weather: event.weather,
        characters: state.characters.map((character) => applyWeather(character, event.weather.kind)),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("weather_changed", event.at, `天气更新为${describeWeather(event.weather.kind)}。`)
        )
      };
    case "DIALOGUE_GENERATED":
      return {
        ...state,
        characters: state.characters.map((character) =>
          character.id === event.speakerId ? { ...character, lastDialogue: event.text } : character
        ),
        eventLog: appendLog(
          state.eventLog,
          createLogEntry("dialogue_generated", event.at, `${findCharacterName(state.characters, event.speakerId)} 说：${event.text}`)
        )
      };
    case "DAY_SUMMARY_CREATED":
      return {
        ...state,
        memories: appendMemory(state.memories, event.at, "global", event.summary),
        eventLog: appendLog(state.eventLog, createLogEntry("day_summary_created", event.at, "今日日报已生成。"))
      };
    default:
      return state;
  }
}

function applyTick(state: WorldState, now: number): WorldState {
  const tickSlot = Math.floor(now / 6000);
  const actionCycle: CharacterState["currentAction"][] = ["idle", "study", "rest"];
  return {
    ...state,
    ownerContext: {
      ...state.ownerContext,
      todayFocusMinutes: state.ownerContext.mode === "focus" ? state.ownerContext.todayFocusMinutes + 1 : state.ownerContext.todayFocusMinutes
    },
    characters: state.characters.map((character, index) => {
      const nextAction = actionCycle[(tickSlot + index) % actionCycle.length];
      return {
        ...character,
        energy: clamp(character.energy + 1, 0, 100),
        currentAction: nextAction,
        lastDialogue:
          nextAction === "idle"
            ? "我先安静待一会儿。"
            : nextAction === "study"
              ? "我在慢慢整理思路。"
              : "我先歇一下。"
      };
    }),
    llmBudget: refreshBudget(state.llmBudget, now)
  };
}

function appendLog(log: WorldLogEntry[], entry: WorldLogEntry): WorldLogEntry[] {
  return [entry, ...log].slice(0, maxLogEntries);
}

function createLogEntry(type: string, at: number, text: string): WorldLogEntry {
  return {
    id: `${type}-${at}-${text.length}`,
    type,
    at,
    text
  };
}

function appendMemory(
  memories: WorldState["memories"],
  at: number,
  scope: "global" | "character" | "relationship" | "owner",
  summary: string
): WorldState["memories"] {
  return [
    {
      id: `memory-${at}-${memories.length}`,
      at,
      scope,
      summary,
      importance: 2
    },
    ...memories
  ].slice(0, 20);
}

function createPendingSocialEvent(
  state: WorldState,
  a: string,
  b: string,
  at: number
): PendingSocialEvent {
  const aName = findCharacterName(state.characters, a);
  const bName = findCharacterName(state.characters, b);
  return {
    id: `pending-${at}-${a}-${b}`,
    kind: "pair_chat",
    involvedCharacterIds: [a, b],
    seedText: `${aName} 靠近了 ${bName}，可能会开始一段轻松对话。`,
    createdAt: at
  };
}

function applyOwnerMode(character: CharacterState, mode: OwnerMode): CharacterState {
  const actionByMode: Record<OwnerMode, CharacterState["currentAction"]> = {
    focus: "study",
    rest: "rest",
    chat: "chat",
    do_not_disturb: "idle"
  };

  const dialogueByMode: Record<OwnerMode, string> = {
    focus: `${character.name}进入安静陪伴状态。`,
    rest: `${character.name}把节奏放慢了一点。`,
    chat: `${character.name}准备好聊两句。`,
    do_not_disturb: `${character.name}安静地继续自己的小日常。`
  };

  return {
    ...character,
    currentAction: actionByMode[mode],
    lastDialogue: dialogueByMode[mode]
  };
}

function applyCare(character: CharacterState, careType: "coffee" | "snack" | "pet"): CharacterState {
  const deltaByCare: Record<typeof careType, number> = {
    coffee: 10,
    snack: 6,
    pet: 4
  };

  const dialogueByCare: Record<typeof careType, string> = {
    coffee: "谢谢，今天的节奏刚刚好。",
    snack: "这个小点心很合时宜。",
    pet: "嗯，这样就很安心。"
  };

  return {
    ...character,
    energy: clamp(character.energy + deltaByCare[careType], 0, 100),
    mood: character.mood === "focused" ? "calm" : character.mood,
    lastDialogue: dialogueByCare[careType]
  };
}

function applyTask(character: CharacterState, task: "study" | "rest" | "chat"): CharacterState {
  const actionByTask: Record<typeof task, CharacterState["currentAction"]> = {
    study: "study",
    rest: "rest",
    chat: "chat"
  };

  return {
    ...character,
    currentAction: actionByTask[task],
    lastDialogue: `收到，我先去${taskLabel(task)}。`
  };
}

function applyWeather(character: CharacterState, kind: WeatherKind): CharacterState {
  const moodByWeather: Record<WeatherKind, CharacterState["mood"]> = {
    sunny: "bright",
    rainy: "cozy",
    cloudy: "calm",
    hot: "focused",
    cold: "cozy"
  };

  const dialogueByWeather: Record<WeatherKind, string> = {
    sunny: "今天看起来很适合晒一会儿太阳。",
    rainy: "下雨天，房间里刚好安静一点。",
    cloudy: "阴天也有阴天的节奏。",
    hot: "有点热，先把节奏放慢。",
    cold: "降温了，想找个舒服的位置待着。"
  };

  return {
    ...character,
    mood: moodByWeather[kind],
    lastDialogue: dialogueByWeather[kind]
  };
}

function refreshBudget(budget: WorldState["llmBudget"], now: number): WorldState["llmBudget"] {
  const oneHour = 60 * 60 * 1000;
  if (now - budget.hourStartedAt >= oneHour) {
    return {
      ...budget,
      callsUsedThisHour: 0,
      hourStartedAt: now
    };
  }
  return budget;
}

function createRelationships(ids: string[]): WorldState["relationships"] {
  return Object.fromEntries(
    ids.map((sourceId) => [
      sourceId,
      Object.fromEntries(
        ids.map((targetId) => [
          targetId,
          {
            closeness: sourceId === targetId ? 100 : 50,
            familiarity: sourceId === targetId ? 100 : 40
          } satisfies RelationshipState
        ])
      )
    ])
  );
}

function updateRelationshipProximity(
  relationships: WorldState["relationships"],
  a: string,
  b: string
): WorldState["relationships"] {
  const next = cloneRelationships(relationships);
  for (const [from, to] of [
    [a, b],
    [b, a]
  ] as const) {
    next[from][to] = {
      closeness: clamp(next[from][to].closeness + 2, 0, 100),
      familiarity: clamp(next[from][to].familiarity + 3, 0, 100)
    };
  }
  return next;
}

function cloneRelationships(
  relationships: WorldState["relationships"]
): WorldState["relationships"] {
  return Object.fromEntries(
    Object.entries(relationships).map(([sourceId, targets]) => [
      sourceId,
      Object.fromEntries(
        Object.entries(targets).map(([targetId, value]) => [
          targetId,
          {
            closeness: value.closeness,
            familiarity: value.familiarity
          }
        ])
      )
    ])
  );
}

function findCharacterName(characters: CharacterState[], id: string): string {
  return characters.find((character) => character.id === id)?.name ?? id;
}

function describeUIMode(mode: WorldState["uiMode"]): string {
  switch (mode) {
    case "mini":
      return "观察窗";
    case "full":
      return "生态舱";
    case "sleep":
      return "休眠舱";
  }
}

function describeWeather(kind: WeatherKind): string {
  switch (kind) {
    case "sunny":
      return "晴天";
    case "rainy":
      return "雨天";
    case "cloudy":
      return "阴天";
    case "hot":
      return "高温";
    case "cold":
      return "降温";
  }
}

function careLabel(careType: "coffee" | "snack" | "pet"): string {
  switch (careType) {
    case "coffee":
      return "咖啡";
    case "snack":
      return "零食";
    case "pet":
      return "摸摸";
  }
}

function taskLabel(task: "study" | "rest" | "chat"): string {
  switch (task) {
    case "study":
      return "学习";
    case "rest":
      return "休息";
    case "chat":
      return "聊天";
  }
}

function ownerModeText(mode: OwnerMode): string {
  switch (mode) {
    case "focus":
      return "专注";
    case "rest":
      return "休息";
    case "chat":
      return "陪聊";
    case "do_not_disturb":
      return "勿扰";
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
