/**
 * The App flow: a description becomes an installed app that runs, and a build
 * that is not green installs nothing (study-6-I1).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";

let languageModels: { provider: string; id: string; name: string }[] = [];
jest.mock("../../../../hooks/useModelsByProvider", () => ({
  useLanguageModelsByProvider: () => ({
    models: languageModels,
    isLoading: false,
    error: null,
    refetch: async () => {}
  })
}));
jest.mock("../../../../hooks/useRecommendedModelKeys", () => ({
  recommendedModelKey: (provider: string, id: string) => `${provider}:${id}`,
  useRecommendedModelKeys: () => []
}));
jest.mock("../../../../stores/GlobalChatStore", () => ({
  __esModule: true,
  default: (selector: (state: unknown) => unknown) =>
    selector({ selectedModel: null })
}));
// The model select pulls the provider catalog; the flow only needs its value.
jest.mock("../../workflow/CategoryStep", () => ({
  PlannerModelFooterField: ({
    plannerModel
  }: {
    plannerModel: { provider: string; id: string } | null;
  }) => <span>Model {plannerModel ? plannerModel.id : "none"}</span>
}));

const buildApplication = jest.fn();
jest.mock("../../../../utils/applicationBuild", () => ({
  buildApplication: (...args: unknown[]) => buildApplication(...args)
}));
const installApplicationBundle = jest.fn();
jest.mock("../../../../utils/applicationBundle", () => ({
  installApplicationBundle: (...args: unknown[]) =>
    installApplicationBundle(...args)
}));

import AppSetupHost from "../AppSetupHost";

const onFinish = jest.fn();

const renderHost = (initialBrief = "") =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AppSetupHost
        projectId="p1"
        initialBrief={initialBrief}
        onFinish={onFinish}
      />
    </ThemeProvider>
  );

beforeEach(() => {
  jest.clearAllMocks();
  languageModels = [{ provider: "openai", id: "gpt-5.4-mini", name: "GPT" }];
});

it("builds the described app, installs it in the project and hands it off", async () => {
  const bundle = { name: "Product blurb" };
  buildApplication.mockResolvedValue({ bundle, name: "Product blurb" });
  installApplicationBundle.mockResolvedValue({ id: "app-1", name: "Product blurb" });
  renderHost("A page where I type a product name and get a blurb");

  expect(screen.getByText("Model gpt-5.4-mini")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Build your app" }));

  await waitFor(() =>
    expect(onFinish).toHaveBeenCalledWith({ appId: "app-1", name: "Product blurb" })
  );
  expect(buildApplication).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: "A page where I type a product name and get a blurb",
      provider: "openai",
      model: "gpt-5.4-mini"
    })
  );
  expect(installApplicationBundle).toHaveBeenCalledWith(bundle, "p1");
});

it("shows why a build failed and installs nothing", async () => {
  buildApplication.mockRejectedValue(
    new Error("The app did not pass its test run: the button shows nothing")
  );
  renderHost("A blurb page");

  await userEvent.click(screen.getByRole("button", { name: "Build your app" }));

  expect(
    await screen.findByText(/the button shows nothing/)
  ).toBeInTheDocument();
  expect(installApplicationBundle).not.toHaveBeenCalled();
  expect(onFinish).not.toHaveBeenCalled();
});

it("waits for a description and a model before it builds", async () => {
  languageModels = [];
  renderHost();
  expect(screen.getByRole("button", { name: "Build your app" })).toBeDisabled();
  expect(screen.getByText("Describe the app first")).toBeInTheDocument();
  await userEvent.type(screen.getByRole("textbox"), "A blurb page");
  expect(
    screen.getByText("Connect a provider to pick a model")
  ).toBeInTheDocument();
});
