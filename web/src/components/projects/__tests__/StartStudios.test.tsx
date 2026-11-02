import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";

import StartStudios from "../StartStudios";
import { STUDIOS } from "../../../lib/presets/catalog";

const mockOpenStudio = jest.fn();
jest.mock("../openStudio", () => ({
  openStudio: (...args: unknown[]) => mockOpenStudio(...args)
}));

const renderStudios = (hosts = { onSkill: jest.fn(), onFlow: jest.fn() }) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StartStudios {...hosts} />
    </ThemeProvider>
  );

beforeEach(() => mockOpenStudio.mockClear());

describe("StartStudios", () => {
  it("shows one tile per catalogue studio under a Studios heading", () => {
    renderStudios();
    const section = screen.getByRole("region", { name: "Studios" });
    expect(within(section).getByRole("heading", { name: "Studios" })).toBeInTheDocument();
    for (const studio of STUDIOS) {
      expect(within(section).getByText(studio.name)).toBeInTheDocument();
      expect(within(section).getByText(studio.description)).toBeInTheDocument();
    }
    expect(within(section).getAllByRole("button")).toHaveLength(STUDIOS.length);
  });

  it("opens the clicked studio with the start page's hosts", async () => {
    const hosts = { onSkill: jest.fn(), onFlow: jest.fn() };
    renderStudios(hosts);
    const studio = STUDIOS.find((entry) => entry.target.type === "lipsync");
    if (!studio) {
      throw new Error("No lipsync studio ships");
    }
    await userEvent.click(screen.getByText(studio.name));
    expect(mockOpenStudio).toHaveBeenCalledWith(studio, studio.name, hosts);
  });

  it("renders nothing when the catalogue ships no studios", () => {
    const { container } = render(
      <ThemeProvider theme={mockTheme}>
        <StartStudios studios={[]} onSkill={jest.fn()} onFlow={jest.fn()} />
      </ThemeProvider>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
