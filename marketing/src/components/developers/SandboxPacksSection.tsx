"use client";
import React from "react";
import { motion } from "framer-motion";
import { Package, ServerCog, ShieldAlert } from "lucide-react";
import CodeBlock from "./CodeBlock";

const sectionContainer = "mx-auto max-w-7xl px-6 lg:px-8";

const importCode = `import yaml from "@nodetool-ai/sandbox-yaml";
import { sigv4 } from "@nodetool-ai/sandbox-aws";

// -aws signs the request. It never sends one: the guest passes the
// signed headers to its own fetch, so the run's cap and its SSRF
// guard still apply.
const signed = await sigv4({
  method: "GET",
  url: \`https://\${inputs.bucket}.s3.us-east-1.amazonaws.com/\${inputs.key}\`,
  region: "us-east-1",
  service: "s3",
  accessKeyId: await nodetool.secrets.get("AWS_ACCESS_KEY_ID"),
  secretAccessKey: await nodetool.secrets.get("AWS_SECRET_ACCESS_KEY")
});

const res = await fetch(signed.url, {
  method: signed.method,
  headers: signed.headers
});
await output("config", yaml.load(await res.text()));`;

const guestPacks = [
  "dates", "yaml", "markdown", "qr", "color", "decimal", "jmespath",
  "stats", "rrule", "gif", "dsl", "flow",
];

const hostPacks = [
  "csv", "html", "xml", "xlsx", "diff", "zip", "ocr", "tfjs", "docx",
  "mammoth", "epub", "fabric", "pdflib", "pptxgen", "pptx", "pdf", "chrono",
  "exif", "expr", "ics", "subtitle", "tokens", "aws", "notion", "supabase",
  "twilio",
];

const rules = [
  {
    icon: Package,
    title: "A pack is two declarative files",
    body:
      "A package.json manifest and a SKILL.md. No shipped pack authors a line of code — the compiler bundles the npm dependency into the guest, cached by content digest, never by version.",
  },
  {
    icon: ServerCog,
    title: "Host-side when the guest cannot hold it",
    body:
      "zip runs on the host because a 50 MB inflation cap enforced inside the guest is enforced by code the guest can decline to call. tfjs, because model weights outlive a run and outsize the 64 MB heap.",
  },
  {
    icon: ShieldAlert,
    title: "A pack cannot bring host code",
    body:
      "kind: \"host\" carries an id, never an implementation, and the id resolves only if a first-party table pins that exact package to it. The per-run dispatcher re-checks on every call.",
  },
];

export default function SandboxPacksSection() {
  return (
    <section id="packs" aria-labelledby="packs-title" className="rhythm-section relative">
      <div className={sectionContainer}>
        <div className="text-center mb-16">
          <motion.span
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-1.5 text-sm font-medium text-amber-300 ring-1 ring-inset ring-amber-500/20 mb-4"
          >
            <Package className="h-4 w-4" />
            Sandbox packs
          </motion.span>
          <motion.h2
            id="packs-title"
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="text-3xl sm:text-4xl font-bold text-white"
          >
            38 libraries, available out of the box
          </motion.h2>
          <motion.p
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="mt-4 text-lg text-slate-400 max-w-3xl mx-auto"
          >
            There is no library global and no second route. A body declares what
            it needs by importing it, and the packs those imports name are
            resolved against the installed catalog before the guest starts — so
            an import nobody serves fails the node, not the run.
          </motion.p>
        </div>

        <div className="grid gap-8 lg:grid-cols-5 items-start">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-3 min-w-0"
          >
            <CodeBlock code={importCode} language="typescript" />
          </motion.div>

          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.25, delay: 0.05 }}
            className="lg:col-span-2 space-y-5"
          >
            <div className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50">
              <h3 className="text-sm font-semibold text-teal-300">
                Compiled into the guest
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                esbuild bundle, scope-aware scan, QuickJS admission probe
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {guestPacks.map((p) => (
                  <span
                    key={p}
                    className="rounded-md bg-teal-500/10 px-2.5 py-1 font-mono text-xs text-teal-200 ring-1 ring-teal-500/20"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50">
              <h3 className="text-sm font-semibold text-violet-300">
                Run on the host, reached through a generated facade
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Needs Node builtins, a DOM, or a limit the guest could not
                enforce on itself
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {hostPacks.map((p) => (
                  <span
                    key={p}
                    className="rounded-md bg-violet-500/10 px-2.5 py-1 font-mono text-xs text-violet-200 ring-1 ring-violet-500/20"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {rules.map((rule, idx) => (
            <motion.div
              key={rule.title}
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: idx * 0.05 }}
              className="rounded-2xl bg-slate-800/40 p-6 ring-1 ring-slate-700/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
                <rule.icon className="h-5 w-5 text-amber-400" />
              </div>
              <h4 className="mt-4 font-semibold text-white">{rule.title}</h4>
              <p className="mt-2 text-sm text-slate-400">{rule.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
