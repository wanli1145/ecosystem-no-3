/// <reference types="vite/client" />

import type { EcosystemBridge } from "../main/preload";

declare global {
  interface Window {
    ecosystem: EcosystemBridge;
  }
}
