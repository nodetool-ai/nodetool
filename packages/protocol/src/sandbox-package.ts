import { z } from "zod";

import { SANDBOX_WASM_BUDGETS } from "./sandbox-wasm.js";
import { isString } from "./predicates.js";

const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const MODULE_NAME = /^(?:\.|[A-Za-z0-9._-]+)$/;
const PACKAGE_NAME = /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i;
const SPECIFIER = /^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+(?:\/[A-Za-z0-9._-]+)?$/i;
const RELATIVE_FILE = /^(?!\/)(?!.*(?:^|[\\/])\.\.(?:$|[\\/]))[^\\]*$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ENCODED_PATH_CHARACTER = /%(?:2e|2f|5c)/i;
const contentDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
const RESERVED_IDENTIFIERS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
  "enum",
  "implements",
  "interface",
  "package",
  "private",
  "protected",
  "public"
]);

/** Longest pack-authored description any always-on prompt tier may carry. */
export const MAX_SANDBOX_DESCRIPTION = 160;

/**
 * Flatten pack-authored text to one short line.
 *
 * Whatever a pack writes here reaches every prompt of a session that allows the
 * pack, so the limits are the defense: control characters and line breaks go,
 * whitespace collapses, and the result is cut at
 * {@link MAX_SANDBOX_DESCRIPTION}. Nothing about the wording is judged — a
 * sentence that reads like an instruction is still just one capped line.
 */
export function sanitizeSandboxDescription(text: string): string {
  const flat = text
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > MAX_SANDBOX_DESCRIPTION
    ? `${flat.slice(0, MAX_SANDBOX_DESCRIPTION - 1).trimEnd()}…`
    : flat;
}

/** A public sandbox module's kind. */
export const SandboxModuleKind = {
  JS: "js",
  WASM: "wasm",
  /** A NodeTool-implemented host function set, reached through a generated facade. */
  HOST: "host"
} as const;
export type SandboxModuleKind =
  (typeof SandboxModuleKind)[keyof typeof SandboxModuleKind];

/** The host-owned portion of a NodeTool pack manifest. */
export const NodePackHostManifestSchema = z
  .object({
    apiVersion: z.number().optional(),
    register: z.string().optional(),
    sandboxModules: z.unknown().optional()
  })
  .passthrough();
export type NodePackHostManifest = z.infer<typeof NodePackHostManifestSchema>;

const moduleNameSchema = z
  .string()
  .regex(MODULE_NAME)
  .refine(
    (value) => value === "." || !value.includes("/"),
    "module name must be . or one path segment"
  )
  .refine(
    (value) => value !== ".." && value !== "node_modules",
    "reserved module name"
  )
  .refine(
    (value) => !CONTROL_CHARACTERS.test(value),
    "module name contains a control character"
  );
const fileSchema = z
  .string()
  .min(1)
  .regex(RELATIVE_FILE, "file must be a package-relative path")
  .refine(
    (value) => !CONTROL_CHARACTERS.test(value),
    "file contains a control character"
  )
  .refine(
    (value) => !ENCODED_PATH_CHARACTER.test(value),
    "file contains encoded path traversal"
  );
const identifierSchema = z
  .string()
  .regex(JS_IDENTIFIER, "must be a valid JavaScript identifier")
  .refine(
    (value) => !RESERVED_IDENTIFIERS.has(value),
    "reserved JavaScript identifier"
  );
const npmPackageSchema = z
  .string()
  .regex(PACKAGE_NAME, "must be an npm package name")
  .refine(
    (value) =>
      !CONTROL_CHARACTERS.test(value) && !ENCODED_PATH_CHARACTER.test(value),
    "invalid npm package name"
  )
  .refine(
    (value) => value !== "." && value !== "..",
    "invalid npm package name"
  );

const wasmExportSchema = z.union([
  identifierSchema,
  z
    .object({
      wasm: z
        .string()
        .min(1)
        .refine(
          (value) => !CONTROL_CHARACTERS.test(value),
          "invalid WASM export name"
        ),
      as: identifierSchema
    })
    .strict()
]);

