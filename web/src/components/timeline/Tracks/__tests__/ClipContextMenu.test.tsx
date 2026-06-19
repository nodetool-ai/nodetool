import { describe, it, expect, jest } from "@jest/globals";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { ClipContextMenu } from "../ClipContextMenu";

describe("ClipContextMenu", () => {
  it("shows Unlink and calls onUnlink when the clip is linked", async () => {
    const onUnlink = jest.fn();
    const onClose = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <ClipContextMenu
          position={{ x: 10, y: 10 }}
          isLinked
          onUnlink={onUnlink}
          onDelete={jest.fn()}
          onClose={onClose}
        />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByText("Unlink"));
    expect(onUnlink).toHaveBeenCalledTimes(1);
  });

  it("does not render an Unlink item when the clip is not linked", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <ClipContextMenu
          position={{ x: 10, y: 10 }}
          isLinked={false}
          onUnlink={jest.fn()}
          onDelete={jest.fn()}
          onClose={jest.fn()}
        />
      </ThemeProvider>
    );
    expect(screen.queryByText("Unlink")).toBeNull();
  });

  it("shows Delete and calls onDelete for a linked clip", async () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <ClipContextMenu
          position={{ x: 10, y: 10 }}
          isLinked
          onUnlink={jest.fn()}
          onDelete={onDelete}
          onClose={onClose}
        />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows Delete and calls onDelete for an unlinked clip", async () => {
    const onDelete = jest.fn();
    const onClose = jest.fn();
    render(
      <ThemeProvider theme={mockTheme}>
        <ClipContextMenu
          position={{ x: 10, y: 10 }}
          isLinked={false}
          onUnlink={jest.fn()}
          onDelete={onDelete}
          onClose={onClose}
        />
      </ThemeProvider>
    );
    await userEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
