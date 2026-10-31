import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";

import { ToolbarIconButton } from "../../ui_primitives";
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
 * "Open as workflow" for a generation that used presets. It mounts only for
 * those tiles, so the rest of the panel needs no workflow manager.
 */
const OpenAsWorkflowAction = ({
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

export default memo(OpenAsWorkflowAction);
