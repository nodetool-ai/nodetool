import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import { DocumentListPanel } from "../DocumentListPanel";

describe("DocumentListPanel", () => {
  it("renders the supplied error action in the error state", () => {
    render(
      <ThemeProvider theme={mockTheme}>
        <DocumentListPanel
          singular="skill"
          plural="skills"
          documents={undefined}
          isLoading={false}
          isError
          errorMessage="Request failed"
          errorAction={<button type="button">Report this error</button>}
          emptyDescription="Create a skill."
          deleteTarget={null}
          onCancelDelete={jest.fn()}
          onConfirmDelete={jest.fn()}
          renderItem={() => null}
        />
      </ThemeProvider>
    );

    expect(
      screen.getByRole("button", { name: "Report this error" })
    ).toBeInTheDocument();
  });
});
