import * as React from "react";
import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import EditorInsertionContext, {
  EditorInsertionProvider,
  useEditorInsertion,
  InsertIntoEditorFn
} from "../EditorInsertionContext";

describe("EditorInsertionContext", () => {
  describe("context default value", () => {
    it("defaults to null when no provider is present", () => {
      const { result } = renderHook(() => useEditorInsertion());
      expect(result.current).toBeNull();
    });
  });

  describe("EditorInsertionProvider", () => {
    it("provides the insert function to children", () => {
      const mockInsertFn: InsertIntoEditorFn = jest.fn();

      const { result } = renderHook(() => useEditorInsertion(), {
        wrapper: ({ children }) => (
          <EditorInsertionProvider value={mockInsertFn}>
            {children}
          </EditorInsertionProvider>
        )
      });

      expect(result.current).toBe(mockInsertFn);
    });

    it("provides null when value is null", () => {
      const { result } = renderHook(() => useEditorInsertion(), {
        wrapper: ({ children }) => (
          <EditorInsertionProvider value={null}>
            {children}
          </EditorInsertionProvider>
        )
      });

      expect(result.current).toBeNull();
    });

    it("allows nested components to access the insert function", () => {
      const mockInsertFn: InsertIntoEditorFn = jest.fn();
      let capturedFn: InsertIntoEditorFn | null = null;

      const TestConsumer = () => {
        capturedFn = useEditorInsertion();
        return <div data-testid="consumer">Consumer</div>;
      };

      render(
        <EditorInsertionProvider value={mockInsertFn}>
          <TestConsumer />
        </EditorInsertionProvider>
      );

      expect(screen.getByTestId("consumer")).toBeInTheDocument();
      expect(capturedFn).toBe(mockInsertFn);
    });
  });

  describe("useEditorInsertion hook", () => {
    it("returns the insert function from context", () => {
      const mockInsertFn: InsertIntoEditorFn = jest.fn();

      const { result } = renderHook(() => useEditorInsertion(), {
        wrapper: ({ children }) => (
          <EditorInsertionProvider value={mockInsertFn}>
            {children}
          </EditorInsertionProvider>
        )
      });

      expect(result.current).toBe(mockInsertFn);
    });

    it("allows calling the insert function with text", () => {
      const mockInsertFn: InsertIntoEditorFn = jest.fn();

      const { result } = renderHook(() => useEditorInsertion(), {
        wrapper: ({ children }) => (
          <EditorInsertionProvider value={mockInsertFn}>
            {children}
          </EditorInsertionProvider>
        )
      });

      result.current?.("test text");

      expect(mockInsertFn).toHaveBeenCalledWith("test text");
    });

    it("allows calling the insert function with text and language", () => {
      const mockInsertFn: InsertIntoEditorFn = jest.fn();

      const { result } = renderHook(() => useEditorInsertion(), {
        wrapper: ({ children }) => (
          <EditorInsertionProvider value={mockInsertFn}>
            {children}
          </EditorInsertionProvider>
        )
      });

      result.current?.("const x = 1;", "typescript");

      expect(mockInsertFn).toHaveBeenCalledWith("const x = 1;", "typescript");
    });

    it("returns null when used outside provider", () => {
      const { result } = renderHook(() => useEditorInsertion());
      expect(result.current).toBeNull();
    });
  });

  describe("default export", () => {
    it("exports the context as default", () => {
      expect(EditorInsertionContext).toBeDefined();
      expect(EditorInsertionContext.Provider).toBeDefined();
    });
  });
});
