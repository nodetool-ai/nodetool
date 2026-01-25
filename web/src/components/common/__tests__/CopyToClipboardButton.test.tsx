import React from "react";
import "@testing-library/jest-dom";
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  jest
} from "@jest/globals";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";
import mockTheme from "../../../__mocks__/themeMock";

const mockWriteClipboard = jest.fn<any>().mockResolvedValue(undefined);

jest.mock("../../../hooks/browser/useClipboard", () => ({
  useClipboard: () => ({
    writeClipboard: mockWriteClipboard
  })
}));

const renderWithTheme = (ui: React.ReactElement) => {
  return render(
    <ThemeProvider theme={mockTheme}>
      {ui}
    </ThemeProvider>
  );
};

describe("CopyToClipboardButton", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWriteClipboard.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("serializes and copies values", async () => {
    renderWithTheme(<CopyToClipboardButton copyValue={{ foo: "bar" }} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(mockWriteClipboard).toHaveBeenCalledWith('{\n  "foo": "bar"\n}', true)
    );
  });

  it("shows error when value is empty", () => {
    renderWithTheme(<CopyToClipboardButton copyValue={""} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByLabelText("Nothing to copy")).toBeTruthy();
    expect(mockWriteClipboard).not.toHaveBeenCalled();
  });

  it("calls success callback", async () => {
    const onCopySuccess = jest.fn();
    renderWithTheme(<CopyToClipboardButton copyValue={"data"} onCopySuccess={onCopySuccess} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onCopySuccess).toHaveBeenCalled());
  });
});
