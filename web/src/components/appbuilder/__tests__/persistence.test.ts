import { loadAppSpec, hasAppSpec, withAppSpec } from "../persistence";
import {
  createEmptyAppSpec,
  APP_SPEC_SETTINGS_KEY,
  AppSpec
} from "../appSchema";
import { Workflow } from "../../../stores/ApiTypes";

const makeWorkflow = (settings: Workflow["settings"]): Workflow =>
  ({
    id: "wf1",
    name: "Test",
    access: "private",
    graph: { nodes: [], edges: [] },
    settings
  }) as unknown as Workflow;

const sampleSpec = (): AppSpec => ({
  ...createEmptyAppSpec("App"),
  widgets: [
    { id: "a", type: "button", layout: { x: 0, y: 0, w: 3, h: 1 }, props: { label: "Go" } }
  ]
});

describe("appbuilder persistence", () => {
  it("round-trips a spec through settings", () => {
    const spec = sampleSpec();
    const settings = withAppSpec(null, spec);
    const stored = (settings as Record<string, unknown>)[APP_SPEC_SETTINGS_KEY];
    expect(typeof stored).toBe("string");

    const workflow = makeWorkflow(settings);
    const loaded = loadAppSpec(workflow);
    expect(loaded).not.toBeNull();
    expect(loaded!.widgets).toHaveLength(1);
    expect(loaded!.widgets[0].props.label).toBe("Go");
  });

  it("returns null when there is no spec", () => {
    expect(loadAppSpec(makeWorkflow(null))).toBeNull();
    expect(loadAppSpec(makeWorkflow({ other: "x" }))).toBeNull();
    expect(hasAppSpec(makeWorkflow(null))).toBe(false);
  });

  it("returns null on malformed JSON", () => {
    const workflow = makeWorkflow({ [APP_SPEC_SETTINGS_KEY]: "{not json" });
    expect(loadAppSpec(workflow)).toBeNull();
  });

  it("removes the spec when passed null while preserving other settings", () => {
    const withSpec = withAppSpec({ keep: "yes" }, sampleSpec());
    const without = withAppSpec(withSpec, null);
    expect((without as Record<string, unknown>)[APP_SPEC_SETTINGS_KEY]).toBeUndefined();
    expect((without as Record<string, unknown>).keep).toBe("yes");
  });

  it("hasAppSpec is true only with renderable widgets", () => {
    const empty = makeWorkflow(withAppSpec(null, createEmptyAppSpec()));
    expect(hasAppSpec(empty)).toBe(false);
    const populated = makeWorkflow(withAppSpec(null, sampleSpec()));
    expect(hasAppSpec(populated)).toBe(true);
  });
});
