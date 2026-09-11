import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Unlike the Vercel example, we do NOT mark the @nodetool-ai/* packages as
  // external: OpenNext bundles everything into the Worker, and `nodejs_compat`
  // (wrangler.jsonc) supplies the Node built-ins the runtime stack lazy-loads.
  //
  // The one exception is fs-safe (a @nodetool-ai/storage dependency). It loads
  // its native helper with `new URL("../dist/native/", import.meta.url)` +
  // `require`, which Turbopack cannot resolve statically and fails the build
  // on. Kept external here; OpenNext copies it into the Worker bundle from the
  // route trace, and the missing `.node` binary there makes fs-safe fall back
  // to its JS path (its native mode defaults to "auto").
  serverExternalPackages: ["@openclaw/fs-safe"]
};

// Enable Cloudflare bindings (R2, KV, secrets, etc.) during `next dev`.
// Harmless when running a plain build.
initOpenNextCloudflareForDev();

export default nextConfig;
