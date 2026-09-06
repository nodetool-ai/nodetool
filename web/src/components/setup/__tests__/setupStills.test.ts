/**
 * Every card that claims a still must have one on disk.
 *
 * A `package://` path with no file behind it resolves to a URL that 404s, so
 * the card renders a broken image rather than falling back to type. The card
 * tables and the asset directory are edited in different packages, so this is
 * what keeps them in step — in both directions: a still nobody claims is dead
 * weight in the bundle.
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { STYLE_PRESETS } from "@nodetool-ai/protocol";

import { USE_CASE_CARDS } from "../image/useCases";
import { FORMAT_CARDS } from "../script/formats";
import { VIDEO_FORMATS } from "../video/formats";
import { WORKFLOW_CATEGORIES } from "../workflow/categories";
import { SETUP_STILL_GROUPS, setupStill } from "../stills";

/** Where the base-nodes package keeps the `package://nodetool-base` files. */
const ASSET_ROOT = path.resolve(
  __dirname,
  "../../../../../packages/base-nodes/nodetool/assets/nodetool-base"
);

/** The file a `package://nodetool-base/...` URI names. */
const assetFile = (uri: string): string =>
  path.join(ASSET_ROOT, uri.replace("package://nodetool-base/", ""));

const groupDir = (group: string): string =>
  path.join(ASSET_ROOT, "setup", group);

describe("setup card stills", () => {
  // Proves the asset root is the real directory rather than one that never
  // existed, so the checks below cannot pass by finding nothing.
  it("reads the asset root the package:// URIs address", () => {
    expect(
      existsSync(path.join(ASSET_ROOT, "storyboards", "sneaker-drop", "sole-macro.jpg"))
    ).toBe(true);
    expect(existsSync(path.join(ASSET_ROOT, "styles", "no-such-style.jpg"))).toBe(
      false
    );
  });

  it.each([
    ["image use cases", USE_CASE_CARDS, SETUP_STILL_GROUPS.imageUseCases],
    ["script formats", FORMAT_CARDS, SETUP_STILL_GROUPS.scriptFormats],
    ["workflow categories", WORKFLOW_CATEGORIES, SETUP_STILL_GROUPS.workflowCategories]
  ])("gives every %s card a still that exists", (_name, cards, group) => {
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.image).toBe(setupStill(group, card.id));
      expect(existsSync(assetFile(card.image as string))).toBe(true);
    }
  });

  it("gives every video format card a still that exists", () => {
    expect(VIDEO_FORMATS.length).toBeGreaterThan(0);
    for (const format of VIDEO_FORMATS) {
      const uri = setupStill(SETUP_STILL_GROUPS.videoFormats, format.id);
      expect(existsSync(assetFile(uri))).toBe(true);
    }
  });

  it("gives every style preset a thumbnail that exists", () => {
    expect(STYLE_PRESETS.length).toBeGreaterThan(0);
    for (const preset of STYLE_PRESETS) {
      expect(preset.thumbnail).toBe(
        `package://nodetool-base/styles/${preset.id}.jpg`
      );
      expect(existsSync(assetFile(preset.thumbnail))).toBe(true);
    }
  });

  it("ships no still no card claims", () => {
    const claimed = new Set([
      ...USE_CASE_CARDS.map((card) => card.image),
      ...FORMAT_CARDS.map((card) => card.image),
      ...WORKFLOW_CATEGORIES.map((card) => card.image),
      ...VIDEO_FORMATS.map((format) =>
        setupStill(SETUP_STILL_GROUPS.videoFormats, format.id)
      )
    ]);
    for (const group of Object.values(SETUP_STILL_GROUPS)) {
      for (const file of readdirSync(groupDir(group))) {
        expect(claimed).toContain(
          setupStill(group, path.basename(file, path.extname(file)))
        );
      }
    }
  });
});
