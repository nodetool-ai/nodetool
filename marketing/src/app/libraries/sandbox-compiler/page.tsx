import React from "react";
import MarketingFacts, {
  type MarketingFact,
} from "../../../components/MarketingFacts";
import MarketingPageShell from "../../../components/MarketingPageShell";
import CodeBlock from "../../../components/developers/CodeBlock";
import {
  LibraryFooterNote,
  LibraryHero,
  LibraryQuestions,
  LibrarySection,
  inlineCode,
  type LibraryQuestion,
} from "../../../components/libraries/LibraryParts";

const PACKAGE = "@nodetool-ai/sandbox-compiler";
const SOURCE =
  "https://github.com/nodetool-ai/nodetool/tree/main/packages/sandbox-compiler";

const heroCode = `import {
  bundleNpmModule,
  scanBundle,
  probeBundle,
} from "@nodetool-ai/sandbox-compiler";

// Resolve the package from this directory's node_modules.
const bundled = await bundleNpmModule(process.cwd(), "js-yaml");
if (bundled.status === "failed") {
  throw new Error(\`\${bundled.failure.code}: \${bundled.failure.message}\`);
}

const { source, bytes } = bundled.result;
const scan = scanBundle(source);         // { errors, warnings, rejection? }
const verdict = await probeBundle(source); // { ok, exports, error?, logs }

console.log(bytes, scan.errors.length, verdict.ok, verdict.exports.length);`;

const scanCode = `// error: a free reference to a global the guest lacks
export const bytes = Buffer.from("hi");

// error: no typeof guard, so this throws in the guest
export const parse = window && window.parseInt;

// nothing: \`process\` is a parameter here, not the global
export function argv(process) { return process.argv; }

// warning: the module checks before it uses it
export const later = typeof setTimeout === "function"
  ? (fn) => setTimeout(fn, 0)
  : (fn) => fn();`;

const measured: {
  name: string;
  version: string;
  size: string;
  inputs: string;
  verdict: string;
  admitted: boolean;
}[] = [
  { name: "date-fns", version: "4.4.0", size: "175.6 KB", inputs: "305", verdict: "Admitted, 250 exports", admitted: true },
  { name: "js-yaml", version: "4.3.0", size: "101.4 KB", inputs: "2", verdict: "Admitted, 15 exports", admitted: true },
  { name: "fflate", version: "0.8.3", size: "60.8 KB", inputs: "2", verdict: "Admitted, 49 exports. Warns on queueMicrotask and setTimeout, both guarded.", admitted: true },
  { name: "zod", version: "4.4.3", size: "483.3 KB", inputs: "80", verdict: "Scan error: const F = Function (×2), used for compiled validators", admitted: false },
  { name: "fast-xml-parser", version: "5.7.3", size: "142.1 KB", inputs: "27", verdict: "Scan error: window && window.parseInt (×3), no typeof guard", admitted: false },
  { name: "diff", version: "4.0.4", size: "35.1 KB", inputs: "2", verdict: "Scan error: setTimeout (×2)", admitted: false },
  { name: "papaparse", version: "5.5.3", size: "—", inputs: "—", verdict: "Bundle failed: imports node:stream", admitted: false },
  { name: "cheerio", version: "1.2.0", size: "—", inputs: "—", verdict: "Bundle failed: imports 25 Node builtins", admitted: false },
];

const stages: { title: string; body: React.ReactNode }[] = [
  {
    title: "Bundle",
    body: (
      <>
        esbuild with <code className={inlineCode}>platform: &quot;neutral&quot;</code>,
        ESM output, target ES2022, no externals and no minification. Export
        conditions are pinned to <code className={inlineCode}>import</code>,{" "}
        <code className={inlineCode}>module</code>,{" "}
        <code className={inlineCode}>default</code>. Neither{" "}
        <code className={inlineCode}>node</code> nor{" "}
        <code className={inlineCode}>browser</code> is set, so a
        package&apos;s most portable build wins. An import of a Node builtin
        fails here, by name.
      </>
    ),
  },
  {
    title: "Scan",
    body: (
      <>
        An acorn walk of the bundle that tracks scopes. A free reference to a
        global the guest does not have is an error. A shadowed name is not a
        reference. A name the module feature-detects, inside{" "}
        <code className={inlineCode}>typeof</code> or a branch guarded by one,
        is a warning. Dynamic <code className={inlineCode}>import()</code> is
        rejected.
      </>
    ),
  },
  {
    title: "Probe",
    body: (
      <>
        The bundle is imported in a real QuickJS-ng context with no fetch, no
        filesystem, no environment and no host bridges. It gets 5 seconds, a
        64 MB heap, a 1 MB stack and 20 log lines of 500 characters. The result
        is the list of exports the module produced, or the error it threw.
      </>
    ),
  },
];

