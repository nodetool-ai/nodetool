/**
 * Registers a {@link PuckAgentHandler} that drives the live Puck editor via
 * usePuck's dispatch. Rendered inside <Puck> (so usePuck is available) and emits
 * nothing. This is what lets the agent's `ui_app_*` tools edit the open app.
 */
import { useEffect, useMemo, useRef } from "react";
import { usePuck, type Config, type Data } from "@puckeditor/core";

import {
  getPuckAgentHandler,
  hasPuckAgentHandler,
  setPuckAgentHandler,
  PuckAgentHandler
} from "./puckAgentBridge";
import {
  addComponent,
  findComponent,
  flattenComponents,
  getSlotFields,
  makeComponentId,
  removeComponent,
  updateComponentProps
} from "./puckDataOps";
import {
  addOperation,
  addResource,
  bindingTargets,
  declareVariable,
  removeOperation,
  removeResource,
  removeVariable,
  updateOperation,
  updateVariable,
  type AppDocMeta
} from "../appDocOps";
import type { WorkflowState } from "../workflowState";

interface PuckAgentBinderProps {
  config: Config;
  /** Workflow whose `app_doc` this editor is editing — the app's identity. */
  workflowId: string;
  /** Operations, variables, and resources of the document being edited. */
  meta: AppDocMeta;
  onMetaChange: (next: AppDocMeta) => void;
  /** Host workflow's bindable surface, for `getBindingTargets`. */
  workflowState: WorkflowState;
}

const PuckAgentBinder: React.FC<PuckAgentBinderProps> = ({
  config,
  workflowId,
  meta,
  onMetaChange,
  workflowState
}) => {
  const puck = usePuck();
  const slotFields = useMemo(() => getSlotFields(config), [config]);

  // Latest live document and Puck api, refreshed every render so the stable
  // handler always reads current state. Mutations also write `working` forward
  // so back-to-back tool calls in one tick stay consistent.
  const working = useRef<Data>(puck.appState.data);
  working.current = puck.appState.data;
  const puckRef = useRef(puck);
  puckRef.current = puck;

  // Same trick for the document's non-UI half: Puck does not own it, the page
  // does, so the handler reads the latest value and writes edits forward.
  const metaRef = useRef<AppDocMeta>(meta);
  metaRef.current = meta;
  const onMetaChangeRef = useRef(onMetaChange);
  onMetaChangeRef.current = onMetaChange;
  const workflowStateRef = useRef<WorkflowState>(workflowState);
  workflowStateRef.current = workflowState;

  useEffect(() => {
    const rand = () => Math.random().toString(36).slice(2, 8);
    const apply = (next: Data) => {
      working.current = next;
      puckRef.current.dispatch({ type: "setData", data: next });
    };
    const applyMeta = (next: AppDocMeta) => {
      metaRef.current = next;
      onMetaChangeRef.current(next);
    };

    const handler: PuckAgentHandler = {
      getSnapshot: () => ({
        workflowId,
        rootProps: (working.current.root.props ?? {}) as Record<string, unknown>,
        selectedId:
          (puckRef.current.selectedItem?.props.id as string | undefined) ?? null,
        componentTypes: Object.keys(config.components ?? {}),
        components: flattenComponents(working.current, slotFields)
      }),
      listComponentTypes: () =>
        Object.entries(config.components ?? {}).map(([type, component]) => {
          const fields =
            (component as { label?: string; fields?: Record<string, { type?: string }> })
              .fields ?? {};
          return {
            type,
            label: (component as { label?: string }).label,
            fields: Object.entries(fields).map(([name, field]) => ({
              name,
              type: field?.type ?? "unknown"
            }))
          };
        }),
      addComponent: (args) => {
        const id = makeComponentId(args.type, rand);
        const { data, node } = addComponent(working.current, slotFields, {
          type: args.type,
          id,
          props: args.props,
          parentId: args.parentId,
          slot: args.slot,
          index: args.index
        });
        apply(data);
        return {
          id: node.props.id,
          type: node.type,
          props: node.props,
          parentId: args.parentId ?? null,
          slot: args.slot ?? null
        };
      },
      updateComponent: (id, props) => {
        const { data, node } = updateComponentProps(
          working.current,
          slotFields,
          id,
          props
        );
        if (!node) return null;
        apply(data);
        return findComponent(data, slotFields, id);
      },
      removeComponent: (id) => {
        const { data, removed } = removeComponent(working.current, slotFields, id);
        if (removed) apply(data);
        return removed;
      },
      selectComponent: (id) => {
        const selector = id ? puckRef.current.getSelectorForId(id) : null;
        puckRef.current.dispatch({
          type: "setUi",
          ui: { itemSelector: selector ?? null }
        });
      },
      setRootProps: (props) => {
        const root = working.current.root;
        apply({
          ...working.current,
          root: { ...root, props: { ...(root.props ?? {}), ...props } }
        });
      },

      listOperations: () => metaRef.current.operations,
      addOperation: (input) => {
        const { meta: next, operation } = addOperation(metaRef.current, input);
        applyMeta(next);
        return operation;
      },
      updateOperation: (id, patch) => {
        const { meta: next, operation } = updateOperation(
          metaRef.current,
          id,
          patch
        );
        if (!operation) return null;
        applyMeta(next);
        return operation;
      },
      removeOperation: (id) => {
        const { meta: next, removed } = removeOperation(metaRef.current, id);
        if (removed) applyMeta(next);
        return removed;
      },

      listVariables: () => metaRef.current.variables,
      declareVariable: (input) => {
        const { meta: next, variable } = declareVariable(metaRef.current, input);
        applyMeta(next);
        return variable;
      },
      updateVariable: (id, patch) => {
        const { meta: next, variable } = updateVariable(
          metaRef.current,
          id,
          patch
        );
        if (!variable) return null;
        applyMeta(next);
        return variable;
      },
      removeVariable: (id) => {
        const { meta: next, removed } = removeVariable(metaRef.current, id);
        if (removed) applyMeta(next);
        return removed;
      },

      listResources: () => metaRef.current.resources,
      addResource: (input) => {
        const { meta: next, resource } = addResource(metaRef.current, input);
        applyMeta(next);
        return resource;
      },
      removeResource: (id) => {
        const { meta: next, removed } = removeResource(metaRef.current, id);
        if (removed) applyMeta(next);
        return removed;
      },

      getBindingTargets: () =>
        bindingTargets(metaRef.current, workflowId, workflowStateRef.current)
    };

    setPuckAgentHandler(workflowId, handler);
    return () => {
      // Only clear our own registration — a second editor for the same workflow
      // may have taken the slot over in the meantime.
      if (
        hasPuckAgentHandler(workflowId) &&
        getPuckAgentHandler(workflowId) === handler
      ) {
        setPuckAgentHandler(workflowId, null);
      }
    };
  }, [config, slotFields, workflowId]);

  return null;
};

export default PuckAgentBinder;