/**
 * Budgets a manifest may lower.
 *
 * Every bound's default is also its ceiling ({@link SANDBOX_WASM_BUDGETS}), so
 * a `.max()` here is the whole "may lower, never raise" rule — a manifest that
 * asks for more is rejected rather than clamped, because a pack that thinks it
 * has 60 s is a pack that will be surprised at 30.
 */
export const SandboxWasmLimitsSchema = z
  .object({
    callTimeoutMs: z
      .number()
      .int()
      .min(1)
      .max(SANDBOX_WASM_BUDGETS.callTimeoutMs)
      .optional(),
    callConcurrency: z
      .number()
      .int()
      .min(1)
      .max(SANDBOX_WASM_BUDGETS.callConcurrency)
      .optional(),
    callsPerInvocation: z
      .number()
      .int()
      .min(1)
      .max(SANDBOX_WASM_BUDGETS.callsPerInvocation)
      .optional(),
    wallClockMs: z
      .number()
      .int()
      .min(1)
      .max(SANDBOX_WASM_BUDGETS.wallClockMs)
      .optional()
  })
  .strict();
export type SandboxWasmLimits = z.infer<typeof SandboxWasmLimitsSchema>;

/** The normalized call contract a resolved WASM module carries to the host. */
export const SandboxWasmContractSchema = z
  .object({
    memoryPagesMax: z.number().int().min(0).max(4096),
    exports: z
      .array(
        z.object({ wasm: z.string().min(1), as: identifierSchema }).strict()
      )
      .min(1),
    limits: SandboxWasmLimitsSchema.optional()
  })
  .strict();
export type SandboxWasmContract = z.infer<typeof SandboxWasmContractSchema>;

const jsModuleSchema = z
  .object({
    name: moduleNameSchema,
    kind: z.literal(SandboxModuleKind.JS),
    file: fileSchema.optional(),
    npm: npmPackageSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.file === undefined) === (value.npm === undefined)) {
      ctx.addIssue({
        code: "custom",
        message: "a JS module must declare exactly one of file or npm"
      });
    }
  });

const wasmModuleSchema = z
  .object({
    name: moduleNameSchema,
    kind: z.literal(SandboxModuleKind.WASM),
    file: fileSchema,
    memoryPagesMax: z.number().int().min(0).max(4096),
    exports: z.array(wasmExportSchema).min(1),
    limits: SandboxWasmLimitsSchema.optional()
  })
  .strict()
  .superRefine((value, ctx) => {
    const aliases = new Set<string>();
    const wasmNames = new Set<string>();
    for (const exported of value.exports) {
      const wasmName = isString(exported) ? exported : exported.wasm;
      const alias = isString(exported) ? exported : exported.as;
      if (wasmNames.has(wasmName)) {
        ctx.addIssue({
          code: "custom",
          path: ["exports"],
          message: `duplicate WASM export: ${wasmName}`
        });
      }
      if (aliases.has(alias)) {
        ctx.addIssue({
          code: "custom",
          path: ["exports"],
          message: `duplicate JavaScript export alias: ${alias}`
        });
      }
      wasmNames.add(wasmName);
      aliases.add(alias);
    }
  });

/**
 * A host module entry.
 *
 * `host` is an **id**, never an implementation: the pack ships no code for it,
 * and discovery admits the entry only when the id is in NodeTool's own registry
 * *and* the declaring package is the one that registry pins to it
 * ({@link sandboxHostModuleViolation}). The schema alone cannot decide that —
 * it does not know the package name — so it only pins the shape.
 */
const hostModuleSchema = z
  .object({
    name: moduleNameSchema,
    kind: z.literal(SandboxModuleKind.HOST),
    host: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9-]*$/, "invalid host module id")
  })
  .strict();

/** A module declared by a pack. npm modules are compiled in the M3 compiler. */
export const SandboxModuleManifestSchema = z.discriminatedUnion("kind", [
  jsModuleSchema,
  wasmModuleSchema,
  hostModuleSchema
]);

export type SandboxModuleManifest = z.infer<typeof SandboxModuleManifestSchema>;

