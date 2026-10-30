import { FrontendToolRegistry } from "../frontendTools";
import type { FrontendToolState } from "../frontendTools";
import {
  listOpenSvgIds,
  setSvgAgentHandler,
  type SvgAgentHandler,
  type SvgSnapshot
} from "../../../components/workspace/svgAgentBridge";
import { svgMarkupIssues } from "../builtin/svg";

const ASSET_ID = "svg-1";
const MARKUP =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="blue"/></svg>';

const ctx = { getState: () => ({}) as FrontendToolState };

/** A handler over a plain string draft, the way the surface keeps it. */
const draftHandler = (markup = MARKUP) => {
  const draft = { markup, saved: markup };
  const snapshot = (): SvgSnapshot => ({
    assetId: ASSET_ID,
    name: "Logo",
    markup: draft.markup,
    dirty: draft.markup !== draft.saved
  });
  const handler: jest.Mocked<SvgAgentHandler> = {
    getSnapshot: jest.fn(snapshot),
    setMarkup: jest.fn((next: string) => {
      draft.markup = next;
      return snapshot();
    }),
    save: jest.fn(async () => {
      draft.saved = draft.markup;
      return snapshot();
    })
  };
  return { draft, handler };
};

const call = (name: string, args: Record<string, unknown>) =>
  FrontendToolRegistry.call(name, args, "tc-1", ctx);

afterEach(() => {
  for (const id of listOpenSvgIds()) {
    setSvgAgentHandler(id, null);
  }
});

describe("svgMarkupIssues", () => {
  it("accepts markup rooted at <svg>", () => {
    expect(svgMarkupIssues(MARKUP)).toEqual([]);
  });

  it("reports markup that is not XML", () => {
    expect(svgMarkupIssues("<svg><g></svg>")).toHaveLength(1);
  });

  it("reports a root that is not <svg>", () => {
    expect(svgMarkupIssues("<div/>")).toEqual([
      "The root element is <div>, not <svg>."
    ]);
  });
});

describe("ui_svg_* tools", () => {
  it("requires the asset id on every tool", () => {
    const tools = FrontendToolRegistry.getManifest().filter((tool) =>
      tool.name.startsWith("ui_svg_")
    );
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "ui_svg_get_state",
      "ui_svg_replace",
      "ui_svg_save",
      "ui_svg_set_markup"
    ]);
    for (const tool of tools) {
      expect(tool.parameters.required).toContain("asset_id");
    }
  });

  it("names the remedy when the SVG is not open", async () => {
    await expect(
      call("ui_svg_get_state", { asset_id: "missing" })
    ).rejects.toThrow('Call ui_open_document with type "svg"');
  });

  it("reads the draft with its parse issues", async () => {
    const { handler } = draftHandler();
    setSvgAgentHandler(ASSET_ID, handler);
    await expect(
      call("ui_svg_get_state", { asset_id: ASSET_ID })
    ).resolves.toMatchObject({
      ok: true,
      markup: MARKUP,
      dirty: false,
      issues: []
    });
  });

  it("replaces the whole draft and links the asset", async () => {
    const { draft, handler } = draftHandler();
    setSvgAgentHandler(ASSET_ID, handler);
    const next = MARKUP.replace("blue", "red");
    await expect(
      call("ui_svg_set_markup", { asset_id: ASSET_ID, markup: next })
    ).resolves.toEqual({
      ok: true,
      chars: next.length,
      dirty: true,
      url: "asset://svg-1"
    });
    expect(draft.markup).toBe(next);
  });

  it("rejects markup that does not parse and keeps the draft", async () => {
    const { draft, handler } = draftHandler();
    setSvgAgentHandler(ASSET_ID, handler);
    await expect(
      call("ui_svg_set_markup", { asset_id: ASSET_ID, markup: "<svg><g>" })
    ).rejects.toThrow("The markup was not applied");
    expect(handler.setMarkup).not.toHaveBeenCalled();
    expect(draft.markup).toBe(MARKUP);
  });

  it("replaces one exact passage", async () => {
    const { draft, handler } = draftHandler();
    setSvgAgentHandler(ASSET_ID, handler);
    await call("ui_svg_replace", {
      asset_id: ASSET_ID,
      find: 'fill="blue"',
      replace: 'fill="red"'
    });
    expect(draft.markup).toBe(MARKUP.replace("blue", "red"));
  });

  it("refuses a passage that is missing or repeated", async () => {
    const { handler } = draftHandler(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="blue"/><rect fill="blue"/></svg>'
    );
    setSvgAgentHandler(ASSET_ID, handler);
    await expect(
      call("ui_svg_replace", { asset_id: ASSET_ID, find: "green", replace: "" })
    ).rejects.toThrow("does not occur");
    await expect(
      call("ui_svg_replace", {
        asset_id: ASSET_ID,
        find: 'fill="blue"',
        replace: 'fill="red"'
      })
    ).rejects.toThrow("more than once");
    expect(handler.setMarkup).not.toHaveBeenCalled();
  });

  it("refuses a replacement that breaks the markup", async () => {
    const { handler } = draftHandler();
    setSvgAgentHandler(ASSET_ID, handler);
    await expect(
      call("ui_svg_replace", { asset_id: ASSET_ID, find: "</svg>", replace: "" })
    ).rejects.toThrow("The replacement was not applied");
    expect(handler.setMarkup).not.toHaveBeenCalled();
  });

  it("saves the draft", async () => {
    const { handler } = draftHandler();
    setSvgAgentHandler(ASSET_ID, handler);
    await call("ui_svg_set_markup", {
      asset_id: ASSET_ID,
      markup: MARKUP.replace("blue", "red")
    });
    await expect(
      call("ui_svg_save", { asset_id: ASSET_ID })
    ).resolves.toEqual({ ok: true, dirty: false, url: "asset://svg-1" });
    expect(handler.save).toHaveBeenCalledTimes(1);
  });
});
