import {
  hasReturnStatement,
  wrapImplicitReturn,
  usesEmitOutputContract,
  normalizeCodeOutput
} from "@nodetool-ai/protocol/code-body";
import { runInSandbox } from "@nodetool-ai/sandbox-runtime";
import type { SandboxModuleResolution } from "@nodetool-ai/protocol";
import type { SandboxLimits } from "@nodetool-ai/sandbox-runtime";
import type { ServerFeature } from "@nodetool-ai/server-features";
import type { MinimalFeatureHost } from "@nodetool-ai/server-minimal";

/** Explicitly installed QuickJS execution. Host JavaScript is never a fallback. */
export function createSandboxFeature(
  options: {
    readonly limits?: SandboxLimits;
    readonly modules?: SandboxModuleResolution;
  } = {}
): ServerFeature<MinimalFeatureHost> {
  return {
    descriptor: {
      id: "code",
      apiVersion: 1,
      requires: [],
      capabilities: ["sandbox"],
      nodeTypes: ["nodetool.code.Code"]
    },
    activate(host) {
      host.execution.register({
        dynamicOutputs: true,
        type: {
          nodeType: "nodetool.code.Code",
          supportsDynamicInputs: true,
          outputs: {},
          descriptorDefaults: { input_mode: "buffered" }
        },
        create: (node, request) => {
          const state: Record<string, unknown> = {};
          return {
            async process(inputs) {
              if (typeof inputs.code !== "string") {
                throw new Error("Code must be a JavaScript string");
              }
              const modern = usesEmitOutputContract(inputs.code);
              const code =
                modern || hasReturnStatement(inputs.code)
                  ? inputs.code
                  : wrapImplicitReturn(inputs.code);
              const declaredSecrets = Array.isArray(inputs.secrets)
                ? inputs.secrets.filter(
                    (value): value is string =>
                      typeof value === "string" && value.length > 0
                  )
                : [];
              const timeoutSeconds =
                typeof inputs.timeout === "number" ? inputs.timeout : 30;
              const maxResponseMB =
                typeof inputs.max_response_mb === "number"
                  ? inputs.max_response_mb
                  : 1;
              const hostScope = options.limits?.secretScope;
              const secretScope =
                hostScope == null
                  ? declaredSecrets.length > 0
                    ? declaredSecrets
                    : null
                  : declaredSecrets.length > 0
                    ? declaredSecrets.filter((name) => hostScope.includes(name))
                    : hostScope;
              const requestedResponseBytes = maxResponseMB * 1024 * 1024;
              const maxResponseBodyBytes =
                options.limits?.maxResponseBodyBytes === undefined
                  ? requestedResponseBytes
                  : Math.min(
                      options.limits.maxResponseBodyBytes,
                      requestedResponseBytes
                    );
              const result = await runInSandbox({
                code,
                modules: options.modules,
                globals: { inputs, state },
                signal: request.signal,
                timeoutMs:
                  timeoutSeconds > 0 ? timeoutSeconds * 1000 : undefined,
                workspace: request.workspace,
                getSecret: (name) => host.readSecret(request.userId, name),
                readAsset: (reference) =>
                  host.readAsset(request.userId, reference),
                limits: {
                  ...options.limits,
                  maxResponseBodyBytes,
                  secretScope
                },
                onLog: (level, content) =>
                  request.emit({
                    type: "log_update",
                    node_id: node.id,
                    node_name: "Code",
                    content,
                    severity:
                      level === "error"
                        ? "error"
                        : level === "warn"
                          ? "warning"
                          : "info"
                  }),
                onProgress: (progress, chunk) =>
                  request.emit({
                    type: "node_progress",
                    node_id: node.id,
                    progress,
                    total: 100,
                    chunk
                  })
              });
              if (!result.success) {
                throw new Error(result.error ?? "Sandbox execution failed");
              }
              if (!modern) {
                return normalizeCodeOutput(result.result);
              }
              const outputs: Record<string, unknown> = {};
              for (const entry of result.emitted ?? []) {
                outputs[entry.name] = entry.value;
              }
              return { ...outputs, ...result.outputs };
            }
          };
        }
      });
    }
  };
}
export default createSandboxFeature();
