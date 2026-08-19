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
import { parseCodeBody, staticImportSpecifiers } from "@nodetool-ai/node-sdk";

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
  return { ok: true, modules: resolution };
}
