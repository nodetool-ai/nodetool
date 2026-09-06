import { renderHook, act } from "@testing-library/react";
import * as ReactRouterDom from "react-router-dom";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useRecipeActions } from "../useRecipeActions";

const mockCreateWorkflow = jest.fn();
const mockInstallExampleApp = jest.fn();
const mockOpenApplication = jest.fn();

jest.mock("../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: jest.fn(
    (selector: (state: { create: jest.Mock }) => unknown) =>
      selector({ create: mockCreateWorkflow })
  )
}));

jest.mock("../../utils/exampleApps", () => ({
  installExampleApp: (...args: unknown[]) => mockInstallExampleApp(...args)
}));

jest.mock("../useOpenApplication", () => ({
  useOpenApplication: () => mockOpenApplication
}));

jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: jest.fn()
}));

const step = (example: string) => ({
  example,
  packageName: "nodetool-base",
  description: `${example} description`
});

const recipe = {
  slug: "viral-video-ad-engine",
  name: "Viral Video Ad Engine",
  outcome: "",
  audience: "",
  summary: [],
  caveats: [],
  thumbnailUrl: null,
  providers: [],
  nodeCount: 0,
  apps: [
    {
      slug: "viral-ad-engine",
      name: "Viral Ad Engine",
      description: "",
      role: "",
      workflows: ["Ad Copy in Three Registers"],
      operationCount: 1,
      thumbnailUrl: null
    }
  ],
  steps: [
    { ...step("Ad Copy in Three Registers"), exampleId: "a.json", role: "", handoff: "", thumbnailUrl: null, nodeCount: 2, models: [], alternative: null },
    { ...step("Ad Loop from a Product Photo"), exampleId: "b.json", role: "", handoff: "", thumbnailUrl: null, nodeCount: 3, models: [], alternative: null }
  ]
};

describe("useRecipeActions", () => {
  const mockNavigate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    let created = 0;
    mockCreateWorkflow.mockImplementation(async () => ({
      id: `wf-${++created}`
    }));
    jest.mocked(ReactRouterDom.useNavigate).mockReturnValue(mockNavigate);
    mockInstallExampleApp.mockResolvedValue({
      id: "app-1",
      name: "Viral Ad Engine"
    });
  });

  it("installs a recipe's app and opens it", async () => {
    const { result } = renderHook(() => useRecipeActions());

    await act(() => result.current.installApp("viral-ad-engine"));

    expect(mockInstallExampleApp).toHaveBeenCalledWith("viral-ad-engine");
    expect(mockOpenApplication).toHaveBeenCalledWith("app-1", "Viral Ad Engine");
    expect(result.current.installingApp).toBeNull();
  });

  it("stays put and says so when the install fails", async () => {
    mockInstallExampleApp.mockRejectedValueOnce(new Error("no server"));
    const { result } = renderHook(() => useRecipeActions());

    await act(() => result.current.installApp("viral-ad-engine"));

    expect(mockOpenApplication).not.toHaveBeenCalled();
    expect(
      useNotificationStore
        .getState()
        .notifications.some((n) => n.content.includes("no server"))
    ).toBe(true);
    expect(result.current.installingApp).toBeNull();
  });

  it("copies one step from its example and opens it", async () => {
    const { result } = renderHook(() => useRecipeActions());

    await act(() =>
      result.current.openStep("viral-video-ad-engine", step("Transcribe a Clip"))
    );

    expect(mockCreateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Transcribe a Clip",
        package_name: "nodetool-base",
        tags: ["example"]
      }),
      "nodetool-base",
      "Transcribe a Clip"
    );
    expect(mockNavigate).toHaveBeenCalledWith("/editor/wf-1");
    expect(result.current.copyingStep).toBeNull();
  });

  it("copies every step in order and opens the first", async () => {
    const { result } = renderHook(() => useRecipeActions());

    await act(() => result.current.addRecipe(recipe));

    expect(mockCreateWorkflow.mock.calls.map((call) => call[2])).toEqual([
      "Ad Copy in Three Registers",
      "Ad Loop from a Product Photo"
    ]);
    expect(mockNavigate).toHaveBeenCalledWith("/editor/wf-1");
    expect(result.current.addingSlug).toBeNull();
  });

  it("stops the chain and stays put when a copy fails", async () => {
    mockCreateWorkflow.mockRejectedValueOnce(new Error("no server"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRecipeActions());

    await act(() => result.current.addRecipe(recipe));

    expect(mockCreateWorkflow).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.addingSlug).toBeNull();
  });
});
