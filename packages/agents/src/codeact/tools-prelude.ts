/**
 * The belt prelude — a leaf module with no imports, so a browser bundle can
 * carry it without dragging in the toolbelt or any host bridge machinery.
 * `CODEACT_PRELUDE` (codeact executors) layers `finish()` on top;
 * `nodetool.code.Code` prepends this plus the `nodetool` object-model prelude
 * directly.
 *
 * **There is no `tools.<name>()` any more.** Every capability is reached the
 * way a library is: `import { web_search } from
 * "@nodetool-ai/sandbox-nodetool/web"`. One surface — the import — instead of
 * a flat global whose contents varied per host, so the same call reads the
 * same in a Code node, a JS script and a chat action, and static analysis can
 * see what a body actually uses before it runs.
 *
 * What survives is the host bridge underneath: `__callBeltTool(name)` returns
 * a caller over `__callTool`, and the `nodetool` object model — the curated
 * half, which stays a global — is its only consumer.
 *
 * Guest contract: the host installs `__toolNames` (string[]), `__toolModules`
 * (name → capability namespace, for names a module owns) and `__callTool` (a
 * never-rejecting bridge resolving `{ok, result|error}` envelopes) as sandbox
 * globals. With `__toolNames = []` the `nodetool` prelude degrades to an empty
 * `capabilities()` with every method throwing the name of its missing tool.
 *
 * `tools` itself is kept as a thrower, not deleted. A body written against the
 * old belt would otherwise fail with `ReferenceError: tools is not defined` —
 * true but useless. Every property access instead throws the exact import line
 * that replaces it, read off `__toolModules`, and a name no module owns is
 * pointed at `nodetool.searchTools`.
 */
export const TOOLS_PRELUDE = `
const __callBeltTool = (name) => async (args) => {
  const __r = await __callTool(
    name,
    JSON.stringify(args === undefined ? {} : args)
  );
  if (!__r || __r.ok !== true) {
    throw new Error(__r && __r.error ? __r.error : "tool call failed: " + name);
  }
  return __r.result;
};
const tools = new Proxy({}, {
  get(target, prop) {
    // "then" is excluded so awaiting or resolving this object cannot mistake
    // it for a thenable and call the thrower.
    if (typeof prop !== "string" || prop === "then") return undefined;
    return () => {
      const __module =
        typeof __toolModules === "object" && __toolModules !== null
          ? __toolModules[prop]
          : undefined;
      throw new Error(
        __module
          ? 'tools.' + prop + ' is gone. Import it instead: ' +
            'import { ' + prop + ' } from ' +
            '"@nodetool-ai/sandbox-nodetool/' + __module + '";'
          : 'tools.' + prop + ' is gone — every capability is an import now. ' +
            'nodetool.searchTools("' + prop + '") reports the module to ' +
            'import it from.'
      );
    };
  }
});
`;
