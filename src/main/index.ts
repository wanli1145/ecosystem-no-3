import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { UIMode } from "../shared/types";

/* ── LLM config (in-memory, never serialised with apiKey) ── */
interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

const llmConfig: LLMConfig = {
  apiKey: "",
  baseUrl: "https://api.siliconflow.cn/v1",
  model: "Qwen/Qwen3-8B"
};

async function callOpenAICompat(
  messages: Array<{ role: string; content: string }>,
  opts?: { temperature?: number; maxTokens?: number }
): Promise<string> {
  if (!llmConfig.apiKey) throw new Error("NO_API_KEY");
  const res = await fetch(`${llmConfig.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${llmConfig.apiKey}`
    },
    body: JSON.stringify({
      model: llmConfig.model,
      messages,
      temperature: opts?.temperature ?? 0.7,
      max_tokens: opts?.maxTokens ?? 300
    })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

const windowSizeByMode: Record<UIMode, { width: number; height: number }> = {
  mini: { width: 360, height: 260 },
  full: { width: 1120, height: 760 },
  sleep: { width: 320, height: 220 }
};

let mainWindow: BrowserWindow | null = null;

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
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  ipcMain.handle("window:set-ui-mode", (_event, mode: UIMode) => {
    const size = windowSizeByMode[mode];
    mainWindow?.setSize(size.width, size.height, true);
    if (mode === "full") {
      mainWindow?.center();
    }
  });

  /* ── LLM IPC handlers ── */
  ipcMain.handle("llm:chat", async (_event, messages: Array<{ role: string; content: string }>, opts?: { temperature?: number; maxTokens?: number }) => {
    try {
      return { ok: true, text: await callOpenAICompat(messages, opts) };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("llm:set-config", (_event, cfg: { apiKey?: string; baseUrl?: string; model?: string }) => {
    if (cfg.apiKey !== undefined) llmConfig.apiKey = cfg.apiKey;
    if (cfg.baseUrl !== undefined) llmConfig.baseUrl = cfg.baseUrl;
    if (cfg.model !== undefined) llmConfig.model = cfg.model;
    return { ok: true };
  });

  ipcMain.handle("llm:get-config", () => {
    return { baseUrl: llmConfig.baseUrl, model: llmConfig.model, hasKey: !!llmConfig.apiKey };
  });

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
