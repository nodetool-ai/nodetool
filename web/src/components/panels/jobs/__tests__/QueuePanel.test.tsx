import { asMock } from "../../../../test-utils/doubles";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import QueuePanel from "../QueuePanel";
import { Job } from "../../../../stores/ApiTypes";
import { useRunningJobs } from "../../../../hooks/useRunningJobs";

jest.mock("../../../../hooks/useRunningJobs", () => ({
  useRunningJobs: jest.fn()
}));

// Render each job as a simple row so we test QueuePanel's bucketing and
// filtering, not JobItem internals.
jest.mock("../JobItem", () => ({
  __esModule: true,
  default: ({ job }: { job: Job }) => (
    <div data-testid="job-row" data-status={job.status}>
      {job.id}
    </div>
  )
}));

const mockUseRunningJobs = asMock(useRunningJobs);

const job = (
  id: string,
  status: string,
  extra: Partial<Job> = {}
): Job =>
  ({
    id,
    user_id: "u",
    job_type: "workflow",
    workflow_id: "wf",
    status,
    started_at: null,
    ...extra
  }) as Job;

const renderPanel = () =>
  render(
    <ThemeProvider theme={mockTheme}>
      <QueuePanel />
    </ThemeProvider>
  );

const setJobs = (jobs: Job[]) =>
  mockUseRunningJobs.mockReturnValue({
    data: jobs,
    isLoading: false,
    error: null
  });

const section = (name: string) =>
  within(screen.getByRole("region", { name }));

const rowIds = (name: string) =>
  section(name)
    .queryAllByTestId("job-row")
    .map((row) => row.textContent);

describe("QueuePanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a loading spinner while jobs load", () => {
    mockUseRunningJobs.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null
    });
    renderPanel();
    expect(screen.queryAllByTestId("job-row")).toHaveLength(0);
  });

  it("puts running and queued jobs in Active, running first", () => {
    setJobs([
      job("q", "queued"),
      job("s", "scheduled"),
      job("st", "starting"),
      job("r", "running"),
      job("c", "completed")
    ]);
    renderPanel();

    expect(rowIds("Active")).toEqual(["r", "q", "s", "st"]);
    expect(section("Active").getByText("1 running · 3 queued")).toBeInTheDocument();
    expect(rowIds("History")).toEqual(["c"]);
  });

  it("says nothing is active when no job is running or queued", () => {
    setJobs([job("c", "completed")]);
    renderPanel();
    expect(
      section("Active").getByText(/Nothing running or queued/)
    ).toBeInTheDocument();
  });

  it("lists finished jobs newest first, grouped by day", () => {
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    setJobs([
      job("old", "completed", { finished_at: iso(3 * 86400000) }),
      job("new", "completed", { finished_at: iso(1000) }),
      job("mid", "failed", { finished_at: iso(60000) })
    ]);
    renderPanel();

    expect(rowIds("History")).toEqual(["new", "mid", "old"]);
    expect(screen.getByRole("list", { name: "Today" })).toBeInTheDocument();
  });

  it("filters history by failed, completed and cancelled", async () => {
    const user = userEvent.setup();
    setJobs([
      job("ok", "completed"),
      job("bad", "failed"),
      job("late", "timed_out"),
      job("err", "completed", { error: "boom" }),
      job("stop", "cancelled")
    ]);
    renderPanel();

    const history = section("History");
    expect(history.getByRole("button", { name: "All 5" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(history.getByRole("button", { name: "Failed 3" }));
    expect(rowIds("History").sort()).toEqual(["bad", "err", "late"]);

    await user.click(history.getByRole("button", { name: "Completed 1" }));
    expect(rowIds("History")).toEqual(["ok"]);

    await user.click(history.getByRole("button", { name: "Cancelled 1" }));
    expect(rowIds("History")).toEqual(["stop"]);
  });

  it("hides filters with no jobs", () => {
    setJobs([job("ok", "completed")]);
    renderPanel();
    const history = section("History");
    expect(history.getByRole("button", { name: "All 1" })).toBeInTheDocument();
    expect(history.queryByRole("button", { name: /Failed/ })).toBeNull();
    expect(history.queryByRole("button", { name: /Cancelled/ })).toBeNull();
  });

  it("shows an empty state when nothing has finished", () => {
    setJobs([job("r", "running")]);
    renderPanel();
    expect(section("History").getByText("No finished runs yet")).toBeInTheDocument();
  });
});
