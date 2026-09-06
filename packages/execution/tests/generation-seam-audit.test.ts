/**
 * Every provider media call goes through the generation seam
 * (docs/media-generation-tracking-design.md § 9).
 *
 * A call to `provider.textToImage(...)` and its siblings outside
 * `packages/runtime/src/` is a generation nobody records: no row, no cost,
 * no asset link. This audit scans every package source tree for such a call
 * and fails on the first one that is not on the allow-list below. The list
 * is the debt, written down: the SDK-driven node packages (design § 8, S7)
 * and the surfaces that wrap their call in `runGenerationWith`.
 *
 * Modelled on `packages/runtime/tests/url-egress-audit.test.ts`: it also
 * asserts it found the allowed calls, so it cannot pass by matching nothing.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const PACKAGES = join(REPO_ROOT, "packages");
const BASE_PROVIDER = join(PACKAGES, "runtime/src/providers/base-provider.ts");

/** The media methods of `BaseProvider` a caller can reach without the seam. */
const MEDIA_METHODS = [
  "textToImage",
  "textToImages",
  "imageToImage",
  "imageToImages",
  "inpaint",
  "inpaintImages",
  "upscaleImage",
  "removeBackground",
  "segmentImage",
  "relightImage",
  "vectorizeImage",
  "textToSpeech",
  "textToSpeechEncoded",
  "textToMusic",
  "textToVideo",
  "imageToVideo",
  "videoToVideo",
  "lipSync",
  "textTo3D",
  "imageTo3D"
] as const;

/**
 * Files allowed to call a provider media method directly, each with why.
 * A new entry is a decision, not a fix: prefer `runGeneration` /
 * `runGenerationWith` on the context.
 */
const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
  // The seam itself.
  { file: "packages/runtime/src/context.ts", why: "the seam's dispatch" },
  // Wrapped in `runGenerationWith` (design § 8, S5/S6).
  {
    file: "packages/websocket/src/session/chat-turn.ts",
    why: "chat direct generation, inside runGenerationWith"
  },
  {
    file: "packages/websocket/src/session/inference.ts",
    why: "generate_media RPC, inside runGenerationWith"
  },
  {
    file: "packages/websocket/src/session/media-generation.ts",
    why:
      "generateSpeechBytes, extracted from the two entries above and still " +
      "called only from inside their run.generate() — which is " +
      "runGenerationWith"
  },
  {
    file: "packages/cli/src/commands/generate.ts",
    why: "nodetool generate, inside runGenerationWith"
  },
  {
    file: "packages/websocket/src/trpc/routers/segmentation.ts",
    why: "segmentation router, inside runGenerationWith"
  },
  // Fallback when a context carries no encoded-TTS method (a test double).
  {
    file: "packages/agents/src/capabilities/media.ts",
    why: "generate_speech fallback for a context without textToSpeechEncoded"
  },
  // Providers delegating to a sibling provider or their own methods.
  {
    file: "packages/runtime/src/providers/nodetool-provider.ts",
    why: "the managed provider delegates to the real one"
  }
];

const IGNORED_DIRS = new Set(["node_modules", "dist", "tests", "__tests__"]);

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      yield* sourceFiles(full);
    } else if (/\.(ts|tsx|mts)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      yield full;
    }
  }
}

function packageSourceFiles(): string[] {
  const files: string[] = [];
  for (const pkg of readdirSync(PACKAGES)) {
    const src = join(PACKAGES, pkg, "src");
    let isDir = false;
    try {
      isDir = statSync(src).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    files.push(...sourceFiles(src));
  }
  return files;
}

/** `provider.textToImage(` / `p.textToImages(` / `.textTo3D(` on any receiver. */
const CALL = new RegExp(`\\.(${MEDIA_METHODS.join("|")})\\(`, "g");

interface Hit {
  file: string;
  line: number;
  method: string;
}

function hitsIn(file: string): Hit[] {
  const text = readFileSync(file, "utf8");
  const hits: Hit[] = [];
  const lines = text.split("\n");
  lines.forEach((lineText, index) => {
    // A method definition (`override async textToImage(`) is not a call.
    if (/^\s*(override\s+)?(async\s+)?[a-zA-Z0-9_]+\s*\(/.test(lineText)) return;
    if (/^\s*\*|^\s*\/\//.test(lineText)) return;
    for (const match of lineText.matchAll(CALL)) {
      const receiver = lineText.slice(0, match.index ?? 0);
      // `this.textToImage(` inside a provider is the provider's own business.
      if (/this$/.test(receiver.trimEnd())) continue;
      // `context.textToSpeechEncoded(` / `ctx.textToMusic(` are the seam's
      // own encoded-audio entry points, not provider calls.
      if (/(context|ctx)$/.test(receiver.trimEnd())) continue;
      // `BaseProvider.prototype.textToSpeech` is an identity check, not a call.
      if (/prototype$/.test(receiver.trimEnd())) continue;
      hits.push({
        file: relative(REPO_ROOT, file),
        line: index + 1,
        method: match[1]
      });
    }
  });
  return hits;
}

describe("generation seam audit", () => {
  it("lists every media method BaseProvider declares", () => {
    const source = readFileSync(BASE_PROVIDER, "utf8");
    for (const method of MEDIA_METHODS) {
      expect(source, `BaseProvider no longer declares ${method}`).toMatch(
        new RegExp(`\\b${method}\\(`)
      );
    }
    // A method returning media bytes that this list does not know is a call
    // the audit would miss.
    const declared = new Set<string>();
    for (const match of source.matchAll(
      /^\s+(?:async\s+)?\*?([a-zA-Z0-9_]+)\([^)]*\)\s*:\s*(?:Promise<(?:Uint8Array(?:\[\])?|EncodedAudioResult(?:\s*\|\s*null)?)>|AsyncGenerator<StreamingAudioChunk>)/gm
    )) {
      declared.add(match[1]);
    }
    for (const method of declared) {
      expect(
        (MEDIA_METHODS as readonly string[]).includes(method),
        `BaseProvider.${method} returns media but is not in MEDIA_METHODS`
      ).toBe(true);
    }
  });

  it("finds no provider media call outside the seam and the allow-list", () => {
    const files = packageSourceFiles();
    expect(files.length).toBeGreaterThan(100);
    const providersDir = join("packages", "runtime", "src", "providers");
    const allowed = new Map(ALLOWED.map((entry) => [entry.file, entry.why]));
    const seenAllowed = new Set<string>();
    const violations: Hit[] = [];
    for (const file of files) {
      const rel = relative(REPO_ROOT, file);
      // Provider implementations call each other's and their own methods
      // (a delegate, a retry wrapper); the seam is above them.
      if (rel.startsWith(providersDir)) continue;
      for (const hit of hitsIn(file)) {
        if (allowed.has(hit.file)) {
          seenAllowed.add(hit.file);
          continue;
        }
        violations.push(hit);
      }
    }
    expect(
      violations,
      "Provider media calls outside the generation seam. Use context.runGeneration " +
        "or context.runGenerationWith, or add the file to ALLOWED with a reason:\n" +
        violations.map((v) => `  ${v.file}:${v.line} ${v.method}`).join("\n")
    ).toEqual([]);

    // The audit found what it expected to find; an allow-list entry that
    // matches nothing is stale, and a scan that matched nothing is broken.
    for (const entry of ALLOWED) {
      if (entry.file.startsWith(providersDir)) continue;
      expect(
        seenAllowed.has(entry.file),
        `ALLOWED entry ${entry.file} matched no call; remove it`
      ).toBe(true);
    }
  });
});
