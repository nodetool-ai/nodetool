/**
 * CodeAct API-surface eval tests — scripted provider, real QuickJS sandbox,
 * real `nodetool.*` prelude, no network. Every solution below drives the
 * object model rather than `tools.*`, so a mismatch between what a wrapper
 * sends and what the fake belt tool expects fails here.
 */
import { describe, it, expect } from "vitest";
import { runCodeActEval } from "../src/evals/codeact-eval.js";
import {
  CODEACT_API_SURFACE_CASES,
  createSurfaceApiTools
} from "../src/evals/codeact-api-surfaces.js";
import { createCodeActRecorder } from "../src/evals/codeact-cases.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ToolCall
} from "@nodetool-ai/runtime";

/** Provider that answers every case with a scripted list of code actions. */
function createScriptedLoopProvider(actionsByCall: string[][]): BaseProvider {
  let call = 0;
  return {
    provider: "fake",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: Array<{
        name: string;
        execute?: (a: Record<string, unknown>) => Promise<string | unknown>;
      }>;
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const actions = actionsByCall[call++] ?? [];
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let idx = 0;
      for (const code of actions) {
        if (args.signal?.aborted) break;
        const tc: ToolCall = {
          id: `tc_${call}_${idx++}`,
          name: "execute_code",
          args: { code }
        };
        yield tc;
        const tool = toolMap.get(tc.name);
        const content = tool?.execute ? await tool.execute(tc.args) : "";
        yield {
          type: "message",
          message: {
            role: "tool",
            toolCallId: tc.id,
            content:
              typeof content === "string" ? content : JSON.stringify(content)
          }
        };
      }
      yield { type: "chunk", content: "", done: true };
    }
  } as unknown as BaseProvider;
}

