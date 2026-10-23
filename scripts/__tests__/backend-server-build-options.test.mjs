import assert from "node:assert/strict";
import { build } from "esbuild";
import { test } from "vitest";
import { backendServerBuildOptions } from "../backend-server-build-options.mjs";

test("bundled model resource types survive class name collisions", async () => {
  const result = await build({
    ...backendServerBuildOptions,
    stdin: {
      contents: `
        import { Job as OtherJob } from "other-job";
        import { Job } from "model-job";
        export const jobs = [new OtherJob(), new Job()];
        export const resourceTypes = jobs.map(instance => instance.constructor.name.toLowerCase());
      `
    },
    write: false,
    plugins: [{
      name: "colliding-job-classes",
      setup(plugin) {
        plugin.onResolve({ filter: /^(other-job|model-job)$/ }, ({ path }) => ({ path, namespace: "jobs" }));
        plugin.onLoad({ filter: /.*/, namespace: "jobs" }, () => ({
          contents: "export class Job {}"
        }));
      }
    }]
  });
  assert.equal(result.outputFiles.length, 1);
  const bundled = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
  assert.deepEqual(bundled.resourceTypes, ["job", "job"]);
});
