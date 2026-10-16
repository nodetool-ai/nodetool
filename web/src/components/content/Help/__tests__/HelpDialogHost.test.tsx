import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import HelpDialogHost from "../HelpDialogHost";
import { useAppHeaderStore } from "../../../../stores/AppHeaderStore";
import { ThemeProvider } from "@mui/material/styles";
import mockTheme from "../../../../__mocks__/themeMock";

jest.mock("../Help", () => ({
  __esModule: true,
  default: ({ handleClose }: { handleClose: () => void }) => (
    <div role="dialog" aria-label="Help">
      <button onClick={handleClose}>Close help</button>
    </div>
  )
}));

function Navigation() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open navigation</button>
      {open && (
        <button
          onClick={() => {
            useAppHeaderStore.getState().handleOpenHelp();
            setOpen(false);
          }}
        >
          Help menu item
        </button>
      )}
      <HelpDialogHost />
    </>
  );
}

// First in the file: the lazy Help module suspends only until it has loaded once.
it("opens a loading Help dialog at once while the Help module loads", async () => {
  useAppHeaderStore.setState({ helpOpen: false });
  render(
    <ThemeProvider theme={mockTheme}>
      <Navigation />
    </ThemeProvider>
  );
  fireEvent.click(screen.getByText("Help menu item"));

  expect(screen.getByRole("dialog")).toHaveTextContent("Help");
  expect(
    screen.getByRole("status", { name: "Loading help" })
  ).toBeInTheDocument();
  expect(await screen.findByText("Close help")).toBeInTheDocument();
  expect(
    screen.queryByRole("status", { name: "Loading help" })
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Close help"));
});

it("keeps a single usable Help dialog after its navigation owner unmounts", async () => {
  useAppHeaderStore.setState({ helpOpen: false });
  render(<Navigation />);
  fireEvent.click(screen.getByText("Help menu item"));
  expect(
    await screen.findByRole("dialog", { name: "Help" })
  ).toBeInTheDocument();
  expect(screen.queryByText("Help menu item")).not.toBeInTheDocument();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  fireEvent.click(screen.getByText("Close help"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Open navigation"));
  fireEvent.click(screen.getByText("Help menu item"));
  expect(
    await screen.findByRole("dialog", { name: "Help" })
  ).toBeInTheDocument();
});
