/**
 * Thumb-sized surfaces render thumbnails, not originals.
 *
 * The server derives a 512px JPEG for every stored asset and hands it back as
 * `thumb_url`. A generated still is 300KB-1.2MB and a rendered PDF is larger
 * still, so a grid, strip, chip or avatar that resolves to `get_url` pulls the
 * full original down to paint a few hundred pixels — twelve of them on one
 * storyboard, dozens on a project list.
 *
 * There are three ways to reach the thumbnail, all equivalent:
 *   - `preferThumbnail` on `ResponsiveImage` (the locator path),
 *   - `useResolvedThumbnailUri` (the resolver path, for a raw `<img>`),
 *   - `asset.thumb_url` ahead of `get_url` (surfaces holding the asset row).
 *
 * This file pins which surfaces are thumb-sized, so a new card cannot ship on
 * the original and a migrated one cannot quietly regress. It is the bandwidth
 * half of `mediaResolutionBoundary.test.ts`, which pins that the same surfaces
 * resolve at all.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");

type Via = "preferThumbnail" | "thumbnail-hook" | "thumb-field";

type ThumbSurface = {
  /** What the user sees, and roughly how big it is drawn. */
  surface: string;
  file: string;
  via: Via;
};

const INVENTORY: ThumbSurface[] = [
  // Storyboard: shot cards and the takes strip under them.
  { surface: "storyboard shot card", file: "components/storyboard/ShotCard.tsx", via: "preferThumbnail" },
  { surface: "storyboard takes strip", file: "components/storyboard/ShotTakesGallery.tsx", via: "preferThumbnail" },
  { surface: "storyboard entity avatar", file: "components/storyboard/StoryboardEntitiesField.tsx", via: "thumbnail-hook" },
  // Script: the 44x26 keyframe chip beside a line.
  { surface: "script shot chip", file: "components/script/ScriptShotChip.tsx", via: "preferThumbnail" },
  // Projects: still grids on cards and document previews.
  { surface: "project card stills", file: "components/projects/ProjectCard.tsx", via: "preferThumbnail" },
  { surface: "project document preview", file: "components/projects/ProjectDocumentPreview.tsx", via: "preferThumbnail" },
  // Setup wizards: reference tiles and the contact sheet.
  { surface: "setup contact sheet", file: "components/setup/image/ContactSheet.tsx", via: "preferThumbnail" },
  { surface: "setup image references", file: "components/setup/image/IdeaStep.tsx", via: "preferThumbnail" },
  { surface: "setup video references", file: "components/setup/video/IdeaStep.tsx", via: "preferThumbnail" },
  { surface: "setup entity rows", file: "components/setup/storyboard/EntitiesStep.tsx", via: "preferThumbnail" },
  // Memory library rows.
  { surface: "memory card", file: "components/memory/MemoryCard.tsx", via: "preferThumbnail" },
  // Sketch layer list.
  { surface: "sketch layer thumbnail", file: "components/sketch/LayerItem.tsx", via: "preferThumbnail" },
  // Chat: the 18px resource chip.
  { surface: "chat resource chip", file: "components/chat/message/ResourceChip.tsx", via: "thumbnail-hook" },
  // Asset browser tiles and rows, which hold the asset row directly.
  { surface: "asset grid tile", file: "components/assets/AssetItem.tsx", via: "thumb-field" },
  { surface: "asset list row", file: "components/assets/AssetListView.tsx", via: "thumb-field" },
  { surface: "asset search result", file: "components/assets/GlobalSearchResults.tsx", via: "thumb-field" },
  { surface: "job output tile", file: "components/panels/jobs/JobItem.tsx", via: "thumb-field" },
  { surface: "asset info panel", file: "components/context_menus/AssetInfoPanel.tsx", via: "thumb-field" }
];

const read = (file: string): string => readFileSync(join(SRC, file), "utf8");

describe("thumb-sized surfaces render thumbnails", () => {
  // An audit that matched nothing would pass silently. Assert it found its
  // targets before asserting anything about them.
  it("covers every thumb-sized surface family", () => {
    expect(new Set(INVENTORY.map((entry) => entry.via))).toEqual(
      new Set(["preferThumbnail", "thumbnail-hook", "thumb-field"])
    );
    expect(INVENTORY.length).toBeGreaterThanOrEqual(18);
  });

  it.each(INVENTORY)("$surface takes the thumbnail via $via", ({ file, via }) => {
    const source = read(file);
    expect(source.length).toBeGreaterThan(0);
    if (via === "preferThumbnail") {
      expect(source).toContain("<ResponsiveImage");
      expect(source).toMatch(/^\s*preferThumbnail$/m);
    } else if (via === "thumbnail-hook") {
      expect(source).toContain("useResolvedThumbnailUri");
    } else {
      expect(source).toContain("thumb_url");
    }
  });

  it("never paints a PDF tile from the document itself", () => {
    // `get_url` on a PDF is the PDF; a browser paints no background image from
    // it and downloads the whole file trying. The first-page JPEG is thumb_url.
    const source = read("components/assets/AssetItem.tsx");
    expect(source).not.toMatch(/backgroundImage: `url\(\$\{asset\.get_url\}\)`/);
  });
});
