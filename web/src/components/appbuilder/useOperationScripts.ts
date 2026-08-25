/**
 * The documents of the JS scripts an app's operations run, by script id.
 *
 * A script operation's bindable surface is its declared ports, so anything that
 * lists binding targets or derives IO needs the document, not just the id.
 */
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  operationTarget,
  type OperationBinding
} from "@nodetool-ai/app-runtime";
import type { JsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

import { trpcClient } from "../../trpc/client";

const operationScriptIds = (
  operations: ReadonlyArray<OperationBinding>
): string[] => {
  const ids = new Set<string>();
  for (const operation of operations) {
    const target = operationTarget(operation);
    if (target.kind === "script" && target.scriptId) ids.add(target.scriptId);
  }
  return [...ids].sort();
};

export const useOperationScripts = (
  operations: ReadonlyArray<OperationBinding>
): Map<string, JsScriptDocument> => {
  const ids = useMemo(() => operationScriptIds(operations), [operations]);

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["app-operation-script", id],
      queryFn: async () => await trpcClient.jsScripts.get.query({ id }),
      staleTime: 60_000,
      retry: false
    }))
  });

  const loaded = new Map<string, JsScriptDocument>();
  ids.forEach((id, index) => {
    const data = queries[index]?.data;
    if (data) loaded.set(id, data.document as JsScriptDocument);
  });
  return loaded;
};
