import { describe, expect, it } from "vitest";

import { WIDGET_CATALOG, isKnownWidget, widgetMode } from "../src/widgets.js";

describe("widget catalog", () => {
  it("covers every widget the editor palette offers", () => {
    // The CLI harness used to keep a hand-copied list that fell five widget
    // types behind, so apps using them failed validation as "unknown widget
    // type". Pin the catalog so the copy can never come back.
    for (const type of [
      "ImageInput",
      "AudioInput",
      "VideoInput",
      "DocumentInput",
      "ColorInput",
      "ResourcePicker"
    ]) {
      expect(isKnownWidget(type)).toBe(true);
      expect(widgetMode(type)).toBe("write");
    }
  });

  it("reports unknown widget types rather than guessing a mode", () => {
    expect(isKnownWidget("Bogus")).toBe(false);
    expect(widgetMode("Bogus")).toBe("unknown");
  });

  it("marks only controls that settle as commit-capable", () => {
    // "On release" pacing is meaningless on a discrete control, so the editor
    // hides it — that decision reads off this flag.
    expect(WIDGET_CATALOG.Slider.commits).toBe(true);
    expect(WIDGET_CATALOG.TextInput.commits).toBe(true);
    expect(WIDGET_CATALOG.Switch.commits).toBe(false);
    expect(WIDGET_CATALOG.Select.commits).toBe(false);
  });

  it("declares the slots layout widgets nest children in", () => {
    expect(WIDGET_CATALOG.Columns.slots).toEqual(["left", "right"]);
    expect(WIDGET_CATALOG.Container.slots).toEqual(["content"]);
    expect(WIDGET_CATALOG.Divider.slots).toBeUndefined();
  });
});
