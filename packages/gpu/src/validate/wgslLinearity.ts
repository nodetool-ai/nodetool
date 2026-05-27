/**
 * Load-time WGSL static validator for the premul-invariant `linearity` tag.
 *
 * Item 3 of the shader-pool invariant enforcement plan. Runs inside
 * {@link defineModule} after `tgpu.resolve(...)` and rejects modules whose
 * WGSL contradicts their declared {@link LinearityMode}. Failures are throws
 * so a misclassified module never reaches the registry.
 *
 * ## What it checks
 *
 * | `linearity`         | rule                                                                   |
 * |---------------------|------------------------------------------------------------------------|
 * | `"source"`          | skipped — no input to validate                                         |
 * | `"alpha-only"`      | output RGB must be literal zero (no `.r/.g/.b/.rgb` written to return) |
 * | `"linear-in-rgb"`   | flag nonlinear tokens (`pow|log|sqrt|step|smoothstep|floor|...`) on    |
 * |                     | the same line as a `.rgb` access                                       |
 * | `"nonlinear-in-rgb"`| must show the unpremul handshake (`unpremul` token, `.rgb /` divide,   |
 * |                     | or all inputs declared `alpha: "straight"`) whenever a sample variable |
 * |                     | is dereferenced with `.rgb`                                            |
 *
 * ## Brittleness — read before tightening
 *
 * Pure string analysis, no AST. The WGSL grammar is rich (block comments,
 * raw strings, multi-line expressions, identifier shadowing) and this scanner
 * cannot follow any of it. Concrete known limits:
 *
 * - **Line-level scope.** Co-occurrence rules ("`pow` and `.rgb` on the same
 *   line") miss multi-line expressions and over-trigger on dense lines.
 * - **Per-file unpremul check.** The nonlinear-in-rgb rule treats a single
 *   `unpremul` or `.rgb /` token anywhere in the file as the handshake — it
 *   does not prove the unpremul happens **before** the `.rgb` read. A shader
 *   that unpremuls at the end after using `.rgb` will spuriously pass.
 * - **Sample variable detection.** We look for `let X = textureSample(...)` /
 *   `let X = textureLoad(...)` (also `var X = ...`); only those `X.rgb`
 *   references are treated as "premul .rgb access". Direct `textureSample(...).rgb`
 *   without an intermediate name is also recognized. Params-field references
 *   like `p.color.rgb` are intentionally not flagged.
 * - **Block comments.** `/* … *​/` blocks are not stripped. A nonlinear token
 *   buried in a comment will be treated as code. Same-line `//` comments are
 *   preserved so the suppression token below works.
 *
 * False positives are the failure mode — they break the build. The suppression
 * token (`// premul: ok`) is the escape hatch. False negatives merely defer the
 * catch to the runtime debug pass.
 *
 * ## Suppression
 *
 * Add one of these tokens as a `//` comment on the same line as the offending
 * op to silence the validator for that line:
 *
 * - `// premul: ok`
 * - `// premul: linear-safe`
 * - `// premul: handled`
 *
 * Pair the suppression with a TODO comment when the underlying shader is
 * actually buggy (so the deferred work is still tracked).
 *
 * ## Cost
 *
 * Module-load-time: regex over a ~200-line string, done once per `defineModule`
 * call. Target: under 1 ms per module on modern hardware.
 *
 * ## Escape hatch
 *
 * Set `NODETOOL_GPU_VALIDATE=off` to disable the validator entirely. Useful for
 * hotfixes where a misclassified module must ship before the WGSL can be
 * corrected. Read once at module load via `globalThis.process?.env`.
 */

import type { InputContract, LinearityMode } from "../types.js";

/** Comment tokens that suppress a line-level violation. */
const SUPPRESSION_TOKENS = [
  "premul: ok",
  "premul: linear-safe",
  "premul: handled"
] as const;

/**
 * Tokens treated as nonlinear ops for the `linear-in-rgb` heuristic. The check
 * looks for any of these followed by `(` on the same line as a `.rgb` access.
 * `clamp` is intentionally absent — `clamp(x, 0, 1)` is a saturate (linear-safe).
 */
const NONLINEAR_TOKENS = [
  "pow",
  "log",
  "log2",
  "exp",
  "exp2",
  "sqrt",
  "smoothstep",
  "step",
  "floor",
  "ceil",
  "round",
  "trunc",
  "fract"
] as const;

