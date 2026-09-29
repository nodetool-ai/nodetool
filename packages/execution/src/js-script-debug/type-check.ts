/**
 * Type-checks a JS script body against the `.d.ts` files installed sandbox
 * packs ship, so an authoring mistake like `typewriter({ caret: true })`
 * (`@nodetool-ai/sandbox-timeline`'s `caret` is an object, not a boolean)
 * fails `nodetool jsscript validate` by name before the script ever runs.
 *
 * The body is not itself valid as a standalone module (it is the async
 * function body `runCodeBody` wraps at execution time), but its own
 * top-level `import` statements and any top-level `await` are ordinary ES
 * module syntax, so writing it to a `.ts` file and type-checking that file
 * as a module works without reconstructing the wrapper. Every sandbox
 * global the body can read (`nodetool`, `emit`, `inputs`, `workspace`, …) is
 * declared `any` in a a synthesized globals file so the checker never flags
 * one as unknown — this only checks what an installed pack's own `.d.ts`
 * commits to, nothing about the rest of the guest environment.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsScriptDebugIssue } from "./types.js";

/** `specifier -> absolute path to the pack's shipped .d.ts`, e.g. `"@nodetool-ai/sandbox-timeline" -> ".../sandbox/index.d.ts"`. */
export type PackDtsSources = ReadonlyMap<string, string>;

/**
 * Names the QuickJS sandbox and the Code/script node put in scope, loosely
 * typed so the checker never reports one as undefined — mirrors
 * `SANDBOX_GLOBALS` in `@nodetool-ai/node-sdk`'s `code-node-validation.ts`,
 * which this package cannot import as a compile-time type (the dependency
 * runs the other way). A name only needs to exist here, not match precisely:
 * a wrong shape on a *sandbox* global is not this check's job, only a wrong
 * shape passed to an *installed pack's* own declared API is.
 */
const SANDBOX_GLOBALS_DTS = `
declare const nodetool: any;
declare const tools: any;
declare const inputs: any;
declare const state: any;
declare const workspace: any;
declare function emit(name: string, value: unknown): Promise<void>;
declare function output(name: string, value: unknown): Promise<void>;
declare function stream(name: string): AsyncIterable<unknown> & { any: () => AsyncIterable<unknown> };
declare function progress(message: string, fraction?: number): void;
declare function getSecret(name: string): Promise<string | undefined>;
declare function sleep(ms: number): Promise<void>;
declare const format: any;
declare const image: any;
declare const audio: any;
declare const video: any;
declare const canvas: any;
declare const media: any;
declare function createCanvas(width: number, height: number): unknown;
declare function parallelMap<T, R>(items: readonly T[], fn: (item: T) => Promise<R>): Promise<R[]>;
declare function toBase64(bytes: Uint8Array): string;
declare function fromBase64(text: string): Uint8Array;
declare function toHex(bytes: Uint8Array): string;
declare function fromHex(text: string): Uint8Array;
declare function assetToSandbox(value: unknown): Promise<unknown>;
declare function sandboxToAsset(value: unknown): Promise<unknown>;
`;

/**
 * Type-check `code` (a script or Code-node body) as an ES module against the
 * `.d.ts` files in `packDtsSources`, keyed by the specifier a script imports
 * them under. Returns one `js_script_type_error` per diagnostic on the
 * script's own file, each naming the message TypeScript gives — which names
 * the offending property (`caret` on an object-literal type mismatch) the
 * way every other check in this module names the identifier it complains
 * about. Never throws: a `typescript` failure to load or a filesystem error
 * is swallowed and reported as nothing found, since this check is additive
 * on top of the AST-level one in `validateCodeNodeBody`.
 */
export async function typeCheckAgainstPackDts(
  code: string,
  packDtsSources: PackDtsSources
): Promise<JsScriptDebugIssue[]> {
  if (code.trim() === "" || packDtsSources.size === 0) return [];

  let ts: typeof import("typescript");
  try {
    ts = (await import("typescript")).default ?? (await import("typescript"));
  } catch (error) {
    // `typescript` failing to load means this install cannot type-check at
    // all — a warning, not an error, since that is not the script's fault and
    // must not fail `validate` outright (the AST-level checks above already
    // ran and still stand). `typescript` is only a runtime dependency of this
    // package (`packages/execution/package.json`), and this dynamic import is
    // the only place it is ever loaded — a validate call with no pack
    // `.d.ts` sources, and every other caller of this package, never touches
    // the module at all.
    return [
      {
        severity: "warning",
        code: "type_check_unavailable",
        message: `Could not load the TypeScript compiler, so the script's imports were not type-checked against any installed pack's .d.ts: ${
          error instanceof Error ? error.message : String(error)
        }`
      }
    ];
  }

  const dir = await mkdtemp(join(tmpdir(), "nodetool-jsscript-types-"));
  try {
    const globalsPath = join(dir, "sandbox-globals.d.ts");
    const scriptPath = join(dir, "script.ts");
    await writeFile(globalsPath, SANDBOX_GLOBALS_DTS, "utf8");
    await writeFile(scriptPath, code, "utf8");

    const paths: Record<string, string[]> = {};
    for (const [specifier, dtsPath] of packDtsSources) {
      paths[specifier] = [dtsPath];
    }

    let program: import("typescript").Program;
    try {
      program = ts.createProgram([globalsPath, scriptPath], {
        allowJs: false,
        checkJs: false,
        noEmit: true,
        skipLibCheck: true,
        strict: false,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        baseUrl: dir,
        paths
      });
    } catch {
      return [];
    }

    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.file?.fileName === scriptPath);

    return diagnostics.map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
      if (diagnostic.file !== undefined && diagnostic.start !== undefined) {
        const { line } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        return {
          severity: "error" as const,
          code: "js_script_type_error",
          message: `line ${line + 1}: ${message}`
        };
      }
      return { severity: "error" as const, code: "js_script_type_error", message };
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
