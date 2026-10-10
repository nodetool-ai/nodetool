/**
 * Covered lines per file, read from an Istanbul `coverage-final.json` or an
 * LCOV `lcov.info` report. A site on a line the report does not mark as hit
 * is uncovered and is not run.
 */

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** Absolute file path -> covered 1-based lines. */
export type CoverageMap = Map<string, Set<number>>;

interface Position {
  line: number;
}

interface IstanbulFile {
  path?: string;
  statementMap?: Record<string, { start: Position; end: Position }>;
  s?: Record<string, number>;
}

/**
 * A line is covered when the smallest statement spanning it ran. Nested
 * statements (a callback inside a call) therefore decide their own lines.
 */
export function istanbulLines(entry: IstanbulFile): Set<number> {
  const best = new Map<number, { span: number; hit: boolean }>();
  for (const [id, range] of Object.entries(entry.statementMap ?? {})) {
    const hit = (entry.s?.[id] ?? 0) > 0;
    const span = range.end.line - range.start.line;
    for (let line = range.start.line; line <= range.end.line; line += 1) {
      const prior = best.get(line);
      if (prior === undefined || span < prior.span || (span === prior.span && hit)) {
        best.set(line, { span, hit });
      }
    }
  }
  const lines = new Set<number>();
  for (const [line, { hit }] of best) {
    if (hit) {
      lines.add(line);
    }
  }
  return lines;
}

export function parseIstanbul(text: string, baseDir: string): CoverageMap {
  const data = JSON.parse(text) as Record<string, IstanbulFile>;
  const map: CoverageMap = new Map();
  for (const [key, entry] of Object.entries(data)) {
    const path = resolve(baseDir, entry.path ?? key);
    map.set(path, istanbulLines(entry));
  }
  return map;
}

export function parseLcov(text: string, baseDir: string): CoverageMap {
  const map: CoverageMap = new Map();
  let current: Set<number> | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("SF:")) {
      const file = line.slice(3);
      current = new Set();
      map.set(isAbsolute(file) ? file : resolve(baseDir, file), current);
    } else if (line.startsWith("DA:") && current !== null) {
      const [lineNo, hits] = line.slice(3).split(",");
      if (Number(hits) > 0) {
        current.add(Number(lineNo));
      }
    } else if (line === "end_of_record") {
      current = null;
    }
  }
  return map;
}

/** Reports a coverage run leaves in `directory`, merged. */
export function readCoverageDir(directory: string, baseDir: string): CoverageMap | null {
  const json = join(directory, "coverage-final.json");
  if (existsSync(json)) {
    return parseIstanbul(readFileSync(json, "utf8"), baseDir);
  }
  const lcov = join(directory, "lcov.info");
  if (existsSync(lcov)) {
    return parseLcov(readFileSync(lcov, "utf8"), baseDir);
  }
  return null;
}
