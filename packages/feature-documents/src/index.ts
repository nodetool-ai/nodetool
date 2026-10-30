import { parsePdfBuffer } from "@nodetool-ai/document-processing";
import type { createCoreExecutionHost } from "@nodetool-ai/nodes-core";
import type { ServerFeature } from "@nodetool-ai/server-features";

export interface DocumentFeatureHost {
  readonly execution: ReturnType<typeof createCoreExecutionHost>;
  readonly readAsset: (userId: string, reference: unknown) => Promise<Uint8Array>;
}

/** Register PDF extraction with tenant-scoped asset resolution and the existing node ID. */
export const feature: ServerFeature<DocumentFeatureHost> = {
  descriptor: { id: "document", apiVersion: 1, capabilities: ["documents:pdf-text"], nodeTypes: ["lib.pdf.ExtractText"] },
  activate(host) {
    host.execution.register({
      type: { nodeType: "lib.pdf.ExtractText", outputs: { output: "str" }, supportsDynamicInputs: false,
        descriptorDefaults: { input_mode: "buffered", retry_safe: true, properties: { start_page: 0, end_page: -1 } } },
      create: (_node, request) => ({
        async process(inputs) {
          request.signal.throwIfAborted();
          const bytes = await host.readAsset(request.userId, inputs.pdf);
          request.signal.throwIfAborted();
          const parsed = await parsePdfBuffer(Buffer.from(bytes));
          request.signal.throwIfAborted();
          const start = typeof inputs.start_page === "number" ? Math.max(0, inputs.start_page) : 0;
          const end = typeof inputs.end_page === "number" && inputs.end_page !== -1 ? Math.min(parsed.pages.length - 1, inputs.end_page) : parsed.pages.length - 1;
          return { output: parsed.pages.slice(start, end + 1).map((page) => page.text).join("\n\n").trim() };
        }
      })
    });
  }
};

export default feature;
