/**
 * Bridge between the agent's `ui_app_*` frontend tools and the live Puck editor,
 * mirroring the timeline/3D editor bridges. An app is its own resource — an
 * `applications` row — so the application id identifies it. Each open editor
 * registers a handler under its application id on mount; the tools call
 * {@link getPuckAgentHandler} with that id to read and mutate the app document.
 *
 * There is no workflow-id fallback: the workflows an app binds are named by its
 * operations, and creating an app for a workflow is an explicit scaffold, not
 * something a tool call infers.
 */
import type {
  ApplicationDocument,
  BindingTargets,
  OperationBinding,
  OperationInput,
  OperationPatch,
  ResourceBinding,
  ResourceInput,
  VariableDeclaration,
  VariableInput,
  VariablePatch
} from "@nodetool-ai/app-runtime";

import { ComponentSummary } from "./puckDataOps";

interface PuckComponentType {
  type: string;
  label?: string;
  fields: { name: string; type: string }[];
}

export interface PuckSnapshot {
  applicationId: string;
  rootProps: Record<string, unknown>;
  selectedId: string | null;
  componentTypes: string[];
  components: ComponentSummary[];
}

interface AddComponentArgs {
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
  // The non-UI half of the document: what widgets bind to.
  listOperations: () => OperationBinding[];
  addOperation: (input: OperationInput) => OperationBinding;
  updateOperation: (
    id: string,
    patch: OperationPatch
  ) => OperationBinding | null;
  removeOperation: (id: string) => boolean;
  listVariables: () => VariableDeclaration[];
  declareVariable: (input: VariableInput) => VariableDeclaration;
  updateVariable: (
    id: string,
    patch: VariablePatch
  ) => VariableDeclaration | null;
  removeVariable: (id: string) => boolean;
  listResources: () => ResourceBinding[];
  addResource: (input: ResourceInput) => ResourceBinding;
  removeResource: (id: string) => boolean;
  getBindingTargets: () => BindingTargets;
  /**
   * The working document — the same shape the editor saves to the
   * `applications` row, but assembled from the live (unsaved) Puck data and
   * meta. This is what `ui_app_debug` sends to the server so a verdict grades
   * the draft the agent is editing rather than the last saved row.
   */
  document: () => ApplicationDocument;
}

const handlers = new Map<string, PuckAgentHandler>();

/**
 * Register (or clear, with null) the handler for one application's document.
 * Every open app builder registers under its own application id, so the
 * ui_app_* tools address any open app explicitly instead of guessing at a
 * focused one.
 */
export function setPuckAgentHandler(
  applicationId: string,
  next: PuckAgentHandler | null
): void {
  if (next) handlers.set(applicationId, next);
  else handlers.delete(applicationId);
}

export function hasPuckAgentHandler(applicationId: string): boolean {
  return handlers.has(applicationId);
}

export function getPuckAgentHandler(applicationId: string): PuckAgentHandler {
  const handler = handlers.get(applicationId);
  if (!handler) {
    const open = listOpenPuckApplicationIds();
    throw new Error(
      `No app builder is open for application "${applicationId}". ` +
        (open.length > 0
          ? `Open app builders: ${open.join(", ")}. `
          : "No app builders are currently open. ") +
        'Call ui_open_document with type "app" to open it.'
    );
  }
  return handler;
}

/** Application ids of every app currently open in an app builder. */
export function listOpenPuckApplicationIds(): string[] {
  return [...handlers.keys()];
}
