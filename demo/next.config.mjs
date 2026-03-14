/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mark all @nodetool/* packages as server-external so webpack never tries to
  // bundle them. They are ESM packages with native bindings (isolated-vm,
  // better-sqlite3, etc.) and must be resolved by Node.js at runtime.
  serverExternalPackages: [
    "@nodetool/kernel",
    "@nodetool/runtime",
    "@nodetool/node-sdk",
    "@nodetool/base-nodes",
    "@nodetool/code-runners",
    "@nodetool/config",
    "@nodetool/protocol",
    "@nodetool/vectorstore",
    "better-sqlite3",
  ],
};

export default nextConfig;
