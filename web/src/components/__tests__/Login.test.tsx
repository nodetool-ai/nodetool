import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@emotion/react";
import mockTheme from "../../__mocks__/themeMock";
import Login from "../Login";

jest.mock("../../stores/useAuth", () => ({
  __esModule: true,
  default: (selector: (s: unknown) => unknown) =>
    selector({ state: "logged_out", signInWithProvider: jest.fn() })
}));

describe("Login", () => {
  it("renders the alpha disclosure and hero copy", () => {
    render(
      <ThemeProvider theme={mockTheme as never}>
        <Login />
      </ThemeProvider>
    );
    expect(screen.getByText(/Cloud alpha/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sign in to NodeTool Cloud" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Sign in with Google/)).toBeInTheDocument();
    expect(screen.getByText(/list prices/)).toBeInTheDocument();
  });
});
