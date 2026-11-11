import { vi } from "vitest";

import type { RuntimeInstallHost } from "../src/host.js";

export interface FakeHost extends RuntimeInstallHost {
  readonly saved: Map<string, unknown>;
}

/** A Linux host with in-memory settings and recorded log calls. */
export function fakeHost(overrides: Partial<RuntimeInstallHost> = {}): FakeHost {
  const saved = new Map<string, unknown>();
  let condaEnv = "/fake/env";
  return {
    platform: "linux",
    arch: "x64",
    dataDir: "/fake/data",
    npmCacheDir: null,
    condaEnvPath: () => condaEnv,
    setCondaEnvPath: (location: string) => {
      condaEnv = location;
    },
    processEnv: () => ({}),
    npmInvocation: () => ({ command: "npm", baseArgs: [] }),
    micromambaResourceDirs: () => [],
    settings: {
      read: (key: string) => saved.get(key),
      write: (key: string, value: unknown) => {
        saved.set(key, value);
      },
    },
    log: vi.fn(),
    output: vi.fn(),
    status: vi.fn(),
    progress: vi.fn(),
    saved,
    ...overrides,
  };
}
