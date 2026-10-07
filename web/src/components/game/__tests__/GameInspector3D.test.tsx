import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { applyGameOps3D, createNative3DGame, type GameDocumentOp3D } from "@nodetool-ai/game-runtime";
import type { GameDocument3D } from "@nodetool-ai/protocol";
import mockTheme from "../../../__mocks__/themeMock";
import GameInspector3D from "../panels/inspector/GameInspector3D";

function Fixture({ onDocument, entityId = "player-visual", music = false }: {
  onDocument: (document: GameDocument3D) => void;
  entityId?: string | null;
  music?: boolean;
}) {
  const [document, setDocument] = useState(() => {
    const initial = createNative3DGame("inspector");
    const visual = initial.scenes[0].entities.find((entity) => entity.id === "player-visual");
    if (!visual?.primitive) { throw new Error("Visual primitive missing"); }
    visual.primitive.material.emissive = "#112233";
    initial.scenes[0].environment.fog = { color: "#112233", near: 1, far: 20 };
    if (music) {
      initial.assets.music = { mediaKind: "audio", required: true, assetId: "music-source", digest: "0".repeat(64) };
      initial.scenes[0].music = { assetId: "music", volume: 1, fadeInTicks: 0, fadeOutTicks: 0 };
    }
    return initial;
  });
  const apply = (ops: GameDocumentOp3D[]): void => {
    const next = applyGameOps3D(document, ops);
    setDocument(next);
    onDocument(next);
  };
  return <ThemeProvider theme={mockTheme}><GameInspector3D document={document}
    sceneId={document.entrySceneId} entityId={entityId ?? undefined} onOps={apply} onScript={() => undefined} /></ThemeProvider>;
}

const visual = (document: GameDocument3D) => document.scenes[0].entities.find((entity) => entity.id === "player-visual");

describe("3D inspector removal", () => {
  it("removes a complete optional component through real document operations", async () => {
    const user = userEvent.setup();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} />);
    expect(screen.getByRole("button", { name: "Primitive" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Remove Primitive" }));
    expect(visual(changed.mock.lastCall?.[0])?.primitive).toBeUndefined();
    expect(screen.getByRole("button", { name: "Add Primitive" })).toBeVisible();
  });

  it("removes a nested optional value without preserving the old merged value", async () => {
    const user = userEvent.setup();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} />);
    expect(screen.getByRole("button", { name: "Primitive" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Material" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Remove Emissive" }));
    expect(visual(changed.mock.lastCall?.[0])?.primitive?.material.emissive).toBeUndefined();
    expect(visual(changed.mock.lastCall?.[0])?.primitive?.material.color).toBe("#47dfb5");
  });

  it("removes top-level optional scene music", async () => {
    const user = userEvent.setup();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} entityId={null} music />);
    expect(screen.getByRole("button", { name: "Music" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Remove Music" }));
    expect(changed.mock.lastCall?.[0].scenes[0].music).toBeUndefined();
    expect(changed.mock.lastCall?.[0].assets.music.mediaKind).toBe("audio");
  });

  it("removes nested optional scene settings", async () => {
    const user = userEvent.setup();
    const changed = jest.fn();
    render(<Fixture onDocument={changed} entityId={null} />);
    expect(screen.getByRole("button", { name: "Environment" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Fog" })).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Remove Fog" }));
    expect(changed.mock.lastCall?.[0].scenes[0].environment.fog).toBeUndefined();
  });
});
