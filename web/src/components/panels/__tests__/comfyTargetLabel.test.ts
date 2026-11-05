jest.mock("../../../contexts/NodeContext", () => ({ useNodes: jest.fn() }));
jest.mock("../../../hooks/useWorkers", () => ({ useWorkers: jest.fn() }));
jest.mock("../../../serverState/useComfyNodeMetadata", () => ({
  reloadComfyNodeCatalog: jest.fn()
}));
jest.mock("../../../trpc/client", () => ({ trpcClient: {} }));

import { comfyTargetLabel } from "../ComfyTargetSelector";

describe("comfyTargetLabel", () => {
  it("names the selected target", () => {
    expect(comfyTargetLabel("cloud", "http://a:1", undefined)).toBe("Comfy Cloud");
    expect(comfyTargetLabel("server", "http://a:1", undefined)).toBe("Server: a:1");
    expect(comfyTargetLabel("worker", undefined, "wss://w/ws")).toBe("Worker: w");
  });

  it("reports a selected target without an address", () => {
    expect(comfyTargetLabel("worker", "http://a:1", undefined)).toBe("Worker: not set");
  });

  it("follows the server-first rule when no target is selected", () => {
    expect(comfyTargetLabel(undefined, "a:1", undefined)).toBe("Server: a:1");
    expect(comfyTargetLabel(undefined, undefined, undefined)).toBe("Comfy Cloud");
  });
});
