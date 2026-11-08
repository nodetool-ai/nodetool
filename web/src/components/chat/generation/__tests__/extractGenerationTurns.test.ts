import type { Message, MessageContent } from "../../../../stores/ApiTypes";
import { extractGenerationTurns, inferMediaCategory } from "../extractGenerationTurns";

const prompt = (id: string, mode?: string): Message =>
  ({
    id,
    role: "user",
    content: [{ type: "text", text: "A neon sign" }],
    ...(mode && { media_generation: { mode, model: "flux-pro" } })
  }) as Message;

describe("inferMediaCategory", () => {
  it("reads a media thread's kind from its prompts", () => {
    expect(inferMediaCategory([prompt("u1", "image_edit")])).toBe("image");
    expect(inferMediaCategory([prompt("u1", "extend")])).toBe("video");
    expect(inferMediaCategory([prompt("u1", "music")])).toBe("audio");
  });

  it("calls a thread with any plain prompt a chat", () => {
    expect(inferMediaCategory([])).toBeNull();
    expect(inferMediaCategory([prompt("u1", "image"), prompt("u2")])).toBeNull();
    expect(inferMediaCategory([prompt("u1", "chat")])).toBeNull();
  });
});

describe("extractGenerationTurns", () => {
  it("pairs user and assistant messages into generation turns", () => {
    const assistantContent: MessageContent[] = [
      {
        type: "image_url",
        image: { type: "image", uri: "https://example.com/1.png", asset_id: "asset1" }
      },
      {
        type: "image_url",
        image: { type: "image", uri: "https://example.com/2.png", asset_id: "asset2" }
      }
    ];
    const messages: Message[] = [
      {
        id: "u1",
        role: "user",
        content: [{ type: "text", text: "Wood-fired pizza truck" }],
        media_generation: { mode: "image", model: "gpt-image-2", aspect_ratio: "16:9" }
      },
      { id: "a1", role: "assistant", content: assistantContent }
    ];

    const turns = extractGenerationTurns(messages, "connected");
    expect(turns).toHaveLength(1);
    expect(turns[0].prompt).toBe("Wood-fired pizza truck");
    expect(turns[0].imageOutputs).toHaveLength(2);
    expect(turns[0].isPending).toBe(false);
    expect(turns[0].mediaGeneration?.aspect_ratio).toBe("16:9");
  });
});
