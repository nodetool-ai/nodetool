import { z } from "zod";
import { initializeCliRuntime } from "@nodetool-ai/cli-common/runtime-env";
import { configureCliPackHost, getCliPackSource } from "@nodetool-ai/cli-execution/packs/host";
import { refusePackInstallsInProcess } from "@nodetool-ai/pack-manager/packs/install-process";

refusePackInstallsInProcess("serve");
const entryUrl = new URL(import.meta.url.endsWith(".ts") ? "../index.ts" : "../index.js", import.meta.url).href;
initializeCliRuntime(entryUrl);
const selection = process.env["NODETOOL_SERVER_PACKS"];
const configuredPackIds = selection === undefined ? undefined : z.array(z.string().min(1)).parse(JSON.parse(selection));
configureCliPackHost(import.meta.resolve("@nodetool-ai/cli"), { configuredPackIds });
const packSource = await getCliPackSource();
if (!packSource) {
  throw new Error("CLI serve requires an installed pack source");
}
const { createCatalogPackSource } = await import("@nodetool-ai/websocket/pack-source");
const providerOptions = configuredPackIds === undefined ? {} : { configuredPackIds };
const { registerProviders } = createCatalogPackSource(providerOptions);
const { startServer } = await import("@nodetool-ai/websocket/server");
await startServer({ packSource: { ...packSource, registerProviders } });
