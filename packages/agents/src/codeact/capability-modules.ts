/**
 * Mounting the platform's own modules for one action.
 *
 * `@nodetool-ai/sandbox-nodetool/<namespace>` is not a pack: it is NodeTool's
 * own surface, mounted by the host for a session that has a `CapabilityRun`,
 * and deliberately outside the model-facing consent allowlist
 * (`sandbox-packages.ts`) — consent gates third-party code, and the host
 * already decided what this session can do when it built the run.
 *
 * Only the namespaces the action imports are loaded. The dispatcher accepts
 * every registered module, so what an import costs is one module's dependency
 * cone, not the registry's — the laziness the registry's loader table exists
 * for.
 *
 * A session without a run mounts nothing, and the import is refused by name.
 */
import {
  generateSandboxCapabilityFacade,
  sandboxCapabilityModuleName,
  sandboxCapabilitySpecifier,
  MCP_CAPABILITY_MODULE,
  MCP_TOOL_PREFIX,
  SANDBOX_CAPABILITY_PACK
} from "@nodetool-ai/protocol";
import {
  freeIdentifiers,
  parseCodeBody,
  staticImportBindings,
  staticImportSpecifiers,
  typeofGuardedNames
} from "@nodetool-ai/node-sdk";
import type { CodeBodyStatement } from "@nodetool-ai/node-sdk";

import {
  capabilityModuleSpecs,
  createCapabilityDispatcher
} from "../capabilities/dispatcher.js";
import {
  capabilityModuleOf,
  listCapabilityModules
} from "../capabilities/registry.js";
import type { CapabilityRun } from "../capabilities/types.js";
import {
  extractInjectableImages,
  IMAGE_CONTENT_FIELD,
  IMAGE_CONTENTS_FIELD
} from "../tools/image-injection.js";
import { isRecord, isString } from "../utils/type-guards.js";
import type { SandboxCapabilityMount } from "../js-sandbox.js";
import type { SignatureDisclosure } from "./tool-api.js";

/**
 * What a capability answering with pixels is told inside an action.
 *
 * `view_image` answers with an `image_content` payload the tool loop injects
 * into the model's next turn as a real image block. A capability imported into
 * a code action has no such channel: its result is a JavaScript value that
 * reaches the model only as the action's JSON observation, so the pixels went
 * nowhere and the model read back its own question. Say where the pixels are
 * instead of pretending they arrived.
 */
export const SANDBOX_IMAGE_NOTE =
  "No pixels were delivered: an image cannot cross into a code action, only " +
  "its reference. To look at it, call view_image as a direct tool call " +
  "(outside execute_code) with this image_id, or ask a vision model about it " +
  "with critique_image / score_image_adherence, which answer in text.";

/**
 * Replace an injectable-image payload with the note above. Every other result
 * passes through untouched.
 */
function withoutPixels(result: unknown): unknown {
  if (extractInjectableImages(result) === null || !isRecord(result)) {
    return result;
  }
  const stripped: Record<string, unknown> = { ...result };
  delete stripped[IMAGE_CONTENT_FIELD];
  delete stripped[IMAGE_CONTENTS_FIELD];
  const note = stripped["note"];
  stripped["note"] =
    isString(note) && note.length > 0
      ? `${note} ${SANDBOX_IMAGE_NOTE}`
      : SANDBOX_IMAGE_NOTE;
  return stripped;
}

export type CapabilityModuleMount =
  | { ok: true; mount?: SandboxCapabilityMount }
  | { ok: false; error: string };

/**
 * Session tools a host wants importable alongside the registry's own modules.
 *
 * Chat is the case this exists for: its client `ui_*` tools are JSON schemas
 * routed back to the browser, not capabilities, so no registry module owns
 * them. Grafting them onto a namespace keeps one resolution path — a chat
 * action imports `ui_add_node` exactly the way it imports `list_workflows` —
 * without inventing a second global for the difference. External MCP-server
 * tools are deliberately NOT offered this way: they stay provider-level tool
 * calls.
 */
/**
 * The namespace belt tools with no capability module of their own are grafted
 * onto. It is not in the registry — nothing declares it — which is the point:
 * a name under it belongs to this session, not to the platform.
 */
export const SESSION_CAPABILITY_MODULE = "session";

/**
 * The guest namespace a belt name no capability module owns is grafted onto:
 * a client `ui_*` tool goes under `ui`, an external MCP tool under `mcp`,
 * anything else a host added under `session`.
 */
export function graftedModuleFor(name: string): string {
  if (name.startsWith("ui_")) return "ui";
  if (name.startsWith(MCP_TOOL_PREFIX)) return MCP_CAPABILITY_MODULE;
  return SESSION_CAPABILITY_MODULE;
}

