/**
 * Reading an application and writing it back must typecheck.
 *
 * `get` → edit → `update` is how every client edits a document, and duplicate
 * is `get` → `create`. An asymmetry between the router's inferred output and
 * input types breaks both, and it is invisible at runtime — only the compiler
 * catches it. These are type-level assertions; `tsc` is the real assertion and
 * the runtime body only exists so the file is also a suite.
 */
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@nodetool-ai/websocket/trpc";

const isFunction = (
  value: unknown
): value is (...args: never[]) => unknown => typeof value === "function";

type Out = inferRouterOutputs<AppRouter>["applications"];
type In = inferRouterInputs<AppRouter>["applications"];

/** Duplicate: hand a document straight from a read into a create. */
const duplicate = (app: Out["get"]): In["create"] => ({
  name: `${app.name} copy`,
  document: app.document
});

/** Edit: hand a document straight from a read into an update. */
const edit = (app: Out["get"]): In["update"] => ({
  id: app.id,
  baseUpdatedAt: app.updatedAt,
  document: app.document
});

/** A published version's document must be restorable into the draft. */
const restore = (version: Out["released"]): In["update"] | null =>
  version ? { id: version.applicationId, document: version.document } : null;

describe("application document round-trip", () => {
  it("exposes read/write helpers whose types line up", () => {
    // The compile step above is the assertion; this keeps the file a suite and
    // pins the helpers so they are not tree-shaken out of the typecheck.
    expect([duplicate, edit, restore].every((f) => isFunction(f))).toBe(
      true
    );
  });
});
