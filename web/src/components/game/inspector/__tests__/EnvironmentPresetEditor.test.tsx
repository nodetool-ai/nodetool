import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import type { GameDocumentOp3D } from "@nodetool-ai/game-runtime";

import mockTheme from "../../../../__mocks__/themeMock";
import EnvironmentPresetEditor from "../editors/EnvironmentPresetEditor";

it("applies the chosen named preset to the selected scene only after Apply", async () => {
  const received: GameDocumentOp3D[][] = [];
  render(<ThemeProvider theme={mockTheme}><EnvironmentPresetEditor sceneId="other-scene" onOps={(ops) => received.push(ops)} /></ThemeProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Environment preset" }));
  await user.click(screen.getByRole("option", { name: "Neon interior" }));
  expect(received).toEqual([]);
  await user.click(screen.getByRole("button", { name: "Apply preset" }));
  expect(received).toEqual([[{ op: "apply_environment_preset", scene_id: "other-scene", preset: "neon-interior" }]]);
});
