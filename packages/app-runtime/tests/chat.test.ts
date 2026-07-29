import { describe, expect, it } from "vitest";
import { composeUserMessage, messagesFrom, messageText } from "../src/chat.js";

describe("messagesFrom", () => {
  it("reads a list of role/content objects as the conversation", () => {
    expect(
      messagesFrom([
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" }
      ])
    ).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" }
    ]);
  });

  it("reads a streamed string as one assistant turn", () => {
    expect(messagesFrom("partial reply")).toEqual([
      { role: "assistant", content: "partial reply" }
    ]);
  });

  it("reads accumulated non-message items as assistant turns", () => {
    expect(messagesFrom([{ type: "image", uri: "a.png" }])).toEqual([
      { role: "assistant", content: { type: "image", uri: "a.png" } }
    ]);
  });

  it("joins the chunks of one streamed reply into a single turn", () => {
    // A streaming output accumulates one item per chunk; a bubble per token is
    // not what the reply looked like when it was produced.
    expect(messagesFrom(["hel", "lo", " there"])).toEqual([
      { role: "assistant", content: "hello there" }
    ]);
  });

  it("starts a new turn when a message interrupts the chunks", () => {
    expect(
      messagesFrom([
        "thinking",
        { role: "user", content: "wait" },
        "resum",
        "ed"
      ])
    ).toEqual([
      { role: "assistant", content: "thinking" },
      { role: "user", content: "wait" },
      { role: "assistant", content: "resumed" }
    ]);
  });

  it("keeps non-text items as their own turns", () => {
    // Two images are two results, not one concatenated reply.
    expect(
      messagesFrom([{ type: "image", uri: "a.png" }, { type: "image", uri: "b.png" }])
    ).toEqual([
      { role: "assistant", content: { type: "image", uri: "a.png" } },
      { role: "assistant", content: { type: "image", uri: "b.png" } }
    ]);
  });

  it("treats an empty value as no conversation", () => {
    expect(messagesFrom(undefined)).toEqual([]);
    expect(messagesFrom("")).toEqual([]);
    expect(messagesFrom([null, ""])).toEqual([]);
  });

  it("defaults missing content to an empty string", () => {
    expect(messagesFrom([{ role: "user" }])).toEqual([
      { role: "user", content: "" }
    ]);
  });
});

describe("composeUserMessage", () => {
  it("sends plain text when nothing is attached", () => {
    expect(composeUserMessage("hi")).toEqual({
      type: "message",
      role: "user",
      content: "hi"
    });
  });

  it("sends content parts when images are attached", () => {
    expect(composeUserMessage("look", ["data:image/png;base64,AAA"])).toEqual({
      type: "message",
      role: "user",
      content: [
        { type: "text", text: "look" },
        {
          type: "image_url",
          image: { type: "image", uri: "data:image/png;base64,AAA" }
        }
      ]
    });
  });

  it("omits the text part when the draft was only an attachment", () => {
    const message = composeUserMessage("", ["data:image/png;base64,AAA"]);
    expect(message.content).toHaveLength(1);
  });
});

describe("messageText", () => {
  it("joins the text parts of a content list", () => {
    expect(
      messageText([
        { type: "text", text: "one" },
        { type: "image_url", image: { type: "image", uri: "a.png" } },
        { type: "text", text: "two" }
      ])
    ).toBe("one\ntwo");
  });

  it("passes a plain string through", () => {
    expect(messageText("hello")).toBe("hello");
  });
});
