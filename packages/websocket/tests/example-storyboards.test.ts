/**
 * The shipped example storyboards.
 *
 * These run against the real bundles in
 * `packages/base-nodes/nodetool/examples/storyboards`, so a board that stops
 * parsing, loses its shot text, or points at media that is no longer on disk
 * fails here rather than on a user's first install.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ModelObserver, Storyboard, initTestDb } from "@nodetool-ai/models";
import { parsePackageAssetUri } from "@nodetool-ai/protocol";

import {
  getExampleStoryboardBundle,
  installExampleStoryboard,
  listExampleStoryboards,
  resolveExampleStoryboardsDir
} from "../src/lib/example-storyboards.js";

const USER_ID = "user-1";

const BASE_NODES = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  "../../base-nodes/nodetool"
);
const EXAMPLES_DIR = nodePath.join(BASE_NODES, "examples", "nodetool-base");
const STORYBOARDS_DIR = nodePath.join(BASE_NODES, "examples", "storyboards");
const PACKAGE_ASSETS_ROOT = nodePath.join(BASE_NODES, "assets");

const options = { examplesDir: EXAMPLES_DIR };

describe("example storyboards", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  it("finds the bundles as the `storyboards` sibling of the examples dir", () => {
    expect(resolveExampleStoryboardsDir(options)).toBe(STORYBOARDS_DIR);
  });

  it("returns nothing when no examples directory is configured", () => {
    expect(listExampleStoryboards({})).toEqual([]);
    expect(getExampleStoryboardBundle({}, "lighthouse-keeper")).toBeNull();
  });

  it("lists every shipped board with its shot and clip counts", () => {
    const examples = listExampleStoryboards(options);
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      expect(example.name).not.toBe("");
      expect(example.description).not.toBe("");
      expect(example.shotCount).toBeGreaterThan(0);
      // Prefilled means prefilled: every shot ships a clip, not just a still.
      expect(example.clipCount).toBe(example.shotCount);
      expect(example.thumbnailUrl).toMatch(
        /^\/api\/assets\/packages\/nodetool-base\/storyboards\//
      );
    }
  });

  it("ships a directed, rendered document for every board", () => {
    for (const { slug, shotCount } of listExampleStoryboards(options)) {
      const bundle = getExampleStoryboardBundle(options, slug);
      expect(bundle, slug).not.toBeNull();
      const document = bundle!.document;
      expect(document.shots, slug).toHaveLength(shotCount);
      expect(document.brief, slug).not.toBe("");
      expect(document.style, slug).not.toBe("");
      // The board's screenplay and its flat shot list are two views of one
      // sequence — the web store keeps them in step, and so must a shipped file.
      expect(document.screenplay?.shots, slug).toEqual(document.shots);
      for (const shot of document.shots) {
        expect(shot.action.trim(), `${slug}/${shot.id}`).not.toBe("");
        expect(shot.status, `${slug}/${shot.id}`).toBe("rendered");
        for (const uri of [shot.keyframe?.uri, shot.clip?.uri]) {
          const ref = parsePackageAssetUri(uri);
          expect(ref, `${slug}/${shot.id} → ${uri}`).not.toBeNull();
          const onDisk = nodePath.join(
            PACKAGE_ASSETS_ROOT,
            ref!.packageName,
            ref!.path
          );
          expect(existsSync(onDisk), onDisk).toBe(true);
        }
      }
    }
  });

  it("installs a board carrying the bundle's document verbatim", async () => {
    const [example] = listExampleStoryboards(options);
    const bundle = getExampleStoryboardBundle(options, example.slug)!;

    const installed = await installExampleStoryboard(USER_ID, options, {
      slug: example.slug
    });

    expect(installed.name).toBe(bundle.name);
    expect(installed.projectId).toBe("default");
    expect(installed.document).toEqual(bundle.document);

    const stored = await Storyboard.findById(installed.id);
    expect(stored?.user_id).toBe(USER_ID);
    expect(stored?.toDocument().shots).toHaveLength(example.shotCount);
  });

  it("honours an explicit name and project on install", async () => {
    const [example] = listExampleStoryboards(options);
    const installed = await installExampleStoryboard(USER_ID, options, {
      slug: example.slug,
      name: "My cut",
      projectId: "films"
    });
    expect(installed.name).toBe("My cut");
    expect(installed.projectId).toBe("films");
  });

  it("rejects a slug that names nothing shipped", async () => {
    await expect(
      installExampleStoryboard(USER_ID, options, { slug: "no-such-board" })
    ).rejects.toThrow(/No example storyboard named/);
  });

  describe("with a directory of its own", () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(nodePath.join(tmpdir(), "example-storyboards-"));
      mkdirSync(nodePath.join(dir, "storyboards"), { recursive: true });
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    const write = (name: string, body: unknown) =>
      writeFileSync(
        nodePath.join(dir, "storyboards", name),
        JSON.stringify(body)
      );

    const local = () => ({
      exampleStoryboardsDir: nodePath.join(dir, "storyboards")
    });

    it("skips a file that is not a parsable bundle", () => {
      writeFileSync(
        nodePath.join(dir, "storyboards", "broken.storyboard.json"),
        "{not json"
      );
      write("no-document.storyboard.json", { name: "Nameless" });
      expect(listExampleStoryboards(local())).toEqual([]);
    });

    it("skips a bundle written against a newer schema", () => {
      write("future.storyboard.json", {
        schemaVersion: 99,
        name: "From the future",
        document: {
          screenplay: null,
          shots: [],
          brief: "",
          style: "",
          entityIds: [],
          aspectRatio: "16:9",
          directorModel: null,
          imageModel: null,
          videoModel: null
        }
      });
      expect(listExampleStoryboards(local())).toEqual([]);
    });

    it("does not resolve a path-shaped slug outside the examples directory", () => {
      writeFileSync(
        nodePath.join(dir, "escape.storyboard.json"),
        JSON.stringify({ name: "Escaped", document: {} })
      );
      expect(
        getExampleStoryboardBundle(local(), "../escape")
      ).toBeNull();
    });
  });
});
