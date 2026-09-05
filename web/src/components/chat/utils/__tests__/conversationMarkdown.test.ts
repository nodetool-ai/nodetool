import { conversationToMarkdown } from "../conversationMarkdown";
import { COMPACTION_EVENT_TYPE } from "../../message/CompactionCard";
import type { Message } from "../../../../stores/ApiTypes";

const userText = (text: string): Message => ({
  type: "message",
  role: "user",
  content: [{ type: "text", text }]
});

const assistantText = (text: string): Message => ({
  type: "message",
  role: "assistant",
  content: [{ type: "text", text }]
});

describe("conversationToMarkdown", () => {
  it("renders user and assistant turns under their headings", () => {
    const markdown = conversationToMarkdown([
      userText("What is a workflow?"),
      assistantText("A graph of nodes.")
    ]);

    expect(markdown).toBe(
      "## You\n\nWhat is a workflow?\n\n## Assistant\n\nA graph of nodes."
    );
  });

  it("accepts a plain string content", () => {
    expect(
      conversationToMarkdown([
        { type: "message", role: "user", content: "Hello" }
      ])
    ).toBe("## You\n\nHello");
  });

  it("strips the thinking block from assistant text", () => {
    const markdown = conversationToMarkdown([
      assistantText("Before<think>secret reasoning</think>After")
    ]);

    expect(markdown).toBe("## Assistant\n\nBeforeAfter");
    expect(markdown).not.toContain("secret reasoning");
  });

  it("strips an injected editor context block", () => {
    const markdown = conversationToMarkdown([
      userText("<editor_context>node: Foo</editor_context>\n\nFix this")
    ]);

    expect(markdown).toBe("## You\n\nFix this");
  });

  it("links image, video and audio blocks", () => {
    const markdown = conversationToMarkdown([
      {
        type: "message",
        role: "assistant",
        content: [
          { type: "image_url", image: { type: "image", uri: "https://x/1.png" } },
          { type: "video", video: { type: "video", asset_id: "vid-1" } },
          { type: "audio", audio: { type: "audio", uri: "https://x/1.mp3" } }
        ]
      }
    ]);

    expect(markdown).toBe(
      "## Assistant\n\n![image](https://x/1.png)\n\n[video](asset://vid-1)\n\n[audio](https://x/1.mp3)"
    );
  });

  it("drops a media block with neither uri nor asset id", () => {
    expect(
      conversationToMarkdown([
        {
          type: "message",
          role: "assistant",
          content: [{ type: "image_url", image: { type: "image" } }]
        }
      ])
    ).toBe("");
  });

  it("lists tool calls as one line each", () => {
    const markdown = conversationToMarkdown([
      {
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Looking it up." }],
        tool_calls: [
          { id: "1", name: "search_nodes", args: {} },
          { id: "2", name: "get_node_info", args: {} }
        ]
      }
    ]);

    expect(markdown).toBe(
      "## Assistant\n\nLooking it up.\n\n- Ran `search_nodes`\n- Ran `get_node_info`"
    );
  });

  it("skips tool results, agent execution rows and compaction records", () => {
    const markdown = conversationToMarkdown([
      { type: "message", role: "tool", content: "raw tool output" },
      { type: "message", role: "agent_execution", content: "trace" },
      {
        type: "message",
        role: "user",
        content: "[Conversation so far] earlier turns",
        execution_event_type: COMPACTION_EVENT_TYPE
      },
      userText("Still here")
    ]);

    expect(markdown).toBe("## You\n\nStill here");
  });

  it("returns an empty string for an empty conversation", () => {
    expect(conversationToMarkdown([])).toBe("");
  });
});
