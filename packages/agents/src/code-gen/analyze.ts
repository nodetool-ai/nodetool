/**
 * Static analysis of generated Code node bodies, phrased for the model.
 *
 * A Code node's `code` is the body of one async function: dynamic inputs are
 * globals, and the returned object's keys are the node's outputs. A handle that
 * exists on the node but is missing from a return path emits `undefined` at
 * runtime, which downstream nodes see as a silent hole — so the generator has
 * to be told before the submission is accepted.
 *
 * The AST work lives in `@nodetool-ai/node-sdk` (`code-analysis.ts`), where the
 * graph validator reads it too; what is here is the wording a model can act on.
 */
import {
  analyzeCodeBody,
  collectBoundNames,
  moduleDeclarationKinds,
  parseCodeBody,
  returnShapes
} from "@nodetool-ai/node-sdk";

export { collectBoundNames };

/** Where to point the model when it wants to emit outputs conditionally. */
const BRANCHING_HINT =
  "Conditional emission is workflow branching, not code: emit every output " +
  "on every path and branch with nodetool.control.If or nodetool.control.Switch.";

export interface CodeAnalysis {
  ok: boolean;
  /** Human-readable failures, phrased as instructions the model can act on. */
  errors: string[];
}

function formatNames(names: readonly string[]): string {
  return names.map((name) => `"${name}"`).join(", ");
}

/**
 * Check that generated code parses and that every declared output is present on
 * every return path the parser can see. Returns errors as text so the caller can
 * hand them straight back to the model as a tool result.
 */
export function analyzeGeneratedCode(
  code: string,
  declaredOutputs: readonly string[]
): CodeAnalysis {
  const parsed = parseCodeBody(code);
  if ("error" in parsed) {
    return { ok: false, errors: [`Syntax error: ${parsed.error}`] };
  }

  const moduleKinds = moduleDeclarationKinds(parsed.statements);
  if (moduleKinds.length > 0) {
    return {
      ok: false,
      errors: [
        `The code uses \`${moduleKinds.join("` and `")}\` at the top level. The body runs ` +
          "inside an async function, which cannot contain module declarations, and the " +
          "sandbox has no module loader — `import` and `require` do not exist there. " +
          "Use only the sandbox API and the code's own helpers."
      ]
    };
  }

  const declared = [...new Set(declaredOutputs)];
  const { returns, fallsThrough } = analyzeCodeBody(parsed.statements);
  const errors: string[] = [];

  if (returns.length === 0) {
    return {
      ok: false,
      errors: [
        `The code never returns. End it with \`return { ${declared.join(", ")} };\`.`
      ]
    };
  }

  if (fallsThrough) {
    errors.push(
      `Execution can reach the end of the code without returning, so the outputs ${formatNames(declared)} would be empty on that path. ${BRANCHING_HINT}`
    );
  }

  for (const statement of returns) {
    for (const shape of returnShapes(statement.argument)) {
      if (shape.notAnObject) {
        errors.push(
          `A return path returns something that is not an object of outputs. Every return must be an object carrying ${formatNames(declared)}.`
        );
        continue;
      }
      if (shape.opaque) continue;

      const missing = declared.filter((name) => !shape.keys.has(name));
      if (missing.length > 0) {
        errors.push(
          `A return path omits the declared output${missing.length > 1 ? "s" : ""} ${formatNames(missing)}. ${BRANCHING_HINT}`
        );
      }
      const undeclared = [...shape.keys].filter(
        (name) => !declared.includes(name)
      );
      if (undeclared.length > 0) {
        errors.push(
          `A return path emits ${formatNames(undeclared)}, which ${undeclared.length > 1 ? "are" : "is"} not declared as an output. Declare the key or drop it from the returned object.`
        );
      }
    }
  }

  // Identical branches produce identical complaints; one line each is enough.
  const unique = [...new Set(errors)];
  return { ok: unique.length === 0, errors: unique };
}
