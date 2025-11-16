import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CopyToClipboardButton } from "../../common/CopyToClipboardButton";

vi.mock("../../../hooks/browser/useClipboard", () => ({
  useClipboard: () => ({
    writeClipboard: vi.fn().mockResolvedValue(undefined)
  })
}));

const mockedUseClipboard = require("../../../hooks/browser/useClipboard");

describe("CopyToClipboardButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedUseClipboard.useClipboard().writeClipboard.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("serializes and copies values", async () => {
    render(<CopyToClipboardButton copyValue={{ foo: "bar" }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(
      mockedUseClipboard.useClipboard().writeClipboard
    ).toHaveBeenCalledWith('{\n  "foo": "bar"\n}', true);
  });

  it("shows error when value is empty", () => {
    render(<CopyToClipboardButton copyValue={""} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTitle("Nothing to copy")).toBeInTheDocument();
    expect(
      mockedUseClipboard.useClipboard().writeClipboard
    ).not.toHaveBeenCalled();
  });

  it("calls success callback", () => {
    const onCopySuccess = vi.fn();
    render(<CopyToClipboardButton copyValue={"data"} onCopySuccess={onCopySuccess} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onCopySuccess).toHaveBeenCalled();
  });
});