const NONLINEAR_RE = new RegExp(`\\b(?:${NONLINEAR_TOKENS.join("|")})\\s*\\(`);
const RGB_RE = /\.rgb\b/;
// `[^=\n]+` keeps the optional type annotation from chewing across newlines —
// without the `\n` exclusion, `var source: texture_2d<f32>;` would greedily
// match past intervening lines until it found a later `= textureSample(...)`,
// polluting the sample-variable set with binding-declaration names.
const SAMPLE_DECL_RE =
  /\b(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::\s*[^=\n]+)?=\s*(?:textureSample|textureLoad)\b/g;

export interface LinearityValidationResult {
  ok: boolean;
  violations: string[];
}

export interface LinearityValidationArgs {
  id: string;
  linearity: LinearityMode;
  wgsl: string;
  inputs: Record<string, InputContract>;
}

/**
 * Read the env-flag once per process. `off` disables the validator entirely.
 * Anything else (including unset) leaves it enabled.
 */
function validatorDisabled(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  return env?.NODETOOL_GPU_VALIDATE === "off";
}

/** True if the line contains one of the suppression tokens in a `//` comment. */
function lineSuppressed(line: string): boolean {
  const slash = line.indexOf("//");
  if (slash === -1) return false;
  const comment = line.slice(slash).toLowerCase();
  return SUPPRESSION_TOKENS.some((token) => comment.includes(token));
}

/**
 * Find every variable name declared as `let X = textureSample(...)` or
 * `let X = textureLoad(...)` (also `var X = …`). Returned in declaration
 * order, deduplicated.
 */
function findSampleVariables(wgsl: string): Set<string> {
  const out = new Set<string>();
  for (const match of wgsl.matchAll(SAMPLE_DECL_RE)) {
    out.add(match[1]);
  }
  return out;
}

/**
 * True iff `line` reads `.rgb` from one of the named sample variables, or
 * directly off `textureSample(...).rgb` / `textureLoad(...).rgb`.
 */
function lineReadsSampleRgb(line: string, samples: Set<string>): boolean {
  // Direct textureSample(...).rgb / textureLoad(...).rgb.
  if (/\btexture(?:Sample|Load)\b[\s\S]*\)\s*\.rgb\b/.test(line)) {
    return true;
  }
  for (const name of samples) {
    // `\bNAME\.rgb\b` — matches `src.rgb` but not `p.color.rgb`.
    const re = new RegExp(`(?<![.\\w])${name}\\.rgb\\b`);
    if (re.test(line)) return true;
  }
  return false;
}

/**
 * Detect the `nonlinear-in-rgb` unpremul handshake at file scope. Returns
 * `true` if the module contains any plausible unpremul mechanism — token
 * `unpremul`, `.rgb /` divide pattern, or all inputs declared
 * `alpha: "straight"`.
 */
function hasUnpremulHandshake(
  wgsl: string,
  inputs: Record<string, InputContract>
): boolean {
  if (/unpremul/i.test(wgsl)) return true;
  if (/\.rgb\s*\/\s*/.test(wgsl)) return true;
  // Per-channel unpremul: `.r / a`, `.g / a`, `.b / a` patterns count too.
  if (/\.[rgb]\s*\/\s*[A-Za-z_]/.test(wgsl)) return true;
  const inputNames = Object.keys(inputs);
  if (inputNames.length === 0) return true; // no premul input to violate
  const allStraight = inputNames.every(
    (name) => inputs[name].alpha === "straight"
  );
  return allStraight;
}

/**
 * `alpha-only`: scan the WGSL for any `vec4f(...)` returned-as-output whose
 * first three components look non-zero. Permissive — only flags the obvious
 * `vec4f(src.rgb, ...)` / `vec4f(src.r, src.g, src.b, ...)` shapes.
 */
