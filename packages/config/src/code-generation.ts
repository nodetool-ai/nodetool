/**
 * Rollout gate for Code node AI authoring.
 *
 * Generation runs on the server against a tool-capable model, so whether it is
 * worth offering is a property of the deployment, not of the user's taste. The
 * flag is off until the feature clears its eval and E2E gates; set
 * `NODETOOL_CODE_GENERATION=1` to turn it on for a deployment.
 */

/** Whether the server offers AI authoring for `nodetool.code.Code`. */
export function isCodeGenerationEnabled(): boolean {
  const flag = process.env["NODETOOL_CODE_GENERATION"]?.trim();
  return flag === "1" || flag === "true";
}
