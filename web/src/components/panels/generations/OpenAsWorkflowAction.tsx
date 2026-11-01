import { useTranslation } from "react-i18next";
import { renderedWorkflow, type PresetMode } from "@nodetool-ai/presets";
import { OpenGraphAsWorkflow } from "../../storyboard/OpenRenderAsWorkflow";
import { generationToWorkflowGraph } from "../../create/createActions";
import type { GenerationActivity } from "../../../stores/GenerationActivityStore";

interface OpenAsWorkflowActionProps {
  generation: GenerationActivity;
  presetIds: readonly string[];
}

export default function OpenAsWorkflowAction({
  generation,
  presetIds
}: OpenAsWorkflowActionProps) {
  const { t } = useTranslation();
  return (
    <OpenGraphAsWorkflow
      build={() => {
        const request = generation.request;
        if (!request) throw new Error(t("ejection.unavailable"));
        if (generation.channel === "prediction") {
          if (
            typeof request.provider !== "string" ||
            typeof request.mode !== "string" ||
            !generation.model ||
            generation.prompt === null
          ) {
            throw new Error(t("ejection.unavailable"));
          }
          return renderedWorkflow(
            {
              model: { provider: request.provider, id: generation.model },
              mode: request.mode as PresetMode
            },
            generation.prompt,
            request.params as Record<string, unknown>
          );
        }
        const graph = generationToWorkflowGraph({
          key: generation.id,
          kind: generation.kind,
          status: generation.status,
          prompt: generation.prompt,
          model: generation.model,
          presetIds: [...presetIds],
          assetId: generation.assetIds[0] ?? null,
          asset: null,
          createdAt: generation.startedAt,
          error: generation.error,
          generation,
          request
        });
        return {
          nodes: graph.nodes.map((node) => ({
            ...node,
            data: node.data ?? {},
            position: node.ui_properties?.position ?? { x: 0, y: 0 }
          })),
          edges: graph.edges
        };
      }}
    />
  );
}
