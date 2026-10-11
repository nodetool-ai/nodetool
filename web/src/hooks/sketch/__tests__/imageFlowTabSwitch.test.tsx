/**
 * @jest-environment jsdom
 *
 * The image flow's slow steps (the brief refinement and the first-layer
 * upload) finish after the creator may have switched tabs. An inactive sketch
 * tab stays mounted but leaves the activation stack, so `getState()` on the
 * shared hook then reads another document. The answer must still land on the
 * document the step was started from.
 */
import React from "react";
import { act, renderHook } from "@testing-library/react";

const rpcRequest = jest.fn();
jest.mock("../../../lib/websocket/rpcRequest", () => ({
  rpcRequest: (...args: unknown[]) => rpcRequest(...args)
}));

const createAsset = jest.fn();
jest.mock("../../../stores/AssetStore", () => ({
  useAssetStore: { getState: () => ({ createAsset }) }
}));

import { useRefineBrief } from "../useRefineBrief";
import { useUploadFirstLayer } from "../useUploadFirstLayer";
import {
  SketchProvider,
  createSketchInstance,
  type SketchInstance
} from "../../../stores/sketch/SketchInstance";
import { createDefaultDocument } from "../../../components/sketch/types";

const REFINED = {
  subject: "a ceramic dripper",
  composition: "centred",
  lighting: "window light",
  style_words: "product photo",
  negative: "hands"
};

/**
 * A tab's provider. `renderHook` does not pass props to its wrapper, so the
 * tab's `active` flag is read from here and flipped like a tab switch.
 */
let tabActive = true;
const tabWrapper = (instance: SketchInstance) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <SketchProvider instance={instance} active={tabActive}>
      {children}
    </SketchProvider>
  );
  return Wrapper;
};

const seedTab = (stage: "idea" | "useCase"): SketchInstance => {
  const instance = createSketchInstance();
  const document = createDefaultDocument(1024, 1024);
  document.setup = { stage, brief: "a dripper", use_case: "product" };
  instance.editor.getState().setDocument(document);
  return instance;
};

/** A deferred promise the test settles after the tab switch. */
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  tabActive = true;
  rpcRequest.mockReset();
  createAsset.mockReset();
});

describe("a refinement that lands after a tab switch", () => {
  it("writes the brief onto the document it was asked from", async () => {
    const tab = seedTab("useCase");
    const answer = deferred<{ data: typeof REFINED }>();
    rpcRequest.mockReturnValueOnce(answer.promise);
    const Wrapper = tabWrapper(tab);
    const { result, rerender } = renderHook(() => useRefineBrief(), {
      wrapper: Wrapper
    });

    let outcome: Promise<{ ok: boolean }> = Promise.resolve({ ok: false });
    act(() => {
      outcome = result.current.expandBrief();
    });
    // The creator moves to another tab while the model answers.
    tabActive = false;
    rerender();
    await act(async () => {
      answer.resolve({ data: REFINED });
      await outcome;
    });

    await expect(outcome).resolves.toEqual({ ok: true });
    const setup = tab.editor.getState().document.setup;
    expect(setup?.stage).toBe("review");
    expect(setup?.refined).toEqual(REFINED);
  });
});

describe("an upload that lands after a tab switch", () => {
  const originalImage = Object.getOwnPropertyDescriptor(
    globalThis.Image.prototype,
    "src"
  );
  beforeAll(() => {
    Object.defineProperty(globalThis.Image.prototype, "src", {
      configurable: true,
      set(this: HTMLImageElement) {
        Object.defineProperty(this, "naturalWidth", { value: 800 });
        Object.defineProperty(this, "naturalHeight", { value: 600 });
        setTimeout(() => this.onload?.(new Event("load")));
      }
    });
    globalThis.URL.createObjectURL = jest.fn(() => "blob:upload");
    globalThis.URL.revokeObjectURL = jest.fn();
  });
  afterAll(() => {
    if (originalImage) {
      Object.defineProperty(globalThis.Image.prototype, "src", originalImage);
    }
  });

  it("places the image on the document it was started from", async () => {
    const tab = seedTab("idea");
    const asset = deferred<{ id: string; get_url: string }>();
    createAsset.mockReturnValueOnce(asset.promise);
    const onFinish = jest.fn();
    const Wrapper = tabWrapper(tab);
    const { result, rerender } = renderHook(
      () => useUploadFirstLayer(onFinish),
      { wrapper: Wrapper }
    );

    let placed: Promise<boolean> = Promise.resolve(false);
    act(() => {
      placed = result.current.uploadFirstLayer(
        new File(["bytes"], "photo.png", { type: "image/png" })
      );
    });
    tabActive = false;
    rerender();
    await act(async () => {
      asset.resolve({
        id: "asset-1",
        get_url: "https://example.test/asset-1.png"
      });
      await placed;
    });

    await expect(placed).resolves.toBe(true);
    const document = tab.editor.getState().document;
    expect(document.setup?.stage).toBe("done");
    expect(document.layers[0].imageReference?.uri).toBe(
      "https://example.test/asset-1.png"
    );
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
