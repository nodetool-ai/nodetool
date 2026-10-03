import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import TimelineRoute from "../TimelineRoute";

jest.mock("../../workspace/TimelineSurface", () => ({
  __esModule: true,
  default: ({ mode }: { mode: string }) => <div>Timeline {mode}</div>
}));

function Location() {
  return <span>{useLocation().search}</span>;
}

function renderRoute(path = "/timeline/timeline-1?clip=clip-1") {
  return render(
    <ThemeProvider theme={mockTheme}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/timeline/:sequenceId"
            element={
              <>
                <TimelineRoute />
                <Location />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>
  );
}

it("views a timeline link by default and preserves its clip selection when switching to edit", async () => {
  renderRoute();
  expect(screen.getByText("Timeline view")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  expect(screen.getByText("Timeline edit")).toBeInTheDocument();
  expect(screen.getByText("?clip=clip-1&mode=edit")).toBeInTheDocument();
});

it("honors an explicit edit link", () => {
  renderRoute("/timeline/timeline-1?mode=edit");
  expect(screen.getByText("Timeline edit")).toBeInTheDocument();
});