const SOLUTIONS: Record<string, string[]> = {
  "rag-index-and-answer": [
    `const docs = await nodetool.collections.query(
       "handbook", "refund window shipping warranty policy", {n_results: 10});
     for (const d of docs.results) {
       await nodetool.collections.index(d.text, d.id);
     }
     const hits = await nodetool.collections.search("refund window days", {n_results: 3});
     const top = hits.results[0];
     const m = top.text.match(/(\\d+) days/);
     await finish({sourceId: top.source_id, days: Number(m[1])});`
  ],
  "memory-lifecycle": [
    `const saved = await nodetool.memory.save(
       "The house image model is fal_ai/flux/schnell",
       {title: "preferred image model"});
     await nodetool.memory.update(saved.memory_id, {
       content: "The house image model is fal_ai/flux/dev"});
     const listed = await nodetool.memory.list({limit: 20});
     let mine = null;
     for (const m of listed.memories) {
       if (m.memory_id === saved.memory_id) mine = m;
     }
     await finish({
       memoryId: saved.memory_id,
       content: mine.content,
       total: listed.memories.length
     });`
  ],
  "threads-recall": [
    `const listed = await nodetool.threads.list({limit: 10});
     let threadId = null;
     for (const t of listed.threads) {
       if (t.title.toLowerCase().indexOf("banner") >= 0) threadId = t.id;
     }
     const thread = await nodetool.threads.get(threadId);
     let messageId = null;
     for (const m of thread.messages) {
       if (m.tool_calls && m.tool_calls.length > 0) messageId = m.id;
     }
     const full = await nodetool.threads.message(messageId);
     await finish({
       threadId: threadId,
       model: full.tool_calls[0].args.model
     });`
  ],
  "shared-handoff": [
    `const listed = await nodetool.shared.list();
     let pricingKey = null;
     for (const e of listed.entries) {
       if (e.key.indexOf("pricing") >= 0) pricingKey = e.key;
     }
     const read = await nodetool.shared.read([pricingKey]);
     const monthly = read.entries[pricingKey].value.monthly_usd;
     const annual = monthly * 12;
     const published = await nodetool.shared.publish("annual_price", annual,
       {title: "Annual price"});
     await finish({
       monthlyUsd: monthly,
       annualUsd: annual,
       publishedKey: published.key
     });`
  ],
  "web-research-brief": [
    `const hits = await nodetool.web.search("NodeTool 4.2 release notes");
     const page = await nodetool.web.browse(hits.results[0].url);
     const v = page.text.match(/NodeTool (\\d+\\.\\d+)/);
     await finish({
       url: page.url,
       version: v[1],
       sandbox: /quickjs/i.test(page.text) ? "QuickJS" : "unknown"
     });`
  ],
  "document-extraction-pipeline": [
    `const doc = await nodetool.documents.extractText("reports/q3.pdf");
     const tables = await nodetool.documents.extractTables(
       "reports/q3.pdf", "reports/q3-tables.json");
     const md = await nodetool.documents.pdfToMarkdown(
       "reports/q3.pdf", "reports/q3.md");
     const m = doc.text.match(/([0-9,]+) accounts/);
     await finish({
       accounts: Number(m[1].replace(/,/g, "")),
       tableRows: tables.rows,
       markdownFile: md.output_file
     });`
  ],
  "timeline-fix-and-validate": [
    `const before = await nodetool.timelines.validate("tl_promo");
     const snap = await nodetool.timelines.snapshot("tl_promo", {name: "before repair"});
     await nodetool.timelines.edit("tl_promo", [
       {op: "add_track", type: "text", id: before.issues[0].track, name: "Text"}
     ]);
     const after = await nodetool.timelines.validate("tl_promo");
     const state = await nodetool.timelines.edit("tl_promo", [{op: "get_state"}]);
     await finish({
       issuesBefore: before.issues.length,
       issuesAfter: after.issues.length,
       trackCount: state.document.tracks.length,
       snapshotVersion: snap.version
     });`
  ],
  "sketch-layer-repair": [
    `const before = await nodetool.sketches.validate("img_cover");
     await nodetool.sketches.edit("img_cover", [
       {op: "add_layer", name: "Glow", opacity: 0.4, blendMode: "multiply"},
       {op: "set_active_layer", target: "Glow"}
     ]);
     const after = await nodetool.sketches.validate("img_cover");
     const state = await nodetool.sketches.edit("img_cover", [{op: "get_state"}]);
     let glow = null;
     for (const l of state.document.layers) {
       if (l.name === "Glow") glow = l;
     }
     await finish({
       issuesBefore: before.issues.length,
       issuesAfter: after.issues.length,
       layerCount: state.document.layers.length,
       glowOpacity: glow.opacity,
       activeLayerId: state.document.activeLayerId
     });`
  ],
  "script-voice-and-assemble": [
    `const script = await nodetool.scripts.get("scr_intro");
     const pending = [];
     for (const line of script.lines) {
       if (line.status !== "voiced") pending.push(line.id);
     }
     const voiced = await nodetool.scripts.voice("scr_intro", {targets: pending});
     const timeline = await nodetool.scripts.assembleTimeline("scr_intro");
     await finish({
       voiced: voiced.voiced.slice().sort(),
       clips: timeline.clips,
       timelineId: timeline.timeline_id
     });`
  ],
  "storyboard-render-and-assemble": [
    `await nodetool.storyboards.renderStills("sb_lighthouse");
     await nodetool.storyboards.renderClips("sb_lighthouse");
     const cut = await nodetool.storyboards.assembleTimeline("sb_lighthouse");
     const board = await nodetool.storyboards.get("sb_lighthouse");
     let withClips = 0;
     for (const shot of board.shots) {
       if (shot.has_clip) withClips++;
     }
     await finish({
       shotsWithClips: withClips,
       timelineId: cut.timeline_id,
       durationSeconds: cut.duration_seconds
     });`
  ],
  "settings-and-credentials": [
    `const before = await nodetool.settings.secrets();
     const missingBefore = before.secrets
       .filter((s) => !s.configured)
       .map((s) => s.key);
     await nodetool.settings.set("AUTOSAVE_ENABLED", "false");
     await nodetool.settings.requestSecret("STRIPE_API_KEY", {
       reason: "to look up invoices in Stripe"});
     const after = await nodetool.settings.secrets();
     const autosave = await nodetool.settings.get("AUTOSAVE_ENABLED");
     await finish({
       autosave: autosave.value,
       missingBefore,
       stripeReady: after.secrets.some(
         (s) => s.key === "STRIPE_API_KEY" && s.configured)
     });`
  ],
  "email-triage": [
    `const found = await nodetool.email.search({subject: "invoice", since_hours_ago: 48});
     const ids = found.messages.map((m) => m.message_id).sort();
     for (const id of ids) {
       await nodetool.email.label(id, "billing");
     }
     const archived = await nodetool.email.archive(ids);
     const again = await nodetool.email.search({subject: "invoice", since_hours_ago: 48});
     await finish({
       labeled: ids,
       archived: archived.archived,
       remaining: again.messages.length
     });`
  ],
  "style-aware-app-check": [
    `const profile = await nodetool.style.profile();
     const dbg = await nodetool.apps.debug("app_notes", {run: false});
     const pref = await nodetool.style.record(
       "Likes the dark, high-contrast variant of the note app", {chosen: "dark"});
     await finish({
       verdictOk: dbg.verdict.ok,
       ran: dbg.ran,
       widgets: dbg.widgets.length,
       preferences: pref.total
     });`
  ]
};

