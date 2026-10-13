import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import ProjectDocumentCard from "../ProjectDocumentCard";
import type { ProjectDocument } from "../projectStatus";

const name = "A very long project document title that cannot fit in a compact tile";
const document: ProjectDocument = {
  type: "storyboard",
  ref: "board-1",
  name,
  updatedAt: "",
  status: null,
  thumbnails: [],
  preview: null,
  spendUsd: 0,
  unpricedCount: 0
};

it("keeps the full title accessible while truncating its compact label", () => {
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectDocumentCard
        document={document}
        sourceProjectId="p1"
        onOpen={jest.fn()}
        compact
      />
    </ThemeProvider>
  );

  expect(screen.getByRole("button", { name })).toBeInTheDocument();
  const label = screen.getByTitle(name);
  expect(label).toHaveStyle({
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  });
});

it("says when the document was last edited", () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  render(
    <ThemeProvider theme={mockTheme}>
      <ProjectDocumentCard
        document={{ ...document, updatedAt: twoHoursAgo }}
        sourceProjectId="p1"
        onOpen={jest.fn()}
        compact
      />
    </ThemeProvider>
  );

  expect(screen.getByText(/Edited 2 hours ago/)).toBeInTheDocument();
});