/** The sandbox-specific portion of a pack's nodetool manifest. */
export const SandboxPackManifestSchema = z
  .object({
    apiVersion: z.literal(1).default(1),
    sandboxModules: z.array(SandboxModuleManifestSchema).default([]),
    internal: z.array(fileSchema).default([])
  })
  .strict()
  .superRefine((value, ctx) => {
    const names = new Set<string>();
    for (const module of value.sandboxModules) {
      if (names.has(module.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["sandboxModules"],
          message: `duplicate module name: ${module.name}`
        });
      }
      names.add(module.name);
    }
    const publicFiles = new Set(
      value.sandboxModules.flatMap((module) =>
        "file" in module ? [module.file] : []
      )
    );
    for (const file of value.internal) {
      if (publicFiles.has(file)) {
        ctx.addIssue({
          code: "custom",
          path: ["internal"],
          message: `internal file is also public: ${file}`
        });
      }
    }
    if (new Set(value.internal).size !== value.internal.length) {
      ctx.addIssue({
        code: "custom",
        path: ["internal"],
        message: "duplicate internal file"
      });
    }
  });
export type SandboxPackManifest = z.infer<typeof SandboxPackManifestSchema>;

export const SandboxModuleDeclarationSchema = z
  .object({
    specifier: z.string().regex(SPECIFIER, "invalid sandbox module specifier"),
    resolvedPackVersion: z.string().min(1).optional(),
    contentDigest: contentDigestSchema.optional()
  })
  .strict();
export type SandboxModuleDeclaration = z.infer<
  typeof SandboxModuleDeclarationSchema
>;

/** A catalog entry that can be listed without exposing module source. */
export const SandboxModuleSummarySchema = z
  .object({
    specifier: z.string().regex(SPECIFIER, "invalid sandbox module specifier"),
    packName: z.string().regex(PACKAGE_NAME),
    packVersion: z.string().min(1).optional(),
    kind: z.enum([
      SandboxModuleKind.JS,
      SandboxModuleKind.WASM,
      SandboxModuleKind.HOST
    ]),
    description: z.string().max(MAX_SANDBOX_DESCRIPTION).optional(),
    /** The module's content digest, so a picker can stamp what it declares. */
    contentDigest: contentDigestSchema.optional()
  })
  .strict();
export type SandboxModuleSummary = z.infer<typeof SandboxModuleSummarySchema>;

/** A pack's parsed SKILL.md, kept out of every always-on prompt tier. */
export interface SandboxPackSkill {
  readonly name: string;
  readonly description: string;
  /** The full instruction body — third-party prompt content, never ambient. */
  readonly body: string;
  /** `##` sections of the body, keyed by lowercased heading text. */
  readonly sections: Readonly<Record<string, string>>;
}

/** A pack's documentation with the trust decision that governs how it is used. */
export interface SandboxPackSkillDisclosure extends SandboxPackSkill {
  readonly packName: string;
  readonly packVersion?: string;
  /** True only when the operator put this pack on the pack-loader allowlist. */
  readonly trusted: boolean;
}

/** A diagnostic emitted while discovering or resolving a sandbox module. */
export const SandboxModuleStatusSchema = z
  .object({
    packName: z.string().min(1),
    specifier: z.string().regex(SPECIFIER).optional(),
    status: z.enum(["ready", "warning", "skipped", "error"]),
    code: z.string().min(1),
    message: z.string().min(1)
  })
  .strict();
export type SandboxModuleStatus = z.infer<typeof SandboxModuleStatusSchema>;

/** A source file from a resolved module graph, with no host filesystem path. */
export const SandboxModuleGraphFileSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: fileSchema,
      kind: z.literal(SandboxModuleKind.JS),
      source: z.string(),
      dependencies: z.array(fileSchema),
      internal: z.boolean()
    })
    .strict(),
  z
    .object({
      id: fileSchema,
      kind: z.literal(SandboxModuleKind.WASM),
      bytes: z.instanceof(Uint8Array),
      dependencies: z.array(fileSchema),
      internal: z.boolean()
    })
    .strict()
]);
export type SandboxModuleGraphFile = z.infer<
  typeof SandboxModuleGraphFileSchema
