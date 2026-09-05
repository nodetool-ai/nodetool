/**
 * The `execute_code` tool contract, and the one question auto mode asks about
 * a code action before running it.
 *
 * Auto mode used to mean "everything runs, no prompts": `decidePermission`
 * answers `allow` for every category, so a code action could delete a
 * workflow, publish one, or spend on media without the user seeing anything.
 * That is not what a user grants by picking Auto — they grant *not being
 * interrupted for routine work*, not a blank cheque.
 *
 * So the call carries one more option: `risk`. The model declares whether the
 * program it is about to run is `low` risk (reads, local compute, work the
 * user already asked for and can undo) or `high` (deletes, publishes,
 * third-party side effects, real spend). In auto mode a `low` action runs
 * unattended and a `high` one asks once — for the whole action, not per
 * bridged call, because the action is the unit the user is being asked about.
 * Plan and default modes are untouched: their per-call ladder in
 * `capabilities/invoke.ts` already blocks or asks.
 *
 * It fails closed. A call with no `risk`, or one carrying a value that is not
 * in the enum, is read as `high`.
 *
 * The call also carries a `description`: what the program will do, in plain
 * sentences. That is what the approval dialog asks about. The code stays
 * available behind a fold, but a user answering "do you want to do this?"
 * should not have to read JavaScript to know what they are agreeing to.
 */

import {
  parseCodeBody,
  staticImportBindings,
  type CodeBodyStatement
} from "@nodetool-ai/node-sdk";
import {
  sandboxCapabilityModuleName,
  SANDBOX_CAPABILITY_PACK
} from "@nodetool-ai/protocol";

import type { CapabilityGate } from "../capabilities/types.js";
import { TOOL_PERMISSION_CATEGORIES } from "../tools/tool-permissions.js";
import { isString } from "../utils/type-guards.js";

export const EXECUTE_CODE_TOOL_NAME = "execute_code";

/** How much a code action claims it can cost the user if it goes wrong. */
export type ActionRisk = "low" | "high";

export const ACTION_RISK_VALUES = ["low", "high"] as const;

/**
 * Input schema for the one provider tool codeact mode exposes. `title` is the
 * user-facing label the UI shows for the action card while the code runs —
 * the code itself is a detail view, so without a title the user sees only
 * "Execute Code". `risk` is what auto mode reads (see the module comment).
 * `description` is what the approval box reads: a high-risk action asks the
 * user, and a wall of unfolded JavaScript is not a question anyone can answer,
 * so the model states in plain sentences what the program will do.
 * Required: a strict schema (additionalProperties: false) must list every
 * property under `required` for OpenAI structured outputs.
 */
export const EXECUTE_CODE_INPUT_SCHEMA = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description:
        "3-8 word user-facing summary of what this action does, shown in " +
        'the UI while it runs (e.g. "Rendering product images from CSV").'
    },
    risk: {
      type: "string",
      enum: ACTION_RISK_VALUES,
      description:
        '"low" when the program only reads, computes, or does work the user ' +
        'asked for and can undo; "high" when it deletes or overwrites ' +
        "something, publishes or sends anything outside this account, or " +
        "spends real money. In auto mode a low-risk action runs unattended " +
        "and a high-risk one asks the user once. Say high when unsure."
    },
    description: {
      type: "string",
      description:
        "Plain-language account of what this action will do, shown in the " +
        "approval dialog when it asks the user. One to three sentences, no " +
        "code: name what it changes, deletes, sends, or spends, and on what " +
        '(e.g. "Deletes the 3 archived workflows listed above. They cannot ' +
        'be restored."). Required when risk is "high" — that is the only ' +
        'text the user decides on. Write "" for a low-risk action.'
    },
    code: {
      type: "string",
      description: "The JavaScript program to run."
    }
  },
  required: ["title", "risk", "description", "code"],
  additionalProperties: false
} as const;

/** The display label for a code action: its title, else a generic fallback. */
export function executeCodeMessage(args: Record<string, unknown>): string {
  const title = isString(args?.["title"]) ? args["title"].trim() : "";
  return title || "Executing code action";
}

/**
 * The plain-language account of a code action, for the approval dialog. Empty
 * when the model wrote none — the dialog then falls back to the title.
 */
export function executeCodeDescription(
  args: Record<string, unknown> | null | undefined
): string {
  const raw = args?.["description"];
  return isString(raw) ? raw.trim() : "";
}

/** The risk a call declared, reading anything unrecognized as `high`. */
export function declaredActionRisk(
  args: Record<string, unknown> | null | undefined
): ActionRisk {
  return args?.["risk"] === "low" ? "low" : "high";
}

