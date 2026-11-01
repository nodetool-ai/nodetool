import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import WorkerApiKeySetup from "../WorkerApiKeySetup";

const mockUpdateSecret = jest.fn(async () => undefined);
const mockValidateSecret = jest.fn();
const mockAddNotification = jest.fn();

jest.mock("../../../stores/SecretsStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({
      updateSecret: mockUpdateSecret,
      validateSecret: mockValidateSecret
    })
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: (selector: (state: unknown) => unknown) =>
    selector({ addNotification: mockAddNotification })
}));

const renderSetup = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <WorkerApiKeySetup target="runpod" />
    </ThemeProvider>
  );

describe("WorkerApiKeySetup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("checks a RunPod key, then stores it", async () => {
    mockValidateSecret.mockResolvedValue({ status: "valid", valid: true, message: "" });
    renderSetup();

    await userEvent.type(screen.getByLabelText(/RunPod API key/i), " rp-key ");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    await waitFor(() =>
      expect(mockUpdateSecret).toHaveBeenCalledWith("RUNPOD_API_KEY", "rp-key")
    );
    expect(mockValidateSecret).toHaveBeenCalledWith("RUNPOD_API_KEY", "rp-key");
    expect(mockAddNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success" })
    );
  });

  it("does not store a key RunPod rejects unless the user insists", async () => {
    mockValidateSecret.mockResolvedValue({ status: "invalid", valid: false, message: "" });
    renderSetup();

    await userEvent.type(screen.getByLabelText(/RunPod API key/i), "bad");
    await userEvent.click(screen.getByRole("button", { name: /^connect$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/rejected/i);
    expect(mockUpdateSecret).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /save anyway/i }));
    await waitFor(() =>
      expect(mockUpdateSecret).toHaveBeenCalledWith("RUNPOD_API_KEY", "bad")
    );
  });
});
