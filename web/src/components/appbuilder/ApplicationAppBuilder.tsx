import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import {
  AlertBanner,
  ConflictBanner,
  EditorButton,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  SPACING
} from "../ui_primitives";
import type {
  OperationBinding,
  ResourceBinding,
  VariableDeclaration
} from "@nodetool-ai/app-runtime";
import type { DocumentOp } from "@nodetool-ai/protocol";
import { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useNotificationStore } from "../../stores/NotificationStore";
import {
  isConcurrencyConflict,
  useApplication,
  useUpdateApplication
} from "../../hooks/useApplications";
import { trpc, trpcClient } from "../../trpc/client";
import {
  createEmptyDocument,
  parseApplicationDocument,
  type AppDocument
} from "./appData";
import AppBuilderShell from "./AppBuilderShell";
import { registerDocumentSync } from "../../stores/documentSync";
import { useConflictStore } from "../../stores/ConflictStore";
import type { MergeConflict } from "../../stores/documentMerge";
import {
  appDocumentFingerprint,
  appDocumentToMerge,
  mergeAppDocuments
} from "./merge";
import {
  getPuckAgentHandler,
  hasPuckAgentHandler
} from "./puck/puckAgentBridge";
import { useDocumentConflicts } from "../../hooks/useDocumentConflicts";

interface ApplicationAppBuilderProps {
  applicationId: string;
  /**
   * The graph the assistant's workflow tools should target. Reported whenever
   * the live operations change, including the seed, so the surface dock can
   * bind the same thread Design, Run, and Settings share.
   */
  onAgentWorkflowIdChange?: (workflowId: string | undefined) => void;
}

/**
 * A workflow-shaped stand-in for an app that has no operation bound yet, so a
 * brand-new app still opens on a canvas. It contributes no bindable inputs or
 * outputs.
 */
const placeholderWorkflow = (id: string, name: string): Workflow => ({
  id,
  name,
  description: "",
  graph: { nodes: [], edges: [] },
  access: "private",
  created_at: "",
  updated_at: ""
});

/**
 * The builder targeting an `applications` record: loads through
 * `applications.get`, saves the whole document through `applications.update`.
 *
 * The save carries `baseUpdatedAt`, so the server compare-and-swaps against the
 * row this editor read. A losing write is reported and the canvas is left
 * untouched — the user's edits are still there to re-apply after reloading.
 */