>;

/** A sandbox module resolved for one execution, including its validated source graph. */
export const ResolvedSandboxModuleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      specifier: z
        .string()
        .regex(SPECIFIER, "invalid sandbox module specifier"),
      packName: z.string().regex(PACKAGE_NAME),
      packVersion: z.string().min(1).optional(),
      contentDigest: contentDigestSchema,
      moduleId: z.string().min(1),
      kind: z.literal(SandboxModuleKind.JS),
      source: z.string(),
      graph: z.array(SandboxModuleGraphFileSchema)
    })
    .strict(),
  z
    .object({
      specifier: z
        .string()
        .regex(SPECIFIER, "invalid sandbox module specifier"),
      packName: z.string().regex(PACKAGE_NAME),
      packVersion: z.string().min(1).optional(),
      contentDigest: contentDigestSchema,
      moduleId: z.string().min(1),
      kind: z.literal(SandboxModuleKind.WASM),
      bytes: z.instanceof(Uint8Array),
      /** The manifest's call contract, normalized: every export as `{wasm, as}`. */
      wasm: SandboxWasmContractSchema,
      graph: z.array(SandboxModuleGraphFileSchema)
    })
    .strict(),
  z
    .object({
      specifier: z
        .string()
        .regex(SPECIFIER, "invalid sandbox module specifier"),
      packName: z.string().regex(PACKAGE_NAME),
      packVersion: z.string().min(1).optional(),
      contentDigest: contentDigestSchema,
      moduleId: z.string().min(1),
      kind: z.literal(SandboxModuleKind.HOST),
      /**
       * The registry id of the host implementation.
       *
       * Everything else the guest and the dispatcher need — the export list, the
       * facade — derives from `SANDBOX_HOST_MODULES`, so a resolution can never
       * widen the surface an id names.
       */
      hostId: z.string().min(1),
      graph: z.array(SandboxModuleGraphFileSchema)
    })
    .strict()
]);
export type ResolvedSandboxModule = z.infer<typeof ResolvedSandboxModuleSchema>;

/** The catalog result for a workflow's requested sandbox modules. */
export const SandboxModuleResolutionSchema = z
  .object({
    modules: z.array(ResolvedSandboxModuleSchema),
    statuses: z.array(SandboxModuleStatusSchema)
  })
  .strict();
export type SandboxModuleResolution = z.infer<
  typeof SandboxModuleResolutionSchema
>;

/** Media type a delivered sandbox module is served with. */
export const SandboxDeliveryMediaType = {
  JS: "text/javascript",
  WASM: "application/wasm"
} as const;
export type SandboxDeliveryMediaType =
  (typeof SandboxDeliveryMediaType)[keyof typeof SandboxDeliveryMediaType];

/**
 * Separator between a pack name and an internal graph-file id in an opaque
 * delivery module id.
 *
 * A public entry module is addressed by its specifier (`@acme/geo`). Every
 * other file of the graph — internal helpers and files a second entry imports —
 * is addressed as `<packName>::<fileId>`. Neither a package name nor a
 * package-relative file id may contain `::`, so the two forms cannot collide.
 */
export const SANDBOX_GRAPH_FILE_SEPARATOR = "::";

/** Compose the opaque delivery id of one file inside a pack's module graph. */
export function sandboxGraphFileModuleId(
  packName: string,
  fileId: string
): string {
  return `${packName}${SANDBOX_GRAPH_FILE_SEPARATOR}${fileId}`;
}

/** Split an opaque graph-file id, or undefined when the id is an entry specifier. */
export function parseSandboxGraphFileModuleId(
  moduleId: string
): { packName: string; fileId: string } | undefined {
  const index = moduleId.indexOf(SANDBOX_GRAPH_FILE_SEPARATOR);
  if (index <= 0) return undefined;
  const packName = moduleId.slice(0, index);
  const fileId = moduleId.slice(index + SANDBOX_GRAPH_FILE_SEPARATOR.length);
  if (fileId.length === 0) return undefined;
  return { packName, fileId };
}

