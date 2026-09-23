import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";

import mockTheme from "../../../__mocks__/themeMock";
import FirstWorkflowGuide from "../FirstWorkflowGuide";

const renderGuide = (
  overrides: Partial<React.ComponentProps<typeof FirstWorkflowGuide>> = {}
) => {
  const props: React.ComponentProps<typeof FirstWorkflowGuide> = {
    hasSavedWorkflows: false,
    started: false,
    readiness: {
      input: false,
      output: false,
      connection: false,
      saved: false,
      run: false
    },
    onStart: jest.fn(),
    onChooseOwn: jest.fn(),
    onClose: jest.fn(),
    ...overrides
  };
  render(
    <ThemeProvider theme={mockTheme}>
      <FirstWorkflowGuide {...props} />
    </ThemeProvider>
  );
  return props;
};

describe("FirstWorkflowGuide", () => {
  it("appears only when the saved workflow list is empty", () => {
    renderGuide({ hasSavedWorkflows: true });
    expect(
      screen.queryByText("Build your first useful workflow")
    ).not.toBeInTheDocument();
  });

  it("waits for the saved workflow count before appearing", () => {
    renderGuide({ hasSavedWorkflows: undefined });
    expect(
      screen.queryByText("Build your first useful workflow")
    ).not.toBeInTheDocument();
  });

  it("offers an outcome-based starter and a manual path", async () => {
    const user = userEvent.setup();
    const props = renderGuide();

    expect(
      screen.getByText(/starter needs no model or provider setup/i)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Add the two-node starter" })
    );
    await user.click(
      screen.getByRole("button", { name: "Choose my own nodes" })
    );

    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(props.onChooseOwn).toHaveBeenCalledTimes(1);
  });

  it("shows task readiness through the first completed run", () => {
    renderGuide({
      started: true,
      readiness: {
        input: true,
        output: true,
        connection: true,
        saved: true,
        run: false
      }
    });

    expect(screen.getByText("Input added")).toBeInTheDocument();
    expect(screen.getByText("Input connected to output")).toBeInTheDocument();
    expect(screen.getByText("Workflow saved")).toBeInTheDocument();
    expect(screen.getByText("Workflow run completed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close guide" })
    ).toBeInTheDocument();
  });
});