export interface SessionCapabilityModule {
  /** The namespace to graft onto, e.g. `"ui"`. */
  readonly module: string;
  /** Wire names to export, added to whatever the registry module declares. */
  readonly exports: readonly string[];
  /** What a call to one of those names runs. */
  readonly call: (name: string, args: unknown) => Promise<unknown>;
}

export interface MountCapabilityModulesOptions {
  signal?: AbortSignal;
  /** Session tools grafted onto a namespace. Empty by default. */
  session?: readonly SessionCapabilityModule[];
  /**
   * The action's disclosure state, so a registry capability's validation
   * failure carries its signature once per action, like a belt tool's.
   */
  disclosure?: SignatureDisclosure;
}

/**
 * The platform modules one action's code needs, or nothing when it imports
 * none — and nothing at all when the session has no run to serve them.
 *
 * A specifier under the pack that names no registered namespace stops the
 * action before the guest starts, the way an unresolvable pack import does:
 * the model sees the refusal as its observation and can correct the import.
 */
export async function mountCapabilityModules(
  code: string,
  run: CapabilityRun | undefined,
  options: MountCapabilityModulesOptions = {}
): Promise<CapabilityModuleMount> {
  const session = options.session ?? [];
  if (run === undefined && session.length === 0) return { ok: true };

  const parsed = parseCodeBody(code);
  // A body that does not parse has no imports to serve; the sandbox reports the
  // syntax error itself, where the position still points at the model's code.
  if ("error" in parsed) return { ok: true };

  const sessionByModule = new Map(session.map((entry) => [entry.module, entry]));
  // A run serves the registry's modules; without one only the grafted
  // namespaces resolve, so the refusal names what this session actually has.
  const registered = new Set(
    run === undefined ? sessionByModule.keys() : listCapabilityModules()
  );
  for (const name of sessionByModule.keys()) registered.add(name);
  const ownerOf = capabilityOwner(run !== undefined, session);

  // Checked before the imports, because the action this catches usually
  // imports nothing: the model reused a name an earlier action imported.
  const notDefined = undefinedCapabilityNames(parsed.statements, ownerOf);
  const refuse = (error: string | undefined): CapabilityModuleMount => ({
    ok: false,
    error: [error, notDefined].filter((part) => part !== undefined).join(" ")
  });

  const imported = [...new Set(staticImportSpecifiers(parsed.statements))];
  const wanted = imported.filter((specifier) =>
    specifier.startsWith(SANDBOX_CAPABILITY_PACK)
  );
  if (wanted.length === 0) {
    return notDefined === undefined ? { ok: true } : refuse(undefined);
  }

  const modules: string[] = [];
  for (const specifier of wanted) {
    const name = sandboxCapabilityModuleName(specifier);
    if (name === undefined || !registered.has(name)) {
      return refuse(
        `The action imports "${specifier}", which is not a NodeTool ` +
          `capability module. Available modules: ${[...registered]
            .map((module) => `"${SANDBOX_CAPABILITY_PACK}/${module}"`)
            .join(", ")}.`
      );
    }
    modules.push(name);
  }

  const unique = [...new Set(modules)];
  const registrySpecs =
    run === undefined
      ? []
      : await capabilityModuleSpecs(
          unique.filter((name) => listCapabilityModules().includes(name))
        );
  const exportsByModule = new Map(
    registrySpecs.map((spec) => [spec.module, [...spec.exports]])
  );
  // A session export shadows nothing: a name the registry already declares
  // stays the registry's, so grafting can add reach but never redirect a
  // gated capability at the browser.
  const sessionNames = new Map<string, Set<string>>();
  for (const name of unique) {
    const graft = sessionByModule.get(name);
    if (graft === undefined) continue;
    const declared = exportsByModule.get(name) ?? [];
    const added = graft.exports.filter(
      (exported) => !declared.includes(exported)
    );
    exportsByModule.set(name, [...declared, ...added]);
    sessionNames.set(name, new Set(added));
  }

  const unknown = unknownImportedExports(
    parsed.statements,
    exportsByModule,
    ownerOf
  );
  if (unknown !== undefined || notDefined !== undefined) return refuse(unknown);

  const facades = new Map(
    unique.map((name) => [
      sandboxCapabilitySpecifier(name),
      generateSandboxCapabilityFacade(
        sandboxCapabilitySpecifier(name),
        exportsByModule.get(name) ?? []
      )
    ])
  );
  const dispatcherOptions: NonNullable<
    Parameters<typeof createCapabilityDispatcher>[2]
  > = {};
  if (options.signal !== undefined) {
    dispatcherOptions.signal = options.signal;
  }
  if (options.disclosure !== undefined) {
    dispatcherOptions.disclosure = options.disclosure;
  }
  const dispatcher =
    run === undefined
      ? undefined
      : createCapabilityDispatcher(
          run,
          listCapabilityModules(),
          dispatcherOptions
        );
  const call = async (
    moduleKey: string,
    exportName: string,
    args: readonly unknown[]
  ): Promise<unknown> => {
    const module = sandboxCapabilityModuleName(moduleKey) ?? moduleKey;
    if (sessionNames.get(module)?.has(exportName) === true) {
      const graft = sessionByModule.get(module);
      if (graft === undefined) {
        throw new Error(`no session module serves "${moduleKey}"`);
      }
      return withoutPixels(
        await graft.call(exportName, args[0] === undefined ? {} : args[0])
      );
    }
    if (dispatcher === undefined) {
      throw new Error(
        `"${exportName}" is not available in this run — it needs a capability run.`
      );
    }
    return withoutPixels(await dispatcher.call(moduleKey, exportName, args));
  };
  return { ok: true, mount: { facades, call } };
}

