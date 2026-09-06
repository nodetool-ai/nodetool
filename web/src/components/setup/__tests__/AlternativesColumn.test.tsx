import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";

const blank = jest.fn();
const upload = jest.fn();

const alternatives: AlternativeEntry[] = [
  {
    id: "blank",
    title: "Start with blank storyboard",
    description: "Skip the setup and open an empty board.",
    onSelect: blank
  },
  {
    id: "upload",
    title: "Upload your file",
    description: "PDF, DOCX or FDX.",
    onSelect: upload,
    disabled: true,
    disabledReason: "Imports arrive in P5"
  }
];

const renderColumn = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <AlternativesColumn
        label="Other ways to start"
        alternatives={alternatives}
      />
    </ThemeProvider>
  );

describe("AlternativesColumn", () => {
  beforeEach(() => {
    blank.mockClear();
    upload.mockClear();
  });

  it("runs an enabled alternative", async () => {
    const user = userEvent.setup();
    renderColumn();

    await user.click(
      screen.getByRole("button", { name: /Start with blank storyboard/ })
    );

    expect(blank).toHaveBeenCalledTimes(1);
  });

  it("shows a disabled alternative's reason and does not fire", async () => {
    const user = userEvent.setup();
    renderColumn();

    const card = screen.getByRole("button", { name: /Upload your file/ });
    expect(card).toHaveAttribute("aria-disabled", "true");
    expect(card).toHaveAttribute("title", "Imports arrive in P5");

    await user.hover(card);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "Imports arrive in P5"
    );

    await user.click(card);
    expect(upload).not.toHaveBeenCalled();
  });

  it("lists the alternatives under an accessible name", () => {
    renderColumn();

    expect(
      screen.getByRole("list", { name: "Other ways to start" })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(alternatives.length);
  });

  // Each card opens or starts something. None is a choice among the others, so
  // neither the column nor a card carries selection state — and a card left on
  // the default toggle role would start announcing one the moment anything
  // passed `selected`.
  it("routes rather than selects", () => {
    renderColumn();

    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    for (const card of screen.getAllByRole("button")) {
      expect(card).not.toHaveAttribute("aria-pressed");
      expect(card).not.toHaveAttribute("aria-checked");
    }
  });
});
