/**
 * `GET /api/storyboards/:id/export-zip` on an installed example board.
 *
 * Study 11: an example board keeps its shipped stills as `package://` files
 * with no asset id. The archive left every one of them out, so the client got
 * a zip of shot text and no pictures.
 *
 * Run with:
 *   npm run test --workspace=packages/websocket -- storyboards-export-route
 */
import { readFileSync } from "node:fs";
import nodePath from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import { ModelObserver, initTestDb } from "@nodetool-ai/models";

import { installExampleStoryboard } from "../src/lib/example-storyboards.js";
import { storyboardZipResponse } from "../src/routes/storyboards.js";

const USER_ID = "user-1";
const BASE_NODES = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  "../../base-nodes/nodetool"
);
const EXAMPLES_DIR = nodePath.join(BASE_NODES, "examples", "nodetool-base");
const PACKAGE_ASSETS_ROOT = nodePath.join(BASE_NODES, "assets");

async function zipEntries(response: Response): Promise<Record<string, Uint8Array>> {
  const chunks: Buffer[] = [];
  for await (const chunk of Readable.fromWeb(
    response.body as unknown as Parameters<typeof Readable.fromWeb>[0]
  )) {
    chunks.push(Buffer.from(chunk as Uint8Array));
  }
  return unzipSync(new Uint8Array(Buffer.concat(chunks)));
}

describe("storyboard zip of an installed example board", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    ModelObserver.clear();
  });

  it("carries every shipped still", async () => {
    const board = await installExampleStoryboard(
      USER_ID,
      { examplesDir: EXAMPLES_DIR },
      { slug: "cold-brew-pour" }
    );

    const response = await storyboardZipResponse(board.id, USER_ID, [
      PACKAGE_ASSETS_ROOT
    ]);
    expect(response.status).toBe(200);
    const entries = await zipEntries(response);
    const stills = Object.keys(entries).filter((name) =>
      name.startsWith("stills/")
    );

    expect(stills).toHaveLength(4);
    const first = stills.sort()[0];
    expect(entries[first]).toEqual(
      new Uint8Array(
        readFileSync(
          nodePath.join(
            PACKAGE_ASSETS_ROOT,
            "nodetool-base/storyboards/cold-brew-pour/ice-drop.jpg"
          )
        )
      )
    );
  });

  it("answers 404 for another user's board", async () => {
    const board = await installExampleStoryboard(
      USER_ID,
      { examplesDir: EXAMPLES_DIR },
      { slug: "cold-brew-pour" }
    );

    const response = await storyboardZipResponse(board.id, "someone-else");
    expect(response.status).toBe(404);
  });
});
