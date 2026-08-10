/**
 * `todo_write` — task checklist for an agent run.
 *
 * The agent passes the *entire* todo list on every call (full replacement,
 * not patch). The list is stored per chat-thread and broadcast to the UI via
 * a `todo_update` ProcessingMessage so the chat sidebar can render it as a
 * live checklist.
 *
 * The implementation and the per-thread store live in the `files` capability
 * module (`../capabilities/files.ts`), with the store beside the one function
 * that writes it; the three readers are re-exported here for their existing
 * callers.
 */

import { CapabilityTool } from "../capabilities/index.js";
import { fileCapabilityRun, todoWrite } from "../capabilities/files.js";

export {
  getThreadTodos,
  clearThreadTodos,
  _resetTodoStoreForTests
} from "../capabilities/files.js";

/**
 * @deprecated Ported to the `files` capability module
 * (`../capabilities/files.ts`). Kept as a thin subclass so existing
 * constructors keep working; there is one implementation behind both.
 */
export class TodoWriteTool extends CapabilityTool {
  constructor() {
    super(todoWrite.spec, todoWrite.impl, fileCapabilityRun);
  }
}
