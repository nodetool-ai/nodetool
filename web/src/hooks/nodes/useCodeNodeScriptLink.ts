/**
 * Linking a Code node to a JS script document.
 *
 * A Code node always runs its own body; linking a script *materializes* one.
 * This hook owns the four state transitions the editor offers — link, update to
 * latest, extract, detach — so the node body only has to render buttons.
 *
 * Link and update-to-latest copy the pinned version's code, secrets,
 * timeout and ports onto the node in one undoable update, and the `script`
 * property records which version they came from. That copy is what executes: a
 * run reads no script row, so a workflow stays runnable wherever it is opened.
 * Detach only clears the provenance — the body is already inline.
 */
import { useCallback, useMemo } from "react";
import { shallow } from "zustand/shallow";

import type { jsScripts } from "@nodetool-ai/protocol/api-schemas";
import {
  materializeJsScriptNode,
  type MaterializableJsScript
} from "@nodetool-ai/node-sdk/js-script-materialize";

import { useNodes } from "../../contexts/NodeContext";
import { trpc, type RouterOutputs } from "../../trpc/client";
import type { TypeMetadata } from "../../stores/ApiTypes";
import type {
  DynamicSlotDeclaration,
  NodeData
} from "../../stores/NodeData";
import { isNumber, isObjectLike, isString } from "../../utils/typePredicates";

type JsScriptPort = jsScripts.JsScriptPort;

/**
 * A stored script's document as the tRPC client hands it back — the schema's
 * output type, which is what every caller of `pinCurrentVersion` passes.
 */
type StoredJsScriptDocument = RouterOutputs["jsScripts"]["get"]["document"];

/** What the node stores while linked. */
export interface JsScriptLink {
  id: string;
  version: number;
}

interface CodeNodeScriptLinkState {
  link: JsScriptLink | null;
  linkedName: string | null;
  /** Pick a script and pin its current content as a version. */
  linkScript: (scriptId: string) => Promise<void>;
  /** Re-pin to the script's current content and re-copy it onto the node. */
  updateToLatest: () => Promise<void>;
  /**
   * Lift the node's body, ports and secrets into a new script.
   * With a `category`, the script also lands in the node menu as a custom node.
   */
  extractToScript: (name: string, category?: string) => Promise<string>;
  /** Expose the linked script in the node menu under `category`. */
  addToPalette: (category: string) => Promise<void>;
  /** Keep the pinned body inline and drop the link. */
  detach: () => void;
}

