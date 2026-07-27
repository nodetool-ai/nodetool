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
      "ResourcePicker",
      "ResourceGallery",
      "StoryboardSceneList"
    ]) {
      expect(isKnownWidget(type)).toBe(true);
      expect(widgetMode(type)).toBe("write");
    }
  });

  it("gives resource widgets the trigger their editor entry emits", () => {
    // The gallery reports a selection change; the scene list writes straight to
    // the resource provider, so it has no event of its own.
    expect(WIDGET_CATALOG.ResourceGallery.trigger).toBe("change");
    expect(WIDGET_CATALOG.StoryboardSceneList.trigger).toBeUndefined();
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
    expect(WIDGET_CATALOG.Tabs.slots).toEqual(["tab1", "tab2", "tab3"]);
    expect(WIDGET_CATALOG.Accordion.slots).toEqual(["content"]);
    expect(WIDGET_CATALOG.Divider.slots).toBeUndefined();
    expect(WIDGET_CATALOG.Spacer.slots).toBeUndefined();
  });

  it("groups the multi-option and date inputs with the other write widgets", () => {
    for (const type of ["RadioGroup", "CheckboxGroup", "DateInput"]) {
      expect(widgetMode(type)).toBe("write");
      expect(WIDGET_CATALOG[type].trigger).toBe("change");
    }
    // Only the date field settles on blur, so only it can pace "on release".
    expect(WIDGET_CATALOG.DateInput.commits).toBe(true);
    expect(WIDGET_CATALOG.RadioGroup.commits).toBe(false);
  });

  it("keeps the added display widgets read-only", () => {
    for (const type of ["Alert", "CodeBlock", "List", "KeyValue", "Stat", "Download"]) {
      expect(widgetMode(type)).toBe("read");
    }
  });
});

describe("Table", () => {
  it("is a read widget, so it binds an output slot", () => {
    expect(WIDGET_CATALOG.Table).toEqual({ label: "Table", mode: "read" });
    expect(widgetMode("Table")).toBe("read");
    expect(isKnownWidget("Table")).toBe(true);
  });
});
