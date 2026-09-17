/// <reference types="jest" />

import type { jest as JestGlobal } from "@jest/globals";

declare global {
  // @types/jest v30 no longer declares the runtime `jest` global used by jest.mock().
  const jest: typeof JestGlobal;
}

export {};
