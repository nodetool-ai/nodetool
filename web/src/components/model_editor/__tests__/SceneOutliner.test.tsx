import * as THREE from "three";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import SceneOutliner from "../SceneOutliner";

describe("SceneOutliner", () => {
  it("selects a row by keyboard and keeps visibility action independent", async () => {
    const object = new THREE.Object3D();
    object.name = "Cube";
    const onSelect = jest.fn();
    const onToggleVisible = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <SceneOutliner
          nodes={[{ uuid: object.uuid, name: object.name, type: "Mesh", visible: true, depth: 0, object, children: [] }]}
          selectedUuid={null}
          onSelect={onSelect}
          onToggleVisible={onToggleVisible}
        />
      </ThemeProvider>
    );

    const row = screen.getByRole("button", { name: "Cube (Mesh)" });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(object.uuid);

    await userEvent.click(screen.getByRole("button", { name: "Hide object" }));
    expect(onToggleVisible).toHaveBeenCalledWith(object.uuid);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
