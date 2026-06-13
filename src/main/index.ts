import { app, BrowserWindow, ipcMain, session } from "electron";
import { existsSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  generateCharacterDialogue,
  generateCharacterSocialDialogue,
  generateDailySummary,
  generateLargeChatSummary,
  generateNpcSocialDialogue,
  generateSmallChatSummary,
  getLlmRuntimeConfigStatus,
  listLlmModels,
  setLlmRuntimeConfig,
  testLlmConnection
} from "./llmClient";
import type {
  LlmChatSummaryRequest,
  LlmDialogueRequest,
  LlmRuntimeConfigInput,
  LlmSocialDialogueRequest
} from "../shared/llm/types";
import type { UIMode, WorldState } from "../shared/types";
import type { PersistedWorldState } from "../shared/persistence";

const windowSizeByMode: Record<UIMode, { width: number; height: number }> = {
  mini: { width: 360, height: 260 },
  full: { width: 1120, height: 760 },
  sleep: { width: 320, height: 220 }
};

let mainWindow: BrowserWindow | null = null;

type PersistenceSaveResult = {
  ok: boolean;
  error?: string;
};

function getWorldStatePersistencePath(): string {
  return join(app.getPath("userData"), "ecosystem-world-state.json");
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    ...windowSizeByMode.full,
    minWidth: 320,
    minHeight: 220,
    title: "生态圈三号",
    backgroundColor: "#f7f3ea",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.webContents.once("did-finish-load", () => {
    mainWindow?.webContents
      .executeJavaScript("Boolean(window.ecosystem?.llm)")
      .then((hasBridge) => {
        console.info(`[ecosystem main] preload bridge ${hasBridge ? "ready" : "missing"}`);
      })
      .catch((error: unknown) => {
        console.warn("[ecosystem main] preload bridge check failed", error);
      });
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "geolocation");
  });

  ipcMain.handle("window:set-ui-mode", (_event, mode: UIMode) => {
    const size = windowSizeByMode[mode];
    mainWindow?.setSize(size.width, size.height, true);
    if (mode === "full") {
      mainWindow?.center();
    }
  });

  ipcMain.handle("persistence:load-world-state", async (): Promise<PersistedWorldState | null> => {
    const filePath = getWorldStatePersistencePath();
    if (!existsSync(filePath)) {
      return null;
    }

    try {
      return JSON.parse(await readFile(filePath, "utf8")) as PersistedWorldState;
    } catch (error) {
      try {
        await rename(filePath, `${filePath}.bad-${Date.now()}`);
      } catch {
        // Ignore backup failure; a bad persistence file should never block app startup.
      }
      console.warn("[ecosystem persistence] failed to load world state", error);
      return null;
    }
  });

  ipcMain.handle("persistence:save-world-state", async (_event, snapshot: PersistedWorldState): Promise<PersistenceSaveResult> => {
    try {
      await writeFile(getWorldStatePersistencePath(), JSON.stringify(snapshot, null, 2), "utf8");
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown persistence error";
      console.warn("[ecosystem persistence] failed to save world state", error);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("persistence:clear-world-state", async (): Promise<PersistenceSaveResult> => {
    try {
      await rm(getWorldStatePersistencePath(), { force: true });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown persistence error";
      console.warn("[ecosystem persistence] failed to clear world state", error);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("llm:generate-character-dialogue", (_event, request: LlmDialogueRequest) =>
    generateCharacterDialogue(request)
  );

  ipcMain.handle("llm:generate-character-social-dialogue", (_event, request: LlmDialogueRequest) =>
    generateCharacterSocialDialogue(request)
  );

  ipcMain.handle("llm:generate-npc-social-dialogue", (_event, request: LlmSocialDialogueRequest) =>
    generateNpcSocialDialogue(request)
  );

  ipcMain.handle("llm:generate-small-chat-summary", (_event, request: LlmChatSummaryRequest) =>
    generateSmallChatSummary(request)
  );

  ipcMain.handle("llm:generate-large-chat-summary", (_event, request: LlmChatSummaryRequest) =>
    generateLargeChatSummary(request)
  );

  ipcMain.handle("llm:generate-daily-summary", (_event, world: WorldState) =>
    generateDailySummary(world)
  );

  ipcMain.handle("llm:set-runtime-config", (_event, config: LlmRuntimeConfigInput) =>
    setLlmRuntimeConfig(config)
  );

  ipcMain.handle("llm:get-runtime-config-status", () => getLlmRuntimeConfigStatus());

  ipcMain.handle("llm:list-models", (_event, config?: LlmRuntimeConfigInput) => listLlmModels(config));

  ipcMain.handle("llm:test-connection", (_event, config?: LlmRuntimeConfigInput) => testLlmConnection(config));

  await createMainWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
