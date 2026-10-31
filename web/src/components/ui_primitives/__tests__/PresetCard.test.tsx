import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { PresetCard, presetFamilies } from "../PresetCard";
import { makePreset, PREVIEW } from "../../../test-utils/presetFixtures";

const mockReducedMotion = (reduce: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    })
  });
};

const renderCard = (props: Partial<React.ComponentProps<typeof PresetCard>> = {}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <PresetCard preset={makePreset("camera.dolly", { preview: PREVIEW })} {...props} />
    </ThemeProvider>
  );

describe("PresetCard", () => {
  beforeEach(() => mockReducedMotion(false));

  it("shows the name and family badges but no video at rest", () => {
    const { container } = renderCard();
    expect(screen.getByRole("button", { name: "dolly" })).toBeInTheDocument();
    expect(screen.getByText("Kling")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", PREVIEW.poster);
  });

  it("plays a muted loop on hover and stops on leave", () => {
    const { container } = renderCard();
    const card = screen.getByRole("button", { name: "dolly" });
    fireEvent.mouseEnter(card);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", PREVIEW.url);
    expect(video?.loop).toBe(true);
    expect(video?.muted).toBe(true);
    expect(container.querySelector(".controls")).toBeNull();
    fireEvent.mouseLeave(card);
    expect(container.querySelector("video")).toBeNull();
  });

  it("plays on keyboard focus and stops on blur", () => {
    const { container } = renderCard();
    const card = screen.getByRole("button", { name: "dolly" });
    act(() => card.focus());
    expect(container.querySelector("video")).not.toBeNull();
    act(() => card.blur());
    expect(container.querySelector("video")).toBeNull();
  });

  it("stays paused under prefers-reduced-motion", () => {
    mockReducedMotion(true);
    const { container } = renderCard();
    const card = screen.getByRole("button", { name: "dolly" });
    fireEvent.mouseEnter(card);
    act(() => card.focus());
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toHaveAttribute("src", PREVIEW.poster);
  });

  it("shows the description in a text-only state without a preview", () => {
    const { container } = renderCard({ preset: makePreset("camera.plain") });
    expect(screen.getByTestId("preset-card-text-only")).toHaveTextContent(
      "camera.plain description"
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "plain" }));
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders the cost hint it is given", () => {
    renderCard({ costHint: "≈ $0.40" });
    expect(screen.getByText("≈ $0.40")).toBeInTheDocument();
  });

  it("ignores clicks while disabled but stays focusable", () => {
    const onClick = jest.fn();
    renderCard({ disabled: true, disabledReason: "Not now", onClick });
    const card = screen.getByRole("button", { name: "dolly" });
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card).not.toBeDisabled();
    fireEvent.click(card);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("reports the preset when clicked and marks selection", () => {
    const onClick = jest.fn();
    renderCard({ selected: true, onClick });
    const card = screen.getByRole("button", { name: "dolly" });
    expect(card).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({ id: "camera.dolly" }));
  });

  it("forwards its ref to the button", () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(
      <ThemeProvider theme={mockTheme}>
        <PresetCard ref={ref} preset={makePreset("camera.dolly")} />
      </ThemeProvider>
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});

describe("presetFamilies", () => {
  it("reads families from the prompt keys unless the preset lists them", () => {
    expect(
      presetFamilies(makePreset("camera.a", { prompt: { default: "x", veo: "y", kling: "z" } }))
    ).toEqual(["kling", "veo"]);
    expect(
      presetFamilies(makePreset("camera.b", { families: ["wan"], prompt: { default: "x", veo: "y" } }))
    ).toEqual(["wan"]);
  });
});
