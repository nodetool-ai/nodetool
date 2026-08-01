/**
 * Rollout gate for Code node AI authoring.
 *
 * Generation runs on the server against a tool-capable model, so whether it is
 * worth offering is a property of the deployment, not of the user's taste. The
 * feature is on by default; a deployment that does not want its users spending
 * provider credits this way sets `NODETOOL_CODE_GENERATION=0`.
 */

/** Values that turn the feature off. Everything else leaves it on. */
const OFF = new Set(["0", "false", "off", "no"]);

/** Whether the server offers AI authoring for `nodetool.code.Code`. */
export function isCodeGenerationEnabled(): boolean {
  const flag = process.env["NODETOOL_CODE_GENERATION"]?.trim().toLowerCase();
  return flag === undefined || flag === "" || !OFF.has(flag);
}
