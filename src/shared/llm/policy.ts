import type { LLMBudgetState, OwnerMode, UIMode } from "../types";

export type LlmCallKind =
  | "manual_chat"
  | "ambient_dialogue"
  | "small_summary"
  | "large_summary"
  | "daily_summary";

export type LlmPolicyInput = {
  uiMode: UIMode;
  ownerMode: OwnerMode;
  llmBudget: LLMBudgetState;
  callKind: LlmCallKind;
  now: number;
  lastLlmCallAt?: number;
  hasApiKey?: boolean;
};

export function canCallLlm(input: LlmPolicyInput): {
  allowed: boolean;
  reason: string;
  useMock: boolean;
} {
  const budget = refreshBudget(input.llmBudget, input.now);
  if (budget.callsUsedThisHour >= budget.maxCallsPerHour) {
    return {
      allowed: false,
      reason: "本小时 LLM 预算已用完，改用本地 mock。",
      useMock: true
    };
  }

  if (input.uiMode === "sleep" && (input.callKind === "manual_chat" || input.callKind === "ambient_dialogue")) {
    return {
      allowed: false,
      reason: "休眠舱不发起主动聊天调用。",
      useMock: input.callKind === "manual_chat" || input.callKind === "ambient_dialogue"
    };
  }

  if (input.ownerMode === "do_not_disturb" && input.callKind === "ambient_dialogue") {
    return {
      allowed: false,
      reason: "低打扰模式禁止环境对话。",
      useMock: false
    };
  }

  if (input.callKind === "ambient_dialogue") {
    const cooldownMs = ownerModeAmbientCooldownMs(input.ownerMode);
    const lastCallAt = input.lastLlmCallAt ?? input.llmBudget.lastCallAt;
    if (lastCallAt && input.now - lastCallAt < cooldownMs) {
      return {
        allowed: false,
        reason: `环境对话冷却中，还需等待 ${Math.ceil((cooldownMs - (input.now - lastCallAt)) / 1000)} 秒。`,
        useMock: false
      };
    }
  }

  if (input.uiMode === "mini" && input.callKind === "ambient_dialogue") {
    return {
      allowed: true,
      reason: "观察窗允许极低频环境对话，需由调用方继续遵守冷却。",
      useMock: !input.hasApiKey
    };
  }

  if (input.uiMode === "sleep" && (input.callKind === "small_summary" || input.callKind === "large_summary")) {
    return {
      allowed: true,
      reason: "休眠舱只允许低频总结，可在无 key 或低优先级时使用 mock。",
      useMock: !input.hasApiKey
    };
  }

  if (input.ownerMode === "do_not_disturb" && input.callKind === "manual_chat") {
    return {
      allowed: true,
      reason: "低打扰模式：仅响应主人主动私聊。",
      useMock: !input.hasApiKey
    };
  }

  return {
    allowed: true,
    reason: "允许本次 LLM 调用。",
    useMock: !input.hasApiKey
  };
}

function ownerModeAmbientCooldownMs(mode: OwnerMode): number {
  switch (mode) {
    case "focus":
      return 2 * 60 * 1000;
    case "rest":
      return 45 * 1000;
    case "chat":
      return 45 * 1000;
    case "do_not_disturb":
      return Number.POSITIVE_INFINITY;
  }
}

function refreshBudget(budget: LLMBudgetState, now: number): LLMBudgetState {
  if (now - budget.hourStartedAt >= 60 * 60 * 1000) {
    return {
      ...budget,
      callsUsedThisHour: 0,
      manualCallsUsedThisHour: 0,
      ambientCallsUsedThisHour: 0,
      summaryCallsUsedThisHour: 0,
      hourStartedAt: now
    };
  }
  return budget;
}
