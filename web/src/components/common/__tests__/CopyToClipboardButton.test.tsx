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
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";

const mockWriteClipboard = jest.fn<any>().mockResolvedValue(undefined);

jest.mock("../../../hooks/browser/useClipboard", () => ({
  useClipboard: () => ({
    writeClipboard: mockWriteClipboard
  })
}));

describe("CopyToClipboardButton", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWriteClipboard.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("serializes and copies values", async () => {
    render(<CopyToClipboardButton copyValue={{ foo: "bar" }} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(mockWriteClipboard).toHaveBeenCalledWith('{\n  "foo": "bar"\n}', true)
    );
  });

  it("shows error when value is empty", () => {
    render(<CopyToClipboardButton copyValue={""} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByLabelText("Nothing to copy")).toBeTruthy();
    expect(mockWriteClipboard).not.toHaveBeenCalled();
  });

  it("calls success callback", async () => {
    const onCopySuccess = jest.fn();
    render(<CopyToClipboardButton copyValue={"data"} onCopySuccess={onCopySuccess} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onCopySuccess).toHaveBeenCalled());
  });
});
