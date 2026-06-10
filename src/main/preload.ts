import { contextBridge, ipcRenderer } from "electron";
import type { UIMode } from "../shared/types";

const api = {
  setUIMode: (mode: UIMode) => ipcRenderer.invoke("window:set-ui-mode", mode),

  /* ── LLM bridge ── */
  callLLM: (
    messages: Array<{ role: string; content: string }>,
    opts?: { temperature?: number; maxTokens?: number }
  ): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke("llm:chat", messages, opts),

  setLLMConfig: (cfg: { apiKey?: string; baseUrl?: string; model?: string }) =>
    ipcRenderer.invoke("llm:set-config", cfg),

  getLLMConfig: (): Promise<{ baseUrl: string; model: string; hasKey: boolean }> =>
    ipcRenderer.invoke("llm:get-config")
};

contextBridge.exposeInMainWorld("ecosystem", api);

export type EcosystemBridge = typeof api;
