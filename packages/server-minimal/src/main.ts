#!/usr/bin/env node
import { createMinimalServer, type MinimalFeatureHost } from "./index.js";
import type { ConfiguredFeature, ServerFeature } from "@nodetool-ai/server-features";

function tokenAssignments(value: string | undefined): Record<string, string> {
  if (!value) {
    throw new Error("NODETOOL_TOKENS must be a JSON object mapping tokens to user IDs");
  }
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("NODETOOL_TOKENS must be an object");
  }
  const tokens: Record<string, string> = {};
  for (const [key, owner] of Object.entries(parsed)) {
    if (typeof owner !== "string") {
      throw new Error("Every token assignment must name a user ID");
    }
    tokens[key] = owner;
  }
  return tokens;
}

const configured: ConfiguredFeature<MinimalFeatureHost>[] = [];
for (const entry of (process.env.NODETOOL_FEATURES ?? "").split(",").filter(Boolean)) {
  const separator = entry.indexOf("=");
  if (separator < 1) {
    throw new Error("NODETOOL_FEATURES entries must be feature-id=installed-package");
  }
  const id = entry.slice(0, separator);
  const specifier = entry.slice(separator + 1);
  if (!/^(@[a-z0-9-]+\/)?[a-z0-9-]+(\/[a-z0-9/.-]+)?$/.test(specifier)) {
    throw new Error("Features must name explicitly installed npm packages");
  }
  configured.push({ id, load: async () => {
    const module: { default?: ServerFeature<MinimalFeatureHost> } = await import(specifier);
    if (!module.default) {
      throw new Error(`Configured feature ${id} has no default descriptor`);
    }
    return module.default;
  } });
}
const app = await createMinimalServer({
  directory: process.env.NODETOOL_DATA_DIR ?? "./nodetool-data",
  masterKey: process.env.SECRETS_MASTER_KEY ?? "",
  tokens: tokenAssignments(process.env.NODETOOL_TOKENS),
  features: configured,
  openAIBaseURL: process.env.OPENAI_BASE_URL
});
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    void app.close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}
await app.listen({ host: process.env.HOST ?? "127.0.0.1", port: Number(process.env.PORT ?? 7777) });
