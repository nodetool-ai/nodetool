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
    "@nodetool-ai/core-nodes",
    "@nodetool-ai/nodes-utils"
  ]
};

export default nextConfig;
