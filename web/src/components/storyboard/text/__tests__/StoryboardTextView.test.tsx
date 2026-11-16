import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { $createParagraphNode, $createTextNode, $getRoot, $isElementNode, type LexicalEditor } from "lexical";
import type { Entity, Screenplay } from "@nodetool-ai/protocol";

import mockTheme from "../../../../__mocks__/themeMock";
import { useStoryboardStore } from "../../../../stores/storyboard/StoryboardStore";
import StoryboardTextView from "../StoryboardTextView";

const mockEntities: Entity[] = [
  { type: "entity", id: "e0000000000000000000000000000001", kind: "character", name: "Nova", descriptor: "A young astronaut" }
];
jest.mock("../../../../serverState/useEntities", () => ({
  useEntities: () => ({ data: mockEntities })
}));
// The @ picker searches the asset library over tRPC; it is not under test here.
jest.mock("../../../node_types/editing/promptComposer/AssetMentionPlugin", () => ({
  __esModule: true,
  default: () => null
}));

const BOARD = "board-text";
const screenplay: Screenplay = {
  type: "screenplay",
  id: "sp1",
  title: "Mars Greenhouse",
  scenes: [{ type: "scene", id: "sc1", slugline: "INT. DOME - DAWN" }],
  shots: [
    { type: "shot", id: "s1", index: 0, scene_id: "sc1", slug: "First light", action: "Nova kneels by a shoot.", entity_ids: ["e0000000000000000000000000000001"], status: "keyframe_ready",
      keyframe: { type: "image", uri: "asset://a1.png", asset_id: "a1" }, keyframe_versions: [{ type: "image", uri: "asset://a1.png", asset_id: "a1" }] },
    { type: "shot", id: "s2", index: 1, scene_id: "sc1", slug: "The shoot", action: "Close on the shoot.", status: "planned" }
  ]
};

const editorOf = (): LexicalEditor => {
  const root = screen.getByRole("textbox") as HTMLElement & { __lexicalEditor?: LexicalEditor };
  if (!root.__lexicalEditor) {
    throw new Error("no editor on the text box");
  }
  return root.__lexicalEditor;
};
const textOf = (): string => editorOf().getEditorState().read(() => $getRoot().getChildren().map((line) => line.getTextContent()).join("\n"));
const setLine = (match: (text: string) => boolean, text: string): void => {
  act(() => {
    editorOf().update(
      () => {
        const line = $getRoot().getChildren().find((node) => match(node.getTextContent()));
        if (!$isElementNode(line)) {
          throw new Error("line not found");
        }
        line.getChildren().forEach((child) => child.remove());
        line.selectStart().insertText(text);
      },
      { discrete: true }
    );
  });
};

const renderView = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StoryboardTextView boardId={BOARD} />
    </ThemeProvider>
  );

beforeEach(() => {
  const store = useStoryboardStore.getState();
  store.ensureBoard(BOARD);
  store.setScreenplay(BOARD, screenplay);
});
afterEach(() => {
  useStoryboardStore.getState().removeBoard(BOARD);
});

describe("StoryboardTextView", () => {
  it("shows the board as Markdown with ids, mentions and the selected still", async () => {
    renderView();
    await waitFor(() => expect(textOf()).toContain("### First light {#s1}"));
    expect(textOf()).toContain("# Mars Greenhouse {#sp1}");
    expect(textOf()).toContain("## INT. DOME - DAWN {#sc1}");
    expect(textOf()).toContain("![Still](asset://a1.png)");
    expect(textOf()).toContain("[Nova](entity://e0000000000000000000000000000001) kneels by a shoot.");
  });

  it("writes an edit of the text into the board and keeps the shot's takes", async () => {
    renderView();
    await waitFor(() => expect(textOf()).toContain("Close on the shoot."));
    setLine((text) => text === "Close on the shoot.", "Extreme close on the shoot.");
    await waitFor(() => expect(useStoryboardStore.getState().boards[BOARD]?.shots[1].action).toBe("Extreme close on the shoot."));
    const first = useStoryboardStore.getState().boards[BOARD]?.shots[0];
    expect(first?.keyframe_versions).toHaveLength(1);
    expect(first?.status).toBe("keyframe_ready");
  });

  it("gives a new shot heading an id and adds the shot", async () => {
    renderView();
    await waitFor(() => expect(textOf()).toContain("Close on the shoot."));
    act(() => {
      editorOf().update(
        () => {
          const last = $getRoot().getLastChild();
          const line = $createParagraphNode();
          line.append($createTextNode("### A new shot"));
          last?.insertAfter(line);
        },
        { discrete: true }
      );
    });
    await waitFor(() => expect(useStoryboardStore.getState().boards[BOARD]?.shots).toHaveLength(3));
    const added = useStoryboardStore.getState().boards[BOARD]?.shots[2];
    expect(added?.slug).toBe("A new shot");
    await waitFor(() => expect(textOf()).toContain(`### A new shot {#${added?.id}}`));
  });

  it("writes the text again when the board changes elsewhere", async () => {
    renderView();
    await waitFor(() => expect(textOf()).toContain("Close on the shoot."));
    act(() => {
      useStoryboardStore.getState().updateShot(BOARD, "s2", { action: "Changed by the agent." });
    });
    await waitFor(() => expect(textOf()).toContain("Changed by the agent."));
    expect(textOf()).not.toContain("Close on the shoot.");
  });
});
