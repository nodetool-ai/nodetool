import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import FindInWorkflowDialog from "../FindInWorkflowDialog";

jest.mock("../../../hooks/useFindInWorkflow", () => ({
  useFindInWorkflow: () => ({
    isOpen: true,
    searchTerm: "",
    results: [],
    selectedIndex: 0,
    closeFind: jest.fn(),
    performSearch: jest.fn(),
    goToSelected: jest.fn(),
    navigateNext: jest.fn(),
    navigatePrevious: jest.fn(),
    clearSearch: jest.fn(),
    activateResult: jest.fn(),
    getNodeDisplayName: () => ""
  })
}));

describe("FindInWorkflowDialog", () => {
  it("shows translated labels, not raw translation keys", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <FindInWorkflowDialog workflowId="wf" />
      </ThemeProvider>
    );
    expect(screen.getByRole("textbox", { name: "Find nodes" })).toBeInTheDocument();
    expect(screen.getByText("Type to search nodes")).toBeInTheDocument();
    expect(screen.queryByText(/findInWorkflow\./)).not.toBeInTheDocument();
  });
});
