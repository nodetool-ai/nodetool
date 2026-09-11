/** @type {import('next').NextConfig} */
const nextConfig = {
  // The runner and node packages are server-only ESM that lazy-load `node:`
  // built-ins. On Vercel's Node.js runtime we keep them external (run them as
  // real Node modules) rather than letting Next trace/bundle those imports.
  serverExternalPackages: [
    "@nodetool-ai/workflow-runner",
    "@nodetool-ai/kernel",
    "@nodetool-ai/runtime",
    "@nodetool-ai/node-sdk",
    "@nodetool-ai/nodes-utils",
    "@nodetool-ai/core-nodes",
    "@nodetool-ai/llm-nodes",
    // fs-safe (a @nodetool-ai/storage dependency) loads its native helper with
    // `new URL("../dist/native/", import.meta.url)` + `require`, which
    // Turbopack cannot resolve statically. Inside the monorepo the
    // @nodetool-ai/* entries above are symlinked workspaces, not
    // node_modules, so Next bundles them anyway and reaches this import.
    "@openclaw/fs-safe"
  ]
};

export default nextConfig;
