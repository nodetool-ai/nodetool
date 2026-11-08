/**
 * The `[+]` menu creates documents. Open-existing entries live in the
 * left panel, not here.
 */
import { screen } from "@testing-library/react";

import { renderOpenMenu } from "../openMenuTestHarness";

const OPEN_ITEMS = ["Open workflow…", "Open asset…", "Open chat…"];

describe("OpenMenu", () => {
  it("offers creators and no open-existing entries", () => {
    renderOpenMenu();

    expect(screen.getByText("New workflow")).toBeInTheDocument();
    expect(screen.getByText("New chat")).toBeInTheDocument();
    expect(screen.getByText("New skill")).toBeInTheDocument();
    for (const label of OPEN_ITEMS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});
