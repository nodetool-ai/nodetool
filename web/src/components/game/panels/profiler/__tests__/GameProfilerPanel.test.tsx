import { Profiler } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../../../__mocks__/themeMock";
import { createGameProfiler, type GameProfiler } from "../gameProfiler";
import GameProfilerPanel from "../GameProfilerPanel";
import { downloadGameProfile } from "../gameProfileModel";
import { GAME_PROFILER_REFRESH_MS } from "../useGameProfilerView";

jest.mock("../gameProfileModel", () => ({
  ...jest.requireActual<typeof import("../gameProfileModel")>("../gameProfileModel"),
  downloadGameProfile: jest.fn()
}));

const document = { scenes: [{ entities: [{ id: "player", name: "Hero" }, { id: "door" }] }] };
const source = { gameId: "game-1", name: "Cave", dimension: "3d", tickRate: 60 } as const;

function renderPanel(profiler: GameProfiler | undefined, dimension: "2d" | "3d" = "3d") {
  return render(<ThemeProvider theme={mockTheme}>
    <GameProfilerPanel profiler={profiler} document={document} source={{ ...source, dimension }} />
  </ThemeProvider>);
}

function recordTicks(profiler: GameProfiler, from: number, count: number): void {
  for (let tick = from; tick < from + count; tick++) {
    profiler.recordRender({ drawCalls: 40 + tick, textureBytes: 2 * 1024 * 1024, triangles: 1200, geometryBytes: 512 * 1024 }, tick * 16);
    profiler.recordStep({ tick, voices: 3, physics: { bodies: 7, contacts: tick % 2 },
      timings: { systems: [{ system: "scripts", durationMs: 1 }, { system: "physics", durationMs: 0.5 }], totalMs: 1.6 },
      scriptStats: { durationMs: 1, calls: 2, commands: 2, byEntity: { player: { durationMs: 0.75, calls: 1 }, door: { durationMs: 0.25, calls: 1 } } } });
  }
}

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

it("asks for a play session until samples arrive, then shows every metric group", () => {
  const profiler = createGameProfiler();
  renderPanel(profiler);
  expect(screen.getByText("No samples yet")).toBeInTheDocument();
  expect(profiler.recording()).toBe(true);
  act(() => { recordTicks(profiler, 1, 30); });
  // Samples reach the panel at its refresh rate, not once per tick.
  expect(screen.getByText("No samples yet")).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(GAME_PROFILER_REFRESH_MS); });
  expect(screen.getByTestId("profiler-status")).toHaveTextContent("Live · last 30 ticks");
  expect(screen.getByRole("img", { name: /^Frame time, 16\.0 ms avg/ })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /^Simulation step time, 1\.60 ms avg/ })).toBeInTheDocument();
  const simulation = within(screen.getByRole("region", { name: "Simulation CPU" }));
  expect(simulation.getByText("scripts")).toBeInTheDocument();
  expect(simulation.getByText("physics")).toBeInTheDocument();
  const scripts = within(screen.getByRole("region", { name: "Scripts" }));
  const rows = scripts.getAllByText(/calls$/).map((row) => row.parentElement?.textContent);
  expect(rows).toEqual(["Hero0.75 ms avg · 0.75 ms max · 30 calls", "door0.25 ms avg · 0.25 ms max · 30 calls"]);
  const rendering = within(screen.getByRole("region", { name: "Rendering" }));
  expect(rendering.getByText("70 now · 70 max")).toBeInTheDocument();
  expect(rendering.getByText("1,200 now · 1,200 max")).toBeInTheDocument();
  expect(rendering.getByText("2.0 MB now · 2.0 MB max")).toBeInTheDocument();
  expect(rendering.getByText("512.0 KB now · 512.0 KB max")).toBeInTheDocument();
  const physics = within(screen.getByRole("region", { name: "Physics and audio" }));
  expect(physics.getByText("Bodies").parentElement).toHaveTextContent("7 now · 7 max");
  expect(physics.getByText("Contacts").parentElement).toHaveTextContent("0 now · 1 max");
  expect(physics.getByText("Audio voices").parentElement).toHaveTextContent("3 now · 3 max");
});

