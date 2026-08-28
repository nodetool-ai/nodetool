import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import { OAuthManualCompletionDialog } from "../OAuthManualCompletionDialog";

const prompt = {
  authUrl: "https://auth.openai.com/oauth/authorize?x=1",
  redirectUri: "http://localhost:1455/auth/callback"
};

const renderDialog = (
  overrides: Partial<
    React.ComponentProps<typeof OAuthManualCompletionDialog>
  > = {}
) => {
  const props = {
    prompt,
    label: "OpenAI",
    isSubmitting: false,
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
    ...overrides
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <OAuthManualCompletionDialog {...props} />
    </ThemeProvider>
  );
  return props;
};

describe("OAuthManualCompletionDialog", () => {
  it("renders nothing when no login is waiting on a paste", () => {
    renderDialog({ prompt: null });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the redirect address the user should look for", () => {
    renderDialog();
    expect(
      screen.getByText("http://localhost:1455/auth/callback")
    ).toBeInTheDocument();
  });

  it("hands the pasted address to onSubmit", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();

    const address = "http://localhost:1455/auth/callback?code=ac_abc&state=st";
    await user.type(screen.getByLabelText("Redirect address"), address);
    await user.click(screen.getByRole("button", { name: "Connect" }));

    expect(onSubmit).toHaveBeenCalledWith(address);
  });

  it("keeps Connect disabled until something is pasted", async () => {
    const user = userEvent.setup();
    renderDialog();

    const connect = screen.getByRole("button", { name: "Connect" });
    expect(connect).toBeDisabled();

    await user.type(screen.getByLabelText("Redirect address"), "x");
    expect(connect).toBeEnabled();
  });
});
