import type { PythonBridge } from "@nodetool-ai/runtime";
import { notifyResourceChange } from "./resource-events.js";

export async function notifyPythonBridgeResourceChanges(
  pythonBridge: Pick<PythonBridge, "listProviders">,
  registerPythonProvidersOnce: () => Promise<string[]>
): Promise<void> {
  notifyResourceChange({
    localOnly: true,
    event: "updated",
    resource_type: "metadata",
    resource: { id: "nodes", etag: String(Date.now()) }
  });

  const registered = await registerPythonProvidersOnce();

  const discoveredProviders = await pythonBridge.listProviders();
  const registeredProviders = new Set(registered);

  for (const provider of discoveredProviders) {
    notifyResourceChange({
    localOnly: true,
      event: registeredProviders.has(provider.id) ? "created" : "updated",
      resource_type: "provider",
      resource: {
        id: provider.id,
        provider: provider.id,
        capabilities: provider.capabilities,
        etag: String(Date.now())
      }
    });

    notifyResourceChange({
    localOnly: true,
      event: "updated",
      resource_type: "model",
      resource: {
        id: provider.id,
        provider: provider.id,
        etag: String(Date.now())
      }
    });
  }
}