const deliveryCommon = {
  authorized: z.literal(true),
  /** The opaque id this delivery answers — an entry specifier or a graph-file id. */
  moduleId: z.string().min(1),
  /**
   * The delivered file's pack-relative id (`sandbox/geo.js`).
   *
   * A graph-file id already carries it, but an entry is addressed by its
   * specifier, and the client needs the file id all the same: relative imports
   * inside the module resolve against it.
   */
  fileId: z.string().min(1),
  /** Whether the pack's manifest keeps this file out of its public surface. */
  internal: z.boolean(),
  packName: z.string().regex(PACKAGE_NAME),
  packVersion: z.string().min(1).optional(),
  /** The owning module's graph digest (never a per-file hash). */
  contentDigest: contentDigestSchema,
  /**
   * SHA-256 of the delivered bytes of *this* file.
   *
   * `contentDigest` versions the whole module graph, so every file of one graph
   * carries the same value and a client cannot check a response body against
   * it. This is the per-response hash a client verifies before it executes
   * anything: for JS, the UTF-8 encoding of `source`; for WASM, `bytes`.
   */
  contentSha256: contentDigestSchema,
  /** Opaque ids of the modules this one imports, for closure prefetching. */
  dependencies: z.array(z.string().min(1))
};

/** Browser-safe content for one sandbox module, carrying no filesystem path. */
export const AuthorizedSandboxModuleDeliverySchema = z.discriminatedUnion(
  "kind",
  [
    z
      .object({
        ...deliveryCommon,
        kind: z.literal(SandboxModuleKind.JS),
        mediaType: z.literal(SandboxDeliveryMediaType.JS),
        source: z.string()
      })
      .strict(),
    z
      .object({
        ...deliveryCommon,
        kind: z.literal(SandboxModuleKind.WASM),
        mediaType: z.literal(SandboxDeliveryMediaType.WASM),
        bytes: z.instanceof(Uint8Array),
        /**
         * The call contract, present only on a pack's public WASM entry.
         *
         * A client needs it to build the facade it imports; an internal graph file
         * is bytes a facade already names, so it carries none.
         */
        wasm: SandboxWasmContractSchema.optional()
      })
      .strict(),
    /**
     * A host module.
     *
     * The body is the generated facade — the only guest-visible artifact a host
     * module has — so a client verifies and caches it like any other JavaScript.
     * `hostId` rides along because the client rebuilds the resolved module from
     * it, and the registry supplies the rest.
     */
    z
      .object({
        ...deliveryCommon,
        kind: z.literal(SandboxModuleKind.HOST),
        mediaType: z.literal(SandboxDeliveryMediaType.JS),
        hostId: z.string().min(1),
        source: z.string()
      })
      .strict()
  ]
);
export type AuthorizedSandboxModuleDelivery = z.infer<
  typeof AuthorizedSandboxModuleDeliverySchema
>;

/** Why the catalog would not hand out a module's content. */
export const SandboxDeliveryRefusalReasonSchema = z.enum([
  "not-found",
  "unavailable",
  "forbidden"
]);
export type SandboxDeliveryRefusalReason = z.infer<
  typeof SandboxDeliveryRefusalReasonSchema
>;

/** The catalog's refusal to deliver, carrying no content and no path. */
export const SandboxDeliveryRefusalSchema = z
  .object({
    authorized: z.literal(false),
    reason: SandboxDeliveryRefusalReasonSchema,
    message: z.string().min(1)
  })
  .strict();
export type SandboxDeliveryRefusal = z.infer<
  typeof SandboxDeliveryRefusalSchema
>;

/** One answer to a delivery request: authorized content or a refusal. */
export const SandboxModuleDeliveryResultSchema = z.union([
  AuthorizedSandboxModuleDeliverySchema,
  SandboxDeliveryRefusalSchema
]);
export type SandboxModuleDeliveryResult = z.infer<
  typeof SandboxModuleDeliveryResultSchema
>;

/** Build a refusal without repeating the shape at every call site. */
export function sandboxDeliveryRefusal(
  reason: SandboxDeliveryRefusalReason,
  message: string
): SandboxDeliveryRefusal {
  return { authorized: false, reason, message };
}