const readLink = (value: unknown): JsScriptLink | null => {
  if (!isObjectLike(value) || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return isString(record.id) &&
    record.id !== "" &&
    isNumber(record.version)
    ? { id: record.id, version: record.version }
    : null;
};

const slotsToPorts = (
  slots: Record<string, DynamicSlotDeclaration> | undefined
): JsScriptPort[] =>
  Object.entries(slots ?? {}).map(([name, slot]) => ({
    name,
    type: slot.type?.type ?? "any"
  }));

const outputsToPorts = (
  outputs: Record<string, TypeMetadata> | undefined
): JsScriptPort[] =>
  Object.entries(outputs ?? {}).map(([name, type]) => ({
    name,
    type: type?.type ?? "any"
  }));

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

export function useCodeNodeScriptLink(
  nodeId: string,
  data: NodeData
): CodeNodeScriptLinkState {
  const { findNode, updateNodeData } = useNodes(
    (state) => ({
      findNode: state.findNode,
      updateNodeData: state.updateNodeData
    }),
    shallow
  );
  const utils = trpc.useUtils();
  const createScript = trpc.jsScripts.create.useMutation();
  const updateScript = trpc.jsScripts.update.useMutation();
  const createVersion = trpc.jsScripts.documentVersions.create.useMutation();

  const link = useMemo(() => readLink(data.properties?.script), [
    data.properties?.script
  ]);

  const linked = trpc.jsScripts.get.useQuery(
    { id: link?.id ?? "" },
    { enabled: link !== null, staleTime: 30_000 }
  );

  /**
   * The version number that pins a script's current content: the newest
   * snapshot when it already matches, else a fresh one. Linking must not pin a
   * version whose document is not what the user just looked at.
   */
  const pinCurrentVersion = useCallback(
    async (
      scriptId: string,
      document: StoredJsScriptDocument
    ): Promise<number> => {
      const versions = await utils.jsScripts.documentVersions.list.fetch({
        id: scriptId,
        limit: 1
      });
      const newest = versions[0];
      if (newest) {
        const snapshot = await utils.jsScripts.documentVersions.get.fetch({
          id: scriptId,
          version: newest.version
        });
        if (JSON.stringify(snapshot.document) === JSON.stringify(document)) {
          return newest.version;
        }
      }
      const created = await createVersion.mutateAsync({
        id: scriptId,
        name: "Linked from a Code node"
      });
      return created.version;
    },
    [createVersion, utils]
  );

  const materialize = useCallback(
    (scriptId: string, version: number, document: MaterializableJsScript) => {
      const materialized = materializeJsScriptNode(document, {
        id: scriptId,
        version
      });
      updateNodeData(nodeId, {
        properties: {
          ...(findNode(nodeId)?.data?.properties ?? {}),
          ...materialized.properties
        },
        dynamic_inputs: materialized.dynamic_inputs,
        dynamic_outputs: materialized.dynamic_outputs
      });
    },
    [findNode, nodeId, updateNodeData]
  );

  const linkScript = useCallback(
    async (scriptId: string) => {
      const script = await utils.jsScripts.get.fetch({ id: scriptId });
      const version = await pinCurrentVersion(scriptId, script.document);
      materialize(scriptId, version, script.document);
    },
    [materialize, pinCurrentVersion, utils]
  );

  const updateToLatest = useCallback(async () => {
    if (!link) return;
    const script = await utils.jsScripts.get.fetch({ id: link.id });
    const version = await pinCurrentVersion(link.id, script.document);
    materialize(link.id, version, script.document);
  }, [link, materialize, pinCurrentVersion, utils]);

  const extractToScript = useCallback(
    async (name: string, category?: string): Promise<string> => {
      const node = findNode(nodeId);
      const properties = node?.data?.properties ?? {};
      const document = {
        schemaVersion: 1 as const,
        description: "",
        code: isString(properties.code) ? properties.code : "",
        inputs: slotsToPorts(node?.data?.dynamic_inputs),
        outputs: outputsToPorts(node?.data?.dynamic_outputs),
        secrets: stringList(properties.secrets),
        timeoutSeconds:
          isNumber(properties.timeout) ? properties.timeout : 30,
        tests: [],
        palette: category === undefined ? undefined : { category }
      };
      const created = await createScript.mutateAsync({ name, document });
      const version = await pinCurrentVersion(created.id, created.document);
      materialize(created.id, version, created.document);
      void utils.jsScripts.list.invalidate();
      void utils.jsScripts.palette.invalidate();
      return created.id;
    },
    [createScript, findNode, materialize, nodeId, pinCurrentVersion, utils]
  );

  const addToPalette = useCallback(
    async (category: string): Promise<void> => {
      if (!link) return;
      const script = await utils.jsScripts.get.fetch({ id: link.id });
      await updateScript.mutateAsync({
        id: link.id,
        // SAFETY: the router's output document and its input document differ
        // only in which `unknown` fields zod marks optional; the value is the
        // document the server just sent back.
        document: {
          ...script.document,
          palette: { category }
        } as jsScripts.JsScriptDocument,
        baseUpdatedAt: script.updatedAt
      });
      void utils.jsScripts.get.invalidate({ id: link.id });
      void utils.jsScripts.palette.invalidate();
    },
    [link, updateScript, utils]
  );

  const detach = useCallback(() => {
    const properties = { ...(findNode(nodeId)?.data?.properties ?? {}) };
    delete properties.script;
    updateNodeData(nodeId, { properties });
  }, [findNode, nodeId, updateNodeData]);

  return {
    link,
    linkedName: linked.data?.name ?? null,
    linkScript,
    updateToLatest,
    extractToScript,
    addToPalette,
    detach
  };
}
