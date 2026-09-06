/**
 * The seven use-case cards of the image flow's step 2 (PRD § 10.2), as the
 * card grid renders them.
 *
 * The table itself lives in `@nodetool-ai/protocol` because three surfaces
 * read it — this grid, the `ui_sketch_*` tools and the headless mirror. This
 * module is only the adapter into `OptionCardItem`.
 */

import {
  IMAGE_USE_CASES,
  findImageUseCase,
  type ImageUseCase
} from "@nodetool-ai/protocol/api-schemas/sketch.js";

import type { OptionCardItem } from "../OptionCardGrid";
import { SETUP_STILL_GROUPS, setupStill } from "../stills";

export type { ImageUseCase };
export { IMAGE_USE_CASES, findImageUseCase as findUseCase };

export const USE_CASE_CARDS: readonly OptionCardItem[] = IMAGE_USE_CASES.map(
  (useCase) => ({
    id: useCase.id,
    title: useCase.title,
    description: useCase.description,
    image: setupStill(SETUP_STILL_GROUPS.imageUseCases, useCase.id)
  })
);
