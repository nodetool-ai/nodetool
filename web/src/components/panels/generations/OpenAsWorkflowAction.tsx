import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import {
  renderedWorkflow,
  type PresetMode,
  type PresetWorkflowGraph
} from "@nodetool-ai/presets";
import { ToolbarIconButton } from "../../ui_primitives";
import { OpenGraphAsWorkflow } from "../../storyboard/OpenRenderAsWorkflow";
import { generationToWorkflowGraph } from "../../create/createActions";
import { useOpenPresetAsWorkflow } from "../../../hooks/presets/useOpenPresetAsWorkflow";
import {
  getRememberedModel,
  type ModelKind
} from "../../../stores/lastModelStore";
import type { GenerationActivity } from "../../../stores/GenerationActivityStore";

interface OpenAsWorkflowActionProps {
  generation: GenerationActivity;
  presetIds: readonly string[];
}

/** The provider of a model the app remembers using, for a model id alone. */
const rememberedProvider = (
  kind: ModelKind,
  model: string | null
): string | null => {
  const remembered = getRememberedModel(kind);
  return model && remembered?.model === model && remembered.provider
    ? remembered.provider
    : null;
};

/**
 * A generation with no recorded request, such as a chat turn or an older entry.
 * Its presets still open as a workflow, with the model when the app knows it.
 */
const OpenPresetsAsWorkflow = ({
  generation,
  presetIds
}: OpenAsWorkflowActionProps) => {
  const { t } = useTranslation();
  const openAsWorkflow = useOpenPresetAsWorkflow();
  const kind = generation.kind === "video" ? "video" : "image";
  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      const provider = rememberedProvider(kind, generation.model);
      void openAsWorkflow(presetIds, {
        kind,
        model:
          provider && generation.model
            ? { provider, id: generation.model }
            : null
      });
    },
    [generation.model, kind, openAsWorkflow, presetIds]
  );
  return (
    <ToolbarIconButton
      icon={<AccountTreeOutlinedIcon fontSize="inherit" />}
      tooltip={t("generations.openAsWorkflow")}
      ariaLabel={t("generations.openAsWorkflow")}
      onClick={handleClick}
    />
  );
};

/** Rebuilds the graph from what the generation recorded when it was sent. */
const recordedGraph = (
  generation: GenerationActivity,
  presetIds: readonly string[],
  unavailable: string
): PresetWorkflowGraph => {
  const request = generation.request;
  if (!request) {
    throw new Error(unavailable);
  }
  if (generation.channel === "prediction") {
    if (
      typeof request.provider !== "string" ||
      typeof request.mode !== "string" ||
      !generation.model ||
      generation.prompt === null
    ) {
      throw new Error(unavailable);
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
    nodes: graph.nodes.map((node) => {
      const ui = node.ui_properties as
        | { position?: { x: number; y: number } }
        | undefined;
      return {
        id: node.id,
        type: node.type,
        data: (node.data ?? {}) as Record<string, unknown>,
        position: ui?.position ?? { x: 0, y: 0 }
      };
    }),
    edges: graph.edges
  };
};

const OpenAsWorkflowAction = ({
  generation,
  presetIds
}: OpenAsWorkflowActionProps) => {
  const { t } = useTranslation();
  if (!generation.request) {
    return (
      <OpenPresetsAsWorkflow generation={generation} presetIds={presetIds} />
    );
  }
  return (
    <OpenGraphAsWorkflow
      build={() => recordedGraph(generation, presetIds, t("ejection.unavailable"))}
    />
  );
};

export default memo(OpenAsWorkflowAction);
