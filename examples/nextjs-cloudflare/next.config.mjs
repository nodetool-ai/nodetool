import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next's CLI mode expects the legacy JavaScript tsc entrypoint. The
    // TypeScript 6 compatibility package exposes only its compiler API.
    useTypeScriptCli: false
  },
  // Unlike the Vercel example, we do NOT mark the @nodetool-ai/* packages as
  // external: OpenNext bundles everything into the Worker, and `nodejs_compat`
  // (wrangler.jsonc) supplies the Node built-ins the runtime stack lazy-loads.
};

// Enable Cloudflare bindings (R2, KV, secrets, etc.) during `next dev`.
// Harmless when running a plain build.
initOpenNextCloudflareForDev();

export default nextConfig;
