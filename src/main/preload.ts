import { contextBridge, ipcRenderer } from "electron";
import type { UIMode } from "../shared/types";

const api = {
  setUIMode: (mode: UIMode) => ipcRenderer.invoke("window:set-ui-mode", mode)
};

contextBridge.exposeInMainWorld("ecosystem", api);

export type EcosystemBridge = typeof api;
