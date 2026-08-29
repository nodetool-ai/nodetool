/**
 * Media resolution is the browser rendering boundary.
 *
 * `asset://<id>` is a valid *stored* locator — the bytes live under
 * `<user_id>/<asset_id>.<ext>` and, on the cloud backends, behind a signed URL
 * only the server can mint. Handing one to `<img>`/`<video>`/`<audio>` renders
 * nothing, which is how #4873, #4929, #5028, #5078, #5122 and #5123 all
 * happened: six separate surfaces, each fixed on its own.
 *
 * A grep for `asset://` cannot audit this — the locator is legitimate almost
 * everywhere it appears. What can be audited is the boundary: every surface
 * that renders stored media either hands its locator to a locator-aware
 * primitive, or sets `src` from a value the resolvers minted (the
 * `ResolvedMediaUrl` brand, which the compiler checks). This file pins the
 * inventory of those surfaces, so a new one cannot ship unresolved and a
 * migrated one cannot quietly regress.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..");

/** The primitives that take a locator and resolve it before setting `src`. */
const LOCATOR_PRIMITIVES = ["ResponsiveImage", "VideoPlayer", "AudioPlayback"];

/** The hooks that mint a `ResolvedMediaUrl`. */
const RESOLVERS = [
  "useResolvedMediaUri",
  "useResolvedMediaUris",
  "useResolvedMedia",
  "useMediaSrc",
  "useSignedUrl",
  "resolveMediaUri"
];

type Surface = {
  /** The product surface from the roadmap this file belongs to. */
  surface: string;
  file: string;
  /**
   * How this file reaches the boundary:
   *  - "locator": renders a locator-aware primitive with a `locator` prop.
   *  - "resolver": sets `src`/`source` from a resolver's branded result.
   */
  via: "locator" | "resolver";
};

/**
 * Every surface named in the roadmap item, one entry per file that actually
 * renders stored media. Add a row when a surface starts rendering media; the
 * count assertion below stops the list being silently emptied.
 */
const INVENTORY: Surface[] = [
  // Chat media
  { surface: "chat media", file: "components/chat/message/MediaOutputGroup.tsx", via: "locator" },
  { surface: "chat media", file: "components/chat/message/MessageContentRenderer.tsx", via: "resolver" },
  { surface: "chat media", file: "components/chat/message/ChatMarkdown.tsx", via: "resolver" },
  { surface: "chat media", file: "components/chat/composer/FilePreview.tsx", via: "locator" },
  { surface: "chat media", file: "components/chat/message/toolResults/SearchResults.tsx", via: "locator" },
  // Storyboard cards
  { surface: "storyboard cards", file: "components/storyboard/ShotCard.tsx", via: "locator" },
  { surface: "storyboard cards", file: "components/storyboard/ShotTakesGallery.tsx", via: "locator" },
  { surface: "storyboard cards", file: "components/storyboard/StoryboardEntitiesField.tsx", via: "resolver" },
  // Sketch layers
  { surface: "sketch layers", file: "components/sketch/LayerItem.tsx", via: "locator" },
  // Script shot chips
  { surface: "script shot chips", file: "components/script/ScriptShotChip.tsx", via: "locator" },
  // Node previews
  { surface: "node previews", file: "components/node/ImageRefPreview.tsx", via: "resolver" },
  { surface: "node previews", file: "components/node_types/ContentCardBody.tsx", via: "resolver" },
  { surface: "node previews", file: "components/node/output/hooks.ts", via: "resolver" },
  // App Builder media widgets
  { surface: "app builder media", file: "components/appbuilder/puck/widgets.tsx", via: "locator" }
];

const read = (file: string): string =>
  readFileSync(join(SRC, file), "utf8");

describe("media resolution boundary", () => {
  // An audit that matched nothing would pass silently. Assert it found its
  // targets before asserting anything about them.
  it("audits every surface the roadmap names", () => {
    const surfaces = new Set(INVENTORY.map((entry) => entry.surface));
    expect(surfaces).toEqual(
      new Set([
        "chat media",
        "storyboard cards",
        "sketch layers",
        "script shot chips",
        "node previews",
        "app builder media"
      ])
    );
    expect(INVENTORY.length).toBeGreaterThanOrEqual(14);
  });

  it.each(INVENTORY)("$file reaches the boundary via $via", ({ file, via }) => {
    const source = read(file);
    expect(source.length).toBeGreaterThan(0);
    if (via === "locator") {
      const usesPrimitive = LOCATOR_PRIMITIVES.some((name) =>
        source.includes(`<${name}`)
      );
      expect(usesPrimitive).toBe(true);
      expect(source).toMatch(/\blocator=/);
    } else {
      const usesResolver = RESOLVERS.some((name) => source.includes(name));
      expect(usesResolver).toBe(true);
    }
  });

  it("keeps no unresolved locator literal in a rendered url attribute", () => {
    // The design-lint rule `design-tokens/no-unresolved-media-src` is the gate
    // (see scripts/test-media-src-rule.mjs); this asserts the inventoried files
    // are clean of the shape it rejects, so a suite failure names the file.
    const offenders = INVENTORY.filter(({ file }) =>
      /(?:src|poster|href)=\{?[`"'] ?(?:asset|memory):\/\//.test(read(file))
    );
    expect(offenders).toEqual([]);
  });
});

describe("locator-aware primitives", () => {
  it.each(LOCATOR_PRIMITIVES)(
    "%s resolves a locator instead of trusting its caller",
    (name) => {
      const source = read(`components/ui_primitives/${name}.tsx`);
      expect(source).toContain("useResolvedMediaUri");
      expect(source).toContain("locator");
      // `src` is branded, so a caller cannot slip a raw locator past the
      // compiler on the non-locator branch.
      expect(source).toContain("ResolvedMediaUrl");
    }
  );
});
