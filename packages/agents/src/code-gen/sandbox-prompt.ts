/**
 * Renders the sandbox manifest into the API-reference section of an authoring
 * prompt, and checks arbitrary instruction text against the same manifest.
 *
 * Pure functions — no I/O, so both the generator and the drift test can call
 * them.
 */
import {
  getSandboxManifest,
  type SandboxLimitDoc,
  type SandboxManifest,
  type SandboxMemberDoc
} from "./sandbox-manifest.js";

/**
 * Words that read as identifiers but are language syntax, so a reference to one
 * says nothing about the sandbox surface.
 */
const SYNTAX_IDENTIFIERS: ReadonlySet<string> = new Set([
  "await",
  "catch",
  "do",
  "else",
  "for",
  "function",
  "if",
  "new",
  "return",
  "switch",
  "throw",
  "try",
  "typeof",
  "while",
  "yield"
]);

function formatValue(limit: SandboxLimitDoc): string {
  if (limit.unit === "bytes") {
    // Only the exact powers of two get a KB/MB label; the decimal constants
    // stay literal rather than rounding into a number that isn't the limit.
    if (limit.value % (1024 * 1024) === 0)
      return `${limit.value / (1024 * 1024)} MB`;
    if (limit.value % 1024 === 0) return `${limit.value / 1024} KB`;
    return `${limit.value.toLocaleString("en-US")} bytes`;
  }
  if (limit.unit === "ms") {
    return limit.value >= 1000 ? `${limit.value / 1000} s` : `${limit.value} ms`;
  }
  if (limit.unit === "count") return limit.value.toLocaleString("en-US");
  return `${limit.value.toLocaleString("en-US")} ${limit.unit}`;
}

function memberLine(member: SandboxMemberDoc): string {
  const flags: string[] = [];
  if (member.requiresContext) flags.push("needs a workspace context");
  if (member.requiresProgressSink) flags.push("no-op when nothing listens");
  const suffix = flags.length > 0 ? ` [${flags.join("; ")}]` : "";
  return `- ${member.signature}\n  ${member.description}${suffix}`;
}

/**
 * Render the manifest as markdown for a system prompt or the Code Node help
 * text.
 */
export function renderSandboxApiReference(
  manifest: SandboxManifest = getSandboxManifest()
): string {
  const sections: string[] = [];

  sections.push(
    // The node type is deliberately not printed: it reads as a dotted API
    // reference and the manifest already carries it for callers.
    `# Sandbox API — Code node\n\nCode runs in a ${manifest.runtime} sandbox. Only the names below exist.`
  );

  sections.push(
    `## Rules\n${manifest.notes.map((n) => `- ${n.text}`).join("\n")}`
  );

  const bridgeBlocks: string[] = [];
  for (const bridge of Object.values(manifest.bridges)) {
    if (bridge.internal || bridge.members.length === 0) continue;
    bridgeBlocks.push(
      `### ${bridge.name}\n${bridge.description}\n${bridge.members
        .map(memberLine)
        .join("\n")}`
    );
  }
  sections.push(`## Host bridges\n\n${bridgeBlocks.join("\n\n")}`);

  sections.push(
    `## Guest helpers\n${Object.values(manifest.guestHelpers)
      .map(memberLine)
      .join("\n")}`
  );

  sections.push(
    `## Built-ins\n${manifest.nativeGlobals.join(", ")}\n\nNot available: ${manifest.blockedGlobals.join(
      ", "
    )}`
  );

  sections.push(
    `## Limits\n${manifest.limits
      .map((limit) => {
        const ceiling =
          limit.ceiling !== undefined && limit.ceiling !== limit.value
            ? ` (raisable to ${formatValue({ ...limit, value: limit.ceiling })})`
            : "";
        return `- ${limit.description}: ${formatValue(limit)}${ceiling}`;
      })
      .join("\n")}`
  );

  return sections.join("\n\n");
}

/**
 * Identifier-like API references in a block of instruction text: bare calls
 * (`sleep(`) and dotted access (`workspace.read`). Returns the root name of each,
 * which is what has to exist in the sandbox.
 */
export function extractApiReferences(text: string): string[] {
  const found = new Set<string>();
  const ident = "[A-Za-z_$][A-Za-z0-9_$]*";
  // Dotted access first, so `workspace.read(` is credited to `workspace`.
  for (const m of text.matchAll(new RegExp(`\\b(${ident})\\.(${ident})`, "g"))) {
    found.add(m[1]);
  }
  // A call with no space before the paren. Prose writes "text (note)" with a
  // space, so requiring the tight form keeps ordinary sentences out.
  for (const m of text.matchAll(new RegExp(`(^|[^.\\w$])(${ident})\\(`, "g"))) {
    found.add(m[2]);
  }
  for (const word of SYNTAX_IDENTIFIERS) found.delete(word);
  return [...found];
}

/**
 * API references in `text` that the sandbox does not provide. A non-empty
 * result means the text promises the model something that will throw at
 * runtime.
 */
export function unknownApiReferences(
  text: string,
  manifest: SandboxManifest = getSandboxManifest()
): string[] {
  const known = new Set<string>([
    ...manifest.nativeGlobals,
    ...manifest.blockedGlobals,
    ...manifest.nodeGlobals,
    ...Object.keys(manifest.bridges),
    ...Object.keys(manifest.guestHelpers)
  ]);
  return extractApiReferences(text).filter((name) => !known.has(name));
}
