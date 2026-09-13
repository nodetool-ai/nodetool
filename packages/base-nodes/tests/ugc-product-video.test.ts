import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface Component {
  type: string;
  props: {
    binding?: string;
    content?: Component[];
    disabledWhen?: { binding?: string; op?: string };
    events?: Array<{ kind: string; operationId?: string }>;
    label?: string;
    left?: Component[];
    modelKind?: string;
    options?: Array<{ value: string }>;
    right?: Component[];
    title?: string;
  };
}

interface WorkflowNode {
  id: string;
  type: string;
  data?: {
    code?: string;
    name?: string;
    value?: unknown;
    [key: string]: unknown;
  };
}

interface AppBundle {
  app: {
    ui: { content: Component[] };
    operations: Array<{
      id: string;
      inputs: Record<string, { variableId?: string }>;
      outputs: Record<string, { variableId?: string }>;
    }>;
  };
  workflows: Array<{
    key: string;
    graph: { nodes: WorkflowNode[] };
  }>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = path.resolve(__dirname, "../nodetool/examples");

function read<T>(relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(EXAMPLES, relativePath), "utf8")
  ) as T;
}

function flatten(components: Component[]): Component[] {
  return components.flatMap((component) => [
    component,
    ...flatten(component.props.content ?? []),
    ...flatten(component.props.left ?? []),
    ...flatten(component.props.right ?? [])
  ]);
}

