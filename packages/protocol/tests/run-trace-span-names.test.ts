/**
 * Every span the code opens under a literal name must be declared metadata.
 * An undeclared name is stored as owner content, so external sinks and
 * retained summaries see `content.span` with no attributes in its place.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isMetadataTraceSpanName, splitTraceRecord, type TraceRecord } from "../src/run-trace.js";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SOURCE_ROOTS = ["packages", "web/src"];
const SKIPPED_DIRS = new Set(["node_modules", "dist", "tests", "__tests__", "__fixtures__", "build"]);

/** A literal span name passed to one of the span-opening helpers. */
const SPAN_CALL = /\b(?:withSpan|withSpanGen|startActiveSpan|startSpan)\(\s*"([^"]+)"|\bwithTaskSpan\(\s*"(?:io|cpu)",\s*"([^"]+)"/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { return SKIPPED_DIRS.has(entry.name) ? [] : sourceFiles(path); }
    return /\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function literalSpanNames(): Map<string, string> {
  const names = new Map<string, string>();
  for (const file of SOURCE_ROOTS.flatMap((root) => sourceFiles(join(ROOT, root)))) {
    // Shipped code only: package scripts and fixtures open spans of their own.
    if (!relative(ROOT, file).split(sep).includes("src")) { continue; }
    for (const match of readFileSync(file, "utf8").matchAll(SPAN_CALL)) {
      names.set(match[1] ?? match[2] ?? "", relative(ROOT, file));
    }
  }
  return names;
}

function record(name: string, attributes: Record<string, unknown>): TraceRecord {
  return {
    trace_id: "a".repeat(32), span_id: "b".repeat(16), parent_span_id: null, name, kind: "INTERNAL",
    start_time_ms: 0, end_time_ms: 1, duration_ms: 1, status: { code: "OK" }, attributes, events: [], resource: {}
  };
}

describe("trace span names", () => {
  it("declares every literal span name in the source as metadata", () => {
    const names = literalSpanNames();
    // The scan must find the spans this repository is known to open.
    for (const known of ["workflow.run", "node.process", "workspace.read", "subprocess.run", "python.execute", "ws.command", "storage.store"]) {
      expect(names.has(known), `${known} was not found by the scan`).toBe(true);
    }
    const undeclared = [...names].filter(([name]) => !isMetadataTraceSpanName(name)).map(([name, file]) => `${name} (${file})`);
    expect(undeclared).toEqual([]);
  });

  it("declares the computed provider and model span names", () => {
    for (const name of ["provider.textToImage", "provider.generateEmbedding", "agent.execute", "llm.stream openai/gpt-5"]) {
      expect(isMetadataTraceSpanName(name)).toBe(true);
    }
  });

  it("keeps an unknown span name and its attributes out of metadata", () => {
    const split = splitTraceRecord(record("Summarize the board minutes", { "nodetool.storage.bytes": 12, prompt: "secret plan" }));
    expect(split.record.name).toBe("content.span");
    expect(split.record.attributes).toEqual({ "nodetool.storage.bytes": 12 });
    expect(split.content?.attributes).toEqual({ prompt: "secret plan" });
  });

  it("keeps the metadata of the new activity spans", () => {
    const split = splitTraceRecord(record("provider.textToImage", { "gen_ai.system": "fal_ai", "gen_ai.operation.name": "textToImage", "gen_ai.request.model": "flux" }));
    expect(split.record.name).toBe("provider.textToImage");
    expect(split.content).toBeNull();
  });
});
