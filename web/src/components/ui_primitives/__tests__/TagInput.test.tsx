import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { TagInput } from "../TagInput";
import mockTheme from "../../../__mocks__/themeMock";

// Mock MUI components to avoid theme issues
jest.mock("@mui/material/Chip", () => {
  return {
    __esModule: true,
    default: function MockChip({ label, onDelete, disabled, "aria-label": ariaLabel, size }: any) {
      return (
        <span
          data-testid={`chip-${label}`}
          className={`MuiChip-root MuiChip-size${size === "medium" ? "Medium" : "Small"}`}
        >
          {label}
          {!disabled && onDelete && (
            <button
              type="button"
              aria-label={ariaLabel}
              onClick={onDelete}
              data-testid="delete-button"
            >
              ×
            </button>
          )}
        </span>
      );
    },
  };
});

jest.mock("@mui/material/IconButton", () => {
  return {
    __esModule: true,
    default: function MockIconButton({ children, onClick, "aria-label": ariaLabel, disabled, title }: any) {
      return (
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={onClick}
          disabled={disabled}
          title={title}
          data-testid="icon-button"
        >
          {children}
        </button>
      );
    },
  };
});

jest.mock("@mui/icons-material/Close", () => ({
  __esModule: true,
  default: () => <span data-testid="close-icon">×</span>,
}));

jest.mock("@mui/icons-material/Add", () => ({
  __esModule: true,
  default: () => <span data-testid="add-icon">+</span>,
}));

