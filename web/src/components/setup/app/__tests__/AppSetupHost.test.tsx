/**
 * The App flow: a description becomes a design the creator reviews, the
 * reviewed design is what gets built, and a build that is not green installs
 * nothing (study-6-I1).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../__mocks__/themeMock";
import type { AppSpec } from "../../../../utils/applicationBuild";

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
const createApplication = jest.fn();
jest.mock("../../../../hooks/useApplications", () => ({
  useCreateApplication: () => ({ mutateAsync: createApplication })
}));
jest.mock("../../../support/ReportBugButton", () => ({
  __esModule: true,
  default: () => null
}));

const buildApplication = jest.fn();
const specifyApplication = jest.fn();
jest.mock("../../../../utils/applicationBuild", () => ({
  ...jest.requireActual("../../../../utils/applicationBuild"),
  buildApplication: (...args: unknown[]) => buildApplication(...args),
  specifyApplication: (...args: unknown[]) => specifyApplication(...args)
}));
const installApplicationBundle = jest.fn();
jest.mock("../../../../utils/applicationBundle", () => ({
  installApplicationBundle: (...args: unknown[]) =>
    installApplicationBundle(...args)
}));

import AppSetupHost from "../AppSetupHost";

const SPEC: AppSpec = {
  title: "Product blurb",
  operations: [
    {
      id: "write-blurb",
      objective: "Write a two-sentence blurb for the product",
      inputs: [{ name: "product", type: "string", example: "a kettle" }],
      outputs: [{ name: "blurb", type: "string" }],
      streaming: false
    }
  ],
  variables: [],
  widgets: [
    {
      role: "product-input",
      type: "TextInput",
      binding: "op:write-blurb/in:product",
      label: "Product"
    },
    { role: "run", type: "Button", binding: "", label: "Write it" },
    {
      role: "blurb-output",
      type: "Markdown",
      binding: "op:write-blurb/out:blurb",
      label: "Blurb"
    }
  ],
  interactions: [
    {
      name: "write-once",
      steps: [{ click: "Write it" }],
      expect: [{ widget: "blurb-output", check: "nonEmpty" }]
    }
  ]
};

const onFinish = jest.fn();
const BRIEF = "A page where I type a product name and get a blurb";

const renderHost = (
  initialBrief = "",
  draftKey: string | null = crypto.randomUUID()
) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AppSetupHost
        projectId="p1"
        draftKey={draftKey ?? undefined}
        initialBrief={initialBrief}
        onFinish={onFinish}
      />
    </ThemeProvider>
  );

const button = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  languageModels = [{ provider: "openai", id: "gpt-5.4-mini", name: "GPT" }];
  specifyApplication.mockResolvedValue(SPEC);
});

it("writes a design, builds the reviewed design, and installs it under its name", async () => {
  const bundle = { name: "Product blurb", app: {}, workflows: [] };
  buildApplication.mockResolvedValue({ bundle, name: "Product blurb" });
  installApplicationBundle.mockResolvedValue({ id: "app-1", name: "Blurbs" });
  renderHost(BRIEF);

  expect(screen.getAllByText("Model gpt-5.4-mini").length).toBeGreaterThan(0);
  await userEvent.click(button("Write the design"));

  expect(await screen.findByText("Review the design")).toBeInTheDocument();
  expect(specifyApplication).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: BRIEF,
      provider: "openai",
      model: "gpt-5.4-mini"
    })
  );
  const objective = screen.getByDisplayValue(
    "Write a two-sentence blurb for the product"
  );
  await userEvent.clear(objective);
  await userEvent.type(objective, "Write one punchy line");
  // Renaming a widget repoints the interaction that named it by label.
  const label = screen.getByDisplayValue("Write it");
  await userEvent.clear(label);
  await userEvent.type(label, "Go");
  await userEvent.click(button("Continue to the build"));

  const name = await screen.findByLabelText("App name");
  expect(name).toHaveValue("Product blurb");
  await userEvent.clear(name);
  await userEvent.type(name, "Blurbs");
  await userEvent.click(button("Build your app"));

  await waitFor(() =>
    expect(onFinish).toHaveBeenCalledWith({ appId: "app-1", name: "Blurbs" })
  );
  const built = buildApplication.mock.calls[0]?.[0] as {
    spec: AppSpec;
    costCapUsd: number;
  };
  expect(built.spec.operations[0]?.objective).toBe("Write one punchy line");
  expect(built.spec.widgets[1]?.label).toBe("Go");
  expect(built.spec.interactions[0]?.steps).toEqual([{ click: "run" }]);
  expect(built.costCapUsd).toBe(2);
  expect(installApplicationBundle).toHaveBeenCalledWith(
    { ...bundle, name: "Blurbs" },
    "p1"
  );
});

it("keeps the reviewed design when the brief is unchanged", async () => {
  renderHost(BRIEF);
  await userEvent.click(button("Write the design"));
  await screen.findByText("Review the design");

  await userEvent.click(button("Back"));
  await userEvent.click(await screen.findByRole("button", {
    name: "Continue to your design"
  }));

  expect(await screen.findByText("Review the design")).toBeInTheDocument();
  expect(specifyApplication).toHaveBeenCalledTimes(1);
});

it("blocks the build while the design has a gap", async () => {
  renderHost(BRIEF);
  await userEvent.click(button("Write the design"));
  await userEvent.clear(await screen.findByDisplayValue("Product blurb"));

  expect(button("Continue to the build")).toBeDisabled();
  expect(screen.getByText("Write a title")).toBeInTheDocument();
});

it("resumes at the review after a reload", async () => {
  // Without a guided tab the draft is kept under the project.
  const draftKey = null;
  const first = renderHost(BRIEF, draftKey);
  await userEvent.click(button("Write the design"));
  await screen.findByText("Review the design");
  first.unmount();

  renderHost("", draftKey);

  expect(screen.getByText("Review the design")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Product blurb")).toBeInTheDocument();
});

it("shows why a build failed and installs nothing", async () => {
  buildApplication.mockRejectedValue(
    new Error("The app did not pass its test run: the button shows nothing")
  );
  renderHost(BRIEF);
  await userEvent.click(button("Write the design"));
  await userEvent.click(await screen.findByRole("button", {
    name: "Continue to the build"
  }));
  await userEvent.click(await screen.findByRole("button", {
    name: "Build your app"
  }));

  expect(
    await screen.findByText(/the button shows nothing/)
  ).toBeInTheDocument();
  expect(installApplicationBundle).not.toHaveBeenCalled();
  expect(onFinish).not.toHaveBeenCalled();
});

it("waits for a description and a model before it writes the design", async () => {
  languageModels = [];
  renderHost();
  expect(button("Write the design")).toBeDisabled();
  expect(screen.getByText("Describe the app first")).toBeInTheDocument();
  await userEvent.type(screen.getByRole("textbox"), "A blurb page");
  expect(
    screen.getByText("Connect a provider to pick a model")
  ).toBeInTheDocument();
});

it("starts a blank app without a design", async () => {
  createApplication.mockResolvedValue({ id: "app-2", name: "Untitled app" });
  renderHost();

  await userEvent.click(
    screen.getByRole("button", { name: /Start with a blank app/ })
  );

  await waitFor(() =>
    expect(onFinish).toHaveBeenCalledWith({
      appId: "app-2",
      name: "Untitled app"
    })
  );
  expect(createApplication).toHaveBeenCalledWith(
    expect.objectContaining({ projectId: "p1" })
  );
  expect(specifyApplication).not.toHaveBeenCalled();
});
