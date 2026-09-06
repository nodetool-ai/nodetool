/**
 * Resume by stage on the Studio timeline page (PRD § 6.4, D3). Studio's Video
 * card creates a sequence at stage `idea` and navigates here, so the page owes
 * the creator the flow — not the editor over an empty timeline.
 */
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../__mocks__/themeMock";

jest.mock("react-router-dom", () => ({
  __esModule: true,
  useParams: () => ({ sequenceId: "seq-1" })
}));

jest.mock("../StudioShell", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
jest.mock("../../components/timeline/TimelineEditor", () => ({
  __esModule: true,
  default: () => <div data-testid="timeline-editor" />
}));
jest.mock("../../components/setup/video/VideoSetupHost", () => ({
  __esModule: true,
  default: ({ sequenceId }: { sequenceId: string }) => (
    <div data-testid="setup-flow">{sequenceId}</div>
  )
}));

let sequence: {
  isPending: boolean;
  isSuccess: boolean;
  data?: { setup?: { stage: string } };
};
const invalidate = jest.fn();
jest.mock("../../trpc/client", () => ({
  __esModule: true,
  trpc: {
    useUtils: () => ({ timeline: { get: { invalidate } } }),
    timeline: { get: { useQuery: () => sequence } }
  }
}));

import StudioTimelinePage from "../StudioTimelinePage";

const renderPage = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <StudioTimelinePage />
    </ThemeProvider>
  );

describe("StudioTimelinePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the flow while the sequence carries a setup stage", async () => {
    sequence = {
      isPending: false,
      isSuccess: true,
      data: { setup: { stage: "idea" } }
    };
    renderPage();

    expect(await screen.findByTestId("setup-flow")).toHaveTextContent("seq-1");
    expect(screen.queryByTestId("timeline-editor")).not.toBeInTheDocument();
  });

  it("opens the editor for a sequence whose setup is done", async () => {
    sequence = {
      isPending: false,
      isSuccess: true,
      data: { setup: { stage: "done" } }
    };
    renderPage();

    expect(await screen.findByTestId("timeline-editor")).toBeInTheDocument();
  });

  // A sequence made before the flow existed carries no `setup` at all, and it
  // opens as the editor — absence is the signal, not a stage.
  it("opens the editor for a sequence with no setup", async () => {
    sequence = { isPending: false, isSuccess: true, data: {} };
    renderPage();

    expect(await screen.findByTestId("timeline-editor")).toBeInTheDocument();
  });

  it("shows neither surface until the sequence has landed", () => {
    sequence = { isPending: true, isSuccess: false };
    renderPage();

    expect(screen.queryByTestId("setup-flow")).not.toBeInTheDocument();
    expect(screen.queryByTestId("timeline-editor")).not.toBeInTheDocument();
  });
});
