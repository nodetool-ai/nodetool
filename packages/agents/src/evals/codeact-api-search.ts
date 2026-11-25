/**
 * Library search cases (docs/plans/library-search.md, D29): an agent finds a
 * stored item by what it contains, not by its file name, and reads the
 * matched passage instead of extracting the file again.
 *
 * The belt is the headless library in `surfaces/library.ts`. Its file names
 * say nothing about the content, so a case passes only when the agent
 * searches by what the user described.
 */

import { zodToJsonSchema } from "@nodetool-ai/runtime";
import { RecordingTool, type CodeActEvalCase, type CodeActToolRecorder } from "./codeact-cases.js";
import { createLibraryToolBridge } from "./surfaces/library.js";
import { isRecord } from "../utils/type-guards.js";

/** The library world's search tools, recorded for the CodeAct runner. */
function createSearchTools(recorder: CodeActToolRecorder) {
  const bridge = createLibraryToolBridge();
  return bridge.tools
    .filter((tool) => tool.name === "search" || tool.name === "search_read")
    .map(
      (tool) =>
        new RecordingTool(tool.name, tool.description, zodToJsonSchema(tool.parameters), recorder, (params) =>
          tool.execute(params)
        )
    );
}

export const CODEACT_SEARCH_EVAL_CASES: readonly CodeActEvalCase[] = [
  {
    id: "api-search-asset-by-prompt",
    description: "Find a generated image from a description of what it shows",
    objective:
      "Somewhere in my library is a picture I generated of a fox sleeping in the snow. " +
      "Find it and finish with {id: <its full id>, title: <its title>}.",
    outputSchema: {
      type: "object",
      properties: { id: { type: "string" }, title: { type: "string" } },
      required: ["id", "title"]
    },
    createTools: createSearchTools,
    namespaces: ["search"],
    expect: {
      requiredTools: ["search"],
      maxActions: 3,
      resultCheck: (result) => isRecord(result) && result["title"] === "render-0042.png",
      resultCheckLabel: "title=render-0042.png"
    }
  },
  {
    id: "api-search-answer-from-pdf",
    description: "Answer a question from a PDF found by its content, reading the matched page",
    objective:
      "One of my PDFs is a report on the harbor lighthouse. In what year was its lamp replaced? " +
      "Finish with {year: <number>, page: <the page that says so>}.",
    outputSchema: {
      type: "object",
      properties: { year: { type: "number" }, page: { type: "number" } },
      required: ["year", "page"]
    },
    createTools: createSearchTools,
    namespaces: ["search"],
    expect: {
      requiredTools: ["search"],
      maxActions: 4,
      resultCheck: (result) => isRecord(result) && result["year"] === 1987 && result["page"] === 4,
      resultCheckLabel: "year=1987 on page 4"
    }
  }
];
