import { render } from "@testing-library/react";
import { ThemeToggleButtonInternal } from "../ThemeToggleButton";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

jest.mock("@mui/material/styles", () => {
  const actual = jest.requireActual("@mui/material/styles");
  return {
    ...actual,
    useColorScheme: () => ({ mode: "dark", setMode: jest.fn() }),
  };
});

describe("ThemeToggleButton", () => {
  it("renders correctly", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ThemeToggleButtonInternal />
      </ThemeProvider>
    );
    expect(container).toBeTruthy();
  });

  it("accepts and applies tabIndex prop", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <ThemeToggleButtonInternal tabIndex={-1} />
      </ThemeProvider>
    );
    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    expect(button?.getAttribute("tabIndex")).toBe("-1");
  });
});
