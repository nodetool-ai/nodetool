import { z } from "zod";
import { initializeCliRuntime } from "../runtime-env.js";
import { configureCliPackHost, getCliPackSource } from "./host.js";
import { refusePackInstallsInProcess } from "@nodetool-ai/pack-manager/packs/install-process";

refusePackInstallsInProcess("serve");
const entryUrl = new URL(import.meta.url.endsWith(".ts") ? "../nodetool.ts" : "../nodetool.js", import.meta.url).href;
initializeCliRuntime(entryUrl);
const selection = process.env["NODETOOL_SERVER_PACKS"];
const configuredPackIds = selection === undefined ? undefined : z.array(z.string().min(1)).parse(JSON.parse(selection));
configureCliPackHost(import.meta.resolve("@nodetool-ai/cli"), { configuredPackIds });
const packSource = await getCliPackSource();
if (!packSource) {
  throw new Error("CLI serve requires an installed pack source");
}
const { startServer } = await import("@nodetool-ai/websocket/server");
await startServer({ packSource });
