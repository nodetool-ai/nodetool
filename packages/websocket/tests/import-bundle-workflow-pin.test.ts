import { readFile } from "node:fs/promises";
import { beforeEach, expect, it } from "vitest";
import { operationTarget, parseApplicationDocument } from "@nodetool-ai/app-runtime";
import { initTestDb } from "@nodetool-ai/models";
import { createOwnedAppInstance } from "../src/lib/app-instances-service.js";
import { importApplicationBundle } from "../src/lib/applications-service.js";

const USER = "workflow-pin-user";
const bundlePath = new URL(
  "../../base-nodes/nodetool/examples/apps/product-price-drop.app.json",
  import.meta.url
);

beforeEach(() => initTestDb());

it("opens an imported bundle whose operations pin a workflow version", async () => {
  const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  const pinned = bundle.app.document?.operations ?? bundle.app.operations;
  expect(pinned.some((operation: { workflowVersion?: number }) => operation.workflowVersion)).toBe(true);

  const app = await importApplicationBundle(USER, { bundle, projectId: `personal:${USER}` });
  const document = parseApplicationDocument(app.document);
  if (!document) throw new Error("Expected a valid imported document");

  const instance = await createOwnedAppInstance(USER, {
    source_id: `application:${app.id}`,
    application_id: app.id,
    snapshot: { document, workflow_graphs: {}, script_documents: {} },
    variables: {}
  }, true);
  for (const operation of document.operations) {
    expect(operation.workflowVersion).toBeUndefined();
    expect(operationTarget(operation)).not.toHaveProperty("workflowVersion");
  }
  expect(Object.keys(instance.snapshot.workflow_graphs).length).toBeGreaterThan(0);
});