// Helper function to render with theme
const renderWithTheme = (component: React.ReactNode) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("TagInput", () => {
  describe("Basic functionality", () => {
    it("should render successfully", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} />);
      
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("should display existing tags", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["react", "typescript"]} onTagsChange={mockOnChange} />);
      
      expect(screen.getByText("react")).toBeInTheDocument();
      expect(screen.getByText("typescript")).toBeInTheDocument();
    });

    it("should display label when provided", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} label="Tags" />);
      
      expect(screen.getByText("Tags")).toBeInTheDocument();
    });

    it("should display placeholder when no tags exist", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(
        <TagInput
          tags={[]}
          onTagsChange={mockOnChange}
          placeholder="Add a tag..."
        />
      );
      
      expect(screen.getByPlaceholderText("Add a tag...")).toBeInTheDocument();
    });

    it("should not display placeholder when tags exist", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(
        <TagInput
          tags={["existing"]}
          onTagsChange={mockOnChange}
          placeholder="Add a tag..."
        />
      );
      
      expect(screen.queryByPlaceholderText("Add a tag...")).not.toBeInTheDocument();
    });
  });

  describe("Adding tags", () => {
    it("should add tag when pressing Enter", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "newtag{Enter}");
      
      expect(mockOnChange).toHaveBeenCalledWith(["newtag"]);
    });

    it("should trim whitespace from new tags", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "  tag  {Enter}");
      
      expect(mockOnChange).toHaveBeenCalledWith(["tag"]);
    });

    it("should not add empty tags", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "{Enter}");
      
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("should add tag via add button", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "newtag");
      
      const addButton = screen.getByRole("button", { name: /add tag/i });
      await user.click(addButton);
      
      expect(mockOnChange).toHaveBeenCalledWith(["newtag"]);
    });

    it("should clear input after adding tag", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "newtag{Enter}");
      
      await waitFor(() => {
        expect(input.value).toBe("");
      });
    });
  });

  describe("Removing tags", () => {
    it("should remove tag when clicking delete button", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["tag1", "tag2"]} onTagsChange={mockOnChange} />);
      
      const deleteButton = screen.getByRole("button", { name: /remove tag: tag1/i });
      await user.click(deleteButton);
      
      expect(mockOnChange).toHaveBeenCalledWith(["tag2"]);
    });

    it("should remove last tag when pressing Backspace on empty input", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["tag1"]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      input.focus();
      await user.keyboard("{Backspace}");
      
      expect(mockOnChange).toHaveBeenCalledWith([]);
    });

    it("should not remove tag when Backspace pressed on non-empty input", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["tag1"]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "a");
      await user.keyboard("{Backspace}");
      
      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe("Duplicate prevention", () => {
    it("should prevent duplicate tags by default", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["existing"]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "existing{Enter}");
      
      expect(mockOnChange).not.toHaveBeenCalled();
      expect(screen.getByText(/this tag already exists/i)).toBeInTheDocument();
    });

    it("should allow duplicates when allowDuplicates is true", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(
        <TagInput tags={["existing"]} onTagsChange={mockOnChange} allowDuplicates={true} />
      );
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "existing{Enter}");
      
      expect(mockOnChange).toHaveBeenCalledWith(["existing", "existing"]);
    });

    it("should clear duplicate error when input changes", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["existing"]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "existing{Enter}");
      
      expect(screen.getByText(/this tag already exists/i)).toBeInTheDocument();
      
      await user.clear(input);
      await user.type(input, "new");
      
      await waitFor(() => {
        expect(screen.queryByText(/this tag already exists/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Max tags limit", () => {
    it("should enforce max tags limit", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["tag1", "tag2"]} onTagsChange={mockOnChange} maxTags={2} />);

      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;

      // Input should be disabled when max tags is reached
      expect(input).toBeDisabled();

      // onTagsChange should not be called when trying to add beyond limit
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("should display tag count when maxTags is set", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["tag1", "tag2"]} onTagsChange={mockOnChange} maxTags={5} />);
      
      expect(screen.getByText("2 / 5 tags")).toBeInTheDocument();
    });

    it("should disable input when max tags reached", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["tag1", "tag2"]} onTagsChange={mockOnChange} maxTags={2} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      expect(input).toBeDisabled();
    });
  });

  describe("Custom validation", () => {
    it("should use custom validation function", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      const validateTag = jest.fn((tag: string) => ({
        valid: tag.length >= 3,
        errorMessage: "Tag must be at least 3 characters",
      }));
      
      renderWithTheme(
        <TagInput tags={[]} onTagsChange={mockOnChange} validateTag={validateTag} />
      );
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "ab{Enter}");
      
      expect(validateTag).toHaveBeenCalledWith("ab");
      expect(mockOnChange).not.toHaveBeenCalled();
      expect(screen.getByText(/tag must be at least 3 characters/i)).toBeInTheDocument();
    });

    it("should add tag when validation passes", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      const validateTag = jest.fn((tag: string) => ({ valid: tag.length >= 3 }));
      
      renderWithTheme(
        <TagInput tags={[]} onTagsChange={mockOnChange} validateTag={validateTag} />
      );
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "abc{Enter}");
      
      expect(mockOnChange).toHaveBeenCalledWith(["abc"]);
    });
  });

  describe("Disabled state", () => {
    it("should not add tags when disabled", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} disabled={true} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "newtag{Enter}");
      
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("should not remove tags when disabled", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["tag1"]} onTagsChange={mockOnChange} disabled={true} />);

      // When disabled, the Chip should not render delete buttons
      const deleteButtons = screen.queryAllByRole("button", { name: /remove tag/i });
      expect(deleteButtons.length).toBe(0);

      // onTagsChange should not be called
      expect(mockOnChange).not.toHaveBeenCalled();
    });

    it("should have disabled attribute on input when disabled", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} disabled={true} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      expect(input).toBeDisabled();
    });

    it("should have aria-disabled attribute on container", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} disabled={true} />);
      
      const container = screen.getByRole("combobox");
      expect(container).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("Error state", () => {
    it("should display error state when error prop is true", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(
        <TagInput tags={[]} onTagsChange={mockOnChange} error={true} helperText="Error message" />
      );
      
      expect(screen.getByText("Error message")).toBeInTheDocument();
    });
  });

  describe("Helper text", () => {
    it("should display helper text", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(
        <TagInput tags={[]} onTagsChange={mockOnChange} helperText="Add some tags" />
      );
      
      expect(screen.getByText("Add some tags")).toBeInTheDocument();
    });

    it("should have aria-live for validation errors", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["existing"]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "existing{Enter}");
      
      const errorText = screen.getByText(/this tag already exists/i);
      expect(errorText).toHaveAttribute("role", "alert");
      expect(errorText).toHaveAttribute("aria-live", "polite");
    });
  });

  describe("Keyboard navigation", () => {
    it("should focus input when container is clicked", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} />);
      
      const container = screen.getByRole("combobox");
      await user.click(container);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      expect(input).toHaveFocus();
    });

    it("should clear input and errors when Escape is pressed", async () => {
      const user = userEvent.setup();
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["existing"]} onTagsChange={mockOnChange} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      await user.type(input, "existing{Enter}");
      expect(screen.getByText(/this tag already exists/i)).toBeInTheDocument();
      
      await user.keyboard("{Escape}");
      
      await waitFor(() => {
        expect(input.value).toBe("");
        expect(screen.queryByText(/this tag already exists/i)).not.toBeInTheDocument();
      });
    });
  });

  describe("Accessibility", () => {
    it("should have proper ARIA labels", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} label="Tags" />);
      
      const container = screen.getByRole("combobox");
      expect(container).toHaveAttribute("aria-label", "Tags");
    });

    it("should have aria-invalid on error", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={[]} onTagsChange={mockOnChange} error={true} />);
      
      const input = screen.getByRole("combobox").querySelector("input") as HTMLInputElement;
      expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("should associate helper text with input", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(
        <TagInput tags={[]} onTagsChange={mockOnChange} label="Tags" helperText="Helper text" />
      );
      
      const helperText = screen.getByText("Helper text");
      expect(helperText).toHaveAttribute("id", "Tags-helper-text");
    });

    it("should have accessible delete buttons on chips", () => {
      const mockOnChange = jest.fn();
      renderWithTheme(<TagInput tags={["tag1"]} onTagsChange={mockOnChange} />);
      
      const deleteButton = screen.getByRole("button", { name: /remove tag: tag1/i });
      expect(deleteButton).toBeInTheDocument();
    });
  });

  describe("Chip sizes", () => {
    it("should render small chips by default", () => {
      const mockOnChange = jest.fn();
      const { container } = renderWithTheme(
        <TagInput tags={["tag1"]} onTagsChange={mockOnChange} />
      );
      
      const chips = container.querySelectorAll(".MuiChip-root");
      expect(chips[0]).toHaveClass("MuiChip-sizeSmall");
    });

    it("should render medium chips when specified", () => {
      const mockOnChange = jest.fn();
      const { container } = renderWithTheme(
        <TagInput tags={["tag1"]} onTagsChange={mockOnChange} chipSize="medium" />
      );
      
      const chips = container.querySelectorAll(".MuiChip-root");
      expect(chips[0]).toHaveClass("MuiChip-sizeMedium");
    });
  });

  describe("Custom className", () => {
    it("should apply custom className to root element", () => {
      const mockOnChange = jest.fn();
      const { container } = renderWithTheme(
        <TagInput tags={[]} onTagsChange={mockOnChange} className="custom-class" />
      );
      
      expect(container.querySelector(".tag-input-root")).toHaveClass("custom-class");
    });
  });
});