const cacheFacts: MarketingFact[] = [
  {
    term: "Keyed by content, not name@version",
    description:
      "The key hashes every input file esbuild read, the esbuild version, the compiler's contract version and the build options. A linked package, a transitive update or a lockfile change all produce a new key while the version string stays the same.",
  },
  {
    term: "A warm hit skips the probe",
    description:
      "The cached entry stores the scan report and the probe verdict with the bundle, so a second run starts no QuickJS context.",
  },
  {
    term: "Atomic writes",
    description:
      "Entries are written to a temp file and renamed. A key must match ^[a-f0-9]{64}$ before it becomes a path.",
  },
];

const skips: { code: string; meaning: string }[] = [
  { code: "npm-module-builtin-import", meaning: "Imports node:fs, node:stream or another builtin." },
  { code: "npm-module-unresolved", meaning: "The package or one of its imports does not resolve." },
  { code: "npm-module-too-large", meaning: "The bundle is over 1 MB." },
  { code: "npm-module-forbidden-global", meaning: "The scan found a free reference to a missing global." },
  { code: "npm-module-scan-rejected", meaning: "The bundle does not parse, or uses dynamic import()." },
  { code: "npm-module-probe-failed", meaning: "The module threw or timed out while initializing." },
];

const questions: LibraryQuestion[] = [
  {
    question: "Why not run the package in QuickJS and catch the error?",
    answer:
      "Initialization only runs the top level. A reference to setTimeout inside a function that runs on the third call passes that test and fails in production. The scan reads every path and names the line. The probe then catches what static reading misses, such as a top-level throw.",
  },
  {
    question: "Which globals count as missing?",
    answer: (
      <>
        The list matches NodeTool&apos;s guest: Node globals such as{" "}
        <code className={inlineCode}>process</code>,{" "}
        <code className={inlineCode}>Buffer</code> and{" "}
        <code className={inlineCode}>require</code>,{" "}
        <code className={inlineCode}>eval</code> and{" "}
        <code className={inlineCode}>Function</code>, timers,{" "}
        <code className={inlineCode}>WebAssembly</code>, and DOM names. It is
        exported as <code className={inlineCode}>FORBIDDEN_GLOBALS</code>. It
        is not configurable yet, so a guest that provides timers would reject
        packages it could run.
      </>
    ),
  },
  {
    question: "Does an admitted package work?",
    answer:
      "It initializes and it references nothing the guest lacks. That does not prove every export behaves. The probe lists the exports. It does not call them.",
  },
  {
    question: "Why 1 MB?",
    answer:
      "The cap was set after measuring the table above. The largest bundle was zod at 483 KB, and the largest admitted one was date-fns at 176 KB.",
  },
  {
    question: "What does it depend on?",
    answer: (
      <>
        esbuild, acorn and the QuickJS-ng WebAssembly build. It also depends on{" "}
        <code className={inlineCode}>@nodetool-ai/node-sdk</code> for its
        result types and on a NodeTool config package for the cache directory,
        which <code className={inlineCode}>NODETOOL_CACHE_DIR</code>{" "}
        overrides. The higher-level{" "}
        <code className={inlineCode}>compileNpmModule</code> expects a NodeTool
        sandbox pack directory. The three functions above do not.
      </>
    ),
  },
];

