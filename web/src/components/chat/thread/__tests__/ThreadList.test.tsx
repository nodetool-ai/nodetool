import "@testing-library/jest-dom";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import ThreadList from "../ThreadList";
import type { ThreadInfo } from "../../types/thread.types";

const DAY_MS = 24 * 60 * 60 * 1000;

const makeThread = (
  id: string,
  title: string,
  updatedAt: string
): ThreadInfo => ({ id, title, updatedAt, messages: [] });

const twoThreads = (): Record<string, ThreadInfo> => {
  const now = Date.now();
  return {
    "thread-1": makeThread(
      "thread-1",
      "Fixing the encoder",
      new Date(now).toISOString()
    ),
    "thread-2": makeThread(
      "thread-2",
      "Storyboard ideas",
      new Date(now - DAY_MS).toISOString()
    )
  };
};

const renderList = (threads: Record<string, ThreadInfo>) => {
  const onDeleteThread = jest.fn();
  const onSelectThread = jest.fn();
  render(
    <ThemeProvider theme={mockTheme}>
      <ThreadList
        threads={threads}
        currentThreadId={null}
        onNewThread={jest.fn()}
        onSelectThread={onSelectThread}
        onDeleteThread={onDeleteThread}
        getThreadPreview={(id) => threads[id]?.title ?? "Empty conversation"}
      />
    </ThemeProvider>
  );
  return { onDeleteThread, onSelectThread };
};

const rowDeleteButtons = () =>
  screen.getAllByRole("button", { name: "Delete" });

describe("ThreadList", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("heads each day group when threads span several days", () => {
    renderList(twoThreads());

    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Yesterday")).toBeInTheDocument();
  });

  it("renders a lone thread without a date header", () => {
    const threads = twoThreads();
    delete threads["thread-2"];
    renderList(threads);

    expect(screen.getByText("Fixing the encoder")).toBeInTheDocument();
    expect(screen.queryByText("Today")).not.toBeInTheDocument();
  });

  it("keeps a single confirm dialog for the whole list", async () => {
    const user = userEvent.setup();
    renderList(twoThreads());

    await user.click(rowDeleteButtons()[0]);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      within(screen.getByRole("dialog")).getByText(/Fixing the encoder/)
    ).toBeInTheDocument();

    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" })
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(rowDeleteButtons()[1]);

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      within(screen.getByRole("dialog")).getByText(/Storyboard ideas/)
    ).toBeInTheDocument();
  });

  it("deletes the confirmed thread once the row has animated out", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { onDeleteThread } = renderList(twoThreads());

    await user.click(rowDeleteButtons()[1]);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" })
    );

    expect(onDeleteThread).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onDeleteThread).toHaveBeenCalledTimes(1);
    expect(onDeleteThread).toHaveBeenCalledWith("thread-2");
  });

  it("keeps the thread when the dialog is cancelled", async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const { onDeleteThread } = renderList(twoThreads());

    await user.click(rowDeleteButtons()[0]);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" })
    );

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onDeleteThread).not.toHaveBeenCalled();
  });
});
