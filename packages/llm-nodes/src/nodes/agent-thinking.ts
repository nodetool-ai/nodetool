import type { Chunk } from "@nodetool-ai/protocol";

/**
 * Opening tag plus the close tags models may emit. The canonical close is
 * `</redacted_thinking>`; `</think>` is the legacy/typo variant. Both must be
 * recognized so the streaming splitter matches what `extractThinkTags` does.
 */
const REDACTED_THINKING_OPEN = "<think>";
const REDACTED_THINKING_CLOSES = ["</redacted_thinking>", "</think>"] as const;

function findEarliestThinkClose(
  buf: string
): { idx: number; len: number } | null {
  let best: { idx: number; len: number } | null = null;
  for (const c of REDACTED_THINKING_CLOSES) {
    const i = buf.indexOf(c);
    if (i !== -1 && (best === null || i < best.idx)) {
      best = { idx: i, len: c.length };
    }
  }
  return best;
}

/** Longest suffix of buf that is a proper prefix of one of the candidate strings (for streaming). */
function holdSuffixForPartialTag(
  buf: string,
  candidates: readonly string[]
): number {
  const maxCheck = Math.max(
    0,
    ...candidates.map((c) => Math.max(0, c.length - 1))
  );
  const limit = Math.min(buf.length, maxCheck);
  for (let len = limit; len >= 1; len--) {
    const suf = buf.slice(-len);
    if (candidates.some((c) => c.startsWith(suf))) return len;
  }
  return 0;
}

export function extractThinkTags(text: string): { thinking: string; text: string } {
  const parts: string[] = [];
  const re = /<think>([\s\S]*?)<\/(?:redacted_thinking|think)>/g;
  let cleaned = text.replace(re, (_, content: string) => {
    parts.push(content.trim());
    return "";
  });
  const orphan = cleaned.match(/<think>([\s\S]*)$/);
  if (orphan && orphan.index !== undefined) {
    parts.push(orphan[1].trim());
    cleaned = cleaned.slice(0, orphan.index);
  }
  return {
    thinking: parts.filter((p) => p.length > 0).join("\n\n"),
    text: cleaned.trim()
  };
}

/**
 * Splits streamed text so `<think>…` never appears on the text channel:
 * reasoning goes to `thinking`, user-visible text to `text` chunks only.
 */
export class RedactedThinkingStreamSplitter {
  private buf = "";
  private inThink = false;

  *feed(
    incoming: string
  ): Generator<
    { kind: "text"; content: string } | { kind: "thinking"; content: string }
  > {
    if (!incoming) return;
    this.buf += incoming;

    while (true) {
      if (!this.inThink) {
        const openIdx = this.buf.indexOf(REDACTED_THINKING_OPEN);
        if (openIdx === -1) {
          const keep = holdSuffixForPartialTag(this.buf, [
            REDACTED_THINKING_OPEN
          ]);
          if (this.buf.length > keep) {
            const emitEnd = this.buf.length - keep;
            const out = this.buf.slice(0, emitEnd);
            this.buf = this.buf.slice(emitEnd);
            if (out) yield { kind: "text", content: out };
          }
          return;
        }
        if (openIdx > 0) {
          const out = this.buf.slice(0, openIdx);
          if (out) yield { kind: "text", content: out };
        }
        this.buf = this.buf.slice(openIdx + REDACTED_THINKING_OPEN.length);
        this.inThink = true;
        continue;
      }

      const close = findEarliestThinkClose(this.buf);
      if (!close) {
        const keep = holdSuffixForPartialTag(
          this.buf,
          REDACTED_THINKING_CLOSES
        );
        if (this.buf.length > keep) {
          const emitEnd = this.buf.length - keep;
          const out = this.buf.slice(0, emitEnd);
          this.buf = this.buf.slice(emitEnd);
          if (out) yield { kind: "thinking", content: out };
        }
        return;
      }
      const thinkBody = this.buf.slice(0, close.idx);
      this.buf = this.buf.slice(close.idx + close.len);
      this.inThink = false;
      if (thinkBody) yield { kind: "thinking", content: thinkBody };
    }
  }

  *flush(): Generator<
    { kind: "text"; content: string } | { kind: "thinking"; content: string }
  > {
    if (!this.buf && !this.inThink) return;
    if (this.inThink) {
      if (this.buf) yield { kind: "thinking", content: this.buf };
    } else if (this.buf) {
      yield { kind: "text", content: this.buf };
    }
    this.buf = "";
    this.inThink = false;
  }
}

export function* yieldSplitThinkChunks(
  item: Chunk,
  rawPiece: string,
  splitter: RedactedThinkingStreamSplitter
): Generator<Record<string, unknown>> {
  for (const part of splitter.feed(rawPiece)) {
    if (part.kind === "text" && part.content.length > 0) {
      yield {
        chunk: { ...item, content: part.content },
        thinking: null,
        text: null,
        audio: null
      };
    } else if (part.kind === "thinking" && part.content.length > 0) {
      yield {
        chunk: null,
        thinking: {
          type: "chunk",
          content: part.content,
          thinking: true
        },
        text: null,
        audio: null
      };
    }
  }
}
