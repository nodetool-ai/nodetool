import type { StorybookConfig } from "@storybook/react-vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));
const nodeStubs = resolve(configDir, "../vite-node-stubs");

// The design-system stories only touch pure UI primitives, but a few of those
// transitively import `@nodetool-ai/*` packages that statically reference
// `node:*` built-ins for their server code paths. Map the ones that can be
// pulled in to the browser-safe stubs the main app already uses, so Storybook
// builds without a Node polyfill. Mirrors web/vite.config.ts.
const NODE_BUILTIN_STUBS: Record<string, string> = {
  "node:fs/promises": `${nodeStubs}/fs-promises-stub.js`,
  "node:fs": `${nodeStubs}/fs-stub.js`,
  "node:path": `${nodeStubs}/path-stub.js`,
  "node:url": `${nodeStubs}/url-stub.js`,
  "node:crypto": `${nodeStubs}/crypto-stub.js`,
  "node:os": `${nodeStubs}/os-stub.js`,
  "node:events": `${nodeStubs}/events-stub.js`,
  "node:child_process": `${nodeStubs}/child-process-stub.js`,
  "node:worker_threads": `${nodeStubs}/empty.js`,
  "node:stream": `${nodeStubs}/stream-stub.js`,
  "node:async_hooks": `${nodeStubs}/empty.js`,
  "node:util": `${nodeStubs}/empty.js`,
  "node:buffer": `${nodeStubs}/buffer-stub.js`,
  "node:assert": `${nodeStubs}/empty.js`,
  "node:process": `${nodeStubs}/empty.js`,
  "node:module": `${nodeStubs}/empty.js`,
  "node:net": `${nodeStubs}/empty.js`,
  "node:tls": `${nodeStubs}/empty.js`,
  "node:http": `${nodeStubs}/empty.js`,
  "node:https": `${nodeStubs}/empty.js`,
  "node:http2": `${nodeStubs}/empty.js`,
  "node:zlib": `${nodeStubs}/empty.js`,
  "node:dns": `${nodeStubs}/empty.js`,
  "node:dgram": `${nodeStubs}/empty.js`,
  "node:perf_hooks": `${nodeStubs}/empty.js`,
  "node:vm": `${nodeStubs}/empty.js`
};

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/react-vite",
    options: {}
  },
  core: {
    disableTelemetry: true
  },
  typescript: {
    // Prop tables are hand-authored via argTypes; skip the slow docgen pass.
    reactDocgen: false
  },
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import("vite");
    return mergeConfig(viteConfig, {
      resolve: {
        // Resolve @nodetool-ai/* packages to their TS sources, matching the app.
        conditions: ["nodetool-dev", "import", "module", "browser", "default"]
      },
      plugins: [
        {
          name: "storybook-stub-node-protocol",
          enforce: "pre" as const,
          resolveId(source: string) {
            return NODE_BUILTIN_STUBS[source] ?? null;
          }
        }
      ]
    });
  }
};

export default config;
