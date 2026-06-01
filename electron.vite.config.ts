import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: "src/main/index.ts"
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: "src/main/preload.ts"
      }
    }
  },
  renderer: {
    root: "src/renderer",
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html")
      }
    }
  }
});