/** Install modes returned by Electron before package lifecycle scripts run. */
export const NodePackInstallModeSchema = z.enum([
  "sandbox-only",
  "register",
  "hybrid",
  "unknown"
]);
export type NodePackInstallMode = z.infer<typeof NodePackInstallModeSchema>;

/** Immutable identity for the artifact npm wrote into the install root. */
export const NodePackArtifactIdentitySchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1).optional(),
    resolved: z.string().min(1).optional(),
    integrity: z.string().min(1).optional()
  })
  .strict();
export type NodePackArtifactIdentity = z.infer<
  typeof NodePackArtifactIdentitySchema
>;

/** Whether lifecycle scripts have run for an installed pack. */
export const NodePackScriptsStateSchema = z.enum(["skipped", "ran"]);
export type NodePackScriptsState = z.infer<typeof NodePackScriptsStateSchema>;

/**
 * Classification of an installed node pack.
 *
 * `active` is the host's own gate, not npm's: a sandbox-only pack is active as
 * soon as it installs, while a register or hybrid pack stays inactive until the
 * user approves trust and the integrity-checked rebuild runs.
 */
export const NodePackInstallStatusSchema = z
  .object({
    mode: NodePackInstallModeSchema,
    scripts: NodePackScriptsStateSchema,
    active: z.boolean(),
    artifact: NodePackArtifactIdentitySchema.optional(),
    reason: z.string().min(1).optional()
  })
  .strict();
export type NodePackInstallStatus = z.infer<typeof NodePackInstallStatusSchema>;

/**
 * One pack's row in the install ledger.
 *
 * `dependencies` is the lockfile identity of every package the pack's own
 * lifecycle scripts would run for. Trust approval compares the whole set
 * against the lockfile again before enabling scripts, because `--ignore-scripts`
 * suppressed the dependencies' scripts too.
 */
export const NodePackInstallRecordSchema = z
  .object({
    name: z.string().min(1),
    mode: NodePackInstallModeSchema,
    scripts: NodePackScriptsStateSchema,
    active: z.boolean(),
    artifact: NodePackArtifactIdentitySchema.optional(),
    reason: z.string().min(1).optional(),
    dependencies: z.array(NodePackArtifactIdentitySchema).optional(),
    installedAt: z.string().min(1).optional(),
    trustedAt: z.string().min(1).optional()
  })
  .strict();
export type NodePackInstallRecord = z.infer<typeof NodePackInstallRecordSchema>;

/** The on-disk ledger of what the host installed and what it authorized. */
export const NodePackLedgerSchema = z
  .object({
    version: z.literal(1),
    packs: z.record(z.string(), NodePackInstallRecordSchema)
  })
  .strict();
export type NodePackLedger = z.infer<typeof NodePackLedgerSchema>;

/** Result returned across the Electron IPC boundary for node-pack mutations. */
export const NodePackActionResultSchema = z
  .object({
    success: z.boolean(),
    message: z.string(),
    installation: NodePackInstallStatusSchema.optional()
  })
  .strict();
export type NodePackActionResult = z.infer<typeof NodePackActionResultSchema>;

/** Reduce a ledger row to the status shape the UI and IPC consume. */
export function nodePackInstallStatus(
  record: NodePackInstallRecord
): NodePackInstallStatus {
  const status: NodePackInstallStatus = {
    mode: record.mode,
    scripts: record.scripts,
    active: record.active
  };
  if (record.artifact !== undefined) {
    status.artifact = record.artifact;
  }
  if (record.reason !== undefined) {
    status.reason = record.reason;
  }
  return status;
}

export function normalizeSandboxSpecifier(
  packName: string,
  moduleName: string
): string {
  if (
    !PACKAGE_NAME.test(packName) ||
    !moduleNameSchema.safeParse(moduleName).success
  ) {
    throw new Error(`invalid sandbox module name: ${moduleName}`);
  }
  return moduleName === "." ? packName : `${packName}/${moduleName}`;
}

export type SandboxExportName = string | { wasm: string; as: string };
export { RESERVED_IDENTIFIERS };
