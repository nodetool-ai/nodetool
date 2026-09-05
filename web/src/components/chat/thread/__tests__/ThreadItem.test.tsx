import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import { ThreadItem } from "../ThreadItem";
import type { ThreadInfo } from "../../types/thread.types";

const thread: ThreadInfo = {
  id: "thread-1",
  title: "Fixing the encoder",
  updatedAt: "2026-07-02T10:00:00Z",
  messages: []
};

const renderItem = (props: Partial<React.ComponentProps<typeof ThreadItem>> = {}) => {
  const onSelect = jest.fn();
  const onRequestDelete = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <ul>
        <ThreadItem
          threadId="thread-1"
          thread={thread}
          isSelected={false}
          isDeleting={false}
          onSelect={onSelect}
          onRequestDelete={onRequestDelete}
          previewText="Fixing the encoder"
          {...props}
        />
      </ul>
    </ThemeProvider>
  );
  return { onSelect, onRequestDelete };
};

describe("ThreadItem", () => {
  it("renders the thread as a button", () => {
    renderItem();
    expect(
      screen.getByRole("button", { name: /Fixing the encoder/ })
    ).toBeInTheDocument();
  });

  it("marks the selected row with aria-current", () => {
    renderItem({ isSelected: true });
    expect(
      screen.getByRole("button", { name: /Fixing the encoder/ })
    ).toHaveAttribute("aria-current", "true");
  });

  it("leaves aria-current off an unselected row", () => {
    renderItem();
    expect(
      screen.getByRole("button", { name: /Fixing the encoder/ })
    ).not.toHaveAttribute("aria-current");
  });

  it("selects the thread on click", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderItem();

    await user.click(screen.getByRole("button", { name: /Fixing the encoder/ }));

    expect(onSelect).toHaveBeenCalledWith("thread-1");
  });

  it("selects the thread when Enter is pressed on the focused row", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderItem();

    screen.getByRole("button", { name: /Fixing the encoder/ }).focus();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledWith("thread-1");
  });

  it("asks for deletion without selecting the thread", async () => {
    const user = userEvent.setup();
    const { onSelect, onRequestDelete } = renderItem();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onRequestDelete).toHaveBeenCalledWith("thread-1");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
