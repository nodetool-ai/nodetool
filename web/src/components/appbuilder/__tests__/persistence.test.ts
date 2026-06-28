import {
  loadAppData,
  loadAppDocument,
  hasAppSpec,
  withAppDocument
} from "../persistence";
import {
  APP_DATA_SETTINGS_KEY,
  AppDocument,
  APP_DATA_VERSION
} from "../appData";
import { Workflow } from "../../../stores/ApiTypes";

const makeWorkflow = (settings: Workflow["settings"]): Workflow =>
  ({
    id: "wf1",
    name: "Test",
    access: "private",
    graph: { nodes: [], edges: [] },
    settings
  }) as unknown as Workflow;

const sampleDoc = (): AppDocument => ({
  version: APP_DATA_VERSION,
  data: {
    root: { props: { title: "App" } },
    content: [{ type: "Button", props: { id: "b1", label: "Go" } }],
    zones: {}
  }
});

describe("appbuilder persistence", () => {
  it("round-trips a Puck document through settings", () => {
    const settings = withAppDocument(null, sampleDoc());
    const stored = (settings as Record<string, unknown>)[APP_DATA_SETTINGS_KEY];
    expect(typeof stored).toBe("string");

    const workflow = makeWorkflow(settings);
    const doc = loadAppDocument(workflow);
    expect(doc).not.toBeNull();
    expect(doc!.data.content).toHaveLength(1);

    const data = loadAppData(workflow);
    expect(data!.content[0].props.label).toBe("Go");
    expect(hasAppSpec(workflow)).toBe(true);
  });

  it("returns null when there is no document", () => {
    expect(loadAppData(makeWorkflow(null))).toBeNull();
    expect(loadAppData(makeWorkflow({ other: "x" }))).toBeNull();
    expect(hasAppSpec(makeWorkflow(null))).toBe(false);
  });

  it("returns null on malformed JSON", () => {
    const workflow = makeWorkflow({ [APP_DATA_SETTINGS_KEY]: "{bad" });
    expect(loadAppData(workflow)).toBeNull();
  });

  it("removes the document when passed null and keeps other settings", () => {
    const withDoc = withAppDocument({ keep: "yes" }, sampleDoc());
    const without = withAppDocument(withDoc, null);
    expect(
      (without as Record<string, unknown>)[APP_DATA_SETTINGS_KEY]
    ).toBeUndefined();
    expect((without as Record<string, unknown>).keep).toBe("yes");
  });
});
