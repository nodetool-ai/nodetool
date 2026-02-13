import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import useSearchHistoryStore from "../../../stores/SearchHistoryStore";
import SearchHistoryChips from "../SearchHistoryChips";

// Wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return function SearchHistoryWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
};

describe("SearchHistoryChips", () => {
  beforeEach(() => {
    // Clear history before each test
    const { clearHistory } = useSearchHistoryStore.getState();
    clearHistory();
  });

  it("should not render when there is no search history", () => {
    const onSearchTermClick = jest.fn();
    const { container } = render(<SearchHistoryChips onSearchTermClick={onSearchTermClick} />, {
      wrapper: createWrapper()
    });

    expect(container.querySelector(".search-history-container")).not.toBeInTheDocument();
  });

  it("should render recent search chips when history exists", () => {
    const { addSearchTerm } = useSearchHistoryStore.getState();

    addSearchTerm("image generator");
    addSearchTerm("text to speech");

    const onSearchTermClick = jest.fn();
    render(<SearchHistoryChips onSearchTermClick={onSearchTermClick} />, {
      wrapper: createWrapper()
    });

    expect(screen.getByText("Recent Searches")).toBeInTheDocument();
    expect(screen.getByText("image generator")).toBeInTheDocument();
    expect(screen.getByText("text to speech")).toBeInTheDocument();
  });

  it("should call onSearchTermClick when a chip is clicked", async () => {
    const user = userEvent.setup();
    const { addSearchTerm } = useSearchHistoryStore.getState();

    addSearchTerm("search term 1");
    addSearchTerm("search term 2");

    const onSearchTermClick = jest.fn();
    render(<SearchHistoryChips onSearchTermClick={onSearchTermClick} />, {
      wrapper: createWrapper()
    });

    const chip = screen.getByText("search term 1");
    await user.click(chip);

    expect(onSearchTermClick).toHaveBeenCalledWith("search term 1");
  });

  it("should remove chip when delete button is clicked", async () => {
    const user = userEvent.setup();
    const { addSearchTerm } = useSearchHistoryStore.getState();

    addSearchTerm("to be removed");
    addSearchTerm("keep this");

    const onSearchTermClick = jest.fn();
    render(<SearchHistoryChips onSearchTermClick={onSearchTermClick} />, {
      wrapper: createWrapper()
    });

    // Find the close button for the "to be removed" chip
    const closeButtons = screen.getAllByRole("button");
    const deleteButton = closeButtons.find(
      (button) => button.getAttribute("aria-label")?.includes("delete")
    );

    if (deleteButton) {
      await user.click(deleteButton);
    }

    // Verify removal
    expect(screen.queryByText("to be removed")).not.toBeInTheDocument();
    expect(screen.getByText("keep this")).toBeInTheDocument();
  });

  it("should clear all history when Clear button is clicked", async () => {
    const user = userEvent.setup();
    const { addSearchTerm } = useSearchHistoryStore.getState();

    addSearchTerm("term 1");
    addSearchTerm("term 2");
    addSearchTerm("term 3");

    const onSearchTermClick = jest.fn();
    render(<SearchHistoryChips onSearchTermClick={onSearchTermClick} />, {
      wrapper: createWrapper()
    });

    const clearButton = screen.getByText("Clear");
    await user.click(clearButton);

    // Verify cleared
    expect(screen.queryByText("Recent Searches")).not.toBeInTheDocument();
    expect(screen.queryByText("term 1")).not.toBeInTheDocument();
  });

  it("should display chips in most-recent-first order", () => {
    const { addSearchTerm } = useSearchHistoryStore.getState();

    // Add in this order: oldest to newest
    addSearchTerm("oldest");
    addSearchTerm("middle");
    addSearchTerm("newest");

    const onSearchTermClick = jest.fn();
    const { container } = render(<SearchHistoryChips onSearchTermClick={onSearchTermClick} />, {
      wrapper: createWrapper()
    });

    const chips = container.querySelectorAll('[class*="search-history-chip"]');
    expect(chips).toHaveLength(3);

    // First chip should be newest (added last)
    expect(chips[0]).toHaveTextContent("newest");
    expect(chips[1]).toHaveTextContent("middle");
    expect(chips[2]).toHaveTextContent("oldest");
  });

  it("should limit to 8 recent searches", () => {
    const { addSearchTerm, getRecentSearches } = useSearchHistoryStore.getState();

    // Add 10 searches
    for (let i = 0; i < 10; i++) {
      addSearchTerm(`search ${i}`);
    }

    const onSearchTermClick = jest.fn();
    const { container } = render(<SearchHistoryChips onSearchTermClick={onSearchTermClick} />, {
      wrapper: createWrapper()
    });

    const chips = container.querySelectorAll('[class*="search-history-chip"]');
    expect(chips).toHaveLength(8);

    // Verify the store has all 10, but component only shows 8
    expect(getRecentSearches()).toHaveLength(10);
  });

  it("should truncate long chip labels with ellipsis", () => {
    const { addSearchTerm } = useSearchHistoryStore.getState();

    const longTerm = "this is a very long search term that should be truncated";
    addSearchTerm(longTerm);

    const onSearchTermClick = jest.fn();
    render(<SearchHistoryChips onSearchTermClick={onSearchTermClick} />, {
      wrapper: createWrapper()
    });

    const chipLabel = screen.getByText(longTerm);
    expect(chipLabel).toBeInTheDocument();
    // The label should have the truncation class
    expect(chipLabel.parentElement).toHaveClass("search-history-chip-label");
  });

  it("should show tooltip with full text for truncated chips", () => {
    const { addSearchTerm } = useSearchHistoryStore.getState();

    const searchTerm = "search with very long text that might be truncated";
    addSearchTerm(searchTerm);

    const onSearchTermClick = jest.fn();
    const { container } = render(<SearchHistoryChips onSearchTermClick={onSearchTermClick} />, {
      wrapper: createWrapper()
    });

    // Find the chip (which should have a tooltip)
    const chipElement = container.querySelector('[title="' + searchTerm + '"]');
    expect(chipElement).toBeInTheDocument();
  });
});
