import useRuntimePackagePromptStore, {
  promptForMissingPackage,
  promptForMissingRuntimePackage,
  resetMissingPackagePrompt
} from "../RuntimePackagePromptStore";

describe("promptForMissingPackage", () => {
  beforeEach(() => {
    useRuntimePackagePromptStore.setState({ packageId: null });
    resetMissingPackagePrompt("run-1");
  });

  it("opens the install dialog for the missing package once per run", () => {
    const detail = {
      code: "missing_runtime_package",
      runtime_package: "whisper-cpp"
    };
    promptForMissingPackage(detail, "run-1");
    expect(useRuntimePackagePromptStore.getState().packageId).toBe("whisper-cpp");

    useRuntimePackagePromptStore.getState().dismiss();
    promptForMissingPackage(detail, "run-1");
    expect(useRuntimePackagePromptStore.getState().packageId).toBeNull();

    resetMissingPackagePrompt("run-1");
    promptForMissingPackage(detail, "run-1");
    expect(useRuntimePackagePromptStore.getState().packageId).toBe("whisper-cpp");
  });

  it("ignores other failures", () => {
    promptForMissingPackage({ code: "provider_auth", provider: "openai" }, "run-1");
    expect(useRuntimePackagePromptStore.getState().packageId).toBeNull();
  });
});

describe("promptForMissingRuntimePackage", () => {
  beforeEach(() => {
    useRuntimePackagePromptStore.setState({ packageId: null });
  });

  it("opens the install dialog for a package a response named", () => {
    promptForMissingRuntimePackage("office-documents");
    expect(useRuntimePackagePromptStore.getState().packageId).toBe(
      "office-documents"
    );
  });

  it("ignores a response that names no package", () => {
    promptForMissingRuntimePackage(undefined);
    promptForMissingRuntimePackage("");
    promptForMissingRuntimePackage(42);
    expect(useRuntimePackagePromptStore.getState().packageId).toBeNull();
  });
});
