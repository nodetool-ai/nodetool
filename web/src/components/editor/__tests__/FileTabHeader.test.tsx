import React from "react";
import "@testing-library/jest-dom";
import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import FileTabHeader from "../FileTabHeader";
import mockTheme from "../../../__mocks__/themeMock";
import type { Asset } from "../../../stores/ApiTypes";

const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {ui}
    </ThemeProvider>
  );
};

const createMockAsset = (id: string = "test-asset-id"): Asset => ({
  id,
  name: "test-image.png",
  content_type: "image/png",
  size: 1024,
  created_at: ""
} as Asset);

describe("FileTabHeader", () => {
  let mockProps: {
    asset: Asset;
    isActive: boolean;
    onSelect: jest.Mock;
    onClose: jest.Mock;
    onCloseOthers: jest.Mock;
    onCloseAll: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockProps = {
      asset: createMockAsset(),
      isActive: true,
      onSelect: jest.fn(),
      onClose: jest.fn(),
      onCloseOthers: jest.fn(),
      onCloseAll: jest.fn()
    };
  });

  it("renders asset name correctly", () => {
    renderWithTheme(<FileTabHeader {...mockProps} />);
    expect(screen.getByText("test-image.png")).toBeInTheDocument();
  });

  it("calls onSelect when tab is clicked", () => {
    renderWithTheme(<FileTabHeader {...mockProps} />);
    const tab = screen.getByText("test-image.png").closest(".tab");
    fireEvent.click(tab!);
    expect(mockProps.onSelect).toHaveBeenCalledWith("test-asset-id");
  });

  it("closes tab when close icon is clicked", () => {
    renderWithTheme(<FileTabHeader {...mockProps} />);
    const closeIcon = screen.getByTestId("CloseIcon").closest(".close-icon");
    fireEvent.click(closeIcon!);
    expect(mockProps.onClose).toHaveBeenCalledWith("test-asset-id");
  });

  it("closes tab on middle-click using auxclick event", () => {
    renderWithTheme(<FileTabHeader {...mockProps} />);
    const tab = screen.getByText("test-image.png").closest(".tab");

    // Simulate middle-click (button 1) with auxclick event
    const event = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    tab!.dispatchEvent(event);

    expect(mockProps.onClose).toHaveBeenCalledWith("test-asset-id");
    expect(mockProps.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close tab on primary click (button 0) via auxclick", () => {
    renderWithTheme(<FileTabHeader {...mockProps} />);
    const tab = screen.getByText("test-image.png").closest(".tab");

    // Primary button (button 0) should not trigger close via auxclick
    const event = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 0 });
    tab!.dispatchEvent(event);

    expect(mockProps.onClose).not.toHaveBeenCalled();
  });

  it("opens context menu on right-click", () => {
    renderWithTheme(<FileTabHeader {...mockProps} />);
    const tab = screen.getByText("test-image.png").closest(".tab");

    fireEvent.contextMenu(tab!);

    // Check that context menu items are present
    expect(screen.getByText("Close Tab")).toBeInTheDocument();
    expect(screen.getByText("Close Other Tabs")).toBeInTheDocument();
    expect(screen.getByText("Close All Tabs")).toBeInTheDocument();
  });

  it("renders image icon for image content type", () => {
    renderWithTheme(<FileTabHeader {...mockProps} />);
    const imageIcon = screen.getByTestId("ImageIcon");
    expect(imageIcon).toBeInTheDocument();
  });

  it("renders different icons based on content type", () => {
    const videoAsset: Asset = {
      ...createMockAsset(),
      id: "video-asset",
      name: "video.mp4",
      content_type: "video/mp4"
    };
    renderWithTheme(<FileTabHeader {...mockProps} asset={videoAsset} />);
    const videoIcon = screen.getByTestId("VideoFileIcon");
    expect(videoIcon).toBeInTheDocument();
  });
});
