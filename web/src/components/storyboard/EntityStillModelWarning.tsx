/**
 * EntityStillModelWarning
 *
 * Entity reference images only reach generation through an editing model, so a
 * board cast with entities whose still model takes text alone silently drops
 * them. This says so, next to the model picker.
 *
 * It is its own component because answering the question needs every image
 * provider's model list. Asked from the board, that fan-out ran on every board
 * open — behind collapsed settings, for a board with no entities at all. Here
 * it runs only when the warning could actually fire.
 */

import { useTranslation } from "react-i18next";

import { useImageModelsByProvider } from "../../hooks/useModelsByProvider";
import { Caption } from "../ui_primitives";

interface EntityStillModelWarningProps {
  /** The board's selected still model, if one is chosen. */
  modelId: string | undefined;
  provider: string | undefined;
}

const EntityStillModelWarning = ({
  modelId,
  provider
}: EntityStillModelWarningProps) => {
  const { t } = useTranslation();
  const { models } = useImageModelsByProvider();
  const details = modelId
    ? models.find((m) => m.id === modelId && m.provider === provider)
    : undefined;
  // Only a model known to take text alone earns the warning: no model picked,
  // a list still loading, or a model that lists no tasks says nothing.
  const tasks = details?.supported_tasks;
  if (!tasks || tasks.length === 0 || tasks.includes("image_to_image")) {
    return null;
  }
  return (
    <Caption color="warning">
      {t("screens4_12.entityStillModelWarning.message")}
    </Caption>
  );
};

export default EntityStillModelWarning;