/**
 * The risk floor the program's own imports set, read off the code rather than
 * off what the model declared about it.
 *
 * `risk: "low"` used to be admitted unread, so a program that imported
 * `run_workflow` and called itself low ran unattended in auto mode. Every
 * capability import is a static binding the mount already parses, and each
 * imported name has a permission category: a name in the `execute` or
 * `external` class — the calls that spend money or leave this account, which
 * the `risk` option itself defines as high — makes the action high risk
 * whatever the call declared. A default or namespace import of a capability
 * module reaches everything the module exports, so it takes the module's
 * highest category. The `write` class stays at the declared risk: a file the
 * user asked for is the option's own example of low, and only the model can
 * tell that write from a delete, so the declaration carries it.
 *
 * Only names the permission table knows raise the floor. A session tool
 * (`.../session`, a client `ui_*` schema) has no entry — the lookup
 * answers its fail-closed `external` for any unknown string — and it is gated
 * per call inside the action, so its import keeps the declared risk. The
 * object model (`nodetool.*`) reaches tools without an import and is not
 * read here; the per-call ladder is what governs it.
 */
/** The permission classes whose import alone makes an action high risk. */
const FLOOR_CATEGORIES: ReadonlySet<string> = new Set(["execute", "external"]);

export async function importedActionRisk(code: string): Promise<ActionRisk> {
  const parsed = parseCodeBody(code);
  if ("error" in parsed) return "low";
  return (await actionable(parsed.statements)) ? "high" : "low";
}

/**
 * Whether a capability module carries anything past read class. The registry
 * is reached lazily: importing it here statically would make this contract
 * module load every capability spec, and a host that mocks the registry (the
 * CLI's permission-gate suite) only ever needs the tool name and the
 * declared-risk path.
 */
async function moduleIsActionable(module: string): Promise<boolean> {
  const { capabilityModuleSpecTable } = await import(
    "../capabilities/registry.js"
  );
  return capabilityModuleSpecTable(module).some((spec) =>
    FLOOR_CATEGORIES.has(spec.category)
  );
}

async function actionable(
  statements: readonly CodeBodyStatement[]
): Promise<boolean> {
  const bindings = staticImportBindings(statements).filter((binding) =>
    binding.specifier.startsWith(SANDBOX_CAPABILITY_PACK)
  );
  if (bindings.length > 0) {
    // Same lazy reach as `moduleIsActionable`, and for the same reason.
    const { capabilitySpec } = await import("../capabilities/registry.js");
    for (const binding of bindings) {
      for (const name of binding.named) {
        // A spec names its own class; the map covers the few Tool classes
        // without one; an unknown name (a session `ui_*` tool) stays at the
        // declared risk.
        const category =
          capabilitySpec(name)?.category ??
          TOOL_PERMISSION_CATEGORIES[name] ??
          "";
        if (FLOOR_CATEGORIES.has(category)) {
          return true;
        }
      }
    }
  }
  for (const statement of statements) {
    if (statement.type !== "ImportDeclaration") continue;
    if (!isString(statement.source.value)) continue;
    if (!statement.source.value.startsWith(SANDBOX_CAPABILITY_PACK)) continue;
    const whole = statement.specifiers.some(
      (specifier) => specifier.type !== "ImportSpecifier"
    );
    if (!whole) continue;
    const module = sandboxCapabilityModuleName(statement.source.value);
    if (module === undefined) continue;
    if (await moduleIsActionable(module)) {
      return true;
    }
  }
  return false;
}

/** The risk an action runs at: the declared value, raised by its imports. */
export async function effectiveActionRisk(
  args: Record<string, unknown> | null | undefined
): Promise<ActionRisk> {
  if (declaredActionRisk(args) === "high") return "high";
  const code = args?.["code"];
  return isString(code) ? importedActionRisk(code) : "high";
}

/** Refusal carries the observation text the model sees instead of a result. */
export type ActionAdmission =
  | { allowed: true }
  | { allowed: false; error: string };

const ALLOWED: ActionAdmission = { allowed: true };

/**
 * Whether this code action may run, before a line of it executes.
 *
 * Only auto mode asks: without a gate (a headless step loop) or in plan /
 * default mode the per-call ladder inside the action is the gate, unchanged.
 * "Allow for this chat" is keyed on `execute_code` itself, so granting it once
 * makes every later high-risk action in the thread run unattended — which is
 * the user saying "stop asking", the same meaning it has for any other tool.
 */
export async function admitCodeAction(
  gate: CapabilityGate | undefined,
  args: Record<string, unknown>
): Promise<ActionAdmission> {
  if (!gate || gate.mode !== "auto") return ALLOWED;
  const risk = await effectiveActionRisk(args);
  if (risk === "low") return ALLOWED;
  if (gate.sessionAllow.has(EXECUTE_CODE_TOOL_NAME)) return ALLOWED;

  const answer = await gate.requestApproval({
    toolName: EXECUTE_CODE_TOOL_NAME,
    category: "execute",
    args: {
      title: isString(args["title"]) ? args["title"] : "",
      risk,
      code: isString(args["code"]) ? args["code"] : ""
    },
    message: executeCodeMessage(args),
    description: executeCodeDescription(args)
  });

  if (answer === "deny") {
    return {
      allowed: false,
      error:
        "The user declined to run this code action. Do not re-submit the " +
        "same program; explain what it would have done, or propose a " +
        "narrower action that avoids the destructive or costly part."
    };
  }
  if (answer === "allow_for_chat") {
    gate.sessionAllow.add(EXECUTE_CODE_TOOL_NAME);
  }
  return ALLOWED;
}
