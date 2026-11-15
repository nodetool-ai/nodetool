import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import ChatTitleMenu from "../ChatTitleMenu";
import useGlobalChatStore from "../../../../stores/GlobalChatStore";
import type { Thread } from "../../../../stores/ApiTypes";

const renderMenu = (onCopyConversation = jest.fn()) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ChatTitleMenu threadId="t1" onCopyConversation={onCopyConversation} />
    </ThemeProvider>
  );

describe("ChatTitleMenu", () => {
  const updateThreadTitle = jest.fn().mockResolvedValue(undefined);
  const deleteThread = jest.fn().mockResolvedValue(undefined);
  const initial = useGlobalChatStore.getState();

  beforeEach(() => {
    jest.clearAllMocks();
    useGlobalChatStore.setState({
      threads: { t1: { id: "t1", title: "Trip to Lisbon" } as Thread },
      updateThreadTitle,
      deleteThread
    });
  });
  afterAll(() => {
    useGlobalChatStore.setState(initial, true);
  });

  const openMenu = () =>
    fireEvent.click(screen.getByRole("button", { name: /Trip to Lisbon/ }));

  it("shows the thread title as a menu button", () => {
    renderMenu();
    const button = screen.getByRole("button", { name: /Trip to Lisbon/ });
    expect(button).toHaveAttribute("aria-haspopup", "menu");
  });

  it("renames the thread in place", () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename conversation" }));

    const input = screen.getByRole("textbox", { name: "Conversation name" });
    fireEvent.change(input, { target: { value: "Lisbon in May" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(updateThreadTitle).toHaveBeenCalledWith("t1", "Lisbon in May");
  });

  it("copies the conversation from the menu", () => {
    const onCopy = jest.fn();
    renderMenu(onCopy);
    openMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Copy conversation as Markdown" })
    );
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it("deletes the thread only after confirmation", async () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete conversation" }));
    expect(deleteThread).not.toHaveBeenCalled();
    expect(
      screen.getByText('Delete "Trip to Lisbon"? This cannot be undone.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteThread).toHaveBeenCalledWith("t1"));
  });
});
