/**
 * Standalone project export over REST: the zip carries the project under one
 * folder, the bundle the app runs from, the credentials its graphs need, and
 * the `package://` sample files it references.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { strFromU8, unzipSync } from "fflate";
import { createEmptyDocument } from "@nodetool-ai/app-runtime";
import {
  Application,
  ModelObserver,
  Workflow,
  initTestDb
} from "@nodetool-ai/models";

import applicationsRoutes from "../src/routes/applications.js";

const USER_ID = "user-1";
const SAMPLE = "package://nodetool-base/recipe-inputs/coffee.jpg";

/** Answers the two questions the exporter asks of a node registry. */
const registry = {
  has: (type: string) => type === "fal.Flux",
  getMetadata: () => ({ required_settings: ["FAL_API_KEY"] })
};

async function buildServer(assetsRoot: string): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("userId", null);
  app.addHook("onRequest", async (req) => {
    req.userId = USER_ID;
  });
  await app.register(applicationsRoutes, {
    apiOptions: {
      registry: registry as never,
      packageAssetsRoots: [assetsRoot]
    }
  });
  await app.ready();
  return app;
}

async function seedApp(userId = USER_ID) {
  await Workflow.create<Workflow>({
    id: "wf-image",
    user_id: userId,
    name: "Make image",
    graph: {
      nodes: [
        {
          id: "in",
          type: "nodetool.input.ImageInput",
          data: { name: "picture", value: { type: "image", uri: SAMPLE } }
        },
        { id: "flux", type: "fal.Flux", data: {} }
      ],
      edges: []
    }
  });
  const document = createEmptyDocument("Poster Maker");
  document.operations = [
    {
      id: "make",
      name: "Make",
      workflowId: "wf-image",
      inputs: {},
      outputs: {},
      policy: "replace"
    }
  ];
  return Application.create<Application>({
    user_id: userId,
    project_id: "p1",
    name: "Poster Maker",
    description: "",
    document: JSON.stringify(document)
  });
}

describe("application standalone project export", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    initTestDb();
    const assetsRoot = mkdtempSync(join(tmpdir(), "project-export-"));
    mkdirSync(join(assetsRoot, "nodetool-base", "recipe-inputs"), {
      recursive: true
    });
    writeFileSync(
      join(assetsRoot, "nodetool-base", "recipe-inputs", "coffee.jpg"),
      Uint8Array.of(0xff, 0xd8, 0xff)
    );
    server = await buildServer(assetsRoot);
  });

  afterEach(async () => {
    await server.close();
    ModelObserver.clear();
  });

  it("zips a runnable project under the app's folder", async () => {
    const seeded = await seedApp();
    const response = await server.inject({
      url: `/api/applications/${seeded.id}/export-project`
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/zip");
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="poster-maker.zip"'
    );
    const files = unzipSync(new Uint8Array(response.rawPayload));
    const paths = Object.keys(files);
    expect(paths.length).toBeGreaterThan(10);
    expect(paths.every((path) => path.startsWith("poster-maker/"))).toBe(true);
    expect(paths).toContain("poster-maker/server/runner.mjs");

    const bundle = JSON.parse(strFromU8(files["poster-maker/app.bundle.json"]!));
    expect(bundle.app.operations[0].workflowId).toBe("make-image");
    expect(strFromU8(files["poster-maker/.env.example"]!)).toContain(
      "FAL_API_KEY=\n"
    );
    expect(
      files["poster-maker/assets/nodetool-base/recipe-inputs/coffee.jpg"]
    ).toEqual(Uint8Array.of(0xff, 0xd8, 0xff));
  });

  it("hides another user's app", async () => {
    const other = await seedApp("someone-else");
    const response = await server.inject({
      url: `/api/applications/${other.id}/export-project`
    });
    expect(response.statusCode).toBe(404);
  });
});
