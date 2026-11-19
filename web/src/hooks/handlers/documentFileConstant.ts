import type { FileDocumentType } from "../../serverState/useProjectDocumentFile";

/** The constant node a document of a project file enters the graph as. */
export interface DocumentConstant {
  nodeType: string;
  value: { type: string; id: string; data?: null };
}

/**
 * The constant node and its ref value for a document file of `type` whose
 * row is `id`. A storyboard and a sketch ref carry `data: null`, as the
 * picker writes it.
 */
export const documentFileConstant = (
  type: FileDocumentType,
  id: string
): DocumentConstant => {
  switch (type) {
    case "workflow":
      return { nodeType: "nodetool.constant.Workflow", value: { type, id } };
    case "timeline":
      return { nodeType: "nodetool.constant.Timeline", value: { type, id } };
    case "storyboard":
      return {
        nodeType: "nodetool.constant.Storyboard",
        value: { type, id, data: null }
      };
    case "script":
      return { nodeType: "nodetool.constant.Script", value: { type, id } };
    case "application":
      return { nodeType: "nodetool.constant.Application", value: { type, id } };
    case "jsscript":
      return { nodeType: "nodetool.constant.JsScript", value: { type, id } };
    case "sketch":
      return {
        nodeType: "nodetool.constant.Sketch",
        value: { type, id, data: null }
      };
  }
};