/**
 * A guessed import that names neither a real export nor a casing/underscore
 * variant of one — a synonym the model reached for by habit. `images` is the
 * "web" module's own case: it is now the real `image_search` export's name,
 * but a model still guesses `images`, `image`, `search_images`, or the
 * retired `google_images` (see `RETIRED_TOOL_NAMES` in
 * `packages/llm-nodes/src/nodes/agent-tool-hydration.ts`) for it.
 */
const MODULE_EXPORT_SYNONYMS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  web: {
    images: "image_search",
    image: "image_search",
    search_images: "image_search",
    google_images: "image_search",
    dataforseo_images: "image_search"
  }
};

/** "Did you mean …" for a known synonym of a real export in this module. */
function synonymHintSentence(
  module: string,
  missingName: string,
  available: readonly string[]
): string {
  const target = MODULE_EXPORT_SYNONYMS[module]?.[missingName.toLowerCase()];
  if (target === undefined || !available.includes(target)) return "";
  return `Did you mean "${target}" for "${missingName}"? `;
}

/**
 * `web_search` absorbed news search as a `search_type` argument rather than a
 * name of its own (`google_news` is retired — see `RETIRED_TOOL_NAMES` in
 * `packages/llm-nodes/src/nodes/agent-tool-hydration.ts`). Nothing in the
 * "web" module's export list says so, so a model reaching for a news search
 * guesses a name like `news_search`, is told only that "web" exports
 * `web_search, image_search, browser, take_screenshot, http_request,
 * download_file", and calls plain `web_search` next — which silently returns
 * page results instead of the dated articles it was asked for. Naming the
 * parameter here, at the point the guess failed, is cheaper than hoping the
 * model infers it from a bare export list.
 */
const WEB_SEARCH_TYPE_HINTS: Readonly<Record<string, "news">> = {
  news: "news",
  news_search: "news",
  search_news: "news",
  google_news: "news"
};

/** A sentence pointing a guessed news-search import at `web_search`. */
function searchTypeHintSentence(module: string, missingName: string): string {
  if (module !== "web") return "";
  const searchType = WEB_SEARCH_TYPE_HINTS[missingName.toLowerCase()];
  if (searchType === undefined) return "";
  return (
    `There is no separate ${searchType} search — call "web_search" with ` +
    `{search_type: "${searchType}"} instead. `
  );
}

/**
 * A capability module exports its wire names verbatim — `generate_image`, not
 * `generateImage` — so the spelling a model reaches for by habit resolves to
 * nothing. Left to the guest that surfaces as QuickJS's "Could not find export
 * 'generateImage'", which names neither the module's exports nor the one it
 * meant; the model then guesses again. Refuse the action here instead, with
 * the export list and the near match.
 *
 * Returns the refusal, or `undefined` when every imported name exists.
 */
function unknownImportedExports(
  statements: readonly CodeBodyStatement[],
  exportsByModule: ReadonlyMap<string, readonly string[]>,
  ownerOf: CapabilityOwner
): string | undefined {
  for (const binding of staticImportBindings(statements)) {
    const module = sandboxCapabilityModuleName(binding.specifier);
    const available =
      module === undefined ? undefined : exportsByModule.get(module);
    if (available === undefined) continue;
    const missing = binding.named.filter((name) => !available.includes(name));
    if (missing.length === 0) continue;
    const names = missing.map((name) => `"${name}"`).join(", ");
    const suggestions = missing
      .map(
        (name) =>
          elsewhereSentence(name, ownerOf) ||
          synonymHintSentence(module ?? "", name, available) ||
          nearMatchSentence(name, available) ||
          searchTypeHintSentence(module ?? "", name)
      )
      .filter((sentence) => sentence.length > 0)
      .join(" ");
    return (
      `The action imports ${names} from "${binding.specifier}", which that ` +
      `module does not export. ${suggestions}Capability modules export the ` +
      `wire name verbatim, in snake_case. "${binding.specifier}" exports: ` +
      `${available.join(", ")}.`
    );
  }
  return undefined;
}

