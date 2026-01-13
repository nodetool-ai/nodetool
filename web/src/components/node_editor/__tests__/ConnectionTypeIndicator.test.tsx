import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import ConnectionTypeIndicator from "../ConnectionTypeIndicator";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const makeStoreState = (
  connecting: boolean,
  connectType: { type: string } | null,
  connectDirection: "source" | "target" | null
) => ({
  connecting,
  connectType,
  connectDirection
});

jest.mock("../../../stores/ConnectionStore", () => ({
  __esModule: true,
  default: jest.fn()
}));

import useConnectionStore from "../../../stores/ConnectionStore";

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe("ConnectionTypeIndicator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders nothing when not connecting", () => {
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
      (selector: (state: ReturnType<typeof makeStoreState>) => unknown) =>
        selector(makeStoreState(false, null, null))
    );
    const { container } = renderWithTheme(<ConnectionTypeIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when connecting but no position yet", () => {
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
      (selector: (state: ReturnType<typeof makeStoreState>) => unknown) =>
        selector(makeStoreState(true, { type: "image" }, "source"))
    );
    const { container } = renderWithTheme(<ConnectionTypeIndicator />);
    expect(container.firstChild).toBeNull();
  });

  it("renders indicator when connecting with mouse movement", async () => {
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
      (selector: (state: ReturnType<typeof makeStoreState>) => unknown) =>
        selector(makeStoreState(true, { type: "image" }, "source"))
    );
    renderWithTheme(<ConnectionTypeIndicator />);

    act(() => {
      const event = new MouseEvent("mousemove", {
        clientX: 100,
        clientY: 200,
        bubbles: true
      });
      window.dispatchEvent(event);
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(screen.getByText(/Output: image/)).toBeInTheDocument();
    });
  });

  it("shows Input label when connecting from target", async () => {
    (useConnectionStore as unknown as jest.Mock).mockImplementation(
      (selector: (state: ReturnType<typeof makeStoreState>) => unknown) =>
        selector(makeStoreState(true, { type: "str" }, "target"))
    );
    renderWithTheme(<ConnectionTypeIndicator />);

    act(() => {
      const event = new MouseEvent("mousemove", {
        clientX: 150,
        clientY: 250,
        bubbles: true
      });
      window.dispatchEvent(event);
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(screen.getByText(/Input: str/)).toBeInTheDocument();
    });
  });
});
