import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { compileRealtimeGraph, PLAN_SCHEMA } from "../src/index.js";
import type { CompileInput } from "../src/index.js";
import { alphaFixture, fixture } from "./fixtures/RenderGraph.js";

const validate = new Ajv2020({ strict: true }).compile(PLAN_SCHEMA);
function success(input: CompileInput) {
  const result = compileRealtimeGraph(input);
  if (result.status !== "ok") { throw new Error(JSON.stringify(result.diagnostics)); }
  expect(validate(result.plan), JSON.stringify(validate.errors)).toBe(true);
  return result;
}
describe("straight-alpha ingress", () => {
  it("inserts a stable explicit conversion before a premultiplied consumer", async () => {
    const input = alphaFixture(); const result = success(input);
    await expect(JSON.stringify(result.plan, null, 2) + "\n").toMatchFileSnapshot("fixtures/render-alpha-plan.json");
    expect(result.plan.render.passes.map((pass) => pass.module)).toEqual(["alpha.straightToPremul@1", "color.invert@1"]);
    expect(result.plan.render.passes[0]).toMatchObject({ retention: "retained", uniforms: [], output: { alpha: "premultiplied", colorSpace: "srgb", size: { kind: "input", input: "source", scale: 1 } } });
    expect(result.plan.slots[0].output.alpha).toBe("straight");
    expect(result.boundaries).toHaveLength(1);
    expect(success({ ...input, revision: 2 }).plan.render).toEqual(result.plan.render);
    expect(success({ ...input, graph: { nodes: [...input.graph.nodes].reverse(), edges: [...input.graph.edges].reverse() } }).plan).toEqual(result.plan);
  });
  it("reuses a conversion when two live inputs consume the same straight texture", () => {
    const input = alphaFixture(); const descriptors = new Map(input.descriptors);
    const invert = descriptors.get("invert");
    if (invert?.kind !== "shader") { throw new Error("Missing shader fixture"); }
    descriptors.set("pair", { ...invert, module: "test.pair@1", textureInputs: {
      left: { alpha: "premultiplied", colorSpace: "srgb" }, right: { alpha: "premultiplied", colorSpace: "srgb" }
    } });
    const graph = { nodes: input.graph.nodes.map((node) => node.id === "invert" ? { ...node, type: "pair" } : node), edges: [
      { source: "batch", sourceHandle: "image", target: "invert", targetHandle: "left" },
      { source: "batch", sourceHandle: "image", target: "invert", targetHandle: "right" },
      { source: "invert", sourceHandle: "image", target: "out", targetHandle: "image" }
    ] };
    const plan = success({ ...input, graph, descriptors }).plan;
    expect(plan.render.passes).toHaveLength(2);
    expect(plan.render.passes[1].inputs.left).toBe(plan.render.passes[1].inputs.right);
  });
  it("rejects unsupported conversion formats/directions and synthetic identity collisions", () => {
    const input = alphaFixture(); const slot = input.batchTextures?.[0];
    if (!slot) { throw new Error("Missing slot fixture"); }
    expect(compileRealtimeGraph({ ...input, batchTextures: [{ ...slot, texture: { ...slot.texture, format: "rgba16float" } }] }))
      .toMatchObject({ status: "error", diagnostics: [{ node: "invert", reason: "alpha_conversion_required" }] });
    const premul = fixture(); const descriptors = new Map(premul.descriptors);
    const invert = descriptors.get("invert");
    if (invert?.kind !== "shader") { throw new Error("Missing shader fixture"); }
    descriptors.set("invert", { ...invert, textureInputs: { source: { alpha: "straight", colorSpace: "srgb" } } });
    expect(compileRealtimeGraph({ ...premul, descriptors }))
      .toMatchObject({ status: "error", diagnostics: [{ node: "invert", reason: "alpha_conversion_required" }] });
    expect(compileRealtimeGraph({ ...input, graph: { ...input.graph, nodes: [...input.graph.nodes, { id: "@alpha:batch:image", type: "unused" }] } }))
      .toMatchObject({ status: "error", diagnostics: [{ node: "batch", reason: "identity_collision" }] });
  });
});
