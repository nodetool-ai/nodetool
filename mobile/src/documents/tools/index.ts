/**
 * The one list of client-side tool modules. Importing this registers all of
 * them with the `MobileToolRegistry` as a side effect — the same
 * registration-by-import shape web's `builtin/index.ts` uses, and for the same
 * reason: one list means the manifest can't drift by entry point.
 *
 * Registration is not availability. Every tool takes a required document id and
 * resolves it against the documents actually open, so registering a tool the
 * user can't currently use is harmless — it fails naming the open ids.
 */

import './jsScriptTools';
import './scriptTools';
import './storyboardTools';
import './timelineTools';

export { MobileToolRegistry } from './registry';
export type {
  MobileToolDefinition,
  ToolManifestEntry,
  ToolParameterSchema,
} from './registry';
export { executeToolCall, isToolCallMessage } from './executeToolCall';
