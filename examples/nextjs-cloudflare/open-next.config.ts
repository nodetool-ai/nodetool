import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig({});

// OpenNext's default inner build command is `npm run build`, which here is
// `opennextjs-cloudflare build` — calling it again would recurse. Force the
// inner build to call Next directly.
config.buildCommand = "next build";

export default config;
