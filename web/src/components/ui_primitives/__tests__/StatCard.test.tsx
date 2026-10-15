import React from "react";
import { render, screen } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { StatCard } from "../StatCard";
import { Card, CardActions, CardBody, CardHeader } from "../Card";

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>);

describe("StatCard", () => {
  it("renders label, value, decimal, delta and hint", () => {
    wrap(
      <StatCard
        label="Total spend"
        value="$12"
        decimal=".34"
        delta={<span>+5%</span>}
        hint="vs prior 7d"
      />
    );
    expect(screen.getByText("Total spend")).toBeInTheDocument();
    expect(screen.getByText(/\$12/)).toBeInTheDocument();
    expect(screen.getByText(".34")).toBeInTheDocument();
    expect(screen.getByText("+5%")).toBeInTheDocument();
    expect(screen.getByText("vs prior 7d")).toBeInTheDocument();
  });

  it("renders the plain layout with label and value only", () => {
    wrap(<StatCard layout="plain" label="Files" value={3} />);
    expect(screen.getByText("Files")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});

describe("Card inline variant", () => {
  it("renders header, body and actions", () => {
    wrap(
      <Card variant="inline" tone="info" role="group" aria-label="Question">
        <CardHeader title="Title" subtitle="Sub" trailing={<i>key</i>} />
        <CardBody>Body text</CardBody>
        <CardActions>
          <button>Go</button>
        </CardActions>
      </Card>
    );
    expect(screen.getByRole("group", { name: "Question" })).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Sub")).toBeInTheDocument();
    expect(screen.getByText("key")).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});