it("records a capture, shows it after stopping and exports it as JSON", async () => {
  const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
  const profiler = createGameProfiler();
  renderPanel(profiler);
  expect(screen.getByRole("button", { name: "Export JSON" })).toBeDisabled();
  act(() => { recordTicks(profiler, 1, 5); });
  await user.click(screen.getByRole("button", { name: "Record" }));
  expect(profiler.capturing()).toBe(true);
  expect(screen.getByTestId("profiler-status")).toHaveTextContent("Recording a capture");
  act(() => {
    recordTicks(profiler, 6, 12);
    jest.advanceTimersByTime(GAME_PROFILER_REFRESH_MS);
  });
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(screen.getByTestId("profiler-status")).toHaveTextContent(/^Capture · [\d.]+ s · 12 ticks$/);
  act(() => {
    recordTicks(profiler, 18, 40);
    jest.advanceTimersByTime(GAME_PROFILER_REFRESH_MS);
  });
  // The capture stays on screen while the live window keeps filling.
  expect(screen.getByTestId("profiler-status")).toHaveTextContent("12 ticks");
  await user.click(screen.getByRole("button", { name: "Export JSON" }));
  expect(downloadGameProfile).toHaveBeenCalledTimes(1);
  const profile = jest.mocked(downloadGameProfile).mock.calls[0][0];
  expect(profile.game).toEqual(source);
  expect(profile.samples.map((sample) => sample.tick)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  expect(profile.summary.scripts[0]).toMatchObject({ entityId: "player", calls: 12 });
  await user.click(screen.getByRole("button", { name: "Live" }));
  expect(screen.getByTestId("profiler-status")).toHaveTextContent("Live · last 57 ticks");
  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(screen.getByText("No samples yet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Export JSON" })).toBeDisabled();
});

it("labels the metrics a 2D renderer does not report and stops recording when closed", () => {
  const profiler = createGameProfiler();
  const view = renderPanel(profiler, "2d");
  act(() => {
    profiler.recordRender({ drawCalls: 9, textureBytes: 4096 }, 0);
    profiler.recordStep({ tick: 1 });
    jest.advanceTimersByTime(GAME_PROFILER_REFRESH_MS);
  });
  const rendering = within(screen.getByRole("region", { name: "Rendering" }));
  expect(rendering.getByText("Triangles").parentElement).toHaveTextContent("Not reported in 2D");
  expect(rendering.getByText("Draw calls").parentElement).toHaveTextContent("9 now · 9 max");
  view.unmount();
  expect(profiler.recording()).toBe(false);
});

it("disables its controls without a play session", () => {
  renderPanel(undefined);
  expect(screen.getByRole("button", { name: "Record" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  expect(screen.getByText("No samples yet")).toBeInTheDocument();
});

it("neither records nor re-renders while it sits in a background dock tab", () => {
  const profiler = createGameProfiler();
  const host = window.document.createElement("div");
  host.hidden = true;
  window.document.body.appendChild(host);
  const commits = jest.fn();
  const view = render(<ThemeProvider theme={mockTheme}><Profiler id="profiler-panel" onRender={commits}>
    <GameProfilerPanel profiler={profiler} document={document} source={source} />
  </Profiler></ThemeProvider>, { container: host });
  try {
    commits.mockClear();
    expect(profiler.recording()).toBe(false);
    act(() => {
      recordTicks(profiler, 1, 30);
      jest.advanceTimersByTime(GAME_PROFILER_REFRESH_MS * 4);
    });
    expect(profiler.samples()).toEqual([]);
    expect(commits).not.toHaveBeenCalled();
    host.hidden = false;
    act(() => { jest.advanceTimersByTime(GAME_PROFILER_REFRESH_MS); });
    expect(profiler.recording()).toBe(true);
    act(() => {
      recordTicks(profiler, 31, 3);
      jest.advanceTimersByTime(GAME_PROFILER_REFRESH_MS);
    });
    expect(screen.getByTestId("profiler-status")).toHaveTextContent("Live · last 3 ticks");
  } finally {
    view.unmount();
    host.remove();
  }
});
