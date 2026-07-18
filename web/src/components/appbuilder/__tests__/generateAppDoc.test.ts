import {
  generateAppData,
  generateAppDoc,
  displayWidgetForOutput
} from "../generateAppDoc";
import { APP_DATA_VERSION } from "../appData";
import type { ComponentNode } from "../puck/puckDataOps";
import { Workflow } from "../../../stores/ApiTypes";

const makeWorkflow = (nodes: unknown[]): Workflow =>
  ({
    id: "wf1",
    name: "My App",
    access: "private",
    graph: { nodes, edges: [] }
  }) as unknown as Workflow;

const graph = [
  {
    id: "n1",
    type: "nodetool.input.StringInput",
    data: { name: "prompt", label: "Prompt", value: "hi" }
  },
  {
    id: "n2",
    type: "nodetool.input.IntegerInput",
    data: { name: "count", min: 1, max: 10, value: 3 }
  },
  {
    id: "o1",
    type: "nodetool.output.ImageOutput",
    data: { name: "picture", label: "Picture" }
  },
  {
    id: "o2",
    type: "nodetool.output.StringOutput",
    data: { name: "caption", label: "Caption" }
  }
];

const slot = (node: ComponentNode, key: string): ComponentNode[] =>
  node.props[key] as ComponentNode[];

describe("displayWidgetForOutput", () => {
  it.each([
    ["nodetool.output.ImageOutput", "Image"],
    ["nodetool.output.AudioOutput", "Audio"],
    ["nodetool.output.VideoOutput", "Video"],
    ["nodetool.output.StringOutput", "Markdown"],
    ["nodetool.output.DataframeOutput", "Json"],
    ["nodetool.output.Output", "Output"],
    ["nodetool.workflows.base_node.Preview", "Output"],
    ["nodetool.output.FloatOutput", "Json"]
  ])("%s → %s", (nodeType, widget) => {
    expect(displayWidgetForOutput(nodeType)).toBe(widget);
  });
});

describe("generateAppData", () => {
  const data = generateAppData(makeWorkflow(graph));
  const columns = data.content[0] as ComponentNode;
  const tryPanel = slot(columns, "left")[0];
  const resultsPanel = slot(columns, "right")[0];
  const tryContent = slot(tryPanel, "content");
  const resultsContent = slot(resultsPanel, "content");

  it("titles the root after the workflow", () => {
    expect(data.root.props?.title).toBe("My App");
  });

  it("wraps try/results panels in a two-column layout", () => {
    expect(columns.type).toBe("Columns");
    expect(columns.props.id).toBe("cols-main");
    expect(tryPanel.type).toBe("Container");
    expect(tryPanel.props.title).toBe("Try it");
    expect(resultsPanel.props.title).toBe("Results");
  });

  it("emits one WorkflowInput per input node, bound by name", () => {
    const inputs = tryContent.filter((n) => n.type === "WorkflowInput");
    expect(inputs.map((n) => n.props.binding)).toEqual(["prompt", "count"]);
    expect(inputs.map((n) => n.props.id)).toEqual(["in-prompt", "in-count"]);
  });

  it("ends the try panel with a Run button wired to run", () => {
    const button = tryContent[tryContent.length - 1];
    expect(button.type).toBe("Button");
    expect(button.props.id).toBe("btn-run");
    expect(button.props.events).toEqual([
      { trigger: "click", kind: "run", key: "", value: "" }
    ]);
  });

  it("starts results with a Progress widget", () => {
    expect(resultsContent[0].type).toBe("Progress");
  });

  it("emits typed display widgets bound to each output, with headings when plural", () => {
    expect(resultsContent.map((n) => n.type)).toEqual([
      "Progress",
      "Heading",
      "Image",
      "Heading",
      "Markdown"
    ]);
    const image = resultsContent[2];
    expect(image.props.binding).toBe("picture");
    expect(image.props.id).toBe("out-picture");
    const markdown = resultsContent[4];
    expect(markdown.props.binding).toBe("caption");
    expect(resultsContent[1].props.text).toBe("Picture");
  });

  it("omits headings for a single output and skips the chunk stream", () => {
    const single = generateAppData(
      makeWorkflow([
        graph[2],
        { id: "o3", type: "nodetool.output.StringOutput", data: { name: "chunk" } }
      ])
    );
    const results = slot(
      slot(single.content[0] as ComponentNode, "right")[0],
      "content"
    );
    expect(results.map((n) => n.type)).toEqual(["Progress", "Image"]);
  });

  it("is deterministic and keeps duplicate-name ids unique", () => {
    expect(generateAppData(makeWorkflow(graph))).toEqual(data);
    const dup = generateAppData(
      makeWorkflow([
        { id: "a", type: "nodetool.output.StringOutput", data: { name: "out" } },
        { id: "b", type: "nodetool.output.ImageOutput", data: { name: "out" } }
      ])
    );
    const results = slot(
      slot(dup.content[0] as ComponentNode, "right")[0],
      "content"
    );
    const ids = results.map((n) => n.props.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("generateAppDoc", () => {
  it("wraps the data in a versioned AppDocument", () => {
    const doc = generateAppDoc(makeWorkflow(graph));
    expect(doc.version).toBe(APP_DATA_VERSION);
    expect(doc.data.content).toHaveLength(1);
  });
});
