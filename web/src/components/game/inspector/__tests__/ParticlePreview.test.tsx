import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { gameParticles } from "@nodetool-ai/protocol";

import mockTheme from "../../../../__mocks__/themeMock";
import ParticlePreview from "../editors/ParticlePreview";

const mockCreateRenderer = jest.fn();
const mockCreateRenderer3D = jest.fn();
jest.mock("@nodetool-ai/game-renderer/browser", () => ({ createGameRenderer: (...args: unknown[]) => mockCreateRenderer(...args) }));
jest.mock("@nodetool-ai/game-renderer/browser3d", () => ({ createGameRenderer3D: (...args: unknown[]) => mockCreateRenderer3D(...args) }), { virtual: true });

const PARTICLES = gameParticles.parse({ emitters: [{ id: "preview", rate: 10 }] });

beforeEach(() => { jest.clearAllMocks(); });

it.each(["2d", "3d"] as const)("passes %s frames and particles to the renderer and disposes it when removed", async (dimension) => {
  const adapter = { render: jest.fn().mockResolvedValue({}), dispose: jest.fn() };
  (dimension === "2d" ? mockCreateRenderer : mockCreateRenderer3D).mockResolvedValue(adapter);
  const view = render(<ThemeProvider theme={mockTheme}><ParticlePreview particles={PARTICLES} dimension={dimension} /></ThemeProvider>);
  expect(screen.getByRole("img", { name: `${dimension.toUpperCase()} live particle preview` })).toBeInTheDocument();
  await waitFor(() => expect(adapter.render).toHaveBeenCalled());
  const [frame, interpolation, field] = adapter.render.mock.calls[0];
  expect(frame.tick).toBeGreaterThanOrEqual(0);
  expect(interpolation).toBe(1);
  expect(typeof field.forEachParticle).toBe("function");
  if (dimension === "3d") { expect(frame.dimension).toBe("3d"); }
  else { expect(mockCreateRenderer.mock.calls[0][0].backend).toBe("canvas2d"); }
  view.unmount();
  expect(adapter.dispose).toHaveBeenCalledTimes(1);
});

it("disposes an adapter that finishes initializing after unmount without rendering", async () => {
  const adapter = { render: jest.fn().mockResolvedValue({}), dispose: jest.fn() };
  let finish!: (value: typeof adapter) => void;
  mockCreateRenderer3D.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const view = render(<ThemeProvider theme={mockTheme}><ParticlePreview particles={PARTICLES} dimension="3d" /></ThemeProvider>);
  await waitFor(() => expect(mockCreateRenderer3D).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => { finish(adapter); });
  expect(adapter.dispose).toHaveBeenCalledTimes(1);
  expect(adapter.render).not.toHaveBeenCalled();
});

it("restarts into a fresh particle field and disposes the previous renderer", async () => {
  const first = { render: jest.fn().mockResolvedValue({}), dispose: jest.fn() };
  const renderedTicks: number[] = [];
  const second = { render: jest.fn(async (frame: { tick: number }, _interpolation?: number, _particles?: unknown) => { renderedTicks.push(frame.tick); return {}; }), dispose: jest.fn() };
  mockCreateRenderer.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const view = render(<ThemeProvider theme={mockTheme}><ParticlePreview particles={PARTICLES} dimension="2d" /></ThemeProvider>);
  await waitFor(() => expect(first.render).toHaveBeenCalled());
  const initialField = first.render.mock.calls[0][2];
  fireEvent.click(screen.getByRole("button", { name: "Restart preview" }));
  await waitFor(() => expect(second.render).toHaveBeenCalled());
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(renderedTicks[0]).toBe(0);
  expect(second.render.mock.calls[0][2]).not.toBe(initialField);
  view.unmount();
  expect(second.dispose).toHaveBeenCalledTimes(1);
});
