let initialization: Promise<void> | undefined;

/** Keep attached GPU workers active while independently installed commands run. */
export function initializeExecutionHost(): Promise<void> {
  initialization ??= (async () => {
    const [{ installWorkerActivityHeartbeat }, { onPythonBridgeCreated }] = await Promise.all([
      import("@nodetool-ai/compute"),
      import("@nodetool-ai/runtime")
    ]);
    installWorkerActivityHeartbeat(onPythonBridgeCreated);
  })();
  return initialization;
}
