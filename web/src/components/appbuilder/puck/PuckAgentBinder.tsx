/**
 * Registers a {@link PuckAgentHandler} that drives the live Puck editor via
 * usePuck's dispatch. Rendered inside <Puck> (so usePuck is available) and emits
 * nothing. This is what lets the agent's `ui_app_*` tools edit the open app.
 */
import { useEffect, useMemo, useRef } from "react";
import { usePuck, type Config, type Data } from "@puckeditor/core";

import {
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

interface PuckAgentBinderProps {
  config: Config;
}

const PuckAgentBinder: React.FC<PuckAgentBinderProps> = ({ config }) => {
  const puck = usePuck();
  const slotFields = useMemo(() => getSlotFields(config), [config]);

  // Latest live document and Puck api, refreshed every render so the stable
  // handler always reads current state. Mutations also write `working` forward
  // so back-to-back tool calls in one tick stay consistent.
  const working = useRef<Data>(puck.appState.data);
  working.current = puck.appState.data;
  const puckRef = useRef(puck);
  puckRef.current = puck;

  useEffect(() => {
    const rand = () => Math.random().toString(36).slice(2, 8);
    const apply = (next: Data) => {
      working.current = next;
      puckRef.current.dispatch({ type: "setData", data: next });
    };

    const handler: PuckAgentHandler = {
      getSnapshot: () => ({
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
      }
    };

    setPuckAgentHandler(handler);
    return () => setPuckAgentHandler(null);
  }, [config, slotFields]);

  return null;
};

export default PuckAgentBinder;
