import { initializeCliRuntime } from "../runtime-env.js";
import { configureCliPackHost, getCliPackSource } from "./host.js";
import { refusePackInstallsInProcess } from "./install-process.js";

refusePackInstallsInProcess("serve");
const entryUrl = new URL(import.meta.url.endsWith(".ts") ? "../nodetool.ts" : "../nodetool.js", import.meta.url).href;
initializeCliRuntime(entryUrl);
configureCliPackHost(entryUrl);
const packSource = await getCliPackSource();
if (!packSource) {
  throw new Error("CLI serve requires an installed pack source");
}
const { startServer } = await import("@nodetool-ai/websocket/server");
await startServer({ packSource });
