import React from "react";
import { render, screen } from "@testing-library/react";

// Mock theme to avoid font imports
jest.mock("../themes/ThemeNodetool", () => ({
  __esModule: true,
  default: {
    palette: { grey: { 50: "#eee" } },
    fontFamily1: "monospace",
    vars: {
      palette: {
        grey: {
          0: "#000000",
          50: "#fafafa",
          100: "#f5f5f5",
          200: "#eeeeee",
          300: "#e0e0e0",
          400: "#bdbdbd",
          500: "#9e9e9e",
          600: "#757575",
          700: "#616161",
          800: "#424242",
          900: "#212121"
        }
      }
    },
    shape: { borderRadius: 4 },
    components: {
      MuiTooltip: {
        styleOverrides: {
          tooltip: {}
        }
      }
    }
  }
}));

// Mock data types to avoid svg imports
jest.mock("../../config/data_types", () => ({
  __esModule: true,
  DATA_TYPES: [{ color: "#000", textColor: "#fff" }]
}));

import Logo from "../Logo";

jest.spyOn(global.Math, "random").mockReturnValue(0);

afterAll(() => {
  (Math.random as jest.Mock).mockRestore();
});

describe("Logo", () => {
  it("renders image when small is true", () => {
    render(
      <Logo
        width="20px"
        height="20px"
        fontSize="10px"
        borderRadius="0"
        small
        enableText
      />
    );
    expect(screen.getByAltText("NodeTool")).toBeInTheDocument();
  });

  it("renders text when enableText is true", () => {
    render(
      <Logo
        width="20px"
        height="20px"
        fontSize="10px"
        borderRadius="0"
        small={false}
        enableText
      />
    );
    const text = screen.getByText(/NODE/);
    expect(text).toBeInTheDocument();
  });
});
