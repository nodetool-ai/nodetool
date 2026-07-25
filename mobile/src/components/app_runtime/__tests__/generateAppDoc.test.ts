import type { Workflow } from "../../../types/workflow";
import { displayWidgetForOutput, generateAppDoc } from "../generateAppDoc";

const workflow = (nodes: unknown[]): Workflow =>
  ({
    id: "wf1",
    name: "My App",
    description: "",
    graph: { nodes, edges: [] },
  }) as unknown as Workflow;

interface Node {
  type: string;
  props: Record<string, unknown>;
}

describe("displayWidgetForOutput", () => {
  it("picks a display widget from the output node type", () => {
    expect(displayWidgetForOutput("nodetool.output.ImageOutput")).toBe("Image");
    expect(displayWidgetForOutput("nodetool.output.AudioOutput")).toBe("Audio");
    expect(displayWidgetForOutput("nodetool.output.VideoOutput")).toBe("Video");
    expect(displayWidgetForOutput("nodetool.output.StringOutput")).toBe(
      "Markdown"
    );
    expect(displayWidgetForOutput("nodetool.output.DataframeOutput")).toBe(
      "Json"
    );
    expect(displayWidgetForOutput("nodetool.workflows.base_node.Preview")).toBe(
      "Output"
    );
  });
});

describe("generateAppDoc", () => {
  const doc = generateAppDoc(
    workflow([
      {
        id: "n1",
        type: "nodetool.input.StringInput",
        data: { name: "prompt" },
      },
      {
        id: "o1",
        type: "nodetool.output.ImageOutput",
        data: { name: "image" },
      },
    ])
  );

  const panels = doc.ui.content as Node[];

  it("binds one operation to the host workflow", () => {
    expect(doc.operations).toEqual([
      expect.objectContaining({ id: "main", workflowId: "wf1" }),
    ]);
  });

  it("titles the app after the workflow", () => {
    expect(doc.ui.root.props?.title).toBe("My App");
  });

  it("stacks an inputs panel and a results panel", () => {
    expect(panels.map((p) => p.type)).toEqual(["Container", "Container"]);
    expect(panels.map((p) => p.props.title)).toEqual(["Try it", "Results"]);
  });

  it("gives every input a widget and adds a run button", () => {
    const content = panels[0].props.content as Node[];
    expect(content.map((c) => c.type)).toEqual(["WorkflowInput", "Button"]);
    expect(content[0].props.binding).toBe("prompt");
    expect(content[1].props.events).toEqual([
      expect.objectContaining({ trigger: "click", kind: "run" }),
    ]);
  });

  it("gives every output a display widget bound to its name", () => {
    const content = panels[1].props.content as Node[];
    expect(content.map((c) => c.type)).toEqual(["Progress", "Image"]);
    expect(content[1].props.binding).toBe("image");
  });

  it("keeps ids unique when two nodes slug the same", () => {
    const generated = generateAppDoc(
      workflow([
        { id: "a", type: "nodetool.input.StringInput", data: { name: "a b" } },
        { id: "b", type: "nodetool.input.StringInput", data: { name: "a-b" } },
      ])
    );
    const content = (generated.ui.content as Node[])[0].props
      .content as Node[];
    const ids = content.map((c) => c.props.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
