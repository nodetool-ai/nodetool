/**
 * The full workflow-run environment: the node registry, a lazily started
 * Python bridge with executor resolution, asset persistence for the run's
 * context, and the per-generation autosave. The server and the CLI build the
 * same environment, so an agent-run workflow executes like an HTTP-run one.
 */
import { createLogger } from "@nodetool-ai/config";
import { createMissingPackError } from "@nodetool-ai/node-catalog";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import {
  PythonNodeExecutor,
  createPythonBridge,
  logPythonWorkerStderr,
  type NodeExecutor,
  type ProcessingContext,
  type PythonBridge,
  type StorageAdapter
} from "@nodetool-ai/runtime";
import type { RunGeneration } from "@nodetool-ai/execution/service";
import {
  createAssetModelInterface,
  updateAssetBytesModelInterface
} from "@nodetool-ai/asset-services/asset-model-interface";
import {
  getAssetAdapter,
  getTempAdapter
} from "@nodetool-ai/asset-services/storage";
import { autoSaveAssets, primaryTextOutputName } from "./asset-autosave.js";
import { resolveWorkerSettingsEnv } from "./worker-settings-env.js";

const log = createLogger("nodetool.workflow-runtime");

export type WorkflowRuntimeEnvironment = {
  registry: NodeRegistry;
  pythonBridge: PythonBridge;
  ensurePythonBridge: () => Promise<void>;
  resolveExecutor: (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }) => NodeExecutor;
  configureContext: (context: ProcessingContext) => void;
  assetStorage: StorageAdapter;
  storage: StorageAdapter;
  persistGeneration: (generation: RunGeneration) => Promise<void>;
};

