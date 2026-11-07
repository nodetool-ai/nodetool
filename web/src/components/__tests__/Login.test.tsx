import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@emotion/react";
import mockTheme from "../../__mocks__/themeMock";
import Login from "../Login";

let mockSso = false;
let mockAuthState: Record<string, unknown> = {};
const mockSignInWithSso = jest.fn();

jest.mock("../../stores/useAuth", () => ({
  __esModule: true,
  default: (selector: (s: unknown) => unknown) =>
    selector({
      state: "logged_out",
      error: null,
      signInWithProvider: jest.fn(),
      signInWithSso: mockSignInWithSso,
      ...mockAuthState
    })
}));

jest.mock("../../lib/runtimeConfig", () => ({
  isSsoMode: () => mockSso,
  getRuntimeConfig: () => ({ ssoProviderName: "Acme Okta" })
}));

const renderLogin = () =>
  render(
    <ThemeProvider theme={mockTheme as never}>
      <Login />
    </ThemeProvider>
  );

describe("Login", () => {
  beforeEach(() => {
    mockSso = false;
    mockAuthState = {};
    mockSignInWithSso.mockReset();
  });

  it("renders the alpha disclosure and hero copy", () => {
    renderLogin();
    expect(screen.getByText(/Cloud alpha/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sign in to NodeTool Cloud" })
    ).toBeInTheDocument();
    expect(screen.getByText(/Sign in with Google/)).toBeInTheDocument();
    expect(screen.getByText(/list prices/)).toBeInTheDocument();
  });

  it("offers the operator's identity provider in SSO mode, without the cloud copy", () => {
    mockSso = true;
    renderLogin();
    expect(
      screen.getByRole("heading", { name: "Sign in to NodeTool" })
    ).toBeInTheDocument();
    expect(screen.queryByText(/Cloud alpha/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sign in with Google/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in with Acme Okta" }));
    expect(mockSignInWithSso).toHaveBeenCalledTimes(1);
  });

  it("shows why an SSO sign-in failed", () => {
    mockSso = true;
    mockAuthState = { state: "error", error: "not_allowed" };
    renderLogin();
    expect(screen.getByText(/Sign-in failed \(not_allowed\)/)).toBeInTheDocument();
  });
});
