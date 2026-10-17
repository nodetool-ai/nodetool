/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import MemoryCard, { type Memory } from "../MemoryCard";

const memory = {
  id: "mem-1",
  thread_id: "thread-1",
  kind: "note",
  title: "Brand palette",
  content: "The client signed off on the teal grade.",
  resources: [],
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z"
} as unknown as Memory;

/** Every rule Emotion inserted, as text (it writes through the CSSOM). */
const allCssText = (): string =>
  Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .map((rule) => rule.cssText)
    .join("\n");

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("MemoryCard actions", () => {
  const renderCard = () =>
    render(
      <ThemeProvider theme={mockTheme}>
        <MemoryCard
          memory={memory}
          onDelete={jest.fn()}
          deleteDisabled={false}
          onOpenThread={jest.fn()}
        />
      </ThemeProvider>
    );

  it("starts hidden and reveals on keyboard focus and on touch", () => {
    renderCard();
    const group = screen
      .getByRole("button", { name: "Delete memory" })
      .closest(".memory-actions");
    expect(group).not.toBeNull();
    expect(group).toHaveStyle({ opacity: "0" });

    const emotionClass = Array.from((group as HTMLElement).classList).find(
      (name) => name.startsWith("css-")
    );
    expect(emotionClass).toBeDefined();
    const css = allCssText();
    const cls = escapeRegExp(`.${emotionClass}`);
    // Tabbing onto Open or Delete must show the actions, not leave a focused
    // control invisible.
    expect(css).toMatch(new RegExp(`${cls}:focus-within\\s*\\{[^}]*opacity: 1`));
    // A touch screen never hovers, so the actions show outright there.
    expect(css).toMatch(
      new RegExp(`@media \\(hover: none\\)\\s*\\{\\s*${cls}\\s*\\{[^}]*opacity: 1`)
    );
  });
});
