import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MessageList, type ChatRow } from "../components/MessageList.js";

const CALL: ChatRow = {
  kind: "tool_call",
  id: "call-1",
  name: "execute_code",
  args: { code: "1" }
};

describe("transcript polish", () => {
  it("marks the tail call of a live turn as running", () => {
    const running = renderToStaticMarkup(
      <MessageList rows={[CALL]} streaming={true} />
    );
    expect(running).toContain("Running…");
    const idle = renderToStaticMarkup(
      <MessageList rows={[CALL]} streaming={false} />
    );
    expect(idle).toContain("Called");
    expect(idle).not.toContain("Running…");
  });

  it("offers starter prompts only when the empty state can send one", () => {
    expect(
      renderToStaticMarkup(
        <MessageList rows={[]} streaming={false} onStarter={() => {}} />
      )
    ).toContain("Summarize this page");
    expect(
      renderToStaticMarkup(<MessageList rows={[]} streaming={false} />)
    ).not.toContain("starter-chip");
  });

  it("offers a copy button for a finished answer, not for a streaming one", () => {
    const answer: ChatRow = {
      kind: "message",
      id: "m1",
      role: "assistant",
      text: "Done."
    };
    expect(
      renderToStaticMarkup(<MessageList rows={[answer]} streaming={false} />)
    ).toContain("Copy message");
    expect(
      renderToStaticMarkup(<MessageList rows={[answer]} streaming={true} />)
    ).not.toContain("Copy message");
  });
});
