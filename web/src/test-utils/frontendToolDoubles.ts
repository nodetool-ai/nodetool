/**
 * Doubles for the `ui_*` frontend tool contract.
 *
 * Every tool test needs a `FrontendToolContext`, and `FrontendToolState` has
 * seventeen members a given tool never touches. Building one per test file
 * meant seventeen `jest.fn()`s and an `as never` wherever a member's real type
 * was inconvenient; this builds the same double once, with the members still
 * checked against the interface.
 */
import { z } from "zod";
import type { NodeMetadata, Workflow, WorkflowList } from "../stores/ApiTypes";
import { FrontendToolRegistry } from "../lib/tools/frontendTools";
import type {
  FrontendToolContext,
  FrontendToolState
} from "../lib/tools/frontendTools";
import type { NodeStore, NodeStoreState } from "../stores/NodeStore";
import { stub, type PartialMembers } from "./doubles";

/** A `FrontendToolState` where nothing is wired up but the members a test passes. */
export function frontendToolState(
  overrides: Partial<FrontendToolState> = {}
): FrontendToolState {
  return {
    nodeMetadata: {},
    currentWorkflowId: null,
    getWorkflow: jest.fn(() => undefined),
    addWorkflow: jest.fn(),
    removeWorkflow: jest.fn(),
    getNodeStore: jest.fn(() => undefined),
    updateWorkflow: jest.fn(),
    saveWorkflow: jest.fn(async () => {}),
    getCurrentWorkflow: jest.fn(() => undefined),
    setCurrentWorkflowId: jest.fn(),
    fetchWorkflow: jest.fn(async () => {}),
    newWorkflow: jest.fn(() => stub<Workflow>({})),
    createNew: jest.fn(async () => stub<Workflow>({})),
    searchTemplates: jest.fn(async () =>
      stub<WorkflowList>({ workflows: [], next: null })
    ),
    copy: jest.fn(async () => stub<Workflow>({})),
    ...overrides
  };
}

/** The context a `ui_*` tool is called with, over a state a test controls. */
export function frontendToolContext(
  state: FrontendToolState = frontendToolState()
): Omit<FrontendToolContext, "abortSignal"> {
  return { getState: () => state };
}

/**
 * One node's metadata as the registry reports it. What a test declares is
 * still checked against `NodeMetadata`; the rest never reaches the tool.
 */
export function nodeMetadata(
  members: PartialMembers<NodeMetadata>
): NodeMetadata {
  return stub<NodeMetadata>({ properties: [], outputs: [], ...members });
}

/** The `nodeMetadata` map `FrontendToolState` holds, keyed by node type. */
export function nodeMetadataMap(
  entries: Record<string, PartialMembers<NodeMetadata>>
): Record<string, NodeMetadata> {
  return Object.fromEntries(
    Object.entries(entries).map(([type, members]) => [
      type,
      nodeMetadata({ node_type: type, ...members })
    ])
  );
}

/**
 * The JSON Schema a tool publishes in the manifest.
 *
 * `getManifest` types `parameters` as `JsonSchema`, which is
 * `Record<string, unknown>` — enough to hand to a model, not enough to assert
 * on. Parsing gives a manifest test the fields it reads and fails loudly if
 * the generated schema stops carrying them. Two levels of nesting is what the
 * tests need: a tool's own parameters, and the properties of an object one.
 */
const schemaNode = z.looseObject({
  type: z.string().optional(),
  required: z.array(z.string()).optional(),
  enum: z.array(z.string()).optional()
});

const parameterSchema = schemaNode.extend({
  properties: z
    .record(
      z.string(),
      schemaNode.extend({
        properties: z.record(z.string(), schemaNode).optional()
      })
    )
    .optional()
});

/** The published parameter schema of a registered `ui_*` tool. */
export function manifestParameters(
  name: string
): z.output<typeof parameterSchema> {
  const entry = FrontendToolRegistry.getManifest().find((t) => t.name === name);
  if (!entry) {
    throw new Error(`tool ${name} is not registered`);
  }
  return parameterSchema.parse(entry.parameters);
}

/**
 * A `NodeStore` handle for a test that only needs one to exist — the tools
 * that read a graph go through `getState()`, which answers with the members
 * the test supplies.
 */
export function nodeStoreDouble(
  state: PartialMembers<NodeStoreState> = {}
): NodeStore {
  const getState = (): NodeStoreState => stub<NodeStoreState>(state);
  const useStore = <R,>(select: (s: NodeStoreState) => R): R =>
    select(getState());
  const bound: unknown = Object.assign(useStore, {
    getState,
    getInitialState: getState,
    setState: () => {},
    subscribe: () => () => {}
  });
  // SAFETY: `NodeStore` is a zustand bound store — a selector call carrying the
  // four members above. A test drives it through `getState` or the selector,
  // and `stub` cannot build a callable.
  return bound as NodeStore;
}
