import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CssVarsProvider, extendTheme } from "@mui/material/styles";
import { CopyButton } from "../CopyButton";
import { CloseButton } from "../CloseButton";
import { DeleteButton } from "../DeleteButton";
import { EditButton } from "../EditButton";
import { SettingsButton } from "../SettingsButton";

// Mock the clipboard hook
jest.mock("../../../hooks/browser/useClipboard", () => ({
  useClipboard: () => ({
    writeClipboard: jest.fn().mockResolvedValue(undefined)
  })
}));

const theme = extendTheme();

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <CssVarsProvider theme={theme}>{children}</CssVarsProvider>
);

describe("CopyButton", () => {
  it("renders with default props", () => {
    render(
      <TestWrapper>
        <CopyButton value="test" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles click", async () => {
    const onCopySuccess = jest.fn();
    render(
      <TestWrapper>
        <CopyButton value="test text" onCopySuccess={onCopySuccess} />
      </TestWrapper>
    );
    
    fireEvent.click(screen.getByRole("button"));
    
    await waitFor(() => {
      expect(onCopySuccess).toHaveBeenCalled();
    });
  });

  it("renders different sizes", () => {
    const { rerender } = render(
      <TestWrapper>
        <CopyButton value="test" buttonSize="small" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <TestWrapper>
        <CopyButton value="test" buttonSize="large" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

describe("CloseButton", () => {
  it("renders with default props", () => {
    render(
      <TestWrapper>
        <CloseButton onClick={() => {}} />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles click and stops propagation", () => {
    const onClick = jest.fn();
    const parentClick = jest.fn();
    
    render(
      <TestWrapper>
        <div onClick={parentClick}>
          <CloseButton onClick={onClick} />
        </div>
      </TestWrapper>
    );
    
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("renders different icon variants", () => {
    const { rerender } = render(
      <TestWrapper>
        <CloseButton onClick={() => {}} iconVariant="close" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <TestWrapper>
        <CloseButton onClick={() => {}} iconVariant="clear" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

describe("DeleteButton", () => {
  it("renders with default props", () => {
    render(
      <TestWrapper>
        <DeleteButton onClick={() => {}} />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles click", () => {
    const onClick = jest.fn();
    render(
      <TestWrapper>
        <DeleteButton onClick={onClick} />
      </TestWrapper>
    );
    
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });

  it("renders different icon variants", () => {
    const { rerender } = render(
      <TestWrapper>
        <DeleteButton onClick={() => {}} iconVariant="delete" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <TestWrapper>
        <DeleteButton onClick={() => {}} iconVariant="clear" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <TestWrapper>
        <DeleteButton onClick={() => {}} iconVariant="outline" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("respects disabled state", () => {
    render(
      <TestWrapper>
        <DeleteButton onClick={() => {}} disabled />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

describe("EditButton", () => {
  it("renders with default props", () => {
    render(
      <TestWrapper>
        <EditButton onClick={() => {}} />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles click", () => {
    const onClick = jest.fn();
    render(
      <TestWrapper>
        <EditButton onClick={onClick} />
      </TestWrapper>
    );
    
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });

  it("renders different icon variants", () => {
    const { rerender } = render(
      <TestWrapper>
        <EditButton onClick={() => {}} iconVariant="edit" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <TestWrapper>
        <EditButton onClick={() => {}} iconVariant="note" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();

    rerender(
      <TestWrapper>
        <EditButton onClick={() => {}} iconVariant="rename" />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});

describe("SettingsButton", () => {
  it("renders with default props", () => {
    render(
      <TestWrapper>
        <SettingsButton onClick={() => {}} />
      </TestWrapper>
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("handles click", () => {
    const onClick = jest.fn();
    render(
      <TestWrapper>
        <SettingsButton onClick={onClick} />
      </TestWrapper>
    );
    
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalled();
  });

  it("renders different icon variants", () => {
    const variants = ["settings", "tune", "moreVert", "moreHoriz"] as const;
    
    variants.forEach((variant) => {
      const { unmount } = render(
        <TestWrapper>
          <SettingsButton onClick={() => {}} iconVariant={variant} />
        </TestWrapper>
      );
      expect(screen.getByRole("button")).toBeInTheDocument();
      unmount();
    });
  });
});
