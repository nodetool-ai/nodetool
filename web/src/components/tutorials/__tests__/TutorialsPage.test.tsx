import React from "react";
import { stub } from "../../../test-utils/doubles";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import { MemoryRouter } from "react-router-dom";
import mockTheme from "../../../__mocks__/themeMock";
import TutorialsPage from "../TutorialsPage";
import { TUTORIALS } from "../tutorialsData";

const MAX_WIDTH_QUERY = /max-width/;

/** Drive MUI's useMediaQuery: only max-width queries match on "narrow". */
const setViewport = (narrow: boolean) => {
  window.matchMedia = jest.fn((query: string) => stub<MediaQueryList>({
    matches: narrow && MAX_WIDTH_QUERY.test(query),
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
  }));
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <ThemeProvider theme={mockTheme}>
        <TutorialsPage />
      </ThemeProvider>
    </MemoryRouter>
  );

describe("TutorialsPage responsive layout", () => {
  const originalMatchMedia = window.matchMedia;
  const second = TUTORIALS[1];

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    jest.restoreAllMocks();
  });

  it("stacks the list under the player and scrolls back up on select", async () => {
    setViewport(true);
    const scrollTo = jest.fn();
    Element.prototype.scrollTo = scrollTo;

    const { container } = renderPage();

    const body = container.querySelector(".tut-body");
    const main = container.querySelector(".tut-main");
    const sidebar = container.querySelector(".tut-sidebar");
    expect(body).toContainElement(main as HTMLElement);
    expect(body).toContainElement(sidebar as HTMLElement);

    await userEvent.click(
      screen.getByRole("button", { name: `Play tutorial: ${second.title}` })
    );

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(
      screen.getByRole("button", { name: `Play tutorial: ${second.title}` })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the two-column layout put on a wide viewport", async () => {
    setViewport(false);
    const scrollTo = jest.fn();
    Element.prototype.scrollTo = scrollTo;

    renderPage();

    await userEvent.click(
      screen.getByRole("button", { name: `Play tutorial: ${second.title}` })
    );

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
