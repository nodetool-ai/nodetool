/**
 * One per-merge-unit edit a document write was made with.
 *
 * The headless `ui_*` bridges record the ops they replay and attach them to the
 * document mutation (`meta.ops`); the model observer broadcasts them on the
 * `resource_change` message so a dirty editor can merge the external change
 * per merge unit instead of treating the whole document as replaced.
 */
export interface DocumentOp {
  /** The `ui_*` tool name the edit was made with, e.g. `update_shot`. */
  tool: string;
  /** The input the tool was called with. */
  input: unknown;
}