describe("UGC Product Video recipe", () => {
  it("binds the generated testimonial and finish controls", () => {
    const bundle = read<AppBundle>("apps/ugc-product-video.app.json");
    const operations = new Map(
      bundle.app.operations.map((operation) => [operation.id, operation])
    );
    const components = flatten(bundle.app.ui.content);
    const finishWorkflow = bundle.workflows.find(
      (workflow) => workflow.key === "brand"
    );
    const finishInputs = new Map(
      finishWorkflow?.graph.nodes
        .filter((node) => node.type.startsWith("nodetool.input."))
        .map((node) => [node.data?.name, node]) ?? []
    );

    expect(operations.get("creator")?.inputs["creator-image"]?.variableId).toBe(
      "creatorImage"
    );
    expect(operations.get("creator")?.inputs["product-image"]?.variableId).toBe(
      "productImage"
    );
    expect(operations.get("creator")?.outputs["video-out"]?.variableId).toBe(
      "creatorClip"
    );
    expect(
      operations.get("brand")?.inputs[
        finishInputs.get("creator_clip")?.id ?? ""
      ]?.variableId
    ).toBe("creatorClip");
    expect(
      operations.get("brand")?.inputs[finishInputs.get("brand")?.id ?? ""]
        ?.variableId
    ).toBe("brand");
    expect(
      operations.get("brand")?.inputs[finishInputs.get("slogan")?.id ?? ""]
        ?.variableId
    ).toBe("slogan");
    const videoOutput = finishWorkflow?.graph.nodes.find(
      (node) =>
        node.type === "nodetool.output.Output" && node.data?.name === "video"
    );
    expect(
      operations.get("brand")?.outputs[videoOutput?.id ?? ""]?.variableId
    ).toBe("finalVideo");

    const captionStyle = components.find(
      (component) =>
        component.type === "Select" && component.props.label === "Caption style"
    );
    expect(captionStyle).toMatchObject({
      props: {
        binding: `op:brand/in:${finishInputs.get("caption_style")?.id}`,
        options: [{ value: "Polished" }, { value: "Minimal" }]
      }
    });
    expect(
      components.find(
        (component) =>
          component.type === "ColorInput" &&
          component.props.label === "Brand accent (optional)"
      )?.props.binding
    ).toBe(`op:brand/in:${finishInputs.get("brand_accent")?.id}`);
    expect(
      components.find(
        (component) =>
          component.type === "ModelSelect" &&
          component.props.label === "Video model"
      )
    ).toMatchObject({
      props: {
        binding: "op:creator/prop:generate#model",
        modelKind: "video_model"
      }
    });
    expect(
      components.find(
        (component) => component.props.label === "Add motion + captions"
      )?.props.events
    ).toEqual([expect.objectContaining({ kind: "run", operationId: "brand" })]);
    expect(
      components.some(
        (component) =>
          component.type === "Container" &&
          component.props.title === "3 · Finish the Reel"
      )
    ).toBe(true);
    expect([...operations.keys()]).toEqual(["copy", "creator", "brand"]);
  });

  it("guards every run and exposes every failure", () => {
    const bundle = read<AppBundle>("apps/ugc-product-video.app.json");
    const components = flatten(bundle.app.ui.content);
    const buttons = components.filter(
      (component) => component.type === "Button"
    );

    for (const button of buttons) {
      const [run] = (button.props.events ?? []).filter(
        (event) => event.kind === "run"
      );
      expect(run?.operationId).toBeTruthy();
      expect(button.props.disabledWhen).toEqual({
        binding: `op:${run?.operationId}/exec#running`,
        op: "notEmpty"
      });
    }

    const errorBindings = components
      .filter((component) => component.type === "Alert")
      .map((component) => component.props.binding);
    expect(errorBindings).toEqual([
      "op:copy/exec#error",
      "op:creator/exec#error",
      "op:brand/exec#error"
    ]);
  });

  it("transcribes the clip and builds timed caption and brand motion", () => {
    const workflow = read<{
      graph: {
        nodes: WorkflowNode[];
      };
    }>("nodetool-base/Brand a UGC Product Video.json");
    const inputs = new Map(
      workflow.graph.nodes
        .filter((node) => node.type.startsWith("nodetool.input."))
        .map((node) => [node.data?.name, node])
    );
    const timelineCode = workflow.graph.nodes
      .map((node) => node.data?.code)
      .filter((code): code is string => typeof code === "string")
      .join("\n");

    expect(inputs.get("caption_style")).toMatchObject({
      type: "nodetool.input.SelectInput",
      data: { value: "Polished" }
    });
    expect(inputs.get("brand_accent")).toMatchObject({
      type: "nodetool.input.ColorInput",
      data: { value: { type: "color", value: "#C0D28C" } }
    });
    expect(
      workflow.graph.nodes.some(
        (node) => node.type === "openai.audio.Transcribe"
      )
    ).toBe(true);
    expect(timelineCode).toContain("activeColor");
    expect(timelineCode).toContain("brandAccent");
    expect(timelineCode).toContain("openingBug");
    expect(timelineCode).toContain("dailyRitual");
    expect(timelineCode).toContain("closingPanel");
    expect(timelineCode).toContain("11_750");
    expect(timelineCode).toContain("12_300");
    expect(timelineCode).toContain("15_083");
    expect(timelineCode).not.toContain("nextStartMs - 42");
    expect(timelineCode).not.toContain("caption-pop-");
  });

  it("keeps the Seedance-ready reference-to-video model selectable", () => {
    const workflow = read<{
      graph: {
        nodes: Array<{
          id: string;
          type: string;
          data?: {
            duration?: number;
            aspect_ratio?: string;
            resolution?: string;
            model?: {
              provider?: string;
              id?: string;
              supported_tasks?: string[];
            };
          };
        }>;
        edges: Array<{
          source: string;
          target: string;
          targetHandle: string;
        }>;
      };
    }>("nodetool-base/Generate a Native-Audio UGC Testimonial.json");
    const generator = workflow.graph.nodes.find(
      (node) => node.id === "generate"
    );

    expect(generator?.type).toBe("nodetool.video.ReferenceToVideo");
    expect(generator?.data).toMatchObject({
      duration: 15,
      aspect_ratio: "9:16",
      resolution: "720p",
      model: {
        provider: "",
        id: "",
        supported_tasks: ["reference_to_video"]
      }
    });
    expect(workflow.graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "creator-image",
          target: "references",
          targetHandle: "image_1_creator"
        }),
        expect.objectContaining({
          source: "product-image",
          target: "references",
          targetHandle: "image_2_product"
        }),
        expect.objectContaining({
          source: "references",
          target: "generate",
          targetHandle: "reference_images"
        }),
        expect.objectContaining({
          source: "prompt",
          target: "generate",
          targetHandle: "prompt"
        })
      ])
    );
  });

  it("limits the cup to one 2.5-second middle beat", () => {
    const workflow = read<{
      graph: {
        nodes: Array<{
          id: string;
          type: string;
          data?: {
            string?: string;
            negative_prompt?: string;
          };
        }>;
      };
    }>("nodetool-base/Generate a Native-Audio UGC Testimonial.json");
    const prompt = workflow.graph.nodes.find((node) => node.id === "prompt");
    const generator = workflow.graph.nodes.find(
      (node) => node.id === "generate"
    );

    expect(prompt?.data?.string).toContain("[0.0-4.5s]");
    expect(prompt?.data?.string).toContain("[4.5-7.0s]");
    expect(prompt?.data?.string).toContain("[7.0-15.0s]");
    expect(prompt?.data?.string).toContain(
      "product and hands fully out of frame"
    );
    expect(prompt?.data?.string).toContain("product after 7.0s");
    expect(prompt?.data?.string).toContain("small spontaneous blinks");
    expect(generator?.data?.negative_prompt).toBe("");
  });
});
