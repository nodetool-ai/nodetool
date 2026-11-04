import { filterWorkflowNodeMetadata } from "../filterWorkflowNodeMetadata";
import type { NodeMetadata } from "../../stores/ApiTypes";

const metadata = [
  { node_type: "nodetool.torch.Input" },
  { node_type: "nodetool.torch.Add" },
  { node_type: "nodetool.input.Float" }
] as unknown as NodeMetadata[];

it("keeps Torch and actor palettes separate", () => {
  expect(
    filterWorkflowNodeMetadata(metadata, "torch").map((node) => node.node_type)
  ).toEqual(["nodetool.torch.Input", "nodetool.torch.Add"]);
  expect(
    filterWorkflowNodeMetadata(metadata, "workflow").map(
      (node) => node.node_type
    )
  ).toEqual(["nodetool.input.Float"]);
});
