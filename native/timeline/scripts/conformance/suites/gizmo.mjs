import path from "node:path";
export default {
  config: "vitest.config.mts",
  tests: [path.resolve(import.meta.dirname, "../gizmo/patch.test.ts")],
  env: ({ bin }) => ({ NT_GIZMO_ORACLE: path.join(path.dirname(bin), "timeline-gizmo-oracle") })
};
