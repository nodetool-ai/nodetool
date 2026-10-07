import { createRef, useLayoutEffect } from "react";
import { render, screen } from "@testing-library/react";

import { createGamePanelLayout } from "../../../../stores/game/GamePanelLayout";
import { createGamePanelLayoutStore } from "../../../../stores/game/GamePanelLayoutStore";
import { useGameDockPresentation, type GameDockPresentation, type GameDockPresentationInput } from "../useGameDockPresentation";

function fixture(): GameDockPresentationInput {
  const store = createGamePanelLayoutStore({ anonymous: true }, {
    getItem: () => null, setItem: () => undefined, removeItem: () => undefined
  });
  return { root: createRef<HTMLDivElement>(), store, layout: store.getState().layout, registry: [], dimension: "2d", availableIds: ["scripts"],
    views: [{ id: "scripts", node: <input aria-label="Script source" defaultValue="first" /> }] };
}

function Observe({ presentation, commits }: {
  presentation: GameDockPresentation;
  commits: Array<{ transitioning: boolean; sourcePresent: boolean; captured: HTMLElement | null }>;
}): null {
  useLayoutEffect(() => {
    commits.push({ transitioning: presentation.transitioning,
      sourcePresent: Boolean(document.querySelector('[aria-label="Script source"]')),
      captured: presentation.focusSnapshot.current?.node ?? null });
  });
  return null;
}

function Harness({ desired, commits }: {
  desired: GameDockPresentationInput;
  commits: Array<{ transitioning: boolean; sourcePresent: boolean; captured: HTMLElement | null }>;
}) {
  const presentation = useGameDockPresentation(desired);
  return <section ref={desired.root}>
    {presentation.views.map((view) => <div key={view.id} data-game-panel-host={view.id}>{view.node}</div>)}
    <Observe presentation={presentation} commits={commits} />
  </section>;
}

it("retains closing content for capture, consumes the snapshot, and does not resurrect intentional body focus", () => {
  const desired = fixture();
  const commits: Array<{ transitioning: boolean; sourcePresent: boolean; captured: HTMLElement | null }> = [];
  const rendered = render(<Harness desired={desired} commits={commits} />);
  const source = screen.getByRole("textbox", { name: "Script source" });
  source.focus();
  commits.length = 0;
  rendered.rerender(<Harness desired={{ ...desired, availableIds: [], views: [{ id: "scripts", node: null }] }} commits={commits} />);
  expect(commits).toEqual([
    { transitioning: true, sourcePresent: true, captured: null },
    { transitioning: false, sourcePresent: false, captured: source }
  ]);
  expect(document.activeElement).toBe(document.body);
  commits.length = 0;
  rendered.rerender(<Harness desired={{ ...desired, layout: createGamePanelLayout("Wide"),
    availableIds: [], views: [{ id: "scripts", node: null }] }} commits={commits} />);
  expect(commits.every((commit) => commit.captured === null)).toBe(true);
  expect(document.activeElement).toBe(document.body);
});

it("flows current supplied content directly when presentation metadata is unchanged", () => {
  const desired = fixture();
  const commits: Array<{ transitioning: boolean; sourcePresent: boolean; captured: HTMLElement | null }> = [];
  const rendered = render(<Harness desired={desired} commits={commits} />);
  commits.length = 0;
  rendered.rerender(<Harness desired={{ ...desired, views: [{ id: "scripts", node: <output>Current frame 42</output> }] }} commits={commits} />);
  expect(screen.getByText("Current frame 42")).toBeInTheDocument();
  expect(commits).toHaveLength(1);
  expect(commits[0].transitioning).toBe(false);
});
