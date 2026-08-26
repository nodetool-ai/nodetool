import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../__mocks__/themeMock";
import { ConflictBanner, type ConflictBannerConflict } from "../ConflictBanner";

const renderBanner = (props: {
  conflicts: ConflictBannerConflict[];
  onAccept: jest.Mock;
  onDiscard: jest.Mock;
}) =>
  render(
    <ThemeProvider theme={mockTheme}>
      <ConflictBanner {...props} />
    </ThemeProvider>
  );

const conflicts: ConflictBannerConflict[] = [
  { unitId: "shot-1", label: "Shot 1 — changed outside" },
  {
    unitId: "field:code",
    label: "code — changed outside",
    detail: "await output(\"n\", 1);"
  }
];

describe("ConflictBanner", () => {
  it("renders the summary and one row per conflict", () => {
    renderBanner({
      conflicts,
      onAccept: jest.fn(),
      onDiscard: jest.fn()
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/2 changes made outside the editor/)).toBeInTheDocument();
    expect(screen.getByText("Shot 1 — changed outside")).toBeInTheDocument();
    // Two rows × (Accept + Discard).
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Discard" })).toHaveLength(2);
  });

  it("uses singular wording for one conflict", () => {
    renderBanner({
      conflicts: [conflicts[0]],
      onAccept: jest.fn(),
      onDiscard: jest.fn()
    });
    expect(
      screen.getByText(/1 change made outside the editor conflicts/)
    ).toBeInTheDocument();
  });

  it("reports accept and discard with the conflict's unitId", async () => {
    const onAccept = jest.fn();
    const onDiscard = jest.fn();
    const user = userEvent.setup();
    renderBanner({ conflicts, onAccept, onDiscard });
    await user.click(screen.getAllByRole("button", { name: "Accept" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Discard" })[1]);
    expect(onAccept).toHaveBeenCalledWith("shot-1");
    expect(onDiscard).toHaveBeenCalledWith("field:code");
  });

  it("shows a two-pane diff when both draft and external bodies are present", async () => {
    const user = userEvent.setup();
    renderBanner({
      conflicts: [
        {
          unitId: "field:code",
          label: "code — changed outside",
          detail: "await output(\"n\", 2);",
          draftDetail: "await output(\"n\", 1);"
        }
      ],
      onAccept: jest.fn(),
      onDiscard: jest.fn()
    });
    expect(screen.queryByText(/output\("n", 1\)/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View diff" }));
    expect(screen.getByText("Your edit")).toBeInTheDocument();
    expect(screen.getByText("External")).toBeInTheDocument();
    expect(screen.getByText(/output\("n", 1\)/)).toBeInTheDocument();
    expect(screen.getByText(/output\("n", 2\)/)).toBeInTheDocument();
  });

  it("hides the external value until toggled, then shows it", async () => {
    const user = userEvent.setup();
    renderBanner({ conflicts, onAccept: jest.fn(), onDiscard: jest.fn() });
    expect(screen.queryByText(/await output/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View external value" }));
    expect(screen.getByText(/await output/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hide external value" }));
    expect(screen.queryByText(/await output/)).not.toBeInTheDocument();
  });

  it("offers no viewer for conflicts without a detail", () => {
    renderBanner({
      conflicts: [conflicts[0]],
      onAccept: jest.fn(),
      onDiscard: jest.fn()
    });
    expect(
      screen.queryByRole("button", { name: "View external value" })
    ).not.toBeInTheDocument();
  });

  it("forwards its ref to the alert root", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <ThemeProvider theme={mockTheme}>
        <ConflictBanner
          ref={ref}
          conflicts={[conflicts[0]]}
          onAccept={jest.fn()}
          onDiscard={jest.fn()}
        />
      </ThemeProvider>
    );
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current).toHaveAttribute("role", "alert");
  });
});