function checkAlphaOnly(wgsl: string): string[] {
  const violations: string[] = [];
  const lines = wgsl.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineSuppressed(line)) continue;
    // Looking for `return vec4f(...)` or `textureStore(..., vec4...(...))`.
    if (!/\b(?:return|textureStore)\b/.test(line)) continue;
    // Strip out an inline comment so we don't false-positive on `// foo.rgb`.
    const code = stripLineComment(line);
    // `vec4<f32>(0.0, 0.0, 0.0, ...)` and `vec4f(0.0, 0.0, 0.0, ...)` are the
    // canonical zero-RGB form. Any other RGB shape is suspect.
    if (/\bvec4(?:<f32>|f)\s*\(\s*0(?:\.0+)?\s*,\s*0(?:\.0+)?\s*,\s*0(?:\.0+)?\s*,/.test(code)) {
      continue;
    }
    // `vec4f(0.0)` splats zero everywhere — also fine.
    if (/\bvec4(?:<f32>|f)\s*\(\s*0(?:\.0+)?\s*\)/.test(code)) continue;
    // No vec4 here at all — not the output line.
    if (!/\bvec4(?:<f32>|f)\s*\(/.test(code)) continue;
    // Has vec4 and isn't a known zero-RGB form: flag if it references RGB-bearing tokens.
    if (/\.rgb\b/.test(code) || /\.(?:r|g|b)\b/.test(code)) {
      violations.push(
        `line ${i + 1}: alpha-only module writes non-zero RGB to output (\`${line.trim()}\`)`
      );
    }
  }
  return violations;
}

/**
 * `linear-in-rgb`: flag any line that combines a nonlinear-op token with a
 * `.rgb` access. Heuristic, brittle on multi-line expressions; that's the
 * trade-off documented at the top of the file.
 */
function checkLinear(wgsl: string): string[] {
  const violations: string[] = [];
  const lines = wgsl.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineSuppressed(line)) continue;
    const code = stripLineComment(line);
    if (!RGB_RE.test(code)) continue;
    if (!NONLINEAR_RE.test(code)) continue;
    violations.push(
      `line ${i + 1}: linear-in-rgb module applies nonlinear op to \`.rgb\` (\`${line.trim()}\`)`
    );
  }
  return violations;
}

/**
 * `nonlinear-in-rgb`: the module must show the unpremul handshake whenever a
 * sample variable's `.rgb` is read. If no handshake exists at file scope and
 * any sample `.rgb` access is found, flag once per offending line.
 */
function checkNonlinear(
  wgsl: string,
  inputs: Record<string, InputContract>
): string[] {
  if (hasUnpremulHandshake(wgsl, inputs)) return [];
  const samples = findSampleVariables(wgsl);
  if (samples.size === 0 && !/\btexture(?:Sample|Load)\b[\s\S]*\.rgb\b/.test(wgsl)) {
    return [];
  }
  const violations: string[] = [];
  const lines = wgsl.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineSuppressed(line)) continue;
    const code = stripLineComment(line);
    if (!lineReadsSampleRgb(code, samples)) continue;
    violations.push(
      `line ${i + 1}: nonlinear-in-rgb module reads \`.rgb\` from a premul sample without an unpremul handshake (\`${line.trim()}\`)`
    );
  }
  if (violations.length === 0) return [];
  // Always include the file-level summary first so the error message names
  // the missing mechanism even when the per-line list is long.
  return [
    "module tagged `nonlinear-in-rgb` but no `unpremul` / `.rgb /` divide / all-straight-inputs handshake found",
    ...violations
  ];
}

/** Strip a trailing `// ...` comment so suppression tokens don't trip pattern matches. */
function stripLineComment(line: string): string {
  const slash = line.indexOf("//");
  if (slash === -1) return line;
  return line.slice(0, slash);
}

/**
 * Validate that the resolved WGSL is consistent with its declared
 * {@link LinearityMode}. Returns `{ ok, violations }`; the caller throws.
 */
export function validateWgslLinearity(
  args: LinearityValidationArgs
): LinearityValidationResult {
  if (validatorDisabled()) {
    return { ok: true, violations: [] };
  }

  const { linearity, wgsl, inputs } = args;

  let violations: string[] = [];
  switch (linearity) {
    case "source":
      // Generators have no premul input to violate; trust the source.
      break;
    case "alpha-only":
      violations = checkAlphaOnly(wgsl);
      break;
    case "linear-in-rgb":
      violations = checkLinear(wgsl);
      break;
    case "nonlinear-in-rgb":
      violations = checkNonlinear(wgsl, inputs);
      break;
    default: {
      // Exhaustiveness: a new mode without a check is a defect, not a silent pass.
      const _exhaustive: never = linearity;
      void _exhaustive;
    }
  }

  return { ok: violations.length === 0, violations };
}
