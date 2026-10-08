import * as THREE from "three";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import SceneOutliner from "../SceneOutliner";
import type { SceneTreeNode } from "../sceneTree";

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

    const row = screen.getByRole("treeitem", { name: "Cube (Mesh)" });
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith(object.uuid);

    await userEvent.click(screen.getByRole("button", { name: "Hide object" }));
    expect(onToggleVisible).toHaveBeenCalledWith(object.uuid);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

const node = (
  name: string,
  children: SceneTreeNode[] = [],
  depth = 0
): SceneTreeNode => {
  const object = new THREE.Object3D();
  object.name = name;
  return { uuid: object.uuid, name, type: "Mesh", visible: true, depth, object, children };
};

const renderOutliner = (
  nodes: SceneTreeNode[],
  props: Partial<React.ComponentProps<typeof SceneOutliner>> = {}
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <SceneOutliner
        nodes={nodes}
        selectedUuid={null}
        onSelect={jest.fn()}
        onToggleVisible={jest.fn()}
        {...props}
      />
    </ThemeProvider>
  );

describe("SceneOutliner editing", () => {
  it("filters rows by name and keeps the ancestors of a match", async () => {
    const crate = node("Crate", [], 1);
    const props = node("Props", [crate]);
    renderOutliner([props, node("Pillar")]);

    await userEvent.type(screen.getByRole("textbox", { name: "Filter scene objects" }), "cra");

    await waitFor(() =>
      expect(screen.queryByRole("treeitem", { name: "Pillar (Mesh)" })).toBeNull()
    );
    expect(screen.getByRole("treeitem", { name: "Props (Mesh)" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Crate (Mesh)" })).toBeInTheDocument();
  });

  it("collapses a parent with the left arrow key", async () => {
    const crate = node("Crate", [], 1);
    const props = node("Props", [crate]);
    renderOutliner([props]);

    const parent = screen.getByRole("treeitem", { name: "Props (Mesh)" });
    expect(parent).toHaveAttribute("aria-expanded", "true");
    parent.focus();
    await userEvent.keyboard("{ArrowLeft}");

    expect(parent).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("treeitem", { name: "Crate (Mesh)" })).toBeNull();
  });

  it("renames a row on double-click", async () => {
    const cube = node("Cube");
    const onRename = jest.fn();
    renderOutliner([cube], { onRename });

    await userEvent.dblClick(screen.getByRole("treeitem", { name: "Cube (Mesh)" }));
    const input = screen.getByRole("textbox", { name: "Rename Cube" });
    await userEvent.clear(input);
    await userEvent.type(input, "Hero{Enter}");

    expect(onRename).toHaveBeenCalledWith(cube.uuid, "Hero");
  });

  it("runs context menu actions on the row that was right-clicked", async () => {
    const cube = node("Cube");
    const onAction = jest.fn();
    const onSelect = jest.fn();
    renderOutliner([cube], { onAction, onSelect });

    fireEvent.contextMenu(screen.getByRole("treeitem", { name: "Cube (Mesh)" }));
    await userEvent.click(await screen.findByText("Duplicate"));

    expect(onSelect).toHaveBeenCalledWith(cube.uuid);
    expect(onAction).toHaveBeenCalledWith("duplicate", cube.uuid);
  });
});
