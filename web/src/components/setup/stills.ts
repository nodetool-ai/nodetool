/**
 * Where a setup card's art lives, for every guided flow.
 *
 * A card is a picture first (PRD § 6.2, § 6.3): the image use cases, the video
 * and script formats, the workflow categories. Each set keeps its stills in one
 * directory under the base-nodes asset tree, named by the card's own id, so a
 * card and its frame cannot drift apart.
 *
 * The files are copied wholesale into the bundle — they need no entry in
 * `PACKAGE_RUNTIME_ASSETS`, which registers dist-adjacent files only. A path
 * with no file behind it resolves to a URL that 404s and the card renders a
 * broken image, so `__tests__/setupStills.test.ts` checks every declared still
 * against the directory.
 *
 * The storyboard genres keep their own module (`storyboard/genres.ts`): a genre
 * carries its still alongside the prompt copy the Director reads.
 */

/** The package the stills ship in. */
export const SETUP_STILL_PACKAGE = "nodetool-base";

/** The asset directory holding one subdirectory per card set. */
export const SETUP_STILL_DIR = "setup";

/** The card sets that have art, as their directory names. */
export const SETUP_STILL_GROUPS = {
  imageUseCases: "image-use-cases",
  videoFormats: "video-formats",
  scriptFormats: "script-formats",
  workflowCategories: "workflow-categories"
} as const;

export type SetupStillGroup =
  (typeof SETUP_STILL_GROUPS)[keyof typeof SETUP_STILL_GROUPS];

/** The `package://` URI of one card's still. */
export const setupStill = (group: SetupStillGroup, id: string): string =>
  `package://${SETUP_STILL_PACKAGE}/${SETUP_STILL_DIR}/${group}/${id}.jpg`;
