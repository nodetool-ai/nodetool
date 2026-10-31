/**
 * Headless bridge for the SVG editor tool-loop eval.
 *
 * The browser tools (`web/src/lib/tools/builtin/svg.ts`) delegate to the
 * handler an open `SvgSurface` registers: it holds the Monaco draft and writes
 * it back to the asset on save. This bridge holds the same draft as a string,
 * so a model can drive the `ui_svg_*` surface with no browser.
 *
 * Names, descriptions and argument shapes come from the shared contracts in
 * `@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts`, and so does
 * the exact-once replacement rule. The one difference is the parser: the
 * browser checks markup with `DOMParser`, this bridge with fast-xml-parser.
 * The bridge drives one implicit asset, so no tool takes `asset_id`.
 */

import { XMLParser, XMLValidator } from "fast-xml-parser";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import {
  SVG_TOOL_CONTRACTS,
  replaceExactlyOnce,
  type SvgToolName
} from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase
} from "../tool-loop-eval.js";

export interface SvgBridgeInitialState {
  name?: string;
  markup: string;
}

export interface SvgBridgeFinalState {
  markup: string;
  /** The draft differs from what was last saved. */
  dirty: boolean;
  saves: number;
  issues: string[];
}

/** Parse problems in `markup`. Empty when it is well-formed and rooted at `<svg>`. */
export function svgMarkupIssues(markup: string): string[] {
  const valid = XMLValidator.validate(markup);
  if (valid !== true) {
    return [valid.err.msg];
  }
  const parsed = new XMLParser({ ignoreAttributes: true }).parse(markup) as
    | Record<string, unknown>
    | undefined;
  const root = Object.keys(parsed ?? {}).find(
    (key) => !key.startsWith("?") && !key.startsWith("#")
  );
  if (root !== "svg") {
    return [`The root element is <${root ?? "nothing"}>, not <svg>.`];
  }
  return [];
}

function tool(
  name: SvgToolName,
  impl: (args: Record<string, unknown>) => Promise<unknown>
): HeadlessTool {
  const parameters = uiToolParams(SVG_TOOL_CONTRACTS[name]);
  return {
    name,
    description: SVG_TOOL_CONTRACTS[name].description,
    parameters,
    execute: (args) =>
      impl(
        parseWithTypeCoercion(parameters, args ?? {}) as Record<string, unknown>
      )
  };
}

export function createSvgToolBridge(
  initial: SvgBridgeInitialState
): HeadlessSurfaceBridge<SvgBridgeFinalState> {
  const name = initial.name ?? "drawing.svg";
  let markup = initial.markup;
  let saved = initial.markup;
  let saves = 0;

  const apply = (next: string, verb: string) => {
    const issues = svgMarkupIssues(next);
    if (issues.length > 0) {
      throw new Error(`The ${verb} was not applied: ${issues.join(" ")}`);
    }
    markup = next;
    return {
      ok: true,
      chars: markup.length,
      dirty: markup !== saved,
      url: "asset://svg"
    };
  };

  const tools: HeadlessTool[] = [
    tool("ui_svg_get_state", async () => ({
      ok: true,
      assetId: "svg",
      name,
      markup,
      dirty: markup !== saved,
      issues: svgMarkupIssues(markup)
    })),
    tool("ui_svg_set_markup", async (args) =>
      apply(args.markup as string, "markup")
    ),
    tool("ui_svg_replace", async (args) =>
      apply(
        replaceExactlyOnce(
          markup,
          args.find as string,
          args.replace as string
        ),
        "replacement"
      )
    ),
    tool("ui_svg_save", async () => {
      if (markup !== saved) {
        saved = markup;
        saves += 1;
      }
      return { ok: true, dirty: false, url: "asset://svg" };
    })
  ];

  return {
    tools,
    finalState: () => ({
      markup,
      dirty: markup !== saved,
      saves,
      issues: svgMarkupIssues(markup)
    })
  };
}

const SVG_SYSTEM_PROMPT = `You are an assistant editing an SVG asset the user has open, through UI tools.

- Call ui_svg_get_state first to read the markup.
- Change it with ui_svg_replace for a local edit, or ui_svg_set_markup to rewrite the document. Both reject markup that does not parse.
- Edits stay in the editor's draft. Call ui_svg_save only when the user asks to keep or save the result.

Call one tool at a time and use the result before the next call. When the objective is satisfied, stop calling tools and give a one-line summary.`;

