import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";
import PlanDocument from "../PlanDocument";
import type { PlanDocumentModel } from "../parsePlanDocument";

const plan: PlanDocumentModel = {
  title: "Add caching",
  executed: false,
  parallelizable: 1,
  tasks: [
    {
      id: "inspect",
      title: "Inspect the cache layer",
      dependsOn: [],
      steps: [{ id: "s1", instructions: "Read the current cache config" }]
    },
    {
      id: "add",
      title: "Add Redis",
      dependsOn: ["inspect"],
      steps: [{ id: "s2", instructions: "Wire the client" }]
    }
  ]
};

const renderPlan = (model: PlanDocumentModel = plan) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <PlanDocument plan={model} />
    </ThemeProvider>
  );

describe("PlanDocument", () => {
  it("renders the title, counts, steps, and dependency titles", () => {
    renderPlan();
    expect(screen.getByRole("article", { name: "Add caching" })).toBeInTheDocument();
    expect(screen.getByText("Add caching")).toBeInTheDocument();
    expect(screen.getByText("2 tasks · 2 steps")).toBeInTheDocument();
    expect(screen.getByText("Inspect the cache layer")).toBeInTheDocument();
    expect(screen.getByText("Read the current cache config")).toBeInTheDocument();
    expect(screen.getByText("after Inspect the cache layer")).toBeInTheDocument();
  });

  it("notes that nothing ran and names independent tasks", () => {
    renderPlan({
      ...plan,
      parallelizable: 2,
      executed: false
    });
    expect(screen.getByText(/2 can run together/)).toBeInTheDocument();
    expect(
      screen.getByText("Nothing ran. Switch to Default or Auto to execute.")
    ).toBeInTheDocument();
  });

  it("hides the idle note when the plan is not a dry run", () => {
    renderPlan({ ...plan, executed: null });
    expect(
      screen.queryByText("Nothing ran. Switch to Default or Auto to execute.")
    ).not.toBeInTheDocument();
  });
});
