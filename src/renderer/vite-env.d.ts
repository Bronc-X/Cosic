/// <reference types="vite/client" />

import type { CosicDesktopApi } from '../shared/contracts/bridge';

declare global {
  interface Window {
    cosic: CosicDesktopApi;
  }
}

export {};
