import React, { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { InlineEditableText } from "../InlineEditableText";

const renderWithTheme = (component: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);

interface HarnessProps {
  value?: string;
  onCommit: (next: string) => void;
  onCancel?: () => void;
  startEditing?: boolean;
}

/** Mirrors a real call site: the parent owns `editing`, the primitive the draft. */
const Harness = ({
  value = "Track 1",
  onCommit,
  onCancel,
  startEditing = true
}: HarnessProps) => {
  const [editing, setEditing] = useState(startEditing);
  return (
    <div>
      <InlineEditableText
        value={value}
        editing={editing}
        onEditingChange={setEditing}
        onCommit={onCommit}
        onCancel={onCancel}
        ariaLabel="Track name"
      />
      <button type="button">elsewhere</button>
    </div>
  );
};

describe("InlineEditableText", () => {
  it("shows the value on a display element until editing starts", async () => {
    const user = userEvent.setup();
    renderWithTheme(<Harness onCommit={jest.fn()} startEditing={false} />);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await user.dblClick(screen.getByText("Track 1"));
    expect(await screen.findByRole("textbox", { name: "Track name" })).toBeInTheDocument();
  });

  it("focuses and selects the draft when editing starts", async () => {
    renderWithTheme(<Harness onCommit={jest.fn()} />);
    const input = screen.getByRole("textbox", { name: "Track name" }) as HTMLInputElement;

    await waitFor(() => expect(input).toHaveFocus());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("Track 1".length);
  });

  it("commits a trimmed value on Enter and leaves edit mode", async () => {
    const user = userEvent.setup();
    const onCommit = jest.fn();
    renderWithTheme(<Harness onCommit={onCommit} />);
    const input = screen.getByRole("textbox", { name: "Track name" });

    await user.clear(input);
    await user.type(input, "  Drums  {Enter}");

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("Drums");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("commits on blur", async () => {
    const user = userEvent.setup();
    const onCommit = jest.fn();
    renderWithTheme(<Harness onCommit={onCommit} />);

    await user.clear(screen.getByRole("textbox", { name: "Track name" }));
    await user.type(screen.getByRole("textbox", { name: "Track name" }), "Bass");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(onCommit).toHaveBeenCalledWith("Bass");
  });

  // WorkspaceTabItem's cancelRenameRef fix.
  it("cancels on Escape, and the blur that follows does not commit", async () => {
    const user = userEvent.setup();
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    renderWithTheme(<Harness onCommit={onCommit} onCancel={onCancel} />);
    const input = screen.getByRole("textbox", { name: "Track name" });

    await user.clear(input);
    await user.type(input, "Discarded{Escape}");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Track 1")).toBeInTheDocument();
  });

  // TrackHeader's stale-blur fix: Enter already committed, the blur must not repeat it.
  it("does not commit twice when Enter is followed by a blur", async () => {
    const user = userEvent.setup();
    const onCommit = jest.fn();
    renderWithTheme(<Harness onCommit={onCommit} />);
    const input = screen.getByRole("textbox", { name: "Track name" });

    await user.clear(input);
    await user.type(input, "Vocals{Enter}");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  // WorkflowListItem's trim/empty/unchanged rejection.
  it("does not commit an unchanged value", async () => {
    const user = userEvent.setup();
    const onCommit = jest.fn();
    renderWithTheme(<Harness onCommit={onCommit} />);

    await user.type(screen.getByRole("textbox", { name: "Track name" }), "{Enter}");

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("does not commit a whitespace-only value", async () => {
    const user = userEvent.setup();
    const onCommit = jest.fn();
    renderWithTheme(<Harness onCommit={onCommit} />);
    const input = screen.getByRole("textbox", { name: "Track name" });

    await user.clear(input);
    await user.type(input, "   {Enter}");

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("commits an empty value only when allowEmpty is set", async () => {
    const user = userEvent.setup();
    const onCommit = jest.fn();
    renderWithTheme(
      <ThemeProvider theme={mockTheme}>
        <InlineEditableText
          value="x"
          editing
          allowEmpty
          onEditingChange={jest.fn()}
          onCommit={onCommit}
          ariaLabel="Value"
        />
      </ThemeProvider>
    );

    await user.clear(screen.getByRole("textbox", { name: "Value" }));
    await user.type(screen.getByRole("textbox", { name: "Value" }), "{Enter}");

    expect(onCommit).toHaveBeenCalledWith("");
  });

  it("applies sanitize to each keystroke", async () => {
    const user = userEvent.setup();
    const onCommit = jest.fn();
    renderWithTheme(
      <InlineEditableText
        value=""
        editing
        onEditingChange={jest.fn()}
        onCommit={onCommit}
        sanitize={(raw) => raw.replace(/[^\w]/g, "")}
        ariaLabel="New variable name"
      />
    );

    await user.type(screen.getByRole("textbox", { name: "New variable name" }), "a-b c!{Enter}");

    expect(onCommit).toHaveBeenCalledWith("abc");
  });

  it("keeps one read-only input in both states with displayAsInput", async () => {
    const user = userEvent.setup();
    const onCommit = jest.fn();
    const DisplayAsInput = () => {
      const [editing, setEditing] = useState(false);
      return (
        <InlineEditableText
          displayAsInput
          value="Video 1"
          editing={editing}
          onEditingChange={setEditing}
          onCommit={onCommit}
          ariaLabel="Track name"
          title="Double-click to rename"
        />
      );
    };
    renderWithTheme(<DisplayAsInput />);
    const input = screen.getByRole("textbox", { name: "Track name" });

    expect(input).toHaveAttribute("readonly");
    expect(input).toHaveAttribute("title", "Double-click to rename");

    await user.dblClick(input);

    // Same DOM node — the element is not swapped out on the way into edit mode.
    expect(screen.getByRole("textbox", { name: "Track name" })).toBe(input);
    expect(input).not.toHaveAttribute("readonly");
    expect(input).not.toHaveAttribute("title");
  });

  it("mirrors the draft upward through onDraftChange", async () => {
    const user = userEvent.setup();
    const onDraftChange = jest.fn();
    renderWithTheme(
      <InlineEditableText
        value=""
        editing
        onEditingChange={jest.fn()}
        onCommit={jest.fn()}
        onDraftChange={onDraftChange}
        ariaLabel="Layer name"
      />
    );

    await user.type(screen.getByRole("textbox", { name: "Layer name" }), "ab");

    expect(onDraftChange).toHaveBeenNthCalledWith(1, "a");
    expect(onDraftChange).toHaveBeenNthCalledWith(2, "ab");
  });

  it("keeps a click inside the input from reaching a clickable row", async () => {
    const user = userEvent.setup();
    const onRowClick = jest.fn();
    renderWithTheme(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
      <div onClick={onRowClick}>
        <InlineEditableText
          value="Track 1"
          editing
          onEditingChange={jest.fn()}
          onCommit={jest.fn()}
          ariaLabel="Track name"
        />
      </div>
    );

    await user.click(screen.getByRole("textbox", { name: "Track name" }));

    expect(onRowClick).not.toHaveBeenCalled();
  });
});
