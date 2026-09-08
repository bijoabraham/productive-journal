/// <reference types="vite/client" />

import type { JournalApi } from '../shared/types';

declare global {
  interface Window {
    journal: JournalApi;
  }
}

export {};
