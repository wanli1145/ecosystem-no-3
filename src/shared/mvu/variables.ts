import { ownerModeLabels, uiModeLabels, weatherLabels } from "../types";
import type { WorldState } from "../types";

export type MvuUpdateMode = "remove" | "insert" | "delta" | "replace";

export type MvuVariableType = "number" | "string" | "boolean" | "array" | "object";

export type MvuVariableField = {
  key: string;
  label: string;
  type: MvuVariableType;
  updateMode: MvuUpdateMode;
  value: string;
  description: string;
};

export type MvuVariableSection = {
  title: string;
  summary: string;
  fields: MvuVariableField[];
};

export type MvuVariableSnapshot = {
  sections: MvuVariableSection[];
  totalFields: number;
  totalSections: number;
};

export function buildMvuVariableSnapshot(world: WorldState): MvuVariableSnapshot {
  const characterNameById = new Map(world.characters.map((character) => [character.id, character.name] as const));
  const characterFields = world.characters.map((character) => ({
    key: `characters.${character.id}`,
    label: character.name,
    type: "object" as const,
    updateMode: "replace" as const,
    value: `${character.mood} / ${character.energy} / ${character.currentAction}`,
    description: `${character.name} 的当前情绪、能量和动作状态`
  }));

  const relationshipFields = buildRelationshipFields(world, characterNameById);
  const memoryFields = buildMemoryFields(world);

  const sections: MvuVariableSection[] = [
    {
      title: "基础变量",
      summary: "界面、主人和天气这些最常用的核心变量",
      fields: [
        {
          key: "uiMode",
          label: "uiMode",
          type: "string",
          updateMode: "replace",
          value: uiModeLabels[world.uiMode],
          description: "桌面观察窗 / 生态舱 / 休眠舱"
        },
        {
          key: "ownerContext.mode",
          label: "owner.mode",
          type: "string",
          updateMode: "replace",
          value: ownerModeLabels[world.ownerContext.mode],
          description: "主人当前的交互模式"
        },
        {
          key: "ownerContext.presence",
          label: "owner.presence",
          type: "string",
          updateMode: "replace",
          value: presenceLabel(world.ownerContext.presence),
          description: "主人是否在线或离开"
        },
        {
          key: "ownerContext.todayFocusMinutes",
          label: "focus.min",
          type: "number",
          updateMode: "delta",
          value: `${world.ownerContext.todayFocusMinutes}`,
          description: "今天累计的专注分钟数"
        },
        {
          key: "weather.kind",
          label: "weather.kind",
          type: "string",
          updateMode: "replace",
          value: weatherLabels[world.weather.kind],
          description: "当前天气类型"
        },
        {
          key: "weather.temperature",
          label: "weather.temp",
          type: "number",
          updateMode: "delta",
          value: `${world.weather.temperature}°C`,
          description: "当前气温"
        },
        {
          key: "weather.city",
          label: "weather.city",
          type: "string",
          updateMode: "replace",
          value: world.weather.city,
          description: "天气所在城市"
        },
        {
          key: "weatherVisual.illustrationId",
          label: "weather.art",
          type: "string",
          updateMode: "replace",
          value: world.weatherVisual.illustrationId,
          description: "根据天气和早中晚决定的生态舱背景图"
        },
        {
          key: "weatherVisual.assetPath",
          label: "weather.asset",
          type: "string",
          updateMode: "replace",
          value: world.weatherVisual.assetPath,
          description: "当前天气生态舱背景资源路径"
        },
        {
          key: "weatherPermission.weather",
          label: "weather.sync",
          type: "string",
          updateMode: "replace",
          value: world.weatherPermission.weather,
          description: "天气同步状态"
        }
      ]
    },
    {
      title: "角色变量",
      summary: "每个角色的情绪、能量和动作都可以视为独立变量",
      fields: characterFields
    },
    {
      title: "关系变量",
      summary: "角色之间的亲近度和熟悉度，适合做增量更新",
      fields: relationshipFields
    },
    {
      title: "记忆变量",
      summary: "长期记忆和最近摘要，适合插入式增长",
      fields: memoryFields
    },
    {
      title: "LLM 变量",
      summary: "当前调用预算与策略",
      fields: [
        {
          key: "llmBudget.mode",
          label: "llm.mode",
          type: "string",
          updateMode: "replace",
          value: world.llmBudget.mode,
          description: "LLM 调用模式"
        },
        {
          key: "llmBudget.callsUsedThisHour",
          label: "llm.quota",
          type: "number",
          updateMode: "delta",
          value: `${world.llmBudget.callsUsedThisHour}/${world.llmBudget.maxCallsPerHour}`,
          description: "当前小时内已用调用次数"
        },
        {
          key: "llmBudget.hourStartedAt",
          label: "llm.hourStartedAt",
          type: "number",
          updateMode: "replace",
          value: new Date(world.llmBudget.hourStartedAt).toLocaleTimeString("zh-CN", { hour12: false }),
          description: "当前预算窗口起始时间"
        }
      ]
    },
    {
      title: "事件变量",
      summary: "待处理社交事件和最近事件日志",
      fields: [
        {
          key: "pendingSocialEvent",
          label: "pending",
          type: "object",
          updateMode: "replace",
          value: world.pendingSocialEvent ? world.pendingSocialEvent.kind : "none",
          description: "下一步可能要处理的社交事件"
        },
        {
          key: "eventLog.size",
          label: "eventLog.size",
          type: "number",
          updateMode: "insert",
          value: `${world.eventLog.length}`,
          description: "当前事件日志条数"
        }
      ]
    }
  ];

  return {
    sections,
    totalFields: sections.reduce((sum, section) => sum + section.fields.length, 0),
    totalSections: sections.length
  };
}

export function summarizeMvuSnapshot(world: WorldState): Record<string, unknown> {
  const snapshot = buildMvuVariableSnapshot(world);
  return {
    totalSections: snapshot.totalSections,
    totalFields: snapshot.totalFields,
    sections: snapshot.sections.map((section) => ({
      title: section.title,
      summary: section.summary,
      fields: section.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        updateMode: field.updateMode,
        value: field.value
      }))
    }))
  };
}

function buildRelationshipFields(
  world: WorldState,
  characterNameById: Map<string, string>
): MvuVariableField[] {
  const ids = world.characters.map((character) => character.id);
  const fields: MvuVariableField[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const from = ids[i];
      const to = ids[j];
      const relation = world.relationships[from]?.[to];
      if (!relation) {
        continue;
      }
      fields.push({
        key: `relationships.${from}.${to}`,
        label: `${characterNameById.get(from) ?? from} ↔ ${characterNameById.get(to) ?? to}`,
        type: "object",
        updateMode: "delta",
        value: `亲近 ${relation.closeness} / 熟悉 ${relation.familiarity}`,
        description: "角色之间的亲近度与熟悉度"
      });
    }
  }
  return fields;
}

function presenceLabel(presence: WorldState["ownerContext"]["presence"]): string {
  switch (presence) {
    case "active":
      return "在线";
    case "away":
      return "离开";
    case "returned":
      return "回到桌面";
  }
}

function buildMemoryFields(world: WorldState): MvuVariableField[] {
  const recent = world.memories[0];
  return [
    {
      key: "memories.count",
      label: "memories.count",
      type: "number",
      updateMode: "insert",
      value: `${world.memories.length}`,
      description: "当前记忆条数"
    },
    {
      key: "memories.recent",
      label: "memories.recent",
      type: "array",
      updateMode: "insert",
      value: recent ? recent.summary : "none",
      description: "最近一条记忆摘要"
    }
  ];
}
