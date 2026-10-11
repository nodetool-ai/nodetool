import { act, render } from "@testing-library/react";

import useNodeMenuStore from "../../../stores/NodeMenuStore";
import usePendingNodeCreateStore from "../../../stores/PendingNodeCreateStore";
import type { NodeMetadata } from "../../../stores/ApiTypes";

const mockCreate = jest.fn();
const mockUseCreateNode = jest.fn(
  (_center?: { x: number; y: number }) => mockCreate
);
jest.mock("../../../hooks/useCreateNode", () => ({
  useCreateNode: (center?: { x: number; y: number }) =>
    mockUseCreateNode(center)
}));

import NodeCreateBridge from "../NodeCreateBridge";

const metadata = { node_type: "nodetool.text.Prompt" } as NodeMetadata;

describe("NodeCreateBridge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNodeMenuStore.setState({ isMenuOpen: false });
    usePendingNodeCreateStore.setState({ pending: null });
  });

  it("places a node picked in the floating menu where the menu was opened", () => {
    useNodeMenuStore.setState({ isMenuOpen: true });
    render(<NodeCreateBridge />);
    act(() => {
      usePendingNodeCreateStore.getState().requestCreate(metadata);
    });

    // No fixed position: useCreateNode falls back to the menu's clickPosition,
    // the same spot Enter in the menu uses.
    expect(mockUseCreateNode).toHaveBeenLastCalledWith(undefined);
    expect(mockCreate).toHaveBeenCalledWith(metadata);
  });

  it("places a node requested from outside the menu at the viewport center", () => {
    render(<NodeCreateBridge />);
    act(() => {
      usePendingNodeCreateStore.getState().requestCreate(metadata);
    });

    expect(mockUseCreateNode).toHaveBeenLastCalledWith({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2
    });
    expect(mockCreate).toHaveBeenCalledWith(metadata);
  });
});
