/**
 * Widget-facing types for the app builder's reactive layer.
 *
 * The action vocabulary, the stored event shape, and pacing all live in
 * `@nodetool-ai/app-runtime` so the web editor, the CLI harness, and the eval
 * suites agree on them. This module re-exports what the Puck widgets use.
 */
export type {
  AppAction,
  ActionKind,
  AppEvent,
  EventTrigger,
  EventPace
} from "@nodetool-ai/app-runtime";
export { eventToAction } from "@nodetool-ai/app-runtime";
