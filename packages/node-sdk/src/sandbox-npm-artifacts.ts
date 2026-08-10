/**
 * The contract between the npm compiler and sandbox pack discovery.
 *
 * Discovery is synchronous and engine-free — it never runs esbuild and never
 * starts QuickJS. A host that *can* do those things compiles ahead of time and
 * injects the results here, so an npm-backed module joins the source graph the
 * same way an authored file does. Nothing in this file imports a compiler.
 */

/** A compiled npm module, ready to join a pack's source graph. */
export interface SandboxCompiledNpmArtifact {
  /** The bundled ESM source, exactly as the guest will evaluate it. */
  readonly source: string;
  /** Contract version of the compiler that produced it. */
  readonly compilerVersion: string;
  /** Digest of the normalized build options and the esbuild version. */
  readonly optionsDigest: string;
  /** Digest of every input file's content that went into the bundle. */
  readonly inputsDigest: string;
}

/**
 * What a compiler concluded about one npm module declaration.
 *
 * A `skipped` outcome is a named reason — an import of a Node builtin, a bundle
 * over the size cap, a forbidden global, a probe that threw — and it reaches the
 * catalog as a skip, never as a discovery error.
 */
export type SandboxNpmCompileOutcome =
  | {
      readonly status: "compiled";
      readonly artifact: SandboxCompiledNpmArtifact;
      /** Feature-detected forbidden globals: a heads-up, not a promise. */
      readonly warnings?: readonly string[];
    }
  | {
      readonly status: "skipped";
      readonly code: string;
      readonly message: string;
    };

/** What discovery knows about the npm module it is asking about. */
export interface SandboxNpmCompileRequest {
  readonly packName: string;
  readonly packDir: string;
  readonly specifier: string;
  readonly npmName: string;
}

/**
 * Injected compiled-artifact lookup.
 *
 * `undefined` means "nothing compiled this yet" — discovery reports
 * `pending-compile` and the module stays unavailable until a host with the
 * compiler runs.
 */
export type SandboxCompiledNpmLookup = (
  request: SandboxNpmCompileRequest
) => SandboxNpmCompileOutcome | undefined;

/** The module id a compiled npm entry occupies in a pack's source graph. */
export function npmModuleId(npmName: string): string {
  return `npm:${npmName}`;
}

/** Whether a graph id belongs to an npm-compiled module. */
export function isNpmModuleId(id: string): boolean {
  return id.startsWith("npm:");
}
