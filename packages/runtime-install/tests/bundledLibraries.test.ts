import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { fakeHost } from "./fake-host.js";

import { RUNTIME_PACKAGES } from "../src/packages/definitions.js";
import { ProvidedRuntimePackage } from "../src/packages/ProvidedRuntimePackage.js";
import type { RuntimeContext } from "../src/packages/types.js";

const context: RuntimeContext = {
  host: fakeHost(),
  userDataDir: "/unused", condaEnvPath: "/unused", optionalNodeRoot: "/unused",
  platform: "linux", arch: "x64", log: vi.fn()
};

it.each(["imaging", "typescript", "tracing", "esbuild", "rapier", "media-codecs", "webgpu"] as const)(
  "%s is included and has no npm installation lifecycle",
  async (id) => {
    const pkg = RUNTIME_PACKAGES[id];
    expect(pkg).toBeInstanceOf(ProvidedRuntimePackage);
    expect(await pkg.status(context)).toEqual({ installed: true, bundled: true });
    const events = [];
    for await (const event of pkg.install(context, new AbortController().signal)) {
      events.push(event);
    }
    expect(events).toEqual([{ type: "done" }]);
  }
);
