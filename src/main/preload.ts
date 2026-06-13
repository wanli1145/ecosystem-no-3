import { contextBridge, ipcRenderer } from "electron";
import type {
  LlmChatSummaryRequest,
  LlmChatSummaryResponse,
  LlmDailySummaryResponse,
  LlmDialogueRequest,
  LlmDialogueResponse,
  LlmConnectionTestResponse,
  LlmModelListResponse,
  LlmRuntimeConfigInput,
  LlmRuntimeConfigStatus,
  LlmSocialDialogueRequest,
  LlmSocialDialogueResponse
} from "../shared/llm/types";
import type { UIMode, WorldState } from "../shared/types";
import type { PersistedWorldState } from "../shared/persistence";

type PersistenceSaveResult = {
  ok: boolean;
  error?: string;
};

const api = {
  setUIMode: (mode: UIMode) => ipcRenderer.invoke("window:set-ui-mode", mode),
  persistence: {
    loadWorldState: (): Promise<PersistedWorldState | null> =>
      ipcRenderer.invoke("persistence:load-world-state"),
    saveWorldState: (snapshot: PersistedWorldState): Promise<PersistenceSaveResult> =>
      ipcRenderer.invoke("persistence:save-world-state", snapshot),
    clearWorldState: (): Promise<PersistenceSaveResult> =>
      ipcRenderer.invoke("persistence:clear-world-state")
  },
  llm: {
    generateCharacterDialogue: (request: LlmDialogueRequest): Promise<LlmDialogueResponse> =>
      ipcRenderer.invoke("llm:generate-character-dialogue", request),
    generateCharacterSocialDialogue: (request: LlmDialogueRequest): Promise<LlmDialogueResponse> =>
      ipcRenderer.invoke("llm:generate-character-social-dialogue", request),
    generateNpcSocialDialogue: (request: LlmSocialDialogueRequest): Promise<LlmSocialDialogueResponse> =>
      ipcRenderer.invoke("llm:generate-npc-social-dialogue", request),
    generateSmallChatSummary: (request: LlmChatSummaryRequest): Promise<LlmChatSummaryResponse> =>
      ipcRenderer.invoke("llm:generate-small-chat-summary", request),
    generateLargeChatSummary: (request: LlmChatSummaryRequest): Promise<LlmChatSummaryResponse> =>
      ipcRenderer.invoke("llm:generate-large-chat-summary", request),
    generateDailySummary: (world: WorldState): Promise<LlmDailySummaryResponse> =>
      ipcRenderer.invoke("llm:generate-daily-summary", world),
    setRuntimeConfig: (config: LlmRuntimeConfigInput): Promise<LlmRuntimeConfigStatus> =>
      ipcRenderer.invoke("llm:set-runtime-config", config),
    getRuntimeConfigStatus: (): Promise<LlmRuntimeConfigStatus> =>
      ipcRenderer.invoke("llm:get-runtime-config-status"),
    listModels: (config?: LlmRuntimeConfigInput): Promise<LlmModelListResponse> =>
      ipcRenderer.invoke("llm:list-models", config),
    testConnection: (config?: LlmRuntimeConfigInput): Promise<LlmConnectionTestResponse> =>
      ipcRenderer.invoke("llm:test-connection", config)
  }
};

contextBridge.exposeInMainWorld("ecosystem", api);
console.info("[ecosystem preload] bridge exposed");

export type EcosystemBridge = typeof api;
