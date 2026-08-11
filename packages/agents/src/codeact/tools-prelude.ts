/**
 * The `tools.<name>()` wrapper prelude — a leaf module with no imports, so a
 * browser bundle can carry it without dragging in the toolbelt or any host
 * bridge machinery. `CODEACT_PRELUDE` (codeact executors) layers `finish()`
 * on top; `nodetool.code.Code` prepends this plus the `nodetool` object-model
 * prelude directly.
 *
 * Guest contract: the host installs `__toolNames` (string[]) and `__callTool`
 * (a never-rejecting bridge resolving `{ok, result|error}` envelopes) as
 * sandbox globals. With `__toolNames = []` the loop defines nothing and the
 * `nodetool` prelude degrades to an empty `capabilities()` with every method
 * throwing the name of its missing tool.
 */
export const TOOLS_PRELUDE = `
const tools = {};
for (const __toolName of __toolNames) {
  tools[__toolName] = async (args) => {
    const __r = await __callTool(
      __toolName,
      JSON.stringify(args === undefined ? {} : args)
    );
    if (!__r || __r.ok !== true) {
      throw new Error(__r && __r.error ? __r.error : "tool call failed: " + __toolName);
    }
    return __r.result;
  };
}
`;
