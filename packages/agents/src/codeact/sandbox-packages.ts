/**
 * Session package consent for CodeAct actions.
 *
 * A Code node runs a body a person saved; a CodeAct action is code the model
 * just wrote. Mounting whatever happens to be installed would
 * let the model hand an unrelated pack the action's `fetch`, `workspace`,
 * `getSecret` and tool capabilities, so an action imports only what the session
 * allowed — and the prompt advertises only those specifiers, one line each,
 * never the installed catalog.
 *
 * A session that allowed nothing therefore imports nothing: the allowlist is
 * empty, the prompt says so, and an import is refused as an observation the
 * model can correct.
 */
import {
  MAX_SANDBOX_DESCRIPTION,
  sanitizeSandboxDescription,
  type SandboxModuleResolution
} from "@nodetool-ai/protocol";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";
import {
  dynamicModuleAccess,
  exportedNames,
  parseCodeBody,
  staticImportBindings,
  staticImportSpecifiers,
  type CodeBodyStatement
} from "@nodetool-ai/node-sdk";

/** Longest description the one-line tier prints (the summary schema caps at 160). */
export const MAX_PACKAGE_DESCRIPTION = MAX_SANDBOX_DESCRIPTION;

/** The specifiers an action may import: the session's allowlist, deduped. */
export function sessionAllowedPackages(
  allowlist: readonly string[] | undefined
): string[] {
  return [...new Set(allowlist ?? [])];
}

/**
 * Unique installed pack names. Consent is per pack, so a JS-script session
 * lists roots only — a subpath of an allowed pack is already covered.
 */
export function installedPackAllowlist(
  catalog: SandboxModuleCatalog | null | undefined
): string[] {
  return [...new Set((catalog?.summaries() ?? []).map((s) => s.packName))];
}

/**
 * Chat session allowlist. A JS-script assistant may import every installed
 * pack; every other source leaves this unset so dsl+fabric stay the default.
 */
export function sandboxPackagesForChat(opts: {
  source?: string | null;
  focusedType?: string | null;
  catalog: SandboxModuleCatalog | null | undefined;
}): string[] | undefined {
  const isJsScript =
    opts.source === "jsscript_assistant" || opts.focusedType === "jsscript";
  return isJsScript ? installedPackAllowlist(opts.catalog) : undefined;
}

/**
 * Whether an allowlist covers one import specifier.
 *
 * Consent is per pack, so a subpath of an allowed specifier is covered: it is
 * the same pack's code, shipped in the same manifest, resolved through the same
 * catalog entry. `@nodetool-ai/sandbox-dsl` ships one module per node
 * namespace, and listing all seventy-two in the prompt would spend the budget
 * the one-line tier exists to protect.
 */
function allowlistCovers(
  allowed: readonly string[],
  specifier: string
): boolean {
  return allowed.some(
    (entry) => specifier === entry || specifier.startsWith(`${entry}/`)
  );
}

/**
 * Pack-authored text reaches every prompt of the session, so it is stripped to
 * a single short line: no control characters, no newlines, no runaway length.
 * The rule lives in protocol, where the catalog that fills a summary's
 * description applies it too — one limit, enforced at both ends.
 */
export function sanitizePackageDescription(text: string): string {
  return sanitizeSandboxDescription(text);
}

/**
 * One line per allowed specifier the catalog knows: `specifier — description`.
 * A specifier the catalog cannot describe still gets its line — the model needs
 * to know it may import it.
 */
export function packagePromptLines(
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined
): string[] {
  if (allowed.length === 0) return [];
  const summaries = new Map(
    (catalog?.summaries() ?? []).map((summary) => [summary.specifier, summary])
  );
  return allowed.map((specifier) => {
    const description = summaries.get(specifier)?.description;
    const clean = description ? sanitizePackageDescription(description) : "";
    return clean ? `${specifier} — ${clean}` : specifier;
  });
}

export type ActionModuleMount =
  | { ok: true; modules?: SandboxModuleResolution }
  | { ok: false; error: string };

/**
 * Resolve the modules one action's code may mount.
 *
 * Code that imports nothing mounts nothing (and installs no loader). A
 * specifier off the allowlist — or one the catalog cannot serve — stops the
 * action before the guest starts: the model sees the refusal as its
 * observation and can drop the import or ask for the package.
 */
