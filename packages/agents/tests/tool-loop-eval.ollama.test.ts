/**
 * Live tool-loop eval against a local Ollama model.
 *
 * This is the real end-to-end check the harness is built for: a local model
 * drives the ui_* tool loop headlessly and builds a graph. It runs only when an
 * Ollama daemon is reachable (default http://localhost:11434, override with
 * OLLAMA_API_URL); otherwise it skips so the suite stays green everywhere.
 *
 *   OLLAMA_API_URL=http://localhost:11434 \
 *   TOOL_LOOP_OLLAMA_MODEL=qwen2.5:7b \
 *   npx vitest run tests/tool-loop-eval.ollama.test.ts
 *
 * Equivalent CLI run:
 *   nodetool eval tool-loop --provider ollama --model qwen2.5:7b --min-success 1
 */
import { describe, it, expect } from "vitest";
import { OllamaProvider } from "@nodetool-ai/runtime";
import { runToolLoopEval, TOOL_LOOP_EVAL_CASES } from "../src/index.js";

const OLLAMA_URL = process.env.OLLAMA_API_URL || "http://localhost:11434";
const MODEL = process.env.TOOL_LOOP_OLLAMA_MODEL || "qwen2.5:7b";

async function ollamaReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(1500)
    });
    return res.ok;
  } catch {
    return false;
  }
}

describe("runToolLoopEval against local Ollama", () => {
  it(
    "drives the ui_* tool loop and builds a connected graph",
    async (ctx) => {
      if (!(await ollamaReachable())) {
        ctx.skip();
        return;
      }

      const provider = new OllamaProvider({ OLLAMA_API_URL: OLLAMA_URL });
      const report = await runToolLoopEval({
        provider,
        model: MODEL,
        cases: TOOL_LOOP_EVAL_CASES.filter((c) => c.id === "summarize"),
        maxIterations: 16
      });

      const result = report.cases[0];
      // The loop must have run to completion and made real progress.
      expect(result.accepted).toBe(true);
      expect(result.totalToolCalls).toBeGreaterThan(0);
      // A capable local model should satisfy most structural checks.
      expect(result.score).toBeGreaterThan(0.5);
    },
    120_000
  );
});