/** Build the run environment over a registry the host loads. */
export async function createWorkflowRuntimeEnvironment(
  loadRegistry: () => Promise<NodeRegistry>
): Promise<WorkflowRuntimeEnvironment> {
  const registry = await loadRegistry();

  const pythonBridge = createPythonBridge({
    workerArgs: process.env["NODETOOL_WORKER_NAMESPACES"]
      ? ["--namespaces", process.env["NODETOOL_WORKER_NAMESPACES"]]
      : [],
    workerEnv: () => resolveWorkerSettingsEnv()
  });

  const logPythonBridgeDiagnostics = (context: string): void => {
    const loadErrors =
      (
        pythonBridge as {
          getLoadErrors?: () => Array<{
            module: string;
            phase: string;
            error: string;
          }>;
        }
      ).getLoadErrors?.() ?? [];
    if (loadErrors.length === 0) return;
    log.warn(
      `Python bridge ${context} with ${loadErrors.length} load error(s)`
    );
    for (const entry of loadErrors.slice(0, 10)) {
      log.warn(
        `[python-worker][load-error] ${entry.module} (${entry.phase}): ${entry.error}`
      );
    }
  };

  let pythonBridgeReady = false;
  pythonBridge.on("stderr", (msg: string) => {
    for (const line of msg.split("\n")) {
      logPythonWorkerStderr(line, log);
    }
  });
  pythonBridge.on("error", (err: Error) => {
    log.error(`Python bridge protocol error: ${err.message}`);
    pythonBridgeReady = false;
  });
  pythonBridge.on("exit", (code: number) => {
    log.warn(`Python worker exited with code ${code}`);
    pythonBridgeReady = false;
  });

  const ensurePythonBridge = async (): Promise<void> => {
    log.info("Lazily starting Python bridge");
    try {
      await pythonBridge.ensureConnected();
    } catch (err) {
      log.warn(
        "Python bridge lazy start failed",
        err instanceof Error ? err : new Error(String(err))
      );
      throw err;
    }
    pythonBridgeReady = true;
    log.info("Python bridge lazy start completed");
    const meta = pythonBridge.getNodeMetadata();
    log.info(
      `Python bridge connected — ${meta.length} Python nodes`
    );
    (
      pythonBridge as {
        getWorkerStatus?: () => Promise<{
          protocol_version: number;
          node_count: number;
          provider_count: number;
          namespaces: string[];
          transport: string;
          max_frame_size: number;
          load_errors: Array<unknown>;
        }>;
      }
    )
      .getWorkerStatus?.()
      ?.then((status) => {
        log.info("Python bridge status", {
          protocol_version: status.protocol_version,
          node_count: status.node_count,
          provider_count: status.provider_count,
          namespaces: status.namespaces,
          transport: status.transport,
          max_frame_size: status.max_frame_size,
          load_error_count: status.load_errors.length
        });
      })
      .catch((err: unknown) => {
        log.warn(
          "Failed to fetch Python bridge status",
          err instanceof Error ? err : new Error(String(err))
        );
      });
    logPythonBridgeDiagnostics("connected");
  };

  const resolveExecutor = (node: {
    id: string;
    type: string;
    [key: string]: unknown;
  }): NodeExecutor => {
    if (registry.has(node.type)) {
      return registry.resolve(node);
    }
    const catalogEntry = registry.catalogEntry(node.type);
    if (catalogEntry && registry.availability(node.type) === "catalog") {
      throw createMissingPackError(catalogEntry.pack, [node.type]);
    }
    if (pythonBridgeReady && pythonBridge.hasNodeType(node.type)) {
      const meta = pythonBridge
        .getNodeMetadata()
        .find((n) => n.node_type === node.type);
      const props = (node.properties ?? node.data ?? {}) as Record<
        string,
        unknown
      >;
      return new PythonNodeExecutor(
        pythonBridge,
        node.type,
        props,
        Object.fromEntries(
          (meta?.outputs ?? []).map((o) => [o.name, o.type.type])
        ),
        meta?.required_settings ?? [],
        node.id,
        meta?.requires_vram_gb
      );
    }
    if (registry.availability(node.type) === "python") {
      const stderrSummary =
        (
          pythonBridge as { getRecentStderrSummary?: () => string | null }
        ).getRecentStderrSummary?.() ?? null;
      const loadErrors =
        (
          pythonBridge as {
            getLoadErrors?: () => Array<{ module: string; error: string }>;
          }
        ).getLoadErrors?.() ?? [];
      const matchingLoadError = loadErrors.find(
        (entry) =>
          entry.module.includes(node.type) ||
          node.type.startsWith(entry.module.split(".").slice(2).join("."))
      );
      throw new Error(
        pythonBridgeReady
          ? `Python node "${node.type}" cannot execute: it is declared in metadata but was not loaded by the Python worker.${matchingLoadError ? ` Load error: ${matchingLoadError.module}: ${matchingLoadError.error}.` : stderrSummary ? ` Recent Python worker stderr: ${stderrSummary}` : " Check Python worker status/load errors for import failures."}`
          : `Python node "${node.type}" cannot execute: Python worker is not connected.${stderrSummary ? ` Recent Python worker stderr: ${stderrSummary}` : ""}`
      );
    }
    return registry.resolve(node);
  };

  return {
    registry,
    pythonBridge,
    ensurePythonBridge,
    resolveExecutor,
    // Asset persistence for the run's ProcessingContext — an Output node
    // that stores an image needs it on every host, not just chat turns.
    configureContext: (context: ProcessingContext) => {
      context.setModelInterfaces({
        createAsset: createAssetModelInterface,
        updateAssetBytes: updateAssetBytesModelInterface
      });
    },
    // The stores the run reads through. `asset://<id>` inputs — every
    // uploaded image wired into a graph — live in the asset store; without
    // it the reference resolves to nothing and the node runs on an empty
    // input. Same pair the streaming WebSocket runner uses.
    assetStorage: getAssetAdapter(),
    storage: getTempAdapter(),
    // The same per-generation autosave the editor's runs do, so a later
    // run with `node_ids` can reuse what this one generated.
    persistGeneration: (generation: RunGeneration) =>
      autoSaveAssets(generation.outputs, {
        userId: generation.userId,
        workflowId: generation.workflowId,
        jobId: generation.jobId,
        nodeId: generation.nodeId,
        textOutputName: primaryTextOutputName(
          registry.getMetadata(generation.nodeType)
        ),
        generationIndex: generation.index,
        properties: generation.properties ?? undefined,
        nodeType: generation.nodeType
      })
  };
}
