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

import { Caption } from "../ui_primitives";
import { useImageModelsByProvider } from "../../hooks/useModelsByProvider";

interface EntityStillModelWarningProps {
  /** The board's selected still model, if one is chosen. */
  modelId: string | undefined;
}

const EntityStillModelWarning = ({ modelId }: EntityStillModelWarningProps) => {
  const { models } = useImageModelsByProvider();
  const details = modelId ? models.find((m) => m.id === modelId) : undefined;
  if (details?.supported_tasks?.includes("image_to_image")) {
    return null;
  }
  return (
    <Caption color="warning">
      Entities carry reference images, but this model only takes text. Pick an
      image-to-image model to use them.
    </Caption>
  );
};

export default EntityStillModelWarning;
