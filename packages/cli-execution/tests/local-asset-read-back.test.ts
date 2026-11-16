/**
 * A CLI run reads back the assets it saved.
 *
 * `context.createAsset` saves an asset as a file in the run's project folder,
 * with no object under the asset's storage key. The CLI commands and the app
 * and script runners read assets through a plain `FileStorageAdapter` they
 * build over the asset folder, so installing asset persistence must also let
 * those adapters find the file. Without that, a run could not use what it had
 * just generated: `Asset not found: asset://<id>.png`.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "local-asset-read-back-"));
// Read when the asset folder and Personal's folder are first resolved.
process.env["ASSET_FOLDER"] = join(dir, "assets");
process.env["PROJECTS_DIR"] = join(dir, "projects");
process.env["NODETOOL_WORKSPACES_DIR"] = join(dir, "workspaces");

import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { Asset, ModelObserver, initTestDb } from "@nodetool-ai/models";
import { ProcessingContext } from "@nodetool-ai/runtime";
import {
  FileStorageAdapter,
  setAssetFolderPathLookup
} from "@nodetool-ai/storage";
import { resolveProjectWorkspace } from "@nodetool-ai/execution/service";
import {
  installLocalModelInterfaces,
  localModelInterfaces
} from "../src/local-model-interfaces.js";

const USER = "1";
/** A valid 1x1 PNG. */
const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);

beforeEach(() => {
  initTestDb();
  ModelObserver.clear();
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The context a CLI command builds: its own adapter over the asset folder. */
function cliContext(jobId: string): ProcessingContext {
  return new ProcessingContext({
    userId: USER,
    jobId,
    storage: new FileStorageAdapter(getDefaultAssetsPath())
  });
}

describe("an asset a CLI run saved", () => {
  it("is a file in the project folder that the run reads back by its id", async () => {
    await installLocalModelInterfaces();
    const context = cliContext("save-and-read");

    const saved = (await context.createAsset({
      name: "fox in snow",
      contentType: "image/png",
      content: PNG
    })) as { id: string };

    const row = await Asset.find(USER, saved.id);
    expect(row?.workspace_path).toBe("Generated/fox-in-snow.png");
    // No object under the asset key: the bytes are the project file only.
    expect(existsSync(join(dir, "assets", USER, `${saved.id}.png`))).toBe(false);

    for (const reference of [
      `asset://${saved.id}.png`,
      `asset://${saved.id}`,
      saved.id,
      // The 12-character id an agent tool hands back.
      `asset://${saved.id.slice(0, 12)}.png`
    ]) {
      const { bytes, attempts } = await context.resolveAssetBytes(reference);
      expect(bytes && new Uint8Array(bytes), attempts.join("; ")).toEqual(PNG);
    }

    const file = await context.localPath(`asset://${saved.id}.png`);
    expect(file?.endsWith(join("Generated", "fox-in-snow.png"))).toBe(true);
    expect(file?.startsWith(dir)).toBe(true);
    expect(new Uint8Array(readFileSync(file!))).toEqual(PNG);
  });

  it("is readable from a later context of the same process", async () => {
    await installLocalModelInterfaces();
    const saved = (await cliContext("writer").createAsset({
      name: "clip",
      contentType: "text/plain",
      content: new TextEncoder().encode("frame data")
    })) as { id: string };

    const { bytes } = await cliContext("reader").resolveAssetBytes(
      `asset://${saved.id}.txt`
    );

    expect(bytes && new TextDecoder().decode(bytes)).toBe("frame data");
  });

  it("is readable in a later process that only installs the CLI's persistence", async () => {
    // An earlier run left a row and its file in Personal's folder.
    const folder = await resolveProjectWorkspace(null, USER);
    if (!folder.ok) throw new Error(folder.reason);
    await folder.workspace.write("Generated/earlier.txt", "saved earlier");
    const earlier = await Asset.create<Asset>({
      user_id: USER,
      project_id: folder.projectId,
      name: "earlier",
      content_type: "text/plain",
      workspace_path: "Generated/earlier.txt"
    });
    // A fresh process: nothing has saved an asset or built the asset store.
    setAssetFolderPathLookup(null);
    const context = cliContext("later-process");
    const reference = `asset://${earlier.id}.txt`;
    expect((await context.resolveAssetBytes(reference)).bytes).toBeNull();

    await localModelInterfaces();

    const { bytes } = await context.resolveAssetBytes(reference);
    expect(bytes && new TextDecoder().decode(bytes)).toBe("saved earlier");
  });
});
