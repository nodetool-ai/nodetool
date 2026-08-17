/**
 * The one open "Write code with AI" request.
 *
 * The dialog applies to an existing node, so every entry point outside the
 * Code node body has to create that node first. What it created is recorded
 * here as a discard plan, and `CodeGenDialogHost` undoes it if the user leaves
 * without applying a submission.
 */
import type { Edge } from "@xyflow/react";
import { create } from "zustand";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

/** Graph changes made only to open the dialog. */
interface CodeGenDiscardPlan {
  /** Nodes created for this request. */
  nodeIds: readonly string[];
  /** Edges created for this request. */
  edgeIds: readonly string[];
  /** Edges removed to make room for the new node, put back on cancel. */
  restoreEdges: readonly Edge[];
}

interface CodeGenDialogRequest {
  /** The Code node an accepted submission is applied to. */
  nodeId: string;
  /** Typed inputs seeded from a source handle. */
  inputs?: readonly codeGen.CodeGenInputPort[];
  /** Set when launched from a destination handle. */
  expectedOutput?: codeGen.CodeGenExpectedOutput;
  discard?: CodeGenDiscardPlan;
}

interface CodeGenDialogState {
  request: CodeGenDialogRequest | null;
  openCodeGenDialog: (request: CodeGenDialogRequest) => void;
  closeCodeGenDialog: () => void;
}

export const useCodeGenDialogStore = create<CodeGenDialogState>((set) => ({
  request: null,
  openCodeGenDialog: (request: CodeGenDialogRequest): void => set({ request }),
  closeCodeGenDialog: (): void => set({ request: null })
}));

export default useCodeGenDialogStore;
