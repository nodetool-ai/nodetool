/**
 * Bridge between the agent's `ui_app_*` frontend tools and the live Puck editor,
 * mirroring the timeline/3D editor bridges. The open editor registers a handler
 * on mount; the tools call {@link getPuckAgentHandler} to read and mutate the
 * app document.
 */
import { ComponentSummary } from "./puckDataOps";

export interface PuckComponentType {
  type: string;
  label?: string;
  fields: { name: string; type: string }[];
}

export interface PuckSnapshot {
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

let handler: PuckAgentHandler | null = null;

export const setPuckAgentHandler = (next: PuckAgentHandler | null): void => {
  handler = next;
};

export const hasPuckAgentHandler = (): boolean => handler !== null;

export const getPuckAgentHandler = (): PuckAgentHandler => {
  if (!handler) {
    throw new Error(
      "No app builder is open. Open the App Builder for a workflow to use app tools."
    );
  }
  return handler;
};