const BADGE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle id="dot" cx="50" cy="50" r="30" fill="#1e64ff"/>
  <text id="label" x="50" y="95" text-anchor="middle" font-size="10">Draft</text>
</svg>`;

/** Every `fill` attribute value, lowercased. */
const fills = (markup: string): string[] =>
  [...markup.matchAll(/fill\s*=\s*"([^"]*)"/gi)].map((m) => m[1].toLowerCase());

const RED = /^(red|#f00|#ff0000|#e[0-9a-f]{5}|#d[0-9a-f]{5}|rgb\(\s*2[0-9]{2}\s*,\s*[0-5]?[0-9]\s*,\s*[0-5]?[0-9]\s*\))$/;

const parses = {
  name: "parses",
  detail: "the final markup does not parse as an SVG document",
  test: (s: SvgBridgeFinalState) => s.issues.length === 0
};

export const SVG_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<SvgBridgeFinalState>[] =
  [
    {
      id: "recolor-and-save",
      description: "Make the blue circle red and save the asset",
      objective:
        "The SVG has a blue circle. Make the circle red, then save the SVG.",
      createBridge: () => createSvgToolBridge({ name: "badge.svg", markup: BADGE }),
      systemPrompt: SVG_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_svg_get_state", "ui_svg_save"],
        noErrorResults: true,
        minToolCalls: 3,
        maxToolCalls: 8,
        finalState: [
          parses,
          {
            name: "circleIsRed",
            detail: "no red fill in the markup",
            test: (s) => fills(s.markup).some((fill) => RED.test(fill))
          },
          {
            name: "blueGone",
            detail: "the blue fill is still there",
            test: (s) => !fills(s.markup).includes("#1e64ff")
          },
          {
            name: "saved",
            detail: "the edit was not saved",
            test: (s) => s.saves === 1 && !s.dirty
          }
        ]
      }
    },
    {
      id: "add-background",
      description: "Add a full-size background rectangle behind the circle",
      objective:
        "Add a light grey rectangle that covers the whole 100x100 canvas behind the circle. Keep the circle and the label. Do not save.",
      createBridge: () => createSvgToolBridge({ name: "badge.svg", markup: BADGE }),
      systemPrompt: SVG_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_svg_get_state"],
        forbiddenTools: ["ui_svg_save"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 8,
        finalState: [
          parses,
          {
            name: "rectBeforeCircle",
            detail: "no <rect> drawn before the circle",
            test: (s) => {
              const rect = s.markup.search(/<rect\b/);
              const circle = s.markup.search(/<circle\b/);
              return rect >= 0 && circle > rect;
            }
          },
          {
            name: "rectCoversCanvas",
            detail: "the rectangle does not span the 100x100 canvas",
            test: (s) => {
              const rect = /<rect\b[^>]*>/.exec(s.markup)?.[0] ?? "";
              const size = (attr: string) =>
                new RegExp(`\\b${attr}\\s*=\\s*"(100%?|100(\\.0+)?)"`).test(rect);
              return size("width") && size("height");
            }
          },
          {
            name: "keptLabel",
            detail: "the label was removed",
            test: (s) => s.markup.includes("Draft")
          },
          {
            name: "unsaved",
            detail: "the draft was saved without being asked",
            test: (s) => s.saves === 0 && s.dirty
          }
        ]
      }
    },
    {
      id: "remove-label",
      description: "Delete the text label and leave the draft unsaved",
      objective:
        "Remove the text label from the SVG. I want to look at it before keeping it.",
      createBridge: () => createSvgToolBridge({ name: "badge.svg", markup: BADGE }),
      systemPrompt: SVG_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_svg_get_state"],
        forbiddenTools: ["ui_svg_save"],
        noErrorResults: true,
        minToolCalls: 2,
        maxToolCalls: 6,
        finalState: [
          parses,
          {
            name: "labelGone",
            detail: "the <text> element is still there",
            test: (s) => !/<text\b/.test(s.markup)
          },
          {
            name: "circleKept",
            detail: "the circle was removed too",
            test: (s) => /<circle\b/.test(s.markup)
          },
          {
            name: "unsaved",
            detail: "the draft was saved although the user wanted to look first",
            test: (s) => s.saves === 0 && s.dirty
          }
        ]
      }
    }
  ];
