import React from "react";
import { render, screen } from "@testing-library/react";
import ArrayView from "../ArrayView";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { NPArray } from "../../../stores/ApiTypes";

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider theme={mockTheme}>{component}</ThemeProvider>);
};

describe("ArrayView", () => {
  // Helper to create NPArray objects
  const createNPArray = (
    value: unknown[] | null,
    dtype: string,
    shape: number[]
  ): NPArray => ({
    type: "np_array",
    value,
    dtype,
    shape,
  } as NPArray);

  describe("rendering", () => {
    it("renders a simple 1D array correctly", () => {
      const array = createNPArray([1, 2, 3, 4, 5], "int64", [5]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/Array \(int64\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Shape: 5/i)).toBeInTheDocument();
      // JSON.stringify with null, 2 adds pretty formatting
      expect(screen.getByText(/1,/)).toBeInTheDocument();
      expect(screen.getByText(/2,/)).toBeInTheDocument();
    });

    it("renders a 2D array correctly", () => {
      const array = createNPArray(
        [[1, 2], [3, 4], [5, 6]],
        "float64",
        [3, 2]
      );

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/Array \(float64\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Shape: 3, 2/i)).toBeInTheDocument();
      expect(screen.getByText(/\[\s*\[\s*1,/)).toBeInTheDocument();
    });

    it("renders arrays with string dtype correctly", () => {
      const array = createNPArray(["a", "b", "c"], "string", [3]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/Array \(string\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Shape: 3/i)).toBeInTheDocument();
      expect(screen.getByText(/"a"/)).toBeInTheDocument();
    });

    it("renders arrays with boolean dtype correctly", () => {
      const array = createNPArray([true, false, true], "bool", [3]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/Array \(bool\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Shape: 3/i)).toBeInTheDocument();
      expect(screen.getByText(/true/)).toBeInTheDocument();
      expect(screen.getByText(/false/)).toBeInTheDocument();
    });

    it("renders arrays with float dtype correctly", () => {
      const array = createNPArray([1.5, 2.7, 3.14], "float32", [3]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/Array \(float32\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Shape: 3/i)).toBeInTheDocument();
      expect(screen.getByText(/1.5/)).toBeInTheDocument();
    });

    it("renders arrays with complex shape correctly", () => {
      const array = createNPArray(
        [[[1, 2], [3, 4]], [[5, 6], [7, 8]]],
        "int32",
        [2, 2, 2]
      );

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/Array \(int32\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Shape: 2, 2, 2/i)).toBeInTheDocument();
    });
  });

  describe("large array handling", () => {
    it("truncates arrays with more than 100 elements", () => {
      const largeArray = Array.from({ length: 150 }, (_, i) => i);
      const array = createNPArray(largeArray, "int64", [150]);

      renderWithTheme(<ArrayView array={array} />);

      const formattedValue = screen.queryByText((content) => {
        return content?.includes("...") && content?.includes("0,");
      });

      expect(formattedValue).toBeInTheDocument();
    });

    it("shows exactly 100 elements when array has 100 elements", () => {
      const hundredElementArray = Array.from({ length: 100 }, (_, i) => i);
      const array = createNPArray(hundredElementArray, "int64", [100]);

      renderWithTheme(<ArrayView array={array} />);

      const formattedValue = screen.queryByText((content) => {
        return content?.includes("99") && !content?.includes("...");
      });

      expect(formattedValue).toBeInTheDocument();
    });

    it("shows ellipsis for arrays larger than 100 elements", () => {
      const largeArray = Array.from({ length: 200 }, (_, i) => i);
      const array = createNPArray(largeArray, "int64", [200]);

      renderWithTheme(<ArrayView array={array} />);

      const formattedValue = screen.queryByText((content) => {
        return content?.endsWith("...");
      });

      expect(formattedValue).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("handles empty arrays correctly", () => {
      const array = createNPArray([], "int64", [0]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText("[]")).toBeInTheDocument();
      expect(screen.getByText(/Shape: 0/i)).toBeInTheDocument();
    });

    it("handles null value correctly", () => {
      const array = createNPArray(null, "int64", [0]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText("No data")).toBeInTheDocument();
    });

    it("handles arrays with nested null values", () => {
      const array = createNPArray([1, null, 3], "float64", [3]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/null/)).toBeInTheDocument();
    });

    it("handles arrays with negative numbers", () => {
      const array = createNPArray([-1, -2, -3], "int64", [3]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/-1/)).toBeInTheDocument();
    });

    it("handles arrays with decimal numbers", () => {
      const array = createNPArray([0.1, 0.01, 0.001], "float64", [3]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/0.1/)).toBeInTheDocument();
    });

    it("handles arrays with zero values", () => {
      const array = createNPArray([0, 0, 0], "int64", [3]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/0/)).toBeInTheDocument();
    });

    it("handles single element arrays", () => {
      const array = createNPArray([42], "int64", [1]);

      renderWithTheme(<ArrayView array={array} />);

      // JSON.stringify pretty prints: "[\n  42\n]"
      expect(screen.getByText(/42/)).toBeInTheDocument();
      expect(screen.getByText(/Shape: 1/i)).toBeInTheDocument();
    });
  });

  describe("component structure", () => {
    it("wraps content in Paper component", () => {
      const array = createNPArray([1, 2, 3], "int64", [3]);

      const { container } = renderWithTheme(<ArrayView array={array} />);

      const paperElement = container.querySelector(".MuiPaper-root");
      expect(paperElement).toBeInTheDocument();
    });

    it("displays formatted value in pre element", () => {
      const array = createNPArray([1, 2, 3], "int64", [3]);

      const { container } = renderWithTheme(<ArrayView array={array} />);

      const preElement = container.querySelector("pre");
      expect(preElement).toBeInTheDocument();
      // JSON.stringify with null, 2 produces multi-line output
      expect(preElement?.textContent).toContain("1");
      expect(preElement?.textContent).toContain("2");
      expect(preElement?.textContent).toContain("3");
    });

    it("displays shape with proper separator", () => {
      const array = createNPArray([1, 2], "int64", [1, 2]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/Shape: 1, 2/i)).toBeInTheDocument();
    });
  });

  describe("accessibility", () => {
    it("displays array type information in heading", () => {
      const array = createNPArray([1, 2, 3], "uint8", [3]);

      renderWithTheme(<ArrayView array={array} />);

      const heading = screen.getByText(/Array \(uint8\)/i);
      expect(heading).toBeInTheDocument();
    });

    it("displays shape information", () => {
      const array = createNPArray([1, 2, 3], "int64", [3]);

      renderWithTheme(<ArrayView array={array} />);

      expect(screen.getByText(/Shape:/i)).toBeInTheDocument();
    });
  });

  describe("data types", () => {
    it("handles int8 dtype", () => {
      const array = createNPArray([1, 2, 3], "int8", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(int8\)/i)).toBeInTheDocument();
    });

    it("handles int16 dtype", () => {
      const array = createNPArray([100, 200, 300], "int16", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(int16\)/i)).toBeInTheDocument();
    });

    it("handles int32 dtype", () => {
      const array = createNPArray([1000, 2000, 3000], "int32", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(int32\)/i)).toBeInTheDocument();
    });

    it("handles int64 dtype", () => {
      const array = createNPArray([10000, 20000, 30000], "int64", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(int64\)/i)).toBeInTheDocument();
    });

    it("handles uint8 dtype", () => {
      const array = createNPArray([255, 128, 0], "uint8", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(uint8\)/i)).toBeInTheDocument();
    });

    it("handles uint16 dtype", () => {
      const array = createNPArray([1000, 2000, 3000], "uint16", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(uint16\)/i)).toBeInTheDocument();
    });

    it("handles float16 dtype", () => {
      const array = createNPArray([1.5, 2.5, 3.5], "float16", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(float16\)/i)).toBeInTheDocument();
    });

    it("handles float32 dtype", () => {
      const array = createNPArray([1.5, 2.5, 3.5], "float32", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(float32\)/i)).toBeInTheDocument();
    });

    it("handles float64 dtype", () => {
      const array = createNPArray([1.5, 2.5, 3.5], "float64", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(float64\)/i)).toBeInTheDocument();
    });

    it("handles complex128 dtype", () => {
      const array = createNPArray([1, 2, 3], "complex128", [3]);
      renderWithTheme(<ArrayView array={array} />);
      expect(screen.getByText(/Array \(complex128\)/i)).toBeInTheDocument();
    });
  });
});
