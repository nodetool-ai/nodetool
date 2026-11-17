import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import type { CloudAccountState } from "../../../window";
import CloudAccountSettings from "../CloudAccountSettings";

jest.mock("../../support/ErrorBanner", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div role="alert">{children}</div>
}));

const signedOut: CloudAccountState = {
  available: true,
  state: "signedOut",
  displayName: "",
  serverOrigin: "https://api.nodetool.ai",
  serverEndPending: false,
  cloudAvailable: true,
  keychainAvailable: true,
  message: ""
};

type Bridge = NonNullable<NonNullable<Window["api"]>["cloudAccount"]>;

function installBridge(initial: CloudAccountState) {
  let listener: ((state: CloudAccountState) => void) | null = null;
  const bridge: Bridge = {
    state: jest.fn(async () => initial),
    signIn: jest.fn(async () => {}),
    cancelSignIn: jest.fn(async () => {}),
    signOut: jest.fn(async () => {}),
    onChange: jest.fn((callback) => {
      listener = callback;
      return () => {
        listener = null;
      };
    })
  };
  (window as unknown as { api: unknown }).api = { cloudAccount: bridge };
  return { bridge, push: (state: CloudAccountState) => listener?.(state) };
}

function renderSection() {
  return render(
    <ThemeProvider theme={mockTheme}>
      <CloudAccountSettings />
    </ThemeProvider>
  );
}

afterEach(() => {
  delete (window as unknown as { api?: unknown }).api;
});

describe("CloudAccountSettings", () => {
  it("renders nothing without the desktop bridge", () => {
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });

  it("signs in from the signed-out state", async () => {
    const { bridge } = installBridge(signedOut);
    renderSection();
    const button = await screen.findByRole("button", { name: "Sign in" });
    await userEvent.click(button);
    expect(bridge.signIn).toHaveBeenCalledTimes(1);
  });

  it("follows a sign-in made in another app and offers sign-out", async () => {
    const { bridge, push } = installBridge(signedOut);
    renderSection();
    await screen.findByRole("button", { name: "Sign in" });
    act(() => push({ ...signedOut, state: "signedIn", displayName: "Ada" }));
    const button = await screen.findByRole("button", { name: "Sign out" });
    expect(screen.getByText(/stay on this computer/)).toBeInTheDocument();
    await userEvent.click(button);
    expect(bridge.signOut).toHaveBeenCalledTimes(1);
  });

  it("offers no action when the helper is missing", async () => {
    installBridge({ ...signedOut, available: false });
    renderSection();
    await waitFor(() =>
      expect(screen.getByText("Cloud sign-in is not available in this build.")).toBeInTheDocument()
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