export default function SandboxCompilerLibraryPage() {
  return (
    <MarketingPageShell>
      <LibraryHero
        id="sandbox-compiler-title"
        packageName={PACKAGE}
        title="Check whether an npm package runs in QuickJS before you load it."
        lead={
          <p>
            Bundle a package with esbuild, scan the bundle for globals a
            QuickJS guest does not have, then import it in an empty QuickJS
            context. You get a named reason for every rejection and the export
            list for every package that passes.
          </p>
        }
        links={[
          { label: "Source", href: SOURCE, event: "Star GitHub" },
          {
            label: "npm",
            href: "https://www.npmjs.com/package/@nodetool-ai/sandbox-compiler",
            event: "Open Docs",
          },
          {
            label: "Sandbox docs",
            href: "https://docs.nodetool.ai/javascript-sandbox",
            event: "Open Docs",
          },
        ]}
        facts={["TypeScript", "Node 22+", "esbuild", "acorn", "QuickJS-ng"]}
      >
        <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950">
          <CodeBlock code={heroCode} language="typescript" />
        </div>
      </LibraryHero>

      <LibrarySection
        id="measured"
        eyebrow="Measured"
        title="Eight popular packages, three admitted."
        lead={
          <p>
            Bundled with esbuild 0.28.1 and the options below. Every rejection
            names code that would throw in the guest at that line.
          </p>
        }
      >
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">Package</th>
                <th scope="col" className="px-4 py-3 font-medium">Version</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Bundle</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Inputs</th>
                <th scope="col" className="px-4 py-3 font-medium">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {measured.map((row) => (
                <tr key={row.name}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-jetbrains text-slate-100">
                    {row.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-jetbrains text-slate-400">
                    {row.version}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-jetbrains text-slate-300">
                    {row.size}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-jetbrains text-slate-300">
                    {row.inputs}
                  </td>
                  <td
                    className={
                      row.admitted
                        ? "px-4 py-2.5 text-emerald-300"
                        : "px-4 py-2.5 text-slate-300"
                    }
                  >
                    {row.verdict}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LibrarySection>

      <LibrarySection
        id="pipeline"
        eyebrow="Pipeline"
        title="Bundling proves the imports resolve. Nothing more."
        lead={
          <p>
            So there are three stages. Each one can end the run with a named
            result instead of an exception.
          </p>
        }
      >
        <ol className="grid gap-4 md:grid-cols-3">
          {stages.map((stage, index) => (
            <li
              key={stage.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6"
            >
              <span className="font-jetbrains text-sm text-emerald-300">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-lg font-semibold text-white">
                {stage.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {stage.body}
              </p>
            </li>
          ))}
        </ol>
      </LibrarySection>

      <LibrarySection
        id="scan"
        eyebrow="Scope-aware scan"
        title="Text search cannot tell these four apart."
        lead={
          <p>
            The scan resolves each name against the scopes around it before it
            reports. It also reads <code className={inlineCode}>typeof</code>{" "}
            guards, so a package that checks for a timer before using it is
            admitted with a warning.
          </p>
        }
      >
        <div className="overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950">
          <CodeBlock code={scanCode} language="typescript" />
        </div>
      </LibrarySection>

      <LibrarySection
        id="skips"
        eyebrow="Results"
        title="Six ways to fail, each with a name."
      >
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <tbody className="divide-y divide-slate-800">
              {skips.map((skip) => (
                <tr key={skip.code}>
                  <td className="whitespace-nowrap px-4 py-2.5 font-jetbrains text-slate-100">
                    {skip.code}
                  </td>
                  <td className="px-4 py-2.5 text-slate-300">{skip.meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LibrarySection>

      <LibrarySection
        id="cache"
        eyebrow="Cache"
        title="A version number is not a cache key."
      >
        <MarketingFacts items={cacheFacts} />
      </LibrarySection>

      <LibrarySection
        id="questions"
        eyebrow="Questions"
        title="Limits and trade-offs."
      >
        <LibraryQuestions items={questions} />
      </LibrarySection>

      <LibraryFooterNote sourceHref={SOURCE} packageName={PACKAGE}>
        <p>
          NodeTool runs user and agent JavaScript in a QuickJS sandbox. Packs
          can expose an npm package to that sandbox by naming it in their
          manifest, and this compiler decides whether the package is admitted.
          It is MIT licensed.
        </p>
      </LibraryFooterNote>
    </MarketingPageShell>
  );
}
