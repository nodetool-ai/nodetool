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
    left?: Component[];
    right?: Component[];
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
  it("carries ordered creator and product references into one testimonial", () => {
    const bundle = read<AppBundle>("apps/ugc-product-video.app.json");
    const operations = new Map(
      bundle.app.operations.map((operation) => [operation.id, operation])
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
    expect([...operations.keys()]).toEqual(["copy", "creator"]);
  });

  it("guards every run and exposes every failure", () => {
    const bundle = read<AppBundle>("apps/ugc-product-video.app.json");
    const components = flatten(bundle.app.ui.content);
    const buttons = components.filter((component) => component.type === "Button");

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
      "op:creator/exec#error"
    ]);
  });

  it("uses MiniMax H3 reference-to-video on AtlasCloud", () => {
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
    const generator = workflow.graph.nodes.find((node) => node.id === "generate");

    expect(generator?.type).toBe("nodetool.video.ReferenceToVideo");
    expect(generator?.data).toMatchObject({
      duration: 15,
      aspect_ratio: "9:16",
      resolution: "768P",
      model: {
        provider: "atlascloud",
        id: "minimax/h3/reference-to-video",
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
    const generator = workflow.graph.nodes.find((node) => node.id === "generate");

    expect(prompt?.data?.string).toContain("[0.0-4.5s]");
    expect(prompt?.data?.string).toContain("[4.5-7.0s]");
    expect(prompt?.data?.string).toContain("[7.0-15.0s]");
    expect(prompt?.data?.string).toContain("product and hands fully out of frame");
    expect(generator?.data?.negative_prompt).toContain(
      "product visible after 7 seconds"
    );
  });
});
