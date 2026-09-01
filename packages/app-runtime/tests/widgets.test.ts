import { describe, expect, it } from "vitest";

import {
  WIDGET_CATALOG,
  isKnownWidget,
  widgetBindingProps,
  widgetFields,
  widgetMode,
  widgetSlots
} from "../src/widgets.js";

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

  it("declares the chat and AI widgets with the bindings they carry", () => {
    expect(widgetMode("ChatThread")).toBe("read");
    expect(widgetBindingProps("ChatThread")).toEqual([
      { prop: "streamBinding", mode: "read" }
    ]);
    expect(widgetMode("ChatComposer")).toBe("write");
    expect(WIDGET_CATALOG.ChatComposer.trigger).toBe("click");
    expect(widgetBindingProps("ChatComposer")).toEqual([
      { prop: "historyBinding", mode: "read" }
    ]);
    expect(widgetMode("ModelSelect")).toBe("write");
    expect(WIDGET_CATALOG.ModelSelect.trigger).toBe("change");
  });

  it("declares the sketch and timeline widgets as single-binding displays", () => {
    for (const type of ["Sketch", "Timeline"]) {
      expect(widgetMode(type)).toBe("read");
      expect(widgetBindingProps(type)).toEqual([]);
      expect(WIDGET_CATALOG[type].trigger).toBeUndefined();
      // Neither renders formattable text, so the editor must not offer the
      // format template — it would silently replace the document preview.
      expect(WIDGET_CATALOG[type].format).toBeUndefined();
      expect(widgetFields(type)).not.toHaveProperty("format");
    }
  });

  it("declares the sketch pad as an image input that settles", () => {
    // The pad is a write widget like the pickers, but unlike them a stroke ends
    // on pointer-up — which is what makes "on release" pacing offerable.
    expect(widgetMode("SketchPad")).toBe("write");
    expect(WIDGET_CATALOG.SketchPad.trigger).toBe("change");
    expect(WIDGET_CATALOG.SketchPad.commits).toBe(true);
    expect(widgetBindingProps("SketchPad")).toEqual([]);
    // It draws rather than renders text, so a format template has nothing to
    // rewrite and the editor must not offer one.
    expect(WIDGET_CATALOG.SketchPad.format).toBeUndefined();
    expect(widgetFields("SketchPad")).not.toHaveProperty("format");
    expect(widgetFields("SketchPad")).toMatchObject({
      width: "number",
      height: "number",
      background: "select"
    });
  });

  it("reports no extra bindings for a widget that binds once", () => {
    expect(widgetBindingProps("Text")).toEqual([]);
    expect(widgetBindingProps("Bogus")).toEqual([]);
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

  it("declares a display widget for every result shape a run can emit", () => {
    // A 3D result, a plotted series, a PDF and a batch of images each used to
    // land in Json or Output, which render them as an opaque ref.
    for (const type of ["Model3D", "Chart", "PDF", "Gallery"]) {
      expect(widgetMode(type)).toBe("read");
      expect(WIDGET_CATALOG[type].trigger).toBeUndefined();
      // None renders formattable text, so a template would replace the preview.
      expect(WIDGET_CATALOG[type].format).toBeUndefined();
      expect(widgetFields(type)).toHaveProperty("placeholder", "text");
    }
  });

  it("declares an input widget for every input node kind an app can bind", () => {
    for (const type of [
      "DataFrameInput",
      "FilePathInput",
      "FolderPathInput",
      "Model3DInput",
      "ImageSizeInput",
      "MediaListInput"
    ]) {
      expect(widgetMode(type)).toBe("write");
      expect(WIDGET_CATALOG[type].trigger).toBe("change");
      expect(widgetFields(type)).toHaveProperty("events", "array");
    }
    // The typed fields settle on blur; the pickers write a whole value at once.
    expect(WIDGET_CATALOG.FilePathInput.commits).toBe(true);
    expect(WIDGET_CATALOG.FolderPathInput.commits).toBe(true);
    expect(WIDGET_CATALOG.DataFrameInput.commits).toBe(true);
    expect(WIDGET_CATALOG.Model3DInput.commits).toBe(false);
    expect(WIDGET_CATALOG.MediaListInput.commits).toBe(false);
  });

  it("puts the list kind on one widget rather than four palette entries", () => {
    expect(widgetFields("MediaListInput").listKind).toBe("select");
  });
});

describe("Table", () => {
  it("is a read widget, so it binds an output slot", () => {
    expect(WIDGET_CATALOG.Table.label).toBe("Table");
    expect(widgetMode("Table")).toBe("read");
    expect(isKnownWidget("Table")).toBe(true);
  });
});

describe("widgetFields", () => {
  it("appends the logic props every bindable widget carries", () => {
    expect(widgetFields("Heading")).toEqual({
      text: "text",
      level: "select",
      binding: "custom",
      visibleWhen: "custom",
      disabledWhen: "custom",
      format: "text"
    });
  });

  it("omits the format template on widgets that render no formattable value", () => {
    // A media widget shows a ref, not text — a template has nothing to rewrite.
    expect(widgetFields("Image").format).toBeUndefined();
    expect(widgetFields("Image").visibleWhen).toBe("custom");
    expect(widgetFields("Slider").format).toBeUndefined();
  });

  it("gives layout widgets their own fields only", () => {
    expect(widgetFields("Columns")).toEqual({
      gap: "number",
      left: "slot",
      right: "slot"
    });
    expect(widgetFields("Divider")).toEqual({});
  });

  it("declares fields for every widget in the catalog", () => {
    for (const [type, descriptor] of Object.entries(WIDGET_CATALOG)) {
      expect(descriptor.fields, type).toBeDefined();
      // Slots are children props, so each one must be a declared slot field.
      for (const slot of widgetSlots(type)) {
        expect(descriptor.fields[slot], `${type}.${slot}`).toBe("slot");
      }
    }
  });

  it("reports no fields for an unknown type rather than throwing", () => {
    expect(widgetFields("Bogus")).toEqual({});
    expect(widgetSlots("Bogus")).toEqual([]);
  });
});