/** The module this session serves a capability name from, if any. */
type CapabilityOwner = (name: string) => string | undefined;

/**
 * Where a bare capability name resolves in this session: the registry module
 * that declares it when a run serves the registry, else the grafted namespace
 * that exports it. The registry wins, the way it does when a graft is mounted.
 */
function capabilityOwner(
  hasRun: boolean,
  session: readonly SessionCapabilityModule[]
): CapabilityOwner {
  return (name) => {
    if (hasRun) {
      const module = capabilityModuleOf(name);
      if (module !== undefined) return module;
    }
    return session.find((graft) => graft.exports.includes(name))?.module;
  };
}

/**
 * Methods of the guest's `nodetool` global that a model imports as if a
 * module exported them, with the call to write instead.
 */
const NODETOOL_METHOD_CALLS: Readonly<Record<string, string>> = {
  searchTools: 'await nodetool.searchTools("query")',
  search_tools: 'await nodetool.searchTools("query")'
};

/**
 * Where a name imported from the wrong module actually lives: the capability
 * module that exports it, or the `nodetool` method it really is.
 */
function elsewhereSentence(name: string, ownerOf: CapabilityOwner): string {
  const call = NODETOOL_METHOD_CALLS[name];
  if (call !== undefined) {
    return (
      `\`${name}\` is not a module export. It is a method of the ` +
      `\`nodetool\` global: call \`${call}\` without importing it. `
    );
  }
  const owner = ownerOf(name);
  if (owner === undefined) return "";
  return `\`${name}\` is exported by \`${sandboxCapabilitySpecifier(owner)}\`. `;
}

/**
 * Capability names the body calls without importing or declaring them.
 *
 * Every action is a fresh guest, so a name imported in an earlier action is
 * not defined in this one. QuickJS reports that as "ReferenceError: <name> is
 * not defined", which says neither that an import is missing nor where the
 * name lives, and a model read it as a missing capability. Refusing here names
 * the import line instead. The check refuses rather than adding the import
 * itself, so the action the model sees in its trace is the one that ran and
 * the next one carries the import.
 *
 * A `typeof` guard marks the name as optional, so it is left alone.
 */
function undefinedCapabilityNames(
  statements: readonly CodeBodyStatement[],
  ownerOf: CapabilityOwner
): string | undefined {
  const guarded = typeofGuardedNames(statements);
  const byModule = new Map<string, string[]>();
  for (const name of freeIdentifiers(statements)) {
    if (guarded.has(name)) continue;
    const module = ownerOf(name);
    if (module === undefined) continue;
    byModule.set(module, [...(byModule.get(module) ?? []), name]);
  }
  if (byModule.size === 0) return undefined;
  const names = [...byModule.values()].flat();
  const lines = [...byModule].map(
    ([module, moduleNames]) =>
      `\`import { ${moduleNames.join(", ")} } from ` +
      `"${sandboxCapabilitySpecifier(module)}";\``
  );
  const subject =
    names.length === 1
      ? `\`${names[0]}\` is`
      : `${names.map((name) => `\`${name}\``).join(", ")} are`;
  return (
    `${subject} not defined in this action. Nothing carries over between ` +
    `actions; add ${lines.join(" and ")}.`
  );
}

/**
 * "Did you mean …" for the one name that differs only in casing, `_`, or a
 * missing tail.
 *
 * The tail is the half that was missing: `preview_timeline` is not a casing
 * slip of `preview_timeline_frame`, and a model that dropped the last word
 * read a message listing every export and concluded the capability was gone.
 * A prefix hint only fires when exactly one export extends the name, so it
 * never picks between two plausible ones.
 */
function nearMatchSentence(
  wanted: string,
  available: readonly string[]
): string {
  const flatten = (name: string): string =>
    name.replace(/_/g, "").toLowerCase();
  const target = flatten(wanted);
  const exact = available.find((name) => flatten(name) === target);
  if (exact !== undefined) {
    return `Did you mean "${exact}" for "${wanted}"? `;
  }
  if (target.length < 4) return "";
  const extending = available.filter(
    (name) =>
      flatten(name).startsWith(target) || target.startsWith(flatten(name))
  );
  return extending.length === 1
    ? `Did you mean "${extending[0]}" for "${wanted}"? `
    : "";
}
