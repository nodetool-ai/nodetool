import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const source = (name: string): string =>
  pathToFileURL(resolve(import.meta.dirname, "../src", name)).href;

function withoutDependencies(body: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import assert from "node:assert/strict";
    import { registerHooks } from "node:module";
    import { readCatalogIndex } from "@nodetool-ai/node-catalog";
    const hidden = new Set(["sharp", "@nodetool-ai/server", "@nodetool-ai/base-nodes", ...readCatalogIndex().packs.flatMap(pack => [pack.npm.name, ...pack.provides])]);
    registerHooks({ resolve(specifier, context, next) {
      if ([...hidden].some(name => specifier === name || specifier.startsWith(name + "/"))) {
        const error = new Error("Hidden optional dependency: " + specifier);
        error.code = "ERR_MODULE_NOT_FOUND";
        throw error;
      }
      return next(specifier, context);
    } });
    ${body}
  `], {
    cwd: resolve(import.meta.dirname, "../../.."),
    env: { ...process.env, NODETOOL_LOG_LEVEL: "warn" },
    encoding: "utf8", timeout: 30000
  });
}

describe("websocket without node packs or imaging", () => {
  it("imports the router and returns empty local model lists", () => {
    const child = withoutDependencies(`
      const { appRouter } = await import(${JSON.stringify(source("trpc/router.ts"))});
      const caller = appRouter.createCaller({ userId: 'fixture', registry: {}, apiOptions: {}, pythonBridge: {}, getPythonBridgeReady: () => false });
      assert.deepEqual(await caller.models.transformersJsByType({ model_type: 'tjs.text_generation' }), []);
      assert.deepEqual(await caller.models.transformersJsRecommended({ model_type: 'tjs.text_generation' }), []);
    `);
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout + child.stderr).toContain('"error":"missing_pack"');
    expect(child.stdout + child.stderr).toContain('"id":"transformers-js"');
  });

  it("defers the imaging error until a thumbnail is requested", () => {
    const child = withoutDependencies(`
      const { generateImageThumb } = await import(${JSON.stringify(source("lib/thumbnail.ts"))});
      await assert.rejects(generateImageThumb(new Uint8Array([1, 2, 3])), error => error.details?.runtimePackage === 'imaging');
    `);
    expect(child.status, child.stderr).toBe(0);
  });

  it("reports the missing integration pack from KIE and Comfy routes", () => {
    const child = withoutDependencies(`
      const { default: Fastify } = await import('fastify');
      const { default: nodesRoutes } = await import(${JSON.stringify(source("routes/nodes.ts"))});
      const app = Fastify();
      await app.register(nodesRoutes, { apiOptions: {} });
      for (const [url, payload] of [
        ['/api/kie/resolve-dynamic-schema', { model_info: 'fixture docs' }],
        ['/api/comfy/resolve-workflow', { workflow: {} }]
      ]) {
        const result = await app.inject({ method: 'POST', url, payload });
        assert.equal(result.statusCode, 503);
        assert.equal(result.json().error, 'missing_pack');
        assert.equal(result.json().packs[0].id, 'integration');
      }
      await app.close();
    `);
    expect(child.status, child.stderr).toBe(0);
  });

  it("reports a missing document pack without calling the PDF unreadable", () => {
    const child = withoutDependencies(`
      const { default: Fastify } = await import('fastify');
      const { default: documentsRoutes } = await import(${JSON.stringify(source("routes/documents.ts"))});
      const app = Fastify();
      app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => done(null, body));
      await app.register(documentsRoutes);
      const form = new FormData();
      form.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'fixture.pdf');
      const request = new Request('http://local/', { method: 'POST', body: form });
      const result = await app.inject({ method: 'POST', url: '/api/documents/extract-text',
        headers: { 'content-type': request.headers.get('content-type') }, payload: Buffer.from(await request.arrayBuffer()) });
      assert.equal(result.statusCode, 503);
      assert.equal(result.json().error, 'missing_pack');
      assert.equal(result.json().packs[0].id, 'document');
      await app.close();
    `);
    expect(child.status, child.stderr).toBe(0);
  });
});
