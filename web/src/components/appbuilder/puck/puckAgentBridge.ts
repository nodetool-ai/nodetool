/**
 * Bridge between the agent's `ui_app_*` frontend tools and the live Puck editor,
 * mirroring the timeline/3D editor bridges. The app document lives on the
 * workflow's `app_doc` field, so a workflow id identifies it. Each open editor
 * registers a handler under its workflow id on mount; the tools call
 * {@link getPuckAgentHandler} with that id to read and mutate the app document.
 */
import { ComponentSummary } from "./puckDataOps";

export interface PuckComponentType {
  type: string;
  label?: string;
  fields: { name: string; type: string }[];
}

export interface PuckSnapshot {
  workflowId: string;
  rootProps: Record<string, unknown>;
  selectedId: string | null;
  componentTypes: string[];
  components: ComponentSummary[];
}

export interface AddComponentArgs {
  type: string;
  props?: Record<string, unknown>;
  parentId?: string | null;
  slot?: string | null;
  index?: number;
}

export interface PuckAgentHandler {
  getSnapshot: () => PuckSnapshot;
  listComponentTypes: () => PuckComponentType[];
  addComponent: (args: AddComponentArgs) => ComponentSummary;
  updateComponent: (
    id: string,
    props: Record<string, unknown>
  ) => ComponentSummary | null;
  removeComponent: (id: string) => boolean;
  selectComponent: (id: string | null) => void;
  setRootProps: (props: Record<string, unknown>) => void;
}

const handlers = new Map<string, PuckAgentHandler>();

/**
 * Register (or clear, with null) the handler for one workflow's app document.
 * Every open app builder registers under its own workflow id, so the ui_app_*
 * tools address any open app explicitly instead of guessing at a focused one.
 */
export function setPuckAgentHandler(
  workflowId: string,
  next: PuckAgentHandler | null
): void {
  if (next) handlers.set(workflowId, next);
  else handlers.delete(workflowId);
}

export function hasPuckAgentHandler(workflowId: string): boolean {
  return handlers.has(workflowId);
}

export function getPuckAgentHandler(workflowId: string): PuckAgentHandler {
  const handler = handlers.get(workflowId);
  if (!handler) {
    const open = listOpenPuckWorkflowIds();
    throw new Error(
      `No app builder is open for workflow "${workflowId}". ` +
        (open.length > 0
          ? `Open app builders: ${open.join(", ")}.`
          : "No app builders are currently open.")
    );
  }
  return handler;
}

/** Workflow ids of every app document currently open in an app builder. */
export function listOpenPuckWorkflowIds(): string[] {
  return [...handlers.keys()];
}
