import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { UIMode } from "../shared/types";

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
      preload: join(__dirname, "../preload/preload.mjs"),
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
