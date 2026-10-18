import {
  GUI_CLIENT_TYPES,
  INTERACTIVE_CLIENT_TYPES,
  type AnalyticsClientType
} from "./clients.js";
import {
  COMMAND_CATEGORIES,
  COUNT_BUCKETS,
  DURATION_BUCKETS,
  ERROR_CATEGORIES,
  EXECUTION_MODES,
  FEATURES,
  NODE_COUNT_BUCKETS
} from "./properties.js";

/**
 * One allowlisted event: which clients may emit it and the exact set of
 * properties it carries. Every property is required and takes one value from
 * its enum. There is no optional or free-form property.
 */
export interface AnalyticsEventDefinition {
  readonly clients: readonly AnalyticsClientType[];
  readonly properties: Readonly<Record<string, readonly string[]>>;
}

const BACKEND_ONLY = ["cloud_backend"] as const;

/**
 * The complete event table. An event or property missing here cannot be
 * emitted, serialized or ingested. Prefer one shared event with a
 * `clientType` over a per-client event with the same meaning.
 */
export const ANALYTICS_EVENTS = {
  /** A GUI client finished booting. */
  app_started: { clients: GUI_CLIENT_TYPES, properties: {} },
  /** One CLI invocation, reported by top-level command category only. */
  cli_started: {
    clients: ["npm_cli"],
    properties: { commandCategory: COMMAND_CATEGORIES }
  },
  workflow_created: { clients: GUI_CLIENT_TYPES, properties: {} },
  workflow_run: {
    clients: INTERACTIVE_CLIENT_TYPES,
    properties: {
      executionMode: EXECUTION_MODES,
      nodeCountBucket: NODE_COUNT_BUCKETS
    }
  },
  workflow_run_succeeded: {
    clients: INTERACTIVE_CLIENT_TYPES,
    properties: {
      executionMode: EXECUTION_MODES,
      nodeCountBucket: NODE_COUNT_BUCKETS,
      durationBucket: DURATION_BUCKETS
    }
  },
  workflow_run_failed: {
    clients: INTERACTIVE_CLIENT_TYPES,
    properties: {
      executionMode: EXECUTION_MODES,
      nodeCountBucket: NODE_COUNT_BUCKETS,
      durationBucket: DURATION_BUCKETS,
      errorCategory: ERROR_CATEGORIES
    }
  },
  /**
   * Locally aggregated counters for one session, sent once when the session
   * ends instead of an event per interaction.
   */
  session_summary: {
    clients: INTERACTIVE_CLIENT_TYPES,
    properties: {
      workflowRuns: COUNT_BUCKETS,
      workflowsCreated: COUNT_BUCKETS
    }
  },
  execution_started: {
    clients: BACKEND_ONLY,
    properties: { executionMode: EXECUTION_MODES, feature: FEATURES }
  },
  execution_completed: {
    clients: BACKEND_ONLY,
    properties: {
      executionMode: EXECUTION_MODES,
      feature: FEATURES,
      durationBucket: DURATION_BUCKETS
    }
  },
  execution_failed: {
    clients: BACKEND_ONLY,
    properties: {
      executionMode: EXECUTION_MODES,
      feature: FEATURES,
      durationBucket: DURATION_BUCKETS,
      errorCategory: ERROR_CATEGORIES
    }
  }
} as const satisfies Record<string, AnalyticsEventDefinition>;

type EventTable = typeof ANALYTICS_EVENTS;

export type AnalyticsEventName = keyof EventTable;

export const ANALYTICS_EVENT_NAMES = Object.keys(
  ANALYTICS_EVENTS
) as AnalyticsEventName[];

type PropertiesOf<N extends AnalyticsEventName> = {
  -readonly [K in keyof EventTable[N]["properties"]]: EventTable[N]["properties"][K] extends readonly (infer V)[]
    ? V
    : never;
};

/**
 * What application code passes to `track`. A discriminated union derived from
 * {@link ANALYTICS_EVENTS}, so an unknown event name, a missing property, an
 * extra property or a value outside its enum is a type error.
 */
export type AnalyticsEvent = {
  [N in AnalyticsEventName]: { event: N; properties: PropertiesOf<N> };
}[AnalyticsEventName];

export type AnalyticsEventProperties = AnalyticsEvent["properties"];

export function isAnalyticsEventName(
  value: unknown
): value is AnalyticsEventName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, value)
  );
}
