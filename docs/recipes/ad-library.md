# Ad library Recipes

Each concept on the marketing site's `/ad-library` pages ships as a Recipe
mini app with the slug `ad-<concept slug>`. These apps use the [shared plan/finish
operations](shared-operations.md) and build an editable vertical Timeline.

[`scripts/example-apps/ad-library-recipes.mjs`](../../scripts/example-apps/ad-library-recipes.mjs)
reads `marketing/src/data/adLibrary.json`. Each beat becomes a shot with the
beat's duration and composition. Each copy slot becomes an exact-text input.
The file adds only the image inputs per concept and the beats that show them.
Every shot shows the brand color as a background. The last shot adds the logo.
Concepts that call for footage take still images, because the shared
operations build still motion graphics and generate no video.

The app is a sequence of guided steps:

1. **Start** shows every beat's illustration with its timing, the finishing
   model, the optional image model, and a choice: **Fill from a website** or
   **Fill in myself**.
2. One to three **content steps** group the fields by the material the user
   has, such as "The offer" and "Your products". Each group shows only the
   illustrations of the beats its fields fill. An image and the line shown
   with it share one card.
3. **Ending** holds the last copy slot, the logo and the brand color. Its
   button plans the storyboard. While the plan runs, the layout agent's
   activity shows below the fields.
4. **Review**, **Build** and **Result** are the shared steps. Review shows the
   frames the layout agent composed, and Build adds the motion.

Planning lays out every frame with the finishing model, so pick a model that
reads images. With an image model, the agent can also generate backgrounds and
decoration. See [the layout pass](shared-operations.md). Plan and Build run as
bundled workflow jobs, because the agents take longer than a script operation
allows.

[`ad-library-steps.mjs`](../../scripts/example-apps/ad-library-steps.mjs)
holds the steps, labels, placeholders and hints of each concept. A step label
also renames the Recipe input. The build fails when a step plan leaves an
input without a field. The illustrations ship as
`package://nodetool-base/ad-library/<beat>.webp`. Each app's gallery thumbnail
is `ad-<slug>.jpg` in the same assets directory. The gallery uses an app's
`<slug>.jpg` before the art of its first bound workflow.

**Fill from a website** opens a panel on Start. Its only input is a website
URL. The agent uses the finishing model selected on Start.
[`ad-library-ai.mjs`](../../scripts/example-apps/ad-library-ai.mjs) holds two
operations:

1. **Suggest options** runs a small workflow bundled with the app, so it is a
   server job with no 120-second script limit. Its Code node has a 30-minute
   limit, because a Code node timeout of 0 falls back to the sandbox's
   30-second default. The node reads the page text with `browser` and collects
   the page's image candidates from its HTML: social preview images, icon and
   logo links, and each `<img>` with its alt text, declared size and widest
   `srcset` entry. One `run_agent` call with the `browser` and `image_search`
   tools and up to 40 turns returns three different options. Each option has a
   title, an angle, the copy, the brand color and an image URL for each image
   field. The model may use only facts the website or the pages it reads state,
   and a missing fact becomes a bracketed placeholder. The panel's Agent
   Activity widget shows the agent while it runs. The options appear as Choice
   Cards with the first image as a preview.
2. Picking a card runs **apply**, a script operation. It fills every copy field and the brand color
   from that option, and saves each image with `save_asset`, which fetches it
   through `safeFetch`. It sets an image field only when the asset is an image
   of at least 400 pixels on its short side, or 100 for a logo. A report under
   the cards names the image fields left empty, so the user uploads those.

Both operations write the same variables the inputs edit, and apply resets
approval, so planning still preserves exactly what the fields hold.

Stage the illustrations and thumbnails after a change to the marketing
illustrations, then rebuild the bundles. The first command needs ffmpeg.

```bash
node scripts/example-apps/ad-library-assets.mjs
node scripts/build-example-apps.mjs
node scripts/run-vitest.mjs run scripts/__tests__/ad-library-recipes.test.mjs
```
