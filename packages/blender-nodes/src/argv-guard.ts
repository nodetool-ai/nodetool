/**
 * Flag-injection guard for Blender string props.
 *
 * Copy of `refuseFlagLikeValue` from
 * `packages/agents/src/host-binary-guard.ts` (the original; this package
 * must not depend on `@nodetool-ai/agents`). Blender argv is built by the
 * node from typed props, and every top-level string param that reaches the
 * job passes through this, so a value starting with `-` cannot become a
 * Blender flag. Nested values (the `passes` list) are filtered against
 * known constants by the node instead. `packages/blender-nodes/tests/job.test.ts`
 * pins both implementations to the same behavior.
 */

export interface ArgvRefusal {
  error: string;
}

/**
 * Refuse a value that would arrive as another flag rather than as the value
 * of the option it follows. `label` names the field in the refusal.
 */
export function refuseFlagLikeValue(
  value: string,
  label: string
): ArgvRefusal | undefined {
  if (!value.startsWith("-")) return undefined;
  return {
    error: `${label} cannot start with "-": it would be read as an option, not a value.`
  };
}
