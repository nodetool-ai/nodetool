import type { GameAnimationGraph3D, GameDiagnostic, GameDocument3D } from "@nodetool-ai/protocol";
import { applyGameOps3D, validateGame3D, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";

type GraphOp = Extract<GameDocumentOp3D, { op: "set_animation_graph" | "remove_animation_graph" }>;

function isGraphOp(op: GameDocumentOp3D): op is GraphOp {
  return op.op === "set_animation_graph" || op.op === "remove_animation_graph";
}

function diagnosticKey(diagnostic: Pick<GameDiagnostic, "code" | "path">): string {
  return `${diagnostic.code}|${JSON.stringify(diagnostic.path)}`;
}

/**
 * The first problem the ops would add to the document, or null. Graph ops are judged by
 * the diagnostics they introduce, compared by code and path, so problems the document
 * already has do not block an edit. Other ops must leave the document valid.
 */
export function introducedAnimationGraphProblem(document: GameDocument3D, before: readonly GameDiagnostic[],
  ops: readonly GameDocumentOp3D[]): string | null {
  if (!ops.every(isGraphOp)) {
    try {
      applyGameOps3D(document, [...ops]);
      return null;
    } catch (cause) {
      return cause instanceof Error ? cause.message : String(cause);
    }
  }
  const graphs: Record<string, GameAnimationGraph3D> = { ...document.animationGraphs };
  for (const op of ops) {
    if (op.op === "set_animation_graph") { graphs[op.graph_id] = op.graph as GameAnimationGraph3D; }
    else { delete graphs[op.graph_id]; }
  }
  const { animationGraphs: _previous, ...rest } = document;
  const next: GameDocument3D = Object.keys(graphs).length === 0 ? rest : { ...rest, animationGraphs: graphs };
  const known = new Set(before.map(diagnosticKey));
  const added = validateGame3D(next).diagnostics.find((diagnostic) => !known.has(diagnosticKey(diagnostic)));
  return added ? added.message : null;
}
