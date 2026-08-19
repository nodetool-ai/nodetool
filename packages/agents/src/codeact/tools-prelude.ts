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
 *
 * A name the belt does not carry is a thrower rather than `undefined`. Reading
 * an absent property left `tools.run_apify_actor(…)` failing as QuickJS's
 * `TypeError: not a function` — a message naming neither the tool nor the
 * belt, and the same message a genuine syntax mistake produces. The thrower
 * says which name is missing and points at the belt's own search. It is a
 * `get` trap only, so `__toolNames` stays the authority on what exists:
 * `Object.keys(tools)` is still the belt, and the `nodetool` prelude reads
 * that list rather than probing a property.
 */
export const TOOLS_PRELUDE = `
const __toolFns = {};
for (const __toolName of __toolNames) {
  __toolFns[__toolName] = async (args) => {
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
const tools = new Proxy(__toolFns, {
  get(target, prop) {
    // "then" is excluded so awaiting or resolving this object cannot mistake
    // it for a thenable and call the thrower.
    if (typeof prop !== "string" || prop === "then" || prop in target) {
      return target[prop];
    }
    return () => {
      throw new Error(
        'tools.' + prop + ' is not on this toolbelt. ' +
        'nodetool.searchTools("' + prop + '") lists what is.'
      );
    };
  }
});
`;