const ApplicationAppBuilder: React.FC<ApplicationAppBuilderProps> = ({
  applicationId,
  onAgentWorkflowIdChange
}) => {
  const { data: application, isLoading, isError, error } =
    useApplication(applicationId);
  const updateApplication = useUpdateApplication();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const utils = trpc.useUtils();
  const fetchWorkflow = useWorkflowManager((s) => s.fetchWorkflow);

  // Why the "changed elsewhere" banner is up: a save the server rejected.
  // External writes are merged per merge unit instead (ADR 0001) and their
  // refused values surface through the shared conflict banner.
  const [conflict, setConflict] = useState<"save-rejected" | null>(null);
  // Bumped to remount the editor when the user asks for the latest document.
  const [seed, setSeed] = useState(0);
  // The canvas's live operations, reported by the shell. Null until it mounts.
  const [liveOperations, setLiveOperations] = useState<ReadonlyArray<
    OperationBinding
  > | null>(null);

  // The row revision this canvas is based on. Kept in a ref because the
  // `resource_change` for our own save can beat the mutation's cache write,
  // and comparing against a stale `application.updatedAt` would raise the
  // banner on the user's own save.
  const revisionRef = useRef<string | null>(null);
  useEffect(() => {
    if (application?.updatedAt) revisionRef.current = application.updatedAt;
  }, [application?.updatedAt]);

  // The document this canvas last read or saved — the merge base and the
  // reference point for the dirty check. JSON form: the live Puck document
  // is assembled fresh on every read.
  const lastSyncedRef = useRef<string | null>(null);

  /**
   * Whether the canvas holds edits the base does not have. Read by the sync
   * registration and by the base-tracking effect below, so both answer the
   * same question.
   */
  const isCanvasDirty = useCallback((): boolean => {
    if (!hasPuckAgentHandler(applicationId)) return false;
    if (lastSyncedRef.current == null) return false;
    try {
      // SAFETY: the ref only ever holds `JSON.stringify` of a document this
      // component read from the row or merged, so the parse round-trips.
      const stored = JSON.parse(lastSyncedRef.current) as AppDocument;
      return (
        appDocumentFingerprint(getPuckAgentHandler(applicationId).document()) !==
        appDocumentFingerprint(stored)
      );
    } catch {
      return true;
    }
  }, [applicationId]);

  useEffect(() => {
    if (application?.document == null) return;
    // Only re-baseline on a load, or while the canvas has nothing unsaved. A
    // refetch that lands mid-edit would otherwise move the merge base under
    // the draft, and every unit the base gained would then read as a draft
    // edit on the next external write.
    if (lastSyncedRef.current !== null && isCanvasDirty()) return;
    lastSyncedRef.current = JSON.stringify(application.document);
  }, [application?.document, isCanvasDirty]);

  const handleReload = useCallback(async () => {
    await utils.applications.get.invalidate({ id: applicationId });
    setConflict(null);
    useConflictStore.getState().clear(`application:${applicationId}`);
    // The shell remounts and reseeds from the reloaded row, so its old
    // operations must not outlive it.
    setLiveOperations(null);
    setSeed((value) => value + 1);
  }, [applicationId, utils]);

  /** Take one refused external value into the draft as a user edit. */
  const acceptExternalValue = useCallback(
    (conflict: MergeConflict): void => {
      if (!hasPuckAgentHandler(applicationId)) return;
      const handler = getPuckAgentHandler(applicationId);
      // SAFETY: a component conflict's `external` is the flattened unit the
      // adapter produced (`FlatComponent`), so it carries the node and its
      // placement; every field is read defensively for the other unit kinds,
      // which never reach the component branch.
      const external = conflict.external as {
        node?: { type?: unknown; props?: Record<string, unknown> };
        parentId?: string | null;
        slot?: string | null;
      } | null;

      if (conflict.reason === "replaced") {
        void handleReload();
        return;
      }
      if (conflict.unit.kind === "component") {
        if (external == null) {
          handler.removeComponent(conflict.unit.id);
          return;
        }
        const type =
          typeof external.node?.type === "string" ? external.node.type : null;
        const components = handler.getSnapshot().components;
        const known = components.find((c) => c.id === conflict.unit.id);
        const place = (): void => {
          if (!type) return;
          // Re-added components go back where the server had them; a parent
          // that no longer exists makes the child dangling and it is dropped
          // instead.
          const parentKnown = external.parentId
            ? components.some((c) => c.id === external.parentId)
            : false;
          if (external.parentId != null && !parentKnown) return;
          handler.addComponent({
            type,
            props: external.node?.props ?? {},
            parentId: external.parentId ?? undefined,
            slot: external.slot ?? undefined
          });
        };
        if (!type || !known) {
          place();
          return;
        }
        if (known.type !== type) {
          // A type change is not a prop patch: replace the component so the
          // accepted value is the one the server actually holds.
          handler.removeComponent(conflict.unit.id);
          place();
          return;
        }
        handler.updateComponent(conflict.unit.id, external.node?.props ?? {});
        return;
      }
      if (conflict.unit.kind === "operation") {
        const incoming = conflict.external as OperationBinding | null;
        if (!incoming) {
          handler.removeOperation(conflict.unit.id);
          return;
        }
        const existing = handler.listOperations();
        if (existing.some((o) => o.id === incoming.id)) {
          handler.updateOperation(incoming.id, incoming);
        } else {
          handler.addOperation(incoming);
        }
        return;
      }
      if (conflict.unit.kind === "variable") {
        const incoming = conflict.external as VariableDeclaration | null;
        if (!incoming) {
          handler.removeVariable(conflict.unit.id);
          return;
        }
        if (handler.listVariables().some((v) => v.id === incoming.id)) {
          handler.updateVariable(incoming.id, incoming);
        } else {
          handler.declareVariable(incoming);
        }
        return;
      }
      if (conflict.unit.kind === "resource") {
        const incoming = conflict.external as ResourceBinding | null;
        if (!incoming) {
          handler.removeResource(conflict.unit.id);
          return;
        }
        if (handler.listResources().some((r) => r.id === incoming.id)) {
          handler.updateResource(incoming.id, incoming);
        } else {
          handler.addResource(incoming);
        }
        return;
      }
      if (conflict.unit.kind === "field" && conflict.unit.id === "root") {
        handler.setRootProps(
          (conflict.external ?? {}) as Record<string, unknown>
        );
        return;
      }
      if (conflict.unit.kind === "field" && conflict.unit.id === "zones") {
        const current = handler.document();
        // SAFETY: `ui` is an open record in the document schema; widening it
        // to spread and narrowing back changes no value, and `zones` is the
        // one key replaced — with the value the adapter read off `ui.zones`.
        const ui = current.ui as unknown as Record<string, unknown>;
        handler.applyExternalDocument({
          ...current,
          ui: { ...ui, zones: conflict.external } as AppDocument["ui"]
        });
      }
    },
    [applicationId, handleReload]
  );

  /**
   * Merge one external write into the dirty canvas per merge unit: fetch the
   * row, run the engine against the last synced document, apply without an
   * undo entry, and list what the draft refused.
   */
  const mergeExternal = useCallback(
    async (notice: { ops?: DocumentOp[] }): Promise<void> => {
      let fresh: { updatedAt: string; document: AppDocument };
      try {
        // SAFETY: tRPC infers the row's `document` as an open record because
        // the router types it with `z.unknown()`. The row is the same shape
        // `useApplication` reads, and `parseApplicationDocument` below is
        // what actually validates it.
        const row = (await trpcClient.applications.get.query({
          id: applicationId
        })) as unknown as { updatedAt: string; document: AppDocument };
        fresh = row;
      } catch (error) {
        console.error("Failed to fetch app for merge", error);
        return;
      }
      const baseDoc = lastSyncedRef.current;
      if (!hasPuckAgentHandler(applicationId) || baseDoc == null) return;
      const handler = getPuckAgentHandler(applicationId);

      const base = parseApplicationDocument(
        JSON.parse(baseDoc) as AppDocument
      );
      const draft = handler.document();
      if (!base) return;

      const { doc: merged, conflicts, nextBase } = mergeAppDocuments(
        appDocumentToMerge(base),
        appDocumentToMerge(draft),
        appDocumentToMerge(fresh.document),
        notice.ops
      );

      // A whole-document replacement (no ops) leaves the draft untouched —
      // the server copy is only ever OFFERED through the banner below.
      const replaced = conflicts.some(
        (conflict) => conflict.reason === "replaced"
      );
      if (!replaced) {
        // SAFETY: as above — `ui` is an open record, spread and re-narrowed
        // with only the three keys the merge resolved replaced.
        const draftUi = draft.ui as unknown as Record<string, unknown>;
        handler.applyExternalDocument({
          ...draft,
          ui: {
            ...draftUi,
            content: merged.content,
            zones: merged.zones,
            root: { props: merged.rootProps }
          } as AppDocument["ui"],
          operations: merged.operations as AppDocument["operations"],
          variables: merged.variables as AppDocument["variables"],
          resources: merged.resources as AppDocument["resources"]
        });
      }
      // The CAS token always rolls: the next save has to compare against the
      // row the server now holds. The merge BASE rolls only when the merged
      // document actually landed — a replacement that was merely offered
      // leaves the draft branched off the old base, and moving the base under
      // it would make every unit the server wrote read as a draft edit.
      revisionRef.current = fresh.updatedAt;
      if (!replaced) {
        // The server copy, except in the units the draft refused, which keep
        // the base they had. Rolling those forward too makes the refusal
        // permanent and silent: the next write reads a refused unit as
        // unchanged on the server, so the draft wins with nothing listed and
        // the external value can never be taken again.
        // SAFETY: same widening as the apply above — `ui` is an open record
        // and only the keys the merge resolved are replaced.
        const freshUi = fresh.document.ui as unknown as Record<string, unknown>;
        lastSyncedRef.current = JSON.stringify({
          ...fresh.document,
          ui: {
            ...freshUi,
            content: nextBase.content,
            zones: nextBase.zones,
            root: { props: nextBase.rootProps }
          } as AppDocument["ui"],
          operations: nextBase.operations as AppDocument["operations"],
          variables: nextBase.variables as AppDocument["variables"],
          resources: nextBase.resources as AppDocument["resources"]
        } satisfies AppDocument);
      }

      const listed = conflicts.map((c) =>
        c.unit.id ? c : { ...c, unit: { ...c.unit, id: c.unit.kind } }
      );
      useConflictStore.getState().addConflicts(`application:${applicationId}`, listed, {
        onAccept: (unitId) => {
          const entry =
            useConflictStore.getState().byKey[`application:${applicationId}`];
          const target = entry?.conflicts.find((c) => c.unit.id === unitId);
          if (target) acceptExternalValue(target);
        },
        onDiscard: () => {}
      });
    },
    [acceptExternalValue, applicationId]
  );

  // This editor saves on command. A clean canvas takes the server copy; a
  // dirty one merges the external change per merge unit — the draft wins,
  // refused values land in the conflict banner.
  useEffect(
    () =>
      registerDocumentSync("application", applicationId, {
        localRevision: () => revisionRef.current,
        isDirty: isCanvasDirty,
        reload: () => {
          void handleReload();
        },
        merge: (notice) => {
          void mergeExternal(notice);
        }
      }),
    [applicationId, handleReload, isCanvasDirty, mergeExternal]
  );

  const document = useMemo<AppDocument | null>(() => {
    if (!application) return null;
    return (
      parseApplicationDocument(application.document) ??
      // Untitled on purpose — see createEmptyDocument's caller in
      // `capabilities/apps.ts`. The name lives on the row, not in the page.
      createEmptyDocument()
    );
  }, [application]);

  // The operations the canvas holds, which lead the saved row: the agent binds
  // a workflow to an operation long before anything saves. Deriving the loads
  // from `document` alone left that workflow unfetched, so the binding targets
  // for the operation being authored came back `ioAvailable: false` and the
  // agent had to guess its binding tokens.
  const operations = liveOperations ?? document?.operations ?? [];

  const operationWorkflowId = operations[0]?.workflowId ?? "";

  // Every workflow the app's operations run, not just the first: a binding
  // authored on the second operation is offered that workflow's own surface.
  // Keyed on the ids themselves so a re-render that changed no operation does
  // not hand `useQueries` a new array.
  const workflowIdKey = [
    ...new Set(operations.map((operation) => operation.workflowId).filter(Boolean))
  ]
    .sort()
    .join("|");
  const workflowIds = useMemo(
    () => (workflowIdKey ? workflowIdKey.split("|") : []),
    [workflowIdKey]
  );

  const workflowQueries = useQueries({
    queries: workflowIds.map((id) => ({
      queryKey: ["app-builder-workflow", id],
      queryFn: async () => await fetchWorkflow(id),
      staleTime: 0,
      refetchOnWindowFocus: false,
      retry: false
    }))
  });

  const fetched: Record<string, Workflow> = {};
  workflowIds.forEach((id, index) => {
    const data = workflowQueries[index]?.data;
    if (data) fetched[id] = data;
  });
  const fetchedRef = useRef(fetched);
  fetchedRef.current = fetched;
  // Which graphs have arrived, and when each last changed. The graphs are read
  // from the ref, so the map keeps its identity across renders that changed
  // nothing -- but keying on ids alone would pin the first copy of a graph
  // forever, and a refetched workflow would go on serving the binding pickers
  // a surface it no longer has.
  const fetchedKey = workflowIds
    .map((id, index) => `${id}:${workflowQueries[index]?.dataUpdatedAt ?? 0}`)
    .join("|");
  const operationWorkflows = useMemo(
    () => fetchedRef.current,
    [fetchedKey]
  );

  const workflow = operationWorkflows[operationWorkflowId];

  const onAgentWorkflowIdChangeRef = useRef(onAgentWorkflowIdChange);
  onAgentWorkflowIdChangeRef.current = onAgentWorkflowIdChange;
  useEffect(() => {
    onAgentWorkflowIdChangeRef.current?.(workflow?.id);
  }, [workflow?.id]);

  const editorWorkflow = useMemo(
    () =>
      workflow ?? placeholderWorkflow(applicationId, application?.name ?? ""),
    [application?.name, applicationId, workflow]
  );

  const handleSave = useCallback(
    async (next: AppDocument) => {
      if (!application) return;
      try {
        const saved = await updateApplication.mutateAsync({
          id: application.id,
          // Spread into fresh literals: the router's schema types `ui` as an
          // open record, which an interface does not satisfy directly.
          document: { ...next, ui: { ...next.ui } },
          // Compare-and-swap against the revision this canvas is based on —
          // the ref, not the cached row: an external merge rolls the ref
          // forward without refetching the query, and saving against the
          // stale row revision would fail its CAS every time.
          baseUpdatedAt: revisionRef.current ?? application.updatedAt
        });
        setConflict(null);
        revisionRef.current = saved.updatedAt;
        lastSyncedRef.current = JSON.stringify(saved.document);
        addNotification({ type: "success", content: "App saved" });
      } catch (err) {
        if (isConcurrencyConflict(err)) {
          setConflict("save-rejected");
          addNotification({
            type: "error",
            alert: true,
            content: `"${application.name}" changed elsewhere — your edits were not saved.`
          });
          return;
        }
        addNotification({
          type: "error",
          alert: true,
          content: err instanceof Error ? err.message : "Failed to save app"
        });
      }
    },
    [addNotification, application, updateApplication]
  );

  if (isLoading) {
    return <LoadingSpinner size="large" text="Loading app" />;
  }

  if (isError || !application || !document) {
    return (
      <EmptyState
        variant="error"
        title="Could not load app"
        description={error?.message ?? "The app may have been deleted."}
      />
    );
  }

  return (
    <AppBuilderShell
      key={`${applicationId}:${seed}`}
      applicationId={applicationId}
      document={document}
      workflow={editorWorkflow}
      operationWorkflows={operationWorkflows}
      agentWorkflowId={workflow?.id}
      onOperationsChange={setLiveOperations}
      projectId={application.projectId}
      onSave={(next) => void handleSave(next)}
      banner={
        conflict ? (
          <FlexColumn sx={{ px: SPACING.lg, py: SPACING.md }}>
            <AlertBanner
              severity="warning"
              title="Saved elsewhere"
              action={
                <EditorButton
                  size="small"
                  variant="text"
                  onClick={() => void handleReload()}
                >
                  Reload
                </EditorButton>
              }
            >
              This app changed since it was opened, so the last save was
              rejected. Reload to start from the current version — reloading
              discards what is on this canvas.
            </AlertBanner>
          </FlexColumn>
        ) : (
          <ExternalConflictHost applicationId={applicationId} />
        )
      }
    />
  );
};

/**
 * The shared conflict banner for external writes the dirty draft refused.
 * Mounted through the shell's banner slot; empty until a merge lists one.
 * Accept routes through the resolvers the merging sync hook registered.
 */
const ExternalConflictHost: React.FC<{ applicationId: string }> = ({
  applicationId
}) => {
  const conflicts = useDocumentConflicts("application", applicationId);
  if (conflicts.items.length === 0) return null;
  return (
    <ConflictBanner
      conflicts={conflicts.items}
      onAccept={conflicts.accept}
      onDiscard={conflicts.discard}
      sx={{ mx: SPACING.lg, my: SPACING.md }}
    />
  );
};

export default ApplicationAppBuilder;
