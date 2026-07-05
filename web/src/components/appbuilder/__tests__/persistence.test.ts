import {
  loadAppData,
  loadAppDocument,
  hasAppSpec,
  toAppDocField
} from "../persistence";
import { AppDocument, APP_DATA_VERSION } from "../appData";
import { Workflow } from "../../../stores/ApiTypes";

const makeWorkflow = (app_doc: Workflow["app_doc"]): Workflow =>
  ({
    id: "wf1",
    name: "Test",
    access: "private",
    graph: { nodes: [], edges: [] },
    app_doc
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
  it("round-trips a Puck document through the app_doc field", () => {
    const app_doc = toAppDocField(sampleDoc());
    expect(typeof app_doc).toBe("object");

    const workflow = makeWorkflow(app_doc);
    const doc = loadAppDocument(workflow);
    expect(doc).not.toBeNull();
    expect(doc!.data.content).toHaveLength(1);

    const data = loadAppData(workflow);
    expect(data!.content[0].props.label).toBe("Go");
    expect(hasAppSpec(workflow)).toBe(true);
  });

  it("returns null when there is no document", () => {
    expect(loadAppData(makeWorkflow(null))).toBeNull();
    expect(loadAppData(makeWorkflow({ not: "a doc" }))).toBeNull();
    expect(hasAppSpec(makeWorkflow(null))).toBe(false);
  });

  it("toAppDocField returns null when clearing", () => {
    expect(toAppDocField(null)).toBeNull();
  });
});
