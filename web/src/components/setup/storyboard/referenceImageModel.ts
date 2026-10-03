/**
 * Which model draws a new entity's reference image.
 *
 * The step creates references from a description alone, but it reads the
 * board's still model, and the Look step lets that be an editing model (one
 * that only redraws input images, such as `black-forest-labs/flux-2-flex/edit`).
 * Sent with no image, such a model fails at the provider. An editing model is
 * usually published beside its text-to-image variant, under the same family
 * path, so the step uses that variant. With no variant it asks for another
 * model instead of submitting a request that cannot succeed.
 */

import { modelMatchesTask } from "../../../hooks/modelTaskMatching";
import type { ImageModel, ImageModelValue } from "../../../stores/ApiTypes";

export type ReferenceImageModel =
  | { kind: "ready"; model: ImageModelValue; substituteFor?: string }
  | { kind: "edit_only"; name: string };

const family = (id: string): string => id.slice(0, id.lastIndexOf("/") + 1);

const sameProvider = (model: ImageModel, provider: string): boolean =>
  (model.provider ?? "").toLowerCase() === provider.toLowerCase();

export const referenceImageModel = (
  selected: ImageModelValue,
  catalog: readonly ImageModel[]
): ReferenceImageModel => {
  const listed = catalog.find(
    (model) =>
      model.id === selected.id && sameProvider(model, selected.provider)
  );
  // An unlisted model has no tasks to read, so the provider decides.
  if (!listed || modelMatchesTask(listed.supported_tasks, "text_to_image")) {
    return { kind: "ready", model: selected };
  }
  const name = listed.name || selected.name || selected.id;
  const prefix = family(selected.id);
  const variant = prefix
    ? catalog.find(
        (model) =>
          model.id !== selected.id &&
          sameProvider(model, selected.provider) &&
          family(model.id) === prefix &&
          modelMatchesTask(model.supported_tasks, "text_to_image")
      )
    : undefined;
  if (!variant) {
    return { kind: "edit_only", name };
  }
  return {
    kind: "ready",
    model: {
      ...selected,
      id: variant.id,
      name: variant.name || variant.id
    },
    substituteFor: name
  };
};
