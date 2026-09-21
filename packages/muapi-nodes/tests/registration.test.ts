import { describe, expect, it } from "vitest";

import {
  MUAPI_NODES,
  MuapiImageToVideoNode,
  MuapiTextToVideoNode,
  normalizeMuapiVideoDuration,
  registerMuapiNodes,
  videoRefFromBytes
} from "../src/index.js";

describe("MuAPI node pack", () => {
  it("exports only the routes MuAPI documents as live", () => {
    // The FLUX 3 image routes are marked coming soon, so the pack ships no
    // image node — a node whose only model cannot run is a guaranteed error.
    expect(MUAPI_NODES).toEqual([MuapiTextToVideoNode, MuapiImageToVideoNode]);
  });

  it("registers each node exactly once", () => {
    const registered: unknown[] = [];
    registerMuapiNodes({ register: (nodeClass) => registered.push(nodeClass) });
    expect(registered).toEqual([...MUAPI_NODES]);
  });

  it("clamps a duration prop onto the accepted 5-20s window", () => {
    expect(normalizeMuapiVideoDuration(7)).toBe(7);
    expect(normalizeMuapiVideoDuration(20)).toBe(20);
    expect(normalizeMuapiVideoDuration(1)).toBe(5);
    expect(normalizeMuapiVideoDuration(99)).toBe(20);
    expect(normalizeMuapiVideoDuration("not a number")).toBe(5);
  });

  it("emits a typed video ref carrying raw base64", () => {
    const ref = videoRefFromBytes(new Uint8Array([1, 2, 3]));
    expect(ref.type).toBe("video");
    expect(ref.data).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(String(ref.data)).not.toContain("data:");
  });
});