export function mountActionModules(
  code: string,
  allowed: readonly string[],
  catalog: SandboxModuleCatalog | null | undefined,
  /**
   * Specifiers the host mounted itself — NodeTool's own capability modules.
   * They are not pack code and never went through consent, so they are neither
   * checked against the allowlist nor resolved through the catalog.
   */
  hostMounted: ReadonlySet<string> = new Set()
): ActionModuleMount {
  const parsed = parseCodeBody(code);
  // A body that does not parse has no imports to serve; the sandbox reports the
  // syntax error itself, where the position still points at the model's code.
  if ("error" in parsed) return { ok: true };

  // `require` is not a guest global, so a CommonJS body used to die on
  // `ReferenceError: require is not defined` — true, and no help. The Code
  // node has said what to write instead since it grew a validator; an action
  // says it here, before the run.
  const dynamic = dynamicModuleAccess(parsed.statements);
  if (dynamic.require || dynamic.dynamicImport) {
    const used = [
      ...(dynamic.dynamicImport ? ["import()"] : []),
      ...(dynamic.require ? ["require()"] : [])
    ]
      .map((name) => `\`${name}\``)
      .join(" and ");
    return {
      ok: false,
      error:
        `The action uses ${used}, which the sandbox does not support — the ` +
        "loader denies every dynamic resolution. Import the module with a " +
        "static `import` at the top of the action instead."
    };
  }

  const specifiers = [
    ...new Set(staticImportSpecifiers(parsed.statements))
  ].filter((specifier) => !hostMounted.has(specifier));
  if (specifiers.length === 0) return { ok: true };

  const denied = specifiers.filter(
    (specifier) => !allowlistCovers(allowed, specifier)
  );
  if (denied.length > 0) {
    const list = denied.map((specifier) => `"${specifier}"`).join(", ");
    return {
      ok: false,
      error:
        `The action imports ${list}, which is not on this session's package ` +
        `allowlist. ${
          allowed.length > 0
            ? `Only ${allowed.map((s) => `"${s}"`).join(", ")} can be imported here.`
            : "No sandbox package is available in this session."
        } Rewrite the action without the import.`
    };
  }

  if (!catalog) {
    return {
      ok: false,
      error:
        "Sandbox packages cannot be resolved in this process, so the action's " +
        "imports cannot be served. Rewrite the action without the import."
    };
  }

  const resolution = catalog.resolveForExecution(
    specifiers.map((specifier) => ({ specifier }))
  );
  const errors = resolution.statuses.filter(
    (status) => status.status === "error"
  );
  if (errors.length > 0) {
    return {
      ok: false,
      error: errors
        .map((status) => `${status.message} (pack "${status.packName}")`)
        .join(" ")
    };
  }
  const unknown = unknownPackExports(parsed.statements, resolution);
  if (unknown !== undefined) return { ok: false, error: unknown };
  return { ok: true, modules: resolution };
}

/**
 * Refuse an import of a name a resolved pack module does not export.
 *
 * Capability modules already get this check
 * (`capability-modules.ts`); pack modules did not, and the guest's own report
 * — `SyntaxError: Could not find export 'websearch' in module
 * 'nodetool-sandbox:@nodetool-ai/sandbox-dsl|sandbox/generated/xai.text.js'` —
 * names neither the module's exports nor the near miss (`webSearch`). Decide
 * it here instead, before the guest starts, with both.
 *
 * Only JS modules are checked: their source is in hand, so the export list is
 * a parse away. A module whose exports cannot be decided
 * ({@link exportedNames} returns null) is left alone — an unknowable list must
 * not read as an empty one.
 *
 * Returns the refusal, or `undefined` when every imported name exists.
 */
function unknownPackExports(
  statements: readonly CodeBodyStatement[],
  resolution: SandboxModuleResolution
): string | undefined {
  const exportsBySpecifier = new Map<string, readonly string[]>();
  for (const module of resolution.modules) {
    if (module.kind !== "js") continue;
    const names = exportedNames(module.source);
    if (names !== null) exportsBySpecifier.set(module.specifier, names);
  }
  for (const binding of staticImportBindings(statements)) {
    const available = exportsBySpecifier.get(binding.specifier);
    if (available === undefined) continue;
    const missing = binding.named.filter((name) => !available.includes(name));
    if (missing.length === 0) continue;
    const names = missing.map((name) => `"${name}"`).join(", ");
    const suggestions = missing
      .map((name) => nearExportSentence(name, available))
      .filter((sentence) => sentence.length > 0)
      .join(" ");
    return (
      `The action imports ${names} from "${binding.specifier}", which that ` +
      `module does not export. ${suggestions}"${binding.specifier}" exports: ` +
      `${listExports(available)}.`
    );
  }
  return undefined;
}

/** How many export names a refusal prints before it says how many are left. */
const MAX_LISTED_EXPORTS = 40;

/** The module's exports, capped so a barrel module cannot flood the message. */
function listExports(available: readonly string[]): string {
  if (available.length <= MAX_LISTED_EXPORTS) return available.join(", ");
  const shown = available.slice(0, MAX_LISTED_EXPORTS).join(", ");
  return `${shown}, and ${available.length - MAX_LISTED_EXPORTS} more`;
}

/**
 * "Did you mean …" for the one export that differs only in casing or
 * separators — `websearch` for `webSearch`, `find_model` for `findModel`.
 */
function nearExportSentence(
  wanted: string,
  available: readonly string[]
): string {
  const flatten = (name: string): string =>
    name.replace(/[_-]/g, "").toLowerCase();
  const target = flatten(wanted);
  const match = available.find((name) => flatten(name) === target);
  return match === undefined ? "" : `Did you mean "${match}" for "${wanted}"? `;
}
