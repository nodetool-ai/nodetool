import { afterEach, expect, it, vi } from "vitest";
import {
  isCloudNodeType,
  isCloudProvider,
  BUILTIN_NODE_PACKS
} from "@nodetool-ai/protocol";

const register = vi.hoisted(() => vi.fn());
vi.mock("@nodetool-ai/runtime", async (original) => ({
  ...(await original<typeof import("@nodetool-ai/runtime")>()),
  registerProvider: register
}));
afterEach(() => {
  vi.unstubAllEnvs();
  register.mockClear();
});
it("registers both providers once outside the cloud profile", async () => {
  vi.resetModules();
  vi.stubEnv("NODETOOL_NODE_PROFILE", "full");
  const {
    registerWhisperCppProviders,
    WhisperCppProvider,
    WhisperServerProvider
  } = await import("../src/index.js");
  registerWhisperCppProviders();
  registerWhisperCppProviders();
  expect(register.mock.calls.map((call) => call[0])).toEqual([
    "whisper_cpp",
    "whisper_cpp_server"
  ]);
  expect(new WhisperCppProvider().getCapabilities()).toEqual([
    "automatic_speech_recognition"
  ]);
  expect(
    new WhisperServerProvider({
      WHISPER_CPP_SERVER_URL: "http://localhost"
    }).getCapabilities()
  ).toEqual(["automatic_speech_recognition"]);
}, 30000);
it("excludes providers and live nodes from the cloud profile", async () => {
  vi.resetModules();
  vi.stubEnv("NODETOOL_NODE_PROFILE", "cloud");
  const { registerWhisperCppProviders } = await import("../src/index.js");
  registerWhisperCppProviders();
  expect(register).not.toHaveBeenCalled();
  expect(isCloudProvider("whisper_cpp")).toBe(false);
  expect(isCloudProvider("whisper_cpp_server")).toBe(false);
  expect(isCloudNodeType("whisper_cpp.LiveTranscription")).toBe(false);
  expect(
    BUILTIN_NODE_PACKS.find((pack) => pack.id === "whisper-cpp")?.defaultEnabled
  ).toBeUndefined();
});
