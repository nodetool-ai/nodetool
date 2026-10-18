import type { AppSpec } from "../../../../utils/applicationBuild";
import {
  appSpecGaps,
  clearAppSetupDraft,
  describeInteraction,
  emptyAppSetupDraft,
  readAppSetupDraft,
  renameWidget,
  sweepClosedAppDrafts,
  writeAppSetupDraft
} from "../appSetupModel";

const spec = (over: Partial<AppSpec> = {}): AppSpec => ({
  title: "Triage",
  operations: [
    {
      id: "classify",
      objective: "Classify the message",
      inputs: [{ name: "message", type: "string", example: "hi" }],
      outputs: [{ name: "category", type: "string" }],
      streaming: false
    }
  ],
  variables: [],
  widgets: [
    {
      role: "message-input",
      type: "TextInput",
      binding: "op:classify/in:message",
      label: "Message"
    },
    { role: "go", type: "Button", binding: "", label: "Triage" },
    {
      role: "category-output",
      type: "Text",
      binding: "op:classify/out:category",
      label: "Category"
    }
  ],
  interactions: [
    {
      name: "triage-once",
      steps: [{ change: "message-input", value: "hi" }, { click: "Triage" }],
      expect: [{ widget: "Category", check: "nonEmpty" }]
    }
  ],
  ...over
});

beforeEach(() => window.localStorage.clear());

describe("appSpecGaps", () => {
  it("finds nothing missing in a complete design", () => {
    expect(appSpecGaps(spec())).toEqual([]);
  });

  it("names an empty title, an empty objective and a repeated label", () => {
    const base = spec();
    const gaps = appSpecGaps({
      ...base,
      title: " ",
      operations: [{ ...base.operations[0], objective: "" }],
      widgets: base.widgets.map((widget) =>
        widget.role === "go" ? { ...widget, label: "Message" } : widget
      )
    });
    expect(gaps).toEqual([
      "a title",
      "what Classify does",
      'a different label for the second "Message"'
    ]);
  });

  it("does not ask what a bound workflow does", () => {
    const base = spec();
    expect(
      appSpecGaps({
        ...base,
        operations: [{ ...base.operations[0], objective: "", workflowId: "w1" }]
      })
    ).toEqual([]);
  });
});

describe("renameWidget", () => {
  it("renames the widget and moves label references to its role", () => {
    const renamed = renameWidget(renameWidget(spec(), "go", "Sort it"), "category-output", "Kind");
    expect(renamed.widgets.map((widget) => widget.label)).toEqual([
      "Message",
      "Sort it",
      "Kind"
    ]);
    expect(renamed.interactions[0].steps).toEqual([
      { change: "message-input", value: "hi" },
      { click: "go" }
    ]);
    expect(renamed.interactions[0].expect[0].widget).toBe("category-output");
  });

  it("leaves references by role alone", () => {
    const renamed = renameWidget(spec(), "message-input", "Paste here");
    expect(renamed.interactions[0].steps[0]).toEqual({
      change: "message-input",
      value: "hi"
    });
  });
});

it("describes an interaction in words", () => {
  const value = spec();
  expect(describeInteraction(value, value.interactions[0])).toBe(
    "Change Message, then press Triage; Category must show a result."
  );
});

describe("the draft", () => {
  it("reads back what was written", () => {
    const draft = {
      ...emptyAppSetupDraft("a triage page"),
      stage: "review" as const,
      spec: spec(),
      specBrief: "a triage page"
    };
    writeAppSetupDraft("k1", draft);
    expect(readAppSetupDraft("k1")).toEqual(draft);
  });

  it("returns to the idea when the stored spec is unusable", () => {
    writeAppSetupDraft("k1", {
      ...emptyAppSetupDraft("x"),
      stage: "build",
      spec: { title: "broken" } as unknown as AppSpec
    });
    expect(readAppSetupDraft("k1")?.stage).toBe("idea");
    expect(readAppSetupDraft("k1")?.spec).toBeNull();
  });

  it("sweeps only drafts of guided tabs that closed", () => {
    const open = "11111111-1111-4111-8111-111111111111";
    const closed = "22222222-2222-4222-8222-222222222222";
    for (const key of [open, closed, "projectid0123"]) {
      writeAppSetupDraft(key, emptyAppSetupDraft(key));
    }
    sweepClosedAppDrafts(new Set([open]));
    expect(readAppSetupDraft(open)).not.toBeNull();
    expect(readAppSetupDraft(closed)).toBeNull();
    expect(readAppSetupDraft("projectid0123")).not.toBeNull();
    clearAppSetupDraft(open);
    expect(readAppSetupDraft(open)).toBeNull();
  });
});
