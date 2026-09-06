/**
 * @jest-environment jsdom
 *
 * PRD § 10.7, criterion 6 — every criterion also passes through the § 10.6
 * tools.
 *
 * The tools are driven against the real bridge, not a mock handler: what has
 * to hold is that a headless caller reaches the same document the flow writes,
 * so a stubbed handler would prove nothing.
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";

const sendMock = jest.fn(async (_frame?: unknown) => {});
jest.mock("../../websocket/GlobalWebSocketManager", () => ({
  globalWebSocketManager: {
    ensureConnection: jest.fn(async () => {}),
    send: (...args: unknown[]) => sendMock(...(args as [unknown])),
    subscribe: () => () => {},
    setResumeJobIdProvider: jest.fn()
  }
}));

const rpcRequest = jest.fn(async () => ({
  data: {
    subject: "a ceramic pour-over dripper",
    composition: "centred on seamless white",
    lighting: "soft window light",
    style_words: "85mm",
    negative: "hands"
  }
}));
jest.mock("../../websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...(args as [])),
  randomRequestId: () => "req-1"
}));

import { FrontendToolRegistry, type FrontendToolState } from "../frontendTools";
import "../builtin/sketch";
import { useSketchAgentBridge } from "../../../hooks/sketch/useSketchAgentBridge";
import { useSketchStore } from "../../../components/sketch/state/useSketchStore";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { createDefaultDocument } from "../../../components/sketch/types";

const DOC = "doc-image-flow";
const ctx = { getState: () => ({}) as FrontendToolState };

const call = async (name: string, args: Record<string, unknown>) => {
  const tool = FrontendToolRegistry.get(name);
  if (!tool) {
    throw new Error(`${name} is not registered`);
  }
  return (await tool.execute(args as never, ctx as never)) as Record<
    string,
    unknown
  >;
};

const mountBridge = () => {
  act(() => {
    useSketchStore.getState().setDocument(createDefaultDocument(512, 512));
    useSketchSessionStore.setState({ bindings: {}, documentId: DOC } as never);
  });
  return renderHook(() => useSketchAgentBridge(DOC));
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue(undefined);
  rpcRequest.mockClear();
});

describe("ui_sketch_set_setup", () => {
  it("registers both new tools", () => {
    const names = FrontendToolRegistry.getManifest().map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(["ui_sketch_set_setup", "ui_sketch_refine_brief"])
    );
  });

  it("writes the brief, the use case, the count and the stage", async () => {
    mountBridge();
    const result = await call("ui_sketch_set_setup", {
      sketch_id: DOC,
      brief: "a pour-over dripper on a sunlit counter",
      use_case: "product",
      variations: 4,
      stage: "look"
    });
    expect(result.ok).toBe(true);
    expect(useSketchStore.getState().document.setup).toMatchObject({
      brief: "a pour-over dripper on a sunlit counter",
      use_case: "product",
      variations: 4,
      stage: "look"
    });
  });

  it("applies the use case's default size and count", async () => {
    mountBridge();
    await call("ui_sketch_set_setup", {
      sketch_id: DOC,
      use_case: "key-art"
    });
    expect(useSketchStore.getState().document.setup?.variations).toBe(2);
    expect(useSketchStore.getState().document.canvas).toMatchObject({
      width: 683,
      height: 1024
    });
  });

  it("refuses a use case the flow does not have", async () => {
    mountBridge();
    await expect(
      call("ui_sketch_set_setup", { sketch_id: DOC, use_case: "mural" })
    ).rejects.toThrow(/use_case must be one of/);
    expect(useSketchStore.getState().document.setup).toBeUndefined();
  });

  it("leaves the fields it is not given alone", async () => {
    mountBridge();
    await call("ui_sketch_set_setup", {
      sketch_id: DOC,
      brief: "a dripper",
      use_case: "product"
    });
    await call("ui_sketch_set_setup", { sketch_id: DOC, stage: "review" });
    expect(useSketchStore.getState().document.setup).toMatchObject({
      brief: "a dripper",
      use_case: "product",
      stage: "review"
    });
  });
});

describe("ui_sketch_refine_brief (criterion 3, headless)", () => {
  it("expands the brief without adding a layer or starting a job", async () => {
    mountBridge();
    await call("ui_sketch_set_setup", {
      sketch_id: DOC,
      brief: "a pour-over dripper",
      use_case: "product",
      stage: "useCase"
    });
    const layersBefore = useSketchStore.getState().document.layers.length;

    const result = await call("ui_sketch_refine_brief", { sketch_id: DOC });

    expect(result.ok).toBe(true);
    expect(rpcRequest).toHaveBeenCalledTimes(1);
    expect(useSketchStore.getState().document.layers).toHaveLength(
      layersBefore
    );
    expect(
      Object.keys(useSketchSessionStore.getState().bindings)
    ).toHaveLength(0);
    expect(sendMock).not.toHaveBeenCalled();
    const setup = useSketchStore.getState().document.setup;
    expect(setup?.stage).toBe("review");
    expect(setup?.refined?.subject).toBe("a ceramic pour-over dripper");
  });
});

describe("ui_sketch_generate per variation (criterion 4, headless)", () => {
  it("renders a set differing only by seed", async () => {
    mountBridge();
    const prompt = "a ceramic dripper. centred on seamless white";
    for (const seed of [11, 12, 13]) {
      await call("ui_sketch_generate", {
        sketch_id: DOC,
        kind: "text-to-image",
        prompt,
        provider: "prov",
        model: "model-1",
        width: 1024,
        height: 1024,
        seed
      });
    }
    const bindings = Object.values(useSketchSessionStore.getState().bindings);
    expect(bindings).toHaveLength(3);
    expect(
      new Set(
        bindings.map((binding) =>
          JSON.stringify([
            binding.prompt,
            binding.provider,
            binding.model,
            binding.width,
            binding.height
          ])
        )
      ).size
    ).toBe(1);
    expect(new Set(bindings.map((binding) => binding.seed))).toEqual(
      new Set([11, 12, 13])
    );
  });
});

describe("ui_sketch_set_layer_props (criterion 5, headless)", () => {
  it("hides every variation but the picked one", async () => {
    mountBridge();
    const layerIds: string[] = [];
    for (const seed of [21, 22]) {
      const result = await call("ui_sketch_generate", {
        sketch_id: DOC,
        kind: "text-to-image",
        prompt: "a dripper",
        provider: "prov",
        model: "model-1",
        seed
      });
      layerIds.push((result.layer as { id: string }).id);
    }

    await call("ui_sketch_select_layer", {
      sketch_id: DOC,
      target: layerIds[0]
    });
    await call("ui_sketch_set_layer_props", {
      sketch_id: DOC,
      target: layerIds[1],
      visible: false
    });

    const document = useSketchStore.getState().document;
    expect(document.activeLayerId).toBe(layerIds[0]);
    expect(
      document.layers.find((layer) => layer.id === layerIds[0])?.visible
    ).toBe(true);
    expect(
      document.layers.find((layer) => layer.id === layerIds[1])?.visible
    ).toBe(false);
  });
});
