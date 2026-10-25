import { z } from "zod";
import {
  SVG_TOOL_CONTRACTS,
  replaceExactlyOnce,
  type SvgToolName
} from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import {
  uiToolParams,
  type UiToolArgs
} from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import { FrontendToolRegistry } from "../frontendTools";
import { getSvgAgentHandler } from "../../../components/workspace/svgAgentBridge";
import { docUrl } from "./resourceLinks";

/**
 * Frontend tools that let the agent edit the markup of an SVG asset open in
 * the workspace. Every tool takes an explicit `asset_id` and delegates to the
 * handler that SVG's open surface registers on the {@link svgAgentBridge}.
 * Names, descriptions and argument shapes come from the shared contracts the
 * headless eval bridge also registers.
 *
 * Edits change the editor's draft, which the user can undo. Only
 * `ui_svg_save` overwrites the asset.
 */

const assetIdParam = z
  .string()
  .describe(
    "Asset id of the SVG to act on. The open SVG ids are listed in the ui_context system prompt block."
  );

type SvgToolArgs<K extends SvgToolName> = UiToolArgs<
  (typeof SVG_TOOL_CONTRACTS)[K]
> & { asset_id: string };

/** One shared tool's name, description and parameters, plus `asset_id`. */
const shared = <K extends SvgToolName>(name: K) => ({
  name,
  description: SVG_TOOL_CONTRACTS[name].description,
  // `uiToolParams` answers `z.ZodType`; the contract's shape fixes the args.
  parameters: uiToolParams(SVG_TOOL_CONTRACTS[name], {
    asset_id: assetIdParam
  }) as unknown as z.ZodType<SvgToolArgs<K>>
});

/**
 * Parse problems in `markup`, as the browser's XML parser reports them. An
 * empty list means the markup parses and its root is `<svg>`.
 */
export const svgMarkupIssues = (markup: string): string[] => {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    return [parseError.textContent?.trim() || "The markup is not valid XML."];
  }
  const root = doc.documentElement;
  if (root.localName !== "svg") {
    return [`The root element is <${root.localName}>, not <svg>.`];
  }
  return [];
};

const applyMarkup = (assetId: string, markup: string, verb: string) => {
  const handler = getSvgAgentHandler(assetId);
  const issues = svgMarkupIssues(markup);
  if (issues.length > 0) {
    throw new Error(`The ${verb} was not applied: ${issues.join(" ")}`);
  }
  const snapshot = handler.setMarkup(markup);
  return {
    ok: true,
    chars: snapshot.markup.length,
    dirty: snapshot.dirty,
    url: docUrl("asset", assetId)
  };
};

FrontendToolRegistry.register({
  ...shared("ui_svg_get_state"),
  async execute({ asset_id }) {
    const snapshot = getSvgAgentHandler(asset_id).getSnapshot();
    return { ok: true, ...snapshot, issues: svgMarkupIssues(snapshot.markup) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_svg_set_markup"),
  async execute({ asset_id, markup }) {
    return applyMarkup(asset_id, markup, "markup");
  }
});

FrontendToolRegistry.register({
  ...shared("ui_svg_replace"),
  async execute({ asset_id, find, replace }) {
    const { markup } = getSvgAgentHandler(asset_id).getSnapshot();
    return applyMarkup(
      asset_id,
      replaceExactlyOnce(markup, find, replace),
      "replacement"
    );
  }
});

FrontendToolRegistry.register({
  ...shared("ui_svg_save"),
  async execute({ asset_id }) {
    const snapshot = await getSvgAgentHandler(asset_id).save();
    return { ok: true, dirty: snapshot.dirty, url: docUrl("asset", asset_id) };
  }
});
