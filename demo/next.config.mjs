/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep all @nodetool packages and heavy native deps server-side only (not bundled by webpack).
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
    "jsdom",
    "canvas",
    "sharp",
    "chartjs-node-canvas",
  ],

  webpack(config, { isServer }) {
    if (isServer) {
      // Prevent webpack from bundling @nodetool/* — they are ESM packages with
      // native modules that must be loaded at runtime, not compiled by webpack.
      const existing = config.externals ?? [];
      const externalsArray = Array.isArray(existing) ? existing : [existing];
      config.externals = [
        ...externalsArray,
        ({ request }, callback) => {
          if (request && /^@nodetool\//.test(request)) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
};

export default nextConfig;
