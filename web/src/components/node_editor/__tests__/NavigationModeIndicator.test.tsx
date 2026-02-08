import React from "react";

jest.mock("../../../stores/NodeFocusStore", () => ({
  __esModule: true,
  useNodeFocusStore: jest.fn()
}));

import { useNodeFocusStore } from "../../../stores/NodeFocusStore";

const mockUseNodeFocusStore = useNodeFocusStore as jest.MockedFunction<typeof useNodeFocusStore>;

describe("NavigationModeIndicator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should subscribe to NodeFocusStore isNavigationMode state", () => {
    mockUseNodeFocusStore.mockReturnValue(false);
    
    // Import component after mocking
    const NavigationModeIndicator = require("../NavigationModeIndicator").default;
    
    // Verify that the store was called
    expect(mockUseNodeFocusStore).toHaveBeenCalled();
    expect(mockUseNodeFocusStore).toHaveBeenCalledWith(
      expect.any(Function)
    );
  });

  it("should return null when navigation mode is not active", () => {
    mockUseNodeFocusStore.mockReturnValue(false);
    
    const NavigationModeIndicator = require("../NavigationModeIndicator").default;
    const { render } = require("@testing-library/react");
    
    const { container } = render(<NavigationModeIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("should render when navigation mode is active", () => {
    mockUseNodeFocusStore.mockReturnValue(true);
    
    const NavigationModeIndicator = require("../NavigationModeIndicator").default;
    const { render } = require("@testing-library/react");
    
    const { container } = render(<NavigationModeIndicator />);
    // Component should render something when navigation mode is active
    expect(container.children.length).toBeGreaterThan(0);
  });
});
