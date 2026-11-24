import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import DocumentTitleHeader, {
  commitDocumentFilename,
  isValidDocumentTitle,
  splitDocumentFilename
} from "../DocumentTitleHeader";

const renderHeader = (props: {
  title: string;
  onRename: (nextName: string) => void;
  disabled?: boolean;
}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <DocumentTitleHeader {...props} />
    </ThemeProvider>
  );

describe("DocumentTitleHeader", () => {
  it("strips and re-attaches markdown extensions cleanly", () => {
    expect(splitDocumentFilename("Chapter 1.md")).toEqual({
      stem: "Chapter 1",
      extension: ".md"
    });
    expect(splitDocumentFilename("notes.markdown")).toEqual({
      stem: "notes",
      extension: ".markdown"
    });
    expect(splitDocumentFilename("Untitled")).toEqual({
      stem: "Untitled",
      extension: ".md"
    });

    expect(commitDocumentFilename("Chapter 2", ".md")).toBe("Chapter 2.md");
    expect(commitDocumentFilename("Chapter 2", ".markdown")).toBe(
      "Chapter 2.markdown"
    );
    expect(commitDocumentFilename("Chapter 2.md", ".md")).toBe("Chapter 2.md");
    expect(commitDocumentFilename("   ", ".md")).toBe("");
  });

  it("displays title without .md and commits renamed file with .md on Enter", async () => {
    const user = userEvent.setup();
    const onRename = jest.fn();
    renderHeader({ title: "Chapter 1.md", onRename });

    const button = screen.getByRole("button", { name: /Chapter 1/i });
    expect(button).toHaveTextContent("Chapter 1");

    await user.click(button);
    const input = screen.getByRole("textbox", { name: "Document title" });
    expect(input).toHaveValue("Chapter 1");

    await user.clear(input);
    await user.type(input, "Chapter 2{Enter}");

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith("Chapter 2.md");
  });

  it("cancels on Escape without renaming and commits on blur when changed", async () => {
    const user = userEvent.setup();
    const onRename = jest.fn();
    renderHeader({ title: "Draft.markdown", onRename });

    await user.click(screen.getByRole("button", { name: /Draft/i }));
    const input = screen.getByRole("textbox", { name: "Document title" });
    await user.clear(input);
    await user.type(input, "Ignored{Escape}");
    expect(onRename).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Draft/i }));
    const inputAgain = screen.getByRole("textbox", { name: "Document title" });
    await user.clear(inputAgain);
    await user.type(inputAgain, "Final");
    await user.tab();

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith("Final.markdown");
  });

  it("ignores empty or unchanged values and respects disabled", async () => {
    const user = userEvent.setup();
    const onRename = jest.fn();
    const { rerender } = renderHeader({ title: "Notes.md", onRename });

    await user.click(screen.getByRole("button", { name: /Notes/i }));
    const input = screen.getByRole("textbox", { name: "Document title" });
    await user.clear(input);
    await user.type(input, "   {Enter}");
    expect(onRename).not.toHaveBeenCalled();

    rerender(
      <ThemeProvider theme={mockTheme}>
        <DocumentTitleHeader title="Notes.md" onRename={onRename} disabled />
      </ThemeProvider>
    );
    const disabledButton = screen.getByRole("button", { name: /Notes/i });
    expect(disabledButton).toBeDisabled();
    await user.click(disabledButton);
    expect(screen.queryByRole("textbox", { name: "Document title" })).toBeNull();
  });

  it("rejects path separators, reserved segments, and illegal filename characters", () => {
    const invalidInputs = [
      "",
      "   ",
      "a/b",
      "a\\b",
      "../secret",
      "..",
      ".",
      ".md",
      ".markdown",
      "..md",
      "...md",
      "foo:bar",
      "foo*bar",
      "foo?bar",
      'foo"bar',
      "foo<bar",
      "foo>bar",
      "foo|bar",
      "foo\0bar",
      "foo\x1fbar",
      "foo\x7fbar"
    ];

    for (const input of invalidInputs) {
      expect(isValidDocumentTitle(input)).toBe(false);
      expect(commitDocumentFilename(input, ".md")).toBe("");
    }

    expect(isValidDocumentTitle("Act I - Café Scene")).toBe(true);
    expect(commitDocumentFilename("Act I - Café Scene", ".md")).toBe(
      "Act I - Café Scene.md"
    );
    expect(commitDocumentFilename("Notes (draft), Q1'26", ".markdown")).toBe(
      "Notes (draft), Q1'26.markdown"
    );
  });

  it("blocks invalid titles in the header, shows an inline alert, and clears on valid rename", async () => {
    const user = userEvent.setup();
    const onRename = jest.fn();
    renderHeader({ title: "Chapter 1.md", onRename });

    await user.click(screen.getByRole("button", { name: /Chapter 1/i }));
    const input = screen.getByRole("textbox", { name: "Document title" });
    await user.clear(input);
    await user.type(input, "a/b{Enter}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /path separators or reserved filename characters/i
    );

    await user.click(screen.getByRole("button", { name: /Chapter 1/i }));
    expect(screen.queryByRole("alert")).toBeNull();
    const secondInput = screen.getByRole("textbox", { name: "Document title" });
    await user.clear(secondInput);
    await user.type(secondInput, "../notes{Enter}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /path separators or reserved filename characters/i
    );

    await user.click(screen.getByRole("button", { name: /Chapter 1/i }));
    const thirdInput = screen.getByRole("textbox", { name: "Document title" });
    await user.clear(thirdInput);
    await user.type(thirdInput, "Act I - Café Scene{Enter}");

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith("Act I - Café Scene.md");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
