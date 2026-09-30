import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { gameAuthoring, type AnyGameDocument } from "@nodetool-ai/protocol";
import { applyAnyGameOps, createTopDownRoomGame, type AnyGameDocumentOp } from "@nodetool-ai/game-runtime";
import mockTheme from "../../../__mocks__/themeMock";
import GameOverrideFields from "../GameOverrideFields";

function Harness({ onDocument }: { onDocument: (document: AnyGameDocument) => void }) {
  const [document, setDocument] = useState(() => {
    const baseline = createTopDownRoomGame("override-controls");
    const scene = baseline.scenes[0];
    const entity = scene.entities[0];
    const retained = { ...baseline, authoring: gameAuthoring.parse({ version: 1,
      program: { source: "return inputs.document", inputs: {}, seed: 1 }, baseline,
      prefabs: { reusable: entity }, instances: [{ sceneId: scene.id, entityId: entity.id, prefabId: "reusable" }] }) };
    return applyAnyGameOps(retained, [{ op: "update_entity", scene_id: scene.id, entity_id: entity.id,
      set: { transform2d: { x: entity.transform2d.x + 1 } } }]);
  });
  const scene = document.scenes[0];
  const entity = scene.entities[0];
  const apply = (ops: AnyGameDocumentOp[]): void => {
    const next = applyAnyGameOps(document, ops);
    setDocument(next); onDocument(next);
  };
  return <ThemeProvider theme={mockTheme}><GameOverrideFields document={document} sceneId={scene.id} entityId={entity.id} onOps={apply} /></ThemeProvider>;
}

it("shows inherited and overridden construction values and resets an explicit override", async () => {
  const onDocument = jest.fn();
  render(<Harness onDocument={onDocument} />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Construction values"));
  expect(screen.getByText("Prefab: reusable")).toBeInTheDocument();
  expect(screen.getByText("transform2d: Overridden")).toBeInTheDocument();
  expect(screen.getAllByText(/: Inherited$/).length).toBeGreaterThan(0);
  await user.click(screen.getByRole("button", { name: "Reset transform2d.x" }));
  expect(onDocument.mock.calls[0][0].authoring.overrides).toHaveLength(0);
  expect(screen.getByText("transform2d: Inherited")).toBeInTheDocument();
});

it("detaches a generated entity through an explicit action", async () => {
  const onDocument = jest.fn();
  render(<Harness onDocument={onDocument} />);
  const user = userEvent.setup();
  await user.click(screen.getByText("Construction values"));
  await user.click(screen.getByRole("button", { name: "Detach entity" }));
  expect(onDocument.mock.calls[0][0].authoring.detached).toHaveLength(1);
  expect(screen.getByText("Detached from construction")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Detach entity" })).not.toBeInTheDocument();
});
