import { describe, expect, it } from "vitest";

import {
  MUAPI_NODES,
  MuapiImageToVideoNode,
  MuapiTextToImageNode,
  MuapiTextToVideoNode,
  registerMuapiNodes
} from "../src/index.js";

describe("MuAPI node pack", () => {
  it("exports the focused generation nodes", () => {
    expect(MUAPI_NODES).toEqual([
      MuapiTextToImageNode,
      MuapiTextToVideoNode,
      MuapiImageToVideoNode
    ]);
  });

  it("registers each node exactly once", () => {
    const registered: unknown[] = [];
    registerMuapiNodes({ register: (nodeClass) => registered.push(nodeClass) });
    expect(registered).toEqual([...MUAPI_NODES]);
  });
});
