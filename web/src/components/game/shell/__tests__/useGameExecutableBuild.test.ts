import { act, renderHook, waitFor } from "@testing-library/react";

import { getGameConsoleStore } from "../../../../stores/game/GameConsoleStore";
import { promptForMissingRuntimePackage } from "../../../../stores/RuntimePackagePromptStore";
import { buildGameExecutable, GameExecutableBuildError, type GameExecutableBuildEvent } from "../../../../utils/gameExecutableBuild";
import { cargoLineLevel, useGameExecutableBuild } from "../useGameExecutableBuild";

jest.mock("../../../../utils/gameExecutableBuild", () => {
  const actual = jest.requireActual("../../../../utils/gameExecutableBuild");
  return { ...actual, buildGameExecutable: jest.fn() };
});
jest.mock("../../../../stores/RuntimePackagePromptStore", () => ({ promptForMissingRuntimePackage: jest.fn() }));

const mockBuild = buildGameExecutable as jest.Mock;
const mockPrompt = promptForMissingRuntimePackage as jest.Mock;

beforeEach(() => {
  mockBuild.mockReset();
  mockPrompt.mockReset();
});

it("sorts cargo's lines by the diagnostic they start with", () => {
  expect(cargoLineLevel("error[E0425]: cannot find value")).toBe("error");
  expect(cargoLineLevel("warning: unused variable")).toBe("warning");
  expect(cargoLineLevel("   Compiling tauri v2.12.1")).toBe("log");
  expect(cargoLineLevel("errors-crate v1")).toBe("log");
});

it("shows the console, streams cargo's output into it and reports the executable", async () => {
  const gameId = "exec-build-ok";
  mockBuild.mockImplementation(async (_id: string, onEvent: (event: GameExecutableBuildEvent) => void) => {
    onEvent({ type: "log", line: "   Compiling tauri v2.12.1" });
    onEvent({ type: "log", line: "warning: unused variable" });
    return { type: "done", binary_path: "/w/bin/cave-run", project_path: "/w" };
  });
  const onStart = jest.fn();
  const { result } = renderHook(() => useGameExecutableBuild({ id: gameId, name: "Cave Run" }, onStart));
  act(() => result.current.run());
  expect(onStart).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(result.current.binaryPath).toBe("/w/bin/cave-run"));
  expect(result.current.building).toBe(false);
  const lines = getGameConsoleStore(gameId).getState().groups.map((group) => [group.level, group.source, group.message]);
  expect(lines).toEqual([
    ["log", "build", "Building a desktop executable of Cave Run from the published revision"],
    ["log", "build", "   Compiling tauri v2.12.1"],
    ["warning", "build", "warning: unused variable"],
    ["log", "build", "Built /w/bin/cave-run"]
  ]);
});

it("offers to install Rust when cargo is missing", async () => {
  const gameId = "exec-build-no-rust";
  mockBuild.mockRejectedValue(new GameExecutableBuildError("cargo was not found", "rust"));
  const { result } = renderHook(() => useGameExecutableBuild({ id: gameId, name: "Cave Run" }, () => undefined));
  act(() => result.current.run());
  await waitFor(() => expect(result.current.error).toBe("cargo was not found"));
  expect(mockPrompt).toHaveBeenCalledWith("rust");
  expect(getGameConsoleStore(gameId).getState().groups.at(-1)).toMatchObject({ level: "error", message: "cargo was not found" });
});