const caseById = (id: string) => {
  const found = CODEACT_API_SURFACE_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no case "${id}"`);
  return found;
};

async function runOne(id: string) {
  const provider = createScriptedLoopProvider([SOLUTIONS[id] ?? []]);
  const report = await runCodeActEval({
    provider,
    model: "scripted",
    cases: [caseById(id)]
  });
  return report.cases[0];
}

describe("codeact nodetool API surface cases", () => {
  it("every case's required tools are on the belt the factory builds", () => {
    const names = new Set(
      createSurfaceApiTools(createCodeActRecorder()).map((tool) => tool.name)
    );
    for (const evalCase of CODEACT_API_SURFACE_CASES) {
      for (const required of evalCase.expect.requiredTools ?? []) {
        expect(names.has(required), `${evalCase.id}: ${required}`).toBe(true);
      }
      expect(evalCase.createTools).toBe(createSurfaceApiTools);
      expect(evalCase.namespaces?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("the RAG round trip scores 1.0 through nodetool.collections", async () => {
    const result = await runOne("rag-index-and-answer");
    expect(result.accepted, JSON.stringify(result.checks)).toBe(true);
    expect(result.score).toBe(1);
  });

  it("the timeline repair scores 1.0 through nodetool.timelines", async () => {
    const result = await runOne("timeline-fix-and-validate");
    expect(result.accepted, JSON.stringify(result.checks)).toBe(true);
    expect(result.score).toBe(1);
  });

  it("the storyboard render scores 1.0 through nodetool.storyboards", async () => {
    const result = await runOne("storyboard-render-and-assemble");
    expect(result.accepted, JSON.stringify(result.checks)).toBe(true);
    expect(result.score).toBe(1);
  });

  it("every case is satisfiable by a scripted run and scores 1.0", async () => {
    const provider = createScriptedLoopProvider(
      CODEACT_API_SURFACE_CASES.map((c) => SOLUTIONS[c.id] ?? [])
    );
    const report = await runCodeActEval({
      provider,
      model: "scripted",
      cases: CODEACT_API_SURFACE_CASES
    });
    for (const result of report.cases) {
      expect(
        result.accepted,
        `${result.caseId}: ${JSON.stringify(result.checks)}`
      ).toBe(true);
      expect(result.score).toBe(1);
    }
    expect(report.summary.successRate).toBe(1);
  }, 60_000);

  it("each case gets its own world — state does not leak between runs", async () => {
    const first = await runOne("memory-lifecycle");
    const second = await runOne("memory-lifecycle");
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
  });

  it("nodetool.web.search runs through the routed web_search tool", async () => {
    const result = await runOne("web-research-brief");
    expect(result.accepted, JSON.stringify(result.checks)).toBe(true);
  });
});
