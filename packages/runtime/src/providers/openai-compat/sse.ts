/**
 * Minimal Server-Sent Events parser for OpenAI-style streaming responses.
 *
 * Yields the joined `data:` payload of each event. Handles the parts of the
 * SSE spec that OpenAI-compatible gateways actually exercise:
 *  - events separated by blank lines, with LF or CRLF line endings
 *  - events and lines split across arbitrary network-chunk boundaries
 *  - multiple `data:` lines per event (joined with `\n`)
 *  - comment lines (`:`) and non-data fields (`event:`, `id:`, …) are ignored
 *  - a final unterminated event is flushed at end-of-stream (some gateways
 *    close the connection right after `data: [DONE]` without a blank line)
 */
export async function* sseEvents(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let dataLines: string[] = [];

  const takeEvent = (): string | null => {
    if (dataLines.length === 0) return null;
    const event = dataLines.join("\n");
    dataLines = [];
    return event;
  };

  const consumeLine = (rawLine: string): string | null => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      return takeEvent();
    }
    if (line.startsWith("data:")) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(" ") ? value.slice(1) : value);
    }
    // Comments (":…") and other fields ("event:", "id:", "retry:") are ignored.
    return null;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineAt: number;
      while ((newlineAt = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineAt);
        buffer = buffer.slice(newlineAt + 1);
        const event = consumeLine(line);
        if (event !== null) yield event;
      }
    }

    // Flush any decoder-buffered bytes and a trailing line without newline.
    buffer += decoder.decode();
    if (buffer !== "") {
      const event = consumeLine(buffer);
      if (event !== null) yield event;
    }
    const trailing = takeEvent();
    if (trailing !== null) yield trailing;
  } finally {
    // Stop the underlying connection if the consumer bails early.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
