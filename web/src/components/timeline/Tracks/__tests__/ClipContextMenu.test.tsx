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
          onClose={jest.fn()}
        />
      </ThemeProvider>
    );
    expect(screen.queryByText("Unlink")).toBeNull();
  });
});
