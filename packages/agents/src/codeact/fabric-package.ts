/**
 * Fabric.js as the SVG / vector surface for a CodeAct session.
 *
 * `createCanvas` is always on the guest and is raster-only. Fabric is the
 * matching SVG path, but it is a host pack, so it reaches an action only
 * through the session allowlist. This module adds it when the catalog
 * actually serves the pack — never when it is missing, so no prompt
 * advertises an import that fails.
 *
 * Chat, MCP, and step sessions share this wiring. Installing the pack is
 * enough; there is no extra consent flag. Fabric is a platform drawing
 * surface, the same way `createCanvas` is.
 */

import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

/** The pack's root specifier. */
export const FABRIC_PACKAGE = "@nodetool-ai/sandbox-fabric";

/** Whether a catalog serves the Fabric pack — i.e. whether it is installed. */
export function catalogServesFabric(
  catalog: SandboxModuleCatalog | null | undefined
): boolean {
  return (catalog?.summaries() ?? []).some(
    (summary) => summary.specifier === FABRIC_PACKAGE
  );
}

/**
 * The session allowlist with Fabric added when this machine installed it.
 * Leaves the list unchanged when the pack is absent or already allowed.
 */
export function withFabricPackage(
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined
): string[] {
  if (allowed.includes(FABRIC_PACKAGE)) {
    return [...allowed];
  }
  if (!catalogServesFabric(catalog)) {
    return [...allowed];
  }
  return [...allowed, FABRIC_PACKAGE];
}

/**
 * The prompt section for SVG and vector work. Render only when the pack is
 * on the allowlist — {@link withFabricPackage} decides that.
 */
export const FABRIC_PROMPT_SECTION = `# SVG and vector graphics

Build, parse, and rasterize SVG with \`${FABRIC_PACKAGE}\`. \`createCanvas\`
is raster only — do not hand-write SVG markup when this pack can build it.

\`\`\`js
import { renderSVG, loadSVG, render } from "${FABRIC_PACKAGE}";

const svg = await renderSVG({
  width: 400,
  height: 200,
  backgroundColor: "#ffffff",
  objects: [
    { type: "rect", left: 20, top: 20, width: 160, height: 80, fill: "#2563eb" },
    { type: "textbox", left: 40, top: 40, text: "Hello", fontSize: 24, fill: "#fff" }
  ]
});
const parsed = await loadSVG(svg);
const png = await render({ width: 400, height: 200, objects: parsed.objects });
\`\`\`

- \`renderSVG(scene)\` returns an SVG string.
- \`loadSVG(markup)\` returns Fabric objects from an SVG string.
- \`render(scene)\` / \`toDataURL(scene)\` rasterize to PNG or JPEG bytes.
- Call \`nodetool.packs.docs("${FABRIC_PACKAGE}")\` for the full object types.`;
