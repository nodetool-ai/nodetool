import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

const config = defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
});

// Avoid recursion: OpenNext's default inner build command is `npm run build`,
// which would re-enter `opennextjs-cloudflare build`. Force it to call Next directly.
config.buildCommand = "next build";

export default config;
