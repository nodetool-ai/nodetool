/**
 * PerformanceProfiler Component Tests
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { PerformanceProfiler } from "../PerformanceProfiler";
import usePerformanceProfilerStore from "../../../stores/PerformanceProfilerStore";
import useExecutionTimeStore from "../../../stores/ExecutionTimeStore";

const renderWithTheme = (component: React.ReactElement) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe("PerformanceProfiler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useExecutionTimeStore.setState({ timings: {} });
    usePerformanceProfilerStore.setState({
      profiles: {},
      currentProfile: null,
      isProfiling: false
    });
  });

  it("should render without crashing", () => {
    renderWithTheme(
      <PerformanceProfiler workflowId="workflow-1" />
    );

    expect(screen.getByText("Performance Profiler")).toBeInTheDocument();
  });

  it("should show start profiling button when not profiling", () => {
    renderWithTheme(
      <PerformanceProfiler workflowId="workflow-1" />
    );

    const playButton = screen.getByLabelText("Start Profiling");
    expect(playButton).toBeInTheDocument();
  });

  it("should toggle profiling state when buttons are clicked", () => {
    renderWithTheme(
      <PerformanceProfiler workflowId="workflow-1" />
    );

    const playButton = screen.getByLabelText("Start Profiling");
    fireEvent.click(playButton);

    const stopButton = screen.getByLabelText("Stop Profiling");
    expect(stopButton).toBeInTheDocument();
  });

  it("should render summary accordion", () => {
    renderWithTheme(
      <PerformanceProfiler workflowId="workflow-1" />
    );

    expect(screen.getByText("Execution Summary")).toBeInTheDocument();
  });

  it("should render timeline accordion", () => {
    renderWithTheme(
      <PerformanceProfiler workflowId="workflow-1" />
    );

    expect(screen.getByText("Execution Timeline")).toBeInTheDocument();
  });

  it("should render bottlenecks accordion", () => {
    renderWithTheme(
      <PerformanceProfiler workflowId="workflow-1" />
    );

    expect(screen.getByText("Bottlenecks & Suggestions")).toBeInTheDocument();
  });

  it("should render node rankings accordion", () => {
    renderWithTheme(
      <PerformanceProfiler workflowId="workflow-1" />
    );

    expect(screen.getByText("Node Rankings")).toBeInTheDocument();
  });

  it("should call onStartProfiling when profiling starts", () => {
    const onStartProfiling = jest.fn();
    renderWithTheme(
      <PerformanceProfiler
        workflowId="workflow-1"
        onStartProfiling={onStartProfiling}
      />
    );

    const playButton = screen.getByLabelText("Start Profiling");
    fireEvent.click(playButton);

    expect(onStartProfiling).toHaveBeenCalledTimes(1);
  });

  it("should call onEndProfiling when profiling ends", () => {
    const onEndProfiling = jest.fn();
    renderWithTheme(
      <PerformanceProfiler
        workflowId="workflow-1"
        onEndProfiling={onEndProfiling}
      />
    );

    const playButton = screen.getByLabelText("Start Profiling");
    fireEvent.click(playButton);

    const stopButton = screen.getByLabelText("Stop Profiling");
    fireEvent.click(stopButton);

    expect(onEndProfiling).toHaveBeenCalledTimes(1);
  });

  it("should expand accordions when clicked", () => {
    renderWithTheme(
      <PerformanceProfiler workflowId="workflow-1" />
    );

    const summaryHeader = screen.getByText("Execution Summary");
    fireEvent.click(summaryHeader);

    expect(screen.getByText("Total Duration")).toBeInTheDocument();
  });
});
