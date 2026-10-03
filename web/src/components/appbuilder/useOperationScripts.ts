/** Pinned script documents supplying each Application operation's declared ports. */
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  operationTarget,
  type OperationBinding
} from "@nodetool-ai/app-runtime";
import {
  jsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { trpcClient } from "../../trpc/client";

export const useOperationScripts = (
  operations: ReadonlyArray<OperationBinding>,
  overrides?: Record<string, JsScriptDocument>
): Map<string, JsScriptDocument> => {
  const targets = useMemo(
    () =>
      operations.flatMap((operation) => {
        const target = operationTarget(operation);
        return target.kind === "script" && target.scriptId
          ? [
              {
                operationId: operation.id,
                id: target.scriptId,
                version: target.scriptVersion
              }
            ]
          : [];
      }),
    [operations]
  );
  const queries = useQueries({
    queries: targets.map(({ id, version }) => ({
      queryKey: ["app-operation-script", id, version],
      queryFn: async () => {
        const result = version === 0
          ? await trpcClient.jsScripts.get.query({id})
          : await trpcClient.jsScripts.documentVersions.get.query({id, version});
        return jsScriptDocument.parse(result.document);
      },
      enabled: !overrides?.[id],
      staleTime: 60_000,
      retry: false
    }))
  });
  const loaded = new Map<string, JsScriptDocument>();
  targets.forEach(({ operationId, id }, index) => {
    const document = overrides?.[id] ?? queries[index]?.data;
    if (document) {
      loaded.set(operationId, document);
    }
  });
  return loaded;
};
