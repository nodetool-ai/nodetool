const electronMock = jest.requireActual("../../../__mocks__/electron");
jest.mock("electron", () => electronMock);

import { RUNTIME_PACKAGES } from "../definitions";
import { ElectronRuntimePackage } from "../ElectronRuntimePackage";
import type { RuntimeContext } from "../types";

const context: RuntimeContext = {
  userDataDir: "/unused", condaEnvPath: "/unused", optionalNodeRoot: "/unused",
  platform: "linux", arch: "x64", log: jest.fn()
};

it.each(["imaging", "typescript", "tracing", "esbuild", "rapier", "media-codecs", "webgpu"] as const)(
  "%s is included and has no npm installation lifecycle",
  async (id) => {
    const pkg = RUNTIME_PACKAGES[id];
    expect(pkg).toBeInstanceOf(ElectronRuntimePackage);
    expect(await pkg.status(context)).toEqual({ installed: true, bundled: true });
    const events = [];
    for await (const event of pkg.install(context, new AbortController().signal)) {
      events.push(event);
    }
    expect(events).toEqual([{ type: "done" }]);
  }
);
