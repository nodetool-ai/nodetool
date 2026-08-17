/**
 * Per-node-channel stream diff (§4, §12).
 *
 * Grown from `packages/cli/src/debug/diff.ts`, which diffs two
 * `DebugReport`s at the verdict/summary level (issues, token/cost deltas)
 * for the debug harness's `--watch` mode. This module diffs two
 * `NormalizedRunRecord`s at the *message* level, one node-channel at a time
 * — because the actor model legitimately interleaves frames across nodes,
 * a global stream diff would flag reorderings that are not bugs.
 * `diffIsEmpty`/`formatDiff` there and `streamDiffIsEmpty`/`formatStreamDiff`
 * here are deliberately parallel APIs; the debug-harness copy is untouched
 * so its own tests and callers stay green.
 */
import type { NormalizedRunFrame, NormalizedRunRecord } from "./normalize.js";
import { stableStringify } from "./stable-json.js";

interface ChannelDiffEntry {
  kind: "added" | "removed" | "changed" | "unchanged";
  /** Index within the side the entry belongs to (baseline for removed/changed, candidate for added). */
  baselineMessage?: Record<string, unknown>;
  candidateMessage?: Record<string, unknown>;
}

interface ChannelDiff {
  channel: string;
  entries: ChannelDiffEntry[];
}

export interface StreamDiff {
  channels: ChannelDiff[];
}

function canonicalKey(message: Record<string, unknown>): string {
  return stableStringify(message);
}

function groupByChannel(
  frames: NormalizedRunFrame[]
): Map<string, NormalizedRunFrame[]> {
  const groups = new Map<string, NormalizedRunFrame[]>();
  for (const frame of frames) {
    const group = groups.get(frame.channel);
    if (group) group.push(frame);
    else groups.set(frame.channel, [frame]);
  }
  return groups;
}

/**
 * Longest-common-subsequence diff over two message sequences (by canonical
 * JSON equality), yielding `equal`/`remove`/`add` runs in original order.
 * O(n·m); channels are short (one node's messages in one run), so this is
 * cheap in practice.
 */
function lcsDiff(
  baseline: Record<string, unknown>[],
  candidate: Record<string, unknown>[]
): ChannelDiffEntry[] {
  const bKeys = baseline.map(canonicalKey);
  const cKeys = candidate.map(canonicalKey);
  const n = baseline.length;
  const m = candidate.length;

  // dp[i][j] = length of LCS of bKeys[i:] and cKeys[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        bKeys[i] === cKeys[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const entries: ChannelDiffEntry[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (bKeys[i] === cKeys[j]) {
      entries.push({
        kind: "unchanged",
        baselineMessage: baseline[i],
        candidateMessage: candidate[j]
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      entries.push({ kind: "removed", baselineMessage: baseline[i] });
      i++;
    } else {
      entries.push({ kind: "added", candidateMessage: candidate[j] });
      j++;
    }
  }
  while (i < n) {
    entries.push({ kind: "removed", baselineMessage: baseline[i] });
    i++;
  }
  while (j < m) {
    entries.push({ kind: "added", candidateMessage: candidate[j] });
    j++;
  }
  return entries;
}

/**
 * Diffs two normalized records channel by channel. `baseline` is
 * conventionally the kernel (oracle) surface (§12: "the kernel surface is
 * the oracle"), but the function is symmetric in shape — either side can be
 * either record.
 */
export function diffNormalizedRecords(
  baseline: NormalizedRunRecord,
  candidate: NormalizedRunRecord
): StreamDiff {
  const baselineGroups = groupByChannel(baseline.frames);
  const candidateGroups = groupByChannel(candidate.frames);
  const channels = new Set([
    ...baselineGroups.keys(),
    ...candidateGroups.keys()
  ]);

  const result: ChannelDiff[] = [];
  for (const channel of Array.from(channels).sort()) {
    const baselineMessages = (baselineGroups.get(channel) ?? []).map(
      (f) => f.message
    );
    const candidateMessages = (candidateGroups.get(channel) ?? []).map(
      (f) => f.message
    );
    const entries = lcsDiff(baselineMessages, candidateMessages).filter(
      (e) => e.kind !== "unchanged"
    );
    if (entries.length > 0) {
      result.push({ channel, entries });
    }
  }
  return { channels: result };
}

/** True when no channel diverged — the C1 done-when: a record diffed against itself is empty. */
export function streamDiffIsEmpty(diff: StreamDiff): boolean {
  return diff.channels.length === 0;
}

export function formatStreamDiff(diff: StreamDiff): string {
  if (streamDiffIsEmpty(diff)) return "No divergence.";
  const lines: string[] = [];
  for (const channel of diff.channels) {
    lines.push(`channel ${channel.channel}:`);
    for (const entry of channel.entries) {
      if (entry.kind === "removed") {
        lines.push(`  - ${canonicalKey(entry.baselineMessage!)}`);
      } else if (entry.kind === "added") {
        lines.push(`  + ${canonicalKey(entry.candidateMessage!)}`);
      }
    }
  }
  return lines.join("\n");
}
