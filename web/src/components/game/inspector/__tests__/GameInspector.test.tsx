import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { gameDocument, type GameDocument } from "@nodetool-ai/protocol/game.js";
import { applyGameOps, type GameDocumentOp } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import GameInspector from "../../GameInspector";

const initial = gameDocument.parse({
  schemaVersion: 2, engineVersion: "1", id: "game", revision: "one", entrySceneId: "main", pixelsPerUnit: 16, tickRate: 60,
  inputActions: ["left", "right", "up", "down"],
  assets: { image: { assetId: "image-file", digest: "digest", mediaKind: "image", width: 1, height: 1 } },
  scenes: [{ id: "main", name: "Main", entities: [{ id: "hero", name: "Hero", transform2d: { x: 0, y: 0 } }] }]
});

function Fixture({ onDocument, selectedIds = ["hero"] }: { onDocument: (document: GameDocument) => void; selectedIds?: readonly string[] }) {
  const [document, setDocument] = useState(initial);
  const apply = (ops: GameDocumentOp[]) => {
    const next = applyGameOps(document, ops);
    setDocument(next);
    onDocument(next);
  };
  return <ThemeProvider theme={mockTheme}><GameInspector document={document} selectedIds={selectedIds} onOps={apply} onEditScript={() => undefined} /></ThemeProvider>;
}

describe("game inspector edits", () => {
  it("adds and removes a component through reducer operations", async () => {
    const user = userEvent.setup();
    const onDocument = jest.fn();
    render(<Fixture onDocument={onDocument} />);
    await user.click(screen.getByRole("combobox", { name: "Add component" }));
    await user.click(screen.getByRole("option", { name: "sprite" }));
    await user.click(screen.getByRole("button", { name: "Add component" }));
    expect(onDocument.mock.lastCall?.[0].scenes[0].entities[0].sprite.assetId).toBe("image");
    await user.click(screen.getByRole("button", { name: "Remove component" }));
    expect(onDocument.mock.lastCall?.[0].scenes[0].entities[0].sprite).toBeUndefined();
  });

  it("adds and removes a behavior through reducer operations", async () => {
    const user = userEvent.setup();
    const onDocument = jest.fn();
    render(<Fixture onDocument={onDocument} />);
    await user.click(screen.getByRole("combobox", { name: "Add behavior" }));
    await user.click(screen.getByRole("option", { name: "collectible" }));
    await user.click(screen.getByRole("button", { name: "Add behavior" }));
    expect(onDocument.mock.lastCall?.[0].scenes[0].entities[0].behaviors).toEqual([{ kind: "collectible", score: 1 }]);
    await user.click(screen.getByRole("button", { name: "Remove behavior" }));
    expect(onDocument.mock.lastCall?.[0].scenes[0].entities[0].behaviors).toEqual([]);
  });

  it("edits scene lighting and backgrounds through reducer operations", async () => {
    const user = userEvent.setup();
    const onDocument = jest.fn();
    render(<Fixture onDocument={onDocument} selectedIds={[]} />);
    await user.click(screen.getByRole("button", { name: "Add lighting" }));
    expect(onDocument.mock.lastCall?.[0].scenes[0].lighting.ambient.color).toBe("#ffffff");
    await user.click(screen.getByRole("button", { name: "Add light" }));
    expect(onDocument.mock.lastCall?.[0].scenes[0].lighting.points).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Add background" }));
    expect(onDocument.mock.lastCall?.[0].scenes[0].backgrounds).toHaveLength(1);
  });

  it("adds a game effect through one reducer operation", async () => {
    const user = userEvent.setup();
    const onDocument = jest.fn();
    render(<Fixture onDocument={onDocument} />);
    await user.click(screen.getByRole("combobox", { name: "Inspector" }));
    await user.click(screen.getByRole("option", { name: "Game" }));
    await user.click(screen.getByRole("combobox", { name: "Add effect" }));
    await user.click(screen.getByRole("option", { name: "bloom" }));
    await user.click(screen.getByRole("button", { name: "Add effect" }));
    expect(onDocument.mock.lastCall?.[0].renderEffects[0].kind).toBe("bloom");
  });
});
